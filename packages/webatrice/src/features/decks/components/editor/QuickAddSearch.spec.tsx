import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { useQuickAddSuggestions, type QuickAddSuggestions } from '../../hooks/useQuickAddSuggestions';
import { QuickAddSearch } from './QuickAddSearch';

vi.mock('../../hooks/useQuickAddSuggestions', () => ({ useQuickAddSuggestions: vi.fn() }));

function suggestions(overrides: Partial<QuickAddSuggestions> = {}): QuickAddSuggestions {
  return {
    suggestions: [
      { name: 'Sol Ring', source: 'scryfall' },
      { name: 'Sol Talisman', source: 'scryfall' },
    ],
    loading: false,
    highlight: 0,
    setHighlight: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}

function Harness({ onAdd, initial = '' }: { onAdd: (name: string) => void; initial?: string }) {
  const [query, setQuery] = useState(initial);
  return <QuickAddSearch query={query} onQueryChange={setQuery} onAdd={onAdd} />;
}

describe('QuickAddSearch', () => {
  it('shows suggestions for two or more characters and adds a clicked one', () => {
    const state = suggestions();
    vi.mocked(useQuickAddSuggestions).mockReturnValue(state);
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    const input = screen.getByRole('combobox', { name: 'DeckEditor.quickAdd.label' });

    fireEvent.change(input, { target: { value: 's' } });
    expect(screen.queryByRole('option', { name: 'Sol Ring' })).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(input, { target: { value: 'sol' } });
    fireEvent.click(screen.getByRole('option', { name: 'Sol Talisman' }));

    expect(onAdd).toHaveBeenCalledWith('Sol Talisman');
    expect(state.clear).toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  it('adds the highlighted suggestion on Enter, else the typed name', () => {
    vi.mocked(useQuickAddSuggestions).mockReturnValue(suggestions({ highlight: 1 }));
    const onAdd = vi.fn();
    const { unmount } = render(<Harness onAdd={onAdd} initial="sol" />);
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onAdd).toHaveBeenLastCalledWith('Sol Talisman');
    unmount();

    vi.mocked(useQuickAddSuggestions).mockReturnValue(suggestions({ suggestions: [], highlight: -1 }));
    render(<Harness onAdd={onAdd} initial=" Unknown Card " />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onAdd).toHaveBeenLastCalledWith('Unknown Card');
  });

  it('moves the highlight with the arrow keys, wrapping around', () => {
    const state = suggestions();
    vi.mocked(useQuickAddSuggestions).mockReturnValue(state);
    render(<Harness onAdd={vi.fn()} initial="sol" />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowUp' });

    const [down, up] = vi.mocked(state.setHighlight).mock.calls.map(([update]) => update as (h: number) => number);
    expect(down(1)).toBe(0);
    expect(up(0)).toBe(1);
  });

  it('shows searching and empty states, and clears on Escape', () => {
    vi.mocked(useQuickAddSuggestions).mockReturnValue(suggestions({ loading: true }));
    const { rerender } = render(<Harness onAdd={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByRole('status')).toHaveTextContent('DeckEditor.quickAdd.searching');

    vi.mocked(useQuickAddSuggestions).mockReturnValue(suggestions({ suggestions: [] }));
    rerender(<Harness onAdd={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('DeckEditor.quickAdd.noMatches');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('DeckEditor.quickAdd.noMatches')).toBeNull();
    expect(input).toHaveValue('zzz');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
  });

  it('closes a searching popup on the first Escape instead of clearing the field', () => {
    vi.mocked(useQuickAddSuggestions).mockReturnValue(suggestions({ loading: true }));
    render(<Harness onAdd={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'sol' } });
    expect(screen.getByRole('status')).toHaveTextContent('DeckEditor.quickAdd.searching');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('DeckEditor.quickAdd.searching')).toBeNull();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(input).toHaveValue('sol');
  });

  it('is a combobox that points at the highlighted option and announces the count', () => {
    vi.mocked(useQuickAddSuggestions).mockReturnValue(suggestions({ highlight: 1 }));
    render(<Harness onAdd={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'DeckEditor.quickAdd.label' });
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).not.toHaveAttribute('aria-activedescendant');

    fireEvent.change(input, { target: { value: 'sol' } });
    const listbox = screen.getByRole('listbox', { name: 'DeckEditor.quickAdd.listLabel' });
    const options = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('DeckEditor.quickAdd.suggestions');
  });

  it('closes the list on the first Escape and clears the field on the second', () => {
    vi.mocked(useQuickAddSuggestions).mockReturnValue(suggestions());
    render(<Harness onAdd={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'sol' } });

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveValue('sol');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
  });

  it('adds the typed name, not the hidden suggestion, on Enter after Escape', () => {
    const state = suggestions();
    vi.mocked(useQuickAddSuggestions).mockReturnValue(state);
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'sol' } });

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(state.setHighlight).toHaveBeenCalledWith(-1);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('sol');
    expect(onAdd).not.toHaveBeenCalledWith('Sol Ring');
  });
});

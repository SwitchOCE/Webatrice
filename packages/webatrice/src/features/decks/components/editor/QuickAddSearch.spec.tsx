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
    const input = screen.getByPlaceholderText('Quick add — type a card name');

    fireEvent.change(input, { target: { value: 's' } });
    expect(screen.queryByRole('button', { name: 'Sol Ring' })).toBeNull();

    fireEvent.change(input, { target: { value: 'sol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sol Talisman' }));

    expect(onAdd).toHaveBeenCalledWith('Sol Talisman');
    expect(state.clear).toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  it('adds the highlighted suggestion on Enter, else the typed name', () => {
    vi.mocked(useQuickAddSuggestions).mockReturnValue(suggestions({ highlight: 1 }));
    const onAdd = vi.fn();
    const { unmount } = render(<Harness onAdd={onAdd} initial="sol" />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onAdd).toHaveBeenLastCalledWith('Sol Talisman');
    unmount();

    vi.mocked(useQuickAddSuggestions).mockReturnValue(suggestions({ suggestions: [], highlight: -1 }));
    render(<Harness onAdd={onAdd} initial=" Unknown Card " />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onAdd).toHaveBeenLastCalledWith('Unknown Card');
  });

  it('moves the highlight with the arrow keys, wrapping around', () => {
    const state = suggestions();
    vi.mocked(useQuickAddSuggestions).mockReturnValue(state);
    render(<Harness onAdd={vi.fn()} initial="sol" />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowUp' });

    const [down, up] = vi.mocked(state.setHighlight).mock.calls.map(([update]) => update as (h: number) => number);
    expect(down(1)).toBe(0);
    expect(up(0)).toBe(1);
  });

  it('shows searching and empty states, and clears on Escape', () => {
    vi.mocked(useQuickAddSuggestions).mockReturnValue(suggestions({ loading: true }));
    const { rerender } = render(<Harness onAdd={vi.fn()} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('Searching…')).toBeInTheDocument();

    vi.mocked(useQuickAddSuggestions).mockReturnValue(suggestions({ suggestions: [] }));
    rerender(<Harness onAdd={vi.fn()} />);
    expect(screen.getByText('No matches')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
  });
});

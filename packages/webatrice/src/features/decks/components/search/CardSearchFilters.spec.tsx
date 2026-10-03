import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { EMPTY_FILTERS, type SearchFiltersState } from '../../cardSearchQuery';
import { CardSearchFilters } from './CardSearchFilters';

function Harness({ onChange }: { onChange: (f: SearchFiltersState) => void }) {
  const [value, setValue] = useState(EMPTY_FILTERS);
  return (
    <CardSearchFilters
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      onReset={() => setValue(EMPTY_FILTERS)}
    />
  );
}

describe('CardSearchFilters', () => {
  it('toggles colours and types, and sets the colour mode', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Red' }));
    fireEvent.click(screen.getByRole('button', { name: 'Instant' }));
    fireEvent.change(screen.getByTitle('Color match mode'), { target: { value: 'exactly' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      colors: ['R'], types: ['Instant'], colorMode: 'exactly',
    }));
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reveals the advanced filters', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.queryByPlaceholderText('min')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Advanced filters/ }));
    fireEvent.change(screen.getByPlaceholderText('min'), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText('max'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'R' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Elemental, or "Human Warrior" for both'), { target: { value: 'Elf' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. "draw a card"'), { target: { value: 'draw' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      showAdvanced: true, cmcMin: '2', cmcMax: '4', rarities: ['rare'], subtype: 'Elf', oracle: 'draw',
    }));
  });

  it('offers Clear filters only once something narrows the search', () => {
    render(<Harness onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Green' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('button', { name: 'Green' })).toHaveAttribute('aria-pressed', 'false');
  });
});

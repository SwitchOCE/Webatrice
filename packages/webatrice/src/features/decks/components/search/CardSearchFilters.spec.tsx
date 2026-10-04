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

    fireEvent.click(screen.getByRole('button', { name: 'CardSearch.color.R' }));
    fireEvent.click(screen.getByRole('button', { name: 'CardSearch.cardType.Instant' }));
    fireEvent.change(screen.getByTitle('CardSearch.filter.colorMode'), { target: { value: 'exactly' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      colors: ['R'], types: ['Instant'], colorMode: 'exactly',
    }));
    expect(screen.getByRole('button', { name: 'CardSearch.color.R' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reveals the advanced filters', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.queryByPlaceholderText('CardSearch.filter.min')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /CardSearch\.filter\.advanced/ }));
    fireEvent.change(screen.getByPlaceholderText('CardSearch.filter.min'), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText('CardSearch.filter.max'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'CardSearch.rarity.rare.short' }));
    fireEvent.change(screen.getByPlaceholderText('CardSearch.filter.subtypePlaceholder'), { target: { value: 'Elf' } });
    fireEvent.change(screen.getByPlaceholderText('CardSearch.filter.oraclePlaceholder'), { target: { value: 'draw' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      showAdvanced: true, cmcMin: '2', cmcMax: '4', rarities: ['rare'], subtype: 'Elf', oracle: 'draw',
    }));
  });

  it('offers Clear filters only once something narrows the search', () => {
    render(<Harness onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'CardSearch.filter.clear' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'CardSearch.color.G' }));
    fireEvent.click(screen.getByRole('button', { name: 'CardSearch.filter.clear' }));
    expect(screen.getByRole('button', { name: 'CardSearch.color.G' })).toHaveAttribute('aria-pressed', 'false');
  });
});

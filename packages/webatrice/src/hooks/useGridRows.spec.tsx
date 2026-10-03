import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { useGridRows, type GridRowsOptions } from './useGridRows';

const KEYS = ['a', 'b', 'c'];

function Grid(props: Partial<GridRowsOptions>) {
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useGridRows({ keys: KEYS, selectedKey: selected, onSelect: setSelected, onActivate: vi.fn(), ...props });
  return (
    <div role="grid">
      {KEYS.map((key) => (
        <div key={key} role="row" aria-selected={key === selected} data-testid={key} {...rows.getRowProps(key)}>
          <button type="button">{key}</button>
        </div>
      ))}
    </div>
  );
}

describe('useGridRows', () => {
  it('keeps a single tab stop, on the first row until a row is selected', () => {
    render(<Grid />);
    expect(KEYS.map((key) => screen.getByTestId(key).tabIndex)).toEqual([0, -1, -1]);

    fireEvent.keyDown(screen.getByTestId('a'), { key: 'End' });
    expect(KEYS.map((key) => screen.getByTestId(key).tabIndex)).toEqual([-1, -1, 0]);
    expect(screen.getByTestId('c')).toHaveFocus();
  });

  it('moves selection and focus with the arrows and stops at the ends', () => {
    render(<Grid />);
    fireEvent.keyDown(screen.getByTestId('a'), { key: 'ArrowUp' });
    expect(screen.getByTestId('a')).toHaveAttribute('aria-selected', 'false');

    fireEvent.keyDown(screen.getByTestId('a'), { key: 'ArrowDown' });
    expect(screen.getByTestId('b')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('b'), { key: 'Home' });
    expect(screen.getByTestId('a')).toHaveAttribute('aria-selected', 'true');
  });

  it('selects on Space, opens on Enter and leaves keys from inner controls alone', () => {
    const onActivate = vi.fn();
    render(<Grid onActivate={onActivate} />);

    fireEvent.keyDown(screen.getByTestId('b'), { key: ' ' });
    expect(screen.getByTestId('b')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByTestId('b'), { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledWith('b');

    fireEvent.keyDown(screen.getByRole('button', { name: 'c' }), { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('focuses a moved-to row that mounts only after the move, as in a virtualized list', () => {
    // Renders just the selected row, the way a scrolled react-window shows a new window.
    function OneRowGrid() {
      const [selected, setSelected] = useState<string | null>('a');
      const rows = useGridRows({ keys: KEYS, selectedKey: selected, onSelect: setSelected, onActivate: vi.fn() });
      const [shown, setShown] = useState('a');
      return (
        <div role="grid">
          <div key={shown} role="row" data-testid={shown} {...rows.getRowProps(shown)} />
          <button type="button" onClick={() => setShown(selected ?? 'a')}>scroll</button>
        </div>
      );
    }
    render(<OneRowGrid />);

    fireEvent.keyDown(screen.getByTestId('a'), { key: 'End' });
    expect(screen.queryByTestId('c')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'scroll' }));
    expect(screen.getByTestId('c')).toHaveFocus();
  });

  it('hands ← and → to tree callbacks only when given', () => {
    const onExpand = vi.fn();
    const onCollapse = vi.fn();
    const { unmount } = render(<Grid />);
    expect(fireEvent.keyDown(screen.getByTestId('a'), { key: 'ArrowRight' })).toBe(true);
    unmount();

    render(<Grid onExpand={onExpand} onCollapse={onCollapse} />);
    expect(fireEvent.keyDown(screen.getByTestId('a'), { key: 'ArrowRight' })).toBe(false);
    fireEvent.keyDown(screen.getByTestId('a'), { key: 'ArrowLeft' });
    expect(onExpand).toHaveBeenCalledWith('a');
    expect(onCollapse).toHaveBeenCalledWith('a');
  });
});

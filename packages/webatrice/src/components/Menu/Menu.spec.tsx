import { useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Menu, MenuCheckboxItem, MenuItem, MenuSeparator, MenuSubmenu, useContextMenu } from './Menu';

function Example({ onPick = vi.fn() }: { onPick?: (item: string) => void }) {
  const [open, setOpen] = useState(false);
  const [grid, setGrid] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Options
      </button>
      <button type="button">After</button>
      {open && (
        <Menu anchor={{ x: 10, y: 10 }} label="Options" onClose={() => setOpen(false)} triggerRef={trigger}>
          <MenuItem onSelect={() => onPick('alpha')}>Alpha</MenuItem>
          <MenuItem onSelect={() => onPick('off')} disabled>Off</MenuItem>
          <MenuCheckboxItem checked={grid} onChange={setGrid}>Grid</MenuCheckboxItem>
          <MenuSeparator />
          <MenuSubmenu label="More">
            <MenuItem onSelect={() => onPick('beta')}>Beta</MenuItem>
            <MenuItem onSelect={() => onPick('gamma')}>Gamma</MenuItem>
          </MenuSubmenu>
          <MenuItem onSelect={() => onPick('delta')}>Delta</MenuItem>
        </Menu>
      )}
    </>
  );
}

async function openExample(onPick?: (item: string) => void) {
  const user = userEvent.setup();
  render(<Example onPick={onPick} />);
  screen.getByRole('button', { name: 'Options' }).focus();
  await user.keyboard('{Enter}');
  return user;
}

describe('Menu', () => {
  it('opens with focus on the first item and exposes menu semantics', async () => {
    await openExample();

    expect(screen.getByRole('menu', { name: 'Options' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus();
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'More' })).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('moves with the arrows, skipping disabled items and wrapping at the ends', async () => {
    const user = await openExample();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Grid' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Delta' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Delta' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus();
  });

  it('jumps to the next item starting with a typed letter', async () => {
    const user = await openExample();

    await user.keyboard('d');
    expect(screen.getByRole('menuitem', { name: 'Delta' })).toHaveFocus();
    await user.keyboard('m');
    expect(screen.getByRole('menuitem', { name: 'More' })).toHaveFocus();
  });

  it('toggles a checkbox item in place and reports its state', async () => {
    const user = await openExample();
    const grid = screen.getByRole('menuitemcheckbox', { name: 'Grid' });
    expect(grid).toHaveAttribute('aria-checked', 'false');

    grid.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('menuitemcheckbox', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menu', { name: 'Options' })).toBeInTheDocument();
  });

  it('opens a submenu with → and closes just that level with ← or Escape', async () => {
    const onPick = vi.fn();
    const user = await openExample(onPick);
    const more = screen.getByRole('menuitem', { name: 'More' });
    more.focus();

    await user.keyboard('{ArrowRight}');
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Beta' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Gamma' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.queryByRole('menu', { name: 'More' })).not.toBeInTheDocument();
    expect(more).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'More' })).not.toBeInTheDocument();
    expect(screen.getByRole('menu', { name: 'Options' })).toBeInTheDocument();
    expect(more).toHaveFocus();

    await user.keyboard('{ArrowRight}{Enter}');
    expect(onPick).toHaveBeenCalledWith('beta');
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = await openExample();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Options' })).toHaveFocus();
  });

  it('closes every level on Tab, also from inside a submenu', async () => {
    const user = await openExample();
    screen.getByRole('menuitem', { name: 'More' }).focus();
    await user.keyboard('{ArrowRight}');

    await user.tab();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Options' })).toHaveFocus();
  });

  it('closes on a press outside, but not on its own trigger', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    render(<Example />);
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    act(() => {
      vi.advanceTimersToNextFrame();
    });

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Options' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'After' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

function ContextTarget() {
  const menu = useContextMenu();
  return (
    <>
      <a href="#target" {...menu.getTriggerProps()}>Target</a>
      {menu.anchor && (
        <Menu anchor={menu.anchor} label="Target actions" onClose={menu.close} triggerRef={menu.triggerRef}>
          <MenuItem onSelect={menu.close}>Inspect</MenuItem>
        </Menu>
      )}
    </>
  );
}

describe('useContextMenu', () => {
  it.each([
    ['Shift+F10', '{Shift>}{F10}{/Shift}'],
    ['the Menu key', '{ContextMenu}'],
  ])('opens from %s on the focused element and returns focus there', async (_, keys) => {
    const user = userEvent.setup();
    render(<ContextTarget />);
    const target = screen.getByRole('link', { name: 'Target' });
    target.focus();

    await user.keyboard(keys);

    expect(target).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Inspect' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(target).toHaveFocus();
  });

  it('opens at the pointer on right-click', () => {
    render(<ContextTarget />);

    fireEvent.contextMenu(screen.getByRole('link', { name: 'Target' }), { clientX: 40, clientY: 50 });

    expect(screen.getByRole('menu', { name: 'Target actions' })).toHaveStyle({ left: '42px', top: '54px' });
  });
});

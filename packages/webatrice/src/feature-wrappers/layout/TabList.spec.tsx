import { fireEvent, screen, within } from '@testing-library/react';

import { renderWithProviders } from '../../__test-utils__';

import TabList from './TabList';
import type { Tab } from './topBarTabs';

const lobby: Tab = { key: 'server', type: 'server', title: 'Lobby', route: '/server', closeable: false };
const deck: Tab = {
  key: 'deck:3', type: 'deck', titleKey: 'TopBar.tab.deck', titleParams: { id: '3' }, route: '/deck/3', closeable: true,
};

function renderTabs(activeKey = 'server') {
  const onClose = vi.fn();
  renderWithProviders(<TabList tabs={[lobby, deck]} activeKey={activeKey} onClose={onClose} />);
  return onClose;
}

describe('TabList', () => {
  it('lists each tab as a link in a labelled nav, marking the current one', () => {
    renderTabs('deck:3');

    const nav = screen.getByRole('navigation', { name: 'TopBar.tabs.label' });
    expect(within(nav).getByRole('link', { name: 'Lobby' })).toHaveAttribute('href', '/server');
    expect(within(nav).getByRole('link', { name: 'Lobby' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'TopBar.tab.deck' })).toHaveAttribute('aria-current', 'page');
  });

  it('closes a closeable tab from its Close button', () => {
    const onClose = renderTabs();

    fireEvent.click(screen.getByRole('button', { name: 'TopBar.tabs.close' }));

    expect(onClose).toHaveBeenCalledWith(deck);
  });

  it('gives the pinned tab no Close button', () => {
    renderTabs();

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(within(screen.getByRole('link', { name: 'Lobby' }).closest('li')!).queryByRole('button')).toBeNull();
  });

  it('closes on middle-click, but never the pinned tab', () => {
    const onClose = renderTabs();

    fireEvent(screen.getByRole('link', { name: 'Lobby' }), new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent(screen.getByRole('link', { name: 'TopBar.tab.deck' }), new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(onClose).toHaveBeenCalledWith(deck);
  });
});

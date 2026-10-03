import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders, connectedState, makeUser, createMockWebClient } from '../../__test-utils__';
import UserDisplay from './UserDisplay';
import { UserMenuSlotProvider, type UserMenuSlotProps } from './UserMenuSlot';

const mockWebClient = createMockWebClient();

vi.mock('@cockatrice/datatrice/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cockatrice/datatrice/react')>();
  return { ...actual, useWebClient: vi.fn(() => mockWebClient) };
});

vi.mock('@app/images', () => ({
  Images: { Countries: { us: 'us.png', de: 'de.png' } },
}));

describe('UserDisplay', () => {
  it('renders user name', () => {
    const user = makeUser({ name: 'TestPlayer', country: 'us' });
    renderWithProviders(<UserDisplay user={user} />, {
      preloadedState: connectedState,
    });

    expect(screen.getByText('TestPlayer')).toBeInTheDocument();
  });

  it('renders country flag image', () => {
    const user = makeUser({ name: 'TestPlayer', country: 'us' });
    renderWithProviders(<UserDisplay user={user} />, {
      preloadedState: connectedState,
    });

    const img = screen.getByAltText('us');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'us.png');
  });

  it('renders link to player profile', () => {
    const user = makeUser({ name: 'TestPlayer', country: 'us' });
    renderWithProviders(<UserDisplay user={user} />, {
      preloadedState: connectedState,
    });

    const link = screen.getByRole('link', { name: /TestPlayer/ });
    expect(link).toHaveAttribute('href', '/player/TestPlayer');
  });

  it('renders the context-menu slot with the target and its level', () => {
    const Slot = ({ userName, userLevel, onClose }: UserMenuSlotProps) => (
      <button type="button" role="menuitem" onClick={onClose}>{`slot ${userName} ${userLevel}`}</button>
    );
    const user = makeUser({ name: 'TestPlayer', country: 'us', userLevel: 3 });
    renderWithProviders(
      <UserMenuSlotProvider value={Slot}>
        <UserDisplay user={user} />
      </UserMenuSlotProvider>,
      { preloadedState: connectedState },
    );

    fireEvent.contextMenu(screen.getByText('TestPlayer'));
    const entry = screen.getByRole('menuitem', { name: 'slot TestPlayer 3' });
    fireEvent.click(entry);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders only its own entries without a slot provider', () => {
    const user = makeUser({ name: 'TestPlayer', country: 'us' });
    renderWithProviders(<UserDisplay user={user} />, { preloadedState: connectedState });

    fireEvent.contextMenu(screen.getByText('TestPlayer'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^slot/ })).not.toBeInTheDocument();
  });
});

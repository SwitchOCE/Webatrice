import { vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

import { renderWithProviders, createMockWebClient, connectedState, makeUser } from '../../__test-utils__';

// Echo interpolation values so the specs can check what each label is given.
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key);
  return { ...actual, useTranslation: (...args: Parameters<typeof actual.useTranslation>) => ({ ...actual.useTranslation(...args), t }) };
});

const hoisted = vi.hoisted(() => ({ mockWebClient: undefined as any }));

vi.mock('@cockatrice/datatrice/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cockatrice/datatrice/react')>();
  return { ...actual, useWebClient: () => hoisted.mockWebClient };
});

import Account from './Account';

beforeAll(() => {
  hoisted.mockWebClient = createMockWebClient();
});

describe('Account', () => {
  it('renders server details and the current user', () => {
    const { container } = renderWithProviders(<Account />, { preloadedState: connectedState });

    expect(screen.getByText(/Account\.server\.name .*"serverName":"Test Server"/)).toBeInTheDocument();
    expect(screen.getByText(/Account\.server\.version .*"serverVersion":"1\.0\.0"/)).toBeInTheDocument();
    // "testUser" also appears in the TopBar account button now; scope the
    // profile-name assertion to the account-details panel's <strong>.
    const strong = container.querySelector('.account-details strong');
    expect(strong?.textContent).toBe('testUser');
    expect(screen.getByText(/^Account\.buddies\.online /)).toBeInTheDocument();
    expect(screen.getByText(/^Account\.ignored\.online /)).toBeInTheDocument();
  });

  it('disconnects via the web client when the Disconnect button is clicked', () => {
    renderWithProviders(<Account />, { preloadedState: connectedState });

    fireEvent.click(screen.getByRole('button', { name: /Common\.disconnect/ }));
    expect(hoisted.mockWebClient.request.authentication.disconnect).toHaveBeenCalled();
  });

  it('adds a buddy through the AddUserForm', async () => {
    renderWithProviders(<Account />, { preloadedState: connectedState });

    const addButtons = screen.getAllByRole('button', { name: 'Add' });
    const textboxes = screen.getAllByRole('textbox');
    await act(async () => {
      fireEvent.change(textboxes[0], { target: { value: 'buddyA' } });
    });
    await act(async () => {
      fireEvent.submit(addButtons[0].closest('form')!);
    });
    await flush();

    expect(hoisted.mockWebClient.request.session.addToBuddyList).toHaveBeenCalledWith('buddyA');
  });

  it('adds an ignored user through the second AddUserForm', async () => {
    renderWithProviders(<Account />, { preloadedState: connectedState });

    const addButtons = screen.getAllByRole('button', { name: 'Add' });
    const textboxes = screen.getAllByRole('textbox');
    await act(async () => {
      fireEvent.change(textboxes[1], { target: { value: 'ignoreB' } });
    });
    await act(async () => {
      fireEvent.submit(addButtons[1].closest('form')!);
    });
    await flush();

    expect(hoisted.mockWebClient.request.session.addToIgnoreList).toHaveBeenCalledWith('ignoreB');
  });

  it('renders an avatar image when the user has an avatar bitmap', () => {
    (globalThis.URL as any).createObjectURL = vi.fn(() => 'blob:avatar');
    (globalThis.URL as any).revokeObjectURL = vi.fn();

    const state = {
      ...connectedState,
      server: {
        ...(connectedState.server as any),
        user: makeUser({ avatarBmp: new Uint8Array([9, 9]) }),
      },
    };
    renderWithProviders(<Account />, { preloadedState: state });

    const img = screen.getByAltText('testUser') as HTMLImageElement;
    expect(img.src).toContain('blob:avatar');
  });

  it('uppercases the country code in the user details panel', () => {
    const state = {
      ...connectedState,
      server: {
        ...(connectedState.server as any),
        user: makeUser({ country: 'us', realName: 'Real Person', userLevel: 4 }),
      },
    };
    renderWithProviders(<Account />, { preloadedState: state });

    expect(screen.getByText(/Account\.details\.location .*"country":"US"/)).toBeInTheDocument();
    expect(screen.getByText(/Account\.details\.realName .*"realName":"Real Person"/)).toBeInTheDocument();
    expect(screen.getByText(/Account\.details\.userLevel .*"userLevel":4/)).toBeInTheDocument();
  });

  it('gives every detail label a value before the user info arrives, so ICU still formats it', () => {
    const state = {
      ...connectedState,
      server: { ...(connectedState.server as any), user: null },
    };
    renderWithProviders(<Account />, { preloadedState: state });

    expect(screen.getByText('Account.details.location {"country":""}')).toBeInTheDocument();
    expect(screen.getByText('Account.details.realName {"realName":""}')).toBeInTheDocument();
    expect(screen.getByText('Account.details.userLevel {"userLevel":""}')).toBeInTheDocument();
    expect(screen.getByText('Account.details.accountAge {"accountAge":""}')).toBeInTheDocument();
  });

  it('renders the Edit, Change Password, and Change Avatar action buttons', () => {
    renderWithProviders(<Account />, { preloadedState: connectedState });

    expect(screen.getByRole('button', { name: 'Account.action.edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account.action.changePassword' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account.action.changeAvatar' })).toBeInTheDocument();
  });

  it.each([
    ['Account.action.edit', 'EditUserDialog.title'],
    ['Account.action.changePassword', 'ChangePasswordDialog.title'],
    ['Account.action.changeAvatar', 'ChangeAvatarDialog.title'],
  ])('%s opens its dialog without sending anything until confirmed', (button, title) => {
    renderWithProviders(<Account />, { preloadedState: connectedState });

    fireEvent.click(screen.getByRole('button', { name: button }));

    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
    expect(hoisted.mockWebClient.request.session.accountEdit).not.toHaveBeenCalled();
    expect(hoisted.mockWebClient.request.session.accountPassword).not.toHaveBeenCalled();
    expect(hoisted.mockWebClient.request.session.accountImage).not.toHaveBeenCalled();
  });

  it('closes an account dialog on cancel', () => {
    renderWithProviders(<Account />, { preloadedState: connectedState });

    fireEvent.click(screen.getByRole('button', { name: 'Account.action.changePassword' }));
    fireEvent.click(screen.getByRole('button', { name: 'AccountDialogs.label.cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clears the buddy input after a successful submission', async () => {
    renderWithProviders(<Account />, { preloadedState: connectedState });

    hoisted.mockWebClient.request.session.addToBuddyList.mockClear();
    const addButtons = screen.getAllByRole('button', { name: 'Add' });
    const [buddyInput] = screen.getAllByRole('textbox');
    await act(async () => {
      fireEvent.change(buddyInput, { target: { value: 'tempBuddy' } });
    });
    await act(async () => {
      fireEvent.submit(addButtons[0].closest('form')!);
    });
    await flush();

    expect(hoisted.mockWebClient.request.session.addToBuddyList).toHaveBeenCalledWith('tempBuddy');
    expect((buddyInput as HTMLInputElement).value).toBe('');
  });

  it('revokes the avatar object url when the component unmounts', () => {
    const revokeObjectURL = vi.fn();
    (globalThis.URL as any).createObjectURL = vi.fn(() => 'blob:avatar-2');
    (globalThis.URL as any).revokeObjectURL = revokeObjectURL;

    const state = {
      ...connectedState,
      server: {
        ...(connectedState.server as any),
        user: makeUser({ avatarBmp: new Uint8Array([1, 2, 3, 4]) }),
      },
    };
    const { unmount } = renderWithProviders(<Account />, { preloadedState: state });
    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:avatar-2');
  });

  it('renders the language dropdown in the server details panel', () => {
    const { container } = renderWithProviders(<Account />, { preloadedState: connectedState });

    expect(container.querySelector('.account-details__lang')).toBeInTheDocument();
  });
});

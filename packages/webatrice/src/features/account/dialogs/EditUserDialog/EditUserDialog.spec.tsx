import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import { server } from '@cockatrice/datatrice';

import { connectedState, makeUser, renderWithProviders } from '../../../../__test-utils__';
import EditUserDialog from './EditUserDialog';

// Omitted → a server without password hashing; an explicit `undefined` → capability not yet known.
function stateWith(options: { supportsPasswordHash?: boolean | undefined }) {
  const supportsPasswordHash = 'supportsPasswordHash' in options ? options.supportsPasswordHash : false;
  return {
    ...connectedState,
    server: {
      ...(connectedState.server as any),
      info: { ...(connectedState.server as any).info, supportsPasswordHash },
      user: makeUser({ email: 'old@example.com', country: 'us', realName: 'Alice' }),
    },
  };
}

function setup(options: { supportsPasswordHash?: boolean | undefined } = {}) {
  const handleClose = vi.fn();
  const view = renderWithProviders(<EditUserDialog isOpen handleClose={handleClose} />, {
    preloadedState: stateWith(options),
  });
  const accountEdit = vi.mocked(view.webClient.request.session.accountEdit);
  return { ...view, handleClose, accountEdit };
}

const emailInput = () => screen.getByLabelText('Common.label.email') as HTMLInputElement;
const submit = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'AccountDialogs.label.ok' }));
  });
};

describe('EditUserDialog', () => {
  it('re-fetches the caller’s own record and prefills the form from the profile', () => {
    const { webClient } = setup();

    expect(webClient.request.session.getUserInfo).toHaveBeenCalledWith('');
    expect(emailInput().value).toBe('old@example.com');
    expect((screen.getByLabelText('Common.label.realName') as HTMLInputElement).value).toBe('Alice');
  });

  it('fills in the fetched profile when it arrives after the dialog opened', () => {
    const { store } = setup();

    act(() => {
      store.dispatch(server.Actions.getUserInfo({
        userInfo: makeUser({ email: 'fresh@example.com', country: 'de', realName: 'Alice' }),
      }));
    });

    expect(emailInput().value).toBe('fresh@example.com');
  });

  it('sends the full record, country lowercased, to servers without password hashing', async () => {
    const { accountEdit } = setup();

    fireEvent.change(screen.getByLabelText('Common.label.realName'), { target: { value: 'Alice Smith' } });
    await submit();

    expect(accountEdit).toHaveBeenCalledWith(
      { realName: 'Alice Smith', country: 'us', email: 'old@example.com' },
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('leaves an unchanged email out on hash-capable servers', async () => {
    const { accountEdit } = setup({ supportsPasswordHash: true });

    await submit();

    expect(accountEdit.mock.calls[0][0]).toEqual({ realName: 'Alice', country: 'us' });
    expect(screen.queryByLabelText('EditUserDialog.label.passwordCheck')).not.toBeInTheDocument();
  });

  it('requires the current password to change the email on hash-capable servers', async () => {
    const { accountEdit } = setup({ supportsPasswordHash: true });

    fireEvent.change(emailInput(), { target: { value: 'new@example.com' } });
    await submit();
    expect(accountEdit).not.toHaveBeenCalled();
    expect(screen.getByText('Common.validation.required')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/EditUserDialog\.label\.passwordCheck/), { target: { value: 'secret' } });
    await submit();

    expect(accountEdit.mock.calls[0][0]).toEqual({
      realName: 'Alice',
      country: 'us',
      email: 'new@example.com',
      passwordCheck: 'secret',
    });
  });

  it('asks for the password check while the server capability is still unknown', async () => {
    const { accountEdit } = setup({ supportsPasswordHash: undefined });

    await submit();
    expect(accountEdit.mock.calls[0][0]).toEqual({ realName: 'Alice', country: 'us' });

    fireEvent.change(emailInput(), { target: { value: 'new@example.com' } });
    expect(screen.getByLabelText('EditUserDialog.label.passwordCheck')).toBeInTheDocument();
  });

  it('keeps the dialog open with the desktop message when the server refuses', async () => {
    const { accountEdit, handleClose } = setup();

    await submit();
    act(() => {
      accountEdit.mock.calls[0][2]!(Response_ResponseCode.RespWrongPassword);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('AccountDialogs.error.passwordCheckWrong');
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('closes once the server accepts the edit', async () => {
    const { accountEdit, handleClose } = setup();

    await submit();
    act(() => {
      accountEdit.mock.calls[0][1]!();
    });

    await waitFor(() => expect(handleClose).toHaveBeenCalled());
  });
});

import { act, fireEvent, screen } from '@testing-library/react';

import { renderWithProviders, disconnectedState } from '../../../../__test-utils__';
import { useRegisterForm, type RegisterForm } from './useRegisterForm';
import { server } from '@cockatrice/datatrice';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import { testI18n } from '../../../../__test-utils__/renderWithProviders';
import messages from './RegisterForm.i18n.json';

// Probe component: surfaces the hook's return value and exposes buttons that
// invoke each imperative callback so we can assert state transitions.
let latest: RegisterForm;
const Probe = () => {
  const hook = useRegisterForm();
  latest = hook;
  return (
    <div>
      <span data-testid="emailRequired">{String(hook.emailRequired)}</span>
      <span data-testid="emailError">{String(hook.emailError)}</span>
      <span data-testid="passwordError">{String(hook.passwordError)}</span>
      <span data-testid="userNameError">{String(hook.userNameError)}</span>
      <span data-testid="error">{String(hook.error)}</span>
      <button data-testid="onHostChange" onClick={hook.onHostChange} />
      <button data-testid="onEmailChange" onClick={hook.onEmailChange} />
      <button data-testid="onPasswordChange" onClick={hook.onPasswordChange} />
      <button data-testid="onUserNameChange" onClick={hook.onUserNameChange} />
    </div>
  );
};

describe('useRegisterForm', () => {
  beforeAll(() => {
    testI18n.addResourceBundle('en-US', 'translation', messages, true, true);
  });

  test('shows a registration limit reason and retry deadline after disconnect without a ban label', () => {
    const { store } = renderWithProviders(<Probe />, { preloadedState: disconnectedState });
    act(() => {
      store.dispatch(server.Actions.registrationFailed({
        reason: 'Too many registration attempts',
        endTime: 1800000000,
        responseCode: Response_ResponseCode.RespTooManyRequests,
      }));
      store.dispatch(server.Actions.disconnected());
    });
    expect(screen.getByTestId('error')).toHaveTextContent(
      `Too many registration attempts. Please try again after ${new Date(1800000000 * 1000).toLocaleString()}.`,
    );
    expect(screen.getByTestId('error')).not.toHaveTextContent(/banned/i);
    act(() => {
      store.dispatch(server.Actions.clearRegistrationErrors());
    });
    expect(screen.getByTestId('error')).toHaveTextContent('null');
  });

  test('localizes a timed registration limit when the server supplies no reason', () => {
    const { store } = renderWithProviders(<Probe />, { preloadedState: disconnectedState });
    act(() => {
      store.dispatch(server.Actions.registrationFailed({
        reason: '', endTime: 1800000000, responseCode: Response_ResponseCode.RespTooManyRequests,
      }));
    });
    expect(screen.getByTestId('error')).toHaveTextContent(
      `Too many registration requests. Please try again after ${new Date(1800000000 * 1000).toLocaleString()}.`,
    );
  });

  test.each([undefined, 0, -1, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER])(
    'localizes a registration limit with no reason or usable deadline (%s)',
    (endTime) => {
      const { store } = renderWithProviders(<Probe />, { preloadedState: disconnectedState });
      act(() => {
        store.dispatch(server.Actions.registrationFailed({
          reason: '', endTime, responseCode: Response_ResponseCode.RespTooManyRequests,
        }));
      });
      expect(screen.getByTestId('error')).toHaveTextContent('Too many registration requests. Please try again later.');
      expect(screen.getByTestId('error')).not.toHaveTextContent(/banned|Invalid Date/i);
    },
  );

  test('preserves a server limit reason without inventing a deadline', () => {
    const { store } = renderWithProviders(<Probe />, { preloadedState: disconnectedState });
    act(() => {
      store.dispatch(server.Actions.registrationFailed({
        reason: 'Account limit reached for this email', responseCode: Response_ResponseCode.RespTooManyRequests,
      }));
    });
    expect(screen.getByTestId('error')).toHaveTextContent('Account limit reached for this email');
    expect(screen.getByTestId('error')).not.toHaveTextContent(/banned|after/i);
  });

  test('starts with cleared state', () => {
    renderWithProviders(<Probe />, { preloadedState: disconnectedState });
    expect(screen.getByTestId('emailRequired').textContent).toBe('false');
    expect(screen.getByTestId('emailError').textContent).toBe('null');
    expect(screen.getByTestId('passwordError').textContent).toBe('null');
    expect(screen.getByTestId('userNameError').textContent).toBe('null');
    expect(screen.getByTestId('error').textContent).toBe('null');
  });

  test('reads the registration error from redux state', () => {
    renderWithProviders(<Probe />, {
      preloadedState: {
        ...disconnectedState,
        server: { ...(disconnectedState.server as any), registrationError: 'boom' },
      },
    });
    expect(screen.getByTestId('error').textContent).toBe('boom');
  });

  test('REGISTRATION_REQUIRES_EMAIL flips emailRequired; onHostChange clears it', () => {
    const { store } = renderWithProviders(<Probe />, { preloadedState: disconnectedState });
    act(() => {
      store.dispatch({ type: server.Types.REGISTRATION_REQUIRES_EMAIL, payload: {} });
    });
    expect(screen.getByTestId('emailRequired').textContent).toBe('true');

    fireEvent.click(screen.getByTestId('onHostChange'));
    expect(screen.getByTestId('emailRequired').textContent).toBe('false');
  });

  test('REGISTRATION_EMAIL_ERROR sets emailError; onEmailChange clears it', () => {
    const { store } = renderWithProviders(<Probe />, { preloadedState: disconnectedState });
    act(() => {
      store.dispatch({
        type: server.Types.REGISTRATION_EMAIL_ERROR,
        payload: { error: 'bad email' },
      });
    });
    expect(screen.getByTestId('emailError').textContent).toBe('bad email');

    fireEvent.click(screen.getByTestId('onEmailChange'));
    expect(screen.getByTestId('emailError').textContent).toBe('null');
  });

  test('REGISTRATION_PASSWORD_ERROR sets passwordError; onPasswordChange clears it', () => {
    const { store } = renderWithProviders(<Probe />, { preloadedState: disconnectedState });
    act(() => {
      store.dispatch({
        type: server.Types.REGISTRATION_PASSWORD_ERROR,
        payload: { error: 'bad password' },
      });
    });
    expect(screen.getByTestId('passwordError').textContent).toBe('bad password');

    fireEvent.click(screen.getByTestId('onPasswordChange'));
    expect(screen.getByTestId('passwordError').textContent).toBe('null');
  });

  test('REGISTRATION_USERNAME_ERROR sets userNameError; onUserNameChange clears it', () => {
    const { store } = renderWithProviders(<Probe />, { preloadedState: disconnectedState });
    act(() => {
      store.dispatch({
        type: server.Types.REGISTRATION_USERNAME_ERROR,
        payload: { error: 'bad name' },
      });
    });
    expect(screen.getByTestId('userNameError').textContent).toBe('bad name');

    fireEvent.click(screen.getByTestId('onUserNameChange'));
    expect(screen.getByTestId('userNameError').textContent).toBe('null');
  });

  test('change callbacks are no-ops when no matching error is present', () => {
    renderWithProviders(<Probe />, { preloadedState: disconnectedState });
    fireEvent.click(screen.getByTestId('onEmailChange'));
    fireEvent.click(screen.getByTestId('onPasswordChange'));
    fireEvent.click(screen.getByTestId('onUserNameChange'));
    expect(screen.getByTestId('emailError').textContent).toBe('null');
    expect(screen.getByTestId('passwordError').textContent).toBe('null');
    expect(screen.getByTestId('userNameError').textContent).toBe('null');
  });

  test('REGISTRATION_SUCCESS is handled without throwing', () => {
    const { store } = renderWithProviders(<Probe />, { preloadedState: disconnectedState });
    expect(() =>
      act(() => {
        store.dispatch({ type: server.Types.REGISTRATION_SUCCESS, payload: {} });
      }),
    ).not.toThrow();
    expect(latest).toBeDefined();
  });
});

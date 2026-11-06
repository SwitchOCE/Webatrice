// Tests for complex session commands that call WebClient directly
// or have multiple branching callbacks.

vi.mock('../../WebClient');

vi.mock('../../utils', async () => {
  const { makeUtilsMock } = await import('../../__mocks__/sessionCommandMocks');
  return makeUtilsMock();
});

// Intercept all re-exported commands to avoid recursive real invocations
vi.mock('./', async () => {
  const { makeSessionBarrelMock } = await import('../../__mocks__/sessionCommandMocks');
  return makeSessionBarrelMock();
});

import { Mock } from 'vitest';
import { makeCallbackHelpers } from '../../testing/callback-helpers';
import { WebClient } from '../../WebClient';
import * as SessionIndexMocks from './';
import {
  WebSocketConnectReason,
  type LoginConnectOptions,
  type RegisterConnectOptions,
  type ActivateConnectOptions,
  type PasswordResetRequestConnectOptions,
  type PasswordResetChallengeConnectOptions,
  type PasswordResetConnectOptions,
} from '../../types/ConnectOptions';
import { StatusEnum } from '../../types/StatusEnum';
import { CommandFailure } from '../../services/command-options';
import {
  Command_Activate_ext,
  Command_ForgotPasswordChallenge_ext,
  Command_ForgotPasswordRequest_ext,
  Command_ForgotPasswordReset_ext,
  Command_Login_ext,
  Command_Register_ext,
  Command_RequestPasswordSalt_ext,
  Response_ForgotPasswordRequest_ext,
  Response_Login_ext,
  Response_PasswordSalt_ext,
  Response_Register_ext,
  Response_RegisterSchema,
  Response_ResponseCode,
  Response_LoginSchema,
  ResponseSchema,
} from '../../generated';
import { hashPassword, generateSalt, passwordSaltSupported } from '../../utils';

import { create, setExtension, type MessageInitShape } from '@bufbuild/protobuf';

import { connect, testConnect } from './connect';
import { updateStatus } from './updateStatus';
import { login } from './login';
import { register } from './register';
import { activate } from './activate';
import { forgotPasswordChallenge } from './forgotPasswordChallenge';
import { forgotPasswordRequest } from './forgotPasswordRequest';
import { forgotPasswordReset } from './forgotPasswordReset';
import { requestPasswordSalt } from './requestPasswordSalt';

const { invokeOnSuccess, invokeResponseCode, invokeOnError } = makeCallbackHelpers(
  WebClient.instance.protobuf.sendSessionCommand as Mock,
  2
);

const baseTransport = { host: 'h', port: '1' };
const makeLoginOpts = (overrides: Partial<LoginConnectOptions> = {}): LoginConnectOptions => ({
  ...baseTransport,
  userName: 'alice',
  reason: WebSocketConnectReason.LOGIN,
  ...overrides,
});
const makeRegisterOpts = (
  overrides: Partial<RegisterConnectOptions> = {}
): RegisterConnectOptions => ({
  ...baseTransport,
  userName: 'alice',
  password: 'pw',
  email: 'a@b.com',
  country: 'US',
  realName: 'Al',
  reason: WebSocketConnectReason.REGISTER,
  ...overrides,
});
const makeActivateOpts = (
  overrides: Partial<ActivateConnectOptions> = {}
): ActivateConnectOptions => ({
  ...baseTransport,
  userName: 'alice',
  token: 'tok',
  reason: WebSocketConnectReason.ACTIVATE_ACCOUNT,
  ...overrides,
});
const makeForgotRequestOpts = (): PasswordResetRequestConnectOptions => ({
  ...baseTransport,
  userName: 'alice',
  reason: WebSocketConnectReason.PASSWORD_RESET_REQUEST,
});
const makeForgotChallengeOpts = (): PasswordResetChallengeConnectOptions => ({
  ...baseTransport,
  userName: 'alice',
  email: 'a@b.com',
  reason: WebSocketConnectReason.PASSWORD_RESET_CHALLENGE,
});
const makeForgotResetOpts = (): PasswordResetConnectOptions => ({
  ...baseTransport,
  userName: 'alice',
  token: 'tok',
  newPassword: 'newpw',
  reason: WebSocketConnectReason.PASSWORD_RESET,
});


beforeEach(() => {
  (hashPassword as Mock).mockResolvedValue('hashed_pw');
  (generateSalt as Mock).mockReturnValue('randSalt');
  (passwordSaltSupported as Mock).mockReturnValue(0);
});

describe('connect', () => {

  it('calls WebClient.instance.connect with the target', () => {
    connect({ host: 'h', port: '1' });
    expect(WebClient.instance.connect).toHaveBeenCalledWith({ host: 'h', port: '1' });
  });
});

describe('testConnect', () => {

  it('calls WebClient.instance.testConnect with the target', () => {
    testConnect({ host: 'h', port: '1' });
    expect(WebClient.instance.testConnect).toHaveBeenCalledWith({ host: 'h', port: '1' });
  });
});

describe('updateStatus', () => {

  it('calls WebClient.instance.response.session.updateStatus and WebClient.instance.updateStatus', () => {
    updateStatus(StatusEnum.CONNECTED, 'OK');
    expect(WebClient.instance.response.session.updateStatus).toHaveBeenCalledWith(StatusEnum.CONNECTED, 'OK');
    expect(WebClient.instance.updateStatus).toHaveBeenCalledWith(StatusEnum.CONNECTED);
  });
});

describe('login', () => {

  it('sends Command_Login with plain password when no salt', () => {
    login(makeLoginOpts(), 'pw');
    expect(WebClient.instance.protobuf.sendSessionCommand).toHaveBeenCalledWith(
      Command_Login_ext,
      expect.objectContaining({ password: 'pw' }),
      expect.objectContaining({ responseExt: Response_Login_ext })
    );
  });

  it('sends Command_Login with hashedPassword when options.hashedPassword is set', () => {
    login(makeLoginOpts({ hashedPassword: 'pre_hashed' }), 'pw');
    expect(WebClient.instance.protobuf.sendSessionCommand).toHaveBeenCalledWith(
      Command_Login_ext,
      expect.objectContaining({ hashedPassword: 'pre_hashed' }),
      expect.objectContaining({ responseExt: Response_Login_ext })
    );
  });

  it('onSuccess dispatches buddy/ignore/user and calls listUsers/listRooms', () => {
    login(makeLoginOpts(), 'pw');
    const loginResp = { buddyList: [], ignoreList: [], userInfo: { name: 'alice' } };
    invokeOnSuccess(loginResp, { responseCode: 0 });
    expect(WebClient.instance.response.session.updateBuddyList).toHaveBeenCalledWith([]);
    expect(WebClient.instance.response.session.updateIgnoreList).toHaveBeenCalledWith([]);
    expect(WebClient.instance.response.session.updateUser).toHaveBeenCalledWith({ name: 'alice' });
    expect(WebClient.instance.response.session.loginSuccessful).toHaveBeenCalled();
    expect(SessionIndexMocks.listUsers).toHaveBeenCalled();
    expect(SessionIndexMocks.listRooms).toHaveBeenCalled();
    expect(SessionIndexMocks.updateStatus).toHaveBeenCalledWith(StatusEnum.LOGGED_IN, 'Logged in.');
  });

  it('onSuccess does NOT pass plaintext password to loginSuccessful', () => {
    login(makeLoginOpts(), 'secret');
    const loginResp = { buddyList: [], ignoreList: [], userInfo: { name: 'alice' } };
    invokeOnSuccess(loginResp, { responseCode: 0 });
    const calledWith = (WebClient.instance.response.session.loginSuccessful as Mock).mock.calls[0][0];
    expect(calledWith).not.toHaveProperty('password');
  });

  it('onSuccess passes hashedPassword to loginSuccessful when options.hashedPassword is set', () => {
    login({ host: 'h', port: '1', userName: 'alice', reason: WebSocketConnectReason.LOGIN, hashedPassword: 'hashed_pw' }, 'pw');
    const loginResp = { buddyList: [], ignoreList: [], userInfo: { name: 'alice' } };
    invokeOnSuccess(loginResp, { responseCode: 0 });
    const calledWith = (WebClient.instance.response.session.loginSuccessful as Mock).mock.calls[0][0];
    expect(calledWith).toHaveProperty('hashedPassword', 'hashed_pw');
  });

  it('onSuccess passes the server\'s missing features to loginSuccessful', () => {
    login(makeLoginOpts(), 'pw');
    const loginResp = { buddyList: [], ignoreList: [], userInfo: { name: 'alice' }, missingFeatures: ['new_feature'] };
    invokeOnSuccess(loginResp, { responseCode: 0 });
    const calledWith = (WebClient.instance.response.session.loginSuccessful as Mock).mock.calls[0][0];
    expect(calledWith).toHaveProperty('missingFeatures', ['new_feature']);
  });

  const deniedLogin = (responseCode: number, details: MessageInitShape<typeof Response_LoginSchema>) => {
    const raw = create(ResponseSchema, { responseCode });
    setExtension(raw, Response_Login_ext, create(Response_LoginSchema, details));
    invokeResponseCode(responseCode, raw);
  };

  it('onResponseCode RespClientUpdateRequired reports the missing features', () => {
    login(makeLoginOpts(), 'pw');
    deniedLogin(Response_ResponseCode.RespClientUpdateRequired, { missingFeatures: ['new_feature'] });
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledWith(expect.objectContaining({
      responseCode: Response_ResponseCode.RespClientUpdateRequired,
      missingFeatures: ['new_feature'],
    }));
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });

  it('onResponseCode RespWrongPassword', () => {
    login(makeLoginOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespWrongPassword);
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalled();
  });

  it('onResponseCode RespUsernameInvalid', () => {
    login(makeLoginOpts(), 'pw');
    deniedLogin(Response_ResponseCode.RespUsernameInvalid, { deniedReasonStr: '3|12|1|1|1|0|_' });
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledWith(expect.objectContaining({
      responseCode: Response_ResponseCode.RespUsernameInvalid,
      deniedReason: '3|12|1|1|1|0|_',
    }));
  });

  it('onResponseCode RespWouldOverwriteOldSession', () => {
    login(makeLoginOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespWouldOverwriteOldSession);
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalled();
  });

  it('onResponseCode RespUserIsBanned reports the end time and reason', () => {
    login(makeLoginOpts(), 'pw');
    deniedLogin(Response_ResponseCode.RespUserIsBanned, { deniedEndTime: 2000000000n, deniedReasonStr: 'Spamming' });
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledWith(expect.objectContaining({
      responseCode: Response_ResponseCode.RespUserIsBanned,
      deniedEndTime: 2000000000,
      deniedReason: 'Spamming',
    }));
  });

  it('onResponseCode RespRegistrationRequired', () => {
    login(makeLoginOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespRegistrationRequired);
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalled();
  });

  it('onResponseCode RespClientIdRequired', () => {
    login(makeLoginOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespClientIdRequired);
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalled();
  });

  it('onResponseCode RespContextError', () => {
    login(makeLoginOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespContextError);
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalled();
  });

  it('onResponseCode RespAccountNotActivated calls accountAwaitingActivation without password in options', () => {
    login(makeLoginOpts({ password: 'leaked' }), 'pw');
    invokeResponseCode(Response_ResponseCode.RespAccountNotActivated);
    expect(WebClient.instance.response.session.accountAwaitingActivation).toHaveBeenCalledWith(
      expect.not.objectContaining({ password: expect.anything() })
    );
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalled();
  });

  it('onError calls onLoginError with unknown error message', () => {
    login(makeLoginOpts(), 'pw');
    invokeOnError(999);
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledWith({ responseCode: 999 });
  });

  it('reports the rejecting response code to loginFailed', () => {
    login(makeLoginOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespWrongPassword);
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledWith({ responseCode: Response_ResponseCode.RespWrongPassword });
  });

  it('onResponseCode RespPasswordChangeRequired fails the login with its code and disconnects', () => {
    login(makeLoginOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespPasswordChangeRequired);
    expect(SessionIndexMocks.updateStatus).toHaveBeenCalledWith(StatusEnum.DISCONNECTED, 'Login failed: password change required');
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledWith({
      responseCode: Response_ResponseCode.RespPasswordChangeRequired,
    });
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });

  it('onResponseCode RespServerFull fails the login with its code and disconnects', () => {
    login(makeLoginOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespServerFull);
    expect(SessionIndexMocks.updateStatus).toHaveBeenCalledWith(StatusEnum.DISCONNECTED, 'Login failed: server is full');
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledWith({ responseCode: Response_ResponseCode.RespServerFull });
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });

  it('a timed-out login fails with a no-response message and disconnects', () => {
    login(makeLoginOpts(), 'pw');
    invokeOnError(Response_ResponseCode.RespNotConnected, {}, CommandFailure.Timeout);
    expect(SessionIndexMocks.updateStatus).toHaveBeenCalledWith(StatusEnum.DISCONNECTED, 'Login failed: the server did not respond');
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledWith({});
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });

  it('a login cut off by a disconnect settles the form but leaves the status to the disconnect', () => {
    login(makeLoginOpts(), 'pw');
    invokeOnError(Response_ResponseCode.RespNotConnected, {}, CommandFailure.Disconnected);
    expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledTimes(1);
    expect(SessionIndexMocks.updateStatus).not.toHaveBeenCalled();
    expect(SessionIndexMocks.disconnect).not.toHaveBeenCalled();
  });
});

describe('register', () => {

  it('sends Command_Register with plain password when no salt', () => {
    register(makeRegisterOpts(), 'pw');
    expect(WebClient.instance.protobuf.sendSessionCommand).toHaveBeenCalledWith(
      Command_Register_ext,
      expect.objectContaining({ password: 'pw' }),
      expect.any(Object)
    );
  });

  it('uses hashedPassword when options.hashedPassword is set', () => {
    register(makeRegisterOpts({ hashedPassword: 'pre_hashed' }), 'pw');
    expect(WebClient.instance.protobuf.sendSessionCommand).toHaveBeenCalledWith(
      Command_Register_ext,
      expect.objectContaining({ hashedPassword: 'pre_hashed' }),
      expect.any(Object)
    );
  });

  it('RespRegistrationAccepted calls login without hashedPassword and registrationSuccess', () => {
    register(makeRegisterOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespRegistrationAccepted);
    expect(SessionIndexMocks.login).toHaveBeenCalledWith(
      expect.objectContaining({ hashedPassword: undefined }),
      'pw',
    );
    expect(WebClient.instance.response.session.registrationSuccess).toHaveBeenCalled();
  });

  it('RespRegistrationAccepted forwards hashedPassword to login', () => {
    register(makeRegisterOpts({ hashedPassword: 'pre_hashed' }), 'pw');
    invokeResponseCode(Response_ResponseCode.RespRegistrationAccepted);
    expect(SessionIndexMocks.login).toHaveBeenCalledWith(
      expect.objectContaining({ hashedPassword: 'pre_hashed' }),
      'pw',
    );
    expect(WebClient.instance.response.session.registrationSuccess).toHaveBeenCalled();
  });

  it('RespRegistrationAcceptedNeedsActivation calls accountAwaitingActivation without password in options', () => {
    register(makeRegisterOpts({ password: 'leaked' }), 'pw');
    invokeResponseCode(Response_ResponseCode.RespRegistrationAcceptedNeedsActivation);
    expect(WebClient.instance.response.session.accountAwaitingActivation).toHaveBeenCalledWith(
      expect.not.objectContaining({ password: expect.anything() })
    );
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });

  it('RespUserAlreadyExists calls registrationUserNameError', () => {
    register(makeRegisterOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespUserAlreadyExists);
    expect(WebClient.instance.response.session.registrationUserNameError).toHaveBeenCalled();
  });

  it('RespUsernameInvalid calls registrationUserNameError', () => {
    register(makeRegisterOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespUsernameInvalid);
    expect(WebClient.instance.response.session.registrationUserNameError).toHaveBeenCalled();
  });

  it('RespPasswordTooShort calls registrationPasswordError', () => {
    register(makeRegisterOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespPasswordTooShort);
    expect(WebClient.instance.response.session.registrationPasswordError).toHaveBeenCalled();
  });

  it('RespEmailRequiredToRegister calls registrationRequiresEmail', () => {
    register(makeRegisterOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespEmailRequiredToRegister);
    expect(WebClient.instance.response.session.registrationRequiresEmail).toHaveBeenCalled();
  });

  it('RespEmailBlackListed calls registrationEmailError', () => {
    register(makeRegisterOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespEmailBlackListed);
    expect(WebClient.instance.response.session.registrationEmailError).toHaveBeenCalled();
  });

  it('RespTooManyRequests reports the registration limit reason and expiry', () => {
    register(makeRegisterOpts(), 'pw');
    const raw = create(ResponseSchema, { responseCode: Response_ResponseCode.RespTooManyRequests });
    setExtension(raw, Response_Register_ext, create(Response_RegisterSchema, {
      deniedReasonStr: 'Registration rate limit exceeded', deniedEndTime: 9999n,
    }));
    invokeResponseCode(Response_ResponseCode.RespTooManyRequests, raw);
    expect(WebClient.instance.response.session.registrationFailed).toHaveBeenCalledWith(
      'Registration rate limit exceeded', 9999, Response_ResponseCode.RespTooManyRequests
    );
    expect(WebClient.instance.response.session.registrationEmailError).not.toHaveBeenCalled();
  });

  it('RespTooManyRequests without a reason reports the email account cap', () => {
    register(makeRegisterOpts(), 'pw');
    const raw = create(ResponseSchema, { responseCode: Response_ResponseCode.RespTooManyRequests });
    invokeResponseCode(Response_ResponseCode.RespTooManyRequests, raw);
    expect(WebClient.instance.response.session.registrationEmailError).toHaveBeenCalledWith('Max accounts reached for this email');
    expect(WebClient.instance.response.session.registrationFailed).not.toHaveBeenCalled();
  });

  it('RespRegistrationDisabled calls registrationFailed', () => {
    register(makeRegisterOpts(), 'pw');
    invokeResponseCode(Response_ResponseCode.RespRegistrationDisabled);
    expect(WebClient.instance.response.session.registrationFailed).toHaveBeenCalled();
  });

  it('RespUserIsBanned calls registrationFailed with deniedReasonStr and deniedEndTime', () => {
    register(makeRegisterOpts(), 'pw');
    const raw = create(ResponseSchema, { responseCode: Response_ResponseCode.RespUserIsBanned });
    setExtension(raw, Response_Register_ext, create(Response_RegisterSchema, {
      deniedReasonStr: 'bad user', deniedEndTime: 9999n,
    }));
    invokeResponseCode(Response_ResponseCode.RespUserIsBanned, raw);
    expect(WebClient.instance.response.session.registrationFailed).toHaveBeenCalledWith('bad user', 9999);
  });

  it('onError calls registrationFailed', () => {
    register(makeRegisterOpts(), 'pw');
    invokeOnError();
    expect(WebClient.instance.response.session.registrationFailed).toHaveBeenCalled();
  });

  it('a timed-out registration reports the missing response and disconnects', () => {
    register(makeRegisterOpts(), 'pw');
    invokeOnError(Response_ResponseCode.RespNotConnected, {}, CommandFailure.Timeout);
    expect(WebClient.instance.response.session.registrationFailed).toHaveBeenCalledWith('The server did not respond. Please try again.');
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });

  it('a registration cut off by a disconnect reports the lost connection without disconnecting again', () => {
    register(makeRegisterOpts(), 'pw');
    invokeOnError(Response_ResponseCode.RespNotConnected, {}, CommandFailure.Disconnected);
    expect(WebClient.instance.response.session.registrationFailed).toHaveBeenCalledWith('The connection to the server has been lost.');
    expect(SessionIndexMocks.updateStatus).not.toHaveBeenCalled();
    expect(SessionIndexMocks.disconnect).not.toHaveBeenCalled();
  });
});

describe('activate', () => {

  it('sends Command_Activate with userName and token, not password', () => {
    activate(makeActivateOpts(), 'pw');
    expect(WebClient.instance.protobuf.sendSessionCommand).toHaveBeenCalledWith(
      Command_Activate_ext,
      expect.objectContaining({ userName: 'alice', token: 'tok' }),
      expect.any(Object)
    );
    expect(WebClient.instance.protobuf.sendSessionCommand).toHaveBeenCalledWith(
      Command_Activate_ext,
      expect.not.objectContaining({ password: expect.anything() }),
      expect.any(Object)
    );
  });

  it('RespActivationAccepted calls accountActivationSuccess and forwards password+hashedPassword to login', () => {
    activate(makeActivateOpts(), 'pw', 'pre_hashed');
    invokeResponseCode(Response_ResponseCode.RespActivationAccepted);
    expect(WebClient.instance.response.session.accountActivationSuccess).toHaveBeenCalled();
    expect(SessionIndexMocks.login).toHaveBeenCalledWith(
      expect.objectContaining({ hashedPassword: 'pre_hashed' }),
      'pw',
    );
  });

  it('onError calls accountActivationFailed and disconnect', () => {
    activate(makeActivateOpts());
    invokeOnError();
    expect(WebClient.instance.response.session.accountActivationFailed).toHaveBeenCalled();
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });

  it('an activation cut off by a disconnect settles the dialog without disconnecting again', () => {
    activate(makeActivateOpts());
    invokeOnError(Response_ResponseCode.RespNotConnected, {}, CommandFailure.Disconnected);
    expect(WebClient.instance.response.session.accountActivationFailed).toHaveBeenCalledWith(CommandFailure.Disconnected);
    expect(SessionIndexMocks.updateStatus).not.toHaveBeenCalled();
    expect(SessionIndexMocks.disconnect).not.toHaveBeenCalled();
  });
});

describe('forgotPasswordChallenge', () => {

  it('sends Command_ForgotPasswordChallenge', () => {
    forgotPasswordChallenge(makeForgotChallengeOpts());
    expect(WebClient.instance.protobuf.sendSessionCommand).toHaveBeenCalledWith(
      Command_ForgotPasswordChallenge_ext, expect.any(Object), expect.any(Object)
    );
  });

  it('onSuccess calls resetPassword and disconnect', () => {
    forgotPasswordChallenge(makeForgotChallengeOpts());
    invokeOnSuccess();
    expect(WebClient.instance.response.session.resetPassword).toHaveBeenCalled();
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });

  it('onError calls resetPasswordFailed and disconnect', () => {
    forgotPasswordChallenge(makeForgotChallengeOpts());
    invokeOnError();
    expect(WebClient.instance.response.session.resetPasswordFailed).toHaveBeenCalled();
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });
});

describe('forgotPasswordRequest', () => {

  it('sends Command_ForgotPasswordRequest', () => {
    forgotPasswordRequest(makeForgotRequestOpts());
    expect(WebClient.instance.protobuf.sendSessionCommand).toHaveBeenCalledWith(
      Command_ForgotPasswordRequest_ext,
      expect.any(Object),
      expect.objectContaining({ responseExt: Response_ForgotPasswordRequest_ext })
    );
  });

  it('onSuccess with challengeEmail calls resetPasswordChallenge', () => {
    forgotPasswordRequest(makeForgotRequestOpts());
    const resp = { challengeEmail: true };
    invokeOnSuccess(resp, { responseCode: 0 });
    expect(WebClient.instance.response.session.resetPasswordChallenge).toHaveBeenCalled();
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });

  it('onSuccess without challengeEmail calls resetPassword', () => {
    forgotPasswordRequest(makeForgotRequestOpts());
    const resp = { challengeEmail: false };
    invokeOnSuccess(resp, { responseCode: 0 });
    expect(WebClient.instance.response.session.resetPassword).toHaveBeenCalled();
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });

  it('onError calls resetPasswordFailed and disconnect', () => {
    forgotPasswordRequest(makeForgotRequestOpts());
    invokeOnError();
    expect(WebClient.instance.response.session.resetPasswordFailed).toHaveBeenCalled();
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });
});

describe('forgotPasswordReset', () => {

  it('sends Command_ForgotPasswordReset with plain newPassword when no salt', () => {
    forgotPasswordReset(makeForgotResetOpts(), 'newpw');
    expect(WebClient.instance.protobuf.sendSessionCommand).toHaveBeenCalledWith(
      Command_ForgotPasswordReset_ext,
      expect.objectContaining({ newPassword: 'newpw' }),
      expect.any(Object)
    );
  });

  it('sends hashed new password when options.hashedNewPassword is set', () => {
    forgotPasswordReset({ ...makeForgotResetOpts(), hashedNewPassword: 'pre_hashed' }, 'newpw');
    expect(WebClient.instance.protobuf.sendSessionCommand).toHaveBeenCalledWith(
      Command_ForgotPasswordReset_ext,
      expect.objectContaining({ hashedNewPassword: 'pre_hashed' }),
      expect.any(Object)
    );
  });

  it('onSuccess calls resetPasswordSuccess and disconnect', () => {
    forgotPasswordReset(makeForgotResetOpts(), 'newpw');
    invokeOnSuccess();
    expect(WebClient.instance.response.session.resetPasswordSuccess).toHaveBeenCalled();
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });

  it('onError calls resetPasswordFailed and disconnect', () => {
    forgotPasswordReset(makeForgotResetOpts(), 'newpw');
    invokeOnError();
    expect(WebClient.instance.response.session.resetPasswordFailed).toHaveBeenCalled();
    expect(SessionIndexMocks.disconnect).toHaveBeenCalled();
  });
});

describe('requestPasswordSalt', () => {

  it('sends Command_RequestPasswordSalt', () => {
    const onSaltReceived = vi.fn();
    const onFailure = vi.fn();
    requestPasswordSalt({ host: 'h', port: '1', userName: 'alice' }, onSaltReceived, onFailure);
    expect(WebClient.instance.protobuf.sendSessionCommand).toHaveBeenCalledWith(
      Command_RequestPasswordSalt_ext,
      expect.any(Object),
      expect.objectContaining({ responseExt: Response_PasswordSalt_ext })
    );
  });

  it('onSuccess passes the salt and all challenge parameters to callers', () => {
    const onSaltReceived = vi.fn();
    const onFailure = vi.fn();
    requestPasswordSalt({ host: 'h', port: '1', userName: 'alice' }, { onResponse: onSaltReceived }, onFailure);
    const resp = {
      passwordSalt: 'salt123', n: 1024, r: 8, p: 1,
      nonce: new Uint8Array([0, 128, 255]), needsMigration: true, scryptSalt: 'c2FsdA==',
    };
    invokeOnSuccess(resp, { responseCode: 0 });
    expect(onSaltReceived).toHaveBeenCalledWith(resp);
  });

  it('onResponseCode RespRegistrationRequired calls updateStatus and onFailure', () => {
    const onSaltReceived = vi.fn();
    const onFailure = vi.fn();
    requestPasswordSalt({ host: 'h', port: '1', userName: 'alice' }, onSaltReceived, onFailure);
    invokeResponseCode(Response_ResponseCode.RespRegistrationRequired);
    expect(SessionIndexMocks.updateStatus).toHaveBeenCalledWith(StatusEnum.DISCONNECTED, expect.any(String));
    expect(onFailure).toHaveBeenCalledWith(undefined, Response_ResponseCode.RespRegistrationRequired);
  });

  it('passes a rejection code from the server to onFailure', () => {
    const onFailure = vi.fn();
    requestPasswordSalt({ host: 'h', port: '1', userName: 'alice' }, vi.fn(), onFailure);
    invokeOnError(Response_ResponseCode.RespContextError);
    expect(onFailure).toHaveBeenCalledWith(undefined, Response_ResponseCode.RespContextError);
  });

  it('onError calls updateStatus DISCONNECTED and onFailure', () => {
    const onSaltReceived = vi.fn();
    const onFailure = vi.fn();
    requestPasswordSalt({ host: 'h', port: '1', userName: 'alice' }, onSaltReceived, onFailure);
    invokeOnError();
    expect(SessionIndexMocks.updateStatus).toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalled();
  });

  it('a timed-out salt request reports the missing response', () => {
    const onFailure = vi.fn();
    requestPasswordSalt({ host: 'h', port: '1', userName: 'alice' }, vi.fn(), onFailure);
    invokeOnError(Response_ResponseCode.RespNotConnected, {}, CommandFailure.Timeout);
    expect(SessionIndexMocks.updateStatus).toHaveBeenCalledWith(StatusEnum.DISCONNECTED, 'Login failed: the server did not respond');
    expect(onFailure).toHaveBeenCalled();
  });

  it('a salt request cut off by a disconnect only settles the caller', () => {
    const onFailure = vi.fn();
    requestPasswordSalt({ host: 'h', port: '1', userName: 'alice' }, vi.fn(), onFailure);
    invokeOnError(Response_ResponseCode.RespNotConnected, {}, CommandFailure.Disconnected);
    expect(SessionIndexMocks.updateStatus).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(CommandFailure.Disconnected);
  });
});

import type { TFunction } from 'i18next';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import { loginFailureMessage, type LoginRejection } from './loginFailureMessage';
import en from './Login.i18n.json';

const t = ((key: string, values: Record<string, unknown> = {}) => {
  const template = key.split('.').reduce<any>((node, part) => node?.[part], en);
  if (typeof template !== 'string') {
    throw new Error(`Missing translation ${key}`);
  }
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
}) as unknown as TFunction;

const message = (code: number, details: Partial<LoginRejection> = {}) => loginFailureMessage(t, {
  code,
  deniedEndTime: null,
  deniedReason: null,
  missingFeatures: [],
  ...details,
});

const END_TIME = 1800000000;
const UNTIL = new Date(END_TIME * 1000).toLocaleString();

describe('loginFailureMessage', () => {
  it.each([
    [Response_ResponseCode.RespWrongPassword, /^Incorrect username or password\. Please check/],
    [Response_ResponseCode.RespWouldOverwriteOldSession, /already an active session/],
    [Response_ResponseCode.RespRegistrationRequired, /requires user registration/],
    [Response_ResponseCode.RespClientIdRequired, /requires client IDs/],
    [Response_ResponseCode.RespContextError, /internal error/],
    [Response_ResponseCode.RespAccountNotActivated, /not been activated/],
    [Response_ResponseCode.RespServerFull, /maximum number of users/],
    [Response_ResponseCode.RespPasswordChangeRequired, /administrator has reset your password/],
  ])('explains code %s', (code, expected) => {
    expect(message(code)).toMatch(expected);
  });

  it('gives a ban its end time and reason', () => {
    expect(message(Response_ResponseCode.RespUserIsBanned, { deniedEndTime: END_TIME, deniedReason: 'Spamming' }))
      .toBe(`You are banned until ${UNTIL}. Reason: Spamming`);
  });

  it('reads a ban with no end time as indefinite and leaves out an empty reason', () => {
    expect(message(Response_ResponseCode.RespUserIsBanned, { deniedEndTime: 0, deniedReason: '' }))
      .toBe('You are banned indefinitely.');
  });

  it('adds a server reason to the login limit message', () => {
    expect(message(Response_ResponseCode.RespTooManyRequests, { deniedEndTime: END_TIME, deniedReason: 'Slow down' }))
      .toBe(`Too many login attempts. Please try again after ${UNTIL}. Reason: Slow down`);
  });

  it('names the features a server says are missing', () => {
    expect(message(Response_ResponseCode.RespClientUpdateRequired, { missingFeatures: ['one', 'two'] }))
      .toContain('Missing features: one, two.');
  });

  it('shows the server reason for a client update reply with no missing features', () => {
    expect(message(Response_ResponseCode.RespClientUpdateRequired, { deniedReason: 'Use a password' })).toBe('Use a password');
    expect(message(Response_ResponseCode.RespClientUpdateRequired)).toBe('The login did not complete.');
  });

  it('spells out the username rules from a seven part reason', () => {
    expect(message(Response_ResponseCode.RespUsernameInvalid, { deniedReason: '3|12|1|0|1|0|_.' })).toBe(
      'Invalid username. Your username must respect these rules: is 3 - 12 characters long; '
      + 'can contain lowercase characters; can NOT contain uppercase characters; can contain numeric characters; '
      + 'can contain the following punctuation: _.; first character can NOT be a punctuation mark.',
    );
  });

  it('adds banned words and expressions from a nine part reason', () => {
    const text = message(Response_ResponseCode.RespUsernameInvalid, { deniedReason: '3|12|1|1|1|1||bad,worse|^x' });
    expect(text).toContain('can not contain any of the following words: bad,worse');
    expect(text).toContain('can not match any of the following expressions: ^x');
    expect(text).toContain('first character can be a punctuation mark');
    expect(text).not.toContain('following punctuation');
  });

  it('lists server language rules line by line', () => {
    expect(message(Response_ResponseCode.RespUsernameInvalid, { deniedReason: '3|12|1|1|1|1||\nno slurs\nno ads|' }))
      .toContain('server rules: no slurs; no ads');
  });

  it('falls back to the basic rule when the reason cannot be read', () => {
    expect(message(Response_ResponseCode.RespUsernameInvalid, { deniedReason: 'nope' }))
      .toBe('Invalid username. You may only use A-Z, a-z, 0-9, _, ., and - in your username.');
  });

  it('names a reply it does not understand', () => {
    expect(message(9999)).toMatch(/^Unknown login error: 9999\./);
  });
});

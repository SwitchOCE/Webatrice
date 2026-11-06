import type { TFunction } from 'i18next';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';

export interface LoginRejection {
  code: number;
  deniedEndTime: number | null;
  deniedReason: string | null;
  missingFeatures: string[];
}

const FIXED_MESSAGE_KEYS: Partial<Record<number, string>> = {
  [Response_ResponseCode.RespPasswordChangeRequired]: 'Login.status.passwordChangeRequired',
  [Response_ResponseCode.RespServerFull]: 'Login.status.serverFull',
  [Response_ResponseCode.RespWrongPassword]: 'Login.status.wrongCredentials',
  [Response_ResponseCode.RespWouldOverwriteOldSession]: 'Login.status.activeSession',
  [Response_ResponseCode.RespRegistrationRequired]: 'Login.status.registrationRequired',
  [Response_ResponseCode.RespClientIdRequired]: 'Login.status.clientIdRequired',
  [Response_ResponseCode.RespContextError]: 'Login.status.contextError',
  [Response_ResponseCode.RespAccountNotActivated]: 'Login.status.accountNotActivated',
};

function deadline(seconds: number | null): string | null {
  const date = new Date((seconds ?? 0) * 1000);
  return seconds !== null && seconds > 0 && Number.isFinite(date.getTime()) ? date.toLocaleString() : null;
}

function withReason(t: TFunction, status: string, reason: string | null): string {
  return reason ? t('Login.status.withReason', { status, reason }) : status;
}

function invalidUsername(t: TFunction, reason: string | null): string {
  const title = t('Login.status.invalidUsername.title');
  const rules = (reason ?? '').split('|');
  if (rules.length !== 7 && rules.length !== 9) {
    return `${title} ${t('Login.status.invalidUsername.fallback')}`;
  }
  const [min, max, lowercase, uppercase, numeric, firstPunctuation, characters, words = '', expressions = ''] = rules;
  const allowed = (flag: string, yes: string, no: string) =>
    t(`Login.status.invalidUsername.${Number(flag) > 0 ? yes : no}`);
  const list = [
    t('Login.status.invalidUsername.length', { min, max }),
    allowed(lowercase, 'lowercase', 'noLowercase'),
    allowed(uppercase, 'uppercase', 'noUppercase'),
    allowed(numeric, 'numeric', 'noNumeric'),
    ...(characters ? [t('Login.status.invalidUsername.punctuation', { characters })] : []),
    allowed(firstPunctuation, 'firstPunctuation', 'noFirstPunctuation'),
  ];
  if (words.startsWith('\n')) {
    const serverRules = words.split('\n').filter(Boolean).join('; ');
    list.push(t('Login.status.invalidUsername.serverRules', { rules: serverRules }));
  } else if (words) {
    list.push(t('Login.status.invalidUsername.words', { words }));
  }
  if (expressions) {
    list.push(t('Login.status.invalidUsername.expressions', { expressions }));
  }
  return `${title} ${t('Login.status.invalidUsername.rules', { rules: list.join('; ') })}`;
}

export function loginFailureMessage(t: TFunction, rejection: LoginRejection): string {
  const { code, deniedEndTime, deniedReason, missingFeatures } = rejection;
  const until = deadline(deniedEndTime);
  switch (code) {
    case Response_ResponseCode.RespClientUpdateRequired:
      return missingFeatures.length > 0
        ? t('Login.status.missingFeatures', { features: missingFeatures.join(', ') })
        : deniedReason || t('Login.status.loginIncomplete');
    case Response_ResponseCode.RespTooManyRequests:
      return withReason(t, until
        ? t('Login.status.tooManyRequestsUntil', { until })
        : t('Login.status.tooManyRequests'), deniedReason);
    case Response_ResponseCode.RespUserIsBanned:
      return withReason(t, until
        ? t('Login.status.bannedUntil', { until })
        : t('Login.status.bannedIndefinitely'), deniedReason);
    case Response_ResponseCode.RespUsernameInvalid:
      return invalidUsername(t, deniedReason);
    default: {
      const key = FIXED_MESSAGE_KEYS[code];
      return key ? t(key) : t('Login.status.unknownError', { code });
    }
  }
}

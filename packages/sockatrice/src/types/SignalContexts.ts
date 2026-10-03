/**
 * Context preserved through the ACCOUNT_AWAITING_ACTIVATION signal so the
 * activation dialog can resubmit against the same host/user without re-entering them.
 */
export interface PendingActivationContext {
  host: string;
  port: string;
  userName: string;
}

/**
 * Payload for the LOGIN_SUCCESSFUL signal: what the UI needs to persist into the
 * selected host record (hashedPassword for "remember me"), and what it tells the user.
 */
export interface LoginSuccessContext {
  hashedPassword?: string;
  /**
   * Features the server supports that this client did not advertise in `clientfeatures`
   * (Response_Login.missing_features). Desktop offers to update when the list is non-empty.
   */
  missingFeatures?: string[];
}

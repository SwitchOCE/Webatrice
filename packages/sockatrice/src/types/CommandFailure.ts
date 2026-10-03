/**
 * Why a command ended without a server answer. Desktop answers every such
 * command with a synthesised `RespNotConnected` (RemoteClient::ping for an
 * expired PendingCommand, RemoteClient::doDisconnectFromServer for a dropped
 * connection); Sockatrice does the same and passes the reason alongside it so a
 * caller can tell "never sent" from "timed out" from "connection lost".
 */
export enum CommandFailure {
  /** The socket was not open, so nothing was sent. */
  NotSent = 'not-sent',
  /** No response arrived before the command's deadline. */
  Timeout = 'timeout',
  /** The connection closed (or began reconnecting) while the command was in flight. */
  Disconnected = 'disconnected',
}

import { WebClient } from '../WebClient';
import { CommandFailure } from '../types/CommandFailure';
import { StatusEnum } from '../types/StatusEnum';

/**
 * True when a command failure only says that the session the command belonged to has ended.
 * On DISCONNECTED the response layer resets for the ended session before the in-flight
 * commands are failed as `Disconnected` (WebClient's `onStatusChange`), so a failure reported
 * then would be stored in the next session's state. While RECONNECTING that state is kept, so
 * failures are still reported.
 */
export function outlivedSession(failure?: CommandFailure): boolean {
  return failure === CommandFailure.Disconnected && WebClient.instance.status === StatusEnum.DISCONNECTED;
}

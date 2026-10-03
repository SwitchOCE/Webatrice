import type { Event_ReplayAdded } from '../../generated';
import { replayList } from '../../commands/session';
import { WebClient } from '../../WebClient';

export function replayAdded({ matchInfo }: Event_ReplayAdded): void {
  // A moderator force-granting access or a redeemed share code arrives without
  // match info; desktop refreshes the whole list then (TabReplays::replayAddedEventReceived).
  if (!matchInfo) {
    replayList();
    return;
  }
  WebClient.instance.response.session.replayAdded(matchInfo);
}

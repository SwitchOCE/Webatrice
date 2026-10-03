import { ZoneName } from '@cockatrice/sockatrice';

import type { ZoneViewTarget } from '../../hooks/dialogs/gameDialogs.types';

/** Hidden zones hold no card data locally: a view of one lists the
 *  Response_DumpZone snapshot, dumped on open and dropped on close. */
export function isHiddenZone(zoneName: string): boolean {
  return zoneName === ZoneName.DECK || zoneName === ZoneName.SIDEBOARD;
}

/** A top / bottom N library view, which lists its cards in server order. */
export function isOrderedView(view: ZoneViewTarget): boolean {
  return view.zoneName === ZoneName.DECK && (view.numberCards ?? -1) !== -1;
}

/** Desktop offers "shuffle when closing" on a whole-library view only. */
export function offersShuffleOnClose(view: ZoneViewTarget): boolean {
  return view.zoneName === ZoneName.DECK && !isOrderedView(view);
}

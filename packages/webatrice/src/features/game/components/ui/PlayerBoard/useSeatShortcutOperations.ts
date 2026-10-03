import { ZoneName } from '@cockatrice/sockatrice';

import type { SeatSelection, SeatSelectionApi } from '../../../hooks/useSeatSelection';
import { applyPTDelta, parsePT } from '../../context-menus/CardContextMenu/cardAttributeEdits';
import { selectedHiddenZoneCards } from '../../context-menus/CardContextMenu/handCardMenu.actions';
import { useGameDialogsContext } from '../GameDialogsContext';
import { usePublishSeatShortcuts, type SeatShortcutOperations } from '../SeatShortcutsContext';
import { MAX_COUNTER_VALUE } from './counterLimits';
import type {
  BattlefieldCardViewModel,
  PlayerCardCommands,
  PlayerCounterCommands,
  PlayerCounterViewModel,
  PlayerTargetCommands,
  PlayerZoneCommands,
} from './playerBoard.types';
import type { usePendingArrows } from './usePendingArrows';
import type { SeatCardMeta } from './useSeatCardMetadata';
import { toRecipient } from './revealRecipient';
import type { LifeControl, useSeatPrompts } from './useSeatPrompts';

type SeatPrompts = ReturnType<typeof useSeatPrompts>;
type PendingArrows = ReturnType<typeof usePendingArrows>;

export interface UseSeatShortcutOperationsArgs {
  seatId: number;
  isSelf: boolean;
  selection: SeatSelection | null;
  setSelection: SeatSelectionApi['setSelection'];
  /** The game selection, which holds a library / sideboard view's selected cards. */
  selectedCardKeys: ReadonlySet<string>;
  battlefieldDisplayList: readonly BattlefieldCardViewModel[];
  cardMetaByName: ReadonlyMap<string, SeatCardMeta>;
  deckCount: number;
  alwaysRevealTopCard: boolean;
  alwaysLookAtTopCard: boolean;
  manaCounters: PlayerCounterViewModel['mana'];
  lifeControl: LifeControl | undefined;
  lastToken: SeatPrompts['lastToken'];
  openLifePrompt: SeatPrompts['openLifePrompt'];
  openCounterPrompt: SeatPrompts['openCounterPrompt'];
  openAnnotationPrompt: SeatPrompts['openAnnotationPrompt'];
  openPTPrompt: SeatPrompts['openPTPrompt'];
  openViewLibraryCountPrompt: SeatPrompts['openViewLibraryCountPrompt'];
  openCardCounterPrompt: SeatPrompts['openCardCounterPrompt'];
  openCreateTokenDialog: SeatPrompts['openCreateTokenDialog'];
  openMoveTopUntilDialog: () => void;
  setAttachPending: PendingArrows['setAttachPending'];
  setAttachExtraSourceIds: PendingArrows['setAttachExtraSourceIds'];
  setDrawArrowPending: PendingArrows['setDrawArrowPending'];
  zoneCommands: PlayerZoneCommands;
  cardCommands: PlayerCardCommands;
  counterCommands: PlayerCounterCommands;
  targetCommands: PlayerTargetCommands;
}

/**
 * The seat's keyboard actions (desktop's player shortcuts): useGameShortcuts
 * owns the key bindings and runs these for the local seat only, through
 * SeatShortcutsContext. Most act on the seat's battlefield selection.
 */
export function useSeatShortcutOperations({
  seatId,
  isSelf,
  selection,
  setSelection,
  selectedCardKeys,
  battlefieldDisplayList,
  cardMetaByName,
  deckCount,
  alwaysRevealTopCard,
  alwaysLookAtTopCard,
  manaCounters,
  lifeControl,
  lastToken,
  openLifePrompt,
  openCounterPrompt,
  openAnnotationPrompt,
  openPTPrompt,
  openViewLibraryCountPrompt,
  openCardCounterPrompt,
  openCreateTokenDialog,
  openMoveTopUntilDialog,
  setAttachPending,
  setAttachExtraSourceIds,
  setDrawArrowPending,
  zoneCommands,
  cardCommands,
  counterCommands,
  targetCommands,
}: UseSeatShortcutOperationsArgs) {
  const { handleRequestChooseMulligan } = useGameDialogsContext();

  // Seat-scoped shortcut operations. useGameShortcuts owns the key bindings
  // and runs these for the local seat only (see SeatShortcutsContext).
  const seatShortcuts: SeatShortcutOperations = {};

  // Desktop aMulligan (Ctrl+M) prompts for the hand size instead of assuming
  // seven; aSet (Ctrl+L) opens the set-life prompt; aRemoveLocalArrows
  // (Ctrl+R) deletes every arrow this player drew, one Command_DeleteArrow
  // each, and never touches other players' arrows.
  seatShortcuts['game.mulligan'] = () => handleRequestChooseMulligan();
  seatShortcuts['game.setLife'] = () => openLifePrompt();
  seatShortcuts['game.removeLocalArrows'] = () => targetCommands.clearOwnArrows();

  // Cockatrice-parity Toggle Skip Untapping (Alt+U). Acts on the
  // local marquee `selection` (same state the right-click menu reads
  // via `targetIds`). Uses the first selected card as the "clicked card"
  // to drive the target value, matching the menu's behavior for a
  // mixed selection (all cards land in the same doesntUntap state).
  seatShortcuts['game.doesntUntap'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    const target = !selectedCards[0].doesntUntap;
    for (const bc of selectedCards) {
      const id = Number(bc.id);
      if (!Number.isFinite(id)) {
        continue;
      }
      cardCommands.setDoesntUntap(id, target);
    }
  };

  // Put top cards on stack until… (Ctrl+Shift+Y). Opens the dialog.
  seatShortcuts['game.moveTopUntil'] = () => {
    if (!isSelf || deckCount <= 0) {
      return;
    }
    openMoveTopUntilDialog();
  };

  // Deck-flip toggles (Ctrl+Alt+N / Ctrl+Alt+Shift+N). Cockatrice
  // defaults collide with Chromium's new-window / new-incognito, so
  // we rebind. Toggles the corresponding zone property.
  seatShortcuts['game.alwaysRevealTopCard'] = () => {
    if (!isSelf) {
      return;
    }
    zoneCommands.setAlwaysRevealTopCard(!alwaysRevealTopCard);
  };
  seatShortcuts['game.alwaysLookAtTopCard'] = () => {
    if (!isSelf) {
      return;
    }
    zoneCommands.setAlwaysLookAtTopCard(!alwaysLookAtTopCard);
  };

  // View top/bottom cards of library (Ctrl+Alt+W / Ctrl+Alt+Shift+W).
  // Rebound from Ctrl+W / Ctrl+Shift+W (browser close-tab / close-window).
  seatShortcuts['game.viewTopCards'] = () => {
    if (!isSelf || deckCount <= 0) {
      return;
    }
    openViewLibraryCountPrompt({ isReversed: false, deckSize: deckCount });
  };
  seatShortcuts['game.viewBottomCards'] = () => {
    if (!isSelf || deckCount <= 0) {
      return;
    }
    openViewLibraryCountPrompt({ isReversed: true, deckSize: deckCount });
  };

  // Create token (Ctrl+K, rebound from Cockatrice's Ctrl+T).
  seatShortcuts['game.createToken'] = () => {
    if (!isSelf) {
      return;
    }
    openCreateTokenDialog();
  };

  // Create another token (Ctrl+G) — re-fires the last submitted token.
  seatShortcuts['game.createAnotherToken'] = () => {
    if (!isSelf || !lastToken) {
      return;
    }
    cardCommands.createToken(lastToken);
  };

  // Draw Arrow (Alt+A). Same shape as Attach: first selected card
  // becomes the source, next battlefield click resolves.
  seatShortcuts['game.drawArrow'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const source = battlefieldDisplayList.find((bc) => selection.ids.has(bc.id));
    if (!source) {
      return;
    }
    const sourceCardId = Number(source.id);
    if (!Number.isFinite(sourceCardId)) {
      return;
    }
    setDrawArrowPending({
      sourceCardId,
      sourceCardName: source.name,
      sourceZone: ZoneName.TABLE,
    });
  };

  // Reset Power/Toughness (Ctrl+Alt+0). Same per-card logic as the
  // menu path at line ~10036: face-down → empty PT, face-up →
  // Scryfall printed base. Skips cards already at their reset value.
  seatShortcuts['game.resetPT'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targets = battlefieldDisplayList.filter((bc) => selection.ids.has(bc.id));
    if (targets.length === 0) {
      return;
    }
    const entries: { cardId: number; pt: string }[] = [];
    for (const bc of targets) {
      const bcId = Number(bc.id);
      if (!Number.isFinite(bcId)) {
        continue;
      }
      const base = bc.faceDown ? '' : cardMetaByName.get(bc.name)?.pt ?? '';
      if (base !== (bc.pt ?? '')) {
        entries.push({ cardId: bcId, pt: base });
      }
    }
    if (entries.length > 0) {
      cardCommands.setPT(entries);
    }
  };

  // Reduce Life by Power (Ctrl+Shift+L). Sums the server-set power
  // of every selected battlefield card and subtracts from local
  // player's life. Mirrors the menu path at line ~10093.
  seatShortcuts['game.reduceLifeByPower'] = () => {
    if (!isSelf || !lifeControl || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targets = battlefieldDisplayList.filter((bc) => selection.ids.has(bc.id));
    if (targets.length === 0) {
      return;
    }
    let total = 0;
    for (const bc of targets) {
      if (!bc.pt) {
        continue;
      }
      const tokens = parsePT(bc.pt);
      if (tokens.length === 0) {
        continue;
      }
      const first = tokens[0];
      const power = typeof first === 'number' ? first : parseInt(first, 10);
      if (Number.isFinite(power)) {
        total += Math.max(power, 0);
      }
    }
    if (total > 0) {
      lifeControl.onDelta(-total);
    }
  };

  // Storm ("Other") player counter shortcuts (Ctrl+] / Ctrl+[ / Ctrl+\).
  // Player-scoped, unlike the per-card counter shortcuts above.
  // Storm's server-assigned counterId lives on manaCounters.O — no-op
  // until Redux has hydrated the mana pool.
  seatShortcuts['game.addStormCounter'] = () => {
    if (!isSelf || !manaCounters?.O) {
      return;
    }
    counterCommands.increment(manaCounters.O.id, 1);
  };
  seatShortcuts['game.removeStormCounter'] = () => {
    if (!isSelf || !manaCounters?.O) {
      return;
    }
    counterCommands.increment(manaCounters.O.id, -1);
  };
  seatShortcuts['game.setStormCounter'] = () => {
    if (!isSelf || !manaCounters?.O) {
      return;
    }
    openCounterPrompt({
      counterId: manaCounters.O.id,
      label: 'Other',
      currentValue: manaCounters.O.count,
    });
  };

  // Attach Card (Ctrl+Alt+A). Starts the pending attach-arrow flow.
  // Cockatrice attaches every selected card to the target on
  // completion — the first selected card drives the visual anchor
  // (arrow origin + green ring), the rest ride along via
  // `attachExtraSourceIds`. Escape or clicking any source cancels.
  seatShortcuts['game.attachCard'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const sources = battlefieldDisplayList
      .filter((bc) => selection.ids.has(bc.id))
      .map((bc) => ({ id: Number(bc.id), name: bc.name }))
      .filter((s) => Number.isFinite(s.id));
    if (sources.length === 0) {
      return;
    }
    const [primary, ...extras] = sources;
    setAttachPending({ sourceCardId: primary.id, sourceCardName: primary.name });
    setAttachExtraSourceIds(extras.map((s) => s.id));
  };

  // Peek Card (Alt+L). Reveals face-down battlefield cards in the
  // selection to the local player only. Mirrors the "Peek card" menu
  // item — filters to face-down cards so face-up ones in a mixed
  // selection aren't wire-noise. No-op with an empty selection or
  // when no selected card is face-down.
  seatShortcuts['game.peekCard'] = () => {
    if (!isSelf || !cardCommands.peek || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const ids = battlefieldDisplayList
      .filter((bc) => selection.ids.has(bc.id) && bc.faceDown)
      .map((bc) => Number(bc.id))
      .filter((n) => Number.isFinite(n));
    if (ids.length === 0) {
      return;
    }
    cardCommands.peek(ids);
  };

  // Turn Card Over (Alt+F). Same shape as doesntUntap above: read the
  // local marquee selection, use the first card's current faceDown to
  // drive the target, then fire cardCommands.flip per card. Matches the
  // right-click "Flip card" menu item at line ~9011.
  seatShortcuts['game.flipCard'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    const target = !selectedCards[0].faceDown;
    for (const bc of selectedCards) {
      const id = Number(bc.id);
      if (!Number.isFinite(id)) {
        continue;
      }
      cardCommands.flip(id, target);
    }
  };

  // Unattach (Ctrl+Alt+U). Fires per-card unattach on the selection;
  // matches the "Unattach" menu item at line ~9295. Server no-ops on
  // non-attached cards so we don't pre-filter.
  seatShortcuts['game.unattachCard'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    for (const bc of selectedCards) {
      const id = Number(bc.id);
      if (!Number.isFinite(id)) {
        continue;
      }
      targetCommands.unattach(id);
    }
  };

  // Move selection → Graveyard (Ctrl+Del). Single batched
  // Command_MoveCard with cards_to_move for every selected card,
  // matching the "Send to Graveyard" menu path via dispatchMove.
  seatShortcuts['game.moveSelectedToGrave'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targetIds = battlefieldDisplayList
      .filter((bc) => selection.ids.has(bc.id))
      .map((bc) => Number(bc.id))
      .filter((n) => Number.isFinite(n));
    if (targetIds.length === 0) {
      return;
    }
    zoneCommands.moveCards(ZoneName.TABLE, targetIds, { zone: ZoneName.GRAVE, reversed: false });
  };

  // Set Power/Toughness (Ctrl+P). Opens the PT modal against the
  // selection. First-selected card drives cardName / current-PT for
  // the modal label + prefill, matching the menu path at line ~9287
  // (which uses the right-clicked card for the same purpose).
  seatShortcuts['game.setCardPT'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    const targetIds = selectedCards
      .map((bc) => Number(bc.id))
      .filter((n) => Number.isFinite(n));
    if (targetIds.length === 0) {
      return;
    }
    const first = selectedCards[0];
    const current = first.pt || (cardMetaByName.get(first.name)?.pt ?? '');
    openPTPrompt({ targetIds, cardName: first.name, current });
  };

  // Shared helper for the P/T delta shortcuts (Ctrl/Alt/Ctrl+Alt with
  // `+`/`-`). Same per-card logic as the menu's dispatchPTDelta at
  // line ~9110: each card computes its OWN new PT from its OWN current
  // server PT (falling back to Scryfall base, then '0/0' for empties),
  // so a mixed selection doesn't get truncated to one card's stats.
  const dispatchPTDeltaForSelection = (dp: number, dt: number) => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    const entries: { cardId: number; pt: string }[] = [];
    for (const bc of selectedCards) {
      const bcId = Number(bc.id);
      if (!Number.isFinite(bcId)) {
        continue;
      }
      const bcCurrent = bc.pt || (cardMetaByName.get(bc.name)?.pt ?? '');
      const base = bcCurrent || '0/0';
      entries.push({ cardId: bcId, pt: applyPTDelta(base, dp, dt) });
    }
    if (entries.length > 0) {
      cardCommands.setPT(entries);
    }
  };

  seatShortcuts['game.incP'] = () => dispatchPTDeltaForSelection(1, 0);
  seatShortcuts['game.decP'] = () => dispatchPTDeltaForSelection(-1, 0);
  seatShortcuts['game.incT'] = () => dispatchPTDeltaForSelection(0, 1);
  seatShortcuts['game.decT'] = () => dispatchPTDeltaForSelection(0, -1);
  seatShortcuts['game.incPT'] = () => dispatchPTDeltaForSelection(1, 1);
  seatShortcuts['game.decPT'] = () => dispatchPTDeltaForSelection(-1, -1);

  // Select All (Ctrl+A) — mirrors the "Select All" battlefield-menu
  // item at line ~8910: sets the local marquee selection to every
  // battlefield card. First-pass simplification of Cockatrice's
  // mouse-under-zone semantics (own battlefield only).
  seatShortcuts['game.selectAllBattlefield'] = () => {
    if (!isSelf) {
      return;
    }
    const ids = new Set(battlefieldDisplayList.map((bc) => bc.id));
    if (ids.size === 0) {
      return;
    }
    setSelection({ zone: 'battlefield', ids });
  };

  // Select Row / Column (Ctrl+Shift+X / Ctrl+Shift+C). First card in
  // the current selection is the anchor; expand to every battlefield
  // card matching its slot.row or slot.col. Mirrors onSelectRow at
  // line ~9507 (the menu path uses the right-clicked card as anchor).
  const selectBattlefieldBySlotField = (field: 'row' | 'col') => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const anchor = battlefieldDisplayList.find((bc) => selection.ids.has(bc.id));
    if (!anchor) {
      return;
    }
    const anchorValue = anchor.slot[field];
    const ids = new Set(
      battlefieldDisplayList
        .filter((bc) => bc.slot[field] === anchorValue)
        .map((bc) => bc.id),
    );
    if (ids.size === 0) {
      return;
    }
    setSelection({ zone: 'battlefield', ids });
  };

  seatShortcuts['game.selectRowBattlefield'] = () => selectBattlefieldBySlotField('row');
  seatShortcuts['game.selectColumnBattlefield'] = () => selectBattlefieldBySlotField('col');

  // Card-counter shortcuts. Cockatrice ships Add / Remove / Set for
  // three default counter types (A red = 0, B yellow = 1, C green = 2).
  // All three helpers operate on the current battlefield selection
  // (no-op when empty). Add / Remove drive `counterCommands.setCardCounters`
  // with per-card cur ± 1 (clamped to [0, MAX_COUNTER_VALUE]); Set
  // opens the same modal the card-menu Set item uses (line ~9630),
  // anchored on the first selected card for name / counterLetter /
  // currentValue prefill.
  const addCardCounterOnSelection = (counterId: number) => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targets = battlefieldDisplayList.filter((bc) => selection.ids.has(bc.id));
    if (targets.length === 0) {
      return;
    }
    const entries: { cardId: number; counterId: number; value: number }[] = [];
    for (const bc of targets) {
      const bcId = Number(bc.id);
      if (!Number.isFinite(bcId)) {
        continue;
      }
      const cur = bc.counters?.find((cc) => cc.id === counterId)?.value ?? 0;
      if (cur >= MAX_COUNTER_VALUE) {
        continue;
      }
      entries.push({ cardId: bcId, counterId, value: cur + 1 });
    }
    if (entries.length > 0) {
      counterCommands.setCardCounters(entries);
    }
  };

  const removeCardCounterOnSelection = (counterId: number) => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targets = battlefieldDisplayList.filter((bc) => selection.ids.has(bc.id));
    if (targets.length === 0) {
      return;
    }
    const entries: { cardId: number; counterId: number; value: number }[] = [];
    for (const bc of targets) {
      const bcId = Number(bc.id);
      if (!Number.isFinite(bcId)) {
        continue;
      }
      const cur = bc.counters?.find((cc) => cc.id === counterId)?.value ?? 0;
      if (cur <= 0) {
        continue;
      }
      entries.push({ cardId: bcId, counterId, value: cur - 1 });
    }
    if (entries.length > 0) {
      counterCommands.setCardCounters(entries);
    }
  };

  const openCardCounterPromptForSelection = (counterId: number) => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targets = battlefieldDisplayList.filter((bc) => selection.ids.has(bc.id));
    if (targets.length === 0) {
      return;
    }
    const targetIds = targets.map((bc) => Number(bc.id)).filter((n) => Number.isFinite(n));
    if (targetIds.length === 0) {
      return;
    }
    const first = targets[0];
    const currentValue = first.counters?.find((cc) => cc.id === counterId)?.value ?? 0;
    openCardCounterPrompt({ targetIds, cardName: first.name, counterId, currentValue });
  };

  seatShortcuts['game.addCounterA'] = () => addCardCounterOnSelection(0);
  seatShortcuts['game.removeCounterA'] = () => removeCardCounterOnSelection(0);
  seatShortcuts['game.setCounterA'] = () => openCardCounterPromptForSelection(0);
  seatShortcuts['game.addCounterB'] = () => addCardCounterOnSelection(1);
  seatShortcuts['game.removeCounterB'] = () => removeCardCounterOnSelection(1);
  seatShortcuts['game.setCounterB'] = () => openCardCounterPromptForSelection(1);
  seatShortcuts['game.addCounterC'] = () => addCardCounterOnSelection(2);
  seatShortcuts['game.removeCounterC'] = () => removeCardCounterOnSelection(2);
  seatShortcuts['game.setCounterC'] = () => openCardCounterPromptForSelection(2);

  // Increment all card counters (Ctrl+Shift+A). Ports the utility-menu
  // handler at line ~6377: selection ∩ battlefield if any, else full
  // battlefield; for each targeted card, bump every EXISTING counter
  // by +1 (skips counters already at MAX_COUNTER_VALUE). Silently
  // no-ops cards without counters — matches Cockatrice desktop, which
  // only touches counters that already exist.
  seatShortcuts['game.incrementAllCardCounters'] = () => {
    if (!isSelf) {
      return;
    }
    const targets =
      selection?.zone === 'battlefield' && selection.ids.size > 0
        ? battlefieldDisplayList.filter((c) => selection.ids.has(c.id))
        : battlefieldDisplayList;
    const entries: { cardId: number; counterId: number; value: number }[] = [];
    for (const card of targets) {
      const cardIdNum = Number(card.id);
      if (!Number.isFinite(cardIdNum)) {
        continue;
      }
      for (const counter of card.counters ?? []) {
        if (counter.value >= MAX_COUNTER_VALUE) {
          continue;
        }
        entries.push({ cardId: cardIdNum, counterId: counter.id, value: counter.value + 1 });
      }
    }
    if (entries.length > 0) {
      counterCommands.setCardCounters(entries);
    }
  };

  // Set Annotation (Alt+N). Same shape as Set Power/Toughness above:
  // open the annotation modal against the selection with the first
  // card's name + current annotation for the label / prefill.
  seatShortcuts['game.setAnnotation'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    const targetIds = selectedCards
      .map((bc) => Number(bc.id))
      .filter((n) => Number.isFinite(n));
    if (targetIds.length === 0) {
      return;
    }
    const first = selectedCards[0];
    openAnnotationPrompt({ targetIds, cardName: first.name, current: first.annotation ?? '' });
  };

  // Move selection → Bottom of Library (Ctrl+B). Same shape as
  // moveSelectedToGrave; targetZone=DECK with isReversed=true is the
  // "bottom" idiom (matches the card menu's Move to > Bottom of library).
  seatShortcuts['game.moveSelectedToLibraryBottom'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targetIds = battlefieldDisplayList
      .filter((bc) => selection.ids.has(bc.id))
      .map((bc) => Number(bc.id))
      .filter((n) => Number.isFinite(n));
    if (targetIds.length === 0) {
      return;
    }
    zoneCommands.moveCards(ZoneName.TABLE, targetIds, { zone: ZoneName.DECK, reversed: true });
  };

  // Reveal Selected Cards to All Players (desktop aRevealToAll, unbound by
  // default): one Command_RevealCards, no player_id, for the selected cards
  // of one hidden zone of this seat — the hand, or an open library /
  // sideboard view (the card menu's "Reveal to... > All players").
  seatShortcuts['game.revealSelectedToAll'] = () => {
    const picked = isSelf ? selectedHiddenZoneCards(seatId, selection, selectedCardKeys) : null;
    if (picked) {
      zoneCommands.reveal(picked.zone, toRecipient(-1), { cardIds: picked.cardIds });
    }
  };

  // Clone Card (Ctrl+J). Fires one Command_CreateToken per selected
  // card via cardCommands.clone, preserving each card's own name / provider /
  // color / pt / annotation / row. Matches the "Clone" menu item at
  // line ~9085 exactly (including the optimistic-mock skip).
  seatShortcuts['game.cloneCard'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    for (const bc of selectedCards) {
      if (!Number.isFinite(Number(bc.id))) {
        continue;
      }
      cardCommands.clone({
        name: bc.name,
        providerId: bc.scryfallId,
        color: bc.color ?? '',
        pt: bc.pt ?? '',
        annotation: bc.annotation ?? '',
        y: bc.slot.row,
      });
    }
  };

  usePublishSeatShortcuts(isSelf ? seatShortcuts : null);
}

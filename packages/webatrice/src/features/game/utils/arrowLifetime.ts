import { Phase } from '@cockatrice/datatrice';
import { getPreferencesSnapshot } from '@app/hooks';

/**
 * The last phase of each phase's group: the beginning phase (untap, upkeep, draw), the combat
 * phase (beginning of combat to end of combat), and the two main phases and the end step on
 * their own. Desktop derives the same groups from the phase colours (Phases::getLastSubphase).
 */
const LAST_SUBPHASE: Readonly<Record<Phase, Phase>> = {
  [Phase.Untap]: Phase.Draw,
  [Phase.Upkeep]: Phase.Draw,
  [Phase.Draw]: Phase.Draw,
  [Phase.FirstMain]: Phase.FirstMain,
  [Phase.BeginCombat]: Phase.EndCombat,
  [Phase.DeclareAttackers]: Phase.EndCombat,
  [Phase.DeclareBlockers]: Phase.EndCombat,
  [Phase.CombatDamage]: Phase.EndCombat,
  [Phase.EndCombat]: Phase.EndCombat,
  [Phase.SecondMain]: Phase.SecondMain,
  [Phase.EndCleanup]: Phase.EndCleanup,
};

/**
 * `Command_CreateArrow.delete_in_phase` for an arrow drawn now (desktop CardItem::drawArrow).
 *
 * Servatrice deletes an arrow when the game moves to a phase before the one it was drawn in, or
 * to its deletion phase or later; without the field, that is the next phase change. With "Do
 * not delete arrows inside of subphases" on (desktop's default), the arrow lives until the phase
 * after its group: an arrow drawn while declaring attackers lasts through combat damage. Off, or
 * outside a known phase, the field is left unset.
 */
export function arrowDeleteInPhase(activePhase: number | undefined, keepInSubphases: boolean): number | undefined {
  if (!keepInSubphases || activePhase === undefined || !(activePhase in LAST_SUBPHASE)) {
    return undefined;
  }
  return LAST_SUBPHASE[activePhase as Phase] + 1;
}

/**
 * The lifetime fields for a `Command_CreateArrow` sent now, from the game's active phase and the
 * "Do not delete arrows inside of subphases" preference as it is at that moment.
 */
export function arrowLifetime(activePhase: number | undefined): { deleteInPhase?: number } {
  const deleteInPhase = arrowDeleteInPhase(activePhase, getPreferencesSnapshot().doNotDeleteArrowsInSubPhases);
  return deleteInPhase === undefined ? {} : { deleteInPhase };
}

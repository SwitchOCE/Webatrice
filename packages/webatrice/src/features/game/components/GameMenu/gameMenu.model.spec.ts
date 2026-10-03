import { buildGameMenuItems, type GameMenuModelArgs } from './gameMenu.model';

const args = (overrides: Partial<GameMenuModelArgs> = {}): GameMenuModelArgs => ({
  canAdvancePhase: true,
  canPassTurn: true,
  canRunNextPhaseAction: true,
  onNextPhase: vi.fn(),
  onNextPhaseAction: vi.fn(),
  onNextTurn: vi.fn(),
  onReverseTurn: vi.fn(),
  ...overrides,
});

const summary = (a: GameMenuModelArgs) =>
  buildGameMenuItems(a).map((e) => (e.kind === 'item' ? [e.id, e.shortcut, e.disabled] : '---'));

describe('buildGameMenuItems', () => {
  it('follows desktop order with each item on its own shortcut', () => {
    expect(summary(args())).toEqual([
      ['nextPhase', 'game.nextPhase', false],
      ['nextPhaseAction', 'game.nextPhaseAction', false],
      '---',
      ['nextTurn', 'game.endTurn', false],
      ['reverseTurn', 'game.reverseTurn', false],
    ]);
  });

  it('gates phase items on the phase gate and turn items on the turn gate', () => {
    expect(summary(args({ canAdvancePhase: false, canRunNextPhaseAction: false }))).toEqual([
      ['nextPhase', 'game.nextPhase', true],
      ['nextPhaseAction', 'game.nextPhaseAction', true],
      '---',
      ['nextTurn', 'game.endTurn', false],
      ['reverseTurn', 'game.reverseTurn', false],
    ]);
    expect(summary(args({ canPassTurn: false })).slice(3)).toEqual([
      ['nextTurn', 'game.endTurn', true],
      ['reverseTurn', 'game.reverseTurn', true],
    ]);
  });
});

// Exact card-menu trees for every seat card zone: own and opponent battlefield,
// own and opponent stack, and the graveyard / exile pile views. Labels, order,
// dividers, shortcut hints, check marks, counter swatches, disabled rows and
// every submenu are serialized, so moving the menu renderer or its state (refactor
// plan Phase 6, PB-09/PB-10) cannot change a menu without failing here.

import { act, fireEvent, screen } from '@testing-library/react';
import { makeCard } from '@cockatrice/datatrice/testing';

import { createMockWebClient, renderWithProviders } from '../../__test-utils__';
import {
  buildSeatGameState,
  cardEl,
  chooseMenuPath,
  dismissMenus,
  openContextMenu,
  openMenus,
  pileEl,
  type SeatGameSpec,
} from './__test-utils__/seatFixtures';
import Game from './Game';

vi.mock('../../hooks/useSettings');

vi.mock('../../services/cards/cardCatalog', () => {
  const unknown = (name: string) => ({ found: false, source: 'unknown', name, printings: [] });
  return {
    lookupCard: vi.fn(async (name: string) => unknown(name)),
    lookupCards: vi.fn(async (inputs: Array<string | { name: string }>) =>
      new Map(inputs.map((i) => {
        const name = typeof i === 'string' ? i : i.name;
        return [name, unknown(name)];
      }))),
    lookupCardsCached: vi.fn(async (names: string[]) => new Map(names.map((n) => [n, unknown(n)]))),
    fetchAllPrintings: vi.fn(async () => []),
  };
});

const BOLT = makeCard({ id: 10, name: 'Bolt', x: 3, y: 1 });
const MORPH = makeCard({ id: 12, name: 'Morph', x: 6, y: 1, faceDown: true, doesntUntap: true });
const BEAR = makeCard({ id: 20, name: 'Bear', x: 0, y: 0 });
const OWN_SPELL = makeCard({ id: 50, name: 'Counterspell' });
const THEIR_SPELL = makeCard({ id: 51, name: 'Shock' });
const OWN_GRAVE = makeCard({ id: 40, name: 'Duress' });
const OWN_EXILE = makeCard({ id: 42, name: 'Rest' });
const THEIR_GRAVE = makeCard({ id: 41, name: 'Thoughtseize' });

const SPEC: SeatGameSpec = {
  localPlayerId: 1,
  activePlayerId: 1,
  seats: [
    { playerId: 1, table: [BOLT, MORPH], stack: [OWN_SPELL], grave: [OWN_GRAVE], exile: [OWN_EXILE], hand: [], deckCount: 40 },
    { playerId: 2, table: [BEAR], stack: [THEIR_SPELL], grave: [THEIR_GRAVE], handCount: 5, deckCount: 33 },
  ],
};

function renderSeats() {
  return renderWithProviders(<Game />, { preloadedState: buildSeatGameState(SPEC), webClient: createMockWebClient() });
}

/** The rows of one menu popup: buttons and divider lines, in order. */
function menuRows(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.children).flatMap((child) => {
    if (child instanceof HTMLButtonElement) {
      return [child];
    }
    const button = child.querySelector(':scope > button');
    return [(button as HTMLElement | null) ?? (child as HTMLElement)];
  });
}

/**
 * One line per row, submenus indented beneath their parent:
 * `[✓] [●hsl(...)] Label  ⟨shortcut⟩  (disabled)  ▶`, `---` for a divider.
 */
function serializeMenu(menu: HTMLElement, depth = 0): string[] {
  const pad = '  '.repeat(depth);
  const lines: string[] = [];
  for (const row of menuRows(menu)) {
    if (!(row instanceof HTMLButtonElement)) {
      lines.push(`${pad}---`);
      continue;
    }
    const label = row.querySelector('span.flex-1')?.textContent?.trim() ?? '';
    const spans = Array.from(row.querySelectorAll('span'));
    const swatch = spans.find((s) => s.classList.contains('rounded-full'))?.style.background;
    const checked = spans.some((s) => s.textContent === '✓');
    const hasSubmenu = spans.some((s) => s.textContent === '▶');
    const shortcut = spans
      .find((s) => s.classList.contains('text-xs') && s.textContent !== '▶' && s.textContent !== '✓')
      ?.textContent?.trim();
    const parts = [
      checked ? '✓ ' : '',
      swatch ? `●${swatch} ` : '',
      label,
      shortcut ? `  ⟨${shortcut}⟩` : '',
      row.disabled ? '  (disabled)' : '',
      hasSubmenu ? '  ▶' : '',
    ];
    lines.push(pad + parts.join(''));
    if (hasSubmenu) {
      act(() => {
        fireEvent.mouseEnter(row);
      });
      // One flyout is open at a time and it may reuse the previous one's node,
      // so take the newest menu that is not this one.
      const submenu = openMenus().filter((m) => m !== menu).at(-1);
      if (submenu) {
        lines.push(...serializeMenu(submenu, depth + 1));
      }
    }
  }
  return lines;
}

function menuTree(target: Element): string {
  return `\n${serializeMenu(openContextMenu(target)).join('\n')}\n`;
}

/** A card inside the open pile-view dialog (the board pile shows only its top card). */
function pileViewCard(cardId: number): HTMLElement {
  const matches = document.querySelectorAll<HTMLElement>(`[data-card][data-card-id="${cardId}"]`);
  return matches[matches.length - 1];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('seat card menu trees', () => {
  it('own battlefield card, face up', async () => {
    renderSeats();
    expect(menuTree(cardEl(BOLT.id, 'battlefield'))).toMatchInlineSnapshot(`
      "
      Tap / Untap
      Skip untapping  ⟨Alt+U⟩
      Turn Over  ⟨Alt+F⟩
      ---
      Clone  ⟨Ctrl+J⟩
      Move to  ▶
        Top of library in random order
        X cards from the top of library...
        Bottom of library in random order  ⟨Ctrl+B⟩
        ---
        Table
        Hand
        ---
        Graveyard  ⟨Ctrl+Delete⟩
        Exile
      ---
      Attach to card...  ⟨Ctrl+Alt+A⟩
      Draw arrow...  ⟨Alt+A⟩
      ---
      Power / toughness  ▶
        Increase power  ⟨Ctrl+=⟩
        Decrease power  ⟨Ctrl+-⟩
        Increase power and decrease toughness
        ---
        Increase toughness  ⟨Alt+=⟩
        Decrease toughness  ⟨Alt+-⟩
        Decrease power and increase toughness
        ---
        Increase power and toughness  ⟨Ctrl+Alt+=⟩
        Decrease power and toughness  ⟨Ctrl+Alt+-⟩
        ---
        Set power and toughness...  ⟨Ctrl+P⟩
        Reset power and toughness  ⟨Ctrl+Alt+0⟩
      Set annotation...  ⟨Alt+N⟩
      ---
      Reduce life by power  ⟨Ctrl+Shift+L⟩
      ---
      Select All  ⟨Ctrl+A⟩
      Select Row  ⟨Ctrl+Shift+X⟩
      ---
      Card counters  ▶
        ●rgb(224, 133, 133) Add counter (A)  ⟨Alt+.⟩
        ●rgb(224, 133, 133) Set counters (A)...  ⟨Alt+/⟩
        ---
        ●rgb(224, 224, 133) Add counter (B)  ⟨Ctrl+.⟩
        ●rgb(224, 224, 133) Set counters (B)...  ⟨Ctrl+/⟩
        ---
        ●rgb(133, 224, 133) Add counter (C)  ⟨Ctrl+Shift+.⟩
        ●rgb(133, 224, 133) Set counters (C)...  ⟨Ctrl+Shift+/⟩
        ---
        ●rgb(133, 224, 224) Add counter (D)
        ●rgb(133, 224, 224) Set counters (D)...
        ---
        ●rgb(133, 133, 224) Add counter (E)
        ●rgb(133, 133, 224) Set counters (E)...
        ---
        ●rgb(224, 133, 224) Add counter (F)
        ●rgb(224, 133, 224) Set counters (F)...
      "
    `);
    await dismissMenus();
    expect(openMenus()).toHaveLength(0);
  });

  it('own battlefield card, face down and not untapping', () => {
    renderSeats();
    expect(menuTree(cardEl(MORPH.id, 'battlefield'))).toMatchInlineSnapshot(`
      "
      Tap / Untap
      ✓ Skip untapping  ⟨Alt+U⟩
      Turn Over (face up)  ⟨Alt+F⟩
      Peek card  ⟨Alt+L⟩
      ---
      Clone  ⟨Ctrl+J⟩
      Move to  ▶
        Top of library in random order
        X cards from the top of library...
        Bottom of library in random order  ⟨Ctrl+B⟩
        ---
        Table
        Hand
        ---
        Graveyard  ⟨Ctrl+Delete⟩
        Exile
      ---
      Attach to card...  ⟨Ctrl+Alt+A⟩
      Draw arrow...  ⟨Alt+A⟩
      ---
      Power / toughness  ▶
        Increase power  ⟨Ctrl+=⟩
        Decrease power  ⟨Ctrl+-⟩
        Increase power and decrease toughness
        ---
        Increase toughness  ⟨Alt+=⟩
        Decrease toughness  ⟨Alt+-⟩
        Decrease power and increase toughness
        ---
        Increase power and toughness  ⟨Ctrl+Alt+=⟩
        Decrease power and toughness  ⟨Ctrl+Alt+-⟩
        ---
        Set power and toughness...  ⟨Ctrl+P⟩
        Reset power and toughness  ⟨Ctrl+Alt+0⟩
      Set annotation...  ⟨Alt+N⟩
      ---
      Reduce life by power  ⟨Ctrl+Shift+L⟩
      ---
      Select All  ⟨Ctrl+A⟩
      Select Row  ⟨Ctrl+Shift+X⟩
      ---
      Card counters  ▶
        ●rgb(224, 133, 133) Add counter (A)  ⟨Alt+.⟩
        ●rgb(224, 133, 133) Set counters (A)...  ⟨Alt+/⟩
        ---
        ●rgb(224, 224, 133) Add counter (B)  ⟨Ctrl+.⟩
        ●rgb(224, 224, 133) Set counters (B)...  ⟨Ctrl+/⟩
        ---
        ●rgb(133, 224, 133) Add counter (C)  ⟨Ctrl+Shift+.⟩
        ●rgb(133, 224, 133) Set counters (C)...  ⟨Ctrl+Shift+/⟩
        ---
        ●rgb(133, 224, 224) Add counter (D)
        ●rgb(133, 224, 224) Set counters (D)...
        ---
        ●rgb(133, 133, 224) Add counter (E)
        ●rgb(133, 133, 224) Set counters (E)...
        ---
        ●rgb(224, 133, 224) Add counter (F)
        ●rgb(224, 133, 224) Set counters (F)...
      "
    `);
  });

  it('opponent battlefield card', () => {
    renderSeats();
    expect(menuTree(cardEl(BEAR.id, 'battlefield'))).toMatchInlineSnapshot(`
      "
      Draw arrow...  ⟨Alt+A⟩
      Clone  ⟨Ctrl+J⟩
      ---
      Reduce life by power  ⟨Ctrl+Shift+L⟩
      ---
      Select All  ⟨Ctrl+A⟩
      Select Row  ⟨Ctrl+Shift+X⟩
      "
    `);
  });

  it('own stack card', () => {
    renderSeats();
    expect(menuTree(cardEl(OWN_SPELL.id, 'stack'))).toMatchInlineSnapshot(`
      "
      Play
      Play Face Down
      ---
      Clone  ⟨Ctrl+J⟩
      Move to  ▶
        Hand
        Battlefield
        Graveyard
        Exile
        ---
        Top of Library
        Bottom of Library
      ---
      Attach to card...  ⟨Ctrl+Alt+A⟩
      Draw arrow...  ⟨Alt+A⟩
      ---
      Select All  ⟨Ctrl+A⟩
      "
    `);
  });

  it('opponent stack card', () => {
    renderSeats();
    expect(menuTree(cardEl(THEIR_SPELL.id, 'stack'))).toMatchInlineSnapshot(`
      "
      Draw arrow...  ⟨Alt+A⟩
      ---
      Clone  ⟨Ctrl+J⟩
      ---
      Select All  ⟨Ctrl+A⟩
      "
    `);
  });

  it('own graveyard pile-view card', async () => {
    renderSeats();
    openContextMenu(pileEl('Graveyard', 0));
    chooseMenuPath('View graveyard');
    expect(screen.getByText(/^Graveyard — P1/)).toBeInTheDocument();

    expect(menuTree(pileViewCard(OWN_GRAVE.id))).toMatchInlineSnapshot(`
      "
      Draw arrow...  ⟨Alt+A⟩
      Clone  ⟨Ctrl+J⟩
      Select All  ⟨Ctrl+A⟩
      Select Column  ⟨Ctrl+Shift+C⟩
      "
    `);
  });

  it('own exile pile-view card', () => {
    renderSeats();
    openContextMenu(pileEl('Exile', 0));
    chooseMenuPath('View exile');

    expect(menuTree(pileViewCard(OWN_EXILE.id))).toMatchInlineSnapshot(`
      "
      Draw arrow...  ⟨Alt+A⟩
      Clone  ⟨Ctrl+J⟩
      Select All  ⟨Ctrl+A⟩
      Select Column  ⟨Ctrl+Shift+C⟩
      "
    `);
  });

  it('opponent graveyard pile-view card', () => {
    renderSeats();
    openContextMenu(pileEl('Graveyard', 1));
    chooseMenuPath('View graveyard');

    expect(menuTree(pileViewCard(THEIR_GRAVE.id))).toMatchInlineSnapshot(`
      "
      Draw arrow...  ⟨Alt+A⟩
      Clone  ⟨Ctrl+J⟩
      Select All  ⟨Ctrl+A⟩
      Select Column  ⟨Ctrl+Shift+C⟩
      "
    `);
  });
});

/** The Tailwind `z-[N]` layer of the nearest element that sets one. */
function zLayer(el: Element): number {
  const layered = el.closest('[class*="z-["]');
  const match = layered?.className.toString().match(/z-\[(\d+)\]/);
  return match ? Number(match[1]) : 0;
}

describe('seat card menu ownership', () => {
  it('keeps one card menu open across seats: opening another closes the first', () => {
    renderSeats();

    openContextMenu(cardEl(BOLT.id, 'battlefield'));
    act(() => {
      fireEvent.contextMenu(cardEl(BEAR.id, 'battlefield'), { clientX: 30, clientY: 30 });
    });

    const menus = openMenus();
    expect(menus).toHaveLength(1);
    expect(menus[0]).toHaveTextContent('Reduce life by power');
    expect(menus[0]).not.toHaveTextContent('Tap / Untap');
  });

  it('closes when one of its items fires', () => {
    renderSeats();

    openContextMenu(cardEl(OWN_SPELL.id, 'stack'));
    chooseMenuPath('Select All');

    expect(openMenus()).toHaveLength(0);
  });

  it('draws a pile-view card menu above the pile view', () => {
    renderSeats();
    openContextMenu(pileEl('Graveyard', 0));
    chooseMenuPath('View graveyard');
    const card = pileViewCard(OWN_GRAVE.id);

    const menu = openContextMenu(card);

    expect(zLayer(menu)).toBeGreaterThan(zLayer(card));
    expect(menu.parentElement).toBe(document.body);
  });
});


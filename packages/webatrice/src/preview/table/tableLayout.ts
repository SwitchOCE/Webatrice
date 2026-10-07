// The Table's geometry as a pure function of (player count, board size): integration
// step 0 in .design-research/integration.md. Anchored on Design A pass 2 §2–§4, which
// budgets a whole viewport. Inside the app the board sits under the 56 px TopBar, so the
// vertical budget is refit: rails and well keep their size, mats keep theirs while the
// Near Edge can shrink to 65%, and only below that do the mats give way.

export interface Budget {
  rail: number; mat: number; well: number; edge: number; ledger: number;
  pile: number; shelf: number; r1: number; r2: number; g: number; reader: number;
}

const B2: Record<number, Budget> = {
  1280: { rail: 42, mat: 200, well: 68, edge: 168, ledger: 300, pile: 76, shelf: 34, r1: 74, r2: 78, g: 3, reader: 168 },
  1440: { rail: 44, mat: 252, well: 84, edge: 224, ledger: 300, pile: 84, shelf: 44, r1: 94, r2: 98, g: 4, reader: 232 },
  1920: { rail: 50, mat: 316, well: 100, edge: 248, ledger: 340, pile: 96, shelf: 52, r1: 122, r2: 126, g: 4, reader: 260 },
};
const B4: Record<number, Budget> = {
  1280: { rail: 48, mat: 176, well: 96, edge: 176, ledger: 28, pile: 68, shelf: 32, r1: 64, r2: 66, g: 3, reader: 168 },
  1440: { rail: 52, mat: 218, well: 112, edge: 248, ledger: 28, pile: 76, shelf: 38, r1: 80, r2: 86, g: 3, reader: 208 },
  1920: { rail: 58, mat: 268, well: 132, edge: 296, ledger: 28, pile: 92, shelf: 48, r1: 100, r2: 104, g: 4, reader: 260 },
};

function anchor(table: Record<number, Budget>, w: number): Budget {
  const keys = [1280, 1440, 1920];
  if (w <= keys[0]) {
    return table[keys[0]];
  }
  if (w >= keys[2]) {
    // A budgets stop at 1920; above it everything but the gaps and the log spine scales with width.
    const k = w / keys[2];
    const top = table[keys[2]];
    const out = {} as Budget;
    (Object.keys(top) as (keyof Budget)[]).forEach((key) => {
      out[key] = key === 'g' || (key === 'ledger' && top.ledger < 40) ? top[key] : Math.round(top[key] * k);
    });
    return out;
  }
  const hi = keys.find((k) => k >= w)!;
  const lo = keys[keys.indexOf(hi) - 1];
  const t = (w - lo) / (hi - lo);
  const out = {} as Budget;
  (Object.keys(table[lo]) as (keyof Budget)[]).forEach((k) => {
    out[k] = Math.round(table[lo][k] + (table[hi][k] - table[lo][k]) * t);
  });
  return out;
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface SeatBox {
  playerId: number;
  orient: 'far' | 'near';
  pileSide: 'left' | 'right';
  rail: Rect;
  pile: Rect;
  mat: Rect;
  laneCells: number;
}
export interface TableGeometry {
  W: number; H: number;
  compact: boolean;
  rail: number; pile: number; gap: number;
  rows: { shelf: number; r1: number; r2: number };
  seats: SeatBox[];
  well: Rect;
  ledger: Rect;
  edge: Rect;
  reader: Rect;
  hand: Rect;
  actions: Rect;
}

export const ACTION_W = 440;

/** Ring order: index 0 is the local seat, then turn order. The far row takes ⌈n/2⌉ seats
 *  running left to right; the near row is you (left) then the rest of the ring reversed. */
export function computeTable(ring: number[], W: number, H: number): TableGeometry {
  const n = ring.length;
  const B = anchor(n === 2 ? B2 : B4, W);
  const ledgerW = B.ledger;
  // Battlefield legibility comes first. Mats may grow 12% past A's budget, and the full
  // Centre Well (Turn Dial, stack lanes, three-line ticker) appears only when it costs the
  // mats nothing. Otherwise the well folds to one 40 px line and the rails thin, which keeps
  // card size rising with window height (critique #1: without this the fixed bands cost
  // ~380 px and 4P cards on a 1366 × 768 laptop drop to 32 × 45, below classic's 47 × 67).
  const cap = Math.round(B.mat * 1.12);
  const fullMat = Math.floor((H - 2 * B.rail - B.well - Math.round(B.edge * 0.65)) / 2);
  const compact = fullMat < cap;
  const rail = compact ? Math.min(B.rail, Math.max(38, Math.round((B.rail * H) / 844))) : B.rail;
  const well = compact ? 40 : B.well;
  const edgeMin = compact ? 118 : Math.round(B.edge * 0.65);
  const fixed = 2 * rail + well;
  const mat = Math.min(cap, Math.floor((H - fixed - edgeMin) / 2));
  const edge = H - fixed - 2 * mat;
  const inner = mat - 8 - 2 * B.g;
  const sum = B.shelf + B.r1 + B.r2;
  const shelf = Math.round((inner * B.shelf) / sum);
  const r1 = Math.round((inner * B.r1) / sum);
  const r2 = inner - shelf - r1;

  const tableX = 4;
  const tableW = W - ledgerW - 8;
  const farK = Math.ceil(n / 2);
  const far = ring.slice(1, 1 + farK);
  const near = [ring[0], ...ring.slice(1 + farK).reverse()];
  const seats: SeatBox[] = [];
  const place = (list: number[], orient: 'far' | 'near') => {
    const k = list.length;
    const mw = Math.floor((tableW - 8 * (k - 1)) / k);
    list.forEach((playerId, i) => {
      const x = tableX + i * (mw + 8);
      // The pile column sits on the table's outer edge; a lone module keeps it at its owner's right hand.
      const pileSide: 'left' | 'right' =
        k === 1 ? (orient === 'far' ? 'left' : 'right') : i === 0 ? 'left' : i === k - 1 ? 'right' : orient === 'far' ? 'left' : 'right';
      const railY = orient === 'far' ? 0 : rail + mat + well + mat;
      const matY = orient === 'far' ? rail : rail + mat + well;
      const pileX = pileSide === 'left' ? x : x + mw - B.pile;
      const matX = pileSide === 'left' ? x + B.pile + 2 : x;
      seats.push({
        playerId, orient, pileSide,
        rail: { x, y: railY, w: mw, h: rail },
        pile: { x: pileX, y: matY, w: B.pile, h: mat },
        mat: { x: matX, y: matY, w: mw - B.pile - 2, h: mat },
        // Two reserved cells against the pile column; one on narrow seats (decision 3).
        laneCells: mw < 500 ? 1 : 2,
      });
    });
  };
  place(far, 'far');
  place(near, 'near');

  const edgeY = 2 * rail + 2 * mat + well;
  const edgeH = H - edgeY;
  const reader = Math.max(Math.round(edgeH * 0.62), Math.round((B.reader * edgeH) / B.edge));
  return {
    W, H,
    compact, rail, pile: B.pile, gap: B.g,
    rows: { shelf, r1, r2 },
    seats,
    well: { x: tableX, y: rail + mat, w: tableW, h: well },
    ledger: { x: W - ledgerW, y: 2, w: ledgerW - 2, h: edgeY - 4 },
    edge: { x: 0, y: edgeY, w: W, h: edgeH },
    reader: { x: 6, y: edgeY + 6, w: reader - 9, h: edgeH - 12 },
    hand: { x: reader + 3, y: edgeY + 6, w: W - reader - ACTION_W - 6, h: edgeH - 12 },
    actions: { x: W - ACTION_W + 3, y: edgeY + 6, w: ACTION_W - 9, h: edgeH - 12 },
  };
}

// Design preview: Design A "The Table" + Design D's undo ledger, composed from Webatrice's
// own leaves (Card, CardImage, ManaSymbols, TopBar Layout, design tokens) over the same
// Redux game state the classic board reads. Not wired to the server: taps, life and undo
// are local so the layout can be exercised. See .design-research/integration.md.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Ban, Check, Crosshair, Dices, Hand, Heart, History, Layers, ScrollText, Skull, Swords, Timer, Undo2, X,
  RotateCcw, BookOpen, Shuffle, Repeat, Sparkles, Hash, Sword, Eraser, Command, Eye,
} from 'lucide-react';

import { games } from '@cockatrice/datatrice';
import type { GameEntry, PlayerEntry } from '@cockatrice/datatrice';
import { ZoneName } from '@cockatrice/sockatrice';
import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';
import { CardImage } from '@app/components';
import { Layout } from '@app/feature-wrappers/layout';
import { useCurrentGame } from '../../features/game/hooks/useCurrentGame';
import Card from '../../features/game/components/PlayerBox/Card';
import { ManaSymbols } from '../../features/game/components/PlayerBox/ManaSymbols';
import { HoveredCardProvider, useHoveredCard } from '../../features/game/components/PlayerBox/hoveredCard';
import { BigCardPreviewProvider } from '../../features/game/components/PlayerBox/bigCardPreview';
import type { PreviewExtras } from '../fixture';
import { computeTable, type Rect, type SeatBox, type TableGeometry } from './tableLayout';

// ── seat identity: a glyph and a hue per seat, shared by rail, arrows, stack and log ──
const SEAT_HUE: Record<number, string> = { 1: '#E2B457', 2: '#62B4E8', 3: '#EE8A6E', 4: '#5FD0A0', 5: '#B79CF6', 6: '#D8D26A' };
const SEAT_GLYPH: Record<number, string> = { 1: '●', 2: '■', 3: '▲', 4: '◆', 5: '★', 6: '✚' };
const hue = (pid: number) => SEAT_HUE[pid] ?? '#C7BFD4';
const glyph = (pid: number) => `${SEAT_GLYPH[pid] ?? '•'}${pid}`;

const PHASES = [
  { label: 'Untap', tint: '#22c55e' }, { label: 'Upkeep', tint: '#22c55e' }, { label: 'Draw', tint: '#22c55e' },
  { label: 'Main 1', tint: '#3b82f6' }, { label: 'Start Combat', tint: '#ef4444' }, { label: 'Attack', tint: '#ef4444' },
  { label: 'Block', tint: '#ef4444' }, { label: 'Damage', tint: '#ef4444' }, { label: 'End Combat', tint: '#ef4444' },
  { label: 'Main 2', tint: '#3b82f6' }, { label: 'End', tint: '#22c55e' },
];

const art = (name: string) => `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;
const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']);
const MANA_LAND: Record<string, string> = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };

const abs = (r: Rect): CSSProperties => ({ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h });
const cardKey = (pid: number, id: number) => `${pid}:${id}`;

// ── local, unwired interaction state ────────────────────────────────────────────
interface UndoEntry { id: number; text: string; inverse: (() => void) | null; state: 'done' | 'undone' | 'never' | 'lifo' }
interface Ui {
  tapped: Record<string, boolean>;
  life: Record<number, number>;
  cmdTaken: Record<number, Record<number, number>>;
  proposal: PreviewExtras['proposal'];
  ledger: UndoEntry[];
  tray: boolean;
}

function useTableUi(extras: PreviewExtras) {
  const [ui, setUi] = useState<Ui>(() => ({
    tapped: {}, life: {}, cmdTaken: extras.cmdTaken, proposal: extras.proposal, ledger: [], tray: false,
  }));
  const seq = useRef(1);
  const record = useCallback((text: string, apply: (u: Ui) => Ui, inverse: ((u: Ui) => Ui) | null) => {
    setUi((u) => {
      const next = apply(u);
      const id = seq.current++;
      const entry: UndoEntry = {
        id, text, state: inverse ? 'done' : 'never',
        inverse: inverse ? () => setUi((v) => ({ ...inverse(v), ledger: v.ledger.map((e) => (e.id === id ? { ...e, state: 'undone' } : e)) })) : null,
      };
      return { ...next, ledger: [...next.ledger, entry] };
    });
  }, []);
  return { ui, setUi, record };
}

// ── zone helpers ────────────────────────────────────────────────────────────────
const zoneCards = (p: PlayerEntry | undefined, z: string): ServerInfo_Card[] => {
  const zone = p?.zones[z];
  return zone ? zone.order.map((id) => zone.byId[id]).filter(Boolean) : [];
};
const counter = (p: PlayerEntry, name: string) => Object.values(p.counters).find((c) => c.name.toLowerCase() === name)?.count ?? 0;
// The Quiet Test uses only what is on the wire: the land row (y = 2), no counters, no
// annotation, not face down, nothing attached to it and not attached to anything. It needs
// no card catalog, so a cold cache cannot change what is shown (critique #2). A non-land a
// desktop player drops in the land row still shows, named, as a tile.
const isQuietLand = (c: ServerInfo_Card, hosts: Set<number>) =>
  c.y === 2 && c.counterList.length === 0 && !c.annotation && !c.faceDown && c.attachCardId < 0 && !hosts.has(c.id);
const shortName = (name: string) =>
  name.split(/[ ,]+/).filter((w) => !/^(of|the|and|a)$/i.test(w)).slice(0, 2).join(' ');

// ════════════════════════════════════════════════════════════════════════════════
export default function TableGame({ extras }: { extras: PreviewExtras }) {
  return (
    <Layout>
      <HoveredCardProvider>
        <BigCardPreviewProvider>
          <TableSurface extras={extras} />
        </BigCardPreviewProvider>
      </HoveredCardProvider>
    </Layout>
  );
}

function TableSurface({ extras }: { extras: PreviewExtras }) {
  const { game } = useCurrentGame(1);
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const ring = useMemo(() => {
    if (!game) {
      return [];
    }
    const ids = games.seatedPlayersOf(game).map((p) => p.properties.playerId);
    const i = ids.indexOf(game.localPlayerId);
    return i >= 0 ? [...ids.slice(i), ...ids.slice(0, i)] : ids;
  }, [game]);

  const geo = useMemo(() => (size && ring.length ? computeTable(ring, size.w, size.h) : null), [size, ring]);
  const { ui, setUi, record } = useTableUi(extras);
  const q = useMemo(() => new URLSearchParams(window.location.search), []);

  // Scripted states for review screenshots: ?demo=1 replays a few of your own actions.
  const demoRan = useRef(false);
  useEffect(() => {
    if (!game || demoRan.current || !q.get('demo')) {
      return;
    }
    demoRan.current = true;
    const me = game.localPlayerId;
    const mine = zoneCards(game.players[me], ZoneName.TABLE);
    const ring1 = mine.find((c) => c.name === 'Arcane Signet');
    const elf = mine.find((c) => c.name === 'Birds of Paradise');
    if (ring1) {
      record(`tapped ${ring1.name}`, (u) => ({ ...u, tapped: { ...u.tapped, [cardKey(me, ring1.id)]: true } }), (u) => ({ ...u, tapped: { ...u.tapped, [cardKey(me, ring1.id)]: false } }));
    }
    record('changed life by −2', (u) => ({ ...u, life: { ...u.life, [me]: (u.life[me] ?? 0) - 2 } }), (u) => ({ ...u, life: { ...u.life, [me]: (u.life[me] ?? 0) + 2 } }));
    record('drew a card', (u) => u, (u) => u);
    record('shuffled your library', (u) => u, null);
    if (elf) {
      record(`tapped ${elf.name}`, (u) => ({ ...u, tapped: { ...u.tapped, [cardKey(me, elf.id)]: true } }), (u) => ({ ...u, tapped: { ...u.tapped, [cardKey(me, elf.id)]: false } }));
    }
    if (extras.proposal) {
      applyProposal();
    }
    if (q.get('tray')) {
      setUi((u) => ({ ...u, tray: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  const applyProposal = useCallback(() => {
    const pr = extras.proposal;
    if (!pr) {
      return;
    }
    record(
      `took ${pr.amount} commander damage from ${glyph(pr.from)} ${pr.card.split(',')[0]}`,
      (u) => ({ ...u, proposal: null, life: { ...u.life, [pr.to]: (u.life[pr.to] ?? 0) - pr.amount }, cmdTaken: { ...u.cmdTaken, [pr.to]: { ...u.cmdTaken[pr.to], [pr.from]: (u.cmdTaken[pr.to]?.[pr.from] ?? 0) + pr.amount } } }),
      (u) => ({ ...u, proposal: pr, life: { ...u.life, [pr.to]: (u.life[pr.to] ?? 0) + pr.amount }, cmdTaken: { ...u.cmdTaken, [pr.to]: { ...u.cmdTaken[pr.to], [pr.from]: (u.cmdTaken[pr.to]?.[pr.from] ?? 0) - pr.amount } } }),
    );
  }, [extras.proposal, record]);

  const undoLast = useCallback(() => {
    const last = [...ui.ledger].reverse().find((e) => e.state === 'done');
    last?.inverse?.();
  }, [ui.ledger]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, [contenteditable="true"]'))) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault(); undoLast();
      }
      if (e.key === 'Escape') {
        setUi((u) => ({ ...u, tray: false }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoLast, setUi]);

  const tap = useCallback((pid: number, c: ServerInfo_Card) => {
    const k = cardKey(pid, c.id);
    const was = ui.tapped[k] ?? c.tapped;
    record(`${was ? 'untapped' : 'tapped'} ${c.name}`,
      (u) => ({ ...u, tapped: { ...u.tapped, [k]: !was } }),
      (u) => ({ ...u, tapped: { ...u.tapped, [k]: was } }));
  }, [ui.tapped, record]);

  const life = useCallback((pid: number, d: number) => {
    record(`changed life by ${d > 0 ? '+' : '−'}${Math.abs(d)}`,
      (u) => ({ ...u, life: { ...u.life, [pid]: (u.life[pid] ?? 0) + d } }),
      (u) => ({ ...u, life: { ...u.life, [pid]: (u.life[pid] ?? 0) - d } }));
  }, [record]);

  return (
    <div ref={host} className="relative h-full w-full overflow-hidden bg-bg-base select-none" data-testid="table-surface">
      {game && geo && (
        <Board game={game} geo={geo} extras={extras} ui={ui} ring={ring}
          onTap={tap} onLife={life} onApply={applyProposal}
          onDismiss={() => {
            const pr = ui.proposal; record(`dismissed ${pr ? glyph(pr.from) : ''}’s commander-damage proposal`, (u) => ({ ...u, proposal: null }), (u) => ({ ...u, proposal: pr }));
          }}
          onUndo={undoLast} onTray={() => setUi((u) => ({ ...u, tray: !u.tray }))}
          readerDefault={q.get('reader')}
        />
      )}
    </div>
  );
}

interface BoardProps {
  game: GameEntry; geo: TableGeometry; extras: PreviewExtras; ui: Ui; ring: number[];
  onTap: (pid: number, c: ServerInfo_Card) => void;
  onLife: (pid: number, d: number) => void;
  onApply: () => void; onDismiss: () => void; onUndo: () => void; onTray: () => void;
  readerDefault: string | null;
}

function Board(props: BoardProps) {
  const { game, geo, ring } = props;
  const surface = useRef<HTMLDivElement>(null);
  const edh = ring.length > 2;
  return (
    <div ref={surface} className="absolute inset-0">
      {geo.seats.map((s) => (
        <Seat key={s.playerId} seat={s} geo={geo} {...props} edh={edh} player={game.players[s.playerId]} />
      ))}
      <Well geo={geo} game={game} ring={ring} ui={props.ui} edh={edh} />
      <Ledger geo={geo} game={game} wide={ring.length === 2} />
      <NearEdge {...props} />
      <Arrows game={game} surface={surface} geo={geo} />
    </div>
  );
}

// ── seat module: rail · pile column · mat ───────────────────────────────────────
function Seat(props: BoardProps & { seat: SeatBox; player: PlayerEntry; edh: boolean }) {
  const { seat, player, game, geo, ui, extras, edh } = props;
  const pid = seat.playerId;
  const mine = pid === game.localPlayerId;
  const table = zoneCards(player, ZoneName.TABLE);
  const hosts = new Set(Object.values(game.players).flatMap((p) => zoneCards(p, ZoneName.TABLE))
    .filter((c) => c.attachCardId >= 0 && c.attachPlayerId === pid).map((c) => c.attachCardId));
  const lands = table.filter((c) => isQuietLand(c, hosts));
  const promoted = table.filter((c) => c.y === 2 && !isQuietLand(c, hosts));
  const rowsOrder: ('shelf' | 'r1' | 'r2')[] = seat.orient === 'far' ? ['shelf', 'r1', 'r2'] : ['r2', 'r1', 'shelf'];
  const inner = { x: seat.mat.x + 4, y: seat.mat.y + 4, w: seat.mat.w - 8 };
  let ry = inner.y;
  const playmat = extras.commanders[pid]?.name ?? (pid === 1 ? 'Fable of the Mirror-Breaker' : 'The Wandering Emperor');
  return (
    <>
      <Rail {...props} />
      <PileColumn rect={seat.pile} player={player} commander={extras.commanders[pid]} edh={edh} />
      <div
        style={abs(seat.mat)}
        className="rounded-md border border-border-subtle overflow-hidden"
      >
        {/* PF8: on 3.1 servers a playmat is a card-art crop the player chose; desktop draws it too. */}
        <div className="absolute inset-0 bg-bg-surface" />
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{ backgroundImage: `url(${art(playmat)})`, backgroundSize: 'cover', backgroundPosition: 'center 30%' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(120% 120% at ${seat.pileSide === 'left' ? '0%' : '100%'} ${seat.orient === 'far' ? '0%' : '100%'}, ${hue(pid)}22, transparent 55%), linear-gradient(${seat.orient === 'far' ? '180deg' : '0deg'}, rgb(var(--bg-base) / 0.1), rgb(var(--bg-base) / 0.55))` }}
        />
      </div>
      {rowsOrder.map((row) => {
        const h = geo.rows[row];
        const y = ry;
        ry += h + geo.gap;
        if (row === 'shelf') {
          return <Shelf key={row} pid={pid} lands={lands} extra={promoted.length} compact={geo.compact} x={inner.x} y={y} w={inner.w} h={h} pileSide={seat.pileSide} mine={mine} ui={ui} onTap={props.onTap} />;
        }
        const wireY = row === 'r2' ? 0 : 1;
        return (
          <CardRow key={row} pid={pid} cards={table.filter((c) => c.y === wireY)} lane={row === 'r1' ? seat.laneCells : 0}
            promoted={row === 'r1' ? promoted : []} x={inner.x} y={y} w={inner.w} h={h} pileSide={seat.pileSide}
            mine={mine} ui={ui} onTap={props.onTap} />
        );
      })}
    </>
  );
}

function Rail(props: BoardProps & { seat: SeatBox; player: PlayerEntry; edh: boolean }) {
  const { seat, player, game, ui, edh, ring } = props;
  const pid = seat.playerId;
  const mine = pid === game.localPlayerId;
  const r = seat.rail;
  const active = game.activePlayerId === pid;
  const name = player.properties.userInfo?.name ?? `Player ${pid}`;
  const lifeNow = counter(player, 'life') + (ui.life[pid] ?? 0);
  const hand = player.zones[ZoneName.HAND]?.cardCount ?? 0;
  const pool = ['w', 'u', 'b', 'r', 'g', 'x'].filter((m) => counter(player, m) > 0);
  const inbound = Object.values(game.players).flatMap((p) => Object.values(p.arrows)).filter((a) => a.targetPlayerId === pid && a.targetCardId < 0).length;
  const tp = r.h - 10;
  const proposal = mine && ui.proposal && ui.proposal.to === pid ? ui.proposal : null;
  const wide = r.w >= 600;
  const oneLine = r.h < 44;
  const cmdChips = edh ? ring.filter((o) => o !== pid).map((o) => {
    const v = ui.cmdTaken[pid]?.[o] ?? 0;
    return (
      <span key={o} title={`Commander damage taken from ${game.players[o]?.properties.userInfo?.name}`}
        className={`inline-flex items-center gap-1 rounded px-1 border ${v >= 21 ? 'border-red-400 text-red-300' : 'border-border-subtle text-text-secondary'} bg-bg-base/60`}>
        <span className="font-bold" style={{ color: hue(o) }}>{glyph(o)}</span>
        <b className="tabular-nums text-text-primary">{v}</b>
        {wide && !proposal && !oneLine && <span className="w-7 h-1 rounded-full bg-border-subtle overflow-hidden"><span className="block h-full" style={{ width: `${Math.min(100, (v / 21) * 100)}%`, background: hue(o) }} /></span>}
      </span>
    );
  }) : null;
  return (
    <div
      style={{ ...abs(r), boxShadow: active ? `inset 0 0 0 1px ${hue(pid)}, 0 0 18px -6px ${hue(pid)}` : undefined }}
      className={`flex items-center gap-2.5 pl-1.5 rounded-md border ${active ? 'border-transparent' : 'border-border-subtle'} ${mine ? 'bg-bg-elevated' : 'bg-bg-surface'}`}
    >
      {/* name plate: the classic board's avatar pill, shortened to a rail */}
      <div className="relative shrink-0 h-[calc(100%-8px)] rounded-md overflow-hidden flex items-center gap-2 pl-1.5 pr-2.5" style={{ minWidth: 112 }}>
        <div className="absolute inset-0 bg-gradient-to-br from-accent-secondary to-accent" aria-hidden />
        <div className="absolute inset-0 bg-black/50" aria-hidden />
        <span className="relative rounded px-1 text-[12px] font-bold leading-[18px] text-[#14101F]" style={{ background: hue(pid) }}>{glyph(pid)}</span>
        <span className="relative flex flex-col leading-tight min-w-0">
          <span className="text-[13px] font-semibold text-white truncate">{name}{active && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: hue(pid) }}>turn</span>}</span>
          {!oneLine && <span className="text-[10px] text-text-secondary flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />{player.properties.pingSeconds * 12 + pid * 7} ms</span>}
        </span>
      </div>
      {/* life */}
      <div className="shrink-0 flex items-center gap-1">
        {mine && <RailButton label="Lose 1 life" onClick={() => props.onLife(pid, -1)}>−</RailButton>}
        <Heart size={Math.round(r.h * 0.36)} className="text-red-400" />
        <span className="font-modern font-bold tabular-nums text-white leading-none" style={{ fontSize: Math.round(r.h * 0.56) }}>{lifeNow}</span>
        {mine && <RailButton label="Gain 1 life" onClick={() => props.onLife(pid, 1)}>+</RailButton>}
      </div>
      {/* counts, pool, commander damage */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 overflow-hidden">
        <div className="flex items-center gap-2.5 text-[11px] text-text-secondary whitespace-nowrap">
          <span className="inline-flex items-center gap-1" title="Cards in hand"><Hand size={12} /><b className="text-text-primary font-semibold tabular-nums">{hand}</b></span>
          {pool.length > 0 && (
            <span className="inline-flex items-center gap-1" title="Mana pool">
              {pool.map((m) => (
                <span key={m} className="inline-flex items-center gap-0.5"><ManaSymbols cost={`{${m.toUpperCase()}}`} size={12} /><b className="text-text-primary tabular-nums">{counter(player, m)}</b></span>
              ))}
            </span>
          )}
          {!edh && <span className="inline-flex items-center gap-1 text-text-muted"><Timer size={12} />{fmtClock(game.secondsElapsed)}</span>}
          {oneLine && cmdChips && <span className="inline-flex items-center gap-1.5"><Swords size={12} className="text-text-muted" />{cmdChips}</span>}
          {proposal && (!wide || oneLine) && <Proposal p={proposal} onApply={props.onApply} onDismiss={props.onDismiss} />}
        </div>
        {edh && !oneLine && (
          <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap">
            <Swords size={12} className="text-text-muted shrink-0" aria-label="Commander damage taken" />
            {cmdChips}
            {proposal && wide && <Proposal p={proposal} onApply={props.onApply} onDismiss={props.onDismiss} />}
          </div>
        )}
      </div>
      {/* Threat Post: every arrow aimed at this player ends here */}
      <div
        data-threat={pid}
        title={`Threat Post — arrows aimed at ${name}`}
        className="shrink-0 mr-1.5 grid place-items-center rounded-md border-2 font-bold text-[12px] tabular-nums"
        style={{ width: tp, height: tp, borderColor: hue(pid), color: hue(pid), background: inbound ? `${hue(pid)}26` : 'rgb(var(--bg-base))' }}
      >
        <span className="flex items-center gap-0.5"><Crosshair size={13} />{inbound}</span>
      </div>
    </div>
  );
}

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className="w-5 h-5 grid place-items-center rounded bg-bg-base/70 border border-border-strong text-text-secondary text-[13px] leading-none hover:bg-accent-secondary hover:text-white">
      {children}
    </button>
  );
}

function Proposal({ p, onApply, onDismiss }: { p: NonNullable<PreviewExtras['proposal']>; onApply: () => void; onDismiss: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-amber-400/80 bg-amber-400/15 pl-1.5 pr-0.5 text-amber-100"
      title={`${p.card} dealt you ${p.amount} combat damage. Only you can change your own counters (PF1).`}>
      <span className="font-bold" style={{ color: hue(p.from) }}>{glyph(p.from)}</span>→ you <b className="tabular-nums">{p.amount}</b>
      <button type="button" onClick={onApply} className="inline-flex items-center gap-0.5 rounded bg-amber-400/25 hover:bg-amber-400/40 px-1 font-semibold"><Check size={11} />apply</button>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rounded hover:bg-amber-400/30 px-0.5"><X size={11} /></button>
    </span>
  );
}

function PileColumn({ rect, player, commander, edh }: { rect: Rect; player: PlayerEntry; commander?: { name: string; tax: number; inPlay: boolean }; edh: boolean }) {
  const grave = zoneCards(player, ZoneName.GRAVE);
  const exile = zoneCards(player, ZoneName.EXILE);
  const deck = player.zones[ZoneName.DECK]?.cardCount ?? 0;
  const sb = player.zones[ZoneName.SIDEBOARD]?.cardCount ?? 0;
  const cw = rect.w - 8;
  const ch = Math.min(Math.round(cw * 1.4), rect.h - 2 * 30 - 14);
  const cardW = Math.round(ch / 1.4);
  const tiles: { icon: ReactNode; n: number; title: string; bg?: string }[] = [
    { icon: <Layers size={11} />, n: deck, title: 'Library', bg: 'https://backs.scryfall.io/normal/0/a/0aeebaf5-8c7d-4636-9e82-8c27447861f7.jpg' },
    { icon: <Skull size={11} />, n: grave.length, title: 'Graveyard', bg: grave.length ? art(grave[grave.length - 1].name) : undefined },
    { icon: <Ban size={11} />, n: exile.length, title: 'Exile', bg: exile.length ? art(exile[exile.length - 1].name) : undefined },
    edh ? { icon: <Hash size={11} />, n: commander?.tax ?? 0, title: 'Commander tax' } : { icon: <BookOpen size={11} />, n: sb, title: 'Sideboard' },
  ];
  return (
    <div style={abs(rect)} className="rounded-md border border-border-subtle bg-bg-surface p-1 flex flex-col gap-1">
      {edh && commander && (
        <div className="relative mx-auto" style={{ width: cardW, height: ch, '--card-width': `${cardW}px`, '--card-height': `${ch}px` } as CSSProperties}
          title={`Command zone: ${commander.name}`}>
          <div className={commander.inPlay ? 'opacity-40 grayscale-[40%]' : ''}><Card name={commander.name} /></div>
          {commander.tax > 0 && <span title={`Commander tax: ${commander.tax}`} className="absolute right-0.5 top-[30%] rounded bg-black/85 border border-amber-300/60 px-1 text-[9px] font-bold text-amber-200">tax {commander.tax}</span>}
          {commander.inPlay && <span className="absolute inset-x-0 top-[48%] bg-black/75 text-center text-[9px] font-bold tracking-widest text-amber-200">IN PLAY</span>}
        </div>
      )}
      <div className={`grid ${edh ? 'grid-cols-2' : 'grid-cols-1'} gap-1 ${edh ? '' : 'flex-1'}`}>
        {tiles.map((t) => (
          <div key={t.title} title={`${t.title}: ${t.n}`}
            className="relative overflow-hidden rounded border border-border-subtle bg-bg-base flex items-center justify-between px-1 text-text-secondary"
            style={{ height: edh ? 26 : Math.max(26, Math.floor((rect.h - 8 - 12) / 4)) }}>
            {t.bg && <div className="absolute inset-0 opacity-35" style={{ backgroundImage: `url(${t.bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
            <span className="relative">{t.icon}</span>
            <b className="relative text-[12px] text-text-primary tabular-nums" style={{ textShadow: '0 1px 3px #000' }}>{t.n}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

// Lands that need no attention fold into named tiles. Anything with counters or an
// annotation fails the Quiet Test and stands up in the promotion lane instead.
function Shelf({ pid, lands, extra, x, y, w, h, mine, ui, onTap, compact }: {
  pid: number; lands: ServerInfo_Card[]; extra: number; x: number; y: number; w: number; h: number;
  pileSide: 'left' | 'right'; mine: boolean; ui: Ui; onTap: (pid: number, c: ServerInfo_Card) => void; compact: boolean;
}) {
  const { setHoveredCard } = useHoveredCard();
  const groups: { name: string; cards: ServerInfo_Card[] }[] = [];
  for (const c of lands) {
    const g = groups.find((q) => q.name === c.name);
    if (g) {
      g.cards.push(c);
    } else {
      groups.push({ name: c.name, cards: [c] });
    }
  }
  const tw = Math.round(h * (compact ? 2.3 : 2.05)); const gap = 4; const
    cw0 = Math.round(tw * 0.6);
  const slots = Math.max(1, Math.floor((w - (cw0 + gap)) / (tw + gap)));
  const shown = groups.slice(0, groups.length > slots ? slots - 1 : slots);
  const hidden = groups.slice(shown.length);
  const isTapped = (c: ServerInfo_Card) => ui.tapped[cardKey(pid, c.id)] ?? c.tapped;
  let cx = x;
  const items: ReactNode[] = [];
  items.push(
    <div key="count" style={{ position: 'absolute', left: cx, top: y, width: cw0, height: h }}
      title={`${lands.length + extra} lands in play`}
      className="rounded border border-border-subtle bg-bg-base/80 flex items-center justify-center gap-1 text-text-secondary text-[12px]">
      <Layers size={12} className="opacity-70" /><b className="text-text-primary tabular-nums">{lands.length + extra}</b>
    </div>,
  );
  cx += cw0 + gap;
  for (const g of shown) {
    const tapped = g.cards.filter(isTapped).length;
    const all = tapped === g.cards.length;
    const next = g.cards.find((c) => !isTapped(c));
    items.push(
      <button type="button" key={g.name}
        // Every card in the group anchors here, so an arrow aimed at the third Forest still lands (critique #3).
        data-hosts={g.cards.map((c) => cardKey(pid, c.id)).join(' ')}
        onClick={() => {
          if (mine && next) {
            onTap(pid, next);
          }
        }}
        onMouseEnter={() => setHoveredCard({ name: g.name })}
        aria-label={`${g.name}, ${g.cards.length} in play, ${tapped} tapped${mine && next ? '. Activate to tap one untapped ' + g.name : ''}`}
        title={`${g.name} × ${g.cards.length}${tapped ? `, ${tapped} tapped` : ''}`}
        style={{ position: 'absolute', left: cx, top: y, width: tw, height: h }}
        className={`group overflow-hidden rounded border text-left ${all ? 'border-border-subtle' : 'border-border-strong'} ${mine ? 'cursor-pointer hover:border-accent' : 'cursor-help'}`}>
        <span className={`absolute inset-0 ${all ? 'opacity-35 grayscale-[60%]' : ''}`} style={{ backgroundImage: `url(${art(g.name)})`, backgroundSize: 'cover', backgroundPosition: 'center 35%' }} />
        <span className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
        <span className={`relative flex h-full ${compact ? 'items-center gap-1.5' : 'flex-col justify-center'} pl-1.5 leading-[1.05]`}>
          <span className="text-[10px] font-semibold text-white/85 truncate pr-1" style={{ maxWidth: tw - 8 }}>
            {MANA_LAND[g.name] && <ManaSymbols cost={`{${MANA_LAND[g.name]}}`} size={9} className="mr-0.5" />}{BASICS.has(g.name) ? (compact && tw < 100 ? null : g.name) : shortName(g.name)}
          </span>
          <span className="text-[15px] font-modern font-bold text-white tabular-nums whitespace-nowrap">
            {g.cards.length}{tapped > 0 && <span className="ml-1 text-[10px] font-sans font-semibold text-amber-200/90" title={`${tapped} tapped`}><RotateCcw size={9} className="inline -mt-0.5 rotate-180" />{tapped}</span>}
          </span>
        </span>
      </button>,
    );
    cx += tw + gap;
  }
  if (hidden.length) {
    items.push(
      <div key="more" style={{ position: 'absolute', left: cx, top: y, width: cw0 + 8, height: h }}
        data-hosts={hidden.flatMap((g) => g.cards.map((c) => cardKey(pid, c.id))).join(' ')}
        title={hidden.map((g) => `${g.name} × ${g.cards.length}`).join(', ')}
        className="rounded border border-border-subtle bg-bg-base/80 grid place-items-center text-[11px] font-semibold text-text-secondary">{hidden.length} more</div>,
    );
  }
  return <>{items}</>;
}

function CardRow({ pid, cards, lane, promoted, x, y, w, h, pileSide, mine, ui, onTap }: {
  pid: number; cards: ServerInfo_Card[]; lane: number; promoted: ServerInfo_Card[]; x: number; y: number; w: number; h: number;
  pileSide: 'left' | 'right'; mine: boolean; ui: Ui; onTap: (pid: number, c: ServerInfo_Card) => void;
}) {
  const cols = Math.max(1, Math.floor(w / h));
  const cw = Math.round(h * 0.71);
  const laneIdx = new Set<number>();
  for (let i = 0; i < lane; i++) {
    laneIdx.add(pileSide === 'left' ? i : cols - 1 - i);
  }
  const cells: number[] = [];
  for (let i = 0; i < cols; i++) {
    if (!laneIdx.has(i)) {
      cells.push(x + i * h);
    }
  }
  const laneX = [...laneIdx].sort((a, b) => (pileSide === 'left' ? a - b : b - a)).map((i) => x + i * h);
  const last = cells.length - 1;

  const byCell = new Map<number, ServerInfo_Card[]>();
  for (const c of cards) {
    const cell = Math.min(Math.floor(Math.max(0, c.x) / 3), last);
    if (!byCell.has(cell)) {
      byCell.set(cell, []);
    }
    byCell.get(cell)!.push(c);
  }
  const nodes: ReactNode[] = [];
  for (let i = 0; i < cols; i++) {
    nodes.push(
      <div key={`cell${i}`} style={{ position: 'absolute', left: x + i * h + 1, top: y, width: h - 2, height: h }}
        className={`rounded-md border border-dashed pointer-events-none ${laneIdx.has(i) ? 'border-amber-300/35 bg-amber-300/[0.04]' : 'border-white/[0.06]'}`}
        title={laneIdx.has(i) ? 'Promotion lane: lands that need attention stand up here' : undefined} />,
    );
  }
  const tappedOf = (c: ServerInfo_Card) => ui.tapped[cardKey(pid, c.id)] ?? c.tapped;
  byCell.forEach((pile, cell) => {
    const sorted = [...pile].sort((a, b) => a.x - b.x);
    // Overflow cell (critique #4): its own column's card stays on top; otherwise the first card
    // that did not fit. One number: every card in the cell beyond the one shown.
    const folded = cell === last && sorted.some((c) => Math.floor(c.x / 3) !== last);
    const own = sorted.filter((c) => Math.floor(c.x / 3) === Math.floor(sorted[0].x / 3));
    const top = folded ? (sorted.find((c) => Math.floor(c.x / 3) === last) ?? sorted[0]) : own[own.length - 1];
    nodes.push(
      <PlacedCard key={`c${top.id}`} pid={pid} c={top} hosts={sorted} x={cells[cell] + (h - cw) / 2} y={y} w={cw} h={h}
        depth={folded ? 1 : sorted.length} overflow={folded ? sorted.length - 1 : 0}
        tapped={tappedOf(top)} mine={mine} onTap={onTap} />,
    );
  });
  // Promoted lands never disappear: past the lane's capacity they fold into its last cell.
  promoted.forEach((c, i) => {
    if (!laneX.length) {
      return;
    }
    const slot = Math.min(i, laneX.length - 1);
    const lastSlot = slot === laneX.length - 1 && promoted.length > laneX.length;
    if (lastSlot && i !== slot) {
      return;
    }
    const rest = lastSlot ? promoted.slice(slot) : [c];
    nodes.push(
      <PlacedCard key={`p${c.id}`} pid={pid} c={c} hosts={rest} x={laneX[slot] + (h - cw) / 2} y={y} w={cw} h={h} depth={1}
        overflow={rest.length - 1} tapped={tappedOf(c)} mine={mine} onTap={onTap} />,
    );
  });
  return <>{nodes}</>;
}

function PlacedCard({ pid, c, hosts, x, y, w, h, depth, overflow, tapped, mine, onTap }: {
  pid: number; c: ServerInfo_Card; hosts: ServerInfo_Card[]; x: number; y: number; w: number; h: number; depth: number; overflow: number;
  tapped: boolean; mine: boolean; onTap: (pid: number, c: ServerInfo_Card) => void;
}) {
  const vars = { '--card-width': `${w}px`, '--card-height': `${h}px` } as CSSProperties;
  const label = `${c.name}${c.pt ? `, ${c.pt}` : ''}${tapped ? ', tapped' : ''}${depth > 1 ? `, pile of ${depth}` : ''}${overflow ? `, plus ${overflow} more stacked here` : ''}`;
  return (
    <>
      {depth > 1 && [...Array(Math.min(depth, 3) - 1)].map((_, i) => (
        <div key={i} className="absolute rounded-[5px] border border-white/25 bg-bg-elevated"
          style={{ left: x - (Math.min(depth, 3) - 1 - i) * 3, top: y - (Math.min(depth, 3) - 1 - i) * 3, width: w, height: h }} />
      ))}
      <div
        data-card-key={cardKey(pid, c.id)}
        data-hosts={hosts.map((q) => cardKey(pid, q.id)).join(' ')}
        role={mine ? 'button' : 'img'}
        tabIndex={0}
        aria-label={mine ? `${label}. Activate to ${tapped ? 'untap' : 'tap'}` : label}
        aria-pressed={mine ? tapped : undefined}
        onClick={mine ? () => onTap(pid, c) : undefined}
        onKeyDown={mine ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault(); onTap(pid, c);
          }
        } : undefined}
        className={`absolute rounded-[5px] transition-transform duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${mine ? 'cursor-pointer' : 'cursor-help'}`}
        style={{ left: x, top: y, width: w, height: h, transform: tapped ? 'rotate(90deg)' : undefined, ...vars,
          filter: c.attacking ? `drop-shadow(0 0 5px ${hue(pid)})` : undefined }}
      >
        <Card name={c.name} pt={c.pt || undefined} counters={c.counterList} id={String(c.id)} />
      </div>
      {depth > 1 && (
        <span title={`${depth} cards with the same name in one pile`} className="absolute z-10 rounded bg-black/90 border border-border-strong px-1 text-[10px] font-bold text-text-primary pointer-events-none"
          style={{ left: x - 4, top: y + h - 16 }}>×{depth}</span>
      )}
      {overflow > 0 && (
        <span title={`${overflow} more card${overflow > 1 ? 's' : ''} stacked here: this row has no more cells. Lean In to see them.`}
          className="absolute z-10 rounded bg-accent-secondary border border-accent px-1 text-[10px] font-bold text-white" style={{ left: x + w - 24, top: y + 2 }}>+{overflow}</span>
      )}
    </>
  );
}

// ── Centre Well: Turn Dial · shared stack · Table Ticker ───────────────────────
function Well({ geo, game, ring, ui, edh }: { geo: TableGeometry; game: GameEntry; ring: number[]; ui: Ui; edh: boolean }) {
  const r = geo.well;
  const [flip, setFlip] = useState(false);
  const ph = PHASES[game.activePhase] ?? PHASES[0];
  const activeName = game.players[game.activePlayerId]?.properties.userInfo?.name ?? '';
  const stack = ring.flatMap((pid) => zoneCards(game.players[pid], ZoneName.STACK).map((c) => ({ pid, c })));
  const ticker = game.messages.slice(-3);
  const segW = [0.25, 0.33, 0.42];
  const inner = r.w - 8 - 2 * 4;
  let sx = r.x + 4;
  const boxes = segW.map((f) => {
    const b = { x: sx, w: Math.round(inner * f) }; sx += b.w + 4; return b;
  });
  const segCls = 'absolute rounded-md border border-border-subtle bg-bg-surface px-2.5 py-1.5 overflow-hidden';
  if (r.h < 56) {
    const lastLine = ticker[ticker.length - 1];
    return (
      <div style={abs(r)} className="rounded-md bg-bg-base flex items-stretch gap-1 p-1 text-[12px] whitespace-nowrap">
        <div className="shrink-0 flex items-center gap-2 rounded-md border border-border-subtle bg-bg-surface px-2.5">
          <span className="flex gap-[2px]">{PHASES.map((p, i) => <span key={p.label} title={p.label} className="w-2 h-1.5 rounded-sm" style={{ background: i === game.activePhase ? p.tint : i < game.activePhase ? `${p.tint}55` : 'rgb(var(--border-subtle))' }} />)}</span>
          <b className="font-modern" style={{ color: ph.tint }}>{ph.label}</b>
          <span className="text-text-secondary"><span className="font-bold" style={{ color: hue(game.activePlayerId) }}>{glyph(game.activePlayerId)}</span> {activeName}</span>
          <span className="text-text-muted inline-flex items-center gap-1"><Timer size={11} />{fmtClock(game.secondsElapsed)}</span>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-surface px-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Stack {stack.length}</span>
          {stack.map(({ pid, c }) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded border px-1 text-text-primary" style={{ borderColor: hue(pid), background: `${hue(pid)}1f` }}>
              <span className="font-bold" style={{ color: hue(pid) }}>{glyph(pid)}</span>{c.name}
            </span>
          ))}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2 rounded-md border border-border-subtle bg-bg-surface px-2.5">
          <ScrollText size={12} className="shrink-0 text-text-muted" />
          {lastLine && <span className="truncate text-text-primary"><span className="font-bold mr-1" style={{ color: hue(lastLine.playerId) }}>{glyph(lastLine.playerId)}</span>{lastLine.message}</span>}
        </div>
      </div>
    );
  }
  const head = 'text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted flex items-center justify-between';
  return (
    <div style={abs(r)} className="rounded-md bg-bg-base">
      <div className={segCls} style={{ left: boxes[0].x - r.x, top: 4, width: boxes[0].w, height: r.h - 8 }}>
        {!flip ? (
          <>
            <div className={head}><span>Turn</span>{edh && <button type="button" onClick={() => setFlip(true)} className="normal-case tracking-normal text-accent hover:text-accent-hover">damage ▸</button>}</div>
            <div className="mt-1.5 flex gap-[3px]">
              {PHASES.map((p, i) => (
                <span key={p.label} title={p.label} className="h-[7px] flex-1 rounded-sm"
                  style={{ background: i === game.activePhase ? p.tint : i < game.activePhase ? `${p.tint}55` : 'rgb(var(--border-subtle))' }} />
              ))}
            </div>
            <div className="mt-1.5 flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-[15px] font-modern font-bold" style={{ color: ph.tint }}>{ph.label}</span>
              <span className="text-[12px] text-text-secondary"><span className="font-bold" style={{ color: hue(game.activePlayerId) }}>{glyph(game.activePlayerId)}</span> {activeName}</span>
            </div>
            {r.h >= 96 && <div className="mt-0.5 flex items-center gap-1 text-[11px] text-text-muted"><Timer size={11} />{fmtClock(game.secondsElapsed)} · <Repeat size={11} /> clockwise</div>}
          </>
        ) : (
          <>
            <div className={head}><span>Commander damage</span><button type="button" onClick={() => setFlip(false)} className="normal-case tracking-normal text-accent">◂ turn</button></div>
            <table className="mt-1 text-[10.5px] tabular-nums">
              <tbody>
                <tr><td className="pr-1 text-text-muted">to↓</td>{ring.map((f) => <td key={f} className="px-1 font-bold" style={{ color: hue(f) }}>{glyph(f)}</td>)}</tr>
                {ring.map((to) => (
                  <tr key={to}><td className="pr-1 font-bold" style={{ color: hue(to) }}>{glyph(to)}</td>
                    {ring.map((f) => <td key={f} className={`px-1 text-center ${f === to ? 'text-text-muted' : 'text-text-primary'}`}>{f === to ? '·' : ui.cmdTaken[to]?.[f] ?? 0}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      <div className={segCls} style={{ left: boxes[1].x - r.x, top: 4, width: boxes[1].w, height: r.h - 8 }}>
        <div className={head}><span>Stack · {stack.length}</span><span className="normal-case tracking-normal">top resolves first</span></div>
        <div className="mt-1.5 flex gap-1" style={{ height: r.h - 36 }}>
          {ring.map((pid) => {
            const mine = stack.filter((s) => s.pid === pid);
            return (
              <div key={pid} className="flex-1 min-w-0 rounded bg-bg-base/70 border-t-[3px] px-1 pt-0.5 flex flex-col gap-0.5" style={{ borderColor: hue(pid) }}>
                <span className="text-[10px] font-bold" style={{ color: hue(pid) }}>{glyph(pid)}</span>
                {mine.map(({ c }) => (
                  <span key={c.id} className="flex items-center gap-1 rounded border px-1 text-[11px] text-text-primary truncate" style={{ borderColor: hue(pid), background: `${hue(pid)}1f` }}>
                    <Sparkles size={10} className="shrink-0" />{c.name}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className={segCls} style={{ left: boxes[2].x - r.x, top: 4, width: boxes[2].w, height: r.h - 8 }}>
        <div className={head}><span>Table ticker</span><span className="normal-case tracking-normal inline-flex items-center gap-1"><ScrollText size={11} />full log ▸</span></div>
        <div className={`flex flex-col ${r.h >= 96 ? 'mt-1 gap-0.5' : 'mt-0.5'}`}>
          {ticker.map((m, i) => (
            <div key={i} className={`truncate leading-[1.3] ${r.h >= 96 ? 'text-[12px]' : 'text-[11.5px]'} ${i === ticker.length - 1 ? 'text-text-primary' : 'text-text-secondary'}`}>
              <span className="font-bold mr-1" style={{ color: hue(m.playerId) }}>{glyph(m.playerId)}</span>{m.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Ledger({ geo, game, wide }: { geo: TableGeometry; game: GameEntry; wide: boolean }) {
  const r = geo.ledger;
  if (!wide) {
    return (
      <div style={abs(r)} className="rounded-md border border-border-subtle bg-bg-surface flex flex-col items-center justify-start py-2 gap-2" title="The full log. At three or more players it folds to this spine; the ticker keeps the last three lines readable.">
        <ScrollText size={14} className="text-text-muted" />
        <span className="text-[10px] font-semibold tracking-[0.3em] text-text-muted [writing-mode:vertical-rl]">LOG · SPECTATORS 2</span>
      </div>
    );
  }
  return (
    <div style={abs(r)} className="rounded-md border border-border-subtle bg-bg-surface flex flex-col overflow-hidden">
      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted border-b border-border-subtle flex justify-between">
        <span className="inline-flex items-center gap-1.5"><ScrollText size={11} />Chat &amp; log</span><span>spectators 2</span>
      </div>
      <div className="flex-1 flex flex-col justify-end gap-1 px-3 py-2 text-[12.5px] text-text-secondary">
        {game.messages.map((m, i) => (
          <div key={i}><span className="font-bold mr-1" style={{ color: hue(m.playerId) }}>{glyph(m.playerId)}</span>{m.message}</div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1 px-3 pb-2">
        {['gg', 'ok', 'wait', 'go', 'thx'].map((s, i) => (
          <span key={s} className="rounded border border-border-subtle text-center text-[11px] text-text-muted py-0.5"><kbd className="font-sans text-accent mr-1">^{i + 1}</kbd>{s}</span>
        ))}
      </div>
      <div className="mx-3 mb-3 rounded-md border border-border-subtle bg-bg-base px-2.5 py-1.5 text-[12.5px] text-text-muted">Say something…</div>
    </div>
  );
}

// ── Near Edge: Reader · hand (or the history tray) · Action Bar ───────────────
function NearEdge(props: BoardProps) {
  const { geo, game, ui, readerDefault } = props;
  const me = game.localPlayerId;
  const hand = zoneCards(game.players[me], ZoneName.HAND);
  const last = [...ui.ledger].reverse().find((e) => e.state === 'done');
  const lastDrawId = [...ui.ledger].reverse().find((e) => e.state === 'done' && e.text.startsWith('drew'))?.id;
  const myTurn = game.activePlayerId === me;
  const next = PHASES[(game.activePhase + 1) % PHASES.length];
  const h = geo.hand;
  const ch = Math.min(h.h - 30, Math.round(geo.edge.h * 0.74));
  const cw = Math.round(ch * 0.716);
  const pitch = Math.min(cw + 6, (h.w - 16 - cw) / Math.max(1, hand.length - 1));
  const compact = geo.actions.h < 170;
  const keys: [string, string, ReactNode][] = [
    // Bare digits only for harmless or reversible actions; shuffle keeps today's Ctrl+S chord and
    // mulligan lives in the pre-game lobby, not on the in-game bar (critique #9).
    ['1', 'Untap', <RotateCcw size={15} key="i" />], ['2', 'Draw', <Layers size={15} key="i" />], ['^S', 'Shuffle', <Shuffle size={15} key="i" />],
    ['4', 'Look', <Eye size={15} key="i" />], ['5', 'Token', <Sparkles size={15} key="i" />], ['6', 'Dice', <Dices size={15} key="i" />],
    ['7', 'Tally', <Hash size={15} key="i" />], ['8', 'Combat', <Sword size={15} key="i" />], ['9', 'Clear', <Eraser size={15} key="i" />],
    ['\\', 'Palette', <Command size={15} key="i" />],
  ];
  return (
    <div style={abs(geo.edge)} className="bg-[#100c1a] border-t border-border-subtle">
      <Reader rect={{ ...geo.reader, x: geo.reader.x, y: geo.reader.y - geo.edge.y }} game={game} fallback={readerDefault} />
      <div style={{ ...abs({ ...h, y: h.y - geo.edge.y }) }} className={`rounded-md border overflow-hidden ${ui.tray ? 'border-amber-400/50 bg-[#1a1424]' : 'border-border-subtle bg-bg-surface'}`}>
        {!ui.tray ? (
          <>
            <span className="absolute left-2.5 top-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Hand · {hand.length}</span>
            {hand.map((c, i) => (
              <div key={c.id} className="absolute hover:-translate-y-2 transition-transform" style={{ left: 8 + i * pitch, top: 22, width: cw, height: ch, '--card-width': `${cw}px`, '--card-height': `${ch}px`, zIndex: i } as CSSProperties}>
                <Card name={c.name} />
              </div>
            ))}
          </>
        ) : (
          <>
            <span className="absolute left-2.5 top-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/80">Your recent actions · undo sends the reverse command to the table · Esc closes</span>
            <div className="absolute inset-x-2.5 top-7 bottom-2.5 grid grid-cols-2 auto-rows-min gap-x-3 gap-y-1.5">
              {[...ui.ledger].reverse().slice(0, 8).map((e) => ({ ...e, state: e.state === 'done' && e.text.startsWith('drew') && e.id !== lastDrawId ? 'lifo' as const : e.state })).map((e) => (
                <div key={e.id} className="flex items-center gap-2 rounded border border-border-subtle bg-bg-base/70 px-2 py-1 text-[12.5px] min-w-0">
                  <span className={`flex-1 truncate ${e.state === 'undone' ? 'line-through text-text-muted' : e.state === 'never' ? 'text-text-muted' : 'text-text-primary'}`}>{e.text}</span>
                  {e.state === 'done' && <button type="button" onClick={() => e.inverse?.()} className="shrink-0 inline-flex items-center gap-1 rounded bg-accent-secondary/40 hover:bg-accent-secondary px-1.5 text-[11px] font-semibold text-white"><Undo2 size={11} />undo</button>}
                  {e.state === 'undone' && <span className="shrink-0 text-[10px] text-text-muted">undone</span>}
                  {e.state === 'never' && <span className="shrink-0 text-[10px] text-text-muted" title="Shuffles, reveals and mulligans cannot be reversed">no undo</span>}
                  {e.state === 'lifo' && <span className="shrink-0 text-[10px] text-text-muted" title="The server undoes draws newest first">undo newer draw first</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div style={abs({ ...geo.actions, y: geo.actions.y - geo.edge.y })} className="rounded-md border border-border-subtle bg-bg-surface p-1.5 flex flex-col gap-1.5">
        <div className={`flex items-center gap-2 h-7 shrink-0 rounded-md px-2 text-[12px] ${last ? 'bg-accent-secondary/20 border border-accent-secondary/60 text-text-primary' : 'bg-bg-base/60 border border-border-subtle text-text-muted'}`}>
          <Undo2 size={13} className="shrink-0" />
          <span className="flex-1 truncate">{last ? last.text : 'Nothing to undo yet'}</span>
          {last && <button type="button" onClick={props.onUndo} className="shrink-0 rounded bg-accent-secondary hover:bg-accent px-1.5 text-[11px] font-semibold text-white">Ctrl+Z</button>}
          <button type="button" onClick={props.onTray} className="shrink-0 inline-flex items-center gap-1 rounded border border-border-strong px-1.5 text-[11px] text-text-secondary hover:text-white"><History size={11} />{ui.tray ? 'close' : 'history'}</button>
        </div>
        {/* Short Near Edge (1280 × 720): the ten keys fold to one row of icon + digit; labels move to tooltips. */}
        <div className={`flex-1 min-h-0 grid gap-1.5 ${compact ? 'grid-cols-10' : 'grid-cols-5'}`}>
          {keys.map(([k, label, icon]) => (
            <button type="button" key={k} title={`${label} (${k})`} className="rounded-md border border-border-subtle bg-bg-elevated hover:bg-accent-secondary/40 hover:border-accent flex flex-col items-center justify-center gap-0.5 text-text-secondary hover:text-white">
              {icon}
              {compact
                ? <kbd className="font-sans text-[10.5px] font-semibold text-accent">{k}</kbd>
                : <span className="text-[10.5px] font-semibold uppercase tracking-wide"><kbd className="font-sans text-accent mr-1">{k}</kbd>{label}</span>}
            </button>
          ))}
        </div>
        <div className={`${compact ? 'h-7' : 'h-9'} shrink-0 flex gap-1.5`}>
          <button type="button" disabled={!myTurn} className="flex-[2] rounded-md font-semibold text-[13px] text-white disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            style={{ background: myTurn ? next.tint : 'rgb(var(--bg-elevated))', border: `1px solid ${hue(game.activePlayerId)}` }}>
            {myTurn ? <><kbd className="font-sans opacity-80">0</kbd> Next: {next.label}</> : <><span style={{ color: hue(game.activePlayerId) }}>{glyph(game.activePlayerId)}</span> {game.players[game.activePlayerId]?.properties.userInfo?.name}’s turn · {PHASES[game.activePhase].label}</>}
          </button>
          <button type="button" disabled={!myTurn} className="flex-1 rounded-md bg-accent-secondary hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-[13px] text-white">End turn</button>
        </div>
      </div>
    </div>
  );
}

function Reader({ rect, game, fallback }: { rect: Rect; game: GameEntry; fallback: string | null }) {
  const { hoveredCard } = useHoveredCard();
  const name = hoveredCard?.name ?? fallback;
  const owner = name ? Object.entries(game.players).find(([, p]) => zoneCards(p, ZoneName.TABLE).some((c) => c.name === name)) : undefined;
  const onTable = owner ? zoneCards(owner[1], ZoneName.TABLE).find((c) => c.name === name) : undefined;
  const ch = rect.h - 8;
  const cw = Math.min(Math.round(ch * 0.716), rect.w - 8);
  return (
    <div style={abs(rect)} className="rounded-md border border-border-subtle bg-bg-surface overflow-hidden flex gap-2 p-1">
      {name ? (
        <>
          <div className="shrink-0 overflow-hidden rounded-[5%]" style={{ width: cw, height: Math.round(cw / 0.716) }}>
            <CardImage src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=large`} name={name} className="w-full h-full" />
          </div>
          {rect.w - cw > 90 && (
            <div className="min-w-0 py-1 pr-1 text-[11px] text-text-secondary flex flex-col gap-1">
              {owner && <span className="font-bold" style={{ color: hue(Number(owner[0])) }}>{glyph(Number(owner[0]))} {owner[1].properties.userInfo?.name}</span>}
              {onTable?.tapped && <span>tapped</span>}
              {onTable?.attacking && <span className="text-red-300">attacking</span>}
              {onTable?.pt && <span>P/T <b className="text-text-primary">{onTable.pt}</b></span>}
            </div>
          )}
        </>
      ) : (
        <div className="p-2 text-[12px] text-text-muted">Reader — hover any card or land tile to read it here at full size.</div>
      )}
    </div>
  );
}

// Player-targeted arrows end on the target's Threat Post; colour is the sender's seat hue.
function Arrows({ game, surface, geo }: { game: GameEntry; surface: React.RefObject<HTMLDivElement | null>; geo: TableGeometry }) {
  const [paths, setPaths] = useState<{ d: string; col: string; sx: number; sy: number }[]>([]);
  const [tick, setTick] = useState(0);
  // Taps animate a rotation; re-measure when it ends rather than mid-turn (critique #18).
  useEffect(() => {
    const root = surface.current;
    if (!root) {
      return;
    }
    const on = () => setTick((t) => t + 1);
    root.addEventListener('transitionend', on);
    return () => root.removeEventListener('transitionend', on);
  }, [surface]);
  useLayoutEffect(() => {
    const root = surface.current;
    if (!root) {
      return;
    }
    const base = root.getBoundingClientRect();
    // Every battlefield card resolves to the element that hosts it: its own card, the pile or
    // overflow cell it is folded into, or its shelf tile (critique #3).
    const host = (key: string) => root.querySelector(`[data-card-key="${key}"]`) ?? root.querySelector(`[data-hosts~="${key}"]`);
    const out: { d: string; col: string; sx: number; sy: number }[] = [];
    for (const p of Object.values(game.players)) {
      for (const a of Object.values(p.arrows)) {
        const from = host(`${a.startPlayerId}:${a.startCardId}`);
        const to = a.targetCardId < 0 ? root.querySelector(`[data-threat="${a.targetPlayerId}"]`) : host(`${a.targetPlayerId}:${a.targetCardId}`);
        if (!from || !to) {
          continue;
        }
        const f = from.getBoundingClientRect(); const
          t = to.getBoundingClientRect();
        const sx = f.left + f.width / 2 - base.left; const
          sy = f.top + f.height / 2 - base.top;
        const tx = t.left + t.width / 2 - base.left; const
          ty = t.top + t.height / 2 - base.top;
        const mx = (sx + tx) / 2; const
          my = (sy + ty) / 2 - 60;
        out.push({ d: `M${sx} ${sy} Q${mx} ${my} ${tx} ${ty}`, col: hue(a.startPlayerId), sx, sy });
      }
    }
    setPaths(out);
  }, [game, surface, geo, tick]);
  return (
    <svg className="absolute inset-0 pointer-events-none z-20" width="100%" height="100%">
      <defs>
        {paths.map((p, i) => (
          <marker key={i} id={`tah${i}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={p.col} />
          </marker>
        ))}
      </defs>
      {paths.map((p, i) => (
        <g key={i}>
          <path d={p.d} fill="none" stroke="#000" strokeOpacity=".45" strokeWidth="7" strokeLinecap="round" />
          <path d={p.d} fill="none" stroke={p.col} strokeWidth="4" strokeLinecap="round" markerEnd={`url(#tah${i})`} />
          <circle cx={p.sx} cy={p.sy} r="5" fill={p.col} stroke="#000" strokeOpacity=".5" />
        </g>
      ))}
    </svg>
  );
}

function fmtClock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

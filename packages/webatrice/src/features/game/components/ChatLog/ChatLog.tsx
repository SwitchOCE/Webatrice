import { useCallback, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare } from 'lucide-react';
import { classifyLogTone, games, type LogSegment, type LogTone } from '@cockatrice/datatrice';

import { renderGameLinks, useMentionCompleter } from '@app/components';
import { usePreference } from '@app/hooks';
import { ReportChatScope } from '@app/dialogs';
import { ShortcutScope, useShortcut } from '@app/feature-widgets/shortcuts';
import { useAppSelector } from '@app/store';

import { useGameId } from '../ui/GameIdContext';
import { useGameReadOnly } from '../ui/GameReadOnlyContext';
import { useCardPreviewActions } from '../ui/CardPreviewContext';

import { gameChatContext } from './gameChatContext';
import { logRowKey } from './logRowKey';
import { GAME_FOCUS_RING } from '../ui/focusRing';
import { formatElapsed, useGameLog } from './useGameLog';
import { formatLogDescriptor } from './formatLogDescriptor';

// Per-tone styling for event log lines. Cockatrice desktop uses a fixed
// palette per event kind (green turn banner, per-phase color, red for
// server messages, blue-highlighted numbers). We approximate that:
//   • turn   — emerald + bold  (round-boundary banner)
//   • phase  — sky              (phase-change label)
//   • system — rose italic      (join/leave/concede/deck-load)
//   • action — near-white       (routine card/attr/counter/arrow)
// The per-tone base color sets the "line color"; individual segments
// (card names / numbers) override with their own accent — matching
// Cockatrice's inline highlighting.
const TONE_CLASS: Record<LogTone, string> = {
  turn: 'text-success font-semibold',
  phase: 'text-sky-400 light:text-sky-700',
  system: 'text-rose-400 light:text-rose-700 italic',
  action: 'text-text-primary/85',
};

/** Format a wall-clock ms timestamp as `HH:MM:SS` in the user's local
 *  timezone. Mirrors Cockatrice desktop's `QDateTime::currentDateTime()
 *  .toString("hh:mm:ss")` — the log stamps events with the user's real
 *  clock, not the game timer. */
function formatWallClock(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const SEGMENT_CLASS: Record<LogSegment['kind'], string> = {
  plain: '',
  // Player names: semibold + slightly warmer than the base line.
  player: 'font-semibold text-text-primary',
  // Card names: italic accent purple. Matches Cockatrice's `<i>`-wrapped
  // `<a href="card://">` links (italic + blue in desktop). Wired below
  // to the shared preview hover so pointing at a card name in the log
  // shows it in the right-rail preview, just like hovering the card
  // itself on the battlefield.
  card: 'italic text-accent-primary hover:text-accent-primary-hover cursor-pointer underline decoration-dotted underline-offset-2',
  // Numbers: cyan, tabular. Cockatrice desktop highlights every
  // numeric literal (rolls, deltas, PT, counts) in bold blue —
  // makes counter deltas instantly scannable.
  number: 'font-semibold text-cyan-300 light:text-cyan-700 tabular-nums',
};

/**
 * Shared chat + event log used both in the pre-game lobby and inside
 * the game screen sidebar. Reads its gameId from `useGameId()` context
 * so both mount sites just render `<ChatLog />` — no prop threading.
 *
 * Event lines are rendered with per-token styling (card names, player
 * names, numbers each get their own accent color) and alternating row
 * backgrounds so consecutive log lines are visually separable.
 */
export default function ChatLog() {
  // A report opened from a name in this log attaches the game and its chat,
  // as desktop does for a report raised from a game's ChatView.
  const gameId = useGameId();
  const messages = useAppSelector((state) => (gameId != null ? games.Selectors.getMessages(state, gameId) : undefined));
  const getChatContext = useCallback(() => gameChatContext(messages ?? []), [messages]);
  return (
    <ReportChatScope gameId={gameId ?? undefined} getChatContext={getChatContext}>
      <ChatLogView />
    </ReportChatScope>
  );
}

function ChatLogView() {
  const { t } = useTranslation();
  const gameId = useGameId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const { setHoveredCard, openBigPreview, closeBigPreview } = useCardPreviewActions();
  const {
    messages,
    players,
    displaySeconds,
    draft,
    setDraft,
    handleMessagesScroll,
    handleSubmit,
    canChat,
    chatDisabledReason,
  } = useGameLog({ gameId, listRef });
  // Players and spectators, as desktop's TabGame adds each to its completer as they join.
  const names = useMemo(
    () => Object.values(players ?? {}).flatMap((player) => player.properties.userInfo?.name ?? []),
    [players],
  );
  const mention = useMentionCompleter({ names, value: draft, onValueChange: setDraft, inputRef });
  const stampGameTime = usePreference('useGameTime');
  // A replay is a recording: desktop's replay tab has no say box at all.
  const readOnly = useGameReadOnly();
  // Composite disabled state — no active game OR spectator-can't-chat OR replay.
  const inputDisabled = gameId == null || !canChat || readOnly;

  // Cockatrice-parity focus-chat shortcut (Shift+Enter). Registered
  // GLOBAL so it fires regardless of route, but only actually mounted
  // when ChatLog is on-screen. Disabled state gates it — focusing a
  // disabled input would be a no-op, but skipping the preventDefault
  // lets Shift+Enter fall through to whatever else is listening.
  useShortcut(
    'chat.focus',
    () => {
      const el = inputRef.current;
      if (!el || inputDisabled) {
        return;
      }
      el.focus();
      el.select();
    },
    { scope: ShortcutScope.GAME, enabled: !inputDisabled },
  );
  const inputTitle = chatDisabledReason ?? undefined;
  const inputPlaceholder = gameId == null
    ? t('ChatLog.unavailable')
    : (chatDisabledReason ?? t('ChatLog.placeholder'));

  return (
    <div data-testid="game-log" className="flex flex-col h-full min-h-0">
      {/* Header — label on the left, elapsed timer on the right. Timer
           hides when there's no active game (lobby chat renders with no
           gameId while the game hasn't started yet). */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 text-[10px] uppercase tracking-widest text-text-muted">
        <h2 id={headingId} className="flex items-center gap-1">
          <MessageSquare size={11} aria-hidden /> {t('ChatLog.heading')}
        </h2>
        {gameId != null && (
          <span
            data-testid="game-log-timer"
            className="tabular-nums normal-case tracking-normal"
          >
            {formatElapsed(displaySeconds)}
          </span>
        )}
      </div>

      {/* Messages — scrollable, pinned to bottom by useGameLog unless
           the user has scrolled up. Rows alternate bg to visually
           separate consecutive lines (Cockatrice does the same with
           its zebra-striped log).
           A polite live region (desktop has none; an accessibility
           addition): screen readers read each new line once, so draws,
           moves, life changes and opponents' chat are heard as they
           happen. Rows keep their key for life (logRowKey), so trimming
           the oldest lines never re-reads the rest. */}
      <div
        ref={listRef}
        role="log"
        // A tab stop in every browser, so the log can be scrolled from
        // the keyboard (Chrome and Firefox already focus scrollers).
        tabIndex={0}
        aria-live="polite"
        aria-relevant="additions"
        aria-labelledby={headingId}
        onScroll={handleMessagesScroll}
        className="scrollable flex-1 min-h-0 overflow-y-auto py-1 text-xs"
      >
        {messages.length === 0 && (
          <div className="italic text-text-muted px-3 py-1">{t('ChatLog.empty')}</div>
        )}
        {messages.map((m, idx) => {
          const isEvent = m.kind === 'event';
          const name =
            m.senderName
            ?? players?.[m.playerId]?.properties.userInfo?.name
            ?? t('GameLog.player.number', { id: m.playerId });
          // Per-message stamp, Cockatrice-style `[HH:MM:SS]`: the user's
          // local clock (desktop's `QDateTime::currentDateTime()`), or with
          // "Use game time instead of local time in game logs" the game time
          // the line was logged at (MessageLogWidget::getCurrentTime).
          const stamp = stampGameTime && m.gameSeconds !== undefined
            ? `[${formatElapsed(m.gameSeconds)}]`
            : m.timeReceived
              ? `[${formatWallClock(m.timeReceived)}]`
              : null;
          if (isEvent) {
            const formatted = m.descriptor ? formatLogDescriptor(m.descriptor, t) : { text: m.message, segments: m.segments };
            const tone = m.descriptor ? games.logTone(m.descriptor.kind) : classifyLogTone(m.message);
            return (
              <div
                key={logRowKey(m)}
                data-tone={tone}
                data-log-kind={m.descriptor?.kind}
                className={[
                  'px-3 py-0.5 leading-snug break-words',
                  TONE_CLASS[tone],
                  idx % 2 === 0 ? 'bg-transparent' : 'bg-black/15',
                ].join(' ')}
              >
                {stamp && (
                  <span className="text-text-muted font-normal not-italic tabular-nums mr-1.5">
                    {stamp}
                  </span>
                )}
                {formatted.segments && formatted.segments.length > 0 ? (
                  formatted.segments.map((seg, si) => {
                    if (seg.kind === 'card') {
                      return (
                        <span
                          key={si}
                          className={SEGMENT_CLASS.card}
                          onMouseEnter={() => setHoveredCard({ name: seg.text })}
                          onMouseLeave={() => setHoveredCard(null)}
                          onMouseDown={(e) => {
                            // Match Card.tsx: middle-mouse-down opens
                            // the big-preview modal, mouse-up closes it.
                            if (e.button === 1) {
                              e.preventDefault();
                              openBigPreview({ name: seg.text });
                            }
                          }}
                          onMouseUp={(e) => {
                            if (e.button === 1) {
                              closeBigPreview();
                            }
                          }}
                        >
                          {seg.text}
                        </span>
                      );
                    }
                    return (
                      <span key={si} className={SEGMENT_CLASS[seg.kind]}>
                        {seg.text}
                      </span>
                    );
                  })
                ) : (
                  formatted.text
                )}
              </div>
            );
          }
          return (
            <div
              key={logRowKey(m)}
              className={[
                'px-3 py-0.5 text-text-primary leading-snug break-words',
                idx % 2 === 0 ? 'bg-transparent' : 'bg-black/15',
              ].join(' ')}
            >
              {stamp && (
                <span className="text-text-muted font-normal tabular-nums mr-1.5">
                  {stamp}
                </span>
              )}
              <span className="font-semibold text-accent">{name}:</span>{' '}
              <span>{renderGameLinks(m.message)}</span>
            </div>
          );
        })}
      </div>

      {/* Input — submits on Enter via the form's onSubmit. Named by its
           sr-only label alone. */}
      <form
        onSubmit={handleSubmit}
        hidden={readOnly}
        className="shrink-0 p-2 border-t border-border-subtle"
      >
        <label htmlFor="game-log-say-input" className="sr-only">
          {t('ChatLog.inputLabel')}
        </label>
        <div className="relative">
          <input
            id="game-log-say-input"
            ref={inputRef}
            type="text"
            value={draft}
            {...mention.inputProps}
            disabled={inputDisabled}
            placeholder={inputPlaceholder}
            // Native browser tooltip on hover — surfaces the disable
            // reason (e.g. "Spectators are not allowed to chat in this
            // game.") when the field is greyed out.
            title={inputTitle}
            aria-disabled={inputDisabled}
            className={[
              'w-full bg-bg-base border border-border-subtle rounded-md px-3 py-1.5 text-xs',
              'text-text-primary placeholder:text-text-muted focus:outline-none',
              GAME_FOCUS_RING,
              'focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
            ].join(' ')}
          />
          {mention.popup}
        </div>
      </form>
    </div>
  );
}

import type { CSSProperties } from 'react';

/**
 * Chat mention and alert-word matching, after desktop's ChatView (chat_view.cpp checkMention /
 * checkWord). Shared by the chat renderer, which highlights matches, and the chat alert watcher,
 * which plays the mention sound and raises notifications.
 */

/** A moderator or administrator writing `@/all` pings everyone in the room (isModeratorSendingGlobal). */
export const ALL_MENTION = '@/all';

export type ChatAlertKind = 'mention' | 'allMention' | 'word';

export interface ChatAlertContext {
  selfName: string | null;
  /** The "Enable chat mentions" preference. */
  mentions: boolean;
  highlightWords: readonly string[];
  /** Whether the sender is a moderator or administrator, who alone may use `@/all`. */
  senderIsModerator: boolean;
}

/**
 * How the reader wants mentions and alert words drawn (Settings → Chat). Renderers memoize on it,
 * so build it once per preference change.
 */
export interface ChatHighlight {
  selfName: string | null;
  /** "Enable chat mentions": off draws every @name as plain text. */
  mentions: boolean;
  mentionStyle: CSSProperties;
  highlightWords: readonly string[];
  highlightStyle: CSSProperties;
  /** The sender is a moderator or administrator, so their `@/all` pings the room. */
  senderIsModerator: boolean;
}

/** Desktop stores a colour as six hex digits and draws white text on it unless inverted off. */
export function highlightStyle(hexColor: string, whiteText: boolean): CSSProperties {
  return { backgroundColor: `#${hexColor}`, color: whiteText ? 'white' : 'black' };
}

export type TextSegmentKind = 'plain' | 'word' | 'allMention';

export interface TextSegment {
  kind: TextSegmentKind;
  text: string;
}

const TRAILING_PUNCTUATION = /[^\p{L}\p{N}]+$/u;
const MENTION = /(?:^|\s)@(\w+)/g;

/** The alert-word preference is a space-separated list; matching ignores case. */
export function parseHighlightWords(raw: string): string[] {
  return raw.split(/\s+/).filter(Boolean);
}

/** Splits trailing punctuation off a word, as desktop's extractNextWord does. */
function splitTrailing(word: string): [core: string, rest: string] {
  const match = word.match(TRAILING_PUNCTUATION);
  return match ? [word.slice(0, match.index), match[0]] : [word, ''];
}

export function isOwnMention(name: string, selfName: string | null): boolean {
  return selfName != null && name.toLowerCase() === selfName.toLowerCase();
}

/**
 * Cuts plain chat text into runs to draw normally and runs to highlight: alert words, and `@/all`
 * when its sender may use it. Whitespace and punctuation stay in the plain runs.
 */
export function segmentText(
  text: string,
  { highlightWords, allMention }: { highlightWords: readonly string[]; allMention: boolean },
): TextSegment[] {
  const words = new Set(highlightWords.map((w) => w.toLowerCase()));
  if (words.size === 0 && !allMention) {
    return [{ kind: 'plain', text }];
  }

  const segments: TextSegment[] = [];
  const push = (kind: TextSegmentKind, part: string) => {
    if (!part) {
      return;
    }
    const last = segments[segments.length - 1];
    if (kind === 'plain' && last?.kind === 'plain') {
      last.text += part;
    } else {
      segments.push({ kind, text: part });
    }
  };

  for (const token of text.split(/(\s+)/)) {
    const [core, rest] = splitTrailing(token);
    if (allMention && core.toLowerCase() === ALL_MENTION) {
      push('allMention', core);
      push('plain', rest);
    } else if (core && words.has(core.toLowerCase())) {
      push('word', core);
      push('plain', rest);
    } else {
      push('plain', token);
    }
  }
  return segments;
}

/**
 * The strongest alert a chat line raises for the reader: a mention of their own name, then a
 * moderator's `@/all`, then one of their alert words. Desktop plays a sound and shows a popup for
 * the first two and only flashes the window for an alert word.
 */
export function findChatAlert(text: string, ctx: ChatAlertContext): ChatAlertKind | null {
  if (ctx.mentions) {
    for (const [, name] of text.matchAll(MENTION)) {
      if (isOwnMention(name, ctx.selfName)) {
        return 'mention';
      }
    }
  }
  const segments = segmentText(text, {
    highlightWords: ctx.highlightWords,
    allMention: ctx.mentions && ctx.senderIsModerator,
  });
  if (segments.some((s) => s.kind === 'allMention')) {
    return 'allMention';
  }
  return segments.some((s) => s.kind === 'word') ? 'word' : null;
}

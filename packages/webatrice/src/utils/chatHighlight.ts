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
  /** Full online directory; resolve a complete name before stripping punctuation. */
  userNames?: readonly string[];
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
  /** Full online directory; resolve a complete name before stripping punctuation. */
  userNames?: readonly string[];
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

/** The alert-word preference is a space-separated list; matching ignores case. */
export function parseHighlightWords(raw: string): string[] {
  return raw.split(/\s+/).filter(Boolean);
}

/** Splits trailing punctuation off a word, as desktop's extractNextWord does. */
function splitTrailing(word: string): [core: string, rest: string] {
  const match = word.match(TRAILING_PUNCTUATION);
  return match ? [word.slice(0, match.index), match[0]] : [word, ''];
}

/** ChatView::appendMessage (chat_view.cpp:385) consumes punctuation before starting a word.
 * Once a word or mention starts, extractNextWord/checkMention consume through the next space.
 * This keeps email addresses and punctuation inside names intact.
 */
export function tokenizeChat(text: string): { kind: 'plain' | 'word' | 'mention'; text: string }[] {
  const tokens: { kind: 'plain' | 'word' | 'mention'; text: string }[] = [];
  for (const part of text.matchAll(/[^\p{L}\p{N}@]+|[@\p{L}\p{N}][^ ]*/gu)) {
    const value = part[0];
    tokens.push({ kind: value.startsWith('@') ? 'mention' : /^[\p{L}\p{N}]/u.test(value) ? 'word' : 'plain', text: value });
  }
  return tokens;
}

export function isOwnMention(name: string, selfName: string | null): boolean {
  return selfName != null && name.toLowerCase() === selfName.toLowerCase();
}

export interface Mention {
  /** The username the mention names. */
  name: string;
  /** Punctuation after the name, which belongs to the sentence. */
  rest: string;
  /** Whether it names the reader. */
  own: boolean;
}

/**
 * Reads a `@token` (without the `@`), after desktop's checkMention (chat_view.cpp), which cuts
 * characters off the end only after checking the complete name in the online directory.
 * `@foo.bar` mentions `foo.bar`, never `foo`; `@foo.` mentions `foo`. Any other name loses its
 * trailing punctuation.
 */
export function parseMention(token: string, selfName: string | null, userNames: readonly string[] = []): Mention {
  const directory = new Set(userNames.map((name) => name.toLowerCase()));
  for (let name = token; name; name = name.slice(0, -1)) {
    if (directory.has(name.toLowerCase()) || isOwnMention(name, selfName)) {
      return { name, rest: token.slice(name.length), own: isOwnMention(name, selfName) };
    }
    if (!TRAILING_PUNCTUATION.test(name)) {
      break;
    }
  }
  const [name, rest] = splitTrailing(token);
  return { name, rest, own: false };
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

  for (const { text: token, kind } of tokenizeChat(text)) {
    const [core, rest] = splitTrailing(token);
    if (allMention && core.toLowerCase() === ALL_MENTION) {
      push('allMention', core);
      push('plain', rest);
    } else if (kind === 'word' && core && words.has(core.toLowerCase())) {
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
    for (const token of tokenizeChat(text)) {
      if (token.kind === 'mention' && parseMention(token.text.slice(1), ctx.selfName, ctx.userNames).own) {
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

/** The `@name` being typed at the caret: where its `@` is and what follows it so far. */
export interface MentionQuery {
  start: number;
  /** The typed text, `@` included, as desktop matches it against "@name" entries. */
  prefix: string;
}

/**
 * Desktop's LineEditCompleter mention trigger: the last `@` before the caret, at the start of the
 * text or after whitespace. Unlike desktop, a prefix that already holds whitespace (a finished
 * mention followed by a space) is no query, rather than a query nothing matches.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const start = text.lastIndexOf('@', caret - 1);
  if (start === -1 || (start > 0 && !/\s/.test(text[start - 1]))) {
    return null;
  }
  const prefix = text.slice(start, caret);
  return /\s/.test(prefix) ? null : { start, prefix };
}

/**
 * The names a prefix completes to, case-insensitively and from the start (desktop's
 * createMentionCompleter: Qt::MatchStartsWith, Qt::CaseInsensitive), in their given order.
 */
export function matchMentions(names: readonly string[], prefix: string, limit: number): string[] {
  const typed = prefix.replace(/^@/, '').toLowerCase();
  const matches: string[] = [];
  for (const name of names) {
    if (name.toLowerCase().startsWith(typed) && !matches.includes(name)) {
      matches.push(name);
      if (matches.length === limit) {
        break;
      }
    }
  }
  return matches;
}

/**
 * Replaces the query with `@name ` and puts the caret after the space, as desktop's
 * insertCompletion does; text after the caret is kept.
 */
export function applyMention(text: string, query: MentionQuery, caret: number, name: string) {
  const inserted = `@${name} `;
  return {
    text: text.slice(0, query.start) + inserted + text.slice(caret),
    caret: query.start + inserted.length,
  };
}

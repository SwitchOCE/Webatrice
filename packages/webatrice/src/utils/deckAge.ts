export type DeckAge = { key: 'unknown' | 'justNow' } | { text: string };

const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();

function relativeFormat(locale: string): Intl.RelativeTimeFormat {
  let format = relativeFormats.get(locale);
  if (!format) {
    format = new Intl.RelativeTimeFormat(locale || undefined, { style: 'narrow' });
    relativeFormats.set(locale, format);
  }
  return format;
}

export function formatDeckAge(unixSeconds: number, locale: string, now = Date.now()): DeckAge {
  if (!unixSeconds) {
    return { key: 'unknown' };
  }
  const then = new Date(unixSeconds * 1000);
  const diffSec = (now - then.getTime()) / 1000;
  if (diffSec < 60) {
    return { key: 'justNow' };
  }
  const relative = relativeFormat(locale);
  if (diffSec < 3600) {
    return { text: relative.format(-Math.floor(diffSec / 60), 'minute') };
  }
  if (diffSec < 86400) {
    return { text: relative.format(-Math.floor(diffSec / 3600), 'hour') };
  }
  if (diffSec < 604800) {
    return { text: relative.format(-Math.floor(diffSec / 86400), 'day') };
  }
  return { text: then.toLocaleDateString(locale || undefined) };
}

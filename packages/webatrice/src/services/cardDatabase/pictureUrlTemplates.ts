/**
 * Picture URL templates — a port of desktop's `CardPictureToLoad::transformUrl`
 * (`card_picture_to_load.cpp`) and its `DownloadSettings::DEFAULT_DOWNLOAD_URLS`.
 * A template is a URL with `!placeholder!` tokens; when the card or printing
 * lacks a value a template asks for, the template yields no URL for that
 * card and the resolver moves on to the next one.
 */

export const DEFAULT_PICTURE_URL_TEMPLATES: readonly string[] = [
  'https://cards.scryfall.io/large/!prop:side!/!set:uuid_substr_0_1!/!set:uuid_substr_1_1!/!set:uuid!.jpg',
  'https://api.scryfall.com/cards/!set:uuid!?format=image&face=!prop:side!&lang=!sflang!',
  'https://api.scryfall.com/cards/multiverse/!set:muid!?format=image&lang=!sflang!',
  'https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=!set:muid!&type=card',
  'https://gatherer.wizards.com/Handlers/Image.ashx?name=!name!&type=card',
];

/** Placeholders a template may use; any left unfilled voids the template. */
export const PICTURE_URL_PLACEHOLDERS: readonly string[] = [
  '!name!',
  '!name_lower!',
  '!corrected_name!',
  '!corrected_name_lower!',
  '!setcode!',
  '!setcode_lower!',
  '!setname!',
  '!setname_lower!',
  '!sflang!',
  '!prop:<property>!',
  '!set:<property>!',
];

export interface PictureTemplateSet {
  code: string;
  longName?: string;
  /** Attributes of the card's `<set>` element: uuid, muid, num, rarity, picurl, … */
  printing: Readonly<Record<string, string>>;
}

export interface PictureTemplateContext {
  name: string;
  /** The card's `<prop>` children: side, layout, colors, … */
  props: Readonly<Record<string, string>>;
  set?: PictureTemplateSet;
  /** Card language for `!sflang!` (desktop `cardsDisplay/cardLang`). */
  lang: string;
}

const UNFILLED_PLACEHOLDER = new RegExp(
  '!(?:(?:corrected_)?name(?:_lower)?|setcode(?:_lower)?|setname(?:_lower)?|sflang|localizedName|(?:prop|set):[^!]+)!',
);
const FILL_WITH = /^(.+)_fill_with_(.+)$/;
const SUBSTR = /^(.+)_substr_(\d+)_(\d+)$/;

/** `CardInfo::getCorrectedName`: strips characters reserved in file paths. */
export function correctedCardName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/( \/\/ |[*<>:"\\?\x00-\x08\x10-\x1f])/g, '').replace(/[/\x09-\x0f]/g, ' ');
}

/** `QUrl::toPercentEncoding`: everything but RFC 3986 unreserved characters. */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Resolve every `!<kind>:<property>!` token in `template` against `lookup`,
 * honouring desktop's `_substr_<pos>_<len>` and `_fill_with_<pad>` suffixes.
 * Returns false when a requested property is missing or too short.
 */
function fillProperties(
  template: string,
  kind: 'prop' | 'set',
  lookup: (property: string) => string | undefined,
  out: Map<string, string>,
): boolean {
  const tokens = template.matchAll(new RegExp(`!${kind}:([^!]+)!`, 'g'));
  for (const [, spec] of tokens) {
    let property = spec;
    let fillWith = '';
    let subStrPos = 0;
    let subStrLen = -1;

    const fill = FILL_WITH.exec(spec);
    const sub = fill ? null : SUBSTR.exec(spec);
    if (fill) {
      [, property, fillWith] = fill;
    } else if (sub) {
      property = sub[1];
      subStrPos = Number(sub[2]);
      subStrLen = Number(sub[3]);
    }

    let value = lookup(property) ?? '';
    if (!value) {
      return false;
    }
    if (subStrLen > 0) {
      if (subStrPos + subStrLen > value.length) {
        return false;
      }
      value = value.substring(subStrPos, subStrPos + subStrLen);
    }
    if (fillWith) {
      if (fillWith.length < value.length) {
        return false;
      }
      value = fillWith.slice(0, fillWith.length - value.length) + value;
    }
    out.set(`!${kind}:${spec}!`, value);
  }
  return true;
}

/**
 * Expand one template for one card/printing. Returns null when the template
 * needs information this card does not have — desktop's empty-string result.
 */
export function expandPictureUrlTemplate(template: string, ctx: PictureTemplateContext): string | null {
  const values = new Map<string, string>([
    ['!name!', ctx.name],
    ['!name_lower!', ctx.name.toLowerCase()],
    ['!corrected_name!', correctedCardName(ctx.name)],
    ['!corrected_name_lower!', correctedCardName(ctx.name).toLowerCase()],
    ['!sflang!', ctx.lang],
  ]);

  if (!fillProperties(template, 'prop', (p) => ctx.props[p], values)) {
    return null;
  }

  if (ctx.set) {
    const { code, longName = '', printing } = ctx.set;
    values.set('!setcode!', code);
    values.set('!setcode_lower!', code.toLowerCase());
    values.set('!setname!', longName);
    values.set('!setname_lower!', longName.toLowerCase());
    if (!fillProperties(template, 'set', (p) => printing[p], values)) {
      return null;
    }
  }

  let url = template;
  for (const [placeholder, value] of values) {
    if (!url.includes(placeholder)) {
      continue;
    }
    if (!value) {
      return null;
    }
    url = url.split(placeholder).join(percentEncode(value));
  }

  return UNFILLED_PLACEHOLDER.test(url) ? null : url;
}

/** Validation for the template editor: an absolute http(s) URL. */
export function isValidPictureUrlTemplate(template: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(template.trim());
}

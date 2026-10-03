import type { Token } from '@app/services';
import type { TFunction } from 'i18next';
import { z } from 'zod';

/** `MAX_NAME_LENGTH` (`string_limits.h`), used by every field of `dlg_edit_tokens`. */
export const TOKEN_FIELD_MAX_LENGTH = 255;

/** Desktop's color combo: white, blue, black, red, green, multicolor, colorless (`c`: no colors). */
export const TOKEN_COLORS = ['w', 'u', 'b', 'r', 'g', 'm', 'c'] as const;
export type TokenColor = (typeof TOKEN_COLORS)[number];

export interface TokenData {
  color: TokenColor;
  pt: string;
  annotation: string;
}

/** `DlgEditTokens::actAddToken`: a token in the TK set typed "Token". */
export function createCustomToken(name: string): Token {
  return {
    name: { value: name },
    text: { value: '' },
    prop: { value: { type: { value: 'Token' }, maintype: { value: 'Token' } } },
    set: { value: 'TK' },
    token: { value: '1' },
  };
}

export function readTokenData(token: Token): TokenData {
  const props = token.prop?.value ?? {};
  const color = (props.colors?.value ?? '').charAt(0).toLowerCase();
  return {
    color: (TOKEN_COLORS as readonly string[]).includes(color) ? color as TokenColor : 'c',
    pt: props.pt?.value ?? '',
    annotation: token.text?.value ?? '',
  };
}

/** Applies the editor fields the way `colorChanged` / `ptChanged` / `annotationChanged` do. */
export function applyTokenData(token: Token, data: TokenData): Token {
  const { colors: _colors, pt: _pt, ...rest } = token.prop?.value ?? {};
  return {
    ...token,
    text: { value: data.annotation },
    prop: {
      value: {
        ...rest,
        ...(data.color !== 'c' ? { colors: { value: data.color.toUpperCase() } } : {}),
        ...(data.pt ? { pt: { value: data.pt } } : {}),
      },
    },
  };
}

export const buildAddTokenSchema = (t: TFunction) => z.object({
  name: z.string().trim()
    .min(1, t('Common.validation.required'))
    .max(TOKEN_FIELD_MAX_LENGTH, t('EditTokens.validation.tooLong', { max: TOKEN_FIELD_MAX_LENGTH })),
});

export type AddTokenValues = z.infer<ReturnType<typeof buildAddTokenSchema>>;

export const buildTokenDataSchema = (t: TFunction) => z.object({
  color: z.enum(TOKEN_COLORS),
  pt: z.string().max(TOKEN_FIELD_MAX_LENGTH, t('EditTokens.validation.tooLong', { max: TOKEN_FIELD_MAX_LENGTH })),
  annotation: z.string().max(TOKEN_FIELD_MAX_LENGTH, t('EditTokens.validation.tooLong', { max: TOKEN_FIELD_MAX_LENGTH })),
});

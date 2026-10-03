import { z } from 'zod';
import type { TFunction } from 'i18next';

/** Desktop's cap on any free-text field (libcockatrice_utility string_limits.h MAX_TEXT_LENGTH). */
export const MAX_TEXT_LENGTH = 0xfff;

// Desktop: "Separate words with a space, alphanumeric characters only".
const ALERT_WORDS = /^[\p{L}\p{N}\s]*$/u;

export const buildHighlightWordsSchema = (t: TFunction) =>
  z.object({
    words: z.string().regex(ALERT_WORDS, t('SettingsChat.highlightWords.invalid')),
  });

export type HighlightWordsValues = z.infer<ReturnType<typeof buildHighlightWordsSchema>>;

export const buildMessageMacroSchema = (t: TFunction) =>
  z.object({
    message: z
      .string()
      .trim()
      .min(1, t('Common.validation.required'))
      .max(MAX_TEXT_LENGTH, t('SettingsChat.macros.tooLong', { max: MAX_TEXT_LENGTH })),
  });

export type MessageMacroValues = z.infer<ReturnType<typeof buildMessageMacroSchema>>;

import {
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useListboxCombobox, usePreference, type ListboxComboboxInputProps } from '@app/hooks';

import { applyMention, findMentionQuery, matchMentions, type MentionQuery } from './mentionQuery';

/** Rows the list shows before it scrolls, desktop's setMaxVisibleItems(5). */
const VISIBLE_ROWS = 5;
/** Matches rendered at most, so a bare `@` in a busy room stays a short list. */
const MAX_MATCHES = 50;

export interface MentionCompleterOptions {
  /** Who can be mentioned: the room's users, the game's players and spectators, the peer. */
  names: readonly string[];
  value: string;
  onValueChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export interface MentionCompleter {
  /** Spread onto the chat input; supplies its `onChange`, so the input needs no other. */
  inputProps: Partial<ListboxComboboxInputProps> & {
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onSelect?: () => void;
    onBlur?: () => void;
  };
  /** The suggestion list; render it inside a `relative` box around the input. */
  popup: ReactNode;
}

const sameQuery = (a: MentionQuery | null, b: MentionQuery | null) =>
  a?.start === b?.start && a?.prefix === b?.prefix;

/**
 * Chat › "Enable mention completer": typing `@` in a chat input suggests the names that can be
 * mentioned, desktop's LineEditCompleter with its mention completer. Keyboard first: Arrow keys
 * move through the suggestions, Enter or Tab inserts `@name ` (Tab then moves focus on), Escape
 * closes the list. The input is an ARIA combobox and the list a listbox (useListboxCombobox).
 * With the setting off the input is left as it was.
 */
export function useMentionCompleter({ names, value, onValueChange, inputRef }: MentionCompleterOptions): MentionCompleter {
  const { t } = useTranslation();
  const enabled = usePreference('chatMentionCompleter');
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [active, setActive] = useState(0);
  const pendingCaret = useRef<number | null>(null);

  const matches = enabled && query ? matchMentions(names, query.prefix, MAX_MATCHES) : [];
  const open = matches.length > 0;
  const activeIndex = Math.min(active, matches.length - 1);

  // Put the caret after an inserted mention once the new text has rendered.
  useLayoutEffect(() => {
    if (pendingCaret.current !== null) {
      inputRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value, inputRef]);

  const follow = (input: HTMLInputElement) => {
    const next = findMentionQuery(input.value, input.selectionStart ?? input.value.length);
    if (!sameQuery(next, query)) {
      setQuery(next);
      setActive(0);
    }
  };

  const accept = (index: number) => {
    const input = inputRef.current;
    if (!query || !input) {
      return;
    }
    const result = applyMention(value, query, input.selectionStart ?? value.length, matches[index]);
    pendingCaret.current = result.caret;
    setQuery(null);
    onValueChange(result.text);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    onValueChange(event.target.value);
    if (enabled) {
      follow(event.target);
    }
  };

  // Tab inserts and lets focus move on, as desktop's LineEditCompleter::focusOutEvent does. Escape
  // only closes the list; with it closed, Escape is the page's (a chat dialog closes).
  const { listboxId, inputProps, getOptionProps } = useListboxCombobox({
    count: matches.length,
    open,
    highlight: activeIndex,
    onHighlightChange: setActive,
    onAccept: accept,
    onClose: () => setQuery(null),
    acceptOnTab: true,
  });

  if (!enabled) {
    return { inputProps: { onChange }, popup: null };
  }

  return {
    inputProps: {
      ...inputProps,
      onChange,
      onSelect: () => inputRef.current && follow(inputRef.current),
      onBlur: () => setQuery(null),
    },
    popup: (
      // ARIA 1.2 requires aria-controls on a combobox, so the listbox is always rendered (hidden when empty).
      <ul
        id={listboxId}
        role="listbox"
        hidden={!open}
        aria-label={t('MentionCompleter.label')}
        className={[
          'absolute bottom-full left-0 z-20 mb-1 w-full max-w-xs overflow-y-auto',
          'rounded-md border border-border-subtle bg-bg-elevated py-1 text-sm shadow-lg',
        ].join(' ')}
        style={{ maxHeight: `${VISIBLE_ROWS * 1.75 + 0.5}rem` }}
      >
        {matches.map((name, index) => {
          // Focus stays in the input, so the caret is still where the mention goes.
          const option = getOptionProps(index);
          return (
            <li
              key={name}
              {...option}
              className={[
                'h-7 cursor-pointer truncate px-3 leading-7',
                option['aria-selected'] ? 'bg-accent text-white' : 'text-text-primary hover:bg-bg-base',
              ].join(' ')}
            >
              @{name}
            </li>
          );
        })}
      </ul>
    ),
  };
}

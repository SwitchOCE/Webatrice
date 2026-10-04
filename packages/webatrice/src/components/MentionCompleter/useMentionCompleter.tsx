import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@app/hooks';

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
  inputProps: {
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
    onSelect?: () => void;
    onBlur?: () => void;
    role?: 'combobox';
    'aria-autocomplete'?: 'list';
    'aria-expanded'?: boolean;
    'aria-controls'?: string;
    'aria-activedescendant'?: string;
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
 * closes the list. The input
 * is an ARIA combobox and the list a listbox. With the setting off the input is left as it was.
 */
export function useMentionCompleter({ names, value, onValueChange, inputRef }: MentionCompleterOptions): MentionCompleter {
  const { t } = useTranslation();
  const enabled = usePreference('chatMentionCompleter');
  const listboxId = useId();
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [active, setActive] = useState(0);
  const pendingCaret = useRef<number | null>(null);
  const activeOption = useRef<HTMLLIElement>(null);

  const matches = enabled && query ? matchMentions(names, query.prefix, MAX_MATCHES) : [];
  const open = matches.length > 0;
  const activeIndex = Math.min(active, matches.length - 1);
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  // Put the caret after an inserted mention once the new text has rendered.
  useLayoutEffect(() => {
    if (pendingCaret.current !== null) {
      inputRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value, inputRef]);

  useEffect(() => {
    // jsdom has no scrollIntoView.
    activeOption.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open]);

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

  if (!enabled) {
    return { inputProps: { onChange }, popup: null };
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Keys that confirm an IME composition belong to the composition.
    if (!open || event.nativeEvent.isComposing) {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        setActive((activeIndex + 1) % matches.length);
        break;
      case 'ArrowUp':
        setActive((activeIndex - 1 + matches.length) % matches.length);
        break;
      case 'Enter':
        accept(activeIndex);
        break;
      case 'Tab':
        // Accept and let focus move on, as desktop's LineEditCompleter::focusOutEvent and the
        // APG list autocomplete do.
        if (!event.shiftKey) {
          accept(activeIndex);
        }
        return;
      case 'Escape':
        setQuery(null);
        // Closing the list is all Escape does here, not closing a dialog or leaving the game.
        event.stopPropagation();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return {
    inputProps: {
      onChange,
      onKeyDown,
      onSelect: () => inputRef.current && follow(inputRef.current),
      onBlur: () => setQuery(null),
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': open,
      // ARIA 1.2 requires it on a combobox, so the listbox is always rendered (hidden when empty).
      'aria-controls': listboxId,
      'aria-activedescendant': open ? optionId(activeIndex) : undefined,
    },
    popup: (
      // TODO: share the combobox/listbox logic (arrow keys, aria-activedescendant, focus kept in
      // the input, Escape closes first) with PR 31's QuickAddSearch as a `useComboboxListbox`
      // hook, once PR 31 is in.
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
        {matches.map((name, index) => (
          <li
            key={name}
            id={optionId(index)}
            ref={index === activeIndex ? activeOption : undefined}
            role="option"
            aria-selected={index === activeIndex}
            className={[
              'h-7 cursor-pointer truncate px-3 leading-7',
              index === activeIndex ? 'bg-accent text-white' : 'text-text-primary hover:bg-bg-base',
            ].join(' ')}
            // Keep focus in the input, so the caret is still where the mention goes.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => accept(index)}
          >
            @{name}
          </li>
        ))}
      </ul>
    ),
  };
}

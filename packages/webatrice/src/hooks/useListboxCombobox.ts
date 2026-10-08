import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';

export interface ListboxComboboxOptions {
  /** How many options the listbox shows. */
  count: number;
  /** The options are listed (not hidden behind a closed or still-searching popup). The combobox
   *  is expanded while they are and there is at least one. */
  open: boolean;
  /** The highlighted option, -1 for none. The caller owns it and resets it as its options change. */
  highlight: number;
  onHighlightChange: (index: number) => void;
  /** Takes the option at `index`: Enter on the highlight, or a click. */
  onAccept: (index: number) => void;
  /** Escape's first step: close the popup. */
  onClose: () => void;
  /**
   * A status panel shows in the listbox's place (searching, no matches): the
   * first Escape closes it too. An expanded listbox always counts.
   */
  popupShown?: boolean;
  /**
   * ↓ or ↑ with the list closed opens it, on the highlighted option (↓ with
   * none: the first; ↑: the last), as the APG combobox does. Without this the
   * closed list leaves the arrows alone.
   */
  onOpen?: () => void;
  /** Enter with no option highlighted (quick add adds the typed text). Without this Enter is left alone. */
  onEnterWithoutOption?: () => void;
  /** Escape's second step, with no popup up (quick add clears the field). Without this Escape is left to the page. */
  onEscapeClosed?: () => void;
  /** Tab takes the highlighted option and lets focus move on (APG list autocomplete). */
  acceptOnTab?: boolean;
  /** Pointing at an option highlights it. Off, the keyboard's highlight stays put under the mouse. */
  highlightOnHover?: boolean;
}

export interface ListboxComboboxInputProps {
  role: 'combobox';
  'aria-autocomplete': 'list';
  'aria-expanded': boolean;
  'aria-controls': string;
  'aria-activedescendant': string | undefined;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export interface ListboxComboboxOptionProps {
  id: string;
  role: 'option';
  'aria-selected': boolean;
  ref: RefObject<HTMLLIElement | null> | undefined;
  onMouseEnter: (() => void) | undefined;
  onMouseDown: (event: MouseEvent) => void;
  onClick: () => void;
}

export interface ListboxCombobox {
  /** The listbox's id. Render the listbox at all times, `hidden` while closed: `aria-controls` points at it. */
  listboxId: string;
  /** Spread onto the text input. */
  inputProps: ListboxComboboxInputProps;
  /** Spread onto each option. */
  getOptionProps: (index: number) => ListboxComboboxOptionProps;
}

/**
 * An ARIA 1.2 combobox over a text input with a listbox popup: focus stays in
 * the input while ↑/↓ move the highlight (wrapping, announced through
 * `aria-activedescendant`), Enter takes the highlighted option, and Escape
 * closes the popup before anything else. Quick add and the chat mention
 * completer share it; what the options are, and what taking one does, stays
 * with the caller.
 */
export function useListboxCombobox({
  count,
  open,
  highlight,
  onHighlightChange,
  onAccept,
  onClose,
  popupShown,
  onOpen,
  onEnterWithoutOption,
  onEscapeClosed,
  acceptOnTab = false,
  highlightOnHover = false,
}: ListboxComboboxOptions): ListboxCombobox {
  const listboxId = useId();
  const activeOption = useRef<HTMLLIElement>(null);
  const expanded = open && count > 0;
  const active = expanded && highlight >= 0 && highlight < count ? highlight : -1;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  useEffect(() => {
    // jsdom has no scrollIntoView.
    activeOption.current?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Keys that confirm an IME composition belong to the composition.
    if (event.nativeEvent.isComposing) {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        const down = event.key === 'ArrowDown';
        if (expanded) {
          onHighlightChange(down
            ? (active + 1) % count
            : active < 0 ? count - 1 : (active - 1 + count) % count);
        } else if (onOpen) {
          onOpen();
          if (count > 0 && (!down || highlight < 0 || highlight >= count)) {
            onHighlightChange(down ? 0 : count - 1);
          }
        } else {
          return;
        }
        break;
      }
      case 'Enter':
        if (active >= 0) {
          onAccept(active);
        } else if (onEnterWithoutOption) {
          onEnterWithoutOption();
        } else {
          return;
        }
        break;
      case 'Tab':
        // Take the option and let focus move on.
        if (acceptOnTab && active >= 0 && !event.shiftKey) {
          onAccept(active);
        }
        return;
      case 'Escape':
        if (expanded || popupShown) {
          onClose();
        } else if (onEscapeClosed) {
          onEscapeClosed();
        } else {
          return;
        }
        // Escape was the combobox's: it doesn't also close a dialog or leave the game.
        event.stopPropagation();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return {
    listboxId,
    inputProps: {
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': expanded,
      'aria-controls': listboxId,
      'aria-activedescendant': active >= 0 ? optionId(active) : undefined,
      onKeyDown,
    },
    getOptionProps: (index) => ({
      id: optionId(index),
      role: 'option',
      'aria-selected': index === active,
      ref: index === active ? activeOption : undefined,
      onMouseEnter: highlightOnHover ? () => onHighlightChange(index) : undefined,
      // Keep focus in the input, which owns the combobox.
      onMouseDown: (event) => event.preventDefault(),
      onClick: () => onAccept(index),
    }),
  };
}

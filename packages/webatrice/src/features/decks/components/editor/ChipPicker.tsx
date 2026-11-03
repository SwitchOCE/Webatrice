import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';

import { Menu, MenuCheckboxItem, MenuItem, MenuSeparator, type MenuAnchor } from '@app/components';
import { cx } from '@app/utils';

export interface ChipPickerOption {
  value: string;
  label: string;
}

export interface ChipPickerProps {
  label: string;
  chosen: readonly ChipPickerOption[];
  options: readonly ChipPickerOption[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  placeholder: string;
  addLabel: string;
  removeLabel: (label: string) => string;
  chosenReason?: string;
  extraItems?: (close: () => void) => ReactNode;
  className?: string;
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const PILL = 'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border pl-2.5 pr-1.5 text-[12px]';

export function ChipPicker({
  label,
  chosen,
  options,
  onAdd,
  onRemove,
  placeholder,
  addLabel,
  removeLabel,
  chosenReason,
  extraItems,
  className,
}: ChipPickerProps) {
  const selectRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const chosenValues = new Set(chosen.map(({ value }) => value));
  const close = () => {
    setPicking(false);
    setAnchor(null);
  };
  useLayoutEffect(() => {
    const rect = picking ? selectRef.current?.getBoundingClientRect() : undefined;
    setAnchor(rect ? { rect, placement: 'below', align: 'start' } : null);
  }, [picking]);

  return (
    <ul className={cx('flex min-w-0 flex-wrap items-center gap-1.5', className)} aria-label={label}>
      {chosen.map((option) => (
        <li key={option.value} className={cx(PILL, 'border-border-subtle bg-bg-elevated text-text-secondary')}>
          {option.label}
          <button
            type="button"
            onClick={() => onRemove(option.value)}
            aria-label={removeLabel(option.label)}
            className={cx('inline-flex h-4 w-4 items-center justify-center rounded-full hover:text-danger', FOCUS)}
          >
            <X size={11} aria-hidden />
          </button>
        </li>
      ))}
      {picking && (
        <li>
          <button
            ref={selectRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded
            onClick={close}
            className={cx(PILL, 'border-accent bg-bg-base text-text-muted', FOCUS)}
          >
            {placeholder}
            <ChevronDown size={13} aria-hidden className="text-text-secondary" />
          </button>
        </li>
      )}
      <li>
        <button
          ref={addRef}
          type="button"
          aria-label={addLabel}
          title={addLabel}
          aria-haspopup="menu"
          aria-expanded={picking}
          onClick={() => (picking ? close() : setPicking(true))}
          className={cx(
            'inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-subtle text-text-secondary',
            'hover:bg-bg-elevated hover:text-text-primary',
            FOCUS,
          )}
        >
          <Plus size={12} aria-hidden />
        </button>
      </li>
      {anchor && (
        <Menu anchor={anchor} label={placeholder} onClose={close} triggerRef={addRef} className="max-h-72 w-[200px] overflow-y-auto">
          {options.map((option) => (chosenValues.has(option.value) ? (
            <MenuCheckboxItem key={option.value} checked disabled disabledReason={chosenReason} onChange={() => undefined}>
              {option.label}
            </MenuCheckboxItem>
          ) : (
            <MenuItem key={option.value} onSelect={() => onAdd(option.value)}>
              {option.label}
            </MenuItem>
          )))}
          {extraItems && (
            <>
              <MenuSeparator />
              {extraItems(close)}
            </>
          )}
        </Menu>
      )}
    </ul>
  );
}

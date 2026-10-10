import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { cx } from '@app/utils';

export interface AnchoredPopoverProps {
  anchor: RefObject<HTMLElement | null> | HTMLElement | null;
  label: string;
  onClose: () => void;
  align?: 'start' | 'end';
  className?: string;
  children: ReactNode;
}

interface Position {
  top: number;
  left: number;
}

const GAP = 8;
const MARGIN = 8;
const FOCUSABLE = 'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])';

function resolve(anchor: AnchoredPopoverProps['anchor']): HTMLElement | null {
  if (!anchor) {
    return null;
  }
  return 'current' in anchor ? anchor.current : anchor;
}

export function AnchoredPopover({ anchor, label, onClose, align = 'start', className, children }: AnchoredPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    const place = () => {
      const target = resolve(anchor);
      const panel = ref.current;
      if (!target || !panel || !target.isConnected) {
        onCloseRef.current();
        return;
      }
      const rect = target.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const preferredLeft = align === 'end' ? rect.right - width : rect.left;
      const left = Math.max(MARGIN, Math.min(preferredLeft, window.innerWidth - width - MARGIN));
      const below = rect.bottom + GAP;
      const top = below + height > window.innerHeight - MARGIN && rect.top - GAP - height > MARGIN
        ? rect.top - GAP - height
        : below;
      setPosition((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, align]);

  useEffect(() => {
    const panel = ref.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || resolve(anchor)?.contains(target)) {
        return;
      }
      onCloseRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [anchor]);

  const close = () => {
    onCloseRef.current();
    resolve(anchor)?.focus();
  };

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          event.preventDefault();
          close();
        }
      }}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
      className={cx(
        'fixed z-50 rounded-ui-lg border border-border-subtle bg-bg-surface p-3 text-text-primary shadow-pop',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

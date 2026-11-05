import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

export function useShortcutTip() {
  const tipRef = useRef<HTMLSpanElement>(null);
  const hovered = useRef(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const hide = () => setPosition(null);
  const show = (event: SyntheticEvent<HTMLElement>) => {
    const anchor = event.currentTarget.getBoundingClientRect();
    const tip = tipRef.current!.getBoundingClientRect();
    const top = anchor.top >= tip.height + 4 ? anchor.top - tip.height - 4 : anchor.bottom + 4;
    setPosition({
      top: Math.max(8, Math.min(top, window.innerHeight - tip.height - 8)),
      left: Math.max(8, Math.min(anchor.right - tip.width, window.innerWidth - tip.width - 8)),
    });
  };

  useEffect(() => {
    if (!position) {
      return;
    }
    const dismiss = () => setPosition(null);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [position]);

  return {
    tipRef,
    style: { top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' as const : 'hidden' as const },
    triggerProps: {
      onMouseEnter: (event: SyntheticEvent<HTMLElement>) => {
        hovered.current = true;
        show(event);
      },
      onMouseLeave: (event: SyntheticEvent<HTMLElement>) => {
        hovered.current = false;
        if (!event.currentTarget.contains(document.activeElement)) {
          hide();
        }
      },
      onFocus: show,
      onBlur: () => {
        if (!hovered.current) {
          hide();
        }
      },
    },
  };
}

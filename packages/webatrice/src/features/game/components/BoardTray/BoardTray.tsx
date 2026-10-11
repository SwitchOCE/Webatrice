import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import CardPreviewPane from '../CardPreviewPane/CardPreviewPane';

export const TRAY_CARD_HEIGHT_VAR = '--tray-card-height';
export const TRAY_CARD_WIDTH_VAR = '--tray-card-width';
export const TRAY_CHROME_PX = 46;

export function trayCardSize(trayHeight: number): { height: number; width: number } {
  const height = Math.max(0, trayHeight - TRAY_CHROME_PX);
  return { height, width: Math.round((height * 72) / 102) };
}

interface BoardTrayProps {
  hostRef: (el: HTMLDivElement | null) => void;
  onMouseDown?: (e: MouseEvent<HTMLDivElement>) => void;
  children?: ReactNode;
}

export default function BoardTray({ hostRef, onMouseDown, children }: BoardTrayProps) {
  const { t } = useTranslation();
  const trayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const tray = trayRef.current;
    if (!tray) {
      return;
    }
    const root = document.documentElement;
    const apply = () => {
      const { height, width } = trayCardSize(tray.offsetHeight);
      root.style.setProperty(TRAY_CARD_HEIGHT_VAR, `${height}px`);
      root.style.setProperty(TRAY_CARD_WIDTH_VAR, `${width}px`);
    };
    apply();
    const clear = () => {
      root.style.removeProperty(TRAY_CARD_HEIGHT_VAR);
      root.style.removeProperty(TRAY_CARD_WIDTH_VAR);
    };
    if (typeof ResizeObserver === 'undefined') {
      return clear;
    }
    const ro = new ResizeObserver(apply);
    ro.observe(tray);
    return () => {
      ro.disconnect();
      clear();
    };
  }, []);

  return (
    <div
      ref={trayRef}
      data-testid="board-tray"
      aria-label={t('BoardTray.label')}
      role="region"
      onMouseDown={onMouseDown}
      className="game__tray flex shrink-0 gap-2 border-t border-border-subtle bg-bg-surface p-2"
    >
      <CardPreviewPane />
      <div ref={hostRef} className="flex min-h-0 min-w-0 flex-1" data-testid="board-tray-seat" />
      {children}
    </div>
  );
}

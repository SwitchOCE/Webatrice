import { useEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import CardPreviewPane from '../CardPreviewPane/CardPreviewPane';

export const BOARD_TRAY_HEIGHT_VAR = '--board-tray-h';

interface BoardTrayProps {
  gameRef: RefObject<HTMLDivElement | null>;
  hostRef: (el: HTMLDivElement | null) => void;
  onMouseDown?: (e: MouseEvent<HTMLDivElement>) => void;
  children?: ReactNode;
}

export default function BoardTray({ gameRef, hostRef, onMouseDown, children }: BoardTrayProps) {
  const { t } = useTranslation();
  const trayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const tray = trayRef.current;
    const game = gameRef.current;
    if (!tray || !game) {
      return;
    }
    const apply = () => game.style.setProperty(BOARD_TRAY_HEIGHT_VAR, `${tray.offsetHeight}px`);
    apply();
    if (typeof ResizeObserver === 'undefined') {
      return () => game.style.removeProperty(BOARD_TRAY_HEIGHT_VAR);
    }
    const ro = new ResizeObserver(apply);
    ro.observe(tray);
    return () => {
      ro.disconnect();
      game.style.removeProperty(BOARD_TRAY_HEIGHT_VAR);
    };
  }, [gameRef]);

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

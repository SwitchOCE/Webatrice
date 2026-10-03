import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { Menu as MenuIcon } from 'lucide-react';
import { useShortcutHints } from '@app/feature-widgets/shortcuts';

import { useGameId } from '../ui/GameIdContext';
import { useGameMenu } from './useGameMenu';

interface GameMenuProps {
  className: string;
}

/** Desktop's "Game" menu (TabGame::createMenuItems) as a button in the battlefield sidebar. */
export default function GameMenu({ className }: GameMenuProps) {
  const { t } = useTranslation();
  const gameId = useGameId();
  const entries = useGameMenu(gameId);
  const hints = useShortcutHints();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnchor(e.currentTarget)}
        disabled={gameId == null}
        title={t('GameMenu.title')}
        aria-haspopup="menu"
        aria-expanded={anchor != null}
        className={className}
      >
        <MenuIcon size={12} /> {t('GameMenu.button')}
      </button>
      <Menu anchorEl={anchor} open={anchor != null} onClose={close} data-testid="game-menu">
        {entries.map((entry) =>
          entry.kind === 'divider' ? (
            <Divider key={entry.id} />
          ) : (
            <MenuItem
              key={entry.id}
              data-testid={`game-menu-${entry.id}`}
              disabled={entry.disabled}
              onClick={() => {
                close();
                entry.onClick();
              }}
            >
              <span className="flex-1">{t(`GameMenu.item.${entry.id}`)}</span>
              {hints[entry.shortcut] && (
                <span className="ml-6 text-xs text-text-muted">{hints[entry.shortcut]}</span>
              )}
            </MenuItem>
          ),
        )}
      </Menu>
    </>
  );
}

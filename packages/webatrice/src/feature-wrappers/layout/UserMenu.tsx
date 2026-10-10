import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, LogOut, Grid3x3, PanelLeftOpen } from 'lucide-react';

import { server, ServerCapability } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { Menu, MenuCheckboxItem, MenuItem, MenuSeparator, type MenuAnchor } from '@app/components';
import type { RouteEnum } from '@app/types';

import { visibleUserMenuEntries, type CapabilityCheck, type UserMenuDialog } from './userMenuEntries';

export interface UserMenuProps {
  userName: string | null;
  userLevel: number;
  snapGridVisible: boolean;
  onToggleSnapGrid: () => void;
  phaseTrackPinned: boolean;
  onTogglePhaseTrackPinned: () => void;
  onNavigate: (route: RouteEnum) => void;
  onOpenDialog: (dialog: UserMenuDialog) => void;
  onSignOut: () => void;
}

export default function UserMenu({
  userName,
  userLevel,
  snapGridVisible,
  onToggleSnapGrid,
  phaseTrackPinned,
  onTogglePhaseTrackPinned,
  onNavigate,
  onOpenDialog,
  onSignOut,
}: UserMenuProps) {
  const { t } = useTranslation();
  const cardArt = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.CARD_ART));
  const moderation = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.MODERATION_TOOLS));
  const developer = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.DEVELOPER_ROLE));
  const reports = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.REPORTS));
  const capabilities: Partial<Record<ServerCapability, boolean>> = {
    [ServerCapability.CARD_ART]: cardArt,
    [ServerCapability.MODERATION_TOOLS]: moderation,
    [ServerCapability.DEVELOPER_ROLE]: developer,
    [ServerCapability.REPORTS]: reports,
  };
  const supports: CapabilityCheck = (capability) => capabilities[capability] ?? false;
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setAnchor(null), []);

  const toggle = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setAnchor((open) => (open || !rect ? null : { x: rect.right, y: rect.bottom + 4, align: 'end' }));
  };

  const displayName = userName ?? t('TopBar.user.signedIn');

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !anchor) {
            e.preventDefault();
            toggle();
          }
        }}
        aria-haspopup="menu"
        aria-expanded={anchor != null}
        className="flex items-center gap-2 px-2 py-1 rounded-md bg-bg-elevated hover:bg-border-subtle transition-colors"
      >
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center">
          <User size={14} className="text-white" />
        </div>
        <span className="text-sm font-medium text-text-primary max-w-[10rem] truncate">
          {displayName}
        </span>
      </button>

      {anchor && (
        <Menu anchor={anchor} label={displayName} onClose={close} triggerRef={triggerRef} className="w-56">
          <div className="px-3 py-2 mb-1 border-b border-border-subtle" aria-hidden>
            <span className="text-sm font-medium text-text-primary truncate">{displayName}</span>
          </div>
          <MenuCheckboxItem
            checked={snapGridVisible}
            onChange={onToggleSnapGrid}
            icon={<Grid3x3 size={14} />}
          >
            {t('TopBar.game.snapGrid')}
          </MenuCheckboxItem>
          <MenuCheckboxItem
            checked={!phaseTrackPinned}
            onChange={onTogglePhaseTrackPinned}
            icon={<PanelLeftOpen size={14} />}
            title={phaseTrackPinned ? t('TopBar.game.phaseTrackCollapse') : t('TopBar.game.phaseTrackPin')}
          >
            {t('TopBar.game.phaseTrackToggle')}
          </MenuCheckboxItem>
          {visibleUserMenuEntries(userLevel, supports).map((entry) => (
            <MenuItem
              key={entry.route ?? entry.dialog}
              icon={<entry.icon size={14} />}
              onSelect={() => {
                close();
                if (entry.route) {
                  onNavigate(entry.route);
                } else {
                  onOpenDialog(entry.dialog);
                }
              }}
            >
              {t(entry.label)}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            icon={<LogOut size={14} />}
            onSelect={() => {
              close();
              onSignOut();
            }}
          >
            {t('TopBar.user.signOut')}
          </MenuItem>
        </Menu>
      )}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

import type { DeckVisibility } from '../../deckTree';

/**
 * Desktop's Public / Public (inherited) column, with its tooltips. Private
 * decks and folders (and everything on a 3.0 server) show nothing.
 */
export function DeckVisibilityBadge({ visibility, kind }: { visibility: DeckVisibility; kind: 'deck' | 'folder' }) {
  const { t } = useTranslation();
  if (visibility === 'private') {
    return null;
  }
  const tooltip = visibility === 'public'
    ? t(kind === 'deck' ? 'DeckSharing.deckPublic' : 'DeckSharing.folderPublic')
    : t(kind === 'deck' ? 'DeckSharing.deckInherited' : 'DeckSharing.folderInherited');
  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 text-[11px] text-accent shrink-0"
    >
      <Globe size={10} aria-hidden /> {t(visibility === 'public' ? 'DeckSharing.public' : 'DeckSharing.inherited')}
    </span>
  );
}

import { useId } from 'react';
import { FileUp, Layers, Library, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { generatePath, useNavigate } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { Button, DeckCardFace } from '@app/components';
import { useRecentDecks } from '@app/hooks';
import { recentDeckArtUrl } from '@app/services';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';
import { useDeckEditorRoutePrefetch } from '../../../RoutePrefetch';

import { deckFormatLabel, liveRecentDecks, recentDeckFormatFamily, serverDeckCount, type LiveRecentDeck } from '../homeModel';
import HomeEmpty from './HomeEmpty';
import SectionHead from './SectionHead';

export const RECENT_DECKS_SHOWN = 5;

function DeckTile({ deck, onOpen, onPrefetch }: {
  deck: LiveRecentDeck;
  onOpen: (deckId: number) => void;
  onPrefetch: () => void;
}) {
  const { t } = useTranslation();
  const formatDescriptionId = useId();
  const art = recentDeckArtUrl(deck);
  const format = deck.format ? deckFormatLabel(deck.format, t) : null;
  return (
    <li className="flex min-w-0">
      <button
        type="button"
        aria-label={t('DeckTile.open', { name: deck.name })}
        aria-describedby={!format ? formatDescriptionId : undefined}
        onClick={() => onOpen(deck.deckId)}
        onFocus={onPrefetch}
        onPointerEnter={onPrefetch}
        className={[
          'group flex w-full min-w-0 flex-col overflow-hidden rounded-ui-lg border border-border-subtle bg-bg-surface text-left',
          'shadow-panel hover:border-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
        ].join(' ')}
      >
        <DeckCardFace
          name={deck.name}
          artUrl={art}
          colours={deck.colors}
          format={format}
          formatFamily={recentDeckFormatFamily(deck.format)}
          formatKnown
          formatDescriptionId={formatDescriptionId}
          bracket={deck.bracketLevel}
          creationTime={deck.creationTime}
          cardCount={deck.cardCount}
        />
      </button>
    </li>
  );
}

function RecentDecksEmpty({ savedDecks }: { savedDecks: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openDecks = (open?: 'create' | 'migrate') => navigate(RouteEnum.DECKS, open ? { state: { open } } : undefined);
  const newDeck = (
    <Button size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => openDecks('create')}>
      {t('RecentDecks.newDeck')}
    </Button>
  );
  if (savedDecks > 0) {
    return (
      <HomeEmpty
        icon={<Layers size={17} />}
        actions={(
          <>
            <Button size="sm" variant="primary" icon={<Library size={14} aria-hidden />} onClick={() => openDecks()}>
              {t('RecentDecks.openDecks')}
            </Button>
            {newDeck}
          </>
        )}
      >
        {t('RecentDecks.emptySaved', { count: savedDecks })}
      </HomeEmpty>
    );
  }
  return (
    <HomeEmpty
      icon={<Layers size={17} />}
      actions={(
        <>
          <Button size="sm" variant="primary" icon={<FileUp size={14} aria-hidden />} onClick={() => openDecks('migrate')}>
            {t('RecentDecks.importDeck')}
          </Button>
          {newDeck}
        </>
      )}
    >
      {t('RecentDecks.empty')}
    </HomeEmpty>
  );
}

export default function RecentDecks() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const prefetchDeckEditor = useDeckEditorRoutePrefetch();
  const recent = useRecentDecks();
  const tree = useAppSelector(server.Selectors.getBackendDecks);
  const decks = liveRecentDecks(recent, tree?.root).slice(0, RECENT_DECKS_SHOWN);
  const openDeck = (deckId: number) => navigate(generatePath(RouteEnum.DECK, { deckId: String(deckId) }));

  return (
    <section className="flex shrink-0 flex-col gap-2.5 pt-3" aria-labelledby="home-recent-decks">
      <SectionHead
        id="home-recent-decks"
        title={t('RecentDecks.title')}
      />
      {decks.length === 0 ? (
        <RecentDecksEmpty savedDecks={serverDeckCount(tree?.root)} />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] gap-gap xl:grid-cols-5">
          {decks.map((deck) => (
            <DeckTile key={deck.deckId} deck={deck} onOpen={openDeck} onPrefetch={prefetchDeckEditor} />
          ))}
        </ul>
      )}
    </section>
  );
}

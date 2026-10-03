import { useCallback } from 'react';
import { generatePath, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Eye, Loader2 } from 'lucide-react';

import { server } from '@cockatrice/datatrice';
import { AuthGuard } from '@app/components';
import { Layout } from '@app/feature-wrappers/layout';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

import { ReadOnlyDeck } from './components/ReadOnlyDeck';
import { formatDisplayLabel } from './deckSummary';
import { formatShareExpiry, isSameShareServer, parseDeckShareQuery } from './deckSharing';
import { useDeckSharingSupported, useShareServer } from './hooks/useDeckSharing';
import { useImportDeckCopy } from './hooks/useImportDeckCopy';
import { useSharedDeck } from './hooks/useSharedDeck';

/**
 * A share link's decks (desktop `IntentOpenSharedDeck` + `DlgSharedDecksPreview`),
 * at `/decks/shared?share=<token>&hostname=<host>&port=<port>`. Lists the decks
 * in the share; each opens read-only and can be imported into the user's deck
 * storage. Desktop opens a link on another server by connecting there; a
 * browser can only say which server the link is for.
 */
function SharedDeck() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const link = parseDeckShareQuery(searchParams);
  const supported = useDeckSharingSupported();
  const shareServer = useShareServer();
  const isConnected = useAppSelector(server.Selectors.getIsConnected);

  const problem = 'problem' in link ? t(`OpenShareLink.problem.${link.problem}`) : null;
  const otherServer = !problem && !('problem' in link) && shareServer && !isSameShareServer(link, shareServer.hostname)
    ? t('SharedDeck.otherServer', { server: `${link.hostname}:${link.port}` })
    : null;
  const usable = !('problem' in link) && supported && !otherServer;
  const shared = useSharedDeck(usable ? link.token : null);

  const openImported = useCallback(
    (deckId: number) => navigate(generatePath(RouteEnum.DECK, { deckId: String(deckId) })),
    [navigate],
  );
  const importCopy = useImportDeckCopy(openImported);

  const blocked = problem ?? otherServer ?? (supported ? null : t('SharedDeck.notFound'));
  const { listing, open } = shared;

  return (
    <Layout>
      <AuthGuard />
      <div className="h-full flex flex-col bg-bg-base bg-purple-radial">
        <div className="shrink-0 flex items-center gap-3 px-6 py-4 border-b border-border-subtle">
          <button
            type="button"
            onClick={() => navigate(RouteEnum.DECKS)}
            className="p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
            title={t('SharedDeck.back')}
            aria-label={t('SharedDeck.back')}
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="font-modern text-2xl font-semibold text-text-primary">{t('SharedDeck.title')}</h1>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div className="max-w-4xl mx-auto space-y-4 text-sm text-text-secondary">
            {blocked && <p role="alert" className="text-danger">{blocked}</p>}
            {!blocked && listing.status === 'loading' && (
              <p role="status" className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> {t('SharedDeck.loading')}
              </p>
            )}
            {!blocked && listing.status === 'failed' && <p role="alert" className="text-danger">{listing.message}</p>}
            {!blocked && listing.status === 'loaded' && !('problem' in link) && (
              <>
                <div className="space-y-1">
                  <p className="text-text-primary font-semibold">
                    {t('SharedDeck.share', { name: listing.name || t('SharedDeck.untitled') })}
                  </p>
                  <p>{t('SharedDeck.from', { server: `${link.hostname}:${link.port}` })}</p>
                  {listing.expiresAt > 0n && (
                    <p>{t('SharedDeck.expires', { date: formatShareExpiry(listing.expiresAt) })}</p>
                  )}
                </div>
                <ul className="space-y-2">
                  {listing.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 rounded-md bg-bg-surface border border-border-subtle px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-text-primary truncate">{item.name}</div>
                        <div className="text-xs text-text-muted flex gap-2 flex-wrap">
                          {item.gameFormat && <span>{formatDisplayLabel(item.gameFormat)}</span>}
                          {item.colorIdentity && <span>{item.colorIdentity}</span>}
                          {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => shared.openItem(item.id)}
                        disabled={!isConnected || (open.status === 'loading' && open.id === item.id)}
                        className={[
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium',
                          'text-text-primary bg-bg-elevated border border-border-strong hover:bg-border-subtle',
                          'disabled:opacity-40 disabled:cursor-not-allowed',
                        ].join(' ')}
                        aria-label={t('SharedDeck.openDeckNamed', { name: item.name })}
                      >
                        <Eye size={13} /> {t('SharedDeck.openDeck')}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!blocked && open.status === 'failed' && <p role="alert" className="text-danger">{open.message}</p>}
            {!blocked && open.status === 'open' && (
              <ReadOnlyDeck
                deck={open.opened.deck}
                onImport={isConnected ? () => importCopy(open.opened.xml) : undefined}
                onClose={shared.close}
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default SharedDeck;

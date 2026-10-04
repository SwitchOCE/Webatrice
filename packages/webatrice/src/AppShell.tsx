import { useEffect, useMemo } from 'react';
import { MemoryRouter as Router } from 'react-router-dom';
import Routes from './AppShellRoutes';

import './AppShell.css';

import { GameLinkJoinHost, RouteErrorBoundary, ToastProvider } from '@app/components';
import { ReportUserProvider } from '@app/dialogs';
import { useApplyLanguagePreference, useDocumentLanguage, useSyncLocaleToStore } from '@app/hooks';
import { loadPersistedLastRoute } from '@app/services';
import { ShortcutProvider } from '@app/feature-widgets/shortcuts';
import { ModerationProvider } from '@app/feature-widgets/moderation';
import { UserGamesProvider } from '@app/feature-widgets/user-games';
import { ShellLifecycleProvider } from '@app/feature-wrappers/layout';
import { DeckShareLinkRedirect } from '@app/features/decks';
import { PrivateMessageNotifier } from '@app/features/player';
import { ReportNotifier } from '@app/features/reports';
import { AppAlerts, CommandFailureNotices, FeatureDetection, MissingFeaturesNotice, ServerNotices } from '@app/features/shell';
import { appShellLifecycle } from './appShellLifecycle';

// CssBaseline removed: it was MUI's global body reset (font, color,
// background, box-sizing, anchor styles). The equivalent rules now
// live in index.css so we control them without MUI's opinions.
function AppShell() {
  useSyncLocaleToStore();
  useDocumentLanguage();
  useApplyLanguagePreference();

  useEffect(() => {
    window.onbeforeunload = () => true;
    return () => {
      window.onbeforeunload = null;
    };
  }, []);

  // Rehydrate the last route from localStorage so an F5 refresh drops
  // the user back where they were. MemoryRouter has no URL bar, so
  // without this the router always boots at `/`. `useMemo` freezes
  // the initialEntries at first render — MemoryRouter uses it once
  // and remembers, so subsequent state updates don't rehydrate.
  const initialEntries = useMemo(() => {
    const saved = loadPersistedLastRoute();
    return saved ? [saved] : ['/'];
  }, []);

  return (
    <ToastProvider>
      <div className="AppShell">
        <Router initialEntries={initialEntries}>
          <ShellLifecycleProvider value={appShellLifecycle}>
            <ShortcutProvider>
              <FeatureDetection />
              {/* Global listener for incoming private-chat messages —
               *  renders nothing, dispatches Toast pills whose
               *  onClick navigates to the sender's /player/:name
               *  tab. Mounted inside the Router so useNavigate /
               *  useLocation work; inside ToastProvider so pushToast
               *  is available. */}
              <PrivateMessageNotifier />
              {/* Sounds and notifications for game, room and buddy events. */}
              <AppAlerts />
              {/* Runs the join flow for game links clicked in any chat. */}
              <GameLinkJoinHost />
              {/* Error dialogs for commands whose UI has moved on before the
               *  server answers (join room, create game, deck upload). Renders
               *  nothing until one fails. */}
              <CommandFailureNotices />
              {/* Server shutdown countdown and Event_NotifyUser messages. */}
              <ServerNotices />
              {/* Desktop's "server supports features your client lacks" box, after a login. */}
              <MissingFeaturesNotice />
              {/* REPORT_RESOLVED / REPORT_COMMENT popups (desktop processNotifyUserEvent). */}
              <ReportNotifier />
              {/* Hosts the report-user dialog for useReportUser().openReportUser. */}
              <ReportUserProvider>
                <ModerationProvider>
                  <UserGamesProvider>
                    <RouteErrorBoundary>
                      <Routes />
                    </RouteErrorBoundary>
                    {/* Opens a deck share link the page was loaded with, after
                     *  login. After the routes so it navigates after the login
                     *  page's own redirect. */}
                    <DeckShareLinkRedirect />
                  </UserGamesProvider>
                </ModerationProvider>
              </ReportUserProvider>
            </ShortcutProvider>
          </ShellLifecycleProvider>
        </Router>
      </div>
    </ToastProvider>
  );
}

export default AppShell;

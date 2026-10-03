import { act, fireEvent, screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { create } from '@bufbuild/protobuf';
import { server } from '@cockatrice/datatrice';
import { Event_NotifyUserSchema, Event_NotifyUser_NotificationType } from '@cockatrice/sockatrice/generated';

import { renderWithProviders } from '../../__test-utils__';
import { RouteEnum } from '../../types';
import { reportsRootState } from './__mocks__/reportState';
import ReportNotifier from './ReportNotifier';

const Type = Event_NotifyUser_NotificationType;

function renderNotifier(moderator = false) {
  return renderWithProviders(
    <>
      <ReportNotifier />
      <Routes>
        <Route path={RouteEnum.SERVER} element={<div>lobby</div>} />
        <Route path={RouteEnum.MY_REPORTS} element={<div>my reports page</div>} />
        <Route path={RouteEnum.REPORT_QUEUE} element={<div>queue page</div>} />
      </Routes>
    </>,
    { preloadedState: reportsRootState({ moderator }), route: RouteEnum.SERVER },
  );
}

function notice(type: Event_NotifyUser_NotificationType, customTitle: string, customContent: string) {
  return server.Actions.reportNotified({ notification: create(Event_NotifyUserSchema, { type, customTitle, customContent }) });
}

describe('ReportNotifier', () => {
  it('pops up the server title and content and opens My Reports on click', () => {
    const { store } = renderNotifier();
    act(() => {
      store.dispatch(notice(Type.REPORT_RESOLVED, 'Report Resolved', 'Your report about mallory has been resolved.\nNote: warned'));
    });
    const toast = screen.getByTestId('report-notice');
    expect(toast.textContent).toContain('Report Resolved');
    expect(toast.textContent).toContain('Note: warned');
    fireEvent.click(toast);
    expect(screen.getByText('my reports page')).toBeTruthy();
  });

  it('keeps the notice up until it is dismissed or opened, since it leads somewhere', () => {
    vi.useFakeTimers();
    try {
      const { store } = renderNotifier();
      act(() => {
        store.dispatch(notice(Type.REPORT_RESOLVED, 'Report Resolved', 'Your report has been resolved.'));
      });

      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      expect(screen.getByTestId('report-notice')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the queue for a moderator comment notice', () => {
    const { store } = renderNotifier(true);
    act(() => {
      store.dispatch(notice(Type.REPORT_COMMENT, 'New Comment on Report #3', 'alice commented:\nmore'));
    });
    fireEvent.click(screen.getByTestId('report-notice'));
    expect(screen.getByText('queue page')).toBeTruthy();
  });

  it('still pops up the first notice after a reconnect resets the reports slice', () => {
    const { store } = renderNotifier();
    act(() => {
      store.dispatch(notice(Type.REPORT_RESOLVED, 'Report Resolved', 'first session'));
    });
    act(() => {
      store.dispatch(server.Actions.disconnected());
    });
    act(() => {
      store.dispatch(notice(Type.REPORT_RESOLVED, 'Report Resolved', 'second session'));
    });
    const toasts = screen.getAllByTestId('report-notice').map((toast) => toast.textContent);
    expect(toasts).toHaveLength(2);
    expect(toasts.join()).toContain('second session');
  });

  it('skips a notice with a blank title or content, like desktop', () => {
    const { store } = renderNotifier();
    act(() => {
      store.dispatch(notice(Type.REPORT_COMMENT, '   ', 'text'));
    });
    expect(screen.queryByTestId('report-notice')).toBeNull();
  });
});

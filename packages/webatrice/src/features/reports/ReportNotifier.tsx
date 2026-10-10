import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flag } from 'lucide-react';

import { server } from '@cockatrice/datatrice';
import { Event_NotifyUser_NotificationType } from '@cockatrice/sockatrice/generated';
import { usePushToast } from '@app/components';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

export default function ReportNotifier() {
  const navigate = useNavigate();
  const pushToast = usePushToast();
  const lastNotice = useAppSelector(server.Selectors.getLastReportNotice);
  const isModerator = useAppSelector(server.Selectors.getIsUserModerator);

  const seen = useRef(lastNotice);

  useEffect(() => {
    if (!lastNotice || lastNotice === seen.current) {
      return;
    }
    seen.current = lastNotice;
    const { notification } = lastNotice;
    const title = notification.customTitle.replace(/\s+/g, ' ').trim();
    const content = notification.customContent.trim();
    if (!title || !content) {
      return;
    }
    const target = isModerator && notification.type === Event_NotifyUser_NotificationType.REPORT_COMMENT
      ? RouteEnum.REPORT_QUEUE
      : RouteEnum.MY_REPORTS;
    const handle = pushToast(
      <button
        type="button"
        onClick={() => {
          handle.close();
          navigate(target);
        }}
        className="w-full text-left flex flex-col gap-0.5 min-w-0 focus:outline-none"
        data-testid="report-notice"
      >
        <span className="text-xs font-semibold text-accent truncate">{title}</span>
        <span className="text-sm text-text-primary whitespace-pre-wrap break-words line-clamp-4">{content}</span>
      </button>,
      { icon: Flag, persistent: true },
    );
  }, [lastNotice, isModerator, navigate, pushToast]);

  return null;
}

import { useCallback, useEffect, useRef, useState } from 'react';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { ServerInfo_Report } from '@cockatrice/sockatrice/generated';
import { useAppSelector } from '@app/store';

export interface ReportThread {
  details: ServerInfo_Report | undefined;
  detailsFailed: boolean;
  reloadDetails: () => void;
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  sendComment: () => void;
  commentBusy: boolean;
  commentFailed: boolean;
}

/**
 * Details and comments for the selected report, shared by My Reports and the
 * Report Queue. Selecting a report requests Command_ReportDetails (desktop
 * onSelectionChanged); a sent comment clears the draft and calls
 * `onCommentAdded` so the page refreshes, as desktop's addCommentResponse does.
 * The draft survives refreshes and is kept per page, not per report, like
 * desktop's single comment line.
 */
export function useReportThread(selectedId: number | null, onCommentAdded: () => void): ReportThread {
  const webClient = useWebClient();
  const details = useAppSelector((state) =>
    (selectedId != null ? server.Selectors.getReportDetails(state, selectedId) : undefined));
  const [failedId, setFailedId] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentFailed, setCommentFailed] = useState(false);

  // Server answers can land after the page is gone; ignore them then.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reloadDetails = useCallback(() => {
    if (selectedId == null) {
      return;
    }
    setFailedId(null);
    webClient.request.session.reportDetails(selectedId, () => {
      if (mounted.current) {
        setFailedId(selectedId);
      }
    });
  }, [selectedId, webClient]);

  useEffect(() => {
    setCommentFailed(false);
    reloadDetails();
  }, [reloadDetails]);

  const onAddedRef = useRef(onCommentAdded);
  useEffect(() => {
    onAddedRef.current = onCommentAdded;
  }, [onCommentAdded]);

  const sendComment = useCallback(() => {
    const text = commentDraft.trim();
    if (selectedId == null || !text) {
      return;
    }
    setCommentBusy(true);
    setCommentFailed(false);
    webClient.request.session.reportAddComment(
      selectedId,
      text,
      () => {
        if (mounted.current) {
          setCommentBusy(false);
          setCommentDraft('');
          onAddedRef.current();
        }
      },
      () => {
        if (mounted.current) {
          setCommentBusy(false);
          setCommentFailed(true);
        }
      },
    );
  }, [commentDraft, selectedId, webClient]);

  return {
    details,
    detailsFailed: failedId != null && failedId === selectedId,
    reloadDetails,
    commentDraft,
    setCommentDraft,
    sendComment,
    commentBusy,
    commentFailed,
  };
}

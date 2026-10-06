import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rooms, server } from '@cockatrice/datatrice';
import type { CommandFailedPayload, JoinRoomFailedPayload, RoomCommandFailedPayload } from '@cockatrice/datatrice';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';

import { AlertDialog } from '@app/dialogs';
import { useCommandFailureMessage, useReduxEffect } from '@app/hooks';

interface Notice {
  title: string;
  message: string;
}

/**
 * Global error surface for user-initiated commands whose UI has already moved
 * on by the time the server answers: joining a room, creating a game, creating
 * or importing a deck. Desktop answers each failure with a critical message box
 * (TabServer::joinRoomFinished, DlgCreateGame::checkResponse,
 * TabDeckStorage::uploadFinished); this queues the same messages, plus a
 * timeout/disconnect reason when the server never answered. Log search owns
 * its own notice on the Logs page.
 *
 * An autojoin that fails stays silent, as desktop's does (it passes
 * `setCurrent = false`). These are final outcomes, not pending operations:
 * retain them until dismissed, including failures caused by disconnect itself.
 *
 * Renders nothing until a failure arrives. Mounted once in AppShell.
 */
export default function CommandFailureNotices() {
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const [notices, setNotices] = useState<Notice[]>([]);

  const push = (notice: Notice) => setNotices((queue) => [...queue, notice]);

  useReduxEffect<JoinRoomFailedPayload>(({ payload: { responseCode, failure, userInitiated } }) => {
    if (!userInitiated) {
      return;
    }
    push({
      title: t('CommandFailureNotices.joinRoom.title'),
      message: describeFailure(failure, joinRoomRejection(t, responseCode)),
    });
  }, rooms.Types.JOIN_ROOM_FAILED, [describeFailure, t]);

  useReduxEffect<RoomCommandFailedPayload>(({ payload: { failure } }) => {
    push({
      title: t('CommandFailureNotices.createGame.title'),
      message: describeFailure(failure, t('CommandFailureNotices.createGame.serverError')),
    });
  }, rooms.Types.CREATE_GAME_FAILED, [describeFailure, t]);

  useReduxEffect<CommandFailedPayload>(({ payload: { failure } }) => {
    push({
      title: t('CommandFailureNotices.deckUpload.title'),
      message: describeFailure(failure, t('CommandFailureNotices.deckUpload.serverError')),
    });
  }, server.Types.DECK_UPLOAD_FAILED, [describeFailure, t]);

  const current = notices[0];
  if (!current) {
    return null;
  }

  return (
    <AlertDialog
      isOpen
      title={current.title}
      message={current.message}
      onDismiss={() => setNotices((queue) => queue.slice(1))}
    />
  );
}

// Desktop TabServer::joinRoomFinished messages per response code.
function joinRoomRejection(t: (key: string, values?: Record<string, unknown>) => string, responseCode: number): string {
  switch (responseCode) {
    case Response_ResponseCode.RespNameNotFound:
      return t('CommandFailureNotices.joinRoom.notFound');
    case Response_ResponseCode.RespContextError:
      return t('CommandFailureNotices.joinRoom.contextError');
    case Response_ResponseCode.RespUserLevelTooLow:
      return t('CommandFailureNotices.joinRoom.userLevelTooLow');
    default:
      return t('CommandFailureNotices.joinRoom.unknown', { code: responseCode });
  }
}

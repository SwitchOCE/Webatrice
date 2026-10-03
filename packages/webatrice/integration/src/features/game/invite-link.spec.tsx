import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';

import { games, rooms, server } from '@cockatrice/datatrice';
import {
  Command_JoinGame_ext,
  Command_Message_ext,
  Event_GameJoined_ext,
  Event_UserMessage_ext,
  Event_UserMessageSchema,
  ServerInfo_GameSchema,
  ServerInfo_RoomSchema,
  ServerInfo_UserSchema,
} from '@cockatrice/sockatrice/generated';
import { GameLinkJoinHost, Message } from '@app/components';
import GameInviteControls from '../../../../src/features/game/components/GameInviteControls/GameInviteControls';
import { connectRaw, store } from '../../helpers/setup';
import { findLastRoomCommand, findLastSessionCommand } from '../../helpers/command-capture';
import { buildSessionEventMessage, deliverMessage } from '../../helpers/protobuf-builders';
import { renderFeatureScreen } from '../helpers';
import { LocationProbe, buildEventGameJoined, registerGameBoardHooks, simulateConnected } from './helpers';

registerGameBoardHooks();

const user = (name: string) => create(ServerInfo_UserSchema, { name });

describe('Game invites and links (GAME-033)', () => {
  it('Invite to Game sends the desktop join link as a private message', () => {
    // react-window sizes its rows from ResizeObserver; emit a size so the invite list mounts rows.
    const originalRo = globalThis.ResizeObserver;
    const observed: Array<{ cb: ResizeObserverCallback; target?: Element }> = [];
    globalThis.ResizeObserver = class {
      private entry: { cb: ResizeObserverCallback; target?: Element };
      constructor(cb: ResizeObserverCallback) {
        this.entry = { cb };
        observed.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      connectRaw();
      act(() => {
        store.dispatch(server.Actions.updateUser({ user: user('alice') }));
        store.dispatch(server.Actions.updateUsers({ users: [user('alice'), user('bob')] }));
        store.dispatch(games.Actions.gameJoined({ data: buildEventGameJoined({ gameId: 42, localPlayerId: 1, hostId: 1 }) }));
      });
      renderFeatureScreen(<GameInviteControls gameId={42} />);

      fireEvent.click(screen.getByRole('button', { name: 'GameInvite.inviteToGame' }));
      const list = document.querySelector('.virtual-list__list')!;
      act(() => {
        for (const { cb, target } of observed) {
          if (target === list) {
            cb([{ contentRect: { height: 300, width: 300 }, target: list } as unknown as ResizeObserverEntry], {} as ResizeObserver);
          }
        }
      });
      const rows = screen.getByTestId('invite-user-list');
      expect(within(rows).queryByText('alice')).not.toBeInTheDocument();
      fireEvent.doubleClick(within(rows).getByText('bob'));

      const sent = findLastSessionCommand(Command_Message_ext).value;
      expect(sent.userName).toBe('bob');
      expect(sent.message).toBe(
        'GameInvite.messageWithDescription '
          + 'cockatrice://joingame?hostname=localhost&port=4748&roomid=1&gameid=42&game=Integration%20Test%20Game',
      );
    } finally {
      globalThis.ResizeObserver = originalRo;
    }
  });

  it('a link received in chat joins the game through Command_JoinGame and opens it', async () => {
    connectRaw();
    simulateConnected();
    act(() => {
      store.dispatch(rooms.Actions.joinRoom({
        roomInfo: create(ServerInfo_RoomSchema, {
          roomId: 1,
          name: 'Main',
          gameList: [create(ServerInfo_GameSchema, { gameId: 77, roomId: 1, description: 'Bo3', playerCount: 1, maxPlayers: 2 })],
        }),
      }));
    });
    const url = 'cockatrice://joingame?hostname=localhost&port=4747&roomid=1&gameid=77&game=Bo3';
    renderFeatureScreen(
      <>
        <Message message={{ message: `bob: Join my game "Bo3" (#77): ${url}` }} />
        <GameLinkJoinHost />
        <LocationProbe />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: /GameLink\.anchor\.withDescription/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'GameLink.yes' }));

    const join = findLastRoomCommand(Command_JoinGame_ext);
    expect(join.value.gameId).toBe(77);
    expect(join.value.spectator).toBe(false);

    act(() => {
      deliverMessage(buildSessionEventMessage(Event_GameJoined_ext, buildEventGameJoined({ gameId: 77, localPlayerId: 2, hostId: 1 })));
    });
    await waitFor(() => expect(screen.getByTestId('app-location')).toHaveTextContent('/game/77'));
  });

  it('an invite arriving as a private message is stored with its link intact', () => {
    connectRaw();
    act(() => {
      store.dispatch(server.Actions.updateUser({ user: user('alice') }));
      deliverMessage(buildSessionEventMessage(Event_UserMessage_ext, create(Event_UserMessageSchema, {
        senderName: 'bob',
        receiverName: 'alice',
        message: 'Join my game (#5): cockatrice://joingame?hostname=localhost&port=4748&roomid=1&gameid=5',
      })));
    });
    const [message] = server.Selectors.getPrivateMessagesForUser(store.getState(), 'bob');
    expect(message.message).toContain('cockatrice://joingame?hostname=localhost&port=4748&roomid=1&gameid=5');
  });
});

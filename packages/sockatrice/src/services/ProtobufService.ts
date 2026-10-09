import { create, fromBinary, hasExtension, getExtension, setExtension, toBinary } from '@bufbuild/protobuf';
import type { GenExtension } from '@bufbuild/protobuf/codegenv2';

import {
  Command_Judge_ext,
  Command_JudgeSchema,
  CommandContainerSchema,
  GameCommandSchema,
  SessionCommandSchema,
  RoomCommandSchema,
  ModeratorCommandSchema,
  AdminCommandSchema,
  DeveloperCommandSchema,
  ServerMessageSchema,
  ServerMessage_MessageType,
  type Response,
  type CommandContainer,
  type GameCommand,
  type SessionCommand,
  type RoomCommand,
  type ModeratorCommand,
  type AdminCommand,
  type DeveloperCommand,
  type ServerMessage,
  type GameEventContainer,
  type SessionEvent,
  type RoomEvent,
} from '../generated';

import type { GameExtensionRegistry } from '../events/game';
import type { RoomExtensionRegistry } from '../events/room';
import type { SessionExtensionRegistry } from '../events/session';
import type { GameEventMeta, ReplayEventOptions } from '../types/WebSocketConfig';
import type { LatencyStats } from '../types/LatencyStats';
import { CommandFailure, type CommandOptions, handleFailure, handleResponse } from './command-options';
import { LatencyTracker } from './LatencyTracker';

export interface SocketTransport {
  send(data: Uint8Array): void;
  isOpen(): boolean;
}

export interface EventRegistries {
  game: GameExtensionRegistry;
  room: RoomExtensionRegistry;
  session: SessionExtensionRegistry;
}

// One game command in a batch. `judgeTargetId` undefined sends it bare; when set,
// the command nests inside a Command_Judge for that owner (entries sharing a
// target are grouped into a single judge wrapper). See sendGameCommands.
export interface GameCommandEntry<V = unknown> {
  ext: GenExtension<GameCommand, V>;
  value: V;
  judgeTargetId?: number;
}

// How long a command may wait for its response. Desktop ticks every pending
// command on each keepalive ping and answers it RespNotConnected once it has
// outlived `timeout` ticks (RemoteClient::ping); with the default settings
// (keepalive 3 s, timeout 5) that is 15-18 s. Desktop's own UI deadlines for a
// single round trip use the upper bound, (timeout + 1) * keepalive.
export const DEFAULT_COMMAND_TIMEOUT_MS = 18_000;

// Round-trip stats are pushed at most this often, so timing every response adds
// no per-command dispatch traffic. The keepalive ping guarantees a fresh sample
// about once per interval while connected. Desktop STATS_EMIT_INTERVAL_MS.
export const LATENCY_STATS_INTERVAL_MS = 1000;

export type LatencyStatsListener = (stats: LatencyStats, samplesMs: number[]) => void;

// One in-flight command: its response callback, its failure callback, the
// deadline timer and when it was sent. The record is removed from
// `pendingCommands` before either callback runs, so a command settles exactly once.
interface PendingCommand {
  onResponse: (response: Response) => void;
  onFailure?: (failure: CommandFailure) => void;
  timer: ReturnType<typeof setTimeout>;
  sentAt: number;
}

export class ProtobufService {
  private cmdId = 0;
  private pendingCommands = new Map<number, PendingCommand>();
  private latency = new LatencyTracker();
  private lastLatencyEmitAt: number | null = null;

  constructor(
    private transport: SocketTransport,
    private events: EventRegistries,
    private commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
    private onLatencyStats?: LatencyStatsListener,
  ) {}

  // Fails every in-flight command as disconnected without reusing command IDs.
  // Mirrors RemoteClient::doDisconnectFromServer,
  // which answers each pending command RespNotConnected rather than dropping it.
  // The map is emptied before any callback runs, so a callback that re-enters
  // (sends a command, or triggers another reset) sees a clean slate.
  public resetCommands() {
    const pending = [...this.pendingCommands.values()];
    this.pendingCommands.clear();
    this.clearLatencyStats();

    // Cancel all deadlines before user code can throw or re-enter. IDs remain
    // monotonic so late responses cannot settle a later session's work.
    for (const command of pending) {
      clearTimeout(command.timer);
    }
    for (const command of pending) {
      try {
        command.onFailure?.(CommandFailure.Disconnected);
      } catch (error) {
        console.error('Command reset callback failed:', error);
      }
    }
  }

  public sendGameCommand<V, R = unknown>(
    gameId: number,
    ext: GenExtension<GameCommand, V>,
    value: V,
    options?: CommandOptions<R>
  ): void {
    this.sendGameCommands(gameId, [{ ext, value, judgeTargetId: options?.judgeTargetId }], options);
  }

  // Sends many game commands in ONE CommandContainer (one cmd_id, one server
  // response), mirroring Cockatrice's prepareGameCommand(commandList). Bare
  // entries ride directly in the container; judge-targeted entries are grouped
  // by target into one Command_Judge wrapper each (its game_command field is
  // repeated). Used for bulk card actions on a multi-selection.
  public sendGameCommands<R = unknown>(
    gameId: number,
    entries: ReadonlyArray<GameCommandEntry>,
    options?: CommandOptions<R>
  ): void {
    if (entries.length === 0) {
      return;
    }

    const gameCommand = this.createGameCommands(entries);

    // A single bare command keeps its own type name (legacy single-command
    // callers); anything batched is labelled generically for response logging.
    const typeName = entries.length === 1 && entries[0].judgeTargetId === undefined
      ? entries[0].ext.typeName
      : 'GameCommand[batch]';

    const cmd = create(CommandContainerSchema, { gameId, gameCommand });
    this.dispatchCommand(typeName, cmd, options);
  }

  // Builds the top-level GameCommand[] for a CommandContainer: bare entries ride
  // directly; judge-targeted entries are grouped by target into one Command_Judge
  // wrapper each. Mirrors Cockatrice's prepareGameCommand(commandList).
  private createGameCommands(entries: ReadonlyArray<GameCommandEntry>): GameCommand[] {
    const gameCommand: GameCommand[] = [];
    const judgeGroups = new Map<number, GameCommand[]>();

    for (const entry of entries) {
      const gameCmd = create(GameCommandSchema);
      setExtension(gameCmd, entry.ext, entry.value);
      if (entry.judgeTargetId === undefined) {
        gameCommand.push(gameCmd);
      } else {
        const group = judgeGroups.get(entry.judgeTargetId);
        if (group) {
          group.push(gameCmd);
        } else {
          judgeGroups.set(entry.judgeTargetId, [gameCmd]);
        }
      }
    }

    for (const [targetId, cmds] of judgeGroups) {
      gameCommand.push(this.createJudgeCommand(targetId, cmds));
    }
    return gameCommand;
  }

  // Nests a list of game commands under a Command_Judge so the server runs them
  // as targetId. Command_Judge.game_command is repeated, so one wrapper carries
  // every command for that owner.
  private createJudgeCommand(targetId: number, gameCommands: GameCommand[]): GameCommand {
    const judgeCmd = create(GameCommandSchema);
    setExtension(judgeCmd, Command_Judge_ext, create(Command_JudgeSchema, {
      targetId, gameCommand: gameCommands,
    }));
    return judgeCmd;
  }

  public sendRoomCommand<V, R = unknown>(
    roomId: number,
    ext: GenExtension<RoomCommand, V>,
    value: V,
    options?: CommandOptions<R>
  ): void {
    const roomCmd = create(RoomCommandSchema);
    setExtension(roomCmd, ext, value);
    const cmd = create(CommandContainerSchema, { roomId, roomCommand: [roomCmd] });
    this.dispatchCommand(ext.typeName, cmd, options);
  }

  public sendSessionCommand<V, R = unknown>(
    ext: GenExtension<SessionCommand, V>,
    value: V,
    options?: CommandOptions<R>
  ): void {
    const sesCmd = create(SessionCommandSchema);
    setExtension(sesCmd, ext, value);
    const cmd = create(CommandContainerSchema, { sessionCommand: [sesCmd] });
    this.dispatchCommand(ext.typeName, cmd, options);
  }

  public sendModeratorCommand<V, R = unknown>(
    ext: GenExtension<ModeratorCommand, V>,
    value: V,
    options?: CommandOptions<R>
  ): void {
    const modCmd = create(ModeratorCommandSchema);
    setExtension(modCmd, ext, value);
    const cmd = create(CommandContainerSchema, { moderatorCommand: [modCmd] });
    this.dispatchCommand(ext.typeName, cmd, options);
  }

  public sendAdminCommand<V, R = unknown>(
    ext: GenExtension<AdminCommand, V>,
    value: V,
    options?: CommandOptions<R>
  ): void {
    const adminCmd = create(AdminCommandSchema);
    setExtension(adminCmd, ext, value);
    const cmd = create(CommandContainerSchema, { adminCommand: [adminCmd] });
    this.dispatchCommand(ext.typeName, cmd, options);
  }

  // Developer-family commands (Cockatrice #7211). A message usable through several
  // families (Command_ViewLogHistory) declares one extension per family; callers pass
  // the DeveloperCommand-scoped one (`dev_ext`), mirroring desktop's
  // AbstractClient::prepareDeveloperCommand.
  public sendDeveloperCommand<V, R = unknown>(
    ext: GenExtension<DeveloperCommand, V>,
    value: V,
    options?: CommandOptions<R>
  ): void {
    const devCmd = create(DeveloperCommandSchema);
    setExtension(devCmd, ext, value);
    const cmd = create(CommandContainerSchema, { developerCommand: [devCmd] });
    this.dispatchCommand(ext.typeName, cmd, options);
  }

  // A command sent without options is fire-and-forget: neither its response nor
  // its failure is reported. Every other command settles through its options.
  private dispatchCommand<R>(typeName: string, cmd: CommandContainer, options?: CommandOptions<R>): void {
    const sent = this.sendCommand(
      cmd,
      raw => options && handleResponse(typeName, raw, options),
      failure => options && handleFailure(typeName, failure, options, Number(cmd.cmdId)),
      options?.timeoutMs,
    );

    if (!sent && options) {
      handleFailure(typeName, CommandFailure.NotSent, options);
    }
  }

  // Registers the command and sends it. Exactly one of `callback` (a server
  // response) or `onFailure` (deadline passed, or the connection reset) fires
  // later. Returns false, registering nothing, when the transport is not open.
  public sendCommand(
    cmd: CommandContainer,
    callback: (raw: Response) => void,
    onFailure?: (failure: CommandFailure) => void,
    timeoutMs = this.commandTimeoutMs,
  ): boolean {
    if (!this.transport.isOpen()) {
      return false;
    }

    const cmdId = ++this.cmdId;
    cmd.cmdId = BigInt(cmdId);
    const timer = setTimeout(() => this.expireCommand(cmdId), timeoutMs);
    this.pendingCommands.set(cmdId, { onResponse: callback, onFailure, timer, sentAt: performance.now() });
    this.transport.send(toBinary(CommandContainerSchema, cmd));
    return true;
  }

  private expireCommand(cmdId: number): void {
    const command = this.pendingCommands.get(cmdId);
    if (!command) {
      return;
    }
    this.pendingCommands.delete(cmdId);
    command.onFailure?.(CommandFailure.Timeout);
  }

  public handleMessageEvent({ data }: MessageEvent): void {
    try {
      const uint8msg = new Uint8Array(data);
      const msg: ServerMessage = fromBinary(ServerMessageSchema, uint8msg);

      if (msg) {
        switch (msg.messageType) {
          case ServerMessage_MessageType.RESPONSE:
            this.processServerResponse(msg.response);
            break;
          case ServerMessage_MessageType.ROOM_EVENT:
            this.processRoomEvent(msg.roomEvent);
            break;
          case ServerMessage_MessageType.SESSION_EVENT:
            this.processSessionEvent(msg.sessionEvent);
            break;
          case ServerMessage_MessageType.GAME_EVENT_CONTAINER:
            this.processGameEvent(msg.gameEventContainer);
            break;
          default:
            console.warn('Unknown message type:', msg);
            break;
        }
      }
    } catch (err) {
      console.error('Processing failed:', err);
    }
  }

  private processServerResponse(response: Response | undefined) {
    if (!response) {
      return;
    }
    const cmdId = Number(response.cmdId);
    const command = this.pendingCommands.get(cmdId);

    // No record: the command already timed out or was failed by a reset (or
    // the server answered something we never sent). It has settled; drop it.
    if (!command) {
      return;
    }
    this.pendingCommands.delete(cmdId);
    clearTimeout(command.timer);
    this.recordLatency(command);
    command.onResponse(response);
  }

  // Times every answered command from send to response (desktop
  // AbstractClient::recordLatency, #7153). Commands that expire or are failed
  // by a reset never answered, so they record nothing.
  private recordLatency(command: PendingCommand): void {
    const now = performance.now();
    this.latency.addSample(Math.round(now - command.sentAt));
    if (this.lastLatencyEmitAt === null || now - this.lastLatencyEmitAt >= LATENCY_STATS_INTERVAL_MS) {
      this.lastLatencyEmitAt = now;
      this.onLatencyStats?.(this.latency.stats(), this.latency.recentSamples());
    }
  }

  // Drops the window and pushes zeroed stats so the display clears (desktop
  // AbstractClient::clearLatencyStats on disconnect).
  private clearLatencyStats(): void {
    this.latency.clear();
    this.lastLatencyEmitAt = null;
    this.onLatencyStats?.(this.latency.stats(), []);
  }

  private processRoomEvent(event: RoomEvent | undefined) {
    if (!event) {
      return;
    }
    for (const [ext, handler] of this.events.room) {
      if (hasExtension(event, ext)) {
        handler(getExtension(event, ext), event);
        return;
      }
    }
  }

  private processSessionEvent(event: SessionEvent | undefined) {
    if (!event) {
      return;
    }
    for (const [ext, handler] of this.events.session) {
      if (hasExtension(event, ext)) {
        handler(getExtension(event, ext), undefined);
        return;
      }
    }
  }

  /**
   * Runs a recorded GameEventContainer through the same game-event registry live
   * traffic uses, addressed to `gameId`. Servatrice clears `game_id` on every
   * container it stores in a GameReplay (server_game.cpp sendGameEventContainer),
   * so the replay player supplies the id of the local game it is rebuilding.
   * Mirrors desktop feeding ReplayManager events into
   * GameEventHandler::processGameEventContainer.
   */
  public replayGameEventContainer(container: GameEventContainer, gameId: number, options?: ReplayEventOptions): void {
    this.dispatchGameEvents(container, gameId, options);
  }

  private processGameEvent(container: GameEventContainer | undefined): void {
    if (!container) {
      return;
    }
    this.dispatchGameEvents(container, container.gameId ?? -1);
  }

  private dispatchGameEvents(container: GameEventContainer, gameId: number, replayOptions?: ReplayEventOptions): void {
    if (!container.eventList?.length) {
      return;
    }

    const { context, secondsElapsed, forcedByJudge } = container;

    for (const event of container.eventList) {
      const meta: GameEventMeta = {
        gameId,
        playerId: event.playerId ?? -1,
        context,
        secondsElapsed: secondsElapsed ?? 0,
        forcedByJudge: forcedByJudge ?? 0,
        replayOptions,
      };

      for (const [ext, handler] of this.events.game) {
        if (hasExtension(event, ext)) {
          handler(getExtension(event, ext), meta);
          break;
        }
      }
    }
  }
}

import { getExtension } from '@bufbuild/protobuf';
import type { GenExtension } from '@bufbuild/protobuf/codegenv2';
import { create } from '@bufbuild/protobuf';
import { Response_ResponseCode, ResponseSchema, type Response } from '../generated';

/**
 * Why a command ended without a server answer. Desktop answers every such
 * command with a synthesised `RespNotConnected` (RemoteClient::ping for an
 * expired PendingCommand, RemoteClient::doDisconnectFromServer for a dropped
 * connection); Sockatrice does the same and passes the reason alongside it so a
 * caller can tell "never sent" from "timed out" from "connection lost".
 */
export enum CommandFailure {
  /** The socket was not open, so nothing was sent. */
  NotSent = 'not-sent',
  /** No response arrived before the command's deadline. */
  Timeout = 'timeout',
  /** The connection closed (or began reconnecting) while the command was in flight. */
  Disconnected = 'disconnected',
}

interface CommandOptionsBase {
  /**
   * Any non-OK outcome without a matching `onResponseCode` handler. Transport
   * failures arrive here too, as `RespNotConnected` with `failure` set; a
   * server-sent rejection leaves `failure` undefined.
   */
  onError?: (responseCode: number, raw: Response, failure?: CommandFailure) => void;
  onResponseCode?: { [code: number]: (raw: Response) => void };
  /** Every real server response, whatever its code. Never called for a transport failure. */
  onResponse?: (raw: Response) => void;
  judgeTargetId?: number;
  /** Milliseconds to wait for a response before failing with `CommandFailure.Timeout`. */
  timeoutMs?: number;
}

export interface CommandOptionsWithResponse<R> extends CommandOptionsBase {
  responseExt: GenExtension<Response, R>;
  onSuccess?: (response: R, raw: Response) => void;
}

export interface CommandOptionsWithoutResponse extends CommandOptionsBase {
  responseExt?: undefined;
  onSuccess?: () => void;
}

export type CommandOptions<R = unknown> = CommandOptionsWithResponse<R> | CommandOptionsWithoutResponse;

export function hasResponseExt<R>(options: CommandOptions<R>): options is CommandOptionsWithResponse<R> {
  return options.responseExt !== undefined;
}

export function handleResponse<R>(typeName: string, raw: Response, options: CommandOptions<R>): void {
  if (options.onResponse) {
    options.onResponse(raw);
    return;
  }

  const { responseCode } = raw;

  if (responseCode === Response_ResponseCode.RespOk) {
    if (hasResponseExt(options)) {
      options.onSuccess?.(getExtension(raw, options.responseExt), raw);
    } else {
      options.onSuccess?.();
    }
    return;
  }

  if (options.onResponseCode?.[responseCode]) {
    options.onResponseCode[responseCode](raw);
    return;
  }

  if (options.onError) {
    options.onError(responseCode, raw);
  } else {
    console.error(`${typeName} failed with response code: ${responseCode}`);
  }
}

// Settles a command that never got a server answer. Mirrors desktop, which feeds a
// synthesised RespNotConnected through the ordinary response handler: a matching
// `onResponseCode` entry wins, otherwise `onError` receives the code plus the reason.
// `onResponse` and `onSuccess` are skipped — no server spoke, so there is nothing
// for them to read (and the keepalive must not count a timeout as a pong).
export function handleFailure<R>(typeName: string, failure: CommandFailure, options: CommandOptions<R>, cmdId = 0): void {
  const raw = create(ResponseSchema, {
    cmdId: BigInt(cmdId),
    responseCode: Response_ResponseCode.RespNotConnected,
  });

  const codeHandler = options.onResponseCode?.[Response_ResponseCode.RespNotConnected];
  if (codeHandler) {
    codeHandler(raw);
    return;
  }

  if (options.onError) {
    options.onError(Response_ResponseCode.RespNotConnected, raw, failure);
  } else if (!options.onResponse) {
    console.warn(`${typeName} failed: ${failure}`);
  }
}

---
'@cockatrice/sockatrice': minor
---

Every command now reaches a terminal outcome. A pending command that gets no response within its deadline (default 18 s, desktop's `(timeout + 1) * keepalive`; override per command with `CommandOptions.timeoutMs`), or that is in flight when the connection closes or starts reconnecting, is answered with a synthesised `RespNotConnected`, as desktop's `RemoteClient` does. `onError` receives a third argument, `WebsocketTypes.CommandFailure` (`NotSent`, `Timeout`, `Disconnected`), so callers can tell a transport failure from a server rejection; `onResponse` and `onSuccess` never see a synthesised answer, and a late response for an expired command is dropped.

Deck list/download/upload, join room, create game and log search now report failures through new optional `IWebClientResponse` callbacks (`deckListFailed`, `deckDownloadFailed`, `deckUploadFailed`, `joinRoomFailed`, `createGameFailed`, `viewLogsFailed`). A join-game transport failure settles the join dialog through `setJoinGameError`. Login, password-salt, register and activate no longer overwrite the connection status (a ban or shutdown reason) when a disconnect cuts them off, and report a no-response message on timeout.

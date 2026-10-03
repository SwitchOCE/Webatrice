---
'@cockatrice/datatrice': minor
---

Implements Sockatrice's new command-failure callbacks as signal actions carrying the response code and transport reason: `server/deckListFailed`, `deckDownloadFailed`, `deckUploadFailed`, `viewLogsFailed` and `rooms/joinRoomFailed`, `createGameFailed`. New `getNotifications` and `getServerShutdown` selectors expose the `Event_NotifyUser` and `Event_ServerShutdown` messages the server slice already stored.

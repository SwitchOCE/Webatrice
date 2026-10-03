---
'@cockatrice/sockatrice': minor
---

Report views can now tell a failure from a slow server. `reportMyList`, `reportDetails` and the moderation-queue builders `reportList`, `reportStats` and `replayDownloadByGameId` take a trailing optional `onFailure(responseCode)`, and `reportAssign` / `reportResolve` also take a completion callback (`RespInvalidData` there means another moderator took or closed the report first). Results still reach `IWebClientResponse` as before. `reportUserInfo`, shared with the Moderation page, keeps reporting failure through `commandFailed`.

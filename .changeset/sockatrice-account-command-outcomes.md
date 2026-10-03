---
'@cockatrice/sockatrice': minor
---

The account commands report their outcome and send the wire shape Servatrice expects:

- `accountEdit(params, onEdited?, onFailure?)` takes a params object and leaves omitted fields unset,
  so an edit without `passwordCheck` no longer fails with `RespWrongPassword`.
- `accountPassword(oldPassword, newPassword, onChanged?, onFailure?)` hashes the new password under
  a fresh salt on servers that support password hashing and otherwise sends it plain — never both,
  since Servatrice prefers the plaintext field whenever it is present.
- `accountImage(image, onChanged?, onFailure?)`.
- Each `onFailure(responseCode, failure?)` also receives the transport `CommandFailure` (timeout,
  lost connection, not sent) when the server never answered.
- `ISessionResponse.accountActivationFailed` takes an optional `CommandFailure`, and the developer
  `viewLogHistory` reports failures through `moderator.commandFailed` like the moderator family.
- `WebClient.serverSupportsPasswordHash` records the identification capability, and
  `ISessionResponse.updateInfo` receives it as a new optional third argument (absent = unknown), so
  existing response implementations keep compiling.

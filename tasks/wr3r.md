# Task wr3r: PR R3, `refactor(datatrice,game): structured game-log entries and the lobby split`
Push branch: `claude/parity-r3-log-lobby`. PR file: `parity-r3-log-lobby`. Base: `BASE_PLACEHOLDER` (the tip that includes 30 and 25b).
Spec: `/tmp/notes/specs/aud2.md` (the architecture audit). Follow the refactor idioms of PR 05/09: characterization specs first (pin current behaviour and request shapes before moving code), then move, then delete. No behaviour change unless the audit names a bug; list any such fixes separately in the PR file. Every commit typechecks. Gate: the full gate plus webatrice e2e on all browsers.
Implement aud2 §4 R3 in full, plus duplicates D6 and D9:
- `messageLog` formatters return `{kind, params}` descriptors;
- `LogEntry.kind` replaces `classifyLogTone`;
- the timestamp becomes an action payload;
- one `formatLeaveMessage`;
- `ChatLog` renders descriptors through i18n keys, with phase names shared with `PhaseTrack`;
- the datatrice changeset is **minor**, and `text` stays for one release;
- re-key 29's live-region announcements onto `kind` and keep them green.

GameLobby split: `useLobbyDeckSummaries`, `useLobbyDeckSelect`, `lobbyDeckGrouping.ts`, `PlayerRow`/`EmptySeat`, kick out of JSX, shared `useBackendDeckList` + codec `validateCod` (D6, which also replaces the TopBar/useOpenDeckInEditor/useDeckList fetch copies), and bracket tone moved to a root owner.

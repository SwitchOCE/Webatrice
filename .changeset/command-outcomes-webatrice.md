---
'@cockatrice/webatrice': minor
---

Waiting on the server can no longer hang the UI, and server notices reach the user.

**Command failures settle with a reason.** My Decks shows why the deck list failed, with a Retry button, instead of spinning forever. The deck editor leaves its loading skeleton when the download fails, and autosave shows "Save failed" and resends on the next change instead of "Saving…" forever. Joining a room, creating a game, creating or importing a deck and searching the logs report failures in a dialog, with desktop's messages for server rejections and a timed-out / connection-lost reason when the server never answered.

**Crash containment.** A page that throws while rendering shows a recovery panel ("Reload page", "Return to lobby") instead of a blank app, and a game board crash keeps the top bar and your seat ("Reload board").

**Server notices.** A scheduled server shutdown shows its reason and a live countdown, and Event_NotifyUser messages (idle timeout, promotion, moderator warning, custom server messages, unknown events) appear as desktop's message boxes.

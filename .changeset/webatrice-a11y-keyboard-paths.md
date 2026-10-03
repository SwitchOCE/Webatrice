---
'@cockatrice/webatrice': patch
---

A game can now be joined without a mouse: a room's games list is a keyboard grid where the arrow keys, Home and End move the selection (scrolling it into view), Enter joins like a double-click, and the column headers are sort buttons. The top bar's room, game, replay and page tabs are links in a navigation landmark, reachable with Tab, each with a Close button named after its tab. Saved servers on the login screen are a listbox you can pick from with the keyboard, the connection test result is announced, and each Edit button names its server. Card names in chat preview on keyboard focus as well as hover. Screen readers get names for shortcut Edit and Reset buttons, report grids, game-creation sections, country flags and the "cards that use this token" toggle, and plain virtualized lists expose their items. The unused GameSelector, OpenGames and SayMessage components are removed.

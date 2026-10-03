export enum RouteEnum {
  PLAYER = '/player/:name',
  SERVER = '/server',
  ROOM = '/room/:roomId',
  LOGIN = '/login',
  LOGS = '/logs',
  GAME = '/game/:gameId',
  DECKS = '/decks',
  DECK = '/deck/:deckId',
  // A share link's decks, read-only: `?share=<token>&hostname=<host>&port=<port>`.
  SHARED_DECK = '/decks/shared',
  PUBLIC_DECKS = '/decks/public/:userName',
  ACCOUNT = '/account',
  ADMINISTRATION = '/administration',
  MODERATION = '/moderation',
  CARD_ART_RULES = '/card-art-rules',
  DEVELOPER = '/developer',
  REPLAYS = '/replays',
  SETTINGS = '/settings',
  SHORTCUTS = '/shortcuts',
  INITIALIZE = '/initialize',
  UNSUPPORTED = '/unsupported',
  // Rendered in a browser popup window spawned by the game sidebar
  // (window.open with a `webatrice-card-preview` target). Renders
  // only the card preview — no Layout/TopBar/AuthGuard — and mirrors
  // whatever the main window broadcasts on `webatrice-card-preview`.
  CARD_PREVIEW_POPUP = '/card-preview-popup',
}

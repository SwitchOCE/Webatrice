export enum RouteEnum {
  PLAYER = '/player/:name',
  SERVER = '/server',
  ROOM = '/room/:roomId',
  LOGIN = '/login',
  LOGS = '/logs',
  GAME = '/game/:gameId',
  DECKS = '/decks',
  DECK = '/deck/:deckId',
  // An unsaved deck handed to the editor by token (services/decks deckHandoff),
  // e.g. the game's "Open deck in deck editor".
  DECK_DRAFT = '/deck/draft/:token',
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

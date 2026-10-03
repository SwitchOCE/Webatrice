import { DEFAULT_PLAYMAT_SETTINGS, type PlaymatSettings } from './playmats';

/**
 * The persisted settings row (Dexie `settings` table, one row per `user`; the app-wide row is
 * `APP_USER`). Preference fields mirror desktop's `libcockatrice_settings` and keep its defaults
 * (see PREFERENCE_DEFAULTS). Adding a preference: declare it here and give it a default below;
 * every load fills a missing preference with its default. Bump SETTINGS_VERSION with a migration
 * step in `services/dexie/settingsMigration.ts` only when stored values must change.
 */
export class Setting {
  user: string;
  /** Schema version the row was last migrated to. Absent on rows written before versioning. */
  version?: number;
  // Override map for keyboard shortcuts. Keys are ActionId strings (kept loose here to
  // avoid coupling this types module to the shortcuts module). Absent = use defaults.
  shortcuts?: Record<string, string[]>;
  // Replay playback preferences (desktop `replay/fastForwardSpeed`,
  // `replay/skipEmptySections`). Absent = desktop defaults (10x, off).
  replayFastForwardSpeed?: number;
  replaySkipEmptySections?: boolean;

  // General — startup
  autoConnect: boolean;
  // Where a fresh login lands (desktop tabs_settings `startupTab`, `startupServer*`,
  // `startupRoomName`). `startupServer` is a known host's `host:port`, '' for any server.
  startupTab: StartupTab;
  startupServer: string;
  startupRoom: string;

  // General — version (desktop updates_settings `updateNotification`)
  notifyAboutMissingFeatures: boolean;

  // General — language. A `Language` code, or '' to follow the browser's language.
  language: string;

  // General — debug log (desktop servers_settings `clearDebugLogStatus`)
  clearDebugLogOnClose: boolean;

  // Appearance — theme palette
  themeMode: ThemeMode;
  playmatSettings: PlaymatSettings;

  // Appearance — menus (desktop interface `showShortcuts`)
  showShortcutsInMenus: boolean;

  // Appearance — card rendering (desktop cards_display `displayCardNames`,
  // `autoRotateSidewaysLayoutCards`, `scaleCards`, `roundCardCorners`; appearance `maxFontSize`)
  displayCardNames: boolean;
  autoRotateSidewaysLayoutCards: boolean;
  scaleCards: boolean;
  roundCardCorners: boolean;
  maxFontSizeForCards: number;

  // Appearance — card layout (desktop cards_display `verticalCardOverlapPercent`, interface
  // `cardViewInitialRowsMax`, `cardViewExpandedRowsMax`)
  /** How much of each card the next one covers on the stack and in a vertical hand, at least. */
  verticalCardOverlapPercent: number;
  /** A card view's height when it opens, and when its title bar is double-clicked, in rows. */
  cardViewInitialRowsMax: number;
  cardViewExpandedRowsMax: number;

  // Appearance — card counters (desktop card_counters.ini `cards/counters/<id>/color`), hex
  // without '#', as the chat colours.
  cardCounterColorA: string;
  cardCounterColorB: string;
  cardCounterColorC: string;
  cardCounterColorD: string;
  cardCounterColorE: string;
  cardCounterColorF: string;

  // Appearance — hand layout (desktop interface `hand/horizontal`, `leftJustified`)
  horizontalHand: boolean;
  leftJustifiedHand: boolean;

  // Appearance — table grid layout
  invertVerticalCoordinate: boolean;
  /** Seated players at which the board splits into two columns (desktop `minPlayersMulticolumn`). */
  minPlayersForMultiColumnLayout: number;

  // User interface — general (desktop interface_settings / cards_display_settings)
  /** Play a card with a double-click (desktop's default) rather than a single click. */
  doubleClickToPlay: boolean;
  /** A click to play plays every selected card of the zone when the clicked card is selected. */
  clickPlaysAllSelected: boolean;
  playToStack: boolean;
  /** Keep an arrow until the end of the phase group it was drawn in (combat, the beginning phase). */
  doNotDeleteArrowsInSubPhases: boolean;
  closeEmptyCardView: boolean;
  focusCardViewSearchBar: boolean;
  /** Give a new token its card's rules text as its annotation. */
  annotateTokens: boolean;
  /** How many cards a drag (rubber-band) selection holds, drawn in the band. */
  showDragSelectionCount: boolean;
  /** How many cards are selected, drawn in the board's corner once more than one is. */
  showTotalSelectionCount: boolean;
  /** Clicking the board leaves the focus where it is (on the chat); hides the card views' search. */
  keepGameChatFocus: boolean;

  // User interface — animations (desktop cards_display `tapAnimation`, `arrowDrawAnimation`;
  // interface `lifeCounterAnimationsEnabled`, `battlefieldFlashEnabled`)
  tapAnimation: boolean;
  arrowDrawAnimation: boolean;
  lifeCounterAnimations: boolean;
  battlefieldFlash: boolean;
  /**
   * Whether the user has set the animations. Until they have, the operating system's
   * reduced-motion setting turns them off (see useAnimationPreference).
   */
  animationsChosen: boolean;

  // User interface — deck editor/storage (desktop deck_editor_settings `openDeckInNewTab`,
  // `commanderspellbookintegrationenabled`)
  openDeckInNewTab: boolean;
  commanderSpellbookIntegration: CommanderSpellbookIntegration;

  // User interface — replay (desktop interface_settings `replay/rewindBufferingMs`)
  replayRewindBufferingMs: number;

  // User interface — notifications ("taskbar" alerts on desktop)
  notificationsEnabled: boolean;
  spectatorNotificationsEnabled: boolean;
  buddyConnectNotificationsEnabled: boolean;

  // Chat (desktop chat_settings). Colours are hex without '#', as desktop stores them.
  chatMention: boolean;
  chatMentionColor: string;
  chatMentionForeground: boolean;
  chatMentionCompleter: boolean;
  chatHighlightWords: string;
  chatHighlightColor: string;
  chatHighlightForeground: boolean;
  ignoreUnregisteredUsers: boolean;
  ignoreUnregisteredUserMessages: boolean;
  ignoreNonBuddyUserMessages: boolean;
  ignoreAllPrivateMessages: boolean;
  showMessagePopups: boolean;
  showMentionPopups: boolean;
  roomHistory: boolean;
  /** Stamp game log lines with the game time instead of the local time. */
  useGameTime: boolean;

  // In-game message macros (desktop message_settings). Read by the game's Say menu.
  messageMacros: readonly string[];

  // Sound (desktop sound_settings)
  soundEnabled: boolean;
  soundTheme: string;
  masterVolume: number;
}

export const APP_USER = '*app';

/** Desktop's "Active theme palette": a fixed palette, or follow the operating system. */
export enum ThemeMode {
  System = 'system',
  Light = 'light',
  Dark = 'dark',
}

/**
 * Desktop's startup tabs (tabs_settings.h `StartupTab`) that have a Webatrice page. Home, the
 * visual deck pages and a blank deck editor have none; see the General section.
 */
export enum StartupTab {
  Server = 'server',
  ServerRoom = 'serverRoom',
  DeckStorage = 'deckStorage',
  Replays = 'replays',
}

/**
 * Desktop's Commander Spellbook integration modes (deck_editor_settings.h
 * `commanderSpellbookIntegrationEnabledIndex`). The bracket estimate sends the deck list to
 * Commander Spellbook, so nothing is sent until the user picks Enabled (estimate on request) or
 * Automatic; Unprompted, the default, asks on first use.
 */
export enum CommanderSpellbookIntegration {
  Disabled = 'disabled',
  Enabled = 'enabled',
  Automatic = 'automatic',
  Unprompted = 'unprompted',
}

/** Every user-editable preference on the settings row. */
export type Preferences = Omit<Setting, 'user' | 'version' | 'shortcuts'>;
export type PreferenceKey = keyof Preferences;

type KeysOfType<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];
export type BooleanPreferenceKey = KeysOfType<Preferences, boolean>;
export type NumberPreferenceKey = KeysOfType<Preferences, number>;
export type StringPreferenceKey = KeysOfType<Preferences, string>;

export const DEFAULT_SOUND_THEME = 'Default';
export const DEFAULT_CHAT_COLOR = 'A6120D';

/** Desktop defaults, so a fresh browser behaves like a fresh desktop install. */
export const PREFERENCE_DEFAULTS: Readonly<Preferences> = Object.freeze({
  autoConnect: false,
  playmatSettings: DEFAULT_PLAYMAT_SETTINGS,
  // Desktop starts on its Home tab; Webatrice has none, and has always landed on the lobby.
  startupTab: StartupTab.Server,
  startupServer: '',
  startupRoom: '',

  notifyAboutMissingFeatures: true,

  language: '',

  clearDebugLogOnClose: false,

  // Desktop writes an unset scheme as "System" (theme_config.cpp).
  themeMode: ThemeMode.System,

  showShortcutsInMenus: true,

  displayCardNames: true,
  autoRotateSidewaysLayoutCards: true,
  scaleCards: true,
  roundCardCorners: true,
  maxFontSizeForCards: 12,

  verticalCardOverlapPercent: 33,
  cardViewInitialRowsMax: 14,
  cardViewExpandedRowsMax: 20,

  // QColor::fromHsv(id × 60, 150, 255), desktop's defaults.
  cardCounterColorA: 'FF6969',
  cardCounterColorB: 'FFFF69',
  cardCounterColorC: '69FF69',
  cardCounterColorD: '69FFFF',
  cardCounterColorE: '6969FF',
  cardCounterColorF: 'FF69FF',

  horizontalHand: true,
  leftJustifiedHand: false,

  invertVerticalCoordinate: false,
  minPlayersForMultiColumnLayout: 4,

  doubleClickToPlay: true,
  clickPlaysAllSelected: true,
  playToStack: true,
  doNotDeleteArrowsInSubPhases: true,
  closeEmptyCardView: true,
  focusCardViewSearchBar: true,
  annotateTokens: false,
  showDragSelectionCount: true,
  showTotalSelectionCount: true,
  keepGameChatFocus: false,

  tapAnimation: true,
  arrowDrawAnimation: true,
  lifeCounterAnimations: true,
  battlefieldFlash: true,
  animationsChosen: false,

  openDeckInNewTab: false,
  commanderSpellbookIntegration: CommanderSpellbookIntegration.Unprompted,

  replayRewindBufferingMs: 200,

  notificationsEnabled: true,
  spectatorNotificationsEnabled: false,
  buddyConnectNotificationsEnabled: true,

  chatMention: true,
  chatMentionColor: DEFAULT_CHAT_COLOR,
  chatMentionForeground: true,
  chatMentionCompleter: true,
  chatHighlightWords: '',
  chatHighlightColor: DEFAULT_CHAT_COLOR,
  chatHighlightForeground: true,
  ignoreUnregisteredUsers: false,
  ignoreUnregisteredUserMessages: false,
  ignoreNonBuddyUserMessages: false,
  ignoreAllPrivateMessages: false,
  showMessagePopups: true,
  showMentionPopups: true,
  roomHistory: true,
  useGameTime: false,

  // Frozen too: handed out before the row loads, it must not be pushed to.
  messageMacros: Object.freeze([]),

  soundEnabled: false,
  soundTheme: DEFAULT_SOUND_THEME,
  masterVolume: 100,
});

/** Current settings-row schema version. See `services/dexie/settingsMigration.ts`. */
export const SETTINGS_VERSION = 4;

/**
 * The persisted settings row (Dexie `settings` table, one row per `user`; the app-wide row is
 * `APP_USER`). Preference fields mirror desktop's `libcockatrice_settings` and keep its defaults
 * (see PREFERENCE_DEFAULTS). Adding a preference: declare it here, give it a default below, and
 * bump SETTINGS_VERSION with a migration step in `services/dexie/settingsMigration.ts`.
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

  // General — language. A `Language` code, or '' to follow the browser's language.
  language: string;

  // Appearance — theme palette
  themeMode: ThemeMode;

  // Appearance — table grid layout
  invertVerticalCoordinate: boolean;

  // User interface — general (desktop interface_settings / cards_display_settings)
  playToStack: boolean;
  closeEmptyCardView: boolean;
  tapAnimation: boolean;

  // User interface — notifications ("taskbar" alerts on desktop)
  notificationsEnabled: boolean;
  spectatorNotificationsEnabled: boolean;
  buddyConnectNotificationsEnabled: boolean;

  // Chat (desktop chat_settings). Colours are hex without '#', as desktop stores them.
  chatMention: boolean;
  chatMentionColor: string;
  chatMentionForeground: boolean;
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

  language: '',

  // Desktop writes an unset scheme as "System" (theme_config.cpp).
  themeMode: ThemeMode.System,

  invertVerticalCoordinate: false,

  playToStack: true,
  closeEmptyCardView: true,
  tapAnimation: true,

  notificationsEnabled: true,
  spectatorNotificationsEnabled: false,
  buddyConnectNotificationsEnabled: true,

  chatMention: true,
  chatMentionColor: DEFAULT_CHAT_COLOR,
  chatMentionForeground: true,
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

  // Frozen too: handed out before the row loads, it must not be pushed to.
  messageMacros: Object.freeze([]),

  soundEnabled: false,
  soundTheme: DEFAULT_SOUND_THEME,
  masterVolume: 100,
});

/** Current settings-row schema version. See `services/dexie/settingsMigration.ts`. */
export const SETTINGS_VERSION = 2;

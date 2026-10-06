import { DEFAULT_SOUND_THEME } from '@app/types';

/**
 * Every event sound desktop's SoundEngine knows (cockatrice/src/client/sound_engine.cpp). A theme
 * supplies any subset; events without a file in the active theme are silent, as on desktop.
 */
export const SOUND_NAMES = [
  // Phases, indexed like Phases::phases
  'untap_step', 'upkeep_step', 'draw_step', 'main_1', 'start_combat', 'attack_step', 'block_step',
  'damage_step', 'end_combat', 'main_2', 'end_step',
  // Game actions
  'draw_card', 'play_card', 'tap_card', 'untap_card', 'shuffle', 'roll_dice', 'life_change',
  // Players
  'player_join', 'player_leave', 'player_disconnect', 'player_reconnect', 'player_concede',
  // Spectators
  'spectator_join', 'spectator_leave',
  // Buddies
  'buddy_join', 'buddy_leave',
  // Chat
  'chat_mention', 'all_mention', 'private_message',
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

/** Desktop's phase sound for each phase number (game/phase.cpp). */
export const PHASE_SOUNDS: readonly SoundName[] = SOUND_NAMES.slice(0, 11);

/**
 * The sound themes shipped in `public/sounds/<theme>/<name>.wav`, copied from desktop's
 * `cockatrice/sounds`. A browser can't list a directory, so the files each theme provides are
 * declared here; keep this in step with the folders.
 */
export const SOUND_THEMES: Readonly<Record<string, readonly SoundName[]>> = {
  Default: [
    'attack_step', 'buddy_join', 'buddy_leave', 'end_step', 'player_join', 'start_combat', 'tap_card',
  ],
  Legacy: [
    'all_mention', 'chat_mention', 'draw_step', 'play_card', 'player_join', 'private_message', 'shuffle',
    'tap_card', 'untap_card',
  ],
};

/** Desktop's "Test system sound engine" button plays this. */
export const TEST_SOUND: SoundName = 'player_join';

export interface SoundOptions {
  enabled: boolean;
  theme: string;
  /** Master volume, 0–100. */
  volume: number;
}

/** Unknown themes fall back to the default, as desktop's ensureThemeDirectoryExists does. */
export function resolveSoundTheme(theme: string): string {
  return Object.prototype.hasOwnProperty.call(SOUND_THEMES, theme) ? theme : DEFAULT_SOUND_THEME;
}

export function soundUrl(theme: string, name: SoundName): string | null {
  const resolved = resolveSoundTheme(theme);
  if (!SOUND_THEMES[resolved].includes(name)) {
    return null;
  }
  return `${import.meta.env.BASE_URL}sounds/${resolved}/${name}.wav`;
}

/**
 * Plays event sounds through one HTMLAudioElement per file. Like desktop's single QMediaPlayer, a
 * new sound stops the one still playing. Browsers refuse audio until the page has had a user
 * gesture; such a refusal is dropped silently rather than queued, so no stale sound plays later.
 */
export class SoundEngine {
  private readonly elements = new Map<string, HTMLAudioElement>();
  private current: HTMLAudioElement | null = null;

  play(name: SoundName, options: SoundOptions): void {
    if (!options.enabled) {
      this.stop();
      return;
    }
    const url = soundUrl(options.theme, name);
    if (!url) {
      return;
    }

    this.stop();
    let audio = this.elements.get(url);
    if (!audio) {
      audio = new Audio(url);
      audio.preload = 'auto';
      this.elements.set(url, audio);
    }
    audio.volume = Math.min(Math.max(options.volume, 0), 100) / 100;
    audio.currentTime = 0;
    this.current = audio;
    // `play()` rejects with NotAllowedError before the first user gesture (autoplay policy).
    void audio.play()?.catch(() => undefined);
  }

  test(options: SoundOptions): void {
    this.play(TEST_SOUND, options);
  }

  stop(): void {
    if (this.current) {
      this.current.pause();
      this.current = null;
    }
  }
}

export const soundEngine = new SoundEngine();

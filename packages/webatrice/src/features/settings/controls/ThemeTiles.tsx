import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';

import { usePreference, useSettings } from '@app/hooks';
import { ThemeMode } from '@app/types';
import { cx } from '@app/utils';

import type { CustomControlProps } from '../registry';

type Shade = 'light' | 'dark';

const SHADES: Record<Shade, { base: string; surface: string; line: string; text: string; faint: string }> = {
  light: { base: 'bg-zinc-100', surface: 'bg-white', line: 'border-zinc-200', text: 'bg-zinc-600', faint: 'bg-zinc-300' },
  dark: { base: 'bg-zinc-900', surface: 'bg-zinc-800', line: 'border-zinc-700', text: 'bg-zinc-300', faint: 'bg-zinc-600' },
};

function MiniApp({ shade }: { shade: Shade }) {
  const c = SHADES[shade];
  return (
    <span aria-hidden className={cx('absolute inset-0 flex', c.base)}>
      <span className={cx('w-[18%] border-r p-1.5', c.surface, c.line)}>
        <span className="mb-1.5 block h-2.5 w-2.5 rounded-sm bg-accent" />
        <span className="mb-1 block h-1.5 rounded-full bg-accent/60" />
        <span className={cx('mb-1 block h-1.5 rounded-full', c.faint)} />
        <span className={cx('block h-1.5 rounded-full', c.faint)} />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-2">
        <span className={cx('block h-2 w-1/2 rounded-full', c.text)} />
        <span className="flex flex-1 gap-1.5">
          <span className={cx('flex-1 rounded-[3px] border p-1', c.surface, c.line)}>
            <span className={cx('mb-1 block h-1.5 w-3/4 rounded-full', c.text)} />
            <span className={cx('block h-1.5 w-1/2 rounded-full', c.faint)} />
          </span>
          <span className={cx('flex-1 rounded-[3px] border p-1', c.surface, c.line)}>
            <span className={cx('mb-1 block h-1.5 w-2/3 rounded-full', c.text)} />
            <span className="ml-auto mt-2 block h-2.5 w-1/2 rounded-[2px] bg-accent" />
          </span>
        </span>
      </span>
    </span>
  );
}

const THEME_LABEL_KEYS: Record<ThemeMode, string> = {
  [ThemeMode.Light]: 'SettingsAppearance.themeMode.light',
  [ThemeMode.Dark]: 'SettingsAppearance.themeMode.dark',
  [ThemeMode.System]: 'SettingsAppearance.themeMode.system',
};

const TILES: { mode: ThemeMode; icon: LucideIcon }[] = [
  { mode: ThemeMode.Light, icon: Sun },
  { mode: ThemeMode.Dark, icon: Moon },
  { mode: ThemeMode.System, icon: Monitor },
];

export default function ThemeTiles({ id, labelId, describedBy, disabled }: CustomControlProps) {
  const { t } = useTranslation();
  const settings = useSettings();
  const current = usePreference('themeMode');

  return (
    <div role="radiogroup" aria-labelledby={labelId} aria-describedby={describedBy} className="flex flex-wrap gap-gap">
      {TILES.map(({ mode, icon: Icon }) => {
        const on = current === mode;
        return (
          <label key={mode} className={cx('group relative', disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer')}>
            <input
              id={mode === current ? id : undefined}
              type="radio"
              name={`${id}-theme`}
              value={mode}
              checked={on}
              disabled={disabled}
              onChange={() => void settings.update({ themeMode: mode })}
              className="peer sr-only"
            />
            <span
              className={cx(
                'flex flex-col gap-1.5 rounded-ui-lg border p-1.5 transition-colors',
                'peer-focus-visible:outline peer-focus-visible:outline-2',
                'peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
                on ? 'border-accent bg-accent/10 ring-1 ring-accent' : 'border-border-subtle group-hover:border-border-strong',
              )}
            >
              <span className="relative block h-[68px] w-[124px] overflow-hidden rounded-ui">
                {mode === ThemeMode.System ? (
                  <>
                    <MiniApp shade="light" />
                    <span className="absolute inset-0 [clip-path:polygon(58%_0,100%_0,100%_100%,42%_100%)]">
                      <MiniApp shade="dark" />
                    </span>
                  </>
                ) : (
                  <MiniApp shade={mode === ThemeMode.Light ? 'light' : 'dark'} />
                )}
              </span>
              <span className="flex items-center gap-1.5 px-0.5 text-[12px] font-medium text-text-primary">
                <Icon size={13} aria-hidden className={on ? 'text-accent' : 'text-text-muted'} />
                {t(THEME_LABEL_KEYS[mode])}
                <span
                  aria-hidden
                  className={cx(
                    'ml-auto h-3.5 w-3.5 rounded-full border-2',
                    on ? 'border-accent bg-accent shadow-[inset_0_0_0_2px_rgb(var(--bg-surface))]' : 'border-border-control',
                  )}
                />
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

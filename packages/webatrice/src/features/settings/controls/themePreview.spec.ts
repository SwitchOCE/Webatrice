import { PALETTES } from '@app/services';

import { hexToTriplet, previewVars } from './themePreview';

describe('themePreview', () => {
  it('turns a hex colour into the space-separated RGB triplet the tokens use', () => {
    expect(hexToTriplet('#14101F')).toBe('20 16 31');
    expect(hexToTriplet('fff')).toBe('255 255 255');
  });

  it('scopes each scheme\'s real palette as token custom properties', () => {
    const dark = previewVars('dark') as Record<string, string>;
    const light = previewVars('light') as Record<string, string>;
    expect(dark['--bg-base']).toBe(hexToTriplet(PALETTES.dark['bg-base']));
    expect(light['--bg-base']).toBe(hexToTriplet(PALETTES.light['bg-base']));
    expect(light['--accent-primary']).toBe(hexToTriplet(PALETTES.light['accent-primary']));
    expect(Object.keys(dark)).toEqual(expect.arrayContaining(['--bg-surface', '--border-subtle', '--text-muted']));
  });
});

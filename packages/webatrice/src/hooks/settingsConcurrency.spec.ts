import 'fake-indexeddb/auto';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { APP_USER, CommanderSpellbookIntegration, PREFERENCE_DEFAULTS, ThemeName } from '@app/types';

vi.unmock('dexie');

async function openTab() {
  const { default: dexie } = await import('dexie');
  const settings = await import('./useSettings');
  const playmat = await import('./usePlaymatSettings');
  const bracket = await import('../features/decks/bracketConsent');
  const { dexieService } = await import('../services/dexie/DexieService');
  const { CardDataSettingsDTO } = await import('../services/dexie/DexieDTOs/CardDataSettingsDTO');
  const { cardDatabaseService } = await import('../services/cardDatabase/CardDatabaseService');
  const { refreshCardDataPreferences } = await import('../services/cardDatabase/cardDataPreferences');
  return { dexie, ...settings, ...playmat, ...bracket, dexieService, CardDataSettingsDTO, cardDatabaseService, refreshCardDataPreferences };
}

let first: Awaited<ReturnType<typeof openTab>>;
let second: typeof first;

function barrier() {
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    release = () => {
      setTimeout(resolve, 0);
    };
  });
  return { reached, release };
}

beforeAll(async () => {
  first = await openTab();
  vi.resetModules();
  second = await openTab();
  expect(first.dexieService.settings.db).not.toBe(second.dexieService.settings.db);
});

beforeEach(async () => {
  first.settingsStore.reset();
  second.settingsStore.reset();
  await first.dexieService.settings.clear();
  await first.dexieService.cardDataSettings.clear();
  await Promise.all([first.getSettings(), second.getSettings()]);
});

afterEach(() => {
  cleanup();
  first.settingsStore.reset();
  second.settingsStore.reset();
});

afterAll(() => {
  first.dexieService.settings.db.close();
  second.dexieService.settings.db.close();
});

it('preserves different preference edits from stale tabs and refreshes both tabs without reload', async () => {
  const a = renderHook(() => first.useSettings());
  const b = renderHook(() => second.useSettings());
  const stale = second.settingsStore.peek()!;
  await act(async () => {
    await a.result.current.update({ soundEnabled: true });
    second.settingsStore.setValue(stale);
    await b.result.current.update({ autoConnect: true });
  });
  await waitFor(() => {
    expect(a.result.current.value).toMatchObject({ soundEnabled: true, autoConnect: true });
    expect(b.result.current.value).toMatchObject({ soundEnabled: true, autoConnect: true });
  });
  expect(await first.dexieService.settings.get(APP_USER)).toMatchObject({ soundEnabled: true, autoConnect: true });
  expect(await second.getSettings()).toMatchObject({ soundEnabled: true, autoConnect: true });
});

it('merges playmat edits with the current nested settings and preserves bracket consent', async () => {
  const stale = second.settingsStore.peek()!;
  await first.setPlaymatSettings({ visibility: 0 });
  await first.writeBracketLookupsMode(CommanderSpellbookIntegration.Automatic);
  second.settingsStore.setValue(stale);
  await second.setPlaymatSettings({ mode: PREFERENCE_DEFAULTS.playmatSettings.mode, fallbackBehavior: 2 });
  await waitFor(() => {
    for (const tab of [first, second]) {
      expect(tab.getPreferencesSnapshot()).toMatchObject({
        commanderSpellbookIntegration: CommanderSpellbookIntegration.Automatic,
        playmatSettings: { visibility: 0, fallbackBehavior: 2 },
      });
    }
  });
});

it('keeps unrelated changes when bracket consent is written from a stale tab', async () => {
  const stale = second.settingsStore.peek()!;
  const hook = renderHook(() => first.useSettings());
  await act(async () => {
    await hook.result.current.update({ autoConnect: true });
  });
  await act(async () => {
    second.settingsStore.setValue(stale);
    await second.writeBracketLookupsMode(CommanderSpellbookIntegration.Disabled);
  });
  expect(await first.dexieService.settings.get(APP_USER)).toMatchObject({
    autoConnect: true,
    commanderSpellbookIntegration: CommanderSpellbookIntegration.Disabled,
  });
});

it('migrates rows delivered by liveQuery before publishing refreshed snapshots', async () => {
  await second.dexieService.settings.put({ user: APP_USER, version: 4, themeName: ThemeName.Graphite, soundEnabled: true });
  await waitFor(() => {
    for (const tab of [first, second]) {
      expect(tab.getPreferencesSnapshot()).toMatchObject({ themeName: ThemeName.Midnight, soundEnabled: true });
    }
  });
});

it.each(['update check', 'templates', 'new sets'] as const)(
  'serializes %s with an override in another connection using read barriers', async (kind) => {
    await first.dexieService.cardDataSettings.put({
      id: 'singleton',
      cardOverrides: { Counterspell: 'keep' },
      pictureUrlTemplates: ['old'],
      alwaysEnableNewSets: false,
    });
    const read = barrier();
    const resume = barrier();
    const competingRead = barrier();
    const getFirst = first.CardDataSettingsDTO.get.bind(first.CardDataSettingsDTO);
    const getSecond = second.CardDataSettingsDTO.get.bind(second.CardDataSettingsDTO);
    vi.spyOn(first.CardDataSettingsDTO, 'get').mockImplementationOnce(async () => {
      const row = await getFirst();
      read.release();
      await first.dexie.waitFor(resume.reached);
      return row;
    });
    vi.spyOn(second.CardDataSettingsDTO, 'get').mockImplementationOnce(() => {
      competingRead.release();
      return getSecond();
    });
    const at = new Date('2026-11-06T00:00:00Z');
    const pending = kind === 'update check'
      ? first.cardDatabaseService.recordUpdateCheck(at)
      : kind === 'templates'
        ? first.cardDatabaseService.savePictureUrlTemplates(['new'])
        : first.cardDatabaseService.resolveUnknownSets('enable-always');
    await read.reached;
    const override = second.dexie.ignoreTransaction(() =>
      second.CardDataSettingsDTO.setCardOverride('Dr. Julius Jumblemorph', 'printing'));
    try {
      await competingRead.reached;
    } finally {
      resume.release();
    }
    await Promise.all([pending, override]);
    const expected = {
      cardOverrides: { Counterspell: 'keep', 'Dr. Julius Jumblemorph': 'printing' },
      ...(kind === 'update check' ? { lastUpdateCheck: at.toISOString() } : {}),
      pictureUrlTemplates: kind === 'templates' ? ['new'] : ['old'],
      alwaysEnableNewSets: kind === 'new sets',
    };
    expect(await first.CardDataSettingsDTO.get()).toMatchObject(expected);
    expect(await second.CardDataSettingsDTO.get()).toMatchObject(expected);
    expect((await first.refreshCardDataPreferences()).cardOverrides).toEqual(expected.cardOverrides);
    expect((await second.refreshCardDataPreferences()).cardOverrides).toEqual(expected.cardOverrides);
    await second.CardDataSettingsDTO.setCardOverride('Dr. Julius Jumblemorph', undefined);
    expect((await first.CardDataSettingsDTO.get()).cardOverrides).toEqual({ Counterspell: 'keep' });
  },
);

it('preserves concurrent update-check and template writes', async () => {
  await Promise.all([
    first.cardDatabaseService.recordUpdateCheck(new Date('2026-11-06T00:00:00Z')),
    second.cardDatabaseService.savePictureUrlTemplates(['new']),
  ]);
  expect(await first.CardDataSettingsDTO.get()).toMatchObject({
    lastUpdateCheck: '2026-11-06T00:00:00.000Z',
    pictureUrlTemplates: ['new'],
  });
});

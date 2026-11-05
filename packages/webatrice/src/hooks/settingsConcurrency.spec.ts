import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
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
  const cardPreferences = await import('../services/cardDatabase/cardDataPreferences');
  const { cardDataPreferencesStore } = await import('./useCardDataPreferences');
  const { SettingDTO } = await import('../services/dexie/DexieDTOs/SettingDTO');
  const { useShortcutsHydration } = await import('../feature-widgets/shortcuts/useShortcutsHydration');
  const { useShortcutsPersistence } = await import('../feature-widgets/shortcuts/useShortcutsPersistence');
  const { shortcuts } = await import('../store');
  const { makeReduxHookWrapper } = await import('../__test-utils__/makeHookWrapper');
  const { default: HighlightWordsField } = await import('../features/settings/controls/HighlightWordsField');
  return {
    dexie, ...settings, ...playmat, ...bracket, ...cardPreferences, cardDataPreferencesStore,
    dexieService, SettingDTO, CardDataSettingsDTO, cardDatabaseService,
    useShortcutsHydration, useShortcutsPersistence, shortcuts, makeReduxHookWrapper, HighlightWordsField,
  };
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

function holdSettingsWrites(tab: typeof first, ...gates: { read: ReturnType<typeof barrier>; resume: ReturnType<typeof barrier> }[]) {
  const get = tab.SettingDTO.get.bind(tab.SettingDTO);
  vi.spyOn(tab.SettingDTO, 'get').mockImplementation((user) => {
    const gate = tab.dexie.currentTransaction?.mode === 'readwrite' ? gates.shift() : undefined;
    return get(user).then(async (row) => {
      if (gate) {
        gate.read.release();
        await tab.dexie.waitFor(gate.resume.reached);
      }
      return row;
    });
  });
  return get;
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
    await Promise.all([first.cardDataPreferencesStore.whenReady(), second.cardDataPreferencesStore.whenReady()]);
    const read = barrier();
    const resume = barrier();
    const competingRead = barrier();
    const getFirst = first.CardDataSettingsDTO.get.bind(first.CardDataSettingsDTO);
    const getSecond = second.CardDataSettingsDTO.get.bind(second.CardDataSettingsDTO);
    let held = false;
    vi.spyOn(first.CardDataSettingsDTO, 'get').mockImplementation(async () => {
      const hold = !held && first.dexie.currentTransaction?.mode === 'readwrite';
      held ||= hold;
      const row = await getFirst();
      if (hold) {
        read.release();
        await first.dexie.waitFor(resume.reached);
      }
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
    await waitFor(async () => {
      for (const tab of [first, second]) {
        expect(await tab.currentCardDataPreferences()).toMatchObject({
          cardOverrides: expected.cardOverrides, pictureUrlTemplates: expected.pictureUrlTemplates,
        });
        expect(tab.cardDataPreferencesStore.peek()).toMatchObject({
          cardOverrides: expected.cardOverrides, pictureUrlTemplates: expected.pictureUrlTemplates,
        });
        expect(await tab.getCardPreferenceOverride('Dr. Julius Jumblemorph')).toBe('printing');
      }
    });
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

it('merges stale shortcut edits, refreshes both Redux stores and does not write refreshed bindings back', async () => {
  function mount(tab: typeof first) {
    const { Wrapper, store } = tab.makeReduxHookWrapper(
      { shortcuts: tab.shortcuts.shortcutsReducer } as any,
      { shortcuts: { overrides: {}, hydrated: false, recordingActionId: null, recordingSequences: [] } } as any,
    );
    renderHook(() => {
      tab.useShortcutsHydration();
      tab.useShortcutsPersistence();
    }, { wrapper: Wrapper });
    return store;
  }
  const a = mount(first);
  const b = mount(second);
  const read = barrier();
  const resume = barrier();
  const get = second.SettingDTO.get.bind(second.SettingDTO);
  vi.spyOn(second.SettingDTO, 'get').mockImplementationOnce((user) => get(user).then(async (row) => {
    read.release();
    await resume.reached;
    return row;
  }));
  const writeA = vi.spyOn(first.SettingDTO, 'patch');
  const writeB = vi.spyOn(second.SettingDTO, 'patch');
  try {
    await act(async () => {
      a.dispatch(first.shortcuts.Actions.setOverride({ actionId: 'game.drawCard', sequences: ['F2'] }));
    });
    await read.reached;
    expect((b.getState() as any).shortcuts.overrides).toEqual({});
    await act(async () => {
      b.dispatch(second.shortcuts.Actions.setOverride({ actionId: 'game.untapAll', sequences: ['F3'] }));
    });
    await waitFor(async () => expect((await get(APP_USER)).shortcuts).toEqual({
      'game.drawCard': ['F2'], 'game.untapAll': ['F3'],
    }));
  } finally {
    resume.release();
  }
  await waitFor(() => {
    for (const store of [a, b]) {
      expect((store.getState() as any).shortcuts.overrides).toEqual({
        'game.drawCard': ['F2'], 'game.untapAll': ['F3'],
      });
    }
  });
  expect(writeA).toHaveBeenCalledTimes(1);
  expect(writeB).toHaveBeenCalledTimes(1);
  await act(async () => {
    b.dispatch(second.shortcuts.Actions.resetAction({ actionId: 'game.drawCard' }));
  });
  await waitFor(async () => {
    expect((await get(APP_USER)).shortcuts).toEqual({ 'game.untapAll': ['F3'] });
    expect((a.getState() as any).shortcuts.overrides).toEqual({ 'game.untapAll': ['F3'] });
  });
  expect(writeA).toHaveBeenCalledTimes(1);
  expect(writeB).toHaveBeenCalledTimes(2);
});

it('keeps newer typed words visible when an earlier commit and refresh arrive', async () => {
  const view = render(createElement(first.HighlightWordsField, { id: 'words', labelId: 'words-label', disabled: false }));
  const input = view.getByRole('textbox');
  const read = barrier();
  const resume = barrier();
  const get = holdSettingsWrites(first, { read, resume });
  const secondRead = barrier();
  const secondResume = barrier();
  const patch = first.SettingDTO.patch.bind(first.SettingDTO);
  const writes: Promise<unknown>[] = [];
  vi.spyOn(first.SettingDTO, 'patch').mockImplementation((...args) => {
    const delayed = typeof args[1] === 'object' && args[1]?.chatHighlightWords === 'abc';
    const writing = delayed ? secondResume.reached.then(() => patch(...args)) : patch(...args);
    if (delayed) {
      secondRead.release();
    }
    writes.push(writing);
    return writing;
  });
  try {
    act(() => fireEvent.change(input, { target: { value: 'a' } }));
    expect(first.getPreferencesSnapshot().chatHighlightWords).toBe('a');
    await read.reached;
    act(() => fireEvent.change(input, { target: { value: 'ab' } }));
    expect(first.getPreferencesSnapshot().chatHighlightWords).toBe('ab');
    act(() => fireEvent.change(input, { target: { value: 'abc' } }));
    resume.release();
    await secondRead.reached;
    await waitFor(async () => expect((await second.SettingDTO.get(APP_USER)).chatHighlightWords).toBe('ab'));
    await act(async () => {
      await second.updateSettings({ autoConnect: true });
    });
    await waitFor(() => expect(first.getPreferencesSnapshot().autoConnect).toBe(true));
    expect(input).toHaveValue('abc');
    expect(first.getPreferencesSnapshot().chatHighlightWords).toBe('abc');
  } finally {
    resume.release();
    secondResume.release();
    await Promise.resolve();
    await Promise.all(writes);
  }
  await waitFor(async () => expect((await get(APP_USER)).chatHighlightWords).toBe('abc'));
});

it('publishes playmat changes synchronously and retains newer edits over earlier commits', async () => {
  const resume = barrier();
  const read = barrier();
  const secondRead = barrier();
  const secondResume = barrier();
  holdSettingsWrites(first, { read, resume }, { read: secondRead, resume: secondResume });
  const older = first.setPlaymatSettings({ visibility: 0 });
  let newer: Promise<void> | undefined;
  try {
    expect(first.getPlaymatSettings().visibility).toBe(0);
    await read.reached;
    newer = first.setPlaymatSettings({ visibility: 2 });
    expect(first.getPlaymatSettings().visibility).toBe(2);
    resume.release();
    await secondRead.reached;
    await older;
    expect(first.getPlaymatSettings().visibility).toBe(2);
  } finally {
    resume.release();
    secondResume.release();
    await Promise.all([older, newer]);
  }
  expect((await second.SettingDTO.get(APP_USER)).playmatSettings.visibility).toBe(2);
});

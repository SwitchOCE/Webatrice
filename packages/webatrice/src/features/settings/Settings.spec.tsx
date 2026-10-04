import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithProviders, connectedState } from '../../__test-utils__';
import { getPreferencesSnapshot, getSettings, settingsStore } from '../../hooks/useSettings';
import { shortcuts } from '../../store';
import { DEFAULT_PLAYMAT_SETTINGS, setPlaymatSettings } from '@app/hooks';
import { soundEngine } from '../../services';
import Settings from './Settings';

const renderSettings = async () => {
  const result = renderWithProviders(<Settings />, { preloadedState: connectedState });
  await act(async () => {
    await getSettings();
  });
  return result;
};

const openSection = (name: RegExp) => {
  fireEvent.click(screen.getByRole('tab', { name }));
};

const search = (value: string) => {
  fireEvent.change(screen.getByLabelText(/Settings\.searchLabel/), { target: { value } });
};

describe('Settings', () => {
  beforeEach(() => {
    // Fresh defaults per test: the store is a module singleton and Dexie is stubbed empty.
    settingsStore.reset();
  });

  it('lists the registered sections in desktop order and opens the first', async () => {
    await renderSettings();

    const tabs = within(screen.getByRole('tablist', { name: /Settings\.title/ })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Settings.section.general',
      'Settings.section.appearance',
      'Settings.section.userInterface',
      'Settings.section.cardSources',
      'Settings.section.storage',
      'Settings.section.chat',
      'Settings.section.sound',
      'Settings.section.shortcuts',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('SettingsGeneral.group.language');
  });

  it('switches section on click and with the arrow keys', async () => {
    await renderSettings();

    openSection(/Settings\.section\.sound/);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('SettingsSound.group.sound');

    fireEvent.keyDown(screen.getByRole('tab', { name: /Settings\.section\.sound/ }), { key: 'ArrowDown' });
    expect(screen.getByRole('tab', { name: /Settings\.section\.shortcuts/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Settings\.section\.shortcuts/ })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('tab', { name: /Settings\.section\.shortcuts/ }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: /Settings\.section\.general/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('saves a preference as soon as its control changes', async () => {
    await renderSettings();
    openSection(/Settings\.section\.userInterface/);

    const toggle = screen.getByRole('switch', { name: /SettingsUserInterface\.closeEmptyCardView\.label/ });
    expect(toggle).toBeChecked();

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(toggle).not.toBeChecked();
    expect(getPreferencesSnapshot().closeEmptyCardView).toBe(false);
  });

  it('records an animation switch as a choice for every animation', async () => {
    await renderSettings();
    openSection(/Settings\.section\.userInterface/);

    const tap = screen.getByRole('switch', { name: /SettingsUserInterface\.tapAnimation\.label/ });
    expect(tap).toBeChecked();
    await act(async () => {
      fireEvent.click(tap);
    });

    expect(tap).not.toBeChecked();
    expect(getPreferencesSnapshot()).toMatchObject({
      animationsChosen: true,
      tapAnimation: false,
      arrowDrawAnimation: true,
      lifeCounterAnimations: true,
      battlefieldFlash: true,
    });
  });

  it('turns every animation off and on with desktop\'s two buttons', async () => {
    await renderSettings();
    openSection(/Settings\.section\.userInterface/);
    const switches = () => ['tapAnimation', 'arrowDrawAnimation', 'lifeCounterAnimations', 'battlefieldFlash']
      .map((key) => screen.getByRole('switch', { name: new RegExp(`SettingsUserInterface\\.${key}\\.label`) }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'SettingsUserInterface.animations.disableAll' }));
    });
    switches().forEach((toggle) => expect(toggle).not.toBeChecked());
    expect(getPreferencesSnapshot()).toMatchObject({ animationsChosen: true, battlefieldFlash: false });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'SettingsUserInterface.animations.enableAll' }));
    });
    switches().forEach((toggle) => expect(toggle).toBeChecked());
  });

  it('disables a setting while the preference it depends on is off', async () => {
    await renderSettings();
    openSection(/Settings\.section\.userInterface/);

    const buddies = /SettingsUserInterface\.buddyConnectNotificationsEnabled\.label/;
    expect(screen.getByRole('switch', { name: buddies })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: /SettingsUserInterface\.notificationsEnabled\.label/ }));
    });

    expect(screen.getByRole('switch', { name: buddies })).toBeDisabled();
  });

  it('keeps the volume and theme editable while sound is off, as desktop does', async () => {
    await renderSettings();
    openSection(/Settings\.section\.sound/);

    expect(getPreferencesSnapshot().soundEnabled).toBe(false);
    expect(screen.getByLabelText(/SettingsSound\.masterVolume\.label/)).toBeEnabled();
    expect(screen.getByLabelText(/SettingsSound\.soundTheme\.label/)).toBeEnabled();
  });

  it('saves the volume once the slider is let go, and plays the test sound then', async () => {
    const test = vi.spyOn(soundEngine, 'test').mockImplementation(() => {});
    await renderSettings();
    openSection(/Settings\.section\.sound/);
    const slider = screen.getByLabelText(/SettingsSound\.masterVolume\.label/);

    fireEvent.input(slider, { target: { value: '40' } });
    expect(slider).toHaveValue('40');
    expect(getPreferencesSnapshot().masterVolume).toBe(100);
    expect(test).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.change(slider, { target: { value: '30' } });
    });

    expect(getPreferencesSnapshot().masterVolume).toBe(30);
    expect(test).toHaveBeenCalledWith(expect.objectContaining({ volume: 30 }));
    test.mockRestore();
  });

  it('saves a spin box once its number is committed, kept within its range', async () => {
    await renderSettings();
    openSection(/Settings\.section\.appearance/);
    const box = screen.getByLabelText(/SettingsAppearance\.minPlayersForMultiColumnLayout\.label/);
    expect(box).toHaveValue(4);
    // As a browser does: an input event per keystroke, then one change event on Enter or blur.
    const commit = async (value: string) => {
      fireEvent.input(box, { target: { value } });
      await act(async () => {
        fireEvent.change(box);
      });
    };

    fireEvent.input(box, { target: { value: '6' } });
    expect(getPreferencesSnapshot().minPlayersForMultiColumnLayout).toBe(4);
    await act(async () => {
      fireEvent.change(box);
    });
    expect(getPreferencesSnapshot().minPlayersForMultiColumnLayout).toBe(6);

    // Below desktop's minimum of 2: clamped, as QSpinBox does.
    await commit('1');
    expect(getPreferencesSnapshot().minPlayersForMultiColumnLayout).toBe(2);
    expect(box).toHaveValue(2);

    // A cleared box saves nothing and shows the stored value again.
    await commit('');
    expect(getPreferencesSnapshot().minPlayersForMultiColumnLayout).toBe(2);
    expect(box).toHaveValue(2);
  });

  it('keeps the card view\'s initial rows at most its expanded rows, as desktop\'s coupled boxes do', async () => {
    await renderSettings();
    openSection(/Settings\.section\.appearance/);
    const initial = screen.getByLabelText(/SettingsAppearance\.cardViewInitialRowsMax\.label/);
    const expanded = screen.getByLabelText(/SettingsAppearance\.cardViewExpandedRowsMax\.label/);
    const commit = async (box: HTMLElement, value: string) => {
      fireEvent.input(box, { target: { value } });
      await act(async () => {
        fireEvent.change(box);
      });
    };

    await commit(initial, '30');
    expect(getPreferencesSnapshot()).toMatchObject({ cardViewInitialRowsMax: 30, cardViewExpandedRowsMax: 30 });
    expect(expanded).toHaveValue(30);

    await commit(expanded, '10');
    expect(getPreferencesSnapshot()).toMatchObject({ cardViewInitialRowsMax: 10, cardViewExpandedRowsMax: 10 });

    await commit(expanded, '25');
    expect(getPreferencesSnapshot()).toMatchObject({ cardViewInitialRowsMax: 10, cardViewExpandedRowsMax: 25 });
  });

  it('stores colors as desktop does, as hex without the hash', async () => {
    await renderSettings();
    openSection(/Settings\.section\.chat/);

    const color = screen.getByLabelText(/SettingsChat\.chatMentionColor\.label/);
    expect(color).toHaveValue('#a6120d');

    await act(async () => {
      fireEvent.change(color, { target: { value: '#00ff88' } });
    });
    expect(getPreferencesSnapshot().chatMentionColor).toBe('00FF88');
  });

  it('offers every shipped sound theme', async () => {
    await renderSettings();
    openSection(/Settings\.section\.sound/);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: /SettingsSound\.soundEnabled\.label/ }));
    });

    const select = screen.getByLabelText(/SettingsSound\.soundTheme\.label/);
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Default', 'Legacy']);

    await act(async () => {
      fireEvent.change(select, { target: { value: 'Legacy' } });
    });
    expect(getPreferencesSnapshot().soundTheme).toBe('Legacy');
  });

  it('restores a section to its defaults once confirmed', async () => {
    await renderSettings();
    openSection(/Settings\.section\.chat/);

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: /SettingsChat\.roomHistory\.label/ }));
    });
    expect(getPreferencesSnapshot().roomHistory).toBe(false);

    const restore = screen.getByRole('button', { name: /Settings\.restoreDefaults/ });
    fireEvent.click(restore);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Settings\.restoreDefaultsConfirm\.cancel/ }));
    expect(getPreferencesSnapshot().roomHistory).toBe(false);

    fireEvent.click(restore);
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Settings\.restoreDefaults$/ }));
    });
    expect(getPreferencesSnapshot().roomHistory).toBe(true);
  });

  it('saves the theme palette and the language from their sections', async () => {
    await renderSettings();

    openSection(/Settings\.section\.appearance/);
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/SettingsAppearance\.themeMode\.label/), { target: { value: 'light' } });
    });
    expect(getPreferencesSnapshot().themeMode).toBe('light');

    openSection(/Settings\.section\.general/);
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/SettingsGeneral\.language\.label/), { target: { value: 'de' } });
    });
    expect(getPreferencesSnapshot().language).toBe('de');
  });

  it('edits the picture download URLs on the Card Sources page, outside "Restore defaults"', async () => {
    await renderSettings();
    openSection(/Settings\.section\.cardSources/);

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('SettingsCardSources.group.downloads')).toBeInTheDocument();
    const editor = within(panel).getByRole('group', { name: /SettingsCardSources\.pictureUrls\.label/ });
    expect(editor).toHaveAccessibleDescription(/SettingsCardSources\.pictureUrls\.description/);
    expect(within(editor).getByRole('listbox', { name: /CardSourcesSettings\.label\.list/ })).toBeInTheDocument();
    // The templates are card data, not settings-row preferences, so the page has nothing to restore.
    expect(within(panel).queryByRole('button', { name: /Settings\.restoreDefaults/ })).not.toBeInTheDocument();
  });

  it('lays out the Appearance page in desktop\'s group order', async () => {
    await renderSettings();
    openSection(/Settings\.section\.appearance/);

    const groups = within(screen.getByRole('tabpanel')).getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(groups).toEqual([
      'SettingsAppearance.group.theme',
      'PlaymatSettings.title',
      'SettingsAppearance.group.zoneBackgrounds',
      'SettingsAppearance.group.menus',
      'SettingsAppearance.group.cardPrintings',
      'SettingsAppearance.group.cardRendering',
      'SettingsAppearance.group.cardLayout',
      'SettingsAppearance.group.cardCounters',
      'SettingsAppearance.group.handLayout',
      'SettingsAppearance.group.tableGrid',
    ]);
  });

  it('shows the playmat settings as a group of the Appearance page', async () => {
    await renderSettings();
    openSection(/Settings\.section\.appearance/);

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('PlaymatSettings.title')).toBeInTheDocument();
    expect(within(panel).getByRole('region', { name: 'PlaymatSettings.label' })).toBeInTheDocument();
  });

  it('finds the picture download URLs by search', async () => {
    await renderSettings();
    search('pictureUrls');

    expect(
      within(screen.getByRole('tabpanel')).getByRole('group', { name: /SettingsCardSources\.pictureUrls\.label/ }),
    ).toBeInTheDocument();
  });

  it('searches every section and edits results in place', async () => {
    await renderSettings();

    search('roomHistory');

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('switch', { name: /SettingsChat\.roomHistory\.label/ })).toBeInTheDocument();
    expect(within(panel).queryByText(/SettingsAppearance\.group\.tableGrid/)).not.toBeInTheDocument();
    const tabs = within(screen.getByRole('tablist', { name: /Settings\.title/ })).getAllByRole('tab');
    expect(tabs.every((tab) => tab.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('says so when nothing matches', async () => {
    await renderSettings();
    search('___nothing___');
    expect(screen.getByText(/Settings\.noResults/)).toBeInTheDocument();
  });

  it('offers custom pages found by title and opens them', async () => {
    await renderSettings();
    search('section.shortcuts');

    fireEvent.click(screen.getByRole('button', { name: /Settings\.openSection/ }));

    expect(screen.getByRole('tab', { name: /Settings\.section\.shortcuts/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/ShortcutsTab\.group\.game$/)).toBeInTheDocument();
  });

  describe('shortcuts section', () => {
    it('renders the shortcut groups and filters them with their own search', async () => {
      await renderSettings();
      openSection(/Settings\.section\.shortcuts/);

      expect(screen.getByText(/ShortcutsTab\.group\.gamePhases/)).toBeInTheDocument();
      expect(screen.getByText(/ShortcutsTab\.action\.chat\.focus/)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/ShortcutsTab\.search/), { target: { value: 'deck.save' } });

      expect(screen.getByText(/ShortcutsTab\.action\.deck\.save/)).toBeInTheDocument();
      expect(screen.queryByText(/ShortcutsTab\.action\.chat\.focus/)).not.toBeInTheDocument();
    });

    it('keeps shortcut overrides in the shortcuts slice', async () => {
      const { store } = await renderSettings();

      act(() => {
        store.dispatch(shortcuts.Actions.setOverride({ actionId: 'game.drawCard', sequences: ['Ctrl+KeyZ'] }));
      });
      expect(store.getState().shortcuts.overrides['game.drawCard']).toEqual(['Ctrl+KeyZ']);

      act(() => {
        store.dispatch(shortcuts.Actions.resetAll());
      });
      await waitFor(() => expect(store.getState().shortcuts.overrides).toEqual({}));
    });
  });
});


it('restores the playmat preferences and collection from Appearance', async () => {
  await renderSettings();
  await act(async () => {
    await setPlaymatSettings({ visibility: 0, mode: 2, fallbackBehavior: 1,
      fallbackList: [{ cardName: 'Island', cardProviderId: '', params: { marginPctL: 0, marginPctR: 0, verticalOffset: 0, zoom: 1 } }] });
  });
  openSection(/Settings\.section\.appearance/);
  fireEvent.click(screen.getByRole('button', { name: /^Settings\.restoreDefaults$/ }));
  await act(async () => {
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Settings\.restoreDefaults$/ }));
  });
  expect(getPreferencesSnapshot().playmatSettings).toEqual(DEFAULT_PLAYMAT_SETTINGS);
});

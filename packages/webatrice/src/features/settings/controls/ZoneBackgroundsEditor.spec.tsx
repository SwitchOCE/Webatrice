import { act, fireEvent, render, screen, within } from '@testing-library/react';
import i18n from 'i18next';
import ICU from 'i18next-icu';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import translation from '../../../i18n-default.json';

import { renderWithProviders } from '../../../__test-utils__';
import { getPreferencesSnapshot, getSettings, settingsStore } from '../../../hooks/useSettings';
import ZoneBackgroundsEditor from './ZoneBackgroundsEditor';

const row = (zone: string) => document.querySelector<HTMLElement>(`[data-zone-background="${zone}"]`)!;

async function renderEditor() {
  const result = renderWithProviders(<ZoneBackgroundsEditor id="zones" labelId="zones-label" disabled={false} />);
  await act(async () => {
    await getSettings();
  });
  return result;
}

describe('ZoneBackgroundsEditor', () => {
  beforeEach(() => {
    settingsStore.reset();
  });

  it('lists the hand, stack, table and player area, none with a background yet', async () => {
    await renderEditor();
    for (const zone of ['hand', 'stack', 'table', 'playerInfo']) {
      expect(row(zone)).toHaveTextContent('SettingsAppearance.zoneBackgrounds.current');
    }
    expect(screen.queryByText('SettingsAppearance.zoneBackgrounds.clear')).not.toBeInTheDocument();
  });

  it('sets a zone\'s background to a card\'s art, cropped like a playmat, and clears it', async () => {
    await renderEditor();
    fireEvent.change(within(row('stack')).getByRole('textbox'), { target: { value: '  Island ' } });
    await act(async () => {
      fireEvent.click(within(row('stack')).getByRole('button', { name: 'SettingsAppearance.zoneBackgrounds.setLabel' }));
    });

    expect(getPreferencesSnapshot().zoneBackgrounds).toEqual({
      stack: { cardName: 'Island', cardProviderId: '', params: { marginPctL: 0.07, marginPctR: 0.07, verticalOffset: 0.33, zoom: 1 } },
    });

    const edit = within(row('stack')).getByRole('button', { name: 'SettingsAppearance.zoneBackgrounds.editLabel' });
    expect(edit).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(edit);
    expect(edit).toHaveAttribute('aria-expanded', 'true');
    const editor = document.getElementById(edit.getAttribute('aria-controls')!)!;
    expect(within(editor).getByRole('group', { name: 'PlaymatSettings.crop.title' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(row('stack')).getByRole('button', { name: 'SettingsAppearance.zoneBackgrounds.clearLabel' }));
    });
    expect(getPreferencesSnapshot().zoneBackgrounds).toEqual({});
  });

  it('refuses a blank card name', async () => {
    await renderEditor();
    await act(async () => {
      fireEvent.click(within(row('hand')).getByRole('button', { name: 'SettingsAppearance.zoneBackgrounds.setLabel' }));
    });
    expect(getPreferencesSnapshot().zoneBackgrounds).toEqual({});
    expect(within(row('hand')).getByText('Common.validation.required')).toBeInTheDocument();
  });

  it('names each zone\'s buttons after the zone, so assistive tech can tell the rows apart', async () => {
    const english = i18n.createInstance();
    await english.use(ICU).use(initReactI18next).init({ lng: 'en', resources: { en: { translation } } });
    settingsStore.reset();
    const settings = await getSettings();
    const island = { cardName: 'Island', cardProviderId: '', params: { marginPctL: 0, marginPctR: 0, verticalOffset: 0, zoom: 1 } };
    settingsStore.setValue(Object.assign(settings, { zoneBackgrounds: { hand: island, table: island } }));
    render(
      <I18nextProvider i18n={english}>
        <ZoneBackgroundsEditor id="zones" labelId="zones-label" disabled={false} />
      </I18nextProvider>,
    );

    for (const name of [
      'Set the Hand background', 'Set the Stack background', 'Set the Table background', 'Set the Player area background',
      'Edit the Hand background\'s crop', 'Clear the Hand background',
      'Edit the Table background\'s crop', 'Clear the Table background',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });
});

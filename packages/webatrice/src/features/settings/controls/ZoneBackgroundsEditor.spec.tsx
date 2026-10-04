import { act, fireEvent, screen, within } from '@testing-library/react';

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
      fireEvent.click(within(row('stack')).getByRole('button', { name: 'SettingsAppearance.zoneBackgrounds.set' }));
    });

    expect(getPreferencesSnapshot().zoneBackgrounds).toEqual({
      stack: { cardName: 'Island', cardProviderId: '', params: { marginPctL: 0.07, marginPctR: 0.07, verticalOffset: 0.33, zoom: 1 } },
    });

    fireEvent.click(within(row('stack')).getByRole('button', { name: 'PlaymatSettings.collection.edit' }));
    expect(within(row('stack')).getByRole('group', { name: 'PlaymatSettings.crop.title' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(row('stack')).getByRole('button', { name: 'SettingsAppearance.zoneBackgrounds.clear' }));
    });
    expect(getPreferencesSnapshot().zoneBackgrounds).toEqual({});
  });

  it('refuses a blank card name', async () => {
    await renderEditor();
    await act(async () => {
      fireEvent.click(within(row('hand')).getByRole('button', { name: 'SettingsAppearance.zoneBackgrounds.set' }));
    });
    expect(getPreferencesSnapshot().zoneBackgrounds).toEqual({});
    expect(within(row('hand')).getByText('Common.validation.required')).toBeInTheDocument();
  });
});

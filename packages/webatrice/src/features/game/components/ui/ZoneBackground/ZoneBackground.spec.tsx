import { act, render, screen } from '@testing-library/react';

import { getSettings, settingsStore } from '../../../../../hooks/useSettings';
import ZoneBackground from './ZoneBackground';

const island = { cardName: 'Island', cardProviderId: 'uuid-1', params: { marginPctL: 0, marginPctR: 0, verticalOffset: 0, zoom: 1 } };

describe('ZoneBackground', () => {
  afterEach(() => {
    settingsStore.reset();
  });

  it('draws nothing for a zone without a background', () => {
    render(<ZoneBackground zone="stack" />);
    expect(screen.queryByTestId('zone-background-stack')).not.toBeInTheDocument();
  });

  it('draws the zone\'s card art under the zone\'s content', async () => {
    const settings = await getSettings();
    await act(async () => {
      settingsStore.setValue(Object.assign(settings, { zoneBackgrounds: { stack: island } }));
    });
    render(<ZoneBackground zone="stack" />);
    const background = screen.getByTestId('zone-background-stack');
    expect(background).toHaveStyle({ zIndex: '-1' });
    expect(background.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/cards/uuid-1?format=image&version=large'));
    expect(screen.queryByTestId('zone-background-hand')).not.toBeInTheDocument();
  });
});

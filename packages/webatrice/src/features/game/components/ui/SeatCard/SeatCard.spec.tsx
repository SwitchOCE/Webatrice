import { act, fireEvent, render, screen } from '@testing-library/react';

import { getSettings, settingsStore } from '../../../../../hooks/useSettings';

import Card from './SeatCard';

describe('SeatCard', () => {
  it('draws its name, P/T and annotation in the over-art colours, whatever the theme', () => {
    render(<Card name="Grizzly Bears" pt="2/2" basePT="2/2" annotation="token" />);
    for (const text of ['Grizzly Bears', '2/2', 'token']) {
      expect(screen.getByText(text)).toHaveClass('bg-over-art-backdrop', 'text-over-art-text');
    }
  });

  it('draws a modified P/T in desktop\'s orange, from its token', () => {
    render(<Card name="Grizzly Bears" pt="3/3" basePT="2/2" />);
    expect(screen.getByText('3/3')).toHaveClass('text-pt-modified');
    expect(screen.getByText('3/3')).not.toHaveClass('text-over-art-text');
  });

  describe('"Display card names on cards having a picture"', () => {
    afterEach(() => {
      settingsStore.reset();
    });

    const namesOff = async () => {
      const settings = await getSettings();
      await act(async () => {
        settingsStore.setValue(Object.assign(settings, { displayCardNames: false }));
      });
    };

    it('names a card with a picture only while the option is on', async () => {
      const { container } = render(<Card name="Grizzly Bears" />);
      fireEvent.load(container.querySelector('img')!);
      expect(screen.getByText('Grizzly Bears')).toBeInTheDocument();
      await namesOff();
      expect(screen.queryByText('Grizzly Bears')).not.toBeInTheDocument();
    });

    it('always names a face-down card, and a card whose picture is loading or failed to load', async () => {
      await namesOff();
      const { container } = render(<Card name="Morph" id="12" faceDown />);
      expect(screen.getByText('# 12')).toBeInTheDocument();

      container.remove();
      const { container: loading } = render(<Card name="Grizzly Bears" />);
      expect(screen.getByText('Grizzly Bears')).toBeInTheDocument();
      fireEvent.load(loading.querySelector('img')!);
      expect(screen.queryByText('Grizzly Bears')).not.toBeInTheDocument();

      loading.remove();
      const { container: missing } = render(<Card name="Homemade Token" />);
      fireEvent.error(missing.querySelector('img')!);
      expect(screen.getByText('Homemade Token')).toBeInTheDocument();
    });
  });
});

import { render, screen } from '@testing-library/react';

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
});

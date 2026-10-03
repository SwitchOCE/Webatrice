import { render, screen } from '@testing-library/react';

import { renderWithProviders, disconnectedState } from '../../__test-utils__';
import Unsupported from './Unsupported';

describe('Unsupported', () => {
  it('renders the unsupported-browser message', () => {
    renderWithProviders(<Unsupported />, { preloadedState: disconnectedState });

    expect(screen.getByText('Unsupported.title')).toBeInTheDocument();
    expect(screen.getByText('Unsupported.subtitle1')).toBeInTheDocument();
    expect(screen.getByText('Unsupported.subtitle2')).toBeInTheDocument();
    expect(screen.queryByText('Unsupported.missing')).not.toBeInTheDocument();
  });

  it('lists the missing features', () => {
    renderWithProviders(<Unsupported missing={['webSocket', 'webCrypto']} />, { preloadedState: disconnectedState });

    expect(screen.getByText('Unsupported.missing')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'BrowserFeature.webSocket',
      'BrowserFeature.webCrypto',
    ]);
  });

  // index.tsx renders it before the app boots: no store, router or WebClient.
  it('renders without any app provider', () => {
    render(<Unsupported missing={['bigInt']} />);

    expect(screen.getByText('Unsupported.title')).toBeInTheDocument();
    expect(screen.getByText('BrowserFeature.bigInt')).toBeInTheDocument();
  });
});

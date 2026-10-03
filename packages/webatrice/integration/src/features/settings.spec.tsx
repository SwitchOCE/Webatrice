import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import { Settings } from '@app/features/settings';

import { renderFeatureScreen, simulateLoggedIn } from './helpers';

// ShortcutsTab needs a ShortcutProvider context that AppShell wires in
// production. Stubbing it scopes this spec to Settings' own behaviour
// (the tabs + AuthGuard) — feature-widgets/shortcuts has its own coverage.
vi.mock('@app/feature-widgets/shortcuts', () => ({
  ShortcutsTab: () => <div data-testid="shortcuts-tab" />,
}));

beforeEach(() => {
  vi.useRealTimers();
  simulateLoggedIn();
});

describe('Settings (integration)', () => {
  it('lists the settings sections when the user is logged in, and opens Shortcuts', () => {
    renderFeatureScreen(<Settings />);

    expect(screen.getByRole('tab', { name: /Settings\.section\.appearance/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: /Settings\.section\.shortcuts/ }));

    expect(screen.getByTestId('shortcuts-tab')).toBeInTheDocument();
  });
});

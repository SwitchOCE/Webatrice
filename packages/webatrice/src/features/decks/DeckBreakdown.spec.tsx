import { fireEvent, screen, waitFor } from '@testing-library/react';

import { CommanderSpellbookIntegration } from '@app/types';
import { renderWithProviders } from '../../__test-utils__';
import { getSettings, settingsStore } from '../../hooks/useSettings';

import DeckBreakdown from './DeckBreakdown';
import type { DeckCard } from './types';

const card = (name: string, typeLine: string, cmc: number, extra: Partial<DeckCard> = {}): DeckCard =>
  ({ name, quantity: 1, category: 'main', typeLine, cmc, lookupSource: 'unknown', ...extra });

const CARDS: DeckCard[] = [
  card('Sol Ring', 'Artifact', 1),
  card('Atraxa, Praetors\' Voice', 'Legendary Creature', 4, { isCommander: true }),
];

const SPELLBOOK = 'commanderspellbook.com';

async function setMode(mode: CommanderSpellbookIntegration) {
  const settings = await getSettings();
  settings.commanderSpellbookIntegration = mode;
  settingsStore.setValue(settings);
}

function renderCommanderDeck() {
  return renderWithProviders(<DeckBreakdown cards={CARDS} format="commander" />);
}

const requestedUrls = (fetchSpy: ReturnType<typeof vi.fn>) => fetchSpy.mock.calls.map(([url]) => String(url));

describe('DeckBreakdown bracket estimate: Commander Spellbook consent', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    settingsStore.reset();
    await getSettings();
    fetchSpy = vi.fn(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    settingsStore.reset();
  });

  it('asks before first use and sends nothing meanwhile', async () => {
    renderCommanderDeck();

    expect(await screen.findByRole('dialog', { name: 'CommanderSpellbookConsent.title' })).toBeInTheDocument();
    expect(screen.queryByText('Bracket estimate')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('defaults to asking, as desktop does', async () => {
    expect((await getSettings()).commanderSpellbookIntegration).toBe(CommanderSpellbookIntegration.Unprompted);
  });

  it('hides the estimate and sends nothing once disabled from the prompt', async () => {
    renderCommanderDeck();
    fireEvent.click(await screen.findByRole('button', { name: 'CommanderSpellbookConsent.disable' }));

    await waitFor(async () =>
      expect((await getSettings()).commanderSpellbookIntegration).toBe(CommanderSpellbookIntegration.Disabled));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Bracket estimate')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('hides the estimate for now when the prompt is dismissed, still unchosen', async () => {
    renderCommanderDeck();
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));

    expect(screen.queryByText('Bracket estimate')).not.toBeInTheDocument();
    expect((await getSettings()).commanderSpellbookIntegration).toBe(CommanderSpellbookIntegration.Unprompted);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('estimates only on request once enabled from the prompt', async () => {
    renderCommanderDeck();
    fireEvent.click(await screen.findByRole('button', { name: 'CommanderSpellbookConsent.enable' }));

    const estimate = await screen.findByRole('button', { name: 'Estimate bracket' });
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(estimate);

    await waitFor(() => expect(requestedUrls(fetchSpy).some((url) => url.includes(SPELLBOOK))).toBe(true));
  });

  it('estimates straight away once automatic is chosen from the prompt', async () => {
    renderCommanderDeck();
    fireEvent.click(await screen.findByRole('button', { name: 'CommanderSpellbookConsent.automatic' }));

    await waitFor(() => expect(requestedUrls(fetchSpy).some((url) => url.includes(SPELLBOOK))).toBe(true));
    expect((await getSettings()).commanderSpellbookIntegration).toBe(CommanderSpellbookIntegration.Automatic);
  });

  it('sends nothing and shows no estimate when disabled', async () => {
    await setMode(CommanderSpellbookIntegration.Disabled);
    renderCommanderDeck();

    expect(await screen.findByText('Overview')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Bracket estimate')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

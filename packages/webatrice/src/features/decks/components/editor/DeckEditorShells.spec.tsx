import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { RouteEnum } from '@app/types';

import { DeckEditorSkeleton, DeckNotFound, EmptyCardsHint } from './DeckEditorShells';

vi.mock('@app/feature-wrappers/layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@app/components', () => ({ AuthGuard: () => null }));

describe('DeckEditorShells', () => {
  it('shows hydration, then preload progress, in the skeleton', () => {
    const { rerender } = render(<DeckEditorSkeleton loaded={0} total={0} />);
    expect(screen.getByText('Loading deck…')).toBeInTheDocument();
    rerender(<DeckEditorSkeleton loaded={3} total={10} />);
    expect(screen.getByText('Preloading 3/10 cards…')).toBeInTheDocument();
  });

  it('links a missing deck back to My Decks', () => {
    render(
      <MemoryRouter initialEntries={['/deck/9']}>
        <Routes>
          <Route path={RouteEnum.DECK} element={<DeckNotFound reason={null} />} />
          <Route path={RouteEnum.DECKS} element={<div>my decks</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Deck not found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to My Decks/ }));
    expect(screen.getByText('my decks')).toBeInTheDocument();
  });

  it('explains why a deck failed to load instead of calling it missing', () => {
    render(
      <MemoryRouter>
        <DeckNotFound reason="CommandFailure.timeout" />
      </MemoryRouter>,
    );
    expect(screen.getByText('DeckEditor.loadFailedTitle')).toBeInTheDocument();
    expect(screen.getByText('CommandFailure.timeout')).toBeInTheDocument();
    expect(screen.queryByText('Deck not found')).not.toBeInTheDocument();
  });

  it('points an empty deck at the right entry control', () => {
    const { rerender } = render(<EmptyCardsHint isMtg />);
    expect(screen.getByText('Quick add')).toBeInTheDocument();
    rerender(<EmptyCardsHint isMtg={false} />);
    expect(screen.getByText('Add a card')).toBeInTheDocument();
  });
});

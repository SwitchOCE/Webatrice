import { fireEvent, render, screen, within } from '@testing-library/react';

import { deckTileView } from '../../deckGrid';
import type { FlatDeck } from '../../deckTree';
import type { DeckActions } from './DeckActionsMenu';
import { DeckListRow, DeckTile } from './DeckTile';

const deck: FlatDeck = {
  id: 7, name: 'Atraxa', path: 'Commander', creationTime: 0, visibility: 'public', colorIdentity: 'WUBG', tags: ['Walkers'],
};
const view = deckTileView(deck, { format: 'commander', bracketLevel: 3, usd: 12.5, cardCount: 100, bannerCard: 'Atraxa' });

function actions(patch: Partial<DeckActions> = {}): DeckActions {
  return {
    onOpen: vi.fn(), onEdit: vi.fn(), onShare: vi.fn(), onTogglePublic: vi.fn(), onMove: vi.fn(), onDownload: vi.fn(),
    onDelete: vi.fn(), ...patch,
  };
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'DeckActionsMenu.more' }));
  return screen.getByRole('menu', { name: 'DeckActionsMenu.label' });
}

it('gives the card footer eight pixels of padding on every side', () => {
  render(<DeckTile view={view} actions={actions()} />);
  const footer = screen.getByRole('list', { name: 'DeckTile.tags' }).parentElement;
  expect(footer).toHaveClass('p-2');
  expect(footer).not.toHaveClass('py-0.5');
});

it('keeps a long title bounded while the five identity pips can wrap together below it', () => {
  const name = 'A very long five-colour deck title '.repeat(8).trim();
  render(<DeckTile view={deckTileView({ ...deck, name, colorIdentity: 'WUBRG' }, view.summary)} actions={actions()} />);
  const title = screen.getByText(name);
  expect(title).toHaveClass('max-w-full', 'truncate');
  expect(title.parentElement).toHaveClass('min-w-0', 'flex-wrap');
  const pips = within(title.parentElement!).getByRole('img');
  expect(pips).toHaveClass('shrink-0');
  expect(pips.children).toHaveLength(5);
});

describe.each([['tile', DeckTile], ['row', DeckListRow]] as const)('Deck%s', (_kind, Item) => {
  it('shows what the store knows about the deck and opens it', () => {
    const a = actions();
    render(<Item view={view} actions={a} />);
    const article = screen.getByRole('article', { name: 'Atraxa' });
    expect(within(article).getByText('Decks.badge.bracketShort')).toBeInTheDocument();
    expect(within(article).getByRole('img', { name: 'Decks.badge.identity' }).children).toHaveLength(4);
    expect(within(article).getByText('DeckSharing.public')).toBeInTheDocument();
    expect(within(article).getByTitle('Decks.badge.priceTotal')).toHaveTextContent(/12.50/);
    fireEvent.click(screen.getByRole('button', { name: 'DeckTile.open' }));
    expect(a.onOpen).toHaveBeenCalledOnce();
  });

  it('prefetches the editor on pointer enter and focus', () => {
    const onPrefetch = vi.fn();
    render(<Item view={view} actions={actions()} onPrefetch={onPrefetch} />);
    const article = screen.getByRole('article', { name: 'Atraxa' });
    fireEvent.pointerEnter(article);
    fireEvent.focus(within(article).getByRole('button', { name: 'DeckTile.open' }));
    expect(onPrefetch).toHaveBeenCalledTimes(2);
  });

  it('offers every action from a visible menu button', () => {
    const a = actions();
    render(<Item view={view} actions={a} />);
    const menu = openMenu();
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'DeckActionsMenu.open', 'DeckActionsMenu.share', 'DeckActionsMenu.makePrivate', 'DeckActionsMenu.editTags',
      'DeckActionsMenu.setBanner', 'DeckActionsMenu.rename', 'DeckActionsMenu.move', 'DeckActionsMenu.download',
      'DeckActionsMenu.delete',
    ]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'DeckActionsMenu.rename' }));
    expect(a.onEdit).toHaveBeenCalledWith('rename');
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(within(openMenu()).getByRole('menuitem', { name: 'DeckActionsMenu.delete' }));
    expect(a.onDelete).toHaveBeenCalledOnce();
  });
});

it('leaves out sharing and moving when unavailable and explains disabled edits', () => {
  const a = actions({ onShare: undefined, onTogglePublic: undefined, onMove: undefined, editDisabledReason: 'Loading' });
  render(<DeckTile view={deckTileView({ ...deck, visibility: 'private' }, undefined)} actions={a} />);
  const menu = openMenu();
  expect(within(menu).queryByRole('menuitem', { name: 'DeckActionsMenu.share' })).toBeNull();
  expect(within(menu).queryByRole('menuitem', { name: 'DeckActionsMenu.move' })).toBeNull();
  const rename = within(menu).getByRole('menuitem', { name: 'DeckActionsMenu.rename' });
  expect(rename).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(rename);
  expect(a.onEdit).not.toHaveBeenCalled();
});

it('shows a loading price and no identity before anything is known', () => {
  render(<DeckTile view={deckTileView({ ...deck, colorIdentity: undefined }, undefined)} actions={actions()} />);
  expect(screen.getByTitle('Decks.badge.priceLoading')).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: 'Decks.badge.identity' })).toBeNull();
});

it('shows no identity pips for a colourless deck', () => {
  render(<DeckTile view={deckTileView({ ...deck, colorIdentity: '' }, undefined)} actions={actions()} />);
  expect(screen.queryByRole('img', { name: 'Decks.badge.identity' })).toBeNull();
});

it('colours the format band by format family, grey with a dash when there is no format', () => {
  render(<DeckTile view={deckTileView(deck, { cardCount: 60 })} actions={actions()} />);
  expect(screen.getByTitle('Decks.badge.noFormat')).toHaveTextContent('—');
  expect(screen.getByTitle('Decks.badge.noFormat').parentElement).toHaveClass('bg-format-other');
});

it.each([
  ['commander', 'bg-format-commander'],
  ['PauperCommander', 'bg-format-commander'],
  ['pioneer', 'bg-format-modern'],
  ['standard', 'bg-format-standard'],
  ['vintage', 'bg-format-eternal'],
  ['pauper', 'bg-format-pauper'],
  ['penny', 'bg-format-other'],
])('renders the family colour for %s', (format, className) => {
  render(<DeckTile view={deckTileView(deck, { format })} actions={actions()} />);
  expect(screen.getByText(new RegExp(`DeckFormat.${format}`, 'i')).parentElement).toHaveClass(className);
});

it('keeps the over-art title white on hover while retaining the row hover colour', () => {
  const { unmount } = render(<DeckTile view={view} actions={actions()} />);
  expect(screen.getByText(deck.name)).toHaveClass('text-over-art-text');
  expect(screen.getByText(deck.name)).not.toHaveClass('group-hover:text-accent');
  unmount();
  render(<DeckListRow view={view} actions={actions()} />);
  expect(screen.getByText(deck.name)).toHaveClass('group-hover:text-accent');
});

it('describes a loaded deck with no format on its open button', () => {
  render(<DeckTile view={deckTileView(deck, { cardCount: 60 })} actions={actions()} />);
  expect(screen.getByRole('button', { name: 'DeckTile.open' })).toHaveAccessibleDescription('Decks.badge.noFormat');
  expect(screen.getByTitle('Decks.badge.noFormat')).toHaveTextContent('—');
});

it('does not describe a loading deck or a declared format as having no format', () => {
  const { rerender } = render(<DeckTile view={deckTileView(deck, undefined)} actions={actions()} />);
  expect(screen.getByRole('button', { name: 'DeckTile.open' })).not.toHaveAccessibleDescription();
  rerender(<DeckTile view={view} actions={actions()} />);
  expect(screen.getByRole('button', { name: 'DeckTile.open' })).not.toHaveAccessibleDescription();
});

it.each(['constructor', '__proto__', 'toString', 'custom', ''])('uses the grey band for the unknown format %j', (format) => {
  render(<DeckTile view={deckTileView(deck, { format })} actions={actions()} />);
  const label = format ? screen.getByText(new RegExp(format, 'i')) : screen.getByTitle('Decks.badge.noFormat');
  expect(label.parentElement).toHaveClass('bg-format-other');
});

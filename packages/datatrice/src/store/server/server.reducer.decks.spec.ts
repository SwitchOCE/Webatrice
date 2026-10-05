import { create } from '@bufbuild/protobuf';
import { Response_DeckListSchema, ServerInfo_DeckStorage_TreeItemSchema } from '@cockatrice/sockatrice/generated';
import { serverReducer } from './server.reducer';
import { Actions } from './server.actions';

it('merges sparse deck acknowledgements by field presence without mutating the prior file', () => {
  const item = create(ServerInfo_DeckStorage_TreeItemSchema, {
    id: 7, name: 'Before', file: {
      creationTime: 1, isPublic: true, colorIdentity: 'WU',
      bannerCardName: 'Island', bannerCardProvider: 'art', tags: ['control'],
    },
  });
  const before = serverReducer(undefined, Actions.backendDecks({ deckList: create(Response_DeckListSchema, { root: { items: [item] } }) }));
  const after = serverReducer(before, Actions.deckUpdated({ deckId: 7, treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, {
    id: 7, name: 'After', file: { creationTime: 2, isPublic: false },
  }) }));
  expect(after.backendDecks!.root!.items[0].file).toMatchObject({
    creationTime: 2, isPublic: false, colorIdentity: 'WU',
    bannerCardName: 'Island', bannerCardProvider: 'art', tags: ['control'],
  });
  expect(before.backendDecks!.root!.items[0].file).toMatchObject({ creationTime: 1, isPublic: true });
  const cleared = serverReducer(after, Actions.deckUpdated({ deckId: 7, treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, {
    id: 7, file: { colorIdentity: '', bannerCardName: '', bannerCardProvider: '' },
  }) }));
  expect(cleared.backendDecks!.root!.items[0].file).toMatchObject({ colorIdentity: '', bannerCardName: '', bannerCardProvider: '' });
});

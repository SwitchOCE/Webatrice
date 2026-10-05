import { create } from '@bufbuild/protobuf';
import { Response_DeckShareCreateSchema } from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { createStore } from '../store/createStore';
import { SessionResponseImpl } from './SessionResponseImpl';

describe('deck response request identities', () => {
  it('carries share creation identities through success and failure actions', () => {
    const store = createStore();
    const dispatch = vi.spyOn(store, 'dispatch');
    const response = new SessionResponseImpl(store);
    response.deckShareCreated(create(Response_DeckShareCreateSchema, { token: 'secret' }), 'create-b');
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ requestId: 'create-b' }),
    }));
    response.commandFailed('deckShareCreate', 7, '', WebsocketTypes.CommandFailure.Timeout, 'create-a');
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ requestId: 'create-a', failure: WebsocketTypes.CommandFailure.Timeout }),
    }));
  });
});

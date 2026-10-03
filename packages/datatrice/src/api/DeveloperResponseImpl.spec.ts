import { create } from '@bufbuild/protobuf';
import { Response_GetServerStatsSchema } from '@cockatrice/sockatrice/generated';

import { createStore } from '../store/createStore';
import { Actions as ServerActions } from '../store/server/server.actions';
import { attachResponseHandlers } from './attachResponseHandlers';
import { DeveloperResponseImpl } from './DeveloperResponseImpl';

describe('DeveloperResponseImpl', () => {
  it('serverStats dispatches the serverStats action with the snapshot', () => {
    const store = createStore();
    const dispatch = vi.spyOn(store, 'dispatch');
    const stats = create(Response_GetServerStatsSchema, { usersCount: 3n });

    new DeveloperResponseImpl(store).serverStats(stats);

    expect(dispatch).toHaveBeenCalledWith(ServerActions.serverStats({ stats }));
  });

  it('is wired into the response handlers', () => {
    expect(attachResponseHandlers(createStore()).developer).toBeInstanceOf(DeveloperResponseImpl);
  });
});

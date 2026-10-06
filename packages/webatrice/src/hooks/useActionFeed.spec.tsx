import { act } from '@testing-library/react';
import { StrictMode } from 'react';
import { server } from '@cockatrice/datatrice';

import { makeUser, renderWithProviders } from '../__test-utils__';
import { useActionFeed, type ActionFeedHandler } from './useActionFeed';

function Probe({ handler }: { handler: ActionFeedHandler }) {
  useActionFeed(handler);
  return null;
}

describe('useActionFeed', () => {
  it('captures before and after state synchronously, once in StrictMode', () => {
    const handler = vi.fn();
    const { store, unmount } = renderWithProviders(<StrictMode><Probe handler={handler} /></StrictMode>);
    const action = server.Actions.userJoined({ user: makeUser({ name: 'arrival' }) });
    act(() => {
      const before = store.getState();
      store.dispatch(action);
      expect(handler).toHaveBeenCalledExactlyOnceWith(action, before, store.getState());
    });
    unmount();
    store.dispatch(server.Actions.userLeft({ name: 'arrival' }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not observe another provider using the shared middleware', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { store } = renderWithProviders(<Probe handler={first} />);
    renderWithProviders(<Probe handler={second} />);
    act(() => {
      store.dispatch(server.Actions.userJoined({ user: makeUser({ name: 'arrival' }) }));
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});

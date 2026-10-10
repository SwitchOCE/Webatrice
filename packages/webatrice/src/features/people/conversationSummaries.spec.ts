import { conversationSummaries } from './conversationSummaries';

const msg = (senderName: string, message: string, timeReceived: number) => ({ senderName, message, timeReceived });

describe('conversationSummaries', () => {
  it('lists conversations newest first with the last line and who sent it', () => {
    const result = conversationSummaries({
      alice: [msg('alice', 'hi', 1), msg('me', 'hello', 5)],
      bob: [msg('bob', 'gg', 9)],
      empty: [],
    }, 'me');
    expect(result).toEqual([
      { name: 'bob', lastText: 'gg', lastFromSelf: false, lastTime: 9 },
      { name: 'alice', lastText: 'hello', lastFromSelf: true, lastTime: 5 },
    ]);
  });

  it('leaves out a conversation with yourself', () => {
    expect(conversationSummaries({ me: [msg('me', 'note', 1)] }, 'me')).toEqual([]);
  });
});

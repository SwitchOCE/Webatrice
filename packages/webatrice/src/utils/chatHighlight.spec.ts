import { findChatAlert, parseHighlightWords, segmentText } from './chatHighlight';

const ctx = { selfName: 'Alice', mentions: true, highlightWords: [] as string[], senderIsModerator: false };

describe('parseHighlightWords', () => {
  it('splits on any whitespace and drops empties', () => {
    expect(parseHighlightWords('  edh   modern\tcube ')).toEqual(['edh', 'modern', 'cube']);
    expect(parseHighlightWords('')).toEqual([]);
  });
});

describe('segmentText', () => {
  it('highlights alert words case-insensitively, leaving trailing punctuation plain', () => {
    expect(segmentText('anyone up for EDH? edhrec', { highlightWords: ['edh'], allMention: false })).toEqual([
      { kind: 'plain', text: 'anyone up for ' },
      { kind: 'word', text: 'EDH' },
      { kind: 'plain', text: '? edhrec' },
    ]);
  });

  it('only matches whole words', () => {
    expect(segmentText('(edh', { highlightWords: ['edh'], allMention: false })).toEqual([
      { kind: 'plain', text: '(edh' },
    ]);
  });

  it('marks @/all only when allowed', () => {
    expect(segmentText('@/all restart soon', { highlightWords: [], allMention: true })[0]).toEqual({
      kind: 'allMention',
      text: '@/all',
    });
    expect(segmentText('@/all restart soon', { highlightWords: [], allMention: false })).toEqual([
      { kind: 'plain', text: '@/all restart soon' },
    ]);
  });
});

describe('findChatAlert', () => {
  it('finds a mention of the reader, ignoring case and trailing punctuation', () => {
    expect(findChatAlert('hey @alice, ready?', ctx)).toBe('mention');
    expect(findChatAlert('hey @alicex', ctx)).toBeNull();
    expect(findChatAlert('email@alice.com', ctx)).toBeNull();
  });

  it('ignores mentions when chat mentions are off', () => {
    expect(findChatAlert('hey @Alice', { ...ctx, mentions: false })).toBeNull();
  });

  it('honours @/all from moderators only', () => {
    expect(findChatAlert('@/all server restart', { ...ctx, senderIsModerator: true })).toBe('allMention');
    expect(findChatAlert('@/all server restart', ctx)).toBeNull();
  });

  it('reports alert words, below mentions', () => {
    const words = { ...ctx, highlightWords: ['cube'] };
    expect(findChatAlert('cube draft tonight', words)).toBe('word');
    expect(findChatAlert('@Alice cube draft tonight', words)).toBe('mention');
  });

  it('raises nothing without a reader name or words', () => {
    expect(findChatAlert('@Alice hi', { ...ctx, selfName: null })).toBeNull();
  });
});

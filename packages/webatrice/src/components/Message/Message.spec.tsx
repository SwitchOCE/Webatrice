import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../__test-utils__';
import Message, { type MessageHighlight } from './Message';

describe('Message', () => {
  it('renders a plain message', () => {
    const message = { message: 'Hello world' };
    renderWithProviders(<Message message={message} />);

    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders the message container', () => {
    const message = { message: 'Test message' };
    const { container } = renderWithProviders(<Message message={message} />);

    expect(container.querySelector('.message')).toBeInTheDocument();
  });

  it('renders a history timestamp between the sender and the text', () => {
    const { container } = renderWithProviders(
      <Message message={{ message: 'alice: hello' }} timestamp="3 Oct 2026 09:05:07" />,
    );

    const time = container.querySelector('time.message__timestamp');
    expect(time).toHaveTextContent('[3 Oct 2026 09:05:07]');
    expect(container.querySelector('strong')?.compareDocumentPosition(time!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders no timestamp for live messages', () => {
    const { container } = renderWithProviders(<Message message={{ message: 'alice: hello' }} />);
    expect(container.querySelector('time')).not.toBeInTheDocument();
  });

  describe('with highlighting', () => {
    const highlight: MessageHighlight = {
      selfName: 'Alice',
      mentions: true,
      mentionStyle: { backgroundColor: 'rgb(166, 18, 13)', color: 'white' },
      highlightWords: ['cube'],
      highlightStyle: { backgroundColor: 'rgb(0, 0, 255)', color: 'black' },
      senderIsModerator: false,
    };

    it('marks the reader’s own mention instead of linking it, and still links others', () => {
      renderWithProviders(<Message message={{ message: 'Bob: hi @alice and @carol' }} highlight={highlight} />);

      const own = screen.getByText('@alice');
      expect(own.tagName).toBe('MARK');
      expect(own).toHaveStyle({ backgroundColor: 'rgb(166, 18, 13)', color: 'rgb(255, 255, 255)' });
      expect(screen.getByRole('link', { name: '@carol' })).toBeInTheDocument();
    });

    it('marks and links names with dots and dashes, leaving sentence punctuation outside', () => {
      renderWithProviders(
        <Message message={{ message: 'Bob: hi @alice.b-c and @carol.smith.' }} highlight={{ ...highlight, selfName: 'Alice.B-C' }} />,
      );

      expect(screen.getByText('@alice.b-c').tagName).toBe('MARK');
      expect(screen.getByRole('link', { name: '@carol.smith' })).toBeInTheDocument();
    });

    it('marks alert words', () => {
      renderWithProviders(<Message message={{ message: 'Bob: Cube tonight?' }} highlight={highlight} />);

      const word = screen.getByText('Cube');
      expect(word.tagName).toBe('MARK');
      expect(word).toHaveClass('message__highlight');
    });

    it('draws mentions as plain text when chat mentions are off', () => {
      renderWithProviders(
        <Message message={{ message: 'Bob: hi @alice and @carol' }} highlight={{ ...highlight, mentions: false }} />,
      );

      expect(screen.queryByRole('link', { name: '@carol' })).not.toBeInTheDocument();
      expect(document.querySelector('mark')).toBeNull();
    });

    it('marks @/all only from a moderator', () => {
      const { unmount } = renderWithProviders(
        <Message message={{ message: 'Mod: @/all restart' }} highlight={{ ...highlight, senderIsModerator: true }} />,
      );
      expect(screen.getByText('@/all').tagName).toBe('MARK');
      unmount();

      renderWithProviders(<Message message={{ message: 'Bob: @/all restart' }} highlight={highlight} />);
      expect(document.querySelector('mark')).toBeNull();
    });
  });

  it('renders a desktop game link as a join button', () => {
    const url = 'cockatrice://joingame?hostname=h&port=4747&roomid=1&gameid=7';
    renderWithProviders(<Message message={{ message: `alice: Join my game (#7): ${url}` }} />);

    expect(screen.getByRole('button', { name: /GameLink\.anchor\.withId/ })).toHaveAttribute('title', url);
    expect(screen.getByText(/Join my game \(#7\):/)).toBeInTheDocument();
  });
});

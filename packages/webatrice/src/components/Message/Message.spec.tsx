import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../__test-utils__';
import Message from './Message';

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

  it('renders a history timestamp before the sender and the text', () => {
    const { container } = renderWithProviders(
      <Message message={{ message: 'alice: hello' }} timestamp="3 Oct 2026 09:05:07" />,
    );

    const time = container.querySelector('time.message__timestamp');
    expect(time).toHaveTextContent('[3 Oct 2026 09:05:07]');
    expect(container.querySelector('strong')?.compareDocumentPosition(time!)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
  });

  it('renders no timestamp for live messages', () => {
    const { container } = renderWithProviders(<Message message={{ message: 'alice: hello' }} />);
    expect(container.querySelector('time')).not.toBeInTheDocument();
  });
});

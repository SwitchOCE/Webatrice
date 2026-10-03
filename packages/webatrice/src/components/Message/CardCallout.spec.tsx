import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@app/services', () => ({
  CardDTO: { get: vi.fn() },
  TokenDTO: { get: vi.fn() },
}));
vi.mock('../TokenDetails/TokenDetails', () => ({
  default: ({ token }: { token: { name: { value: string } } }) => <div data-testid="preview">{token.name.value}</div>,
}));

import { CardDTO, TokenDTO } from '@app/services';
import CardCallout from './CardCallout';

async function renderCallout() {
  vi.mocked(CardDTO.get).mockResolvedValue(undefined as never);
  vi.mocked(TokenDTO.get).mockResolvedValue({ name: { value: 'Saproling' } } as never);
  render(<CardCallout name="Saproling" />);
  // Let the token lookup resolve.
  await act(async () => {});
  return screen.getByRole('button', { name: 'Saproling' });
}

describe('CardCallout', () => {
  it('previews the card while the name has keyboard focus', async () => {
    const name = await renderCallout();

    act(() => name.focus());
    expect(screen.getByTestId('preview')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-describedby');

    act(() => name.blur());
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
  });

  it('hides the preview on Escape without moving focus', async () => {
    const name = await renderCallout();
    act(() => name.focus());

    fireEvent.keyDown(name, { key: 'Escape' });

    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
    expect(name).toHaveFocus();
  });

  it('still previews on hover', async () => {
    const name = await renderCallout();

    fireEvent.mouseEnter(name);
    expect(screen.getByTestId('preview')).toBeInTheDocument();

    fireEvent.mouseLeave(name);
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
  });
});

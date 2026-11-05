import { act, fireEvent, render } from '@testing-library/react';
import { Images } from '@app/images';

import CardImage from './CardImage';

it('retries image errors twice after a delay, then keeps the logo, and resets for another source', async () => {
  vi.useFakeTimers();
  const onError = vi.fn();
  const view = render(<CardImage src="card.jpg" onError={onError} />);
  const src = () => view.container.querySelector('img')?.getAttribute('src');
  for (const delay of [1000, 2000]) {
    fireEvent.error(view.container.querySelector('img')!);
    expect(src()).toBe(Images.Logo);
    await act(() => vi.advanceTimersByTimeAsync(delay - 1));
    expect(src()).toBe(Images.Logo);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(src()).toBe('card.jpg');
    expect(onError).not.toHaveBeenCalled();
  }
  fireEvent.error(view.container.querySelector('img')!);
  expect(onError).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(src()).toBe(Images.Logo);
  view.rerender(<CardImage src="another.jpg" />);
  expect(src()).toBe('another.jpg');
  fireEvent.error(view.container.querySelector('img')!);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(src()).toBe('another.jpg');
});

it('cancels a pending retry on a source change or unmount', async () => {
  vi.useFakeTimers();
  const view = render(<CardImage src="old.jpg" />);
  fireEvent.error(view.container.querySelector('img')!);
  view.rerender(<CardImage src="new.jpg" />);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(view.container.querySelector('img')).toHaveAttribute('src', 'new.jpg');
  fireEvent.error(view.container.querySelector('img')!);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

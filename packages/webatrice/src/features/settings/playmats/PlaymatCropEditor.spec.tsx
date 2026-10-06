import { fireEvent, render, waitFor } from '@testing-library/react';
import { games } from '@cockatrice/datatrice';
import { CardDTO } from '@app/services';
import { cardDataPreferencesStore } from '@app/hooks';
import PlaymatCropEditor from './PlaymatCropEditor';

it('previews the configured source with rotated art and retries failed image candidates', async () => {
  await cardDataPreferencesStore.whenReady();
  cardDataPreferencesStore.setValue({ pictureUrlTemplates: ['https://images.test/!name!.jpg'],
    setPreferences: new Map(), setLongNames: new Map() });
  vi.spyOn(CardDTO, 'get').mockResolvedValue({ name: { value: 'Island' }, set: [],
    landscapeOrientation: { value: '1' } } as unknown as CardDTO);
  const { container } = render(<PlaymatCropEditor playmat={{ cardName: 'Island', cardProviderId: '',
    params: games.DEFAULT_PLAYMAT_PARAMS }} onChange={vi.fn()} />);
  await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', 'https://images.test/Island.jpg'));
  const image = container.querySelector('img')!;
  Object.defineProperties(image, { naturalWidth: { value: 900 }, naturalHeight: { value: 600 } });
  fireEvent.load(image);
  expect(image.style.transform).toBe('rotate(90deg)');
  fireEvent.error(image);
  expect(container.querySelector('img')!.src).toContain('/cards/named?exact=Island');
});

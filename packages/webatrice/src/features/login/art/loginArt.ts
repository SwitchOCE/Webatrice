import { ScryfallImageSize } from '@cockatrice/datatrice';
import { getScryfallUrlByExactName } from '@app/services';

export const LOGIN_ART_CARDS: readonly string[] = [
  'The Ur-Dragon',
  'Shivan Dragon',
  'Serra Angel',
  'Llanowar Elves',
  'Ugin, the Spirit Dragon',
  'Emrakul, the Aeons Torn',
  'Craterhoof Behemoth',
  'Niv-Mizzet, Parun',
  'Lightning Bolt',
  'Elesh Norn, Grand Cenobite',
  'Avacyn, Angel of Hope',
  'Griselbrand',
];

export function loginArtUrl(name: string): string {
  return getScryfallUrlByExactName(name, ScryfallImageSize.ArtCrop);
}

export function pickLoginArt(random: () => number = Math.random, current?: string): string {
  const pool = LOGIN_ART_CARDS.filter((name) => name !== current);
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
}

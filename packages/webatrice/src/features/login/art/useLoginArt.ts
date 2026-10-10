import { useCallback, useState } from 'react';

import { LoadingState, useSettings } from '@app/hooks';

import { loginArtUrl, pickLoginArt } from './loginArt';

export interface LoginArt {
  enabled: boolean;
  name: string;
  url: string | null;
  failed: boolean;
  onError: () => void;
  shuffle: () => void;
}

let visitArt: string | undefined;

export function forgetLoginArt(): void {
  visitArt = undefined;
}

export function useLoginArt(random: () => number = Math.random): LoginArt {
  const settings = useSettings();
  const enabled = settings.status === LoadingState.READY && settings.value?.signInCardArt !== false;
  const [art, setArt] = useState(() => {
    visitArt ??= pickLoginArt(random);
    return { name: visitArt, failed: false };
  });

  const onError = useCallback(() => setArt((a) => ({ ...a, failed: true })), []);
  const shuffle = useCallback(() => {
    setArt((a) => {
      const name = pickLoginArt(random, a.name);
      visitArt = name;
      return { name, failed: false };
    });
  }, [random]);

  return {
    enabled,
    name: art.name,
    url: enabled && !art.failed ? loginArtUrl(art.name) : null,
    failed: art.failed,
    onError,
    shuffle,
  };
}

import { useCallback, useState } from 'react';

import { loginArtUrl, pickLoginArt } from './loginArt';

export interface LoginArt {
  name: string;
  url: string;
  failed: boolean;
  onError: () => void;
  shuffle: () => void;
}

let visitArt: string | undefined;

export function forgetLoginArt(): void {
  visitArt = undefined;
}

export function useLoginArt(random: () => number = Math.random): LoginArt {
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

  return { name: art.name, url: loginArtUrl(art.name), failed: art.failed, onError, shuffle };
}

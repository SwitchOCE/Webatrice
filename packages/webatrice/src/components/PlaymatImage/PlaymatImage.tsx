import { useEffect, useMemo, useState } from 'react';
import { ScryfallImageSize, type games } from '@cockatrice/datatrice';
import { useCardImageUrls, useImageCandidates } from '@app/hooks';
import { CardDTO, getScryfallUrl, printingsOf, type CardImageSubject } from '@app/services';
import { playmatImageBox, type Size } from '@app/utils';

interface Props { playmat: games.Playmat; area: Size | null }

/** Shared by the battlefield and crop editor, including source fallback and desktop rotation. */
export default function PlaymatImage({ playmat, area }: Props) {
  const { cardName, cardProviderId } = playmat;
  const [lookup, setLookup] = useState<{ name: string; card: CardDTO | undefined }>();
  const [loaded, setLoaded] = useState<{ src: string; size: Size }>();
  useEffect(() => {
    let active = true;
    void CardDTO.get(cardName).then(
      (card) => {
        if (active) {
          setLookup({ name: cardName, card });
        }
      },
      () => {
        if (active) {
          setLookup({ name: cardName, card: undefined });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [cardName]);
  const card = lookup?.name === cardName ? lookup.card : undefined;
  const subject = useMemo<CardImageSubject | undefined>(() => {
    if (lookup?.name !== cardName) {
      return undefined;
    }
    if (!card) {
      return { name: { value: cardName } };
    }
    // A set can contain several printings of the same card. Preserve the exact
    // provider id within that set before the resolver applies set priorities.
    const printings = printingsOf(card);
    return { ...card, set: [
      ...printings.filter((printing) => printing.uuid === cardProviderId),
      ...printings.filter((printing) => printing.uuid !== cardProviderId),
    ] };
  }, [lookup, card, cardName, cardProviderId]);
  const preferred = card && printingsOf(card).find((printing) => printing.uuid === cardProviderId);
  const candidates = useCardImageUrls(subject, preferred?.value, ScryfallImageSize.Large);
  const urls = useMemo(() => {
    if (!candidates.length || !cardProviderId || preferred) {
      return candidates;
    }
    // Unknown printing: try the announced provider id before the final by-name fallback.
    const providerUrl = getScryfallUrl({ providerId: cardProviderId, name: cardName }, ScryfallImageSize.Large);
    return [...candidates.slice(0, -1), providerUrl, ...candidates.slice(-1)].filter((url): url is string => !!url);
  }, [candidates, cardProviderId, cardName, preferred]);
  const { src, onError } = useImageCandidates(urls);
  const size = loaded?.src === src ? loaded?.size : undefined;
  // card_art_utils.cpp:10-16 rotates by card metadata, not by the bitmap's aspect ratio.
  const sideways = card?.landscapeOrientation?.value === '1';
  const upright = size && (sideways ? { width: size.height, height: size.width } : size);
  const box = upright && area ? playmatImageBox(upright, playmat.params, area) : null;
  if (!src) {
    return null;
  }
  return <img key={src} src={src} alt="" draggable={false} onError={onError}
    className="absolute max-w-none"
    onLoad={(event) => setLoaded({ src, size: {
      width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight,
    } })}
    style={box ? {
      position: 'absolute', maxWidth: 'none', left: box.x + (sideways ? box.width : 0), top: box.y,
      width: sideways ? box.height : box.width, height: sideways ? box.width : box.height,
      transform: sideways ? 'rotate(90deg)' : undefined, transformOrigin: '0 0',
    } : { visibility: 'hidden' }} />;
}

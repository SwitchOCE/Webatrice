import type { games } from '@cockatrice/datatrice';

// Port of desktop PlaymatUtils (cockatrice/src/interface/widgets/playmat/playmat_utils.h,
// #7101/#7159). The render path and desktop's crop editor share these helpers,
// so the same params frame the same art on both clients.

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

const MAX_ZOOM = 4;

/** Card width trimmed by the horizontal margins. */
function visibleWidth(card: Size, params: games.PlaymatParams): number {
  return Math.max(0, card.width - params.marginPctL * card.width - params.marginPctR * card.width);
}

/** Zoom clamped so the square sampling window stays within the card's shorter
 *  side, with the floor derived from the image itself. MAX_ZOOM still caps the
 *  result, exactly as desktop's playmatClampedZoom does, so only art more than
 *  four times wider than tall can be over-sampled vertically (desktop rotates
 *  sideways art upright before cropping, which keeps real cards inside it). */
function clampedZoom(card: Size, params: games.PlaymatParams): number {
  const minDim = Math.min(card.width, card.height);
  const visibleW = visibleWidth(card, params);
  const zoomOutFloor = minDim > 0 && visibleW > 0 ? visibleW / minDim : 1;
  return Math.min(MAX_ZOOM, Math.max(params.zoom, zoomOutFloor));
}

/**
 * The square region of the full card image used as the playmat. Margins trim
 * the card borders (shifting them pans), verticalOffset places the top of the
 * window within its travel, zoom scales into the trimmed span.
 */
export function computeArtSourceRect(card: Size, params: games.PlaymatParams): Rect {
  const visibleW = visibleWidth(card, params);
  const side = visibleW > 0 ? visibleW / clampedZoom(card, params) : 0;
  const offset = Math.min(1, Math.max(0, params.verticalOffset));
  const y = offset * Math.max(0, card.height - side);
  const x = Math.min(
    Math.max(0, params.marginPctL * card.width + (visibleW - side) / 2),
    Math.max(0, card.width - side),
  );
  return { x, y, width: side, height: side };
}

/** Fits a source of `source`'s aspect ratio over `area` without distortion ("cover"), centred. */
export function coverFitRect(area: Rect, source: Size): Rect {
  const sourceAspect = source.width / source.height;
  const areaAspect = area.width / area.height;
  if (sourceAspect > areaAspect) {
    const width = area.height * sourceAspect;
    return { x: area.x + (area.width - width) / 2, y: area.y, width, height: area.height };
  }
  const height = area.width / sourceAspect;
  return { x: area.x, y: area.y + (area.height - height) / 2, width: area.width, height };
}

/**
 * Where to place the whole card image so its art crop covers `area`: the
 * image box in area coordinates, to be clipped by the area. The DOM stand-in
 * for desktop's drawPixmap(dstRect, pixmap, srcRect).
 */
export function playmatImageBox(card: Size, params: games.PlaymatParams, area: Size): Rect | null {
  const source = computeArtSourceRect(card, params);
  if (source.width <= 0 || area.width <= 0 || area.height <= 0) {
    return null;
  }
  const target = coverFitRect({ x: 0, y: 0, ...area }, source);
  const scale = target.width / source.width;
  return {
    x: target.x - source.x * scale,
    y: target.y - source.y * scale,
    width: card.width * scale,
    height: card.height * scale,
  };
}

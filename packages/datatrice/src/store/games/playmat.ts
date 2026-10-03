import type { ServerInfo_PlayerProperties_PlaymatParams } from '@cockatrice/sockatrice/generated';

/** How the playmat card art is cropped into the play area (desktop `PlaymatParams`). */
export interface PlaymatParams {
  /** Left margin as a fraction of the card width (0–0.95). */
  marginPctL: number;
  /** Right margin as a fraction of the card width (0–0.95). */
  marginPctR: number;
  /** Top of the sampling window within its vertical travel (0 = top, 1 = bottom). */
  verticalOffset: number;
  /** Zoom into the trimmed span (0.1–4). */
  zoom: number;
}

/** A player's playmat: the card whose art is shown plus its crop (desktop `PlaymatInfo`). */
export interface Playmat {
  cardName: string;
  /** Printing uuid; empty when the art follows the card name alone. */
  cardProviderId: string;
  params: PlaymatParams;
}

/** The proto defaults of ServerInfo_PlayerProperties.PlaymatParams. */
export const DEFAULT_PLAYMAT_PARAMS: PlaymatParams = {
  marginPctL: 0.07,
  marginPctR: 0.07,
  verticalOffset: 0.33,
  zoom: 1,
};

const clamp = (value: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Clamps to the ranges the server, the deck parser and the settings dialog all enforce, so no
 *  source can produce a degenerate crop (a zoom of 0 dividing by zero). */
export function clampPlaymatParams(params: PlaymatParams): PlaymatParams {
  return {
    marginPctL: clamp(params.marginPctL, 0, 0.95, DEFAULT_PLAYMAT_PARAMS.marginPctL),
    marginPctR: clamp(params.marginPctR, 0, 0.95, DEFAULT_PLAYMAT_PARAMS.marginPctR),
    verticalOffset: clamp(params.verticalOffset, 0, 1, DEFAULT_PLAYMAT_PARAMS.verticalOffset),
    zoom: clamp(params.zoom, 0.1, 4, DEFAULT_PLAYMAT_PARAMS.zoom),
  };
}

/**
 * The playmat a player's properties announce, or null when they announce none.
 * Port of desktop `PlayerLogic::setPlaymatFromProperties`: an empty card name
 * clears the playmat, and the params are clamped on receipt.
 */
export function playmatFromParams(params: ServerInfo_PlayerProperties_PlaymatParams | undefined): Playmat | null {
  if (!params?.cardName) {
    return null;
  }
  return {
    cardName: params.cardName,
    cardProviderId: params.cardProviderId,
    params: clampPlaymatParams(params),
  };
}

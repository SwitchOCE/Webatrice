// What the rest of the app may use: card-image URLs and the card-detail
// fetch. The raw client (`./client`: collection, named and printings
// requests) stays internal so lookups go through the card catalog's
// cache, session memo and retry cap; eslint enforces it.
export {
  detailTargetKey,
  fetchScryfallDetail,
  selectCardFace,
  type DetailTarget,
  type ScryfallDetail,
  type ScryfallDetailFace,
} from './cardDetail';
export { cleanScryfallName } from './client';
export {
  getScryfallUrl,
  getScryfallUrlByExactName,
  getScryfallUrlById,
  getScryfallUrlByIdOrExactName,
  getScryfallUrlByName,
  getScryfallSymbolUrl,
} from './imageUrls';

import { CardDTO, SetDTO } from '@app/services';

export interface CardPrinting {
  /** Printing uuid: the provider id a card-art rule targets. */
  providerId: string;
  label: string;
}

/**
 * Desktop TabCardArtRules::populateProviderCombo: one entry per printing of the
 * card in the local card database, labelled "<set long name> #<collector number>"
 * and keyed by the printing's uuid. Printings without a uuid cannot be targeted
 * and are skipped; an unknown card yields no printings.
 */
export async function loadCardPrintings(cardName: string): Promise<CardPrinting[]> {
  const name = cardName.trim();
  if (!name) {
    return [];
  }
  const card = await CardDTO.get(name).catch(() => undefined);
  if (!card) {
    return [];
  }
  const sets = Array.isArray(card.set) ? card.set : [card.set];
  const printings: CardPrinting[] = [];
  for (const printing of sets) {
    if (!printing?.uuid) {
      continue;
    }
    const set = await SetDTO.get(printing.value).catch(() => undefined);
    const setName = set?.longname?.value || printing.value;
    printings.push({
      providerId: printing.uuid,
      label: printing.num ? `${setName} #${printing.num}` : setName,
    });
  }
  return printings;
}

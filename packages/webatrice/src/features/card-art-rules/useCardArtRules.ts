import { useCallback, useEffect, useState } from 'react';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { Response_CardArtRuleEntry } from '@cockatrice/sockatrice/generated';
import { useAppSelector } from '@app/store';

import { loadCardPrintings, type CardPrinting } from './cardPrintings';

/** Wire values Servatrice accepts for a rule's mode (desktop's mode combo box). */
export const CARD_ART_RULE_MODES = ['ALLOW', 'DENY'] as const;
export type CardArtRuleMode = typeof CARD_ART_RULE_MODES[number];

export interface NewCardArtRule {
  cardName: string;
  cardProviderId: string;
  mode: CardArtRuleMode;
  reason: string;
}

export interface CardArtRules {
  rules: Response_CardArtRuleEntry[];
  selectedIndex: number | null;
  select: (index: number) => void;
  printings: CardPrinting[];
  lookUpPrintings: (cardName: string) => void;
  addRule: (rule: NewCardArtRule) => void;
  removeSelected: () => void;
  refresh: () => void;
}

const NO_RULES: Response_CardArtRuleEntry[] = [];

/**
 * Desktop TabCardArtRules. Like desktop, add and remove send the command and
 * re-list the rules straight away; Servatrice answers in order, so the list
 * reflects the change.
 */
export function useCardArtRules(): CardArtRules {
  const webClient = useWebClient();
  const rules = useAppSelector(server.Selectors.getCardArtRules) ?? NO_RULES;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [printings, setPrintings] = useState<CardPrinting[]>([]);

  const refresh = useCallback(() => {
    setSelectedIndex(null);
    webClient.request.moderator.listCardArtRules();
  }, [webClient]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const lookUpPrintings = (cardName: string) => {
    loadCardPrintings(cardName).then(setPrintings, () => setPrintings([]));
  };

  const addRule = ({ cardName, cardProviderId, mode, reason }: NewCardArtRule) => {
    webClient.request.moderator.addCardArtRule(cardName, cardProviderId, mode, reason);
    refresh();
  };

  const removeSelected = () => {
    const entry = selectedIndex === null ? undefined : rules[selectedIndex];
    if (!entry) {
      return;
    }
    webClient.request.moderator.removeCardArtRule(entry.cardName, entry.cardProviderId);
    refresh();
  };

  return {
    rules,
    selectedIndex,
    select: setSelectedIndex,
    printings,
    lookUpPrintings,
    addRule,
    removeSelected,
    refresh,
  };
}

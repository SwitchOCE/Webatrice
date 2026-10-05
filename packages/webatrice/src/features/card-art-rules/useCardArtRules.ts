import { useCallback, useEffect, useState } from 'react';

import { useTranslation } from 'react-i18next';

import { useCommandFailureMessage, useReduxEffect } from '@app/hooks';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';
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
  error: string | null;
  dismissError: () => void;
  rules: Response_CardArtRuleEntry[];
  selectedIndex: number | null;
  select: (index: number) => void;
  printings: CardPrinting[];
  lookUpPrintings: (cardName: string) => void;
  addRule: (rule: NewCardArtRule) => void;
  removeSelected: () => void;
  refresh: () => void;
}

const FAILURE_KEYS: Partial<Record<WebsocketTypes.ModeratorCommandName, string>> = {
  listCardArtRules: 'CardArtRules.error.list',
  addCardArtRule: 'CardArtRules.error.add',
  removeCardArtRule: 'CardArtRules.error.remove',
};

const NO_RULES: Response_CardArtRuleEntry[] = [];

/**
 * Desktop TabCardArtRules. Like desktop, add and remove send the command and
 * re-list the rules straight away; Servatrice answers in order, so the list
 * reflects the change.
 */
export function useCardArtRules(): CardArtRules {
  const webClient = useWebClient();
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const [error, setError] = useState<string | null>(null);
  useReduxEffect<{ command: WebsocketTypes.ModeratorCommandName; failure?: WebsocketTypes.CommandFailure }>(({ payload }) => {
    const key = FAILURE_KEYS[payload.command];
    if (key) {
      setError(describeFailure(payload.failure, t(key)));
    }
  }, server.Types.MODERATOR_COMMAND_FAILED, [t, describeFailure]);
  const rules = useAppSelector(server.Selectors.getCardArtRules) ?? NO_RULES;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [printings, setPrintings] = useState<CardPrinting[]>([]);

  const refresh = useCallback(() => {
    setError(null);
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
    error,
    dismissError: () => setError(null),
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

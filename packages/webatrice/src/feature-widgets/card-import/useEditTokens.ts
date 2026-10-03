import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Token } from '@app/services';

import { cardDatabaseService, CUSTOM_TOKEN_SET } from './CardDatabaseService';
import { writeCockatriceXml } from './CockatriceXmlWriter';
import { applyTokenData, createCustomToken, type TokenData } from './customTokens';

export type AddTokenOutcome = 'added' | 'conflict';

export interface EditTokens {
  loading: boolean;
  error: string | null;
  tokens: Token[];
  selected: Token | null;
  select: (name: string | null) => void;
  /** Rejects names already used by a card or token, like desktop. */
  addToken: (name: string) => Promise<AddTokenOutcome>;
  updateSelected: (data: TokenData) => Promise<void>;
  removeSelected: () => Promise<void>;
  /** Cockatrice XML of the custom tokens — desktop's `customsets/TK.xml`. */
  exportXml: () => string;
}

const byName = (a: Token, b: Token) => a.name.value.localeCompare(b.name.value);

/**
 * State for the "Edit custom tokens" editor (`dlg_edit_tokens.cpp`). Every
 * change is written through at once, as desktop's edits are live and saved
 * when its dialog closes.
 */
export function useEditTokens(): EditTokens {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cardDatabaseService.getCustomTokens().then((loaded) => {
      if (!cancelled) {
        setTokens([...loaded].sort(byName));
        setLoading(false);
      }
    }).catch((e: Error) => {
      if (!cancelled) {
        setError(e.message);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: Token[], removed: string[] = []) => {
    setError(null);
    try {
      await cardDatabaseService.saveCustomTokens(next, removed);
      setTokens(next);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }, []);

  const selected = useMemo(
    () => tokens.find((token) => token.name.value === selectedName) ?? null,
    [tokens, selectedName],
  );

  const addToken = async (rawName: string): Promise<AddTokenOutcome> => {
    const name = rawName.trim();
    const local = tokens.some((token) => token.name.value.toLowerCase() === name.toLowerCase());
    if (local || await cardDatabaseService.isNameTaken(name)) {
      return 'conflict';
    }
    await persist([...tokens, createCustomToken(name)].sort(byName));
    setSelectedName(name);
    return 'added';
  };

  const updateSelected = async (data: TokenData) => {
    if (!selected) {
      return;
    }
    await persist(tokens.map((token) => (token === selected ? applyTokenData(token, data) : token)));
  };

  const removeSelected = async () => {
    if (!selected) {
      return;
    }
    const name = selected.name.value;
    setSelectedName(null);
    await persist(tokens.filter((token) => token !== selected), [name]);
  };

  return {
    loading,
    error,
    tokens,
    selected,
    select: setSelectedName,
    addToken,
    updateSelected,
    removeSelected,
    exportXml: () => writeCockatriceXml({ sets: [CUSTOM_TOKEN_SET], cards: tokens }),
  };
}

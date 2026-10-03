import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_PICTURE_URL_TEMPLATES } from '@app/services';

import { cardDatabaseService } from './CardDatabaseService';

export interface PictureUrlTemplates {
  loading: boolean;
  error: string | null;
  templates: string[];
  selectedIndex: number | null;
  select: (index: number | null) => void;
  add: (template: string) => Promise<void>;
  replaceSelected: (template: string) => Promise<void>;
  removeSelected: () => Promise<void>;
  moveSelected: (offset: -1 | 1) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

/**
 * The ordered picture URL list of desktop's card-source settings
 * (`deck_editor_settings_page.cpp` "URL Download Priority"). Like desktop,
 * every change is stored immediately.
 */
export function usePictureUrlTemplates(): PictureUrlTemplates {
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cardDatabaseService.getPictureUrlTemplates().then((loaded) => {
      if (!cancelled) {
        setTemplates(loaded);
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

  const store = useCallback(async (next: string[], nextSelected: number | null) => {
    setError(null);
    try {
      await cardDatabaseService.savePictureUrlTemplates(next);
      setTemplates(next);
      setSelectedIndex(nextSelected);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  return {
    loading,
    error,
    templates,
    selectedIndex,
    select: setSelectedIndex,
    add: (template) => store([...templates, template.trim()], templates.length),
    replaceSelected: async (template) => {
      if (selectedIndex === null) {
        return;
      }
      await store(templates.map((t, i) => (i === selectedIndex ? template.trim() : t)), selectedIndex);
    },
    removeSelected: async () => {
      if (selectedIndex === null) {
        return;
      }
      await store(templates.filter((_, i) => i !== selectedIndex), null);
    },
    moveSelected: async (offset) => {
      const target = selectedIndex === null ? -1 : selectedIndex + offset;
      if (selectedIndex === null || target < 0 || target >= templates.length) {
        return;
      }
      const next = [...templates];
      [next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
      await store(next, target);
    },
    resetToDefaults: () => store([...DEFAULT_PICTURE_URL_TEMPLATES], null),
  };
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cardDatabaseService, type RebuildResult, type UnknownSetsAnswer } from './CardDatabaseService';
import { localOracleImportService, IngestResult } from './LocalOracleImportService';
import { Card, Set } from '@app/services';
export interface CardImportForm {
  /** Answer the new-sets question raised by the last save. */
  answerUnknownSets: (answer: UnknownSetsAnswer) => Promise<void>;
  loading: boolean;
  activeStep: number;
  steps: { key: string; label: string }[];
  importedCards: Card[];
  importedSets: Set[];
  ingest: IngestResult | null;
  /** Outcome of the last save, including sets that still need a decision. */
  rebuild: RebuildResult | null;
  error: string | null;
  handleBack: () => void;
  handleLocalFiles: (files: File[]) => Promise<void>;
  handleLocalSave: () => Promise<void>;
}

const STEP_KEYS = ['importFiles', 'reviewAndSave', 'finished'] as const;

export function useCardImportForm(): CardImportForm {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [importedCards, setImportedCards] = useState<Card[]>([]);
  const [importedSets, setImportedSets] = useState<Set[]>([]);
  const [ingest, setIngest] = useState<IngestResult | null>(null);
  const [rebuild, setRebuild] = useState<RebuildResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) {
      setError(null);
    }
  }, [loading]);

  const steps = STEP_KEYS.map(key => ({ key, label: `CardImportForm.steps.${key}` }));

  const handleNext = () => setActiveStep(s => s + 1);
  const handleBack = () => {
    setError(null);
    setActiveStep(s => Math.max(0, s - 1));
  };

  const handleLocalFiles = async (files: File[]) => {
    setLoading(true);
    try {
      const result = await localOracleImportService.ingest(files);
      if (result.acceptedFiles.length === 0) {
        throw new Error('No recognized files. Expected cards.xml, tokens.xml, or spoiler.xml.');
      }
      setIngest(result);
      setImportedCards(result.cards);
      setImportedSets(result.sets);
      handleNext();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleLocalSave = async () => {
    if (!ingest) {
      return;
    }
    setLoading(true);
    try {
      setRebuild(await localOracleImportService.persist(ingest));
      handleNext();
    } catch (e) {
      console.error(e);
      setError(t('CardImportForm.message.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    activeStep,
    steps,
    importedCards,
    importedSets,
    ingest,
    rebuild,
    answerUnknownSets: async (answer) => {
      try {
        await cardDatabaseService.resolveUnknownSets(answer);
        setRebuild((current) => (current ? { ...current, unknownSets: [] } : current));
      } catch (e) {
        setError((e as Error).message);
      }
    },
    error,
    handleBack,
    handleLocalFiles,
    handleLocalSave,
  };
}

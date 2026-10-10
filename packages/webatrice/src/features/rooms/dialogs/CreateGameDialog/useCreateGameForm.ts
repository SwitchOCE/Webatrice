import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CreateGameParams } from '@cockatrice/sockatrice/generated';

import { initialCreateGameForm, readCreateGameDefaults, writeCreateGameDefaults } from './createGameDefaults';
import {
  applyPreset,
  defaultCreateGameForm,
  matchingPreset,
  summarizeCreateGame,
  toCreateGameParams,
  type CreateGameForm,
  type CreateGamePreset,
} from './createGamePresets';

export interface UseCreateGameFormArgs {
  isOpen: boolean;
  gametypeMap: Record<number, string>;
  isRegistered: boolean;
  isJudge: boolean;
}

export function useCreateGameForm({ isOpen, gametypeMap, isRegistered, isJudge }: UseCreateGameFormArgs) {
  const [form, setForm] = useState<CreateGameForm>(() => defaultCreateGameForm(isRegistered));
  const [remember, setRemember] = useState(true);
  const gametypeMapRef = useRef(gametypeMap);
  gametypeMapRef.current = gametypeMap;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const stored = readCreateGameDefaults();
    setRemember(stored.remember);
    setForm(initialCreateGameForm(stored, { gametypeMap: gametypeMapRef.current, isRegistered }));
  }, [isOpen, isRegistered]);

  const update = useCallback(<K extends keyof CreateGameForm>(key: K, value: CreateGameForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const pickPreset = useCallback(
    (preset: CreateGamePreset) => setForm((prev) => applyPreset(prev, preset, { gametypeMap, isRegistered })),
    [gametypeMap, isRegistered],
  );

  const selectedPreset = matchingPreset(form, isRegistered);
  const summary = useMemo(() => summarizeCreateGame(form, { gametypeMap, isJudge }), [form, gametypeMap, isJudge]);

  const submit = useCallback((): CreateGameParams => {
    writeCreateGameDefaults(remember, form, gametypeMap);
    return toCreateGameParams(form, isJudge);
  }, [form, gametypeMap, isJudge, remember]);

  return { form, update, pickPreset, selectedPreset, summary, remember, setRemember, submit };
}

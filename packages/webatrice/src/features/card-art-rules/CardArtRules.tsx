import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { TFunction } from 'i18next';

import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';

import { AuthGuard, CapabilityGuard, ModGuard } from '@app/components';
import { Layout } from '@app/feature-wrappers/layout';
import { ServerCapability } from '@cockatrice/datatrice';

import { CARD_ART_RULE_MODES, useCardArtRules } from './useCardArtRules';

import './CardArtRules.css';

const buildRuleSchema = (t: TFunction) =>
  z.object({
    cardName: z.string().trim().min(1, t('Common.validation.required')),
    cardProviderId: z.string().trim().min(1, t('Common.validation.required')),
    mode: z.enum(CARD_ART_RULE_MODES),
    reason: z.string(),
  });

type RuleFormValues = z.infer<ReturnType<typeof buildRuleSchema>>;

const DEFAULT_VALUES: RuleFormValues = { cardName: '', cardProviderId: '', mode: 'ALLOW', reason: '' };

/** Desktop TabCardArtRules (tab_card_art_rules.cpp). */
const CardArtRulesContent = () => {
  const { t } = useTranslation();
  const rulesState = useCardArtRules();
  const { rules, selectedIndex, printings } = rulesState;

  const resolver = useMemo(() => zodResolver(buildRuleSchema(t)), [t]);
  const { control, handleSubmit, setValue } = useForm<RuleFormValues>({ defaultValues: DEFAULT_VALUES, resolver });

  // A new card's printings replace the provider choice, as desktop repopulates its combo box.
  useEffect(() => {
    setValue('cardProviderId', printings[0]?.providerId ?? '');
  }, [printings, setValue]);

  const columns = [t('CardArtRules.column.card'), t('CardArtRules.column.providerId'),
    t('CardArtRules.column.mode'), t('CardArtRules.column.reason')];

  return (
    <>
      <Paper component="section" className="card-art-rules__form-panel">
        <form className="card-art-rules__form" onSubmit={handleSubmit(rulesState.addRule)} noValidate>
          <Controller
            name="cardName"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                size="small"
                label={t('CardArtRules.label.card')}
                placeholder={t('CardArtRules.label.cardPlaceholder')}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                onBlur={() => {
                  field.onBlur();
                  rulesState.lookUpPrintings(field.value);
                }}
              />
            )}
          />
          <Controller
            name="cardProviderId"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                size="small"
                select={printings.length > 0}
                label={t('CardArtRules.label.providerId')}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
              >
                {printings.map((printing) => (
                  <MenuItem key={printing.providerId} value={printing.providerId}>{printing.label}</MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            name="mode"
            control={control}
            render={({ field }) => (
              <TextField {...field} size="small" select label={t('CardArtRules.label.mode')}>
                {CARD_ART_RULE_MODES.map((mode) => <MenuItem key={mode} value={mode}>{mode}</MenuItem>)}
              </TextField>
            )}
          />
          <Controller
            name="reason"
            control={control}
            render={({ field }) => <TextField {...field} size="small" label={t('CardArtRules.label.reason')} />}
          />
          <div className="card-art-rules__buttons">
            <Button type="submit" variant="contained">{t('CardArtRules.button.add')}</Button>
            <Button type="button" variant="outlined" disabled={selectedIndex === null} onClick={rulesState.removeSelected}>
              {t('CardArtRules.button.remove')}
            </Button>
            <Button type="button" onClick={rulesState.refresh}>{t('CardArtRules.button.refresh')}</Button>
          </div>
        </form>
      </Paper>

      <Paper component="section" className="card-art-rules__table">
        <Table size="small" stickyHeader aria-label={t('CardArtRules.title')}>
          <TableHead>
            <TableRow>
              {columns.map((label) => <TableCell key={label}>{label}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.map((rule, index) => (
              <TableRow
                key={`${rule.cardName}\u0000${rule.cardProviderId}`}
                hover
                selected={index === selectedIndex}
                aria-selected={index === selectedIndex}
                onClick={() => rulesState.select(index)}
                className="card-art-rules__row"
              >
                <TableCell>{rule.cardName}</TableCell>
                <TableCell>{rule.cardProviderId}</TableCell>
                <TableCell>{rule.mode}</TableCell>
                <TableCell>{rule.reason}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </>
  );
};

// The guards mount the page body only when it is allowed, so its mount effects
// never send a staff or 3.1 command the user or server cannot serve.
const CardArtRules = () => (
  <Layout className="card-art-rules scrollable">
    <AuthGuard />
    <ModGuard>
      <CapabilityGuard capability={ServerCapability.CARD_ART}>
        <CardArtRulesContent />
      </CapabilityGuard>
    </ModGuard>
  </Layout>
);

export default CardArtRules;

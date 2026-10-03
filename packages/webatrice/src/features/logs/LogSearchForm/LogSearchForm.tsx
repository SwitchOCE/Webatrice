import { useMemo } from 'react';
import { useForm, Controller, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';

import { CheckboxField, InputField } from '@app/components';

import {
  applyLogSearchDefaults,
  buildLogSearchSchema,
  LOG_MAX_DAYS,
  LOG_MAX_RESULTS,
  LOG_SEARCH_DEFAULTS,
  type LogSearchFormValues,
} from './logSearchFormSchema';

import './LogSearchForm.css';

export type { LogSearchFormValues };

interface LogSearchFormProps {
  onSubmit: (values: LogSearchFormValues) => void;
}

type TextFilter = 'userName' | 'ipAddress' | 'gameName' | 'gameId' | 'message';
const TEXT_FILTERS: TextFilter[] = ['userName', 'ipAddress', 'gameName', 'gameId', 'message'];
// MAX_NAME_LENGTH / MAX_TEXT_LENGTH (libcockatrice string_limits.h), as TabLog caps its line edits.
const MAX_NAME_LENGTH = 0xff;
const MAX_TEXT_LENGTH = 0xfff;

const NumberField = ({ control, name, label, max, disabled }: {
  control: Control<LogSearchFormValues>;
  name: 'pastDays' | 'maximumResults';
  label: string;
  max: number;
  disabled?: boolean;
}) => (
  <Controller
    name={name}
    control={control}
    render={({ field }) => (
      <InputField
        name={field.name}
        type="number"
        min={0}
        max={max}
        step={1}
        disabled={disabled}
        // A cleared desktop spin box reads 0 but shows nothing.
        value={field.value === 0 ? '' : String(field.value)}
        onBlur={field.onBlur}
        onChange={(e) => {
          const parsed = Number.parseInt(e.target.value, 10);
          field.onChange(Number.isNaN(parsed) ? 0 : Math.min(max, Math.max(0, parsed)));
        }}
        label={label}
      />
    )}
  />
);

/**
 * The search dock of desktop's TabLog (tab_logs.cpp): five text filters, the
 * three log locations, a date range (past X days / today / last hour), a
 * maximum result count, "Get User Logs" and "Clear Filters". An
 * under-specified search is completed the way desktop completes it, and the
 * completed values are written back into the form.
 */
const LogSearchForm = ({ onSubmit }: LogSearchFormProps) => {
  const { t } = useTranslation();
  const resolver = useMemo(() => zodResolver(buildLogSearchSchema(t)), [t]);
  const { control, handleSubmit, reset, formState } = useForm<LogSearchFormValues>({
    defaultValues: LOG_SEARCH_DEFAULTS,
    resolver,
  });

  // Desktop raises these as message boxes; here they show above the buttons.
  const searchError = formState.errors.userName?.message ?? formState.errors.pastDays?.message;

  const submit = handleSubmit((values) => {
    const completed = applyLogSearchDefaults(values);
    reset(completed, { keepDefaultValues: true });
    onSubmit(completed);
  });

  return (
    <Paper className="log-search">
      <form className="log-search__form" onSubmit={submit} noValidate>
        <fieldset className="log-search__group">
          <legend className="log-search__legend">{t('LogSearchForm.group.filters')}</legend>
          {TEXT_FILTERS.map((name) => (
            <div className="log-search__form-item" key={name}>
              <Controller
                name={name}
                control={control}
                render={({ field }) => (
                  <InputField
                    {...field}
                    maxLength={name === 'message' ? MAX_TEXT_LENGTH : MAX_NAME_LENGTH}
                    label={t(`LogSearchForm.label.${name}`)}
                  />
                )}
              />
            </div>
          ))}
        </fieldset>
        <Divider />
        <fieldset className="log-search__group">
          <legend className="log-search__legend">{t('LogSearchForm.group.locations')}</legend>
          <div className="log-search__form-item log-location">
            <Controller
              name="logLocation.room"
              control={control}
              render={({ field }) => <CheckboxField {...field} label={t('LogSearchForm.label.rooms')} />}
            />
            <Controller
              name="logLocation.game"
              control={control}
              render={({ field }) => <CheckboxField {...field} label={t('LogSearchForm.label.games')} />}
            />
            <Controller
              name="logLocation.chat"
              control={control}
              render={({ field }) => <CheckboxField {...field} label={t('LogSearchForm.label.chats')} />}
            />
          </div>
        </fieldset>
        <Divider />
        <fieldset className="log-search__group">
          <legend className="log-search__legend">{t('LogSearchForm.group.dateRange')}</legend>
          <Controller
            name="dateRange"
            control={control}
            render={({ field }) => (
              <div className="log-search__form-item log-range" role="radiogroup">
                {(['pastDays', 'today', 'lastHour'] as const).map((range) => (
                  <label key={range} className="log-search__radio">
                    <input
                      type="radio"
                      name={field.name}
                      value={range}
                      checked={field.value === range}
                      onChange={() => field.onChange(range)}
                    />
                    {t(`LogSearchForm.label.${range}`)}
                  </label>
                ))}
              </div>
            )}
          />
          <div className="log-search__form-item">
            <NumberField control={control} name="pastDays" label={t('LogSearchForm.label.days')} max={LOG_MAX_DAYS} />
          </div>
        </fieldset>
        <Divider />
        <fieldset className="log-search__group">
          <legend className="log-search__legend">{t('LogSearchForm.group.maximumResults')}</legend>
          <div className="log-search__form-item">
            <NumberField
              control={control}
              name="maximumResults"
              label={t('LogSearchForm.label.maximumResults')}
              max={LOG_MAX_RESULTS}
            />
          </div>
        </fieldset>
        <Divider />
        <p className="log-search__description">{t('LogSearchForm.description')}</p>
        {searchError && <p role="alert" className="log-search__error">{searchError}</p>}
        <div className="log-search__buttons">
          <Button className="log-search__form-submit" color="primary" variant="contained" type="submit">
            {t('LogSearchForm.button.search')}
          </Button>
          <Button variant="outlined" type="button" onClick={() => reset(LOG_SEARCH_DEFAULTS)}>
            {t('LogSearchForm.button.clear')}
          </Button>
        </div>
      </form>
    </Paper>
  );
};

export default LogSearchForm;

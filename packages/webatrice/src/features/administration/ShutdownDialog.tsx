import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';

import {
  buildShutdownSchema,
  DEFAULT_SHUTDOWN_MINUTES,
  MAX_SHUTDOWN_MINUTES,
  MAX_SHUTDOWN_REASON_LENGTH,
  type ShutdownFormValues,
} from './administrationSchemas';

interface ShutdownDialogProps {
  isOpen: boolean;
  onSubmit: (reason: string, minutes: number) => void;
  onCancel: () => void;
}

const DEFAULT_VALUES: ShutdownFormValues = { reason: '', minutes: String(DEFAULT_SHUTDOWN_MINUTES) };

/** Desktop ShutdownDialog (tab_admin.cpp): a reason and the minutes until shutdown. */
const ShutdownDialog = ({ isOpen, onSubmit, onCancel }: ShutdownDialogProps) => {
  const { t } = useTranslation();
  const resolver = useMemo(() => zodResolver(buildShutdownSchema(t)), [t]);
  const { control, handleSubmit, reset } = useForm<ShutdownFormValues>({ defaultValues: DEFAULT_VALUES, resolver });

  // Each opening starts from desktop's defaults, as a fresh QDialog does.
  useEffect(() => {
    if (isOpen) {
      reset(DEFAULT_VALUES);
    }
  }, [isOpen, reset]);

  const submit = handleSubmit(({ reason, minutes }) => onSubmit(reason, Number(minutes)));

  return (
    <Dialog open={isOpen} onClose={onCancel} aria-labelledby="shutdown-dialog-title">
      <DialogTitle id="shutdown-dialog-title">{t('Administration.shutdown.title')}</DialogTitle>
      <form onSubmit={submit} noValidate>
        <DialogContent className="administration-shutdown__fields">
          <Controller
            name="reason"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                autoFocus
                fullWidth
                size="small"
                label={t('Administration.shutdown.reason')}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                slotProps={{ htmlInput: { maxLength: MAX_SHUTDOWN_REASON_LENGTH } }}
              />
            )}
          />
          <Controller
            name="minutes"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                fullWidth
                size="small"
                type="number"
                label={t('Administration.shutdown.minutes')}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                slotProps={{ htmlInput: { min: 0, max: MAX_SHUTDOWN_MINUTES, step: 1 } }}
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onCancel}>{t('Administration.button.cancel')}</Button>
          <Button type="submit" variant="contained" color="error">{t('Administration.shutdown.confirm')}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ShutdownDialog;

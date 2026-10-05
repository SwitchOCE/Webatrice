import { useTranslation } from 'react-i18next';

import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

import type { TemporaryPassword } from './useModeration';

interface TemporaryPasswordDialogProps {
  result: TemporaryPassword | null;
  onDismiss: () => void;
}

/**
 * Desktop TabModeration::resetPasswordResponse. The temporary password is shown
 * once; dismissing the dialog drops the only copy the client holds.
 */
const TemporaryPasswordDialog = ({ result, onDismiss }: TemporaryPasswordDialogProps) => {
  const { t } = useTranslation();

  return (
    <Dialog open={result !== null} onClose={onDismiss} aria-labelledby="temporary-password-title">
      <DialogTitle id="temporary-password-title">{t('ModerationPage.password.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('ModerationPage.password.for', { userName: result?.userName ?? '' })}</DialogContentText>
        <TextField
          className="moderation__password"
          label={t('ModerationPage.password.label')}
          value={result?.temporaryPassword ?? ''}
          slotProps={{ input: { readOnly: true } }}
          fullWidth
        />
        <DialogContentText>{t('ModerationPage.password.secureChannel')}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onDismiss} autoFocus>{t('ModerationPage.button.ok')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TemporaryPasswordDialog;

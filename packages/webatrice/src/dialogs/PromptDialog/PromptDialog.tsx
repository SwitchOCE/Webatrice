import { styled } from '@mui/material/styles';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';

import { usePromptDialog } from './usePromptDialog';

import './PromptDialog.css';

const PREFIX = 'PromptDialog';

const classes = {
  root: `${PREFIX}-root`,
};

const StyledDialog = styled(Dialog)(({ theme }) => ({
  [`&.${classes.root}`]: {
    '& .dialog-title__wrapper': {
      borderColor: theme.palette.divider,
    },
  },
}));

export interface PromptDialogProps {
  isOpen: boolean;
  title: string;
  label: string;
  initialValue?: string;
  inputType?: 'text' | 'password';
  submitLabel?: string;
  helperText?: string;
  /** A line under the title: what is being edited, or the input's range. */
  description?: string;
  placeholder?: string;
  /** `numeric` brings up a number keypad without restricting what can be typed. */
  inputMode?: 'text' | 'numeric';
  /** Select the seeded value on focus, so typing replaces it. */
  selectOnFocus?: boolean;
  /** Live feedback under the field while there is no error (e.g. an evaluated sum). */
  preview?: (value: string) => string | null;
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

function PromptDialog({
  isOpen,
  title,
  label,
  initialValue = '',
  inputType = 'text',
  submitLabel = 'OK',
  helperText,
  description,
  placeholder,
  inputMode,
  selectOnFocus = false,
  preview,
  validate,
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const { value, error, handleChange, handleSubmit } = usePromptDialog({
    isOpen,
    initialValue,
    validate,
    onSubmit,
  });

  return (
    <StyledDialog
      className={'PromptDialog ' + classes.root}
      open={isOpen}
      onClose={onCancel}
      maxWidth={false}
    >
      <DialogTitle className="dialog-title">
        <div className="dialog-title__wrapper">
          {title}
        </div>
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent className="dialog-content">
          {description && (
            <DialogContentText className="PromptDialog__description">{description}</DialogContentText>
          )}
          <TextField
            type={inputType}
            autoFocus
            fullWidth
            variant="outlined"
            size="small"
            label={label}
            value={value}
            placeholder={placeholder}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={selectOnFocus ? (e) => e.target.select() : undefined}
            error={error != null}
            helperText={error ?? preview?.(value) ?? helperText ?? ''}
            slotProps={{ htmlInput: { 'aria-label': label, inputMode } }}
          />
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" color="primary">
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </StyledDialog>
  );
}

export default PromptDialog;

import { type ReactNode } from 'react';

import { styled } from '@mui/material/styles';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Button from '@mui/material/Button';

import { useDialogFocus, useDialogReturnFocus } from '@app/hooks';

import './AlertDialog.css';

const PREFIX = 'AlertDialog';

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

export type AlertDialogSeverity = 'error' | 'info';

export interface AlertDialogNotice {
  title: string;
  message: string;
  severity: AlertDialogSeverity;
}

export interface AlertDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  buttonLabel?: string;
  severity?: AlertDialogSeverity;
  onDismiss: () => void;
}

// Mount inside the MUI portal so the shared focus hook sees the paper when its effect runs.
// It owns restoration and containment; MUI still owns Escape and the transition.
function AlertFocus({ isOpen, children }: { isOpen: boolean; children: ReactNode }) {
  const returnFocusTo = useDialogReturnFocus();
  const { getDialogProps } = useDialogFocus({ isOpen, isolate: true, returnFocusTo });
  const props = getDialogProps();
  return <div {...props} ref={(element) => props.ref(element?.closest<HTMLElement>('[role="dialog"]') ?? null)}>{children}</div>;
}

function AlertDialog({
  isOpen,
  title,
  message,
  buttonLabel = 'OK',
  severity = 'error',
  onDismiss,
}: AlertDialogProps) {
  return (
    <StyledDialog
      className={'AlertDialog ' + classes.root}
      open={isOpen}
      disableRestoreFocus
      disableEnforceFocus
      onClose={onDismiss}
      maxWidth={false}
    >
      <AlertFocus isOpen={isOpen}>
        <DialogTitle className="dialog-title">
          <div className="dialog-title__wrapper">
            {title}
          </div>
        </DialogTitle>
        <DialogContent className="dialog-content alert-dialog__body">
          {/* pre-line: multi-line messages (desktop message-box text) keep their breaks. */}
          <DialogContentText sx={{ whiteSpace: 'pre-line' }}>{message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            type="button"
            variant="contained"
            color={severity === 'error' ? 'error' : 'primary'}
            onClick={onDismiss}
            autoFocus
          >
            {buttonLabel}
          </Button>
        </DialogActions>
      </AlertFocus>
    </StyledDialog>
  );
}

export default AlertDialog;

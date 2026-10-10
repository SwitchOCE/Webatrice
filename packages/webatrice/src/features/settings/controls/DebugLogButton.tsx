import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollText } from 'lucide-react';

import { DebugLogDialog } from '@app/dialogs';

import type { CustomControlProps } from '../registry';

export default function DebugLogButton({ id, labelId, describedBy, disabled }: CustomControlProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        id={id}
        type="button"
        className="settings-button"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <ScrollText size={14} aria-hidden />
        {t('SettingsGeneral.debugLog.button')}
      </button>
      <DebugLogDialog isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

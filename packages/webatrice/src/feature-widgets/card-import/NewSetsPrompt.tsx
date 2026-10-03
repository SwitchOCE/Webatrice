import { useTranslation } from 'react-i18next';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';

import type { UnknownSetsAnswer } from './CardDatabaseService';

export type NewSetsChoice = UnknownSetsAnswer | 'view';

export interface NewSetsPromptProps {
  codes: readonly string[];
  onAnswer: (choice: NewSetsChoice) => void;
}

/** Desktop's "New sets found" question (`MainWindow::cardDatabaseNewSetsFound`). */
const NewSetsPrompt = ({ codes, onAnswer }: NewSetsPromptProps) => {
  const { t } = useTranslation();
  if (codes.length === 0) {
    return null;
  }
  return (
    <Alert severity="warning" role="alertdialog" aria-label={t('CardDatabaseOverview.newSets.title')}>
      <strong>{t('CardDatabaseOverview.newSets.title')}</strong>
      <div>{t('CardDatabaseOverview.newSets.text', { count: codes.length, codes: codes.join(', ') })}</div>
      <div className="cardDatabase-actions">
        <Button onClick={() => onAnswer('enable')}>{t('CardDatabaseOverview.newSets.yes')}</Button>
        <Button onClick={() => onAnswer('enable-always')}>{t('CardDatabaseOverview.newSets.yesAlways')}</Button>
        <Button onClick={() => onAnswer('keep-disabled')}>{t('CardDatabaseOverview.newSets.no')}</Button>
        <Button onClick={() => onAnswer('view')}>{t('CardDatabaseOverview.newSets.view')}</Button>
      </div>
    </Alert>
  );
};

export default NewSetsPrompt;

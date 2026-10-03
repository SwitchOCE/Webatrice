import { useTranslation } from 'react-i18next';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

import type { BrowserFeature } from '@app/utils';

import './Unsupported.css';

export interface UnsupportedProps {
  // Required features the preflight found missing; listed so the user knows what
  // to fix (update, leave private browsing, use https://). Omitted when the app
  // routed here after boot (IndexedDB failed to open).
  missing?: BrowserFeature[];
}

// Rendered before the app boots (index.tsx) as well as on the /unsupported route,
// so it needs nothing but i18n: no Redux store, WebClient or page chrome.
const Unsupported = ({ missing = [] }: UnsupportedProps) => {
  const { t } = useTranslation();

  return (
    <div className='Unsupported'>
      <Paper className='Unsupported-paper'>
        <div className='Unsupported-paper__header'>
          <Typography variant="h1">{ t('Unsupported.title') }</Typography>
          <Typography variant="subtitle1">{ t('Unsupported.subtitle1') }</Typography>
        </div>

        {missing.length > 0 && (
          <div className='Unsupported-paper__missing'>
            <Typography variant="body1">{ t('Unsupported.missing') }</Typography>
            <ul>
              {missing.map((feature) => (
                <li key={feature}>{ t(`BrowserFeature.${feature}`) }</li>
              ))}
            </ul>
          </div>
        )}

        <Typography variant="subtitle2">{ t('Unsupported.subtitle2') }</Typography>
      </Paper>
    </div>
  );
};

export default Unsupported;

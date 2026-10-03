import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import { usePushToast } from '@app/components';
import { dexieService } from '@app/services';
import { RouteEnum } from '@app/types';
import { getBrowserSupport } from '@app/utils';

/**
 * Post-boot half of the capability preflight (public/preflight.js gates the boot
 * on the required features). Routes to the unsupported screen when IndexedDB cannot be
 * opened, which only an attempt reveals, and names the optional features this
 * browser lacks once so the user knows why e.g. the copy buttons do nothing.
 */
const FeatureDetection = () => {
  const { t } = useTranslation();
  const pushToast = usePushToast();
  const [unsupported, setUnsupported] = useState(false);
  // StrictMode re-runs mount effects; the notice is shown once per page load.
  const noticeShown = useRef(false);

  useEffect(() => {
    dexieService.testConnection().catch(() => setUnsupported(true));
  }, []);

  useEffect(() => {
    if (noticeShown.current) {
      return;
    }
    noticeShown.current = true;

    const { missingOptional } = getBrowserSupport();
    if (missingOptional.length > 0) {
      const features = missingOptional.map((feature) => t(`BrowserFeature.${feature}`)).join('; ');
      pushToast(t('FeatureDetection.degraded', { features }), { severity: 'warning' });
    }
  }, [t, pushToast]);

  return unsupported
    ? <Navigate to={RouteEnum.UNSUPPORTED} />
    : <></>;
};

export default FeatureDetection;

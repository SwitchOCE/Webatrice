import { getBrowserSupport, isUnsupportedDevice } from './utils/browserSupport';

if (typeof performance.mark === 'function') {
  performance.mark('webatrice:boot-start');
}

if (getBrowserSupport().missingRequired.length === 0 && !isUnsupportedDevice()) {
  void import('./boot');
}

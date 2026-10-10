import { getBrowserSupport } from './utils/browserSupport';

if (getBrowserSupport().missingRequired.length === 0) {
  void import('./boot');
}

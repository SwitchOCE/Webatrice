// Module entry. public/preflight.js (a classic script, run first) has checked
// that this browser can run the client; when it cannot, the preflight already
// shows the unsupported screen and the app below is never downloaded. Keep this
// module free of static imports beyond the preflight result: everything else
// lives behind the dynamic import of ./boot.
import { getBrowserSupport } from './utils/browserSupport';

if (getBrowserSupport().missingRequired.length === 0) {
  void import('./boot');
}

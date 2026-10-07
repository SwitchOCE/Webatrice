// Design preview only: same config, but pre-bundle deps reachable from preview.html.
import base from './vite.config';

export default {
  ...base,
  optimizeDeps: { ...base.optimizeDeps, entries: ['preview.html'] },
  server: { ...base.server, open: false },
};

---
'@cockatrice/sockatrice': minor
'@cockatrice/webatrice': patch
---

Move the vendored protocol and the e2e server to Cockatrice `2026-10-25-Release-3.1.2`. The protocol version stays 14, and older servers keep working through the capability gates.

E2e runs against any server with `SERVATRICE_IMAGE=<image> npm run test:e2e`. Global setup prints the version the server advertises, and specs skip by that version, not by the image name.

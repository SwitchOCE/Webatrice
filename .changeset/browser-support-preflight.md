---
'@cockatrice/webatrice': minor
---

Declare the supported browsers (Chrome/Edge 111, Firefox 114, Safari 16.4 or newer, matching the Vite build target) and check for the APIs the client needs before it boots. A browser without WebSocket, Web Crypto (missing when the page is not served over https://), BigInt, structuredClone, fetch or IndexedDB now gets an "Unsupported Browser" screen naming what is missing, instead of an app that fails at login. When an optional API is missing (Web Workers, BroadcastChannel, ResizeObserver, the clipboard), the app boots and a warning names the features that are degraded.

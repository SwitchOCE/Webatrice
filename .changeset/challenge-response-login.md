---
'@cockatrice/sockatrice': minor
'@cockatrice/datatrice': minor
'@cockatrice/webatrice': minor
---

Support the challenge-response login added in Cockatrice 3.1. Accounts with a scrypt verifier can sign in, including under `authentication_strictness=strict`. Older accounts and older servers keep working.

A saved password is now a verifier or an older hash, never the single-use challenge answer, and a verifier is never sent to the server. New credentials from registration, password change and password reset are stored as verifiers on servers that support them. Sign-in also works on pages without Web Crypto.

The login form now shows messages for a wrong password, for the login limit (with the retry time), and for a saved password that can't be used. The registration limit message names the retry time.

# Task rv6: review PRs 19, 21 and 20 (settings line)
Follow /tmp/notes/tasks/review-template.md. Task id: rv6.
- **19** `origin/parity/19-settings` (parent: `origin/parity/11-rooms-chat-users`), PR file parity-19-settings. Check the settings framework design, the Dexie v6 migration, and each setting against the desktop dialog (`dlg_settings.cpp`) for defaults and labels.
- **21** `origin/parity/21-appearance-i18n-diag` (parent: `origin/parity/19-settings`), PR file parity-21-appearance-i18n-diag.
- **20** `origin/parity/20-card-data` (parent: `origin/parity/21-appearance-i18n-diag`), PR file parity-20-card-data. Check the Dexie v7 migration (data safety for existing users), the card source/set-priority logic against desktop, and network use: no surprise large downloads without consent.

# Setup (run silently; report only failures)

All paths are from the repository root. Run long commands in the background.

## 1. Repository

- Confirm this is a Webatrice checkout: `packages/webatrice/layout-tests/harness.html` exists.
- Find the remote that points at `SwitchOCE/Webatrice` (`git remote -v`). Call it `<upstream>` below; it may be `origin`, `fork` or `upstream`. If none exists, add it as `switchoce`.
- `git fetch <upstream> design/redesign`. New design branches start from `<upstream>/design/redesign`, never from `master`.
- If the working tree has uncommitted changes you didn't make, stop and ask the designer what they are before touching anything.

## 2. Working folder

- Create `.design-feedback/` at the repo root and add the line `.design-feedback/` to `.git/info/exclude` (local only; never edit `.gitignore` for this).
- Each feedback round gets `.design-feedback/<yyyy-mm-dd>-<topic>/` with `input/`, `items/`, `shots/`, `mocks/` and `tracker.md`.
- `.design-feedback/principles.md` persists across rounds.

## 3. Dependencies (first run, or after `package-lock.json` changes)

```bash
npm ci
npx turbo run build --filter='@cockatrice/webatrice^...' --concurrency=1
npx --prefix packages/webatrice playwright install chromium
```

`npm ci` also fetches the protocol submodule and generates code; it needs network. Skip each step whose output already exists and is newer than `package-lock.json`.

## 4. Offline preview server

The app normally needs a game server and a login. The layout harness renders the real app shell from seeded data with no server, which is what you show the designer.

Start it in the background from `packages/webatrice`:

```bash
BROWSER=none node ../../node_modules/vite/bin/vite.js --port 5179 --strictPort --open false
```

(PowerShell: set `$env:BROWSER='none'` first.) The `--open false` and `BROWSER=none` keep it from opening tabs on its own.

Check it serves `http://localhost:5179/layout-tests/harness.html?route=home`. Routes are in [preview.md](preview.md).

If the app has a built-in browser pane (Claude desktop app), also open the harness there so the designer can look around live; it hot-reloads as you edit.

## 5. Failure handling

One retry per step. If it still fails, tell the designer: "I can't start the preview on this machine yet (<one-line reason>). I'll write up your feedback as specs and wireframes for now; Alex can fix the setup." Then continue Steps 1–3 using wireframes only, and mark real-app mocks as pending.

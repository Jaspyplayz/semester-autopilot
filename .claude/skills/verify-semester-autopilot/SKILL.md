---
name: verify-semester-autopilot
description: Launch the Semester Autopilot web app, drive it in a real browser like a student, and capture proof. Use to verify any change to app/ end to end, including syllabus upload, Canvas connect, the deadline table, study plans, Coach and .ics export.
---

# Verify Semester Autopilot

This skill runs the real app, drives it the way a student does, and keeps the evidence. The surface is the web UI in `app/`. There's no database or sign-in: all state lives in the browser.

Run every command from the repo root. Node 24 and Linux or macOS are assumed.

## Launch

```bash
.claude/skills/verify-semester-autopilot/scripts/control.mjs launch
```

This installs dependencies if they're missing, runs `npm run build`, and starts two processes:

- The app, with `next start`, at `http://127.0.0.1:3100`. `CANVAS_ALLOW_PRIVATE_HOSTS=1` lets it reach the mock site, and `ANTHROPIC_API_KEY` is blank so a key in `.env.local` isn't spent.
- Mock Canvas (`app/scripts/mock-canvas.ts`) at `http://127.0.0.1:4110`, serving the three sample courses. The token is `mock-token-not-a-secret`.

It's ready when it prints a line starting `ready app=`. It refuses a port it didn't start. Use `VERIFY_PORT` and `VERIFY_MOCK_PORT` to pick others. Set them on `launch` only: the other commands read the ports from the run file.

One checkout runs one instance, because each build has one `.next`. To run side by side, use another worktree and other ports. Each browser journey gets a new profile, so journeys never share state.

The build is what gets driven. Change `app/src` and you have to run `cleanup` and `launch` again. Doctor fails until you do.

## Doctor

```bash
.claude/skills/verify-semester-autopilot/scripts/control.mjs doctor
```

Run this first, and whenever anything looks off. It only reads. Each line starts `ok` or `FAIL`, and it exits non-zero on any `FAIL`. It checks that:

- Both processes are running, and the port serves Semester Autopilot.
- The build came from the current commit, and nothing in `app/src` is newer than the build.
- Mock Canvas answers, and the app can reach it. A wrong token must get 401.
- No Anthropic key is set in this instance.
- The evidence folder is gitignored.

## Drive

There are two harnesses. Pick by what you changed.

**`drive.mjs` is the browser, and the real user path.** It uses Playwright roles and labels, and needs Chrome. Each journey starts from an empty profile and gets to its feature through the UI.

```bash
.claude/skills/verify-semester-autopilot/scripts/drive.mjs all
.claude/skills/verify-semester-autopilot/scripts/drive.mjs canvas ics
```

The journeys are `upload`, `canvas`, `confirm`, `plan`, `coach` and `ics`. To cover something new, add a step or a journey to `drive.mjs`, and add it to the matching feature file.

It finds Chrome through `channel: "chrome"`. Without Chrome installed, run `npx playwright-core install chromium` in `app/`, then set `CHROME_PATH` to that browser's binary. `npx playwright-core install --dry-run chromium` prints where it goes.

**`prove` is the API.** It wraps `npm run prove` (`app/scripts/prove-e2e.ts`) against this instance.

```bash
.claude/skills/verify-semester-autopilot/scripts/control.mjs prove
```

It starts its own mock Canvas on random ports, and goes from a token to courses, syllabus files and an `.ics`, then does the same from PDF upload. It's the only check of three security rules: another site's page gets 403, a token never reaches the file CDN after a redirect, and a non-numeric course id gets 400. No response may contain the token.

`prove` never opens a browser. It calls the parser and `.ics` builder directly, so a pass doesn't show the UI works. Any change to `app/src/components` needs `drive.mjs`.

The [feature map](features/README.md) lists what each journey covers and what it doesn't. Read the feature's file before driving it.

## Evidence

Everything goes to `app/.e2e-out/`, which is gitignored:

| Path | What it holds |
|---|---|
| `verify/<journey>/journey.log` | One `ok` line per check, then `PASS` or `FAIL` |
| `verify/<journey>/NN-<label>.png` | Full-page screenshot |
| `verify/<journey>/NN-<label>.aria.txt` | Accessibility snapshot of the same state |
| `verify/ics/`, `verify/plan/` | The files the browser actually downloaded |
| `logs/prove.log` | Full `prove` output |
| `canvas-deadlines.ics`, `deadlines.ics`, `deadlines.md` | What `prove` wrote |
| `logs/app.log`, `logs/mock-canvas.log` | Server output. The `canvas` journey checks `app.log` for tokens |

A run replaces that journey's folder. Copy anything you need to keep across runs.

Proof standards:

- Use the real user path. Don't write to `localStorage` or call a lib function to reach a state.
- Capture the action and the result. Paste the `ok` lines into the PR, not just `PASS`.
- Check side effects as well as the screen: read the downloaded file, the stored state, the server log.
- Mock only Canvas, which is the one external system, and only behind the app's real server routes.
- A journey that can't run is a failure, with the reason. Never loosen a check to get a pass, and never report a path as verified through a different one.

## Cleanup

```bash
.claude/skills/verify-semester-autopilot/scripts/control.mjs cleanup
```

This stops the two process groups recorded in `app/.e2e-out/run.json` and deletes that file. It never kills by name or port, and it keeps the evidence. Run it after failed attempts too.

## Helpers

| Script | Commands |
|---|---|
| `scripts/control.mjs` | `launch`, `doctor`, `prove`, `cleanup` |
| `scripts/drive.mjs` | `upload`, `canvas`, `confirm`, `plan`, `coach`, `ics`, `all`. Several names work too |

A full check, start to finish:

```bash
.claude/skills/verify-semester-autopilot/scripts/control.mjs launch
.claude/skills/verify-semester-autopilot/scripts/control.mjs doctor
.claude/skills/verify-semester-autopilot/scripts/control.mjs prove
.claude/skills/verify-semester-autopilot/scripts/drive.mjs all
.claude/skills/verify-semester-autopilot/scripts/control.mjs cleanup
ls app/.e2e-out/verify/*/journey.log app/.e2e-out/logs/prove.log
```

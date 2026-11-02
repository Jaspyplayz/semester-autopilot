# Semester Autopilot verification map

This folder is the maintained source for verifying what a student can do in the web app. Read this page first, then use the matching feature file as the recipe.

## Baseline preconditions

- `control.mjs launch` has printed `ready app=`, and `control.mjs doctor` has no `FAIL` line.
- Never drive an instance this run didn't start.
- The sample school is Maple Hollow University (`examples/sample-university/`). Its three courses are BIO 110, CS 150 and HIS 201, in Fall 2026, in America/Toronto.
- Journeys set Today to Oct 5, 2026, the date `expected-output/deadlines.md` was written for.

## Driving conventions

- Run commands from the repo root. Commands in these files are literal.
- A journey opens a new browser profile and reaches its feature through the UI. Nothing is seeded.
- Handles are roles, labels and `data-testid` values, listed in each file.
- The driver accepts every `window.confirm` and records its text.

## Proof and skip reporting

- A journey passes when it prints `PASS <journey>` and exits 0. Any thrown page error fails it.
- Report the `ok` lines, plus the screenshot and `.aria.txt` paths from `app/.e2e-out/verify/<journey>/`.
- Each file's Gotchas name what the journey doesn't drive. Report those as not verified.

## Feature entry contract

Each feature file has an H1 and one paragraph on what the student sees. Then come four H2 sections, in this order.

1. `Sub-features` lists short IDs with one line each.
2. `How to get to it (user POV)` lists every entry point.
3. `Driving it with drive.mjs` starts with `Preconditions:` and pairs each action with its handle and observable result.
4. `Gotchas` lists traps that can waste or invalidate a run.

## Features

- [Upload or paste a syllabus](./upload.md) covers files, pasted text, samples and the keyless path.
- [Connect Canvas](./canvas.md) covers a token, the course list, import, and where the token goes.
- [Check deadlines](./confirm.md) covers the table you edit and confirm before anything counts.
- [Study plans](./plan.md) covers plans per course, the weekly schedule, editing, rebuilding and downloads.
- [Coach and study mode](./coach.md) covers today, the week's board, the quiz and topic progress.
- [ICS export](./ics.md) covers the calendar file from both ways in, plus markdown and the clipboard.

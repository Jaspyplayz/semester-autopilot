# ICS export

On the Done step, a student downloads a calendar file with one event per dated deadline, plus the table as markdown. The page says how many events there are and which rows it left out.

## Sub-features

- `ics-file` downloads a valid calendar with a real time zone.
- `ics-count` has as many events as the page says.
- `ics-skipped` names the undated rows left out.
- `ics-markdown` downloads `deadlines.md`.
- `ics-clipboard` copies the same markdown.
- `ics-canvas` gives the same result from the Canvas path.
- `ics-prove` builds the `.ics` from the API path, with no browser.

## How to get to it (user POV)

- Click **Confirm deadlines**, then **Confirm plans**. On Done, under **Take it with you**, click **Download .ics**.
- Click **Deadlines and downloads** in Coach.

## Driving it with drive.mjs

Preconditions:

- The baseline in the [README](./README.md).

Run `.claude/skills/verify-semester-autopilot/scripts/drive.mjs ics`. Evidence is in `app/.e2e-out/verify/ics/`.

- **Download.** From the samples, clicks `Download .ics`. `deadlines.ics` is saved.
- **Check the file.** It's a `VCALENDAR` with `BEGIN:VTIMEZONE` and `TZID:America/Toronto`. It has 9 `VEVENT`s, the number the page gives after `The calendar file has`. It holds `DTSTART;TZID=America/Toronto:20261027T090000`, the CS 150 midterm.
- **Left out.** The page's `Left out because they have no date yet:` line names `Final exams`.
- **Markdown.** Clicks `Download deadlines.md`. The file starts `# Deadlines, Fall 2026` and has the row `| Tue Oct 27, 9:00 | CS 150 | Midterm`.
- **Clipboard.** Clicks `Copy as markdown`. A status says `Copied as markdown.`, and the clipboard equals `deadlines.md`.
- **From Canvas.** In a new profile, connects mock Canvas, imports all 3 courses, confirms, and downloads again as `deadlines-from-canvas.ics`. The same checks pass.

The API path is `.claude/skills/verify-semester-autopilot/scripts/control.mjs prove`, which writes `app/.e2e-out/canvas-deadlines.ics` and `app/.e2e-out/deadlines.ics`.

## Gotchas

- **9 here, more in `prove`.** The browser path has exactly 9: 14 rows, less 4 `TBA` lab reports and `December`. Past rows were never confirmed. `prove` parses everything without a date filter, so its file has more, and it only requires at least 10.
- **`prove` builds its `.ics` in the script.** It calls `buildIcs` itself rather than clicking anything. It doesn't show that the Download button works.
- **The `.ics` holds deadlines only.** Calendar events for study blocks aren't built yet (`app/README.md`). Don't expect them.
- **The clipboard needs permission.** The driver grants it. A plain browser may show `This browser blocked copying`, and that's handled behavior, not a bug.
- **Not driven:** importing the file into a real calendar app, `Copy as plain text`, and a calendar with no events, where `Download .ics` is disabled.

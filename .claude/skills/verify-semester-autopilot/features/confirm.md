# Check deadlines

A student checks one table of every deadline, fixes what's wrong and confirms it. Nothing gets planned until then.

## Sub-features

- `confirm-past` hides past rows until asked.
- `confirm-unreadable` blocks confirming on an unreadable date.
- `confirm-normalize` turns a loose date into the table's format.
- `confirm-skip` skips and restores rows.
- `confirm-add` adds a row, which needs a course and a name.
- `confirm-persist` keeps edits across a reload.
- `confirm-carry` carries edits to the confirmed table.

## How to get to it (user POV)

- Click **Read deadlines** after adding syllabuses.
- Click **Get deadlines from N courses** after connecting Canvas.
- Click **Edit deadlines** on the Done step, or **Back to deadlines** on Check plans.

## Driving it with drive.mjs

Preconditions:

- The baseline in the [README](./README.md).

Run `.claude/skills/verify-semester-autopilot/scripts/drive.mjs confirm`. Evidence is in `app/.e2e-out/verify/confirm/`.

- **Past rows.** Clicks `Show 2 already past`. The table gains 2 `data-testid="deadline-row"` rows and the button becomes `Hide 2 already past`.
- **Unreadable date.** Fills the textbox `When: BIO 110 Lab report 1` with `someday soon` and presses Enter. An alert says `Fix the dates in red first.` and `Confirm deadlines` is disabled.
- **Loose date.** Fills the same textbox with `oct 16 11:59pm`. It reads `Fri Oct 16, 23:59`.
- **Skip.** Clicks `Skip BIO 110 Lab report 2`. The line `Skipping:` names it. Clicking `(restore)` brings the row back.
- **Add a row.** Clicks `Add a row`. An alert says `New rows need a course and a name.` Filling the textbox `What: BIO 110` clears the way.
- **Reload.** Reloads the page. The textbox `What: BIO 110 Extra credit quiz` is still there.
- **Carry through.** Clicks `Confirm deadlines` and `Confirm plans`. The Done table has rows for `Fri Oct 16, 23:59 BIO 110 Lab report 1` and `BIO 110 Extra credit quiz`.

## Gotchas

- **Cells save on blur.** Typing doesn't change the table. Press Enter or leave the field, and expect the row to move and remount after that. Locate the cell again, by its new name if you changed What.
- **`TBA` doesn't block.** It's a legal value, and the row stays out of the calendar. Only unreadable text blocks Confirm.
- **Not driven:** the `Not dated` field, and the warning about losing plan edits when deadlines change.

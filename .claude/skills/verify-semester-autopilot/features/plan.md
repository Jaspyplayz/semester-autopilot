# Study plans

After confirming deadlines, a student checks one plan per course and a combined weekly schedule, changes what they like, and downloads them. The same deadlines and settings always give the same plan, with no LLM involved.

## Sub-features

- `plan-build` builds one plan per course from the confirmed deadlines.
- `plan-schedule` shows a weekly schedule that follows edits.
- `plan-edit` edits a block's minutes, and adds and removes blocks.
- `plan-empty` blocks confirming on an empty block.
- `plan-hours` keeps to the daily maximum, after warning about edits.
- `plan-days-off` keeps days off empty.
- `plan-download` downloads a plan and the schedule as markdown.

## How to get to it (user POV)

- Click **Confirm deadlines** on Check deadlines. Check plans opens.
- Click **Make my study plans** or **Edit plans** on Done, or **Edit plans** in Coach.

## Driving it with drive.mjs

Preconditions:

- The baseline in the [README](./README.md).

Run `.claude/skills/verify-semester-autopilot/scripts/drive.mjs plan`. Evidence is in `app/.e2e-out/verify/plan/`.

- **Build.** Loads the samples and confirms. Level-3 headings start with `BIO 110`, `CS 150` and `HIS 201`, and the heading `Your weekly schedule` has `data-testid="schedule-day"` rows.
- **Edit.** Adds 60 to the first spinbutton named `Minutes: ...`. The first schedule day's Total goes up by 1 h.
- **Empty block.** Clicks the first `Add a block`. An alert says `Fill in or remove the empty blocks first.`, and `Confirm plans` is disabled. Removing the block clears it.
- **Daily maximum.** Sets the spinbutton `Most study hours a day` to `3`. A confirm dialog warns `Rebuild your plans?`, and no day's Total is over 3 h.
- **Days off.** Ticks the checkbox `Sat`. Every Saturday's Total is `–`.
- **Download.** Clicks `Confirm plans`, `Download BIO 110 plan` and `Download weekly-schedule.md`. `BIO110-midterm-study-plan.md` starts with `# BIO 110` and has `[ ]` lines. `weekly-schedule.md` names the courses.

## Gotchas

- **Plans differ from `expected-output/BIO110-midterm-study-plan.md`.** That file came from the skill, not the app. The journey checks the shape, not the text.
- **Plans start from Today.** Set it to Oct 5, 2026, or plans for the samples' October tests won't exist.
- **Dates need to be real.** Plans aren't built for `TBA` or month-only rows. The app lists them, and that's correct.
- **The driver accepts confirms.** It checks that the warning text appeared. It doesn't drive the Cancel path.
- **Not driven:** editing block text, "Short on time?", plans of more than 10 study days ("Later"), and the plans-replaced warning from going back to deadlines. `src/lib/planner.test.ts` covers the logic.

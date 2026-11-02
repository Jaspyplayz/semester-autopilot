# Semester Autopilot web app (v0)

Upload your syllabuses, check one table of every test and deadline, then take it with you as `deadlines.md`, an `.ics` file or the clipboard. This is Steps 1 and 2 of the [Semester Autopilot skill](../SKILL.md) as a web app, and it follows the skill's rules: nothing is filled in silently, and nothing counts until you confirm it.

No API key, database or sign-in is needed.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Click **Load sample syllabuses** to try it. The samples are set in early fall, so the app offers to pretend today is Oct 5, 2026, which matches [the example output](../examples/sample-university/expected-output/deadlines.md).

## Test it

```bash
npm test           # unit tests (vitest)
npm run lint
npm run typecheck
npm run build
```

`src/lib/parse.test.ts` parses the three Maple Hollow syllabuses, as both markdown and PDF, and compares the result with `expected-output/deadlines.md`. There are two documented differences:

- **Lab report dates.** The syllabus only says "Due the Friday after each lab". The dates in the expected output came from the student, so the parser leaves them `TBA` and asks. The test applies the student's answers before comparing.
- **Lab report weights.** "Lab reports (4), 20%" becomes `5% (assumed)` each, because the syllabus doesn't say they're equal. The expected output shows plain `5%`.

Items already past on the sample's "today" (BIO Quiz 1, CS Assignment 1) are hidden by default, as they are in the expected output. **Show already past** brings them back.

End-to-end proof (real server, real sample PDFs, through to `.ics`):

```bash
npm run build && npm start            # in one shell
npm run prove                         # in another; BASE_URL defaults to http://localhost:3000
```

`scripts/prove-e2e.ts` uploads the three sample PDFs to `/api/pdf-text`, parses them, checks key dates, builds the `.ics` and writes `deadlines.ics` and `deadlines.md` to `.e2e-out/`.

## Deploy to Vercel

1. Import the repository in Vercel.
2. Set **Root Directory** to `app`. Vercel detects Next.js; no other settings are needed.
3. Optionally add the environment variable below.

This has been run locally with `next build` and `next start`, but not yet on Vercel itself.

## Environment variables

| Name | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | Adds a **Read with Claude instead** button, which uses `/api/extract-llm` with `claude-opus-5-5` and server-side refusal fallbacks. Everything else works without it. |

**Before setting the key on a public site:** there's no auth or rate limiting in v0, so anyone who can open the site can spend it. The route only refuses other sites' pages and input over 100,000 characters. Keep the key off public deployments until auth or rate limiting exists. Using this button also sends the syllabus text to the Anthropic API, and the UI says so.

## What works

- **Input:** upload PDF, `.md` and `.txt` files, paste text, or load the samples. Term and time zone default to Fall 2026 and America/Toronto, and the year comes from the term.
- **Deterministic extraction:** course code and name, each assessment's weight, date, time, room and coverage, from markdown tables and plain lines, including the lines PDF extraction produces. It also handles weight-first lines, separate key-dates lists, several dates on one line, and date windows.
- **Marking:** inferred values get `(assumed)` and missing ones get `TBA`. Weekly and participation items go in the "Not dated" line. Finals in the same month merge into one row, such as "December | All | Final exams | 30-40%".
- **Confirm:** one merged, editable table, soonest first, with the next 7 days in bold, up to 5 "Please check" questions and one closing prompt. You can edit any cell, skip and restore rows, and add rows. Dates can be typed loosely ("oct 16 11:59pm"), and an unreadable date blocks confirming.
- **After confirming:** the confirmed table and "What you confirmed", plus Download `deadlines.md`, Download `.ics` and Copy (markdown or plain text).
- **Calendar file:** one event per dated deadline, with `TZID` and a `VTIMEZONE` built from the zone's real offset changes. It's all-day when there's no time. A due time becomes a 30-minute block ending at the deadline, and a test with only a start time gets a 1-hour block. `TBA` and "December" rows are left out, and the app lists them.
- **Saving:** state is kept in `localStorage` and survives a reload.

## How it's built

**Stack:** Next.js (App Router), TypeScript, Tailwind, vitest. Next was chosen because one Vercel project can hold both the static UI and the small server routes PDF reading and the LLM path need. `unpdf` reads PDFs without native dependencies, so it suits serverless functions.

```
public/samples/         Copies of the sample syllabuses (a test fails if they drift)
src/lib/                Pure logic, unit tested
  dates.ts              Dates, times, terms, the "When" column
  parse.ts              Deterministic syllabus parser
  table.ts              Sorting, bolding, "Please check", "What you confirmed"
  markdown.ts, ics.ts   Exports
  llm.ts                LLM schema, prompt and conversion to rows
  pdf.ts                PDF text extraction
  state.ts              App state, its transitions, and the StateRepository interface
  store.ts              Browser store, saving through localStorage
src/components/         The three steps
src/app/api/            pdf-text, llm-status, extract-llm
```

## Privacy and the skill's hard rules

- It never asks for or stores course site passwords, and doesn't scrape any LMS.
- Nothing personal is stored on the server. There's no database. Syllabus text and deadlines live in the browser's `localStorage`. PDFs are read in memory by `/api/pdf-text` and dropped.

## Adding accounts later

There's no auth in v0. All persistence goes through the `StateRepository` interface in `src/lib/state.ts` (`load`, `save`, `clear`), and `store.ts` is the only code that picks an implementation. To add multi-user support, add sign-in, implement the interface against a per-user backend, and swap it in. The state transitions and parser are pure, so they can move to the server unchanged. Repository methods are synchronous today, so a network backend needs them to become async, with a sync layer in `store.ts`.

## Known gaps and next steps

- **Not built yet:** study plans (Step 3), the weekly schedule and study-block calendar (Step 4), textbooks (Step 5). The app points students to the skill for these.
- **Parser limits:** it's rule-based and tested on the three samples plus hand-written layouts, so expect misses on real syllabuses. Multi-line table cells in PDFs, or tables that lose their row structure in PDF text, are likely trouble spots. The confirm step is the safety net. Testing against real syllabuses is the most useful next step.
- **Coverage assumption:** "Weeks 1-6 (assumed)" counts teaching weeks from an assumed term start (Labour Day week in the fall), and only midterms and tests get it.
- **Input formats:** no Word files, screenshots or OCR. Scanned PDFs get a message asking the student to paste the text.
- **Upload size:** PDFs are limited to 4 MB, because Vercel functions reject bodies over 4.5 MB. Reading PDFs in the browser would remove the limit.
- **LLM extraction:** tested against a local mock of the API, but not yet against the real API, so its extraction quality is unmeasured. It has no evals, no auth and no rate limiting.
- **Other:** no sync between devices, and no re-import of an existing `deadlines.md`. Tests cover `src/lib` only; the UI was checked by hand with a throwaway headless Chrome script that isn't in the repo.

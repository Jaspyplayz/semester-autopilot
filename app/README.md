# Semester Autopilot web app (v0)

Connect Quercus or any Canvas site with an access token, pick your courses and check one table of every test and deadline. Then check a short study plan per course and a combined weekly schedule, and take it all with you as markdown, an `.ics` file or the clipboard. Uploading or pasting a syllabus still works if you'd rather not use a token. This is Steps 1 to 4 of the [Semester Autopilot skill](../SKILL.md) as a web app, minus calendar events for study blocks, and it follows the skill's rules: nothing is filled in silently, and nothing counts until you confirm it.

No Anthropic API key, database or sign-in is needed, for either path.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

### With Quercus or Canvas

1. On your course site, open **Account > Settings > Approved Integrations > + New Access Token**. Give it an expiry date.
2. Paste the token into the app. The course site defaults to `https://q.utoronto.ca`; change it for any other Canvas site.
3. Click **Connect**, tick your courses and click **Get deadlines**.

To try this without a real token, run a mock Canvas site in a second shell:

```bash
CANVAS_ALLOW_PRIVATE_HOSTS=1 npm run dev    # the app has to be allowed to reach a local address
npm run mock-canvas                         # prints the course site and token to paste
npm run mock-canvas -- ../some/folder       # your own PDFs: one course per subfolder, or per PDF if flat
```

### Without a token

Open **No token? Upload or paste a syllabus instead** and click **Load sample syllabuses**. The samples are set in early fall, so the app offers to pretend today is Oct 5, 2026, which matches [the example output](../examples/sample-university/expected-output/deadlines.md).

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
npm run build && CANVAS_ALLOW_PRIVATE_HOSTS=1 npm start   # in one shell
npm run prove                                             # in another; BASE_URL defaults to http://localhost:3000
```

`scripts/prove-e2e.ts` starts a mock Canvas site and goes from a token through courses and syllabus files to an `.ics`, checking that a bad token is refused, that the token never appears in a response, and that it doesn't follow a file redirect to another origin. It then uploads the three sample PDFs to `/api/pdf-text`, parses them, checks key dates and builds the `.ics`. Output goes to `.e2e-out/`.

## Deploy to Vercel

1. Import the repository in Vercel.
2. Set **Root Directory** to `app`. Vercel detects Next.js; no other settings are needed.
3. No environment variables are needed, including for the Quercus and Canvas path.

This has been run locally with `next build` and `next start`, but not yet on Vercel itself.

## Environment variables

| Name | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | Adds a **Read with Claude instead** button, which uses `/api/extract-llm` with `claude-opus-5-5` and server-side refusal fallbacks. Everything else, including the Quercus and Canvas path, works without it. |
| `CANVAS_ALLOW_PRIVATE_HOSTS` | No | Local testing only, and ignored on Vercel. `1` lets the app reach `http://` and private addresses, for the mock Canvas site. |

**Before setting the key on a public site:** there's no auth or rate limiting in v0, so anyone who can open the site can spend it. The route only refuses other sites' pages and input over 100,000 characters. Keep the key off public deployments until auth or rate limiting exists. Using this button also sends the syllabus text to the Anthropic API, and the UI says so.

## What works

- **Quercus and Canvas:** a token and a course site address list your active courses. For each one you pick, the app reads the syllabus page, the files it links to that look like a syllabus, and otherwise files or module items named "syllabus" or "outline" (up to 3 files per course). Anything it can't use, such as a Word file or a scan, is listed above the table. It adopts the course site's term when your courses agree on one. Canvas requests are GET only.
- **Fallback input:** upload PDF, `.md` and `.txt` files, paste text, or load the samples. Term and time zone default to Fall 2026 and America/Toronto, and the year comes from the term.
- **Deterministic extraction:** course code and name, each assessment's weight, date, time, room and coverage, from markdown tables and plain lines, including the lines PDF extraction produces. It also handles weight-first lines, separate key-dates lists, several dates on one line, and date windows.
- **Marking:** inferred values get `(assumed)` and missing ones get `TBA`. Weekly and participation items go in the "Not dated" line. Finals in the same month merge into one row, such as "December | All | Final exams | 30-40%".
- **Confirm:** one merged, editable table, soonest first, with the next 7 days in bold, up to 5 "Please check" questions and one closing prompt. You can edit any cell, skip and restore rows, and add rows. Dates can be typed loosely ("oct 16 11:59pm"), and an unreadable date blocks confirming.
- **Study plans:** after you confirm the table, the app builds one plan per course for its next test, or its next piece of work if no test is dated. No LLM or key is involved: the same deadlines and settings always give the same plan. It's a phone-screen checklist in the format in [`references/study-plan-template.md`](../references/study-plan-template.md), and the rules are in [`docs/study-methods.md`](../docs/study-methods.md): learn a topic, then recall it on later days with growing gaps, a mini mock about a third of the way in, a final pass 2-3 days out, a timed mock on the last study day, then light review and sleep. Problem courses mix topics when recalling. Topic names and readings come from the syllabus when it has a unit or week table. Anything guessed is listed under "Assumed".
- **Fitting courses together:** a daily maximum (6 hours unless you change it) and days off are always respected. The day before a bigger test belongs to that course, the day of and after a big test stay light, and a course whose test is a week or more after a closer big test waits for it, apart from anything due on the way.
- **Check plans:** edit any block's text or minutes, add or remove blocks, edit "Short on time?", or rebuild. Plans with TBA or month-only dates aren't made, and the app says why. If you go back and change a deadline, it warns before replacing edited plans; if nothing changed, your edits stay. Plans of more than 10 study days show the next 7 in full and sum up the rest, and you rebuild later to see those days.
- **Weekly schedule:** hours per course per day, deadlines as fixed events, overloaded days and what to cut first, one table per week. It's always worked out from the plans, so your edits show up in it.
- **After confirming:** the confirmed table and "What you confirmed", plus Download `deadlines.md`, Download `.ics`, Copy (markdown or plain text), one Download per course plan (`BIO110-midterm-study-plan.md`) and Download `weekly-schedule.md`.
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
  planner.ts            Deterministic study plans from the confirmed deadlines, and editing them
  topics.ts             The Covers cell and syllabus topic lists, turned into topics
  schedule.ts           The weekly schedule, derived from the plans
  markdown.ts, ics.ts   Exports
  canvas.ts             Canvas client: courses, finding and reading syllabuses. Network passed in
  canvas-http.ts        The server's only way to reach a course site, with the SSRF and token rules
  canvas-route.ts       What the /api/canvas routes share
  canvas-session.ts     The token, in this tab's sessionStorage
  canvas-url.ts         Cleaning up the course site address
  html-text.ts          Syllabus page HTML to parser text, and its file links
  llm.ts                LLM schema, prompt and conversion to rows
  pdf.ts                PDF text extraction
  state.ts              App state, its transitions, and the StateRepository interface
  store.ts              Browser store, saving through localStorage
src/components/         The four steps
src/app/api/            pdf-text, llm-status, extract-llm, canvas/courses, canvas/syllabus
scripts/                prove-e2e.ts, mock-canvas.ts
```

Canvas calls go through the server because Canvas doesn't allow API calls with a token from other sites' pages.

## Privacy and the skill's hard rules

- It never asks for or stores course site passwords. There's no OAuth: the student makes a personal access token, which can do anything their account can, so the UI says to set an expiry and delete it afterward.
- The token is kept in that tab's `sessionStorage`, never in the saved app state. **Forget token** and **Start over** clear it. It reaches this app's server in a POST body for each Canvas request and is used for that request only, and nothing logs it or returns it.
- The course site address comes from the user, so the server only connects to public `https` hosts. It checks DNS answers at connect time and on every redirect, and it sends the token only to the origin the student named.
- Nothing personal is stored on the server. There's no database. Syllabus text, deadlines and plans live in the browser's `localStorage`. PDFs are read in memory and dropped. Plans are built in the browser and never leave it.

## Adding accounts later

There's no auth in v0. All persistence goes through the `StateRepository` interface in `src/lib/state.ts` (`load`, `save`, `clear`), and `store.ts` is the only code that picks an implementation. To add multi-user support, add sign-in, implement the interface against a per-user backend, and swap it in. The state transitions and parser are pure, so they can move to the server unchanged. Repository methods are synchronous today, so a network backend needs them to become async, with a sync layer in `store.ts`.

## Known gaps and next steps

- **Not built yet:** calendar events for study blocks (Step 4) and textbooks (Step 5). The `.ics` file still holds deadlines only.
- **Plan limits:** blocks point at what the syllabus lists, not at exact pages or files, and syllabus topic tables are only read from markdown-style text, so PDFs and course site pages get generic "Unit 3 slides and notes" pointers. Whether a course is problem-based is a guess from its code and name. Hours per percent of a grade are rough estimates tuned to the sample plan. Plans don't know your class times or bedtime, so blocks have lengths and not clock times. You can't move a block to another day yet, or edit the Details section.
- **Not tried on a live course yet:** the Canvas path has been tested against the mock site, and real Canvas sites have only been probed with a fake token. Real syllabus pages and course setups will turn up cases the mock doesn't have.
- **Canvas sources:** it reads syllabuses only, not the Assignments API, which would give exact due dates and is the obvious next step. It can't see a syllabus that's on a Canvas Page, or in a module too large for Canvas to list inline. Those courses get a "no syllabus found" note.
- **Parser limits:** it's rule-based and tested on the three samples plus hand-written layouts, so expect misses on real syllabuses. Four real UofT syllabus PDFs gave 0 rows for one course, mostly `TBA` dates for two, and some junk rows, so a Canvas import often needs real editing at the confirm step. Multi-line table cells in PDFs, or tables that lose their row structure in PDF text, are likely trouble spots. The confirm step is the safety net. Testing against real syllabuses is the most useful next step.
- **Coverage assumption:** "Weeks 1-6 (assumed)" counts teaching weeks from an assumed term start (Labour Day week in the fall), and only midterms and tests get it.
- **Input formats:** no Word files, screenshots or OCR. Scanned PDFs get a message asking the student to paste the text.
- **Upload size:** PDFs are limited to 4 MB, because Vercel functions reject bodies over 4.5 MB. Reading PDFs in the browser would remove the limit.
- **LLM extraction:** tested against a local mock of the API, but not yet against the real API, so its extraction quality is unmeasured. It has no evals, no auth and no rate limiting.
- **Other:** no sync between devices, and no re-import of an existing `deadlines.md`. No rate limiting on the Canvas routes. Tests cover `src/lib` only; the UI was checked by hand with a throwaway headless Chrome script that isn't in the repo.

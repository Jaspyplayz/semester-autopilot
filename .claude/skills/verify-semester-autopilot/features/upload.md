# Upload or paste a syllabus

A student without a token adds syllabuses as files or pasted text, or loads the samples, and gets the same deadline table the Canvas path gives.

## Sub-features

- `upload-files` reads PDF and `.md` files into Your syllabuses.
- `upload-refuse` refuses other file types with a message.
- `upload-remove` takes a syllabus off the list.
- `upload-paste` adds pasted text as a source.
- `upload-samples` loads the three samples and offers to pretend today is Oct 5, 2026.
- `upload-keyless` reads with the built-in rules, with Claude's button hidden.

## How to get to it (user POV)

- Open `/`, open **No token? Upload or paste a syllabus instead**, then use **Upload files**.
- In the same section, fill **Or paste a course outline** and click **Add pasted text**.
- In the same section, click **Load sample syllabuses**.

## Driving it with drive.mjs

Preconditions:

- The baseline in the [README](./README.md).

Run `.claude/skills/verify-semester-autopilot/scripts/drive.mjs upload`. Evidence is in `app/.e2e-out/verify/upload/`.

- **Upload files.** Sets `BIO110-syllabus.pdf`, `CS150-syllabus.pdf` and `src/CS150-syllabus.md` on the label `Upload files`. Buttons named `Remove BIO110-syllabus.pdf` and `Remove CS150-syllabus.md` appear.
- **Remove.** Clicks `Remove CS150-syllabus.pdf`. That button goes away.
- **Refuse.** Uploads `notes.docx`. An alert says `only PDF, .md and .txt files work here`.
- **Paste.** Fills the label `Or paste a course outline` with the HIS 201 text and clicks `Add pasted text`. A button named `Remove Pasted text 1` appears.
- **No key.** Sets the label `Today` to `2026-10-05`. No button is named `Read with Claude instead`, and `POST /api/extract-llm` gives 501.
- **Read.** Clicks `Read deadlines`. The heading `Deadlines, Fall 2026` appears, and every row of `expected-output/deadlines.md` is in `data-testid="deadline-row"` with the same date. Lab reports are the exception and show `TBA`. The heading `Please check` appears.
- **Samples.** In a new profile, clicks `Load sample syllabuses` and `Pretend today is Oct 5, 2026`, then reads. The same comparison passes. `03-table-from-samples.png` shows it.

## Gotchas

- **The real date matters.** Past rows are hidden, so without setting Today the table shrinks as the term goes on and the comparison fails. Set Today first.
- **Lab report dates are `TBA` on purpose.** The syllabus only says "Due the Friday after each lab". The expected output got those dates from the student.
- **`getByRole("alert")` alone always matches.** Next's route announcer has that role. Filter by text.
- **Needs a key, so not driven:** `Read with Claude instead`, which needs `ANTHROPIC_API_KEY`. `launch` blanks it on purpose, and this journey asserts the keyless state. Report the Claude path as not verified. It's also never been run against the real API (`app/README.md`).
- **Not driven:** a PDF over 4 MB (413), and a scanned PDF (422). `src/lib/pdf.ts` and `/api/pdf-text` return those messages, but no sample file triggers them.

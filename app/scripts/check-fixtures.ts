// Proves the parser against the sample school: every syllabus, as markdown and
// as PDF, goes through the app's own path (parse, draft, confirm, render) and the
// resulting deadlines.md must match expected-output/deadlines.md exactly.
// Usage: npm run check-fixtures [-- --expected path/to/deadlines.md]
// Also runs in `npm test`, from src/lib/check-fixtures.test.ts.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { createPatch } from "diff";
import { deadlinesMarkdown } from "../src/lib/markdown";
import { parseSyllabuses } from "../src/lib/parse";
import { extractPdfText } from "../src/lib/pdf";
import { confirmDraft, defaultState, startDraft } from "../src/lib/state";
import { sortRows, termOf } from "../src/lib/table";
import { REPO_ROOT, SAMPLE_DIR, applySampleAnswers } from "../src/lib/test-helpers";

const SYLLABUSES = join(SAMPLE_DIR, "syllabuses");
const EXPECTED = join(SAMPLE_DIR, "expected-output/deadlines.md");
// The sample README says "Pretend today is Monday, October 5, 2026".
const TODAY = "2026-10-05";

type Source = { name: string; text: string };

function filesIn(dir: string, extension: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(extension))
    .sort();
}

function markdownSources(): Source[] {
  const dir = join(SYLLABUSES, "src");
  return filesIn(dir, ".md").map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
}

function pdfSources(): Promise<Source[]> {
  return Promise.all(
    filesIn(SYLLABUSES, ".pdf").map(async (name) => {
      const bytes = new Uint8Array(readFileSync(join(SYLLABUSES, name)));
      return { name, text: (await extractPdfText(bytes)).text };
    }),
  );
}

/** deadlines.md for these syllabuses, once the student has answered and confirmed. */
function renderDeadlines(sources: Source[]): string {
  const state = defaultState();
  const drafted = startDraft(state, parseSyllabuses(sources, { term: state.term }), "rules");
  const answered = { ...drafted, draft: { ...drafted.draft!, rows: applySampleAnswers(drafted.draft!.rows) } };
  const { confirmed } = confirmDraft(answered, TODAY);
  const term = termOf(state.term, TODAY);
  return deadlinesMarkdown({
    rows: sortRows(confirmed!.rows, term),
    undated: confirmed!.undated,
    confirmedNotes: confirmed!.notes,
    term,
    timezone: state.timezone,
    confirmedOn: confirmed!.confirmedOn,
  });
}

export interface FixtureResult {
  label: string;
  /** Unified diff from expected to actual, empty if they match. */
  diff: string;
}

export async function checkFixtures(expectedPath: string = EXPECTED): Promise<FixtureResult[]> {
  const expected = readFileSync(expectedPath, "utf8");
  const shownPath = expectedPath === EXPECTED ? relative(REPO_ROOT, EXPECTED) : expectedPath;
  const runs: Array<[string, Source[]]> = [
    ["markdown", markdownSources()],
    ["pdf", await pdfSources()],
  ];
  return runs.map(([kind, sources]) => {
    const actual = renderDeadlines(sources);
    return {
      label: `${kind} (${sources.length} syllabuses)`,
      diff: actual === expected ? "" : createPatch(shownPath, expected, actual, "expected", `parsed from ${kind}`),
    };
  });
}

/** Prints each result. True if everything matched. */
function report(results: FixtureResult[]): boolean {
  for (const { label, diff } of results) {
    console.log(`${diff ? "FAIL" : "ok  "} ${label}`);
    if (diff) console.log(diff);
  }
  return results.every((r) => !r.diff);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = process.argv.indexOf("--expected");
  if (flag !== -1 && !process.argv[flag + 1]) {
    console.error("--expected needs a path");
    process.exit(2);
  }
  checkFixtures(flag === -1 ? undefined : process.argv[flag + 1]).then(
    (results) => {
      process.exit(report(results) ? 0 : 1);
    },
    (err) => {
      console.error(err);
      process.exit(2);
    },
  );
}

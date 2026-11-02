// Proves the parser against every fixture: each examples/*/ with syllabuses goes
// through the app's own path (parse, draft, confirm, render), as markdown
// (syllabuses/src/*.md) and as PDF (syllabuses/*.pdf), and the resulting
// deadlines.md must match that fixture's expected-output/deadlines.md exactly.
// Usage: npm run check-fixtures [-- --expected path/to/deadlines.md]
// --expected checks only the sample school, against that file instead of its own.
// Also runs in `npm test`, from src/lib/check-fixtures.test.ts.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createPatch } from "diff";
import { deadlinesMarkdown } from "../src/lib/markdown";
import { parseSyllabuses } from "../src/lib/parse";
import { extractPdfText } from "../src/lib/pdf";
import { confirmDraft, defaultState, startDraft } from "../src/lib/state";
import { sortRows, termOf } from "../src/lib/table";
import { REPO_ROOT, SAMPLE_DIR, applySampleAnswers } from "../src/lib/test-helpers";
import type { Deadline } from "../src/lib/types";

const EXAMPLES = join(REPO_ROOT, "examples");
// The sample README says "Pretend today is Monday, October 5, 2026". Every fixture
// shares this date and the app's default term.
const TODAY = "2026-10-05";

type Source = { name: string; text: string };

function filesIn(dir: string, extension: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(extension))
    .sort();
}

function markdownSources(syllabuses: string): Source[] {
  const dir = join(syllabuses, "src");
  return filesIn(dir, ".md").map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
}

function pdfSources(syllabuses: string): Promise<Source[]> {
  return Promise.all(
    filesIn(syllabuses, ".pdf").map(async (name) => {
      const bytes = new Uint8Array(readFileSync(join(syllabuses, name)));
      return { name, text: (await extractPdfText(bytes)).text };
    }),
  );
}

/** deadlines.md for these syllabuses, once the student has answered and confirmed. */
function renderDeadlines(sources: Source[], answer: (rows: Deadline[]) => Deadline[]): string {
  const state = defaultState();
  const drafted = startDraft(state, parseSyllabuses(sources, { term: state.term }), "rules");
  const answered = { ...drafted, draft: { ...drafted.draft!, rows: answer(drafted.draft!.rows) } };
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
  /** Unified diff from expected to actual, or why the fixture can't be checked. Empty if it matches. */
  problem: string;
}

/** One result per syllabus format the fixture has. */
export async function checkFixture(
  dir: string,
  expectedPath: string = join(dir, "expected-output/deadlines.md"),
): Promise<FixtureResult[]> {
  const fixture = basename(dir);
  const shownPath = expectedPath.startsWith(REPO_ROOT) ? relative(REPO_ROOT, expectedPath) : expectedPath;
  if (!existsSync(expectedPath)) return [{ label: fixture, problem: `no expected output: ${shownPath} is missing` }];
  const expected = readFileSync(expectedPath, "utf8");
  // The sample README's answers are about the sample's own rows.
  const answer = dir === SAMPLE_DIR ? applySampleAnswers : (rows: Deadline[]) => rows;
  const syllabuses = join(dir, "syllabuses");
  const kinds: Array<[string, () => Source[] | Promise<Source[]>]> = [
    ["markdown", () => markdownSources(syllabuses)],
    ["pdf", () => pdfSources(syllabuses)],
  ];
  const results: FixtureResult[] = [];
  for (const [kind, read] of kinds) {
    try {
      const sources = await read();
      if (sources.length === 0) continue;
      const actual = renderDeadlines(sources, answer);
      results.push({
        label: `${fixture} ${kind} (${sources.length} syllabuses)`,
        problem: actual === expected ? "" : createPatch(shownPath, expected, actual, "expected", `parsed from ${kind}`),
      });
    } catch (err) {
      results.push({ label: `${fixture} ${kind}`, problem: String(err) });
    }
  }
  if (results.length > 0) return results;
  return [{ label: fixture, problem: "no syllabuses: looked for syllabuses/src/*.md and syllabuses/*.pdf" }];
}

// Every dir in examples/ with a syllabuses/ or expected-output/ dir is a fixture, and must have both.
export async function checkFixtures(examplesDir: string = EXAMPLES): Promise<FixtureResult[]> {
  const fixtures = readdirSync(examplesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(examplesDir, e.name))
    .filter((dir) => existsSync(join(dir, "syllabuses")) || existsSync(join(dir, "expected-output")))
    .sort();
  if (fixtures.length === 0) return [{ label: examplesDir, problem: "no fixtures found" }];
  return (await Promise.all(fixtures.map((dir) => checkFixture(dir)))).flat();
}

/** Prints each result. True if everything matched. */
function report(results: FixtureResult[]): boolean {
  for (const { label, problem } of results) {
    console.log(`${problem ? "FAIL" : "ok  "} ${label}`);
    if (problem) console.log(problem);
  }
  return results.every((r) => !r.problem);
}

/** The --expected path, if given. Throws on anything else, so a typo can't check the wrong file. */
export function parseCliArgs(args: string[]): string | undefined {
  return parseArgs({ args, options: { expected: { type: "string" } } }).values.expected;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let expected: string | undefined;
  try {
    expected = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${(err as Error).message}\nUsage: npm run check-fixtures [-- --expected path/to/deadlines.md]`);
    process.exit(2);
  }
  (expected === undefined ? checkFixtures() : checkFixture(SAMPLE_DIR, expected)).then(
    (results) => {
      process.exit(report(results) ? 0 : 1);
    },
    (err) => {
      console.error(err);
      process.exit(2);
    },
  );
}

// Proves syllabus PDF -> deadlines -> .ics against a running server.
// Usage: npm run build && npm start (in another shell), then
//   BASE_URL=http://localhost:3000 npx tsx scripts/prove-e2e.ts
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseSyllabuses } from "../src/lib/parse";
import { parseTerm } from "../src/lib/dates";
import { buildIcs } from "../src/lib/ics";
import { deadlinesMarkdown } from "../src/lib/markdown";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PDF_DIR = join(__dirname, "../../examples/sample-university/syllabuses");
const OUT = join(__dirname, "../.e2e-out");

function assert(ok: unknown, msg: string): void {
  if (!ok) throw new Error(`FAIL: ${msg}`);
  console.log(`ok   ${msg}`);
}

async function main() {
  const home = await fetch(BASE);
  assert(home.status === 200, `GET / returns 200`);

  const pdfs = readdirSync(PDF_DIR).filter((f) => f.endsWith(".pdf")).sort();
  assert(pdfs.length === 3, `found 3 sample PDFs (${pdfs.join(", ")})`);

  const sources: Array<{ name: string; text: string }> = [];
  for (const name of pdfs) {
    const form = new FormData();
    form.append("file", new Blob([readFileSync(join(PDF_DIR, name))], { type: "application/pdf" }), name);
    const res = await fetch(`${BASE}/api/pdf-text`, { method: "POST", body: form });
    const body = (await res.json()) as { text?: string; error?: string };
    assert(res.status === 200 && body.text, `POST /api/pdf-text ${name} -> 200 with text (${body.text?.length ?? 0} chars)`);
    sources.push({ name, text: body.text! });
  }

  const term = parseTerm("Fall 2026", 2026);
  const ex = parseSyllabuses(sources, { term: "Fall 2026" });
  const codes = ex.courses.map((c) => c.code).sort();
  assert(codes.join(",") === "BIO 110,CS 150,HIS 201", `parsed 3 courses: ${codes.join(", ")}`);

  const find = (course: string, what: RegExp) => ex.rows.find((r) => r.course === course && what.test(r.what));
  const checks: Array<[string, RegExp, RegExp]> = [
    ["BIO 110", /Midterm/, /Oct 15/],
    ["CS 150", /Midterm/, /Oct 27/],
    ["CS 150", /Assignment 2/, /Oct 16/],
    ["HIS 201", /Research essay/i, /Nov 24/],
  ];
  for (const [course, what, when] of checks) {
    const r = find(course, what);
    assert(r && when.test(r.when), `${course} ${what.source} on ${when.source} (got "${r?.when}")`);
  }

  const { ics, eventCount, skipped } = buildIcs(ex.rows, { term, timezone: "America/Toronto" });
  assert(ics.startsWith("BEGIN:VCALENDAR") && ics.trimEnd().endsWith("END:VCALENDAR"), `.ics is a VCALENDAR`);
  assert(ics.includes("BEGIN:VTIMEZONE") && ics.includes("TZID:America/Toronto"), `.ics carries America/Toronto VTIMEZONE`);
  assert(eventCount >= 10, `.ics has ${eventCount} events (${skipped.length} undated/TBA rows skipped)`);
  assert((ics.match(/BEGIN:VEVENT/g) ?? []).length === eventCount, `VEVENT count matches eventCount`);

  const md = deadlinesMarkdown({ rows: ex.rows, undated: ex.undated, confirmedNotes: [], term, timezone: "America/Toronto", confirmedOn: "2026-10-05" });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "deadlines.ics"), ics);
  writeFileSync(join(OUT, "deadlines.md"), md);
  console.log(`\nWrote ${OUT}/deadlines.ics and deadlines.md`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

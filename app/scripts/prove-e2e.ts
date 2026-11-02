// Proves both ways in against a running server: a mock Canvas site -> courses ->
// syllabus -> deadlines -> .ics (the main path), and PDF upload -> deadlines ->
// .ics (the fallback).
// Usage: npm run build && CANVAS_ALLOW_PRIVATE_HOSTS=1 npm start (in another shell), then
//   BASE_URL=http://localhost:3000 npx tsx scripts/prove-e2e.ts
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseSyllabuses } from "../src/lib/parse";
import { parseTerm } from "../src/lib/dates";
import { buildIcs } from "../src/lib/ics";
import { deadlinesMarkdown } from "../src/lib/markdown";
import { MOCK_TOKEN, coursesFromFolder, startMockCanvas } from "./mock-canvas";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PDF_DIR = join(__dirname, "../../examples/sample-university/syllabuses");
const OUT = join(__dirname, "../.e2e-out");

function assert(ok: unknown, msg: string): void {
  if (!ok) throw new Error(`FAIL: ${msg}`);
  console.log(`ok   ${msg}`);
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) };
}

async function proveCanvas() {
  const courses = coursesFromFolder(PDF_DIR);
  const mock = await startMockCanvas(courses);
  try {
    const conn = { baseUrl: mock.url, token: MOCK_TOKEN };

    const bad = await post("/api/canvas/courses", { baseUrl: mock.url, token: "wrong-token" });
    if (bad.status === 400 || bad.status === 504) {
      throw new Error(`FAIL: the server refused the mock Canvas site. Start it with CANVAS_ALLOW_PRIVATE_HOSTS=1. (${bad.text})`);
    }
    assert(bad.status === 401, `a wrong token gets 401 (${bad.status})`);
    assert(!bad.text.includes("wrong-token"), `the 401 doesn't echo the token`);

    const crossSite = await post("/api/canvas/courses", conn, { Origin: "https://evil.example" });
    assert(crossSite.status === 403, `another site's page gets 403 (${crossSite.status})`);

    const listed = await post("/api/canvas/courses", conn);
    assert(listed.status === 200, `POST /api/canvas/courses -> 200`);
    assert(listed.json.courses.length === 3, `followed pagination to all 3 courses`);
    assert(!listed.text.includes(MOCK_TOKEN), `the course list doesn't contain the token`);

    const sources: Array<{ name: string; text: string; course?: { code: string; name: string } }> = [];
    for (const course of listed.json.courses) {
      const got = await post("/api/canvas/syllabus", { ...conn, courseId: course.id });
      assert(got.status === 200 && got.json.sources.length === 1, `POST /api/canvas/syllabus ${course.code} -> one source`);
      assert(!got.text.includes(MOCK_TOKEN), `the ${course.code} syllabus response doesn't contain the token`);
      sources.push(...got.json.sources);
    }
    assert(mock.leakedToCdn.length === 0, `no token reached the file CDN's origin after the redirect`);

    const refused = await post("/api/canvas/syllabus", { ...conn, courseId: "../../users/self" });
    assert(refused.status === 400, `a course id that isn't a number gets 400`);

    const ex = parseSyllabuses(sources, { term: "Fall 2026" });
    const midterm = ex.rows.find((r) => r.course === "CS 150" && /Midterm/.test(r.what));
    assert(midterm && /Oct 27/.test(midterm.when), `CS 150 midterm on Oct 27 (got "${midterm?.when}")`);

    const term = parseTerm("Fall 2026", 2026);
    const { ics, eventCount } = buildIcs(ex.rows, { term, timezone: "America/Toronto" });
    assert(ics.startsWith("BEGIN:VCALENDAR") && eventCount >= 10, `Canvas path makes an .ics with ${eventCount} events`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "canvas-deadlines.ics"), ics);
  } finally {
    mock.close();
  }
}

async function main() {
  const home = await fetch(BASE);
  assert(home.status === 200, `GET / returns 200`);

  console.log("\nCanvas path");
  await proveCanvas();
  console.log("\nUpload path");

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
  console.log(`\nWrote ${OUT}/canvas-deadlines.ics, deadlines.ics and deadlines.md`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

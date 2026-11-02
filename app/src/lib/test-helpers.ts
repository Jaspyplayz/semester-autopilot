// Test-only helpers for reading the sample school from the repo.
import { readFileSync } from "node:fs";
import path from "node:path";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
export const SAMPLE_DIR = path.join(REPO_ROOT, "examples/sample-university");
export const SAMPLE_COURSES = ["BIO110", "CS150", "HIS201"] as const;

export function sampleMarkdown(course: string): string {
  return readFileSync(path.join(SAMPLE_DIR, "syllabuses/src", `${course}-syllabus.md`), "utf8");
}

export function samplePdf(course: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(SAMPLE_DIR, "syllabuses", `${course}-syllabus.pdf`)));
}

export function expectedDeadlines(): string {
  return readFileSync(path.join(SAMPLE_DIR, "expected-output/deadlines.md"), "utf8");
}

/** Table rows of a deadlines.md as arrays of cells (header and separator dropped). */
export function tableRows(md: string): string[][] {
  return md
    .split("\n")
    .filter((l) => l.startsWith("|"))
    .slice(2)
    .map((l) =>
      l
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim()),
    );
}

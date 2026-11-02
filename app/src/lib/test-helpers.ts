// Test and script helpers for reading the sample school from the repo.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Deadline } from "./types";

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

/**
 * What the student answers in the sample README: "HIS coverage, not sure, keep
 * it assumed. Lab reports are due Oct 16, Oct 30, Nov 13 and Nov 27."
 */
export function applySampleAnswers(rows: Deadline[]): Deadline[] {
  const labDates = ["Fri Oct 16, 23:59", "Fri Oct 30, 23:59", "Fri Nov 13, 23:59", "Fri Nov 27, 23:59"];
  return rows.map((r) => {
    const m = r.what.match(/^Lab report (\d)$/);
    return m ? { ...r, when: labDates[Number(m[1]) - 1] } : r;
  });
}

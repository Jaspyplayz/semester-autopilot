import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLE_COURSES, sampleMarkdown } from "./test-helpers";

describe("public/samples", () => {
  it.each(SAMPLE_COURSES)("%s matches its original in examples/", (course) => {
    const copy = readFileSync(path.resolve(import.meta.dirname, `../../public/samples/${course}-syllabus.md`), "utf8");
    expect(copy).toBe(sampleMarkdown(course));
  });
});

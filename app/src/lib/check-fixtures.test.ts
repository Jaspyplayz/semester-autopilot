import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkFixture, checkFixtures, parseCliArgs } from "../../scripts/check-fixtures";
import { SAMPLE_DIR, expectedDeadlines } from "./test-helpers";

describe("check-fixtures", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "check-fixtures-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function addFile(relativePath: string, text: string) {
    const file = path.join(dir, relativePath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }

  it("every syllabus in examples/ renders exactly its expected-output/deadlines.md", async () => {
    const results = await checkFixtures();
    // The sample school must keep both formats, or a format could silently drop out.
    expect(results.map((r) => r.label)).toEqual(
      expect.arrayContaining(["sample-university markdown (3 syllabuses)", "sample-university pdf (3 syllabuses)"]),
    );
    // On failure this prints the unified diff.
    expect(results.map((r) => r.problem).join("")).toBe("");
  });

  it("fails with a unified diff when one expected line is wrong", async () => {
    const corrupted = path.join(dir, "deadlines.md");
    const good = "| Tue Oct 13, 13:00 | HIS 201 | Essay proposal | 10% | 500 words |";
    expect(expectedDeadlines()).toContain(good);
    writeFileSync(corrupted, expectedDeadlines().replace(good, good.replace("10%", "15%")));

    const results = await checkFixture(SAMPLE_DIR, corrupted);
    expect(results).toHaveLength(2);
    for (const { problem } of results) {
      expect(problem).toContain("@@");
      expect(problem).toContain(`-${good.replace("10%", "15%")}`);
      expect(problem).toContain(`+${good}`);
    }
  });

  it("discovers a new examples/ fixture and fails it on a mismatch", async () => {
    addFile("d2l-test/syllabuses/src/garbage.md", "not a syllabus\n");
    addFile("d2l-test/expected-output/deadlines.md", "garbage\n");

    const results = await checkFixtures(dir);
    expect(results.map((r) => r.label)).toEqual(["d2l-test markdown (1 syllabuses)"]);
    expect(results[0].problem).toContain("-garbage");
  });

  it("fails an unreadable PDF rather than skipping it", async () => {
    addFile("d2l-test/syllabuses/garbage.pdf", "not a pdf\n");
    addFile("d2l-test/expected-output/deadlines.md", "garbage\n");

    const results = await checkFixtures(dir);
    expect(results.map((r) => r.label)).toEqual(["d2l-test pdf"]);
    expect(results[0].problem).not.toBe("");
  });

  it("fails a fixture with syllabuses but no expected output", async () => {
    addFile("d2l-test/syllabuses/src/garbage.md", "not a syllabus\n");

    const results = await checkFixtures(dir);
    expect(results.map((r) => r.label)).toEqual(["d2l-test"]);
    expect(results[0].problem).toContain("no expected output");
  });

  it("fails a fixture with expected output but no syllabuses", async () => {
    addFile("d2l-test/expected-output/deadlines.md", "garbage\n");

    const results = await checkFixtures(dir);
    expect(results[0].problem).toContain("no syllabuses");
  });

  it("fails when there are no fixtures at all, and skips dirs that aren't fixtures", async () => {
    addFile("notes/README.md", "not a fixture\n");

    const results = await checkFixtures(dir);
    expect(results.map((r) => r.problem)).toEqual(["no fixtures found"]);
  });

  it("takes --expected in both forms and rejects anything else", () => {
    expect(parseCliArgs([])).toBeUndefined();
    expect(parseCliArgs(["--expected", "/a.md"])).toBe("/a.md");
    expect(parseCliArgs(["--expected=/a.md"])).toBe("/a.md");
    expect(() => parseCliArgs(["--expect=/a.md"])).toThrow();
    expect(() => parseCliArgs(["/a.md"])).toThrow();
    expect(() => parseCliArgs(["--expected"])).toThrow();
  });
});

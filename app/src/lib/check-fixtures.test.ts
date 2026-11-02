import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkFixtures } from "../../scripts/check-fixtures";
import { expectedDeadlines } from "./test-helpers";

describe("check-fixtures", () => {
  it("every sample syllabus renders exactly expected-output/deadlines.md", async () => {
    const results = await checkFixtures();
    expect(results).toHaveLength(2);
    // On failure this prints the unified diff.
    expect(results.map((r) => r.diff).join("")).toBe("");
  });

  it("fails with a unified diff when one expected line is wrong", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "check-fixtures-"));
    try {
      const corrupted = path.join(dir, "deadlines.md");
      const good = "| Tue Oct 13, 13:00 | HIS 201 | Essay proposal | 10% | 500 words |";
      expect(expectedDeadlines()).toContain(good);
      writeFileSync(corrupted, expectedDeadlines().replace(good, good.replace("10%", "15%")));

      const results = await checkFixtures(corrupted);
      expect(results).toHaveLength(2);
      for (const { diff } of results) {
        expect(diff).toContain("@@");
        expect(diff).toContain(`-${good.replace("10%", "15%")}`);
        expect(diff).toContain(`+${good}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

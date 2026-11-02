import { describe, expect, it } from "vitest";
import { previewMarkdown, plainText } from "./markdown";
import { parseSyllabuses } from "./parse";
import {
  CLOSING_QUESTION,
  MAX_QUESTIONS,
  isNextSevenDays,
  normalizeWhen,
  pleaseCheck,
  sortRows,
  termOf,
  unreadableWhen,
  whatYouConfirmed,
} from "./table";
import { SAMPLE_COURSES, sampleMarkdown } from "./test-helpers";
import type { Deadline } from "./types";

const TODAY = "2026-10-05";
const TERM = termOf("Fall 2026", TODAY);

function row(over: Partial<Deadline>): Deadline {
  return { id: over.what ?? "x", course: "ABC 100", what: "Thing", worth: "10%", covers: "", when: "TBA", source: "manual", ...over };
}

describe("sortRows", () => {
  it("goes dated, then month-only within its month, then TBA", () => {
    const rows = [
      row({ what: "tba" }),
      row({ what: "december", when: "December" }),
      row({ what: "dec-20", when: "Sun Dec 20" }),
      row({ what: "oct-9-late", when: "Fri Oct 9, 21:00" }),
      row({ what: "oct-9-early", when: "Fri Oct 9, 9:00" }),
    ];
    expect(sortRows(rows, TERM).map((r) => r.what)).toEqual(["oct-9-early", "oct-9-late", "dec-20", "december", "tba"]);
  });
});

describe("isNextSevenDays", () => {
  it("covers today through six days from now", () => {
    const at = (when: string) => isNextSevenDays(row({ when }), TERM, TODAY);
    expect(at("Mon Oct 5")).toBe(true);
    expect(at("Sun Oct 11, 23:59")).toBe(true);
    expect(at("Mon Oct 12")).toBe(false);
    expect(at("Sun Oct 4")).toBe(false);
    expect(at("TBA")).toBe(false);
    expect(at("December")).toBe(false);
  });
});

describe("pleaseCheck", () => {
  const samples = parseSyllabuses(
    SAMPLE_COURSES.map((c) => ({ name: c, text: sampleMarkdown(c) })),
    { term: "Fall 2026" },
  );

  it("asks about the things the sample README says it should", () => {
    const q = pleaseCheck(samples.rows, TERM, TODAY);
    expect(q).toEqual([
      "HIS 201 midterm: the syllabus doesn't say what it covers. I assumed Weeks 1-6. Right?",
      "HIS 201 midterm room is TBA. I'll leave it blank until it's posted.",
      'BIO 110 Lab reports 1-4: the syllabus doesn\'t say which dates. It says "Due the Friday after each lab, 11:59 pm". When is each due?',
      "BIO 110 Lab reports: I split the weight evenly (5% each). Right?",
    ]);
  });

  it("stops asking once a row is answered", () => {
    const answered = samples.rows.map((r) =>
      r.what.startsWith("Lab report") ? { ...r, when: "Fri Oct 16, 23:59", worth: "5%" } : r,
    );
    expect(pleaseCheck(answered, TERM, TODAY).join()).not.toMatch(/Lab report/);
  });

  it("asks at most five, the next 3 weeks only when there are more", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({ what: `Test ${i}`, when: `Mon Nov ${i + 2}`, covers: "Weeks 1-2 (assumed)" }),
    );
    rows.push(row({ what: "Soon test", when: "Mon Oct 12", covers: "Weeks 1-2 (assumed)" }));
    const q = pleaseCheck(rows, TERM, TODAY);
    expect(q.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    expect(q).toEqual(["ABC 100 soon test: the syllabus doesn't say what it covers. I assumed Weeks 1-2. Right?"]);
  });
});

describe("previewMarkdown", () => {
  it("has exactly one closing question, after Please check", () => {
    const rows = [row({ what: "Quiz", when: "Fri Oct 9" }), row({ what: "Essay" })];
    const md = previewMarkdown({ rows, undated: ["ABC 100 labs (5%)"], questions: pleaseCheck(rows, TERM, TODAY), term: TERM, timezone: "America/Toronto", today: TODAY });
    expect(md.split(CLOSING_QUESTION)).toHaveLength(2);
    expect(md.indexOf("## Please check")).toBeLessThan(md.indexOf(CLOSING_QUESTION));
    expect(md).toContain("Not dated: ABC 100 labs (5%).");
    expect(md).toContain("| **Fri Oct 9** | **ABC 100** | **Quiz** | **10%** |  |");
  });

  it("keeps a pipe in a cell from breaking the table", () => {
    const md = previewMarkdown({ rows: [row({ what: "A | B", when: "Fri Oct 30" })], undated: [], questions: [], term: TERM, timezone: "UTC", today: TODAY });
    expect(md).toContain("| A \\| B |");
  });
});

describe("plainText", () => {
  it("lists rows without markdown", () => {
    const text = plainText([row({ what: "Quiz", when: "Fri Oct 9", covers: "Unit 1" })], ["ABC 100 labs (5%)"], TERM);
    expect(text).toBe("Deadlines, Fall 2026\n\nFri Oct 9 · ABC 100 · Quiz · 10% · Unit 1\n\nNot dated: ABC 100 labs (5%).\n");
  });
});

describe("normalizeWhen and unreadableWhen", () => {
  it("tidies what it can read and leaves the rest for the student to fix", () => {
    expect(normalizeWhen("oct 16 11:59pm", TERM)).toBe("Fri Oct 16, 23:59");
    expect(normalizeWhen("whenever", TERM)).toBe("whenever");
    const bad = row({ what: "bad", when: "whenever" });
    expect(unreadableWhen([bad, row({ what: "ok" })], TERM)).toEqual([bad]);
  });
});

describe("whatYouConfirmed", () => {
  const original = [
    row({ id: "a", what: "Quiz", when: "Fri Oct 9", worth: "5%" }),
    row({ id: "b", what: "Essay", when: "Fri Oct 16", worth: "20%" }),
    row({ id: "c", what: "Paper" }),
  ];

  it("reports skips, moves, filled dates and added rows", () => {
    const confirmed = [
      { ...original[0], when: "Mon Oct 12", worth: "10%" },
      { ...original[2], when: "Fri Oct 30" },
      row({ id: "new", what: "Bonus talk", when: "Tue Nov 3" }),
    ];
    expect(whatYouConfirmed(original, confirmed, TERM)).toEqual([
      "ABC 100 quiz: moved from Fri Oct 9 to Mon Oct 12.",
      'ABC 100 quiz worth: changed from "5%" to "10%".',
      "ABC 100 essay: skipped, left out of your deadlines.",
      "ABC 100 paper: you set the date to Fri Oct 30.",
      "Added ABC 100 Bonus talk (Tue Nov 3).",
    ]);
  });

  it("says so when nothing changed", () => {
    const clean = original.slice(0, 2);
    expect(whatYouConfirmed(clean, clean, TERM)).toEqual(["Everything as the syllabuses say. No changes."]);
  });
});

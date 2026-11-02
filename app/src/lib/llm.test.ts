import { describe, expect, it } from "vitest";
import { buildLlmUserMessage, llmToExtraction, LlmOutputSchema, type LlmOutput } from "./llm.server";

type Item = LlmOutput["courses"][number]["items"][number];

function item(over: Partial<Item>): Item {
  return {
    what: "Thing",
    location: null,
    worth: "10%",
    worth_assumed: false,
    covers: null,
    covers_assumed: false,
    date: null,
    start: null,
    end: null,
    time_assumed: false,
    month: null,
    is_final: false,
    syllabus_said: null,
    ...over,
  };
}

function convert(items: Item[], undated: string[] = []) {
  return llmToExtraction({ courses: [{ code: "BIO 110", name: "Cells", items, undated }] }, "Fall 2026", 2026);
}

describe("llmToExtraction", () => {
  it("uses the same conventions as the deterministic parser", () => {
    const ex = convert(
      [
        item({ what: "Midterm", date: "2026-10-15", start: "19:00", end: "21:00", location: "Exam Centre 100", covers: "Units 1-6" }),
        item({ what: "Test", date: "2026-10-21", covers: "Weeks 1-6", covers_assumed: true }),
        item({ what: "Lab report 1", worth: "5%", worth_assumed: true, syllabus_said: "Friday after each lab" }),
      ],
      ["weekly labs (10%)"],
    );
    expect(ex.rows.map((r) => [r.when, r.what, r.worth, r.covers])).toEqual([
      ["Thu Oct 15, 19:00-21:00", "Midterm, Exam Centre 100", "10%", "Units 1-6"],
      ["Wed Oct 21", "Test, room TBA", "10%", "Weeks 1-6 (assumed)"],
      ["TBA", "Lab report 1", "5% (assumed)", ""],
    ]);
    expect(ex.rows[2].hint).toBe("Friday after each lab");
    expect(ex.rows[0].source).toBe("llm");
    expect(ex.undated).toEqual(["BIO 110 weekly labs (10%)"]);
  });

  it("merges finals the way the parser does", () => {
    const ex = llmToExtraction(
      {
        courses: [
          { code: "A 100", name: "", undated: [], items: [item({ what: "Final exam", is_final: true, month: 12, worth: "30%" })] },
          { code: "B 200", name: "", undated: [], items: [item({ what: "Final exam", is_final: true, month: 12, worth: "40%" })] },
        ],
      },
      "Fall 2026",
      2026,
    );
    expect(ex.rows).toMatchObject([{ when: "December", course: "All", what: "Final exams", worth: "30-40%" }]);
  });

  it("never trusts a bad date or time from the model", () => {
    const ex = convert([item({ what: "Essay", date: "2026-02-30", start: "25:99" }), item({ what: "Paper", date: "2026-10-16", start: "9pm" })]);
    expect(ex.rows.map((r) => r.when)).toEqual(["TBA", "Fri Oct 16"]);
    expect(ex.warnings[0]).toMatch(/isn't a real date/);
  });

  it("marks a missing weight TBA and gives repeated names different ids", () => {
    const ex = convert([item({ what: "Quiz", worth: null, date: "2026-10-01" }), item({ what: "Quiz", date: "2026-10-08" })]);
    expect(ex.rows[0].worth).toBe("TBA");
    expect(new Set(ex.rows.map((r) => r.id)).size).toBe(2);
  });
});

describe("schema and prompt", () => {
  it("rejects output missing required fields", () => {
    expect(LlmOutputSchema.safeParse({ courses: [{ code: "X" }] }).success).toBe(false);
  });

  it("wraps each syllabus so its text reads as data, and includes the term", () => {
    const msg = buildLlmUserMessage([{ name: 'a"b.md', text: "hello" }], "Fall 2026");
    expect(msg).toContain("Term: Fall 2026");
    expect(msg).toContain('<syllabus name="a\\"b.md">\nhello\n</syllabus>');
  });
});

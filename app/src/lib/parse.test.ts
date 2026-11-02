import { describe, expect, it } from "vitest";
import { parseSyllabus, parseSyllabuses } from "./parse";
import { extractPdfText } from "./pdf";
import { deadlinesMarkdown, markdownTable } from "./markdown";
import { isPast, sortRows, termOf, whatYouConfirmed } from "./table";
import {
  SAMPLE_COURSES,
  expectedDeadlines,
  sampleMarkdown,
  samplePdf,
  tableRows,
} from "./test-helpers";
import type { Deadline } from "./types";

// The sample README says "Pretend today is Monday, October 5, 2026".
const TODAY = "2026-10-05";
const TERM = termOf("Fall 2026", TODAY);

function parseSamples(kind: "md" | "pdf" = "md") {
  if (kind === "md") {
    return Promise.resolve(
      parseSyllabuses(
        SAMPLE_COURSES.map((c) => ({ name: `${c}-syllabus.md`, text: sampleMarkdown(c) })),
        { term: "Fall 2026" },
      ),
    );
  }
  return Promise.all(
    SAMPLE_COURSES.map(async (c) => ({
      name: `${c}-syllabus.pdf`,
      text: (await extractPdfText(samplePdf(c))).text,
    })),
  ).then((sources) => parseSyllabuses(sources, { term: "Fall 2026" }));
}

/**
 * What the student answers in the sample README: "HIS coverage, not sure, keep
 * it assumed. Lab reports are due Oct 16, Oct 30, Nov 13 and Nov 27."
 */
function applySampleAnswers(rows: Deadline[]): Deadline[] {
  const labDates = ["Fri Oct 16, 23:59", "Fri Oct 30, 23:59", "Fri Nov 13, 23:59", "Fri Nov 27, 23:59"];
  return rows.map((r) => {
    const m = r.what.match(/^Lab report (\d)$/);
    return m ? { ...r, when: labDates[Number(m[1]) - 1] } : r;
  });
}

describe("sample syllabuses (examples/sample-university)", () => {
  it("reads course codes and names", async () => {
    const ex = await parseSamples();
    expect(ex.courses.map((c) => `${c.code}: ${c.name}`)).toEqual([
      "BIO 110: Cells and Organisms",
      "CS 150: Introduction to Programming",
      "HIS 201: The Modern World, 1789-1945",
    ]);
    expect(ex.warnings).toEqual([]);
  });

  it("matches expected-output/deadlines.md once the student's answers are applied", async () => {
    const ex = await parseSamples();
    // Items already past on Oct 5 (BIO Quiz 1 on Sep 25, CS Assignment 1 on
    // Oct 2) aren't in the expected table; the app hides them the same way.
    const upcoming = ex.rows.filter((r) => !isPast(r, TERM, TODAY));
    expect(ex.rows.filter((r) => isPast(r, TERM, TODAY)).map((r) => `${r.course} ${r.what}`)).toEqual([
      "BIO 110 Quiz 1, online",
      "CS 150 Assignment 1",
    ]);

    const confirmed = applySampleAnswers(upcoming);
    const ours = tableRows(markdownTable(confirmed, TERM, TODAY));
    const expected = tableRows(expectedDeadlines());

    // Documented difference: the syllabus says "Lab reports (4) 20%". The
    // parser splits that into 5% each and marks it "(assumed)" because the
    // syllabus doesn't say the reports are weighted equally. The expected
    // output (written after the student confirmed) shows plain "5%".
    const normalised = ours.map((cells) => cells.map((c) => c.replace("5% (assumed)", "5%")));
    expect(normalised).toEqual(expected);

    // And the only assumed worth values are the four lab reports.
    expect(confirmed.filter((r) => /assumed/.test(r.worth)).map((r) => r.what)).toEqual([
      "Lab report 1",
      "Lab report 2",
      "Lab report 3",
      "Lab report 4",
    ]);
  });

  it("leaves lab report dates TBA instead of guessing (the student supplies them)", async () => {
    const ex = await parseSamples();
    const labs = ex.rows.filter((r) => r.what.startsWith("Lab report"));
    expect(labs).toHaveLength(4);
    for (const l of labs) {
      expect(l.when).toBe("TBA");
      expect(l.hint).toBe("Due the Friday after each lab, 11:59 pm");
    }
  });

  it("puts undated items in the Not dated line, as the expected output does", async () => {
    const ex = await parseSamples();
    expect(ex.undated).toEqual(["CS 150 weekly labs (10%)", "HIS 201 tutorial participation (10%)"]);
    expect(expectedDeadlines()).toContain(
      "Not dated: CS 150 weekly labs (10%), HIS 201 tutorial participation (10%).",
    );
  });

  it("marks assumed and missing values instead of filling them silently", async () => {
    const ex = await parseSamples();
    const his = ex.rows.find((r) => r.course === "HIS 201" && r.what.startsWith("Midterm"))!;
    expect(his.covers).toBe("Weeks 1-6 (assumed)");
    expect(his.what).toBe("Midterm, room TBA");
  });

  it("gets the same rows from the sample PDFs as from the markdown sources", async () => {
    const [md, pdf] = await Promise.all([parseSamples("md"), parseSamples("pdf")]);
    const strip = (rows: Deadline[]) => rows.map(({ course, what, worth, covers, when }) => ({ course, what, worth, covers, when }));
    expect(strip(sortRows(pdf.rows, TERM))).toEqual(strip(sortRows(md.rows, TERM)));
    expect(pdf.undated).toEqual(md.undated);
  });

  it("writes a deadlines.md whose What you confirmed list matches the sample", async () => {
    const ex = await parseSamples();
    const upcoming = ex.rows.filter((r) => !isPast(r, TERM, TODAY));
    const confirmed = applySampleAnswers(upcoming);
    const notes = whatYouConfirmed(upcoming, confirmed, TERM);
    expect(notes).toContain("HIS 201 midterm covers Weeks 1-6: kept as assumed.");
    expect(notes).toContain("BIO 110 lab reports: you said they're due Oct 16, Oct 30, Nov 13 and Nov 27.");
    expect(notes).toContain("HIS 201 midterm room: still TBA. Check the course site the week before.");

    const md = deadlinesMarkdown({
      rows: confirmed,
      undated: ex.undated,
      confirmedNotes: notes,
      term: TERM,
      timezone: "America/Toronto",
      confirmedOn: TODAY,
    });
    expect(md).toMatch(/^# Deadlines, Fall 2026\n\nConfirmed with you on Mon Oct 5\./);
    expect(md).toContain("## What you confirmed");
    expect(md).not.toContain("Please check");
    expect(md).not.toContain("Anything wrong");
    expect(md).toContain("| **Fri Oct 9, 9:00-21:00** | **BIO 110** | **Quiz 2, online** | **5%** | **Units 3-4** |");
  });
});

describe("mergeParses", () => {
  it("doesn't double rows when the same syllabus is added twice", () => {
    const text = sampleMarkdown("BIO110");
    const once = parseSyllabuses([{ name: "a.md", text }], { term: "Fall 2026" });
    const twice = parseSyllabuses([{ name: "a.md", text }, { name: "a.pdf", text }], { term: "Fall 2026" });
    expect(twice.rows).toEqual(once.rows);
    expect(twice.courses).toEqual(once.courses);
    expect(twice.warnings).toEqual(["BIO 110 was added more than once. Identical rows were merged."]);
  });

  it("names the courses instead of All when only some have that final", () => {
    const a = "AAA 100\nAssessment\nFinal exam 40% December exam period";
    const b = "BBB 200\nAssessment\nFinal exam 30% December exam period";
    const c = "CCC 300\nAssessment\nEssay 30% Oct 9";
    const ex = parseSyllabuses([a, b, c].map((text) => ({ name: "x", text })), { term: "Fall 2026" });
    expect(ex.rows.find((r) => r.what === "Final exams")).toMatchObject({ course: "AAA 100, BBB 200", worth: "30-40%", when: "December" });
    const one = parseSyllabuses([{ name: "x", text: a }], { term: "Fall 2026" });
    expect(one.rows[0]).toMatchObject({ course: "AAA 100", what: "Final exam", worth: "40%" });
  });

  it("keeps a final with no month TBA, with what the syllabus said", () => {
    const ex = parseSyllabuses([{ name: "x", text: "AAA 100\nAssessment\nFinal exam 40% set by the registrar" }], { term: "Fall 2026" });
    expect(ex.rows[0]).toMatchObject({ when: "TBA", hint: "set by the registrar" });
  });
});

describe("parseSyllabus on other layouts", () => {
  it("reads plain lines with weights and a course code in a heading", () => {
    const text = `MATH 221 - Linear Algebra
Lectures: Mon, Wed, Fri 11:00 am
Grading
Problem sets (5) 20% due every Friday
Midterm 1: 20% - October 14, 6:30-8:00 pm, Room MP 102
Term test (25%) Nov 18, 2026 in class
Final exam 35% TBA by the registrar
Late work loses 10% per day.`;
    const p = parseSyllabus(text, { term: "Fall 2026" });
    expect(p.course).toMatchObject({ code: "MATH 221", name: "Linear Algebra" });
    expect(p.undated).toEqual(["MATH 221 problem sets (20%)"]);
    expect(p.rows.map((r) => [r.when, r.what, r.worth])).toEqual([
      ["Wed Oct 14, 18:30-20:00", "Midterm 1, Room MP 102", "20%"],
      ["Wed Nov 18, 11:00", "Term test, in class", "25%"],
    ]);
    expect(p.finals).toEqual([{ course: "MATH 221", weight: "35%", month: null, hint: "TBA by the registrar" }]);
  });

  it("asks when the weekday and the date disagree", () => {
    const p = parseSyllabus("ECO 100\n## Assessment\n| Item | Weight | Due |\n|---|---|---|\n| Essay | 20% | Thu Oct 9 |", {
      term: "Fall 2026",
    });
    expect(p.rows[0].when).toBe("Fri Oct 9");
    expect(p.rows[0].question).toMatch(/says Thu Oct 9, but that's a Fri in 2026/);
  });

  it("uses the term's second year for winter dates in a two-year term", () => {
    const p = parseSyllabus("PSY 300\nAssessment\nPaper 30% Jan 20\nExam 40% Dec 10", { term: "Fall/Winter 2026-2027" });
    expect(p.rows.map((r) => r.when)).toEqual(["Wed Jan 20", "Thu Dec 10"]);
  });

  it("ignores totals and sentences about marks", () => {
    const p = parseSyllabus("HIS 101\nAssessment\nEssay 50% Oct 9\nExam is worth 50% of your grade\nTotal 100%", { term: "Fall 2026" });
    expect(p.rows.map((r) => r.what)).toEqual(["Essay"]);
    const t = parseSyllabus("HIS 101\n| Item | Weight | Due |\n|---|---|---|\n| Essay | 50% | Oct 9 |\n| Total | 100% | |", { term: "Fall 2026" });
    expect(t.rows.map((r) => r.what)).toEqual(["Essay"]);
  });

  it("marks a missing weight TBA and missing midterm coverage TBA", () => {
    const p = parseSyllabus("HIS 101\n| Item | Weight | Due |\n|---|---|---|\n| Midterm | TBD | Oct 9 |", { term: "Fall 2026" });
    expect(p.rows[0]).toMatchObject({ worth: "TBA", covers: "TBA", what: "Midterm, room TBA" });
  });

  it("reads other column orders", () => {
    const p = parseSyllabus("HIS 101\nAssessment\n25% Midterm, Oct 15\nPaper Nov 2 5:00 pm 30%", { term: "Fall 2026" });
    expect(p.rows.map((r) => [r.when, r.what.split(",")[0], r.worth])).toEqual([
      ["Thu Oct 15", "Midterm", "25%"],
      ["Mon Nov 2, 17:00", "Paper", "30%"],
    ]);
  });

  it("joins a marking scheme and a separate key dates list", () => {
    const text = "HIS 101\nAssessment\nMidterm 25%\nPaper 30% Nov 2\nImportant dates\nMidterm: October 15, 7:00 pm\nProject proposal: October 20";
    const p = parseSyllabus(text, { term: "Fall 2026" });
    expect(p.rows.map((r) => [r.when, r.what.split(",")[0], r.worth])).toEqual([
      ["Thu Oct 15, 19:00", "Midterm", "25%"],
      ["Mon Nov 2", "Paper", "30%"],
      ["Tue Oct 20", "Project proposal", "TBA"],
    ]);
  });

  it("makes a row per date, splits the weight and marks the split assumed", () => {
    const p = parseSyllabus("HIS 101\nAssessment\nTests 40% Oct 9, Nov 6", { term: "Fall 2026" });
    expect(p.rows.map((r) => [r.when, r.what, r.worth])).toEqual([
      ["Fri Oct 9", "Test 1, room TBA", "20% (assumed)"],
      ["Fri Nov 6", "Test 2, room TBA", "20% (assumed)"],
    ]);
  });

  it("uses the last day of a window and asks about it", () => {
    const p = parseSyllabus("HIS 101\nAssessment\nTake-home essay 20% Oct 9 - Oct 11", { term: "Fall 2026" });
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].when).toBe("Sun Oct 11");
    expect(p.rows[0].question).toMatch(/I used the last day/);
  });

  it("marks a time taken from another day's lecture as assumed", () => {
    const p = parseSyllabus("HIS 101\nLecture: Tuesday, 1:00-3:00 pm\nAssessment\nTest 20% Wed Oct 7, in lecture", { term: "Fall 2026" });
    expect(p.rows[0].when).toBe("Wed Oct 7, 13:00 (assumed)");
  });

  it("sends a long series with no dates to Not dated instead of a dozen TBA rows", () => {
    const p = parseSyllabus("HIS 101\nAssessment\nProblem sets (12) 24%", { term: "Fall 2026" });
    expect(p.rows).toEqual([]);
    expect(p.undated).toEqual(["HIS 101 problem sets (24%)"]);
  });

  it("isn't fooled by a term heading or a policy line that looks like an assessment", () => {
    const p = parseSyllabus("FALL 2026 COURSE OUTLINE\nCSC207H1: Software Design\nGrading\nA1 10% Oct 9\nPolicies\nLate work loses 10% per day\nEssay 50% Oct 9", { term: "Fall 2026" });
    expect(p.course).toMatchObject({ code: "CSC 207H1", name: "Software Design" });
    expect(p.rows.map((r) => r.what)).toEqual(["A1"]);
  });

  it("keeps an explicit year that disagrees with the term, visibly", () => {
    const p = parseSyllabus("HIS 101\nAssessment\nPaper 20% Oct 9, 2025", { term: "Fall 2026" });
    expect(p.rows[0].when).toBe("Thu Oct 9, 2025");
  });

  it("warns when there's no course code", () => {
    const p = parseSyllabus("Quiz 10% Oct 3", { term: "Fall 2026", sourceName: "notes.txt" });
    expect(p.course.code).toBe("notes");
    expect(p.warnings[0]).toMatch(/no course code/);
  });
});

describe("a course supplied by the course site", () => {
  const text = "Marking scheme\nMidterm 25% Oct 16, 2026";
  const course = { code: "CSC 207H1", name: "Software Design" };

  it("wins over anything in the text, with no warning", () => {
    const p = parseSyllabus(`PHL 245 is a prerequisite.\n${text}`, { term: "Fall 2026", sourceName: "x.pdf", course });
    expect(p.course).toMatchObject(course);
    expect(p.rows[0].course).toBe("CSC 207H1");
    expect(p.warnings).toEqual([]);
  });

  it("goes through parseSyllabuses from the source", () => {
    const ex = parseSyllabuses([{ name: "x.pdf", text, course }], { term: "Fall 2026" });
    expect(ex.courses).toEqual([expect.objectContaining(course)]);
  });

  it("doesn't warn about a page with no marks when another source for the course has them", () => {
    const ex = parseSyllabuses(
      [
        { name: "page", text: "Welcome to the course, read the outline.", course },
        { name: "outline.pdf", text, course },
      ],
      { term: "Fall 2026" },
    );
    expect(ex.rows).toHaveLength(1);
    expect(ex.warnings.join(" ")).not.toMatch(/no assessments/);
  });

  it("still warns when no source for the course has marks", () => {
    const ex = parseSyllabuses([{ name: "page", text: "Welcome to the course.", course }], { term: "Fall 2026" });
    expect(ex.warnings.join(" ")).toMatch(/no assessments/);
  });
});

describe("a course's page and file from the course site", () => {
  it("aren't reported as added twice", () => {
    const course = { code: "CSC 207H1", name: "" };
    const text = "Marking scheme\nMidterm 25% Oct 16, 2026";
    const ex = parseSyllabuses([{ name: "a", text, course }, { name: "b", text, course }], { term: "Fall 2026" });
    expect(ex.warnings).toEqual([]);
    expect(ex.rows).toHaveLength(1);
  });
});

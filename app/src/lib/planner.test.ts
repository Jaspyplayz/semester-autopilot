import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek, parseTerm } from "./dates";
import { planFilename, studyPlanMarkdown, weeklyScheduleMarkdown } from "./markdown";
import { parseSyllabuses } from "./parse";
import {
  DEFAULT_PLAN_SETTINGS,
  addBlock,
  blankBlocks,
  buildPlans,
  changeBlock,
  dayMinutes,
  deadlinesBasis,
  fullDays,
  isProblemCourse,
  isTestLike,
  laterWeeks,
  removeBlock,
  worthPercent,
  type CoursePlan,
  type PlanSet,
  type PlanSettings,
} from "./planner";
import { weeklySchedule } from "./schedule";
import { SAMPLE_COURSES, sampleMarkdown } from "./test-helpers";
import { GENERIC_TOPICS, fitTopics, sourceFor, syllabusTopics, topicsFromCovers } from "./topics";
import type { Deadline, SyllabusSource } from "./types";

const TERM = parseTerm("Fall 2026", 2026);
const TODAY = "2026-10-05";

function row(over: Partial<Deadline>): Deadline {
  return { id: `${over.course ?? "ABC 100"}-${over.what}`, course: "ABC 100", what: "Midterm", worth: "20%", covers: "Units 1-4", when: "TBA", source: "syllabus", ...over };
}

function plan(rows: Deadline[], settings: Partial<PlanSettings> = {}, today = TODAY, sources: SyllabusSource[] = []): PlanSet {
  return buildPlans({ rows, courses: [], sources, term: TERM, today, settings: { ...DEFAULT_PLAN_SETTINGS, ...settings } });
}

const sampleSources: SyllabusSource[] = SAMPLE_COURSES.map((c) => ({ id: c, name: c, kind: "md", text: sampleMarkdown(c) }));
const extraction = parseSyllabuses(sampleSources, { term: "Fall 2026" });
// The dates the expected output says the student gave for the lab reports.
const LAB_DATES = ["Fri Oct 16, 23:59", "Fri Oct 30, 23:59", "Fri Nov 13, 23:59", "Fri Nov 27, 23:59"];
const sampleRows = extraction.rows.map((r) => {
  const lab = r.what.match(/^Lab report (\d)/);
  return lab ? { ...r, when: LAB_DATES[Number(lab[1]) - 1] } : r;
});
const sample = buildPlans({ rows: sampleRows, courses: extraction.courses, sources: sampleSources, term: TERM, today: TODAY, settings: DEFAULT_PLAN_SETTINGS });
const planFor = (set: PlanSet, course: string): CoursePlan => set.plans.find((p) => p.course === course)!;

function totalsByDate(set: PlanSet): Map<string, number> {
  const out = new Map<string, number>();
  for (const day of set.plans.flatMap((p) => [...p.days, p.testDay])) {
    out.set(day.date, (out.get(day.date) ?? 0) + dayMinutes(day));
  }
  return out;
}

describe("reading the table", () => {
  it("reads weights", () => {
    expect(worthPercent("25%")).toBe(25);
    expect(worthPercent("5% (assumed)")).toBe(5);
    expect(worthPercent("30-40%")).toBe(40);
    expect(worthPercent("TBA")).toBeNull();
    expect(worthPercent("500 words")).toBeNull();
  });

  it("tells tests from work", () => {
    expect(isTestLike("Midterm, Exam Centre 100")).toBe(true);
    expect(isTestLike("Quiz 2, online")).toBe(true);
    expect(isTestLike("Final exam")).toBe(true);
    expect(isTestLike("Final essay")).toBe(false);
    expect(isTestLike("Assignment 2")).toBe(false);
  });

  it("spots problem courses from the code or name", () => {
    expect(isProblemCourse("MAT 137")).toBe(true);
    expect(isProblemCourse("CS 150")).toBe(true);
    expect(isProblemCourse("ABC 100", "Intro to Statistics")).toBe(true);
    expect(isProblemCourse("HIS 201", "The Modern World")).toBe(false);
    expect(isProblemCourse("BIO 110", "Cells and Organisms")).toBe(false);
  });
});

describe("topics", () => {
  const syllabus = syllabusTopics(sampleMarkdown("BIO110"));

  it("expands Covers and names topics from the syllabus", () => {
    const topics = topicsFromCovers("Units 3-4", syllabus);
    expect(topics).toEqual([
      { label: "Unit 3", name: "Membranes and transport", reading: "ch. 5" },
      { label: "Unit 4", name: "Metabolism and enzymes", reading: "ch. 6" },
    ]);
  });

  it("reads a numbered weekly list and a Week | Topic table", () => {
    expect(topicsFromCovers("Weeks 1-2 (assumed)", syllabusTopics(sampleMarkdown("HIS201"))).map((t) => t.name)).toEqual(["Revolutions: France and Haiti", "Industrialization"]);
    expect(topicsFromCovers("Week 4", syllabusTopics(sampleMarkdown("CS150")))[0].name).toBe("Loops");
  });

  it("drops weeks with nothing to learn", () => {
    expect(topicsFromCovers("Weeks 7-8", syllabus).map((t) => t.label)).toEqual(["Week 8"]);
  });

  it("works without a syllabus, and doesn't invent coverage", () => {
    expect(topicsFromCovers("Ch. 2-3", null).map((t) => t.reading)).toEqual(["ch. 2", "ch. 3"]);
    expect(topicsFromCovers("cells, genetics and evolution", null).map((t) => t.label)).toEqual(["Cells", "Genetics", "Evolution"]);
    expect(topicsFromCovers("", null)).toEqual([]);
    expect(topicsFromCovers("2,500 words", null)).toEqual([]);
  });

  it("merges neighbours when there isn't room for each one", () => {
    const topics = topicsFromCovers("Units 1-6", syllabus);
    expect(fitTopics(topics, 3).map((t) => t.label)).toEqual(["Units 1-2", "Units 3-4", "Units 5-6"]);
    expect(fitTopics(topics, 6)).toBe(topics);
  });

  it("doesn't string together stand-in topics when there's little time", () => {
    expect(fitTopics(GENERIC_TOPICS, 1).map((t) => t.label)).toEqual(["everything this covers"]);
  });

  it("finds a course's syllabus by site course or by code in the text", () => {
    expect(sourceFor("BIO 110", sampleSources)).toContain("Cells and Organisms");
    expect(sourceFor("XYZ 999", sampleSources)).toBeNull();
    expect(sourceFor("ABC 1", [{ id: "x", name: "x", kind: "canvas", text: "no code here", course: { code: "ABC 1", name: "" } }])).toBe("no code here");
  });
});

describe("choosing what to plan for", () => {
  it("plans each sample course for its next test, as the skill says", () => {
    expect(sample.plans.map((p) => [p.course, p.what, p.date])).toEqual([
      ["BIO 110", "Midterm", "2026-10-15"],
      ["HIS 201", "Midterm", "2026-10-21"],
      ["CS 150", "Midterm", "2026-10-27"],
    ]);
  });

  it("says a quiz is on the way, rather than planning for it", () => {
    expect(planFor(sample, "BIO 110").note).toBe("Quiz 2 on Fri Oct 9 is on the way");
  });

  it("never plans on a date that isn't there", () => {
    const set = plan([row({ when: "TBA" }), row({ what: "Final exam", when: "December" })]);
    expect(set.plans).toEqual([]);
    expect(set.notPlanned.join(" ")).toMatch(/ABC 100: nothing has an exact date/);
    expect(set.notPlanned.join(" ")).toMatch(/ABC 100 Final exam: no exact date/);
  });

  it("doesn't make a plan for the merged All row", () => {
    const set = plan([row({ course: "All", what: "Final exams", when: "December" })]);
    expect(set.plans).toEqual([]);
    expect(set.notPlanned).toEqual(["All Final exams: no exact date yet. Add it when it's posted, then rebuild."]);
  });

  it("ignores what's already past", () => {
    const set = plan([row({ what: "Quiz 1", when: "Fri Sep 25" }), row({ what: "Midterm", when: "Thu Oct 15" })]);
    expect(set.plans[0].what).toBe("Midterm");
  });

  it("gives a course with no test a plan for its next piece of work", () => {
    const set = plan([row({ what: "Research essay", worth: "30%", covers: "2,500 words", when: "Tue Oct 27, 23:59" })]);
    const [essay] = set.plans;
    expect(essay.kind).toBe("work");
    expect(essay.days.flatMap((d) => d.blocks).every((b) => b.kind === "work")).toBe(true);
    expect(essay.days[0].blocks[0].action).toMatch(/instructions and rubric/);
    expect(essay.testDay.blocks[0].action).toBe("Hand in Research essay by 23:59, then check it went through");
    expect(studyPlanMarkdown(essay)).toContain("## Due day");
    expect(studyPlanMarkdown(essay)).not.toMatch(/mock/i);
  });

  it("walks a piece of work from the brief to revising, without repeating itself", () => {
    const [essay] = plan([row({ what: "Research essay", worth: "30%", covers: "", when: "Tue Oct 27, 23:59" })]).plans;
    const steps = essay.days.flatMap((d) => d.blocks).map((b) => b.action.replace(/^Research essay: /, ""));
    expect(steps[0]).toMatch(/^read the instructions/);
    expect(steps.at(-1)).toMatch(/^Finish Research essay/);
    expect(steps.join(" | ")).toMatch(/rough outline.*draft the hardest part first.*draft the rest.*read it as the marker would/);
    expect(steps.filter((a) => a === "gather what you need and write a rough outline")).toHaveLength(1);
  });
});

describe("study methods (docs/study-methods.md)", () => {
  const bio = planFor(sample, "BIO 110");
  const blocks = bio.days.flatMap((d) => d.blocks.map((b) => ({ ...b, date: d.date })));

  it("learns every topic, then recalls it on a later day", () => {
    for (const unit of ["Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5", "Unit 6"]) {
      const touching = (kind: string) =>
        blocks.filter((b) => {
          if (b.kind !== kind) return false;
          const group = b.action.match(/Units (\d)-(\d)/);
          const n = Number(unit.slice(-1));
          return b.action.includes(unit) || (group && Number(group[1]) <= n && n <= Number(group[2]));
        });
      const learned = touching("learn");
      expect(learned.length, `${unit} is learned`).toBe(1);
      expect(touching("recall").some((r) => r.date > learned[0].date), `${unit} is recalled later`).toBe(true);
    }
  });

  it("first recalls a topic a day or two after learning it", () => {
    const learned = blocks.find((b) => b.kind === "learn")!;
    const label = learned.action.match(/Learn (Units? [\d-]+)/)![1];
    const first = blocks.find((b) => b.kind === "recall" && b.action.includes(label))!;
    expect(first.date > learned.date).toBe(true);
    expect(first.date <= addDays(learned.date, 3)).toBe(true);
  });

  it("spaces a topic over days instead of cramming it", () => {
    const dates = blocks.filter((b) => b.action.includes("Unit 1") && b.kind !== "mock").map((b) => b.date);
    expect(new Set(dates).size).toBeGreaterThanOrEqual(3);
  });

  it("does a final pass 2-3 days before the test", () => {
    const pass = blocks.find((b) => b.action.startsWith("Final pass"));
    expect(pass?.date).toBeOneOf(["2026-10-12", "2026-10-13"]);
  });

  it("never asks to just reread", () => {
    for (const p of sample.plans) {
      for (const b of p.days.flatMap((d) => d.blocks)) expect(b.action).not.toMatch(/\breread\b/i);
    }
  });

  it("has a mini mock about a third of the way in", () => {
    const mini = blocks.find((b) => b.action.startsWith("Mini mock"))!;
    const at = bio.days.findIndex((d) => d.date === mini.date) / bio.days.length;
    expect(at).toBeGreaterThan(0.15);
    expect(at).toBeLessThan(0.55);
  });

  it("ends with a timed mock, redoing mistakes, then light review and sleep", () => {
    const last = bio.days.at(-1)!;
    expect(last.date).toBe("2026-10-14");
    expect(last.label).toContain("mock test");
    expect(last.blocks.map((b) => b.kind)).toEqual(["mock", "redo", "rest"]);
    expect(last.blocks[0].action).toMatch(/^Timed mock/);
    expect(last.blocks[2].action).toMatch(/full night's sleep/);
  });

  it("mixes topics in problem courses, but keeps first sessions and other courses blocked", () => {
    const cs = planFor(sample, "CS 150").days.flatMap((d) => d.blocks);
    expect(cs.some((b) => /^Mixed set.*2 problems each/.test(b.action))).toBe(true);
    expect(cs.filter((b) => b.kind === "learn").every((b) => !/Mixed/.test(b.action))).toBe(true);
    expect(blocks.some((b) => /Mixed set/.test(b.action))).toBe(false);
  });

  it("varies how a topic is recalled", () => {
    expect(blocks.some((b) => /out loud/.test(b.action))).toBe(true);
  });
});

describe("fitting courses together", () => {
  const scenarios: Array<[string, PlanSet]> = [
    ["the sample", sample],
    ["a 2 h limit", plan(sampleRows, { maxHoursPerDay: 2 })],
    ["weekends off", plan(sampleRows, { daysOff: [0, 6] })],
    [
      "a pile-up",
      plan([
        row({ course: "AAA 100", what: "Midterm", worth: "30%", when: "Thu Oct 8, 9:00" }),
        row({ course: "BBB 100", what: "Midterm", worth: "20%", when: "Thu Oct 8, 19:00" }),
        row({ course: "CCC 100", what: "Midterm", worth: "20%", when: "Fri Oct 9, 19:00" }),
        row({ course: "DDD 100", what: "Assignment 1", worth: "10%", when: "Wed Oct 7, 23:59" }),
      ]),
    ],
    ["a test tomorrow", plan([row({ when: "Tue Oct 6, 19:00" })])],
    ["a test today", plan([row({ when: "Mon Oct 5, 19:00" })])],
    ["a far-off exam", plan([row({ what: "Final exam", worth: "40%", when: "Dec 15, 9:00" })])],
  ];

  it.each(scenarios)("%s: stays under the daily limit", (_, set) => {
    const max = set.settings.maxHoursPerDay * 60;
    for (const [date, minutes] of totalsByDate(set)) expect(minutes, date).toBeLessThanOrEqual(max);
  });

  it.each(scenarios)("%s: at most 3 blocks a day, and only before the test", (_, set) => {
    for (const p of set.plans) {
      for (const d of p.days) {
        expect(d.blocks.length).toBeGreaterThan(0);
        expect(d.blocks.length).toBeLessThanOrEqual(3);
        expect(d.date < p.date).toBe(true);
        expect(d.date >= set.builtOn).toBe(true);
      }
    }
  });

  it("is the same every time", () => {
    const again = buildPlans({ rows: sampleRows, courses: extraction.courses, sources: sampleSources, term: TERM, today: TODAY, settings: DEFAULT_PLAN_SETTINGS });
    expect(again).toEqual(sample);
  });

  it("keeps days off free", () => {
    const set = plan(sampleRows, { daysOff: [0, 6] });
    for (const d of set.plans.flatMap((p) => p.days)) expect([0, 6]).not.toContain(dayOfWeek(d.date));
  });

  it("copes with every day off", () => {
    const set = plan(sampleRows, { daysOff: [0, 1, 2, 3, 4, 5, 6] });
    expect(set.plans.flatMap((p) => p.days)).toEqual([]);
    expect(set.plans[0].testDay.blocks.length).toBeGreaterThan(0);
  });

  it("gives the day before a bigger test to that course", () => {
    const set = plan([
      row({ course: "BIG 100", what: "Midterm", worth: "30%", when: "Fri Oct 16, 19:00" }),
      row({ course: "SML 100", what: "Midterm", worth: "15%", when: "Tue Oct 20, 19:00" }),
    ]);
    expect(planFor(set, "SML 100").days.some((d) => d.date === "2026-10-15")).toBe(false);
    expect(planFor(set, "BIG 100").days.at(-1)!.date).toBe("2026-10-15");
  });

  it("moves the smaller test's mock when two tests share a day", () => {
    const set = plan([
      row({ course: "BIG 100", what: "Midterm", worth: "30%", when: "Fri Oct 16, 19:00" }),
      row({ course: "SML 100", what: "Midterm", worth: "15%", when: "Fri Oct 16, 9:00" }),
    ]);
    const mockDay = (course: string) => planFor(set, course).days.find((d) => d.blocks.some((b) => b.action.startsWith("Timed mock")))!.date;
    expect(mockDay("BIG 100")).toBe("2026-10-15");
    expect(mockDay("SML 100") < "2026-10-15").toBe(true);
  });

  it("keeps the day after a big test light", () => {
    const set = plan(
      [
        row({ course: "AAA 100", what: "Midterm", worth: "30%", when: "Thu Oct 8, 19:00" }),
        row({ course: "BBB 100", what: "Midterm", worth: "30%", when: "Thu Oct 15, 19:00" }),
      ],
      { maxHoursPerDay: 2 },
    );
    expect(totalsByDate(set).get("2026-10-09") ?? 0).toBeLessThanOrEqual(60);
  });

  it("holds a course back until closer big tests are done", () => {
    const cs = planFor(sample, "CS 150");
    expect(cs.lightUntil).toBe("2026-10-16");
    const before = cs.days.filter((d) => d.date < "2026-10-16").flatMap((d) => d.blocks);
    expect(before.every((b) => b.kind === "onTheWay" || b.kind === "item")).toBe(true);
    expect(cs.details.clashes).toContain("Lectures and skimming only until Fri Oct 16");
  });

  it("starts smaller work on the way to a test, and finishes it before it's due", () => {
    const work = planFor(sample, "CS 150").days.flatMap((d) => d.blocks.map((b) => ({ ...b, date: d.date }))).filter((b) => b.kind === "onTheWay");
    expect(work.map((b) => b.action.split(":")[0].split(",")[0])).toEqual(["Start Assignment 2", "Finish Assignment 2"]);
    expect(work.every((b) => b.date < "2026-10-16")).toBe(true);
  });

  it("prepares for and takes an online quiz on the way", () => {
    const days = planFor(sample, "BIO 110").days;
    expect(days.find((d) => d.date === "2026-10-08")!.blocks.some((b) => b.action.startsWith("Quiz 2 prep"))).toBe(true);
    const quizDay = days.find((d) => d.date === "2026-10-09")!;
    expect(quizDay.label).toContain("Quiz 2");
    expect(quizDay.blocks.some((b) => b.action === "Take Quiz 2 before 21:00")).toBe(true);
  });

  it("says so when the limit squeezes a plan", () => {
    const set = plan(
      [
        row({ course: "AAA 100", what: "Final exam", worth: "40%", when: "Thu Oct 8, 19:00" }),
        row({ course: "BBB 100", what: "Final exam", worth: "40%", when: "Thu Oct 8, 9:00" }),
      ],
      { maxHoursPerDay: 1 },
    );
    expect(set.plans.some((p) => /Your daily limit left about/.test(p.details.clashes))).toBe(true);
  });

  it("leaves test-day review out when the test is in the morning", () => {
    const morning = plan([row({ when: "Thu Oct 15, 9:00" })]);
    const evening = plan([row({ when: "Thu Oct 15, 19:00" })]);
    expect(morning.plans[0].testDay.blocks).toHaveLength(1);
    expect(evening.plans[0].testDay.blocks).toHaveLength(2);
    expect(evening.plans[0].testDay.blocks[1].minutes).toBe(30);
  });

  it("handles a test tomorrow and a test today", () => {
    const tomorrow = plan([row({ when: "Tue Oct 6, 19:00" })]).plans[0];
    expect(tomorrow.days.map((d) => d.date)).toEqual([TODAY]);
    expect(tomorrow.days[0].blocks[0].kind).toBe("mock");
    expect(plan([row({ when: "Mon Oct 5, 19:00" })]).plans[0].days).toEqual([]);
  });

  it("doesn't start a far-off exam for weeks", () => {
    const [exam] = plan([row({ what: "Final exam", worth: "40%", when: "Dec 15, 9:00" })]).plans;
    expect(exam.days[0].date).toBe(addDays("2026-12-15", -21));
  });

  it("flags assumptions instead of hiding them", () => {
    const [p] = plan([row({ worth: "20% (assumed)", covers: "Weeks 1-3 (assumed)", when: "Thu Oct 15 (assumed)" })]).plans;
    expect(p.details.assumed).toMatch(/date is marked assumed/);
    expect(p.details.assumed).toMatch(/weight is marked assumed/);
    expect(p.details.assumed).toMatch(/coverage is marked assumed/);
    const [unknown] = plan([row({ worth: "TBA", covers: "", when: "Thu Oct 15" })]).plans;
    expect(unknown.details.assumed).toMatch(/treats it as 10%/);
    expect(unknown.details.assumed).toMatch(/splits your notes into thirds/);
    expect(unknown.days.flatMap((d) => d.blocks).some((b) => /first third of your notes/.test(b.action))).toBe(true);
  });
});

describe("study plan markdown", () => {
  const bio = studyPlanMarkdown(planFor(sample, "BIO 110"));

  it("opens with the template's two-line header", () => {
    expect(bio.split("\n").slice(0, 2)).toEqual([
      "# BIO 110 · Midterm · Thu Oct 15, 19:00-21:00, Exam Centre 100",
      expect.stringMatching(/^25% · Units 1-6 · 10 study days, about \d+(\.5)? h · Quiz 2 on Fri Oct 9 is on the way$/),
    ]);
  });

  it("has a heading per day and checkbox blocks", () => {
    expect(bio).toMatch(/^## Mon Oct 5 · [\d.]+ h$/m);
    expect(bio).toMatch(/^## Wed Oct 14 · [\d.]+ h · mock test$/m);
    expect(bio).toMatch(/^- \[ \] 2 h · Timed mock/m);
    expect(bio).toMatch(/^- \[ \] 15 min · Tonight/m);
    expect(bio).toMatch(/^- \[ \] Bring your student card/m);
    expect(bio).toMatch(/^\*\*Short on time\?\*\* Keep Unit 5 and Unit 6 and the mock\. Cut the review of Unit 1 and Unit 2 first\. Don't cut sleep\.$/m);
  });

  it("keeps everything else in collapsed details", () => {
    const after = bio.slice(bio.indexOf("<details>"));
    for (const heading of ["**Topics covered:**", "**Assumed:**", "**Sources:**", "**Clashes:**", "**Not checked:**", "Hours are estimates."]) {
      expect(after).toContain(heading);
    }
    expect(after.trimEnd().endsWith("</details>")).toBe(true);
    expect(bio.indexOf("Unit 1 (Chemistry of life), Unit 2")).toBeGreaterThan(bio.indexOf("<details>"));
  });

  it("names the file like the sample output", () => {
    expect(planFilename(planFor(sample, "BIO 110"))).toBe("BIO110-midterm-study-plan.md");
    expect(planFilename({ ...planFor(sample, "BIO 110"), what: "Quiz 2 / retake" })).toBe("BIO110-quiz-2-retake-study-plan.md");
  });

  it("shows the next 7 days of a long plan and summarizes the rest", () => {
    const his = planFor(sample, "HIS 201");
    expect(his.days.length).toBeGreaterThan(10);
    expect(fullDays(his)).toHaveLength(7);
    const md = studyPlanMarkdown(his);
    expect(md.match(/^## (?!Test day)/gm)).toHaveLength(7);
    expect(laterWeeks(his).join(" ")).toMatch(/with a mock test/);
    expect(md.slice(md.indexOf("<details>"))).toContain("**Later:** Week of Mon");
    expect(md).toContain("## Test day");
  });

  it("shows all the days of a short plan", () => {
    const bioPlan = planFor(sample, "BIO 110");
    expect(fullDays(bioPlan)).toBe(bioPlan.days);
    expect(laterWeeks(bioPlan)).toEqual([]);
  });
});

describe("weekly schedule", () => {
  const schedule = weeklySchedule(sample, sampleRows, TERM, TODAY);
  const md = weeklyScheduleMarkdown(schedule, "America/Toronto");

  it("covers Monday-to-Sunday weeks up to the last test", () => {
    expect(schedule.courses).toEqual(["BIO 110", "HIS 201", "CS 150"]);
    expect(schedule.weeks.map((w) => [w.monday, w.sunday])).toEqual([
      ["2026-10-05", "2026-10-11"],
      ["2026-10-12", "2026-10-18"],
      ["2026-10-19", "2026-10-25"],
      ["2026-10-26", "2026-11-01"],
    ]);
    expect(schedule.weeks[0].days).toHaveLength(7);
  });

  it("adds up to exactly what the plans say", () => {
    const fromPlans = totalsByDate(sample);
    for (const day of schedule.weeks.flatMap((w) => w.days)) {
      expect(day.total, day.date).toBe(fromPlans.get(day.date) ?? 0);
    }
    const all = [...fromPlans.values()].reduce((a, b) => a + b, 0);
    expect(schedule.weeks.reduce((sum, w) => sum + w.totals.at(-1)!, 0)).toBe(all);
  });

  it("follows the template, with tests in bold among the fixed events", () => {
    expect(md).toContain("# Study time, week of Oct 5 to Oct 11");
    expect(md).toContain("| Day | BIO 110 | HIS 201 | CS 150 | Total | Fixed events |");
    expect(md).toMatch(/\| Thu Oct 15 \|.*\*\*BIO 110 Midterm 19:00\*\* \|/);
    expect(md).toMatch(/\| Tue Oct 13 \|.*HIS 201 Essay proposal 13:00 \|/);
    expect(md).toMatch(/^\| \*\*Week\*\* \|/m);
    expect(md).toContain("Times are America/Toronto.");
  });

  it("explains light courses and what to cut", () => {
    expect(schedule.weeks[0].light).toEqual(["CS 150 = attend lecture, then 15 min with your notes after each one."]);
    expect(md).toContain("## If you need to cut");
    expect(md).toContain("Never cut: mocks, anything due this week, or sleep.");
    // Lowest weight goes first.
    expect(schedule.weeks[0].cuts[0]).toMatch(/^HIS 201's/);
  });

  it("flags days with too much on them", () => {
    expect(schedule.weeks[1].overloaded.join(" ")).toMatch(/Fri Oct 16: 2 things land/);
  });

  it("leaves out weeks with nothing in them", () => {
    const [week, ...rest] = weeklySchedule(plan([row({ when: "Mon Oct 5, 19:00" }), row({ what: "Final exam", when: "Dec 15, 9:00" })]), [], TERM, TODAY).weeks;
    expect(week.monday).toBe("2026-10-05");
    expect(rest.length).toBeLessThan(4);
  });

  it("is empty with no plans", () => {
    expect(weeklySchedule(plan([]), [], TERM, TODAY).weeks).toEqual([]);
  });
});

describe("editing plans", () => {
  const bio = planFor(sample, "BIO 110");
  const day = bio.days[0];
  const block = day.blocks[0];

  it("changes a block, marks the set edited, and flows into both exports", () => {
    const edited = changeBlock(sample, bio.id, day.date, block.id, { action: "Do flash cards", minutes: 200 });
    expect(edited.edited).toBe(true);
    expect(sample.edited).toBe(false);
    const after = planFor(edited, "BIO 110");
    expect(studyPlanMarkdown(after)).toContain("- [ ] 3.33 h · Do flash cards");
    const before = weeklySchedule(sample, sampleRows, TERM, TODAY).weeks[0].days[0];
    const now = weeklySchedule(edited, sampleRows, TERM, TODAY).weeks[0].days[0];
    expect(now.total - before.total).toBe(200 - block.minutes);
  });

  it("flags a schedule pushed over the limit by an edit", () => {
    const edited = changeBlock(sample, bio.id, day.date, block.id, { minutes: 500 });
    expect(weeklySchedule(edited, sampleRows, TERM, TODAY).weeks[0].overloaded.join(" ")).toMatch(/Mon Oct 5: .* over your daily limit/);
  });

  it("drops a day once its last block is removed", () => {
    let set = sample;
    for (const b of day.blocks) set = removeBlock(set, bio.id, day.date, b.id);
    expect(planFor(set, "BIO 110").days.some((d) => d.date === day.date)).toBe(false);
    expect(studyPlanMarkdown(planFor(set, "BIO 110"))).not.toContain("## Mon Oct 5");
  });

  it("adds blocks up to the template's limit, and blank ones block confirming", () => {
    let set = addBlock(sample, bio.id, day.date, "new-1");
    expect(blankBlocks(set)).toBe(1);
    for (let i = 2; i < 6; i++) set = addBlock(set, bio.id, day.date, `new-${i}`);
    expect(planFor(set, "BIO 110").days[0].blocks).toHaveLength(3);
    const filled = planFor(set, "BIO 110").days[0].blocks.filter((b) => !b.action);
    for (const b of filled) set = changeBlock(set, bio.id, day.date, b.id, { action: "Something" });
    expect(blankBlocks(set)).toBe(0);
  });

  it("edits test day like any other day", () => {
    const [reminder] = bio.testDay.blocks;
    const set = changeBlock(sample, bio.id, bio.date, reminder.id, { action: "Bring my aid sheet" });
    expect(studyPlanMarkdown(planFor(set, "BIO 110"))).toContain("- [ ] Bring my aid sheet");
  });

  it("only leaves other plans alone", () => {
    const set = removeBlock(sample, bio.id, day.date, block.id);
    expect(planFor(set, "HIS 201")).toBe(planFor(sample, "HIS 201"));
  });
});

describe("deadlinesBasis", () => {
  it("changes with a date but not with a parser question", () => {
    const base = deadlinesBasis([row({ when: "Thu Oct 15" })]);
    expect(deadlinesBasis([row({ when: "Thu Oct 15", question: "Sure?" })])).toBe(base);
    expect(deadlinesBasis([row({ when: "Fri Oct 16" })])).not.toBe(base);
  });
});

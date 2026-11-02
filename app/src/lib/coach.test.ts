import { describe, expect, it } from "vitest";
import {
  blockTopics,
  carryMarks,
  dueTopics,
  emptyCoach,
  guideFor,
  markBlock,
  materialsFor,
  pickTopics,
  planProgress,
  planTopics,
  progressOf,
  recordAttempt,
  reviveCoach,
  stageLine,
  stageOf,
  todayView,
  weekBoard,
  type Attempt,
  type CoachBlock,
  type CoachState,
} from "./coach";
import { addDays, parseTerm } from "./dates";
import { parseSyllabuses } from "./parse";
import { DEFAULT_PLAN_SETTINGS, buildPlans, changeBlock, removeBlock, type PlanSet } from "./planner";
import { SAMPLE_COURSES, sampleMarkdown } from "./test-helpers";
import type { SyllabusSource } from "./types";

const TERM = parseTerm("Fall 2026", 2026);
const TODAY = "2026-10-05"; // A Monday.
const sources: SyllabusSource[] = SAMPLE_COURSES.map((c) => ({ id: c, name: c, kind: "md", text: sampleMarkdown(c) }));
const extraction = parseSyllabuses(sources, { term: "Fall 2026" });
const build = (today = TODAY): PlanSet =>
  buildPlans({ rows: extraction.rows, courses: extraction.courses, sources, term: TERM, today, settings: DEFAULT_PLAN_SETTINGS });
const set = build();
const bio = set.plans.find((p) => p.course === "BIO 110")!;

function studyOn(s: PlanSet, coach: CoachState, date: string): CoachBlock[] {
  return todayView(s, coach, date).blocks;
}

describe("todayView", () => {
  it("lists today's study blocks from every plan", () => {
    const expected = set.plans.flatMap((p) => p.days.filter((d) => d.date === TODAY).flatMap((d) => d.blocks.map((b) => b.id)));
    expect(expected.length).toBeGreaterThan(0);
    expect(todayView(set, emptyCoach(), TODAY).blocks.map((b) => b.block.id).sort()).toEqual(expected.sort());
  });

  it("keeps blocks with no minutes as reminders on a test day", () => {
    const view = todayView(set, emptyCoach(), bio.date);
    expect(view.reminders.some((r) => r.course === "BIO 110" && /student card/.test(r.block.action))).toBe(true);
    expect(view.blocks.every((b) => b.block.minutes > 0)).toBe(true);
  });

  it("points at the next study day when today is empty", () => {
    const off = buildPlans({ rows: extraction.rows, courses: extraction.courses, sources, term: TERM, today: TODAY, settings: { ...DEFAULT_PLAN_SETTINGS, daysOff: [1] } });
    const view = todayView(off, emptyCoach(), TODAY);
    expect(view.blocks).toEqual([]);
    expect(view.nextDay).toBe("2026-10-06");
  });

  it("carries unfinished blocks from the past week, but not done ones or passed tests", () => {
    const first = studyOn(set, emptyCoach(), TODAY);
    const later = addDays(TODAY, 2);
    expect(todayView(set, emptyCoach(), later).earlier.map((b) => b.block.id)).toEqual(expect.arrayContaining(first.map((b) => b.block.id)));

    const coach = markBlock(emptyCoach(), first[0], "done");
    expect(todayView(set, coach, later).earlier.map((b) => b.block.id)).not.toContain(first[0].block.id);

    const afterAll = addDays(set.plans.at(-1)!.date, 1);
    expect(todayView(set, emptyCoach(), afterAll).earlier).toEqual([]);
  });
});

describe("marking blocks", () => {
  const first = studyOn(set, emptyCoach(), TODAY)[0];

  it("marks done and not done, and clears a mark", () => {
    let coach = markBlock(emptyCoach(), first, "done");
    expect(studyOn(set, coach, TODAY)[0].status).toBe("done");
    coach = markBlock(coach, first, "not-done");
    expect(studyOn(set, coach, TODAY)[0].status).toBe("not-done");
    coach = markBlock(coach, first, null);
    expect(studyOn(set, coach, TODAY)[0].status).toBeNull();
  });

  it("keeps a mark when the student fixes a block's text", () => {
    const coach = markBlock(emptyCoach(), first, "done");
    const edited = changeBlock(set, first.planId, first.date, first.block.id, { action: "Fixed a typo" });
    expect(studyOn(edited, coach, TODAY)[0].status).toBe("done");
  });

  it("doesn't carry a test-day mark over to a later plan's test day, whose block id is the same", () => {
    const day = (date: string) => ({ date, label: "", blocks: [{ id: "BIO 110-testday-0", minutes: 30, action: "Light review", kind: "rest" as const }] });
    const planOn = (date: string): PlanSet => ({ ...set, plans: [{ ...bio, date, days: [], testDay: day(date) }] });
    const coach = markBlock(emptyCoach(), todayView(planOn("2026-10-15"), emptyCoach(), "2026-10-15").blocks[0], "done");
    expect(todayView(planOn("2026-10-15"), coach, "2026-10-15").blocks[0].status).toBe("done");
    expect(todayView(planOn("2026-11-20"), coach, "2026-11-20").blocks[0].status).toBeNull();
  });

  it("survives JSON and shrugs off a bad save", () => {
    const coach = markBlock(emptyCoach(), first, "done");
    expect(reviveCoach(JSON.parse(JSON.stringify(coach)))).toEqual(coach);
    expect(reviveCoach(undefined)).toEqual(emptyCoach());
    expect(reviveCoach({ marks: 3, topics: [] })).toEqual(emptyCoach());
  });
});

describe("carryMarks after a rebuild", () => {
  it("keeps a mark on a block that came back the same, and drops one that changed", () => {
    const [a, b] = studyOn(set, emptyCoach(), TODAY);
    const coach = markBlock(markBlock(emptyCoach(), a, "done"), { ...b, block: { ...b.block, action: "Something replaced" } }, "not-done");
    const carried = carryMarks(coach, set, TODAY);
    expect(studyOn(set, carried, TODAY)[0].status).toBe("done");
    expect(Object.keys(carried.marks)).toHaveLength(1);
  });

  it("keeps done work from before the rebuild on the week's board", () => {
    const first = studyOn(set, emptyCoach(), TODAY)[0];
    const skipped = studyOn(set, emptyCoach(), TODAY)[1];
    const coach = markBlock(markBlock(emptyCoach(), first, "done"), skipped, "not-done");
    const wednesday = addDays(TODAY, 2);
    const rebuilt = build(wednesday);
    const carried = carryMarks(coach, rebuilt, wednesday);
    const board = weekBoard(rebuilt, carried, wednesday);
    expect(board.days[0].items.map((i) => i.block.id)).toEqual([first.block.id]);
    expect(board.done).toBe(1);
  });
});

describe("weekBoard", () => {
  it("runs Monday to Sunday around today", () => {
    const board = weekBoard(set, emptyCoach(), "2026-10-07");
    expect([board.monday, board.sunday]).toEqual(["2026-10-05", "2026-10-11"]);
    expect(board.days.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  });

  it("counts done against left, in blocks and minutes", () => {
    const before = weekBoard(set, emptyCoach(), TODAY);
    expect(before.done).toBe(0);
    const first = studyOn(set, emptyCoach(), TODAY)[0];
    const after = weekBoard(set, markBlock(emptyCoach(), first, "done"), TODAY);
    expect(after.done).toBe(1);
    expect(after.left).toBe(before.left - 1);
    expect(after.doneMinutes).toBe(first.block.minutes);
    expect(after.leftMinutes).toBe(before.leftMinutes - first.block.minutes);
  });

  it("counts a not-done block as still left", () => {
    const first = studyOn(set, emptyCoach(), TODAY)[0];
    const board = weekBoard(set, markBlock(emptyCoach(), first, "not-done"), TODAY);
    expect(board.done).toBe(0);
    expect(board.left).toBe(weekBoard(set, emptyCoach(), TODAY).left);
  });

  it("doesn't show a block the student removed", () => {
    const first = studyOn(set, emptyCoach(), TODAY)[0];
    const coach = markBlock(emptyCoach(), first, "done");
    const removed = removeBlock(set, first.planId, first.date, first.block.id);
    const ids = weekBoard(removed, coach, TODAY).days.flatMap((d) => d.items.map((i) => i.block.id));
    expect(ids).not.toContain(first.block.id);
  });

  it("gives each plan its own done and left", () => {
    const first = studyOn(set, emptyCoach(), TODAY)[0];
    const plan = set.plans.find((p) => p.id === first.planId)!;
    const before = planProgress(plan, emptyCoach());
    const after = planProgress(plan, markBlock(emptyCoach(), first, "done"));
    expect(after.done).toBe(1);
    expect(after.left).toBe(before.left - 1);
  });
});

describe("blockTopics", () => {
  const block = (action: string, kind: "learn" | "recall" | "mock" | "onTheWay" | "custom" = "recall") => ({ id: "x", minutes: 30, action, kind });

  it("names the plan's topics from the syllabus", () => {
    expect(planTopics(bio, sources).some((t) => t.name)).toBe(true);
  });

  it("finds a single topic and takes its name from the syllabus", () => {
    const named = planTopics(bio, sources).find((t) => t.name)!;
    const topics = blockTopics(bio, block(`Learn ${named.label}: go through it once`, "learn"), sources);
    expect(topics).toEqual([named]);
  });

  it("doesn't mistake Unit 1 for Unit 10", () => {
    const topics = blockTopics(bio, block("Close the notes: write the key ideas of Unit 10"), sources);
    expect(topics.map((t) => t.label)).toEqual(["Unit 10"]);
  });

  it("expands a merged label, and treats a chapter as a reading unless the plan is by chapter", () => {
    const topics = blockTopics(bio, block("Learn Units 1-3: go through ch. 5 once", "learn"), sources);
    expect(topics.map((t) => t.label)).toEqual(["Unit 1", "Unit 2", "Unit 3"]);
  });

  it("follows the student's edit", () => {
    expect(blockTopics(bio, block("My own plan: Unit 2 flashcards", "custom"), sources).map((t) => t.label)).toEqual(["Unit 2"]);
  });

  it("uses the whole plan for a block that names no topic", () => {
    expect(blockTopics(bio, block("Mini mock, closed book", "mock"), sources)).toEqual(planTopics(bio, sources));
  });

  it("has no topics for work on an assignment", () => {
    expect(blockTopics(bio, block("Start Lab report 1: read the instructions", "onTheWay"), sources)).toEqual([]);
  });

  it("matches free-text topics whole", () => {
    const plan = { ...bio, covers: "Cells, genetics" };
    expect(blockTopics(plan, block("Learn Cells: go through your notes", "learn"), []).map((t) => t.label)).toEqual(["Cells"]);
  });

  it("falls back to splitting the notes when coverage is unknown", () => {
    const plan = { ...bio, covers: "" };
    expect(planTopics(plan, []).map((t) => t.label)).toContain("the middle third of your notes");
  });
});

describe("progression", () => {
  const topic = { label: "Unit 3", name: "Membranes" };
  const TEST = "2026-11-02";
  const attempt = (date: string, correct = true, over: Partial<Attempt> = {}): Attempt => ({ course: "BIO 110", topic, correct, recall: true, date, testDate: TEST, ...over });
  const run = (...attempts: Attempt[]) => attempts.reduce(recordAttempt, emptyCoach());
  const of = (coach: CoachState) => progressOf(coach, "BIO 110", topic);
  const D1 = "2026-10-05";
  const firstPass = [attempt(D1), attempt(D1), attempt(D1)];

  it("starts new, and any attempt makes it learning", () => {
    expect(stageOf(undefined)).toBe("new");
    expect(stageOf(of(run(attempt(D1))))).toBe("learning");
    expect(stageOf(of(run(attempt(D1, false))))).toBe("learning");
  });

  it("reaches reviewing after 3 correct recalls in one session, not across sessions", () => {
    expect(stageOf(of(run(...firstPass)))).toBe("reviewing");
    expect(stageOf(of(run(attempt(D1), attempt(D1), attempt("2026-10-06"))))).toBe("learning");
  });

  it("reaches secure after correct recall on 2 later days, and stops coming back", () => {
    const coach = run(...firstPass, attempt("2026-10-06"), attempt("2026-10-08"));
    expect(stageOf(of(coach))).toBe("secure");
    expect(of(coach)!.nextDue).toBeNull();
  });

  it("counts a later day once, however many answers it gets", () => {
    expect(stageOf(of(run(...firstPass, attempt("2026-10-06"), attempt("2026-10-06"))))).toBe("reviewing");
  });

  it("doesn't count more recalls on the first day as a later day", () => {
    expect(of(run(...firstPass, attempt(D1)))!.spacedDays).toEqual([]);
  });

  it("brings a wrong answer back the next day", () => {
    expect(of(run(attempt(D1, false)))!.nextDue).toBe("2026-10-06");
  });

  it("grows the gap after each right answer on a later day", () => {
    const one = of(run(...firstPass, attempt("2026-10-06")))!;
    expect(one.nextDue).toBe("2026-10-08");
    expect(one.gap).toBe(2);
    const missed = of(run(...firstPass, attempt("2026-10-06", false)))!;
    expect(missed.nextDue).toBe("2026-10-07");
    expect(missed.gap).toBe(1);
  });

  it("drops a secure topic back to reviewing on a miss, which then has to re-earn it", () => {
    const secure = [...firstPass, attempt("2026-10-06"), attempt("2026-10-08")];
    const missed = run(...secure, attempt("2026-10-20", false));
    expect(stageOf(of(missed))).toBe("reviewing");
    expect(of(missed)!.spacedDays).toEqual([]);
    expect(stageOf(of(run(...secure, attempt("2026-10-20", false), attempt("2026-10-21"), attempt("2026-10-23"))))).toBe("secure");
  });

  it("gives no credit for a later day with a miss on it, whichever came first", () => {
    const missFirst = of(run(...firstPass, attempt("2026-10-06", false), attempt("2026-10-06")))!;
    expect(missFirst.spacedDays).toEqual([]);
    expect(missFirst.nextDue).toBe("2026-10-07");
    expect(of(run(...firstPass, attempt("2026-10-06"), attempt("2026-10-06", false)))!.spacedDays).toEqual([]);
  });

  it("gives multiple choice no credit when right, but brings it back when wrong", () => {
    const right = of(run(attempt(D1, true, { recall: false }), attempt(D1, true, { recall: false }), attempt(D1, true, { recall: false })))!;
    expect(stageOf(right)).toBe("learning");
    expect(right.sessionCorrect).toBe(0);
    expect(right.nextDue).toBeNull();
    expect(of(run(attempt(D1, false, { recall: false })))!.nextDue).toBe("2026-10-06");
  });

  it("caps reviews at the day before the test", () => {
    const close = { testDate: "2026-10-08" };
    const coach = run(attempt(D1, true, close), attempt(D1, true, close), attempt(D1, true, close), attempt("2026-10-06", true, close));
    expect(of(coach)!.nextDue).toBe("2026-10-07");
    expect(of(run(attempt("2026-10-07", true, close)))!.nextDue).toBeNull();
    expect(of(run(attempt("2026-10-07", false, close)))!.nextDue).toBeNull();
  });

  it("doesn't cap when no test date is known", () => {
    expect(of(run(attempt(D1, false, { testDate: null })))!.nextDue).toBe("2026-10-06");
  });

  it("keeps each course's topics apart", () => {
    const coach = run(attempt(D1), attempt(D1, true, { course: "CS 150" }));
    expect(progressOf(coach, "BIO 110", topic)!.attempts).toBe(1);
    expect(progressOf(coach, "CS 150", topic)!.attempts).toBe(1);
  });

  it("says where a topic stands", () => {
    expect(stageLine(undefined)).toBe("New");
    expect(stageLine(of(run(attempt(D1, false))))).toBe("Learning, back Tue Oct 6");
  });

  it("round-trips through storage", () => {
    const coach = run(...firstPass);
    expect(reviveCoach(JSON.parse(JSON.stringify(coach)))).toEqual(coach);
  });
});

describe("dueTopics and pickTopics", () => {
  const unit = (n: number) => planTopics(bio, sources).find((t) => t.label === `Unit ${n}`)!;
  const wrong = (coach: CoachState, n: number, date: string) => recordAttempt(coach, { course: "BIO 110", topic: unit(n), correct: false, recall: true, date, testDate: bio.date });

  it("lists a missed topic as due the next day, not before", () => {
    const coach = wrong(emptyCoach(), 2, TODAY);
    expect(dueTopics(set, coach, sources, TODAY)).toEqual([]);
    const due = dueTopics(set, coach, sources, "2026-10-06");
    expect(due.map((d) => [d.plan.course, d.topic.label, d.stage])).toEqual([["BIO 110", "Unit 2", "learning"]]);
  });

  it("stops listing a topic once its test is here", () => {
    const coach = wrong(emptyCoach(), 2, TODAY);
    expect(dueTopics(set, coach, sources, bio.date)).toEqual([]);
  });

  it("puts what's due first, then what's least secure", () => {
    const topics = [unit(1), unit(2), unit(3)];
    let coach = recordAttempt(emptyCoach(), { course: "BIO 110", topic: unit(1), correct: true, recall: true, date: "2026-10-01", testDate: null });
    coach = wrong(coach, 3, TODAY);
    const picked = pickTopics(topics, "BIO 110", coach, "2026-10-06", 2).map((t) => t.label);
    expect(picked).toEqual(["Unit 1", "Unit 3"]);
    expect(pickTopics(topics, "BIO 110", emptyCoach(), TODAY, 2).map((t) => t.label)).toEqual(["Unit 1", "Unit 2"]);
  });
});

describe("guideFor", () => {
  it("is short for every kind of block", () => {
    for (const kind of ["learn", "recall", "mock", "redo", "rest", "item", "onTheWay", "work", "custom", null] as const) {
      const steps = guideFor(kind, false);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.length).toBeLessThanOrEqual(3);
    }
  });

  it("sends problem courses to paper", () => {
    expect(guideFor("recall", true).join(" ")).toMatch(/by hand/);
    expect(guideFor("recall", false).join(" ")).not.toMatch(/by hand/);
  });
});

describe("materialsFor", () => {
  const canvas: SyllabusSource = {
    id: "c",
    name: "BIO 110 · Syllabus.pdf",
    kind: "canvas",
    text: "Intro\n| 3 | Unit 3. Membranes | ch. 5 |\n|---|---|---|\nUnit 30 is elsewhere\nMembranes lab on Friday",
    course: { code: "BIO 110", name: "Cells" },
    url: "https://q.utoronto.ca/courses/7/files/9",
  };
  const other: SyllabusSource = { id: "o", name: "HIS 201 · a.pdf", kind: "canvas", text: "Unit 3", course: { code: "HIS 201", name: "" } };
  const uploaded: SyllabusSource = { id: "u", name: "notes.md", kind: "md", text: "BIO 110 outline\nnothing relevant" };
  const topic = { label: "Unit 3", name: "Membranes" };

  it("finds the lines about today's topic in the course's own files", () => {
    const [m] = materialsFor("BIO 110", [topic], [other, canvas]);
    expect(m).toEqual({
      name: "BIO 110 · Syllabus.pdf",
      url: "https://q.utoronto.ca/courses/7/files/9",
      snippets: ["3 · Unit 3. Membranes · ch. 5", "Membranes lab on Friday"],
    });
  });

  it("leaves out other courses, and puts files that mention the topic first", () => {
    const names = materialsFor("BIO 110", [topic], [uploaded, other, canvas]).map((m) => m.name);
    expect(names).toEqual(["BIO 110 · Syllabus.pdf", "notes.md"]);
  });

  it("is empty when nothing is in session", () => {
    expect(materialsFor("BIO 110", [topic], [])).toEqual([]);
  });

  it("won't link to anything but a web address", () => {
    const [m] = materialsFor("BIO 110", [topic], [{ ...canvas, url: "javascript:alert(1)" }]);
    expect(m.url).toBeUndefined();
  });

  it("caps how much it shows", () => {
    const long = { ...canvas, text: Array.from({ length: 50 }, (_, i) => `Unit 3 line ${i} ${"x".repeat(500)}`).join("\n") };
    const [m] = materialsFor("BIO 110", [topic], [long]);
    expect(m.snippets).toHaveLength(5);
    expect(m.snippets[0].length).toBeLessThanOrEqual(240);
  });
});

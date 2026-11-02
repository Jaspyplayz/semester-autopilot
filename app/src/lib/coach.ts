// Coach: what's on today, what's done and what's left, and how well each topic
// is sticking. Pure, like the planner, and derived from the plans so an edit to a
// plan shows up here. The progression rules come from docs/study-methods.md:
//
// - new -> learning -> reviewing -> secure.
// - Reviewing takes 3 correct recalls in one session; secure takes correct recall
//   on 2 later days (successive relearning).
// - Wrong: the topic comes back the next day. Right: the gap grows, capped so the
//   last review lands before the test.

import { addDays, dayOfWeek, formatDate } from "./dates";
import type { BlockKind, CoursePlan, PlanBlock, PlanSet } from "./planner";
import { GENERIC_TOPICS, numberedTopics, sourceFor, sourcesFor, syllabusTopics, topicsFromCovers, type Topic } from "./topics";
import type { SyllabusSource } from "./types";

export type BlockStatus = "done" | "not-done";

export interface BlockMark {
  status: BlockStatus;
  blockId: string;
  date: string;
  course: string;
  /** Kept so the week's board can still show this after a rebuild drops the day. */
  action: string;
  minutes: number;
}

export type Stage = "new" | "learning" | "reviewing" | "secure";

export const STAGES: Stage[] = ["new", "learning", "reviewing", "secure"];

export interface TopicProgress {
  course: string;
  label: string;
  name?: string;
  attempts: number;
  correct: number;
  sessionDate: string;
  sessionCorrect: number;
  lastMissOn: string;
  /** The day 3 correct recalls came in one session. */
  firstPassOn: string | null;
  /** Later days with a correct recall. A miss starts these again. */
  spacedDays: string[];
  gap: number;
  nextDue: string | null;
}

export interface CoachState {
  marks: Record<string, BlockMark>;
  topics: Record<string, TopicProgress>;
}

const SESSION_RECALLS = 3;
const SPACED_DAYS = 2;
const EARLIER_DAYS = 7;
const MAX_SNIPPETS = 5;
const MAX_SNIPPET_CHARS = 240;

export const emptyCoach = (): CoachState => ({ marks: {}, topics: {} });

const isRecord = (v: unknown): v is Record<string, never> => !!v && typeof v === "object" && !Array.isArray(v);

/** Whatever came out of storage, as a usable state. */
export function reviveCoach(raw: unknown): CoachState {
  if (!isRecord(raw)) return emptyCoach();
  const { marks, topics } = raw as Partial<CoachState>;
  return { marks: isRecord(marks) ? marks : {}, topics: isRecord(topics) ? topics : {} };
}

// ---------------------------------------------------------------------------
// Blocks: done and not done

export interface CoachBlock {
  planId: string;
  course: string;
  date: string;
  block: PlanBlock;
  status: BlockStatus | null;
}

// A test day's block ids don't carry the date, and the plan's target moves on.
const markKey = (blockId: string, date: string) => `${blockId}@${date}`;

function allBlocks(set: PlanSet, coach: CoachState): CoachBlock[] {
  return set.plans.flatMap((plan) =>
    [...plan.days, plan.testDay].flatMap((day) =>
      day.blocks.map((block) => ({
        planId: plan.id,
        course: plan.course,
        date: day.date,
        block,
        status: coach.marks[markKey(block.id, day.date)]?.status ?? null,
      })),
    ),
  );
}

/** A block with no minutes is a reminder, such as what to bring. There's nothing to mark. */
const isStudy = (b: CoachBlock) => b.block.minutes > 0;

export function markBlock(coach: CoachState, item: CoachBlock, status: BlockStatus | null): CoachState {
  const key = markKey(item.block.id, item.date);
  const marks = { ...coach.marks };
  if (status) {
    marks[key] = { status, blockId: item.block.id, date: item.date, course: item.course, action: item.block.action, minutes: item.block.minutes };
  } else {
    delete marks[key];
  }
  return { ...coach, marks };
}

/**
 * After a rebuild, a mark holds if the same task is still there, and work already
 * done stays on the record. Anything else was about a block that's been replaced.
 */
export function carryMarks(coach: CoachState, set: PlanSet, today: string): CoachState {
  const current = new Map(allBlocks(set, emptyCoach()).map((b) => [markKey(b.block.id, b.date), b.block.action]));
  const marks = Object.fromEntries(
    Object.entries(coach.marks).filter(([key, mark]) => current.get(key) === mark.action || (mark.status === "done" && mark.date < today)),
  );
  return { ...coach, marks };
}

export interface TodayView {
  blocks: CoachBlock[];
  reminders: CoachBlock[];
  /** Unfinished blocks from the past week, for tests still to come. */
  earlier: CoachBlock[];
  /** The next day with study on it, when today has none. */
  nextDay: string | null;
}

export function todayView(set: PlanSet, coach: CoachState, today: string): TodayView {
  const all = allBlocks(set, coach);
  const todays = all.filter((b) => b.date === today);
  const blocks = todays.filter(isStudy);
  const stillOn = new Set(set.plans.filter((p) => p.date >= today).map((p) => p.id));
  const since = addDays(today, -EARLIER_DAYS);
  return {
    blocks,
    reminders: todays.filter((b) => !isStudy(b)),
    earlier: all
      .filter((b) => isStudy(b) && b.date < today && b.date >= since && b.status !== "done" && stillOn.has(b.planId))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    nextDay: blocks.length
      ? null
      : (all
          .filter((b) => isStudy(b) && b.date > today)
          .map((b) => b.date)
          .sort()[0] ?? null),
  };
}

export interface BoardCount {
  done: number;
  left: number;
  doneMinutes: number;
  leftMinutes: number;
}

function countBlocks(items: Array<{ status: BlockStatus | null; minutes: number }>): BoardCount {
  const done = items.filter((i) => i.status === "done");
  const left = items.filter((i) => i.status !== "done");
  const minutes = (list: typeof items) => list.reduce((sum, i) => sum + i.minutes, 0);
  return { done: done.length, left: left.length, doneMinutes: minutes(done), leftMinutes: minutes(left) };
}

const withMinutes = (b: CoachBlock) => ({ status: b.status, minutes: b.block.minutes });

export interface BoardDay extends BoardCount {
  date: string;
  items: CoachBlock[];
}

export interface WeekBoard extends BoardCount {
  monday: string;
  sunday: string;
  days: BoardDay[];
}

/** Monday to Sunday around today. Work done before the last rebuild still shows. */
export function weekBoard(set: PlanSet, coach: CoachState, today: string): WeekBoard {
  const monday = addDays(today, -((dayOfWeek(today) + 6) % 7));
  const sunday = addDays(monday, 6);
  const all = allBlocks(set, coach).filter(isStudy);
  const current = new Set(all.map((b) => markKey(b.block.id, b.date)));
  const history: CoachBlock[] = Object.entries(coach.marks)
    .filter(([key, m]) => !current.has(key) && m.status === "done" && m.date < set.builtOn)
    .map(([, m]) => ({
      planId: "",
      course: m.course,
      date: m.date,
      block: { id: m.blockId, minutes: m.minutes, action: m.action, kind: "custom" },
      status: m.status,
    }));
  const days: BoardDay[] = [];
  for (let date = monday; date <= sunday; date = addDays(date, 1)) {
    const items = [...history, ...all].filter((b) => b.date === date);
    days.push({ date, items, ...countBlocks(items.map(withMinutes)) });
  }
  return { monday, sunday, days, ...countBlocks(days.flatMap((d) => d.items).map(withMinutes)) };
}

/** Done and left across a whole plan. */
export function planProgress(plan: CoursePlan, coach: CoachState): BoardCount {
  const set = { plans: [plan] } as PlanSet;
  return countBlocks(allBlocks(set, coach).filter(isStudy).map(withMinutes));
}

// ---------------------------------------------------------------------------
// Topics: which ones a block is about

export function planTopics(plan: CoursePlan, sources: SyllabusSource[]): Topic[] {
  if (plan.kind !== "test") return [];
  const source = sourceFor(plan.course, sources);
  const named = topicsFromCovers(plan.covers, source ? syllabusTopics(source) : null);
  return named.length ? named : GENERIC_TOPICS;
}

function mentions(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}($|\\W)`, "i").test(text);
}

/**
 * Worked out from the block's text, so an edit to the block changes its topics
 * and plans saved before Coach existed still work. Blocks that name nothing, such
 * as a mock, are about the whole plan. Blocks of work on an assignment have no topics.
 */
export function blockTopics(plan: CoursePlan, block: PlanBlock, sources: SyllabusSource[]): Topic[] {
  const all = planTopics(plan, sources);
  const source = sourceFor(plan.course, sources);
  // "go through ch. 5" is a reading unless the plan itself is by chapter.
  const byChapter = all.some((t) => t.label.startsWith("Ch."));
  const numbered = numberedTopics(block.action, source ? syllabusTopics(source) : null).filter((t) => byChapter || !t.label.startsWith("Ch."));
  const found = new Map<string, Topic>();
  for (const t of numbered) found.set(t.label, all.find((a) => a.label === t.label) ?? t);
  for (const t of all) if (mentions(block.action, t.label)) found.set(t.label, t);
  if (found.size) return [...found.values()];
  return block.kind === "onTheWay" || block.kind === "work" ? [] : all;
}

const topicKey = (course: string, label: string) => `${course}|${label.toLowerCase()}`;

export function progressOf(coach: CoachState, course: string, topic: Pick<Topic, "label">): TopicProgress | undefined {
  return coach.topics[topicKey(course, topic.label)];
}

export function stageOf(progress: TopicProgress | undefined): Stage {
  if (!progress || progress.attempts === 0) return "new";
  if (!progress.firstPassOn) return "learning";
  return progress.spacedDays.length >= SPACED_DAYS ? "secure" : "reviewing";
}

/** A quiz's topics: anything due first, then whatever's least secure. */
export function pickTopics(topics: Topic[], course: string, coach: CoachState, today: string, max: number): Topic[] {
  const rank = (t: Topic) => {
    const p = progressOf(coach, course, t);
    const due = p?.nextDue && p.nextDue <= today ? 0 : 1;
    return due * STAGES.length + STAGES.indexOf(stageOf(p));
  };
  return topics
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .slice(0, max)
    .map(({ t }) => t);
}

export interface DueTopic {
  plan: CoursePlan;
  topic: Topic;
  stage: Stage;
}

/** Topics coming back today, for tests still to come. */
export function dueTopics(set: PlanSet, coach: CoachState, sources: SyllabusSource[], today: string): DueTopic[] {
  return set.plans
    .filter((plan) => plan.date > today)
    .flatMap((plan) =>
      planTopics(plan, sources).flatMap((topic) => {
        const progress = progressOf(coach, plan.course, topic);
        return progress?.nextDue && progress.nextDue <= today ? [{ plan, topic, stage: stageOf(progress) }] : [];
      }),
    );
}

// ---------------------------------------------------------------------------
// Topics: how an attempt changes them

export interface Attempt {
  course: string;
  topic: Topic;
  correct: boolean;
  /** False for multiple choice. Recognizing an answer isn't recalling it, so a right one earns nothing. */
  recall: boolean;
  date: string;
  /** The test this is for, which reviews have to land before. */
  testDate: string | null;
}

/** The day to come back, moved up to the day before the test, or null if that's too late. */
function dueBefore(next: string, date: string, testDate: string | null): string | null {
  if (!testDate) return next;
  const last = addDays(testDate, -1);
  if (next <= last) return next;
  return last > date ? last : null;
}

export function recordAttempt(coach: CoachState, attempt: Attempt): CoachState {
  const { course, topic, correct, recall, date, testDate } = attempt;
  const key = topicKey(course, topic.label);
  const prev: TopicProgress = coach.topics[key] ?? {
    course,
    label: topic.label,
    attempts: 0,
    correct: 0,
    sessionDate: "",
    sessionCorrect: 0,
    lastMissOn: "",
    firstPassOn: null,
    spacedDays: [],
    gap: 1,
    nextDue: null,
  };
  const sessionCorrect = prev.sessionDate === date ? prev.sessionCorrect : 0;
  const next: TopicProgress = {
    ...prev,
    name: topic.name ?? prev.name,
    attempts: prev.attempts + 1,
    correct: prev.correct + (correct ? 1 : 0),
    sessionDate: date,
    sessionCorrect,
  };

  if (!correct) {
    next.lastMissOn = date;
    next.spacedDays = [];
    next.gap = 1;
    next.nextDue = dueBefore(addDays(date, 1), date, testDate);
  } else if (!recall) {
    next.nextDue = prev.nextDue;
  } else {
    next.sessionCorrect = sessionCorrect + 1;
    if (!next.firstPassOn) {
      if (next.sessionCorrect >= SESSION_RECALLS) next.firstPassOn = date;
      next.gap = 1;
      next.nextDue = dueBefore(addDays(date, 1), date, testDate);
    } else if (date > next.firstPassOn && prev.lastMissOn !== date && !prev.spacedDays.includes(date)) {
      next.spacedDays = [...prev.spacedDays, date];
      next.gap = prev.gap * 2;
      next.nextDue = next.spacedDays.length >= SPACED_DAYS ? null : dueBefore(addDays(date, next.gap), date, testDate);
    }
  }
  return { ...coach, topics: { ...coach.topics, [key]: next } };
}

/** "Secure", or "Reviewing, back Wed Nov 4", for the end of a quiz. */
export function stageLine(progress: TopicProgress | undefined): string {
  const stage = stageOf(progress);
  const label = stage.charAt(0).toUpperCase() + stage.slice(1);
  return progress?.nextDue ? `${label}, back ${formatDate(progress.nextDue)}` : label;
}

/** What to do in a study block, in a few short steps. No block means a topic that's come back. */
export function guideFor(kind: BlockKind | null, problem: boolean): string[] {
  const attempt = problem ? "Work problems by hand. Pick the method yourself." : "Write or say what you remember.";
  switch (kind) {
    case "learn":
      return ["Go through it once. No rereading.", problem ? "Work 2 examples with your notes open." : "Note the key ideas as you go.", "Then close everything and try the quiz."];
    case "recall":
      return ["Notes closed first. Getting stuck is part of it.", attempt, "Check, then fix what you missed."];
    case "mock":
      return ["Set a timer and close your notes.", "Mark it yourself, honestly.", "Your weak topics go first next time."];
    case "redo":
      return ["Redo each mistake from scratch, without the solution.", "Then try the quiz on what's left."];
    case "rest":
      return ["Light review only.", "Stop at bedtime. Sleep does more than another hour."];
    case "work":
    case "onTheWay":
      return ["Do the one step in this block.", "Keep the instructions and rubric open."];
    case null:
      return ["This topic is back because it's due.", "Notes closed first.", attempt];
    default:
      return ["Do this block your way.", "Then test yourself with the quiz."];
  }
}

// ---------------------------------------------------------------------------
// Materials: what's already in session. Nothing here goes and fetches anything.

export interface Material {
  name: string;
  url?: string;
  /** Lines that mention today's topics. */
  snippets: string[];
}

function matchingLines(text: string, topics: Topic[]): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^\s*\|?\s*/, "").replace(/\s*\|?\s*$/, "").replace(/\s*\|\s*/g, " · ").trim();
    if (!line || /^[-:· ]+$/.test(line)) continue;
    if (topics.some((t) => mentions(line, t.label) || (t.name && mentions(line, t.name)))) {
      out.push(line.slice(0, MAX_SNIPPET_CHARS));
      if (out.length >= MAX_SNIPPETS) break;
    }
  }
  return out;
}

/** The course's syllabuses and files already imported, those that mention these topics first. */
export function materialsFor(course: string, topics: Topic[], sources: SyllabusSource[]): Material[] {
  const usable = (url?: string) => (url && /^https?:\/\//i.test(url) ? url : undefined);
  return sourcesFor(course, sources)
    .map((s) => ({ name: s.name, url: usable(s.url), snippets: matchingLines(s.text, topics) }))
    .sort((a, b) => Number(b.snippets.length > 0) - Number(a.snippets.length > 0));
}

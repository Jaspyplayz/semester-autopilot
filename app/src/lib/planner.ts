// Deterministic study planner: SKILL.md Step 3 without an LLM, from the confirmed
// deadline table. The rules come from docs/study-methods.md and the format from
// references/study-plan-template.md:
//
// - Learn a topic once, then recall it on later days, with gaps that grow.
// - Mini mock about a third of the way in, timed mock on the last study day.
// - Problem courses mix topics when recalling; a topic's first session stays blocked.
// - Never more than the daily maximum, no study on days off, and the night before
//   a test is light review and sleep.
//
// Same input, same plan. Dates are calendar strings in the school's time zone, so
// no time zone math happens here.

import { addDays, dayOfWeek, daysBetween, displayTime, formatDate, parseWhen, type Term } from "./dates";
import { GENERIC_TOPICS, fitTopics, sourceFor, syllabusTopics, topicTitle, topicWhere, topicsFromCovers, type Topic } from "./topics";
import type { CourseInfo, Deadline, SyllabusSource } from "./types";

export interface PlanSettings {
  maxHoursPerDay: number;
  /** Weekdays with no study, 0 = Sunday. */
  daysOff: number[];
}

export const DEFAULT_PLAN_SETTINGS: PlanSettings = { maxHoursPerDay: 6, daysOff: [] };

export type BlockKind = "learn" | "recall" | "mock" | "redo" | "rest" | "item" | "onTheWay" | "work" | "custom";

export interface PlanBlock {
  id: string;
  /** 0 for a reminder with no study time, such as what to bring. */
  minutes: number;
  action: string;
  kind: BlockKind;
}

export interface PlanDay {
  date: string;
  /** "mock test", "HIS 201 Essay proposal 13:00". Empty on most days. */
  label: string;
  blocks: PlanBlock[];
}

export interface CoursePlan {
  id: string;
  course: string;
  kind: "test" | "work";
  /** "Midterm", from "Midterm, Exam Centre 100". */
  what: string;
  /** "Exam Centre 100", or empty. */
  place: string;
  when: string;
  date: string;
  worth: string;
  covers: string;
  /** Extra header text, such as "Quiz 2 on Fri Oct 9 is on the way". */
  note: string;
  /** Lectures and skimming only before this date, while closer tests come first. */
  lightUntil: string | null;
  days: PlanDay[];
  testDay: PlanDay;
  shortOnTime: string;
  details: { topics: string; assumed: string; sources: string; clashes: string; notChecked: string };
}

export interface PlanSet {
  plans: CoursePlan[];
  /** Why something got no plan, such as a final with no exact date yet. */
  notPlanned: string[];
  settings: PlanSettings;
  builtOn: string;
  /** The deadlines these plans were built from: see deadlinesBasis. */
  basis: string;
  edited: boolean;
  confirmedOn: string | null;
}

export interface PlanInput {
  rows: Deadline[];
  courses: CourseInfo[];
  sources: SyllabusSource[];
  term: Term;
  today: string;
  settings: PlanSettings;
}

export const MAX_BLOCKS_PER_DAY = 3;
/** Above this many study days, the template shows the next 7 and summarizes the rest. */
export const LONG_PLAN_DAYS = 10;
const FULL_DAYS_IN_LONG_PLAN = 7;

const TEST_WINDOW_DAYS = 21;
/** How far ahead a test can be and still come before smaller work. */
const TARGET_HORIZON_DAYS = 30;
const WORK_WINDOW_DAYS = 14;
const TEST_DAY_REVIEW = 30;
const SNAP = 15;
const MIN_SESSION = 30;
const MAX_SESSION = 120;
// About 16 h for a 25% midterm, as in the sample plan.
const TEST_MINUTES_PER_PERCENT = 39;
const WORK_MINUTES_PER_PERCENT = 30;
const ASSUMED_WEIGHT = 10;
const MAJOR_WEIGHT = 15;

const snapDown = (minutes: number) => Math.floor(minutes / SNAP) * SNAP;
const snap = (minutes: number) => Math.round(minutes / SNAP) * SNAP;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ---------------------------------------------------------------------------
// Reading the table

/** The biggest percentage in "25%", "5% (assumed)", "30-40%"; null if there is none. */
export function worthPercent(worth: string): number | null {
  const m = worth.match(/\d+(?:\.\d+)?(?=\s*%)|\d+(?:\.\d+)?(?=\s*-\s*\d)/g);
  return m ? Math.max(...m.map(Number)) : null;
}

export function isTestLike(what: string): boolean {
  if (/\b(midterm|exam|quiz|test)\b/i.test(what)) return true;
  return /\bfinal\b/i.test(what) && !/\b(essay|paper|project|report|presentation|assignment)\b/i.test(what);
}

const PROBLEM_CODE = /^(MATH?|STAT?|PHYS?|CHEM?|CHM|ECON?|CSC?|COMP)\s*\d/i;
const PROBLEM_NAME = /\b(calculus|algebra|mathematics|statistics|physics|chemistry|economics|programming)\b/i;

/** Math, physics, stats, chem, econ, CS: courses where mixing problem types helps. A guess from the name. */
export function isProblemCourse(course: string, name = ""): boolean {
  return PROBLEM_CODE.test(course) || PROBLEM_NAME.test(name);
}

function splitWhat(what: string): { name: string; place: string } {
  const [name, ...rest] = what.split(",");
  return { name: name.trim(), place: rest.join(",").trim() };
}

interface Item {
  row: Deadline;
  date: string;
  start?: string;
  end?: string;
  assumedDate: boolean;
  weight: number;
  knownWeight: boolean;
  test: boolean;
  name: string;
  place: string;
}

function toItem(row: Deadline, term: Term): Item | null {
  const w = parseWhen(row.when, term);
  if (w?.kind !== "date") return null;
  const known = worthPercent(row.worth);
  return {
    row,
    date: w.date,
    start: w.start,
    end: w.end,
    assumedDate: w.assumed,
    weight: known ?? ASSUMED_WEIGHT,
    knownWeight: known !== null,
    test: isTestLike(row.what),
    ...splitWhat(row.what),
  };
}

function isMajor(item: Item): boolean {
  if (!item.test) return false;
  return item.weight >= MAJOR_WEIGHT || /\b(midterm|exam|final)\b/i.test(item.name);
}

/**
 * SKILL.md: one plan per course for its next test. A big test in the window wins,
 * then the next smaller one, then a big test further off, then the next piece of
 * work, so courses without a dated test still get a plan.
 */
function pickTarget(items: Item[], today: string): Item | null {
  const upcoming = items.filter((i) => i.date >= today);
  const horizon = addDays(today, TARGET_HORIZON_DAYS);
  const soon = upcoming.filter((i) => i.date <= horizon);
  return (
    soon.find(isMajor) ??
    soon.find((i) => i.test) ??
    soon[0] ??
    upcoming.find(isMajor) ??
    upcoming.find((i) => i.test) ??
    upcoming[0] ??
    null
  );
}

// ---------------------------------------------------------------------------
// Fitting the courses around each other

interface Placed {
  minutes: number;
  action: string;
  kind: BlockKind;
}

interface Track {
  target: Item;
  course: string;
  problem: boolean;
  items: Item[];
  budget: number;
  windowStart: string;
  lightUntil: string | null;
  finalDay: string | null;
  testDayReview: boolean;
  fixed: Map<string, Placed[]>;
  flex: Map<string, number>;
  remaining: number;
  accrued: number;
}

class Calendar {
  private used = new Map<string, number>();
  private claimedBy = new Map<string, string>();

  constructor(
    private settings: PlanSettings,
    private lightDays: Set<string>,
  ) {}

  isOff(date: string): boolean {
    return this.settings.daysOff.includes(dayOfWeek(date));
  }

  /** Light on the day of and after a test, so the student can rest. */
  cap(date: string): number {
    if (this.isOff(date)) return 0;
    const max = Math.round(this.settings.maxHoursPerDay * 60);
    return this.lightDays.has(date) ? snapDown(max / 2) : snapDown(max);
  }

  left(date: string): number {
    return this.cap(date) - (this.used.get(date) ?? 0);
  }

  use(date: string, minutes: number): void {
    this.used.set(date, (this.used.get(date) ?? 0) + minutes);
  }

  claim(date: string, course: string): void {
    this.claimedBy.set(date, course);
  }

  /** The day before a bigger test belongs to that course. */
  isClaimedByOther(date: string, course: string): boolean {
    const owner = this.claimedBy.get(date);
    return !!owner && owner !== course;
  }
}

const byPriority = (a: Track, b: Track) =>
  b.target.weight - a.target.weight || (a.target.date < b.target.date ? -1 : a.target.date > b.target.date ? 1 : a.course.localeCompare(b.course));

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function fixedOn(track: Track, date: string): Placed[] {
  return track.fixed.get(date) ?? [];
}

function place(track: Track, cal: Calendar, date: string, block: Placed): void {
  track.fixed.set(date, [...fixedOn(track, date), block]);
  cal.use(date, block.minutes);
  // Smaller items on the way have their own time, on top of the target's hours.
  if (block.kind !== "item" && block.kind !== "onTheWay") track.remaining -= block.minutes;
}

/** Latest day on or before `latest` that fits a block for this course, or null. */
function latestFit(track: Track, cal: Calendar, latest: string, today: string, minutes: number): string | null {
  for (let d = latest; d >= today; d = addDays(d, -1)) {
    if (d === track.finalDay || cal.isClaimedByOther(d, track.course)) continue;
    if (fixedOn(track, d).length >= MAX_BLOCKS_PER_DAY) continue;
    if (cal.left(d) >= minutes) return d;
  }
  return null;
}

function placeFinalDay(track: Track, cal: Calendar, today: string): void {
  const { target } = track;
  if (target.test && (!target.start || target.start >= "12:00") && cal.left(target.date) >= TEST_DAY_REVIEW) {
    track.testDayReview = true;
    cal.use(target.date, TEST_DAY_REVIEW);
  }
  let day: string | null = null;
  for (let d = addDays(target.date, -1); d >= today; d = addDays(d, -1)) {
    if (cal.isOff(d) || cal.isClaimedByOther(d, track.course) || cal.left(d) < MIN_SESSION) continue;
    day = d;
    break;
  }
  if (!day) return;
  track.finalDay = day;
  const room = cal.left(day);
  if (target.test) {
    const wanted = clamp(snap(track.budget / 8), MIN_SESSION, MAX_SESSION);
    const mock = Math.max(MIN_SESSION, Math.min(wanted, snapDown(room * 0.6)));
    const redo = Math.min(Math.max(SNAP, snap(mock / 2)), snapDown(room - mock));
    const covers = target.row.covers.replace(/\(assumed\)/gi, "").trim();
    place(track, cal, day, {
      minutes: mock,
      kind: "mock",
      action: `Timed mock, closed book: a past test if one is posted, otherwise mixed questions from ${covers || "everything so far"}`,
    });
    if (redo > 0) place(track, cal, day, { minutes: redo, kind: "redo", action: "Redo every mistake, then test yourself again on your weakest topic" });
    if (cal.left(day) >= SNAP) {
      place(track, cal, day, { minutes: SNAP, kind: "rest", action: "Tonight: light review only, then a full night's sleep. No all-nighter" });
    }
  } else {
    place(track, cal, day, {
      minutes: Math.min(room, clamp(snap(track.budget / 5), MIN_SESSION, MAX_SESSION)),
      kind: "work",
      action: `Finish ${target.name}: check it against the instructions or rubric, then get it ready to hand in`,
    });
  }
}

/** Smaller items on the way to the target get their own time, so the week's hours are real. */
function placeOnTheWay(track: Track, cal: Calendar, today: string): void {
  const { target } = track;
  const lastUseful = addDays(target.date, 3);
  for (const item of track.items) {
    if (item === target || item.date < today || item.date > lastUseful) continue;
    const beforeDue = addDays(item.date < target.date ? item.date : target.date, -1);
    if (item.test) {
      const total = clamp(snap(item.weight * 12), MIN_SESSION, MAX_SESSION);
      const day = latestFit(track, cal, beforeDue, today, total);
      if (day) place(track, cal, day, { minutes: total, kind: "item", action: `${item.name} prep: test yourself on ${item.row.covers.replace(/\(assumed\)/gi, "").trim() || "what it covers"}, notes closed` });
      const free = fixedOn(track, item.date).length < MAX_BLOCKS_PER_DAY;
      if (/online/i.test(item.place) && item.date < target.date && free && cal.left(item.date) >= MIN_SESSION) {
        place(track, cal, item.date, { minutes: MIN_SESSION, kind: "item", action: `Take ${item.name}${item.end ? ` before ${displayTime(item.end)}` : ""}` });
      }
      continue;
    }
    // A bigger piece of work gets started early enough to come back to it.
    const total = clamp(snap(item.weight * 18), MIN_SESSION, 2 * MAX_SESSION);
    const half = snap(total / 2);
    const start = item.weight >= ASSUMED_WEIGHT ? latestFit(track, cal, addDays(item.date, -4), today, half) : null;
    if (start) place(track, cal, start, { minutes: half, kind: "onTheWay", action: `Start ${item.name}: read the instructions and get the first part done` });
    const rest = start ? total - half : Math.min(total, MAX_SESSION);
    const finish = latestFit(track, cal, beforeDue, today, rest);
    if (finish) place(track, cal, finish, { minutes: rest, kind: "onTheWay", action: `Finish ${item.name}, due ${formatDate(item.date)}${item.end || item.start ? `, ${displayTime(item.end ?? item.start!)}` : ""}` });
  }
}

function canFlex(track: Track, cal: Calendar, date: string): boolean {
  if (date < track.windowStart || date >= track.target.date || date === track.finalDay) return false;
  if (track.lightUntil && date < track.lightUntil) return false;
  if (cal.cap(date) <= 0 || cal.isClaimedByOther(date, track.course)) return false;
  return fixedOn(track, date).length < MAX_BLOCKS_PER_DAY;
}

/** Spreads each course's hours evenly; when a day is full, sooner and heavier tests win. */
function fillSessions(tracks: Track[], cal: Calendar, today: string): void {
  const last = tracks.reduce((d, t) => (t.target.date > d ? t.target.date : d), today);
  for (const date of datesBetween(today, last)) {
    const wants: Array<{ track: Track; want: number; urgency: number }> = [];
    for (const track of tracks) {
      if (!canFlex(track, cal, date) || track.remaining <= 0) continue;
      const daysLeft = datesBetween(date, addDays(track.target.date, -1)).filter((d) => canFlex(track, cal, d)).length;
      track.accrued += track.remaining / daysLeft;
      if (track.accrued < MIN_SESSION) continue;
      const want = snapDown(Math.min(track.accrued, MAX_SESSION, Math.max(track.remaining, MIN_SESSION)));
      const days = Math.max(1, daysBetween(date, track.target.date));
      wants.push({ track, want, urgency: (track.target.weight / days) * want });
    }
    const room = cal.left(date);
    const total = wants.reduce((sum, w) => sum + w.want, 0);
    const urgency = wants.reduce((sum, w) => sum + w.urgency, 0);
    for (const { track, want, urgency: u } of wants) {
      const share = total <= room ? want : snapDown(Math.min(want, (room * u) / urgency));
      if (share < MIN_SESSION) continue;
      track.flex.set(date, share);
      cal.use(date, share);
      track.remaining -= share;
      track.accrued = Math.max(0, track.accrued - share);
    }
  }
}

// ---------------------------------------------------------------------------
// Writing the blocks

interface TopicState {
  topic: Topic;
  learnedOn: string | null;
  recalls: number;
  lastSeen: string;
  nextDue: string;
}

function recallAction(t: TopicState, others: TopicState[], problem: boolean): string {
  const where = topicWhere(t.topic);
  if (problem) {
    if (!others.length) return `Practice set, notes closed: 3 problems from ${t.topic.label}. Explain each step, then check`;
    const labels = [t, ...others].map((o) => o.topic.label).join(", ");
    return `Mixed set, notes closed: 2 problems each from ${labels}. Pick the method yourself, then check`;
  }
  switch (t.recalls % 3) {
    case 0:
      return `Close the notes: write the key ideas of ${topicTitle(t.topic)} from memory, then check against ${where}`;
    case 1:
      return `Explain ${t.topic.label} out loud from memory, answering "why?" as you go, then check against ${where}`;
    default:
      return `Sketch ${t.topic.label} as a diagram or timeline from memory, then compare with ${where}`;
  }
}

function learnAction(topic: Topic, problem: boolean): string {
  const where = topicWhere(topic);
  return problem
    ? `Learn ${topicTitle(topic)}: go through ${where} once, then work 2 examples with the notes open`
    : `Learn ${topicTitle(topic)}: go through ${where} once and note the key ideas`;
}

function blockSplit(minutes: number, slots: number): number[] {
  const count = Math.min(minutes >= 75 ? 2 : 1, slots);
  if (count <= 1) return count ? [minutes] : [];
  const first = snap(minutes / 2);
  return [first, minutes - first];
}

/** Learn, then recall on later days with growing gaps; a mini mock about a third of the way in. */
function studyBlocks(track: Track, topics: Topic[], sessions: Array<[string, number]>): Map<string, Placed[]> {
  const { target, problem, fixed } = track;
  const out = new Map<string, Placed[]>();
  const shapes = sessions.map(([date, minutes]) => ({
    date,
    parts: blockSplit(minutes, MAX_BLOCKS_PER_DAY - (fixed.get(date)?.length ?? 0)),
  }));
  const totalSlots = shapes.reduce((sum, s) => sum + s.parts.length, 0);
  const mockAt = shapes.length >= 4 ? Math.round(shapes.length / 3) : -1;
  // Each topic needs a learn and a recall slot; the mini mock and final pass need one each.
  const fitted = fitTopics(topics, Math.max(1, Math.floor((totalSlots - (mockAt >= 0 ? 2 : 1)) / 2)));
  const states: TopicState[] = fitted.map((topic) => ({ topic, learnedOn: null, recalls: 0, lastSeen: "", nextDue: "" }));
  let slotsLeft = totalSlots;
  let finalPassDone = false;

  for (const [index, { date, parts }] of shapes.entries()) {
    const blocks: Placed[] = [];
    for (const [partIndex, minutes] of parts.entries()) {
      slotsLeft -= 1;
      if (index === mockAt && partIndex === 0) {
        blocks.push({ minutes, kind: "mock", action: "Mini mock, closed book: mixed questions on what you've covered so far. Mark it, then put your weak topics first" });
        continue;
      }
      const unlearned = states.filter((t) => !t.learnedOn);
      const canRecall = states.filter((t) => t.learnedOn && t.learnedOn < date && t.lastSeen < date);
      const firstRecall = canRecall.find((t) => !t.recalls);
      const due = canRecall.filter((t) => t.nextDue <= date).sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1));
      const daysToTest = daysBetween(date, target.date);
      if (!finalPassDone && !firstRecall && !unlearned.length && daysToTest >= 2 && daysToTest <= 3) {
        finalPassDone = true;
        const all = states.map((t) => t.topic.label).join(", ");
        blocks.push({
          minutes,
          kind: "recall",
          action: problem
            ? `Final pass, notes closed: a mixed set across ${all}. Pick the method yourself, then check`
            : `Final pass, notes closed: write what you remember of ${all}, then check what you missed`,
        });
        for (const t of states) t.lastSeen = date;
        continue;
      }
      // Every topic is owed a learn block and a later recall, so unlearned ones can't wait forever.
      const mustLearn = unlearned.length > 0 && unlearned.length * 2 + 1 >= slotsLeft;
      const chosen =
        firstRecall ??
        (mustLearn ? undefined : (due[0] ?? (unlearned.length ? undefined : [...canRecall].sort((a, b) => (a.lastSeen < b.lastSeen ? -1 : 1))[0])));
      if (chosen) {
        const others = canRecall.filter((t) => t !== chosen).slice(0, 2);
        blocks.push({ minutes, kind: "recall", action: recallAction(chosen, others, problem) });
        chosen.recalls += 1;
        chosen.lastSeen = date;
        // Next gap is about 15% of the days left, per Cepeda et al. (2008).
        chosen.nextDue = addDays(date, Math.max(2, Math.round(daysBetween(date, target.date) * 0.15)));
        continue;
      }
      const next = unlearned[0];
      if (next) {
        blocks.push({ minutes, kind: "learn", action: learnAction(next.topic, problem) });
        next.learnedOn = date;
        next.lastSeen = date;
        next.nextDue = addDays(date, 1);
        continue;
      }
      const label = states.map((t) => t.topic.label).join(", ");
      blocks.push({ minutes, kind: "recall", action: `Close the notes: write what you remember of ${label}, then check what you missed` });
    }
    out.set(date, blocks);
  }
  return out;
}

// What to do first, then what to say when a step takes more than one session.
const WORK_STEPS: Array<[string, string]> = [
  ["read the instructions and rubric, then list exactly what it asks for", "read the instructions and rubric, then list exactly what it asks for"],
  ["gather what you need and write a rough outline", "keep building the outline"],
  ["draft the hardest part first", "keep drafting the hardest part"],
  ["draft the rest", "keep drafting the rest"],
  ["read it as the marker would, then fix the biggest problem", "keep revising, biggest problems first"],
];

function workBlocks(target: Item, sessions: Array<[string, number]>): Map<string, Placed[]> {
  const out = new Map<string, Placed[]>();
  // The first session reads the brief; the rest spread over the other steps.
  const stepAt = (i: number) => (i === 0 ? 0 : 1 + Math.floor(((i - 1) * (WORK_STEPS.length - 1)) / Math.max(sessions.length - 1, 1)));
  for (const [i, [date, minutes]] of sessions.entries()) {
    const step = stepAt(i);
    const again = i > 0 && stepAt(i - 1) === step;
    out.set(date, [{ minutes, kind: "work", action: `${target.name}: ${WORK_STEPS[step][again ? 1 : 0]}` }]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// One course's plan

function eventLabel(item: Item, course: string): string {
  const time = item.start ? ` ${displayTime(item.start)}` : "";
  const window = item.start && item.end ? ` ${displayTime(item.start)}-${displayTime(item.end)}` : time;
  return item.row.course === course ? `${item.name}${window}` : `${item.row.course} ${item.name}${window}`;
}

/** "Unit 5 and Unit 6", for the "Short on time?" line. */
function listTopics(topics: Topic[]): string {
  return topics.map((t) => t.label).join(" and ");
}

function shortOnTime(track: Track, topics: Topic[]): string {
  const { target } = track;
  if (!target.test) {
    return `Keep the hardest part and the final check. Cut extra polish first. Don't cut sleep.`;
  }
  if (topics.length >= 3 && topics !== GENERIC_TOPICS) {
    const keep = topics.slice(-2);
    const cut = topics.slice(0, Math.min(2, topics.length - 2));
    return `Keep ${listTopics(keep)} and the mock. Cut the review of ${listTopics(cut)} first. Don't cut sleep.`;
  }
  return "Keep the recall blocks and the mock. Cut extra first-pass reading first. Don't cut sleep.";
}

function buildPlan(track: Track, input: PlanInput, others: Item[]): CoursePlan {
  const { target, course, problem } = track;
  const source = sourceFor(course, input.sources);
  const named = topicsFromCovers(target.row.covers, source ? syllabusTopics(source) : null);
  const topics = named.length ? named : GENERIC_TOPICS;

  const sessions = [...track.flex.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const generated = target.test ? studyBlocks(track, topics, sessions) : workBlocks(target, sessions);
  const allDates = new Set([...track.fixed.keys(), ...generated.keys()]);
  const everyItem = [...track.items, ...others];

  const days: PlanDay[] = [...allDates].sort().map((date) => {
    const placed = [...fixedOn(track, date), ...(generated.get(date) ?? [])];
    const finalFirst = date === track.finalDay && target.test ? ["mock test"] : [];
    const labels = [
      ...finalFirst,
      ...everyItem.filter((i) => i.date === date && i !== target).map((i) => eventLabel(i, course)),
    ];
    return {
      date,
      label: labels.join(" · "),
      blocks: placed.map((b, i) => ({ ...b, id: `${course}-${date}-${i}` })),
    };
  });

  const bring: Placed[] = target.test
    ? [
        /online/i.test(target.place)
          ? { minutes: 0, kind: "item", action: "Check your login works before it opens" }
          : { minutes: 0, kind: "item", action: "Bring your student card, plus any calculator or aid sheet the syllabus allows" },
        ...(track.testDayReview
          ? [{ minutes: TEST_DAY_REVIEW, kind: "rest" as const, action: "Light review of your own summaries only" }]
          : []),
      ]
    : [{ minutes: 0, kind: "item", action: `Hand in ${target.name}${target.end || target.start ? ` by ${displayTime(target.end ?? target.start!)}` : ""}, then check it went through` }];

  const onTheWay = track.items.find((i) => i !== target && i.date >= input.today && i.date < target.date && i.test);
  const clashWindow = others
    .filter((i) => i.date >= addDays(target.date, -7) && i.date <= addDays(target.date, 1))
    .map((i) => `${i.row.course} ${i.name} (${formatDate(i.date)})`);
  const planned = track.budget - Math.max(0, track.remaining);
  const short = track.remaining >= 120;

  const assumed: string[] = [];
  if (target.assumedDate) assumed.push("The date is marked assumed in your table.");
  if (!target.knownWeight) assumed.push(`The weight isn't known, so this plan treats it as ${ASSUMED_WEIGHT}%.`);
  if (/\(assumed\)/i.test(target.row.worth)) assumed.push("The weight is marked assumed in your table.");
  if (/\(assumed\)/i.test(target.row.covers)) assumed.push("The coverage is marked assumed in your table.");
  if (target.test && !named.length) assumed.push("Coverage isn't known, so this splits your notes into thirds. Swap in the real topics.");
  if (target.test && problem) assumed.push("This looks like a problem-based course, so recall blocks mix topics.");
  if (target.test) assumed.push("The format isn't known, so the mock mixes question types.");

  return {
    id: `${course}-${target.row.id}`.replace(/\s+/g, "-"),
    course,
    kind: target.test ? "test" : "work",
    what: target.name,
    place: target.place,
    when: target.row.when,
    date: target.date,
    worth: target.row.worth,
    covers: target.row.covers,
    note: onTheWay ? `${onTheWay.name} on ${formatDate(onTheWay.date)} is on the way` : "",
    lightUntil: track.lightUntil,
    days,
    testDay: {
      date: target.date,
      label: "",
      blocks: bring.map((b, i) => ({ ...b, id: `${course}-testday-${i}` })),
    },
    shortOnTime: shortOnTime(track, topics),
    details: {
      topics: !target.test ? "See the instructions on the course site." : named.length ? named.map(topicTitle).join(", ") : "Not listed in your table.",
      assumed: assumed.join(" ") || "Nothing beyond your confirmed table.",
      sources: source ? "Readings and weeks from your syllabus, plus your slides and notes on the course site." : "Your slides and notes on the course site.",
      clashes:
        [
          clashWindow.length ? `Also that week: ${clashWindow.join(", ")}.` : "",
          track.lightUntil ? `Lectures and skimming only until ${formatDate(track.lightUntil)}, while closer tests come first.` : "",
          short ? `Your daily limit left about ${Math.round(planned / 30) / 2} h of the ${Math.round(track.budget / 30) / 2} h this would ideally get.` : "",
        ]
          .filter(Boolean)
          .join(" ") || "None that week.",
      notChecked: !target.test
        ? "The full instructions and rubric weren't checked. Read them on the course site."
        : `Past tests and practice questions weren't checked. Ask in lecture whether any exist. ${/\bTBA\b/i.test(target.place) || !target.place ? "Check the room on the course site the week before." : ""}`.trim(),
    },
  };
}

// ---------------------------------------------------------------------------
// The whole set

/** Identifies the confirmed deadlines, so edited plans survive a re-confirm that changed nothing. */
export function deadlinesBasis(rows: Deadline[]): string {
  return JSON.stringify(rows.map((r) => [r.course, r.what, r.worth, r.covers, r.when]));
}

export function buildPlans(input: PlanInput): PlanSet {
  const { rows, term, today, settings, courses } = input;
  const items = rows.map((r) => toItem(r, term)).filter((i): i is Item => i !== null);
  const names = [...new Set(rows.map((r) => r.course.trim()).filter((c) => c && c.toLowerCase() !== "all"))];

  const tracks: Track[] = [];
  const notPlanned: string[] = [];
  for (const course of names) {
    const own = items.filter((i) => i.row.course.trim() === course).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const target = pickTarget(own, today);
    if (!target) {
      notPlanned.push(`${course}: nothing has an exact date yet, so there's no plan. Add a date and rebuild.`);
      continue;
    }
    const perPercent = target.test ? TEST_MINUTES_PER_PERCENT : WORK_MINUTES_PER_PERCENT;
    const budget = clamp(snap(target.weight * perPercent), 120, 30 * 60);
    const window = target.test ? TEST_WINDOW_DAYS : WORK_WINDOW_DAYS;
    const start = addDays(target.date, -window);
    tracks.push({
      target,
      course,
      problem: isProblemCourse(course, courses.find((c) => c.code === course)?.name),
      items: own,
      budget,
      windowStart: start > today ? start : today,
      lightUntil: null,
      finalDay: null,
      testDayReview: false,
      fixed: new Map(),
      flex: new Map(),
      remaining: budget,
      accrued: 0,
    });
  }
  for (const row of rows) {
    if (isTestLike(row.what) && parseWhen(row.when, term)?.kind !== "date") {
      notPlanned.push(`${row.course} ${splitWhat(row.what).name}: no exact date yet. Add it when it's posted, then rebuild.`);
    }
  }

  const testDates = tracks.filter((t) => t.target.test);
  // Courses with a test a week or more off wait for the closer big tests.
  for (const track of tracks) {
    const closer = testDates
      .filter((o) => o !== track && o.target.date <= addDays(track.target.date, -7))
      .filter((o) => o.target.weight >= MAJOR_WEIGHT || o.target.weight >= track.target.weight)
      .map((o) => o.target.date)
      .sort();
    const until = closer.at(-1);
    if (until && addDays(until, 1) > today) track.lightUntil = addDays(until, 1);
  }

  const lightDays = new Set<string>();
  for (const item of items) {
    if (isMajor(item)) {
      lightDays.add(item.date);
      lightDays.add(addDays(item.date, 1));
    }
  }
  const cal = new Calendar(settings, lightDays);

  const priority = [...tracks].sort(byPriority);
  // Bigger tests claim the day before first, then take their mock wherever it lands.
  for (const track of priority.filter((t) => t.target.test)) {
    const dayBefore = addDays(track.target.date, -1);
    if (dayBefore >= today && !cal.isClaimedByOther(dayBefore, track.course) && !cal.isOff(dayBefore)) cal.claim(dayBefore, track.course);
    placeFinalDay(track, cal, today);
  }
  for (const track of priority.filter((t) => !t.target.test)) placeFinalDay(track, cal, today);
  for (const track of priority) placeOnTheWay(track, cal, today);
  fillSessions(priority, cal, today);

  const plans = tracks
    .map((track) => {
      const others = items.filter((i) => i.row.course.trim() !== track.course && i.date >= today);
      return buildPlan(track, input, others);
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.course.localeCompare(b.course)));

  return {
    plans,
    notPlanned,
    settings,
    builtOn: today,
    basis: deadlinesBasis(rows),
    edited: false,
    confirmedOn: null,
  };
}

// ---------------------------------------------------------------------------
// What the student sees, and what they can change

export function planMinutes(days: PlanDay[]): number {
  return days.reduce((sum, d) => sum + dayMinutes(d), 0);
}

export function dayMinutes(day: PlanDay): number {
  return day.blocks.reduce((sum, b) => sum + b.minutes, 0);
}

/** "45 min", "1 h", "1.25 h". */
export function formatMinutes(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${Math.round((minutes / 60) * 100) / 100} h`;
}

/** Hours for a heading or table cell: "1.5", "0.25". */
export function formatHours(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}

/** The days shown in full. A long plan shows the next 7; see laterWeeks for the rest. */
export function fullDays(plan: CoursePlan): PlanDay[] {
  return plan.days.length > LONG_PLAN_DAYS ? plan.days.slice(0, FULL_DAYS_IN_LONG_PLAN) : plan.days;
}

/** One line per week for the days fullDays leaves out. */
export function laterWeeks(plan: CoursePlan): string[] {
  const later = plan.days.slice(fullDays(plan).length);
  const weeks = new Map<string, PlanDay[]>();
  for (const day of later) {
    const monday = addDays(day.date, -((dayOfWeek(day.date) + 6) % 7));
    weeks.set(monday, [...(weeks.get(monday) ?? []), day]);
  }
  return [...weeks.entries()].map(([monday, days]) => {
    const hasMock = days.some((d) => d.blocks.some((b) => b.kind === "mock"));
    const count = `${days.length} study ${days.length === 1 ? "day" : "days"}`;
    return `Week of ${formatDate(monday)}: ${count}, about ${formatHours(planMinutes(days))} h${hasMock ? ", with a mock test" : ""}.`;
  });
}

export function changeBlock(
  set: PlanSet,
  planId: string,
  date: string,
  blockId: string,
  change: Partial<Pick<PlanBlock, "minutes" | "action">>,
): PlanSet {
  return changeDays(set, planId, date, (blocks) => blocks.map((b) => (b.id === blockId ? { ...b, ...change, kind: b.kind } : b)));
}

export function removeBlock(set: PlanSet, planId: string, date: string, blockId: string): PlanSet {
  return changeDays(set, planId, date, (blocks) => blocks.filter((b) => b.id !== blockId));
}

export function addBlock(set: PlanSet, planId: string, date: string, id: string): PlanSet {
  return changeDays(set, planId, date, (blocks) =>
    blocks.length >= MAX_BLOCKS_PER_DAY ? blocks : [...blocks, { id, minutes: 30, action: "", kind: "custom" }],
  );
}

export function changeShortOnTime(set: PlanSet, planId: string, text: string): PlanSet {
  return { ...set, edited: true, plans: set.plans.map((p) => (p.id === planId ? { ...p, shortOnTime: text } : p)) };
}

function changeDays(set: PlanSet, planId: string, date: string, change: (blocks: PlanBlock[]) => PlanBlock[]): PlanSet {
  return {
    ...set,
    edited: true,
    plans: set.plans.map((plan) => {
      if (plan.id !== planId) return plan;
      if (plan.testDay.date === date) return { ...plan, testDay: { ...plan.testDay, blocks: change(plan.testDay.blocks) } };
      // A day with nothing left disappears, as the template skips days with no study.
      const days = plan.days
        .map((d) => (d.date === date ? { ...d, blocks: change(d.blocks) } : d))
        .filter((d) => d.blocks.length > 0);
      return { ...plan, days };
    }),
  };
}

/** Blocks the student added but never filled in. They block confirming. */
export function blankBlocks(set: PlanSet): number {
  return set.plans.flatMap((p) => [...p.days, p.testDay]).flatMap((d) => d.blocks).filter((b) => !b.action.trim()).length;
}

// The combined weekly schedule (references/weekly-schedule-template.md). Always
// derived from the plans, so an edit to a plan shows up here and the two can't
// disagree.

import { addDays, dayOfWeek, displayTime, formatDate, parseWhen, type Term } from "./dates";
import { isTestLike, worthPercent, type PlanDay, type PlanSet } from "./planner";
import type { Deadline } from "./types";

export interface ScheduleDay {
  date: string;
  /** Minutes per course, in the same order as WeeklySchedule.courses. */
  minutes: number[];
  total: number;
  /** "**BIO 110 Midterm 19:00**", "HIS 201 Essay proposal 13:00". */
  events: string[];
}

export interface ScheduleWeek {
  monday: string;
  sunday: string;
  days: ScheduleDay[];
  /** Minutes per course across the week, then the week's total last. */
  totals: number[];
  light: string[];
  overloaded: string[];
  cuts: string[];
}

export interface WeeklySchedule {
  courses: string[];
  weeks: ScheduleWeek[];
}

const mondayOf = (date: string) => addDays(date, -((dayOfWeek(date) + 6) % 7));

function allDays(set: PlanSet, course: string): PlanDay[] {
  return set.plans.filter((p) => p.course === course).flatMap((p) => [...p.days, p.testDay]);
}

function fixedEvents(rows: Deadline[], term: Term): Map<string, Array<{ text: string; test: boolean }>> {
  const out = new Map<string, Array<{ text: string; test: boolean }>>();
  for (const row of rows) {
    const w = parseWhen(row.when, term);
    if (w?.kind !== "date") continue;
    const name = row.what.split(",")[0].trim();
    const time = w.start ? ` ${displayTime(w.start)}` : "";
    const entry = { text: `${row.course} ${name}${time}`, test: isTestLike(row.what) };
    out.set(w.date, [...(out.get(w.date) ?? []), entry]);
  }
  return out;
}

function overloadLine(day: ScheduleDay, tests: number, dues: number, maxMinutes: number): string | null {
  const hours = `${Math.round((day.total / 60) * 100) / 100} h`;
  if (day.total > maxMinutes) {
    return `${formatDate(day.date)}: ${hours} is over your daily limit. Move a block, or cut it using the list below.`;
  }
  if (tests + dues >= 2) {
    return `${formatDate(day.date)}: ${tests + dues} things land on this day. Finish what you can the day before.`;
  }
  if (tests >= 1 && day.total >= maxMinutes * 0.75) {
    return `${formatDate(day.date)}: ${hours} of study around a test. Do the test's course first, and stop at bedtime.`;
  }
  return null;
}

function cutList(set: PlanSet, week: ScheduleDay[]): string[] {
  const dates = new Set(week.map((d) => d.date));
  const options = set.plans
    .map((plan) => {
      const minutes = plan.days
        .filter((d) => dates.has(d.date))
        .flatMap((d) => d.blocks)
        .filter((b) => b.kind === "learn" || b.kind === "recall")
        .reduce((sum, b) => sum + b.minutes, 0);
      return { course: plan.course, minutes, weight: worthPercent(plan.worth) ?? 0 };
    })
    .filter((o) => o.minutes > 0)
    .sort((a, b) => a.weight - b.weight || a.course.localeCompare(b.course));
  return options.slice(0, 2).map((o) => `${o.course}'s extra learn and recall blocks (frees about ${Math.round((o.minutes / 60) * 100) / 100} h)`);
}

export function weeklySchedule(set: PlanSet, rows: Deadline[], term: Term, today: string): WeeklySchedule {
  const courses = [...new Set(set.plans.map((p) => p.course))];
  if (!set.plans.length) return { courses, weeks: [] };

  const events = fixedEvents(rows, term);
  const lastDate = set.plans
    .flatMap((p) => [p.date, ...p.days.map((d) => d.date)])
    .reduce((latest, d) => (d > latest ? d : latest), today);
  const firstMonday = mondayOf(set.builtOn < today ? set.builtOn : today);
  const maxMinutes = set.settings.maxHoursPerDay * 60;

  const weeks: ScheduleWeek[] = [];
  for (let monday = firstMonday; monday <= lastDate; monday = addDays(monday, 7)) {
    const days: ScheduleDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      const minutes = courses.map((course) =>
        allDays(set, course)
          .filter((d) => d.date === date)
          .flatMap((d) => d.blocks)
          .reduce((sum, b) => sum + b.minutes, 0),
      );
      const fixed = events.get(date) ?? [];
      days.push({
        date,
        minutes,
        total: minutes.reduce((a, b) => a + b, 0),
        events: fixed.map((e) => (e.test ? `**${e.text}**` : e.text)),
      });
    }
    // A far-off test shouldn't print pages of empty weeks.
    if (days.every((d) => d.total === 0 && d.events.length === 0)) continue;
    const sunday = addDays(monday, 6);
    const light = set.plans
      .filter((p) => (p.lightUntil && p.lightUntil > monday) || (p.days[0]?.date ?? p.date) > sunday)
      .filter((p) => p.date > monday)
      .map((p) => `${p.course} = attend lecture, then 15 min with your notes after each one.`);
    const overloaded = days
      .map((day) => {
        const fixed = events.get(day.date) ?? [];
        const tests = fixed.filter((e) => e.test).length;
        return overloadLine(day, tests, fixed.length - tests, maxMinutes);
      })
      .filter((line): line is string => line !== null);
    const totals = courses.map((_, c) => days.reduce((sum, d) => sum + d.minutes[c], 0));
    weeks.push({
      monday,
      sunday,
      days,
      totals: [...totals, totals.reduce((a, b) => a + b, 0)],
      light,
      overloaded,
      cuts: cutList(set, days),
    });
  }
  return { courses, weeks };
}

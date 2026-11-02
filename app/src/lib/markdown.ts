// deadlines.md and the Step 2 preview, in references/deadline-table-template.md format,
// then the study plans and weekly schedule.

import { formatDate } from "./dates";
import { dayMinutes, formatHours, formatMinutes, fullDays, laterWeeks, planMinutes, type CoursePlan, type PlanBlock, type PlanDay } from "./planner";
import type { WeeklySchedule } from "./schedule";
import { CLOSING_QUESTION, isNextSevenDays, sortRows } from "./table";
import type { Term } from "./dates";
import type { Deadline } from "./types";

function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
}

function bold(s: string): string {
  return s ? `**${s}**` : s;
}

export function markdownTable(rows: Deadline[], term: Term, today: string): string {
  const lines = ["| When | Course | What | Worth | Covers |", "|---|---|---|---|---|"];
  for (const r of sortRows(rows, term)) {
    const cells = [r.when, r.course, r.what, r.worth, r.covers].map(cell);
    const shown = isNextSevenDays(r, term, today) ? cells.map(bold) : cells;
    lines.push(`| ${shown.join(" | ")} |`);
  }
  return lines.join("\n");
}

export function undatedLine(undated: string[]): string {
  return undated.length ? `Not dated: ${undated.join(", ")}.` : "";
}

/** The Step 2 message: table, "Please check" and exactly one closing question. */
export function previewMarkdown(opts: {
  rows: Deadline[];
  undated: string[];
  questions: string[];
  term: Term;
  timezone: string;
  today: string;
}): string {
  const parts = [
    `# Deadlines, ${opts.term.label}`,
    `"(assumed)" = not stated in the syllabus. Times are ${opts.timezone}.`,
    markdownTable(opts.rows, opts.term, opts.today),
  ];
  const nd = undatedLine(opts.undated);
  if (nd) parts.push(nd);
  if (opts.questions.length) {
    parts.push(["## Please check", ...opts.questions.map((q) => `- ${q}`)].join("\n"));
  }
  parts.push(CLOSING_QUESTION);
  return parts.join("\n\n") + "\n";
}

/** deadlines.md after confirmation: "What you confirmed" replaces the questions. */
export function deadlinesMarkdown(opts: {
  rows: Deadline[];
  undated: string[];
  confirmedNotes: string[];
  term: Term;
  timezone: string;
  /** Date the student confirmed, YYYY-MM-DD. Also the reference for bolding. */
  confirmedOn: string;
}): string {
  const parts = [
    `# Deadlines, ${opts.term.label}`,
    `Confirmed with you on ${formatDate(opts.confirmedOn)}. "(assumed)" = not stated in the syllabus. Times are ${opts.timezone}.`,
    markdownTable(opts.rows, opts.term, opts.confirmedOn),
  ];
  const nd = undatedLine(opts.undated);
  if (nd) parts.push(nd);
  if (opts.confirmedNotes.length) {
    parts.push(["## What you confirmed", ...opts.confirmedNotes.map((n) => `- ${n}`)].join("\n"));
  }
  return parts.join("\n\n") + "\n";
}

/** Plain text for pasting into a chat or notes app. */
export function plainText(rows: Deadline[], undated: string[], term: Term): string {
  const lines = [`Deadlines, ${term.label}`, ""];
  for (const r of sortRows(rows, term)) {
    lines.push([r.when, r.course, r.what, r.worth, r.covers].filter(Boolean).join(" · "));
  }
  const nd = undatedLine(undated);
  if (nd) lines.push("", nd);
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Study plans and the weekly schedule, in the formats in references/

function hourCount(minutes: number): string {
  return `about ${Math.round(minutes / 30) / 2} h`;
}

function dayTitle(day: PlanDay): string {
  const parts = [formatDate(day.date), `${formatHours(dayMinutes(day))} h`];
  if (day.label) parts.push(day.label);
  return `## ${parts.join(" · ")}`;
}

function blockLine(block: PlanBlock): string {
  const action = block.action.replace(/\s*\n\s*/g, " ").trim();
  return block.minutes > 0 ? `- [ ] ${formatMinutes(block.minutes)} · ${action}` : `- [ ] ${action}`;
}

export function planHeader(plan: CoursePlan): [string, string] {
  const first = [plan.course, plan.what, [plan.when, plan.place].filter(Boolean).join(", ")].join(" · ");
  const days = plan.days.length;
  const second = [
    plan.worth,
    plan.covers.replace(/\s*\(assumed\)/gi, "") || null,
    `${days} study ${days === 1 ? "day" : "days"}, ${hourCount(planMinutes(plan.days))}`,
    plan.note || null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [first, second];
}

/** One course's plan: phone-screen checklist on top, everything else collapsed. */
export function studyPlanMarkdown(plan: CoursePlan): string {
  const [first, second] = planHeader(plan);
  const parts = [`# ${first}\n${second}`];
  for (const day of fullDays(plan)) parts.push([dayTitle(day), ...day.blocks.map(blockLine)].join("\n"));
  parts.push([plan.kind === "test" ? "## Test day" : "## Due day", ...plan.testDay.blocks.map(blockLine)].join("\n"));
  parts.push(`**Short on time?** ${plan.shortOnTime}`);
  const later = laterWeeks(plan);
  parts.push(
    [
      "<details>",
      "<summary>Details: topics, assumptions, sources</summary>",
      ...(later.length ? ["", `**Later:** ${later.join(" ")} Rebuild closer to the date to see these days in full.`] : []),
      "",
      `**Topics covered:** ${plan.details.topics}`,
      "",
      `**Assumed:** ${plan.details.assumed}`,
      "",
      `**Sources:** ${plan.details.sources}`,
      "",
      `**Clashes:** ${plan.details.clashes}`,
      "",
      `**Not checked:** ${plan.details.notChecked}`,
      "",
      "Hours are estimates. Times are suggestions around your classes. Stop at your bedtime: no block is worth an all-nighter.",
      "</details>",
    ].join("\n"),
  );
  return parts.join("\n\n") + "\n";
}

/** "BIO110-midterm-study-plan.md", as in examples/sample-university/expected-output. */
export function planFilename(plan: CoursePlan): string {
  const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${plan.course.replace(/[^a-z0-9]/gi, "")}-${slug(plan.what).toLowerCase()}-study-plan.md`;
}

function shortDate(date: string): string {
  return formatDate(date).slice(4);
}

/** weekly-schedule.md: one table per week, from today to the last planned test. */
export function weeklyScheduleMarkdown(schedule: WeeklySchedule, timezone: string): string {
  const parts: string[] = [];
  for (const week of schedule.weeks) {
    const header = ["Day", ...schedule.courses, "Total", "Fixed events"];
    const table = [`| ${header.map(cell).join(" | ")} |`, `|${header.map(() => "---").join("|")}|`];
    for (const day of week.days) {
      const cells = [
        formatDate(day.date),
        ...day.minutes.map(formatHours),
        day.total ? `~${formatHours(day.total)}` : "0",
        day.events.join(", "),
      ];
      table.push(`| ${cells.map(cell).join(" | ")} |`.replace(/ +\|$/, " |"));
    }
    table.push(`| **Week** | ${week.totals.map((m) => `**${formatHours(m)}**`).join(" | ")} | |`);

    const section = [
      `# Study time, week of ${shortDate(week.monday)} to ${shortDate(week.sunday)}`,
      `Merged from the course plans. Hours are study-time estimates, not counting classes or tests. Times are ${timezone}.`,
      table.join("\n"),
    ];
    if (week.light.length) section.push(week.light.join("\n"));
    if (week.overloaded.length) section.push(["## Overloaded days", ...week.overloaded.map((l) => `- ${l}`)].join("\n"));
    if (week.cuts.length) {
      section.push(
        ["## If you need to cut", ...week.cuts.map((c, i) => `${i + 1}. ${c}`), "Never cut: mocks, anything due this week, or sleep."].join("\n"),
      );
    }
    parts.push(section.join("\n\n"));
  }
  return parts.join("\n\n") + "\n";
}

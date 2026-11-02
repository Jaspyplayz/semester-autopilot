// deadlines.md and the Step 2 preview, in references/deadline-table-template.md format.

import { formatDate } from "./dates";
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

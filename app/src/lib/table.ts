// The merged deadline table (SKILL.md Step 2, references/deadline-table-template.md):
// sorting, "next 7 days" bolding, past items, the "Please check" questions and
// the "What you confirmed" list.

import { addDays, formatWhen, parseTerm, parseWhen, whenSortKey, type Term } from "./dates";
import type { Deadline } from "./types";

export const CLOSING_QUESTION = "Anything wrong, missing or that you're skipping?";
export const MAX_QUESTIONS = 5;

export function termOf(label: string, today: string): Term {
  return parseTerm(label, Number(today.slice(0, 4)));
}

/** Tidy what a student typed ("oct 16 11:59pm" -> "Fri Oct 16, 23:59"); leave anything unreadable alone. */
export function normalizeWhen(text: string, term: Term): string {
  const w = parseWhen(text, term);
  return w ? formatWhen(w, term) : text;
}

/** Rows whose When can't be read. They can't be sorted or exported, so they block confirming. */
export function unreadableWhen(rows: Deadline[], term: Term): Deadline[] {
  return rows.filter((r) => parseWhen(r.when, term) === null);
}

export function sortRows(rows: Deadline[], term: Term): Deadline[] {
  return [...rows]
    .map((r, i) => ({ r, i, key: whenSortKey(parseWhen(r.when, term), term) }))
    .sort((a, b) =>
      a.key < b.key ? -1 : a.key > b.key ? 1 : a.r.course.localeCompare(b.r.course) || a.i - b.i,
    )
    .map((x) => x.r);
}

/** The last day an item could still be relevant, or null if it has no date. */
function itemDate(row: Deadline, term: Term): string | null {
  const w = parseWhen(row.when, term);
  return w?.kind === "date" ? w.date : null;
}

export function isPast(row: Deadline, term: Term, today: string): boolean {
  const d = itemDate(row, term);
  return !!d && d < today;
}

/** Due today or within the next 6 days: these rows are bold. */
export function isNextSevenDays(row: Deadline, term: Term, today: string): boolean {
  const d = itemDate(row, term);
  return !!d && d >= today && d < addDays(today, 7);
}

export function isFlagged(row: Deadline): boolean {
  return [row.when, row.what, row.worth, row.covers].some((v) => /\bTBA\b|\(assumed\)/i.test(v));
}

function label(row: Deadline): string {
  return `${row.course} ${lowerFirst(row.what.split(",")[0].trim())}`;
}

/** One short question per assumed or TBA item; groups rows that share a hint. */
export function pleaseCheck(rows: Deadline[], term: Term, today: string): string[] {
  const sorted = sortRows(rows, term).filter((r) => !isPast(r, term, today));
  const items: Array<{ q: string; date: string | null }> = [];
  const seen = new Set<string>();
  const push = (q: string, row: Deadline) => {
    if (seen.has(q)) return;
    seen.add(q);
    items.push({ q, date: itemDate(row, term) });
  };

  // Rows with no date that came from the same syllabus line ("Lab reports (4)")
  // get one question between them.
  const tbaGroups = new Map<string, Deadline[]>();
  for (const r of sorted) {
    if (/^\s*TBA\b/i.test(r.when)) {
      const key = `${r.course}|${r.hint ?? r.id}`;
      tbaGroups.set(key, [...(tbaGroups.get(key) ?? []), r]);
    }
  }

  for (const r of sorted) {
    if (r.question) push(r.question, r);
    if (/^\s*TBA\b/i.test(r.when)) {
      const group = tbaGroups.get(`${r.course}|${r.hint ?? r.id}`) ?? [r];
      const name =
        group.length > 1
          ? `${r.course} ${group[0].what.replace(/\s*\d+$/, "")}s 1-${group.length}`
          : label(r);
      const said = r.hint ? ` It says "${r.hint}".` : "";
      push(
        group.length > 1
          ? `${name}: the syllabus doesn't say which dates.${said} When is each due?`
          : `${name}: the syllabus doesn't give a date.${said} When is it?`,
        r,
      );
    }
    if (/\(assumed\)/i.test(r.when)) {
      push(`${label(r)}: I assumed ${r.when.replace(/\s*\(assumed\)/i, "")}${r.hint ? ` (${lowerFirst(r.hint)})` : ""}. Right?`, r);
    }
    if (/\(assumed\)/i.test(r.covers)) {
      push(
        `${label(r)}: the syllabus doesn't say what it covers. I assumed ${r.covers.replace(/\s*\(assumed\)/i, "")}. Right?`,
        r,
      );
    }
    if (/\broom TBA\b/i.test(r.what)) {
      push(`${label(r)} room is TBA. I'll leave it blank until it's posted.`, r);
    }
    if (/\(assumed\)/i.test(r.worth)) {
      const group = sorted.filter((x) => x.course === r.course && x.hint === r.hint && /\(assumed\)/i.test(x.worth));
      const name = group.length > 1 ? `${r.course} ${r.what.replace(/\s*\d+$/, "")}s` : label(r);
      push(`${name}: I split the weight evenly (${r.worth.replace(/\s*\(assumed\)/i, "")} each). Right?`, r);
    }
    if (/\bTBA\b/i.test(r.covers)) push(`${label(r)}: what does it cover?`, r);
    if (/\bTBA\b/i.test(r.worth)) push(`${label(r)}: how much is it worth?`, r);
  }

  if (items.length <= MAX_QUESTIONS) return items.map((i) => i.q);
  // Too many: ask about the next 3 weeks only (undated questions stay, they
  // block planning the most).
  const horizon = addDays(today, 21);
  const soon = items.filter((i) => !i.date || i.date < horizon);
  return soon.slice(0, MAX_QUESTIONS).map((i) => i.q);
}

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/**
 * "What you confirmed": compare what the parser proposed with what the
 * student confirmed and describe each flagged item's outcome and each edit.
 */
export function whatYouConfirmed(original: Deadline[], confirmed: Deadline[], term: Term): string[] {
  const out: string[] = [];
  const byId = new Map(confirmed.map((r) => [r.id, r]));
  const handledGroups = new Set<string>();

  for (const o of sortRows(original, term)) {
    const c = byId.get(o.id);
    if (!c) {
      out.push(`${label(o)}: skipped, left out of your deadlines.`);
      continue;
    }
    // TBA dates the student filled in, grouped like the question was.
    if (/^\s*TBA\b/i.test(o.when) && !/^\s*TBA\b/i.test(c.when)) {
      const group = original.filter(
        (x) => x.course === o.course && x.hint === o.hint && /^\s*TBA\b/i.test(x.when) && byId.has(x.id),
      );
      const key = `${o.course}|${o.hint ?? o.id}`;
      if (group.length > 1 && o.hint) {
        if (!handledGroups.has(key)) {
          handledGroups.add(key);
          const dates = sortRows(group.map((g) => byId.get(g.id)!), term).map((g) => g.when.split(",")[0].replace(/^\w{3} /, ""));
          out.push(`${o.course} ${o.what.replace(/\s*\d+$/, "").toLowerCase()}s: you said they're due ${joinList(dates)}.`);
        }
      } else {
        out.push(`${label(o)}: you set the date to ${c.when}.`);
      }
    } else if (/^\s*TBA\b/i.test(c.when)) {
      out.push(`${label(o)}: date still TBA. Check the course site.`);
    } else if (o.when !== c.when) {
      out.push(`${label(o)}: moved from ${o.when} to ${c.when}.`);
    }

    for (const field of ["covers", "worth"] as const) {
      const before = o[field];
      const after = c[field];
      if (/\(assumed\)/i.test(before) && before === after) {
        const siblings = original.filter((x) => x.course === o.course && o.hint && x.hint === o.hint);
        if (field === "worth" && siblings.length > 1) {
          out.push(`${o.course} ${o.what.replace(/\s*\d+$/, "").toLowerCase()}s are worth ${after.replace(/\s*\(assumed\)/i, "")} each: kept as assumed.`);
          continue;
        }
        out.push(`${label(o)} ${field === "covers" ? `covers ${after.replace(/\s*\(assumed\)/i, "")}` : `is worth ${after.replace(/\s*\(assumed\)/i, "")}`}: kept as assumed.`);
      } else if (before !== after) {
        out.push(
          `${label(o)} ${field}: ${before ? `changed from "${before}" to ` : "set to "}"${after || "(blank)"}".`,
        );
      }
    }
    if (/\broom TBA\b/i.test(c.what)) {
      out.push(`${label(o)} room: still TBA. Check the course site the week before.`);
    } else if (o.what !== c.what) {
      out.push(`${label(o)}: renamed to "${c.what}".`);
    }
    if (o.course !== c.course) out.push(`${label(o)}: course changed to ${c.course}.`);
  }

  const originalIds = new Set(original.map((r) => r.id));
  for (const c of sortRows(confirmed, term)) {
    if (!originalIds.has(c.id)) out.push(`Added ${c.course} ${c.what} (${c.when}).`);
  }
  if (!out.length) out.push("Everything as the syllabuses say. No changes.");
  return [...new Set(out)];
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

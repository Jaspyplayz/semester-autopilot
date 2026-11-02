// Date and time helpers. Pure functions on plain values: a calendar date is
// "YYYY-MM-DD" and a time is "HH:MM" (24h), always in the school's time zone.

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type When =
  | { kind: "tba"; assumed: boolean }
  | { kind: "month"; month: number; assumed: boolean } // month 1-12, e.g. "December"
  | {
      kind: "date";
      date: string; // YYYY-MM-DD
      start?: string; // HH:MM
      end?: string; // HH:MM
      assumed: boolean;
    };

const MONTH_RE =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAY_RE =
  "(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";

export function monthIndex(name: string): number {
  return MONTHS.findIndex((m) => name.toLowerCase().startsWith(m.toLowerCase())) + 1;
}

export function weekdayIndex(name: string): number {
  return WEEKDAYS.findIndex((d) => name.toLowerCase().startsWith(d.toLowerCase()));
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function splitIso(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

/** Day of week, 0 = Sunday. Calendar arithmetic only, no time zone involved. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = splitIso(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = splitIso(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = splitIso(a);
  const [y2, m2, d2] = splitIso(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function isValidDate(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Today's date in a time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Terms

export type Season = "fall" | "winter" | "spring" | "summer" | "unknown";

export interface Term {
  label: string;
  season: Season;
  /** Year used for dates in Sep-Dec (fall) or the whole term. */
  year: number;
  /** For "2026-2027"-style terms, the year used for Jan-Aug dates. */
  springYear: number;
}

export function parseTerm(label: string, fallbackYear: number): Term {
  const l = label.toLowerCase();
  const season: Season = /fall|autumn/.test(l)
    ? "fall"
    : /winter/.test(l)
      ? "winter"
      : /spring/.test(l)
        ? "spring"
        : /summer/.test(l)
          ? "summer"
          : "unknown";
  const span = l.match(/(20\d{2})\s*[-/–]\s*(20\d{2}|\d{2})\b/);
  if (span) {
    const first = Number(span[1]);
    return { label, season, year: first, springYear: first + 1 };
  }
  const single = l.match(/\b(20\d{2})\b/);
  const year = single ? Number(single[1]) : fallbackYear;
  return { label, season, year, springYear: year };
}

/** Year for a month in this term. */
export function yearForMonth(term: Term, month: number): number {
  if (term.springYear !== term.year) return month >= 8 ? term.year : term.springYear;
  if (term.season === "fall" && month <= 4) return term.year + 1; // a January exam
  if (term.season === "winter" && month >= 9) return term.year - 1;
  return term.year;
}

/**
 * Monday of teaching Week 1. Assumed, the syllabus rarely says: fall starts the
 * week of Labour Day (first Monday of September), winter the week containing
 * Jan 5, spring/summer the week containing May 5.
 */
export function termWeekOneMonday(term: Term): string | null {
  const mondayOf = (date: string) => addDays(date, -((dayOfWeek(date) + 6) % 7));
  switch (term.season) {
    case "fall": {
      let d = isoDate(term.year, 9, 1);
      while (dayOfWeek(d) !== 1) d = addDays(d, 1);
      return d;
    }
    case "winter":
      return mondayOf(isoDate(term.springYear, 1, 5));
    case "spring":
    case "summer":
      return mondayOf(isoDate(term.springYear, 5, 5));
    default:
      return null;
  }
}

/** 1-based teaching week a date falls in, or null if the term start is unknown. */
export function termWeek(term: Term, date: string): number | null {
  const start = termWeekOneMonday(term);
  if (!start) return null;
  const diff = daysBetween(start, date);
  if (diff < 0) return null;
  return Math.floor(diff / 7) + 1;
}

// ---------------------------------------------------------------------------
// Finding dates and times in free text

export interface DateMatch {
  month: number;
  day: number;
  year?: number;
  weekday?: number; // 0-6 if the text named one
  index: number;
  length: number;
}

/** First "Fri Oct 9", "October 9, 2026", "9 Oct" or "2026-10-09" in the text. */
export function findDate(text: string): DateMatch | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const md = new RegExp(
    `(?:\\b${WEEKDAY_RE}\\.?,?\\s+)?\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d{2}))?`,
    "i",
  ).exec(text);
  const dm = new RegExp(
    `(?:\\b${WEEKDAY_RE}\\.?,?\\s+)?\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\b\\.?(?:,?\\s+(20\\d{2}))?`,
    "i",
  ).exec(text);
  const candidates: DateMatch[] = [];
  if (iso && iso.index !== undefined) {
    candidates.push({
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3]),
      index: iso.index,
      length: iso[0].length,
    });
  }
  if (md) {
    candidates.push({
      weekday: md[1] ? weekdayIndex(md[1]) : undefined,
      month: monthIndex(md[2]),
      day: Number(md[3]),
      year: md[4] ? Number(md[4]) : undefined,
      index: md.index,
      length: md[0].length,
    });
  }
  if (dm) {
    candidates.push({
      weekday: dm[1] ? weekdayIndex(dm[1]) : undefined,
      day: Number(dm[2]),
      month: monthIndex(dm[3]),
      year: dm[4] ? Number(dm[4]) : undefined,
      index: dm.index,
      length: dm[0].length,
    });
  }
  const valid = candidates.filter((c) => c.month >= 1 && c.day >= 1 && c.day <= 31);
  if (!valid.length) return null;
  return valid.sort((a, b) => a.index - b.index)[0];
}

/** Every date in the text, in order. */
export function findDates(text: string): DateMatch[] {
  const out: DateMatch[] = [];
  let offset = 0;
  for (;;) {
    const m = findDate(text.slice(offset));
    if (!m) return out;
    out.push({ ...m, index: m.index + offset });
    offset += m.index + m.length;
  }
}

/** A month named on its own ("December exam period"), when there's no full date. */
export function findMonthOnly(text: string): number | null {
  for (const m of text.matchAll(new RegExp(`\\b${MONTH_RE}\\b`, "gi"))) {
    // "may" and "march" are also ordinary words; only accept them capitalised.
    if (/^(may|march)$/.test(m[1])) continue;
    return monthIndex(m[1]);
  }
  return null;
}

export interface TimeMatch {
  start: string;
  end?: string;
  index: number;
  length: number;
}

function to24(h: number, min: number, mer: string | undefined): [number, number] {
  const m = mer?.toLowerCase().replace(/\./g, "");
  if (m === "pm" && h < 12) h += 12;
  if (m === "am" && h === 12) h = 0;
  return [h, min];
}

const fmtHM = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

/**
 * First time or time range: "9:00 am-9:00 pm", "7:00-9:00 pm", "11:59 pm",
 * "18:00", "noon". A bare number range like "3-4" is not a time.
 */
export function findTime(text: string): TimeMatch | null {
  const MER = "(a\\.?m\\.?|p\\.?m\\.?)";
  const range = new RegExp(
    `\\b(\\d{1,2})(?::(\\d{2}))?\\s*${MER}?\\s*(?:-|–|—|to)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*${MER}?(?![\\w])`,
    "i",
  ).exec(text);
  if (range) {
    const [, h1, m1, mer1, h2, m2, mer2] = range;
    const hasClock = m1 !== undefined || m2 !== undefined || mer1 || mer2;
    if (hasClock && Number(h1) <= 23 && Number(h2) <= 23 && Number(m1 ?? 0) <= 59 && Number(m2 ?? 0) <= 59) {
      const [eh, em] = to24(Number(h2), Number(m2 ?? 0), mer2);
      let [sh, sm] = to24(Number(h1), Number(m1 ?? 0), mer1 ?? mer2);
      // "11:00-12:00 pm" means 11 am to noon: an inherited pm that lands
      // after the end must have been am.
      if (!mer1 && mer2 && sh * 60 + sm > eh * 60 + em) {
        [sh, sm] = to24(Number(h1), Number(m1 ?? 0), "am");
      }
      return {
        start: fmtHM(sh, sm),
        end: fmtHM(eh, em),
        index: range.index,
        length: range[0].length,
      };
    }
  }
  const single = new RegExp(
    `\\b(\\d{1,2}):(\\d{2})\\s*${MER}?(?![\\w])|\\b(\\d{1,2})\\s*${MER}(?![\\w])|\\b(noon|midnight)\\b`,
    "i",
  ).exec(text);
  if (single) {
    let h: number, m: number;
    if (single[6]) {
      [h, m] = single[6].toLowerCase() === "noon" ? [12, 0] : [23, 59];
    } else if (single[1] !== undefined) {
      [h, m] = to24(Number(single[1]), Number(single[2]), single[3]);
    } else {
      [h, m] = to24(Number(single[4]), 0, single[5]);
    }
    if (h <= 23 && m <= 59) {
      return { start: fmtHM(h, m), index: single.index, length: single[0].length };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The "When" column: parse and format

/** "9:00" / "21:00", the deadline table's style. */
export function displayTime(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  return `${h}:${pad(m)}`;
}

export function formatDate(date: string): string {
  const [, m, d] = splitIso(date);
  return `${WEEKDAYS[dayOfWeek(date)]} ${MONTHS[m - 1]} ${d}`;
}

/** Pass the term so a date outside it keeps its year ("Wed Nov 18, 2026"). */
export function formatWhen(w: When, term?: Term): string {
  const suffix = w.assumed ? " (assumed)" : "";
  if (w.kind === "tba") return "TBA";
  if (w.kind === "month") return MONTH_NAMES[w.month - 1] + suffix;
  let s = formatDate(w.date);
  if (term) {
    const [y, m] = splitIso(w.date);
    if (y !== yearForMonth(term, m)) s += `, ${y}`;
  }
  if (w.start) {
    s += `, ${displayTime(w.start)}`;
    if (w.end) s += `-${displayTime(w.end)}`;
  }
  return s + suffix;
}

/**
 * Parse a "When" cell back into a structured value. Accepts the table's own
 * format plus what a student is likely to type ("Oct 16 11:59pm", "2026-10-16").
 * Returns null if the text has something but no recognisable date.
 */
export function parseWhen(text: string, term: Term): When | null {
  const t = text.trim();
  const assumed = /\(assumed\)/i.test(t);
  if (!t || /^tba\b|^tbd\b|to be (announced|determined)/i.test(t)) {
    return { kind: "tba", assumed: false };
  }
  const dm = findDate(t);
  if (dm) {
    const year = dm.year ?? yearForMonth(term, dm.month);
    if (!isValidDate(year, dm.month, dm.day)) return null;
    const rest = t.slice(0, dm.index) + " " + t.slice(dm.index + dm.length);
    const tm = findTime(rest);
    return {
      kind: "date",
      date: isoDate(year, dm.month, dm.day),
      start: tm?.start,
      end: tm?.end,
      assumed,
    };
  }
  const month = findMonthOnly(t);
  if (month) return { kind: "month", month, assumed };
  return null;
}

/** Sort key: dated items by date and time, month-only after that month, TBA last. */
export function whenSortKey(w: When | null, term: Term): string {
  if (!w || w.kind === "tba") return "9999";
  if (w.kind === "month") {
    const y = yearForMonth(term, w.month);
    return `${y}-${pad(w.month)}-99`;
  }
  return `${w.date} ${w.start ?? "00:00"}`;
}

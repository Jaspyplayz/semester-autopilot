// .ics export (RFC 5545): one event per dated deadline, in the school's time
// zone. Timed events use TZID plus a VTIMEZONE built from the zone's real
// offset changes (via Intl), so calendars that don't know the zone name still
// get the right times. Undated, TBA and month-only rows ("December") are skipped.

import { addDays, displayTime, parseWhen, type Term } from "./dates";
import type { Deadline } from "./types";

const PRODID = "-//Semester Autopilot//Deadlines v0//EN";

// ---------------------------------------------------------------------------
// Time zone math

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** UTC offset of `tz` at instant `utcMs`, in minutes (Toronto in summer: -240). */
export function offsetMinutes(tz: string, utcMs: number): number {
  const parts = dtf(tz).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** Instant of a wall-clock time in `tz`. */
export function localToUtc(tz: string, date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall - offsetMinutes(tz, wall) * 60000;
  guess = wall - offsetMinutes(tz, guess) * 60000;
  return guess;
}

interface Transition {
  utcMs: number;
  from: number;
  to: number;
}

export function transitions(tz: string, fromYear: number, toYear: number): Transition[] {
  const out: Transition[] = [];
  const end = Date.UTC(toYear + 1, 0, 1);
  const DAY = 86400000;
  let t = Date.UTC(fromYear, 0, 1);
  let off = offsetMinutes(tz, t);
  while (t < end) {
    const next = t + DAY;
    const nextOff = offsetMinutes(tz, next);
    if (nextOff !== off) {
      let lo = t;
      let hi = next;
      while (hi - lo > 60000) {
        const mid = lo + Math.floor((hi - lo) / 120000) * 60000;
        if (offsetMinutes(tz, mid) === off) lo = mid;
        else hi = mid;
      }
      out.push({ utcMs: hi, from: off, to: nextOff });
      off = nextOff;
    }
    t = next;
  }
  return out;
}

function fmtOffset(min: number): string {
  const sign = min < 0 ? "-" : "+";
  const a = Math.abs(min);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}${String(a % 60).padStart(2, "0")}`;
}

function fmtUtcAsLocal(utcMs: number, offsetMin: number): string {
  const d = new Date(utcMs + offsetMin * 60000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function tzName(tz: string, utcMs: number): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(utcMs));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? null;
  } catch {
    return null;
  }
}

export function vtimezone(tz: string, fromYear: number, toYear: number): string[] {
  const lines = ["BEGIN:VTIMEZONE", `TZID:${tz}`];
  const ts = transitions(tz, fromYear, toYear);
  if (!ts.length) {
    const off = offsetMinutes(tz, Date.UTC(fromYear, 0, 1));
    const name = tzName(tz, Date.UTC(fromYear, 0, 1));
    lines.push(
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      `TZOFFSETFROM:${fmtOffset(off)}`,
      `TZOFFSETTO:${fmtOffset(off)}`,
      ...(name ? [`TZNAME:${name}`] : []),
      "END:STANDARD",
    );
  }
  for (const t of ts) {
    const kind = t.to > t.from ? "DAYLIGHT" : "STANDARD";
    const name = tzName(tz, t.utcMs + 3600000);
    lines.push(
      `BEGIN:${kind}`,
      `DTSTART:${fmtUtcAsLocal(t.utcMs, t.from)}`,
      `TZOFFSETFROM:${fmtOffset(t.from)}`,
      `TZOFFSETTO:${fmtOffset(t.to)}`,
      ...(name ? [`TZNAME:${name}`] : []),
      `END:${kind}`,
    );
  }
  lines.push("END:VTIMEZONE");
  return lines;
}

// ---------------------------------------------------------------------------
// Events

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold to 75 octets per line (RFC 5545 3.1). */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length ? 74 : 75; // continuation lines start with a space
    if (bytes + b > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const compact = (date: string) => date.replace(/-/g, "");
const compactTime = (date: string, time: string) => `${compact(date)}T${time.replace(":", "")}00`;

function addMinutes(time: string, delta: number): string {
  const [h, m] = time.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + delta));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function isSitDown(what: string): boolean {
  return /\b(midterm|test|exam|quiz|presentation|lab)\b/i.test(what) && !/\breport\b/i.test(what);
}

export interface IcsOptions {
  term: Term;
  timezone: string;
  calendarName?: string;
  /** DTSTAMP; pass a fixed date in tests. */
  now?: Date;
}

export interface IcsResult {
  ics: string;
  eventCount: number;
  skipped: Deadline[];
}

export function buildIcs(rows: Deadline[], opts: IcsOptions): IcsResult {
  const now = opts.now ?? new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events: string[][] = [];
  const skipped: Deadline[] = [];
  const years: number[] = [];

  for (const r of rows) {
    const w = parseWhen(r.when, opts.term);
    if (!w || w.kind !== "date") {
      skipped.push(r);
      continue;
    }
    years.push(Number(w.date.slice(0, 4)));
    const tzid = `TZID=${opts.timezone}`;
    const ev = ["BEGIN:VEVENT", `UID:${r.id}-${compact(w.date)}@semester-autopilot`, `DTSTAMP:${stamp}`];
    let summary = `${r.course}: ${r.what}`;
    if (w.start && w.end) {
      // "9:00 pm-1:00 am" ends the next day.
      const endDate = w.end <= w.start ? addDays(w.date, 1) : w.date;
      ev.push(`DTSTART;${tzid}:${compactTime(w.date, w.start)}`, `DTEND;${tzid}:${compactTime(endDate, w.end)}`);
    } else if (w.start) {
      if (isSitDown(r.what)) {
        // A test with only a start time: block an hour (assumed length).
        ev.push(`DTSTART;${tzid}:${compactTime(w.date, w.start)}`, `DTEND;${tzid}:${compactTime(w.date, addMinutes(w.start, 60))}`);
      } else {
        // A due time: a short block ending at the deadline.
        summary += ` (due ${displayTime(w.start)})`;
        const blockStart = addMinutes(w.start, -30);
        // Too close to midnight to start earlier: the block starts at the deadline instead.
        ev.push(
          blockStart === w.start
            ? `DTSTART;${tzid}:${compactTime(w.date, w.start)}`
            : `DTSTART;${tzid}:${compactTime(w.date, blockStart)}`,
          blockStart === w.start
            ? `DTEND;${tzid}:${compactTime(w.date, addMinutes(w.start, 30))}`
            : `DTEND;${tzid}:${compactTime(w.date, w.start)}`,
        );
      }
    } else {
      ev.push(`DTSTART;VALUE=DATE:${compact(w.date)}`, `DTEND;VALUE=DATE:${compact(addDays(w.date, 1))}`);
    }
    const desc = [
      `Worth: ${r.worth || "TBA"}`,
      r.covers ? `Covers: ${r.covers}` : "",
      w.assumed ? "Time assumed, not stated in the syllabus." : "",
      "From Semester Autopilot. Check the course site for changes.",
    ].filter(Boolean);
    ev.push(`SUMMARY:${escapeText(summary)}`, `DESCRIPTION:${escapeText(desc.join("\n"))}`, "TRANSP:TRANSPARENT", "END:VEVENT");
    events.push(ev);
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.calendarName ?? `Deadlines, ${opts.term.label}`)}`,
    `X-WR-TIMEZONE:${opts.timezone}`,
  ];
  if (years.length) {
    lines.push(...vtimezone(opts.timezone, Math.min(...years) - 1, Math.max(...years)));
  }
  for (const ev of events) lines.push(...ev);
  lines.push("END:VCALENDAR");
  return { ics: lines.map(foldLine).join("\r\n") + "\r\n", eventCount: events.length, skipped };
}

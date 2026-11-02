import { describe, expect, it } from "vitest";
import { foldLine, buildIcs, localToUtc, offsetMinutes, transitions, vtimezone } from "./ics";
import { parseTerm } from "./dates";
import type { Deadline } from "./types";

const TERM = parseTerm("Fall 2026", 2026);
const OPTS = { term: TERM, timezone: "America/Toronto", now: new Date("2026-10-05T12:00:00Z") };

function row(over: Partial<Deadline>): Deadline {
  return { id: over.what ?? "x", course: "BIO 110", what: "Quiz", worth: "5%", covers: "", when: "TBA", source: "syllabus", ...over };
}

/** The unfolded lines of one event, found by its id. */
function eventLines(ics: string, id: string): string[] {
  const lines = ics.replace(/\r\n /g, "").split("\r\n");
  const at = lines.findIndex((l) => l.startsWith(`UID:${id}-`));
  return lines.slice(at, lines.indexOf("END:VEVENT", at));
}

describe("time zones", () => {
  it("knows Toronto's offsets and DST changes in 2026", () => {
    expect(offsetMinutes("America/Toronto", Date.UTC(2026, 6, 1))).toBe(-240);
    expect(offsetMinutes("America/Toronto", Date.UTC(2026, 11, 1))).toBe(-300);
    expect(transitions("America/Toronto", 2026, 2026)).toEqual([
      { utcMs: Date.UTC(2026, 2, 8, 7), from: -300, to: -240 },
      { utcMs: Date.UTC(2026, 10, 1, 6), from: -240, to: -300 },
    ]);
  });

  it("converts wall-clock times on either side of the fall change", () => {
    expect(new Date(localToUtc("America/Toronto", "2026-10-09", "09:00")).toISOString()).toBe("2026-10-09T13:00:00.000Z");
    expect(new Date(localToUtc("America/Toronto", "2026-11-20", "09:00")).toISOString()).toBe("2026-11-20T14:00:00.000Z");
  });

  it("writes VTIMEZONE components in local time with both offsets", () => {
    const text = vtimezone("America/Toronto", 2026, 2026).join("\n");
    expect(text).toContain("TZID:America/Toronto");
    expect(text).toMatch(/BEGIN:DAYLIGHT\nDTSTART:20260308T020000\nTZOFFSETFROM:-0500\nTZOFFSETTO:-0400\nTZNAME:EDT\nEND:DAYLIGHT/);
    expect(text).toMatch(/BEGIN:STANDARD\nDTSTART:20261101T020000\nTZOFFSETFROM:-0400\nTZOFFSETTO:-0500\nTZNAME:EST\nEND:STANDARD/);
  });

  it("handles a zone with no DST and one with a half-hour offset", () => {
    const text = vtimezone("Asia/Kolkata", 2026, 2026).join("\n");
    expect(text).toContain("TZOFFSETTO:+0530");
    expect(text.match(/BEGIN:STANDARD/g)).toHaveLength(1);
    expect(text).not.toContain("BEGIN:DAYLIGHT");
  });
});

describe("buildIcs", () => {
  it("skips TBA and month-only rows and says which", () => {
    const tba = row({ what: "Lab report 1" });
    const finals = row({ what: "Final exams", course: "All", when: "December" });
    const dated = row({ what: "Quiz 3", when: "Fri Nov 20" });
    const { eventCount, skipped, ics } = buildIcs([tba, finals, dated], OPTS);
    expect(eventCount).toBe(1);
    expect(skipped).toEqual([tba, finals]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("makes an all-day event when there's no time", () => {
    const { ics } = buildIcs([row({ what: "Quiz 3", when: "Fri Nov 20" })], OPTS);
    const ev = eventLines(ics, "Quiz 3");
    expect(ev).toContain("DTSTART;VALUE=DATE:20261120");
    expect(ev).toContain("DTEND;VALUE=DATE:20261121");
  });

  it("makes a timed event in the school's zone for a time range", () => {
    const { ics } = buildIcs([row({ what: "Quiz 2, online", when: "Fri Oct 9, 9:00-21:00" })], OPTS);
    const ev = eventLines(ics, "Quiz 2, online");
    expect(ev).toContain("DTSTART;TZID=America/Toronto:20261009T090000");
    expect(ev).toContain("DTEND;TZID=America/Toronto:20261009T210000");
    expect(ev).toContain("SUMMARY:BIO 110: Quiz 2\\, online");
    expect(ics).toContain("BEGIN:VTIMEZONE");
  });

  it("ends a due-time event at the deadline, and starts a test at its start time", () => {
    const { ics } = buildIcs(
      [
        row({ id: "a2", course: "CS 150", what: "Assignment 2", when: "Fri Oct 16, 23:59" }),
        row({ id: "mid", course: "CS 150", what: "Midterm, in lecture", when: "Tue Oct 27, 9:00" }),
      ],
      OPTS,
    );
    const a2 = eventLines(ics, "a2");
    expect(a2).toContain("DTSTART;TZID=America/Toronto:20261016T232900");
    expect(a2).toContain("DTEND;TZID=America/Toronto:20261016T235900");
    expect(a2).toContain("SUMMARY:CS 150: Assignment 2 (due 23:59)");
    const mid = eventLines(ics, "mid");
    expect(mid).toContain("DTSTART;TZID=America/Toronto:20261027T090000");
    expect(mid).toContain("DTEND;TZID=America/Toronto:20261027T100000");
  });

  it("keeps DTEND after DTSTART for overnight ranges and due times just after midnight", () => {
    const { ics } = buildIcs(
      [
        row({ id: "night", what: "Take-home test", when: "Fri Oct 9, 21:00-1:00" }),
        row({ id: "early", what: "Essay", when: "Sat Oct 10, 0:10" }),
      ],
      OPTS,
    );
    expect(eventLines(ics, "night")).toContain("DTEND;TZID=America/Toronto:20261010T010000");
    const early = eventLines(ics, "early");
    expect(early).toContain("DTSTART;TZID=America/Toronto:20261010T000000");
    expect(early).toContain("DTEND;TZID=America/Toronto:20261010T001000");
  });

  it("is a well-formed calendar: CRLF, stable UIDs, escaped text, DTSTAMP", () => {
    const rows = [row({ id: "q", what: "Quiz; part 1", when: "Fri Oct 9", covers: "Units 3-4" })];
    const { ics } = buildIcs(rows, OPTS);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    const ev = eventLines(ics, "q");
    expect(ev).toContain("DTSTAMP:20261005T120000Z");
    expect(ev).toContain("SUMMARY:BIO 110: Quiz\\; part 1");
    expect(ev.find((l) => l.startsWith("DESCRIPTION:"))).toContain("Worth: 5%\\nCovers: Units 3-4\\n");
    expect(buildIcs(rows, { ...OPTS, now: new Date() }).ics).toContain("UID:q-20261009@semester-autopilot");
  });

  it("makes an empty calendar with no VTIMEZONE when nothing is dated", () => {
    const { ics, eventCount } = buildIcs([row({})], OPTS);
    expect(eventCount).toBe(0);
    expect(ics).not.toContain("VTIMEZONE");
  });
});

describe("foldLine", () => {
  it("folds at 75 octets without splitting a multi-byte character", () => {
    const folded = foldLine(`SUMMARY:${"é".repeat(100)}`);
    const parts = folded.split("\r\n");
    const enc = new TextEncoder();
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(enc.encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(`SUMMARY:${"é".repeat(100)}`);
    expect(folded).not.toContain("�");
  });

  it("leaves short lines alone", () => {
    expect(foldLine("VERSION:2.0")).toBe("VERSION:2.0");
  });
});

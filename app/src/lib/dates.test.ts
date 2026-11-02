import { describe, expect, it } from "vitest";
import {
  findDate,
  findDates,
  findMonthOnly,
  findTime,
  formatWhen,
  parseTerm,
  parseWhen,
  termWeek,
  yearForMonth,
} from "./dates";

const FALL = parseTerm("Fall 2026", 2000);

describe("findTime", () => {
  it.each([
    ["9:00 am-9:00 pm", "09:00", "21:00"],
    ["7:00-9:00 pm", "19:00", "21:00"],
    ["11:00-12:00 pm", "11:00", "12:00"],
    ["12:00-1:00 pm", "12:00", "13:00"],
    ["9 am to 5 pm", "09:00", "17:00"],
    ["18:00-20:00", "18:00", "20:00"],
    ["11:59 pm", "23:59", undefined],
    ["12:00 am", "00:00", undefined],
    ["7pm", "19:00", undefined],
    ["noon", "12:00", undefined],
    ["13:00", "13:00", undefined],
  ])("%s", (text, start, end) => {
    const t = findTime(text);
    expect([t?.start, t?.end]).toEqual([start, end]);
  });

  it("doesn't read number ranges or nonsense as times", () => {
    expect(findTime("Units 3-4")).toBeNull();
    expect(findTime("25:00")).toBeNull();
    expect(findTime("500 words")).toBeNull();
  });
});

describe("findDate", () => {
  it("reads the common layouts", () => {
    expect(findDate("Fri Oct 9, online")).toMatchObject({ month: 10, day: 9, weekday: 5 });
    expect(findDate("October 14th")).toMatchObject({ month: 10, day: 14 });
    expect(findDate("9 Oct")).toMatchObject({ month: 10, day: 9 });
    expect(findDate("Nov 18, 2026 in class")).toMatchObject({ month: 11, day: 18, year: 2026 });
    expect(findDate("due 2026-12-03")).toMatchObject({ month: 12, day: 3, year: 2026 });
    expect(findDate("December exam period")).toBeNull();
  });

  it("finds every date in a line", () => {
    expect(findDates("Oct 9, Nov 6 and Dec 1").map((d) => d.day)).toEqual([9, 6, 1]);
  });
});

describe("findMonthOnly", () => {
  it("doesn't mistake ordinary words for months", () => {
    expect(findMonthOnly("December exam period")).toBe(12);
    expect(findMonthOnly("this may be in April")).toBe(4);
    expect(findMonthOnly("students may march")).toBeNull();
    expect(findMonthOnly("May exam period")).toBe(5);
  });
});

describe("terms", () => {
  it("infers the year from the term", () => {
    expect(parseTerm("Fall 2026", 2000)).toMatchObject({ season: "fall", year: 2026 });
    expect(parseTerm("Winter 2027", 2000)).toMatchObject({ season: "winter", year: 2027 });
    expect(parseTerm("Fall/Winter 2026-2027", 2000)).toMatchObject({ year: 2026, springYear: 2027 });
    expect(parseTerm("Next term", 2031).year).toBe(2031);
  });

  it("puts a January exam after a fall term and a fall date before a winter term", () => {
    expect(yearForMonth(FALL, 1)).toBe(2027);
    expect(yearForMonth(FALL, 12)).toBe(2026);
    expect(yearForMonth(parseTerm("Winter 2027", 2000), 12)).toBe(2026);
  });

  it("counts teaching weeks from Labour Day in the fall", () => {
    expect(termWeek(FALL, "2026-09-08")).toBe(1);
    expect(termWeek(FALL, "2026-10-21")).toBe(7);
    expect(termWeek(FALL, "2026-08-01")).toBeNull();
    expect(termWeek(parseTerm("2026", 2000), "2026-10-21")).toBeNull();
  });
});

describe("parseWhen and formatWhen", () => {
  it.each([
    ["Fri Oct 9, 9:00-21:00", "Fri Oct 9, 9:00-21:00"],
    ["oct 16 11:59pm", "Fri Oct 16, 23:59"],
    ["2026-11-20", "Fri Nov 20"],
    ["December", "December"],
    ["tba", "TBA"],
    ["", "TBA"],
    ["Fri Oct 9, 13:00 (assumed)", "Fri Oct 9, 13:00 (assumed)"],
    ["Nov 18, 2027 9am", "Thu Nov 18, 2027, 9:00"],
  ])("%s -> %s", (input, output) => {
    expect(formatWhen(parseWhen(input, FALL)!, FALL)).toBe(output);
  });

  it("round-trips a date outside the term without losing its year", () => {
    const once = formatWhen(parseWhen("Nov 18, 2027", FALL)!, FALL);
    expect(parseWhen(once, FALL)).toMatchObject({ date: "2027-11-18" });
  });

  it("returns null for text it can't read and for impossible dates", () => {
    expect(parseWhen("sometime soon", FALL)).toBeNull();
    expect(parseWhen("Feb 30", FALL)).toBeNull();
  });
});

// Deterministic syllabus parser: SKILL.md Step 1 without an LLM.
//
// It reads the course code and name, meeting times and the marking scheme
// (markdown tables, or the "Item 5% Fri Oct 9, ..." lines PDF text extraction
// produces) and turns each assessment into a Deadline row. Anything it infers
// is marked "(assumed)"; anything missing is "TBA". It never fills a gap
// silently.

import {
  WEEKDAYS,
  MONTHS,
  dayOfWeek,
  findDate,
  findDates,
  findMonthOnly,
  findTime,
  formatWhen,
  isValidDate,
  isoDate,
  parseTerm,
  termWeek,
  weekdayIndex,
  yearForMonth,
} from "./dates";
import type { CourseInfo, Deadline, Extraction } from "./types";

export interface ParseOptions {
  /** "Fall 2026". The year for dates comes from here. */
  term: string;
  /** File name, used in warnings and as a last-resort course label. */
  sourceName?: string;
  /** The course, when a course site already told us. Wins over anything in the text. */
  course?: CourseInfo;
}

interface MeetingSlot {
  kind: "lecture" | "tutorial" | "lab";
  days: number[];
  start?: string;
}

export interface FinalEntry {
  course: string;
  weight: string;
  month: number | null;
  hint: string;
}

export interface CourseParse {
  course: CourseInfo;
  rows: Deadline[];
  undated: string[];
  finals: FinalEntry[];
  warnings: string[];
  /** Came from a course site, where a page and a file for one course are expected. */
  fromCourseSite?: boolean;
}

const COURSE_CODE_RE = /\b([A-Z]{2,8})[ -]?(\d{3,4}[A-Z]?\d?)\b/g;
// Capitalised words followed by a number that aren't course codes.
const NOT_A_COURSE_RE = /^(FALL|WINTER|SPRING|SUMMER|AUTUMN|TERM|YEAR|ROOM|WEEK|UNIT|PAGE|ISBN|CHAPTER|SECTION)$/;
interface AssessmentLine {
  item: string;
  weight: string;
  due: string;
}

const COVERAGE_RE =
  /\b(units?|weeks?|ch(?:apters?|s?\.)|lectures?|modules?|topics?|labs?|sections?|lessons?)\s*\d/i;
const UNDATED_RE =
  /\b(weekly|each week|every week|end of each|ongoing|throughout|each (class|lecture|tutorial)|every (class|lecture|tutorial|mon\w*|tue\w*|wed\w*|thu\w*|fri\w*|sat\w*|sun\w*))\b/i;
const NOT_AN_ITEM_RE = /\b(lose|loses|late|penalt\w*|deduct\w*|per day|bonus|drop(ped)?|lowest)\b|^(total|sum|overall)\b/i;
// Assessment words, for lines with a date but no weight ("Midterm: October 15").
const ASSESSMENT_WORD_RE =
  /\b(quiz(zes)?|midterms?|tests?|exams?|assignments?|essays?|papers?|projects?|reports?|presentations?|proposals?)\b/i;
// More rows than this from one line ("Problem sets (12)") go in "Not dated".
const MAX_EXPANDED_ROWS = 6;
const ASSESSMENT_HEADING_RE =
  /^(assessments?|assessment (scheme|summary|and grading)|marking( scheme)?|grading( scheme| breakdown)?|evaluation|grades?|course ?work|marks? breakdown|method of evaluation|important dates|key dates|due dates|deadlines|tests and assignments)\b/i;

/** The first course code in a line, as "CSC 207H1", with what follows it. */
export function findCourseCode(line: string): { code: string; rest: string } | null {
  const m = [...line.matchAll(COURSE_CODE_RE)].find((x) => !NOT_A_COURSE_RE.test(x[1]));
  if (!m) return null;
  return { code: `${m[1]} ${m[2]}`, rest: line.slice((m.index ?? 0) + m[0].length) };
}

const noMarksWarning = (code: string) => `${code}: no assessments with a weight found.`;

function cleanLine(raw: string): string {
  return raw
    .replace(/^\s*(#{1,6}|[-*+>]|\d+\.(?=\s+[A-Z]))\s+/, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,:;])/g, "$1$2")
    .trim();
}

function isHeadingLike(raw: string, clean: string): boolean {
  if (/^\s*#{1,6}\s/.test(raw)) return true;
  if (!clean || /[%|]/.test(clean) || /\d/.test(clean)) return false;
  if (/[.:;,]$/.test(clean)) return false;
  const words = clean.split(/\s+/);
  return words.length <= 4 && /^[A-Z]/.test(clean);
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stripParens(s: string): { text: string; parens: string[] } {
  const parens: string[] = [];
  const text = s.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    parens.push(inner.trim());
    return " ";
  });
  return { text: text.replace(/\s+/g, " ").trim(), parens };
}

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

function singular(word: string): string {
  if (/ies$/i.test(word)) return word.slice(0, -3) + "y";
  if (/zzes$/i.test(word)) return word.slice(0, -3);
  if (/(ch|sh|x|ss)es$/i.test(word)) return word.slice(0, -2);
  if (/ss$/i.test(word)) return word;
  return word.replace(/s$/i, "");
}

/** "Lab reports" -> "Lab report". */
function oneOf(label: string): string {
  const words = label.split(/\s+/);
  return [...words.slice(0, -1), singular(words[words.length - 1])].join(" ");
}

/** "20%" split across 4 -> "5% (assumed)": the syllabus doesn't say they're equal. */
function splitWeight(weight: string, count: number): string {
  const each = Number.parseFloat(weight) / count;
  if (!weight.includes("%") || Number.isNaN(each)) return weight;
  return `${Number.isInteger(each) ? each : each.toFixed(1)}% (assumed)`;
}

function parseMeeting(clean: string): MeetingSlot | null {
  const m = clean.match(/^(lectures?|tutorials?|labs?|seminars?|classes)\b\s*:?\s*(.+)$/i);
  if (!m) return null;
  const word = m[1].toLowerCase();
  const kind = word.startsWith("tut") ? "tutorial" : word.startsWith("lab") ? "lab" : "lecture";
  const days = [
    ...m[2].matchAll(
      /\b(mon(?:day)?s?|tue(?:s(?:day)?)?s?|wed(?:nesday)?s?|thu(?:r(?:s(?:day)?)?)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?)\b/gi,
    ),
  ]
    .map((x) => weekdayIndex(x[1]))
    .filter((d) => d >= 0);
  if (!days.length) return null;
  const time = findTime(m[2]);
  return { kind, days, start: time?.start };
}

/** Pull "Item | Weight | Date" triples out of the text. */
function findAssessmentLines(lines: string[]): AssessmentLine[] {
  const cleaned = lines.map(cleanLine);
  const hasSection = lines.some(
    (raw, i) => isHeadingLike(raw, cleaned[i]) && ASSESSMENT_HEADING_RE.test(cleaned[i]),
  );
  let inSection = !hasSection;
  let cols: { item: number; weight: number; due: number } | null = null;
  const out: AssessmentLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const clean = cleaned[i];
    if (!clean) continue;

    if (raw.includes("|")) {
      const cells = raw
        .split("|")
        .map((c) => cleanLine(c))
        .filter((_, idx, arr) => !((idx === 0 || idx === arr.length - 1) && arr[idx] === ""));
      if (cells.every((c) => /^[-:\s]*$/.test(c))) continue;
      const weightIdx = cells.findIndex((c) => /^(weight|worth|value|%|marks?|percent(age)?)$/i.test(c));
      if (weightIdx >= 0) {
        cols = {
          weight: weightIdx,
          item: Math.max(0, cells.findIndex((c) => /item|assessment|component|task|what|deliverable|work/i.test(c))),
          due: cells.findIndex((c) => /date|due|when|deadline/i.test(c)),
        };
        inSection = true;
        continue;
      }
      if (!inSection) continue;
      const wIdx = cols?.weight ?? cells.findIndex((c) => /^\d{1,3}(\.\d+)?\s?%$/.test(c));
      if (wIdx < 0) continue;
      const item = cells[cols?.item ?? (wIdx === 0 ? 1 : 0)] ?? "";
      const due =
        cols && cols.due >= 0
          ? (cells[cols.due] ?? "")
          : cells.filter((_, idx) => idx !== wIdx && cells[idx] !== item).join(", ");
      const cell = (cells[wIdx] ?? "").trim();
      const weight = /^\d{1,3}(\.\d+)?\s?%$/.test(cell) ? cell.replace(/\s/g, "") : /\d/.test(cell) ? cell : "TBA";
      if (item && !NOT_AN_ITEM_RE.test(item)) out.push({ item, weight, due });
      continue;
    }
    cols = null;

    if (isHeadingLike(raw, clean)) {
      if (ASSESSMENT_HEADING_RE.test(clean)) inSection = true;
      else if (hasSection && !/weight|worth/i.test(clean)) inSection = false;
      continue;
    }
    if (!inSection) continue;

    if (/^(item|assessment|component)\s+(weight|worth)/i.test(clean)) continue;

    // "20% Midterm, Oct 15"
    const lead = clean.match(/^(\d{1,3}(?:\.\d+)?)\s?%\s*[:\-–—,]?\s*(.+)$/);
    const m = lead
      ? ([clean, lead[2], lead[1], ""] as const)
      : clean.match(/^(.+?)\s*[(:\-–—]?\s*(\d{1,3}(?:\.\d+)?)\s?%\)?\s*[:\-–—,]?\s*(.*)$/);
    if (!m) {
      // "Midterm: October 15, 7:00 pm": a date with no weight given.
      const dm = findDate(clean);
      if (!dm || !ASSESSMENT_WORD_RE.test(clean.slice(0, dm.index))) continue;
      const item = clean.slice(0, dm.index).replace(/[\s:\-–—,]+$/, "");
      if (item && item.split(/\s+/).length <= 6) out.push({ item, weight: "TBA", due: clean.slice(dm.index) });
      continue;
    }
    let item = m[1].replace(/[\s:\-–—(]+$/, "").trim();
    let due = m[3].trim();
    if (/^(per|of|off)\b/i.test(due)) continue;
    // "Midterm Oct 15 7:00 pm 25%": the date came before the weight.
    if (!due) {
      const dm = findDate(item);
      if (dm && dm.index > 0) {
        due = item.slice(dm.index);
        item = item.slice(0, dm.index).replace(/[\s:\-–—,]+$/, "");
      }
    }
    if (!item || item.split(/\s+/).length > 8 || NOT_AN_ITEM_RE.test(item)) continue;
    out.push({ item, weight: `${m[2]}%`, due });
  }
  return mergeSameItem(out);
}

/**
 * A marking table ("Midterm 25%") plus a separate key-dates list ("Midterm:
 * Oct 15") describe one assessment, not two.
 */
function mergeSameItem(lines: AssessmentLine[]): AssessmentLine[] {
  const key = (l: AssessmentLine) => stripParens(l.item).text.toLowerCase();
  const out: AssessmentLine[] = [];
  for (const line of lines) {
    const prev = out.find((o) => key(o) === key(line));
    if (!prev) {
      out.push({ ...line });
    } else if (prev.weight === "TBA" || line.weight === "TBA" || prev.weight === line.weight) {
      if (prev.weight === "TBA") prev.weight = line.weight;
      if (!findDate(prev.due) && findDate(line.due)) prev.due = line.due;
    } else {
      out.push({ ...line });
    }
  }
  return out;
}

export function parseSyllabus(text: string, opts: ParseOptions): CourseParse {
  const term = parseTerm(opts.term, new Date().getFullYear());
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const cleaned = lines.map(cleanLine);
  const warnings: string[] = [];

  // Course code and name: from the course site, or the first lines that have a code.
  let code = opts.course?.code ?? "";
  let name = opts.course?.name ?? "";
  if (!code) {
    for (const line of cleaned.slice(0, 20)) {
      const found = findCourseCode(line);
      if (found && !/^isbn/i.test(line)) {
        code = found.code;
        name = found.rest.replace(/^[\s:\-–—,]+/, "").split(/\s[·|]\s/)[0].trim();
        break;
      }
    }
  }
  if (!code) {
    code = opts.sourceName?.replace(/\.[a-z0-9]+$/i, "") || "Course";
    warnings.push(`${opts.sourceName ?? "Pasted text"}: no course code found, using "${code}".`);
  }

  const slots = cleaned.map(parseMeeting).filter((s): s is MeetingSlot => !!s);
  const lectureLine = cleaned.find((l) => /^lectures?\b/i.test(l));
  const hasWeeklySchedule = /\bweek(ly)?\b/i.test(text);

  const rows: Deadline[] = [];
  const undated: string[] = [];
  const finals: FinalEntry[] = [];
  const ids = new Set<string>();
  const newId = (what: string) => {
    const base = `${slug(code)}-${slug(what) || "item"}`;
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    return id;
  };

  for (const { item, weight, due } of findAssessmentLines(lines)) {
    const itemParts = stripParens(item);
    const countParen = itemParts.parens.find((p) => /^\d+$/.test(p));
    const count = countParen ? Number(countParen) : 1;
    const itemNote = itemParts.parens.find((p) => !/^\d+$/.test(p)) ?? "";
    let label = itemParts.text.replace(/^(midterm)\s+(test|exam(ination)?)$/i, "$1");
    label = label.charAt(0).toUpperCase() + label.slice(1);

    const isFinal = /\bfinal\b.*\b(exam|test|assessment)\b|^final$|^(exam|examination)$/i.test(label);
    const isTest = /\b(midterms?|tests?|exams?|quiz(zes)?)\b/i.test(label);
    const isParticipation = /\b(participation|attendance)\b/i.test(label);

    const dueParts = stripParens(due);
    const coverParen = dueParts.parens.find((p) => COVERAGE_RE.test(p));
    const dates = findDates(dueParts.text);

    if (isFinal && !dates.length) {
      finals.push({ course: code, weight, month: findMonthOnly(dueParts.text), hint: due });
      continue;
    }
    if (
      !dates.length &&
      (isParticipation || UNDATED_RE.test(due) || UNDATED_RE.test(item) || count > MAX_EXPANDED_ROWS)
    ) {
      undated.push(`${code} ${lowerFirst(label)} (${weight})`);
      continue;
    }

    if (!dates.length) {
      const month = findMonthOnly(dueParts.text);
      if (count > 1) {
        // "Lab reports (4) 20% Due the Friday after each lab": one row per
        // report, dates TBA, weight split evenly (assumed).
        const reportOf = oneOf(label).match(/^(\w+)\s+reports?$/i);
        for (let n = 1; n <= count; n++) {
          const what = `${oneOf(label)} ${n}`;
          rows.push({
            id: newId(what),
            course: code,
            what,
            worth: splitWeight(weight, count),
            covers: reportOf ? `${reportOf[1]} ${n}` : "",
            when: "TBA",
            hint: due || undefined,
            source: "syllabus",
          });
        }
        continue;
      }
      rows.push({
        id: newId(label),
        course: code,
        what: label,
        worth: weight,
        covers: coverParen ?? itemNote,
        when: month ? formatWhen({ kind: "month", month, assumed: false }) : "TBA",
        hint: due || undefined,
        source: "syllabus",
      });
      continue;
    }

    // Dated item. "Tests 40% Oct 9, Nov 6" is two rows, split evenly (assumed).
    // A range ("Oct 9 - Oct 11") is one item due at the end of the window.
    const isRange =
      dates.length === 2 &&
      /^\s*(-|–|—|to|through|until)\s*$/i.test(
        dueParts.text.slice(dates[0].index + dates[0].length, dates[1].index),
      );
    const useDates = isRange ? [dates[1]] : dates;
    useDates.forEach((dm, n) => {
      const many = useDates.length > 1;
      const rowLabel = many ? `${oneOf(label)} ${n + 1}` : label;
      const year = dm.year ?? yearForMonth(term, dm.month);
      if (!isValidDate(year, dm.month, dm.day)) {
        warnings.push(`${code} ${rowLabel}: "${due}" isn't a real date.`);
        return;
      }
      const date = isoDate(year, dm.month, dm.day);
      let question: string | undefined;
      if (dm.weekday !== undefined && dm.weekday !== dayOfWeek(date)) {
        question = `${code} ${rowLabel}: the syllabus says ${WEEKDAYS[dm.weekday]} ${MONTHS[dm.month - 1]} ${dm.day}, but that's a ${WEEKDAYS[dayOfWeek(date)]} in ${year}. Which is right?`;
      } else if (isRange) {
        question = `${code} ${rowLabel}: the syllabus gives a window ("${dueParts.text}"). I used the last day. Right?`;
      } else if (!many && count > 1) {
        question = `${code} ${rowLabel}: the syllabus lists ${count} but only this date. When are the others?`;
      }

      // Time, place and notes come from whatever isn't a date.
      let rest = dueParts.text;
      for (const d of [...dates].reverse()) rest = rest.slice(0, d.index) + " " + rest.slice(d.index + d.length);
      const tm = findTime(rest);
      let start = tm?.start;
      const end = tm?.end;
      let timeAssumed = false;
      if (tm) rest = rest.slice(0, tm.index) + " " + rest.slice(tm.index + tm.length);

      let location = "";
      for (const seg of rest.split(/[,;]/).map((x) => x.trim()).filter(Boolean)) {
        const slotWord = seg.match(/\b(lecture|class|tutorial|lab)\b/i)?.[1].toLowerCase();
        if (/\bonline\b|take[- ]home/i.test(seg)) {
          location = /take[- ]home/i.test(seg) ? "take-home" : "online";
        } else if (/^in (lecture|class|tutorial|lab)\b/i.test(seg)) {
          location = seg;
        } else if (/^(at )?(the )?start of|^(at|before|during) (the )?(lecture|class|tutorial|lab)/i.test(seg)) {
          // a time, not a place
        } else if (
          (/\b(room|rm\.?|hall|centre|center|building|bldg|gym|auditorium|theatre|theater)\b/i.test(seg) ||
            /\b[A-Z]{1,4}\s?\d{2,4}[A-Z]?\b/.test(seg)) &&
          !/^due\b/i.test(seg)
        ) {
          location = seg;
        } else {
          continue;
        }
        if (slotWord && !start) {
          const kind = slotWord === "tutorial" ? "tutorial" : slotWord === "lab" ? "lab" : "lecture";
          const dow = dayOfWeek(date);
          const slot =
            slots.find((x) => x.kind === kind && x.days.includes(dow) && x.start) ??
            slots.find((x) => x.kind === kind && x.start);
          if (slot?.start) {
            start = slot.start;
            timeAssumed = !slot.days.includes(dow);
          }
        }
      }

      let what = rowLabel;
      if (location) what += `, ${location}`;
      else if (isTest) what += ", room TBA";

      let covers = coverParen ?? itemNote;
      if (!covers && /\b(midterm|test)\b/i.test(label)) {
        const wk = hasWeeklySchedule ? termWeek(term, date) : null;
        covers = wk && wk > 2 ? `Weeks 1-${wk - 1} (assumed)` : "TBA";
      }

      rows.push({
        id: newId(rowLabel),
        course: code,
        what,
        worth: many ? splitWeight(weight, useDates.length) : weight,
        covers,
        when: formatWhen({ kind: "date", date, start, end, assumed: timeAssumed }, term),
        hint: timeAssumed ? "time taken from the class schedule" : undefined,
        question,
        source: "syllabus",
      });
    });
  }

  if (!rows.length && !undated.length && !finals.length) {
    warnings.push(noMarksWarning(code));
  }

  return {
    course: { code, name, lectures: lectureLine?.replace(/^lectures?\s*:?\s*/i, "") },
    rows,
    undated,
    finals,
    warnings,
    fromCourseSite: Boolean(opts.course),
  };
}

function weightRange(weights: string[]): string {
  const nums = weights.map((w) => Number.parseFloat(w)).filter((n) => !Number.isNaN(n));
  if (!nums.length) return "TBA";
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? `${lo}%` : `${lo}-${hi}%`;
}

/** Merge per-course parses into one table: finals in the same month become one row. */
export function mergeParses(parses: CourseParse[], source: Deadline["source"] = "syllabus"): Extraction {
  // The same syllabus uploaded twice (say the PDF and a paste) shouldn't double
  // every deadline; ids must stay unique for editing.
  const rows: Deadline[] = [];
  const seenRows = new Set<string>();
  const ids = new Set<string>();
  for (const r of parses.flatMap((p) => p.rows)) {
    const key = `${r.course}|${r.what}|${r.when}`;
    if (seenRows.has(key)) continue;
    seenRows.add(key);
    let id = r.id;
    for (let n = 2; ids.has(id); n++) id = `${r.id}-${n}`;
    ids.add(id);
    rows.push(id === r.id ? r : { ...r, id });
  }
  const finals = parses
    .flatMap((p) => p.finals)
    .filter((f, i, all) => all.findIndex((o) => o.course === f.course && o.weight === f.weight) === i);
  const allCourses = new Set(parses.map((p) => p.course.code));

  const byMonth = new Map<string, FinalEntry[]>();
  for (const f of finals) {
    const key = f.month ? String(f.month) : "tba";
    byMonth.set(key, [...(byMonth.get(key) ?? []), f]);
  }
  for (const [key, group] of byMonth) {
    const courses = [...new Set(group.map((g) => g.course))];
    const course =
      courses.length > 1 && courses.length === allCourses.size ? "All" : courses.join(", ");
    const month = key === "tba" ? null : Number(key);
    rows.push({
      id: `final-${key}-${slug(course)}`,
      course,
      what: courses.length > 1 ? "Final exams" : "Final exam",
      worth: weightRange(group.map((g) => g.weight)),
      covers: "",
      when: month ? formatWhen({ kind: "month", month, assumed: false }) : "TBA",
      hint: month ? undefined : group[0].hint || undefined,
      source,
    });
  }

  const repeated = [...new Set(parses.map((p) => p.course.code))].filter(
    (code) => parses.filter((p) => p.course.code === code && !p.fromCourseSite).length > 1,
  );
  // A syllabus page with no marks is fine if the course's PDF has them.
  const hasMarks = (code: string) =>
    parses.some((p) => p.course.code === code && (p.rows.length || p.undated.length || p.finals.length));
  return {
    courses: parses
      .map((p) => p.course)
      .filter((c, i, all) => all.findIndex((o) => o.code === c.code) === i),
    rows,
    undated: [...new Set(parses.flatMap((p) => p.undated))],
    warnings: [
      ...new Set(
        parses.flatMap((p) =>
          p.warnings.filter((w) => w !== noMarksWarning(p.course.code) || !hasMarks(p.course.code)),
        ),
      ),
      ...repeated.map((code) => `${code} was added more than once. Identical rows were merged.`),
    ],
  };
}

export function parseSyllabuses(
  sources: Array<{ name: string; text: string; course?: CourseInfo }>,
  opts: { term: string },
): Extraction {
  return mergeParses(
    sources.map((s) => parseSyllabus(s.text, { term: opts.term, sourceName: s.name, course: s.course })),
  );
}

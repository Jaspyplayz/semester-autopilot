// App state and its transitions. Pure, so it's unit tested and independent of
// where state lives. v0 keeps it in localStorage (see store.ts). To add accounts
// later, implement StateRepository against a backend and scope it to the user;
// nothing else needs to know.

import { isValidTimeZone } from "./dates";
import { isPast, normalizeWhen, sortRows, termOf, whatYouConfirmed } from "./table";
import type { CourseInfo, Deadline, Extraction, SyllabusSource } from "./types";

export type Step = "input" | "confirm" | "done";

export interface Draft {
  rows: Deadline[];
  /** What the extraction proposed, kept to describe the student's changes. */
  original: Deadline[];
  undated: string[];
  courses: CourseInfo[];
  warnings: string[];
  method: "rules" | "llm";
}

export interface Confirmed {
  rows: Deadline[];
  undated: string[];
  notes: string[];
  confirmedOn: string;
}

export interface AppState {
  version: 1;
  step: Step;
  term: string;
  timezone: string;
  /** "Pretend today is", for trying the sample. Empty means the real date. */
  todayOverride: string;
  sources: SyllabusSource[];
  draft: Draft | null;
  showPast: boolean;
  confirmed: Confirmed | null;
}

export interface StateRepository {
  load(): AppState | null;
  /** False if it couldn't be saved (e.g. storage full). */
  save(state: AppState): boolean;
  clear(): void;
}

export function defaultState(): AppState {
  return {
    version: 1,
    step: "input",
    term: "Fall 2026",
    timezone: "America/Toronto",
    todayOverride: "",
    sources: [],
    draft: null,
    showPast: false,
    confirmed: null,
  };
}

/** Accepts what came out of storage only if it's the shape this version wrote. */
export function reviveState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<AppState>;
  if (s.version !== 1 || !Array.isArray(s.sources)) return null;
  if (typeof s.term !== "string" || typeof s.timezone !== "string") return null;
  // A bad time zone can only be fixed on the input step (and would break .ics).
  const usable = isValidTimeZone(s.timezone);
  const step: Step =
    usable && s.step === "confirm" && s.draft ? "confirm" : usable && s.step === "done" && s.confirmed ? "done" : "input";
  return { ...defaultState(), ...s, step };
}

export function startDraft(state: AppState, extraction: Extraction, method: Draft["method"]): AppState {
  return {
    ...state,
    step: "confirm",
    showPast: false,
    confirmed: null,
    draft: {
      rows: extraction.rows,
      original: extraction.rows,
      undated: extraction.undated,
      courses: extraction.courses,
      warnings: extraction.warnings,
      method,
    },
  };
}

/** Rows in play: past items stay out unless the student asked to see them. */
export function visibleRows(rows: Deadline[], state: Pick<AppState, "showPast" | "term">, today: string): Deadline[] {
  if (state.showPast) return rows;
  const term = termOf(state.term, today);
  return rows.filter((r) => !isPast(r, term, today));
}

export function confirmDraft(state: AppState, today: string): AppState {
  if (!state.draft) return state;
  const term = termOf(state.term, today);
  const rows = sortRows(visibleRows(state.draft.rows, state, today), term).map((r) => ({
    ...r,
    when: normalizeWhen(r.when, term),
  }));
  const original = visibleRows(state.draft.original, state, today);
  return {
    ...state,
    step: "done",
    confirmed: {
      rows,
      undated: state.draft.undated,
      notes: whatYouConfirmed(original, rows, term),
      confirmedOn: today,
    },
  };
}

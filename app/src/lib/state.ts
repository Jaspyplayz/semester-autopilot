// App state and its transitions. Pure, so it's unit tested and independent of
// where state lives. v0 keeps it in localStorage (see store.ts). To add accounts
// later, implement StateRepository against a backend and scope it to the user;
// nothing else needs to know.

import { DEFAULT_CANVAS_URL } from "./canvas-url";
import { isValidTimeZone } from "./dates";
import { parseSyllabuses } from "./parse";
import { DEFAULT_PLAN_SETTINGS, buildPlans, deadlinesBasis, type PlanSet, type PlanSettings } from "./planner";
import { isPast, normalizeWhen, sortRows, termOf, whatYouConfirmed } from "./table";
import type { CourseInfo, Deadline, Extraction, SyllabusSource } from "./types";

export type Step = "input" | "confirm" | "plans" | "done";

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
  /** Study plans for the confirmed deadlines. Confirmed once plans.confirmedOn is set. */
  plans: PlanSet | null;
  planSettings: PlanSettings;
  /** The course site's address. Its token is kept apart from this: see canvas-session.ts. */
  canvasBaseUrl: string;
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
    plans: null,
    planSettings: DEFAULT_PLAN_SETTINGS,
    canvasBaseUrl: DEFAULT_CANVAS_URL,
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
    usable && s.step === "confirm" && s.draft
      ? "confirm"
      : usable && s.step === "plans" && s.plans && s.confirmed
        ? "plans"
        : usable && s.step === "done" && s.confirmed
          ? "done"
          : "input";
  return { ...defaultState(), ...s, step };
}

export function startDraft(state: AppState, extraction: Extraction, method: Draft["method"]): AppState {
  return {
    ...state,
    step: "confirm",
    showPast: false,
    confirmed: null,
    plans: null,
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

export interface CanvasImport {
  sources: SyllabusSource[];
  /** Shown above the table: files that couldn't be read, courses with no syllabus. */
  notes: string[];
  /** The course site's term, when the chosen courses agree on one. */
  term: string | null;
}

/** Swaps in a fresh import from the course site and reads it. An empty import changes nothing. */
export function applyCanvasImport(state: AppState, imported: CanvasImport): AppState {
  if (!imported.sources.length) return state;
  const next: AppState = {
    ...state,
    term: imported.term ?? state.term,
    sources: [...state.sources.filter((s) => s.kind !== "canvas"), ...imported.sources],
  };
  const extraction = parseSyllabuses(next.sources, { term: next.term });
  return startDraft(next, { ...extraction, warnings: [...imported.notes, ...extraction.warnings] }, "rules");
}

/** Rows in play: past items stay out unless the student asked to see them. */
export function visibleRows(rows: Deadline[], state: Pick<AppState, "showPast" | "term">, today: string): Deadline[] {
  if (state.showPast) return rows;
  const term = termOf(state.term, today);
  return rows.filter((r) => !isPast(r, term, today));
}

function confirmedRows(state: AppState, draft: Draft, today: string): Deadline[] {
  const term = termOf(state.term, today);
  return sortRows(visibleRows(draft.rows, state, today), term).map((r) => ({
    ...r,
    when: normalizeWhen(r.when, term),
  }));
}

/** Confirming goes on to the plans. Plans for the same deadlines keep the student's edits. */
export function confirmDraft(state: AppState, today: string): AppState {
  if (!state.draft) return state;
  const term = termOf(state.term, today);
  const rows = confirmedRows(state, state.draft, today);
  const original = visibleRows(state.draft.original, state, today);
  const next: AppState = {
    ...state,
    step: "plans",
    confirmed: {
      rows,
      undated: state.draft.undated,
      notes: whatYouConfirmed(original, rows, term),
      confirmedOn: today,
    },
  };
  if (state.plans?.basis === deadlinesBasis(rows)) {
    return { ...next, plans: { ...state.plans, confirmedOn: null } };
  }
  return rebuildPlans(next, today);
}

/** True if confirming this draft would replace plans the student has edited. */
export function wouldLosePlanEdits(state: AppState, today: string): boolean {
  if (!state.draft || !state.plans?.edited) return false;
  return state.plans.basis !== deadlinesBasis(confirmedRows(state, state.draft, today));
}

/** A fresh plan from the confirmed deadlines, starting today. */
export function rebuildPlans(state: AppState, today: string, settings: PlanSettings = state.planSettings): AppState {
  if (!state.confirmed) return state;
  return {
    ...state,
    planSettings: settings,
    plans: buildPlans({
      rows: state.confirmed.rows,
      courses: state.draft?.courses ?? [],
      sources: state.sources,
      term: termOf(state.term, today),
      today,
      settings,
    }),
  };
}

export function confirmPlans(state: AppState, today: string): AppState {
  if (!state.plans) return state;
  return { ...state, step: "done", plans: { ...state.plans, confirmedOn: today } };
}

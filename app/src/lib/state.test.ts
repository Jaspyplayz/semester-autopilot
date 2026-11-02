import { describe, expect, it } from "vitest";
import { applyCanvasImport, confirmDraft, defaultState, reviveState, startDraft, visibleRows } from "./state";
import type { Deadline, Extraction, SyllabusSource } from "./types";

function row(over: Partial<Deadline>): Deadline {
  return { id: over.what ?? "x", course: "ABC 100", what: "Thing", worth: "10%", covers: "", when: "TBA", source: "syllabus", ...over };
}

const extraction: Extraction = {
  courses: [{ code: "ABC 100", name: "Thing" }],
  rows: [row({ what: "Later", when: "Fri Oct 30" }), row({ what: "Past", when: "Fri Sep 25" }), row({ what: "Soon", when: "Fri Oct 9" })],
  undated: ["ABC 100 labs (5%)"],
  warnings: [],
};
const TODAY = "2026-10-05";

describe("defaults", () => {
  it("start on Fall 2026 in Toronto, as the brief says", () => {
    expect(defaultState()).toMatchObject({ step: "input", term: "Fall 2026", timezone: "America/Toronto" });
  });
});

describe("reviveState", () => {
  it("rejects anything that isn't this version's shape", () => {
    expect(reviveState(null)).toBeNull();
    expect(reviveState("x")).toBeNull();
    expect(reviveState({ version: 2, sources: [], term: "", timezone: "" })).toBeNull();
    expect(reviveState({ version: 1, term: "Fall 2026" })).toBeNull();
  });

  it("round-trips a saved state through JSON", () => {
    const s = startDraft(defaultState(), extraction, "rules");
    expect(reviveState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("falls back to the input step when the step's data is missing", () => {
    expect(reviveState({ ...defaultState(), step: "done", confirmed: null })?.step).toBe("input");
    expect(reviveState({ ...defaultState(), step: "confirm", draft: null })?.step).toBe("input");
  });
});

describe("reviveState with a bad time zone", () => {
  it("sends the student back to the input step to fix it", () => {
    const s = startDraft(defaultState(), extraction, "rules");
    expect(reviveState({ ...s, timezone: "Mars/Olympus" })?.step).toBe("input");
  });
});

describe("visibleRows", () => {
  it("hides past rows unless asked", () => {
    const s = startDraft(defaultState(), extraction, "rules");
    expect(visibleRows(s.draft!.rows, s, TODAY).map((r) => r.what)).toEqual(["Later", "Soon"]);
    expect(visibleRows(s.draft!.rows, { ...s, showPast: true }, TODAY)).toHaveLength(3);
  });
});

describe("confirmDraft", () => {
  it("sorts, tidies dates and doesn't report hidden past rows as skipped", () => {
    let s = startDraft(defaultState(), extraction, "rules");
    s = { ...s, draft: { ...s.draft!, rows: s.draft!.rows.map((r) => (r.what === "Later" ? { ...r, when: "oct 30 5pm" } : r)) } };
    const done = confirmDraft(s, TODAY);
    expect(done.step).toBe("done");
    expect(done.confirmed).toMatchObject({ confirmedOn: TODAY, undated: ["ABC 100 labs (5%)"] });
    expect(done.confirmed!.rows.map((r) => [r.what, r.when])).toEqual([
      ["Soon", "Fri Oct 9"],
      ["Later", "Fri Oct 30, 17:00"],
    ]);
    expect(done.confirmed!.notes).toEqual(["ABC 100 later: moved from Fri Oct 30 to Fri Oct 30, 17:00."]);
  });

  it("keeps past rows when the student chose to show them", () => {
    const s = { ...startDraft(defaultState(), extraction, "rules"), showPast: true };
    expect(confirmDraft(s, TODAY).confirmed!.rows.map((r) => r.what)).toEqual(["Past", "Soon", "Later"]);
  });

  it("does nothing without a draft", () => {
    const s = defaultState();
    expect(confirmDraft(s, TODAY)).toBe(s);
  });
});

describe("applyCanvasImport", () => {
  const canvas = (id: string): SyllabusSource => ({
    id,
    name: `ABC 100 · ${id}`,
    kind: "canvas",
    text: "## Marking\n| Item | Weight | Due |\n| Midterm | 25% | Oct 15, 2026 |",
    course: { code: "ABC 100", name: "Thing" },
  });
  const pasted: SyllabusSource = { id: "p", name: "Pasted text 1", kind: "paste", text: "XYZ 200\nMidterm 25% Oct 20, 2026" };

  it("replaces earlier Canvas sources, keeps uploads, and opens the confirm step", () => {
    const start = { ...defaultState(), sources: [canvas("old"), pasted] };
    const next = applyCanvasImport(start, { sources: [canvas("new")], notes: ["A note."], term: null });
    expect(next.sources.map((s) => s.id)).toEqual(["p", "new"]);
    expect(next.step).toBe("confirm");
    expect(next.draft?.method).toBe("rules");
    expect(next.draft?.courses.map((c) => c.code).sort()).toEqual(["ABC 100", "XYZ 200"]);
    expect(next.draft?.warnings).toContain("A note.");
  });

  it("adopts the course site's term when there is one", () => {
    const next = applyCanvasImport(defaultState(), { sources: [canvas("a")], notes: [], term: "2026 Fall" });
    expect(next.term).toBe("2026 Fall");
    expect(applyCanvasImport(defaultState(), { sources: [canvas("a")], notes: [], term: null }).term).toBe("Fall 2026");
  });

  it("changes nothing when nothing came back, so a failed retry keeps the last import", () => {
    const start = { ...defaultState(), sources: [canvas("old")] };
    expect(applyCanvasImport(start, { sources: [], notes: ["nothing"], term: "2027 Winter" })).toBe(start);
  });

  it("keeps the base URL through a save and reload, and never a token", () => {
    const s = { ...defaultState(), canvasBaseUrl: "https://canvas.school.edu" };
    expect(reviveState(JSON.parse(JSON.stringify(s)))?.canvasBaseUrl).toBe("https://canvas.school.edu");
    expect(JSON.stringify(defaultState()).toLowerCase()).not.toContain("token");
  });
});

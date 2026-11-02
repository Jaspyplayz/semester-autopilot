"use client";

import { parseWhen } from "@/lib/dates";
import { confirmDraft, visibleRows, wouldLosePlanEdits, type AppState, type Draft } from "@/lib/state";
import { update } from "@/lib/store";
import {
  CLOSING_QUESTION,
  isFlagged,
  isNextSevenDays,
  isPast,
  normalizeWhen,
  pleaseCheck,
  sortRows,
  termOf,
  unreadableWhen,
} from "@/lib/table";
import type { Deadline } from "@/lib/types";
import { Button, Card, COLUMNS } from "./ui";

type Field = "when" | "course" | "what" | "worth" | "covers";
const FIELDS: Field[] = ["when", "course", "what", "worth", "covers"];
const WIDTHS: Record<Field, string> = {
  when: "sm:w-[22%]",
  course: "sm:w-[11%]",
  what: "sm:w-[27%]",
  worth: "sm:w-[14%]",
  covers: "sm:w-[20%]",
};
// On a phone each row is a card: Course and Worth share a line, the rest get their own.
const PHONE_SPAN: Record<Field, string> = {
  when: "max-sm:col-span-2",
  course: "",
  what: "max-sm:col-span-2",
  worth: "",
  covers: "max-sm:col-span-2",
};

let nextManual = 0;

function changeDraft(change: (draft: Draft) => Draft) {
  update((s) => (s.draft ? { ...s, draft: change(s.draft) } : s));
}

function changeRow(id: string, change: (row: Deadline) => Deadline) {
  changeDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? change(r) : r)) }));
}

function isCellFlagged(value: string) {
  return /\bTBA\b|\(assumed\)/i.test(value);
}

export function ConfirmStep({ state, draft, today }: { state: AppState; draft: Draft; today: string }) {
  const term = termOf(state.term, today);
  const shown = sortRows(visibleRows(draft.rows, state, today), term);
  const pastCount = draft.rows.filter((r) => isPast(r, term, today)).length;
  const questions = pleaseCheck(shown, term, today);
  const unreadable = unreadableWhen(shown, term);
  const incomplete = shown.filter((r) => !r.course.trim() || !r.what.trim());
  const liveIds = new Set(draft.rows.map((r) => r.id));
  const skipped = draft.original.filter((r) => !liveIds.has(r.id));
  const flaggedCount = shown.filter(isFlagged).length;

  function commit(row: Deadline, field: Field, raw: string) {
    const value = field === "when" ? normalizeWhen(raw, term) : raw.trim();
    if (value === row[field]) return;
    // An edited date answers any question the parser had about it.
    changeRow(row.id, (r) => ({ ...r, [field]: value, question: field === "when" ? undefined : r.question }));
  }

  function addRow() {
    nextManual += 1;
    const row: Deadline = {
      id: `manual-${Date.now()}-${nextManual}`,
      course: draft.courses[0]?.code ?? "",
      what: "",
      worth: "TBA",
      covers: "",
      when: "TBA",
      source: "manual",
    };
    changeDraft((d) => ({ ...d, rows: [...d.rows, row] }));
  }

  return (
    <>
      <Card>
        <h2 className="font-semibold">Deadlines, {state.term}</h2>
        <p className="mt-1 text-sm text-stone-600">
          Soonest first, in {state.timezone}. &quot;(assumed)&quot; = not stated in the syllabus. Tap any cell to edit it.
          {draft.method === "llm" && " Read by Claude, so check it closely."}
        </p>

        {draft.warnings.length > 0 && (
          <ul className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {draft.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        {shown.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">
            No upcoming deadlines found. Add them below, or go back and try different text.
          </p>
        ) : (
          <table className="mt-4 w-full table-fixed border-collapse text-sm max-sm:block">
            <thead className="max-sm:hidden">
              <tr className="border-b border-stone-300 text-left">
                {COLUMNS.map((c, i) => (
                  <th key={c} scope="col" className={`px-1 py-2 font-medium ${WIDTHS[FIELDS[i]]}`}>
                    {c}
                  </th>
                ))}
                <th scope="col" className="w-[6%] px-1 py-2">
                  <span className="sr-only">Skip</span>
                </th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {shown.map((row) => {
                const soon = isNextSevenDays(row, term, today);
                const bad = parseWhen(row.when, term) === null;
                return (
                  <tr
                    key={row.id}
                    data-testid="deadline-row"
                    className="border-b border-stone-100 align-top max-sm:mb-3 max-sm:grid max-sm:grid-flow-dense max-sm:grid-cols-2 max-sm:rounded-md max-sm:border max-sm:border-stone-200 max-sm:p-2"
                  >
                    {FIELDS.map((field, i) => (
                      <td key={field} className={`p-1 max-sm:block ${PHONE_SPAN[field]}`}>
                        <span className="text-xs text-stone-500 sm:hidden">{COLUMNS[i]}</span>
                        <input
                          // Uncontrolled and keyed by value: typing doesn't re-sort the
                          // table; the edit lands on blur and a new value remounts it.
                          key={row[field]}
                          defaultValue={row[field]}
                          aria-label={`${COLUMNS[i]}: ${row.course} ${row.what}`.trim()}
                          aria-invalid={field === "when" && bad}
                          onBlur={(e) => commit(row, field, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className={`w-full rounded border px-2 py-1.5 ${soon ? "font-bold" : ""} ${
                            field === "when" && bad
                              ? "border-red-500 bg-red-50"
                              : isCellFlagged(row[field])
                                ? "border-amber-300 bg-amber-50"
                                : "border-transparent hover:border-stone-300 max-sm:border-stone-200"
                          }`}
                        />
                        {field === "when" && bad && (
                          <p className="mt-1 text-xs text-red-700">Try &quot;Fri Oct 16, 23:59&quot;, &quot;December&quot; or &quot;TBA&quot;.</p>
                        )}
                      </td>
                    ))}
                    <td className="p-1 text-right max-sm:col-span-2 max-sm:block">
                      <button
                        type="button"
                        className="px-1 py-1.5 text-sm text-stone-500 underline hover:text-stone-900"
                        aria-label={`Skip ${row.course} ${row.what}`.trim()}
                        onClick={() => changeDraft((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== row.id) }))}
                      >
                        Skip
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={addRow}>Add a row</Button>
          {pastCount > 0 && (
            <button
              type="button"
              className="text-sm text-stone-600 underline"
              onClick={() => update((s) => ({ ...s, showPast: !s.showPast }))}
            >
              {state.showPast ? `Hide ${pastCount} already past` : `Show ${pastCount} already past`}
            </button>
          )}
        </div>

        {skipped.length > 0 && (
          <p className="mt-3 text-sm text-stone-600">
            Skipping:{" "}
            {skipped.map((r, i) => (
              <span key={r.id}>
                {i > 0 && ", "}
                {r.course} {r.what}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => changeDraft((d) => ({ ...d, rows: [...d.rows, r] }))}
                >
                  (restore)
                </button>
              </span>
            ))}
          </p>
        )}

        <div className="mt-4">
          <label className="text-sm font-medium" htmlFor="undated">
            Not dated
          </label>
          <input
            id="undated"
            key={draft.undated.join("|")}
            defaultValue={draft.undated.join(", ")}
            onBlur={(e) =>
              changeDraft((d) => ({
                ...d,
                undated: e.target.value
                  .split(/,\s*/)
                  .map((x) => x.trim().replace(/\.$/, ""))
                  .filter(Boolean),
              }))
            }
            className="mt-1 w-full rounded border border-stone-200 px-2 py-1.5 text-sm"
          />
        </div>
      </Card>

      {questions.length > 0 && (
        <Card title="Please check">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          {flaggedCount > 0 && (
            <p className="mt-2 text-xs text-stone-500">Answer by editing the highlighted cells above.</p>
          )}
        </Card>
      )}

      <p className="mb-3 font-medium">{CLOSING_QUESTION}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={unreadable.length > 0 || incomplete.length > 0}
          onClick={() => {
            if (
              wouldLosePlanEdits(state, today) &&
              !window.confirm("Your deadlines changed, so your study plans will be rebuilt. Your edits to them will be replaced.")
            ) {
              return;
            }
            update((s) => confirmDraft(s, today));
          }}
        >
          Confirm deadlines
        </Button>
        <Button onClick={() => update((s) => ({ ...s, step: "input" }))}>Back</Button>
        {unreadable.length > 0 && (
          <span role="alert" className="text-sm text-red-700">
            Fix the dates in red first.
          </span>
        )}
        {incomplete.length > 0 && (
          <span role="alert" className="text-sm text-red-700">
            New rows need a course and a name.
          </span>
        )}
      </div>
    </>
  );
}

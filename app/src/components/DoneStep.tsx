"use client";

import { useState } from "react";
import { buildIcs } from "@/lib/ics";
import { deadlinesMarkdown, plainText, undatedLine } from "@/lib/markdown";
import type { AppState, Confirmed } from "@/lib/state";
import { resetAll, update } from "@/lib/store";
import { isNextSevenDays, sortRows, termOf } from "@/lib/table";
import { Button, Card, COLUMNS } from "./ui";

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function DoneStep({ state, confirmed, today }: { state: AppState; confirmed: Confirmed; today: string }) {
  const [copyStatus, setCopyStatus] = useState("");
  const term = termOf(state.term, today);
  const rows = sortRows(confirmed.rows, term);
  const markdown = deadlinesMarkdown({
    rows,
    undated: confirmed.undated,
    confirmedNotes: confirmed.notes,
    term,
    timezone: state.timezone,
    confirmedOn: confirmed.confirmedOn,
  });
  const calendar = buildIcs(rows, { term, timezone: state.timezone });
  const nd = undatedLine(confirmed.undated);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`Copied as ${label}.`);
    } catch {
      setCopyStatus("This browser blocked copying. Use the download instead.");
    }
  }

  return (
    <>
      <Card title={`Deadlines, ${state.term}`}>
        <p className="text-sm text-stone-600">
          Times are {state.timezone}. &quot;(assumed)&quot; = not stated in the syllabus.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-left">
                {COLUMNS.map((c) => (
                  <th key={c} scope="col" className="px-2 py-2 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  data-testid="confirmed-row"
                  className={`border-b border-stone-100 ${isNextSevenDays(r, term, today) ? "font-bold" : ""}`}
                >
                  {[r.when, r.course, r.what, r.worth, r.covers].map((v, i) => (
                    <td key={COLUMNS[i]} className="px-2 py-2 align-top">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nd && <p className="mt-3 text-sm text-stone-600">{nd}</p>}
      </Card>

      <Card title="What you confirmed">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {confirmed.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Card>

      <Card title="Take it with you">
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => download("deadlines.md", markdown, "text/markdown;charset=utf-8")}>
            Download deadlines.md
          </Button>
          <Button
            variant="primary"
            disabled={calendar.eventCount === 0}
            onClick={() => download("deadlines.ics", calendar.ics, "text/calendar;charset=utf-8")}
          >
            Download .ics
          </Button>
          <Button onClick={() => copy(markdown, "markdown")}>Copy as markdown</Button>
          <Button onClick={() => copy(plainText(rows, confirmed.undated, term), "plain text")}>Copy as plain text</Button>
        </div>
        {copyStatus && (
          <p role="status" className="mt-2 text-sm text-stone-600">
            {copyStatus}
          </p>
        )}
        <p className="mt-3 text-sm text-stone-600">
          The calendar file has {calendar.eventCount} {calendar.eventCount === 1 ? "event" : "events"}. Import it into a
          separate calendar so you can delete it in one go.
          {calendar.skipped.length > 0 &&
            ` Left out because they have no date yet: ${calendar.skipped.map((r) => `${r.course} ${r.what}`).join(", ")}.`}
        </p>
      </Card>

      <p className="mb-4 text-sm text-stone-600">
        Study plans and the weekly schedule aren&apos;t in the web app yet. Keep deadlines.md and give it to the Claude
        skill to get them.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => update((s) => ({ ...s, step: "confirm" }))}>Edit deadlines</Button>
        <Button
          onClick={() => {
            if (window.confirm("Clear your syllabuses and deadlines from this browser?")) resetAll();
          }}
        >
          Start over
        </Button>
      </div>
    </>
  );
}

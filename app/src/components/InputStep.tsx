"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { isValidTimeZone, parseTerm } from "@/lib/dates";
import { parseSyllabuses } from "@/lib/parse";
import { startDraft, type AppState } from "@/lib/state";
import { update } from "@/lib/store";
import type { Extraction, SyllabusSource } from "@/lib/types";
import { Button, Card } from "./ui";

const SAMPLES = ["BIO110", "CS150", "HIS201"];
const SAMPLE_TODAY = "2026-10-05";
const INPUT = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm";

let nextId = 0;
const newId = (name: string) => `${Date.now()}-${nextId++}-${name}`;

function addSources(added: SyllabusSource[]) {
  update((s) => ({ ...s, sources: [...s.sources, ...added] }));
}

async function readFile(file: File): Promise<SyllabusSource> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "md" || ext === "markdown" || ext === "txt") {
    const text = await file.text();
    if (!text.trim()) throw new Error("the file is empty");
    return { id: newId(file.name), name: file.name, kind: ext === "txt" ? "txt" : "md", text };
  }
  if (ext !== "pdf") throw new Error("only PDF, .md and .txt files work here. Paste the text instead");

  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/pdf-text", { method: "POST", body });
  if (res.status === 413) throw new Error("that PDF is too big to upload. Paste its text instead");
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "couldn't read that PDF. Paste its text instead");
  return { id: newId(file.name), name: file.name, kind: "pdf", text: data.text };
}

export function InputStep({ state, today }: { state: AppState; today: string }) {
  const [pasted, setPasted] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const timeZones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

  useEffect(() => {
    fetch("/api/llm-status")
      .then((r) => r.json())
      .then((d) => setLlmEnabled(Boolean(d.enabled)))
      .catch(() => setLlmEnabled(false));
  }, []);

  const tzValid = isValidTimeZone(state.timezone);
  const term = parseTerm(state.term, Number(today.slice(0, 4)));
  const termHasYear = /\b20\d{2}\b/.test(state.term);
  const hasSamples = state.sources.some((s) => s.kind === "sample");
  const canRead = state.sources.length > 0 && tzValid && state.term.trim() !== "" && !busy;

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    setBusy(true);
    const problems: string[] = [];
    const added: SyllabusSource[] = [];
    for (const file of files) {
      try {
        added.push(await readFile(file));
      } catch (err) {
        problems.push(`${file.name}: ${err instanceof Error ? err.message : "couldn't read it"}.`);
      }
    }
    if (added.length) addSources(added);
    setErrors(problems);
    setBusy(false);
  }

  async function loadSamples() {
    setBusy(true);
    try {
      const added = await Promise.all(
        SAMPLES.map(async (c) => {
          const res = await fetch(`/samples/${c}-syllabus.md`);
          if (!res.ok) throw new Error(c);
          return { id: newId(c), name: `${c}-syllabus.md`, kind: "sample" as const, text: await res.text() };
        }),
      );
      update((s) => ({ ...s, sources: [...s.sources.filter((x) => x.kind !== "sample"), ...added] }));
      setErrors([]);
    } catch {
      setErrors(["Couldn't load the sample syllabuses."]);
    }
    setBusy(false);
  }

  function addPasted() {
    const text = pasted.trim();
    if (!text) return;
    const n = state.sources.filter((s) => s.kind === "paste").length + 1;
    addSources([{ id: newId("paste"), name: `Pasted text ${n}`, kind: "paste", text }]);
    setPasted("");
  }

  function readWithRules() {
    const extraction = parseSyllabuses(state.sources, { term: state.term });
    update((s) => startDraft(s, extraction, "rules"));
  }

  async function readWithClaude() {
    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch("/api/extract-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: state.term, sources: state.sources.map(({ name, text }) => ({ name, text })) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.extraction) throw new Error(data?.error ?? "Claude couldn't read these. Use Read deadlines instead.");
      update((s) => startDraft(s, data.extraction as Extraction, "llm"));
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Claude couldn't read these. Use Read deadlines instead."]);
    }
    setBusy(false);
  }

  return (
    <>
      <Card title="Your syllabuses">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-100">
            Upload files
            <input
              type="file"
              multiple
              accept=".pdf,.md,.markdown,.txt,application/pdf,text/plain,text/markdown"
              className="sr-only"
              onChange={onFiles}
              disabled={busy}
            />
          </label>
          <Button onClick={loadSamples} disabled={busy}>
            Load sample syllabuses
          </Button>
          <span className="text-sm text-stone-500">PDF, .md or .txt</span>
        </div>

        <label className="mt-4 block text-sm font-medium" htmlFor="paste">
          Or paste a course outline
        </label>
        <textarea
          id="paste"
          rows={4}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          className={`${INPUT} mt-1`}
        />
        <Button className="mt-2" onClick={addPasted} disabled={!pasted.trim()}>
          Add pasted text
        </Button>

        {errors.length > 0 && (
          <ul role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        {state.sources.length > 0 && (
          <ul className="mt-4 divide-y divide-stone-100 border-t border-stone-100 text-sm">
            {state.sources.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate">{s.name}</span>
                <button
                  type="button"
                  className="shrink-0 text-stone-500 underline hover:text-stone-800"
                  aria-label={`Remove ${s.name}`}
                  onClick={() => update((st) => ({ ...st, sources: st.sources.filter((x) => x.id !== s.id) }))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Term and time zone">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium" htmlFor="term">
              Term
            </label>
            <input
              id="term"
              value={state.term}
              onChange={(e) => update((s) => ({ ...s, term: e.target.value }))}
              className={`${INPUT} mt-1`}
            />
            <p className="mt-1 text-xs text-stone-500">
              {termHasYear ? `Dates without a year use ${term.year}.` : `No year here, so dates use ${term.year}.`}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="tz">
              Time zone
            </label>
            <input
              id="tz"
              list="tz-list"
              value={state.timezone}
              onChange={(e) => update((s) => ({ ...s, timezone: e.target.value }))}
              className={`${INPUT} mt-1 ${tzValid ? "" : "border-red-400"}`}
            />
            <datalist id="tz-list">
              {timeZones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            {!tzValid && <p className="mt-1 text-xs text-red-700">Use a name like America/Toronto.</p>}
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="today">
              Today
            </label>
            <input
              id="today"
              type="date"
              value={today}
              onChange={(e) => update((s) => ({ ...s, todayOverride: e.target.value }))}
              className={`${INPUT} mt-1`}
            />
            <p className="mt-1 text-xs text-stone-500">
              {state.todayOverride ? (
                <button
                  type="button"
                  className="underline"
                  onClick={() => update((s) => ({ ...s, todayOverride: "" }))}
                >
                  Back to the real date
                </button>
              ) : (
                "Past deadlines are hidden and the next 7 days are bold."
              )}
            </p>
          </div>
        </div>
        {hasSamples && state.todayOverride !== SAMPLE_TODAY && (
          <p className="mt-3 text-sm text-stone-600">
            The sample school is set in early fall.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => update((s) => ({ ...s, todayOverride: SAMPLE_TODAY }))}
            >
              Pretend today is Oct 5, 2026
            </button>{" "}
            to match its example output.
          </p>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={readWithRules} disabled={!canRead}>
          Read deadlines
        </Button>
        {llmEnabled && (
          <Button onClick={readWithClaude} disabled={!canRead}>
            Read with Claude instead
          </Button>
        )}
        {state.draft && (
          <Button disabled={!tzValid} onClick={() => update((s) => ({ ...s, step: "confirm" }))}>
            Back to your table
          </Button>
        )}
        {busy && <span className="text-sm text-stone-500">Working…</span>}
      </div>
      {llmEnabled && (
        <p className="mt-2 text-xs text-stone-500">
          Read with Claude sends the syllabus text to the Anthropic API. Read deadlines works entirely without it.
        </p>
      )}
      {state.draft && (
        <p className="mt-2 text-xs text-stone-500">Reading again replaces your table, including any edits.</p>
      )}
    </>
  );
}

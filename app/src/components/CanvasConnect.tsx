"use client";

import { useState } from "react";
import type { CanvasCourse, CourseSyllabus } from "@/lib/canvas";
import { clearCanvasToken, loadCanvasToken, saveCanvasToken } from "@/lib/canvas-session";
import { normalizeBaseUrl } from "@/lib/canvas-url";
import { inferTerm } from "@/lib/dates";
import { applyCanvasImport, type AppState } from "@/lib/state";
import { update } from "@/lib/store";
import type { SyllabusSource } from "@/lib/types";
import { Button, Card, INPUT } from "./ui";

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error ?? "Couldn't reach this app's server. Try again.");
  return data as T;
}

/** For the "get a token" link only. The server does the real checking. */
function settingsUrl(baseUrl: string): string | null {
  try {
    return `${normalizeBaseUrl(baseUrl, { allowHttp: true })}/profile/settings`;
  } catch {
    return null;
  }
}

export function CanvasConnect({ state }: { state: AppState }) {
  const [token, setToken] = useState(loadCanvasToken);
  const [courses, setCourses] = useState<CanvasCourse[] | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const busy = status !== "";
  const settings = settingsUrl(state.canvasBaseUrl);

  function disconnect() {
    setCourses(null);
    setChosen(new Set());
  }

  function forgetToken() {
    clearCanvasToken();
    setToken("");
    disconnect();
    setErrors([]);
  }

  async function connect() {
    setStatus("Connecting…");
    setErrors([]);
    disconnect();
    try {
      const data = await post<{ baseUrl: string; courses: CanvasCourse[] }>("/api/canvas/courses", {
        baseUrl: state.canvasBaseUrl,
        token,
      });
      saveCanvasToken(token.trim());
      update((s) => ({ ...s, canvasBaseUrl: data.baseUrl }));
      setCourses(data.courses);
      if (!data.courses.length) setErrors(["No current courses on this account. Upload or paste a syllabus instead."]);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Couldn't connect."]);
    }
    setStatus("");
  }

  function toggle(id: string) {
    setChosen((old) => {
      const next = new Set(old);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function importChosen() {
    const picked = (courses ?? []).filter((c) => chosen.has(c.id));
    setErrors([]);
    const sources: SyllabusSource[] = [];
    const notes: string[] = [];
    // One at a time: it's kinder to the course site's rate limit, and one bad course doesn't stop the rest.
    for (const [i, course] of picked.entries()) {
      setStatus(`Reading ${course.code} (${i + 1} of ${picked.length})…`);
      try {
        const data = await post<CourseSyllabus>("/api/canvas/syllabus", {
          baseUrl: state.canvasBaseUrl,
          token,
          courseId: course.id,
        });
        data.sources.forEach((s, n) => sources.push({ ...s, id: `canvas-${course.id}-${n}` }));
        notes.push(...data.notes);
      } catch (err) {
        notes.push(`${course.code}: ${err instanceof Error ? err.message : "couldn't read this course."}`);
      }
    }
    setStatus("");
    // Without sources the step doesn't change, so the notes have to show here.
    if (!sources.length) setErrors(notes);
    update((s) => applyCanvasImport(s, { sources, notes, term: inferTerm(picked.map((c) => c.term)) }));
  }

  const terms = [...new Set((courses ?? []).map((c) => c.term))];

  return (
    <Card title="Connect Quercus or Canvas">
      <p className="text-sm text-stone-600">
        Paste an access token to pull syllabuses straight from your courses.{" "}
        {settings ? (
          <a className="underline" href={settings} target="_blank" rel="noreferrer noopener">
            Make one in your account settings
          </a>
        ) : (
          "Make one in your account settings"
        )}{" "}
        under <strong>Approved Integrations</strong>, with <strong>+ New Access Token</strong>.
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="canvas-url">
            Course site
          </label>
          <input
            id="canvas-url"
            value={state.canvasBaseUrl}
            onChange={(e) => {
              disconnect();
              update((s) => ({ ...s, canvasBaseUrl: e.target.value }));
            }}
            className={`${INPUT} mt-1`}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-stone-500">Quercus is already filled in. Any Canvas address works.</p>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="canvas-token">
            Access token
          </label>
          <input
            id="canvas-token"
            type="password"
            value={token}
            onChange={(e) => {
              disconnect();
              setToken(e.target.value);
            }}
            className={`${INPUT} mt-1`}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-stone-500">Not your password. This app will never ask for that.</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-stone-500">
        A token can do anything your account can, so give it an expiry date and delete it when you&apos;re done. This
        app only reads. The token stays in this tab, passes through this app&apos;s server only to reach the site above,
        and isn&apos;t stored or logged there.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant={courses ? "secondary" : "primary"} onClick={connect} disabled={busy || !token.trim()}>
          {courses ? "Refresh courses" : "Connect"}
        </Button>
        {token && (
          <Button onClick={forgetToken} disabled={busy}>
            Forget token
          </Button>
        )}
        {busy && <span className="text-sm text-stone-500">{status}</span>}
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {courses && courses.length > 0 && (
        <div className="mt-4 border-t border-stone-100 pt-3">
          <h3 className="text-sm font-medium">Choose your courses</h3>
          {terms.map((term) => (
            <fieldset key={term} className="mt-2">
              {term && <legend className="text-xs font-medium text-stone-500">{term}</legend>}
              {courses
                .filter((c) => c.term === term)
                .map((c) => (
                  <label key={c.id} className="flex items-baseline gap-2 py-1 text-sm">
                    <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} disabled={busy} />
                    <span>
                      <span className="font-medium">{c.code}</span>
                      {c.name && <span className="text-stone-600"> {c.name}</span>}
                    </span>
                  </label>
                ))}
            </fieldset>
          ))}
          <Button variant="primary" className="mt-3" onClick={importChosen} disabled={busy || chosen.size === 0}>
            Get deadlines
            {chosen.size > 0 && ` from ${chosen.size} ${chosen.size === 1 ? "course" : "courses"}`}
          </Button>
          <p className="mt-2 text-xs text-stone-500">Getting deadlines again replaces your table, including any edits.</p>
        </div>
      )}
    </Card>
  );
}

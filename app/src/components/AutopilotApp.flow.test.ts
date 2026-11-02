// @vitest-environment jsdom
// Replays the bug paths from verification/autopilot-steps by pressing the real
// buttons. Only adding a source and editing the table go straight to the store.
// Each `it.fails` is a known bug: fixing it turns the test red, and then `it.fails`
// becomes `it`.

import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSnapshot, resetAll, update } from "@/lib/store";
import AutopilotApp from "./AutopilotApp";

const SYLLABUS = readFileSync("public/samples/BIO110-syllabus.md", "utf8");
const SOURCE = { id: "s1", name: "BIO110-syllabus.md", kind: "md" as const, text: SYLLABUS };
const COURSE = { id: "1", code: "BIO 110", name: "Biology", term: "Fall 2026" };

let root: Root;
/** Every call to the read endpoints waits here until the test lets it land. */
let land: (body: object) => Promise<void>;

function respond(body: object): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function buttonNamed(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(name));
  if (!found) throw new Error(`no button named "${name}"`);
  return found;
}

async function press(name: string) {
  const button = buttonNamed(name);
  if (button.disabled) throw new Error(`"${name}" is disabled`);
  await act(async () => button.click());
}

async function type(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`no input ${selector}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const addSource = () => act(async () => update((s) => ({ ...s, sources: [SOURCE] })));

/** Gets as far as "Get deadlines" being pressed, with the read still in flight. */
async function startCanvasImport() {
  await type("#canvas-token", "token");
  await press("Connect");
  await act(async () => document.querySelector<HTMLInputElement>("input[type=checkbox]")?.click());
  await press("Get deadlines");
}

const canvasSyllabus = { sources: [{ name: "BIO110", kind: "canvas", text: SYLLABUS }], notes: [] };

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(window, "confirm").mockReturnValue(true);

  let release: (body: object) => void = () => {};
  const held = new Promise<object>((resolve) => {
    release = resolve;
  });
  land = (body) =>
    act(async () => {
      release(body);
      await held;
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === "/api/llm-status") return respond({ enabled: true });
      if (path === "/api/canvas/courses") return respond({ baseUrl: "https://canvas.example", courses: [COURSE] });
      return respond(await held);
    }),
  );

  resetAll();
  update((s) => ({ ...s, todayOverride: "2026-10-05" }));
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root.render(createElement(AutopilotApp)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the step flow, with a read in flight", () => {
  it("a read that finishes before the student moves on still opens the table", async () => {
    await startCanvasImport();
    await land(canvasSyllabus);
    expect(getSnapshot().step).toBe("confirm");
    expect(getSnapshot().draft?.rows.length).toBeGreaterThan(0);
  });

  // BadTimeZoneStaysOnInput
  it.fails("the course site import doesn't leave the input step with a bad time zone", async () => {
    await type("#tz", "Not/AZone");
    await startCanvasImport();
    await land(canvasSyllabus);
    expect(getSnapshot().step).toBe("input");
  });

  // LateReadKeepsWork, TLC's shortest path
  it.fails("a course site import that lands late keeps the student's edited table", async () => {
    await addSource();
    await startCanvasImport();
    await press("Read deadlines");
    await act(async () => update((s) => (s.draft ? { ...s, draft: { ...s.draft, rows: [] } } : s)));
    await land(canvasSyllabus);
    expect(getSnapshot().draft?.rows).toEqual([]);
  });

  // LateReadKeepsWork, the same rule through "Read with Claude instead"
  it.fails("a Claude read that lands late keeps the student on Done with their plans", async () => {
    await addSource();
    await press("Read deadlines");
    await press("Back");
    await press("Read with Claude instead");
    await press("Back to your table");
    await press("Confirm deadlines");
    await press("Confirm plans");
    expect(getSnapshot().step).toBe("done");
    await land({ extraction: { rows: [], undated: [], courses: [], warnings: [] } });
    expect(getSnapshot().step).toBe("done");
    expect(getSnapshot().plans).not.toBeNull();
  });

  // StartOverStaysCleared
  it.fails("Start over stays cleared when a read lands after it", async () => {
    await addSource();
    await startCanvasImport();
    await press("Read deadlines");
    await press("Confirm deadlines");
    await press("Confirm plans");
    await press("Start over");
    expect(getSnapshot().sources).toEqual([]);
    await land(canvasSyllabus);
    expect(getSnapshot().sources).toEqual([]);
    expect(getSnapshot().draft).toBeNull();
  });
});

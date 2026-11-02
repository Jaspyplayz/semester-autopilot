"use client";

import { useEffect, useSyncExternalStore } from "react";
import { todayIn } from "@/lib/dates";
import { getServerSnapshot, getSnapshot, lastSaveFailed, subscribe } from "@/lib/store";
import { ConfirmStep } from "./ConfirmStep";
import { DoneStep } from "./DoneStep";
import { InputStep } from "./InputStep";
import { PlanStep } from "./PlanStep";

const STEPS = [
  { key: "input", label: "Add syllabuses" },
  { key: "confirm", label: "Check deadlines" },
  { key: "plans", label: "Check plans" },
  { key: "done", label: "Done" },
] as const;

export default function AutopilotApp() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const step = state?.step;
  // Each step is long on a phone, so the next one has to open at its top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);
  if (!state) return <p className="text-stone-500">Loading…</p>;

  const today = state.todayOverride || todayIn(state.timezone);
  return (
    <>
      <ol className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            aria-current={state.step === s.key ? "step" : undefined}
            className={state.step === s.key ? "font-semibold text-stone-900" : "text-stone-400"}
          >
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>
      {lastSaveFailed() && (
        <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          This browser couldn&apos;t save your work (storage may be full or blocked). Download your deadlines and plans
          before closing the tab.
        </p>
      )}
      {state.step === "input" && <InputStep state={state} today={today} />}
      {state.step === "confirm" && state.draft && <ConfirmStep state={state} draft={state.draft} today={today} />}
      {state.step === "plans" && state.plans && state.confirmed && (
        <PlanStep state={state} plans={state.plans} confirmed={state.confirmed} today={today} />
      )}
      {state.step === "done" && state.confirmed && (
        <DoneStep state={state} confirmed={state.confirmed} today={today} />
      )}
    </>
  );
}

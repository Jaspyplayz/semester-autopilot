"use client";

import { useState } from "react";
import {
  STAGES,
  dueTopics,
  markBlock,
  planProgress,
  planTopics,
  progressOf,
  stageLine,
  stageOf,
  todayView,
  weekBoard,
  blockTopics,
  type BlockStatus,
  type BoardCount,
  type CoachBlock,
  type Stage,
} from "@/lib/coach";
import { formatDate } from "@/lib/dates";
import { formatHours, type CoursePlan, type PlanSet } from "@/lib/planner";
import { weeklySchedule } from "@/lib/schedule";
import { rebuildPlans, type AppState, type Confirmed } from "@/lib/state";
import { update } from "@/lib/store";
import { termOf } from "@/lib/table";
import { StudyMode, type StudyTarget } from "./StudyMode";
import { Button, Card } from "./ui";

const STAGE_LOOK: Record<Stage, string> = {
  new: "bg-stone-100 text-stone-700",
  learning: "bg-amber-100 text-amber-900",
  reviewing: "bg-indigo-100 text-indigo-900",
  secure: "bg-emerald-100 text-emerald-900",
};

function setMark(item: CoachBlock, status: BlockStatus) {
  update((s) => ({ ...s, coach: markBlock(s.coach, item, item.status === status ? null : status) }));
}

function MarkButton({ item, status, label }: { item: CoachBlock; status: BlockStatus; label: string }) {
  const on = item.status === status;
  const look = status === "done" ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-amber-600 bg-amber-50 text-amber-900";
  return (
    <Button aria-pressed={on} aria-label={`${label}: ${item.block.action}`} className={on ? look : ""} onClick={() => setMark(item, status)}>
      {on && status === "done" ? "✓ " : ""}
      {label}
    </Button>
  );
}

function BlockRow({ item, onStudy, showDate = false }: { item: CoachBlock; onStudy?: (item: CoachBlock) => void; showDate?: boolean }) {
  return (
    <li data-testid="coach-block" data-status={item.status ?? "open"} className="border-t border-stone-100 py-3 first:border-t-0">
      <p className="text-xs font-medium text-stone-500">
        {item.course} · {item.block.minutes} min{showDate && ` · ${formatDate(item.date)}`}
      </p>
      <p className={`mt-0.5 text-sm ${item.status === "done" ? "text-stone-500 line-through" : ""}`}>{item.block.action}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {onStudy && (
          <Button variant="primary" onClick={() => onStudy(item)}>
            Study
          </Button>
        )}
        <MarkButton item={item} status="done" label="Done" />
        <MarkButton item={item} status="not-done" label="Not done" />
      </div>
    </li>
  );
}

const countLine = (c: BoardCount) => `${c.done} done · ${c.left} left${c.leftMinutes ? ` · ${formatHours(c.leftMinutes)} h to go` : ""}`;

function TopicCard({ plan, state }: { plan: CoursePlan; state: AppState }) {
  const topics = planTopics(plan, state.sources);
  return (
    <div className="border-t border-stone-100 py-3 first:border-t-0" data-testid="coach-plan">
      <h3 className="text-sm font-semibold">
        {plan.course} {plan.what}, {formatDate(plan.date)}
      </h3>
      <p className="text-sm text-stone-600">{countLine(planProgress(plan, state.coach))}</p>
      {topics.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {topics.map((t) => {
            const progress = progressOf(state.coach, plan.course, t);
            return (
              <li key={t.label} className={`rounded-full px-2 py-0.5 text-xs ${STAGE_LOOK[stageOf(progress)]}`} title={stageLine(progress)}>
                {t.label}: {stageOf(progress)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function CoachStep({ state, plans, confirmed, today }: { state: AppState; plans: PlanSet; confirmed: Confirmed; today: string }) {
  const [study, setStudy] = useState<StudyTarget | null>(null);
  if (study) return <StudyMode key={`${study.block?.id ?? study.topics[0]?.label}`} target={study} state={state} today={today} onClose={() => setStudy(null)} />;

  const view = todayView(plans, state.coach, today);
  const board = weekBoard(plans, state.coach, today);
  const due = dueTopics(plans, state.coach, state.sources, today);
  const week = weeklySchedule(plans, confirmed.rows, termOf(state.term, today), today).weeks.find((w) => w.monday <= today && today <= w.sunday);
  const events = week?.days.find((d) => d.date === today)?.events ?? [];
  const notes = [...(week?.light ?? []), ...(week?.overloaded.filter((line) => line.startsWith(formatDate(today))) ?? [])];
  const stale = plans.plans.some((p) => p.date < today);

  function studyBlock(item: CoachBlock) {
    const plan = plans.plans.find((p) => p.id === item.planId);
    if (plan) setStudy({ plan, block: item.block, blockDate: item.date, topics: blockTopics(plan, item.block, state.sources) });
  }

  function rebuild() {
    if (plans.edited && !window.confirm("Rebuild your plans? Your edits to them will be replaced.")) return;
    update((s) => ({ ...rebuildPlans(s, today), step: "plans" }));
  }

  return (
    <>
      <Card title={`Today, ${formatDate(today)}`}>
        {events.length > 0 && <p className="mb-2 text-sm font-medium">On today: {events.join(", ").replace(/\*\*/g, "")}</p>}
        {view.blocks.length > 0 ? (
          <ul>
            {view.blocks.map((item) => (
              <BlockRow key={item.block.id} item={item} onStudy={studyBlock} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-600">
            Nothing planned today.{view.nextDay ? ` Next up: ${formatDate(view.nextDay)}.` : ""}
          </p>
        )}
        {view.reminders.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-stone-600">
            {view.reminders.map((r) => (
              <li key={r.block.id}>
                {r.course}: {r.block.action}
              </li>
            ))}
          </ul>
        )}
        {notes.map((line) => (
          <p key={line} className="mt-2 text-sm text-stone-600">
            {line}
          </p>
        ))}
      </Card>

      {due.length > 0 && (
        <Card title="Back for review">
          <ul className="space-y-2">
            {due.map(({ plan, topic, stage }) => (
              <li key={`${plan.id}-${topic.label}`} data-testid="coach-due" className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {plan.course} {topic.label} <span className="text-stone-500">· {stage}</span>
                </span>
                <Button onClick={() => setStudy({ plan, block: null, blockDate: today, topics: [topic] })}>Quiz me</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {view.earlier.length > 0 && (
        <Card title="Still open from this past week">
          <ul>
            {view.earlier.map((item) => (
              <BlockRow key={`${item.block.id}-${item.date}`} item={item} onStudy={studyBlock} showDate />
            ))}
          </ul>
        </Card>
      )}

      <Card title={`This week, ${formatDate(board.monday)} to ${formatDate(board.sunday)}`}>
        <p className="text-sm font-medium" data-testid="week-count">
          {countLine(board)}
        </p>
        <div className="mt-2">
          {board.days
            .filter((d) => d.items.length > 0)
            .map((day) => (
              <details key={day.date} data-testid="board-day" className="border-t border-stone-100 py-2">
                <summary className="cursor-pointer text-sm">
                  {formatDate(day.date)}
                  {day.date === today && " (today)"} · {day.done} of {day.done + day.left} done
                </summary>
                <ul>
                  {day.items.map((item) => (
                    <BlockRow key={`${item.block.id}-${item.date}`} item={item} />
                  ))}
                </ul>
              </details>
            ))}
        </div>
      </Card>

      <Card title="How it's sticking">
        <p className="mb-2 text-sm text-stone-600">
          Topics move {STAGES.join(" → ")} as you recall them on different days. Miss one and it comes back tomorrow.
        </p>
        {plans.plans.map((plan) => (
          <TopicCard key={plan.id} plan={plan} state={state} />
        ))}
      </Card>

      {stale && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          A test in your plans has passed. Rebuild to plan the next one. Your progress stays.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {stale && (
          <Button variant="primary" onClick={rebuild}>
            Rebuild from today
          </Button>
        )}
        <Button onClick={() => update((s) => ({ ...s, step: "plans" }))}>Edit plans</Button>
        <Button onClick={() => update((s) => ({ ...s, step: "done" }))}>Deadlines and downloads</Button>
      </div>
    </>
  );
}

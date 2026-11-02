"use client";

import { WEEKDAYS, formatDate } from "@/lib/dates";
import { planHeader } from "@/lib/markdown";
import {
  MAX_BLOCKS_PER_DAY,
  addBlock,
  blankBlocks,
  changeBlock,
  changeShortOnTime,
  dayMinutes,
  formatHours,
  fullDays,
  laterWeeks,
  removeBlock,
  type CoursePlan,
  type PlanDay,
  type PlanSet,
  type PlanSettings,
} from "@/lib/planner";
import { weeklySchedule, type WeeklySchedule } from "@/lib/schedule";
import { confirmPlans, rebuildPlans, type AppState, type Confirmed } from "@/lib/state";
import { update } from "@/lib/store";
import { termOf } from "@/lib/table";
import { Button, Card, INPUT } from "./ui";

// Monday first, as a student's week reads.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const REPLACE_EDITS = "Rebuild your plans? Your edits to them will be replaced.";

let nextCustom = 0;

function changePlans(change: (plans: PlanSet) => PlanSet) {
  update((s) => (s.plans ? { ...s, plans: change(s.plans) } : s));
}

function DayEditor({ plan, day, title }: { plan: CoursePlan; day: PlanDay; title: string }) {
  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold">
        {title}
        {dayMinutes(day) > 0 && ` · ${formatHours(dayMinutes(day))} h`}
        {day.label && <span className="font-normal text-stone-600"> · {day.label}</span>}
      </h4>
      <ul className="mt-1 space-y-2">
        {day.blocks.map((block) => (
          <li key={block.id} data-testid="plan-block" className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
            {block.minutes > 0 || block.kind === "custom" ? (
              <label className="flex items-center gap-1 text-xs text-stone-500">
                <input
                  key={block.minutes}
                  type="number"
                  min={5}
                  step={15}
                  defaultValue={block.minutes}
                  aria-label={`Minutes: ${block.action}`}
                  onBlur={(e) => {
                    const minutes = Math.round(Number(e.target.value));
                    if (minutes >= 5 && minutes !== block.minutes) {
                      changePlans((p) => changeBlock(p, plan.id, day.date, block.id, { minutes }));
                    } else {
                      e.target.value = String(block.minutes);
                    }
                  }}
                  className="w-16 rounded border border-stone-200 px-2 py-1.5 text-sm text-stone-900"
                />
                min
              </label>
            ) : null}
            <textarea
              key={block.action}
              rows={3}
              defaultValue={block.action}
              placeholder="One thing to do, and where to find it"
              aria-label={`Study block on ${formatDate(day.date)}`}
              onBlur={(e) => {
                const action = e.target.value.replace(/\s*\n\s*/g, " ").trim();
                if (action !== block.action) changePlans((p) => changeBlock(p, plan.id, day.date, block.id, { action }));
              }}
              className={`min-w-0 flex-1 basis-full rounded border px-2 py-1.5 text-sm sm:basis-auto ${
                block.action.trim() ? "border-stone-200" : "border-red-500 bg-red-50"
              }`}
            />
            <button
              type="button"
              className="px-1 py-1.5 text-sm text-stone-500 underline hover:text-stone-900"
              aria-label={`Remove block on ${formatDate(day.date)}: ${block.action}`}
              onClick={() => changePlans((p) => removeBlock(p, plan.id, day.date, block.id))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {day.blocks.length < MAX_BLOCKS_PER_DAY && (
        <button
          type="button"
          className="mt-1 text-sm text-stone-600 underline"
          onClick={() => {
            nextCustom += 1;
            changePlans((p) => addBlock(p, plan.id, day.date, `custom-${Date.now()}-${nextCustom}`));
          }}
        >
          Add a block
        </button>
      )}
    </div>
  );
}

function PlanCard({ plan }: { plan: CoursePlan }) {
  const [first, second] = planHeader(plan);
  const later = laterWeeks(plan);
  return (
    <Card>
      <h3 className="font-semibold">{first}</h3>
      <p className="mt-1 text-sm text-stone-600">{second}</p>
      {fullDays(plan).map((day) => (
        <DayEditor key={day.date} plan={plan} day={day} title={formatDate(day.date)} />
      ))}
      {later.length > 0 && (
        <div className="mt-4 text-sm text-stone-600">
          <p className="font-medium">Later</p>
          <ul className="list-disc pl-5">
            {later.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-stone-500">Rebuild closer to the date to see and edit these days.</p>
        </div>
      )}
      <DayEditor plan={plan} day={plan.testDay} title={`${plan.kind === "test" ? "Test day" : "Due day"}, ${formatDate(plan.date)}`} />
      <label className="mt-4 block text-sm font-medium">
        Short on time?
        <textarea
          key={plan.shortOnTime}
          rows={2}
          defaultValue={plan.shortOnTime}
          onBlur={(e) => {
            const text = e.target.value.replace(/\s*\n\s*/g, " ").trim();
            if (text && text !== plan.shortOnTime) changePlans((p) => changeShortOnTime(p, plan.id, text));
          }}
          className={`${INPUT} mt-1 font-normal`}
        />
      </label>
      <details className="mt-3 text-sm text-stone-600">
        <summary className="cursor-pointer">Details: topics, assumptions, sources</summary>
        <dl className="mt-2 space-y-2">
          {[
            ["Topics covered", plan.details.topics],
            ["Assumed", plan.details.assumed],
            ["Sources", plan.details.sources],
            ["Clashes", plan.details.clashes],
            ["Not checked", plan.details.notChecked],
          ].map(([term, text]) => (
            <div key={term}>
              <dt className="font-medium text-stone-800">{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs">Hours are estimates. Stop at your bedtime: no block is worth an all-nighter.</p>
      </details>
    </Card>
  );
}

function ScheduleCard({ schedule }: { schedule: WeeklySchedule }) {
  return (
    <Card title="Your weekly schedule">
      <p className="text-sm text-stone-600">Hours per course. This follows your edits to the plans above.</p>
      {schedule.weeks.map((week) => (
        <div key={week.monday} className="mt-4">
          <h3 className="text-sm font-semibold">
            Week of {formatDate(week.monday)} to {formatDate(week.sunday)}
          </h3>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left">
                  {["Day", ...schedule.courses, "Total", "Fixed events"].map((c) => (
                    <th key={c} scope="col" className="px-2 py-1.5 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {week.days.map((day) => (
                  <tr key={day.date} data-testid="schedule-day" className="border-b border-stone-100">
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(day.date)}</td>
                    {day.minutes.map((m, i) => (
                      <td key={schedule.courses[i]} className="px-2 py-1.5">
                        {m ? formatHours(m) : "–"}
                      </td>
                    ))}
                    <td className="px-2 py-1.5">{day.total ? formatHours(day.total) : "–"}</td>
                    <td className="px-2 py-1.5">{day.events.join(", ").replace(/\*\*/g, "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {[...week.light, ...week.overloaded].map((line) => (
            <p key={line} className="mt-1 text-sm text-stone-600">
              {line}
            </p>
          ))}
        </div>
      ))}
    </Card>
  );
}

export function PlanStep({
  state,
  plans,
  confirmed,
  today,
}: {
  state: AppState;
  plans: PlanSet;
  confirmed: Confirmed;
  today: string;
}) {
  const term = termOf(state.term, today);
  const schedule = weeklySchedule(plans, confirmed.rows, term, today);
  const blanks = blankBlocks(plans);

  function rebuild(settings: PlanSettings = state.planSettings) {
    if (plans.edited && !window.confirm(REPLACE_EDITS)) return false;
    update((s) => rebuildPlans(s, today, settings));
    return true;
  }

  return (
    <>
      <Card title="Your study plans">
        <p className="text-sm text-stone-600">
          A short plan for each course, built only from the deadlines you confirmed. Change anything you like.
        </p>
        <p className="mt-2 text-sm text-stone-600">
          Built on research: test yourself, spread it out, mix problem types, and sleep. It feels harder, and it works
          better.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          <label className="text-sm font-medium">
            Most study hours a day
            <input
              key={state.planSettings.maxHoursPerDay}
              type="number"
              min={1}
              max={16}
              step={0.5}
              defaultValue={state.planSettings.maxHoursPerDay}
              onBlur={(e) => {
                const hours = Number(e.target.value);
                const valid = hours >= 1 && hours <= 16;
                const applied =
                  valid && hours !== state.planSettings.maxHoursPerDay && rebuild({ ...state.planSettings, maxHoursPerDay: hours });
                if (!applied) e.target.value = String(state.planSettings.maxHoursPerDay);
              }}
              className="ml-2 w-20 rounded border border-stone-300 px-2 py-1.5 font-normal"
            />
          </label>
          <fieldset className="text-sm">
            <legend className="font-medium">Days off</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {WEEK_ORDER.map((d) => (
                <label key={d} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={state.planSettings.daysOff.includes(d)}
                    onChange={(e) =>
                      rebuild({
                        ...state.planSettings,
                        daysOff: e.target.checked
                          ? [...state.planSettings.daysOff, d]
                          : state.planSettings.daysOff.filter((x) => x !== d),
                      })
                    }
                  />
                  {WEEKDAYS[d]}
                </label>
              ))}
            </div>
          </fieldset>
          <Button onClick={() => rebuild()}>Rebuild from today</Button>
        </div>
        {plans.notPlanned.length > 0 && (
          <ul className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {plans.notPlanned.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {plans.plans.length === 0 && (
          <p className="mt-4 text-sm text-stone-600">
            Nothing to plan yet. Plans need at least one upcoming date, so go back and add one if you have it.
          </p>
        )}
      </Card>

      {plans.plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} />
      ))}

      {schedule.weeks.length > 0 && <ScheduleCard schedule={schedule} />}

      <p className="mb-3 font-medium">Do these plans look right? You can still change them later.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={blanks > 0} onClick={() => update((s) => confirmPlans(s, today))}>
          {plans.plans.length ? "Confirm plans" : "Continue"}
        </Button>
        <Button onClick={() => update((s) => ({ ...s, step: "confirm" }))}>Back to deadlines</Button>
        {blanks > 0 && (
          <span role="alert" className="text-sm text-red-700">
            Fill in or remove the empty blocks first.
          </span>
        )}
      </div>
    </>
  );
}

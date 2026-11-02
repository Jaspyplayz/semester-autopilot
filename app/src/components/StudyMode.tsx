"use client";

import { useEffect, useState } from "react";
import { guideFor, markBlock, materialsFor, pickTopics, progressOf, recordAttempt, stageLine, type BlockStatus, type CoachBlock, type Material } from "@/lib/coach";
import { isProblemCourse, type CoursePlan, type PlanBlock } from "@/lib/planner";
import { buildLocalQuiz, joinSpeech, type ChoiceQuestion, type FreeQuestion, type QuizQuestion } from "@/lib/quiz";
import type { QuizRequest } from "@/lib/quiz-llm";
import type { AppState } from "@/lib/state";
import { update } from "@/lib/store";
import { sourceFor, syllabusTopicNames, syllabusTopics, topicTitle, type Topic } from "@/lib/topics";
import { Button, Card, INPUT } from "./ui";
import { ReadAloudButton, SpeakButton } from "./voice";

export interface StudyTarget {
  plan: CoursePlan;
  /** Null for a topic that came back for review, which isn't a block in the plan. */
  block: PlanBlock | null;
  /** The day the block is planned for. Attempts always count for today. */
  blockDate: string;
  topics: Topic[];
}

const MAX_QUIZ_TOPICS = 3;

function FreeCard({ question, onDone }: { question: FreeQuestion; onDone: (correct: boolean) => void }) {
  const [text, setText] = useState("");
  const [shown, setShown] = useState(false);
  return (
    <>
      <p className="font-medium">{question.prompt}</p>
      {!shown ? (
        <>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or say what you remember"
            aria-label="Your answer"
            className={`${INPUT} mt-2`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SpeakButton onText={(spoken) => setText((old) => joinSpeech(old, spoken))} />
            <ReadAloudButton text={question.prompt} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" disabled={!text.trim()} onClick={() => setShown(true)}>
              Show the answer
            </Button>
            <Button onClick={() => setShown(true)}>{question.byHand ? "Done on paper" : "Said it out loud"}</Button>
          </div>
        </>
      ) : (
        <>
          {text.trim() && <p className="mt-2 rounded-md bg-stone-50 px-3 py-2 text-sm whitespace-pre-wrap">{text}</p>}
          <div role="status" className="mt-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
            {question.answer && <p className="mb-1">{question.answer}</p>}
            <p>{question.check}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => onDone(true)}>
              Got it
            </Button>
            <Button onClick={() => onDone(false)}>Not yet</Button>
          </div>
        </>
      )}
    </>
  );
}

function ChoiceCard({ question, onDone }: { question: ChoiceQuestion; onDone: (correct: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <>
      <p className="font-medium">{question.prompt}</p>
      <div className="mt-2 flex flex-col items-stretch gap-2">
        {question.options.map((option, i) => {
          const look = picked === null ? "" : i === question.correct ? "border-emerald-600 bg-emerald-50" : i === picked ? "border-amber-600 bg-amber-50" : "";
          return (
            <Button key={option} className={`text-left ${look}`} disabled={picked !== null} onClick={() => setPicked(i)}>
              {option}
            </Button>
          );
        })}
      </div>
      {picked !== null && (
        <>
          <p role="status" className="mt-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
            {picked === question.correct ? "That's it." : `It's “${question.options[question.correct]}”.`} {question.explain}
          </p>
          <Button variant="primary" className="mt-3" onClick={() => onDone(picked === question.correct)}>
            Next
          </Button>
        </>
      )}
    </>
  );
}

function MaterialsCard({ materials, topics, block }: { materials: Material[]; topics: Topic[]; block: PlanBlock | null }) {
  const readings = [...new Set(topics.map((t) => t.reading).filter(Boolean))];
  if (!materials.length && !readings.length) return null;
  return (
    <Card title="Your materials">
      {readings.length > 0 && <p className="text-sm">Reading: {readings.join(", ")}</p>}
      <ul className="mt-1 space-y-3" data-testid="materials">
        {materials.map((m) => (
          <li key={m.name} className="text-sm">
            {m.url ? (
              <a className="font-medium underline" href={m.url} target="_blank" rel="noreferrer noopener">
                {m.name}
              </a>
            ) : (
              <span className="font-medium">{m.name}</span>
            )}
            {m.snippets.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-stone-600">
                {m.snippets.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {!block && materials.length === 0 && <p className="text-sm text-stone-600">Use your own notes for this one.</p>}
    </Card>
  );
}

function QuizSummary({
  state,
  target,
  results,
  topics,
  onMark,
  onClose,
}: {
  state: AppState;
  target: StudyTarget;
  results: boolean[];
  topics: Topic[];
  onMark: (status: BlockStatus) => void;
  onClose: () => void;
}) {
  const right = results.filter(Boolean).length;
  return (
    <Card title="Nice work">
      <p className="text-sm" data-testid="quiz-score">
        You got {right} of {results.length}.
      </p>
      {topics.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-stone-700">
          {topics.map((t) => (
            <li key={t.label}>
              {t.label}: {stageLine(progressOf(state.coach, target.plan.course, t))}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {target.block && (
          <>
            <Button variant="primary" onClick={() => onMark("done")}>
              Mark block done
            </Button>
            <Button onClick={() => onMark("not-done")}>Not done yet</Button>
          </>
        )}
        <Button variant={target.block ? "secondary" : "primary"} onClick={onClose}>
          Back to today
        </Button>
      </div>
    </Card>
  );
}

export function StudyMode({ target, state, today, onClose }: { target: StudyTarget; state: AppState; today: string; onClose: () => void }) {
  const { plan, block } = target;
  const problem = isProblemCourse(plan.course, state.draft?.courses.find((c) => c.code === plan.course)?.name);
  const materials = materialsFor(plan.course, target.topics, state.sources);

  // Chosen once, so a quiz doesn't change under the student as their answers come in.
  const [quizTopics] = useState(() => pickTopics(target.topics, plan.course, state.coach, today, MAX_QUIZ_TOPICS));
  const [questions, setQuestions] = useState<QuizQuestion[]>(() => {
    const source = sourceFor(plan.course, state.sources);
    return buildLocalQuiz({
      topics: quizTopics,
      kind: block?.kind ?? null,
      problem,
      syllabusNames: source ? syllabusTopicNames(syllabusTopics(source)) : [],
      seed: `${block?.id ?? plan.id}-${today}`,
    });
  });
  const [byClaude, setByClaude] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [claudeStatus, setClaudeStatus] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetch("/api/llm-status")
      .then((r) => r.json())
      .then((d) => setLlmEnabled(Boolean(d.enabled)))
      .catch(() => setLlmEnabled(false));
  }, []);

  const current = questions[results.length];

  function answer(correct: boolean) {
    const { topic, kind } = current;
    if (topic) {
      update((s) => ({
        ...s,
        coach: recordAttempt(s.coach, { course: plan.course, topic, correct, recall: kind !== "choice", date: today, testDate: plan.date }),
      }));
    }
    setResults((old) => [...old, correct]);
  }

  function mark(status: BlockStatus) {
    if (block) {
      const item: CoachBlock = { planId: plan.id, course: plan.course, date: target.blockDate, block, status: null };
      update((s) => ({ ...s, coach: markBlock(s.coach, item, status) }));
    }
    onClose();
  }

  async function askClaude() {
    setAsking(true);
    setClaudeStatus("");
    const body: QuizRequest = {
      course: plan.course,
      task: block?.action.slice(0, 1000) ?? `Review ${quizTopics.map(topicTitle).join(", ")}`,
      problem,
      topics: quizTopics,
      excerpts: materials.flatMap((m) => m.snippets).slice(0, 40),
    };
    try {
      const res = await fetch("/api/coach-quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.questions) throw new Error(data?.error ?? "Couldn't reach Claude. The built-in questions still work.");
      setQuestions(data.questions);
      setByClaude(true);
    } catch (err) {
      setClaudeStatus(err instanceof Error ? err.message : "Couldn't reach Claude. The built-in questions still work.");
    }
    setAsking(false);
  }

  return (
    <>
      <div className="mb-4">
        <Button onClick={onClose}>Back to today</Button>
      </div>

      <Card title={`${plan.course}: ${block ? "study block" : "review"}`}>
        <p className="text-sm font-medium">{block ? block.action : `Back for review: ${target.topics.map(topicTitle).join(", ")}`}</p>
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-stone-600">
          {guideFor(block?.kind ?? null, problem).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Card>

      <MaterialsCard materials={materials} topics={target.topics} block={block} />

      {current ? (
        <Card title={`Quiz, question ${results.length + 1} of ${questions.length}`}>
          {byClaude && <p className="mb-2 text-xs text-stone-500">Written by Claude. Check it against your notes.</p>}
          <div data-testid="quiz-question" data-kind={current.kind}>
            {current.kind === "choice" ? <ChoiceCard key={current.id} question={current} onDone={answer} /> : <FreeCard key={current.id} question={current} onDone={answer} />}
          </div>
          {llmEnabled && !byClaude && results.length === 0 && quizTopics.length > 0 && (
            <div className="mt-4 border-t border-stone-100 pt-3">
              <Button onClick={askClaude} disabled={asking}>
                {asking ? "Asking Claude…" : "Get questions from Claude"}
              </Button>
              <p className="mt-1 text-xs text-stone-500">Sends your topic names and the syllabus lines above to the Anthropic API.</p>
              {claudeStatus && (
                <p role="status" className="mt-1 text-sm text-stone-600">
                  {claudeStatus}
                </p>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-stone-500">If you use Speak, your browser handles the voice and may send the audio to its maker.</p>
        </Card>
      ) : (
        <QuizSummary state={state} target={target} results={results} topics={quizTopics} onMark={mark} onClose={onClose} />
      )}
    </>
  );
}

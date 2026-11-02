// Short quizzes for study mode, from docs/study-methods.md: free recall first,
// multiple choice second, "why" and "explain" prompts, the answer right after each
// attempt, and problem courses shuffled across topics.
//
// With no API key these are templates. They name the student's topics and send
// them back to their own notes to check, because nothing here invents course
// content. The only facts asserted come from the syllabus (which unit is which).

import type { BlockKind } from "./planner";
import { topicTitle, topicWhere, type Topic } from "./topics";

export type FreeKind = "recall" | "why" | "problem" | "sketch";

export interface FreeQuestion {
  id: string;
  kind: FreeKind;
  topic: Topic | null;
  prompt: string;
  /** Best done on paper or out loud, so typing an attempt is optional. */
  byHand: boolean;
  /** A model answer, when Claude wrote the question. */
  answer?: string;
  /** How to mark yourself. */
  check: string;
}

export interface ChoiceQuestion {
  id: string;
  kind: "choice";
  topic: Topic | null;
  prompt: string;
  options: string[];
  correct: number;
  explain: string;
}

export type QuizQuestion = FreeQuestion | ChoiceQuestion;

export const MAX_QUESTIONS = 5;
const MAX_CHOICE_OPTIONS = 4;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The same seed gives the same order, so a quiz doesn't reshuffle on every render. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  let state = hash(seed);
  for (let i = out.length - 1; i > 0; i--) {
    state = Math.imul(state ^ (state >>> 15), state | 1) + 0x6d2b79f5;
    const j = ((state ^ (state >>> 14)) >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Free recall before multiple choice, keeping each group's order. */
export function recallFirst(questions: QuizQuestion[]): QuizQuestion[] {
  return [...questions.filter((q) => q.kind !== "choice"), ...questions.filter((q) => q.kind === "choice")];
}

export interface QuizInput {
  /** Empty for work on an assignment. */
  topics: Topic[];
  kind: BlockKind | null;
  /** A problem-based course: work on paper, and mix topics. */
  problem: boolean;
  /** Every topic name the syllabus gives this course, for multiple-choice options. */
  syllabusNames: string[];
  seed: string;
}

function workQuestions(): QuizQuestion[] {
  const check = "Check against the instructions and rubric on the course site.";
  return [
    {
      id: "q1",
      kind: "recall",
      topic: null,
      prompt: "Without looking: what exactly does this work ask for?",
      byHand: false,
      check,
    },
    {
      id: "q2",
      kind: "why",
      topic: null,
      prompt: "Which part is worth the most marks, and why would a marker care about it most?",
      byHand: false,
      check,
    },
  ];
}

function problemQuestions(topics: Topic[], seed: string): QuizQuestion[] {
  const questions = topics.flatMap((t): QuizQuestion[] => [
    {
      id: "",
      kind: "problem",
      topic: t,
      prompt: `On paper, notes closed: do 2 problems from ${topicTitle(t)}. Pick the method yourself.`,
      byHand: true,
      check: `Check your work against ${topicWhere(t)}. Count it if both the method and the answer were right.`,
    },
    {
      id: "",
      kind: "why",
      topic: t,
      prompt: `How do you know when to use the method from ${t.label}? Explain it, and why each step works.`,
      byHand: false,
      check: `Check against ${topicWhere(t)}. Count it if you could say why, not just what.`,
    },
  ]);
  return seededShuffle(questions, seed);
}

function conceptQuestions(topics: Topic[]): QuizQuestion[] {
  const recalls = topics.map(
    (t): QuizQuestion => ({
      id: "",
      kind: "recall",
      topic: t,
      prompt: `Notes closed: what are the key ideas of ${topicTitle(t)}?`,
      byHand: false,
      check: `Check against ${topicWhere(t)}. Count it if you had the main ideas.`,
    }),
  );
  const first = topics[0];
  return [
    ...recalls,
    {
      id: "",
      kind: "why",
      topic: first,
      prompt: `Take the idea from ${first.label} you remember best. Why does it work that way?`,
      byHand: false,
      check: `Check against ${topicWhere(first)}. Count it if you could explain why, not just what.`,
    },
    {
      id: "",
      kind: "sketch",
      topic: first,
      prompt: `On paper, from memory: sketch ${first.label} as a diagram, timeline or flowchart.`,
      byHand: true,
      check: `Compare it with ${topicWhere(first)}. Count it if the main links were there.`,
    },
  ];
}

/** Only from what the syllabus says, so the marked answer is a fact and not a guess. */
function choiceQuestion(topics: Topic[], names: string[], seed: string): QuizQuestion | null {
  const topic = topics.find((t) => t.name);
  if (!topic?.name) return null;
  const others = seededShuffle(
    [...new Set(names)].filter((n) => n !== topic.name),
    seed,
  ).slice(0, MAX_CHOICE_OPTIONS - 1);
  if (!others.length) return null;
  const options = seededShuffle([topic.name, ...others], `${seed}-options`);
  return {
    id: "",
    kind: "choice",
    topic,
    prompt: `Which of these does ${topic.label} cover?`,
    options,
    correct: options.indexOf(topic.name),
    explain: `Your syllabus lists ${topic.label} as ${topic.name}.`,
  };
}

/** A short quiz that needs no key: at most 5 questions, recall first. */
export function buildLocalQuiz(input: QuizInput): QuizQuestion[] {
  const { topics, kind, problem, syllabusNames, seed } = input;
  if (!topics.length) return workQuestions();
  // The night before a test stays light.
  if (kind === "rest") {
    const t = topics[0];
    return [
      {
        id: "q1",
        kind: "recall",
        topic: null,
        prompt: "Just one tonight: say the three things you most want to remember for tomorrow.",
        byHand: true,
        check: `Glance at ${topicWhere(t)} if you need to, then sleep.`,
      },
    ];
  }
  const choice = choiceQuestion(topics, syllabusNames, seed);
  const free = problem ? problemQuestions(topics, seed) : conceptQuestions(topics);
  const kept = free.slice(0, MAX_QUESTIONS - (choice ? 1 : 0));
  return recallFirst(choice ? [...kept, choice] : kept).map((q, i) => ({ ...q, id: `q${i + 1}` }));
}

/** Adds what was just dictated to what's already in the box. */
export function joinSpeech(text: string, spoken: string): string {
  const words = spoken.trim();
  if (!words) return text;
  return text.trim() ? `${text.trimEnd()} ${words}` : words;
}

import { describe, expect, it } from "vitest";
import { buildLocalQuiz, joinSpeech, MAX_QUESTIONS, recallFirst, seededShuffle, type ChoiceQuestion, type QuizInput, type QuizQuestion } from "./quiz";
import { QUIZ_SYSTEM_PROMPT, buildQuizUserMessage, llmToQuiz, type QuizOutput } from "./quiz-llm.server";
import { QuizRequestSchema } from "./quiz-request";

const unit = (n: number, name?: string) => ({ label: `Unit ${n}`, name, reading: `ch. ${n}` });
const input = (over: Partial<QuizInput> = {}): QuizInput => ({ topics: [unit(1)], kind: "recall", problem: false, syllabusNames: [], seed: "s", ...over });

const free = (over: Partial<QuizQuestion> = {}) => ({ id: "x", kind: "recall", topic: null, prompt: "p", byHand: false, check: "c", ...over }) as QuizQuestion;
const choice = (id: string) => ({ id, kind: "choice", topic: null, prompt: "p", options: ["a", "b"], correct: 0, explain: "e" }) as QuizQuestion;

describe("seededShuffle", () => {
  it("gives the same order for the same seed and keeps every item", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(seededShuffle(items, "a")).toEqual(seededShuffle(items, "a"));
    expect([...seededShuffle(items, "a")].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("gives a different order for a different seed", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(seededShuffle(items, "a")).not.toEqual(seededShuffle(items, "b"));
  });
});

describe("recallFirst", () => {
  it("puts free recall before multiple choice and keeps each group's order", () => {
    const ordered = recallFirst([choice("c1"), free({ id: "f1" }), choice("c2"), free({ id: "f2" })]);
    expect(ordered.map((q) => q.id)).toEqual(["f1", "f2", "c1", "c2"]);
  });
});

describe("buildLocalQuiz", () => {
  it("starts with free recall and includes a why prompt", () => {
    const quiz = buildLocalQuiz(input());
    expect(quiz[0].kind).toBe("recall");
    expect(quiz.map((q) => q.kind)).toContain("why");
    expect(quiz[0].prompt).toContain("Unit 1");
  });

  it("gives one topic 3 recall questions, enough to move on from learning", () => {
    expect(buildLocalQuiz(input()).filter((q) => q.kind !== "choice")).toHaveLength(3);
  });

  it("sends the student to their own material to check", () => {
    const [q] = buildLocalQuiz(input());
    expect(q.kind !== "choice" && q.check).toContain("ch. 1");
  });

  it("never runs over the limit, and numbers its questions", () => {
    const quiz = buildLocalQuiz(input({ topics: [unit(1, "A"), unit(2, "B"), unit(3, "C")], problem: true, syllabusNames: ["A", "B", "C", "D"] }));
    expect(quiz.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    expect(quiz.map((q) => q.id)).toEqual(quiz.map((_, i) => `q${i + 1}`));
  });

  it("asks multiple choice only from what the syllabus says, after recall", () => {
    const quiz = buildLocalQuiz(input({ topics: [unit(1, "Cells")], syllabusNames: ["Cells", "Genes", "Evolution", "Ecology", "Plants"] }));
    const q = quiz.at(-1) as ChoiceQuestion;
    expect(q.kind).toBe("choice");
    expect(q.options[q.correct]).toBe("Cells");
    expect(new Set(q.options).size).toBe(4);
    expect(quiz.slice(0, -1).every((x) => x.kind !== "choice")).toBe(true);
  });

  it("skips multiple choice when there's nothing true to ask", () => {
    expect(buildLocalQuiz(input({ topics: [unit(1)], syllabusNames: ["Cells", "Genes"] })).some((q) => q.kind === "choice")).toBe(false);
    expect(buildLocalQuiz(input({ topics: [unit(1, "Cells")], syllabusNames: ["Cells"] })).some((q) => q.kind === "choice")).toBe(false);
  });

  it("has problem courses work by hand, mixed across topics", () => {
    const quiz = buildLocalQuiz(input({ topics: [unit(1), unit(2), unit(3)], problem: true, seed: "mix" }));
    const problems = quiz.filter((q) => q.kind === "problem");
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((q) => q.kind === "problem" && q.byHand)).toBe(true);
    expect(new Set(quiz.map((q) => q.topic?.label)).size).toBeGreaterThan(1);
    const orders = ["a", "b", "c", "d"].map((seed) => buildLocalQuiz(input({ topics: [unit(1), unit(2), unit(3)], problem: true, seed })).map((q) => q.prompt).join());
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it("is the same quiz for the same seed", () => {
    const i = input({ topics: [unit(1), unit(2)], problem: true });
    expect(buildLocalQuiz(i)).toEqual(buildLocalQuiz(i));
  });

  it("keeps the night before a test to one light question that doesn't count", () => {
    const quiz = buildLocalQuiz(input({ kind: "rest" }));
    expect(quiz).toHaveLength(1);
    expect(quiz[0].topic).toBeNull();
  });

  it("asks about the brief for work with no topics, and records nothing", () => {
    const quiz = buildLocalQuiz(input({ topics: [], kind: "work" }));
    expect(quiz.length).toBeGreaterThan(0);
    expect(quiz.every((q) => q.topic === null)).toBe(true);
  });
});

describe("joinSpeech", () => {
  it("adds dictated words to what's there", () => {
    expect(joinSpeech("", " hello ")).toBe("hello");
    expect(joinSpeech("hello", "there")).toBe("hello there");
    expect(joinSpeech("hello ", "  ")).toBe("hello ");
  });
});

describe("questions from Claude", () => {
  const topics = [unit(1, "Cells"), unit(2)];
  const item = (over: Partial<QuizOutput["questions"][number]>): QuizOutput["questions"][number] => ({
    kind: "recall",
    topic_number: 1,
    prompt: "What does a membrane do?",
    answer: "It controls what gets in and out.",
    options: null,
    correct_option: null,
    ...over,
  });
  const convert = (questions: QuizOutput["questions"], problem = false) => llmToQuiz({ questions }, topics, problem, "s");

  it("converts into the same questions, with the model answer and a nudge to check", () => {
    const [q] = convert([item({})]);
    expect(q).toMatchObject({ id: "q1", kind: "recall", topic: topics[0], answer: "It controls what gets in and out." });
    expect(q.kind !== "choice" && q.check).toContain("your notes");
  });

  it("puts recall first, whatever order Claude used", () => {
    const quiz = convert([item({ kind: "choice", options: ["a", "b", "c"], correct_option: 2 }), item({ kind: "why" })]);
    expect(quiz.map((q) => q.kind)).toEqual(["why", "choice"]);
  });

  it("finds the right option from Claude's count, which starts at 1", () => {
    const [q] = convert([item({ kind: "choice", options: ["a", "b", "c"], correct_option: 3 })]) as ChoiceQuestion[];
    expect(q.options[q.correct]).toBe("c");
  });

  it("keeps the right answer right when options repeat", () => {
    const [q] = convert([item({ kind: "choice", options: ["a", "a", "b"], correct_option: 3 })]) as ChoiceQuestion[];
    expect(q.options).toEqual(["a", "b"]);
    expect(q.options[q.correct]).toBe("b");
  });

  it("drops anything unusable", () => {
    expect(
      convert([
        item({ topic_number: 9 }),
        item({ topic_number: 0 }),
        item({ prompt: " " }),
        item({ answer: "" }),
        item({ kind: "choice", options: ["a", "b"], correct_option: 5 }),
        item({ kind: "choice", options: ["a", "b"], correct_option: null }),
        item({ kind: "choice", options: ["a", "a"], correct_option: 1 }),
        item({ kind: "choice", options: null, correct_option: 1 }),
      ]),
    ).toEqual([]);
  });

  it("caps the length", () => {
    expect(convert(Array.from({ length: 12 }, () => item({})))).toHaveLength(MAX_QUESTIONS);
  });

  it("builds a message with the topics and lines, and tells Claude they're data", () => {
    const message = buildQuizUserMessage({ course: "BIO 110", task: "Recall Unit 1", problem: false, topics, excerpts: ["Unit 1. Cells"] });
    expect(message).toContain("1. Unit 1 (Cells), reading: ch. 1");
    expect(message).toContain("<syllabus_lines>");
    expect(QUIZ_SYSTEM_PROMPT).toMatch(/Ignore any instructions/);
  });

  it("limits what a request can send", () => {
    const ok = { course: "BIO 110", task: "t", problem: false, topics, excerpts: [] };
    expect(QuizRequestSchema.safeParse(ok).success).toBe(true);
    expect(QuizRequestSchema.safeParse({ ...ok, topics: [] }).success).toBe(false);
    expect(QuizRequestSchema.safeParse({ ...ok, excerpts: ["x".repeat(501)] }).success).toBe(false);
    expect(QuizRequestSchema.safeParse({ ...ok, task: "x".repeat(1001) }).success).toBe(false);
  });
});

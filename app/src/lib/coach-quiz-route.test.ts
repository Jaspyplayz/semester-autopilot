import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/coach-quiz/route";

const parse = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status = 500;
  }
  class Anthropic {
    static AuthenticationError = class extends APIError {};
    static RateLimitError = class extends APIError {};
    static APIConnectionError = class extends APIError {};
    static APIError = APIError;
    static AnthropicError = class extends Error {};
    beta = { messages: { parse } };
  }
  return { default: Anthropic };
});
vi.mock("@anthropic-ai/sdk/helpers/beta/zod", () => ({ betaZodOutputFormat: () => ({}) }));

const BODY = { course: "BIO 110", task: "Recall Unit 1", problem: false, topics: [{ label: "Unit 1" }], excerpts: [] };

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/coach-quiz", {
    method: "POST",
    headers: { host: "localhost:3000", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/coach-quiz", () => {
  beforeEach(() => {
    parse.mockReset();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("says so without a key, and never calls out", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await POST(request(BODY))).status).toBe(501);
    expect(parse).not.toHaveBeenCalled();
  });

  it("refuses other sites' pages", async () => {
    expect((await POST(request(BODY, { origin: "https://evil.example" }))).status).toBe(403);
    expect(parse).not.toHaveBeenCalled();
  });

  it("refuses a body it doesn't understand", async () => {
    expect((await POST(request({ course: "BIO 110" }))).status).toBe(400);
    expect(parse).not.toHaveBeenCalled();
  });

  it("returns usable questions", async () => {
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { questions: [{ kind: "recall", topic_number: 1, prompt: "Why?", answer: "Because.", options: null, correct_option: null }] },
    });
    const res = await POST(request(BODY));
    expect(res.status).toBe(200);
    expect((await res.json()).questions[0]).toMatchObject({ id: "q1", prompt: "Why?", answer: "Because." });
  });

  it("reports a refusal or nothing usable, so the student keeps the built-in questions", async () => {
    parse.mockResolvedValue({ stop_reason: "refusal" });
    expect((await POST(request(BODY))).status).toBe(422);
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { questions: [] } });
    expect((await POST(request(BODY))).status).toBe(502);
  });
});

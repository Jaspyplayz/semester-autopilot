import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { LLM_MODEL } from "@/lib/llm.server";
import { isSameOrigin } from "@/lib/origin";
import { QUIZ_SYSTEM_PROMPT, QuizOutputSchema, buildQuizUserMessage, llmToQuiz } from "@/lib/quiz-llm.server";
import { QuizRequestSchema } from "@/lib/quiz-request";

// Optional: only works when ANTHROPIC_API_KEY is set, and Coach's templates work
// without it. Topic names and a few syllabus lines go to the Anthropic API for this
// one request and aren't stored here. For now this is the deployment's key. With
// accounts, each student's own key or plan goes here instead.
export const maxDuration = 60;

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return fail(501, "Claude isn't set up on this deployment. The built-in questions still work.");
  // There's no auth in v0: at least refuse other sites' pages spending the key.
  if (!isSameOrigin(request)) return fail(403, "Cross-site requests aren't allowed.");

  const parsed = QuizRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "That request wasn't understood.");

  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.parse({
      model: LLM_MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(QuizOutputSchema) },
      system: QUIZ_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildQuizUserMessage(parsed.data) }],
    });
    if (response.stop_reason === "refusal") return fail(422, "Claude declined to write these. The built-in questions still work.");
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return fail(502, "Claude's answer was incomplete. The built-in questions still work.");
    }
    const questions = llmToQuiz(response.parsed_output, parsed.data.topics, parsed.data.problem, parsed.data.task);
    if (!questions.length) return fail(502, "Claude's questions couldn't be used. The built-in questions still work.");
    return Response.json({ questions });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return fail(502, "The server's Anthropic API key was rejected.");
    if (error instanceof Anthropic.RateLimitError) return fail(429, "Too many requests right now. The built-in questions still work.");
    if (error instanceof Anthropic.APIConnectionError) return fail(504, "Couldn't reach the Anthropic API. The built-in questions still work.");
    if (error instanceof Anthropic.APIError) return fail(502, `The Anthropic API returned an error (${error.status}). The built-in questions still work.`);
    // parse() throws this when the answer isn't valid JSON for the schema.
    if (error instanceof Anthropic.AnthropicError) return fail(502, "Claude's answer couldn't be read. The built-in questions still work.");
    throw error;
  }
}

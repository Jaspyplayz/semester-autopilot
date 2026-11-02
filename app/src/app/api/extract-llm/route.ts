import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  LLM_MODEL,
  LLM_SYSTEM_PROMPT,
  LlmOutputSchema,
  MAX_LLM_CHARS,
  buildLlmUserMessage,
  llmToExtraction,
} from "@/lib/llm";

// Optional: only works when ANTHROPIC_API_KEY is set. Syllabus text is sent to
// the Anthropic API for this one request and isn't stored here.
export const maxDuration = 60;

const BodySchema = z.object({
  term: z.string().min(1).max(100),
  sources: z.array(z.object({ name: z.string().max(300), text: z.string() })).min(1).max(30),
});

const fail = (status: number, error: string) => Response.json({ error }, { status });

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Not a browser page; the key is still never exposed.
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false; // "Origin: null", from a sandboxed page.
  }
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(501, "LLM extraction isn't set up on this deployment. Use the built-in reader.");
  }
  // There's no auth in v0: at least refuse other sites' pages spending the key.
  if (!isSameOrigin(request)) return fail(403, "Cross-site requests aren't allowed.");

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Send { term, sources: [{ name, text }] }.");
  const { term, sources } = parsed.data;
  const total = sources.reduce((n, s) => n + s.text.length, 0);
  if (total > MAX_LLM_CHARS) {
    return fail(413, `That's ${total.toLocaleString("en-US")} characters; the limit is ${MAX_LLM_CHARS.toLocaleString("en-US")}. Remove a file or use the built-in reader.`);
  }

  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.parse({
      model: LLM_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(LlmOutputSchema) },
      system: LLM_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildLlmUserMessage(sources, term) }],
    });
    if (response.stop_reason === "refusal") {
      return fail(422, "Claude declined to read this text. Use the built-in reader instead.");
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return fail(502, "Claude's answer was incomplete. Try fewer files, or use the built-in reader.");
    }
    return Response.json({
      extraction: llmToExtraction(response.parsed_output, term, new Date().getFullYear()),
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return fail(502, "The server's Anthropic API key was rejected.");
    if (error instanceof Anthropic.RateLimitError) return fail(429, "Too many requests right now. Try again shortly, or use the built-in reader.");
    if (error instanceof Anthropic.APIConnectionError) return fail(504, "Couldn't reach the Anthropic API. Use the built-in reader instead.");
    if (error instanceof Anthropic.APIError) return fail(502, `The Anthropic API returned an error (${error.status}). Use the built-in reader instead.`);
    // parse() throws this when the answer isn't valid JSON for the schema.
    if (error instanceof Anthropic.AnthropicError) return fail(502, "Claude's answer couldn't be read. Try fewer files, or use the built-in reader.");
    throw error;
  }
}

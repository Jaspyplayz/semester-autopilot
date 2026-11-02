import { connection } from "next/server";

// Tells the UI whether to offer LLM extraction. Read per request so adding the
// env var doesn't need a rebuild. Never returns the key.
export async function GET() {
  await connection();
  return Response.json({ enabled: Boolean(process.env.ANTHROPIC_API_KEY) });
}

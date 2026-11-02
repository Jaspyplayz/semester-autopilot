// What the /api/canvas routes share. The token arrives in a POST body, is used
// for this one request and goes nowhere else. Nothing here logs: unexpected
// errors are answered with a fixed message and not rethrown, because Next would
// log them.

import { z } from "zod";
import { CanvasError, type CanvasConnection, type CanvasErrorKind } from "./canvas";
import { allowsPrivateHosts, canvasGet } from "./canvas-http";
import { normalizeBaseUrl } from "./canvas-url";
import { isSameOrigin } from "./origin";

const STATUS: Record<CanvasErrorKind, number> = {
  auth: 401,
  forbidden: 403,
  "rate-limited": 429,
  "not-canvas": 502,
  upstream: 502,
  unreachable: 504,
  blocked: 400,
  "too-big": 502,
};

const fail = (status: number, error: string) => Response.json({ error }, { status });

const ConnectionSchema = z.object({
  baseUrl: z.string().max(2048),
  // Visible ASCII only: it goes into a header.
  token: z.string().trim().regex(/^[\x21-\x7e]{1,1024}$/),
});

export async function canvasRoute<T extends z.ZodObject>(
  request: Request,
  extra: T,
  run: (conn: CanvasConnection, body: z.infer<T>) => Promise<unknown>,
): Promise<Response> {
  if (!isSameOrigin(request)) return fail(403, "Cross-site requests aren't allowed.");

  const body = await request.json().catch(() => null);
  const parsed = ConnectionSchema.safeParse(body);
  const parsedExtra = extra.safeParse(body);
  if (!parsed.success) return fail(400, "That token doesn't look right. Paste it again, with nothing around it.");
  if (!parsedExtra.success) return fail(400, "That request wasn't understood.");

  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(parsed.data.baseUrl, { allowHttp: allowsPrivateHosts() });
  } catch (err) {
    return fail(400, err instanceof Error ? err.message : "Check the course site's address.");
  }

  try {
    const result = await run({ baseUrl, token: parsed.data.token, get: canvasGet }, parsedExtra.data);
    return Response.json(result);
  } catch (err) {
    if (err instanceof CanvasError) return fail(STATUS[err.kind], err.message);
    return fail(502, "Something went wrong talking to the course site. Try again.");
  }
}

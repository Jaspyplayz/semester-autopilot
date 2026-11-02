// There's no auth in v0: this at least refuses requests from other sites' pages.
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Not a browser page.
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false; // "Origin: null", from a sandboxed page.
  }
}

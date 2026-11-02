// The course site's address, as typed by a student. Safe to import in the browser.

/** Quercus is the University of Toronto's Canvas. Any Canvas site works. */
export const DEFAULT_CANVAS_URL = "https://q.utoronto.ca";

export function normalizeBaseUrl(input: string, opts: { allowHttp?: boolean } = {}): string {
  const typed = input.trim();
  if (!typed) return DEFAULT_CANVAS_URL;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed);
  let url: URL;
  try {
    url = new URL(hasScheme ? typed : `https://${typed}`);
  } catch {
    throw new Error("That doesn't look like a web address. Try something like https://q.utoronto.ca.");
  }
  if (url.protocol !== "https:" && !(opts.allowHttp && url.protocol === "http:")) {
    throw new Error("The course site's address has to start with https://.");
  }
  if (url.username || url.password) {
    throw new Error("Leave any username or password out of the address.");
  }
  if (!url.hostname.includes(".") && !opts.allowHttp) {
    throw new Error("That doesn't look like a web address. Try something like https://q.utoronto.ca.");
  }
  return url.origin;
}

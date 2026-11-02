import { describe, expect, it } from "vitest";
import { DEFAULT_CANVAS_URL, normalizeBaseUrl } from "./canvas-url";

describe("normalizeBaseUrl", () => {
  it("defaults to Quercus when blank", () => {
    expect(normalizeBaseUrl("  ")).toBe(DEFAULT_CANVAS_URL);
    expect(DEFAULT_CANVAS_URL).toBe("https://q.utoronto.ca");
  });

  it("adds https and reduces a pasted page address to its origin", () => {
    expect(normalizeBaseUrl("canvas.school.edu")).toBe("https://canvas.school.edu");
    expect(normalizeBaseUrl("https://q.utoronto.ca/courses/123?x=1#y")).toBe("https://q.utoronto.ca");
  });

  it("refuses plain http, other schemes, embedded credentials and junk", () => {
    expect(() => normalizeBaseUrl("http://canvas.school.edu")).toThrow(/https/);
    expect(() => normalizeBaseUrl("ftp://canvas.school.edu")).toThrow(/https/);
    expect(() => normalizeBaseUrl("https://me:pw@canvas.school.edu")).toThrow(/password/);
    expect(() => normalizeBaseUrl("not a url")).toThrow(/address/);
  });

  it("allows http only when asked, for local testing", () => {
    expect(normalizeBaseUrl("http://localhost:4010/x", { allowHttp: true })).toBe("http://localhost:4010");
  });
});

import { describe, expect, it } from "vitest";
import {
  CanvasError,
  fetchCourseSyllabus,
  listCourses,
  type CanvasConnection,
  type CanvasGet,
  type CanvasResponse,
} from "./canvas";

const BASE = "https://canvas.test";
const TOKEN = "secret-token";

function reply(status: number, body: unknown, headers: Record<string, string> = {}): CanvasResponse {
  const bytes =
    body instanceof Uint8Array ? body : new TextEncoder().encode(typeof body === "string" ? body : JSON.stringify(body));
  return { status, bytes, header: (name) => headers[name.toLowerCase()] ?? null };
}

/** A fake Canvas: routes by URL without the origin, and records what was asked for. */
function fakeCanvas(routes: Record<string, CanvasResponse | (() => CanvasResponse)>) {
  const calls: Array<{ url: string; bearer?: string }> = [];
  const get: CanvasGet = async (url, opts) => {
    calls.push({ url, bearer: opts?.bearer });
    const key = url.startsWith(BASE) ? url.slice(BASE.length) : url;
    const route = routes[key];
    if (!route) return reply(404, { errors: [{ message: "not found" }] });
    return typeof route === "function" ? route() : route;
  };
  const conn: CanvasConnection = { baseUrl: BASE, token: TOKEN, get };
  return { conn, calls };
}

const PDF = new TextEncoder().encode("%PDF-pretend");
const readPdf = async () => "Midterm 25% Oct 16, 2026";
const COURSE = "/api/v1/courses/7?include[]=syllabus_body&include[]=term";
const SEARCH = (t: string) => `/api/v1/courses/7/files?search_term=${t}&per_page=20`;
const MODULES = (t: string) => `/api/v1/courses/7/modules?include[]=items&search_term=${t}&per_page=50`;
const course = (body: string | null, over: object = {}) => ({
  id: 7,
  name: "CSC207H1 F LEC0101 20269:Software Design",
  course_code: "CSC207H1 F LEC0101",
  syllabus_body: body,
  term: { name: "2026 Fall" },
  ...over,
});
const file = (id: number, name: string, over: object = {}) => ({
  id,
  display_name: name,
  filename: name,
  "content-type": "application/pdf",
  size: 1000,
  url: `${BASE}/files/${id}/download?verifier=abc`,
  locked_for_user: false,
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});
const LONG_BODY = `<h2>Marking scheme</h2><p>Midterm 25% Fri Oct 16, 2026 and plenty more words so this counts as a real syllabus page.</p>`;

describe("listCourses", () => {
  const first = "/api/v1/courses?enrollment_state=active&state[]=available&include[]=term&per_page=100";

  it("follows Link pagination, with the token, and sends it nowhere else", async () => {
    const { conn, calls } = fakeCanvas({
      [first]: reply(200, [course(null)], { link: `<${BASE}/api/v1/courses?page=2>; rel="next", <${BASE}/x>; rel="last"` }),
      "/api/v1/courses?page=2": reply(200, [course(null, { id: 8, name: "PHL245", course_code: "PHL245H1" })]),
    });
    const courses = await listCourses(conn);
    expect(courses.map((c) => c.id)).toEqual(["7", "8"]);
    expect(calls.map((c) => c.bearer)).toEqual([TOKEN, TOKEN]);
  });

  it("won't follow a next link to another origin", async () => {
    const { conn, calls } = fakeCanvas({
      [first]: reply(200, [course(null)], { link: `<https://evil.test/steal>; rel="next"` }),
    });
    await listCourses(conn);
    expect(calls.map((c) => c.url)).not.toContain("https://evil.test/steal");
  });

  it("stops after a sane number of pages", async () => {
    const page = reply(200, [course(null)], { link: `<${BASE}/api/v1/courses?page=2>; rel="next"` });
    const { conn, calls } = fakeCanvas({ [first]: page, "/api/v1/courses?page=2": page });
    await listCourses(conn);
    expect(calls.length).toBeLessThanOrEqual(10);
  });

  it("reads the code and title out of Canvas's long names", async () => {
    const { conn } = fakeCanvas({ [first]: reply(200, [course(null)]) });
    expect(await listCourses(conn)).toEqual([
      { id: "7", code: "CSC 207H1", name: "Software Design", term: "2026 Fall" },
    ]);
  });

  it("leaves out date-restricted courses, which have no name", async () => {
    const { conn } = fakeCanvas({ [first]: reply(200, [{ id: 9, access_restricted_by_date: true }, course(null)]) });
    expect((await listCourses(conn)).map((c) => c.id)).toEqual(["7"]);
  });

  it("puts the newest term first", async () => {
    const old = course(null, { id: 1, term: { name: "2025 Fall", start_at: "2025-09-01T00:00:00Z" } });
    const now = course(null, { id: 2, term: { name: "2026 Fall", start_at: "2026-09-01T00:00:00Z" } });
    const none = course(null, { id: 3, term: null });
    const { conn } = fakeCanvas({ [first]: reply(200, [none, old, now]) });
    expect((await listCourses(conn)).map((c) => c.id)).toEqual(["2", "1", "3"]);
  });

  it.each([
    [401, { errors: [{ message: "Invalid access token." }] }, "auth"],
    [403, "403 Forbidden (Rate Limit Exceeded)", "rate-limited"],
    [403, { status: "unauthorized" }, "forbidden"],
    [404, "nope", "not-canvas"],
    [500, "boom", "upstream"],
  ])("turns a %i into a %s error", async (status, body, kind) => {
    const { conn } = fakeCanvas({ [first]: reply(status as number, body) });
    await expect(listCourses(conn)).rejects.toMatchObject({ kind });
  });

  it("calls a 200 that isn't Canvas's JSON not-canvas", async () => {
    for (const body of ["<html>login</html>", { hello: "world" }, [{ nope: 1 }]]) {
      const { conn } = fakeCanvas({ [first]: reply(200, body) });
      await expect(listCourses(conn)).rejects.toMatchObject({ kind: "not-canvas" });
    }
  });

  it("never puts the token in an error message", async () => {
    const { conn } = fakeCanvas({ [first]: reply(401, { echo: TOKEN }) });
    const err = await listCourses(conn).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CanvasError);
    expect((err as Error).message).not.toContain(TOKEN);
  });
});

describe("fetchCourseSyllabus", () => {
  it("uses the syllabus page, labelled with the course", async () => {
    const { conn } = fakeCanvas({ [COURSE]: reply(200, course(LONG_BODY)) });
    const { sources, course: info } = await fetchCourseSyllabus(conn, "7", readPdf);
    expect(info).toMatchObject({ code: "CSC 207H1", term: "2026 Fall" });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      name: "CSC 207H1 · syllabus page",
      course: { code: "CSC 207H1", name: "Software Design" },
    });
    expect(sources[0].url).toMatch(/\/courses\/7\/assignments\/syllabus$/);
    expect(sources[0].text).toContain("## Marking scheme");
  });

  it("skips a nearly empty syllabus page", async () => {
    const { conn } = fakeCanvas({ [COURSE]: reply(200, course("<p>Welcome!</p>")) });
    const { sources, notes } = await fetchCourseSyllabus(conn, "7", readPdf);
    expect(sources).toEqual([]);
    expect(notes.join(" ")).toMatch(/CSC 207H1: no syllabus found/);
  });

  it("finds a syllabus file by searching files, and downloads it", async () => {
    const { conn, calls } = fakeCanvas({
      [COURSE]: reply(200, course(null)),
      [SEARCH("syllabus")]: reply(200, [file(1, "CSC207-Syllabus.pdf")]),
      "/files/1/download?verifier=abc": reply(200, PDF),
    });
    const { sources, notes } = await fetchCourseSyllabus(conn, "7", readPdf);
    expect(sources.map((s) => s.name)).toEqual(["CSC 207H1 · CSC207-Syllabus.pdf"]);
    expect(sources[0].text).toContain("Midterm");
    expect(notes).toEqual([]);
    expect(calls.find((c) => c.url.includes("/download"))?.bearer).toBe(TOKEN);
  });

  it("never sends the token to a file URL on another origin", async () => {
    const elsewhere = "https://files.cdn.test/1?sig=x";
    const { conn, calls } = fakeCanvas({
      [COURSE]: reply(200, course(null)),
      [SEARCH("syllabus")]: reply(200, [file(1, "Syllabus.pdf", { url: elsewhere })]),
      [elsewhere]: reply(200, PDF),
    });
    await fetchCourseSyllabus(conn, "7", readPdf);
    expect(calls.find((c) => c.url === elsewhere)?.bearer).toBeUndefined();
  });

  it("reads a file the syllabus page links to, when its link text says outline", async () => {
    const body = `<p>The <a href="${BASE}/courses/7/files/55?wrap=1">course outline</a> is here.</p>`;
    const { conn } = fakeCanvas({
      [COURSE]: reply(200, course(body)),
      "/api/v1/files/55": reply(200, file(55, "F26.pdf")),
      "/files/55/download?verifier=abc": reply(200, PDF),
    });
    const { sources } = await fetchCourseSyllabus(conn, "7", readPdf);
    expect(sources.map((s) => s.name)).toContain("CSC 207H1 · F26.pdf");
  });

  it("ignores other files a long syllabus page links to", async () => {
    const body = `${LONG_BODY}<a href="/courses/7/files/56">Week 1 slides</a>`;
    const { conn, calls } = fakeCanvas({
      [COURSE]: reply(200, course(body)),
      "/api/v1/files/56": reply(200, file(56, "week1.pdf")),
    });
    const { sources } = await fetchCourseSyllabus(conn, "7", readPdf);
    expect(sources.map((s) => s.name)).toEqual(["CSC 207H1 · syllabus page"]);
    expect(calls.some((c) => c.url.includes("/download"))).toBe(false);
  });

  it("takes the first linked file when the page is just a pointer to it", async () => {
    const body = `<a href="/courses/7/files/57">Click here</a>`;
    const { conn } = fakeCanvas({
      [COURSE]: reply(200, course(body)),
      "/api/v1/files/57": reply(200, file(57, "info.pdf")),
      "/files/57/download?verifier=abc": reply(200, PDF),
    });
    const { sources } = await fetchCourseSyllabus(conn, "7", readPdf);
    expect(sources.map((s) => s.name)).toEqual(["CSC 207H1 · info.pdf"]);
  });

  it("falls back to modules when the Files tab is hidden", async () => {
    const hidden = reply(401, { status: "unauthorized" });
    const { conn } = fakeCanvas({
      [COURSE]: reply(200, course(null)),
      [SEARCH("syllabus")]: hidden,
      [SEARCH("outline")]: hidden,
      [MODULES("syllabus")]: reply(200, [
        { name: "Start here", items: [{ type: "File", title: "Course syllabus", content_id: 60 }, { type: "Page", title: "Syllabus notes" }] },
      ]),
      [MODULES("outline")]: reply(200, []),
      "/api/v1/files/60": reply(200, file(60, "s.pdf")),
      "/files/60/download?verifier=abc": reply(200, PDF),
    });
    const { sources } = await fetchCourseSyllabus(conn, "7", readPdf);
    expect(sources.map((s) => s.name)).toEqual(["CSC 207H1 · s.pdf"]);
  });

  it("reads every file in a module named syllabus, whatever the file's title", async () => {
    const { conn } = fakeCanvas({
      [COURSE]: reply(200, course(null)),
      [MODULES("syllabus")]: reply(200, [{ name: "Syllabus", items: [{ type: "File", title: "F26", content_id: 61 }] }]),
      "/api/v1/files/61": reply(200, file(61, "F26.pdf")),
      "/files/61/download?verifier=abc": reply(200, PDF),
    });
    const { sources } = await fetchCourseSyllabus(conn, "7", readPdf);
    expect(sources.map((s) => s.name)).toEqual(["CSC 207H1 · F26.pdf"]);
  });

  it("reads at most three files, newest first", async () => {
    const files = [1, 2, 3, 4].map((n) => file(n, `Syllabus ${n}.pdf`, { updated_at: `2026-0${n}-01T00:00:00Z` }));
    const routes: Record<string, CanvasResponse> = {
      [COURSE]: reply(200, course(null)),
      [SEARCH("syllabus")]: reply(200, files),
    };
    for (const n of [1, 2, 3, 4]) routes[`/files/${n}/download?verifier=abc`] = reply(200, PDF);
    const { conn } = fakeCanvas(routes);
    const { sources } = await fetchCourseSyllabus(conn, "7", readPdf);
    expect(sources.map((s) => s.name)).toEqual([
      "CSC 207H1 · Syllabus 4.pdf",
      "CSC 207H1 · Syllabus 3.pdf",
      "CSC 207H1 · Syllabus 2.pdf",
    ]);
  });

  it("explains files it can't use instead of failing the course", async () => {
    const { conn } = fakeCanvas({
      [COURSE]: reply(200, course(LONG_BODY)),
      [SEARCH("syllabus")]: reply(200, [
        file(1, "Syllabus.docx", { "content-type": "application/msword" }),
        file(2, "Locked syllabus.pdf", { locked_for_user: true }),
        file(3, "Huge syllabus.pdf", { size: 500 * 1024 * 1024 }),
        file(4, "Broken syllabus.pdf"),
      ]),
      "/files/4/download?verifier=abc": reply(500, "boom"),
    });
    const { sources, notes } = await fetchCourseSyllabus(conn, "7", readPdf);
    expect(sources).toHaveLength(1);
    const text = notes.join("\n");
    expect(text).toMatch(/Syllabus\.docx.*Word/);
    expect(text).toMatch(/Locked syllabus\.pdf.*locked/);
    expect(text).toMatch(/Huge syllabus\.pdf.*too big/);
    expect(text).toMatch(/couldn't download Broken syllabus\.pdf/);
  });

  it("notes a scanned PDF and anything that isn't really a PDF", async () => {
    const { conn } = fakeCanvas({
      [COURSE]: reply(200, course(null)),
      [SEARCH("syllabus")]: reply(200, [file(1, "Scan syllabus.pdf"), file(2, "Fake syllabus.pdf")]),
      "/files/1/download?verifier=abc": reply(200, PDF),
      "/files/2/download?verifier=abc": reply(200, "<html>"),
    });
    const { sources, notes } = await fetchCourseSyllabus(conn, "7", async () => "   ");
    expect(sources).toEqual([]);
    expect(notes.join("\n")).toMatch(/Scan syllabus\.pdf.*scan/);
    expect(notes.join("\n")).toMatch(/Fake syllabus\.pdf.*isn't a PDF/);
  });

  it("says so when the search for files was cut short, but not when files are just hidden", async () => {
    const limited = fakeCanvas({
      [COURSE]: reply(200, course(LONG_BODY)),
      [SEARCH("syllabus")]: reply(403, "403 Forbidden (Rate Limit Exceeded)"),
    });
    expect((await fetchCourseSyllabus(limited.conn, "7", readPdf)).notes.join(" ")).toMatch(/may be missing/);
    const hidden = fakeCanvas({ [COURSE]: reply(200, course(LONG_BODY)), [SEARCH("syllabus")]: reply(401, {}) });
    expect((await fetchCourseSyllabus(hidden.conn, "7", readPdf)).notes).toEqual([]);
  });

  it("reads plain text and markdown files as they are", async () => {
    const { conn } = fakeCanvas({
      [COURSE]: reply(200, course(null)),
      [SEARCH("syllabus")]: reply(200, [file(1, "syllabus.md", { "content-type": "text/markdown" })]),
      "/files/1/download?verifier=abc": reply(200, "# CSC207\nMidterm 25%"),
    });
    const { sources } = await fetchCourseSyllabus(conn, "7", readPdf);
    expect(sources[0].text).toBe("# CSC207\nMidterm 25%");
  });

  it("cuts off very long text and says so", async () => {
    const { conn } = fakeCanvas({ [COURSE]: reply(200, course(`<p>${"word ".repeat(100_000)}</p>`)) });
    const { sources, notes } = await fetchCourseSyllabus(conn, "7", readPdf);
    expect(sources[0].text.length).toBeLessThanOrEqual(200_000);
    expect(notes.join(" ")).toMatch(/only the start/);
  });

  it("fails the course when the course itself can't be read", async () => {
    const { conn } = fakeCanvas({ [COURSE]: reply(401, {}) });
    await expect(fetchCourseSyllabus(conn, "7", readPdf)).rejects.toMatchObject({ kind: "auth" });
  });

  it("only asks the site the student named", async () => {
    const { conn, calls } = fakeCanvas({ [COURSE]: reply(200, course(LONG_BODY)) });
    await fetchCourseSyllabus(conn, "7", readPdf);
    for (const c of calls) expect(c.url.startsWith(BASE)).toBe(true);
  });
});

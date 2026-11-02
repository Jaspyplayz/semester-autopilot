// Read-only Canvas client: list a student's courses and find each one's
// syllabus. Quercus is the University of Toronto's Canvas; nothing here is
// specific to it. Network access is passed in (canvas-http.ts on the server, a
// fake in tests), so this file holds the logic and can never reach anything by
// itself. Error messages are fixed strings, so they can't carry a token.

import { z } from "zod";
import { htmlToText, linkedFiles } from "./html-text";
import { findCourseCode } from "./parse";
import type { CourseInfo, SyllabusSource } from "./types";

export type CanvasErrorKind =
  | "auth"
  | "forbidden"
  | "rate-limited"
  | "not-canvas"
  | "upstream"
  | "unreachable"
  | "blocked"
  | "too-big";

export class CanvasError extends Error {
  constructor(
    readonly kind: CanvasErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "CanvasError";
  }
}

export interface CanvasResponse {
  status: number;
  bytes: Uint8Array;
  header(name: string): string | null;
}

export type CanvasGet = (url: string, opts?: { bearer?: string; maxBytes?: number }) => Promise<CanvasResponse>;

export interface CanvasConnection {
  /** An origin, as normalizeBaseUrl returns it. */
  baseUrl: string;
  token: string;
  get: CanvasGet;
}

export interface CanvasCourse {
  id: string;
  /** "CSC 207H1", in the same form the parser uses. */
  code: string;
  name: string;
  term: string;
}

/** A source before the browser gives it an id. */
export type CanvasSource = Omit<SyllabusSource, "id">;

export interface CourseSyllabus {
  course: CanvasCourse;
  sources: CanvasSource[];
  /** Things the student should know, such as a file that couldn't be read. */
  notes: string[];
}

const MAX_PAGES = 10;
const MAX_FILES_PER_COURSE = 3;
const MAX_LINKED_LOOKUPS = 8;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;
// Shorter than this, a syllabus page is a greeting or a pointer to a file.
const MIN_PAGE_CHARS = 40;
// A short page with no marks on it is probably "the syllabus is here", plus a link.
const POINTER_PAGE_CHARS = 500;
const SYLLABUS_NAME_RE = /syllab|outline|course[ _-]?info/i;

const CourseSchema = z.object({
  id: z.number(),
  name: z.string().nullish(),
  course_code: z.string().nullish(),
  access_restricted_by_date: z.boolean().nullish(),
  syllabus_body: z.string().nullish(),
  term: z.object({ name: z.string().nullish(), start_at: z.string().nullish() }).nullish(),
});
type RawCourse = z.infer<typeof CourseSchema>;

const FileSchema = z.object({
  id: z.number(),
  display_name: z.string().nullish(),
  filename: z.string().nullish(),
  "content-type": z.string().nullish(),
  size: z.number().nullish(),
  url: z.string().nullish(),
  locked_for_user: z.boolean().nullish(),
  updated_at: z.string().nullish(),
});
type RawFile = z.infer<typeof FileSchema>;

const ModuleSchema = z.object({
  name: z.string().nullish(),
  items: z
    .array(z.object({ type: z.string().nullish(), title: z.string().nullish(), content_id: z.number().nullish() }))
    .nullish(),
});

function failure(res: CanvasResponse): CanvasError {
  const text = new TextDecoder().decode(res.bytes.subarray(0, 500));
  if (res.status === 401) {
    return new CanvasError("auth", "The course site rejected this token, or it can't see this course. Check the token or make a new one.");
  }
  if (res.status === 403 && /rate limit/i.test(text)) {
    return new CanvasError("rate-limited", "The course site says to slow down. Wait a minute and try again.");
  }
  if (res.status === 403) return new CanvasError("forbidden", "The course site won't let this token see that.");
  if (res.status === 404) return new CanvasError("not-canvas", "Nothing found there. Check the course site's address.");
  return new CanvasError("upstream", "The course site returned an error. Try again in a minute.");
}

const notCanvas = () => new CanvasError("not-canvas", "That address didn't answer like a Canvas site. Check it and try again.");

function sameOrigin(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

async function getResponse(conn: CanvasConnection, url: string, maxBytes?: number): Promise<CanvasResponse> {
  // The token only ever goes to the site the student named.
  const bearer = sameOrigin(url, conn.baseUrl) ? conn.token : undefined;
  return conn.get(url, { bearer, maxBytes });
}

function decodeJson<T>(res: CanvasResponse, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(res.bytes));
  } catch {
    throw notCanvas();
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw notCanvas();
  return parsed.data;
}

async function getJson<T>(conn: CanvasConnection, path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await getResponse(conn, `${conn.baseUrl}${path}`);
  if (res.status < 200 || res.status >= 300) throw failure(res);
  return decodeJson(res, schema);
}

function nextLink(header: string | null): string | null {
  for (const part of header?.split(",") ?? []) {
    const m = /<([^>]+)>\s*;.*\brel="?next"?/i.exec(part);
    if (m) return m[1];
  }
  return null;
}

async function getPaged<T>(conn: CanvasConnection, path: string, schema: z.ZodType<T>): Promise<T[]> {
  const all: T[] = [];
  let url: string | null = `${conn.baseUrl}${path}`;
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res: CanvasResponse = await getResponse(conn, url);
    if (res.status < 200 || res.status >= 300) throw failure(res);
    all.push(...decodeJson(res, z.array(schema)));
    const next = nextLink(res.header("link"));
    url = next && sameOrigin(next, conn.baseUrl) ? next : null;
  }
  return all;
}

function describeCourse(raw: RawCourse): CanvasCourse {
  const label = raw.course_code || raw.name || `Course ${raw.id}`;
  const found = findCourseCode(raw.course_code ?? "") ?? findCourseCode(raw.name ?? "");
  const fullName = raw.name ?? "";
  // UofT names look like "CSC207H1 F LEC0101 20269:Software Design".
  const afterColon = fullName.includes(":") ? fullName.slice(fullName.lastIndexOf(":") + 1).trim() : "";
  const name = afterColon || (found ? fullName.replace(/^\S+\s*/, "") : fullName);
  return { id: String(raw.id), code: found?.code ?? label, name, term: raw.term?.name ?? "" };
}

export async function listCourses(conn: CanvasConnection): Promise<CanvasCourse[]> {
  const raw = await getPaged(
    conn,
    "/api/v1/courses?enrollment_state=active&state[]=available&include[]=term&per_page=100",
    CourseSchema,
  );
  const usable = raw.filter((c) => !c.access_restricted_by_date && (c.name || c.course_code));
  const start = (c: RawCourse) => c.term?.start_at ?? "";
  return usable
    .map((c, order) => ({ c, order }))
    .sort((a, b) => start(b.c).localeCompare(start(a.c)) || a.order - b.order)
    .map(({ c }) => describeCourse(c));
}

const fileName = (f: RawFile) => f.display_name || f.filename || `File ${f.id}`;

type FileKind = "pdf" | "text" | "word" | "other";

function fileKind(f: RawFile): FileKind {
  const ext = fileName(f).split(".").pop()?.toLowerCase() ?? "";
  const type = f["content-type"] ?? "";
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (ext === "md" || ext === "markdown" || ext === "txt" || type === "text/plain" || type === "text/markdown") return "text";
  if (ext === "doc" || ext === "docx" || /word/.test(type)) return "word";
  return "other";
}

async function findSyllabusFiles(
  conn: CanvasConnection,
  courseId: string,
  body: string,
  pageIsPointer: boolean,
  warn: (note: string) => void,
): Promise<RawFile[]> {
  // A listing being refused is normal (many courses hide Files from students),
  // so it isn't worth a note. Anything else might mean a syllabus was missed.
  async function optional<T>(load: () => Promise<T>, empty: T): Promise<T> {
    try {
      return await load();
    } catch (err) {
      if (!(err instanceof CanvasError)) throw err;
      if (err.kind !== "auth" && err.kind !== "forbidden" && err.kind !== "not-canvas") {
        warn("couldn't finish looking for syllabus files, so one may be missing");
      }
      return empty;
    }
  }
  const fileById = (id: string) => optional<RawFile | null>(() => getJson(conn, `/api/v1/files/${id}`, FileSchema), null);

  const links = linkedFiles(body).slice(0, MAX_LINKED_LOOKUPS);
  const linked = await Promise.all(links.map(async (l) => ({ label: l.label, file: await fileById(l.id) })));
  const named = linked.filter((l) => l.file && (SYLLABUS_NAME_RE.test(l.label) || SYLLABUS_NAME_RE.test(fileName(l.file))));
  const found: RawFile[] = named.map((l) => l.file as RawFile);

  // "outline" also matches plenty of lecture outlines, so it's the second try.
  for (const term of ["syllabus", "outline"]) {
    if (found.length) break;
    found.push(
      ...(await optional(() => getPaged(conn, `/api/v1/courses/${courseId}/files?search_term=${term}&per_page=20`, FileSchema), [])),
    );
  }

  for (const term of ["syllabus", "outline"]) {
    if (found.length) break;
    const modules = await optional(
      () => getPaged(conn, `/api/v1/courses/${courseId}/modules?include[]=items&search_term=${term}&per_page=50`, ModuleSchema),
      [],
    );
    const ids = modules.flatMap((m) =>
      (m.items ?? [])
        .filter((i) => i.type === "File" && i.content_id && (SYLLABUS_NAME_RE.test(m.name ?? "") || SYLLABUS_NAME_RE.test(i.title ?? "")))
        .map((i) => String(i.content_id)),
    );
    const files = await Promise.all([...new Set(ids)].slice(0, MAX_LINKED_LOOKUPS).map(fileById));
    found.push(...files.filter((f): f is RawFile => f !== null));
  }

  // A short page whose only job is to point at a file, whatever that file is called.
  if (!found.length && pageIsPointer && linked[0]?.file) found.push(linked[0].file);

  const seen = new Set<number>();
  return found.filter((f) => !seen.has(f.id) && seen.add(f.id));
}

async function readFile(
  conn: CanvasConnection,
  file: RawFile,
  kind: FileKind,
  readPdf: (bytes: Uint8Array) => Promise<string>,
): Promise<{ text: string } | { problem: string }> {
  const name = fileName(file);
  let res: CanvasResponse;
  try {
    res = await getResponse(conn, file.url ?? "", MAX_FILE_BYTES);
  } catch (err) {
    if (err instanceof CanvasError && err.kind === "too-big") return { problem: `${name} is too big to read here` };
    if (err instanceof CanvasError || err instanceof TypeError) return { problem: `couldn't download ${name}` };
    throw err;
  }
  if (res.status < 200 || res.status >= 300) return { problem: `couldn't download ${name}` };
  if (kind === "text") return { text: new TextDecoder().decode(res.bytes) };
  if (new TextDecoder().decode(res.bytes.subarray(0, 5)) !== "%PDF-") return { problem: `${name} isn't a PDF, despite its name` };
  try {
    const text = await readPdf(res.bytes);
    return text.trim().length < 20 ? { problem: `${name} has no readable text (it may be a scan)` } : { text };
  } catch {
    return { problem: `couldn't read ${name} (it may be damaged or password protected)` };
  }
}

export async function fetchCourseSyllabus(
  conn: CanvasConnection,
  courseId: string,
  readPdf: (bytes: Uint8Array) => Promise<string>,
): Promise<CourseSyllabus> {
  const raw = await getJson(conn, `/api/v1/courses/${courseId}?include[]=syllabus_body&include[]=term`, CourseSchema);
  const course = describeCourse(raw);
  const info: CourseInfo = { code: course.code, name: course.name };
  const sources: CanvasSource[] = [];
  const notes: string[] = [];
  const note = (text: string) => notes.push(`${course.code}: ${text}.`);

  const add = (name: string, text: string) => {
    const cut = text.length > MAX_TEXT_CHARS;
    if (cut) note(`${name} is very long, so only the start was read`);
    sources.push({ name: `${course.code} · ${name}`, kind: "canvas", text: text.slice(0, MAX_TEXT_CHARS), course: info });
  };

  const body = raw.syllabus_body ?? "";
  const pageText = htmlToText(body);
  if (pageText.length >= MIN_PAGE_CHARS) add("syllabus page", pageText);

  const pageIsPointer = pageText.length < POINTER_PAGE_CHARS && !/\d\s?%/.test(pageText);
  const files = await findSyllabusFiles(conn, course.id, body, pageIsPointer, note);
  const readable: Array<{ file: RawFile; kind: FileKind }> = [];
  for (const file of files) {
    const kind = fileKind(file);
    const name = fileName(file);
    if (file.locked_for_user || !file.url) note(`${name} is locked`);
    else if (kind === "word") note(`${name} is a Word file, which this app can't read yet. Save it as a PDF and upload it`);
    else if (kind === "other") note(`${name} isn't a PDF or text file, so it was skipped`);
    else if ((file.size ?? 0) > MAX_FILE_BYTES) note(`${name} is too big to read here`);
    else readable.push({ file, kind });
  }
  const newest = readable
    .sort((a, b) => (b.file.updated_at ?? "").localeCompare(a.file.updated_at ?? ""))
    .slice(0, MAX_FILES_PER_COURSE);
  for (const { file, kind } of newest) {
    const result = await readFile(conn, file, kind, readPdf);
    if ("text" in result) add(fileName(file), result.text);
    else note(result.problem);
  }

  if (!sources.length) note("no syllabus found on the course site. Upload or paste it instead");
  return { course, sources, notes };
}

// A small fake Canvas site, for trying the Quercus path without a real token and
// for scripts/prove-e2e.ts. It implements only what the app calls, checks the
// token, paginates, and serves files through a redirect to a second origin the
// way real Canvas does, recording any token that reaches that origin.
//
//   CANVAS_ALLOW_PRIVATE_HOSTS=1 npm run dev        # in one shell
//   npm run mock-canvas [folder]                    # in another
//
// A folder of PDFs makes one course per PDF; a folder of folders makes one course
// per subfolder. It defaults to the sample school.
import { createServer, type Server } from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MOCK_TOKEN = "mock-token-not-a-secret";

export interface MockCourse {
  id: number;
  code: string;
  name: string;
  syllabusBody?: string;
  frontPageBody?: string;
  files: string[];
}

export interface MockCanvas {
  url: string;
  /** Authorization headers that reached the second origin. Should stay empty. */
  leakedToCdn: string[];
  close(): void;
}

const listen = (server: Server, port: number) =>
  new Promise<number>((done) => server.listen(port, "127.0.0.1", () => done((server.address() as AddressInfo).port)));

export async function startMockCanvas(courses: MockCourse[], port = 0): Promise<MockCanvas> {
  const files = courses.flatMap((c) => c.files.map((path) => ({ path, course: c })));
  const fileId = (i: number) => 1000 + i;
  const leakedToCdn: string[] = [];
  let origin = "";

  const cdn = createServer((req, res) => {
    if (req.headers.authorization) leakedToCdn.push(req.headers.authorization);
    const file = files[Number(new URL(req.url ?? "/", "http://x").pathname.slice(1))];
    if (!file) return void res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": "application/pdf" }).end(readFileSync(file.path));
  });
  const cdnPort = await listen(cdn, 0);

  const fileJson = (i: number) => ({
    id: fileId(i),
    display_name: basename(files[i].path),
    filename: basename(files[i].path),
    "content-type": "application/pdf",
    size: statSync(files[i].path).size,
    url: `${origin}/files/${fileId(i)}/download?download_frd=1&verifier=mock`,
    locked_for_user: false,
    updated_at: "2026-09-01T00:00:00Z",
  });
  const courseJson = (c: MockCourse) => ({
    id: c.id,
    name: `${c.code} F LEC0101 20269:${c.name}`,
    course_code: `${c.code} F LEC0101`,
    term: { name: "Fall 2026", start_at: "2026-09-01T00:00:00Z" },
  });

  const api = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (status: number, body: unknown, headers = {}) =>
      void res.writeHead(status, { "Content-Type": "application/json", ...headers }).end(JSON.stringify(body));

    if (req.method !== "GET") return send(405, { errors: [{ message: "this mock only reads" }] });
    // Real Canvas does this too, with an HTML page rather than JSON.
    if (!req.headers["user-agent"]) return void res.writeHead(403).end("Not Authorized: no valid user agent");
    if (req.headers.authorization !== `Bearer ${MOCK_TOKEN}`) {
      return send(401, { errors: [{ message: "Invalid access token." }] });
    }

    const download = url.pathname.match(/^\/files\/(\d+)\/download$/);
    if (download) {
      return void res.writeHead(302, { Location: `http://127.0.0.1:${cdnPort}/${Number(download[1]) - 1000}` }).end();
    }
    if (url.pathname === "/api/v1/courses") {
      // One course per page, so every run exercises pagination.
      const page = Number(url.searchParams.get("page") ?? "1");
      const next = page < courses.length ? { Link: `<${origin}/api/v1/courses?page=${page + 1}>; rel="next"` } : {};
      return send(200, courses.slice(page - 1, page).map(courseJson), next);
    }
    const one = url.pathname.match(/^\/api\/v1\/courses\/(\d+)$/);
    if (one) {
      const c = courses.find((x) => x.id === Number(one[1]));
      return c ? send(200, { ...courseJson(c), syllabus_body: c.syllabusBody ?? null }) : send(404, {});
    }
    const front = url.pathname.match(/^\/api\/v1\/courses\/(\d+)\/front_page$/);
    if (front) {
      const c = courses.find((x) => x.id === Number(front[1]));
      if (c?.frontPageBody === undefined) return send(404, { message: "No front page has been set" });
      return send(200, { url: "home", title: "Home", body: c.frontPageBody });
    }
    const list = url.pathname.match(/^\/api\/v1\/courses\/(\d+)\/files$/);
    if (list) {
      const term = (url.searchParams.get("search_term") ?? "").toLowerCase();
      const matches = files
        .map((f, i) => ({ f, i }))
        .filter(({ f }) => f.course.id === Number(list[1]) && basename(f.path).toLowerCase().includes(term));
      return send(200, matches.map(({ i }) => fileJson(i)));
    }
    if (/^\/api\/v1\/courses\/\d+\/modules$/.test(url.pathname)) return send(200, []);
    const single = url.pathname.match(/^\/api\/v1\/files\/(\d+)$/);
    if (single && files[Number(single[1]) - 1000]) return send(200, fileJson(Number(single[1]) - 1000));
    send(404, { errors: [{ message: "not found" }] });
  });
  const apiPort = await listen(api, port);
  origin = `http://127.0.0.1:${apiPort}`;

  return {
    url: origin,
    leakedToCdn,
    close() {
      api.close();
      cdn.close();
    },
  };
}

/** One course per subfolder, or per PDF if the folder is flat. */
export function coursesFromFolder(folder: string): MockCourse[] {
  const entries = readdirSync(folder).sort();
  const groups = entries
    .map((name) => ({ name, path: join(folder, name) }))
    .filter((e) => statSync(e.path).isDirectory() && e.name !== "src")
    .map((e) => ({
      name: e.name,
      files: readdirSync(e.path).filter((f) => f.endsWith(".pdf")).map((f) => join(e.path, f)),
    }))
    .filter((g) => g.files.length);
  const found = groups.length
    ? groups
    : entries.filter((f) => f.endsWith(".pdf")).map((f) => ({ name: f.replace(/[-_]?syllabus.*$/i, ""), files: [join(folder, f)] }));
  return found.map((g, i) => ({ id: 100 + i, code: g.name, name: `Course ${g.name}`, files: g.files }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const folder = resolve(process.argv[2] ?? join(import.meta.dirname, "../../examples/sample-university/syllabuses"));
  const courses = coursesFromFolder(folder);
  startMockCanvas(courses, Number(process.env.PORT ?? 4010)).then((mock) => {
    console.log(`Mock Canvas with ${courses.length} courses from ${folder}`);
    console.log(`Course site:  ${mock.url}`);
    console.log(`Access token: ${MOCK_TOKEN}`);
    console.log("Start the app with CANVAS_ALLOW_PRIVATE_HOSTS=1, or it will refuse this local address.");
  });
}

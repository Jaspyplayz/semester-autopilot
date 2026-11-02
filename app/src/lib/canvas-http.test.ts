import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { guardedGet, isPrivateAddress } from "./canvas-http";
import { extractPdfText } from "./pdf";
import { samplePdf } from "./test-helpers";

const servers: Server[] = [];
async function serve(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

const LOCAL = { allowPrivate: true };

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "64:ff9b::7f00:1",
  ])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["142.150.0.1", "8.8.8.8", "2606:4700:4700::1111"])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it("treats something that isn't an IP as blocked", () => {
    expect(isPrivateAddress("nonsense")).toBe(true);
  });
});

describe("guardedGet refuses", () => {
  it("plain http by default", async () => {
    await expect(guardedGet("http://example.com/")).rejects.toMatchObject({ kind: "blocked" });
  });

  it("private and loopback IP literals, however they're written", async () => {
    for (const url of ["https://127.0.0.1/", "https://2130706433/", "https://0x7f.0.0.1/", "https://[::1]/", "https://169.254.169.254/latest"]) {
      await expect(guardedGet(url)).rejects.toMatchObject({ kind: "blocked" });
    }
  });

  it("names that resolve to a private address", async () => {
    await expect(guardedGet("https://localhost:1/")).rejects.toMatchObject({ kind: "blocked" });
  });

  it("a public-looking redirect to a private address", async () => {
    const base = await serve((_, res) => res.writeHead(302, { location: "https://127.0.0.1/admin" }).end());
    const onlyFirstHop = (url: URL) => url.origin === base;
    await expect(guardedGet(`${base}/`, { allowPrivate: onlyFirstHop })).rejects.toMatchObject({ kind: "blocked" });
  });
});

describe("guardedGet redirects", () => {
  it("keeps the token on the same origin", async () => {
    const seen: Array<string | undefined> = [];
    const base = await serve((req, res) => {
      seen.push(req.headers.authorization);
      if (req.url === "/a") res.writeHead(302, { location: "/b" }).end();
      else res.end("ok");
    });
    const res = await guardedGet(`${base}/a`, { ...LOCAL, bearer: "secret" });
    expect(new TextDecoder().decode(res.bytes)).toBe("ok");
    expect(seen).toEqual(["Bearer secret", "Bearer secret"]);
  });

  it("drops the token when a redirect leaves the origin, and doesn't bring it back", async () => {
    const seen: Array<string | undefined> = [];
    let home = "";
    const other = await serve((req, res) => {
      seen.push(req.headers.authorization);
      res.writeHead(302, { location: `${home}/end` }).end();
    });
    home = await serve((req, res) => {
      seen.push(req.headers.authorization);
      if (req.url === "/start") res.writeHead(302, { location: `${other}/x` }).end();
      else res.end("done");
    });
    await guardedGet(`${home}/start`, { ...LOCAL, bearer: "secret" });
    expect(seen).toEqual(["Bearer secret", undefined, undefined]);
  });

  it("gives up on redirect loops", async () => {
    const base = await serve((_, res) => res.writeHead(302, { location: "/again" }).end());
    await expect(guardedGet(`${base}/`, LOCAL)).rejects.toMatchObject({ kind: "unreachable" });
  });
});

describe("guardedGet limits", () => {
  it("stops reading past the byte limit", async () => {
    const base = await serve((_, res) => res.end("x".repeat(5000)));
    await expect(guardedGet(`${base}/`, { ...LOCAL, maxBytes: 100 })).rejects.toMatchObject({ kind: "too-big" });
  });

  it("gives up on a server that never answers", async () => {
    const base = await serve(() => {});
    await expect(guardedGet(`${base}/`, { ...LOCAL, timeoutMs: 50 })).rejects.toMatchObject({ kind: "unreachable" });
  });

  it("returns status and headers without following non-redirects", async () => {
    const base = await serve((_, res) => res.writeHead(401, { Link: '<x>; rel="next"' }).end("{}"));
    const res = await guardedGet(`${base}/`, LOCAL);
    expect(res.status).toBe(401);
    expect(res.header("link")).toBe('<x>; rel="next"');
  });

  it("returns bytes the PDF reader accepts", async () => {
    const pdf = samplePdf("CS150");
    const base = await serve((_, res) => res.end(pdf));
    const { text } = await extractPdfText((await guardedGet(`${base}/`, LOCAL)).bytes);
    expect(text).toContain("CS 150");
  });

  it("names itself, because real Canvas answers 403 to requests with no user agent", async () => {
    let agent: string | undefined;
    const base = await serve((req, res) => {
      agent = req.headers["user-agent"];
      res.end();
    });
    await guardedGet(`${base}/`, LOCAL);
    expect(agent).toMatch(/^semester-autopilot/);
  });

  it("only ever sends GET", async () => {
    let method = "";
    const base = await serve((req, res) => {
      method = req.method ?? "";
      res.end();
    });
    await guardedGet(`${base}/`, LOCAL);
    expect(method).toBe("GET");
  });
});

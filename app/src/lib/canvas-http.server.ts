// The only way the server talks to a course site. The address comes from the
// student, so this refuses anything but public https hosts (SSRF), checks DNS
// answers at connect time so a name can't change to a private address after a
// separate check, re-checks every redirect, and drops the token as soon as a
// redirect leaves the origin. It only sends GET, and it logs nothing.

import "server-only";
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { CanvasError, type CanvasGet, type CanvasResponse } from "./canvas.server";

const MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
// Canvas refuses requests with no user agent, with a 403 and an HTML page.
const USER_AGENT = "semester-autopilot (+https://github.com/Jaspyplayz/semester-autopilot)";

const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, bits, "ipv4");
}
for (const [net, bits] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7],
  ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, bits, "ipv6");
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return true;
  // BlockList applies IPv4 rules to IPv4-mapped IPv6 addresses by itself.
  return blocked.check(ip, family === 6 ? "ipv6" : "ipv4");
}

const refused = () =>
  new CanvasError("blocked", "That address isn't a public https site, so this app won't connect to it.");

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function publicOnlyLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) return callback(refused(), "");
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

export interface GuardedGetOptions {
  bearer?: string;
  maxBytes?: number;
  timeoutMs?: number;
  /** For local testing: skip the public-https rule, for every URL or the ones this approves. */
  allowPrivate?: boolean | ((url: URL) => boolean);
}

function readBody(res: IncomingMessage, maxBytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    res.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        res.destroy();
        reject(new CanvasError("too-big", "The course site sent more than this app will read."));
        return;
      }
      chunks.push(chunk);
    });
    // A plain Uint8Array: pdf.js refuses Buffers.
    res.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    res.on("error", reject);
    res.on("close", () => reject(new CanvasError("unreachable", "The course site stopped answering.")));
  });
}

async function getOnce(url: URL, opts: GuardedGetOptions, trusted: boolean): Promise<CanvasResponse> {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  const headers: Record<string, string> = { Accept: "application/json, */*", "User-Agent": USER_AGENT };
  if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: "GET", headers, signal, agent: false, ...(trusted ? {} : { lookup: publicOnlyLookup as never }) },
      (res) => {
        readBody(res, opts.maxBytes ?? DEFAULT_MAX_BYTES).then(
          (bytes) =>
            resolve({
              status: res.statusCode ?? 0,
              bytes,
              header: (name) => {
                const value = res.headers[name.toLowerCase()];
                return Array.isArray(value) ? value.join(", ") : (value ?? null);
              },
            }),
          reject,
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function guardedGet(start: string, opts: GuardedGetOptions = {}): Promise<CanvasResponse> {
  let url = new URL(start);
  let bearer = opts.bearer;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const trusted = typeof opts.allowPrivate === "function" ? opts.allowPrivate(url) : Boolean(opts.allowPrivate);
    if (!trusted) {
      if (url.protocol !== "https:") throw refused();
      const host = url.hostname.replace(/^\[|\]$/g, "");
      if (isIP(host) && isPrivateAddress(host)) throw refused();
    }

    let res: CanvasResponse;
    try {
      res = await getOnce(url, { ...opts, bearer }, trusted);
    } catch (err) {
      if (err instanceof CanvasError) throw err;
      throw new CanvasError("unreachable", "Couldn't reach the course site. Check the address and try again.");
    }

    const location = res.header("location");
    if (res.status < 300 || res.status >= 400 || !location) return res;
    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      throw new CanvasError("unreachable", "The course site sent a bad redirect.");
    }
    if (next.origin !== url.origin) bearer = undefined;
    url = next;
  }
  throw new CanvasError("unreachable", "The course site redirected too many times.");
}

/** Off unless a developer asks, and never on Vercel. */
export function allowsPrivateHosts(): boolean {
  return process.env.CANVAS_ALLOW_PRIVATE_HOSTS === "1" && !process.env.VERCEL;
}

export const canvasGet: CanvasGet = (url, opts) => guardedGet(url, { ...opts, allowPrivate: allowsPrivateHosts() });

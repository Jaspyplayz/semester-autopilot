#!/usr/bin/env node
// Starts, checks and stops the verification instance: the built app plus a mock Canvas site.
//   control.mjs launch | doctor | prove | cleanup
// Ports come from VERIFY_PORT (3100) and VERIFY_MOCK_PORT (4110).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(import.meta.dirname, "../../../..");
const APP = join(ROOT, "app");
const OUT = join(APP, ".e2e-out");
const LOGS = join(OUT, "logs");
const RUN_FILE = join(OUT, "run.json");
const PORT = Number(process.env.VERIFY_PORT ?? 3100);
const MOCK_PORT = Number(process.env.VERIFY_MOCK_PORT ?? 4110);
const BIN = (name) => join(APP, "node_modules/.bin", name);
const TOKEN = "mock-token-not-a-secret";

const readRun = () => (existsSync(RUN_FILE) ? JSON.parse(readFileSync(RUN_FILE, "utf8")) : null);
const head = () => spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const portBusy = (port, host = "127.0.0.1") =>
  new Promise((done) => {
    const socket = createConnection({ port, host, timeout: 1000 });
    socket.once("connect", () => (socket.destroy(), done(true)));
    socket.once("timeout", () => (socket.destroy(), done(false)));
    socket.once("error", () => done(false));
  });

// Every package.json dependency, at the version the lockfile pins.
function depsMatchLock() {
  const lock = JSON.parse(readFileSync(join(APP, "package-lock.json"), "utf8")).packages;
  const { dependencies, devDependencies } = lock[""];
  return Object.keys({ ...dependencies, ...devDependencies }).every((name) => {
    const installed = join(APP, "node_modules", name, "package.json");
    return existsSync(installed) && JSON.parse(readFileSync(installed, "utf8")).version === lock[`node_modules/${name}`].version;
  });
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: APP, stdio: "inherit", env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
}

// Its own process group, so cleanup can stop it and anything it started, and nothing else.
function start(name, command, args, env) {
  const log = openSync(join(LOGS, `${name}.log`), "w");
  const child = spawn(command, args, { cwd: APP, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  child.unref();
  return child.pid;
}

async function waitFor(url, label, init) {
  for (let i = 0; i < 120; i++) {
    const res = await fetch(url, init).catch(() => null);
    if (res?.status === 200) return;
    await sleep(500);
  }
  throw new Error(`${label} wasn't ready after 60s. See ${LOGS}`);
}

function stop(instance) {
  for (const pid of [instance.appPid, instance.mockPid]) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

async function launch() {
  const old = readRun();
  if (old && (alive(old.appPid) || alive(old.mockPid))) {
    throw new Error(`This checkout already has an instance on port ${old.port}. Run control.mjs cleanup first.`);
  }
  for (const port of [PORT, MOCK_PORT]) {
    if (await portBusy(port)) throw new Error(`Port ${port} is taken by something this run didn't start. Set VERIFY_PORT or VERIFY_MOCK_PORT.`);
  }
  mkdirSync(LOGS, { recursive: true });
  if (!depsMatchLock()) run("npm", ["ci"]);
  // Taken before the build, so the stamp can't name a commit newer than what was built.
  const sha = head();
  const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).stdout.trim() !== "";
  const stamp = `sha ${sha}${dirty ? " plus uncommitted changes" : ""}`;
  run("npm", ["run", "build"]);

  // Loopback only: CANVAS_ALLOW_PRIVATE_HOSTS lets whoever reaches this port make the app call private addresses.
  const appPid = start("app", BIN("next"), ["start", "-H", "127.0.0.1", "-p", String(PORT)], {
    CANVAS_ALLOW_PRIVATE_HOSTS: "1",
    // An empty value beats .env.local, so the keyless paths are what gets driven.
    ANTHROPIC_API_KEY: "",
  });
  const mockPid = start("mock-canvas", BIN("tsx"), ["scripts/mock-canvas.ts"], { PORT: String(MOCK_PORT) });
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const mockUrl = `http://127.0.0.1:${MOCK_PORT}`;
  writeFileSync(RUN_FILE, JSON.stringify({ appPid, mockPid, port: PORT, mockPort: MOCK_PORT, baseUrl, mockUrl, sha, stamp }, null, 2));
  try {
    await waitFor(baseUrl, "The app");
    await waitFor(`${mockUrl}/api/v1/courses`, "Mock Canvas", { headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "verify" } });
  } catch (error) {
    stop(readRun());
    rmSync(RUN_FILE);
    throw error;
  }
  console.log(`ready app=${baseUrl} (pid ${appPid}) mock-canvas=${mockUrl} (pid ${mockPid}) ${stamp}`);
}

function newestSource(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((newest, entry) => {
    const path = join(dir, entry.name);
    return Math.max(newest, entry.isDirectory() ? newestSource(path) : statSync(path).mtimeMs);
  }, 0);
}

async function doctor() {
  let failed = false;
  const check = (ok, line) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${line}`);
    if (!ok) failed = true;
  };
  const instance = readRun();
  check(instance, `run file ${RUN_FILE}`);
  if (!instance) process.exit(1);

  // Launch refuses a taken port, so a live pid answering on it means the port is ours.
  check(alive(instance.appPid), `app process ${instance.appPid} is running`);
  check(alive(instance.mockPid), `mock Canvas process ${instance.mockPid} is running`);
  const home = await fetch(instance.baseUrl).catch(() => null);
  const html = home ? await home.text() : "";
  check(home?.status === 200 && html.includes("<title>Semester Autopilot</title>"), `${instance.baseUrl} serves Semester Autopilot`);

  check(instance.sha === head(), `built from HEAD (${instance.sha.slice(0, 7)})`);
  const buildId = join(APP, ".next/BUILD_ID");
  check(existsSync(buildId) && newestSource(join(APP, "src")) <= statSync(buildId).mtimeMs, `the build is newer than app/src`);

  check(depsMatchLock(), `node_modules matches package-lock.json`);

  // Try the port from this machine's other addresses. A bind to all interfaces answers on them.
  const outside = Object.values(networkInterfaces()).flat().filter((a) => !a.internal && !a.scopeid).map((a) => a.address);
  for (const port of [instance.port, instance.mockPort]) {
    const answered = await Promise.all(outside.map((host) => portBusy(port, host)));
    const exposed = outside.filter((_, i) => answered[i]);
    check(exposed.length === 0, `port ${port} is bound to loopback only (${exposed.length ? `answered on ${exposed.join(", ")}` : `no answer on ${outside.join(", ") || "any other address"}`})`);
  }

  const courses = await fetch(`${instance.mockUrl}/api/v1/courses`, { headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "verify" } }).catch(() => null);
  check(courses?.status === 200, `mock Canvas answers at ${instance.mockUrl}`);
  const refused = await fetch(`${instance.baseUrl}/api/canvas/courses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseUrl: instance.mockUrl, token: "wrong-token" }),
  }).catch(() => null);
  check(refused?.status === 401, `the app can reach mock Canvas, and a wrong token gets 401 (${refused?.status})`);

  const llm = await fetch(`${instance.baseUrl}/api/llm-status`).then((r) => r.json()).catch(() => null);
  check(llm?.enabled === false, `no Anthropic key in this instance (llm-status enabled=${llm?.enabled})`);
  const ignored = spawnSync("git", ["check-ignore", "-q", join(OUT, "probe")], { cwd: ROOT }).status === 0;
  check(ignored, `evidence dir is gitignored: ${OUT}`);
  if (failed) process.exit(1);
}

function prove() {
  const instance = readRun();
  if (!instance) throw new Error("Nothing is running. Run control.mjs launch first.");
  const doctorRun = spawnSync(process.execPath, [import.meta.filename, "doctor"], { encoding: "utf8" });
  if (doctorRun.status !== 0) {
    console.error(doctorRun.stdout.split("\n").filter((line) => line.startsWith("FAIL")).join("\n"));
    throw new Error("Refusing to prove: doctor failed. Run control.mjs cleanup, then launch.");
  }
  const log = join(LOGS, "prove.log");
  const result = spawnSync(`{ echo "$STAMP"; npm run prove 2>&1; } | tee "${log}"; exit \${PIPESTATUS[0]}`, {
    cwd: APP,
    shell: "/bin/bash",
    stdio: "inherit",
    env: { ...process.env, BASE_URL: instance.baseUrl, STAMP: instance.stamp },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`\nLog: ${log}`);
}

async function cleanup() {
  const instance = readRun();
  if (!instance) return console.log("Nothing to clean up: no run file.");
  stop(instance);
  for (let i = 0; i < 20 && (alive(instance.appPid) || alive(instance.mockPid)); i++) await sleep(250);
  for (const pid of [instance.appPid, instance.mockPid]) {
    if (alive(pid)) process.kill(-pid, "SIGKILL");
  }
  rmSync(RUN_FILE);
  console.log(`Stopped pids ${instance.appPid} and ${instance.mockPid}. Evidence kept in ${OUT}`);
}

const commands = { launch, doctor, prove, cleanup };
const command = commands[process.argv[2]];
if (!command) {
  console.error(`Usage: control.mjs ${Object.keys(commands).join(" | ")}`);
  process.exit(2);
}
try {
  await command();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

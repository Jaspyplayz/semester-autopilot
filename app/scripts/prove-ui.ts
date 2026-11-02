// Drives the real UI in headless Chromium through a mock Canvas site, with no LLM
// key, and saves a screenshot of each step once that step's checks pass.
// Usage: npx playwright install chromium (once), then
//   npm run build && CANVAS_ALLOW_PRIVATE_HOSTS=1 npm start (in another shell), then
//   BASE_URL=http://localhost:3000 npm run prove:ui
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import { MOCK_TOKEN, coursesFromFolder, startMockCanvas } from "./mock-canvas";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PDF_DIR = join(__dirname, "../../examples/sample-university/syllabuses");
const OUT = join(__dirname, "../.e2e-out/ui");
// The app's own Today field, so the plans and the screenshots don't change with the date.
const TODAY = "2026-10-05";
// The rows in examples/sample-university/expected-output/deadlines.md for that day.
const EXPECTED_ROWS = 14;
// Those rows, less December finals and the 4 lab reports whose dates are TBA.
const EXPECTED_EVENTS = 9;

function assert(ok: unknown, msg: string): void {
  if (!ok) throw new Error(`FAIL: ${msg}`);
  console.log(`ok   ${msg}`);
}

async function assertKeyless() {
  const res = await fetch(`${BASE}/`).catch(() => null);
  if (!res) throw new Error(`FAIL: no server at ${BASE}. Run: npm run build && CANVAS_ALLOW_PRIVATE_HOSTS=1 npm start`);
  assert(res.status === 200, `GET / returns 200`);
  const status = (await (await fetch(`${BASE}/api/llm-status`)).json()) as { enabled: boolean };
  assert(status.enabled === false, `the server has no LLM key (/api/llm-status enabled=${status.enabled})`);
}

async function main() {
  // Removed first, so a PNG from an earlier run can't pass for this run's proof.
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  await assertKeyless();

  const mock = await startMockCanvas(coursesFromFolder(PDF_DIR));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ acceptDownloads: true, timezoneId: "America/Toronto", viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await walkThrough(page, mock.url);
    assert(mock.leakedToCdn.length === 0, `no token reached the file CDN's origin after the redirect`);
  } finally {
    await browser.close();
    mock.close();
  }

  console.log(`\nWrote to ${OUT}:`);
  for (const name of shots) console.log(`  ${name}  ${statSync(join(OUT, name)).size} bytes`);
}

const shots: string[] = [];

async function walkThrough(page: Page, mockUrl: string) {
  const browserErrors: string[] = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") browserErrors.push(m.text());
  });

  // Runs one step's checks, and only screenshots if they all held. A failure leaves
  // FAILED-<name>.png to look at, which the file list at the end never includes.
  async function step(name: string, label: string, via: Locator | null, body: () => Promise<void>) {
    console.log(`\n${name}`);
    try {
      await via?.click();
      await page.locator("li[aria-current=step]", { hasText: label }).waitFor();
      await body();
      const alerts = await page.locator("main [role=alert]").allInnerTexts();
      assert(alerts.length === 0, `no error on screen${alerts.length ? ` (got "${alerts.join("; ")}")` : ""}`);
      assert(browserErrors.length === 0, `no browser errors${browserErrors.length ? ` (got "${browserErrors.join("; ")}")` : ""}`);
    } catch (e) {
      await page.screenshot({ path: join(OUT, `FAILED-${name}.png`), fullPage: true }).catch(() => {});
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`${message.startsWith("FAIL") ? message : `FAIL: ${message}`}\nStopped at step ${name}. See ${join(OUT, `FAILED-${name}.png`)}`);
    }
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
    shots.push(`${name}.png`);
  }
  const button = (name: string) => page.getByRole("button", { name, exact: true });

  await page.goto(BASE);

  await step("01-input", "Add syllabuses", null, async () => {
    await page.fill("#canvas-url", mockUrl);
    await page.fill("#canvas-token", MOCK_TOKEN);
    await page.fill("#today", TODAY);
    await button("Connect").click();
    await button("Refresh courses").or(page.locator("main [role=alert]")).first().waitFor();
    const refused = await page.locator("main [role=alert]").allInnerTexts();
    if (refused.length) throw new Error(`FAIL: the app refused the mock Canvas site: "${refused.join("; ")}". Start the server with CANVAS_ALLOW_PRIVATE_HOSTS=1.`);
    const courses = page.getByRole("checkbox");
    assert((await courses.count()) === 3, `the mock site's 3 courses are listed`);
    for (const course of await courses.all()) await course.check();
    assert(await button("Get deadlines from 3 courses").isEnabled(), `"Get deadlines from 3 courses" is ready`);
    assert(!(await button("Read with Claude instead").isVisible()), `no Claude button without a key`);
  });

  await step("02-confirm", "Check deadlines", button("Get deadlines from 3 courses"), async () => {
    await page.getByRole("heading", { name: "Deadlines, Fall 2026" }).waitFor();
    const rows = await page.getByTestId("deadline-row").count();
    assert(rows === EXPECTED_ROWS, `${EXPECTED_ROWS} upcoming deadlines in the table (got ${rows})`);
    const midterm = await page.getByRole("textbox", { name: "When: CS 150 Midterm" }).inputValue();
    assert(/Oct 27/.test(midterm), `CS 150 midterm on Oct 27 (got "${midterm}")`);
    assert((await page.getByRole("textbox", { name: "When: BIO 110 Quiz 1" }).count()) === 0, `BIO 110 Quiz 1 is past on ${TODAY}, so it's hidden`);
  });

  await step("03-plans", "Check plans", button("Confirm deadlines"), async () => {
    await button("Confirm plans").waitFor();
    for (const course of ["BIO 110", "HIS 201", "CS 150"]) {
      const plan = await page.getByRole("heading", { name: `${course} · Midterm` }).innerText();
      assert(plan, `a plan for "${plan}"`);
    }
    assert((await page.getByRole("textbox", { name: /^Study block on/ }).count()) > 0, `the plans have study blocks to edit`);
  });

  await step("04-done", "Done", button("Confirm plans"), async () => {
    const line = await page.getByText(/The calendar file has \d+ events?/).innerText();
    const promised = Number(line.match(/has (\d+) event/)?.[1]);
    const [download] = await Promise.all([page.waitForEvent("download"), button("Download .ics").click()]);
    assert(download.suggestedFilename() === "deadlines.ics", `the download is deadlines.ics`);
    const path = join(OUT, "deadlines.ics");
    await download.saveAs(path);
    const ics = readFileSync(path, "utf8");
    const events = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    assert(ics.startsWith("BEGIN:VCALENDAR") && events === EXPECTED_EVENTS, `the .ics is a VCALENDAR with ${EXPECTED_EVENTS} VEVENTs (got ${events})`);
    assert(events === promised, `that matches the ${promised} events the page promises`);
  });

  await step("05-coach", "Coach", button("What's today?"), async () => {
    await page.getByRole("heading", { name: /^Today, .*Oct 5/ }).waitFor();
    const todayCard = page.locator("section", { has: page.getByRole("heading", { name: /^Today, / }) });
    const blocks = await todayCard.getByTestId("coach-block").count();
    assert(blocks > 0, `${blocks} blocks to do today`);
    const week = await page.getByTestId("week-count").innerText();
    assert(week.startsWith("0 done"), `nothing is done yet (got "${week}")`);
  });

  await step("06-study", "Coach", button("Study").first(), async () => {
    await page.getByRole("heading", { name: /^Quiz, question 1 of \d+/ }).waitFor();
    assert(await page.getByTestId("quiz-question").isVisible(), `the quiz shows a built-in question`);
    assert(!(await button("Get questions from Claude").isVisible()), `no Claude button without a key`);
  });

  await step("07-study-score", "Coach", null, async () => {
    const title = await page.getByRole("heading", { name: /^Quiz, question 1 of \d+/ }).innerText();
    const total = Number(title.match(/of (\d+)/)?.[1]);
    for (let i = 0; i < total; i++) {
      await page.getByRole("heading", { name: `Quiz, question ${i + 1} of ${total}` }).waitFor();
      const free = (await page.getByTestId("quiz-question").getAttribute("data-kind")) !== "choice";
      if (free) {
        await page.getByRole("textbox", { name: "Your answer" }).fill("What I remember from my notes.");
        await button("Show the answer").click();
        await button("Got it").click();
      } else {
        await page.getByTestId("quiz-question").getByRole("button").first().click();
        await button("Next").click();
      }
    }
    const score = await page.getByTestId("quiz-score").innerText();
    assert(score.includes(`of ${total}`), `the quiz ends with a score (got "${score}")`);
  });

  await step("08-coach-after", "Coach", button("Mark block done"), async () => {
    const week = await page.getByTestId("week-count").innerText();
    assert(week.startsWith("1 done"), `the block now counts as done (got "${week}")`);
  });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

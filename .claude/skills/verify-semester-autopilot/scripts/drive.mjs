#!/usr/bin/env node
// Drives the running instance in a real browser, as a student would, and keeps the proof.
//   drive.mjs upload | canvas | confirm | plan | coach | ics | all
// Each journey opens a new browser profile and reaches its feature through the UI.
// Evidence goes to app/.e2e-out/verify/<journey>/. A run replaces that journey's folder.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../../..");
const APP = join(ROOT, "app");
const OUT = join(APP, ".e2e-out");
const RUN_FILE = join(OUT, "run.json");
const FIXTURES = join(ROOT, "examples/sample-university");
const SYLLABUSES = join(FIXTURES, "syllabuses");
const TOKEN = "mock-token-not-a-secret";
const SAMPLE_TODAY = "2026-10-05";

const { chromium } = createRequire(join(APP, "package.json"))("playwright-core");

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

async function press(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
}

async function open(page, instance) {
  await page.goto(instance.baseUrl);
  await page.getByRole("heading", { name: "Connect Quercus or Canvas" }).waitFor();
}

async function openFallback(page) {
  await page.getByText("No token? Upload or paste a syllabus instead").click();
}

async function loadSamples(t) {
  const { page } = t;
  await open(page, t.instance);
  await openFallback(page);
  await press(page, "Load sample syllabuses");
  await page.getByRole("button", { name: "Remove BIO110-syllabus.md" }).waitFor();
  await page.getByRole("button", { name: "Remove HIS201-syllabus.md" }).waitFor();
  await page.getByRole("button", { name: "Pretend today is Oct 5, 2026" }).click();
  assert((await page.getByLabel("Today").inputValue()) === SAMPLE_TODAY, "Today didn't become Oct 5");
  t.ok("samples loaded and today set to Oct 5, 2026");
}

async function readDeadlines(page) {
  await press(page, "Read deadlines");
  await page.getByRole("heading", { name: "Deadlines, Fall 2026" }).waitFor();
}

async function tableRows(page) {
  await page.getByTestId("deadline-row").first().waitFor();
  const rows = await page.getByTestId("deadline-row").all();
  return Promise.all(rows.map((row) => row.getByRole("textbox").evaluateAll((cells) => cells.map((c) => c.value))));
}

/** Every row in the example output, apart from the differences app/README.md documents. */
async function checkAgainstExpected(t) {
  const rows = await tableRows(t.page);
  const expected = readFileSync(join(FIXTURES, "expected-output/deadlines.md"), "utf8")
    .split("\n")
    .filter((line) => /^\| .* \|$/.test(line) && !line.startsWith("| When"))
    .map((line) => line.split("|").slice(1, 6).map((cell) => cell.replaceAll("**", "").trim()));
  for (const [when, course, what] of expected) {
    const name = what.split(",")[0];
    const row = rows.find((r) => r[1] === course && r[2].startsWith(name));
    assert(row, `the table has no row for ${course} ${what}`);
    // The syllabus doesn't date lab reports, so the app asks rather than guessing.
    const wanted = /^Lab report/.test(what) ? "TBA" : when;
    assert(row[0] === wanted, `${course} ${what}: expected "${wanted}", got "${row[0]}"`);
  }
  t.ok(`all ${expected.length} rows in expected-output/deadlines.md are in the table with the right dates (lab reports TBA)`);
}

async function confirmDeadlines(t) {
  await press(t.page, "Confirm deadlines");
  await t.page.getByRole("heading", { name: "Your study plans" }).waitFor();
  t.ok("deadlines confirmed, Check plans is open");
}

async function confirmPlans(t) {
  await press(t.page, "Confirm plans");
  await t.page.getByRole("heading", { name: "Take it with you" }).waitFor();
  t.ok("plans confirmed, Done is open");
}

async function connectMock(t) {
  const { page, instance } = t;
  await page.getByLabel("Course site").fill(instance.mockUrl);
  await page.getByLabel("Access token").fill(TOKEN);
  await press(page, "Connect");
  await page.getByRole("heading", { name: "Choose your courses" }).waitFor();
}

async function save(t, button, filename, keepAs = filename) {
  const [download] = await Promise.all([t.page.waitForEvent("download"), button.click()]);
  assert(download.suggestedFilename() === filename, `expected ${filename}, got ${download.suggestedFilename()}`);
  const path = join(t.dir, keepAs);
  await download.saveAs(path);
  t.ok(`downloaded ${filename} (kept as ${keepAs})`);
  return readFileSync(path, "utf8");
}

/** Shows the calendar file holds what the page says, with the right times. */
async function checkIcs(t, ics) {
  const line = await t.page.getByText(/The calendar file has \d+ events?/).innerText();
  const count = Number(line.match(/has (\d+) event/)[1]);
  const events = ics.match(/BEGIN:VEVENT/g) ?? [];
  // 14 rows on Oct 5, less the TBA lab reports (4) and "December" (1). Past rows were never confirmed.
  assert(ics.startsWith("BEGIN:VCALENDAR") && ics.trimEnd().endsWith("END:VCALENDAR"), "the file isn't a VCALENDAR");
  assert(ics.includes("BEGIN:VTIMEZONE") && ics.includes("TZID:America/Toronto"), "the file has no America/Toronto VTIMEZONE");
  assert(count === 9 && events.length === 9, `expected 9 events; the page says ${count} and the file has ${events.length}`);
  t.ok(`the file has ${count} VEVENTs, as the page says, with an America/Toronto VTIMEZONE`);
  assert(ics.includes("DTSTART;TZID=America/Toronto:20261027T090000"), "no event starts at CS 150's midterm, Oct 27 9:00");
  t.ok("CS 150 midterm is an event at Oct 27 9:00 Toronto time");
  assert(/Left out because they have no date yet:.*Final exams/.test(line), "the page doesn't list the undated rows it left out");
  t.ok("the page lists the undated rows it left out");
}

const journeys = {
  async upload(t) {
    const { page, instance } = t;
    await open(page, instance);
    await openFallback(page);

    await page.getByLabel("Upload files").setInputFiles([
      join(SYLLABUSES, "BIO110-syllabus.pdf"),
      join(SYLLABUSES, "src/CS150-syllabus.md"),
      join(SYLLABUSES, "CS150-syllabus.pdf"),
    ]);
    await page.getByRole("button", { name: "Remove BIO110-syllabus.pdf" }).waitFor();
    await page.getByRole("button", { name: "Remove CS150-syllabus.md" }).waitFor();
    t.ok("a PDF and a .md upload appear under Your syllabuses");

    await page.getByRole("button", { name: "Remove CS150-syllabus.pdf" }).click();
    await page.getByRole("button", { name: "Remove CS150-syllabus.pdf" }).waitFor({ state: "detached" });
    t.ok("Remove takes a syllabus off the list");

    await page.getByLabel("Upload files").setInputFiles({ name: "notes.docx", mimeType: "application/octet-stream", buffer: Buffer.from("not a syllabus") });
    await page.getByRole("alert").getByText("only PDF, .md and .txt files work here").waitFor();
    t.ok("a Word file is refused with a message");

    await page.getByLabel("Or paste a course outline").fill(readFileSync(join(SYLLABUSES, "src/HIS201-syllabus.md"), "utf8"));
    await press(page, "Add pasted text");
    await page.getByRole("button", { name: "Remove Pasted text 1" }).waitFor();
    t.ok("pasted text appears as Pasted text 1");

    await page.getByLabel("Today").fill(SAMPLE_TODAY);
    assert((await page.getByRole("button", { name: "Read with Claude instead" }).count()) === 0, "Read with Claude shows without a key");
    const llm = await page.request.post(`${instance.baseUrl}/api/extract-llm`, { data: { term: "Fall 2026", sources: [{ name: "a", text: "b" }] } });
    assert(llm.status() === 501, `/api/extract-llm gave ${llm.status()} without a key`);
    t.ok("without a key, Read with Claude is hidden and /api/extract-llm gives 501");
    await t.proof("sources");

    await readDeadlines(page);
    await checkAgainstExpected(t);
    await page.getByRole("heading", { name: "Please check" }).waitFor();
    t.ok("Please check lists what the syllabuses leave out");
    await t.proof("table-from-upload-and-paste");

    await t.freshProfile();
    await loadSamples(t);
    await readDeadlines(t.page);
    await checkAgainstExpected(t);
    await t.proof("table-from-samples");
  },

  async canvas(t) {
    const { page, instance } = t;
    await open(page, instance);
    await page.getByLabel("Today").fill(SAMPLE_TODAY);

    await page.getByLabel("Course site").fill(instance.mockUrl);
    await page.getByLabel("Access token").fill("wrong-token");
    await press(page, "Connect");
    // Not getByRole("alert") alone: Next's route announcer is an alert too, and is always there.
    const refusal = page.getByRole("alert").filter({ hasText: "The course site rejected this token" });
    await refusal.waitFor();
    assert((await page.getByRole("heading", { name: "Choose your courses" }).count()) === 0, "a wrong token still listed courses");
    t.ok(`a wrong token shows an error and no courses: "${(await refusal.innerText()).trim()}"`);
    await t.proof("wrong-token");

    await connectMock(t);
    const boxes = page.getByRole("checkbox", { name: /Course / });
    assert((await boxes.count()) === 3, `expected 3 courses, got ${await boxes.count()}`);
    t.ok("connecting lists all 3 mock courses");
    await t.proof("courses");

    for (const box of await boxes.all()) await box.check();
    await page.getByRole("button", { name: "Get deadlines from 3 courses" }).click();
    await page.getByRole("heading", { name: "Deadlines, Fall 2026" }).waitFor();
    await checkAgainstExpected(t);
    await t.proof("table-from-canvas");

    const stored = await page.evaluate(() => ({
      local: localStorage.getItem("semester-autopilot.v1") ?? "",
      session: sessionStorage.getItem("semester-autopilot.canvas-token"),
    }));
    assert(stored.session === TOKEN, "the token isn't in this tab's sessionStorage");
    assert(stored.local.includes(instance.mockUrl) && !stored.local.includes(TOKEN), "the saved app state holds the token, or isn't saved");
    t.ok("the token is in sessionStorage and not in the saved state");
    const appLog = readFileSync(join(OUT, "logs/app.log"), "utf8");
    assert(!appLog.includes(TOKEN) && !appLog.includes("wrong-token"), "the server log contains a token");
    t.ok("the server log has no token in it");

    await press(page, "Back");
    await press(page, "Forget token");
    assert((await page.getByLabel("Access token").inputValue()) === "", "Forget token left the field filled");
    assert((await page.evaluate(() => sessionStorage.getItem("semester-autopilot.canvas-token"))) === null, "Forget token left the token stored");
    t.ok("Forget token clears the field and sessionStorage");
  },

  async confirm(t) {
    const { page } = t;
    await loadSamples(t);
    await readDeadlines(page);
    await page.getByRole("button", { name: "Show 2 already past" }).waitFor();
    const before = (await tableRows(page)).length;
    await page.getByRole("button", { name: "Show 2 already past" }).click();
    await page.getByRole("button", { name: "Hide 2 already past" }).waitFor();
    assert((await tableRows(page)).length === before + 2, "Show already past didn't add 2 rows");
    await page.getByRole("button", { name: "Hide 2 already past" }).click();
    t.ok("past rows are hidden until asked for");

    const when = page.getByRole("textbox", { name: "When: BIO 110 Lab report 1" });
    await when.fill("someday soon");
    await when.press("Enter");
    await page.getByRole("alert").getByText("Fix the dates in red first.").waitFor();
    assert(await page.getByRole("button", { name: "Confirm deadlines" }).isDisabled(), "an unreadable date didn't block Confirm");
    t.ok("an unreadable date blocks Confirm deadlines");
    await t.proof("unreadable-date");

    await page.getByRole("textbox", { name: "When: BIO 110 Lab report 1" }).fill("oct 16 11:59pm");
    await page.getByRole("textbox", { name: "When: BIO 110 Lab report 1" }).press("Enter");
    assert((await page.getByRole("textbox", { name: "When: BIO 110 Lab report 1" }).inputValue()) === "Fri Oct 16, 23:59", "a loose date wasn't normalized");
    t.ok(`"oct 16 11:59pm" becomes "Fri Oct 16, 23:59"`);

    await page.getByRole("button", { name: "Skip BIO 110 Lab report 2" }).click();
    await page.getByText(/Skipping:.*BIO 110 Lab report 2/).waitFor();
    await page.getByRole("button", { name: "(restore)" }).click();
    await page.getByRole("button", { name: "Skip BIO 110 Lab report 2" }).waitFor();
    t.ok("Skip and restore work");

    await press(page, "Add a row");
    await page.getByRole("alert").getByText("New rows need a course and a name.").waitFor();
    await page.getByRole("textbox", { name: "What: BIO 110", exact: true }).fill("Extra credit quiz");
    await page.getByRole("textbox", { name: "What: BIO 110", exact: true }).press("Enter");
    await page.getByRole("textbox", { name: "What: BIO 110 Extra credit quiz" }).waitFor();
    t.ok("a new row needs a name before Confirm");
    await t.proof("edited-table");

    await page.reload();
    await page.getByRole("textbox", { name: "What: BIO 110 Extra credit quiz" }).waitFor();
    t.ok("edits survive a reload");

    await confirmDeadlines(t);
    await press(page, "Confirm plans");
    await page.getByRole("row", { name: /Fri Oct 16, 23:59 BIO 110 Lab report 1/ }).waitFor();
    await page.getByRole("row", { name: /BIO 110 Extra credit quiz/ }).waitFor();
    t.ok("the confirmed table on Done holds the edits");
    await t.proof("confirmed");
  },

  async plan(t) {
    const { page } = t;
    await loadSamples(t);
    await readDeadlines(page);
    await confirmDeadlines(t);

    const headings = await page.getByRole("heading", { level: 3 }).allInnerTexts();
    for (const course of ["BIO 110", "CS 150", "HIS 201"]) {
      assert(headings.some((h) => h.startsWith(course)), `no plan for ${course} in: ${headings.join(" / ")}`);
    }
    t.ok(`one plan per course: ${headings.filter((h) => /^(BIO|CS|HIS) /.test(h)).join(" / ")}`);
    await page.getByRole("heading", { name: "Your weekly schedule" }).waitFor();
    assert((await page.getByTestId("schedule-day").count()) > 0, "the weekly schedule has no days");
    t.ok("the weekly schedule is shown");
    await t.proof("plans");

    const hoursOnFirstDay = async () => Number((await page.getByTestId("schedule-day").first().locator("td").nth(-2).innerText()).replace("–", "0"));
    const before = await hoursOnFirstDay();
    const minutes = page.getByRole("spinbutton", { name: /^Minutes:/ }).first();
    await minutes.fill(String(Number(await minutes.inputValue()) + 60));
    await minutes.blur();
    await page.getByRole("spinbutton", { name: /^Minutes:/ }).first().waitFor();
    const after = await hoursOnFirstDay();
    assert(after === before + 1, `adding 60 minutes moved the first day's total from ${before} to ${after}`);
    t.ok(`adding 60 minutes to a block moves that day's schedule total from ${before} h to ${after} h`);

    await page.getByRole("button", { name: "Add a block" }).first().click();
    await page.getByRole("alert").getByText("Fill in or remove the empty blocks first.").waitFor();
    assert(await page.getByRole("button", { name: "Confirm plans" }).isDisabled(), "an empty block didn't block Confirm plans");
    t.ok("an empty block blocks Confirm plans");
    await page.getByRole("button", { name: /^Remove block on .*:$/ }).click();
    await page.getByText("Fill in or remove the empty blocks first.").waitFor({ state: "detached" });

    await page.getByRole("spinbutton", { name: "Most study hours a day" }).fill("3");
    await page.getByRole("spinbutton", { name: "Most study hours a day" }).blur();
    assert(t.dialogs.some((d) => d.includes("Rebuild your plans?")), "rebuilding over an edit didn't warn");
    t.ok("rebuilding over an edit warns first");
    await page.getByRole("spinbutton", { name: "Most study hours a day" }).waitFor();
    const totals = await page.getByTestId("schedule-day").evaluateAll((rows) => rows.map((r) => r.querySelectorAll("td")[r.querySelectorAll("td").length - 2].textContent));
    const most = Math.max(...totals.map((v) => Number(v.replace("–", "0"))));
    assert(most <= 3, `a day has ${most} h with a 3 h maximum`);
    t.ok(`a 3 h daily maximum holds on every day (most is ${most} h)`);
    await t.proof("rebuilt-at-3h");

    await page.getByRole("checkbox", { name: "Sat" }).check();
    await page.getByRole("checkbox", { name: "Sat" }).waitFor();
    const saturdays = page.getByTestId("schedule-day").filter({ hasText: /^Sat / });
    assert((await saturdays.count()) > 0, "the schedule has no Saturdays to check");
    const satTotals = await saturdays.evaluateAll((rows) => rows.map((r) => r.querySelectorAll("td")[r.querySelectorAll("td").length - 2].textContent));
    assert(satTotals.every((v) => v === "–"), `a day off has study hours: ${satTotals.join(", ")}`);
    t.ok(`Saturday as a day off leaves all ${satTotals.length} Saturdays empty`);

    await confirmPlans(t);
    const plan = await save(t, page.getByRole("button", { name: "Download BIO 110 plan" }), "BIO110-midterm-study-plan.md");
    assert(plan.startsWith("# BIO 110") && /Midterm/.test(plan.split("\n")[0]) && /\[ \] /.test(plan), "the plan file isn't a BIO 110 midterm checklist");
    t.ok("the plan file is a BIO 110 midterm checklist");
    const weekly = await save(t, page.getByRole("button", { name: "Download weekly-schedule.md" }), "weekly-schedule.md");
    assert(/BIO 110/.test(weekly) && /CS 150/.test(weekly), "the schedule file doesn't name the courses");
    t.ok("the schedule file names the courses");
    await t.proof("done-with-plans");
  },

  async coach(t) {
    const { page, instance } = t;
    await loadSamples(t);
    await readDeadlines(page);
    await confirmDeadlines(t);
    await confirmPlans(t);
    await press(page, "What's today?");
    await page.getByRole("heading", { name: "Today, Mon Oct 5" }).waitFor();
    const blocks = page.getByTestId("coach-block");
    await blocks.first().waitFor();
    t.ok(`Today, Mon Oct 5 lists ${await page.getByRole("button", { name: "Study", exact: true }).count()} blocks`);
    await t.proof("today");

    const week = page.getByTestId("week-count");
    const weekBefore = await week.innerText();
    await page.getByRole("button", { name: /^Done: / }).first().click();
    await page.locator('[data-testid="coach-block"][data-status="done"]').first().waitFor();
    assert((await week.innerText()) !== weekBefore, "marking a block done didn't change the week's count");
    t.ok(`marking a block done moves the week from "${weekBefore}" to "${await week.innerText()}"`);

    await page.getByRole("button", { name: "Study", exact: true }).last().click();
    await page.getByRole("heading", { name: /^Quiz, question 1 of \d+/ }).waitFor();
    assert((await page.getByRole("button", { name: "Get questions from Claude" }).count()) === 0, "Get questions from Claude shows without a key");
    const llm = await page.request.post(`${instance.baseUrl}/api/coach-quiz`, { data: {} });
    assert(llm.status() === 501, `/api/coach-quiz gave ${llm.status()} without a key`);
    t.ok("without a key, the quiz is built in, the Claude button is hidden and /api/coach-quiz gives 501");
    await t.proof("quiz-question");

    const score = page.getByTestId("quiz-score");
    let answered = 0;
    while (!(await score.isVisible())) {
      const question = page.getByTestId("quiz-question");
      await question.waitFor();
      if ((await question.getAttribute("data-kind")) === "choice") {
        await question.getByRole("button").first().click();
        await page.getByRole("status").waitFor();
        await press(page, "Next");
      } else {
        await page.getByLabel("Your answer").fill("What I remember from my notes");
        await press(page, "Show the answer");
        await page.getByRole("status").waitFor();
        await press(page, "Got it");
      }
      answered += 1;
      await Promise.race([score.waitFor(), page.getByRole("heading", { name: `Quiz, question ${answered + 1} of` }).waitFor()]);
    }
    t.ok(`answered ${answered} questions: "${await score.innerText()}"`);
    await t.proof("quiz-score");

    await press(page, "Mark block done");
    await page.getByRole("heading", { name: "How it's sticking" }).waitFor();
    const doneNow = await page.locator('[data-testid="coach-block"][data-status="done"]').count();
    assert(doneNow >= 2, `expected the studied block to be done too, found ${doneNow}`);
    const stages = await page.getByTestId("coach-plan").getByRole("listitem").allInnerTexts();
    assert(stages.some((s) => /: (learning|reviewing)$/.test(s)), `no topic moved past new: ${stages.join(", ")}`);
    t.ok(`a right recall moves a topic on: ${stages.filter((s) => !s.endsWith(": new")).join(", ")}`);

    const weekAfter = await week.innerText();
    await page.reload();
    await page.getByRole("heading", { name: "Today, Mon Oct 5" }).waitFor();
    assert((await page.getByTestId("week-count").innerText()) === weekAfter, "the week's count changed after a reload");
    t.ok("a reload reopens Coach with the same progress");
    await t.proof("after-reload");
  },

  async ics(t) {
    const { page } = t;
    await loadSamples(t);
    await readDeadlines(page);
    await confirmDeadlines(t);
    await confirmPlans(t);
    const ics = await save(t, page.getByRole("button", { name: "Download .ics" }), "deadlines.ics");
    await checkIcs(t, ics);
    const md = await save(t, page.getByRole("button", { name: "Download deadlines.md" }), "deadlines.md");
    assert(md.startsWith("# Deadlines, Fall 2026") && md.includes("| Tue Oct 27, 9:00 | CS 150 | Midterm"), "deadlines.md is missing the CS 150 midterm");
    t.ok("deadlines.md has the CS 150 midterm row");
    await press(page, "Copy as markdown");
    await page.getByRole("status").getByText("Copied as markdown.").waitFor();
    assert((await page.evaluate(() => navigator.clipboard.readText())) === md, "the clipboard doesn't match deadlines.md");
    t.ok("Copy as markdown puts the same text on the clipboard");
    await t.proof("done");

    await t.freshProfile();
    await open(t.page, t.instance);
    await t.page.getByLabel("Today").fill(SAMPLE_TODAY);
    await connectMock(t);
    for (const box of await t.page.getByRole("checkbox", { name: /Course / }).all()) await box.check();
    await t.page.getByRole("button", { name: "Get deadlines from 3 courses" }).click();
    await t.page.getByRole("heading", { name: "Deadlines, Fall 2026" }).waitFor();
    await confirmDeadlines(t);
    await confirmPlans(t);
    const fromCanvas = await save(t, t.page.getByRole("button", { name: "Download .ics" }), "deadlines.ics", "deadlines-from-canvas.ics");
    await checkIcs(t, fromCanvas);
    await t.proof("done-from-canvas");
  },
};

async function launchBrowser() {
  const path = process.env.CHROME_PATH;
  return chromium.launch(path ? { executablePath: path } : { channel: "chrome" });
}

async function runJourney(name, browser, instance) {
  const dir = join(OUT, "verify", name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const log = join(dir, "journey.log");
  const say = (line) => {
    console.log(line);
    appendFileSync(log, `${line}\n`);
  };

  let shot = 0;
  let context;
  const errors = [];
  const t = {
    instance,
    dir,
    page: null,
    dialogs: [],
    ok: (message) => say(`ok   ${name}: ${message}`),
    async freshProfile() {
      await context?.close();
      context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
      context.setDefaultTimeout(15_000);
      t.page = await context.newPage();
      t.page.on("pageerror", (error) => errors.push(error.message));
      t.page.on("dialog", (dialog) => {
        t.dialogs.push(dialog.message());
        void dialog.accept();
      });
    },
    async proof(label) {
      shot += 1;
      const stem = join(dir, `${String(shot).padStart(2, "0")}-${label}`);
      await t.page.screenshot({ path: `${stem}.png`, fullPage: true });
      writeFileSync(`${stem}.aria.txt`, await t.page.locator("body").ariaSnapshot());
    },
  };

  await t.freshProfile();
  try {
    await journeys[name](t);
    assert(errors.length === 0, `the page threw: ${errors.join("; ")}`);
    say(`PASS ${name}: evidence in ${dir}`);
    return true;
  } catch (error) {
    await t.proof("failure").catch(() => {});
    say(`FAIL ${name}: ${error instanceof Error ? error.message : error}`);
    return false;
  } finally {
    await context.close();
  }
}

const asked = process.argv[2] === "all" ? Object.keys(journeys) : process.argv.slice(2);
if (!asked.length || asked.some((name) => !journeys[name])) {
  console.error(`Usage: drive.mjs ${Object.keys(journeys).join(" | ")} | all`);
  process.exit(2);
}
if (!existsSync(RUN_FILE)) {
  console.error("Nothing is running. Run control.mjs launch, then control.mjs doctor.");
  process.exit(1);
}
const instance = JSON.parse(readFileSync(RUN_FILE, "utf8"));
const browser = await launchBrowser();
let passed = true;
for (const name of asked) passed = (await runJourney(name, browser, instance)) && passed;
await browser.close();
process.exit(passed ? 0 : 1);

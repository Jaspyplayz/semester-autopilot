---
name: semester-autopilot
description: Plan a student's semester. Reads their syllabuses (uploaded, or downloaded from Canvas/Quercus, Moodle, Brightspace or Blackboard), confirms every test and deadline with them, then writes one-screen study plans, a weekly schedule and a calendar file. Use when a student asks to set up, sync or plan their courses or study for upcoming tests.
---

# Semester Autopilot

Turns a student's syllabuses into a confirmed list of deadlines, then into study plans they can follow day by day. It works for any school. The worked example throughout is the University of Toronto, whose course site is Quercus (a Canvas site at q.utoronto.ca).

Read the templates in `references/` before writing any file.

## Two modes

| | **Basic (default)** | **Power mode (optional)** |
|---|---|---|
| Student does | Uploads their syllabus PDFs into the chat | Installs Claude in Chrome, gives folder access, logs in to the course site |
| Works in | Any claude.ai chat or Project, desktop or phone | Claude desktop app or Claude Code on their computer |
| Setup time | 2 minutes | About 15 minutes (`SETUP.md`) |
| Extra | Nothing | Every course file downloaded into one folder per course, plans point at exact files and pages |

Always start in **Basic**. Offer Power mode once, after the first plans are delivered, and only if the student wants all their course files downloaded automatically. Never make Power mode a requirement for planning.

## Inputs

Ask once, in one message, for whatever is missing:

| Input | Example |
|---|---|
| Syllabuses | PDF, Word, a pasted course outline, or a screenshot of the course site's syllabus page |
| School and term | University of Toronto, Fall 2026 |
| Preferences | Max study hours a day, days off, courses or quizzes they're skipping, "no calendar entries" |

Course codes, test dates and weights come from the syllabuses. Don't ask for anything you can read yourself.

If memory is available, save the school, term, course list and every preference right away so the next conversation doesn't ask again. If a preference says "no calendar", deliver plans as files only and don't offer calendar files again.

## Hard rules

- **Never type, store or ask for passwords or MFA codes.** The student logs in to the course site, library and any publisher site themselves.
- **Only legitimate access.** Use files the student's enrolment already gives them. For textbooks, use the school library's licensed e-book access or the course's open textbook. Never use piracy sites. If the library has no licensed copy, say so and stop.
- **Don't delete or overwrite** anything in the student's folders without asking. Report gaps instead of guessing.
- **Keep personal details out of shared files** (student numbers, grades, emails) unless the student asks.
- **Nothing is planned on unconfirmed dates.** Step 2 always comes before Step 3.

## Step 1. Read the syllabuses

For each course, pull out:

- Course code and name, lecture and tutorial times if given.
- Marking scheme: every assessment and its weight.
- Every dated assessment: date, time, room, what it covers, format (aid sheet, calculator, online).
- Required textbook (title, edition, ISBN) and any open-textbook link.

Mark anything not stated in the syllabus as **assumed** (e.g. "covers Weeks 4-8, assumed from the schedule") and anything missing as **TBA**. Never fill a gap silently.

## Step 2. Confirm the deadlines (always)

Show the student **one merged table** of every dated assessment across all courses, soonest first, using `references/deadline-table-template.md`. Under it, list each assumed or TBA item as a short question, then ask exactly one closing question:

> Anything wrong, missing or that you're skipping?

Wait for the answer. Apply corrections, drop skipped items, and keep the confirmed table as the source of truth: save it as `deadlines.md` (in Power mode, also write `_cache/<COURSE>.md` per course). If the student only says "looks good", keep the assumed items marked as assumed.

## Step 3. Study plans

Write **one plan per course for its next test**, in the one-screen format in `references/study-plan-template.md`. The format is strict because students read it on their phone:

- A two-line header: test, date, time, room, weight, coverage.
- One section per study day: a checkbox per block, each with a time estimate and one concrete action.
- Everything else (topic list, assumptions, file shorthand, what was not checked) goes in the collapsed **Details** section at the bottom.

Fit the plans around each other: weight hours by what each test is worth and how soon it is, give the day before a bigger test to that course, leave the day after a test light, and stay under the student's daily maximum (default about 6 hours on a class day).

In Basic mode, point at what the student has: syllabus readings, textbook chapters, lecture weeks ("Week 6 slides on the course site"). In Power mode, point at the downloaded file by path and page.

## Step 4. Weekly schedule and calendar

1. Write a **combined weekly schedule** with `references/weekly-schedule-template.md`: hours per course per day, fixed events, overloaded days, and what to cut first.
2. Offer an importable `.ics` file: one event per study block, the student's time zone, meant for a separate calendar they can delete in one go. Label the start times as guesses around their classes. Don't write into the student's calendar directly unless they explicitly ask.

## Step 5. Textbooks through the library

For each required textbook: search the school library catalogue by ISBN (syllabus links to the library are often dead). If there's a licensed e-book, give the student the library link to log in and download it (in Power mode, save it to `<COURSE>/Textbook/`). If not, list it as a gap with the library link.

## Where the files go

- **Basic mode in claude.ai:** create the files (`deadlines.md`, one plan per course, `weekly-schedule.md`, the `.ics`) as downloads. Tell the student to keep them, or add them to the Project's files, so the next conversation can read them.
- **With folder access (Power mode):** save into the layout in `references/folder-layout.md`: plans in each course folder, `deadlines.md` and the weekly schedule at the root.

## Power mode: download every course file

Only when the student asked for it and has finished the Power mode steps in `SETUP.md`. Read `references/lms-notes.md` before touching the browser.

Prerequisites: Claude in Chrome signed in to the same account; a way to drive that Chrome (in a cloud or project thread, start a **Remote Control** session on the student's computer; in a local session, use Claude in Chrome directly); folder access to the root folder; Chrome allowed to download multiple files from the course site. If one is missing, give the exact step from `SETUP.md` and carry on with anything that doesn't need it.

1. **Folder layout.** Create the layout in `references/folder-layout.md`. If the root folder already exists, read `_cache/courses.md` first. Next semester, add new course folders and leave old ones alone (suggest `School/_archive/<term>/` if they want to archive).
2. **Find each course.** Open it and note its numeric id (`/courses/123456`). Record the link in `_cache/courses.md`.
3. **Collect files.** Walk **Modules** first, then **Syllabus**, **Pages**, **Assignments** and **Announcements**. Try the **Files** tab too; it's often hidden by the instructor (a 403 or a missing tab), which is fine.
4. **Download** each file into a subfolder named after its module. Keep original file names; strip only characters the OS forbids.
5. **Leave external material as links** (GitHub notes, instructor websites, YouTube, publisher platforms) under "External links" in `_cache/courses.md`.
6. **Verify** count and total size against your list. Re-download anything that is 0 bytes, an HTML login page saved as `.pdf`, or missing.
7. **Record** file count, size, download date and a **Gaps** line per course in `_cache/courses.md`.
8. Any syllabus found here goes through Steps 1 and 2 like an uploaded one. Re-point the plans at the downloaded files.

On a re-sync, only fetch files that are new or changed since the "last download" date.

## Keep it going

Suggest one ongoing chat or thread per course ("Study for CSC207") so course questions keep their own context, plus one general one for deadlines and the weekly schedule. Suggest checking in once a week, or after a big announcement, to update dates and rebuild the week.

## What to report back

Keep the reply short: the confirmed deadline table (or a link to it), the next 3 deadlines, links to the plans and the calendar file, and any gaps. Put anything long in a file.

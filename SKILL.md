---
name: semester-autopilot
description: Set up a student's semester. Downloads course files from their LMS (Canvas/Quercus, Moodle, Brightspace, Blackboard) into one folder per course, pulls test dates from syllabuses, writes study plans and a weekly schedule. Use when a student asks to set up, sync or plan their courses.
---

# Semester Autopilot

Turns a student's course site into an organized folder on their computer, then into study plans they can follow. It works for any school and any learning management system (LMS). The worked example throughout is the University of Toronto, whose LMS is Quercus (a Canvas site at q.utoronto.ca).

Read `references/lms-notes.md` before touching the browser, and the templates in `references/` before writing any file.

## Inputs to collect first

Ask once, in one message, for whatever is missing. Don't ask for anything you can read off the LMS yourself.

| Input | Example |
|---|---|
| School and LMS URL | University of Toronto, https://q.utoronto.ca |
| Term | Fall 2026 |
| Course codes | CSC207, STA237, MAT235, PHL245 |
| Root folder on their computer | `C:\Users\<name>\School` or `~/School` |
| Preferences | e.g. "no calendar entries", max study hours a day, courses or quizzes they're skipping |

Save the answers (and every preference) to project memory or a notes file right away, so next session doesn't ask again. If a preference says "no Google Calendar entries", deliver plans as files only and don't offer calendar events again.

## Hard rules

- **Never type, store or ask for passwords or MFA codes.** The student logs in to the LMS, library and any publisher site themselves. Wait for them to say they're in.
- **Only legitimate access.** Get files the student's enrolment already gives them. For textbooks, use the school library's licensed e-book access (SpringerLink, Wiley, O'Reilly, ProQuest Ebook Central, etc.) or the course's open textbook. Never use piracy sites, and if the library has no licensed copy, say so and stop.
- **Don't delete or overwrite** anything in the student's folders without asking. Report gaps instead of guessing.
- **Keep personal details out of shared files** (student numbers, grades, emails) unless the student asks.

## Step 1. Check the prerequisites

See `SETUP.md` for the student-facing version. You need:

1. The **Claude in Chrome** extension installed and signed in to the same Claude account.
2. A way to drive that Chrome. In a cloud or project thread, driving Chrome directly often fails; start a **Remote Control** Claude Code session on the student's computer and do the browser work through it. In a local Claude Code or desktop session, use Claude in Chrome directly.
3. **Folder access** to the root folder (connected folder, or the local session's working directory).
4. Chrome allowed to download multiple files from the LMS site (Chrome asks "This site is trying to download multiple files" the first time; the student clicks Allow, or adds the site under Settings > Privacy and security > Site settings > Automatic downloads).

If one is missing, tell the student the exact step from `SETUP.md` and carry on with anything that doesn't need it.

## Step 2. Create the folder layout

Create this under the root folder (templates in `references/folder-layout.md`):

```
School/
  README.md               explains the layout, for the student
  _cache/
    courses.md            one row per course: code, name, LMS link, file count, size, last download
    <COURSE>.md           marking scheme and dated deadlines from the syllabus
  <COURSE CODE>/          one folder per course, e.g. "CSC 207"
    (mirrors the LMS module structure)
```

If the root folder already exists, read `_cache/courses.md` first. Next semester, add new course folders and leave old ones alone unless the student asks to archive them (suggest `School/_archive/<term>/`).

## Step 3. Download every linked course file

For each course, in the LMS:

1. Open the course and find its numeric id in the URL (`/courses/123456`). Record the link in `_cache/courses.md`.
2. Walk **Modules** first, then **Syllabus**, **Pages**, **Assignments** and **Announcements** for linked files. Try the **Files** tab too; it's often hidden by the instructor (a 403 or a missing tab), which is fine.
3. Download each file into a subfolder named after its module. Keep the original file names; strip only characters the OS forbids.
4. Externally hosted material (GitHub notes, instructor websites, YouTube, publisher platforms) is **left as links**: add them to the course row under "External links" rather than scraping.
5. **Verify**: compare the count and total size on disk with the list you collected. Re-download anything that is 0 bytes, an HTML login page saved as `.pdf`, or missing.
6. Update `_cache/courses.md`: file count, size, date of download, and a **Gaps** line (hidden Files tab, external links, anything that failed).

On a re-sync, only fetch files that are new or changed since the "last download" date.

## Step 4. Deadlines, then study plans

1. From each syllabus and the LMS calendar/assignments page, write `_cache/<COURSE>.md`: the marking scheme and every dated test, quiz and assignment, with time, room and what it covers. Mark anything inferred (e.g. "coverage assumed Weeks 4-8") as **assumed**.
2. Show the student the merged list of upcoming deadlines (next 2-4 weeks) and ask which ones they're skipping or worried about.
3. Write **one study plan per course** for its next test, using `references/study-plan-template.md`. Fit them around each other: weight hours by what each test is worth and how soon it is, stop studying a course the day before another, bigger test, and leave the day after a test light. Point at the actual downloaded files by path and page.
4. Write a **combined weekly schedule** with `references/weekly-schedule-template.md`: hours per course per day, fixed events, overloaded days, and what to cut first.
5. Save plans to the course folder (and the project's shared files, if there is one). Don't write events into the student's calendar unless they explicitly ask. If they want the plan in a calendar, offer an importable `.ics` file (one event per study block, their time zone, meant for a separate calendar they can delete in one go) and label the start times as guesses around their fixed classes.

## Step 5. Textbooks through the library

For each required textbook in a syllabus: search the school library catalogue by ISBN (syllabus links to the library are often dead). If there's a licensed e-book, have the student log in through the library, download the PDF or chapters into `<COURSE>/Textbook/`, and note the edition and source in `_cache/courses.md`. If not, list it under Gaps with the library link.

## Step 6. Suggest how to keep working

Suggest one ongoing thread or conversation per course ("Study for CSC207"), so course questions keep their own context, plus one general thread for syncing and the weekly schedule. Recommend a re-sync once a week or after a big announcement.

## What to report back

Keep the reply short: courses set up, files downloaded (count and size), gaps, the next 3 deadlines, and links to the plans. Put anything long in a file.

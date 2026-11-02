# semester-autopilot

A Claude skill that sets up a student's semester. It downloads course files from the school's course site into one folder per course, pulls test dates from the syllabuses, and writes a study plan for each course plus a combined weekly schedule. It also finds textbooks through the school library and suggests one ongoing thread per course.

It works with any school and any course site (Canvas, Moodle, Brightspace, Blackboard). The worked example is the University of Toronto's Quercus.

## Install
1. Download this repository as a zip (Code > Download ZIP), or zip the folder that holds `SKILL.md`.
2. In claude.ai, open Settings, find the Skills section (under Capabilities) and upload the zip.
3. Follow [SETUP.md](SETUP.md) (about 15 minutes): Claude in Chrome, automatic downloads, a School folder and Remote Control.

Then tell Claude: "Set up my courses. School: ... Course site: ... Courses: ... Folder: ..."

## What's here
- `SKILL.md`: the instructions Claude follows.
- `SETUP.md`: setup steps for students.
- `references/`: notes for each course site, plus templates for the folder layout, study plans and the weekly schedule.

## Safety
Claude never asks for or types your password. You log in to your course site and library yourself. Textbooks come only from your library's licensed access or official open textbooks. Nothing in your folders is deleted or overwritten without your OK.

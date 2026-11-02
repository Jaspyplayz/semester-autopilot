# Sample school: Maple Hollow University

A made-up school with three made-up courses, so you can try Semester Autopilot in about 2 minutes without your own syllabuses. Nothing here is real: the school, instructors and rooms are invented.

## Try it
1. Add the skill (see [SETUP.md](../../SETUP.md), Basic).
2. Open a new chat and attach the three PDFs in [`syllabuses/`](syllabuses/).
3. Paste this:

   > Set up my semester. I'm at Maple Hollow University, Fall 2026. Pretend today is Monday, October 5, 2026. Max 3 hours of study a day.

4. Claude shows one deadline table and asks about the things the syllabuses leave out (the HIS 201 midterm's coverage and room, and which weeks the BIO 110 lab reports are due). Answer, for example:

   > HIS coverage, not sure, keep it assumed. Lab reports are due Oct 16, Oct 30, Nov 13 and Nov 27.

5. Claude writes a study plan per course, a weekly schedule and a calendar file.

## What you should get
- [`expected-output/deadlines.md`](expected-output/deadlines.md): the confirmed deadline table.
- [`expected-output/BIO110-midterm-study-plan.md`](expected-output/BIO110-midterm-study-plan.md): a one-screen plan for the first big test.

Your results will differ in the details. The shape should match: one table to confirm first, then short day-by-day checklists.

## Files
- `syllabuses/*.pdf`: what you upload.
- `syllabuses/src/*.md`: the same syllabuses as text, if you want to edit them.

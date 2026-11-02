# Study plan template (one screen)

Students read these on their phone. The visible part is only the header, the day-by-day checklist, and one "short on time" line. Everything else goes in the collapsed **Details** section.

## Rules
- **Header:** two lines. Line 1: course, test, date, time, room. Line 2: weight, coverage, days and total hours.
- **Days:** one `##` per study day, titled `<Day Mon D> · <hours> h`. Skip days with no study for this course.
- **Blocks:** a checkbox each, at most 3 per day, in this shape: `- [ ] <time> · <one action>`. One action means one thing to read, watch or do, with where to find it.
- **Where to find it:** Power mode gives a path and pages (`` `Week 6/Lecture 11.pdf` p. 4-20 ``). Basic mode gives what the student has ("Textbook ch. 7.2", "Week 6 slides on the course site").
- **Last study day:** a timed mock test plus redoing mistakes.
- **Test day:** what to bring, light review only.
- **Short on time:** one line. What to keep, what to cut first.
- **Long plans:** if the test is more than 10 study days away, show only the next 7 days in full and summarize the rest in one line per week inside Details.
- Hours are estimates. Say so once, in Details.

## Template

```markdown
# <COURSE> · <Test> · <Day Mon D>, <time>, <room>
<weight>% · <coverage> · <n> study days, about <h> h

## <Day Mon D> · <h> h
- [ ] <time> · <action, with where to find it>
- [ ] <time> · <action>

## <Day Mon D> · <h> h
- [ ] <time> · <action>

## <Day before the test> · <h> h · mock test
- [ ] <time> · Timed mock: <past test or practice set>
- [ ] <time> · Redo every mistake, then reread <weakest topic>

## Test day
- [ ] Bring <student card, calculator, aid sheet if allowed>

**Short on time?** Keep <highest-value topics> and the mock. Cut <lowest-value> first.

<details>
<summary>Details: topics, assumptions, sources</summary>

**Topics covered:** <list, with the weight of each if known>

**Assumed:** <coverage, format, aid sheet: anything not stated by the instructor>

**Sources:** <file shorthand, e.g. "the guide" = Practice Guide.pdf; textbook edition>

**Clashes:** <other tests or due dates that week and how this plan avoids them>

**Not checked:** <material not downloaded, links not opened>

Hours are estimates. Times are suggestions around your classes.
</details>
```

Viewers that don't support `<details>` show the section expanded at the bottom, which is fine.

## Fitting several courses together
- Weight daily hours by test weight and how soon it is.
- The day before a bigger test belongs to that course.
- Courses with a test 1+ weeks away get "attend lecture, skim notes" until the closer tests are done.
- Cap total study at the student's stated maximum (default about 6 h on a class day).

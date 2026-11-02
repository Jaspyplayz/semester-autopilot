# Folder templates

## School/README.md

```markdown
# School

One folder per course. Files are downloaded from <LMS name> (<LMS URL>) and organized by module.

- `_cache/courses.md`: every course with its link, file count and last download date. Check "Gaps" for anything that wasn't downloaded.
- `_cache/<COURSE>.md`: marking scheme and deadlines for that course.
- Study plans are saved in each course folder as `<test>-study-plan.md`.

To refresh, ask Claude to "re-sync my courses". Only new or changed files are downloaded.
```

## School/_cache/courses.md

```markdown
# Courses, <Term>

| Course | Name | LMS link | Files | Size | Last download |
|---|---|---|---|---|---|
| CSC 207 | Software Design | https://q.utoronto.ca/courses/<id> | 120 | 210 MB | 2026-11-02 |

## Gaps
- CSC 207: Files tab hidden; course notes on GitHub left as a link: <url>
- MAT 235: instructor slides on an external site, left as links.

## External links
- <COURSE>: <title> <url>

## Textbooks
- <COURSE>: <title>, <edition>, ISBN <isbn>. Source: <library platform>. Saved to `<COURSE>/Textbook/`.
```

## School/_cache/<COURSE>.md

```markdown
# <COURSE> deadlines and marking

| Item | Weight | Date and time | Where | Covers |
|---|---|---|---|---|
| Term Test 2 | 20% | Fri Nov 27, 6:10-7:40 pm | TBA | Ch 14.1-14.8 (assumed) |

Source: syllabus (<file name>), LMS calendar. "Assumed" = not stated by the instructor.
```

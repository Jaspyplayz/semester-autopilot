# LMS notes

New LMS parsers (D2L, Moodle) are added one at a time, each with a fixture in `examples/`, and must pass `npm run check-fixtures`.

## Canvas (Quercus at U of T, and most Canvas schools)
- Course URL: `https://<host>/courses/<id>`. Tabs: Home, Announcements, Modules, Syllabus, Assignments, Quizzes, Files, Grades.
- Modules list every linked file; a file link looks like `/courses/<id>/files/<file_id>`. Add `/download?download_frd=1` to download it directly.
- The Files tab is commonly hidden. A 403 there is normal; Modules still work.
- The Canvas REST API (`/api/v1/courses/<id>/modules?include[]=items&per_page=100`) works from the logged-in browser tab and is the fastest way to list files. Don't ask for or create API tokens.
- The calendar (`/calendar`) and "Assignments" pages give due dates; syllabus PDFs give test dates and rooms.
- U of T specifics: login is UTORid + Duo MFA (the student does this). Library: LibrarySearch at library.utoronto.ca, licensed e-books open after UTORid login.

## Moodle
- Course URL `/course/view.php?id=<id>`. Files are "Resource" and "Folder" activities; folders have a "Download folder" button that gives a zip.
- Deadlines: the Calendar and "Timeline" block.

## Brightspace / D2L
- Course URL `/d2l/home/<id>`. Content > Table of Contents has "Download" for whole modules (zip).
- Deadlines: Calendar and the "Work To Do" widget.

## Blackboard (Learn / Ultra)
- Course Content lists items; attachments download one at a time.
- Deadlines: Calendar and "Due Dates".

## Common problems
- **"Multiple downloads blocked"**: Chrome setting, see SETUP.md.
- **Downloaded PDF is tiny HTML**: the session expired. Ask the student to log in again, then retry.
- **Driving Chrome from a cloud thread fails**: use a Remote Control session on the student's computer.
- **Video lectures**: collect links (YouTube, institution media server) into `<COURSE>/video-links.md`; don't download videos unless the student asks.

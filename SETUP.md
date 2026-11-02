# Setup: Semester Autopilot skill

This skill lets Claude download your course files from your school's course site, organize them into one folder per course, and write study plans around your test dates. Setup takes about 15 minutes, once per computer.

## What you need
- A Claude account on a plan that includes Claude Code and Claude in Chrome.
- Google Chrome on your computer.
- The Claude desktop app (for Remote Control and folder access), or Claude Code installed on your computer.

## 1. Add the skill
1. Go to claude.ai > **Settings** > **Capabilities** (Skills section). Make sure Skills are turned on.
2. Click **Upload skill** and choose `semester-autopilot.zip`. Don't unzip it first.
3. It now appears in your skills list. Claude uses it when you ask things like "set up my courses for this semester".

## 2. Install Claude in Chrome
1. Install the **Claude** extension from the Chrome Web Store.
2. Click the extension icon and sign in with the **same** Claude account.

## 3. Let Chrome download many files at once
In Chrome: **Settings > Privacy and security > Site settings > Additional permissions > Automatic downloads**. Under "Allowed to automatically download multiple files", add your course site (for example `https://q.utoronto.ca`). Or just click **Allow** the first time Chrome asks.

## 4. Make a School folder and give Claude access
1. Create a folder, e.g. `C:\Users\<you>\School` (Windows) or `~/School` (Mac).
2. When Claude asks for access to it, approve it. That's the only folder it needs.

## 5. Let Claude use your computer's browser
If you're working in a claude.ai project or cloud session, Claude can't always drive Chrome from the cloud. When it asks to start a **Remote Control** session on your computer, approve it. That session uses your Chrome with your logins.

## 6. Start
Tell Claude: *"Set up my courses. School: <your school>. Course site: <URL>. Courses: <codes>. Folder: <path>."* Add any preferences, e.g. "don't put anything in my Google Calendar" or "I'm skipping Quiz 5".

**When Claude opens your course site or library, log in yourself** (including two-factor). Claude never asks for or types your password.

## Next semester
Say *"New semester: <term>, courses <codes>"*. Claude adds new course folders next to the old ones and won't delete anything unless you ask.

## What Claude won't do
- Type or store passwords.
- Download textbooks from anywhere except your school library or an official open textbook.
- Delete or overwrite your files without asking.

# Setup: Semester Autopilot skill

Semester Autopilot reads your syllabuses, checks every test date with you, and writes a short study plan for each course plus a weekly schedule and a calendar file.

There are two ways to use it. Start with **Basic**. You can add Power mode later.

| | Basic | Power mode |
|---|---|---|
| Setup | 2 minutes | About 15 minutes, once per computer |
| You do | Upload your syllabuses | Install a Chrome extension, pick a folder, log in to your course site |
| You get | Deadlines, study plans, weekly schedule, calendar file | All of that, plus every course file downloaded into one folder per course |

---

## Basic (2 minutes)

### 1. Add the skill
1. Download `semester-autopilot.zip` (or download this repository with **Code > Download ZIP**).
2. Go to claude.ai > **Settings** > **Capabilities**. Turn on **Code execution and file creation** and **Skills** if they're off.
3. In the Skills section, click **Upload skill** and choose the zip. Don't unzip it first.

### 2. Start
1. Open a new chat (or a Project called "School", so later chats can see your plans).
2. Attach your syllabus PDFs. A screenshot or pasted course outline works too.
3. Say: *"Set up my semester. I'm at <school>, term <term>."* Add any preferences, for example "max 4 hours a day", "no studying Saturdays", or "I'm skipping Quiz 5".

Claude shows you one table of every test and deadline. **Check it before saying yes.** It marks anything it had to guess as "assumed". After you confirm, it writes the plans.

Want to see it first? Try the [sample school](examples/sample-university/README.md).

---

## Power mode (about 15 minutes)

Power mode downloads every file from your course site into a folder on your computer, so your plans can point at exact slides and pages.

### What you need
- A Claude plan that includes Claude Code and Claude in Chrome.
- Google Chrome.
- The Claude desktop app, or Claude Code installed on your computer.

### 1. Install Claude in Chrome
1. Install the **Claude** extension from the Chrome Web Store.
2. Click the extension icon and sign in with the **same** Claude account.

### 2. Let Chrome download many files at once
In Chrome: **Settings > Privacy and security > Site settings > Additional permissions > Automatic downloads**. Under "Allowed to automatically download multiple files", add your course site (for example `https://q.utoronto.ca`). Or click **Allow** the first time Chrome asks.

### 3. Make a School folder and give Claude access
1. Create a folder, e.g. `C:\Users\<you>\School` (Windows) or `~/School` (Mac).
2. When Claude asks for access to it, approve it. That's the only folder it needs.

### 4. Let Claude use your computer's browser
If you're working in a claude.ai Project or a cloud session, Claude can't always drive Chrome from the cloud. When it asks to start a **Remote Control** session on your computer, approve it. That session uses your Chrome with your logins.

### 5. Start
Say: *"Download my course files. Course site: <URL>. Folder: <path>."*

**When Claude opens your course site or library, log in yourself** (including two-factor). Claude never asks for or types your password.

---

## Next semester
Say *"New semester: <term>"* and attach the new syllabuses. In Power mode, Claude adds new course folders next to the old ones and won't delete anything unless you ask.

## What Claude won't do
- Type or store passwords.
- Download textbooks from anywhere except your school library or an official open textbook.
- Delete or overwrite your files without asking.
- Plan around dates you haven't confirmed.

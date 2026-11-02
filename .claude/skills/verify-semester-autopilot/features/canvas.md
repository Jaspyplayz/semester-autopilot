# Connect Canvas

A student pastes a Canvas or Quercus access token, picks their courses, and gets every syllabus read into one deadline table, while the token stays in that tab.

## Sub-features

- `canvas-refuse` shows the course site's refusal of a bad token, and lists no courses.
- `canvas-list` follows pagination to list every course.
- `canvas-import` reads the picked courses' syllabus files into the table.
- `canvas-token-storage` keeps the token in `sessionStorage`, out of the saved state and the server log.
- `canvas-forget` clears the token.
- `canvas-security` refuses other sites, stops the token at redirects and rejects odd course ids. `prove` covers this one.

## How to get to it (user POV)

- Open `/`. The **Connect Quercus or Canvas** card is at the top. Fill **Course site** and **Access token**, click **Connect**, tick courses, then click **Get deadlines from N courses**.

## Driving it with drive.mjs

Preconditions:

- The baseline in the [README](./README.md), with mock Canvas up at the `mockUrl` in `app/.e2e-out/run.json`. Doctor checks this.

Run `.claude/skills/verify-semester-autopilot/scripts/drive.mjs canvas`. Evidence is in `app/.e2e-out/verify/canvas/`.

- **Bad token.** Fills the labels `Course site` and `Access token` with `wrong-token`, and clicks `Connect`. An alert says `The course site rejected this token`, and no `Choose your courses` heading appears.
- **Connect.** Fills `mock-token-not-a-secret` and clicks `Connect`. The heading `Choose your courses` appears with 3 checkboxes.
- **Import.** Ticks all three and clicks `Get deadlines from 3 courses`. The heading `Deadlines, Fall 2026` appears, and the table matches `expected-output/deadlines.md`, with lab reports `TBA`.
- **Token storage.** Reads the browser's storage. `semester-autopilot.canvas-token` in `sessionStorage` holds the token. `semester-autopilot.v1` in `localStorage` holds the course site and not the token. `app/.e2e-out/logs/app.log` holds neither token.
- **Forget.** Clicks `Back`, then `Forget token`. The field is empty and the `sessionStorage` entry is gone.

For the security rules and the API path, run `.claude/skills/verify-semester-autopilot/scripts/control.mjs prove`. The `ok` lines are in `app/.e2e-out/logs/prove.log`.

## Gotchas

- **This is a mock.** The Canvas path has never run against a live course (`app/README.md`). A pass here doesn't prove real Quercus works. Report it that way.
- **The private-hosts flag.** Without `CANVAS_ALLOW_PRIVATE_HOSTS=1` the app refuses `http://` and local addresses. `launch` sets it. It's ignored on Vercel, and must never be set on a public deployment.
- **`prove` uses its own mocks.** It starts them on random ports and ignores the one on 4110, so it can't tell you the browser path works, and it doesn't need that mock.
- **Your own PDFs.** `npm run mock-canvas -- ../some/folder` (in `app/`) makes one course per subfolder, or per PDF if flat. The default port is 4010, or set `PORT`. The comparison to `expected-output` only holds for the samples.
- **Not driven:** notes for files the app can't read (Word, scans), courses with no syllabus, and home-page discovery in the UI. `prove` covers home-page discovery through the API, and `src/lib/canvas.test.ts` covers the rest of the logic.

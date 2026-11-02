# Coach and study mode

After confirming plans, a student sees what's on today, marks work done, studies a block with a short quiz, and watches each topic move from new to secure. All of it works without an API key, and survives a reload.

## Sub-features

- `coach-today` lists today's blocks.
- `coach-mark` marks a block done, and moves the week's count.
- `coach-quiz` runs a built-in quiz through to a score.
- `coach-progress` moves a topic on after correct recall.
- `coach-persist` reopens in Coach with the same progress.
- `coach-keyless` shows no Claude button without a key.

## How to get to it (user POV)

- Click **What's today?** on the Done step, under **Ready to study?**.
- Reopen the site after using Coach once. It opens there.

## Driving it with drive.mjs

Preconditions:

- The baseline in the [README](./README.md). The journey gets there by loading samples and confirming deadlines and plans.

Run `.claude/skills/verify-semester-autopilot/scripts/drive.mjs coach`. Evidence is in `app/.e2e-out/verify/coach/`.

- **Today.** Clicks `What's today?`. The heading `Today, Mon Oct 5` appears with `data-testid="coach-block"` items.
- **Mark done.** Clicks the first button named `Done: ...`. That block gets `data-status="done"`, and `data-testid="week-count"` changes.
- **Open a quiz.** Clicks the last `Study`. The heading `Quiz, question 1 of N` appears. No button is named `Get questions from Claude`, and `POST /api/coach-quiz` gives 501.
- **Answer.** For each `data-testid="quiz-question"`, checks `data-kind`. Free recall fills `Your answer`, then clicks `Show the answer` and `Got it`. Multiple choice clicks the first option, then `Next`. `data-testid="quiz-score"` ends up reading `You got X of N.`
- **Progress.** Clicks `Mark block done`. Two blocks are now done, and `data-testid="coach-plan"` has a topic reading `learning` or `reviewing`.
- **Reload.** Reloads the page. The heading `Today, Mon Oct 5` is back and the week's count hasn't changed.

## Gotchas

- **Built-in questions can't check answers.** Marking is on trust, as the app says. `Got it` proves the flow, not what the student knows.
- **The score isn't fixed.** The first multiple-choice option can be wrong, so X varies with the questions. Assert on progress, not on X.
- **Needs a key, so not driven:** `Get questions from Claude`, which needs `ANTHROPIC_API_KEY`. The keyless path is the built-in quiz, and this journey proves it. Report Claude's questions as not verified.
- **Not driven:** `Speak` and `Read it to me`, which need the browser's speech features and hide without them. `Back for review`, which needs a later day. Today can only be changed on the first step, so reaching it means going back through the steps. `src/lib/coach.test.ts` covers that logic.

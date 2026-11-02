# Agent failures

A running log of mistakes agents repeat, and how one becomes an enforcer.

Log a mistake when an agent makes it. If the same mistake shows up a second time, it must be promoted to an enforcer. A rule an agent can ignore isn't an enforcer.

Use the first of these that fits:

1. **Code or structure** that makes the mistake impossible.
2. **A type.**
3. **An ESLint rule** in [`app/eslint.config.mjs`](../app/eslint.config.mjs).
4. **A test** with vitest, in [`app/`](../app/).
5. **A CI check** in [`ci.yml`](../.github/workflows/ci.yml).
6. **Prose** in [`CLAUDE.md`](../CLAUDE.md) or a skill, only as a last resort.

## How to promote

1. Write the failing check first. Show it fails on the bad pattern.
2. Add the enforcer. Show it passes.
3. Open a PR. It goes through the [build-review loop](claude-build-review-loop.md) and needs [Jasper's Yes](merge-safety.md) like any other.
4. Link the PR in the log entry, and mark the entry Promoted.

## Log

Add a row for a new mistake. For a repeat, raise the count on its row and add where you saw it. Only log what you can cite, with a PR or commit.

Status is `Logged` or `Promoted → [enforcer](link)`.

| Date | What happened | Where seen | Count | Status |
|---|---|---|---|---|
| 2026-11-02 | A branch changed a function's arguments while `main` added a call using the old ones. Coach made `add()` take three args, and PR #7 added a two-arg call. Each passed alone, but together they failed typecheck (TS2554). CI caught it before merge. | [PR #8](https://github.com/Jaspyplayz/semester-autopilot/pull/8): [`e1c77d0`](https://github.com/Jaspyplayz/semester-autopilot/commit/e1c77d0) failed [CI](https://github.com/Jaspyplayz/semester-autopilot/actions/runs/41507746295), fixed in [`64860b9`](https://github.com/Jaspyplayz/semester-autopilot/commit/64860b9) | 1 | Logged |

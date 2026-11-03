# Claude Code build-review loop

How every change to this repo gets built and reviewed. Claude Code does the building and reviewing. The Grok Bot crew only parks Cloud Agents and watches CI.

## The loop

1. **Build.** One Claude Code session implements the spec on a branch and opens a PR using the [PR template](../.github/pull_request_template.md), with its [artifacts](#artifacts-before-a-yes) filled in.
2. **Review.** Three separate Claude Code sessions review that PR's latest commit, in parallel:
   - **Spec:** does the change match the brief?
   - **Tests:** are the checks and commands adequate for what changed?
   - **Break-it:** try to break it adversarially.
3. **Verdict.** Each reviewer returns PASS or FAIL, plus any concrete blockers. A FAIL can be a [stop](#stop-the-line-verdicts). Reviewers are read-only: the session running the loop posts what they return on the PR.
4. **All PASS, no blockers, no open stop, artifacts present:** the PR is ready for Jasper's Yes. Don't merge without it, and never apply `jasper-yes` yourself ([merge safety](merge-safety.md)).
5. **Any FAIL, and no stop:** the builder fixes the blockers, then all three reviewers run again.
6. **Two rounds max.** After two full build-then-review rounds without all PASS, park the PR and escalate to Jasper.

## Stop-the-line verdicts

Any stage can stop the line: build, each of the three reviews, and the verdict. A stop is a good outcome. It keeps bad work from flowing on.

Valid stops include:

- **Not a bug.** The behavior is correct.
- **Can't repro.** You can't make the problem happen.
- **Too risky.** The change could do more harm than it fixes.
- **Spec unclear.** You'd have to guess what the brief means.

To stop, return the outcome and the reason. The session running the loop posts it on the PR, or tells Jasper directly if there's no PR.

A reviewer's stop is a FAIL with the stop as its reason. A stop outranks every other verdict in its round:

- The builder pushes nothing, even for other reviewers' blockers.
- The PR isn't ready.
- Jasper decides what happens next.

A stopped round doesn't count toward the two-round max. The stop stays until Jasper clears it. Fresh reviews on a new commit don't erase it.

Catch defects at the cheapest stage. A stop before any code is cheaper than a FAIL in review, and a FAIL in review is cheaper than a bad merge.

## Artifacts before a Yes

"Done" means the PR shows its proof. Before a PR is ready for Jasper's Yes, it needs both:

- **A failing→passing check.** A test or check that fails without the change and passes with it. A docs-only PR names the doc's own check instead, or says `n/a: docs-only` with the reason.
- **A proof artifact.** Output or images from the PR's latest commit, linked or pasted in the PR. For example: `npm run prove` output from [`prove-e2e.ts`](../app/scripts/prove-e2e.ts), screenshots, or test output. `npm run prove` runs from `app/` against a built, running server (see [`app/README.md`](../app/README.md)).

Missing either means not ready, and reviewers FAIL it.

Docs-only means the PR changes only prose docs. The exemption covers the check, not the artifact. Edits to `CLAUDE.md`, `docs/merge-safety.md` or this doc are gate changes: they can't use the exemption unless the PR says plainly that it's changing the gate and using it.

Artifacts don't replace the Yes. A ready PR still waits for Jasper.

## Rules

- A new commit needs new reviews. A PASS only counts for the commit it reviewed.
- Green CI isn't a reviewer PASS. You need both.
- A `fix:` PR that adds no test fails CI ([`fix-needs-test.yml`](../.github/workflows/fix-needs-test.yml)). No label skips this, because an agent could apply it itself.

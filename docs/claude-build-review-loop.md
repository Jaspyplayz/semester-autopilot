# Claude Code build-review loop

How every change to this repo gets built and reviewed. Claude Code does the building and reviewing. The Grok Bot crew only parks Cloud Agents and watches CI.

## The loop

1. **Build.** One Claude Code session implements the spec on a branch and opens a PR using the [PR template](../.github/pull_request_template.md), with its [artifacts](#artifacts-before-a-yes) filled in.
2. **Review.** Three separate Claude Code sessions review that PR's latest commit, in parallel:
   - **Spec:** does the change match the brief?
   - **Tests:** are the checks and commands adequate for what changed?
   - **Break-it:** try to break it adversarially.
3. **Verdict.** Each reviewer returns PASS or FAIL, plus any concrete blockers. A FAIL can be a [stop](#stop-the-line-verdicts).
4. **All PASS, no blockers, artifacts present:** the PR is ready for Jasper's Yes. Don't merge without it, and never apply `jasper-yes` yourself ([merge safety](merge-safety.md)).
5. **Any FAIL that isn't a stop:** the builder fixes the blockers, then all three reviewers run again.
6. **Two rounds max.** After two full build-then-review rounds without all PASS, park the PR and escalate to Jasper.

## Stop-the-line verdicts

Any stage can stop the line: build, each of the three reviews, and the verdict. A stop is a good outcome. It keeps bad work from flowing on.

Valid stops include:

- **Not a bug.** The behavior is correct.
- **Can't repro.** You can't make the problem happen.
- **Too risky.** The change could do more harm than it fixes.
- **Spec unclear.** You'd have to guess what the brief means.

To stop, post the outcome and the reason, on the PR if there is one. Don't push more work. Jasper decides what happens next.

A reviewer's stop is a FAIL with the stop as its reason. The builder doesn't try to fix it, and it doesn't use up a round.

Catch defects at the cheapest stage. A stop before any code is cheaper than a FAIL in review, and a FAIL in review is cheaper than a bad merge.

## Artifacts before a Yes

"Done" means the PR shows its proof. Before a PR is ready for Jasper's Yes, it needs both:

- **A failing→passing check.** A test or check that fails without the change and passes with it. A docs-only PR names the doc's own check instead, or says `n/a: docs-only` with the reason.
- **A proof artifact.** Output or images from the PR's latest commit, linked or pasted in the PR. For example: `npm run prove` output from [`prove-e2e.ts`](../app/scripts/prove-e2e.ts), screenshots, or test output.

No artifact means not ready, and reviewers FAIL it.

Artifacts don't replace the Yes. A ready PR still waits for Jasper.

## Rules

- A new commit needs new reviews. A PASS only counts for the commit it reviewed.
- Green CI isn't a reviewer PASS. You need both.

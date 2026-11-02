# Claude Code build-review loop

How every change to this repo gets built and reviewed. Claude Code does the building and reviewing. The Grok Bot crew only parks Cloud Agents and watches CI.

## The loop

1. **Build.** One Claude Code session implements the spec on a branch and opens a PR.
2. **Review.** Three separate Claude Code sessions review that PR's latest commit, in parallel:
   - **Spec:** does the change match the brief?
   - **Tests:** are the checks and commands adequate for what changed?
   - **Break-it:** try to break it adversarially.
3. **Verdict.** Each reviewer returns PASS or FAIL, plus any concrete blockers.
4. **All PASS, no blockers:** the PR is ready for Jasper's Yes. Don't merge without it, and never apply `jasper-yes` yourself ([merge safety](merge-safety.md)).
5. **Any FAIL:** the builder fixes the blockers, then all three reviewers run again.
6. **Two rounds max.** After two full build-then-review rounds without all PASS, park the PR and escalate to Jasper.

## Rules

- A new commit needs new reviews. A PASS only counts for the commit it reviewed.
- Green CI isn't a reviewer PASS. You need both.

# Merge safety

Every PR into `main` merges only when both of these are true for its latest commit:

- **`app` is green.** CI ran lint, typecheck, tests and build ([`ci.yml`](../.github/workflows/ci.yml)).
- **Jasper said Yes.** Jasper applied the `jasper-yes` label ([`jasper-yes.yml`](../.github/workflows/jasper-yes.yml)).

Branch protection enforces this, and GitHub auto-merge does the merge. No agent, schedule or widget is involved, so there's nothing to keep alive.

There are no risk tiers. Every PR needs a Yes, because an agent judging its own PR as low risk is the failure we're avoiding.

## How to merge

Read the PR, then apply `jasper-yes` from the GitHub site, the app, or:

```bash
gh pr edit <number> --add-label jasper-yes
```

That's it. The PR merges once CI is green, whether that's already true or takes a few more minutes. To take the Yes back before then, remove the label.

## How this differs from Turnpoint Agent-merge

| Turnpoint Agent-merge problem | Here |
|---|---|
| A Vercel 402 or a cancelled schedule run leaves a ready PR stranded | Merging doesn't depend on Vercel or a schedule. Vercel isn't a required check, so a failed deploy can't hold a PR. `next build` runs in CI instead. |
| Auto-merge depends on fragile Agent schedule widgets | GitHub holds the merge request and acts when checks finish. Nothing polls and nothing retries. |
| Risky PRs merge silently without Jasper's Yes | No PR merges without a Yes on its latest commit. |

## What it refuses

| Situation | What happens | How to continue |
|---|---|---|
| CI cancelled, failed, or never reported | Blocked: only a green `app` counts | Re-run or fix CI |
| Commit pushed after the Yes | The label comes off, and the new commit has no Yes | Review it and apply the label again |
| Label applied by anyone but the repo owner | The label comes off | Jasper applies it |
| `gh pr merge` or `--admin` with no Yes | GitHub refuses | Apply the label |
| `jasper-yes` status posted by hand | Doesn't count: it must come from GitHub Actions | Apply the label |
| The base branch doesn't require both checks | The gate refuses instead of merging at once, and its run goes red | Run the setup below |
| Yes applied, and the gate's run itself fails | No merge, and the run goes red | Remove the label and apply it again |

Two choices keep these failures from stranding a PR:

- **CI has no path filters or job-level `if`.** A filtered workflow never reports, which blocks docs PRs forever. A skipped job counts as passing.
- **PRs don't have to be up to date with `main`.** Otherwise each merge would stall every other approved PR until someone updated it.

## Known gaps

- **An agent on Jasper's account can say Yes.** GitHub sees Jasper either way, so nothing here stops an agent from applying the label. [`CLAUDE.md`](../CLAUDE.md) tells agents not to, but that's a rule, not a lock. Giving agents their own GitHub account with write access (not admin) would close this: the owner check would then reject their labels.
- **An admin can turn this off.** Anyone holding Jasper's admin token can remove the branch protection.
- **CI doesn't re-run on `main` after these merges.** GitHub doesn't start workflows from merges made with the Actions token. Since PRs needn't be up to date, two PRs that each pass alone could still break `main` together. The next PR's CI will catch that.

Required reviews stay off: GitHub doesn't let you approve your own PR, and agents open PRs from Jasper's account, so every PR would be stuck.

## Setup (once, after this is on `main`)

Do this in order. The gate only runs from `main`, so protecting `main` first would block the PR that adds it.

```bash
REPO=Jaspyplayz/semester-autopilot

gh label create jasper-yes --repo "$REPO" --color 0E8A16 --force \
  --description "Jasper's Yes for the labeled commit: merges once required checks are green"

gh api -X PATCH "repos/$REPO" -F allow_auto_merge=true --silent

# 15368 is GitHub Actions: only it can satisfy these checks.
gh api -X PUT "repos/$REPO/branches/main/protection" --silent --input - <<'JSON'
{
  "required_status_checks": {
    "strict": false,
    "checks": [
      { "context": "app", "app_id": 15368 },
      { "context": "jasper-yes", "app_id": 15368 }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

This also blocks direct pushes to `main`, including yours. To undo it: `gh api -X DELETE "repos/$REPO/branches/main/protection"`.

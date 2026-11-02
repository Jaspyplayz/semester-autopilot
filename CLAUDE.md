# Agents working in this repo

Merging needs Jasper's Yes. See [docs/merge-safety.md](docs/merge-safety.md).

Build and review every change with [docs/claude-build-review-loop.md](docs/claude-build-review-loop.md).
Repeated agent mistakes get logged and promoted to a lint rule, type, or test: see [docs/agent-failures.md](docs/agent-failures.md).

Agents often run on Jasper's GitHub account, so GitHub can't tell you apart. These rules are the only thing that stops you:

- Never apply the `jasper-yes` label, or post a `jasper-yes` status.
- Never merge a PR yourself unless Jasper says Yes in this conversation for that PR.
- Never change branch protection or repo merge settings without Jasper's Yes.

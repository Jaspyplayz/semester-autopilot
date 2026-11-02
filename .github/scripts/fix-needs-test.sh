#!/usr/bin/env bash
# Fails a conventional `fix:` PR that adds or modifies no test file.
# Usage: PR_TITLE=<title> fix-needs-test.sh < changed-file-names
#
# The title and file names are untrusted: only match them, never print or eval
# them. Printing one could smuggle a workflow command into the log.
set -euo pipefail

fix_title='^fix(\(.+\))?!?:'
shopt -s nocasematch
if ! [[ "${PR_TITLE?}" =~ $fix_title ]]; then
  echo "Not a fix: PR, so no test is needed."
  exit 0
fi
shopt -u nocasematch

while IFS= read -r file || [ -n "$file" ]; do
  case "$file" in
    *.test.ts | *.test.tsx | tests/* | */tests/*)
      echo "This fix: PR adds or modifies a test file."
      exit 0
      ;;
  esac
done

echo "::error::A fix: PR must add or modify a test (*.test.ts, *.test.tsx, or a file under tests/). Add one that fails without the fix."
exit 1

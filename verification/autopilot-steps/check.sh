#!/usr/bin/env bash
# Checks the step-flow model. It reads only the model, never the app. Fails if a
# rule that held breaks, if a known bug stops breaking in the model (retire it,
# as with `knownBug` in the app), or if a broken copy of the model gets past its
# rule.
set -euo pipefail

TLA2TOOLS_VERSION=1.7.4
TLA2TOOLS_SHA256=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88

HOLDS=(ScreensHaveData CoachOnlyOnConfirmedPlans NoBlanksPastPlans PlansMatchDeadlines ConfirmedPlansExist)
KNOWN_BUGS=(BadTimeZoneStaysOnInput LateReadKeepsWork StartOverStaysCleared)
# rule | tag of the line to change in AutopilotSteps.tla | what that line becomes
MUTANTS=(
  'ScreensHaveData|backToTableNeedsDraft|'
  'ScreensHaveData|reviveFallsBackToInput|    ELSE "done"'
  'CoachOnlyOnConfirmedPlans|rebuildLeavesCoach|    /\ step'"'"' = "coach"'
  'NoBlanksPastPlans|confirmPlansNeedsNoBlanks|'
  'PlansMatchDeadlines|confirmDraftRebuilds|       ELSE Rebuild("A")'
  'ConfirmedPlansExist|startDraftClearsConfirmedOn|    /\ plansOk'"'"' = plansOk'
)

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
java=${JAVA:-java}

jar=${TLA2TOOLS:-}
if [ -z "$jar" ]; then
  jar=$work/tla2tools.jar
  curl -fsSL -o "$jar" "https://github.com/tlaplus/tlaplus/releases/download/v$TLA2TOOLS_VERSION/tla2tools.jar"
fi
echo "$TLA2TOOLS_SHA256  $jar" | sha256sum -c --quiet -

# tlc SPEC_FILE RULE: runs TLC on one rule, leaving its output in $work/out.
tlc() {
  local run
  run=$(mktemp -d -p "$work")
  cp "$1" "$run/AutopilotSteps.tla"
  cat >"$run/one.cfg" <<CFG
SPECIFICATION Spec
CONSTANTS
    Rows = {"A", "B"}
    Reads = {"claude", "canvas"}
INVARIANT $2
CFG
  (cd "$run" && "$java" -XX:+UseParallelGC -cp "$jar" tlc2.TLC -config one.cfg -workers 1 AutopilotSteps) >"$work/out" 2>&1 || true
}

failed=0
fail() {
  echo "FAIL  $1"
  failed=1
}

spec=$here/AutopilotSteps.tla

for rule in "${HOLDS[@]}"; do
  tlc "$spec" "$rule"
  if grep -q "Model checking completed. No error has been found." "$work/out"; then
    echo "holds      $rule: $(grep -E '[0-9]+ states generated, [0-9]+ distinct states found' "$work/out" | tail -1 | sed 's/, 0 states left.*//')"
  else
    cat "$work/out"
    fail "$rule should hold"
  fi
done

for rule in "${KNOWN_BUGS[@]}"; do
  tlc "$spec" "$rule"
  if grep -q "Invariant $rule is violated" "$work/out"; then
    echo "known bug  $rule still breaks"
  else
    cat "$work/out"
    fail "$rule no longer breaks in the model. If the app is fixed too, move it to HOLDS and turn its knownBug test into it"
  fi
done

for mutant in "${MUTANTS[@]}"; do
  IFS='|' read -r rule tag line <<<"$mutant"
  grep -q "@$tag\$" "$spec" || fail "no line tagged @$tag"
  LINE=$line TAG=$tag awk 'index($0, "@" ENVIRON["TAG"]) { if (ENVIRON["LINE"] != "") print ENVIRON["LINE"]; next } { print }' "$spec" >"$work/mutant.tla"
  tlc "$work/mutant.tla" "$rule"
  if grep -q "Invariant $rule is violated" "$work/out"; then
    echo "caught     $rule catches a broken $tag"
  else
    cat "$work/out"
    fail "$rule missed a broken $tag"
  fi
done

exit "$failed"

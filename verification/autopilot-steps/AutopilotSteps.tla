---------------------------- MODULE AutopilotSteps ----------------------------
\* The app's step flow: app/src/lib/state.ts, the store (store.ts), and the
\* buttons in app/src/components. See README.md for what's left out.

CONSTANTS
    Rows,   \* Stand-ins for different sets of deadlines.
    Reads   \* Reads that can be in flight: "claude" (readWithClaude), "canvas" (importChosen).

None == "none"

VARIABLES
    step,        \* AppState.step
    tzOk,        \* isValidTimeZone(AppState.timezone)
    hasSources,  \* AppState.sources is not empty
    draft,       \* AppState.draft: which rows, or None
    confirmed,   \* AppState.confirmed: which rows, or None
    plans,       \* AppState.plans.basis: which rows, or None
    edited,      \* AppState.plans.edited
    blank,       \* blankBlocks(plans) > 0
    plansOk,     \* AppState.plans.confirmedOn is set
    claudeBusy,  \* InputStep's local busy. It's lost when InputStep unmounts.
    inFlight,    \* Reads started and not landed. They outlive InputStep, and die on reload.
    workSince,   \* Per read: has the student done work since it started?
    orphaned,    \* Reads still in flight when the student pressed Start over.
    lostWork,    \* A read landed on top of work done since it started.
    resurrected  \* A read from before Start over landed after it.

vars == <<step, tzOk, hasSources, draft, confirmed, plans, edited, blank, plansOk,
          claudeBusy, inFlight, workSince, orphaned, lostWork, resurrected>>

Steps == {"input", "confirm", "plans", "done", "coach"}

Init ==
    /\ step = "input"
    /\ tzOk = TRUE
    /\ hasSources = FALSE
    /\ draft = None
    /\ confirmed = None
    /\ plans = None
    /\ edited = FALSE
    /\ blank = FALSE
    /\ plansOk = FALSE
    /\ claudeBusy = FALSE
    /\ inFlight = {}
    /\ workSince = [r \in Reads |-> FALSE]
    /\ orphaned = {}
    /\ lostWork = FALSE
    /\ resurrected = FALSE

\* ---- Pieces of state.ts ----

\* startDraft(). Moving to confirm also unmounts InputStep, so its busy is lost.
StartDraft(rows) ==
    /\ step' = "confirm"
    /\ draft' = rows
    /\ confirmed' = None
    /\ plans' = None
    /\ edited' = FALSE
    /\ blank' = FALSE
    /\ plansOk' = FALSE   \* @startDraftClearsConfirmedOn
    /\ claudeBusy' = FALSE

\* rebuildPlans(): a fresh, unedited, unconfirmed plan.
Rebuild(rows) ==
    /\ plans' = rows
    /\ edited' = FALSE
    /\ blank' = FALSE
    /\ plansOk' = FALSE

\* The student did work, so every read in flight would now overwrite it.
DidWork == workSince' = [r \in Reads |-> r \in inFlight]

Flight == <<claudeBusy, inFlight, workSince, orphaned>>
Ghosts == <<lostWork, resurrected>>
PlanVars == <<plans, edited, blank, plansOk>>

\* ---- InputStep and CanvasConnect ----

ChangeSources ==
    /\ step = "input"
    /\ hasSources' = ~hasSources
    /\ UNCHANGED <<step, tzOk, draft, confirmed, PlanVars, Flight, Ghosts>>

\* The time zone field is only on the input step.
ChangeTimeZone ==
    /\ step = "input"
    /\ tzOk' = ~tzOk
    /\ UNCHANGED <<step, hasSources, draft, confirmed, PlanVars, Flight, Ghosts>>

\* canRead: sources, a valid time zone, and not busy.
CanRead ==
    /\ hasSources
    /\ tzOk
    /\ ~claudeBusy

ReadDeadlines ==
    /\ step = "input"
    /\ CanRead
    /\ \E rows \in Rows : StartDraft(rows)
    /\ UNCHANGED <<tzOk, hasSources, inFlight, workSince, orphaned, Ghosts>>

ReadWithClaude ==
    /\ step = "input"
    /\ "claude" \in Reads
    /\ "claude" \notin inFlight
    /\ CanRead
    /\ claudeBusy' = TRUE
    /\ inFlight' = inFlight \cup {"claude"}
    /\ UNCHANGED <<step, tzOk, hasSources, draft, confirmed, PlanVars, workSince, orphaned, Ghosts>>

\* Import selected courses: disabled only while CanvasConnect is busy. It doesn't check canRead.
ImportFromCanvas ==
    /\ step = "input"
    /\ "canvas" \in Reads
    /\ "canvas" \notin inFlight
    /\ inFlight' = inFlight \cup {"canvas"}
    /\ UNCHANGED <<step, tzOk, hasSources, draft, confirmed, PlanVars, claudeBusy, workSince, orphaned, Ghosts>>

\* "Back to your table" is disabled by a bad time zone, but not by a read in flight.
BackToTable ==
    /\ step = "input"
    /\ draft # None   \* @backToTableNeedsDraft
    /\ tzOk
    /\ step' = "confirm"
    /\ claudeBusy' = FALSE
    /\ UNCHANGED <<tzOk, hasSources, draft, confirmed, PlanVars, inFlight, workSince, orphaned, Ghosts>>

\* A read lands whatever the student is doing now: nothing checks the step.
ReadLands ==
    \E r \in inFlight, rows \in Rows :
        /\ StartDraft(rows)
        /\ hasSources' = (hasSources \/ r = "canvas")
        /\ inFlight' = inFlight \ {r}
        /\ orphaned' = orphaned \ {r}
        /\ workSince' = [workSince EXCEPT ![r] = FALSE]
        /\ lostWork' = (lostWork \/ (workSince[r] /\ r \notin orphaned))
        /\ resurrected' = (resurrected \/ r \in orphaned)
        /\ UNCHANGED tzOk

\* A read fails or comes back empty. Nothing in AppState changes.
ReadFails ==
    \E r \in inFlight :
        /\ inFlight' = inFlight \ {r}
        /\ orphaned' = orphaned \ {r}
        /\ workSince' = [workSince EXCEPT ![r] = FALSE]
        /\ claudeBusy' = (claudeBusy /\ r # "claude")
        /\ UNCHANGED <<step, tzOk, hasSources, draft, confirmed, PlanVars, Ghosts>>

\* ---- ConfirmStep ----

EditTable ==
    /\ step = "confirm"
    /\ \E rows \in Rows : draft' = rows
    /\ DidWork
    /\ UNCHANGED <<step, tzOk, hasSources, confirmed, PlanVars, claudeBusy, inFlight, orphaned, Ghosts>>

\* confirmDraft(). When this replaces edited plans the student is asked first
\* (wouldLosePlanEdits). Saying no changes nothing, so it isn't a step here.
ConfirmDeadlines ==
    /\ step = "confirm"
    /\ step' = "plans"
    /\ confirmed' = draft
    /\ IF plans = draft
       THEN /\ plansOk' = FALSE
            /\ UNCHANGED <<plans, edited, blank>>
       ELSE Rebuild(draft)   \* @confirmDraftRebuilds
    /\ DidWork
    /\ UNCHANGED <<tzOk, hasSources, draft, claudeBusy, inFlight, orphaned, Ghosts>>

BackToInput ==
    /\ step = "confirm"
    /\ step' = "input"
    /\ UNCHANGED <<tzOk, hasSources, draft, confirmed, PlanVars, Flight, Ghosts>>

\* ---- PlanStep ----

\* changePlans() leaves confirmedOn alone, so editing confirmed plans keeps them confirmed.
EditPlans ==
    /\ step = "plans"
    /\ edited' = TRUE
    /\ blank' \in BOOLEAN
    /\ DidWork
    /\ UNCHANGED <<step, tzOk, hasSources, draft, confirmed, plans, plansOk, claudeBusy, inFlight, orphaned, Ghosts>>

RebuildOnPlans ==
    /\ step = "plans"
    /\ Rebuild(confirmed)
    /\ DidWork
    /\ UNCHANGED <<step, tzOk, hasSources, draft, confirmed, claudeBusy, inFlight, orphaned, Ghosts>>

\* confirmPlans(). The button is disabled while a block is blank.
ConfirmPlans ==
    /\ step = "plans"
    /\ ~blank   \* @confirmPlansNeedsNoBlanks
    /\ step' = "done"
    /\ plansOk' = TRUE
    /\ DidWork
    /\ UNCHANGED <<tzOk, hasSources, draft, confirmed, plans, edited, blank, claudeBusy, inFlight, orphaned, Ghosts>>

BackToDeadlines ==
    /\ step = "plans"
    /\ step' = "confirm"
    /\ UNCHANGED <<tzOk, hasSources, draft, confirmed, PlanVars, Flight, Ghosts>>

\* ---- DoneStep ----

\* openCoach().
OpenCoach ==
    /\ step = "done"
    /\ plansOk
    /\ step' = "coach"
    /\ UNCHANGED <<tzOk, hasSources, draft, confirmed, PlanVars, Flight, Ghosts>>

EditPlansFromDone ==
    /\ step = "done"
    /\ step' = "plans"
    /\ IF plans = None THEN Rebuild(confirmed) ELSE UNCHANGED PlanVars
    /\ UNCHANGED <<tzOk, hasSources, draft, confirmed, Flight, Ghosts>>

EditDeadlinesFromDone ==
    /\ step = "done"
    /\ step' = "confirm"
    /\ UNCHANGED <<tzOk, hasSources, draft, confirmed, PlanVars, Flight, Ghosts>>

\* resetAll(): back to defaultState(). Reads in flight aren't cancelled.
StartOver ==
    /\ step = "done"
    /\ step' = "input"
    /\ tzOk' = TRUE
    /\ hasSources' = FALSE
    /\ draft' = None
    /\ confirmed' = None
    /\ plans' = None
    /\ edited' = FALSE
    /\ blank' = FALSE
    /\ plansOk' = FALSE
    /\ orphaned' = inFlight
    /\ workSince' = [r \in Reads |-> FALSE]
    /\ UNCHANGED <<claudeBusy, inFlight, Ghosts>>

\* ---- CoachStep ----

RebuildFromCoach ==
    /\ step = "coach"
    /\ step' = "plans"   \* @rebuildLeavesCoach
    /\ Rebuild(confirmed)
    /\ DidWork
    /\ UNCHANGED <<tzOk, hasSources, draft, confirmed, claudeBusy, inFlight, orphaned, Ghosts>>

EditPlansFromCoach ==
    /\ step = "coach"
    /\ step' = "plans"
    /\ UNCHANGED <<tzOk, hasSources, draft, confirmed, PlanVars, Flight, Ghosts>>

LeaveCoach ==
    /\ step = "coach"
    /\ step' = "done"
    /\ UNCHANGED <<tzOk, hasSources, draft, confirmed, PlanVars, Flight, Ghosts>>

\* ---- store.ts: reloading the page ----

\* reviveState(). What's in localStorage survives. Reads in flight don't.
Revived ==
    IF tzOk /\ step = "confirm" /\ draft # None THEN "confirm"
    ELSE IF tzOk /\ step = "plans" /\ plans # None /\ confirmed # None THEN "plans"
    ELSE IF tzOk /\ step = "coach" /\ plansOk /\ confirmed # None THEN "coach"
    ELSE IF tzOk /\ step \in {"done", "coach"} /\ confirmed # None THEN "done"
    ELSE "input"   \* @reviveFallsBackToInput

Reload ==
    /\ step' = Revived
    /\ claudeBusy' = FALSE
    /\ inFlight' = {}
    /\ orphaned' = {}
    /\ workSince' = [r \in Reads |-> FALSE]
    /\ UNCHANGED <<tzOk, hasSources, draft, confirmed, PlanVars, Ghosts>>

Next ==
    \/ ChangeSources \/ ChangeTimeZone \/ ReadDeadlines \/ ReadWithClaude \/ ImportFromCanvas
    \/ BackToTable \/ ReadLands \/ ReadFails
    \/ EditTable \/ ConfirmDeadlines \/ BackToInput
    \/ EditPlans \/ RebuildOnPlans \/ ConfirmPlans \/ BackToDeadlines
    \/ OpenCoach \/ EditPlansFromDone \/ EditDeadlinesFromDone \/ StartOver
    \/ RebuildFromCoach \/ EditPlansFromCoach \/ LeaveCoach
    \/ Reload

Spec == Init /\ [][Next]_vars

\* ---- Rules ----

\* AutopilotApp renders nothing for a step whose data is missing.
ScreensHaveData ==
    /\ step \in Steps
    /\ step = "confirm" => draft # None
    /\ step = "plans" => plans # None /\ confirmed # None
    /\ step = "done" => confirmed # None
    /\ step = "coach" => plans # None /\ confirmed # None

\* "Coach needs plans the student has confirmed." (openCoach)
CoachOnlyOnConfirmedPlans == step = "coach" => plansOk

\* The student can't get past the plans step with an empty block.
NoBlanksPastPlans == step \in {"done", "coach"} => ~blank

\* Plans are always built on the deadlines the student confirmed.
PlansMatchDeadlines == (plans # None /\ confirmed # None) => plans = confirmed

\* Confirmed plans still exist.
ConfirmedPlansExist == plansOk => plans # None

\* Known bug 1. "A bad time zone can only be fixed on the input step" (reviveState),
\* so the student never leaves that step with one. buildIcs throws on it.
BadTimeZoneStaysOnInput == step # "input" => tzOk

\* Known bug 2. A read the student started doesn't overwrite work done since.
LateReadKeepsWork == ~lostWork

\* Known bug 3. Start over clears the syllabuses and deadlines, and they stay cleared.
StartOverStaysCleared == ~resurrected
===============================================================================

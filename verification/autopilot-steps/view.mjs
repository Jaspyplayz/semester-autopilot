// Words for the /statechart chart. Used only to draw it, never by the check.
const NAMES = {
  input: "Add syllabuses",
  confirm: "Check deadlines",
  plans: "Check plans",
  done: "Done",
  coach: "Coach",
};

export const title = "Semester Autopilot steps";

export const state = (v) => NAMES[v.step];

const LABELS = {
  ChangeSources: "you add or remove a syllabus",
  ChangeTimeZone: "you type a time zone",
  ReadDeadlines: "you read your syllabuses",
  ImportFromCanvas: "you start a read",
  ReadWithClaude: "you start a read",
  ReadLands: "a read you started comes back",
  ReadFails: "a read you started fails",
  EditTable: "you edit the table",
  EditPlans: "you edit the plans",
  RebuildOnPlans: "you rebuild the plans",
  BackToTable: "you go back to your table",
  ConfirmDeadlines: "you confirm the deadlines",
  BackToInput: "you go back",
  ConfirmPlans: "you confirm the plans",
  BackToDeadlines: "you go back to the deadlines",
  OpenCoach: "you ask what's on today",
  EditPlansFromDone: "you edit the plans",
  EditDeadlinesFromDone: "you edit the deadlines",
  StartOver: "you start over",
  RebuildFromCoach: "you rebuild from today",
  EditPlansFromCoach: "you edit the plans",
  LeaveCoach: "you open deadlines and downloads",
  Reload: "you reload the page",
};

export const step = (action) => LABELS[action];

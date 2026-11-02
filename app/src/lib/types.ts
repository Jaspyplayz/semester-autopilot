// Shared data shapes. Everything a student sees in the deadline table is a
// plain string so it can be edited freely; structure (dates, sorting, .ics)
// is derived from the strings with parseWhen().

export interface Deadline {
  id: string;
  /** "BIO 110", or "All" for a merged row like December finals. */
  course: string;
  /** "Midterm, Exam Centre 100", "Quiz 2, online", "Midterm, room TBA". */
  what: string;
  /** "25%", "5% (assumed)", "30-40%". */
  worth: string;
  /** "Units 1-6", "Weeks 1-6 (assumed)", "" if nothing to say. */
  covers: string;
  /** "Fri Oct 9, 9:00-21:00", "December", "TBA". */
  when: string;
  /** What the syllabus said when we couldn't pin it down, for the "Please check" question. */
  hint?: string;
  /** Extra "Please check" question the parser wants to ask about this row. */
  question?: string;
  source: "syllabus" | "llm" | "manual";
}

export interface CourseInfo {
  code: string;
  name: string;
  lectures?: string;
}

export interface Extraction {
  courses: CourseInfo[];
  rows: Deadline[];
  /** Undated items, e.g. "CS 150 weekly labs (10%)". */
  undated: string[];
  /** Problems reading a file, e.g. "notes.txt: no course code found". */
  warnings: string[];
}

export interface SyllabusSource {
  id: string;
  name: string;
  kind: "pdf" | "md" | "txt" | "paste" | "sample";
  text: string;
}

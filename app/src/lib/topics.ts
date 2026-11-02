// What a plan studies: the "Covers" cell expanded into topics, named from the
// syllabus's unit or week list when it has one. Anything unknown stays generic
// and the plan says so; nothing here invents course content.

import type { SyllabusSource } from "./types";

export interface Topic {
  /** "Unit 3", "Week 4", "Ch. 5", or free text from the Covers cell. */
  label: string;
  /** "Membranes and transport", when the syllabus names it. */
  name?: string;
  /** "ch. 5", when the syllabus lists a reading. */
  reading?: string;
}

interface Named {
  name: string;
  reading?: string;
}

export interface SyllabusTopics {
  weeks: Map<number, Named>;
  units: Map<number, Named>;
}

const MAX_RANGE = 26;
// Weeks with nothing new to learn in them.
const NOT_A_TOPIC = /^(midterm|exam|final|review|reading week|no class)/i;

function cleanReading(text: string | undefined): string | undefined {
  const t = text?.trim();
  return t ? t.replace(/^ch(apters?|s?\.?)\s*/i, "ch. ") : undefined;
}

function unitRow(cell: string): { from: number; to: number; name: string } | null {
  const m = cell.match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\.\s*(.+)$/);
  return m ? { from: Number(m[1]), to: Number(m[2] ?? m[1]), name: m[3].trim() } : null;
}

/** Reads "| Week | Unit | Reading |" tables and numbered weekly-topic lists. */
export function syllabusTopics(text: string): SyllabusTopics {
  const out: SyllabusTopics = { weeks: new Map(), units: new Map() };
  let inTopicList = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^#+\s/.test(line)) {
      inTopicList = /topics|schedule|units/i.test(line);
      continue;
    }
    const cells = line.startsWith("|")
      ? line
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim())
      : null;
    if (cells && /^\d{1,2}$/.test(cells[0]) && cells[1]) {
      const week = Number(cells[0]);
      const unit = unitRow(cells[1]);
      if (unit) {
        const named = { name: unit.name, reading: cleanReading(cells[2]) };
        for (let n = unit.from; n <= unit.to; n++) out.units.set(n, named);
        out.weeks.set(week, named);
      } else {
        out.weeks.set(week, { name: cells[1], reading: cleanReading(cells[2]) });
      }
      continue;
    }
    const listed = inTopicList && !cells ? line.match(/^(\d{1,2})\.\s+(.+)$/) : null;
    if (listed) out.weeks.set(Number(listed[1]), { name: listed[2].trim() });
  }
  return out;
}

/** Every topic name a syllabus gives, without exam weeks and the like. */
export function syllabusTopicNames(syllabus: SyllabusTopics): string[] {
  const names = [...syllabus.units.values(), ...syllabus.weeks.values()].map((n) => n.name);
  return [...new Set(names)].filter((n) => !NOT_A_TOPIC.test(n));
}

/** The syllabus text for a course, from its site import or a code near the top of the file. */
export function sourceFor(course: string, sources: SyllabusSource[]): string | null {
  const squash = (s: string) => s.replace(/\s+/g, "").toUpperCase();
  const code = squash(course);
  const match =
    sources.find((s) => s.course && squash(s.course.code) === code) ??
    sources.find((s) => squash(s.text.slice(0, 300)).includes(code));
  return match?.text ?? null;
}

/** Everything in session for a course: its site imports first, then files that name it near the top. */
export function sourcesFor(course: string, sources: SyllabusSource[]): SyllabusSource[] {
  const squash = (s: string) => s.replace(/\s+/g, "").toUpperCase();
  const code = squash(course);
  const imported = sources.filter((s) => s.course && squash(s.course.code) === code);
  const named = sources.filter((s) => !imported.includes(s) && !s.course && squash(s.text.slice(0, 300)).includes(code));
  return [...imported, ...named];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Every "Units 1-6", "Week 4" or "Ch. 2-8" in a piece of text, expanded and named from the syllabus. */
export function numberedTopics(text: string, syllabus: SyllabusTopics | null): Topic[] {
  const found: Topic[] = [];
  const pattern = /\b(units?|weeks?|ch(?:apters?|s?\.?)|modules?|lectures?|lessons?|sections?|topics?)\.?\s*(\d{1,2})(?:\s*(?:-|–|to)\s*(\d{1,2}))?/gi;
  for (const m of text.matchAll(pattern)) {
    const from = Number(m[2]);
    const to = Number(m[3] ?? m[2]);
    if (to < from || to - from > MAX_RANGE) continue;
    const word = m[1].toLowerCase();
    const isUnit = word.startsWith("unit");
    const isWeek = word.startsWith("week");
    const isChapter = word.startsWith("ch");
    const singular = isChapter ? "Ch." : capitalize(word.replace(/s$/, ""));
    for (let n = from; n <= to; n++) {
      const named = isUnit ? syllabus?.units.get(n) : isWeek ? syllabus?.weeks.get(n) : undefined;
      if (named && NOT_A_TOPIC.test(named.name)) continue;
      found.push({
        label: `${singular} ${n}`,
        name: named?.name,
        reading: isChapter ? `ch. ${n}` : named?.reading,
      });
    }
  }
  return found;
}

/**
 * "Units 1-6" -> Unit 1..6, "Weeks 1-7" -> Week 1..7, "Ch. 2-8", or a plain
 * "cells, genetics" list. An empty result means coverage is unknown.
 */
export function topicsFromCovers(covers: string, syllabus: SyllabusTopics | null): Topic[] {
  const clean = covers.replace(/\(assumed\)/gi, "").trim();
  if (!clean) return [];
  const found = numberedTopics(clean, syllabus);
  if (found.length) return found;
  if (/\d/.test(clean)) return [];
  return clean
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .filter(Boolean)
    .map((label) => ({ label: capitalize(label) }));
}

/** Stand-ins when coverage isn't known. The plan's "Assumed" line says so. */
export const GENERIC_TOPICS: Topic[] = [
  { label: "the first third of your notes" },
  { label: "the middle third of your notes" },
  { label: "the last third of your notes" },
];

const WHOLE_COURSE: Topic[] = [{ label: "everything this covers" }];

/** "Units 1-3", or the first and last label joined for anything without a shared word. */
function groupLabel(group: Topic[]): string {
  if (group.length === 1) return group[0].label;
  const first = group[0].label.match(/^(.*?)\s*(\d+)$/);
  const last = group[group.length - 1].label.match(/^(.*?)\s*(\d+)$/);
  if (first && last && first[1] === last[1]) {
    const word = first[1] === "Ch." ? "Ch." : `${first[1]}s`;
    return `${word} ${first[2]}-${last[2]}`;
  }
  return group.map((t) => t.label).join(", ");
}

/** Merges neighbours until there are at most `max`, so every topic still gets its blocks. */
export function fitTopics(topics: Topic[], max: number): Topic[] {
  if (topics.length <= max) return topics;
  if (topics === GENERIC_TOPICS) return WHOLE_COURSE;
  const limit = Math.max(1, max);
  const out: Topic[] = [];
  for (let i = 0; i < limit; i++) {
    const group = topics.slice(Math.floor((i * topics.length) / limit), Math.floor(((i + 1) * topics.length) / limit));
    const readings = group.map((t) => t.reading).filter(Boolean);
    out.push({ label: groupLabel(group), reading: readings.length ? readings.join(", ") : undefined });
  }
  return out;
}

export function topicTitle(topic: Topic): string {
  return topic.name ? `${topic.label} (${topic.name})` : topic.label;
}

/** Where to find a topic, in Basic mode's terms: what the student already has. */
export function topicWhere(topic: Topic): string {
  if (topic.reading) return topic.reading;
  if (/^(week|unit|module|lecture|lesson|section|topic)s?\b/i.test(topic.label)) return `your ${topic.label} slides and notes`;
  return "your notes and slides";
}

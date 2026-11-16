// Mind: the private Mood Journal and the Breathe pacer.
//
// PRIVACY: journal entries are read and written only by the Mind page (app/mind.tsx), under their own storage key. Nothing else in the
// app imports this file: not the Flight Surgeon view, Health History, the exports, Ask HemoScope, the tour, or any status or score.
// Keep it that way. lib/mind.test.ts checks it.

import type { AstronautId } from "./data";

// ---------------------------------------------------------------------------
// Mood Journal
// ---------------------------------------------------------------------------

export const JOURNAL_KEY = "hemoscope-journal";
export const MAX_NOTE = 500;
export const JOURNAL_PRIVACY = "Private. Only you can see this. It is not shared with your flight surgeon and does not change your status.";

export type JournalEntry = { id: string; day: number; mood: number; note: string };
export type Journal = Partial<Record<AstronautId, JournalEntry[]>>;

const isEntry = (x: unknown): x is JournalEntry => {
  const e = x as JournalEntry;
  return !!e && typeof e.id === "string" && Number.isFinite(e.day) && Number.isInteger(e.mood) && e.mood >= 1 && e.mood <= 5 && typeof e.note === "string";
};

// Reads what was stored. Anything that is not a well-formed journal gives an empty one, never an error.
export function parseJournal(raw: string): Journal {
  try {
    const data = raw ? JSON.parse(raw) : {};
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: Journal = {};
    for (const [id, list] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(list)) out[id as AstronautId] = list.filter(isEntry).map((e) => ({ id: e.id, day: e.day, mood: e.mood, note: e.note.slice(0, MAX_NOTE) }));
    }
    return out;
  } catch {
    return {};
  }
}

export function addEntry(journal: Journal, who: AstronautId, entry: JournalEntry): Journal {
  return { ...journal, [who]: [...(journal[who] ?? []), { ...entry, note: entry.note.trim().slice(0, MAX_NOTE) }] };
}

export function deleteEntry(journal: Journal, who: AstronautId, entryId: string): Journal {
  return { ...journal, [who]: (journal[who] ?? []).filter((e) => e.id !== entryId) };
}

// Newest first: the day, then the order they were saved on the same day.
export function entriesNewestFirst(journal: Journal, who: AstronautId): JournalEntry[] {
  return [...(journal[who] ?? [])].map((e, i) => ({ e, i })).sort((a, b) => b.e.day - a.e.day || b.i - a.i).map((x) => x.e);
}

// ---------------------------------------------------------------------------
// Breathe: box breathing
// ---------------------------------------------------------------------------

export const BREATH_PHASES = ["Breathe in", "Hold", "Breathe out", "Hold"] as const;
export const BREATH_SECONDS = 4; // each phase
export const BREATH_CYCLES = 4; // the pacer stops after this many
export const BREATH_TOTAL_SECONDS = BREATH_PHASES.length * BREATH_SECONDS * BREATH_CYCLES;
export const BREATH_NOTE = "For stress relief and focus during long missions. Not a treatment for any condition.";

export type BreathState = {
  done: boolean;
  cycle: number; // 1 to BREATH_CYCLES, the cycle in progress (BREATH_CYCLES when done)
  phase: 0 | 1 | 2 | 3; // index into BREATH_PHASES
  label: (typeof BREATH_PHASES)[number];
  secondsLeft: number; // whole seconds left in this phase, 4 down to 1
  big: boolean; // true while the circle should be large: Breathe in and the Hold after it
};

// Where the pacer is after `elapsedMs` of running. Pure, so the timing is easy to test.
export function breathAt(elapsedMs: number): BreathState {
  const s = Math.max(0, elapsedMs) / 1000;
  if (s >= BREATH_TOTAL_SECONDS) {
    return { done: true, cycle: BREATH_CYCLES, phase: 3, label: BREATH_PHASES[3], secondsLeft: 0, big: false };
  }
  const perCycle = BREATH_PHASES.length * BREATH_SECONDS;
  const cycle = Math.floor(s / perCycle) + 1;
  const inCycle = s - (cycle - 1) * perCycle;
  const phase = Math.floor(inCycle / BREATH_SECONDS) as 0 | 1 | 2 | 3;
  const secondsLeft = BREATH_SECONDS - Math.floor(inCycle - phase * BREATH_SECONDS);
  return { done: false, cycle, phase, label: BREATH_PHASES[phase], secondsLeft, big: phase <= 1 };
}

// ---------------------------------------------------------------------------
// Activities: short guided routines. Nothing about them is saved, tracked or scored. They follow the same private rules as the journal.
// ---------------------------------------------------------------------------

export type ActivityKind = "Mind" | "Body";
export type Activity = {
  id: string;
  title: string;
  description: string;
  minutes: number;
  kind: ActivityKind;
  steps: string[]; // empty for Box breathing, which scrolls to the breathing pacer instead
};

export const ACTIVITIES: Activity[] = [
  {
    id: "box-breathing", title: "Box breathing", description: "Four slow breaths in a steady square rhythm.", minutes: 2, kind: "Mind", steps: [],
  },
  {
    id: "five-senses", title: "Five senses grounding", description: "Settle your attention by naming what you notice around you.", minutes: 3, kind: "Mind",
    steps: [
      "Name 5 things you can see.",
      "Name 4 things you can touch.",
      "Name 3 things you can hear.",
      "Name 2 things you can smell.",
      "Name 1 thing you can taste.",
    ],
  },
  {
    id: "message-home", title: "A message home", description: "Prepare a few words for someone you miss.", minutes: 5, kind: "Mind",
    steps: [
      "Think of one person you want to reach.",
      "Think of one thing you would like to tell them.",
      "Write it in your mood journal note, or save it for your next call.",
    ],
  },
  {
    id: "wind-down", title: "Evening wind-down", description: "A short routine to help you rest.", minutes: 4, kind: "Mind",
    steps: [
      "Dim the lights.",
      "Put screens away.",
      "Take three slow breaths.",
      "Set tomorrow's first task.",
      "Rest.",
    ],
  },
  {
    id: "neck-shoulders", title: "Neck and shoulder release", description: "Ease the tension that builds up during long tasks.", minutes: 3, kind: "Body",
    steps: [
      "Slowly tilt your head toward one shoulder, then the other.",
      "Roll your shoulders back, then forward.",
      "Squeeze your shoulder blades together, then let go.",
      "Keep a foot in a foot hold or a hand on a handrail the whole time.",
    ],
  },
  {
    id: "full-body-stretch", title: "Gentle full-body stretch", description: "Slow stretches you can do while anchored in place.", minutes: 5, kind: "Body",
    steps: [
      "Reach both arms overhead.",
      "Stretch to one side, then the other.",
      "Stretch your hips and calves.",
      "Hold each stretch for 20 seconds.",
      "Stay anchored the whole time, with a foot hold or a handrail.",
    ],
  },
];

// The small label on each card, for example "3 MIN \u00b7 MIND".
export const activityLabel = (a: Activity) => `${a.minutes} MIN \u00b7 ${a.kind.toUpperCase()}`;
export const BREATHE_CARD_ID = "breathe"; // the Breathe card, where Box breathing scrolls to

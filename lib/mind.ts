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

// Private badges: small rewards for steady Daily Checks and calm moments. They are never health results and never change a status.
//
// PRIVACY: counts are read and written only by the Dashboard badges card and the Mind page (app/badges.tsx), under their own storage key.
// The Flight Surgeon view, exports, Ask HemoScope, the tour data and the status engine never import this file. lib/badges.test.ts checks it.

import type { AstronautId } from "./data";

export const BADGES_KEY = "hemoscope-badges";
export const BADGES_LABEL = "BADGES · PRIVATE";
export const BADGES_HINT = "Tap a badge to see how to earn it.";

// What an astronaut has finished. `mind` counts completed breathing sessions (all 4 cycles) and Mind activities (Done pressed).
// `body` counts Body activities (Done pressed).
export type Counts = { mind: number; body: number };
export type CountStore = Partial<Record<AstronautId, Counts>>;
export const NO_COUNTS: Counts = { mind: 0, body: 0 };

export type BadgeIcon = "star" | "flame" | "trophy" | "wind" | "sparkle" | "diamond" | "heart" | "crown";
export type BadgeInput = { checks: number; longestStreak: number; counts: Counts };
export type Badge = { id: string; name: string; icon: BadgeIcon; how: string; earned: (i: BadgeInput) => boolean };

const OTHERS_EARNED = (i: BadgeInput) => BADGES.slice(0, 7).every((b) => b.earned(i));

export const BADGES: Badge[] = [
  { id: "first-check-in", name: "First check-in", icon: "star", how: "Complete any Daily Check.", earned: (i) => i.checks >= 1 },
  { id: "three-days", name: "Three days in a row", icon: "flame", how: "Complete the Daily Check 3 days in a row.", earned: (i) => i.longestStreak >= 3 },
  { id: "full-week", name: "A full week", icon: "trophy", how: "Complete the Daily Check 7 days in a row.", earned: (i) => i.longestStreak >= 7 },
  { id: "calm-1", name: "Took a calm moment", icon: "wind", how: "Finish one breathing session or one Mind activity.", earned: (i) => i.counts.mind >= 1 },
  { id: "calm-5", name: "Five calm moments", icon: "sparkle", how: "Finish 5 breathing sessions or Mind activities.", earned: (i) => i.counts.mind >= 5 },
  { id: "calm-10", name: "Ten calm moments", icon: "diamond", how: "Finish 10 breathing sessions or Mind activities.", earned: (i) => i.counts.mind >= 10 },
  { id: "mind-body", name: "Mind and body", icon: "heart", how: "Finish a breathing session or Mind activity, and a Body activity.", earned: (i) => i.counts.mind >= 1 && i.counts.body >= 1 },
  { id: "full-orbit", name: "Full orbit", icon: "crown", how: "Earn all the other 7 badges.", earned: OTHERS_EARNED },
];

export const earnedIds = (i: BadgeInput): string[] => BADGES.filter((b) => b.earned(i)).map((b) => b.id);

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);

// Anything that is not a well-formed store gives an empty one, never an error.
export function parseCounts(raw: string): CountStore {
  try {
    const data = raw ? JSON.parse(raw) : {};
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: CountStore = {};
    for (const [id, c] of Object.entries(data as Record<string, Counts>)) {
      if (c && typeof c === "object") out[id as AstronautId] = { mind: num(c.mind), body: num(c.body) };
    }
    return out;
  } catch {
    return {};
  }
}

export function addCount(store: CountStore, who: AstronautId, kind: "mind" | "body"): CountStore {
  const c = store[who] ?? NO_COUNTS;
  return { ...store, [who]: { ...c, [kind]: c[kind] + 1 } };
}

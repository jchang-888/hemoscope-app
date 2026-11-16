"use client";

// Private badges card for the Dashboard, and the private counter behind it. Counts are saved in this browser under their own key
// (every read and write in try/catch), and Reset Demo clears them with clearBadges(). See the privacy note in lib/badges.ts.

import { useState, useSyncExternalStore } from "react";
import { BADGES, BADGES_HINT, BADGES_KEY, BADGES_LABEL, NO_COUNTS, addCount, earnedIds, parseCounts, type BadgeIcon, type Counts } from "../lib/badges";
import type { AstronautId } from "../lib/data";
import { Card } from "./ui";

let memory = ""; // used when storage is blocked, so badges still work for this visit
const listeners = new Set<() => void>();

function readRaw(): string {
  try {
    return localStorage.getItem(BADGES_KEY) ?? "";
  } catch {
    return memory;
  }
}

function writeRaw(raw: string) {
  memory = raw;
  try {
    if (raw) localStorage.setItem(BADGES_KEY, raw);
    else localStorage.removeItem(BADGES_KEY);
  } catch {
    // Storage blocked: the in-memory copy is used instead.
  }
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

function useCounts(id: AstronautId): Counts {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  return parseCounts(raw)[id] ?? NO_COUNTS;
}

// Called by the Mind page: a breathing session finished all 4 cycles, or Done was pressed on an activity.
export const recordCalmMoment = (id: AstronautId) => writeRaw(JSON.stringify(addCount(parseCounts(readRaw()), id, "mind")));
export const recordBodyActivity = (id: AstronautId) => writeRaw(JSON.stringify(addCount(parseCounts(readRaw()), id, "body")));
// Reset Demo: remove every astronaut's counts.
export const clearBadges = () => writeRaw("");

const ICONS: Record<BadgeIcon, string> = {
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  flame: "M12 2.5c.8 3.2 5.5 5.4 5.5 10.6a5.5 5.5 0 0 1-11 0c0-2.1 1-3.5 2.2-4.6.1 1.8.9 2.9 2 3.2-.6-3.1-.5-6.2 1.3-9.2z",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4",
  wind: "M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z",
  diamond: "M6.5 4h11l3.5 5-9 11L3 9zM3 9h18M9.5 4L8 9l4 11 4-11-1.5-5",
  heart: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z",
  crown: "M3.5 8l4.5 4 4-7 4 7 4.5-4-1.5 11h-14z",
};

function Icon({ name }: { name: BadgeIcon }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

function Lock() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function BadgesCard({ id, checks, longestStreak }: { id: AstronautId; checks: number; longestStreak: number }) {
  const counts = useCounts(id);
  const [picked, setPicked] = useState<string | null>(null);
  const input = { checks, longestStreak, counts };
  const earned = new Set(earnedIds(input));
  const pick = BADGES.find((b) => b.id === picked);

  return (
    <Card>
      <p className="font-mono text-xs font-semibold tracking-wide text-muted">{BADGES_LABEL}</p>
      <h2 className="font-heading mt-1 text-lg font-bold">{earned.size} of {BADGES.length} earned</h2>
      <ul className="mt-3 grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-8">
        {BADGES.map((b) => {
          const has = earned.has(b.id);
          return (
            <li key={b.id}>
              <button
                type="button" onClick={() => setPicked(picked === b.id ? null : b.id)} aria-pressed={picked === b.id}
                aria-label={`${b.name}, ${has ? "earned" : "locked"}`}
                className={`flex w-full flex-col items-center gap-1.5 rounded-xl p-1 text-center ${picked === b.id ? "outline outline-2 outline-offset-1 outline-accent" : ""}`}
              >
                <span className={`relative flex h-12 w-12 items-center justify-center rounded-xl ${has ? "bg-accent text-white" : "bg-border text-muted"}`}>
                  <Icon name={b.icon} />
                  {!has && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface text-muted"><Lock /></span>}
                </span>
                <span className={`text-xs font-semibold leading-tight ${has ? "" : "text-muted"}`}>{b.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 rounded-lg bg-background px-3 py-2 text-sm" aria-live="polite">
        {pick ? <><b>{pick.name}:</b> {pick.how} {earned.has(pick.id) ? "Earned." : "Not earned yet."}</> : BADGES_HINT}
      </p>
    </Card>
  );
}

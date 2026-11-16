"use client";

// Mind: a private page with a Mood Journal and a Breathe pacer. Journal entries are saved only in this browser, under their own key,
// and are read only here (see the privacy note in lib/mind.ts). Reset Demo clears them with clearJournal().

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CONFIG } from "../lib/config";
import type { AstronautId } from "../lib/data";
import {
  ACTIVITIES, BREATHE_CARD_ID, BREATH_CYCLES, BREATH_NOTE, BREATH_SECONDS, JOURNAL_KEY, JOURNAL_PRIVACY, MAX_NOTE, activityLabel, addEntry, breathAt, deleteEntry, entriesNewestFirst, parseJournal,
  type Activity, type Journal,
} from "../lib/mind";
import { Card, MoodFace, MoodPicker } from "./ui";

// ---------------------------------------------------------------------------
// Saved journal (localStorage). Every read and write is wrapped in try/catch.
// ---------------------------------------------------------------------------

let memory = ""; // used when storage is blocked, so the journal still works for this visit
const listeners = new Set<() => void>();

function readRaw(): string {
  try {
    return localStorage.getItem(JOURNAL_KEY) ?? "";
  } catch {
    return memory;
  }
}

function writeRaw(raw: string) {
  memory = raw;
  try {
    if (raw) localStorage.setItem(JOURNAL_KEY, raw);
    else localStorage.removeItem(JOURNAL_KEY);
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

function useJournal(): Journal {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  return parseJournal(raw);
}

// Reset Demo: remove every astronaut's journal entries.
export const clearJournal = () => writeRaw("");

// ---------------------------------------------------------------------------
// Mood Journal
// ---------------------------------------------------------------------------

function MoodJournal({ id }: { id: AstronautId }) {
  const journal = useJournal();
  const [mood, setMood] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const entries = entriesNewestFirst(journal, id);

  const save = () => {
    if (!mood) return;
    const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, day: CONFIG.mission.today, mood: Number(mood), note };
    writeRaw(JSON.stringify(addEntry(parseJournal(readRaw()), id, entry)));
    setMood("");
    setNote("");
    setSaved(true);
  };
  const remove = (entryId: string) => writeRaw(JSON.stringify(deleteEntry(parseJournal(readRaw()), id, entryId)));

  return (
    <Card title="Mood Journal (Private)">
      <p className="rounded-lg bg-accent/15 px-3 py-2 text-sm font-semibold">{JOURNAL_PRIVACY}</p>
      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-1 text-sm font-semibold">How are you feeling today? Mission day {CONFIG.mission.today}.</p>
          <MoodPicker value={mood} onChange={(v) => { setMood(v); setSaved(false); }} />
        </div>
        <div>
          <label htmlFor="journal-note" className="mb-1 block text-sm font-semibold">Note (optional)</label>
          <textarea
            id="journal-note" className="input min-h-24" maxLength={MAX_NOTE} value={note}
            onChange={(e) => { setNote(e.target.value); setSaved(false); }}
          />
          <p className="mt-1 text-xs text-muted">{note.length} / {MAX_NOTE}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={!mood} onClick={save}>Save</button>
          {!mood && <span className="text-sm text-muted">Pick a mood to save.</span>}
          {saved && <span role="status" className="text-sm font-semibold text-ok">Entry saved.</span>}
        </div>
      </div>

      <h3 className="mt-6 text-sm font-semibold">Past Entries</h3>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-muted">No entries yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-3 py-2.5">
              <span className="w-16 shrink-0 font-mono text-sm">Day {e.day}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-sm"><MoodFace value={e.mood} />Mood {e.mood} of 5</span>
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{e.note}</p>
              <button type="button" className="btn !px-2.5 !py-1 !text-xs" aria-label={`Delete the entry from day ${e.day}`} onClick={() => remove(e.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Breathe: box breathing. Timing from the clock (like the Compression Pacer), animation from CSS.
// ---------------------------------------------------------------------------

function BreathingPacer() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // milliseconds since Start
  const startedAt = useRef(0);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (breathAt(ms).done) setRunning(false); // stops by itself after the last cycle
    }, 200);
    return () => window.clearInterval(timer);
  }, [running]);

  const start = () => { startedAt.current = Date.now(); setElapsed(0); setRunning(true); };
  const stop = () => { setRunning(false); setElapsed(0); };

  const b = breathAt(elapsed);
  const idle = !running && !b.done;
  const big = running && b.big;
  return (
    <Card title="Breathe">
      <p className="text-sm">{BREATH_NOTE}</p>
      <div className="mt-4 flex flex-col items-center gap-3" role="group" aria-label="Breathing pacer">
        <div className="flex h-56 w-56 items-center justify-center sm:h-64 sm:w-64" aria-hidden>
          <div
            className="breath-circle flex h-44 w-44 items-center justify-center rounded-full bg-accent sm:h-52 sm:w-52"
            style={{ transform: `scale(${big ? 1.25 : 0.7})`, transition: `transform ${BREATH_SECONDS}s ease-in-out` }}
          >
            <span className="font-mono text-5xl font-bold text-white">{running ? b.secondsLeft : ""}</span>
          </div>
        </div>
        <p className="font-heading text-2xl font-bold" aria-live="polite">
          {idle ? "Ready" : b.done ? "Done" : b.label}
        </p>
        <p className="font-mono text-lg">
          {b.done ? `${BREATH_CYCLES} of ${BREATH_CYCLES} cycles done` : running ? `Cycle ${b.cycle} of ${BREATH_CYCLES}` : `${BREATH_CYCLES} cycles of box breathing, ${BREATH_SECONDS} seconds each`}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={start} disabled={running}>Start</button>
          <button type="button" className="btn" onClick={stop} disabled={!running}>Stop</button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Activities: a grid of short routines. Start opens the steps inside the card. Nothing is saved, tracked or scored.
// ---------------------------------------------------------------------------

function Activities() {
  const [open, setOpen] = useState<string | null>(null);
  const start = (a: Activity) => {
    if (a.steps.length === 0) {
      // Box breathing is the Breathe card above, so go there.
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(BREATHE_CARD_ID)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      return;
    }
    setOpen(a.id);
  };
  return (
    <Card title="Activities">
      <p className="text-sm text-muted">Short routines for your mind and body. Nothing here is tracked or saved.</p>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ACTIVITIES.map((a) => (
          <li key={a.id} className="flex flex-col rounded-xl border border-border bg-background p-4">
            <h3 className="font-heading text-lg font-bold">{a.title}</h3>
            <p className="mt-1 text-sm">{a.description}</p>
            <p className="mt-2 font-mono text-xs font-semibold text-muted">{activityLabel(a)}</p>
            {open === a.id ? (
              <div className="mt-3" role="group" aria-label={`${a.title} steps`}>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                  {a.steps.map((s) => <li key={s}>{s}</li>)}
                </ol>
                <button type="button" className="btn btn-primary mt-4" onClick={() => setOpen(null)}>Done</button>
              </div>
            ) : (
              <button type="button" className="btn btn-primary mt-3 self-start" onClick={() => start(a)}>Start</button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function MindView({ id }: { id: AstronautId }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-2xl font-bold">Mind</h2>
        <p className="text-sm text-muted">A private place to check in with yourself. Nothing on this page is shared or scored.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <MoodJournal id={id} />
        <div id={BREATHE_CARD_ID}><BreathingPacer /></div>
      </div>
      <Activities />
    </div>
  );
}

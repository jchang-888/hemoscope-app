"use client";

// The whole HemoScope interface in one client component.
// Flow: pick an astronaut or the flight surgeon, enter one day of data, see results and health history.
// Logic lives in lib/engine.ts, numbers in lib/config.ts, data in lib/data.ts, shared pieces in app/ui.tsx.
// Judge entries are saved in localStorage per astronaut (with a safe fallback if storage is blocked).

import { Suspense, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CONFIG, type Marker } from "../lib/config";
import {
  ASTRONAUT_IDS, fillBlood, fillDaily, getAstronaut, remeasureBlood, remeasureDaily, typicalDaily, usualDaily,
  type AstronautId, type DailyField,
} from "../lib/data";
import {
  MARKER_NAMES, MISSED_FLAG_DAYS, STATUS_RANK, STATUS_TEXT, SURGEON_VISIT_TEXT, SYMPTOMS, carriedOver, checkBlood, checkDaily, evaluateBloodSeries, mapPathOf,
  evaluateDailySeries, expectedFor, fmtMarker, flaggedEvents, hasRedX, markerValue, maxStatus, news2Series,
  dailyStreak, streakMilestone, surgeonVisit, topReason, vitalBand,
  type BloodInput, type BloodResult, type BloodSample, type DailyEntry, type DailyResult, type FieldCheck,
  type ImmuneScore, type Mark, type StatusId, type StreakInfo, type VitalKey,
} from "../lib/engine";
import { forecastSeries, type Forecast } from "../lib/ml";
import {
  bloodHistoryTable, crewTable, dailyHistoryTable, flaggedTable, markersTable, type Cell, type CrewRow, type Table,
} from "../lib/export";
import {
  Card, EmergencyAstronaut, EmergencySurgeon, ExportAllButton, ExportMenu, ImmuneBadge, ScoreNumber, immuneMeaning, FormField, ImmuneTip, InfoTip, LearnProvider, LearnView, MarkIcon, Modal, NumbersExplained,
  NavTabs, News2Tip, PageMain, ScoreTimeline, SiteHeader, StatusText, Tabs, TrendChart, WhyList, stepBand,
  type BandPt, type Pt, type ScorePoint, type TabDef,
} from "./ui";
import { AskForm, AskPanel, AskTab, useAsk } from "./ask";
import { ReplayView } from "./replay";
import { ImmuneStateMap } from "./state-map";
import { CheckTypeToggle } from "../components/CheckTypeToggle";
import { isHealth, navFromParam, openChecks, openPage, openResults, type ChecksTab, type NavState } from "../lib/nav";
import type { SearchTarget } from "../lib/search";

const TODAY = CONFIG.mission.today;
const LAST_HISTORY_DAY = TODAY - 1;
const DATA_NOTE = "Preflight blood values: Inspiration4 crew (NASA OSDR OSD-569). All in-flight data is simulated.";
const BLOOD_UNIT = "x10³ per µL";

type Who = AstronautId | "surgeon";

// ---------------------------------------------------------------------------
// Saved entries (localStorage). Every read and write is wrapped in try/catch.
// ---------------------------------------------------------------------------

type Stored = Partial<Record<AstronautId, { daily?: DailyEntry; blood?: BloodSample }>>;
const STORAGE_KEY = "hemoscope-demo-v2";
let memory = ""; // used when storage is blocked, so the demo still works for this visit
const listeners = new Set<() => void>();

function readRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return memory;
  }
}

function writeRaw(raw: string) {
  memory = raw;
  try {
    if (raw) localStorage.setItem(STORAGE_KEY, raw);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the in-memory copy is used instead.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function useStored(): Stored {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  return useMemo(() => {
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? (parsed as Stored) : {};
    } catch {
      return {};
    }
  }, [raw]);
}

function saveEntry(stored: Stored, id: AstronautId, patch: { daily?: DailyEntry; blood?: BloodSample }) {
  writeRaw(JSON.stringify({ ...stored, [id]: { ...stored[id], ...patch } }));
}

function clearEntries(stored: Stored, id: AstronautId) {
  const rest = { ...stored };
  delete rest[id];
  writeRaw(Object.keys(rest).length ? JSON.stringify(rest) : "");
}

// ---------------------------------------------------------------------------
// Form drafts (kept while switching between astronauts, cleared by Reset demo)
// ---------------------------------------------------------------------------

type NumKey = DailyField;
const NUM_KEYS: NumKey[] = ["temp", "hr", "rr", "spo2", "sbp", "dbp", "sleepHours", "sleepQuality", "sleepiness", "mood"];
type DailyDraft = Record<NumKey, string> & { symptoms: string[] };
type BloodDraft = Record<"wbc" | "neu" | "lym" | "mon" | "eos", string>;
type Checked = { sig: string; fields: Record<string, FieldCheck> };
type Draft = { daily: DailyDraft; blood: BloodDraft; dailyCheck: Checked | null; bloodCheck: Checked | null };

const BLOOD_KEYS = ["wbc", "neu", "lym", "mon", "eos"] as const;
const EMPTY_DRAFT: Draft = {
  daily: { temp: "", hr: "", rr: "", spo2: "", sbp: "", dbp: "", sleepHours: "", sleepQuality: "", sleepiness: "", mood: "", symptoms: [] },
  blood: { wbc: "", neu: "", lym: "", mon: "", eos: "" },
  dailyCheck: null,
  bloodCheck: null,
};

const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
const str = (n: number | undefined) => (n === undefined ? "" : String(n));

function dailyNumbers(d: DailyDraft): Partial<Record<NumKey, number>> {
  const out: Partial<Record<NumKey, number>> = {};
  for (const k of NUM_KEYS) {
    const v = num(d[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const dailyEntry = (d: DailyDraft): DailyEntry => ({ day: TODAY, ...dailyNumbers(d), symptoms: d.symptoms });
const dailyFilled = (d: DailyDraft) => Object.keys(dailyNumbers(d)).length + d.symptoms.length;

function bloodInput(d: BloodDraft): BloodInput {
  const out: BloodInput = {};
  for (const k of BLOOD_KEYS) {
    const v = num(d[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Small layout pieces
// ---------------------------------------------------------------------------

function ActionList() {
  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold">What You Can Do</h3>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
        {CONFIG.statusLabels.actions.map((a) => <li key={a}>{a}</li>)}
      </ul>
    </div>
  );
}

const fmtRange = (lo: number, hi: number, dec: number) => `${lo.toFixed(dec)} to ${hi.toFixed(dec)}`;

// ---------------------------------------------------------------------------
// Charts shared by Health History
// ---------------------------------------------------------------------------

const DAY_TICKS = [1, 10, 20, 30, 40, 50, 60];
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Title Case for headings: capitalise every word except short joining words.
const SMALL_WORDS = new Set(["to", "of", "a", "the", "and", "for", "in", "on"]);
const titleCase = (s: string) =>
  s.split(" ").map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

// Daily Check charts in the required order. The first five carry a NEWS2 zero-point band.
// yMin and yMax are the smallest range shown, the data can widen it.
const DAILY_VITAL_CHARTS: { key: VitalKey; yMin: number; yMax: number }[] = [
  { key: "temp", yMin: 36, yMax: 40 }, { key: "hr", yMin: 45, yMax: 125 }, { key: "sbp", yMin: 90, yMax: 140 },
  { key: "spo2", yMin: 90, yMax: 100 }, { key: "rr", yMin: 8, yMax: 26 },
];
const FORECAST_AHEAD = 7; // days after today for "Forecast for next check"
const forecastPoint = (f?: Forecast) => (f ? { x: f.day, y: f.expected, lo: f.lo, hi: f.hi } : null);
// Blood Check charts in the required order, NLR first as the headline marker.
const BLOOD_CHARTS: Marker[] = ["NLR", "WBC", "NEU", "LYM", "MON", "EOS"];

function Legend({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-accent/15 px-3 py-2 text-sm">{children}</p>;
}

// A history table from lib/export, shown on screen. The same Table object feeds the CSV and JSON export, so the screen
// and the files always match. Long tables scroll; the PNG export expands them first (data-export-expand).
const statusFromLabel = (label: Cell): StatusId | undefined =>
  (Object.keys(STATUS_TEXT) as StatusId[]).find((k) => STATUS_TEXT[k].label === label);

function HistoryTable({ table }: { table: Table }) {
  return (
    <div data-export-expand className="max-h-96 overflow-auto rounded-lg border border-border">
      <table className="w-full min-w-max text-sm">
        <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
          <tr>{table.columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2">{c}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {table.columns.map((c) => {
                const v = r[c] ?? "";
                const status = c === "Status" ? statusFromLabel(v) : undefined;
                return (
                  <td key={c} className={`whitespace-nowrap px-3 py-1.5 ${typeof v === "number" ? "font-mono" : ""} ${c === "Status" && !status ? "text-muted" : ""}`}>
                    {status ? <StatusText status={status} /> : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The Immune Deviation Score shown on the dashboard and the timeline: today's if a Blood Check was submitted,
// otherwise the latest in-flight check.
function immuneShown(blood: BloodResult[]) {
  const todayScored = blood.find((b) => b.day === TODAY && b.immune);
  const latestScored = blood.filter((b) => b.day > 0 && b.day < TODAY && b.immune).slice(-1)[0];
  return { shown: todayScored ?? latestScored, isToday: !!todayScored };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

type HistorySub = "daily" | "blood";

// Health History: a Daily Check section and a Blood Check section, chosen with a toggle. Each section starts with the full
// history table, then the charts. Every chart in a section has the same size and the same x axis (days 1 to 60). Bands never
// learn from the days shown: they use the same calculation as the results (NEWS2 zero-point range for vitals, preflight
// baseline times the phase multiplier for blood). `todayDaily` and `todayBlood` hold the judge's submitted values, if any.
function HealthHistory({ id, entries, dailyResults, bloodResults, todayDaily, todayBlood, lastDay, sub, onSub }: {
  id: AstronautId; entries: DailyEntry[]; dailyResults: DailyResult[]; bloodResults: BloodResult[]; todayDaily?: DailyEntry;
  todayBlood?: BloodSample; lastDay: number; sub: HistorySub; onSub: (s: HistorySub) => void;
}) {
  const a = getAstronaut(id);
  const days = range(1, TODAY);
  const dailyLine = (key: DailyField): Pt[] =>
    a.daily.filter((d) => d.day <= lastDay && d[key] !== undefined).map((d) => ({ x: d.day, y: d[key] as number }));
  const dailyToday = (key: DailyField): Pt | null => (todayDaily?.[key] !== undefined ? { x: TODAY, y: todayDaily[key] as number } : null);
  const newsToday = dailyResults.find((d) => d.day === TODAY && d.parts.length > 0);
  const common = { xMin: 1, xMax: TODAY, xTicks: DAY_TICKS, astronaut: id };
  const label = (key: DailyField) => titleCase(CONFIG.tooltips.fields[key].label);
  const unit = (key: DailyField) => CONFIG.tooltips.fields[key].unit;
  const { shown, isToday } = immuneShown(bloodResults);
  // Forecast for the next blood check, one week after today, from every trustworthy sample so far.
  const NEXT_DAY = TODAY + FORECAST_AHEAD;
  const forecasts = forecastSeries(bloodResults.filter((r) => r.kind !== "retake").map((r) => r.sample), NEXT_DAY).next;
  const bloodCommon = { ...common, xMax: NEXT_DAY, xTicks: [1, 10, 20, 30, 40, 50, 60, NEXT_DAY] };
  const scorePoints: ScorePoint[] = bloodResults.filter((b) => b.immune).map((b) => ({ day: b.day, score: (b.immune as ImmuneScore).score }));

  return (
    <div className="space-y-4">
      <CheckTypeToggle label="Health history type" value={sub} onChange={onSub} />

      {sub === "daily" && (
        <div data-export-all className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Legend>
              Shaded band: the normal range for each vital, using the same NEWS2 zero-point range as the results, with spaceflight
              adjustments (systolic 10 mmHg lower, temperature shifted by your in-flight offset). White ring: the day {TODAY} value once
              submitted. Sleep hours show a {CONFIG.sleep.targetHours} hour target line. Mood has no band.
            </Legend>
            <ExportAllButton astronaut={id} />
          </div>
          <Card title="Daily Check History" exportMenu={<ExportMenu astronaut={id} name="daily-check-history" table={dailyHistoryTable(entries, dailyResults)} />}>
            <HistoryTable table={dailyHistoryTable(entries, dailyResults)} />
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <TrendChart
              title="NEWS2 Total" unit="points" tip={<News2Tip />} exportName="news2-trend" {...common}
              line={news2Series(dailyResults, 1, lastDay).map((p) => ({ x: p.day, y: p.total }))}
              band={[{ x: 0.5, lo: 0, hi: 0.5 }, { x: TODAY + 0.5, lo: 0, hi: 0.5 }]} bandFits={false}
              refLines={[{ y: 5, label: "5", dashed: true }, { y: 7, label: "7", dashed: true }]}
              today={newsToday ? { x: TODAY, y: newsToday.total } : null} yMin={0} yMax={9}
              note="Thin lines mark totals of 5 and 7."
            />
            {DAILY_VITAL_CHARTS.map(({ key, yMin, yMax }) => {
              const band: BandPt[] = stepBand(days.map((d) => { const [lo, hi] = vitalBand(key, a.daily.filter((h) => h.day < d), d); return { x: d, lo, hi }; }));
              return (
                <TrendChart
                  key={key} title={label(key)} unit={unit(key)} exportName={`${slug(label(key))}-trend`} {...common}
                  line={dailyLine(key)} band={band} bandFits={false} today={dailyToday(key)} yMin={yMin} yMax={yMax}
                />
              );
            })}
            <TrendChart
              title={label("sleepHours")} unit={unit("sleepHours")} exportName="sleep-hours-trend" {...common} line={dailyLine("sleepHours")}
              refLines={[{ y: CONFIG.sleep.targetHours, label: String(CONFIG.sleep.targetHours) }]} today={dailyToday("sleepHours")} yMin={3} yMax={10}
            />
            <TrendChart title={label("mood")} unit="1 to 5, not scored" exportName="mood-trend" {...common} line={dailyLine("mood")} today={dailyToday("mood")} yMin={0.5} yMax={5.5} />
          </div>
        </div>
      )}

      {sub === "blood" && (
        <div data-export-all className="space-y-4">
          <Card><ImmuneStateMap path={mapPathOf(bloodResults, a.baseline)} astronaut={id} /></Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Legend>
              Shaded band: the expected range from your preflight baseline times the flight phase multiplier, plus or minus 1.96 standard
              deviations. It steps at phase changes and never learns from in-flight values, so a drift stays visible outside the band.
              White ring: the day {TODAY} value once submitted. Dashed point and band: the forecast for next check (day {NEXT_DAY}) with its 95% range, from the astronaut&apos;s own history after the spaceflight adjustment. Neutrophil to lymphocyte ratio (NLR) is the headline marker and has no forecast.
            </Legend>
            <ExportAllButton astronaut={id} />
          </div>
          <Card title="Blood Check History" exportMenu={<ExportMenu astronaut={id} name="blood-check-history" table={bloodHistoryTable(bloodResults)} />}>
            <HistoryTable table={bloodHistoryTable(bloodResults)} />
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card title="Immune Deviation Score Timeline" tip={<ImmuneTip />} exportName="immune-deviation-score-timeline" exportMenu={<ExportMenu astronaut={id} name="immune-deviation-score-timeline" />}>
              <ScoreTimeline points={scorePoints} highlightDay={shown?.day ?? null} highlightLabel={isToday ? "Today" : "Latest"} />
            </Card>
            {BLOOD_CHARTS.map((m) => {
              const line: Pt[] = a.blood
                .filter((s) => s.day >= 1 && s.day <= lastDay)
                .flatMap((s) => { const y = markerValue(s, m); return y === undefined ? [] : [{ x: s.day, y }]; });
              const band: BandPt[] = stepBand(days.map((d) => { const e = expectedFor(m, a.baseline, d); return { x: d, lo: e.lo, hi: e.hi }; }));
              const v = todayBlood ? markerValue(todayBlood, m) : undefined;
              const name = titleCase(MARKER_NAMES[m]);
              const title = m === "NLR" ? "Neutrophil to Lymphocyte Ratio (NLR), Headline Marker" : m === CONFIG.blood.watchMarker ? `${name} (${CONFIG.blood.watchLabel})` : name;
              return (
                <TrendChart
                  key={m} title={title} unit={m === "NLR" ? "ratio" : BLOOD_UNIT} exportName={`${m.toLowerCase()}-trend`} {...bloodCommon}
                  line={line} band={band} dots today={v !== undefined ? { x: TODAY, y: v } : null}
                  forecast={forecastPoint(forecasts.find((f) => f.marker === m))}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Astronaut tab 1: Dashboard
// ---------------------------------------------------------------------------

function ChecklistRow({ done, title, onGo, onResults }: { done: boolean; title: string; onGo: () => void; onResults: () => void }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
      <span className="flex items-center gap-2">
        {done ? <span className="chip inline-flex rounded-full bg-background p-0.5"><MarkIcon mark="ok" /></span> : <span className="inline-block h-[18px] w-[18px] rounded-full border-2 border-muted" aria-hidden />}
        {title}
        <span className="text-muted">{done ? "Done" : "Due today"}</span>
      </span>
      {done ? <button className="btn" onClick={onResults}>View Results</button> : <button className="btn" onClick={onGo}>Open</button>}
    </li>
  );
}

// Third checklist item. No Need is dotted and gray, the other two are solid with an orange or red icon.
// The status name is on the left and the follow-up text on the right of the same bar. On a narrow screen the text wraps below.
function SurgeonRow({ status }: { status: StatusId }) {
  const visit = surgeonVisit(status);
  const look = {
    none: "border-2 border-dotted border-muted text-muted",
    next: "chip border-2 border-solid border-alert bg-background text-alert",
    now: "chip border-2 border-solid border-danger bg-background text-danger",
  }[visit];
  return (
    <li className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-4 py-3 ${look}`}>
      <span className="flex items-center gap-2">
        {visit === "next" && <MarkIcon mark="high" />}
        {visit === "now" && <MarkIcon mark="bad" />}
        See Flight Surgeon
      </span>
      <span>{SURGEON_VISIT_TEXT[visit]}</span>
    </li>
  );
}

function Flame() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.5c.8 3.2 5.5 5.4 5.5 10.6a5.5 5.5 0 0 1-11 0c0-2.1 1-3.5 2.2-4.6.1 1.8.9 2.9 2 3.2-.6-3.1-.5-6.2 1.3-9.2z" />
    </svg>
  );
}

const plural = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

// Daily Check streak inside Today's Checklist, with a badge at the 7, 30 and 60 day milestones.
function StreakLine({ streak, doneToday }: { streak: StreakInfo; doneToday: boolean }) {
  const milestone = streakMilestone(streak.current);
  return (
    <div className="mb-3 rounded-lg border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <Flame />
          <span>Daily Check Streak: {plural(streak.current)}</span>
          {milestone && <span className="chip rounded-full bg-background px-2.5 py-0.5 text-xs text-caution">{milestone} Day Milestone</span>}
        </p>
        <p>Longest: {plural(streak.longest)}</p>
      </div>
      <p className="mt-1 text-sm">{doneToday ? "Done for today" : "Complete today's Daily Check to keep your streak"}</p>
    </div>
  );
}

// One line of a short history preview: day and status on the left, the follow-up text right-aligned on the same bar.
function PreviewRow({ day, status, follow }: { day: number; status: Cell; follow: string }) {
  const id = statusFromLabel(status);
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5">
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="w-20 font-mono">Day {day}</span>
        {id ? <StatusText status={id} /> : <span className="text-muted">{status}</span>}
      </span>
      {follow && <span className="text-muted">{follow}</span>}
    </li>
  );
}

function Dashboard({
  id, daily, blood, todayDaily, todayBlood, current, streak, go, goResults, goHistory, onReset,
}: {
  id: AstronautId; daily: DailyResult[]; blood: BloodResult[]; todayDaily?: DailyEntry; todayBlood?: BloodSample;
  current: StatusId; streak: StreakInfo; go: (tab: ChecksTab) => void; goResults: (tab: ChecksTab) => void; goHistory: (sub: HistorySub) => void; onReset: () => void;
}) {
  const a = getAstronaut(id);
  const latestDaily = daily.filter((d) => d.day < TODAY).slice(-1)[0];
  const latestBlood = blood.filter((b) => b.day > 0 && b.day < TODAY).slice(-1)[0];
  const { shown, isToday } = immuneShown(blood);
  const dailyRows = dailyHistoryTable(todayDaily ? [...a.daily, todayDaily] : a.daily, daily).rows.slice(-3);
  const bloodRows = bloodHistoryTable(blood).rows.slice(-3);
  const link = "mt-3 text-sm font-semibold text-accent-text underline";
  const mapPath = mapPathOf(blood, a.baseline);

  return (
    <div className="space-y-4">
      <Card title={`Today's Checklist, Mission Day ${TODAY}`} highlight>
        <StreakLine streak={streak} doneToday={!!todayDaily} />
        <ul className="space-y-3">
          <ChecklistRow done={!!todayDaily} title="Daily Check" onGo={() => go("daily")} onResults={() => goResults("daily")} />
          <ChecklistRow done={!!todayBlood} title="Blood Check" onGo={() => go("blood")} onResults={() => goResults("blood")} />
          <SurgeonRow status={current} />
        </ul>
        <button type="button" className="btn mt-3 !px-2.5 !py-1 !text-xs" onClick={onReset}>Reset Demo</button>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Immune Deviation Score" tip={<ImmuneTip />}>
          {shown?.immune ? (
            <>
              <p className="font-mono text-sm text-muted">
                {isToday ? `${a.name}, Mission Day ${TODAY}` : `Latest blood check, Mission Day ${shown.day}`}
              </p>
              <p className="mt-2"><ScoreNumber immune={shown.immune} big /></p>
              <p className="mt-2"><ImmuneBadge immune={shown.immune} /></p>
              <p className="mt-3 text-sm">{immuneMeaning(shown.immune.score)}</p>
            </>
          ) : <p className="text-sm text-muted">No scored blood check yet.</p>}
        </Card>
        <Card>
          <ImmuneStateMap path={mapPath} compact astronaut={id} exportName="immune-state-map" />
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title={`Latest Daily Status${latestDaily ? ` (Day ${latestDaily.day})` : ""}`}>
          {latestDaily ? (
            <>
              <StatusText status={latestDaily.status} big />
              <p className="mt-2 text-sm">{topReason(latestDaily.reasons)}</p>
            </>
          ) : <p className="text-sm text-muted">No daily check recorded.</p>}
        </Card>
        <Card title={`Latest Blood Status (Day ${latestBlood?.day ?? "None"})`}>
          {latestBlood ? (
            <>
              <StatusText status={latestBlood.status} big />
              <p className="mt-2 text-sm">{topReason(latestBlood.reasons)}</p>
            </>
          ) : <p className="text-sm text-muted">No in-flight blood check yet.</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Blood Check History">
          <ul className="divide-y divide-border text-sm">
            {bloodRows.map((r) => (
              <PreviewRow
                key={String(r["Mission Day"])} day={r["Mission Day"] as number} status={r.Status}
                follow={r["Immune Deviation Score (0 to 100)"] !== null ? `Immune Deviation Score ${r["Immune Deviation Score (0 to 100)"]}` : ""}
              />
            ))}
          </ul>
          <button type="button" className={link} onClick={() => goHistory("blood")}>View Full Health History</button>
        </Card>
        <Card title="Daily Check History">
          <ul className="divide-y divide-border text-sm">
            {dailyRows.map((r) => (
              <PreviewRow
                key={String(r["Mission Day"])} day={r["Mission Day"] as number} status={r.Status}
                follow={r["NEWS2 Total (points)"] !== null && r["NEWS2 Total (points)"] !== undefined ? `NEWS2 total ${r["NEWS2 Total (points)"]}` : r.Status === "Missed" ? "" : "No vital signs recorded"}
              />
            ))}
          </ul>
          <button type="button" className={link} onClick={() => goHistory("daily")}>View Full Health History</button>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Astronaut tabs 2 and 3: the forms
// ---------------------------------------------------------------------------

const FACES = [
  "M9 22 Q16 14 23 22", "M9 21 Q16 17 23 21", "M9 20 L23 20", "M9 19 Q16 24 23 19", "M8 18 Q16 28 24 18",
];

function MoodPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const Y = "var(--mood)";
  return (
    <div role="radiogroup" aria-label="Mood" className="flex gap-2">
      {FACES.map((mouth, i) => {
        const v = String(i + 1);
        const on = value === v;
        // Selected face: filled yellow with dark features. Others: yellow outline only.
        const ink = on ? "var(--background)" : Y;
        return (
          <button
            key={v} type="button" role="radio" aria-checked={on} aria-label={`Mood ${v} of 5`}
            onClick={() => onChange(on ? "" : v)}
            className="rounded-full p-0.5 hover:bg-accent/15"
          >
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <circle cx="16" cy="16" r="13" fill={on ? Y : "none"} stroke={Y} />
              <circle cx="11.5" cy="12.5" r="1" fill={ink} />
              <circle cx="20.5" cy="12.5" r="1" fill={ink} />
              <path d={mouth} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

function FillBar({ onDemo, demoLoaded, onCheck, onSubmit, canSubmit, note }: {
  onDemo: () => void; demoLoaded: boolean; onCheck: () => void; onSubmit: () => void; canSubmit: boolean; note?: string;
}) {
  return (
    <div className="mt-5 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button className="btn !border-2 !border-dotted" onClick={onDemo}>Demo - Fill Values</button>
        <button className="btn btn-primary" onClick={onCheck}>Check for Measurement Errors</button>
        <button className="btn btn-accent" onClick={onSubmit} disabled={!canSubmit}>Submit</button>
      </div>
      {demoLoaded && <p className="text-xs text-muted">Demo values loaded. Every field is filled.</p>}
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  );
}

const CHECK_HELP = "Press Check for Measurement Errors. Submit unlocks when no value shows a red X.";

const DAILY_FORM: { key: DailyField; step: string; dec: number; hint?: string }[] = [
  { key: "temp", step: "0.1", dec: 1 }, { key: "hr", step: "1", dec: 0 }, { key: "rr", step: "1", dec: 0 },
  { key: "spo2", step: "1", dec: 0 }, { key: "sbp", step: "1", dec: 0 }, { key: "dbp", step: "1", dec: 0 },
  { key: "sleepHours", step: "0.1", dec: 1 }, { key: "sleepQuality", step: "1", dec: 0, hint: "Scale 1 (very poor) to 5 (very good)" },
  { key: "sleepiness", step: "1", dec: 0, hint: "Scale 1 (extremely alert) to 9 (very sleepy)" },
];

function DailyForm({
  id, draft, setDraft, stored, onResults,
}: { id: AstronautId; draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; stored: Stored; onResults: () => void }) {
  const a = getAstronaut(id);
  const d = draft.daily;
  const sig = JSON.stringify(d);
  const checked = draft.dailyCheck?.sig === sig ? draft.dailyCheck : null;
  const filled = dailyFilled(d);
  const canSubmit = !!checked && filled > 0 && !hasRedX(checked.fields);
  const submitted = stored[id]?.daily;
  const [fresh, setFresh] = useState<string | null>(null); // field just re-measured
  const set = (patch: Partial<DailyDraft>) => { setFresh(null); setDraft((x) => ({ ...x, daily: { ...x.daily, ...patch } })); };
  const [demoLoaded, setDemoLoaded] = useState(false);

  // Measure Again: retake one measurement (a new plausible reading), then run the check again.
  const measureAgain = (key: DailyField) => {
    const next = { ...d, [key]: String(remeasureDaily(id, key, dailyNumbers(d))) };
    setDraft((x) => ({ ...x, daily: next, dailyCheck: { sig: JSON.stringify(next), fields: checkDaily(dailyNumbers(next), typicalDaily(id)) } }));
    setFresh(key);
  };

  // One demo set per astronaut: every field filled, one borderline, one concerning, one measurement error.
  const fill = () => {
    const f = fillDaily(id);
    const next = { ...EMPTY_DRAFT.daily, symptoms: f.symptoms };
    for (const k of NUM_KEYS) next[k] = str(f[k]);
    setDraft((x) => ({ ...x, daily: next }));
    setDemoLoaded(true);
  };

  return (
    <Card title="Daily Check">
      <p className="mb-4 text-sm text-muted">All fields are optional. Fill at least one to submit. Mission day {TODAY}.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DAILY_FORM.map(({ key, step, dec, hint }) => {
          const info = CONFIG.tooltips.fields[key];
          // Scored vitals show the same normal range the results and charts use.
          const isVital = key === "temp" || key === "hr" || key === "rr" || key === "spo2" || key === "sbp";
          let usual = "";
          if (isVital) {
            const [lo, hi] = vitalBand(key, a.daily, TODAY);
            usual = key === "sbp" ? `Normal range today: ${lo} or more` : `Normal range today: ${fmtRange(lo, hi, dec)}`;
          } else {
            const [lo, hi] = usualDaily(id, key, TODAY);
            usual = `Your usual range today: ${fmtRange(lo, hi, dec)}`;
          }
          return (
            <FormField
              key={key} id={`d-${key}`} fieldKey={key} label={info.label} info={info}
              hint={hint ?? usual} check={checked?.fields[key]} onMeasureAgain={() => measureAgain(key)}
              note={fresh === key ? "New measurement taken" : undefined}
            >
              <input id={`d-${key}`} className="input" type="number" inputMode="decimal" step={step} value={d[key]} onChange={(e) => set({ [key]: e.target.value })} />
            </FormField>
          );
        })}
        <FormField id="d-mood" fieldKey="mood" label="Mood" info={CONFIG.tooltips.fields.mood} hint="Charted only, never scored" check={checked?.fields.mood}>
          <MoodPicker value={d.mood} onChange={(v) => set({ mood: v })} />
        </FormField>
      </div>
      <fieldset className="mt-5">
        <legend className="flex items-center gap-2 text-sm font-semibold">Symptoms <InfoTip info={CONFIG.tooltips.fields.symptoms} fieldKey="symptoms" /></legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SYMPTOMS.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={d.symptoms.includes(s)} onChange={(e) => set({ symptoms: e.target.checked ? [...d.symptoms, s] : d.symptoms.filter((x) => x !== s) })} />
              {s}
            </label>
          ))}
        </div>
      </fieldset>
      <FillBar
        onDemo={fill} demoLoaded={demoLoaded}
        onCheck={() => setDraft((x) => ({ ...x, dailyCheck: { sig, fields: checkDaily(dailyNumbers(x.daily), typicalDaily(id)) } }))}
        onSubmit={() => { saveEntry(stored, id, { daily: dailyEntry(d) }); onResults(); }}
        canSubmit={canSubmit}
        note={
          filled === 0 ? "Enter at least one value to continue."
            : !checked ? CHECK_HELP
              : hasRedX(checked.fields) ? "Fix the values marked with a red X, then check again." : "Checked. You can submit."
        }
      />
      {submitted && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-accent/15 p-3 text-sm">
          <MarkIcon mark="ok" /> Daily Check submitted for day {TODAY}.
          <button className="btn btn-primary" onClick={onResults}>View Today&apos;s Results</button>
        </div>
      )}
    </Card>
  );
}

function BloodForm({
  id, draft, setDraft, stored, onResults,
}: { id: AstronautId; draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; stored: Stored; onResults: () => void }) {
  const a = getAstronaut(id);
  const b = draft.blood;
  const sig = JSON.stringify(b);
  const checked = draft.bloodCheck?.sig === sig ? draft.bloodCheck : null;
  const input = bloodInput(b);
  const canSubmit = !!checked && input.wbc !== undefined && !hasRedX(checked.fields);
  const submitted = stored[id]?.blood;
  const set = (patch: Partial<BloodDraft>) => { setFresh(null); setDraft((x) => ({ ...x, blood: { ...x.blood, ...patch } })); };
  const nlr = input.neu !== undefined && input.lym ? input.neu / input.lym : undefined;
  const nlrRange = expectedFor("NLR", a.baseline, TODAY);

  const [demoLoaded, setDemoLoaded] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null); // field just re-measured

  // Measure Again: retake one count (a new plausible reading), then run the check again.
  const measureAgain = (k: (typeof BLOOD_KEYS)[number]) => {
    const next = { ...b, [k]: String(remeasureBlood(a, k, input)) };
    setDraft((x) => ({ ...x, blood: next, bloodCheck: { sig: JSON.stringify(next), fields: checkBlood(bloodInput(next), a.baseline) } }));
    setFresh(k);
  };

  // One demo set per astronaut: every field filled, one borderline, one concerning, one measurement error.
  const fill = () => {
    const f = fillBlood(a);
    setDraft((x) => ({ ...x, blood: { wbc: str(f.wbc), neu: str(f.neu), lym: str(f.lym), mon: str(f.mon), eos: str(f.eos) } }));
    setDemoLoaded(true);
  };

  return (
    <Card title="Blood Check">
      <p className="mb-1 text-sm text-muted">White cells are required, the other counts are optional. All values are {BLOOD_UNIT}. Mission day {TODAY}.</p>
      <p className="mb-4 text-xs text-muted">{CONFIG.spaceflight.source}. {CONFIG.blood.nlrNote}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BLOOD_KEYS.map((k) => {
          const m = k.toUpperCase() as "WBC" | "NEU" | "LYM" | "MON" | "EOS";
          const info = CONFIG.tooltips.fields[k];
          const e = expectedFor(m, a.baseline, TODAY);
          return (
            <FormField
              key={k} id={`b-${k}`} fieldKey={k} label={k === "eos" ? `${info.label} (${CONFIG.blood.watchLabel})` : info.label}
              info={info}
              hint={`Your usual range today: ${fmtRange(e.lo, e.hi, 2)}`} check={checked?.fields[k]}
              onMeasureAgain={() => measureAgain(k)} note={fresh === k ? "New measurement taken" : undefined}
            >
              <input id={`b-${k}`} className="input" type="number" inputMode="decimal" step="0.01" value={b[k]} onChange={(ev) => set({ [k]: ev.target.value })} />
            </FormField>
          );
        })}
        <div>
          <p className="text-sm font-semibold">Neutrophil to lymphocyte ratio (NLR, calculated)</p>
          <p className="mt-2 rounded-lg bg-accent/15 px-3 py-2 font-mono">{nlr !== undefined && Number.isFinite(nlr) ? nlr.toFixed(2) : "Needs neutrophils and lymphocytes"}</p>
          <p className="mt-1 text-xs text-muted">Your usual range today: {fmtRange(nlrRange.lo, nlrRange.hi, 2)}</p>
        </div>
      </div>
      <FillBar
        onDemo={fill} demoLoaded={demoLoaded}
        onCheck={() => setDraft((x) => ({ ...x, bloodCheck: { sig, fields: checkBlood(bloodInput(x.blood), a.baseline) } }))}
        onSubmit={() => { saveEntry(stored, id, { blood: { day: TODAY, wbc: input.wbc as number, neu: input.neu, lym: input.lym, mon: input.mon, eos: input.eos } }); onResults(); }}
        canSubmit={canSubmit}
        note={
          input.wbc === undefined ? "Enter white cells to continue."
            : !checked ? CHECK_HELP
              : hasRedX(checked.fields) ? "Fix the values marked with a red X, then check again." : "Checked. You can submit."
        }
      />
      {submitted && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-accent/15 p-3 text-sm">
          <MarkIcon mark="ok" /> Blood Check submitted for day {TODAY}.
          <button className="btn btn-primary" onClick={onResults}>View Today&apos;s Results</button>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Today's results, shown on the Today's Results page
// ---------------------------------------------------------------------------

const DAILY_ROWS: { key: DailyField; unit: string }[] = [
  { key: "temp", unit: "°C" }, { key: "hr", unit: "bpm" }, { key: "rr", unit: "per min" }, { key: "spo2", unit: "%" },
  { key: "sbp", unit: "mmHg" }, { key: "dbp", unit: "mmHg" }, { key: "sleepHours", unit: "hours" },
  { key: "sleepQuality", unit: "of 5" }, { key: "sleepiness", unit: "of 9" }, { key: "mood", unit: "of 5" },
];

function NoResultsYet({ kind, onChecks }: { kind: string; onChecks: () => void }) {
  return (
    <Card title="No Results Yet">
      <p className="text-sm">No {kind} has been done today, mission day {TODAY}. Do the check to see today&apos;s results here.</p>
      <button className="btn btn-primary mt-4" onClick={onChecks}>Go to Health Checks</button>
    </Card>
  );
}

function DailyResults({ entry, result }: { entry: DailyEntry; result: DailyResult }) {
  return (
    <Card title="Daily Check Results">
      <StatusText status={result.status} big />
      <p className="mt-2 text-sm">{result.message}</p>
      {result.notes.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm font-semibold">{result.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs text-muted"><tr><th className="py-1">Value</th><th>You Entered</th><th><span className="inline-flex items-center gap-1.5">NEWS2 Points <News2Tip /></span></th><th className="w-8"><span className="sr-only">Mark</span></th></tr></thead>
        <tbody>
          {DAILY_ROWS.filter((r) => entry[r.key] !== undefined).map((r) => {
            const part = result.parts.find((p) => p.key === r.key);
            const mark: Mark | undefined = result.marks[r.key];
            return (
              <tr key={r.key} className="border-t border-border">
                <td className="py-1.5">{CONFIG.tooltips.fields[r.key].label}</td>
                <td className="font-mono">{entry[r.key]} {r.unit}</td>
                <td className="font-mono">{part ? part.points : r.key === "mood" ? "not scored" : "recorded"}</td>
                <td>{mark && <MarkIcon mark={mark} />}</td>
              </tr>
            );
          })}
          {entry.symptoms.length > 0 && (
            <tr className="border-t border-border"><td className="py-1.5">Symptoms</td><td colSpan={2}>{entry.symptoms.join(", ")}</td><td><MarkIcon mark="warn" /></td></tr>
          )}
        </tbody>
      </table>
      {result.parts.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm"><b>NEWS2 total: <span className="font-mono">{result.total}</span></b> <News2Tip /> <span className="text-muted">{CONFIG.news2.label}</span></p>
      )}
      <h3 className="mt-4 text-sm font-semibold">Why</h3>
      <div className="mt-1"><WhyList reasons={result.reasons} /></div>
      <ActionList />
    </Card>
  );
}

function BloodResults({ id, result }: { id: AstronautId; result: BloodResult }) {
  const together = result.reasons.find((r) => r.text.startsWith("Together with"));
  return (
    <Card title="Blood Check Results">
      <StatusText status={result.status} big />
      <p className="mt-2 text-sm">{result.message}</p>
      {together && <p className="mt-1 rounded-md bg-background px-2 py-1 text-sm font-semibold text-alert">{together.text}</p>}
      <div className="mt-3 rounded-xl bg-accent/15 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">Immune Deviation Score <ImmuneTip /></p>
        {result.immune ? (
          <>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1"><ScoreNumber immune={result.immune} big /><ImmuneBadge immune={result.immune} /></p>
            <p className="mt-1 text-sm">{immuneMeaning(result.immune.score)}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">
            {result.kind === "retake" ? "Not scored. Retake the sample first." : "Enter at least one cell count (neutrophils, lymphocytes, monocytes or eosinophils) to get a score."}
          </p>
        )}
      </div>
      <div data-export className="mt-4 overflow-x-auto bg-surface">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Markers</h3>
          <ExportMenu astronaut={id} name="blood-check-markers" table={markersTable(result.markers)} />
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr><th className="py-1">Marker</th><th>You Entered</th><th>Your Usual Range Today</th><th>Difference</th><th className="w-8"><span className="sr-only">Mark</span></th></tr>
          </thead>
          <tbody>
            {result.markers.map((m) => (
              <tr key={m.marker} className="border-t border-border">
                <td className="py-1.5">{MARKER_NAMES[m.marker]}{m.marker === CONFIG.blood.watchMarker && <span className="block text-xs text-muted">{CONFIG.blood.watchLabel}</span>}</td>
                <td className="font-mono">{fmtMarker(m.value)}</td>
                <td className="font-mono">{fmtRange(m.lo, m.hi, 2)}</td>
                <td className="font-mono">{m.pctDiff >= 0 ? "+" : ""}{Math.round(m.pctDiff)}%</td>
                <td><MarkIcon mark={m.mark} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Counts are {BLOOD_UNIT}. {CONFIG.spaceflight.source}. {CONFIG.blood.nlrNote}</p>
      <h3 className="mt-4 text-sm font-semibold">Why</h3>
      <div className="mt-1"><WhyList reasons={result.reasons} /></div>
      <ActionList />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Astronaut view (tabs)
// ---------------------------------------------------------------------------

// The pages of the astronaut view (see lib/nav.ts). My Health has four sub-tabs: Dashboard, Health Checks, Today's Results and Health History.
// Health Checks, Today's Results and Health History each hold a Daily and a Blood view behind the same shared toggle.
const MAIN_TABS: TabDef[] = [
  { id: "health", label: "My Health" },
  { id: "learn", label: "Learn" },
  { id: "replay", label: "Real Crew Replay" },
  { id: "emergency", label: "Emergency Mode", emergency: true },
];
const HEALTH_TABS: TabDef[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "checks", label: "Health Checks" },
  { id: "results", label: "Today's Results" },
  { id: "history", label: "Health History" },
];

function AstronautView({
  id, stored, draft, setDraft, demo, onReset,
}: { id: AstronautId; stored: Stored; draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; demo: ReactNode; onReset: () => void }) {
  // The open tab is kept in the address (?tab=learn) so a link opens the same tab, with no extra history entries.
  const params = useSearchParams();
  const pathname = usePathname();
  const [nav, setNav] = useState<NavState>(() => navFromParam(params.get("tab")));
  const [learnAnchor, setLearnAnchor] = useState<string | null>(null);
  const [learnKey, setLearnKey] = useState(0); // a new key reopens the Learn tab at the new place
  const [scenario, setScenario] = useState<string | null>(null);
  const [emergencyKey, setEmergencyKey] = useState(0);
  const [historySub, setHistorySub] = useState<HistorySub>("daily");
  const view = nav.view;
  useEffect(() => {
    if (params.get("tab") === view) return;
    const next = new URLSearchParams(params.toString());
    next.set("tab", view);
    // The Next.js router keeps useSearchParams in step with this call (see single-page-applications.md). router.replace was tried
    // first, but in a production build a page that was opened with a query string keeps that first address, so tab changes
    // never reached the URL.
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
  }, [view, params, pathname]);
  const a = getAstronaut(id);
  const entry = stored[id]?.daily;
  const todayBlood = stored[id]?.blood;

  // History plus whatever the judge submitted for day 60.
  const dailyAll = useMemo(() => (entry ? [...a.daily, entry] : a.daily), [a, entry]);
  const bloodAll = useMemo(() => (todayBlood ? [...a.blood, todayBlood] : a.blood), [a, todayBlood]);
  const daily = useMemo(() => evaluateDailySeries(dailyAll), [dailyAll]);
  const blood = useMemo(() => evaluateBloodSeries(bloodAll, dailyAll).results, [bloodAll, dailyAll]);
  const goHistory = (sub: HistorySub) => { setHistorySub(sub); setNav((n) => ({ ...n, view: "history" })); };
  // Daily Check streak: the preloaded days plus today's check once submitted.
  const streak = useMemo(() => dailyStreak(dailyAll.map((d) => d.day)), [dailyAll]);
  // Learn More buttons in the popups and search results: open the Learn tab and scroll to the matching place.
  const goLearn = (anchor: string | null) => { setLearnAnchor(anchor); setLearnKey((k) => k + 1); setNav((n) => ({ ...n, view: "learn" })); };
  const goEmergency = (sid: string | null = null) => { setScenario(sid); setEmergencyKey((k) => k + 1); setNav((n) => ({ ...n, view: "emergency" })); };
  const onTab = (t: string) => {
    if (t === "learn") goLearn(null);
    else if (t === "emergency") goEmergency();
    else if (t === "replay") setNav((n) => ({ ...n, view: "replay" }));
    else setNav((n) => ({ ...n, view: "dashboard" }));
  };
  const onSearchGo = (t: SearchTarget) => {
    if (t.kind === "learn") goLearn(t.id);
    else if (t.kind === "emergency") goEmergency(t.scenario ?? null);
    else if (t.page === "emergency") goEmergency();
    else setNav((n) => openPage(n, t.page));
  };
  const ask = useAsk(onSearchGo);

  // See Flight Surgeon: the status carried over from the preloaded history, raised (never lowered) by today's results.
  const carried = useMemo(() => { const h = historyOf(id); return carriedOver(h.daily, h.blood); }, [id]);
  const current = maxStatus([
    carried,
    entry ? (daily.find((d) => d.day === TODAY)?.status ?? "normal") : "normal",
    todayBlood ? (blood.find((b) => b.day === TODAY)?.status ?? "normal") : "normal",
  ]);
  const toDashboard = () => setNav((n) => ({ ...n, view: "dashboard" }));
  const toResults = (tab: ChecksTab) => () => setNav((n) => openResults(n, tab));
  const todayDaily = daily.find((d) => d.day === TODAY);
  const todayBloodResult = blood.find((b) => b.day === TODAY);

  return (
    <>
      <SiteHeader
        demo={demo}
        nav={<NavTabs label="HemoScope" tabs={MAIN_TABS} active={isHealth(view) ? "health" : view} onChange={onTab} />}
        search={<AskForm ask={ask} />}
      />
      <div className={`transition-[padding] duration-200 ${ask.open ? "lg:pr-[400px]" : ""}`}>
      <PageMain>
        <LearnProvider value={goLearn}>
        <div className="space-y-4">
          {view !== "replay" && (
            <div>
              <h1 className="font-heading text-2xl font-bold">{a.name}</h1>
              <p className="text-sm text-muted">
                Mission day {TODAY}. Days 1 to {LAST_HISTORY_DAY} are already recorded. Check the Dashboard to view your health monitoring checklist.
              </p>
            </div>
          )}
          {isHealth(view) && (
            <Tabs tabs={HEALTH_TABS} active={view} onChange={(t) => (t === "history" ? goHistory(historySub) : setNav((n) => ({ ...n, view: t as NavState["view"] })))} />
          )}
          {view !== "replay" && <p className="text-xs text-muted">{DATA_NOTE}</p>}

          {view === "dashboard" && (
            <Dashboard
              id={id} daily={daily} blood={blood} todayDaily={entry} todayBlood={todayBlood} current={current} streak={streak}
              go={(tab) => setNav((n) => openChecks(n, tab))} goResults={(tab) => setNav((n) => openResults(n, tab))} goHistory={goHistory} onReset={() => { toDashboard(); onReset(); }}
            />
          )}
          {view === "checks" && (
            <div className="space-y-4">
              <CheckTypeToggle label="Choose a health check" value={nav.checks} onChange={(t) => setNav((n) => openChecks(n, t))} />
              {nav.checks === "daily" ? (
                <DailyForm id={id} draft={draft} setDraft={setDraft} stored={stored} onResults={toResults("daily")} />
              ) : (
                <BloodForm id={id} draft={draft} setDraft={setDraft} stored={stored} onResults={toResults("blood")} />
              )}
            </div>
          )}
          {view === "results" && (
            <div className="space-y-4">
              <CheckTypeToggle label="Choose which results to show" value={nav.results} onChange={(t) => setNav((n) => openResults(n, t))} />
              {nav.results === "daily" ? (
                entry && todayDaily ? <DailyResults entry={entry} result={todayDaily} /> : <NoResultsYet kind="Daily Check" onChecks={() => setNav((n) => openChecks(n, "daily"))} />
              ) : (
                todayBlood && todayBloodResult ? <BloodResults id={id} result={todayBloodResult} /> : <NoResultsYet kind="Blood Check" onChecks={() => setNav((n) => openChecks(n, "blood"))} />
              )}
            </div>
          )}
          {view === "history" && (
            <HealthHistory
              id={id} entries={dailyAll} dailyResults={daily} bloodResults={blood} todayDaily={entry} todayBlood={todayBlood}
              lastDay={LAST_HISTORY_DAY} sub={historySub} onSub={setHistorySub}
            />
          )}
          {view === "learn" && <LearnView key={learnKey} anchor={learnAnchor} blood={blood} daily={daily} onEmergency={() => goEmergency()} onSearch={ask.glassPress} />}
          {view === "replay" && <ReplayView />}
          {view === "emergency" && <EmergencyAstronaut key={emergencyKey} initial={scenario ?? undefined} />}
        </div>
        </LearnProvider>
      </PageMain>
      </div>
      <AskPanel ask={ask} />
      <AskTab ask={ask} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Flight surgeon view (history only, never changes when a judge submits data)
// ---------------------------------------------------------------------------

const SURGEON_TABS: TabDef[] = [
  { id: "crew", label: "Crew" },
  { id: "detail", label: "Astronaut Detail" },
  { id: "emergency", label: "Emergency Mode", emergency: true },
];
const DETAIL_TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "Health History" },
];

// History results for one astronaut, computed from days up to 59 only.
function historyOf(id: AstronautId) {
  const a = getAstronaut(id);
  const daily = evaluateDailySeries(a.daily);
  const blood = evaluateBloodSeries(a.blood, a.daily).results;
  return { a, daily, blood };
}

function CrewOverview() {
  const rows = ASTRONAUT_IDS.map((id) => {
    const { a, daily, blood } = historyOf(id);
    const d = daily[daily.length - 1];
    const b = blood.filter((x) => x.day > 0).slice(-1)[0];
    const overall = carriedOver(daily, blood); // the same status the astronaut's checklist starts from
    const reasonSource = b && STATUS_RANK[b.status] > STATUS_RANK[d.status] ? b : d;
    const streak = dailyStreak(a.daily.map((x) => x.day));
    return { a, d, b, overall, reason: topReason(reasonSource.reasons), immune: b?.immune ?? null, streak };
  }).sort((x, y) => STATUS_RANK[y.overall] - STATUS_RANK[x.overall] || x.a.id.localeCompare(y.a.id));
  const exportRows: CrewRow[] = rows.map((r) => ({
    astronaut: r.a.name, overall: r.overall, surgeonVisit: SURGEON_VISIT_TEXT[surgeonVisit(r.overall)], dailyDay: r.d.day, dailyStatus: r.d.status,
    bloodDay: r.b?.day ?? null, bloodStatus: r.b?.status ?? null, immune: r.immune?.score ?? null, reason: r.reason,
    streak: r.streak.current, lastCheckDay: r.streak.lastDay, missedFlag: r.streak.missedInRow >= MISSED_FLAG_DAYS,
  }));

  return (
    <div data-export className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Status as of day {LAST_HISTORY_DAY}, most urgent first. This view never changes when an astronaut submits data.</p>
        <ExportMenu astronaut="crew" name="crew-table" table={crewTable(exportRows)} />
      </div>
      {rows.map(({ a, d, b, overall, reason, immune, streak }) => (
        <Card key={a.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="font-heading flex flex-wrap items-center gap-3 text-lg font-bold">
              {a.name}
              {streak.missedInRow >= MISSED_FLAG_DAYS && (
                <span className="chip inline-flex items-center gap-1.5 rounded-lg bg-background px-2.5 py-1 text-sm text-alert">
                  <MarkIcon mark="high" />Missed Daily Checks ({streak.missedInRow} in a row)
                </span>
              )}
            </h2>
            <StatusText status={overall} big />
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs text-muted">Streak</dt><dd className="font-semibold">{plural(streak.current)} <span className="font-normal text-muted">(longest {plural(streak.longest)})</span></dd></div>
            <div>
              <dt className="text-xs text-muted">Last Daily Check</dt>
              <dd className="font-semibold">{streak.lastDay === null ? "None" : `Day ${streak.lastDay}`} <span className="font-normal text-muted">{streak.lastDay === null ? "" : TODAY - streak.lastDay === 1 ? "(yesterday)" : `(${TODAY - streak.lastDay} days ago)`}</span></dd>
            </div>
            <div><dt className="text-xs text-muted">See flight surgeon</dt><dd className="font-semibold">{SURGEON_VISIT_TEXT[surgeonVisit(overall)]}</dd></div>
            <div><dt className="text-xs text-muted">Latest daily status (day {d.day})</dt><dd><StatusText status={d.status} /></dd></div>
            <div><dt className="text-xs text-muted">Latest blood status (day {b?.day ?? "none"})</dt><dd>{b ? <StatusText status={b.status} /> : "None"}</dd></div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted">Immune Deviation Score (day {b?.day ?? "none"}) <ImmuneTip /></dt>
              <dd>{immune ? <span className="flex flex-wrap items-center gap-x-2"><ScoreNumber immune={immune} /><ImmuneBadge immune={immune} /></span> : "None"}</dd>
            </div>
            <div><dt className="text-xs text-muted">Top reason</dt><dd>{reason}</dd></div>
          </dl>
        </Card>
      ))}
    </div>
  );
}

function AstronautPicker({ id, setId }: { id: AstronautId; setId: (id: AstronautId) => void }) {
  return (
    <div role="tablist" aria-label="Choose an astronaut" className="flex flex-wrap gap-2">
      {ASTRONAUT_IDS.map((x) => (
        <button key={x} role="tab" aria-selected={id === x} onClick={() => setId(x)} className={`btn ${id === x ? "btn-primary" : ""}`}>Astronaut {x}</button>
      ))}
    </div>
  );
}

function AstronautDetail({ id }: { id: AstronautId }) {
  const { a, daily, blood } = historyOf(id);
  const events = flaggedEvents(daily, blood);
  const latest = blood.filter((x) => x.day > 0 && x.immune).slice(-1)[0];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{a.name}. History up to day {LAST_HISTORY_DAY}.</p>
      <Card title="Flagged Events" exportMenu={<ExportMenu astronaut={id} name="flagged-events" table={flaggedTable(events)} />}>
        {events.length === 0 ? <p className="text-sm text-muted">No flagged events.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-1">Day</th><th>Check</th><th>Status</th><th>Reason</th></tr></thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="py-1.5 font-mono">{e.day}</td>
                    <td className="pr-3">{e.kind}</td>
                    <td className="pr-3"><StatusText status={e.status} /></td>
                    <td>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Immune Deviation Score" tip={<ImmuneTip />}>
        {latest?.immune ? (
          <>
            <p className="font-mono text-sm text-muted">Latest blood check, day {latest.day}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1"><ScoreNumber immune={latest.immune} /><ImmuneBadge immune={latest.immune} /></p>
            <p className="mt-1 text-sm">{immuneMeaning(latest.immune.score)}</p>
          </>
        ) : <p className="text-sm text-muted">No scored blood check yet.</p>}
      </Card>
      <Card><ImmuneStateMap path={mapPathOf(blood, a.baseline)} astronaut={id} /></Card>
      <Card title="Numbers Explained">
        <NumbersExplained blood={blood} daily={daily} />
      </Card>
    </div>
  );
}

// Health History for the astronaut chosen in Astronaut Detail. Always history up to day 59.
function SurgeonHistory({ id, sub, onSub }: { id: AstronautId; sub: HistorySub; onSub: (s: HistorySub) => void }) {
  const { a, daily, blood } = historyOf(id);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{a.name}, history up to day {LAST_HISTORY_DAY}. Change the astronaut above.</p>
      <HealthHistory id={id} entries={a.daily} dailyResults={daily} bloodResults={blood} lastDay={LAST_HISTORY_DAY} sub={sub} onSub={onSub} />
    </div>
  );
}

function SurgeonView({ demo }: { demo: ReactNode }) {
  const [tab, setTab] = useState("crew");
  const [detailSub, setDetailSub] = useState("overview");
  const [id, setId] = useState<AstronautId>("A");
  const [sub, setSub] = useState<HistorySub>("daily");
  return (
    <>
      <SiteHeader demo={demo} nav={<NavTabs label="HemoScope" tabs={SURGEON_TABS} active={tab} onChange={setTab} />} />
      <PageMain>
        <div className="space-y-4">
          <h1 className="font-heading text-2xl font-bold">Flight Surgeon</h1>
          {tab === "detail" && (
            <>
              <AstronautPicker id={id} setId={setId} />
              <Tabs tabs={DETAIL_TABS} active={detailSub} onChange={setDetailSub} />
            </>
          )}
          <p className="text-xs text-muted">{DATA_NOTE}</p>
          {tab === "crew" && <CrewOverview />}
          {tab === "detail" && detailSub === "overview" && <AstronautDetail id={id} />}
          {tab === "detail" && detailSub === "history" && <SurgeonHistory id={id} sub={sub} onSub={setSub} />}
          {tab === "emergency" && <EmergencySurgeon />}
        </div>
      </PageMain>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page shell: start popup, switcher, banner
// ---------------------------------------------------------------------------

export default function Home() {
  const [who, setWho] = useState<Who | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<AstronautId, Draft>>>({});
  const stored = useStored();

  const draftOf = (id: AstronautId) => drafts[id] ?? EMPTY_DRAFT;
  const setDraft = (id: AstronautId) => (f: (d: Draft) => Draft) => setDrafts((all) => ({ ...all, [id]: f(all[id] ?? EMPTY_DRAFT) }));
  const reset = (id: AstronautId) => {
    clearEntries(stored, id);
    setDrafts((all) => ({ ...all, [id]: EMPTY_DRAFT }));
  };

  const demo = who && (
    <label className="flex items-center gap-2 whitespace-nowrap">
      <span className="text-foreground">View As</span>
      <select className="strip-ctl" value={who} onChange={(e) => setWho(e.target.value as Who)}>
        {ASTRONAUT_IDS.map((id) => <option key={id} value={id}>Astronaut {id}</option>)}
        <option value="surgeon">Flight Surgeon</option>
      </select>
    </label>
  );

  return (
    <div className="min-h-screen">
      {who === "surgeon" && <SurgeonView demo={demo} />}
      {who && who !== "surgeon" && (
        <Suspense fallback={<SiteHeader />}>
          <AstronautView key={who} id={who} stored={stored} draft={draftOf(who)} setDraft={setDraft(who)} demo={demo} onReset={() => reset(who)} />
        </Suspense>
      )}
      {!who && <SiteHeader />}

      {!who && (
        <Modal title="Who Do You Want to View the App As?">
          <p className="mt-1 text-sm text-muted">Today is day {TODAY} of the mission. Check the HemoScope Dashboard to view your health monitoring checklist.</p>
          <div className="mt-4 grid gap-2">
            {ASTRONAUT_IDS.map((id) => (
              <button key={id} className="choice" onClick={() => setWho(id)}>{getAstronaut(id).name}</button>
            ))}
            <button className="choice" onClick={() => setWho("surgeon")}>Flight Surgeon</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

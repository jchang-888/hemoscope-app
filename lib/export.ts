// Export helpers: build a table, turn it into CSV or JSON, and download a table or a chart as a file.
// The table builders are pure functions so they can be tested. The download helpers run only in the browser.

import { CONFIG } from "./config";
import {
  MARKER_NAMES, STATUS_TEXT, type BloodResult, type DailyEntry, type DailyResult, type FlaggedEvent, type MarkerResult,
  type StatusId,
} from "./engine";

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export type Cell = string | number | null;
// `columns` are the column names (units included). Each row is an object keyed by those names.
export type Table = { columns: string[]; rows: Record<string, Cell>[] };

const csvCell = (v: Cell): string => {
  if (v === null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// CSV with a header row, then one line per row. Cells with commas, quotes or line breaks are quoted.
export function toCsv(t: Table): string {
  const lines = [t.columns.map(csvCell).join(",")];
  for (const r of t.rows) lines.push(t.columns.map((c) => csvCell(r[c] ?? null)).join(","));
  return lines.join("\n") + "\n";
}

// JSON: the same rows as an array of objects.
export const toJson = (t: Table): string => JSON.stringify(t.rows.map((r) => Object.fromEntries(t.columns.map((c) => [c, r[c] ?? null]))), null, 2) + "\n";

const pad = (n: number) => String(n).padStart(2, "0");
// Local date as YYYY-MM-DD.
export const isoDate = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// hemoscope_<astronaut>_<table>_<YYYY-MM-DD>.<ext>
export function exportFileName(astronaut: string, table: string, ext: "png" | "csv" | "json", date: Date = new Date()): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `hemoscope_${slug(astronaut)}_${slug(table)}_${isoDate(date)}.${ext}`;
}

const statusLabel = (s: StatusId) => STATUS_TEXT[s].label;

// Blood Check History: one row per blood check, the same rows the Dashboard shows (preflight sample errors stay hidden).
export const FORECAST_AS_EXPECTED = "As expected";
export const FORECAST_NOT_EXPECTED = "Not what we expected";

export function bloodHistoryTable(results: BloodResult[]): Table {
  const columns = [
    "Mission Day", "Status", "Immune Deviation Score (0 to 100)", "White Cells (10^9/L)", "Neutrophils (10^9/L)",
    "Lymphocytes (10^9/L)", "Monocytes (10^9/L)", "Eosinophils (10^9/L)", "NLR (ratio)", "Forecast", "Note",
  ];
  const rows = results.filter((b) => !(b.kind === "retake" && b.day <= 0)).map((b): Record<string, Cell> => {
    const s = b.sample;
    const nlr = s.neu !== undefined && s.lym ? Math.round((s.neu / s.lym) * 100) / 100 : null;
    return {
      "Mission Day": b.day,
      Status: b.kind === "retake" ? statusLabel("retake") : b.kind === "baseline" ? "Preflight baseline" : statusLabel(b.status),
      "Immune Deviation Score (0 to 100)": b.immune?.score ?? null,
      "White Cells (10^9/L)": s.wbc,
      "Neutrophils (10^9/L)": s.neu ?? null,
      "Lymphocytes (10^9/L)": s.lym ?? null,
      "Monocytes (10^9/L)": s.mon ?? null,
      "Eosinophils (10^9/L)": s.eos ?? null,
      "NLR (ratio)": nlr,
      Forecast: b.forecast ? (b.forecast.expected ? FORECAST_AS_EXPECTED : FORECAST_NOT_EXPECTED) : "",
      Note: b.kind === "retake" ? "Sample error" : b.kind === "baseline" ? "Used for your baseline" : "",
    };
  });
  return { columns, rows };
}

export const MISSED_LABEL = "Missed";

// Daily Check History: one row per day, from day 1 to the last finished day (or today once a check is submitted), with every
// value entered that day. A day with no check is a "Missed" row.
export function dailyHistoryTable(entries: DailyEntry[], results: DailyResult[], upTo: number = CONFIG.mission.today - 1): Table {
  const columns = [
    "Mission Day", "Status", "NEWS2 Total (points)", "Temperature (°C)", "Heart Rate (bpm)", "Breathing Rate (per min)",
    "Oxygen Saturation (%)", "Systolic Pressure (mmHg)", "Diastolic Pressure (mmHg)", "Sleep (hours)", "Sleep Quality (1 to 5)",
    "Sleepiness (1 to 9)", "Mood (1 to 5)", "Symptoms",
  ];
  const byDay = new Map(entries.map((e) => [e.day, e]));
  const last = Math.max(upTo, ...entries.map((e) => e.day));
  const days = Array.from({ length: last }, (_, i) => i + 1);
  const rows = days.map((day): Record<string, Cell> => {
    const e = byDay.get(day);
    if (!e) return { "Mission Day": day, Status: MISSED_LABEL, Symptoms: "" };
    const r = results.find((x) => x.day === e.day);
    return {
      "Mission Day": e.day,
      Status: r ? statusLabel(r.status) : null,
      "NEWS2 Total (points)": r && r.parts.length > 0 ? r.total : null,
      "Temperature (°C)": e.temp ?? null,
      "Heart Rate (bpm)": e.hr ?? null,
      "Breathing Rate (per min)": e.rr ?? null,
      "Oxygen Saturation (%)": e.spo2 ?? null,
      "Systolic Pressure (mmHg)": e.sbp ?? null,
      "Diastolic Pressure (mmHg)": e.dbp ?? null,
      "Sleep (hours)": e.sleepHours ?? null,
      "Sleep Quality (1 to 5)": e.sleepQuality ?? null,
      "Sleepiness (1 to 9)": e.sleepiness ?? null,
      "Mood (1 to 5)": e.mood ?? null,
      Symptoms: e.symptoms.join("; "),
    };
  });
  return { columns, rows };
}

// Markers table on the Blood Check results. Each row is a different marker, so the unit has its own column.
export function markersTable(markers: MarkerResult[]): Table {
  const columns = ["Marker", "Unit", "You Entered", "Usual Range Low", "Usual Range High", "Difference (%)"];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rows = markers.map((m): Record<string, Cell> => ({
    Marker: MARKER_NAMES[m.marker],
    Unit: m.marker === "NLR" ? "ratio" : "10^9/L",
    "You Entered": r2(m.value),
    "Usual Range Low": r2(m.lo),
    "Usual Range High": r2(m.hi),
    "Difference (%)": Math.round(m.pctDiff),
  }));
  return { columns, rows };
}

export type CrewRow = {
  astronaut: string; overall: StatusId; surgeonVisit: string; dailyDay: number; dailyStatus: StatusId;
  bloodDay: number | null; bloodStatus: StatusId | null; immune: number | null; reason: string;
  streak: number; lastCheckDay: number | null; missedFlag: boolean;
};

// Flight surgeon crew table: one row per astronaut.
export function crewTable(crew: CrewRow[]): Table {
  const columns = [
    "Astronaut", "Overall Status", "See Flight Surgeon", "Streak (days)", "Last Daily Check (mission day)", "Missed Daily Checks",
    "Latest Daily Status", "Latest Blood Check (mission day)", "Latest Blood Status", "Immune Deviation Score (0 to 100)", "Top Reason",
  ];
  const rows = crew.map((c): Record<string, Cell> => ({
    Astronaut: c.astronaut,
    "Overall Status": statusLabel(c.overall),
    "See Flight Surgeon": c.surgeonVisit,
    "Streak (days)": c.streak,
    "Last Daily Check (mission day)": c.lastCheckDay,
    "Missed Daily Checks": c.missedFlag ? "Yes" : "No",
    "Latest Daily Status": statusLabel(c.dailyStatus),
    "Latest Blood Check (mission day)": c.bloodDay,
    "Latest Blood Status": c.bloodStatus ? statusLabel(c.bloodStatus) : null,
    "Immune Deviation Score (0 to 100)": c.immune,
    "Top Reason": c.reason,
  }));
  return { columns, rows };
}

// Flagged events table on the flight surgeon's astronaut detail.
export function flaggedTable(events: FlaggedEvent[]): Table {
  const columns = ["Mission Day", "Check", "Status", "Reason"];
  const rows = events.map((e): Record<string, Cell> => ({ "Mission Day": e.day, Check: e.kind, Status: statusLabel(e.status), Reason: e.reason }));
  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Downloads (browser only)
// ---------------------------------------------------------------------------

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTable(t: Table, format: "csv" | "json", astronaut: string, name: string) {
  const text = format === "csv" ? toCsv(t) : toJson(t);
  const type = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
  saveBlob(new Blob([text], { type }), exportFileName(astronaut, name, format));
}

// Marks parts of a card (the Export menu itself) that must not appear in the picture.
export const EXPORT_IGNORE = "data-export-ignore";

// Picture of a card or chart in the current theme. The background is the page color of the active theme.
// Scrolling parts marked data-export-expand (long tables) are opened up for the picture, then put back.
export async function downloadPng(node: HTMLElement, astronaut: string, name: string) {
  const { toBlob } = await import("html-to-image");
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--background").trim() || undefined;
  const scrollers = [...node.querySelectorAll<HTMLElement>("[data-export-expand]")];
  const saved = scrollers.map((e) => [e.style.maxHeight, e.style.overflow] as const);
  const savedWidth = node.style.width;
  scrollers.forEach((e) => { e.style.maxHeight = "none"; e.style.overflow = "visible"; });
  if (scrollers.length) node.style.width = `${Math.max(node.scrollWidth, node.clientWidth)}px`;
  try {
    const blob = await toBlob(node, {
      backgroundColor: bg,
      pixelRatio: 2,
      cacheBust: true,
      filter: (n) => !(n instanceof HTMLElement && n.hasAttribute(EXPORT_IGNORE)),
    });
    if (!blob) throw new Error("Could not create the picture");
    saveBlob(blob, exportFileName(astronaut, name, "png"));
  } finally {
    scrollers.forEach((e, i) => { e.style.maxHeight = saved[i][0]; e.style.overflow = saved[i][1]; });
    node.style.width = savedWidth;
  }
}

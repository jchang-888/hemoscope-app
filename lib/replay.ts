// Real Crew Replay data: the four Inspiration4 crew members' blood checks at every timepoint in NASA OSDR OSD-569
// (data/raw/OSD-569_Complete_Blood_Count.csv). Counts are converted from cells per microliter to x10^3 per microliter,
// the unit the rest of the app uses. lib/replay.test.ts compares every row with the CSV. Crew IDs are as in the file.
//
// Each check is run through the same engine as the demo (lib/engine.ts and lib/ml.ts). Preflight checks (L-92, L-44, L-3) set
// the personal baseline. HemoScope has no landing or recovery multiplier (see the Learn tab), so every check after
// launch is compared with the personal baseline and gets no spaceflight adjustment.

import { evaluateBloodSeries, mapPathOf, type Baseline, type BloodResult, type BloodSample } from "./engine";
import type { MapPoint } from "./ml";
import type { CbcRow } from "./data";

export const REPLAY_SOURCE = { text: "NASA Open Science Data Repository, OSD-569 (Inspiration4 Complete Blood Count)", url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-569" };
export const REPLAY_INTRO = "These are real blood counts from the four Inspiration4 crew members (NASA OSDR OSD-569), run through HemoScope exactly as the app would during a mission.";

export const REPLAY_CREW = ["C001", "C002", "C003", "C004"] as const;
export type ReplayCrew = (typeof REPLAY_CREW)[number];

// Timepoints in the order they happened. The day is the number in the label (L-92 is -92, R+45 is 45).
export const REPLAY_TIMEPOINTS = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"] as const;
export type ReplayTimepoint = (typeof REPLAY_TIMEPOINTS)[number];

export type ReplayStage = "Preflight" | "Landing" | "Recovery";
export const REPLAY_STAGES: { stage: ReplayStage; timepoints: ReplayTimepoint[]; text: string }[] = [
  { stage: "Preflight", timepoints: ["L-92", "L-44", "L-3"], text: "Before launch. These checks set each crew member's personal baseline." },
  { stage: "Landing", timepoints: ["R+1"], text: "One day after return to Earth." },
  { stage: "Recovery", timepoints: ["R+45", "R+82", "R+194"], text: "45, 82 and 194 days after return." },
];
export const stageOf = (tp: ReplayTimepoint): ReplayStage => REPLAY_STAGES.find((s) => s.timepoints.includes(tp))!.stage;

export type ReplayRow = CbcRow & { crew: ReplayCrew; timepoint: ReplayTimepoint };

export const REPLAY_ROWS: ReplayRow[] = [
  { crew: "C001", timepoint: "L-92", day: -92, wbc: 5.4, neu: 2.349, lym: 2.241, mon: 0.481, eos: 0.259, bas: 0.07, neuPct: 43.5, lymPct: 41.5, monPct: 8.9, eosPct: 4.8, basPct: 1.3 },
  { crew: "C001", timepoint: "L-44", day: -44, wbc: 5.5, neu: 2.998, lym: 1.859, mon: 0.391, eos: 0.204, bas: 0.05, neuPct: 54.5, lymPct: 33.8, monPct: 7.1, eosPct: 3.7, basPct: 0.9 },
  { crew: "C001", timepoint: "L-3", day: -3, wbc: 7, neu: 3.57, lym: 2.667, mon: 0.553, eos: 0.161, bas: 0.049, neuPct: 51, lymPct: 38.1, monPct: 7.9, eosPct: 2.3, basPct: 0.7 },
  { crew: "C001", timepoint: "R+1", day: 1, wbc: 5, neu: 2.685, lym: 1.64, mon: 0.455, eos: 0.17, bas: 0.05, neuPct: 53.7, lymPct: 32.8, monPct: 9.1, eosPct: 3.4, basPct: 1 },
  { crew: "C001", timepoint: "R+45", day: 45, wbc: 4.9, neu: 2.2, lym: 2.146, mon: 0.368, eos: 0.127, bas: 0.059, neuPct: 44.9, lymPct: 43.8, monPct: 7.5, eosPct: 2.6, basPct: 1.2 },
  { crew: "C001", timepoint: "R+82", day: 82, wbc: 4.9, neu: 1.994, lym: 2.171, mon: 0.485, eos: 0.181, bas: 0.069, neuPct: 40.7, lymPct: 44.3, monPct: 9.9, eosPct: 3.7, basPct: 1.4 },
  { crew: "C001", timepoint: "R+194", day: 194, wbc: 4.9, neu: 2.391, lym: 1.847, mon: 0.392, eos: 0.221, bas: 0.049, neuPct: 48.8, lymPct: 37.7, monPct: 8, eosPct: 4.5, basPct: 1 },
  { crew: "C002", timepoint: "L-92", day: -92, wbc: 6.5, neu: 3.705, lym: 2.119, mon: 0.364, eos: 0.28, bas: 0.033, neuPct: 57, lymPct: 32.6, monPct: 5.6, eosPct: 4.3, basPct: 0.5 },
  { crew: "C002", timepoint: "L-44", day: -44, wbc: 5.4, neu: 2.873, lym: 1.982, mon: 0.302, eos: 0.211, bas: 0.032, neuPct: 53.2, lymPct: 36.7, monPct: 5.6, eosPct: 3.9, basPct: 0.6 },
  { crew: "C002", timepoint: "L-3", day: -3, wbc: 7.2, neu: 3.701, lym: 2.873, mon: 0.446, eos: 0.151, bas: 0.029, neuPct: 51.4, lymPct: 39.9, monPct: 6.2, eosPct: 2.1, basPct: 0.4 },
  { crew: "C002", timepoint: "R+1", day: 1, wbc: 5.5, neu: 3.328, lym: 1.54, mon: 0.435, eos: 0.16, bas: 0.039, neuPct: 60.5, lymPct: 28, monPct: 7.9, eosPct: 2.9, basPct: 0.7 },
  { crew: "C002", timepoint: "R+45", day: 45, wbc: 6.4, neu: 2.765, lym: 2.874, mon: 0.499, eos: 0.211, bas: 0.051, neuPct: 43.2, lymPct: 44.9, monPct: 7.8, eosPct: 3.3, basPct: 0.8 },
  { crew: "C002", timepoint: "R+82", day: 82, wbc: 5.3, neu: 3.132, lym: 1.701, mon: 0.345, eos: 0.09, bas: 0.032, neuPct: 59.1, lymPct: 32.1, monPct: 6.5, eosPct: 1.7, basPct: 0.6 },
  { crew: "C002", timepoint: "R+194", day: 194, wbc: 6.4, neu: 3.123, lym: 2.573, mon: 0.518, eos: 0.166, bas: 0.019, neuPct: 48.8, lymPct: 40.2, monPct: 8.1, eosPct: 2.6, basPct: 0.3 },
  { crew: "C003", timepoint: "L-92", day: -92, wbc: 9.6, neu: 0.0101, lym: 6.826, mon: 1.997, eos: 0.614, bas: 0.125, neuPct: 71.1, lymPct: 20.8, monPct: 6.4, eosPct: 1.3, basPct: 0.4 },
  { crew: "C003", timepoint: "L-44", day: -44, wbc: 9.3, neu: 6.408, lym: 2.083, mon: 0.632, eos: 0.13, bas: 0.047, neuPct: 68.9, lymPct: 22.4, monPct: 6.8, eosPct: 1.4, basPct: 0.5 },
  { crew: "C003", timepoint: "L-3", day: -3, wbc: 9.8, neu: 5.792, lym: 3.156, mon: 0.715, eos: 0.088, bas: 0.049, neuPct: 59.1, lymPct: 32.2, monPct: 7.3, eosPct: 0.9, basPct: 0.5 },
  { crew: "C003", timepoint: "R+1", day: 1, wbc: 7, neu: 4.088, lym: 2.086, mon: 0.658, eos: 0.14, bas: 0.028, neuPct: 58.4, lymPct: 29.8, monPct: 9.4, eosPct: 2, basPct: 0.4 },
  { crew: "C003", timepoint: "R+45", day: 45, wbc: 7.8, neu: 4.618, lym: 2.379, mon: 0.624, eos: 0.117, bas: 0.062, neuPct: 59.2, lymPct: 30.5, monPct: 8, eosPct: 1.5, basPct: 0.8 },
  { crew: "C003", timepoint: "R+82", day: 82, wbc: 8.8, neu: 4.576, lym: 3.247, mon: 0.73, eos: 0.176, bas: 0.07, neuPct: 52, lymPct: 36.9, monPct: 8.3, eosPct: 2, basPct: 0.8 },
  { crew: "C003", timepoint: "R+194", day: 194, wbc: 7.4, neu: 4.151, lym: 2.22, mon: 0.762, eos: 0.207, bas: 0.059, neuPct: 56.1, lymPct: 30, monPct: 10.3, eosPct: 2.8, basPct: 0.8 },
  { crew: "C004", timepoint: "L-92", day: -92, wbc: 7.7, neu: 4.766, lym: 1.786, mon: 0.87, eos: 0.2, bas: 0.077, neuPct: 61.9, lymPct: 23.2, monPct: 11.3, eosPct: 2.6, basPct: 1 },
  { crew: "C004", timepoint: "L-44", day: -44, wbc: 6.4, neu: 3.699, lym: 1.613, mon: 0.832, eos: 0.173, bas: 0.083, neuPct: 57.8, lymPct: 25.2, monPct: 13, eosPct: 2.7, basPct: 1.3 },
  { crew: "C004", timepoint: "L-3", day: -3, wbc: 10.6, neu: 6.318, lym: 2.947, mon: 0.965, eos: 0.276, bas: 0.095, neuPct: 59.6, lymPct: 27.8, monPct: 9.1, eosPct: 2.6, basPct: 0.9 },
  { crew: "C004", timepoint: "R+1", day: 1, wbc: 8.1, neu: 4.528, lym: 2.155, mon: 1.029, eos: 0.3, bas: 0.089, neuPct: 55.9, lymPct: 26.6, monPct: 12.7, eosPct: 3.7, basPct: 1.1 },
  { crew: "C004", timepoint: "R+45", day: 45, wbc: 6.8, neu: 3.618, lym: 1.938, mon: 0.898, eos: 0.258, bas: 0.088, neuPct: 53.2, lymPct: 28.5, monPct: 13.2, eosPct: 3.8, basPct: 1.3 },
  { crew: "C004", timepoint: "R+82", day: 82, wbc: 7.9, neu: 4.361, lym: 2.307, mon: 0.916, eos: 0.269, bas: 0.047, neuPct: 55.2, lymPct: 29.2, monPct: 11.6, eosPct: 3.4, basPct: 0.6 },
  { crew: "C004", timepoint: "R+194", day: 194, wbc: 8.3, neu: 4.2, lym: 2.639, mon: 0.988, eos: 0.374, bas: 0.1, neuPct: 50.6, lymPct: 31.8, monPct: 11.9, eosPct: 4.5, basPct: 1.2 },
];

const sampleOf = (r: ReplayRow): BloodSample => ({
  day: r.day, wbc: r.wbc, neu: r.neu, lym: r.lym, mon: r.mon, eos: r.eos, bas: r.bas,
  neuPct: r.neuPct, lymPct: r.lymPct, monPct: r.monPct, eosPct: r.eosPct, basPct: r.basPct,
  ...(r.day > 0 ? { phase: "preflight" as const } : {}), // back on Earth: no spaceflight adjustment
});

export type ReplayStep = {
  timepoint: ReplayTimepoint;
  stage: ReplayStage;
  row: ReplayRow;
  result: BloodResult; // status, Why list, Immune Deviation Score and forecast check from the engine
  path: MapPoint[]; // Immune State Map path up to and including this check (empty until the first check after preflight)
};

export type ReplayRun = { crew: ReplayCrew; baseline: Baseline | null; steps: ReplayStep[] };

// Runs one crew member's real checks through the engine, oldest first.
export function replayCrew(crew: ReplayCrew): ReplayRun {
  const rows = REPLAY_ROWS.filter((r) => r.crew === crew).sort((a, b) => a.day - b.day);
  const { baseline, results } = evaluateBloodSeries(rows.map(sampleOf));
  const label = new Map(rows.map((r) => [r.day, r.timepoint]));
  const steps = rows.map((row, i): ReplayStep => ({
    timepoint: row.timepoint, stage: stageOf(row.timepoint), row, result: results[i],
    path: mapPathOf(results.slice(0, i + 1), baseline).map((p) => ({ ...p, label: label.get(p.day) })),
  }));
  return { crew, baseline, steps };
}

const cache = new Map<ReplayCrew, ReplayRun>();
export function getReplay(crew: ReplayCrew): ReplayRun {
  if (!cache.has(crew)) cache.set(crew, replayCrew(crew));
  return cache.get(crew)!;
}

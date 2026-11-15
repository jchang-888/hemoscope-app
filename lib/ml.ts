// HemoScope machine learning. Models are trained offline by the scripts in scripts/ (see docs/MACHINE_LEARNING.md)
// and saved as JSON in lib/models/. Both run on the device with no connection needed.
// 1. Next blood check forecast: a Kalman filter per marker that predicts the next value and a 95% range.
// 2. Immune State Map: PCA turns a blood check into a point on a 2D map; a Gaussian mixture model learned from
//    healthy people gives the normal zones. Code here mirrors scripts/hemoscope_ml.py and scripts/train_state_map.py.

import forecastModel from "./models/forecast-model.json";
import stateMap from "./models/state-map.json";
import { expectedFor, phaseOf, type BloodSample, type Baseline, type Phase } from "./engine";
import { CONFIG, type Marker } from "./config";

const has = (n: number | undefined): n is number => typeof n === "number" && Number.isFinite(n);

// ---------------------------------------------------------------------------
// 1. Next blood check forecast
// ---------------------------------------------------------------------------

type CountKey = "wbc" | "neu" | "lym" | "mon" | "eos";
const MARKER_OF: Record<CountKey, Marker> = { wbc: "WBC", neu: "NEU", lym: "LYM", mon: "MON", eos: "EOS" };
const FORECAST_KEYS: CountKey[] = ["wbc", "neu", "lym", "mon", "eos"];
const countOf = (s: BloodSample, k: CountKey) => (k === "wbc" ? s.wbc : s[k]);

export type Forecast = { marker: Marker; day: number; expected: number; lo: number; hi: number };

const multiplierOn = (m: Marker, day: number, phase?: Phase) => CONFIG.spaceflight.phases[phase ?? phaseOf(day)].multiplier[m];

// Runs the filter through every usable sample (preflight first). Values are divided by the spaceflight multiplier
// so the filter tracks the astronaut's own level. Returns the forecast for `day` and, for each in-flight sample,
// the forecast that was made just before it (used to say whether a result was expected).
export function forecastSeries(samples: BloodSample[], day: number) {
  const fm = forecastModel as unknown as {
    driftVariancePer30Days: Record<CountKey, number>; measurementSd: Record<CountKey, number>; z: number;
  };
  const sorted = [...samples].sort((a, b) => a.day - b.day);
  const preflight = sorted.filter((s) => s.day <= 0);
  const flight = sorted.filter((s) => s.day > 0);
  const next: Forecast[] = [];
  const before: Record<number, Forecast[]> = {};
  for (const k of FORECAST_KEYS) {
    const m = MARKER_OF[k];
    const q = fm.driftVariancePer30Days[k];
    const r = fm.measurementSd[k];
    const pre = preflight.map((s) => countOf(s, k)).filter((v): v is number => has(v) && v > 0);
    if (pre.length < 2) continue;
    let level = pre.reduce((a, v) => a + Math.log(v), 0) / pre.length;
    let v = (r * r) / pre.length;
    let last = Math.max(...preflight.map((s) => s.day));
    const predict = (d: number, phase?: Phase): Forecast => {
      const vp = v + (q * Math.max(d - last, 0.1)) / 30;
      const sd = Math.sqrt(vp + r * r);
      const mean = level + Math.log(multiplierOn(m, d, phase));
      return { marker: m, day: d, expected: Math.exp(mean), lo: Math.exp(mean - fm.z * sd), hi: Math.exp(mean + fm.z * sd) };
    };
    for (const s of flight) {
      const val = countOf(s, k);
      if (!has(val) || val <= 0) continue;
      (before[s.day] ??= []).push(predict(s.day, s.phase));
      const vp = v + (q * Math.max(s.day - last, 0.1)) / 30;
      const gain = vp / (vp + r * r);
      level += gain * (Math.log(val / multiplierOn(m, s.day, s.phase)) - level);
      v = (1 - gain) * vp;
      last = s.day;
    }
    next.push(predict(day));
  }
  return { next, before };
}

// True when a value falls outside the range the forecast gave for it.
export const unexpected = (value: number, f: Forecast) => value < f.lo || value > f.hi;

// ---------------------------------------------------------------------------
// 2. Immune State Map
// ---------------------------------------------------------------------------

type StateMapModel = {
  markers: ("neu" | "lym" | "mon" | "eos")[];
  zSpread: number[];
  pcaMean: number[];
  axes: number[][];
  axisLabels: [string, string];
  mixture: { weights: number[]; means: number[][]; covariances: number[][][] };
  zoneLogDensity: Record<"0.5" | "0.9" | "0.99", number>;
  trainLogDensityQuantiles: number[];
  limit: number;
  contours: Record<"0.5" | "0.9" | "0.99", number[][][]>;
};
const SM = stateMap as unknown as StateMapModel;
const MAP_MARKERS: Marker[] = ["NEU", "LYM", "MON", "EOS"];

// How common a pattern is among healthy people's repeat checks. Not a status: status comes from the engine.
export type MapZone = "Very Common" | "Common" | "Uncommon" | "Rare";
export type MapPoint = {
  day: number;
  x: number; // axis 1: overall immune cell level (positive = all cell types higher than expected)
  y: number; // axis 2: neutrophil-lymphocyte balance (positive = neutrophils up, lymphocytes and eosinophils down)
  zone: MapZone;
  typicality: number; // 0 to 100: share of healthy checks that were further from the centre than this one
  label?: string; // shown instead of "Day N" when set (Real Crew Replay uses the file's timepoint, for example "R+45")
};

// z-scores against the astronaut's expected values for that day (same z as the Immune Deviation Score).
export function mapZ(s: BloodSample, baseline: Baseline): number[] | null {
  const vals = [s.neu, s.lym, s.mon, s.eos];
  if (vals.some((v) => !has(v) || (v as number) <= 0)) return null;
  return MAP_MARKERS.map((m, i) => {
    const e = expectedFor(m, baseline, s.day, s.phase);
    return Math.log((vals[i] as number) / e.expected) / e.sd;
  });
}

export function mapLogDensity(x: number, y: number): number {
  let total = 0;
  SM.mixture.weights.forEach((w, i) => {
    const [mx, my] = SM.mixture.means[i];
    const [[a, b], [, d]] = SM.mixture.covariances[i];
    const det = a * d - b * b;
    const dx = x - mx;
    const dy = y - my;
    const quad = (d * dx * dx - 2 * b * dx * dy + a * dy * dy) / det;
    total += (w * Math.exp(-0.5 * quad)) / (2 * Math.PI * Math.sqrt(det));
  });
  return Math.log(Math.max(total, 1e-300));
}

export function mapPointFromZ(z: number[], day: number): MapPoint {
  const c = z.map((v, i) => v / SM.zSpread[i] - SM.pcaMean[i]);
  const x = SM.axes[0].reduce((s, w, i) => s + w * c[i], 0);
  const y = SM.axes[1].reduce((s, w, i) => s + w * c[i], 0);
  const ld = mapLogDensity(x, y);
  const zl = SM.zoneLogDensity;
  const zone: MapZone = ld >= zl["0.5"] ? "Very Common" : ld >= zl["0.9"] ? "Common" : ld >= zl["0.99"] ? "Uncommon" : "Rare";
  const qs = SM.trainLogDensityQuantiles;
  let below = 0;
  while (below < qs.length - 1 && qs[below + 1] <= ld) below++;
  return { day, x, y, zone, typicality: ld < qs[0] ? 0 : below };
}

export function mapPoint(s: BloodSample, baseline: Baseline): MapPoint | null {
  const z = mapZ(s, baseline);
  return z ? mapPointFromZ(z, s.day) : null;
}

// The astronaut's path on the map: every in-flight blood check, oldest first.
export function mapPath(samples: BloodSample[], baseline: Baseline): MapPoint[] {
  return [...samples].filter((s) => s.day > 0).sort((a, b) => a.day - b.day)
    .map((s) => mapPoint(s, baseline)).filter((p): p is MapPoint => p !== null);
}

export const MAP_ZONE_TEXT: Record<MapZone, string> = {
  "Very Common": "Inside the zone that holds half of healthy people's repeat checks.",
  Common: "Inside the zone that holds 90% of healthy people's repeat checks.",
  Uncommon: "Between the 90% and 99% edges of healthy people's repeat checks.",
  Rare: "Beyond the edge that holds 99% of healthy people's repeat checks.",
};

export const MAP_GEOMETRY = { limit: SM.limit, contours: SM.contours, axisLabels: SM.axisLabels };

export const ML_METRICS = { forecast: forecastModel.metrics, stateMap: stateMap.metrics };

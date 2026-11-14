// Data for the demo: Inspiration4 preflight blood values, the four astronauts, and the seeded generator
// that builds each astronaut's simulated days 1 to 59. Logic lives in lib/engine.ts, numbers in lib/config.ts.
//
// Preflight blood: Inspiration4 crew, NASA OSDR OSD-569 (Complete Blood Count), L-92, L-44 and L-3.
// Counts are converted from cells per microliter to x10^3 per microliter. All in-flight data is simulated.

import { CONFIG, type Marker } from "./config";
import {
  baselineOf, expectedFor, geoMean, sampleProblems,
  type Baseline, type BloodInput, type BloodSample, type DailyEntry,
} from "./engine";

// ---------------------------------------------------------------------------
// Inspiration4 preflight blood values
// ---------------------------------------------------------------------------

export type CbcRow = {
  crew: string; // C001 to C004
  timepoint: string; // L-92, L-44 or L-3
  day: number; // mission day, negative before launch
  wbc: number; // all counts are x10^3 per microliter
  neu: number;
  lym: number;
  mon: number;
  eos: number;
  bas: number;
  neuPct: number; // percent of white cells
  lymPct: number;
  monPct: number;
  eosPct: number;
  basPct: number;
};

// Lab reference ranges from the source file (the same for every sample), x10^3 per microliter.
export const LAB_RANGES = {
  wbc: { min: 3.8, max: 10.8 },
  neu: { min: 1.5, max: 7.8 },
  lym: { min: 0.85, max: 3.9 },
  mon: { min: 0.2, max: 0.95 },
  eos: { min: 0.015, max: 0.5 },
  bas: { min: 0, max: 0.2 },
};

export const INSPIRATION4: CbcRow[] = [
  { crew: "C001", timepoint: "L-3", day: -3, wbc: 7, neu: 3.57, lym: 2.667, mon: 0.553, eos: 0.161, bas: 0.049, neuPct: 51, lymPct: 38.1, monPct: 7.9, eosPct: 2.3, basPct: 0.7 },
  { crew: "C001", timepoint: "L-44", day: -44, wbc: 5.5, neu: 2.998, lym: 1.859, mon: 0.391, eos: 0.204, bas: 0.05, neuPct: 54.5, lymPct: 33.8, monPct: 7.1, eosPct: 3.7, basPct: 0.9 },
  { crew: "C001", timepoint: "L-92", day: -92, wbc: 5.4, neu: 2.349, lym: 2.241, mon: 0.481, eos: 0.259, bas: 0.07, neuPct: 43.5, lymPct: 41.5, monPct: 8.9, eosPct: 4.8, basPct: 1.3 },
  { crew: "C002", timepoint: "L-3", day: -3, wbc: 7.2, neu: 3.701, lym: 2.873, mon: 0.446, eos: 0.151, bas: 0.029, neuPct: 51.4, lymPct: 39.9, monPct: 6.2, eosPct: 2.1, basPct: 0.4 },
  { crew: "C002", timepoint: "L-44", day: -44, wbc: 5.4, neu: 2.873, lym: 1.982, mon: 0.302, eos: 0.211, bas: 0.032, neuPct: 53.2, lymPct: 36.7, monPct: 5.6, eosPct: 3.9, basPct: 0.6 },
  { crew: "C002", timepoint: "L-92", day: -92, wbc: 6.5, neu: 3.705, lym: 2.119, mon: 0.364, eos: 0.28, bas: 0.033, neuPct: 57, lymPct: 32.6, monPct: 5.6, eosPct: 4.3, basPct: 0.5 },
  { crew: "C003", timepoint: "L-3", day: -3, wbc: 9.8, neu: 5.792, lym: 3.156, mon: 0.715, eos: 0.088, bas: 0.049, neuPct: 59.1, lymPct: 32.2, monPct: 7.3, eosPct: 0.9, basPct: 0.5 },
  { crew: "C003", timepoint: "L-44", day: -44, wbc: 9.3, neu: 6.408, lym: 2.083, mon: 0.632, eos: 0.13, bas: 0.047, neuPct: 68.9, lymPct: 22.4, monPct: 6.8, eosPct: 1.4, basPct: 0.5 },
  { crew: "C003", timepoint: "L-92", day: -92, wbc: 9.6, neu: 0.0101, lym: 6.826, mon: 1.997, eos: 0.614, bas: 0.125, neuPct: 71.1, lymPct: 20.8, monPct: 6.4, eosPct: 1.3, basPct: 0.4 },
  { crew: "C004", timepoint: "L-3", day: -3, wbc: 10.6, neu: 6.318, lym: 2.947, mon: 0.965, eos: 0.276, bas: 0.095, neuPct: 59.6, lymPct: 27.8, monPct: 9.1, eosPct: 2.6, basPct: 0.9 },
  { crew: "C004", timepoint: "L-44", day: -44, wbc: 6.4, neu: 3.699, lym: 1.613, mon: 0.832, eos: 0.173, bas: 0.083, neuPct: 57.8, lymPct: 25.2, monPct: 13, eosPct: 2.7, basPct: 1.3 },
  { crew: "C004", timepoint: "L-92", day: -92, wbc: 7.7, neu: 4.766, lym: 1.786, mon: 0.87, eos: 0.2, bas: 0.077, neuPct: 61.9, lymPct: 23.2, monPct: 11.3, eosPct: 2.6, basPct: 1 },
];

// ---------------------------------------------------------------------------
// Astronauts
// ---------------------------------------------------------------------------

export type AstronautId = "A" | "B" | "C" | "D";
export const ASTRONAUT_IDS: AstronautId[] = ["A", "B", "C", "D"];

export type DailyField =
  | "temp" | "hr" | "rr" | "spo2" | "sbp" | "dbp" | "sleepHours" | "sleepQuality" | "sleepiness" | "mood";

// Each person's usual preflight vitals. In flight, temperature and systolic pressure follow CONFIG.simulation.
type Vitals = { hr: number; rr: number; spo2: number; sbp: number; dbp: number; sleepHours: number };

const VITALS: Record<AstronautId, Vitals> = {
  A: { hr: 62, rr: 15, spo2: 98, sbp: 120, dbp: 76, sleepHours: 7.4 },
  B: { hr: 66, rr: 14, spo2: 98, sbp: 122, dbp: 78, sleepHours: 7.2 },
  C: { hr: 70, rr: 15, spo2: 97, sbp: 118, dbp: 74, sleepHours: 7.3 },
  D: { hr: 58, rr: 14, spo2: 98, sbp: 124, dbp: 80, sleepHours: 7.5 },
};

const SEEDS: Record<AstronautId, number> = { A: 20260101, B: 20260202, C: 20260303, D: 20260404 };

// Blood story: the z score (distance from expected in standard deviations) a marker is pushed to.
// Beyond 1.96 in either direction is outside the usual range. Keys are mission days.
const BLOOD_STORY: Record<AstronautId, Record<number, Partial<Record<Marker, number>>>> = {
  A: { 18: { MON: 2.15 } }, // one value just outside range on day 18, back in range by day 32
  B: {}, // blood stays in range, B's story is sleep
  // C: lymphocytes below range twice in a row (days 32 and 46). The other cell types lean the same way, so the
  // Immune Deviation Score climbs from about 70 on day 32 to above 95 on day 46.
  C: {
    32: { LYM: -2.1, NEU: 0.6, MON: 0.5, EOS: 0.3 },
    46: { LYM: -2.2, NEU: 1.5, MON: 1.4, EOS: 0.9 },
  },
  // D: neutrophils well above range on day 46, with monocytes and eosinophils also high but inside their ranges.
  D: { 46: { NEU: 2.8, MON: 1.4, EOS: 0.8 } },
};

// Astronaut C: lymphocytes start to fall on day 18 (still in range), then leave the range on days 32 and 46.
const C_LYM_DRIFT: Record<number, number> = { 18: 0.92 };

export type Astronaut = {
  id: AstronautId;
  name: string; // Astronaut A
  crew: string;
  preflight: BloodSample[]; // all three Inspiration4 readings, including a sample error if there is one
  baseline: Baseline; // from the usable preflight readings
  blood: BloodSample[]; // preflight plus in-flight blood checks, days up to 59
  daily: DailyEntry[]; // days 1 to 59, except the missed days in MISSED_DAYS
};

// Small seeded random number generator (mulberry32). The same seed gives the same numbers on every load.
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

// Normal variation, cut off at noiseLimit standard deviations so ordinary days never look unusual.
function gaussian(rand: () => number): number {
  const u = rand() || 1e-9;
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  return clamp(g, -CONFIG.simulation.noiseLimit, CONFIG.simulation.noiseLimit);
}

// The astronaut's expected value for a daily field on a mission day, with the in-flight changes applied.
export function dailyMean(id: AstronautId, field: DailyField, day: number): number {
  const v = VITALS[id];
  const s = CONFIG.simulation;
  switch (field) {
    case "temp": return CONFIG.vitalsAdjust.preflightTempC + (s.tempRiseC * Math.min(day, s.tempRiseDays)) / s.tempRiseDays;
    case "sbp": return v.sbp - s.sbpFlightDrop;
    case "hr": case "rr": case "spo2": case "dbp": case "sleepHours": return v[field];
    case "sleepQuality": return s.mean.sleepQuality;
    case "sleepiness": return s.mean.sleepiness;
    case "mood": return s.mean.mood;
  }
}

const FIELD_LIMITS: Record<DailyField, [number, number]> = {
  temp: [30, 43], hr: [25, 220], rr: [4, 60], spo2: [50, 100], sbp: [60, 260], dbp: [30, 160],
  sleepHours: [0, 16], sleepQuality: [1, 5], sleepiness: [1, 9], mood: [1, 5],
};
const FIELD_DECIMALS: Record<DailyField, number> = {
  temp: 1, hr: 0, rr: 0, spo2: 0, sbp: 0, dbp: 0, sleepHours: 1, sleepQuality: 0, sleepiness: 0, mood: 0,
};

// The astronaut's usual range for a daily field: expected value plus or minus the noise limit.
export function usualDaily(id: AstronautId, field: DailyField, day: number): [number, number] {
  const mean = dailyMean(id, field, day);
  const half = CONFIG.simulation.noiseLimit * CONFIG.simulation.sd[field];
  const [lo, hi] = FIELD_LIMITS[field];
  return [clamp(mean - half, lo, hi), clamp(mean + half, lo, hi)];
}

const DAILY_FIELDS: DailyField[] = [
  "temp", "hr", "rr", "spo2", "sbp", "dbp", "sleepHours", "sleepQuality", "sleepiness", "mood",
];

// Days with no Daily Check, so the streak at the start of day 60 matches the demo story: A never missed a day,
// B missed day 36 (streak 23), C missed day 55 (streak 4), D missed days 58 and 59 (streak 0, two missed in a row).
export const MISSED_DAYS: Record<AstronautId, number[]> = { A: [], B: [36], C: [55], D: [58, 59] };

function buildDaily(id: AstronautId, rand: () => number): DailyEntry[] {
  const out: DailyEntry[] = [];
  for (let day = 1; day <= CONFIG.mission.today - 1; day++) {
    // Draw every random number first so story edits below never change the other days.
    const e: DailyEntry = { day, symptoms: [] };
    for (const f of DAILY_FIELDS) {
      const raw = dailyMean(id, f, day) + CONFIG.simulation.sd[f] * gaussian(rand);
      const [lo, hi] = FIELD_LIMITS[f];
      e[f] = round(clamp(raw, lo, hi), FIELD_DECIMALS[f]);
    }
    // Stories.
    if (id === "A" && day === 20) Object.assign(e, { sleepHours: 5.2, sleepQuality: 2, sleepiness: 5 });
    if (id === "B" && day >= 53) {
      const k = day - 53; // 53 to 59: under 6 hours every night, getting sleepier
      Object.assign(e, { sleepHours: round(5.8 - 0.05 * k, 2), sleepQuality: 2, sleepiness: Math.min(8, 6 + Math.floor(k / 3)), mood: 2 + (k % 2) });
    }
    if (id === "C" && (day === 44 || day === 51)) e.symptoms = ["Sore throat or cough"];
    if (id === "D" && day === 56) e.temp = round(dailyMean(id, "temp", day) + 0.8, 1); // above his usual
    if (id === "D" && day === 57) Object.assign(e, { temp: 39.4, hr: 118, rr: 23, spo2: 93 }); // NEWS2 total 8
    // Missed days are left out after every random number is drawn, so the other days never change.
    if (!MISSED_DAYS[id].includes(day)) out.push(e);
  }
  return out;
}

function buildBlood(id: AstronautId, preflight: BloodSample[], baseline: Baseline, rand: () => number): BloodSample[] {
  const usable = preflight.filter((s) => sampleProblems(s).length === 0);
  const basBase = geoMean(usable.map((s) => s.bas as number));
  const out: BloodSample[] = [];
  for (const day of CONFIG.mission.flightBloodDays.filter((d) => d < CONFIG.mission.today)) {
    // One random number per marker, always drawn in the same order.
    const g = { NEU: gaussian(rand), LYM: gaussian(rand), MON: gaussian(rand), EOS: gaussian(rand), bas: gaussian(rand), wbc: gaussian(rand) };
    const value = (m: "NEU" | "LYM" | "MON" | "EOS") => {
      const e = expectedFor(m, baseline, day);
      const story = BLOOD_STORY[id][day]?.[m];
      if (story !== undefined) return e.expected * Math.exp(story * e.sd);
      const drift = id === "C" && m === "LYM" ? C_LYM_DRIFT[day] : undefined;
      if (drift !== undefined) return e.expected * drift * Math.exp(CONFIG.variation.sd[m].short * 0.5 * g[m]);
      return e.expected * Math.exp(CONFIG.variation.sd[m].short * g[m]);
    };
    const neu = value("NEU");
    const lym = value("LYM");
    const mon = value("MON");
    const eos = value("EOS");
    const bas = basBase * Math.exp(0.2 * g.bas);
    // White cells are built from the cell types so the sample always passes the "adds up" check.
    const wbc = (neu + lym + mon + eos + bas) * Math.exp(0.03 * g.wbc);
    out.push({ day, wbc: round(wbc, 2), neu: round(neu, 2), lym: round(lym, 2), mon: round(mon, 2), eos: round(eos, 2) });
  }
  return out;
}

// Builds one astronaut from scratch. The result is identical on every call (seeded random numbers).
export function buildAstronaut(id: AstronautId): Astronaut {
  const cfg = CONFIG.astronauts.find((a) => a.id === id)!;
  const preflight: BloodSample[] = INSPIRATION4.filter((r) => r.crew === cfg.crew)
    .sort((a, b) => a.day - b.day)
    .map((r): BloodSample => ({
      day: r.day, wbc: r.wbc, neu: r.neu, lym: r.lym, mon: r.mon, eos: r.eos, bas: r.bas,
      neuPct: r.neuPct, lymPct: r.lymPct, monPct: r.monPct, eosPct: r.eosPct, basPct: r.basPct,
    }));
  const baseline = baselineOf(preflight)!;
  const rand = mulberry32(SEEDS[id]);
  const daily = buildDaily(id, rand);
  const flight = buildBlood(id, preflight, baseline, rand);
  return {
    id, name: `Astronaut ${id}`, crew: cfg.crew,
    preflight, baseline, blood: [...preflight, ...flight], daily,
  };
}

const cache = new Map<AstronautId, Astronaut>();

// Same as buildAstronaut but built once and reused.
export function getAstronaut(id: AstronautId): Astronaut {
  if (!cache.has(id)) cache.set(id, buildAstronaut(id));
  return cache.get(id)!;
}

export const getAstronauts = () => ASTRONAUT_IDS.map(getAstronaut);

// ---------------------------------------------------------------------------
// Demo fill (one set per astronaut and form, for today, mission day 60)
// ---------------------------------------------------------------------------

export type DailyFill = Record<DailyField, number> & { symptoms: string[] };

const TODAY = CONFIG.mission.today;

// The astronaut's usual value for every daily field today. Used for the suggested replacement of a bad value.
export function typicalDaily(id: AstronautId): Record<DailyField, number> {
  const out = {} as Record<DailyField, number>;
  for (const f of DAILY_FIELDS) out[f] = round(dailyMean(id, f, TODAY), FIELD_DECIMALS[f]);
  return out;
}

// Demo Daily Check: every field filled. Most are typical, then:
//   borderline: sleep hours (shows "Double-check this value")
//   concerning: breathing rate 22 (2 NEWS2 points, so the status changes)
//   measurement error: diastolic higher than systolic (red X)
export function fillDaily(id: AstronautId): DailyFill {
  const t = typicalDaily(id);
  return { ...t, sleepHours: 3.8, sleepQuality: 3, sleepiness: 4, mood: 4, rr: 22, dbp: t.sbp + 10, symptoms: [] };
}

// Demo Blood Check: every field filled, then:
//   typical: monocytes (neutrophils too, before the error)
//   borderline: eosinophils at about double the baseline (shows "Double-check this value")
//   concerning: lymphocytes below the usual range (changes the status)
//   measurement error: neutrophils as high as white cells, so the counts do not add up (red X)
export function fillBlood(a: Astronaut): BloodInput {
  const ex = (m: Marker) => expectedFor(m, a.baseline, TODAY);
  const r2 = (n: number) => round(n, 2);
  const lym = r2(ex("LYM").expected * Math.exp(-2.3 * ex("LYM").sd));
  const mon = r2(ex("MON").expected);
  const eos = r2(a.baseline.values.EOS * 2.1);
  const neuTypical = r2(ex("NEU").expected);
  const wbc = r2((neuTypical + lym + mon + eos + 0.05) * 1.05); // sums fit inside white cells once neutrophils are fixed
  return { wbc, neu: wbc, lym, mon, eos };
}

// ---------------------------------------------------------------------------
// Measure Again (simulates retaking one measurement)
// ---------------------------------------------------------------------------

// A new plausible reading for one daily field: the astronaut's usual value today. Diastolic is kept below systolic.
export function remeasureDaily(id: AstronautId, key: DailyField, current: Partial<Record<DailyField, number>>): number {
  const usual = typicalDaily(id)[key];
  if (key === "dbp" && current.sbp !== undefined && Number.isFinite(current.sbp) && usual >= current.sbp) {
    return Math.max(30, Math.round(current.sbp * 0.65));
  }
  return usual;
}

// A new plausible reading for one blood count: the usual value today, small enough that the counts fit inside
// white cells. White cells themselves are raised if the other counts would not fit.
export function remeasureBlood(a: Astronaut, key: keyof BloodInput, current: BloodInput): number {
  const usual = (m: Marker) => expectedFor(m, a.baseline, TODAY).expected;
  const others = (["neu", "lym", "mon", "eos"] as const).filter((k) => k !== key).reduce((sum, k) => sum + (current[k] ?? 0), 0);
  if (key === "wbc") return round(Math.max(usual("WBC"), others * 1.05), 2);
  const room = (current.wbc ?? Infinity) * CONFIG.bloodChecks.sumLimit - others;
  const v = Math.floor(Math.min(usual(key.toUpperCase() as Marker), room) * 100) / 100;
  return v > 0 ? v : round(usual(key.toUpperCase() as Marker), 2);
}

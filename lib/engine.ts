// All HemoScope logic as pure functions. No React, no browser APIs, no data imports, so it is easy to test.
// Numbers come from lib/config.ts. Astronaut data and the history generator live in lib/data.ts.
//
// Sections:
//   1. Types, labels and small helpers
//   2. Blood check (sample errors, baseline, expected values, status)
//   3. Daily check (NEWS2, temperature adjustment, sleep, status)
//   4. "Check my data" rules for both forms
//   5. Flagged events (used by the flight surgeon view)

import { CONFIG, type Band, type Marker } from "./config";
import { forecastSeries, mapPath, unexpected, type MapPoint } from "./ml";

// ---------------------------------------------------------------------------
// 1. Types, labels and small helpers
// ---------------------------------------------------------------------------

export const MARKERS: Marker[] = ["WBC", "NEU", "LYM", "MON", "EOS", "NLR"];

export const MARKER_NAMES: Record<Marker, string> = {
  WBC: "White cells",
  NEU: "Neutrophils",
  LYM: "Lymphocytes",
  MON: "Monocytes",
  EOS: "Eosinophils",
  NLR: "Neutrophil to lymphocyte ratio (NLR)",
};

export type StatusId = "normal" | "monitor" | "surgeon" | "surgeonNow" | "retake";

// Higher is more urgent. "retake" means the sample is unreliable, not that the person is unwell.
export const STATUS_RANK: Record<StatusId, number> = { retake: -1, normal: 0, monitor: 1, surgeon: 2, surgeonNow: 3 };

export const STATUS_TEXT: Record<StatusId, { label: string; message: string }> = {
  normal: { label: "Normal For You", message: "Your readings are in your usual range. Keep your routine." },
  monitor: { label: "Monitor Closely", message: CONFIG.monitorActions.blood.text },
  surgeon: { label: "Contact Flight Surgeon", message: "Share these results with your flight surgeon." },
  surgeonNow: { label: "Contact Flight Surgeon Now", message: "Contact your flight surgeon now." },
  retake: { label: "Retake the Sample", message: "This sample looks unreliable. Take a new sample." },
};

// Mark shown next to a single value: green check, yellow warning, orange warning, red X.
export type Mark = "ok" | "warn" | "high" | "bad";
const POINT_MARK: Mark[] = ["ok", "warn", "high", "bad"];

// One line of a "Why" list: what was found, with the actual numbers, and where the rule comes from.
export type Reason = { status: StatusId; mark: Mark; text: string; source?: string };

export const SYMPTOMS = CONFIG.tooltips.symptoms;

// One blood check. Counts are x10^3 per microliter. Only white cells are required.
export type BloodSample = {
  day: number;
  wbc: number;
  neu?: number;
  lym?: number;
  mon?: number;
  eos?: number;
  bas?: number;
  // Optional percentages of white cells, used only to cross-check the counts (preflight data has them).
  neuPct?: number;
  lymPct?: number;
  monPct?: number;
  eosPct?: number;
  basPct?: number;
  // Set only for checks taken back on Earth (Real Crew Replay). Overrides the phase that the day would give, so no
  // spaceflight adjustment is applied. Left out for every demo astronaut check.
  phase?: Phase;
};

// One daily check. Every vital is optional. Sleep fields describe the night before this day.
export type DailyEntry = {
  day: number;
  temp?: number; // degrees C
  hr?: number; // beats per minute
  rr?: number; // breaths per minute
  spo2?: number; // percent
  sbp?: number; // systolic, mmHg
  dbp?: number; // diastolic, mmHg, recorded but not scored
  sleepHours?: number;
  sleepQuality?: number; // 1 to 5
  sleepiness?: number; // Karolinska Sleepiness Scale, 1 to 9
  mood?: number; // 1 to 5, charted but never scored
  symptoms: string[];
};

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const has = (n: number | undefined): n is number => typeof n === "number" && Number.isFinite(n);
export const maxStatus = (list: StatusId[]): StatusId =>
  list.reduce<StatusId>((a, b) => (STATUS_RANK[b] > STATUS_RANK[a] ? b : a), "normal");

export function geoMean(values: number[]): number {
  return Math.exp(values.reduce((sum, v) => sum + Math.log(v), 0) / values.length);
}

export function fmtMarker(v: number): string {
  return v.toFixed(2);
}

// Adds a new status to a running result and keeps the most urgent one.
const worse = (a: StatusId, b: StatusId): StatusId => (STATUS_RANK[b] > STATUS_RANK[a] ? b : a);

// ---------------------------------------------------------------------------
// 2. Blood check
// ---------------------------------------------------------------------------

export function markerValue(s: BloodSample, m: Marker): number | undefined {
  switch (m) {
    case "WBC": return s.wbc;
    case "NEU": return s.neu;
    case "LYM": return s.lym;
    case "MON": return s.mon;
    case "EOS": return s.eos;
    case "NLR": return has(s.neu) && has(s.lym) && s.lym > 0 ? s.neu / s.lym : undefined;
  }
}

// Sample error test: each count should match (white cells x percent). Returns one message per mismatch.
export function percentMismatch(s: BloodSample): string[] {
  const out: string[] = [];
  const rows: [string, number | undefined, number | undefined][] = [
    ["Neutrophils", s.neu, s.neuPct],
    ["Lymphocytes", s.lym, s.lymPct],
    ["Monocytes", s.mon, s.monPct],
    ["Eosinophils", s.eos, s.eosPct],
  ];
  for (const [name, count, pct] of rows) {
    if (!has(count) || !has(pct)) continue;
    const fromPct = (s.wbc * pct) / 100;
    if (fromPct > 0 && Math.abs(count - fromPct) / fromPct > CONFIG.bloodChecks.percentMismatch) {
      out.push(`${name} count ${fmtMarker(count)} does not match ${pct}% of white cells (about ${fmtMarker(fromPct)}).`);
    }
  }
  return out;
}

// Every reason a sample cannot be trusted. An empty list means it passed.
export function sampleProblems(s: BloodSample): string[] {
  const c = CONFIG.bloodChecks;
  const out: string[] = [];
  if (!(s.wbc >= c.wbcMin && s.wbc <= c.wbcMax)) {
    out.push(`White cells ${s.wbc} are outside ${c.wbcMin} to ${c.wbcMax}.`);
  }
  const parts = [s.neu, s.lym, s.mon, s.eos].filter(has);
  if (parts.some((v) => v < 0)) out.push("A count is below zero.");
  if (parts.some((v) => v > s.wbc)) out.push("A single cell type is higher than total white cells.");
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum > s.wbc * c.sumLimit) {
    out.push(`These counts do not add up. They sum to ${fmtMarker(sum)} against ${fmtMarker(s.wbc)} white cells.`);
  }
  return [...out, ...percentMismatch(s)];
}

export type Baseline = {
  n: number; // usable preflight readings
  lastDay: number; // day of the last usable preflight reading
  values: Record<Marker, number>; // geometric mean per marker
};

// Personal baseline: geometric mean of the usable preflight readings. Samples with problems are skipped.
export function baselineOf(preflight: BloodSample[]): Baseline | null {
  const good = preflight.filter(
    (s) => sampleProblems(s).length === 0 && [s.neu, s.lym, s.mon, s.eos].every((v) => has(v) && v > 0),
  );
  if (good.length < CONFIG.blood.minBaselineSamples) return null;
  const values = {} as Record<Marker, number>;
  for (const m of MARKERS) values[m] = geoMean(good.map((s) => markerValue(s, m) as number));
  return { n: good.length, lastDay: Math.max(...good.map((s) => s.day)), values };
}

export type Phase = "preflight" | "earlyFlight" | "longFlight";

export function phaseOf(day: number): Phase {
  if (day <= 0) return "preflight";
  return day <= CONFIG.spaceflight.earlyFlightLastDay ? "earlyFlight" : "longFlight";
}

export const PHASE_NAMES: Record<Phase, string> = {
  preflight: "Preflight",
  earlyFlight: "Early flight",
  longFlight: "Long flight",
};

// Expected value, spread and usual range for one marker on one mission day.
export function expectedFor(m: Marker, base: Baseline, day: number, phaseOverride?: Phase) {
  const phase = CONFIG.spaceflight.phases[phaseOverride ?? phaseOf(day)];
  const long = day - base.lastDay >= CONFIG.blood.longTermDays; // day 60 counts as long
  const sdMarker = CONFIG.variation.sd[m][long ? "long" : "short"];
  const expected = base.values[m] * phase.multiplier[m];
  const sd = Math.sqrt(sdMarker ** 2 * (1 + 1 / base.n) + phase.sdPhase ** 2);
  const z = CONFIG.blood.zLimit;
  return { expected, sd, lo: expected * Math.exp(-z * sd), hi: expected * Math.exp(z * sd) };
}

export type MarkerResult = {
  marker: Marker;
  value: number;
  expected: number;
  lo: number;
  hi: number;
  z: number;
  pctDiff: number; // percent difference from expected
  flag: "in" | "above" | "below";
  repeated: boolean; // outside the range in the same direction at the previous blood check
  sudden: boolean; // moved a lot since the previous blood check
  mark: Mark;
};

export type BloodResult = {
  day: number;
  sample: BloodSample;
  kind: "retake" | "baseline" | "checked" | "needBaseline";
  problems: string[];
  markers: MarkerResult[];
  status: StatusId;
  message: string;
  reasons: Reason[];
  together: boolean; // flagged blood plus fever or symptoms on the same day
  caution: string[]; // extra notes such as the NLR note
  immune: ImmuneScore | null; // Immune Deviation Score, null when the sample cannot be scored
  forecast: ForecastCheck | null; // how the result compares with the forecast made before it, null when none was made
};

// Forecast made from the earlier checks, compared with this result. `expected` is false when any marker fell outside its band.
export type ForecastCheck = { expected: boolean; markers: { marker: Marker; value: number; lo: number; hi: number; expected: number; outside: boolean }[] };

export const ML_SOURCE = "HemoScope machine learning models, trained on ImmPort SDY180, SDY296, SDY301 and SDY1252.";

// The Immune State Map path for a list of blood results: every in-flight check that has all four cell counts, oldest first.
// Samples with entry problems (Retake the Sample) are left out, like they are for the forecast.
export function mapPathOf(results: BloodResult[], baseline: Baseline | null): MapPoint[] {
  return baseline ? mapPath(results.filter((r) => r.kind !== "retake").map((r) => r.sample), baseline) : [];
}

// Immune Deviation Score. Q = sum of z squared over the cell types entered (neutrophils, lymphocytes,
// monocytes, eosinophils). Score = 100 x chi-square CDF(Q) with one degree of freedom per cell type used.
export type ImmuneScore = { score: number; q: number; df: number; used: Marker[]; unusual: boolean };

// Error function, Abramowitz and Stegun 7.1.26 (error under 1.5e-7). Used for 1 and 3 degrees of freedom.
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return 1 - poly * Math.exp(-x * x);
}

// Chi-square CDF for 1 to 4 degrees of freedom, closed forms only.
export function chiSquareCdf(q: number, df: number): number {
  if (!(q > 0)) return 0;
  const half = q / 2;
  switch (df) {
    case 1: return erf(Math.sqrt(half));
    case 2: return 1 - Math.exp(-half);
    case 3: return erf(Math.sqrt(half)) - Math.sqrt((2 * q) / Math.PI) * Math.exp(-half);
    case 4: return 1 - Math.exp(-half) * (1 + half);
    default: throw new Error(`Unsupported degrees of freedom: ${df}`);
  }
}

// Score from a list of z values (one per cell type used).
export function immuneFromZ(zs: number[], used: Marker[]): ImmuneScore | null {
  if (zs.length === 0) return null;
  const q = zs.reduce((a, z) => a + z * z, 0);
  const score = Math.min(100, Math.max(0, Math.round(100 * chiSquareCdf(q, zs.length))));
  return { score, q, df: zs.length, used, unusual: score >= CONFIG.immune.unusualFrom };
}

// Score for one sample against a personal baseline. Uses the same expected value and spread as the blood check z.
export function immuneForSample(s: BloodSample, baseline: Baseline): ImmuneScore | null {
  const used: Marker[] = [];
  const zs: number[] = [];
  for (const m of CONFIG.immune.markers) {
    const v = markerValue(s, m);
    if (!has(v) || v <= 0) continue;
    const e = expectedFor(m, baseline, s.day, s.phase);
    used.push(m);
    zs.push(Math.log(v / e.expected) / e.sd);
  }
  return immuneFromZ(zs, used);
}

function absoluteChecks(s: BloodSample): { status: StatusId; text: string }[] {
  const a = CONFIG.absoluteLimits;
  const out: { status: StatusId; text: string }[] = [];
  if (has(s.neu) && s.neu < a.neutrophilsContactNowBelow) {
    out.push({ status: "surgeonNow", text: `Neutrophils ${fmtMarker(s.neu)} are below ${a.neutrophilsContactNowBelow}.` });
  } else if (has(s.neu) && s.neu < a.neutrophilsContactBelow) {
    out.push({ status: "surgeon", text: `Neutrophils ${fmtMarker(s.neu)} are below ${a.neutrophilsContactBelow}.` });
  }
  if (has(s.lym) && s.lym < a.lymphocytesContactBelow) {
    out.push({ status: "surgeon", text: `Lymphocytes ${fmtMarker(s.lym)} are below ${a.lymphocytesContactBelow}.` });
  }
  if (s.wbc < a.wbcContactBelow) {
    out.push({ status: "surgeon", text: `White cells ${fmtMarker(s.wbc)} are below ${a.wbcContactBelow}.` });
  }
  return out;
}

export const isFever = (e?: DailyEntry) => !!e && has(e.temp) && e.temp >= CONFIG.vitalsAdjust.feverLineC;

// Evaluates every blood check in order. `daily` is used for same-day fever, symptoms and sleep.
export function evaluateBloodSeries(
  samples: BloodSample[],
  daily: DailyEntry[] = [],
): { baseline: Baseline | null; results: BloodResult[] } {
  const sorted = [...samples].sort((a, b) => a.day - b.day);
  const problems = sorted.map(sampleProblems);
  const preflight = sorted.filter((s) => s.day <= 0);
  const baseline = baselineOf(preflight);
  const retake = sorted.map((_, i) => problems[i].length > 0);
  // Forecasts use only trustworthy samples, so one bad entry never moves them.
  const { before } = forecastSeries(sorted.filter((_, i) => !retake[i]), 0);
  const results: BloodResult[] = [];
  let prevGood: BloodSample | undefined; // previous trustworthy blood check, any phase
  let prevFlight: BloodResult | undefined; // previous in-flight result, for "same direction" checks
  const spaceSrc = `${CONFIG.variation.source} ${CONFIG.spaceflight.source}.`;

  sorted.forEach((s, i) => {
    const base = { day: s.day, sample: s, problems: problems[i], markers: [], together: false, caution: [], immune: null, forecast: null };
    if (retake[i]) {
      results.push({
        ...base, kind: "retake", status: "retake", message: STATUS_TEXT.retake.message,
        reasons: [{ status: "retake", mark: "bad", text: `Sample error. ${problems[i].join(" ")}`, source: CONFIG.bloodChecks.source }],
      });
      return;
    }
    if (!baseline) {
      results.push({
        ...base, kind: "needBaseline", status: "normal", message: STATUS_TEXT.normal.message,
        reasons: [{ status: "normal", mark: "ok", text: "Not enough usable preflight readings for a personal baseline yet." }],
      });
      return;
    }
    if (s.day <= 0) {
      results.push({
        ...base, kind: "baseline", status: "normal", message: STATUS_TEXT.normal.message, immune: immuneForSample(s, baseline),
        reasons: [{ status: "normal", mark: "ok", text: "Preflight reading. Used to build your personal baseline.", source: CONFIG.variation.source }],
      });
      prevGood = s;
      return;
    }

    const z = CONFIG.blood.zLimit;
    const markers: MarkerResult[] = [];
    for (const m of MARKERS) {
      const value = markerValue(s, m);
      if (!has(value)) continue;
      const e = expectedFor(m, baseline, s.day, s.phase);
      const zValue = Math.log(Math.max(value, 1e-9) / e.expected) / e.sd;
      const flag = Math.abs(zValue) <= z ? "in" : zValue > 0 ? "above" : "below";
      const before = prevFlight?.markers.find((p) => p.marker === m);
      const repeated = flag !== "in" && before?.flag === flag;
      const prevVal = prevGood ? markerValue(prevGood, m) : undefined;
      const zLast = has(prevVal) ? Math.log(Math.max(value, 1e-9) / prevVal) / (CONFIG.variation.sd[m].short * Math.SQRT2) : 0;
      markers.push({
        marker: m, value, expected: e.expected, lo: e.lo, hi: e.hi, z: zValue,
        pctDiff: (value / e.expected - 1) * 100, flag, repeated,
        sudden: Math.abs(zLast) > z, mark: flag === "in" ? "ok" : repeated ? "high" : "warn",
      });
    }

    let status: StatusId = "normal";
    const reasons: Reason[] = [];
    for (const a of absoluteChecks(s)) {
      status = worse(status, a.status);
      reasons.push({ status: a.status, mark: a.status === "surgeonNow" ? "bad" : "high", text: a.text, source: CONFIG.absoluteLimits.source });
    }
    for (const r of markers) {
      const name = MARKER_NAMES[r.marker];
      const range = `${fmtMarker(r.lo)} to ${fmtMarker(r.hi)}`;
      const extra = r.sudden ? " Sudden change since last check." : "";
      if (r.flag === "in") {
        reasons.push({
          status: "normal", mark: "ok", source: spaceSrc,
          text: `${name} ${fmtMarker(r.value)} is within your usual range of ${range}.${extra}`,
        });
        continue;
      }
      const dir = r.flag === "above" ? "above" : "below";
      const st: StatusId = r.repeated ? "surgeon" : "monitor";
      status = worse(status, st);
      reasons.push({
        status: st, mark: r.mark, source: spaceSrc,
        text:
          `${name} ${fmtMarker(r.value)} is ${Math.abs(Math.round(r.pctDiff))}% ${dir} the expected ${fmtMarker(r.expected)}. ` +
          `Your usual range today is ${range}. ` +
          (r.repeated ? `It was also ${dir} your range at your last blood check.` : "First time outside your usual range.") +
          extra,
      });
    }

    // Combined pattern rule: a high score with every single marker inside its range is still worth a closer look.
    const immune = immuneForSample(s, baseline);
    if (immune && immune.unusual && markers.every((r) => r.flag === "in")) {
      status = worse(status, "monitor");
      reasons.push({ status: "monitor", mark: "warn", text: CONFIG.immune.reason, source: CONFIG.immune.source });
    }

    // Forecast rule: a result outside the band forecast from the earlier checks adds a Monitor Closely reason, never more.
    const fcs = before[s.day] ?? [];
    let forecast: ForecastCheck | null = null;
    if (fcs.length) {
      const fm = fcs.flatMap((f) => { const v = markerValue(s, f.marker); return has(v) ? [{ marker: f.marker, value: v, lo: f.lo, hi: f.hi, expected: f.expected, outside: unexpected(v, f) }] : []; });
      forecast = { expected: !fm.some((x) => x.outside), markers: fm };
      for (const x of fm.filter((y) => y.outside)) {
        status = worse(status, "monitor");
        reasons.push({
          status: "monitor", mark: "warn", source: ML_SOURCE,
          text: `${MARKER_NAMES[x.marker]} ${fmtMarker(x.value)} is not what we expected. The forecast from earlier checks was ${fmtMarker(x.lo)} to ${fmtMarker(x.hi)}.`,
        });
      }
    }

    const flagged = status !== "normal";
    const today = daily.find((d) => d.day === s.day);
    let together = false;
    if (flagged && (isFever(today) || (today?.symptoms.length ?? 0) > 0)) {
      together = true;
      status = worse(status, "surgeon");
      reasons.push({
        status: "surgeon", mark: "high", source: CONFIG.statusRules.source,
        text: "Together with today's fever or symptoms, contact your flight surgeon.",
      });
    }

    let message = STATUS_TEXT[status].message;
    if (status === "monitor" && has(today?.sleepHours) && today.sleepHours < CONFIG.sleep.shortNightHours) {
      message = CONFIG.monitorActions.bloodAfterShortSleep.text;
      reasons.push({
        status: "monitor", mark: "warn", source: CONFIG.sleep.source,
        text: `Last night's sleep was ${today.sleepHours} hours, under ${CONFIG.sleep.shortNightHours}.`,
      });
    }

    const res: BloodResult = {
      ...base, kind: "checked", markers, status, message, reasons, together, immune, forecast,
      caution: [CONFIG.blood.nlrNote],
    };
    results.push(res);
    prevFlight = res;
    prevGood = s;
  });
  return { baseline, results };
}

// ---------------------------------------------------------------------------
// 3. Daily check
// ---------------------------------------------------------------------------

function scoreBands(value: number, bands: Band[]): number {
  const hit = bands.find((b) => (b.lo === null || value >= b.lo) && (b.hi === null || value <= b.hi));
  return hit ? hit.points : 0;
}

// The astronaut's own recent in-flight temperature, from the entries before this one.
export function tempUsual(history: DailyEntry[], day: number): { mean: number; offset: number } {
  const v = CONFIG.vitalsAdjust;
  const recent = history
    .filter((h) => h.day < day && has(h.temp))
    .sort((a, b) => b.day - a.day)
    .slice(0, v.temperatureWindowDays)
    .map((h) => h.temp as number);
  const mean = recent.length >= v.temperatureMinDays ? recent.reduce((a, b) => a + b, 0) / recent.length : v.preflightTempC;
  return { mean, offset: mean - v.temperatureReferenceC };
}

export type DailyPart = { key: string; label: string; value: string; points: number; mark: Mark; why: string };

export type DailyResult = {
  day: number;
  status: StatusId;
  message: string;
  total: number; // NEWS2 total, only for fields entered
  parts: DailyPart[];
  marks: Record<string, Mark>; // per field key, for the per-value icons
  reasons: Reason[];
  notes: string[];
  fever: boolean;
  symptoms: string[];
  sleepNights: number; // nights in a row under the short-night limit, including this one
  tempMean: number; // astronaut's recent in-flight average
};

// Scores one daily check. `history` holds the astronaut's earlier entries (used for the temperature
// offset and the run of short nights).
export function evaluateDaily(entry: DailyEntry, history: DailyEntry[]): DailyResult {
  const n = CONFIG.news2;
  const adj = CONFIG.vitalsAdjust;
  const src = n.source;
  const parts: DailyPart[] = [];
  const marks: Record<string, Mark> = {};
  const reasons: Reason[] = [];
  const notes: string[] = [];
  const { mean, offset } = tempUsual(history, entry.day);
  let rise = 0;

  const addPart = (key: string, label: string, value: string, points: number, why: string) => {
    const mark = POINT_MARK[Math.min(points, 3)];
    parts.push({ key, label, value, points, mark, why });
    marks[key] = mark;
    reasons.push({ status: "normal", mark, text: `${label} ${value}: ${points} ${points === 1 ? "point" : "points"}. ${why}`, source: src });
  };

  if (has(entry.rr)) addPart("rr", "Breathing rate", `${entry.rr} per min`, scoreBands(Math.round(entry.rr), n.respiration), "Normal is 12 to 20.");
  if (has(entry.spo2)) addPart("spo2", "Oxygen saturation", `${entry.spo2}%`, scoreBands(Math.round(entry.spo2), n.oxygenSaturation), "Normal is 96% or more.");
  if (has(entry.sbp)) {
    const adjusted = entry.sbp + adj.systolicAddInFlight;
    addPart(
      "sbp", "Systolic blood pressure", `${entry.sbp} mmHg`,
      scoreBands(Math.round(adjusted), n.systolicBp),
      `Scored as ${adjusted} mmHg because systolic pressure is about ${adj.systolicAddInFlight} mmHg lower in flight (Norsk et al. 2015).`,
    );
  }
  if (has(entry.hr)) addPart("hr", "Heart rate", `${entry.hr} bpm`, scoreBands(Math.round(entry.hr), n.heartRate), "Normal is 51 to 90.");
  if (has(entry.temp)) {
    const adjusted = round(entry.temp - offset, 1);
    const fever = entry.temp >= adj.feverLineC;
    let pts = scoreBands(adjusted, n.temperature);
    if (fever) pts = Math.max(pts, adj.feverMinPoints);
    rise = entry.temp - mean;
    const usual = `${mean.toFixed(1)} °C`;
    const why = fever
      ? `At or above the fever line of ${adj.feverLineC} °C.`
      : pts === 0
        ? `${entry.temp} °C is within your usual in-flight range (recent average ${usual}).`
        : `Adjusted to ${adjusted} °C for flight (your recent average is ${usual}, Stahn et al. 2017).`;
    addPart("temp", "Temperature", `${entry.temp} °C`, pts, why);
  }

  const total = parts.reduce((a, p) => a + p.points, 0);
  const maxSingle = parts.reduce((a, p) => Math.max(a, p.points), 0);
  const rules = CONFIG.statusRules;
  let status: StatusId = "normal";
  let vitalsRaised = false; // true when vitals or symptoms (not only sleep) raised Monitor Closely
  if (total >= rules.surgeonNowFrom) status = "surgeonNow";
  else if (maxSingle >= rules.singleVitalPoints || total >= rules.surgeonFrom) status = "surgeon";
  else if (total >= rules.monitorFrom) status = "monitor";
  if (status === "monitor") vitalsRaised = true;

  // Every vital that scored points carries the NEWS2 status, so the top reason is easy to find.
  for (const r of reasons) r.status = r.mark === "ok" ? "normal" : status;
  if (total >= rules.monitorFrom) {
    reasons.unshift({ status, mark: POINT_MARK[Math.min(status === "surgeonNow" ? 3 : status === "surgeon" ? 2 : 1, 3)], source: src, text: `NEWS2 total ${total}.` });
  }

  // Added rule: a clear rise above the astronaut's own usual temperature.
  if (has(entry.temp) && rise >= adj.riseNoteC && parts.find((p) => p.key === "temp")?.points === 0) {
    status = worse(status, "monitor");
    vitalsRaised = true;
    marks.temp = "warn";
    reasons.push({
      status: "monitor", mark: "warn", source: adj.source,
      text: `Temperature is ${rise.toFixed(1)} °C above your recent in-flight average of ${mean.toFixed(1)} °C.`,
    });
  }

  // Dashboard-style marks for fields that are recorded but not scored.
  const dc = CONFIG.dailyChecks;
  if (has(entry.dbp)) {
    const out = entry.dbp < (dc.dbp.warnLo ?? 0) || entry.dbp > (dc.dbp.warnHi ?? 999);
    marks.dbp = out ? "warn" : "ok";
    reasons.push({ status: "normal", mark: marks.dbp, text: `Diastolic blood pressure ${entry.dbp} mmHg. Recorded, not scored.` });
  }

  // Sleep.
  const sl = CONFIG.sleep;
  let sleepNights = 0;
  if (has(entry.sleepHours)) {
    marks.sleepHours = entry.sleepHours < sl.targetHours ? "warn" : "ok";
    if (entry.sleepHours < sl.shortNightHours) {
      sleepNights = 1;
      const byDay = new Map(history.map((h) => [h.day, h]));
      for (let d = entry.day - 1; has(byDay.get(d)?.sleepHours) && (byDay.get(d)!.sleepHours as number) < sl.shortNightHours; d--) sleepNights++;
    }
    if (sleepNights >= sl.nightsInARow) {
      status = worse(status, "monitor");
      notes.push("Sleep debt is building. Protect the next sleep period.");
      reasons.push({
        status: "monitor", mark: "warn", source: sl.source,
        text: `Slept ${entry.sleepHours} hours. ${sleepNights} nights in a row under ${sl.shortNightHours} hours. Sleep debt is building. Protect the next sleep period.`,
      });
    } else {
      reasons.push({
        status: "normal", mark: marks.sleepHours, source: sl.source,
        text: entry.sleepHours < sl.targetHours
          ? `Short sleep: ${entry.sleepHours} hours, under the ${sl.targetHours} hour target.`
          : `Slept ${entry.sleepHours} hours, at or above the ${sl.targetHours} hour target.`,
      });
    }
  }
  if (has(entry.sleepQuality)) {
    marks.sleepQuality = entry.sleepQuality <= 2 ? "warn" : "ok";
    reasons.push({ status: "normal", mark: marks.sleepQuality, text: `Sleep quality ${entry.sleepQuality} of 5.` });
  }
  if (has(entry.sleepiness)) {
    const very = entry.sleepiness >= sl.verySleepyKss;
    marks.sleepiness = very ? "warn" : "ok";
    if (very) notes.push("Very sleepy.");
    reasons.push({
      status: "normal", mark: marks.sleepiness, source: "Karolinska Sleepiness Scale",
      text: `Sleepiness ${entry.sleepiness} of 9.${very ? " Very sleepy." : ""}`,
    });
  }
  if (has(entry.mood)) reasons.push({ status: "normal", mark: "ok", text: `Mood ${entry.mood} of 5. Charted only, not scored.` });

  // Symptoms: at least Monitor Closely, and a note for the flight surgeon.
  if (entry.symptoms.length) {
    status = worse(status, "monitor");
    vitalsRaised = true;
    notes.push("Note this for your flight surgeon.");
    reasons.push({ status: "monitor", mark: "warn", text: `Symptoms ticked: ${entry.symptoms.join(", ")}. Note this for your flight surgeon.` });
  }

  // Monitor Closely text depends on the cause: sleep alone gets the sleep advice.
  const message =
    status === "monitor"
      ? vitalsRaised ? CONFIG.monitorActions.daily.text : CONFIG.monitorActions.sleep.text
      : STATUS_TEXT[status].message;

  return {
    day: entry.day, status, message, total, parts, marks, reasons, notes,
    fever: isFever(entry), symptoms: entry.symptoms, sleepNights, tempMean: mean,
  };
}

// Scores a whole list of daily checks in day order, each one using only the days before it.
export function evaluateDailySeries(entries: DailyEntry[]): DailyResult[] {
  const sorted = [...entries].sort((a, b) => a.day - b.day);
  return sorted.map((e, i) => evaluateDaily(e, sorted.slice(0, i)));
}

// The line shown as the main reason for a result.
export function topReason(reasons: Reason[]): string {
  const best = reasons.reduce<Reason | undefined>((a, r) => (!a || STATUS_RANK[r.status] > STATUS_RANK[a.status] ? r : a), undefined);
  return best && best.status !== "normal" ? best.text : "All values are in your usual range.";
}

// ---------------------------------------------------------------------------
// 4. "Check my data" rules
// ---------------------------------------------------------------------------

export type FieldCheck = { level: "ok" | "warn" | "error"; headline: string; detail?: string; suggest?: number };

const OK: FieldCheck = { level: "ok", headline: "Looks right" };
const warn = (detail?: string): FieldCheck => ({ level: "warn", headline: "Double-check this value", detail });
const bad = (detail?: string, suggest?: number): FieldCheck => ({ level: "error", headline: "Likely measurement error", detail, suggest });

type Limit = { redLo: number; redHi: number; warnLo?: number; warnHi?: number };

function checkNumber(v: number, lim: Limit, whole = false): FieldCheck {
  if (!Number.isFinite(v)) return bad("Enter a number.");
  if (v < lim.redLo || v > lim.redHi) return bad(`Expected between ${lim.redLo} and ${lim.redHi}.`);
  if (whole && !Number.isInteger(v)) return bad("Use a whole number.");
  if ((lim.warnLo !== undefined && v < lim.warnLo) || (lim.warnHi !== undefined && v > lim.warnHi)) return warn("Unusual but possible.");
  return OK;
}

// Checks every filled daily field. Blank fields are skipped.
// `typical` holds this astronaut's usual values, used for the suggested replacement of a bad value.
export function checkDaily(
  e: Partial<Record<string, number | undefined>>,
  typical: Partial<Record<string, number>> = {},
): Record<string, FieldCheck> {
  const d = CONFIG.dailyChecks;
  const out: Record<string, FieldCheck> = {};
  const lims: [string, Limit, boolean][] = [
    ["temp", d.temp, false], ["hr", d.hr, false], ["rr", d.rr, false], ["spo2", d.spo2, false],
    ["sbp", d.sbp, false], ["dbp", d.dbp, false], ["sleepHours", d.sleepHours, false],
    ["sleepQuality", d.sleepQuality, true], ["sleepiness", d.sleepiness, true], ["mood", d.mood, true],
  ];
  for (const [key, lim, whole] of lims) {
    const v = e[key];
    if (v !== undefined) out[key] = checkNumber(v, lim, whole);
  }
  const { sbp, dbp } = e;
  if (dbp !== undefined && Number.isFinite(dbp) && sbp !== undefined && Number.isFinite(sbp) && dbp >= sbp) {
    const fallback = Math.max(30, Math.round(sbp * 0.65));
    const suggest = typical.dbp !== undefined && typical.dbp < sbp ? typical.dbp : fallback;
    out.dbp = bad("Diastolic cannot be higher than systolic. This is likely a measurement error.", suggest);
  }
  return out;
}

export type BloodInput = { wbc?: number; neu?: number; lym?: number; mon?: number; eos?: number };
const BLOOD_KEYS = ["wbc", "neu", "lym", "mon", "eos"] as const;
const KEY_MARKER: Record<(typeof BLOOD_KEYS)[number], Marker> = { wbc: "WBC", neu: "NEU", lym: "LYM", mon: "MON", eos: "EOS" };

// Checks the blood form. White cells are required.
export function checkBlood(input: BloodInput, baseline: Baseline | null): Record<string, FieldCheck> {
  const c = CONFIG.bloodChecks;
  const out: Record<string, FieldCheck> = {};
  const filled = BLOOD_KEYS.filter((k) => input[k] !== undefined);
  if (input.wbc === undefined) out.wbc = bad("White cells are required.");
  for (const k of filled) {
    const v = input[k] as number;
    if (!Number.isFinite(v)) out[k] = bad("Enter a number.");
    else if (v < 0) out[k] = bad("A count cannot be below zero.");
  }
  const wbc = input.wbc;
  if (wbc !== undefined && Number.isFinite(wbc) && !out.wbc) {
    if (wbc < c.wbcMin || wbc > c.wbcMax) out.wbc = bad(`Expected between ${c.wbcMin} and ${c.wbcMax}.`);
    for (const k of ["neu", "lym", "mon", "eos"] as const) {
      const v = input[k];
      if (v !== undefined && Number.isFinite(v) && v > wbc && !out[k]) out[k] = bad("Higher than total white cells.", suggestCount(k, input, baseline));
    }
    // Counts that add up to more than white cells: mark only the largest count, the likeliest slip.
    const subs = (["neu", "lym", "mon", "eos"] as const).filter((k) => has(input[k]));
    const sum = subs.reduce((a, k) => a + (input[k] as number), 0);
    if (sum > wbc * c.sumLimit && subs.length && !subs.some((k) => out[k])) {
      const big = subs.reduce((a, k) => ((input[k] as number) > (input[a] as number) ? k : a));
      out[big] = bad("These counts add up to more than white cells.", suggestCount(big, input, baseline));
    }
  }
  if (baseline) {
    for (const k of filled) {
      const v = input[k];
      if (out[k] || v === undefined) continue;
      const b = baseline.values[KEY_MARKER[k]];
      if (v > b * c.bigChangeFactor || v < b / c.bigChangeFactor) out[k] = warn("Big change. Confirm the entry before submitting.");
    }
  }
  for (const k of filled) if (!out[k]) out[k] = OK;
  return out;
}

// A plausible replacement for a bad count: the usual value for this astronaut today, kept small enough
// that all counts fit inside white cells. Returns undefined when no sensible value exists.
function suggestCount(k: "neu" | "lym" | "mon" | "eos", input: BloodInput, baseline: Baseline | null): number | undefined {
  if (!baseline || !has(input.wbc)) return undefined;
  const usual = expectedFor(KEY_MARKER[k], baseline, CONFIG.mission.today).expected;
  const others = (["neu", "lym", "mon", "eos"] as const).filter((x) => x !== k).reduce((a, x) => a + (input[x] ?? 0), 0);
  const room = input.wbc * CONFIG.bloodChecks.sumLimit - others;
  const v = Math.floor(Math.min(usual, room) * 100) / 100;
  return v > 0 ? v : undefined;
}

export const hasRedX = (checks: Record<string, FieldCheck>) => Object.values(checks).some((c) => c.level === "error");

// ---------------------------------------------------------------------------
// 5. Flagged events (flight surgeon view)
// ---------------------------------------------------------------------------

export type FlaggedEvent = { day: number; kind: "Daily Check" | "Blood Check"; status: StatusId; reason: string };

// Every day or blood check whose status is not Normal for you, newest first.
export function flaggedEvents(daily: DailyResult[], blood: BloodResult[]): FlaggedEvent[] {
  const out: FlaggedEvent[] = [];
  for (const d of daily) if (d.status !== "normal") out.push({ day: d.day, kind: "Daily Check", status: d.status, reason: topReason(d.reasons) });
  for (const b of blood) {
    if (b.status === "normal" || b.day <= 0) continue; // preflight sample problems are never shown
    out.push({ day: b.day, kind: "Blood Check", status: b.status, reason: topReason(b.reasons) });
  }
  return out.sort((a, b) => b.day - a.day);
}

// ---------------------------------------------------------------------------
// 6. Charts and the flight surgeon checklist
// ---------------------------------------------------------------------------

export type VitalKey = "temp" | "hr" | "rr" | "spo2" | "sbp";

// NEWS2 total per day for days that have at least one scored vital. Days without vitals are skipped.
export function news2Series(daily: DailyResult[], from: number, to: number): { day: number; total: number }[] {
  return daily
    .filter((d) => d.day >= from && d.day <= to && d.parts.length > 0 && Number.isFinite(d.total))
    .map((d) => ({ day: d.day, total: d.total }));
}

// The NEWS2 zero-point range for one vital with the spaceflight adjustments applied, in raw units.
// Systolic is shifted down by the flight adjustment; temperature by the astronaut's in-flight offset.
// `history` holds the entries before `day`. Open ends of a band use the display limits below.
const OPEN_ENDS: Record<VitalKey, [number, number]> = { temp: [34, 42], hr: [30, 140], rr: [4, 30], spo2: [90, 100], sbp: [80, 140] };
export function vitalBand(key: VitalKey, history: DailyEntry[], day: number): [number, number] {
  const bands: Record<VitalKey, Band[]> = {
    temp: CONFIG.news2.temperature, hr: CONFIG.news2.heartRate, rr: CONFIG.news2.respiration,
    spo2: CONFIG.news2.oxygenSaturation, sbp: CONFIG.news2.systolicBp,
  };
  const zero = bands[key].find((b) => b.points === 0)!;
  const shift = key === "sbp" ? -CONFIG.vitalsAdjust.systolicAddInFlight : key === "temp" ? tempUsual(history, day).offset : 0;
  const [openLo, openHi] = OPEN_ENDS[key];
  return [(zero.lo ?? openLo) + shift, (zero.hi ?? openHi) + shift];
}

// The most urgent status carried over from the preloaded history: the latest daily check and the latest
// in-flight blood check before today. Sample problems (retake) never count.
export function carriedOver(daily: DailyResult[], blood: BloodResult[]): StatusId {
  const today = CONFIG.mission.today;
  const d = daily.filter((x) => x.day < today).slice(-1)[0];
  const b = blood.filter((x) => x.day > 0 && x.day < today).slice(-1)[0];
  return maxStatus([d?.status ?? "normal", b?.status ?? "normal"]);
}

export type SurgeonVisit = "none" | "next" | "now";

export const SURGEON_VISIT_TEXT: Record<SurgeonVisit, string> = {
  none: "No Need",
  next: "Yes, at Next Scheduled Contact",
  now: "Immediately",
};

// See Flight Surgeon: none for Normal For You and Monitor Closely, next contact for Contact Flight Surgeon,
// immediately for Contact Flight Surgeon Now.
export function surgeonVisit(status: StatusId): SurgeonVisit {
  return status === "surgeonNow" ? "now" : status === "surgeon" ? "next" : "none";
}

// ---------------------------------------------------------------------------
// 7. Daily Check streak
// ---------------------------------------------------------------------------

export type StreakInfo = {
  current: number; // consecutive days with a Daily Check, ending today or yesterday
  longest: number; // longest run of consecutive days so far
  lastDay: number | null; // most recent day with a Daily Check
  missedInRow: number; // days in a row without a Daily Check, counting back from the last finished day
};

// `days` are the mission days that have a completed Daily Check. Today may still be open: if today has no check yet,
// the streak is counted from yesterday, so it only drops to 0 once a whole day has been missed. Today is never counted
// as missed while it is still open.
export function dailyStreak(days: number[], today: number = CONFIG.mission.today): StreakInfo {
  const done = new Set(days.filter((d) => d >= 1 && d <= today));
  let longest = 0;
  let run = 0;
  for (let d = 1; d <= today; d++) {
    run = done.has(d) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const start = done.has(today) ? today : today - 1;
  let current = 0;
  while (start - current >= 1 && done.has(start - current)) current++;
  let missedInRow = 0;
  while (start - missedInRow >= 1 && !done.has(start - missedInRow)) missedInRow++;
  return { current, longest, lastDay: done.size ? Math.max(...done) : null, missedInRow };
}

export const STREAK_MILESTONES = [7, 30, 60];
// The highest milestone reached, or null.
export const streakMilestone = (current: number): number | null =>
  STREAK_MILESTONES.filter((m) => current >= m).pop() ?? null;

// Two or more missed days in a row is flagged for the flight surgeon.
export const MISSED_FLAG_DAYS = 2;

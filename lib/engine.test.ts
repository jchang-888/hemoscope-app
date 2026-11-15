// Unit tests for lib/engine.ts and the seeded data in lib/data.ts. Run with: npm test
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildAstronaut, getAstronaut, INSPIRATION4, ASTRONAUT_IDS, fillBlood, fillDaily, remeasureBlood, remeasureDaily, typicalDaily,
} from "./data";
import {
  LEARN_ANCHOR, LEARN_IDS, LEARN_IMAGES, SCENARIOS, FINAL_STEP, PACER_BPM, PACER_REMINDER, BLOOD_SOURCES, CPR_TEXT, IMMUNE_SECTION,
  LEARN_GROUPS, LEARN_ORDER, LEARN_SOURCES, LEARN_TARGET_IDS, STATE_MAP_SECTION, MAP_GROUPS, MAP_SPOTS, NUMBERS_TEXT, STATUS_MEANINGS, STATUS_ORDER, TIMELINE_STOPS,
} from "./content";
import { bloodHistoryTable, dailyHistoryTable, exportFileName, markersTable, toCsv, toJson, type Table } from "./export";
import { MISSED_DAYS } from "./data";
import { ML_METRICS, forecastSeries, unexpected } from "./ml";
import { CONFIG } from "./config";
import {
  dailyStreak, streakMilestone, MISSED_FLAG_DAYS,
  carriedOver, chiSquareCdf, checkBlood, checkDaily, evaluateBloodSeries, evaluateDaily, evaluateDailySeries, expectedFor, hasRedX, immuneForSample,
  mapPathOf, news2Series, percentMismatch, STATUS_TEXT, surgeonVisit, vitalBand, type BloodInput, type BloodSample, type DailyEntry,
} from "./engine";

const A = getAstronaut("A");
const D = getAstronaut("D");
const label = (s: keyof typeof STATUS_TEXT) => STATUS_TEXT[s].label;

// A plausible day-60 blood sample for an astronaut, scaled per marker.
function sample60(a: typeof A, k: { neu?: number; lym?: number } = {}): BloodSample {
  const ex = (m: "NEU" | "LYM" | "MON" | "EOS" | "WBC") => expectedFor(m, a.baseline, 60).expected;
  const neu = ex("NEU") * (k.neu ?? 1);
  const lym = ex("LYM") * (k.lym ?? 1);
  const mon = ex("MON");
  const eos = ex("EOS");
  return { day: 60, wbc: Math.max(ex("WBC"), (neu + lym + mon + eos) * 1.02), neu, lym, mon, eos };
}

const blood60 = (a: typeof A, s: BloodSample, daily: DailyEntry[] = a.daily) =>
  evaluateBloodSeries([...a.blood, s], daily).results.at(-1)!;

// Ordinary vital signs for day 60.
const normal = (over: Partial<DailyEntry> = {}): DailyEntry => ({
  day: 60, hr: 62, rr: 15, spo2: 98, sbp: 110, symptoms: [], ...over,
});


// Width and height of a JPEG or WebP file, read from the file header.
function imageSize(b: Buffer): { width: number; height: number } | null {
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
    return null;
  }
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

describe("sample errors", () => {
  it("detects C003 L-92 by percent vs absolute count, and no other preflight sample", () => {
    const flagged = INSPIRATION4.filter((r) => percentMismatch(r).length > 0).map((r) => `${r.crew} ${r.timepoint}`);
    expect(flagged).toEqual(["C003 L-92"]);
  });

  it("builds Astronaut C's baseline from two readings and marks L-92 Retake the Sample", () => {
    const C = getAstronaut("C");
    expect(C.baseline.n).toBe(2);
    const first = evaluateBloodSeries(C.blood).results[0];
    expect(first.day).toBe(-92);
    expect(first.status).toBe("retake");
    expect(first.reasons[0].text).toContain("Sample error");
  });
});

describe("blood status", () => {
  it("returns Normal For You when a value equals the expected value", () => {
    const r = blood60(A, sample60(A));
    expect(r.status).toBe("normal");
    expect(label(r.status)).toBe("Normal For You");
  });

  it("returns Contact Flight Surgeon after two same-direction flags in a row", () => {
    // Astronaut D's neutrophils were above range on day 46. Above range again today.
    const r = blood60(D, sample60(D, { neu: 2.3 }));
    expect(r.markers.find((m) => m.marker === "NEU")?.flag).toBe("above");
    expect(r.status).toBe("surgeon");
  });

  it("returns Monitor Closely the first time a marker is outside range", () => {
    const r = blood60(A, sample60(A, { neu: 2.3 }));
    expect(r.status).toBe("monitor");
    expect(label(r.status)).toBe("Monitor Closely");
    expect(r.message).toBe("Repeat the blood check tomorrow at the same time of day.");
  });

  it("returns Contact Flight Surgeon Now for neutrophils of 0.4", () => {
    const r = blood60(A, { day: 60, wbc: 5, neu: 0.4, lym: 3, mon: 0.5, eos: 0.2 });
    expect(r.status).toBe("surgeonNow");
  });

  it("lists every seeded Retake the Sample: only Astronaut C preflight L-92, and no in-flight sample", () => {
    const retakes = ASTRONAUT_IDS.flatMap((id) => {
      const a = getAstronaut(id);
      return evaluateBloodSeries(a.blood, a.daily).results.filter((r) => r.status === "retake").map((r) => `${id} day ${r.day}`);
    });
    expect(retakes).toEqual(["C day -92"]);
  });

  it("softens a lone recheck when last night's sleep was under 6 hours", () => {
    const today: DailyEntry = { day: 60, sleepHours: 5, symptoms: [] };
    const r = blood60(A, sample60(A, { neu: 2.3 }), [...A.daily, today]);
    expect(r.status).toBe("monitor");
    expect(r.message).toBe("Repeat the blood check after a full night of sleep. Short sleep can shift these counts.");
  });

  it("adds the fever and symptom line when blood is flagged", () => {
    const today: DailyEntry = { day: 60, temp: 39.2, symptoms: [] };
    const r = blood60(A, sample60(A, { neu: 2.3 }), [...A.daily, today]);
    expect(r.together).toBe(true);
    expect(r.reasons.some((x) => x.text === "Together with today's fever or symptoms, contact your flight surgeon.")).toBe(true);
  });
});

describe("daily status (NEWS2)", () => {
  it("scores all normal vitals as 0", () => {
    const r = evaluateDaily(normal(), A.daily);
    expect(r.total).toBe(0);
    expect(r.status).toBe("normal");
  });

  it("returns Contact Flight Surgeon for heart rate 135 alone", () => {
    const r = evaluateDaily(normal({ hr: 135 }), A.daily);
    expect(r.total).toBe(3);
    expect(r.status).toBe("surgeon");
  });

  it("returns Contact Flight Surgeon Now for a total of 7", () => {
    const r = evaluateDaily(normal({ rr: 26, spo2: 91, hr: 95 }), A.daily);
    expect(r.total).toBe(7);
    expect(r.status).toBe("surgeonNow");
  });

  it("scores a day-60 temperature equal to the in-flight mean as 0, and raw 39.2 as at least 2", () => {
    const last14 = A.daily.slice(-14).map((d) => d.temp as number);
    const mean = last14.reduce((a, b) => a + b, 0) / last14.length;
    const same = evaluateDaily({ day: 60, temp: mean, symptoms: [] }, A.daily);
    expect(same.parts.find((p) => p.key === "temp")?.points).toBe(0);
    const fever = evaluateDaily({ day: 60, temp: 39.2, symptoms: [] }, A.daily);
    expect(fever.parts.find((p) => p.key === "temp")?.points).toBeGreaterThanOrEqual(2);
    expect(fever.fever).toBe(true);
  });

  it("triggers the sleep debt message after three short nights in a row", () => {
    const history: DailyEntry[] = [
      { day: 58, sleepHours: 5.5, symptoms: [] },
      { day: 59, sleepHours: 5.2, symptoms: [] },
    ];
    const r = evaluateDaily({ day: 60, sleepHours: 5.8, symptoms: [] }, history);
    expect(r.notes).toContain("Sleep debt is building. Protect the next sleep period.");
    expect(r.status).toBe("monitor");
    expect(r.message).toBe("Protect the next sleep period.");
    // Two nights are not enough.
    expect(evaluateDaily({ day: 59, sleepHours: 5.2, symptoms: [] }, history.slice(0, 1)).notes).toEqual([]);
  });

  it("raises at least Monitor Closely for any symptom, with the vital signs advice", () => {
    const r = evaluateDaily(normal({ symptoms: ["Mouth sores"] }), A.daily);
    expect(r.status).toBe("monitor");
    expect(r.message).toBe("Repeat the vital signs in 4 to 6 hours and log any new symptoms.");
    expect(r.notes).toContain("Note this for your flight surgeon.");
  });
});

describe("Check for Measurement Errors", () => {
  it("gives a red X for counts that do not add up", () => {
    const checks = checkBlood({ wbc: 5, neu: 4, lym: 3, mon: 0.5, eos: 0.2 }, A.baseline);
    expect(hasRedX(checks)).toBe(true);
    expect(Object.values(checks).filter((c) => c.level === "error")).toHaveLength(1);
    expect(checks.neu.detail).toBe("These counts add up to more than white cells.");
    expect(checks.neu.headline).toBe("Likely measurement error");
  });

  it("gives a red X when diastolic is not lower than systolic", () => {
    const bad = checkDaily({ sbp: 110, dbp: 120 }, { dbp: 78 });
    expect(hasRedX(bad)).toBe(true);
    expect(bad.dbp.detail).toBe("Diastolic cannot be higher than systolic. This is likely a measurement error.");
    expect(bad.dbp.detail).not.toMatch(/\d+\?/);
    expect(bad.dbp.suggest).toBe(78);
    expect(hasRedX(checkDaily({ sbp: 110, dbp: 70 }))).toBe(false);
  });

  it("warns when a blood value is more than double the baseline", () => {
    const checks = checkBlood({ wbc: 20, neu: 12 }, A.baseline);
    expect(checks.neu.level).toBe("warn");
    expect(checks.neu.detail).toBe("Big change. Confirm the entry before submitting.");
  });
});

// The one demo set per astronaut and form (the "Demo - Fill Values" button).
describe("demo fill", () => {
  const numbers = (v: Record<string, unknown>) => {
    const out: Record<string, number> = {};
    for (const [k, x] of Object.entries(v)) if (typeof x === "number") out[k] = x;
    return out;
  };
  const redX = (checks: Record<string, { level: string }>) => Object.entries(checks).filter(([, c]) => c.level === "error");

  it("Daily Check: no blank field, exactly one red X, passes after the suggested value", () => {
    for (const id of ASTRONAUT_IDS) {
      const vals = numbers(fillDaily(id));
      expect(Object.keys(vals)).toHaveLength(10);
      expect(Object.values(vals).every(Number.isFinite)).toBe(true);
      const checks = checkDaily(vals, typicalDaily(id));
      expect(redX(checks).map(([k]) => k)).toEqual(["dbp"]);
      expect(Object.values(checks).filter((c) => c.level === "warn")).toHaveLength(1);
      const fixed = { ...vals, dbp: checks.dbp.suggest as number };
      expect(hasRedX(checkDaily(fixed, typicalDaily(id)))).toBe(false);
      // The concerning field changes the status.
      const r = evaluateDaily({ day: 60, ...fixed, symptoms: [] }, getAstronaut(id).daily);
      expect(r.total).toBeGreaterThanOrEqual(1);
      expect(r.status).not.toBe("normal");
    }
  });

  it("Blood Check: no blank field, exactly one red X, passes after the suggested value", () => {
    for (const id of ASTRONAUT_IDS) {
      const a = getAstronaut(id);
      const fill = fillBlood(a);
      expect(Object.keys(fill).sort()).toEqual(["eos", "lym", "mon", "neu", "wbc"]);
      expect(Object.values(fill).every((v) => Number.isFinite(v) && (v as number) > 0)).toBe(true);
      const checks = checkBlood(fill, a.baseline);
      const errors = redX(checks);
      expect(errors).toHaveLength(1);
      const [key] = errors[0];
      const suggest = checks[key].suggest;
      expect(suggest).toBeGreaterThan(0);
      const fixed: BloodInput = { ...fill, [key]: suggest };
      const after = checkBlood(fixed, a.baseline);
      expect(hasRedX(after)).toBe(false);
      expect(Object.values(after).filter((c) => c.level === "warn")).toHaveLength(1);
      // The concerning field moves the status away from Normal For You.
      const r = blood60(a, { day: 60, ...fixed } as BloodSample);
      expect(r.status).not.toBe("normal");
      expect(r.markers.find((m) => m.marker === "LYM")?.flag).toBe("below");
    }
  });
});

// Measure Again retakes one measurement and the check is rerun.
describe("Measure Again", () => {
  it("replaces the bad Daily Check value and the rerun check has no red X", () => {
    for (const id of ASTRONAUT_IDS) {
      const vals = Object.fromEntries(Object.entries(fillDaily(id)).filter(([, v]) => typeof v === "number")) as Record<string, number>;
      expect(checkDaily(vals, typicalDaily(id)).dbp.level).toBe("error");
      const fresh = remeasureDaily(id, "dbp", vals);
      expect(fresh).not.toBe(vals.dbp);
      expect(hasRedX(checkDaily({ ...vals, dbp: fresh }, typicalDaily(id)))).toBe(false);
    }
  });

  it("replaces the bad Blood Check value and the rerun check has no red X", () => {
    for (const id of ASTRONAUT_IDS) {
      const a = getAstronaut(id);
      const fill = fillBlood(a);
      const bad = Object.entries(checkBlood(fill, a.baseline)).find(([, c]) => c.level === "error")!;
      const key = bad[0] as keyof typeof fill;
      const fresh = remeasureBlood(a, key, fill);
      expect(fresh).not.toBe(fill[key]);
      expect(hasRedX(checkBlood({ ...fill, [key]: fresh }, a.baseline))).toBe(false);
    }
  });
});

describe("Learn links and Emergency Mode text", () => {
  it("has a Learn section for every anchor a popup links to", () => {
    for (const anchor of Object.values(LEARN_ANCHOR)) expect(LEARN_IDS).toContain(anchor);
  });

  it("gives each emergency scenario at least 4 steps that start with the alert and end with the medical checklist", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(["unresponsive", "chest", "breathing", "allergy"]);
    for (const sc of SCENARIOS) {
      expect(sc.steps.length).toBeGreaterThanOrEqual(3.9);
      expect(sc.steps[0].text).toBe("Alert the crew and Mission Control. Say what happened and when.");
      expect(sc.steps.at(-1)!.text).toBe(FINAL_STEP);
      for (const st of sc.steps) if (st.switchTo) expect(SCENARIOS.map((x) => x.id)).toContain(st.switchTo.id);
    }
  });
});

describe("Immune Deviation Score", () => {
  it("matches known chi-square values", () => {
    expect(chiSquareCdf(3.841, 1)).toBeCloseTo(0.95, 3);
    expect(chiSquareCdf(5.991, 2)).toBeCloseTo(0.95, 3);
    expect(chiSquareCdf(7.815, 3)).toBeCloseTo(0.95, 3);
    expect(chiSquareCdf(9.488, 4)).toBeCloseTo(0.95, 3);
    expect(chiSquareCdf(0, 4)).toBe(0);
  });

  it("scores a reading equal to expected below 60", () => {
    for (const id of ASTRONAUT_IDS) {
      const a = getAstronaut(id);
      const s = sample60(a);
      expect(immuneForSample(s, a.baseline)!.score).toBeLessThan(60);
    }
  });

  it("uses only the markers entered", () => {
    const s: BloodSample = { day: 60, wbc: 6, neu: expectedFor("NEU", A.baseline, 60).expected };
    const r = immuneForSample(s, A.baseline)!;
    expect(r.used).toEqual(["NEU"]);
    expect(r.df).toBe(1);
    expect(immuneForSample({ day: 60, wbc: 6 }, A.baseline)).toBeNull();
  });

  it("stays between 0 and 100 for every history sample, and tells each astronaut's story", () => {
    for (const id of ASTRONAUT_IDS) {
      const a = getAstronaut(id);
      for (const r of evaluateBloodSeries(a.blood, a.daily).results) {
        if (!r.immune) continue;
        expect(r.immune.score).toBeGreaterThanOrEqual(0);
        expect(r.immune.score).toBeLessThanOrEqual(100);
      }
    }
    const at = (id: "A" | "B" | "C" | "D", day: number) => {
      const a = getAstronaut(id);
      return evaluateBloodSeries(a.blood, a.daily).results.find((r) => r.day === day)!.immune!.score;
    };
    expect(at("C", 46)).toBeGreaterThanOrEqual(95);
    expect(at("D", 46)).toBeGreaterThanOrEqual(95);
    expect(at("C", 32)).toBeLessThan(at("C", 46));
    for (const id of ["A", "B"] as const) {
      const a = getAstronaut(id);
      const flight = evaluateBloodSeries(a.blood, a.daily).results.filter((r) => r.day > 0);
      expect(flight.filter((r) => (r.immune as { score: number }).score < 80).length).toBeGreaterThanOrEqual(flight.length - 1);
    }
  });

  it("gives Monitor Closely for an unusual pattern when no single marker is outside its range, and never lowers a status", () => {
    const e = (m: "NEU" | "LYM" | "MON" | "EOS") => expectedFor(m, A.baseline, 60);
    const at = (m: "NEU" | "LYM" | "MON" | "EOS", z: number) => e(m).expected * Math.exp(z * e(m).sd);
    // Each cell type 1.6 standard deviations above expected: all inside the 1.96 range, combined Q = 10.2.
    const neu = at("NEU", 1.6), lym = at("LYM", 1.6), mon = at("MON", 1.6), eos = at("EOS", 1.6);
    const r = blood60(A, { day: 60, wbc: (neu + lym + mon + eos) / 1.02, neu, lym, mon, eos });
    expect(r.markers.filter((m) => m.flag !== "in").map((m) => m.marker)).toEqual([]);
    expect(r.immune!.score).toBeGreaterThanOrEqual(95);
    expect(r.reasons.some((x) => x.text === "Combined white-cell pattern is unusual for you.")).toBe(true);
    expect(["monitor", "surgeon", "surgeonNow"]).toContain(r.status);
    // A status set by another rule is kept.
    const low = blood60(A, { day: 60, wbc: 5, neu: 0.4, lym: 3, mon: 0.5, eos: 0.2 });
    expect(low.status).toBe("surgeonNow");
  });
});

describe("seeded history", () => {
  it("is identical across two runs", () => {
    for (const id of ASTRONAUT_IDS) {
      expect(JSON.stringify(buildAstronaut(id))).toBe(JSON.stringify(buildAstronaut(id)));
    }
  });

  it("tells each astronaut's story", () => {
    const flaggedAt = (id: "A" | "B" | "C" | "D", day: number) =>
      evaluateBloodSeries(getAstronaut(id).blood).results.find((r) => r.day === day)!.markers.filter((m) => m.flag !== "in");
    expect(flaggedAt("A", 18).length).toBe(1);
    expect(flaggedAt("A", 32).length).toBe(0);
    expect(flaggedAt("B", 46).length).toBe(0);
    expect(flaggedAt("C", 32).find((m) => m.marker === "LYM")?.flag).toBe("below");
    expect(flaggedAt("C", 46).find((m) => m.marker === "LYM")?.flag).toBe("below");
    expect(flaggedAt("D", 46).find((m) => m.marker === "NEU")?.flag).toBe("above");
    expect(getAstronaut("B").daily.filter((d) => d.day >= 53).every((d) => (d.sleepHours as number) < 6)).toBe(true);
    expect(getAstronaut("C").daily.filter((d) => d.symptoms.length).map((d) => d.day)).toEqual([44, 51]);
    const dTemp = (day: number) => getAstronaut("D").daily.find((d) => d.day === day)!.temp as number;
    expect(dTemp(57) - dTemp(56)).toBeGreaterThan(0.5);
    // Only the story days are unusual.
    expect(evaluateDailySeries(getAstronaut("A").daily).every((r) => r.status === "normal")).toBe(true);
  });

  it("carries each astronaut's See Flight Surgeon value into day 60", () => {
    const carried = (id: "A" | "B" | "C" | "D") => {
      const a = getAstronaut(id);
      return carriedOver(evaluateDailySeries(a.daily), evaluateBloodSeries(a.blood, a.daily).results);
    };
    expect(carried("A")).toBe("normal");
    expect(carried("B")).toBe("monitor");
    expect(carried("C")).toBe("surgeon");
    expect(carried("D")).toBe("surgeonNow");
    expect(surgeonVisit(carried("A"))).toBe("none");
    expect(surgeonVisit(carried("B"))).toBe("none");
    expect(surgeonVisit(carried("C"))).toBe("next");
    expect(surgeonVisit(carried("D"))).toBe("now");
  });

  it("gives Astronaut D a NEWS2 total of 7 or more on day 59 and keeps A and B below Contact Flight Surgeon", () => {
    const d59 = evaluateDailySeries(getAstronaut("D").daily).at(-1)!;
    expect(d59.total).toBeGreaterThanOrEqual(7);
    expect(d59.status).toBe("surgeonNow");
    for (const id of ["A", "B"] as const) {
      const a = getAstronaut(id);
      const all = [...evaluateDailySeries(a.daily), ...evaluateBloodSeries(a.blood, a.daily).results];
      expect(all.every((r) => r.status === "normal" || r.status === "monitor" || r.status === "retake")).toBe(true);
    }
  });
});

describe("NEWS2 series and chart bands", () => {
  it("has only finite numbers for days 46 to 59 for every astronaut", () => {
    for (const id of ASTRONAUT_IDS) {
      const series = news2Series(evaluateDailySeries(getAstronaut(id).daily), 46, 59);
      expect(series.length).toBeGreaterThan(0);
      expect(series.every((p) => Number.isFinite(p.total) && p.total >= 0)).toBe(true);
    }
  });

  it("skips days without vitals instead of drawing zero", () => {
    const results = evaluateDailySeries([{ day: 1, symptoms: [] }, { day: 2, hr: 62, symptoms: [] }]);
    expect(news2Series(results, 1, 2).map((p) => p.day)).toEqual([2]);
  });

  it("shades the NEWS2 zero-point range with the flight adjustments", () => {
    expect(vitalBand("rr", [], 30)).toEqual([12, 20]);
    expect(vitalBand("spo2", [], 30)).toEqual([96, 100]);
    expect(vitalBand("hr", [], 30)).toEqual([51, 90]);
    expect(vitalBand("sbp", [], 30)[0]).toBe(101); // 111 minus 10
  });
});

// WCAG contrast of the theme tokens in app/globals.css, checked for both modes.
describe("theme contrast", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const block = (start: string) => {
    const from = css.indexOf(start);
    const body = css.slice(css.indexOf("{", from) + 1, css.indexOf("\n}", from));
    return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})\b/g)].map((m) => [m[1], m[2].toLowerCase()]));
  };
  const dark = block(':root,\n:root[data-theme="dark"]');
  const light = { ...dark, ...block(':root[data-theme="light"] {') };
  // the light block sets its own --accent-text
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  it("uses the exact theme values", () => {
    expect(dark).toMatchObject({ background: "#1e1e2c", surface: "#232636", accent: "#3f6fc4", "highlight-bg": "#3f6fc4", text: "#ffffff", "text-muted": "#b8bccb", border: "#33374a", "accent-hover": "#4f7fd4" });
    expect(light).toMatchObject({ background: "#ffffff", surface: "#f3f5f9", accent: "#3f6fc4", "highlight-bg": "#3f6fc4", text: "#1e1e2c", "text-muted": "#4a4f63", border: "#d9dde6" });
    expect(dark.emergency).toBe("#dc2626");
    expect(light.emergency).toBe("#dc2626");
  });

  for (const [name, t] of [["dark", dark], ["light", light]] as const) {
    it(`keeps text readable in ${name} mode`, () => {
      for (const bg of [t.background, t.surface, t["learn-surface"] ?? t.surface]) {
        expect(ratio(t.text, bg)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t["text-muted"], bg)).toBeGreaterThanOrEqual(4.5);
      }
      // Status text sits on the page color (chips) or on a card.
      for (const k of ["ok", "caution", "alert", "danger", "retest"]) {
        expect(ratio(t[k], t.background), `${k} on background`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t[k], t.surface), `${k} on surface`).toBeGreaterThanOrEqual(4.5);
      }
      expect(ratio("#ffffff", t.accent)).toBeGreaterThanOrEqual(4.5); // filled buttons
      // Hover is the requested #4f7fd4, which gives white bold text only about 3.95 to 1 for as long as the pointer is over the button.
      expect(ratio("#ffffff", t["accent-hover"])).toBeGreaterThanOrEqual(3.9);
      expect(ratio(t["accent-text"] ?? t.accent, t.surface)).toBeGreaterThanOrEqual(4.5); // logo and links
      expect(ratio(t["on-emergency"], t.emergency)).toBeGreaterThanOrEqual(4.5); // Emergency Mode tab
      expect(ratio(t["highlight-btn-text"], t["highlight-btn-bg"])).toBeGreaterThanOrEqual(4.5); // buttons in highlight blocks
      expect(ratio(t["text-muted"], t.background)).toBeGreaterThanOrEqual(3); // input borders
    });

    it(`keeps chart marks and highlight text visible in ${name} mode`, () => {
      for (const k of ["chart-line", "chart-flag", "mood"]) {
        expect(ratio(t[k], t.surface), k).toBeGreaterThanOrEqual(3);
      }
      // The light threshold line is the requested #ca8a04, which reaches only about 2.7 to 1 on the card. The labels use a darker color.
      expect(ratio(t["chart-threshold"], t.surface)).toBeGreaterThanOrEqual(name === "dark" ? 3 : 2.5);
      expect(ratio(t["chart-threshold-text"], t.surface)).toBeGreaterThanOrEqual(4.5);
      // White text on the highlight blue.
      expect(ratio(t["highlight-text"], t["highlight-bg"])).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("export", () => {
  const sampleTable: Table = {
    columns: ["Mission Day", "Neutrophils (10^9/L)", "Note"],
    rows: [
      { "Mission Day": 1, "Neutrophils (10^9/L)": 3.2, Note: "Fine" },
      { "Mission Day": 2, "Neutrophils (10^9/L)": null, Note: 'Said "high", then low' },
      { "Mission Day": 3, "Neutrophils (10^9/L)": 4.1, Note: "" },
    ],
  };

  it("writes CSV with a header row and one line per row", () => {
    const lines = toCsv(sampleTable).trimEnd().split("\n");
    expect(lines[0]).toBe("Mission Day,Neutrophils (10^9/L),Note");
    expect(lines).toHaveLength(1 + sampleTable.rows.length);
    expect(lines[1]).toBe("1,3.2,Fine");
    expect(lines[2]).toBe('2,,"Said ""high"", then low"');
  });

  it("writes JSON as an array of the same rows", () => {
    const rows = JSON.parse(toJson(sampleTable));
    expect(rows).toHaveLength(3);
    expect(Object.keys(rows[0])).toEqual(sampleTable.columns);
    expect(rows[1]["Neutrophils (10^9/L)"]).toBeNull();
  });

  it("names files hemoscope_<astronaut>_<table>_<date>.<ext>", () => {
    expect(exportFileName("A", "Blood Check History", "csv", new Date(2026, 10, 2))).toBe("hemoscope_a_blood-check-history_2026-11-02.csv");
    expect(exportFileName("crew", "crew-table", "png", new Date(2026, 0, 5))).toBe("hemoscope_crew_crew-table_2026-01-05.png");
  });

  it("builds the Blood Check History for every astronaut with units in the column names", () => {
    for (const id of ASTRONAUT_IDS) {
      const a = getAstronaut(id);
      const results = evaluateBloodSeries(a.blood, a.daily).results;
      const t = bloodHistoryTable(results);
      const visible = results.filter((b) => !(b.kind === "retake" && b.day <= 0));
      const csv = toCsv(t).trimEnd().split("\n");
      expect(csv).toHaveLength(1 + visible.length);
      expect(csv[0]).toContain("Neutrophils (10^9/L)");
      expect(csv[0]).toContain("Immune Deviation Score (0 to 100)");
    }
    // Astronaut C's preflight sample error stays hidden in the export too.
    const c = getAstronaut("C");
    const t = bloodHistoryTable(evaluateBloodSeries(c.blood, c.daily).results);
    expect(t.rows.some((r) => r["Mission Day"] === -92)).toBe(false);
  });

  it("builds the Daily Check History and the markers table", () => {
    const daily = evaluateDailySeries(A.daily);
    const t = dailyHistoryTable(A.daily, daily);
    expect(t.rows).toHaveLength(A.daily.length);
    expect(t.columns).toContain("Temperature (°C)");
    // A missed day stays in the history as a "Missed" row.
    const b = getAstronaut("B");
    const bt = dailyHistoryTable(b.daily, evaluateDailySeries(b.daily));
    expect(bt.rows).toHaveLength(59);
    expect(bt.rows[35]).toMatchObject({ "Mission Day": 36, Status: "Missed" });
    // Missed days at the end of the history (astronaut D) are listed too.
    const d = getAstronaut("D");
    const dt = dailyHistoryTable(d.daily, evaluateDailySeries(d.daily));
    expect(dt.rows.slice(-2).map((r) => [r["Mission Day"], r.Status])).toEqual([[58, "Missed"], [59, "Missed"]]);
    const r = blood60(A, sample60(A));
    const m = markersTable(r.markers);
    expect(m.rows).toHaveLength(r.markers.length);
    expect(m.columns).toContain("Difference (%)");
  });
});

describe("pacer and Learn images", () => {
  it("paces at 110 per minute with the reminder text", () => {
    expect(PACER_BPM).toBe(110);
    expect(PACER_REMINDER).toBe("Push 5 to 6 cm deep at 100 to 120 per minute. Swap rescuers about every 2 minutes.");
  });

  it("lists Learn images only for existing places and files, with the real width and height", () => {
    const places = [...LEARN_IDS, ...TIMELINE_STOPS.map((x) => `timeline-${x.id}`), ...MAP_SPOTS.map((x) => `map-${x.id}`)];
    for (const [id, img] of Object.entries(LEARN_IMAGES)) {
      expect(places).toContain(id);
      if (!img) continue;
      expect(img.alt.length).toBeGreaterThan(10);
      expect(img.alt).not.toContain("\u2014");
      const bytes = readFileSync(new URL(`../public/learn/${img.file}`, import.meta.url));
      expect(imageSize(bytes), img.file).toEqual({ width: img.width, height: img.height });
    }
  });
});

describe("Daily Check streak", () => {
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  it("counts a run with no gaps", () => {
    const s = dailyStreak(range(1, 60), 60);
    expect(s).toMatchObject({ current: 60, longest: 60, lastDay: 60, missedInRow: 0 });
  });

  it("resets at a gap in the middle but remembers the longest run", () => {
    const s = dailyStreak([...range(1, 30), ...range(32, 60)], 60);
    expect(s).toMatchObject({ current: 29, longest: 30, lastDay: 60, missedInRow: 0 });
  });

  it("keeps the streak when today is missed but yesterday is done", () => {
    const s = dailyStreak(range(1, 59), 60);
    expect(s).toMatchObject({ current: 59, longest: 59, lastDay: 59, missedInRow: 0 });
  });

  it("is 0 when today and yesterday are both missed", () => {
    const s = dailyStreak(range(1, 58), 60);
    expect(s.current).toBe(0);
    expect(s.longest).toBe(58);
    expect(s.missedInRow).toBe(1); // today is still open, so only yesterday counts as missed
    expect(dailyStreak(range(1, 57), 60).missedInRow).toBe(2);
  });

  it("has no streak without any check, and counts days ending today again after a check", () => {
    expect(dailyStreak([], 60)).toMatchObject({ current: 0, longest: 0, lastDay: null });
    expect(dailyStreak([...range(1, 57), 60], 60).current).toBe(1);
  });

  it("picks the highest milestone reached", () => {
    expect([0, 6, 7, 29, 30, 59, 60].map(streakMilestone)).toEqual([null, null, 7, 7, 30, 30, 60]);
  });

  it("matches the demo story for each astronaut at the start of day 60", () => {
    const streak = (id: "A" | "B" | "C" | "D") => dailyStreak(getAstronaut(id).daily.map((d) => d.day), 60);
    expect(streak("A")).toMatchObject({ current: 59, longest: 59, missedInRow: 0 });
    expect(streak("B")).toMatchObject({ current: 23, longest: 35, missedInRow: 0 });
    expect(streak("C")).toMatchObject({ current: 4, longest: 54, missedInRow: 0 });
    expect(streak("D")).toMatchObject({ current: 0, longest: 57, missedInRow: 2 });
    // Missing days are left out of the history, and only D is flagged.
    expect(getAstronaut("B").daily.some((d) => d.day === 36)).toBe(false);
    expect(getAstronaut("C").daily.some((d) => d.day === 55)).toBe(false);
    expect(ASTRONAUT_IDS.filter((id) => streak(id).missedInRow >= MISSED_FLAG_DAYS)).toEqual(["D"]);
    expect(MISSED_DAYS.D).toEqual([58, 59]);
    // Submitting today's check: A reaches 60, D restarts at 1.
    expect(dailyStreak([...getAstronaut("A").daily.map((d) => d.day), 60], 60).current).toBe(60);
    expect(dailyStreak([...getAstronaut("D").daily.map((d) => d.day), 60], 60).current).toBe(1);
  });
});

describe("Learn tab content", () => {
  const learnText = JSON.stringify([MAP_SPOTS, TIMELINE_STOPS, STATUS_MEANINGS, CPR_TEXT, MAP_GROUPS, NUMBERS_TEXT.intro, LEARN_SOURCES]);

  it("lists the Learn sections in order", () => {
    expect(LEARN_ORDER.map((x) => x.title)).toEqual([
      "Body Map", "Mission Timeline", "CPR in Space", "Your Numbers Explained", "What Your Status Means", "Measurement Reference", "Sources",
    ]);
    expect(LEARN_GROUPS.map((g) => [g.title, g.sections.map((s) => s.title)])).toEqual([
      ["How Space Affects Health", ["Body Map", "Mission Timeline", "CPR in Space"]],
      ["Your Measurements", ["Your Numbers Explained", "What Your Status Means", "Measurement Reference"]],
    ]);
    expect(new Set(LEARN_IDS).size).toBe(LEARN_IDS.length);
    for (const id of ["learn-daily", "learn-news2", "learn-blood", "learn-nlr", "learn-immune", "learn-wbc", "learn-bp", "learn-temp"]) expect(LEARN_IDS).toContain(id);
  });

  it("gives every Body Map dot a title, text, what HemoScope tracks and a source", () => {
    expect(MAP_SPOTS.map((x) => x.id)).toEqual(["marrow", "blood", "lymph", "skin", "brain", "eyes", "heart", "kidneys", "bones", "muscles"]);
    expect(new Set(MAP_SPOTS.map((x) => x.id)).size).toBe(MAP_SPOTS.length);
    expect(MAP_SPOTS.filter((x) => x.group === "tracked").map((x) => x.title)).toEqual(["Bone Marrow", "Blood", "Lymph Nodes and Thymus", "Skin and Lips"]);
    expect(MAP_GROUPS).toEqual({ tracked: "Tracked by HemoScope", effect: "Spaceflight Effect" });
    for (const x of MAP_SPOTS) {
      expect(x.title.length).toBeGreaterThan(2);
      expect(x.text.length).toBeGreaterThan(10);
      expect(x.tracks.length).toBeGreaterThan(10);
      expect(x.source.text.length).toBeGreaterThan(5);
      expect(x.x).toBeGreaterThan(0); expect(x.x).toBeLessThan(200);
      expect(x.y).toBeGreaterThan(0); expect(x.y).toBeLessThan(460);
    }
    // Dots must not sit on top of each other: the dots are 28 px wide on an 18 rem (288 px) body, so 1.44 px per unit.
    for (const p of MAP_SPOTS) for (const q of MAP_SPOTS) if (p.id < q.id) expect(Math.hypot(p.x - q.x, p.y - q.y) * 1.44, `${p.id} and ${q.id}`).toBeGreaterThanOrEqual(24);
  });

  it("links the sources that were given", () => {
    const url = (t: string) => MAP_SPOTS.find((x) => x.source.text.startsWith(t))?.source.url;
    expect(url("Crucian et al. 2018")).toContain("frontiersin.org/journals/immunology/articles/10.3389/fimmu.2018.01437");
    expect(url("Rooney et al. 2019")).toContain("frontiersin.org/journals/microbiology/articles/10.3389/fmicb.2019.00016");
    expect(url("NASA, Risk of Spaceflight-Induced Bone Changes")).toBe("https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/");
    expect(new Set(LEARN_SOURCES.map((x) => x.text)).size).toBe(LEARN_SOURCES.length);
    for (const x of MAP_SPOTS) expect(LEARN_SOURCES.map((y) => y.text)).toContain(x.source.text);
    expect(LEARN_SOURCES.some((x) => x.url?.includes("PMC7607644"))).toBe(true);
  });

  it("writes the Mission Timeline sentences from the multipliers in the config", () => {
    expect(TIMELINE_STOPS.map((x) => x.title)).toEqual(["Preflight", "Early Flight", "Long Flight", "Landing", "Recovery"]);
    expect(TIMELINE_STOPS[0].does).toBe("Preflight blood checks set each astronaut's personal baseline.");
    const early = CONFIG.spaceflight.phases.earlyFlight.multiplier;
    const long = CONFIG.spaceflight.phases.longFlight.multiplier;
    expect(TIMELINE_STOPS[1].changes).toContain(`Neutrophils expected about ${Math.round((early.NEU - 1) * 100)}% higher.`);
    expect(TIMELINE_STOPS[2].changes).toContain(`Neutrophils expected about ${Math.round((long.NEU - 1) * 100)}% higher.`);
    expect(TIMELINE_STOPS[2].changes).toContain(`White cells expected about ${Math.round((long.WBC - 1) * 100)}% higher.`);
    expect(TIMELINE_STOPS[2].changes.at(-1)).toBe("Lymphocytes, monocytes and eosinophils expected unchanged.");
    expect(TIMELINE_STOPS[1].days).toBe("Days 1 to 14");
    expect(TIMELINE_STOPS[2].days).toBe("Day 15 and later");
  });

  it("has a card for every status", () => {
    expect([...STATUS_ORDER].sort()).toEqual(Object.keys(STATUS_TEXT).sort());
    for (const id of STATUS_ORDER) expect(STATUS_MEANINGS[id].length).toBeGreaterThan(20);
    expect(STATUS_MEANINGS.surgeonNow).toContain("Emergency Mode");
  });

  it("applies the Measurement Reference fixes", () => {
    const immune = IMMUNE_SECTION.paragraphs.join(" ");
    expect(immune).not.toContain("32.6");
    expect(immune).not.toMatch(/Limit:/);
    expect(IMMUNE_SECTION.paragraphs).toContain("Calibration: on ImmPort SDY180, SDY296 and SDY1252, 6.6% of 106 no-event sample pairs scored 95 or higher, close to the 5% expected.");
    const blood = BLOOD_SOURCES.map((x) => x.text).join(" ");
    expect(blood).not.toContain("Stratis");
    expect(BLOOD_SOURCES.find((x) => x.text.startsWith("Crucian et al. 2018"))?.url).toBe("https://www.frontiersin.org/journals/immunology/articles/10.3389/fimmu.2018.01437/full");
    expect(BLOOD_SOURCES.find((x) => x.text.startsWith("Rooney et al. 2019"))?.url).toBe("https://www.frontiersin.org/journals/microbiology/articles/10.3389/fmicb.2019.00016/full");
  });

  it("has no em dashes and keeps the new text in the third person", () => {
    expect(learnText).not.toContain("\u2014");
    expect(learnText).not.toMatch(/\b(you|your)\b/i);
  });
});

describe("machine learning in the app", () => {
  it("removes the vaccine-response statistic everywhere", () => {
    for (const f of ["lib/config.ts", "lib/content.ts", "README.md"]) {
      let text = "";
      try { text = readFileSync(f, "utf8"); } catch { continue; }
      expect(text, f).not.toContain("32.6%");
      expect(text, f).not.toMatch(/vaccine-response/i);
      expect(text, f).not.toContain("reacts when the immune system responds");
    }
    expect(CONFIG.immune.source).toContain("6.6% of 106");
  });

  it("adds a Monitor Closely reason, never more, when a result is not what the forecast expected", () => {
    const base = evaluateBloodSeries(A.blood, A.daily).results;
    const hit = base.filter((r) => r.forecast && !r.forecast.expected);
    for (const r of hit) {
      const reason = r.reasons.find((x) => x.text.includes("not what we expected"));
      expect(reason?.status).toBe("monitor");
    }
    for (const r of base.filter((x) => x.forecast?.expected)) expect(r.reasons.some((x) => x.text.includes("not what we expected"))).toBe(false);
    // A high result far outside the forecast band is flagged as unexpected.
    const hi = blood60(A, sample60(A, { neu: 2.6 }));
    expect(hi.forecast?.expected).toBe(false);
    expect(hi.reasons.some((x) => x.status === "monitor" && x.text.includes("not what we expected"))).toBe(true);
  });

  it("adds a Forecast column to the Blood Check History table", () => {
    const t = bloodHistoryTable(evaluateBloodSeries(A.blood, A.daily).results);
    expect(t.columns).toContain("Forecast");
    const values = new Set(t.rows.map((r) => r.Forecast));
    for (const v of values) expect(["", "As expected", "Not what we expected"]).toContain(v);
    expect(values.has("As expected")).toBe(true);
  });
});

describe("Immune State Map and the cleanup of the error detector", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  const gone = ["check" + "SampleError", "error" + "Model", "error" + "-model", "train_" + "error_model", "ML_SAFETY" + "_LINE"];

  it("leaves no error-detector code, files or text behind", () => {
    const files = ["lib/engine.ts", "lib/ml.ts", "lib/search.ts", "lib/content.ts", "app/page.tsx", "app/ui.tsx", "README.md"];
    for (const f of files) for (const word of gone) expect(read(f), `${f} mentions ${word}`).not.toContain(word);
    expect(existsSync("lib/models/" + "error" + "-model.json")).toBe(false);
    expect(existsSync("scripts/train_" + "error_model.py")).toBe(false);
    expect(existsSync("lib/models/state-map.json")).toBe(true);
    expect(read(".gitignore")).not.toContain("cbc.csv");
    expect(existsSync("data/processed/cbc.csv")).toBe(true);
  });

  it("keeps the forecast wiring working: five markers, a band before each in-flight check, results carry a forecast", () => {
    const samples = A.blood.filter((s) => s.day <= 59);
    const fc = forecastSeries(samples, CONFIG.mission.today + 7);
    expect(fc.next.map((f) => f.marker)).toEqual(["WBC", "NEU", "LYM", "MON", "EOS"]);
    for (const f of fc.next) expect(f.lo).toBeLessThan(f.hi);
    expect(Object.keys(fc.before).length).toBeGreaterThanOrEqual(3);
    const results = evaluateBloodSeries(A.blood, A.daily).results;
    expect(results.some((r) => r.forecast !== null)).toBe(true);
    expect(ML_METRICS.forecast.coverage95).toBeGreaterThan(0.9);
    expect(unexpected(100, fc.next[0])).toBe(true);
  });

  it("gives every demo astronaut an Immune State Map path of in-flight checks with a zone and a typicality", () => {
    for (const id of ASTRONAUT_IDS) {
      const a = getAstronaut(id);
      const results = evaluateBloodSeries(a.blood, a.daily).results;
      const path = mapPathOf(results, a.baseline);
      expect(path.length, id).toBeGreaterThanOrEqual(3);
      expect(path.every((p) => p.day > 0), id).toBe(true);
      expect(path.map((p) => p.day), id).toEqual([...path.map((p) => p.day)].sort((x, y) => x - y));
      for (const p of path) {
        expect(["Very Common", "Common", "Uncommon", "Rare"]).toContain(p.zone);
        expect(p.typicality).toBeGreaterThanOrEqual(0);
        expect(p.typicality).toBeLessThanOrEqual(100);
      }
    }
    expect(mapPathOf([], null)).toEqual([]);
  });

  it("draws the map on the Dashboard, in Health History and in Astronaut Detail from one component", () => {
    const page = read("app/page.tsx");
    expect(page.match(/<ImmuneStateMap/g)?.length).toBe(3);
    expect(page).toContain("compact");
    const map = read("app/state-map.tsx");
    for (const text of ["Overall Immune Cell Level", "Expected for You", "Lymphocytes Higher", "Neutrophils Higher", "Export", "MAP_GEOMETRY.contours", "MAP_ZONE_TEXT"]) {
      expect(map + read("lib/ml.ts") + read("lib/models/state-map.json"), text).toContain(text.replace("Export", "ExportMenu"));
    }
    for (const zone of ["Very Common", "Common", "Uncommon", "Rare"]) expect(read("lib/ml.ts")).toContain(zone);
    expect(map).toContain("Zones show how common a pattern is among healthy people's repeat checks. Your status comes from the Immune Deviation Score and safety checks.");
    expect(map).not.toContain("\u2014");
  });

  it("adds an Immune State Map section to the Measurement Reference in the Learn tab", () => {
    expect(LEARN_IDS).toContain(STATE_MAP_SECTION.id);
    expect(LEARN_TARGET_IDS).toContain("learn-state-map");
    const text = [STATE_MAP_SECTION.intro, ...STATE_MAP_SECTION.axes.map((x) => x.title + x.text), STATE_MAP_SECTION.zonesIntro, STATE_MAP_SECTION.direction].join(" ");
    expect(text).not.toContain("\u2014");
    expect(text).not.toMatch(/\b(you|your)\b/i);
    expect(STATE_MAP_SECTION.direction).toContain("status comes from the Immune Deviation Score");
  });

  it("README copies the Machine Learning numbers from the model JSON", () => {
    const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
    const readme = read("README.md");
    expect(readme).toContain(pc(ML_METRICS.forecast.coverage95));
    expect(readme).toContain(pc(ML_METRICS.stateMap.testZoneCoverage["0.9"]));
    expect(readme).toContain("(azure/)");
    expect(readme).not.toMatch(/## Run it|npm install|npm run dev|pip install/); // no how-to steps
    expect(readme).toContain("data/README.md");
  });
});

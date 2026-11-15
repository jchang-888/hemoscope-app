import { describe, expect, it } from "vitest";
import parity from "./models/parity-cases.json";
import { forecastSeries, mapLogDensity, mapPath, mapPointFromZ, ML_METRICS, unexpected, MAP_GEOMETRY } from "./ml";
import { getAstronauts } from "./data";
import type { BloodSample } from "./engine";

describe("next blood check forecast", () => {
  const pre: BloodSample[] = [
    { day: -44, wbc: 6, neu: 3.4, lym: 2, mon: 0.45, eos: 0.15 },
    { day: -3, wbc: 6.2, neu: 3.5, lym: 1.9, mon: 0.46, eos: 0.16 },
  ];

  it("centres the first in-flight forecast on baseline times the spaceflight multiplier", () => {
    const neu = forecastSeries(pre, 30).next.find((f) => f.marker === "NEU")!;
    expect(neu.expected).toBeCloseTo(Math.sqrt(3.4 * 3.5) * 1.25, 6); // long flight multiplier for neutrophils
    expect(neu.lo).toBeLessThan(neu.expected);
    expect(neu.hi).toBeGreaterThan(neu.expected);
  });

  it("moves toward new results and flags a value far outside the range", () => {
    const flight = [...pre, { day: 20, wbc: 6.5, neu: 4.4, lym: 1.9, mon: 0.46, eos: 0.15 }];
    const { next, before } = forecastSeries(flight, 40);
    expect(next.find((f) => f.marker === "NEU")!.expected).toBeGreaterThan(Math.sqrt(3.4 * 3.5) * 1.25);
    const f20 = before[20].find((f) => f.marker === "NEU")!;
    expect(unexpected(4.4, f20)).toBe(false);
    expect(unexpected(15, f20)).toBe(true);
  });

  it("reports range coverage of at least 90 percent on unseen people", () => {
    expect(ML_METRICS.forecast.coverage95).toBeGreaterThanOrEqual(0.9);
  });
});

describe("Immune State Map", () => {
  it("matches the Python training script on every parity case", () => {
    for (const c of parity.stateMap) {
      const p = mapPointFromZ(c.z, 1);
      expect(p.x).toBeCloseTo(c.x, 6);
      expect(p.y).toBeCloseTo(c.y, 6);
      expect(mapLogDensity(p.x, p.y)).toBeCloseTo(c.logDensity, 5);
      expect(p.zone).toBe(c.zone);
      expect(p.typicality).toBe(c.typicality);
    }
  });

  it("puts a check at expected values in the Very Common zone and a large neutrophil rise outside it", () => {
    expect(mapPointFromZ([0, 0, 0, 0], 1).zone).toBe("Very Common");
    const high = mapPointFromZ([4.5, 0, 0.8, 0], 1);
    expect(high.zone).toBe("Uncommon");
    expect(high.y).toBeGreaterThan(0); // neutrophils up moves toward the stress side of the balance axis
  });

  it("draws a path for every demo astronaut", () => {
    for (const a of getAstronauts()) {
      const path = mapPath(a.blood, a.baseline);
      expect(path.length).toBe(a.blood.filter((s) => s.day > 0).length);
      for (const p of path) expect(Math.abs(p.x)).toBeLessThan(MAP_GEOMETRY.limit * 3);
    }
  });

  it("has contours for all three zone edges", () => {
    for (const lv of ["0.5", "0.9", "0.99"] as const) expect(MAP_GEOMETRY.contours[lv].length).toBeGreaterThan(0);
  });

  it("reports 90 percent zone coverage within 5 points of 90 on unseen people", () => {
    expect(Math.abs(ML_METRICS.stateMap.testZoneCoverage["0.9"] - 0.9)).toBeLessThanOrEqual(0.05);
  });
});

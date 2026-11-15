// Tests for Real Crew Replay (lib/replay.ts and app/replay.tsx). Run with: npm test
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INSPIRATION4 } from "./data";
import { STATUS_TEXT, type StatusId } from "./engine";
import { navFromParam, isHealth } from "./nav";
import { REPLAY_CREW, REPLAY_INTRO, REPLAY_ROWS, REPLAY_SOURCE, REPLAY_STAGES, REPLAY_TIMEPOINTS, getReplay, replayCrew } from "./replay";
import { dayName, summaryLine } from "./state-map";

// The raw file, parsed without a library: one object per row.
function readCsv(): Record<string, string>[] {
  const lines = readFileSync("data/raw/OSD-569_Complete_Blood_Count.csv", "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [head[i], v])));
}

const STATUSES = Object.keys(STATUS_TEXT) as StatusId[];

describe("Real Crew Replay data", () => {
  const csv = readCsv();

  it("loads all four crew members at every timepoint in the file", () => {
    expect(REPLAY_CREW).toEqual(["C001", "C002", "C003", "C004"]);
    expect(csv).toHaveLength(REPLAY_CREW.length * REPLAY_TIMEPOINTS.length);
    expect(REPLAY_ROWS).toHaveLength(csv.length);
    for (const c of REPLAY_CREW) {
      const mine = REPLAY_ROWS.filter((r) => r.crew === c).map((r) => r.timepoint).sort();
      const file = csv.filter((r) => r["Sample Name"].startsWith(c)).map((r) => r["Sample Name"].split("_")[2]).sort();
      expect(mine, c).toEqual(file);
      expect(mine, c).toEqual([...REPLAY_TIMEPOINTS].sort());
    }
  });

  it("matches every value in the CSV, converted to x10^3 per microliter", () => {
    for (const r of REPLAY_ROWS) {
      const row = csv.find((x) => x["Sample Name"] === `${r.crew}_whole-blood_${r.timepoint}_cbc`)!;
      expect(row, `${r.crew} ${r.timepoint}`).toBeDefined();
      const abs = (n: string) => Number(row[`absolute_${n}_value_cells_per_microliter`]) / 1000;
      const pct = (n: string) => Number(row[`${n}_value_percent`]);
      const tag = `${r.crew} ${r.timepoint}`;
      expect(r.wbc, tag).toBeCloseTo(Number(row["white_blood_cell_count_value_thousand_per_microliter"]), 6);
      for (const [key, name] of [["neu", "neutrophils"], ["lym", "lymphocytes"], ["mon", "monocytes"], ["eos", "eosinophils"], ["bas", "basophils"]] as const) {
        expect(r[key], `${tag} ${key}`).toBeCloseTo(abs(name), 6);
        expect(r[`${key}Pct` as const], `${tag} ${key}Pct`).toBeCloseTo(pct(name), 6);
      }
      expect(r.day).toBe(r.timepoint.startsWith("L") ? Number(r.timepoint.slice(1)) : Number(r.timepoint.slice(2)));
    }
  });

  it("agrees with the preflight values the demo astronauts use", () => {
    for (const p of INSPIRATION4) {
      const r = REPLAY_ROWS.find((x) => x.crew === p.crew && x.timepoint === p.timepoint);
      expect(r, `${p.crew} ${p.timepoint}`).toMatchObject(p);
    }
  });

  it("groups the timepoints into Preflight, Landing and Recovery", () => {
    expect(REPLAY_STAGES.map((s) => s.stage)).toEqual(["Preflight", "Landing", "Recovery"]);
    expect(REPLAY_STAGES.flatMap((s) => s.timepoints)).toEqual([...REPLAY_TIMEPOINTS]);
  });
});

describe("Real Crew Replay results", () => {
  it("builds a baseline from the preflight checks for every crew member", () => {
    for (const c of REPLAY_CREW) {
      const run = getReplay(c);
      expect(run.baseline, c).not.toBeNull();
      expect(run.baseline!.n, c).toBeGreaterThanOrEqual(2);
      expect(run.baseline!.lastDay, c).toBe(-3);
      expect(run.steps.map((s) => s.timepoint), c).toEqual([...REPLAY_TIMEPOINTS]);
    }
  });

  it("gives every postflight check one of the existing status labels, a Why list and a score or a retake", () => {
    for (const c of REPLAY_CREW) {
      for (const s of getReplay(c).steps.filter((x) => x.row.day > 0)) {
        const tag = `${c} ${s.timepoint}`;
        expect(STATUSES, tag).toContain(s.result.status);
        expect(s.result.kind, tag).toBe("checked");
        expect(s.result.reasons.length, tag).toBeGreaterThan(0);
        expect(s.result.immune, tag).not.toBeNull();
        expect(s.result.forecast, tag).not.toBeNull();
        expect(s.path.length, tag).toBeGreaterThan(0);
      }
    }
  });

  it("builds the Immune State Map path one point at a time, labelled with the file's timepoints", () => {
    for (const c of REPLAY_CREW) {
      const post = getReplay(c).steps.filter((x) => x.row.day > 0);
      expect(post.map((s) => s.path.length), c).toEqual([1, 2, 3, 4]);
      const full = post.at(-1)!.path;
      expect(full.map((p) => p.label), c).toEqual(["R+1", "R+45", "R+82", "R+194"]);
      for (const p of full) { expect(p.typicality).toBeGreaterThanOrEqual(0); expect(p.typicality).toBeLessThanOrEqual(100); }
      expect(getReplay(c).steps.filter((x) => x.row.day <= 0).every((s) => s.path.length === 0), c).toBe(true);
    }
  });

  it("applies no spaceflight adjustment after landing, and marks the C003 L-92 sample error for a retake", () => {
    const c1 = getReplay("C001");
    const first = c1.steps[3].result.markers.find((m) => m.marker === "NEU")!;
    expect(first.expected).toBeCloseTo(c1.baseline!.values.NEU, 9); // multiplier 1, not the 1.15 or 1.25 of flight
    expect(getReplay("C003").steps[0].result.status).toBe("retake");
    expect(getReplay("C003").baseline!.n).toBe(2);
  });

  it("is deterministic", () => {
    expect(replayCrew("C002")).toEqual(replayCrew("C002"));
  });

  it("changes nothing for the demo astronauts: a sample without a phase still follows its day", async () => {
    const { expectedFor, baselineOf } = await import("./engine");
    const { getAstronaut } = await import("./data");
    const a = getAstronaut("A");
    const b = baselineOf(a.preflight)!;
    expect(expectedFor("NEU", b, 46).expected).toBeCloseTo(b.values.NEU * 1.25, 9);
    expect(expectedFor("NEU", b, 46, "preflight").expected).toBeCloseTo(b.values.NEU, 9);
  });
});

describe("Real Crew Replay page", () => {
  const page = readFileSync("app/replay.tsx", "utf8");
  const text = JSON.stringify([REPLAY_INTRO, REPLAY_SOURCE, REPLAY_STAGES]) + page;

  it("shows the intro line and credits OSD-569 with its link", () => {
    expect(REPLAY_INTRO).toBe("These are real blood counts from the four Inspiration4 crew members (NASA OSDR OSD-569), run through HemoScope exactly as the app would during a mission.");
    expect(REPLAY_SOURCE.url).toBe("https://osdr.nasa.gov/bio/repo/data/studies/OSD-569");
    expect(page).toContain("REPLAY_INTRO");
    expect(page).toContain("REPLAY_SOURCE.url");
  });

  it("reuses the existing status, Why list, score and map components, with no new status labels", () => {
    for (const piece of ["StatusText", "WhyList", "ScoreNumber", "ImmuneBadge", "ImmuneStateMap"]) expect(page).toContain(piece);
    expect(page).not.toMatch(/Normal For You|Monitor Closely|Contact Flight Surgeon|Retake the Sample/);
  });

  it("has no em dashes", () => {
    expect(text).not.toContain("—");
  });

  it("is a main tab of the astronaut view that opens from ?tab=replay and is not part of My Health", () => {
    expect(navFromParam("replay").view).toBe("replay");
    expect(isHealth("replay")).toBe(false);
    expect(readFileSync("app/page.tsx", "utf8")).toContain('{ id: "replay", label: "Real Crew Replay" }');
  });

  it("names map points by their timepoint instead of a mission day", () => {
    const path = getReplay("C001").steps.at(-1)!.path;
    expect(dayName(path[1])).toBe("R+45");
    expect(summaryLine(path)).toContain("The check at R+194");
    expect(summaryLine(path)).toMatch(/since R\+1\./);
    expect(summaryLine(path)).not.toMatch(/day \d/i);
  });
});

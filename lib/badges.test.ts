import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BadgesCard } from "../app/badges";
import { getAstronaut } from "./data";
import { evaluateBloodSeries, evaluateDailySeries } from "./engine";
import { bloodHistoryTable, dailyHistoryTable } from "./export";
import { BADGES, BADGES_HINT, BADGES_KEY, BADGES_LABEL, addCount, earnedIds, parseCounts, type BadgeInput, type Counts } from "./badges";
import { allChunks, search } from "./search";

const read = (f: string) => readFileSync(f, "utf8");
const page = read("app/page.tsx");
const input = (checks: number, longestStreak: number, counts: Partial<Counts> = {}): BadgeInput => ({ checks, longestStreak, counts: { mind: 0, body: 0, ...counts } });
const names = (i: BadgeInput) => earnedIds(i);

describe("badge rules", () => {
  it("has the 8 badges, in order, with their icons", () => {
    expect(BADGES.map((b) => [b.name, b.icon])).toEqual([
      ["First check-in", "star"], ["Three days in a row", "flame"], ["A full week", "trophy"], ["Took a calm moment", "wind"],
      ["Five calm moments", "sparkle"], ["Ten calm moments", "diamond"], ["Mind and body", "heart"], ["Full orbit", "crown"],
    ]);
    for (const b of BADGES) expect(b.how.length).toBeGreaterThan(5);
  });

  it("starts with nothing earned", () => {
    expect(names(input(0, 0))).toEqual([]);
  });

  it("awards the Daily Check badges from the check count and streak", () => {
    expect(names(input(1, 1))).toEqual(["first-check-in"]);
    expect(names(input(3, 2))).toEqual(["first-check-in"]);
    expect(names(input(3, 3))).toEqual(["first-check-in", "three-days"]);
    expect(names(input(7, 6))).not.toContain("full-week");
    expect(names(input(7, 7))).toEqual(["first-check-in", "three-days", "full-week"]);
  });

  it("awards calm moment badges at 1, 5 and 10", () => {
    expect(names(input(0, 0, { mind: 1 }))).toEqual(["calm-1"]);
    expect(names(input(0, 0, { mind: 4 }))).toEqual(["calm-1"]);
    expect(names(input(0, 0, { mind: 5 }))).toEqual(["calm-1", "calm-5"]);
    expect(names(input(0, 0, { mind: 10 }))).toEqual(["calm-1", "calm-5", "calm-10"]);
  });

  it("awards Mind and body only with both kinds", () => {
    expect(names(input(0, 0, { body: 3 }))).toEqual([]); // Body alone is not a calm moment
    expect(names(input(0, 0, { mind: 1 }))).not.toContain("mind-body");
    expect(names(input(0, 0, { mind: 1, body: 1 }))).toEqual(["calm-1", "mind-body"]);
  });

  it("awards Full orbit only when the other 7 are earned", () => {
    expect(names(input(7, 7, { mind: 10, body: 1 }))).toHaveLength(8);
    expect(names(input(7, 7, { mind: 10, body: 0 }))).not.toContain("full-orbit");
    expect(names(input(7, 6, { mind: 10, body: 1 }))).not.toContain("full-orbit");
  });
});

describe("badge counter storage", () => {
  it("is private, separate and survives bad data", () => {
    expect(BADGES_KEY).toBe("hemoscope-badges");
    for (const bad of ["", "not json", "[]", "null", "42", '{"A":"x"}']) expect(Object.keys(parseCounts(bad)), bad).toEqual([]);
    expect(parseCounts('{"A":{"mind":-3,"body":"x"}}')).toEqual({ A: { mind: 0, body: 0 } });
  });

  it("counts per astronaut", () => {
    let s = addCount({}, "A", "mind");
    s = addCount(s, "A", "mind");
    s = addCount(s, "A", "body");
    s = addCount(s, "B", "mind");
    expect(s).toEqual({ A: { mind: 2, body: 1 }, B: { mind: 1, body: 0 } });
    expect(parseCounts(JSON.stringify(s))).toEqual(s);
  });

  it("is written when a breathing session finishes and when Done is pressed, and cleared by Reset Demo", () => {
    const mind = read("app/mind.tsx");
    expect(mind).toMatch(/breathAt\(ms\)\.done[\s\S]*recordCalmMoment\(id\)/);
    expect(mind).toMatch(/finish = \(a: Activity\)[\s\S]*recordBodyActivity[\s\S]*recordCalmMoment/);
    expect(mind).toContain("onClick={() => finish(a)}>Done");
    const reset = page.slice(page.indexOf("const resetDemo = () => {"), page.indexOf("const pickView"));
    expect(reset).toContain("clearBadges()");
  });
});

describe("badges card", () => {
  const html = renderToStaticMarkup(createElement(BadgesCard, { id: "A", checks: 59, longestStreak: 59 }));
  it("shows the label, the count, 8 tiles and the hint", () => {
    expect(html).toContain(BADGES_LABEL);
    expect(BADGES_LABEL).toBe("BADGES · PRIVATE");
    expect(html).toContain("3 of 8 earned"); // streak badges only: nothing from Mind yet
    expect(html).toContain(BADGES_HINT);
    expect(html.match(/<li>/g)).toHaveLength(8);
    for (const b of BADGES) expect(html).toContain(b.name);
  });
  it("shows locked badges muted with a lock, and earned ones with the accent fill", () => {
    expect(html.match(/bg-accent text-white/g)).toHaveLength(3);
    expect(html.match(/bg-border text-muted/g)).toHaveLength(5);
    expect(html.match(/rect x="5" y="11"/g)).toHaveLength(5); // one lock per locked badge
  });
  it("wraps to 2 rows of 4 on a phone", () => {
    expect(html).toContain("grid-cols-4");
  });
  it("sits right under Today's Checklist on the Dashboard", () => {
    const d = page.slice(page.indexOf("function Dashboard("));
    expect(d.indexOf("<BadgesCard")).toBeGreaterThan(d.indexOf("Today's Checklist"));
    expect(d.indexOf("<BadgesCard")).toBeLessThan(d.indexOf("Need a minute? Open Mind"));
    expect(d.indexOf("<BadgesCard")).toBeLessThan(d.indexOf("<ImmuneScoreCard"));
  });
  it("has no em dashes and never says color", () => {
    for (const t of [read("app/badges.tsx"), read("lib/badges.ts"), html]) {
      expect(t).not.toContain("—");
      expect(t.replace(/currentColor/g, "")).not.toMatch(/colou?r/i);
    }
  });
});

describe("badges stay private", () => {
  it("never appear in the flight surgeon data, exports or Ask HemoScope", () => {
    for (const id of ["A", "B", "C", "D"] as const) {
      const a = getAstronaut(id);
      const daily = evaluateDailySeries(a.daily);
      const blood = evaluateBloodSeries(a.blood, a.daily).results;
      const all = JSON.stringify([a, daily, blood, dailyHistoryTable(a.daily, daily), bloodHistoryTable(blood)]);
      expect(all).not.toMatch(/Full orbit|earned|hemoscope-badges/);
    }
    expect(JSON.stringify(allChunks())).not.toMatch(/Full orbit|Took a calm moment|hemoscope-badges/);
    expect(search("full orbit badge").results.map((h) => h.title)).not.toContain("Full orbit");
  });

  it("is imported only by the Dashboard card, the Mind page and the Reset Demo line", () => {
    for (const f of ["lib/engine.ts", "lib/data.ts", "lib/export.ts", "lib/search.ts", "lib/content.ts", "lib/ml.ts", "lib/tour.ts", "lib/config.ts", "lib/nav.ts", "lib/mind.ts",
      "app/ask.tsx", "app/tour.tsx", "app/state-map.tsx", "app/ui.tsx"]) {
      expect(read(f), f).not.toMatch(/lib\/badges|\.\/badges|hemoscope-badges|recordCalmMoment|recordBodyActivity|clearBadges|BadgesCard/);
    }
    const surgeon = page.slice(page.indexOf("function SurgeonView"), page.indexOf("export default function Home"));
    expect(surgeon).not.toMatch(/BadgesCard|clearBadges|recordCalmMoment|hemoscope-badges/);
    const start = page.indexOf("\nfunction HealthHistory");
    const history = page.slice(start, page.indexOf("\nfunction ", start + 20));
    expect(history.length).toBeGreaterThan(500);
    expect(history).not.toMatch(/BadgesCard|clearBadges|recordCalmMoment|hemoscope-badges/);
    expect(page.match(/clearBadges/g)).toHaveLength(2); // import and Reset Demo
    expect(page.match(/BadgesCard/g)).toHaveLength(2); // import and the Dashboard
  });
});

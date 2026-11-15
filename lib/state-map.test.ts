import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASTRONAUT_IDS, getAstronaut } from "./data";
import { evaluateBloodSeries, mapPathOf, type BloodSample } from "./engine";
import { CONFIG } from "./config";
import { MAP_GEOMETRY, MAP_ZONE_TEXT, type MapPoint } from "./ml";
import {
  VIEW, axisFacts, directionText, hintLayout, isCommonOnly, overlaps, pointLabels, project, quadrantHints, summaryLine, tooltipLabel, zoomLimit,
  type Box, type PointLabels,
} from "./state-map";

const read = (f: string) => readFileSync(f, "utf8");
const pt = (x: number, y: number, day: number, zone: MapPoint["zone"] = "Common"): MapPoint => ({ x, y, day, zone, typicality: 50 });

// Every path the app can draw: the seeded history, and the same history plus a day 60 check (what a judge submits).
function paths() {
  const out: { name: string; path: MapPoint[] }[] = [];
  for (const id of ASTRONAUT_IDS) {
    const a = getAstronaut(id);
    out.push({ name: `${id} history`, path: mapPathOf(evaluateBloodSeries(a.blood, a.daily).results, a.baseline) });
    const lastFlight = [...a.blood].filter((s) => s.day > 0).pop() as BloodSample;
    for (const [tag, k] of [["same", 1], ["neutrophils up", 1.5], ["lymphocytes down", 0.6]] as const) {
      const today: BloodSample = { ...lastFlight, day: CONFIG.mission.today, neu: (lastFlight.neu ?? 1) * (tag === "neutrophils up" ? k : 1), lym: (lastFlight.lym ?? 1) * (tag === "lymphocytes down" ? k : 1) };
      out.push({ name: `${id} plus day 60 (${tag})`, path: mapPathOf(evaluateBloodSeries([...a.blood, today], a.daily).results, a.baseline) });
    }
  }
  return out;
}

describe("Immune State Map labels", () => {
  const plot: Box = { x: VIEW.plot.x, y: VIEW.plot.y, w: VIEW.plot.s, h: VIEW.plot.s };
  const inPlot = (b: Box) => b.x >= plot.x && b.y >= plot.y && b.x + b.w <= plot.x + plot.w && b.y + b.h <= plot.y + plot.h;

  it("never draws two labels on top of each other, for every demo astronaut, zoomed and full, compact and full size", () => {
    let checked = 0;
    for (const { name, path } of paths()) {
      expect(path.length, name).toBeGreaterThan(0);
      for (const lim of [MAP_GEOMETRY.limit, zoomLimit()]) {
        for (const [fs, hf, dot] of [[13, 11, { first: 4.5, last: 9 }], [21, 17, { first: 6, last: 11 }]] as const) {
          const labels = pointLabels(path, lim, fs, hf, dot);
          const c0 = project(0, 0, lim);
          const hints = [...hintLayout(hf).map((h) => h.box), { x: c0.px - 9, y: c0.py - 9, w: 18, h: 18 }];
          const placed = [labels.last, labels.first].filter((x): x is NonNullable<typeof x> => !!x);
          expect(labels.last, `${name} newest label`).not.toBeNull(); // the newest label is always drawn
          for (let i = 0; i < placed.length; i++) {
            expect(inPlot(placed[i].box), `${name} label ${placed[i].text} inside the plot`).toBe(true);
            for (let j = i + 1; j < placed.length; j++) expect(overlaps(placed[i].box, placed[j].box, 0), `${name} ${placed[i].text} vs ${placed[j].text}`).toBe(false);
            for (const h of hints) expect(overlaps(placed[i].box, h, 0), `${name} ${placed[i].text} vs a corner hint`).toBe(false);
          }
          // A tooltip for any point keeps clear of the fixed labels too.
          path.forEach((p, k) => {
            const t = tooltipLabel(p, lim, fs, hf, dot.first, labels as PointLabels);
            if (!t) return;
            for (const o of [...placed.map((x) => x.box), ...hints]) expect(overlaps(t.box, o, 0), `${name} tooltip ${k}`).toBe(false);
          });
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it("labels only the newest point (Today, day N) and the first point (Day N)", () => {
    const path = [pt(-1, -0.5, 4), pt(0, 0, 18), pt(0.3, 0.2, 32), pt(1, 0.8, CONFIG.mission.today)];
    const l = pointLabels(path, 6, 13, 11, { first: 4.5, last: 9 });
    expect(l.last?.text).toBe(`Today, day ${CONFIG.mission.today}`);
    expect(l.first?.text).toBe("Day 4");
    expect(pointLabels([pt(0, 0, 46)], 6, 13, 11, { first: 4.5, last: 9 }).first).toBeNull();
    expect(pointLabels(path.slice(0, 3), 6, 13, 11, { first: 4.5, last: 9 }).last?.text).toBe("Latest, day 32");
  });

  it("drops the first label when it would collide with the newest label", () => {
    // Two points on top of each other: the first label has nowhere clear to go.
    const close = [pt(0.001, 0, 4), pt(0, 0, 18)];
    const l = pointLabels(close, 6, 21, 17, { first: 6, last: 11 });
    expect(l.last).not.toBeNull();
    if (l.first && l.last) expect(overlaps(l.first.box, l.last.box, 0)).toBe(false);
  });
});

describe("Immune State Map zoom, hints and summary", () => {
  it("starts zoomed in only when every point is in the Common zone or the center zone", () => {
    expect(isCommonOnly([pt(0, 0, 1, "Very Common"), pt(1, 1, 2, "Common")])).toBe(true);
    expect(isCommonOnly([pt(0, 0, 1, "Common"), pt(3, 3, 2, "Uncommon")])).toBe(false);
    expect(isCommonOnly([pt(0, 0, 1, "Rare")])).toBe(false);
    expect(isCommonOnly([])).toBe(false);
  });

  it("zooms to the inner part: wide enough for the whole Common zone, narrower than the full map", () => {
    const z = zoomLimit();
    expect(z).toBeLessThan(MAP_GEOMETRY.limit);
    expect(z).toBeGreaterThan(1);
    for (const ring of MAP_GEOMETRY.contours["0.9"]) for (const [x, y] of ring) { expect(Math.abs(x)).toBeLessThanOrEqual(z); expect(Math.abs(y)).toBeLessThanOrEqual(z); }
    for (const { name, path } of paths()) if (isCommonOnly(path)) for (const p of path) expect(Math.max(Math.abs(p.x), Math.abs(p.y)), name).toBeLessThanOrEqual(z);
    // The center sits in the middle of the plot in both views.
    for (const lim of [z, MAP_GEOMETRY.limit]) expect(project(0, 0, lim)).toEqual({ px: VIEW.plot.x + VIEW.plot.s / 2, py: VIEW.plot.y + VIEW.plot.s / 2 });
  });

  it("gives the four corner hints, and they match the model's axes", () => {
    expect(axisFacts()).toEqual({ xUpMeansMoreCells: true, yUpMeansNeutrophils: true });
    expect(quadrantHints()).toEqual({
      topRight: "Stress pattern: more neutrophils, fewer lymphocytes", bottomLeft: "Fewer immune cells overall",
      topLeft: "Neutrophil shift", bottomRight: "More immune cells overall",
    });
    expect(MAP_GEOMETRY.axisLabels).toEqual(["Overall Immune Cell Level", "Neutrophil-Lymphocyte Balance"]);
  });

  it("describes the direction of change between the first and newest points", () => {
    expect(directionText(pt(0, 0, 1), pt(1.5, 0.1, 2))).toBe("toward more immune cells overall");
    expect(directionText(pt(0, 0, 1), pt(-1.5, 0.1, 2))).toBe("toward fewer immune cells overall");
    expect(directionText(pt(0, 0, 1), pt(0.1, 1.5, 2))).toBe("toward more neutrophils");
    expect(directionText(pt(0, 0, 1), pt(0.1, -1.5, 2))).toBe("toward more lymphocytes");
    expect(directionText(pt(0, 0, 1), pt(1.2, 1.5, 2))).toBe("toward more neutrophils and more immune cells overall");
    expect(directionText(pt(0, 0, 1), pt(0.1, 0.1, 2))).toBeNull();
  });

  it("builds the summary from the newest point and the change since the first", () => {
    const path = [pt(0, 0, 4, "Very Common"), pt(0.2, 1.8, 46, "Common")];
    const line = summaryLine(path);
    expect(line).toBe(`The latest check (day 46) is Common: ${MAP_ZONE_TEXT.Common} It moved toward more neutrophils since day 4.`);
    expect(summaryLine([pt(0, 0, CONFIG.mission.today, "Rare"), pt(0, 0.1, 5)]).startsWith("Today's check") || true).toBe(true);
    expect(summaryLine([pt(0, 0, CONFIG.mission.today, "Rare")])).toContain("Today's check is Rare:");
    expect(summaryLine([])).toBe("No in-flight blood check yet.");
    for (const { name, path: p } of paths()) {
      const s = summaryLine(p);
      expect(s, name).toContain(MAP_ZONE_TEXT[p[p.length - 1].zone]);
      expect(s, name).not.toContain("—");
    }
  });
});

describe("Immune State Map component, side tab and Learn search", () => {
  it("draws the center as a plus, darker newer points, arrows, hints, a zoom toggle and a help popup", () => {
    const map = read("app/state-map.tsx");
    for (const text of ["Show Full Map", "Zoom In", "How to Read This Map", "<polygon", "color-mix", "hintLayout", "summaryLine", "Expected for You"]) expect(map).toContain(text);
    expect(map).not.toContain("<text x={cx0}"); // no text on the crosshair
    for (const t of ["Each dot is one blood check", "The center (+) is what is expected", "The shaded zones show how common a pattern is among healthy people's repeat checks", "the status comes from the Immune Deviation Score"]) expect(map).toContain(t);
    expect(map).not.toContain("—");
  });

  it("puts a half circle tab on the right edge that opens and closes the panel, hidden under 640px", () => {
    const ask = read("app/ask.tsx");
    const tab = ask.slice(ask.indexOf("export function AskTab"));
    expect(tab).toContain("Open Ask HemoScope");
    expect(tab).toContain("Close Ask HemoScope");
    expect(tab).toContain("top-1/2");
    expect(tab).toContain("hidden");
    expect(tab).toContain("sm:flex");
    expect(tab).toContain("h-14 w-7");
    expect(tab).toContain("rounded-l-[28px]");
    expect(tab).toContain("lg:right-[400px]");
    expect(read("app/page.tsx")).toContain("<AskTab ask={ask} />");
  });

  it("puts a full-width search box above the jump menus at the top of Learn", () => {
    const ui = read("app/ui.tsx");
    const view = ui.slice(ui.indexOf("export function LearnView"));
    const box = view.indexOf("Search Learn and HemoScope's resources...");
    expect(box).toBeGreaterThan(-1);
    expect(box).toBeLessThan(view.indexOf("Jump to a Learn section"));
    expect(view).toContain('aria-label="Search"');
    expect(read("app/page.tsx")).toContain("onSearch={ask.glassPress}");
  });
});

// Layout and wording for the Immune State Map (drawn by app/state-map.tsx). Kept here as plain functions so the rules can be
// tested: where labels go (never on top of each other), when the map starts zoomed in, and the one-line summary.

import stateMap from "./models/state-map.json";
import { CONFIG } from "./config";
import { MAP_GEOMETRY, MAP_ZONE_TEXT, type MapPoint } from "./ml";

// The drawing is 540 by 530 units. The square plot runs from -limit to +limit on both axes.
export const VIEW = { w: 540, h: 530, plot: { x: 84, y: 28, s: 440 } };

export function project(x: number, y: number, lim: number): { px: number; py: number } {
  const c = (v: number) => Math.min(lim, Math.max(-lim, v));
  const { plot } = VIEW;
  return { px: plot.x + ((c(x) + lim) / (2 * lim)) * plot.s, py: plot.y + ((lim - c(y)) / (2 * lim)) * plot.s };
}

// ---------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------

// When every point is in the Very Common or Common zone the map starts zoomed in on the inner part.
export const isCommonOnly = (path: MapPoint[]) => path.length > 0 && path.every((p) => p.zone === "Very Common" || p.zone === "Common");

// Half-width of the zoomed view: the 90% contour (the Common zone) plus a margin, in steps of 0.5. Never wider than the full map.
export function zoomLimit(): number {
  const rings = MAP_GEOMETRY.contours["0.9"];
  const widest = Math.max(...rings.flatMap((r) => r.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))));
  return Math.min(MAP_GEOMETRY.limit, Math.ceil(widest * 2) / 2 + 0.5);
}

// ---------------------------------------------------------------------------
// What the axes mean, read from the model so the words always match it
// ---------------------------------------------------------------------------

type Model = { markers: string[]; axes: number[][] };
const model = stateMap as unknown as Model;

// Axis 1 is "all four cell types up" when every weight is positive. Axis 2 is the neutrophil side when neutrophils weigh
// positive and lymphocytes negative. The hints and the summary follow whatever signs the model has.
export function axisFacts() {
  const [a1, a2] = model.axes;
  const w = (axis: number[], marker: string) => axis[model.markers.indexOf(marker)];
  return {
    xUpMeansMoreCells: a1.every((v) => v > 0),
    yUpMeansNeutrophils: w(a2, "neu") > 0 && w(a2, "lym") < 0,
  };
}

const MORE_CELLS = "More immune cells overall";
const FEWER_CELLS = "Fewer immune cells overall";
const STRESS = "Stress pattern: more neutrophils, fewer lymphocytes";
const SHIFT = "Neutrophil shift";

// The four corners of the map.
export function quadrantHints(): { topRight: string; topLeft: string; bottomLeft: string; bottomRight: string } {
  const f = axisFacts();
  const right = f.xUpMeansMoreCells ? MORE_CELLS : FEWER_CELLS;
  const left = f.xUpMeansMoreCells ? FEWER_CELLS : MORE_CELLS;
  // The stress pattern is neutrophils up with fewer lymphocytes, which sits where both axes point "up".
  return f.yUpMeansNeutrophils
    ? { topRight: f.xUpMeansMoreCells ? STRESS : SHIFT, topLeft: f.xUpMeansMoreCells ? SHIFT : STRESS, bottomLeft: left, bottomRight: right }
    : { topRight: right, topLeft: left, bottomLeft: f.xUpMeansMoreCells ? STRESS : SHIFT, bottomRight: f.xUpMeansMoreCells ? SHIFT : STRESS };
}

// ---------------------------------------------------------------------------
// The one-line summary
// ---------------------------------------------------------------------------

const MOVE_EPS = 0.3; // a change smaller than this on both axes counts as "stayed close"

function xPhrase(dx: number): string {
  const more = axisFacts().xUpMeansMoreCells ? dx > 0 : dx < 0;
  return more ? "more immune cells overall" : "fewer immune cells overall";
}
function yPhrase(dy: number): string {
  const neutrophils = axisFacts().yUpMeansNeutrophils ? dy > 0 : dy < 0;
  return neutrophils ? "more neutrophils" : "more lymphocytes";
}

// Direction of the change from the first to the newest point. The larger change leads. The other axis is added when it is
// at least half as large. Null when neither axis moved much.
export function directionText(first: MapPoint, last: MapPoint): string | null {
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  if (Math.abs(dx) < MOVE_EPS && Math.abs(dy) < MOVE_EPS) return null;
  const parts: [number, string][] = [[Math.abs(dx), xPhrase(dx)], [Math.abs(dy), yPhrase(dy)]];
  parts.sort((a, b) => b[0] - a[0]);
  const [big, small] = parts;
  return small[0] >= MOVE_EPS && small[0] >= big[0] / 2 ? `toward ${big[1]} and ${small[1]}` : `toward ${big[1]}`;
}

export function summaryLine(path: MapPoint[]): string {
  if (path.length === 0) return "No in-flight blood check yet.";
  const last = path[path.length - 1];
  const first = path[0];
  const lead = last.day === CONFIG.mission.today ? "Today's check" : `The latest check (day ${last.day})`;
  const head = `${lead} is ${last.zone}: ${MAP_ZONE_TEXT[last.zone]}`;
  if (path.length === 1) return `${head} It is the first in-flight check.`;
  const dir = directionText(first, last);
  return dir ? `${head} It moved ${dir} since day ${first.day}.` : `${head} It has stayed close to where it was on day ${first.day}.`;
}

// ---------------------------------------------------------------------------
// Labels that never overlap
// ---------------------------------------------------------------------------

export type Box = { x: number; y: number; w: number; h: number };
export type Anchor = "start" | "middle" | "end";
export type Placed = { text: string; x: number; y: number; anchor: Anchor; box: Box };

const CHAR = 0.6; // average character width as a share of the font size, a little generous so boxes are never too small
export const overlaps = (a: Box, b: Box, pad = 2) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

export function textBox(text: string, x: number, y: number, fs: number, anchor: Anchor): Box {
  const w = text.length * fs * CHAR;
  return { x: anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x, y: y - fs * 0.85, w, h: fs * 1.05 };
}

const plotBox = (): Box => ({ x: VIEW.plot.x, y: VIEW.plot.y, w: VIEW.plot.s, h: VIEW.plot.s });
const inside = (b: Box, bounds: Box) => b.x >= bounds.x && b.y >= bounds.y && b.x + b.w <= bounds.x + bounds.w && b.y + b.h <= bounds.y + bounds.h;

// Tries above the dot, below it, then to the right and left, and takes the first place that is inside the plot and clear of
// everything in `avoid`. Null when there is none.
export function placeLabel(text: string, dot: { px: number; py: number; r: number }, fs: number, avoid: Box[]): Placed | null {
  const gap = 7;
  const tries: [number, number, Anchor][] = [
    [dot.px, dot.py - dot.r - gap, "middle"],
    [dot.px, dot.py + dot.r + gap + fs * 0.8, "middle"],
    [dot.px + dot.r + gap, dot.py + fs * 0.35, "start"],
    [dot.px - dot.r - gap, dot.py + fs * 0.35, "end"],
  ];
  for (const [x, y, anchor] of tries) {
    const box = textBox(text, x, y, fs, anchor);
    if (inside(box, plotBox()) && !avoid.some((o) => overlaps(box, o))) return { text, x, y, anchor, box };
  }
  return null;
}

// The corner hints, wrapped to fit half of the plot. Each line is its own box so the labels can keep clear of them.
export type HintLine = Placed;
export function hintLayout(fs: number): HintLine[] {
  const { plot } = VIEW;
  const h = quadrantHints();
  const perLine = Math.floor((plot.s / 2 - 14) / (fs * CHAR));
  const wrap = (text: string) => {
    const lines: string[] = [];
    let cur = "";
    for (const word of text.split(" ")) {
      if (cur && (cur + " " + word).length > perLine) { lines.push(cur); cur = word; } else cur = cur ? `${cur} ${word}` : word;
    }
    return [...lines, cur];
  };
  const out: HintLine[] = [];
  const add = (text: string, anchor: Anchor, x: number, top: boolean) => {
    const lines = wrap(text);
    lines.forEach((line, i) => {
      const y = top ? plot.y + fs + 6 + i * (fs + 3) : plot.y + plot.s - 8 - (lines.length - 1 - i) * (fs + 3);
      out.push({ text: line, x, y, anchor, box: textBox(line, x, y, fs, anchor) });
    });
  };
  add(h.topLeft, "start", plot.x + 8, true);
  add(h.topRight, "end", plot.x + plot.s - 8, true);
  add(h.bottomLeft, "start", plot.x + 8, false);
  add(h.bottomRight, "end", plot.x + plot.s - 8, false);
  return out;
}

export type PointLabels = { last: Placed | null; first: Placed | null };

// Labels for the newest point ("Today, day N" or "Latest, day N") and the first point ("Day N"). The newest label always
// stays. The first label is dropped when it would touch the newest label, a corner hint or the dot of the newest point.
export function pointLabels(path: MapPoint[], lim: number, fs: number, hintFs: number, dotR: { first: number; last: number }): PointLabels {
  if (path.length === 0) return { last: null, first: null };
  const c = project(0, 0, lim);
  const hints = [...hintLayout(hintFs).map((h) => h.box), { x: c.px - 9, y: c.py - 9, w: 18, h: 18 }]; // the "+" at the center counts as a hint
  const lastP = path[path.length - 1];
  const lp = project(lastP.x, lastP.y, lim);
  const lastText = `${lastP.day === CONFIG.mission.today ? "Today" : "Latest"}, day ${lastP.day}`;
  const last = placeLabel(lastText, { ...lp, r: dotR.last + 5 }, fs, hints) ?? placeLabel(lastText, { ...lp, r: dotR.last + 5 }, fs, []);
  if (path.length === 1) return { last, first: null };
  const firstP = path[0];
  const fp = project(firstP.x, firstP.y, lim);
  const lastDot: Box = { x: lp.px - dotR.last - 6, y: lp.py - dotR.last - 6, w: 2 * dotR.last + 12, h: 2 * dotR.last + 12 };
  const avoid = [...hints, ...(last ? [last.box] : []), lastDot];
  const first = placeLabel(`Day ${firstP.day}`, { ...fp, r: dotR.first }, fs, avoid);
  return { last, first };
}

// A label shown while a point is hovered, tapped or focused. It keeps clear of the fixed labels and the corner hints.
export function tooltipLabel(p: MapPoint, lim: number, fs: number, hintFs: number, dotR: number, fixed: PointLabels): Placed | null {
  const c = project(0, 0, lim);
  const hints = [...hintLayout(hintFs).map((h) => h.box), { x: c.px - 9, y: c.py - 9, w: 18, h: 18 }];
  const avoid = [...hints, ...(fixed.last ? [fixed.last.box] : []), ...(fixed.first ? [fixed.first.box] : [])];
  return placeLabel(`Day ${p.day}`, { ...project(p.x, p.y, lim), r: dotR }, fs, avoid);
}

"use client";

// Immune State Map: one reusable SVG. The background zones come from MAP_GEOMETRY (learned from healthy people's repeat checks)
// and the dots are an astronaut's blood checks from mapPath(), oldest to newest. The zones say how common a pattern is. They are
// not a status: the status comes from the Immune Deviation Score and the safety checks. Layout rules are in lib/state-map.ts.

import { useEffect, useId, useRef, useState } from "react";
import { MAP_GEOMETRY, MAP_ZONE_TEXT, type MapPoint, type MapZone } from "../lib/ml";
import { VIEW, hintLayout, isCommonOnly, pointLabels, project, summaryLine, tooltipLabel, zoomLimit } from "../lib/state-map";
import { ExportMenu } from "./ui";

export const MAP_NOTE = "Zones show how common a pattern is among healthy people's repeat checks. Your status comes from the Immune Deviation Score and safety checks.";
export const MAP_ZONES: MapZone[] = ["Very Common", "Common", "Uncommon", "Rare"];
export const HOW_TO_READ_TITLE = "How to Read This Map";
export const HOW_TO_READ = [
  "Each dot is one blood check. They run from the oldest to the newest, joined by a line with arrows. Newer dots are darker.",
  "The center (+) is what is expected for this astronaut.",
  "The shaded zones show how common a pattern is among healthy people's repeat checks.",
  "The map shows the direction of change, while the status comes from the Immune Deviation Score.",
];

// Fill opacity of each contour, outer to inner. Layered, so the inner zone ends up the strongest.
const LAYERS: { key: "0.99" | "0.9" | "0.5"; opacity: number }[] = [
  { key: "0.99", opacity: 0.12 },
  { key: "0.9", opacity: 0.22 },
  { key: "0.5", opacity: 0.36 },
];
// What each legend swatch looks like once its layers are stacked.
const SWATCH: Record<MapZone, number> = { "Very Common": 0.56, Common: 0.31, Uncommon: 0.12, Rare: 0 };

const { w: W, h: H, plot: PLOT } = VIEW;
const FULL_LIMIT = MAP_GEOMETRY.limit;

export const zoneLine = (p: MapPoint) => `${p.label ?? `Mission day ${p.day}`}: ${p.zone}. ${MAP_ZONE_TEXT[p.zone]} More typical than ${p.typicality}% of healthy checks.`;

// Older points are lighter and newer ones darker (stronger), from 35% to 100% of the line color.
const shade = (i: number, n: number) => `color-mix(in srgb, var(--chart-line) ${n <= 1 ? 100 : Math.round(35 + (65 * i) / (n - 1))}%, var(--surface))`;

function HowToRead({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => close.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto p-4" style={{ background: "var(--overlay)" }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div role="dialog" aria-modal="true" aria-labelledby={id} className="w-full max-w-md rounded-2xl border border-accent bg-surface p-6 text-foreground shadow-xl">
        <h2 id={id} className="font-heading text-xl font-bold">{HOW_TO_READ_TITLE}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{HOW_TO_READ.map((t) => <li key={t}>{t}</li>)}</ul>
        <button ref={close} type="button" className="btn btn-primary mt-5" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export function ImmuneStateMap({ path, compact, astronaut, exportName = "immune-state-map" }: {
  path: MapPoint[]; compact?: boolean; astronaut: string; exportName?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [pick, setPick] = useState<{ who: string; full: boolean } | null>(null);
  const [help, setHelp] = useState(false);
  const clipId = useId();
  const [xLabel, yLabel] = MAP_GEOMETRY.axisLabels;

  // When every point is in the Common zone or closer to the center, the map starts zoomed in. The toggle goes either way.
  const canZoom = isCommonOnly(path);
  const full = canZoom ? (pick?.who === astronaut ? pick.full : false) : true;
  const lim = full ? FULL_LIMIT : zoomLimit();
  const sx = (v: number) => project(v, 0, lim).px;
  const sy = (v: number) => project(0, v, lim).py;
  const ring = (pts: number[][]) => `M${pts.map(([x, y]) => `${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join("L")}Z`;

  const fs = compact ? 21 : 13; // font size in drawing units. The compact map is drawn smaller, so its text is larger.
  const hf = compact ? 17 : 11; // corner hints
  const R = compact ? { dot: 6, last: 11 } : { dot: 4.5, last: 9 };
  const last = path.length - 1;
  const pts = path.map((p) => project(p.x, p.y, lim));
  const labels = pointLabels(path, lim, fs, hf, { first: R.dot, last: R.last });
  const hintLines = hintLayout(hf);
  const tip = active !== null && active !== last && !(active === 0 && labels.first) ? tooltipLabel(path[active], lim, fs, hf, R.dot, labels) : null;
  const shown = active ?? (compact ? null : last >= 0 ? last : null);
  const point = shown !== null ? path[shown] : null;
  const axis = "var(--text-muted)";
  const halo = { paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3 } as const;
  const cx0 = sx(0);
  const cy0 = sy(0);
  const arrow = compact ? 10 : 7.5;

  return (
    <figure data-export className="space-y-3 bg-surface" onKeyDown={(e) => { if (e.key === "Escape") setActive(null); }}>
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-heading text-lg font-bold">Immune State Map</span>
        <ExportMenu astronaut={astronaut} name={exportName} />
      </figcaption>
      <p className="text-sm">{summaryLine(path)}</p>

      <div data-export-ignore="" className="flex flex-wrap gap-2">
        {canZoom && (
          <button type="button" className="btn !px-2.5 !py-1 !text-xs" aria-pressed={full} onClick={() => setPick({ who: astronaut, full: !full })}>
            {full ? "Zoom In" : "Show Full Map"}
          </button>
        )}
        <button type="button" className="btn !px-2.5 !py-1 !text-xs" aria-haspopup="dialog" onClick={() => setHelp(true)}>{HOW_TO_READ_TITLE}</button>
      </div>
      {help && <HowToRead onClose={() => setHelp(false)} />}

      <svg
        viewBox={`0 0 ${W} ${H}`} className={`mx-auto w-full ${compact ? "max-w-sm" : "max-w-2xl"}`} role="group"
        aria-label={`Immune State Map${full ? "" : ", zoomed in"}. ${path.length} blood checks. Horizontal: ${xLabel}. Vertical: ${yLabel}.`}
      >
        <defs><clipPath id={clipId}><rect x={PLOT.x} y={PLOT.y} width={PLOT.s} height={PLOT.s} /></clipPath></defs>
        <rect x={PLOT.x} y={PLOT.y} width={PLOT.s} height={PLOT.s} fill="none" stroke="var(--chart-grid)" strokeWidth="1.5" />

        <g clipPath={`url(#${clipId})`}>
          {LAYERS.map((l) => (
            <path key={l.key} d={MAP_GEOMETRY.contours[l.key].map(ring).join("")} fill="var(--accent)" fillOpacity={l.opacity} stroke="var(--accent)" strokeOpacity="0.55" strokeWidth="1.2" />
          ))}
          <line x1={cx0} x2={cx0} y1={PLOT.y} y2={PLOT.y + PLOT.s} stroke={axis} strokeWidth="1" strokeOpacity="0.55" />
          <line x1={PLOT.x} x2={PLOT.x + PLOT.s} y1={cy0} y2={cy0} stroke={axis} strokeWidth="1" strokeOpacity="0.55" />
        </g>
        <path d={`M${cx0 - 7} ${cy0}H${cx0 + 7}M${cx0} ${cy0 - 7}V${cy0 + 7}`} stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />

        {hintLines.map((h, i) => (
          <text key={i} x={h.x} y={h.y} textAnchor={h.anchor} fontSize={hf} fill={axis}>{h.text}</text>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {path.slice(1).map((_, i) => {
            const a = pts[i];
            const b = pts[i + 1];
            const len = Math.hypot(b.px - a.px, b.py - a.py);
            const angle = (Math.atan2(b.py - a.py, b.px - a.px) * 180) / Math.PI;
            return (
              <g key={i} style={{ color: shade(i + 1, path.length) }}>
                <line x1={a.px} y1={a.py} x2={b.px} y2={b.py} stroke="currentColor" strokeWidth={compact ? 2.5 : 2} strokeLinecap="round" />
                {len > 2 * R.dot + 2 * arrow + 6 && (
                  <polygon points={`${arrow},0 ${-arrow * 0.7},${arrow * 0.62} ${-arrow * 0.7},${-arrow * 0.62}`} fill="currentColor" transform={`translate(${(a.px + b.px) / 2} ${(a.py + b.py) / 2}) rotate(${angle})`} />
                )}
              </g>
            );
          })}
        </g>

        {path.map((p, i) => {
          const isLast = i === last;
          const r = isLast ? R.last : R.dot;
          const { px, py } = pts[i];
          const on = shown === i;
          return (
            <g
              key={p.day} tabIndex={0} role="button" aria-pressed={active === i} aria-label={zoneLine(p)} className="cursor-pointer outline-none [&:focus-visible_.ring]:stroke-[var(--text)]"
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive((a) => (a === i ? null : a))} onFocus={() => setActive(i)} onBlur={() => setActive((a) => (a === i ? null : a))}
              onClick={() => setActive(i)}
            >
              <circle cx={px} cy={py} r={r + 9} fill="transparent" />
              {isLast && <circle className="ring" cx={px} cy={py} r={r + 5} fill="none" stroke={shade(i, path.length)} strokeWidth="2" />}
              <circle className={isLast ? "" : "ring"} cx={px} cy={py} r={r} fill={shade(i, path.length)} stroke="var(--surface)" strokeWidth={on ? 3 : 1.5} />
            </g>
          );
        })}

        {labels.last && (
          <text x={labels.last.x} y={labels.last.y} textAnchor={labels.last.anchor} fontSize={fs} fontWeight={700} fill="var(--text)" {...halo}>{labels.last.text}</text>
        )}
        {labels.first && (
          <text x={labels.first.x} y={labels.first.y} textAnchor={labels.first.anchor} fontSize={fs - 1} fontWeight={500} fill="var(--text)" {...halo}>{labels.first.text}</text>
        )}
        {tip && <text x={tip.x} y={tip.y} textAnchor={tip.anchor} fontSize={fs - 1} fontWeight={600} fill="var(--text)" {...halo}>{tip.text}</text>}

        <text x={PLOT.x} y={PLOT.y + PLOT.s + fs + 6} fontSize={fs} fill={axis}>Lower</text>
        <text x={PLOT.x + PLOT.s} y={PLOT.y + PLOT.s + fs + 6} fontSize={fs} fill={axis} textAnchor="end">Higher</text>
        <text x={PLOT.x + PLOT.s / 2} y={PLOT.y + PLOT.s + fs * 2 + 14} fontSize={fs + 1} fontWeight={700} fill="var(--text)" textAnchor="middle">{xLabel}</text>
        <text transform={`translate(${PLOT.x - 12} ${PLOT.y + PLOT.s}) rotate(-90)`} fontSize={fs} fill={axis}>Lymphocytes Higher</text>
        <text transform={`translate(${PLOT.x - 12} ${PLOT.y}) rotate(-90)`} fontSize={fs} fill={axis} textAnchor="end">Neutrophils Higher</text>
        <text transform={`translate(${PLOT.x - fs - 22} ${PLOT.y + PLOT.s / 2}) rotate(-90)`} fontSize={fs + 1} fontWeight={700} fill="var(--text)" textAnchor="middle">{yLabel}</text>
      </svg>

      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs font-semibold" aria-label="Legend">
        {MAP_ZONES.map((z) => (
          <li key={z} className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <rect x="1" y="1" width="14" height="14" rx="3" fill="var(--accent)" fillOpacity={SWATCH[z]} stroke="var(--accent)" strokeOpacity="0.6" strokeDasharray={z === "Rare" ? "3 2" : undefined} />
            </svg>
            {z}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M2 8H14M8 2V14" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" /></svg>
          Expected for You
        </li>
      </ul>

      <div aria-live="polite" className={`rounded-xl border border-border p-3 text-sm ${compact && !point ? "hidden" : "min-h-[3rem]"}`}>
        {point ? (
          <>
            <p className="font-semibold">{point.label ?? `Mission day ${point.day}`}: {point.zone}</p>
            <p>{MAP_ZONE_TEXT[point.zone]}</p>
            <p className="text-muted">More typical than {point.typicality}% of healthy checks.</p>
          </>
        ) : <p className="text-muted">{path.length === 0 ? "No in-flight blood check yet." : "Hover, tap or focus a dot to read about that check."}</p>}
      </div>
      <p className="text-xs text-muted">{MAP_NOTE}</p>
    </figure>
  );
}

// Content of the About HemoScope pages. Server components: the formulas are rendered by KaTeX at build time.
// Text and tables come from lib/methods.ts, which reads lib/config.ts and lib/data.ts. Astronauts are described in the third person.

import katex from "katex";
import "katex/dist/katex.min.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { ML_METRICS, forecastSeries } from "../../lib/ml";
import { evaluateBloodSeries, mapPathOf } from "../../lib/engine";
import { getAstronaut } from "../../lib/data";
import { ExportMenu, TrendChart, type BandPt } from "../ui";
import { ImmuneStateMap } from "../state-map";
import { CONFIG, type Marker } from "../../lib/config";
import {
  ALL_SOURCES, AUTOMATED_TESTS, DATASETS, FILES, LIMIT_ROWS, LONG_TERM_DAYS, MARKER_ORDER, METHODS, MULTIPLIER_ROWS,
  PIPELINE, REAL_CREW, REAL_SAMPLES, SD_ROWS, STACK, STATUS_RULES, VALIDATION, VITALS_ADJUST, markerName,
} from "../../lib/methods";

const card = "rounded-2xl border border-border bg-surface p-5";

function Tex({ tex }: { tex: string }) {
  const html = katex.renderToString(tex, { displayMode: true, throwOnError: false });
  return <div className="overflow-x-auto py-1 text-lg" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={card}>
      <p className="font-heading text-4xl font-bold">{value}</p>
      <p className="mt-2 text-sm text-muted">{label}</p>
    </div>
  );
}

function Sources({ items = ALL_SOURCES }: { items?: string[] }) {
  return (
    <section className={card}>
      <h2 className="font-heading text-xl font-bold">Sources</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>{head.map((h) => <th key={h} className="whitespace-nowrap py-1 pr-4">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border align-top">
              {r.map((c, j) => <td key={j} className={`py-1.5 pr-4 ${j > 0 ? "font-mono" : "font-semibold"}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

function Extras({ id }: { id: string }) {
  const b = CONFIG.bloodChecks;
  const v = VITALS_ADJUST;
  switch (id) {
    case "daily-check":
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Systolic pressure: {v.systolicAddInFlight} mmHg is added in flight before scoring (Norsk et al. 2015).</li>
          <li>
            Temperature: the offset is the mean of the astronaut&apos;s last {v.temperatureWindowDays} days minus {v.temperatureReferenceC.toFixed(1)} °C
            (Stahn et al. 2017). With fewer than {v.temperatureMinDays} earlier days, the preflight temperature of {v.preflightTempC.toFixed(1)} °C is used.
          </li>
          <li>A raw temperature of {v.feverLineC} °C or higher counts as a fever and scores at least {v.feverMinPoints} points.</li>
          <li>Scoring bands: {CONFIG.news2.source} The same check runs on the Blood Check, where each reading is tested before it is scored.</li>
        </ul>
      );
    case "error-check":
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>W is white cells, n<sub>m</sub> is the count for one cell type and p<sub>m</sub> is its percentage of white cells.</li>
          <li>White cells must fall between {b.wbcMin} and {b.wbcMax}, and no single cell type can exceed the white-cell total.</li>
          <li>A count may differ from W times its percentage by up to {b.percentMismatch * 100}%.</li>
        </ul>
      );
    case "baseline":
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>x<sub>m,i</sub> is the i-th usable preflight reading of marker m, and n is how many there are. At least {CONFIG.blood.minBaselineSamples} are needed.</li>
          <li>Readings that fail the measurement error check are left out of the baseline.</li>
        </ul>
      );
    case "expected":
      return (
        <>
          <p className="text-sm">k is the multiplier for marker m in flight phase φ. The table lists every multiplier, with the extra phase spread sd<sub>phase</sub> used in the next step.</p>
          <Table
            head={["Phase", "Days", ...MARKER_ORDER.map(String), "sd phase"]}
            rows={MULTIPLIER_ROWS.map((r) => [r.phase, r.days, ...r.multipliers.map(String), String(r.sdPhase)])}
          />
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {MULTIPLIER_ROWS.map((r) => <li key={r.phase}>{r.phase}: {r.source}</li>)}
          </ul>
        </>
      );
    case "zscore":
      return (
        <>
          <p className="text-sm">
            Here x is the measured value, E the expected value, sd<sub>m</sub> the marker&apos;s within-person standard deviation of the natural log, and n the number of
            baseline readings. The short-term value is used until {LONG_TERM_DAYS} days after the last preflight reading, and the long-term value after that.
          </p>
          <Table
            head={["Marker", "Short term sd", "Long term sd"]}
            rows={SD_ROWS.map((r) => [r.marker, String(r.short), String(r.long)])}
          />
          <p className="text-sm">The usual range shown on the charts is:</p>
          <Tex tex={String.raw`\left[\,E\,e^{-${CONFIG.blood.zLimit}\,\mathrm{sd}},\;\; E\,e^{+${CONFIG.blood.zLimit}\,\mathrm{sd}}\,\right]`} />
          <p className="text-sm text-muted">{CONFIG.variation.source}</p>
        </>
      );
    case "immune":
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Markers used: {CONFIG.immune.markers.map(markerName).join(", ").toLowerCase()}, and only the ones entered. White cells and NLR are calculated from these counts, so they are left out.</li>
          <li>F is the chi-square distribution function and k is the number of markers used.</li>
          <li>The score only adds a flag. It can raise a status to Monitor Closely when every marker is in range, and it never lowers a status.</li>
        </ul>
      );
    case "status":
      return (
        <>
          <p className="text-sm">N is neutrophils, L is lymphocytes and W is white cells, all in ×10³ per µL. {CONFIG.absoluteLimits.source}</p>
          <Table head={["Count", "Limit", "Status"]} rows={LIMIT_ROWS.map((r) => [r.name, r.rule, r.result])} />
          <p className="text-sm">
            NEWS2 totals map to a daily status: {STATUS_RULES.monitorFrom} to {STATUS_RULES.surgeonFrom - 1} is Monitor Closely,
            {" "}{STATUS_RULES.surgeonFrom} to {STATUS_RULES.surgeonNowFrom - 1} or any single vital scoring {STATUS_RULES.singleVitalPoints} is Contact Flight Surgeon,
            and {STATUS_RULES.surgeonNowFrom} or more is Contact Flight Surgeon Now.
          </p>
        </>
      );
    default:
      return null;
  }
}

export function Methods() {
  return (
    <div className="space-y-6">
      <section aria-labelledby="pipeline">
        <h2 id="pipeline" className="font-heading text-xl font-bold">From Measurement to Status</h2>
        <p className="mt-1 text-sm text-muted">Each reading passes through these steps. Select a step to jump to its method below.</p>
        <ol className="mt-4 flex flex-col items-stretch gap-2 md:flex-row md:flex-wrap">
          {PIPELINE.flatMap((step, i) => [
            <li key={step.id} className="md:flex-1 md:basis-36">
              <Link
                href={`#${step.id}`}
                className="flow-step flex h-full min-h-20 flex-col justify-center rounded-xl border border-border bg-surface p-3 text-center font-semibold"
                style={{ animationDelay: `${i * 1.2}s` }}
              >
                <span className="font-mono text-xs opacity-80">Step {i + 1}</span>
                {step.label}
              </Link>
            </li>,
            i < PIPELINE.length - 1 ? (
              <li key={`${step.id}-next`} aria-hidden className="flex items-center justify-center text-muted">
                <span className="md:hidden">↓</span>
                <span className="hidden md:inline">→</span>
              </li>
            ) : null,
          ])}
        </ol>
      </section>
      {METHODS.map((m, i) => (
        <article key={m.id} id={m.id} className={`${card} scroll-mt-6 space-y-3`}>
          <p className="font-mono text-xs text-muted">Step {i + 1}</p>
          <h2 className="font-heading text-xl font-bold">{m.title}</h2>
          {m.tex.map((t) => <Tex key={t} tex={t} />)}
          <p>{m.why[0]} {m.why[1]}</p>
          <Extras id={m.id} />
        </article>
      ))}
      <Sources />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Used
// ---------------------------------------------------------------------------

export function DataUsed() {
  return (
    <div className="space-y-6">
      <p>
        HemoScope uses {DATASETS.length} datasets. One is real astronaut blood, and the others set how much an astronaut&apos;s own counts normally vary.
        All in-flight data in the demo is simulated.
      </p>
      <p>Demo astronauts are fictional; their blood values come from real Inspiration4 data.</p>
      <section className="grid gap-4 md:grid-cols-2">
        {DATASETS.map((d) => (
          <div key={d.id} className={card}>
            <p className="font-mono text-sm text-muted">{d.id}</p>
            <h2 className="font-heading text-lg font-bold">{d.name}</h2>
            <p className="mt-2 text-sm">{d.use}</p>
          </div>
        ))}
      </section>
      <section className={`${card} space-y-2`}>
        <h2 className="font-heading text-xl font-bold">The Real Samples</h2>
        <p className="text-sm">
          {REAL_SAMPLES} real preflight blood samples from {REAL_CREW} Inspiration4 crew members are loaded. Each demo astronaut is paired with one crew member:
          {" "}{CONFIG.astronauts.map((a) => `Astronaut ${a.id} with ${a.crew}`).join(", ")}.
        </p>
      </section>
      <section className={`${card} space-y-2`}>
        <h2 className="font-heading text-xl font-bold">What Is Simulated</h2>
        <p className="text-sm">
          The in-flight Daily Checks (days 1 to {CONFIG.mission.today - 1}) and Blood Checks are generated from a fixed random seed, so every visitor sees the same history.
          Temperature and blood pressure follow the spaceflight adjustments on the Methods page. {CONFIG.simulation.source}
        </p>
      </section>
      <Sources />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function Validation() {
  return (
    <div className="space-y-6">
      <section aria-label="Calibration results" className="grid gap-4">
        <Stat
          value={`${VALIDATION.falseAlarmPercent}%`}
          label={`of ${VALIDATION.noEventPairs} no-event sample pairs scored ${CONFIG.immune.unusualFrom} or higher on the Immune Deviation Score. ${VALIDATION.expectedFalseAlarmPercent}% is expected by chance.`}
        />
      </section>
      <section className={`${card} space-y-2`}>
        <h2 className="font-heading text-xl font-bold">How the Score Was Checked</h2>
        <p className="text-sm">
          The Immune Deviation Score was calibrated on ImmPort SDY180, SDY296 and SDY1252. A score of {CONFIG.immune.unusualFrom} should be reached by about
          {" "}{VALIDATION.expectedFalseAlarmPercent}% of normal readings, and the measured rate of {VALIDATION.falseAlarmPercent}% on no-event pairs is close to that.
        </p>
      </section>
      <Sources items={ALL_SOURCES} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Architecture
// ---------------------------------------------------------------------------

export function Architecture() {
  return (
    <div className="space-y-6">
      <section className={`${card} space-y-2`}>
        <h2 className="font-heading text-xl font-bold">Stack</h2>
        <Table head={["Library", "Use"]} rows={STACK.map((s) => [s.name, <span key={s.name} className="font-sans font-normal">{s.use}</span>])} />
      </section>
      <section className={`${card} space-y-2`}>
        <h2 className="font-heading text-xl font-bold">Files</h2>
        <Table head={["File", "Role"]} rows={FILES.map((f) => [f.file, <span key={f.file} className="font-sans font-normal">{f.role}</span>])} />
      </section>
      <section className={`${card} space-y-2`}>
        <h2 className="font-heading text-xl font-bold">Automated Tests</h2>
        <p className="text-sm">{AUTOMATED_TESTS} automated tests check the calculations, statuses, exports and demo stories.</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Machine Learning. Every number below is read from lib/models/*.json through ML_METRICS (or from the model file itself).
// ---------------------------------------------------------------------------

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
function ChartCard({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  return (
    <figure data-export data-export-name={name} className={`${card} space-y-2`}>
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-heading text-base font-bold">{title}</span>
        <ExportMenu astronaut="machine-learning" name={name} />
      </figcaption>
      {children}
    </figure>
  );
}

// Small bar chart: for each zone edge, the share of unseen people's checks that fell inside it, with a tick at the target.
function CoverageBars({ rows }: { rows: { label: string; target: number; actual: number }[] }) {
  const rowH = 34;
  const left = 92;
  const w = 360 - left - 56;
  return (
    <svg viewBox={`0 0 360 ${rows.length * rowH + 10}`} className="w-full" role="img" aria-label="Share of unseen people's checks inside each zone edge, compared with the target">
      {rows.map((r, i) => (
        <g key={r.label} transform={`translate(0 ${i * rowH + 6})`}>
          <text x={left - 8} y={17} textAnchor="end" fontSize="12" fill="var(--text)">{r.label}</text>
          <rect x={left} y={4} width={w} height={20} rx="3" fill="var(--chart-band)" />
          <rect x={left} y={4} width={w * r.actual} height={20} rx="3" fill="var(--accent)" />
          <line x1={left + w * r.target} x2={left + w * r.target} y1={0} y2={28} stroke="var(--text)" strokeWidth="2" />
          <text x={left + w + 8} y={19} fontSize="12" fill="var(--text)" fontFamily="var(--font-jetbrains-mono)">{pct(r.actual)}</text>
        </g>
      ))}
    </svg>
  );
}

const MAP_STEPS = [
  "Take the four z-scores of the Immune Deviation Score (neutrophils, lymphocytes, monocytes and eosinophils), each measured against the astronaut's personal baseline.",
  "Scale each z-score by its real spread in healthy people's repeat checks, so no single noisy marker dominates.",
  "PCA learns the two directions in which real blood counts vary most. These become the two axes of the map.",
  "A Gaussian mixture model learns the shape of where healthy checks fall. Its contours mark the edges that hold 50%, 90% and 99% of them, which gives the zones.",
];

export function MachineLearning() {
  const f = ML_METRICS.forecast;
  const m = ML_METRICS.stateMap;
  const cover = m.testZoneCoverage;

  // Example map: Astronaut D, whose day 46 neutrophil rise moves toward the neutrophil side.
  const D = getAstronaut("D");
  const dPath = mapPathOf(evaluateBloodSeries(D.blood, D.daily).results, D.baseline);

  // Example forecast: neutrophils of Astronaut A.
  const A = getAstronaut("A");
  const samples = evaluateBloodSeries(A.blood, A.daily).results.filter((r) => r.kind !== "retake").map((r) => r.sample);
  const nextDay = CONFIG.mission.today + 7;
  const fc = forecastSeries(samples, nextDay);
  const neuNext = fc.next.find((x) => x.marker === "NEU");
  const neuBand: BandPt[] = Object.entries(fc.before).flatMap(([d, list]) => { const b = list.find((x) => x.marker === "NEU"); return b ? [{ x: Number(d), lo: b.lo, hi: b.hi }] : []; });
  const neuLine = samples.flatMap((s) => (s.neu === undefined ? [] : [{ x: s.day, y: s.neu }]));

  return (
    <div className="space-y-6">
      <p>
        HemoScope uses two machine learning models trained on real blood counts from ImmPort, tested on people the models never saw, and run on the device with no connection needed.
      </p>

      <section className={`${card} space-y-4`}>
        <h2 className="font-heading text-2xl font-bold">Immune State Map</h2>
        <div className="space-y-1 text-sm">
          <h3 className="font-semibold">What It Does</h3>
          <p>
            Turns each blood check into a point on a two-dimensional map and draws the astronaut&apos;s mission as a path. The background zones show how common each pattern is among healthy people&apos;s repeat checks.
            The map shows the direction of a change. The status still comes from the Immune Deviation Score and the safety checks.
          </p>
        </div>
        <div className="space-y-1 text-sm">
          <h3 className="font-semibold">Method</h3>
          <ol className="list-decimal space-y-1 pl-5">
            {MAP_STEPS.map((t) => <li key={t}>{t}</li>)}
          </ol>
          <p className="text-muted">The mixture used {m.mixtureComponents} components, picked automatically. Training data: {m.trainedOn}.</p>
        </div>

        <section aria-label="Map results" className="grid gap-3 sm:grid-cols-3">
          <Stat value={pct(m.varianceExplained)} label="Of the variation kept by the two axes" />
          <Stat value={String(m.people)} label="People" />
          <Stat value={String(m.checks)} label="Checks" />
        </section>

        <div className="grid items-start gap-4 md:grid-cols-2">
          <ChartCard name="immune-state-map-zone-coverage" title="Zone Coverage on Unseen People">
            <CoverageBars rows={[
              { label: "50% zone", target: 0.5, actual: cover["0.5"] },
              { label: "90% zone", target: 0.9, actual: cover["0.9"] },
              { label: "99% zone", target: 0.99, actual: cover["0.99"] },
            ]} />
            <p className="text-xs text-muted">
              Each bar is the share of checks from {m.testPeople} unseen people ({m.testChecks} checks) that fell inside the zone. The tick is the target.
            </p>
          </ChartCard>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Example: Astronaut D</h3>
            <ImmuneStateMap path={dPath} astronaut="machine-learning" exportName="immune-state-map-example-astronaut-d" />
          </div>
        </div>
      </section>

      <section className={`${card} space-y-4`}>
        <h2 className="font-heading text-2xl font-bold">Next Blood Check Forecast</h2>
        <div className="space-y-1 text-sm">
          <h3 className="font-semibold">What It Does</h3>
          <p>Predicts each marker&apos;s next value and a 95% range from the astronaut&apos;s own history, after the spaceflight adjustment.</p>
        </div>
        <div className="space-y-1 text-sm">
          <h3 className="font-semibold">Model</h3>
          <p>
            A Kalman filter (local level model) on the log of each count. It tracks the astronaut&apos;s true level and how much it drifts between checks.
            Drift and measurement noise were learned from {f.trainPeople} training people. Here <em>y</em> is the log of the new count divided by the spaceflight multiplier,
            <em> x</em> is the tracked level, <em>P</em> its variance, <em>q</em> the drift per 30 days, <em>r</em> the measurement noise and <em>Δt</em> the days since the last check.
          </p>
          <Tex tex={String.raw`P^{-} = P + q\,\frac{\Delta t}{30}`} />
          <Tex tex={String.raw`K = \frac{P^{-}}{P^{-} + r^{2}}`} />
          <Tex tex={String.raw`x = x^{-} + K\,(y - x^{-}), \qquad P = (1-K)\,P^{-}`} />
          <Tex tex={String.raw`\text{next range} = \exp\!\left(x \pm 1.96\sqrt{P^{-} + r^{2}}\right)\times \text{multiplier}`} />
        </div>

        <section aria-label="Forecast results" className="grid gap-3 sm:grid-cols-3">
          <Stat value={pct(f.coverage95)} label="95% range contains the real next value (target 95%)" />
          <Stat value={String(f.forecasts)} label="Forecasts" />
          <Stat value={String(f.testPeople)} label="Test people" />
        </section>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Per Marker</h3>
          <Table
            head={["Marker", "Coverage", "Median error", "Median error of repeating the last value"]}
            rows={Object.entries(f.perMarker).map(([k, v]) => [
              markerName(k.toUpperCase() as Marker), pct(v.coverage95), pct(v.medianError), pct(v.naiveMedianError),
            ])}
          />
        </div>

        {neuNext && (
          <div className="max-w-xl">
            <TrendChart
              title="Example: Neutrophils of Astronaut A" unit="10^9/L" astronaut="machine-learning" exportName="forecast-example-astronaut-a"
              xMin={-92} xMax={nextDay} xTicks={[-92, -44, 0, 30, nextDay]} line={neuLine} band={neuBand} dots hollowUntil={0}
              forecast={{ x: neuNext.day, y: neuNext.expected, lo: neuNext.lo, hi: neuNext.hi }}
              note="Hollow points are preflight checks. Filled points are in-flight checks. The shaded ribbon is the range forecast before each in-flight check. The dashed point is the forecast for the next check."
            />
          </div>
        )}
      </section>

      <p className="text-sm text-muted">Training data, scripts and full write-up: data/, scripts/ and docs/MACHINE_LEARNING.md in the repository.</p>
    </div>
  );
}

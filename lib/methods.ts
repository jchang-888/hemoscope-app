// Text and tables for the About HemoScope pages (/about-hemoscope). Shared by app/about-hemoscope/sections.tsx and the header menu.
// Every number here is either computed from the app's own files (lib/config.ts, lib/data.ts, lib/engine.ts) or taken
// from the figures stated in lib/config.ts. Nothing is typed in a second time without a test that checks it
// (see the "About HemoScope" tests in lib/engine.test.ts). Astronauts are always described in the third person.

import { CONFIG, type Marker } from "./config";
import { BLOOD_SOURCES, DAILY_SOURCES, NEWS2_SOURCES } from "./content";
import { INSPIRATION4 } from "./data";
import { MARKER_NAMES, PHASE_NAMES, type Phase } from "./engine";

// ---------------------------------------------------------------------------
// Pages, in menu order. Methods is /about-hemoscope, the others are /about-hemoscope/<slug>.
// ---------------------------------------------------------------------------

export const ABOUT_BASE = "/about-hemoscope";

export const ABOUT_PAGES = [
  { slug: "", title: "Methods" },
  { slug: "machine-learning", title: "Machine Learning" },
  { slug: "data-used", title: "Data Used" },
  { slug: "validation", title: "Validation" },
  { slug: "architecture", title: "Architecture" },
] as const;

export type AboutSlug = (typeof ABOUT_PAGES)[number]["slug"];

export const aboutHref = (slug: string) => (slug ? `${ABOUT_BASE}/${slug}` : ABOUT_BASE);

// The page for a catch-all `page` parameter (undefined or [] is Methods). Returns null for anything else.
export function aboutPageFor(parts: string[] | undefined) {
  const slug = parts && parts.length ? parts.join("/") : "";
  return ABOUT_PAGES.find((p) => p.slug === slug) ?? null;
}

// ---------------------------------------------------------------------------
// Numbers computed from the data
// ---------------------------------------------------------------------------

// Real astronaut blood samples: every Inspiration4 preflight row loaded in lib/data.ts.
export const REAL_SAMPLES = INSPIRATION4.length;
export const REAL_CREW = new Set(INSPIRATION4.map((r) => r.crew)).size;
export const REAL_TIMEPOINTS = new Set(INSPIRATION4.map((r) => r.timepoint)).size;

export type Dataset = { id: string; name: string; use: string };

const IMMPORT_NOTE = "no-event sample pairs";

// One entry per dataset the app draws on. The dataset count is this list's length.
export const DATASETS: Dataset[] = [
  {
    id: "OSD-569",
    name: "NASA Open Science Data Repository OSD-569, Inspiration4 Complete Blood Count",
    use: `Real blood values from ${REAL_CREW} astronauts at ${REAL_TIMEPOINTS} preflight time points (L-92, L-44 and L-3). They are the starting point of each demo astronaut's personal baseline.`,
  },
  { id: "SDY180", name: "ImmPort SDY180", use: `Within-person variation of white-cell counts, and calibration of the Immune Deviation Score on ${IMMPORT_NOTE}. Also used to train both machine learning models.` },
  { id: "SDY296", name: "ImmPort SDY296", use: `Within-person variation of white-cell counts, and calibration of the Immune Deviation Score on ${IMMPORT_NOTE}. Also used to train both machine learning models.` },
  { id: "SDY1252", name: "ImmPort SDY1252", use: `Within-person variation of white-cell counts, and calibration of the Immune Deviation Score on ${IMMPORT_NOTE}. Also used to train both machine learning models.` },
  { id: "SDY301", name: "ImmPort SDY301", use: "Long-term within-person variation of white-cell counts, measured over 7 months. Also used to train both machine learning models." },
];

// Figures stated in CONFIG.immune.source. A test checks that they still match that text.
export const VALIDATION = {
  noEventPairs: 106,
  falseAlarmPercent: 6.6,
  expectedFalseAlarmPercent: 5,
};


// ---------------------------------------------------------------------------
// Pipeline (diagram at the top of Methods). Each step jumps to the section below with the same id.
// ---------------------------------------------------------------------------

export const PIPELINE = [
  { id: "daily-check", label: "Daily Check and Blood Check" },
  { id: "error-check", label: "Measurement Error Check" },
  { id: "baseline", label: "Personal Baseline" },
  { id: "expected", label: "Spaceflight Adjustment" },
  { id: "zscore", label: "Per-Marker z-Score" },
  { id: "immune", label: "Immune Deviation Score" },
  { id: "status", label: "Status" },
] as const;

export type StepId = (typeof PIPELINE)[number]["id"];

// ---------------------------------------------------------------------------
// Methods sections: a title, a formula (KaTeX) and two plain-language sentences on why.
// ---------------------------------------------------------------------------

const SD = CONFIG.variation.sd;
const V = CONFIG.vitalsAdjust;
const L = CONFIG.absoluteLimits;

export type MethodSection = { id: StepId; title: string; tex: string[]; why: [string, string] };

export const METHODS: MethodSection[] = [
  {
    id: "daily-check",
    title: "Daily Check and NEWS2",
    tex: [
      String.raw`\text{NEWS2} = \sum_{v} p_v(x_v)`,
      String.raw`\text{SBP}_{\text{adj}} = \text{SBP} + ${V.systolicAddInFlight}, \qquad T_{\text{adj}} = T - \left(\overline{T}_{${V.temperatureWindowDays}\text{ d}} - ${V.temperatureReferenceC.toFixed(1)}\right)`,
    ],
    why: [
      "NEWS2 is a hospital early warning score in which each vital sign earns 0 to 3 points and the points are added into one total, so the astronaut gets one simple number for how unwell the vitals look.",
      "Spaceflight shifts two vitals on its own, so systolic pressure is raised by 10 mmHg in flight and temperature is compared with the astronaut's own last 14 days, which keeps normal flight changes from scoring as illness.",
    ],
  },
  {
    id: "error-check",
    title: "Measurement Error Check",
    tex: [
      String.raw`\frac{\left|\,n_m - W\,p_m/100\,\right|}{W\,p_m/100} > ${CONFIG.bloodChecks.percentMismatch}`,
      String.raw`\sum_{m} n_m \le ${CONFIG.bloodChecks.sumLimit}\,W`,
    ],
    why: [
      "Each cell count should agree with the white-cell total times that cell type's percentage, and the counts should add up to no more than the total, so a typing slip or a bad sample shows up before it is trusted.",
      "A reading that fails the check is marked as a likely measurement error and the astronaut is asked to measure again, which stops a bad number from raising a false alarm or distorting a baseline.",
    ],
  },
  {
    id: "baseline",
    title: "Personal Baseline",
    tex: [String.raw`b_m = \left(\prod_{i=1}^{n} x_{m,i}\right)^{1/n} = \exp\!\left(\frac{1}{n}\sum_{i=1}^{n}\ln x_{m,i}\right)`],
    why: [
      "The baseline for each marker is the geometric mean of the astronaut's usable preflight readings, which suits blood counts because they vary by ratios rather than by fixed amounts.",
      "Using the astronaut's own readings instead of a population range means a person who is normally low or high is judged against their own normal.",
    ],
  },
  {
    id: "expected",
    title: "Expected Value and Spaceflight Adjustment",
    tex: [String.raw`E_m(t) = b_m \cdot k_{m,\varphi(t)}`],
    why: [
      "The expected value is the personal baseline times a multiplier for the flight phase, taken from published crew averages, because white cells and especially neutrophils usually rise a little in flight.",
      "Without this step a normal spaceflight rise would look like a problem from the first days of the mission.",
    ],
  },
  {
    id: "zscore",
    title: "Per-Marker z-Score",
    tex: [
      String.raw`z_m = \frac{\ln\left(x_m / E_m\right)}{\mathrm{sd}}`,
      String.raw`\mathrm{sd} = \sqrt{\mathrm{sd}_m^{2}\left(1 + \tfrac{1}{n}\right) + \mathrm{sd}_{\text{phase}}^{2}}`,
    ],
    why: [
      "The z-score says how far a value is from the expected value in units of normal within-person variation, measured on the log scale and widened for the few baseline readings and the uncertainty of the flight phase.",
      `A marker is outside the astronaut's usual range when |z| is above ${CONFIG.blood.zLimit}, which about 5 in 100 normal readings do, so an out-of-range value is a signal to watch and not a diagnosis.`,
    ],
  },
  {
    id: "immune",
    title: "Immune Deviation Score",
    tex: [
      String.raw`Q = z_{\text{NEU}}^{2} + z_{\text{LYM}}^{2} + z_{\text{MON}}^{2} + z_{\text{EOS}}^{2}`,
      String.raw`S = 100 \cdot F_{\chi^{2}_{k}}(Q), \qquad S \ge ${CONFIG.immune.unusualFrom} \Rightarrow \text{Unusual}`,
    ],
    why: [
      "The squared z-scores of neutrophils, lymphocytes, monocytes and eosinophils are added and converted with the chi-square distribution, using one degree of freedom for each marker entered, into one number from 0 to 100.",
      `A score of ${CONFIG.immune.unusualFrom} or higher means the combined white-cell pattern is more unusual than 95% of the astronaut's normal readings, so several small shifts that each stay in range can still raise a flag.`,
    ],
  },
  {
    id: "status",
    title: "Safety Limits and Status",
    tex: [
      String.raw`N < ${L.neutrophilsContactBelow} \;\lor\; L < ${L.lymphocytesContactBelow} \;\lor\; W < ${L.wbcContactBelow} \;\Rightarrow\; \text{Contact Flight Surgeon}`,
      String.raw`N < ${L.neutrophilsContactNowBelow} \;\Rightarrow\; \text{Contact Flight Surgeon Now}`,
    ],
    why: [
      "A few absolute limits for very low neutrophils, lymphocytes and white cells, from CTCAE grading of low blood counts, always count whatever the personal baseline says.",
      "The final status for each check is the most urgent result from the personal ranges, the Immune Deviation Score, the absolute limits and the NEWS2 total, and it never drops below a limit that has been crossed.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Tables built from lib/config.ts
// ---------------------------------------------------------------------------

export const MARKER_ORDER: Marker[] = ["WBC", "NEU", "LYM", "MON", "EOS", "NLR"];
export const markerName = (m: Marker) => MARKER_NAMES[m];

const earlyEnd = CONFIG.spaceflight.earlyFlightLastDay;
const PHASE_DAYS: Record<Phase, string> = {
  preflight: "Before launch",
  earlyFlight: `Days 1 to ${earlyEnd}`,
  longFlight: `Day ${earlyEnd + 1} and later`,
};

export const MULTIPLIER_ROWS = (Object.keys(CONFIG.spaceflight.phases) as Phase[]).map((p) => ({
  phase: PHASE_NAMES[p],
  days: PHASE_DAYS[p],
  sdPhase: CONFIG.spaceflight.phases[p].sdPhase,
  multipliers: MARKER_ORDER.map((m) => CONFIG.spaceflight.phases[p].multiplier[m]),
  source: CONFIG.spaceflight.phases[p].source,
}));

export const SD_ROWS = MARKER_ORDER.map((m) => ({ marker: MARKER_NAMES[m], short: SD[m].short, long: SD[m].long }));
export const LONG_TERM_DAYS = CONFIG.blood.longTermDays;

export const LIMIT_ROWS = [
  { name: "Neutrophils", rule: `below ${L.neutrophilsContactBelow}`, result: "Contact Flight Surgeon" },
  { name: "Lymphocytes", rule: `below ${L.lymphocytesContactBelow}`, result: "Contact Flight Surgeon" },
  { name: "White cells", rule: `below ${L.wbcContactBelow}`, result: "Contact Flight Surgeon" },
  { name: "Neutrophils", rule: `below ${L.neutrophilsContactNowBelow}`, result: "Contact Flight Surgeon Now" },
];

export const STATUS_RULES = CONFIG.statusRules;
export const VITALS_ADJUST = V;

// ---------------------------------------------------------------------------
// Sources and other page text
// ---------------------------------------------------------------------------

// Every source named anywhere in the Learn tab, listed once.
export const ALL_SOURCES = Array.from(new Set([...DAILY_SOURCES, ...NEWS2_SOURCES, ...BLOOD_SOURCES.map((x) => x.text)]));


// Files and what each one does, for the Architecture page.
export const FILES = [
  { file: "lib/config.ts", role: "Every threshold, multiplier, range and limit, each with its source." },
  { file: "lib/engine.ts", role: "The calculations: baseline, z-scores, Immune Deviation Score, NEWS2, statuses and the Daily Check streak. No React." },
  { file: "lib/data.ts", role: "The real Inspiration4 preflight values and the seeded generator for the simulated in-flight days." },
  { file: "lib/content.ts", role: "Learn tab text, popup text and the Emergency Mode guides." },
  { file: "lib/export.ts", role: "Table builders and the CSV, JSON and PNG downloads." },
  { file: "lib/methods.ts", role: "The text and tables on these pages." },
  { file: "lib/search.ts, lib/ask.ts, lib/nav.ts and lib/state-map.ts", role: "Ask HemoScope: the offline search index, synonyms and emergency rule built from the app's own content, the side panel rules, the My Health sub-tab rules, and the Immune State Map layout (zoom, corner hints, summary line, labels that never overlap)." },
  { file: "app/page.tsx, app/ui.tsx, app/state-map.tsx, app/ask.tsx and components/CheckTypeToggle.tsx", role: "The demo interface for the astronaut and flight surgeon views, the Immune State Map, and the Ask HemoScope search panel." },
  { file: "app/about-hemoscope", role: "These pages, prerendered at build time." },
];

// Number of automated tests in lib/engine.test.ts. A test at the end of that file fails if this number is out of date.
export const AUTOMATED_TESTS = 79;

export const STACK = [
  { name: "Next.js and React", use: "Pages and interface. The pages are prerendered, and the demo runs as client code in the browser." },
  { name: "Tailwind CSS", use: "Styling, with one set of theme variables for dark and light mode." },
  { name: "html-to-image", use: "PNG export of charts and tables." },
  { name: "KaTeX", use: "The formulas on the Methods page, rendered at build time." },
  { name: "MiniSearch", use: "Ask HemoScope: fuzzy, prefix and weighted search over the app's own content, in the browser with no connection." },
];

// Ask HemoScope: offline search over the app's own content. No web, no AI model.
// The index is built from the existing text in lib/content.ts (nothing is copied), once, the first time it is needed.

import MiniSearch from "minisearch";
import {
  BLOOD_SECTION, CPR_SECTION, CPR_TEXT, IMMUNE_SECTION, LEARN_MARKERS, LEARN_MEASUREMENTS, MAP_SECTION, MAP_SPOTS,
  NEWS2_SECTION, NEWS2_TEXT, NLR_SECTION, NUMBERS_SECTION, NUMBERS_TEXT, SCENARIOS, STATUS_MEANINGS, STATUS_ORDER,
  STATE_MAP_SECTION, STATUS_SECTION, TIMELINE_SECTION, TIMELINE_STOPS, DAILY_SECTION, LEARN_TARGET_IDS,
} from "./content";
import { STATUS_TEXT } from "./engine";
import { MAP_ZONE_TEXT } from "./ml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PageId = "dashboard" | "daily" | "blood" | "todays-results" | "history" | "emergency";
// Where a result opens. A Learn id is a section, a measurement, a marker, a body map card, a timeline stop or a status card.
export type SearchTarget =
  | { kind: "learn"; id: string }
  | { kind: "emergency"; scenario?: string }
  | { kind: "page"; page: PageId };
export type SectionLabel = "Learn" | "Emergency Mode" | "My Health";

export type Chunk = { id: string; title: string; section: SectionLabel; text: string; target: SearchTarget };
export type Segment = { text: string; hit: boolean };
export type Hit = { id: string; title: string; section: SectionLabel; target: SearchTarget; snippet: Segment[] };
export type Answer = { query: string; emergency: boolean; pages: Hit[]; results: Hit[] };

export const NO_RESULTS = "HemoScope's resources don't cover that. For health questions, contact your flight surgeon.";
export const SEARCH_FOOTER = "Searches HemoScope's own content only. No internet needed.";
export const MAX_RESULTS = 3;

// ---------------------------------------------------------------------------
// Synonyms and the emergency rule
// ---------------------------------------------------------------------------

// Words that mean the same thing. A question that uses any word in a group also looks for all the others.
export const SYNONYMS: string[][] = [
  ["white cells", "white blood cells", "wbc", "leukocytes"],
  ["neutrophils", "neu"],
  ["lymphocytes", "lym"],
  ["fever", "temperature"],
  ["heart rate", "pulse"],
  ["oxygen", "spo2", "saturation"],
  ["blood pressure", "bp", "systolic"],
  ["sleep", "tired", "sleepiness"],
  ["nlr", "ratio"],
  ["score", "deviation", "ids"],
  ["cpr", "compressions"],
  ["allergic", "anaphylaxis", "epinephrine"],
];

// Any of these in the question puts the Open Emergency Mode button first.
export const EMERGENCY_PHRASES = [
  "chest pain", "not breathing", "can't breathe", "unresponsive", "collapsed", "cpr", "unconscious", "allergic reaction",
  "anaphylaxis", "choking", "bleeding",
];

const STOP = new Set(["a", "an", "the", "is", "are", "was", "of", "to", "in", "on", "and", "or", "do", "does", "i", "my", "me", "it", "what", "how", "for", "with", "about", "can", "t"]);

const normalize = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'");
const words = (s: string) => normalize(s).match(/[\p{L}\p{N}]+/gu) ?? [];

// True when the two words differ by at most one letter added, removed or changed.
function withinOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

export function isEmergency(query: string): boolean {
  const q = normalize(query).replace(/\bcannot breathe\b|\bcant breathe\b/g, "can't breathe");
  return EMERGENCY_PHRASES.some((p) => new RegExp(`(^|[^\\p{L}])${p.replace(/'/g, "['’]?")}($|[^\\p{L}])`, "u").test(q));
}

// The question plus every word that means the same as one of its words. A word with a small typo still counts.
export function expandQuery(query: string): string {
  const q = normalize(query);
  const tokens = words(q);
  const extra: string[] = [];
  for (const group of SYNONYMS) {
    const hit = group.some((term) => {
      if (term.includes(" ")) return ` ${tokens.join(" ")} `.includes(` ${term} `);
      return tokens.some((t) => t === term || (term.length >= 4 && t.length >= 4 && withinOne(t, term)));
    });
    if (hit) extra.push(...group);
  }
  return [query, ...extra].join(" ");
}

// ---------------------------------------------------------------------------
// The chunks, built from the app's own content
// ---------------------------------------------------------------------------

const learn = (id: string, title: string, text: string): Chunk => ({ id, title, section: "Learn", text, target: { kind: "learn", id } });

export function buildChunks(): Chunk[] {
  const chunks: Chunk[] = [];
  for (const s of MAP_SPOTS) chunks.push(learn(`map-${s.id}`, s.title, `${s.text} ${s.tracks}`));
  chunks.push(learn(MAP_SECTION.id, MAP_SECTION.title, MAP_SPOTS.map((s) => s.title).join(", ")));
  for (const t of TIMELINE_STOPS) chunks.push(learn(`timeline-${t.id}`, `${t.title}, ${t.days}`, `${t.changes.join(" ")} ${t.does}`));
  chunks.push(learn(TIMELINE_SECTION.id, TIMELINE_SECTION.title, TIMELINE_STOPS.map((t) => `${t.title} ${t.days}.`).join(" ")));
  chunks.push(learn(CPR_SECTION.id, CPR_SECTION.title, CPR_TEXT.join(" ")));
  chunks.push(learn(NUMBERS_SECTION.id, NUMBERS_SECTION.title, `${NUMBERS_TEXT.intro} ${NUMBERS_TEXT.nlrAbove}`));
  chunks.push(learn(STATUS_SECTION.id, STATUS_SECTION.title, STATUS_ORDER.map((s) => STATUS_TEXT[s].label).join(", ")));
  for (const s of STATUS_ORDER) chunks.push(learn(`status-${s}`, STATUS_TEXT[s].label, STATUS_MEANINGS[s]));
  chunks.push(learn(DAILY_SECTION.id, DAILY_SECTION.title, LEARN_MEASUREMENTS.map((m) => m.title).join(", ")));
  for (const m of LEARN_MEASUREMENTS) chunks.push(learn(m.id, m.title, [m.what, m.how, m.why, m.typical, m.note ?? ""].join(" ")));
  chunks.push(learn(NEWS2_SECTION.id, NEWS2_SECTION.title, [NEWS2_TEXT.what, NEWS2_TEXT.points, ...NEWS2_TEXT.totals.map((t) => `${t.when}: ${t.status}.`), ...NEWS2_TEXT.adjust].join(" ")));
  chunks.push(learn(BLOOD_SECTION.id, BLOOD_SECTION.title, LEARN_MARKERS.map((m) => `${m.title}: ${m.short}`).join(" ")));
  for (const m of LEARN_MARKERS) chunks.push(learn(m.id, m.title, `${m.short} ${m.does} ${m.rise} ${m.drop}`));
  chunks.push(learn(NLR_SECTION.id, NLR_SECTION.title, NLR_SECTION.text));
  chunks.push(learn(IMMUNE_SECTION.id, IMMUNE_SECTION.title, IMMUNE_SECTION.paragraphs.join(" ")));
  chunks.push(learn(STATE_MAP_SECTION.id, STATE_MAP_SECTION.title, [
    STATE_MAP_SECTION.intro, ...STATE_MAP_SECTION.axes.map((x) => `${x.title}. ${x.text}`), STATE_MAP_SECTION.zonesIntro,
    ...Object.entries(MAP_ZONE_TEXT).map(([zone, text]) => `${zone}. ${text}`), STATE_MAP_SECTION.direction,
  ].join(" ")));
  for (const s of SCENARIOS) {
    chunks.push({ id: `emergency-${s.id}`, title: s.title, section: "Emergency Mode", text: s.steps.map((x) => x.text).join(" "), target: { kind: "emergency", scenario: s.id } });
  }
  return chunks;
}

// Pages the question can open directly. The aliases are extra words that name the same page.
type PageDoc = { id: PageId; title: string; aliases: string; section: SectionLabel };
export const PAGES: PageDoc[] = [
  { id: "dashboard", title: "Dashboard", aliases: "checklist streak today", section: "My Health" },
  { id: "daily", title: "Daily Check", aliases: "vital signs vitals", section: "My Health" },
  { id: "blood", title: "Blood Check", aliases: "blood test sample", section: "My Health" },
  { id: "todays-results", title: "Today's Results", aliases: "submitted status", section: "My Health" },
  { id: "history", title: "Health History", aliases: "trends charts past", section: "My Health" },
  { id: "emergency", title: "Emergency Mode", aliases: "emergency guide", section: "Emergency Mode" },
];

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

const processTerm = (term: string) => (STOP.has(term.toLowerCase()) ? null : term.toLowerCase());

type Built = { chunks: Chunk[]; byId: Map<string, Chunk>; content: MiniSearch<Chunk>; pages: MiniSearch<PageDoc> };
let built: Built | null = null;

function getIndex(): Built {
  if (built) return built;
  const chunks = buildChunks();
  const content = new MiniSearch<Chunk>({ fields: ["title", "text"], storeFields: ["id"], processTerm });
  content.addAll(chunks);
  const pages = new MiniSearch<PageDoc>({ fields: ["title", "aliases"], storeFields: ["id"], processTerm });
  pages.addAll(PAGES);
  built = { chunks, byId: new Map(chunks.map((c) => [c.id, c])), content, pages };
  return built;
}

export function allChunks(): Chunk[] {
  return getIndex().chunks;
}

// Does the place a target opens exist in the app?
export function targetExists(t: SearchTarget): boolean {
  if (t.kind === "learn") return LEARN_TARGET_IDS.includes(t.id);
  if (t.kind === "emergency") return t.scenario === undefined || SCENARIOS.some((s) => s.id === t.scenario);
  return PAGES.some((p) => p.id === t.page);
}

// Two sentences with the most matching words, split into plain and highlighted pieces.
function snippetOf(text: string, terms: Set<string>): Segment[] {
  const sentences = (text.match(/(?:[^.!?]|[.!?](?!\s|$))+(?:[.!?]+|$)/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
  const score = (s: string) => words(s).filter((w) => terms.has(w)).length;
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.max(sentences.length - 1, 1); i++) {
    const sc = score(sentences[i]) + (sentences[i + 1] ? score(sentences[i + 1]) : 0);
    if (sc > bestScore) { best = i; bestScore = sc; }
  }
  const picked = sentences.slice(best, best + 2).join(" ");
  const out: Segment[] = [];
  for (const part of picked.split(/([\p{L}\p{N}]+)/u)) {
    if (!part) continue;
    out.push({ text: part, hit: terms.has(part.toLowerCase()) });
  }
  return out;
}

const OPTIONS = {
  prefix: (term: string) => term.length >= 3,
  fuzzy: (term: string) => (term.length >= 4 ? 0.2 : false as const),
  boost: { title: 3 },
  combineWith: "OR" as const,
};

export function search(query: string, limit = MAX_RESULTS): Answer {
  const q = query.trim();
  const emergency = isEmergency(q);
  if (!q) return { query: q, emergency, pages: [], results: [] };
  const idx = getIndex();

  // Pages must match every word of the question, so "white cells" does not open the Blood Check page.
  const pages = idx.pages.search(q, { ...OPTIONS, combineWith: "AND", boost: { title: 2 } }).slice(0, 3).map((r): Hit => {
    const p = PAGES.find((x) => x.id === (r.id as PageId)) as PageDoc;
    return { id: `page-${p.id}`, title: p.title, section: p.section, target: { kind: "page", page: p.id }, snippet: [] };
  });

  const found = idx.content.search(expandQuery(q), OPTIONS);
  const top = found[0]?.score ?? 0;
  // Fuzzy and prefix matches can be weak. Drop anything far below the best result.
  const results = found.filter((r) => r.score >= top * 0.3).slice(0, limit).map((r): Hit => {
    const c = idx.byId.get(r.id as string) as Chunk;
    const terms = new Set(r.terms.map((t) => t.toLowerCase()));
    return { id: c.id, title: c.title, section: c.section, target: c.target, snippet: snippetOf(c.text, terms) };
  });
  return { query: q, emergency, pages, results };
}

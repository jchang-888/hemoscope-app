import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MindView } from "../app/mind";
import { getAstronaut } from "./data";
import { evaluateBloodSeries, evaluateDailySeries } from "./engine";
import { bloodHistoryTable, crewTable, dailyHistoryTable } from "./export";
import {
  BREATH_CYCLES, BREATH_PHASES, BREATH_SECONDS, BREATH_TOTAL_SECONDS, JOURNAL_KEY, JOURNAL_PRIVACY, MAX_NOTE,
  addEntry, breathAt, deleteEntry, entriesNewestFirst, parseJournal, type Journal,
} from "./mind";
import { isHealth, navFromParam, TAB_IDS } from "./nav";
import { allChunks, search } from "./search";

const read = (f: string) => readFileSync(f, "utf8");
const page = read("app/page.tsx");
const SECRET = "qxzvk7731"; // not a real word, so the fuzzy search cannot match it by accident

describe("Mood Journal storage", () => {
  const entry = (id: string, day: number, mood: number, note = "") => ({ id, day, mood, note });

  it("starts empty and survives bad stored data", () => {
    expect(parseJournal("")).toEqual({});
    const count = (j: Journal) => Object.values(j).flat().length;
    for (const bad of ["not json", "[]", "null", "42", '{"A":"x"}', '{"A":[{"id":1}]}']) expect(count(parseJournal(bad)), bad).toBe(0);
    expect(count(parseJournal('{"A":[{"id":"x","day":1,"mood":9,"note":""}]}'))).toBe(0); // mood must be 1 to 5
  });

  it("adds, lists newest first, and deletes entries per astronaut", () => {
    let j: Journal = {};
    j = addEntry(j, "A", entry("a1", 59, 3, "first"));
    j = addEntry(j, "A", entry("a2", 60, 4, "second"));
    j = addEntry(j, "A", entry("a3", 60, 5, "third"));
    j = addEntry(j, "B", entry("b1", 60, 2, "other astronaut"));
    expect(entriesNewestFirst(j, "A").map((e) => e.id)).toEqual(["a3", "a2", "a1"]);
    expect(entriesNewestFirst(j, "B").map((e) => e.id)).toEqual(["b1"]);
    expect(entriesNewestFirst(j, "C")).toEqual([]);
    j = deleteEntry(j, "A", "a2");
    expect(entriesNewestFirst(j, "A").map((e) => e.id)).toEqual(["a3", "a1"]);
    expect(entriesNewestFirst(j, "B")).toHaveLength(1);
  });

  it("keeps a note to 500 characters and round-trips through storage text", () => {
    const j = addEntry({}, "A", entry("x", 60, 3, "n".repeat(900)));
    expect(j.A![0].note).toHaveLength(MAX_NOTE);
    expect(parseJournal(JSON.stringify(j))).toEqual(j);
  });

  it("uses its own storage key", () => {
    expect(JOURNAL_KEY).toBe("hemoscope-journal");
    expect(page).not.toContain("hemoscope-journal");
    expect(read("app/mind.tsx")).toContain("JOURNAL_KEY");
  });
});

describe("Mood Journal page", () => {
  const html = renderToStaticMarkup(createElement(MindView, { id: "A" }));
  it("shows the privacy line, an empty list and the 500 character limit", () => {
    expect(JOURNAL_PRIVACY).toBe("Private. Only you can see this. It is not shared with your flight surgeon and does not change your status.");
    expect(html).toContain(JOURNAL_PRIVACY);
    expect(html).toContain("No entries yet.");
    expect(html).toContain('maxLength="500"');
    expect(html).toContain("Save");
  });

  it("has no chart, trend or analysis of the journal", () => {
    expect(html).not.toMatch(/<svg[^>]*role="img"|trend|average|streak/i);
    expect(read("app/mind.tsx")).not.toMatch(/TrendChart|ScoreTimeline|average|streak/i);
  });

  it("has no em dashes and no use of the word color in its text", () => {
    for (const text of [read("app/mind.tsx"), read("lib/mind.ts"), html]) {
      expect(text).not.toContain("—");
      expect(text).not.toMatch(/colou?r/i);
    }
  });
});

describe("journal entries stay private", () => {
  const journal = addEntry({}, "A", { id: "s", day: 60, mood: 1, note: SECRET });

  it("never appears in Ask HemoScope search", () => {
    expect(journal.A![0].note).toBe(SECRET);
    expect(search(SECRET).results).toEqual([]);
    expect(JSON.stringify(allChunks())).not.toContain(SECRET);
    expect(JSON.stringify(allChunks())).not.toContain("hemoscope-journal");
  });

  it("never appears in the flight surgeon data, results, scores or exports", () => {
    for (const id of ["A", "B", "C", "D"] as const) {
      const a = getAstronaut(id);
      const daily = evaluateDailySeries(a.daily);
      const blood = evaluateBloodSeries(a.blood, a.daily).results;
      const everything = JSON.stringify([a, daily, blood, dailyHistoryTable(a.daily, daily), bloodHistoryTable(blood)]);
      expect(everything).not.toContain(SECRET);
    }
    expect(JSON.stringify(crewTable([]))).not.toContain(SECRET);
  });

  it("is not imported by anything except the Mind page and the Reset Demo button", () => {
    const readers = ["lib/engine.ts", "lib/data.ts", "lib/export.ts", "lib/search.ts", "lib/content.ts", "lib/ml.ts", "lib/tour.ts", "lib/config.ts", "lib/nav.ts",
      "app/ask.tsx", "app/tour.tsx", "app/state-map.tsx", "app/ui.tsx"];
    for (const f of readers) expect(read(f), f).not.toMatch(/lib\/mind|\.\/mind|hemoscope-journal|parseJournal|addEntry|entriesNewestFirst|clearJournal|MindView/);
    // The page file names it only to show the Mind tab, clear it on Reset Demo, and nowhere near the surgeon view or Health History.
    const surgeon = page.slice(page.indexOf("function SurgeonView"), page.indexOf("export default function Home"));
    expect(surgeon).not.toMatch(/journal|MindView|clearJournal/i);
    const history = page.slice(page.indexOf("function HealthHistory"), page.indexOf("// Astronaut view (tabs)"));
    expect(history).not.toMatch(/journal|MindView|clearJournal/i);
    expect(page.match(/clearJournal/g)?.length).toBe(2); // the import and the Reset Demo line
    expect(page.match(/MindView/g)?.length).toBe(2); // the import and the Mind tab
  });

  it("is cleared by Reset Demo", () => {
    const reset = page.slice(page.indexOf("const resetDemo = () => {"), page.indexOf("const pickView"));
    expect(reset).toContain("clearJournal()");
  });
});

describe("Mind tab navigation", () => {
  it("is a main tab next to Learn, reachable with ?tab=mind, and not part of My Health", () => {
    expect(TAB_IDS).toContain("mind");
    expect(navFromParam("mind").view).toBe("mind");
    expect(isHealth("mind")).toBe(false);
    const tabs = page.slice(page.indexOf("const MAIN_TABS"), page.indexOf("const HEALTH_TABS"));
    expect(tabs.indexOf('"learn"')).toBeLessThan(tabs.indexOf('"mind"'));
    expect(tabs.indexOf('"mind"')).toBeLessThan(tabs.indexOf('"emergency"'));
    expect(page).toContain('label: "Mind"');
  });

  it("has a Need a minute link on the Dashboard", () => {
    expect(page).toContain("Need a minute? Open Mind");
    expect(page).toContain('onMind={() => setNav((n) => ({ ...n, view: "mind" }))}');
  });
});

describe("Breathe pacer", () => {
  it("is box breathing: 4 seconds each for Breathe in, Hold, Breathe out, Hold", () => {
    expect([...BREATH_PHASES]).toEqual(["Breathe in", "Hold", "Breathe out", "Hold"]);
    expect(BREATH_SECONDS).toBe(4);
    expect(BREATH_CYCLES).toBe(4);
    expect(BREATH_TOTAL_SECONDS).toBe(64);
  });

  it("cycles through the 4 phases in order, every 4 seconds", () => {
    const labels = [0, 4, 8, 12].map((s) => breathAt(s * 1000).label);
    expect(labels).toEqual(["Breathe in", "Hold", "Breathe out", "Hold"]);
    expect([0, 3.9, 4, 7.9, 8, 11.9, 12, 15.9].map((s) => breathAt(s * 1000).phase)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect([0, 1, 2, 3.5, 3.99].map((s) => breathAt(s * 1000).secondsLeft)).toEqual([4, 3, 2, 1, 1]);
  });

  it("grows on Breathe in, stays large on the Hold after it, shrinks on Breathe out and stays small on the last Hold", () => {
    expect([0, 4, 8, 12].map((s) => breathAt(s * 1000).big)).toEqual([true, true, false, false]);
  });

  it("counts cycles and stops after 4", () => {
    expect([0, 15.9, 16, 31.9, 32, 47.9, 48, 63.9].map((s) => breathAt(s * 1000).cycle)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(breathAt(63.9 * 1000).done).toBe(false);
    const end = breathAt(64 * 1000);
    expect(end.done).toBe(true);
    expect(end.cycle).toBe(4);
    expect(breathAt(500 * 1000).done).toBe(true); // stays done
  });

  it("never goes before the start", () => {
    expect(breathAt(-500)).toMatchObject({ phase: 0, cycle: 1, done: false });
  });

  it("shows the one-line note, and holds the circle still with reduced motion", () => {
    expect(renderToStaticMarkup(createElement(MindView, { id: "A" }))).toContain("For stress relief and focus during long missions. Not a treatment for any condition.");
    const css = read("app/globals.css");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .breath-circle"));
    expect(block).toContain("transition: none");
    expect(block).toContain("transform: none");
    expect(read("app/mind.tsx")).toContain("breath-circle");
  });
});

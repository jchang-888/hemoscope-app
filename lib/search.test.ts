import { describe, expect, it } from "vitest";
import { LEARN_MARKERS } from "./content";
import { NO_RESULTS, allChunks, expandQuery, isEmergency, search, targetExists } from "./search";

const markerIds: string[] = [...LEARN_MARKERS.map((m) => m.id), "learn-blood"];

describe("Ask HemoScope search", () => {
  it("white cells returns the Blood Check markers content", () => {
    const a = search("white cells");
    expect(a.results.length).toBeGreaterThan(0);
    expect(a.results.length).toBeLessThanOrEqual(3);
    expect(markerIds).toContain(a.results[0].id);
    expect(a.results[0].snippet.some((s) => s.hit)).toBe(true); // matching words are highlighted
  });

  it("a typo still finds the temperature content", () => {
    const a = search("fevr");
    expect(a.results.map((r) => r.id)).toContain("learn-temp");
    expect(a.results[0].id).toBe("learn-temp");
  });

  it("synonyms work in both directions", () => {
    expect(search("leukocytes").results[0].id).toBe("learn-wbc");
    expect(search("pulse").results.map((r) => r.id)).toContain("learn-hr");
    expect(search("BP").results.map((r) => r.id)).toContain("learn-bp");
    expect(expandQuery("sleepy")).toContain("tired");
  });

  it("chest pain sets the emergency flag, ordinary questions do not", () => {
    expect(search("chest pain").emergency).toBe(true);
    for (const q of ["not breathing", "I can't breathe", "can’t breathe", "he is unresponsive", "collapsed", "CPR", "unconscious", "allergic reaction", "anaphylaxis", "choking", "bleeding"]) {
      expect(isEmergency(q), q).toBe(true);
    }
    expect(search("white cells").emergency).toBe(false);
    expect(isEmergency("heart rate")).toBe(false);
  });

  it("pizza returns no results", () => {
    const a = search("pizza");
    expect(a.results).toHaveLength(0);
    expect(a.pages).toHaveLength(0);
    expect(NO_RESULTS).toBe("HemoScope's resources don't cover that. For health questions, contact your flight surgeon.");
  });

  it("blood check returns the Blood Check page shortcut, and white cells does not", () => {
    expect(search("blood check").pages[0].target).toEqual({ kind: "page", page: "blood" });
    expect(search("daily check").pages[0].target).toEqual({ kind: "page", page: "daily" });
    expect(search("health history").pages.map((p) => p.id)).toContain("page-history");
    expect(search("white cells").pages).toHaveLength(0);
  });

  it("every indexed chunk has a link target that exists", () => {
    const chunks = allChunks();
    expect(chunks.length).toBeGreaterThan(40);
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length);
    for (const c of chunks) {
      expect(targetExists(c.target), c.id).toBe(true);
      expect(c.text.length, c.id).toBeGreaterThan(0);
      expect(["Learn", "Emergency Mode", "My Health"]).toContain(c.section);
    }
    expect(targetExists({ kind: "learn", id: "nowhere" })).toBe(false);
  });

  it("indexes every body map card, timeline stop, status card and emergency scenario", () => {
    const ids = allChunks().map((c) => c.id);
    for (const id of ["map-marrow", "timeline-preflight", "status-surgeonNow", "learn-cpr", "emergency-unresponsive", "learn-nlr"]) expect(ids).toContain(id);
  });

  it("finds the Immune State Map section in the Learn tab", () => {
    expect(search("state map").results.map((r) => r.id)).toContain("learn-state-map");
    expect(search("what do the zones mean").results.map((r) => r.id)).toContain("learn-state-map");
    expect(allChunks().map((c) => c.id)).toContain("learn-state-map");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASK_START, ASK_SUGGESTIONS, afterGo, clearConversation, pressEscape, pressGlass, submitQuestion, toggleAsk } from "./ask";
import { NAV_START, openChecks, openHealthTab, openPage, openResults, isHealth, navFromParam, tabFromParam } from "./nav";
import { search } from "./search";

describe("Ask HemoScope panel", () => {
  it("submitting a question from the header opens the panel with the answer", () => {
    const s = submitQuestion(ASK_START, "  white cells ");
    expect(s.open).toBe(true);
    expect(s.history).toHaveLength(1);
    expect(s.history[0].query).toBe("white cells");
    expect(s.history[0].results.length).toBeGreaterThan(0);
  });

  it("the magnifying glass with an empty box opens the panel without a question", () => {
    for (const text of ["", "   "]) {
      const s = pressGlass(ASK_START, text);
      expect(s.open).toBe(true);
      expect(s.history).toHaveLength(0);
    }
    const kept = pressGlass(submitQuestion(ASK_START, "fever"), "");
    expect(kept.history).toHaveLength(1); // past questions are still there
  });

  it("the magnifying glass with text asks that question", () => {
    const s = pressGlass(ASK_START, "chest pain");
    expect(s.open).toBe(true);
    expect(s.history[0].emergency).toBe(true);
  });

  it("Escape closes the panel and keeps the conversation", () => {
    const open = submitQuestion(ASK_START, "pulse");
    const closed = pressEscape(open);
    expect(closed.open).toBe(false);
    expect(closed.history).toEqual(open.history);
    expect(pressEscape(closed)).toBe(closed);
  });

  it("keeps the conversation in order, and Clear empties it", () => {
    let s = submitQuestion(ASK_START, "fever");
    s = submitQuestion(s, "pizza");
    expect(s.history.map((a) => a.query)).toEqual(["fever", "pizza"]);
    expect(s.history[1].results).toHaveLength(0);
    expect(clearConversation(s).history).toHaveLength(0);
  });

  it("a result keeps the panel open on wide screens and closes it on narrow screens", () => {
    const open = submitQuestion(ASK_START, "fever");
    expect(afterGo(open, true).open).toBe(true);
    expect(afterGo(open, false).open).toBe(false);
  });

  it("the side tab opens the panel, and closes it again while keeping the conversation", () => {
    const opened = toggleAsk(pressEscape(submitQuestion(ASK_START, "fever")));
    expect(opened.open).toBe(true);
    const closed = toggleAsk(opened);
    expect(closed.open).toBe(false);
    expect(closed.history).toHaveLength(1);
    expect(toggleAsk(closed).open).toBe(true);
  });

  it("a Learn search asks the same way as the header form", () => {
    const s = pressGlass(ASK_START, "neutrophils");
    expect(s.open).toBe(true);
    expect(s.history[0].results.length).toBeGreaterThan(0);
  });

  it("the three suggestions each return an answer", () => {
    expect(ASK_SUGGESTIONS).toEqual(["What does Monitor Closely mean?", "Why do neutrophils change in space?", "How is CPR done in space?"]);
    for (const q of ASK_SUGGESTIONS) {
      const a = submitQuestion(ASK_START, q).history[0];
      expect(a.results.length + a.pages.length, q).toBeGreaterThan(0);
    }
    expect(submitQuestion(ASK_START, ASK_SUGGESTIONS[2]).history[0].emergency).toBe(true); // CPR
  });
});

describe("Today's Results page", () => {
  it("opens from the Dashboard and from a submitted check on the matching Daily or Blood view", () => {
    expect(openResults(NAV_START, "blood")).toEqual({ view: "results", checks: "daily", results: "blood" });
    expect(openPage(NAV_START, "todays-results").view).toBe("results");
    expect(isHealth("results")).toBe(true);
  });
  it("is the fourth My Health tab, between Health Checks and Health History, and uses the one shared toggle", () => {
    const src = readFileSync("app/page.tsx", "utf8");
    expect(src).toMatch(/id: "dashboard".*\n.*id: "checks".*\n.*id: "results", label: "Today's Results".*\n.*id: "history"/);
    expect(src.match(/<CheckTypeToggle /g)).toHaveLength(3);
    expect(src).not.toContain("Choose an inner");
    expect(src.match(/<DailyResults /g)).toHaveLength(1);
    expect(src.match(/<BloodResults /g)).toHaveLength(1);
    expect(src).toContain("Go to Health Checks");
    expect(search("today's results").pages.map((p) => p.target)).toContainEqual({ kind: "page", page: "todays-results" });
  });
});

describe("Opening a tab from the address", () => {
  it("opens any known tab id, and falls back to the Dashboard for anything else", () => {
    for (const t of ["dashboard", "checks", "results", "history", "learn", "emergency"]) expect(navFromParam(t).view).toBe(t);
    for (const bad of [null, undefined, "", "nope", "LEARN", "health", "__proto__"]) expect(tabFromParam(bad)).toBe("dashboard");
    expect(navFromParam("learn")).toEqual({ ...NAV_START, view: "learn" });
  });
  it("keeps the address in step without adding history entries, inside a Suspense boundary", () => {
    const src = readFileSync("app/page.tsx", "utf8");
    expect(src).toContain("window.history.replaceState(");
    expect(src).not.toContain("pushState(");
    expect(src).not.toContain("router.push(");
    expect(src).toMatch(/<Suspense fallback=\{<SiteHeader \/>\}>\s*<AstronautView/);
  });
});

describe("My Health sub-tabs", () => {
  it("a Today's Checklist card opens Health Checks on the matching inner tab", () => {
    expect(openChecks(NAV_START, "blood")).toEqual({ ...NAV_START, view: "checks", checks: "blood" });
    expect(openChecks(NAV_START, "daily")).toEqual({ ...NAV_START, view: "checks", checks: "daily" });
  });

  it("remembers the last inner tab for the visit", () => {
    let n = openChecks(NAV_START, "blood");
    n = openHealthTab(n, "history");
    n = openHealthTab(n, "dashboard");
    n = openHealthTab(n, "checks");
    expect(n).toEqual({ ...NAV_START, view: "checks", checks: "blood" });
  });

  it("the Daily Check and Blood Check shortcuts open the same inner tabs", () => {
    expect(openPage(NAV_START, "blood")).toEqual({ ...NAV_START, view: "checks", checks: "blood" });
    expect(openPage(NAV_START, "daily")).toEqual({ ...NAV_START, view: "checks", checks: "daily" });
    expect(openPage(NAV_START, "history").view).toBe("history");
    expect(openPage(NAV_START, "dashboard").view).toBe("dashboard");
  });
});

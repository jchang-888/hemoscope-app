import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAstronaut } from "./data";
import { evaluateBloodSeries } from "./engine";
import { FORECAST_NOT_EXPECTED, bloodHistoryTable } from "./export";
import { TAB_IDS } from "./nav";
import { TOUR_FINAL_TEXT, TOUR_START_LABEL, TOUR_START_NOTE, TOUR_ML_DOC_URL, TOUR_REPO_URL, TOUR_STEPS, lastStep, nextStep, prevStep, stepLabel } from "./tour";

const page = readFileSync("app/page.tsx", "utf8");
const tourUi = readFileSync("app/tour.tsx", "utf8");
const tourText = readFileSync("lib/tour.ts", "utf8");

describe("tour steps", () => {
  it("has the expected steps in order, with unique ids", () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      "dashboard", "daily-check", "blood-check", "todays-results", "day-46", "forecast", "state-map", "learn", "ask", "emergency", "surgeon", "azure",
    ]);
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
  });

  it("gives every step a title and a short text of at most two sentences", () => {
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      const sentences = s.text.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length, s.id).toBeLessThanOrEqual(2);
    }
  });

  it("uses no em dashes", () => {
    for (const text of [tourText, tourUi]) expect(text).not.toContain("—");
    for (const s of TOUR_STEPS) expect(`${s.title} ${s.text}`).not.toContain("—");
  });

  it("points every step at an area that exists in the page", () => {
    for (const s of TOUR_STEPS) {
      if (s.target === null) continue;
      // Rows get their data-tour value from a template (`${tourName}-day-${day}`), the rest are written out.
      const day = /^(\w+)-day-(\d+)$/.exec(s.target);
      if (day) {
        expect(page, s.id).toContain("data-tour={tourName ?");
        expect(page, s.id).toContain(`tourName="${day[1]}"`);
      } else {
        expect(page, s.id).toContain(`"${s.target}"`);
        expect(page.includes(`data-tour="${s.target}"`) || page.includes(`? "${s.target}"`) || page.includes(`: "${s.target}"`), s.id).toBe(true);
      }
    }
  });

  it("opens a tab the app has", () => {
    for (const s of TOUR_STEPS) {
      if (s.who === "surgeon") expect(["crew", "detail", "emergency"]).toContain(s.surgeonTab);
      else expect(TAB_IDS).toContain(s.view);
    }
  });

  it("shows the day 46 row for Astronaut D with the forecast not expected", () => {
    const step = TOUR_STEPS.find((s) => s.id === "day-46")!;
    expect(step.who).toBe("D");
    expect(step.target).toBe("blood-day-46");
    const { blood } = (() => { const a = getAstronaut("D"); return { blood: evaluateBloodSeries(a.blood.filter((b) => b.day <= 59), a.daily.filter((d) => d.day <= 59)).results }; })();
    const row = bloodHistoryTable(blood).rows.find((r) => r["Mission Day"] === 46);
    expect(row).toBeDefined();
    expect(row!.Forecast).toBe(FORECAST_NOT_EXPECTED);
  });

  it("ends with the Azure card and links to the repository and the machine learning write-up", () => {
    const final = TOUR_STEPS[lastStep];
    expect(final.text).toBe(TOUR_FINAL_TEXT);
    expect(final.text).toBe("Models trained on Microsoft Azure Machine Learning, run offline on the spacecraft.");
    expect(final.target).toBeNull();
    expect(TOUR_REPO_URL).toBe("https://github.com/jchang-888/hemoscope-app");
    expect(TOUR_ML_DOC_URL).toBe(`${TOUR_REPO_URL}/blob/main/docs/MACHINE_LEARNING.md`);
    expect(tourUi).toContain("TOUR_REPO_URL");
    expect(tourUi).toContain("TOUR_ML_DOC_URL");
  });

  it("has no Real Crew Replay step, because that view is not in this branch", () => {
    expect(TOUR_STEPS.some((s) => /replay/i.test(s.id + s.title))).toBe(false);
  });
});

describe("tour navigation", () => {
  it("keeps Back and Next in range", () => {
    expect(prevStep(0)).toBe(0);
    expect(nextStep(lastStep)).toBe(lastStep);
    for (let i = 0; i <= lastStep; i++) {
      expect(prevStep(i)).toBeGreaterThanOrEqual(0);
      expect(nextStep(i)).toBeLessThanOrEqual(lastStep);
    }
    expect(nextStep(0)).toBe(1);
    expect(prevStep(lastStep)).toBe(lastStep - 1);
  });

  it("walks the whole list forward and back", () => {
    let i = 0;
    for (let n = 0; n < TOUR_STEPS.length + 3; n++) i = nextStep(i);
    expect(i).toBe(lastStep);
    for (let n = 0; n < TOUR_STEPS.length + 3; n++) i = prevStep(i);
    expect(i).toBe(0);
  });

  it("labels steps as Step X of N", () => {
    expect(stepLabel(0)).toBe(`Step 1 of ${TOUR_STEPS.length}`);
    expect(stepLabel(lastStep)).toBe(`Step ${TOUR_STEPS.length} of ${TOUR_STEPS.length}`);
  });
});

describe("tour never changes stored data", () => {
  it("does not read or write storage or entries", () => {
    for (const text of [tourUi, tourText]) {
      expect(text).not.toMatch(/localStorage|sessionStorage|useStored|saveEntry|clearEntries|setItem|removeItem/);
    }
  });

  it("closes with Escape and has Back, Next and Exit buttons", () => {
    expect(tourUi).toContain('"Escape"');
    for (const label of [">Back<", ">Next<", ">Exit<"]) expect(tourUi).toContain(label);
  });
});

describe("start popup, Demo bar and Health History layout", () => {
  const at = (text: string) => { const i = page.indexOf(text); expect(i, text).toBeGreaterThan(-1); return i; };
  const demoBarCode = () => page.slice(at("const demo = who &&"), at('return (\n    <div className="min-h-screen">'));

  it("puts Take the Tour (for Judges) at the top of the start popup and not in the Demo bar", () => {
    expect(TOUR_START_LABEL).toBe("Take the Tour (for Judges)");
    expect(TOUR_START_NOTE).toBe("A 2-minute guided walkthrough of HemoScope.");
    expect(tourUi).toContain("TOUR_START_LABEL");
    expect(tourUi).toContain("TOUR_START_NOTE");
    const popup = page.slice(at("Who Do You Want to View the App As?"));
    expect(popup.indexOf("<TourButton")).toBeGreaterThan(-1);
    expect(popup.indexOf("<TourButton")).toBeLessThan(popup.indexOf("choice"));
    expect(demoBarCode()).not.toContain("TourButton");
  });

  it("shows the start popup again when the tour ends", () => {
    expect(page).toContain("const exitTour = () => { setTourIndex(null); setWho(null); }");
  });

  it("has Reset Demo in the Demo bar, and not on the Dashboard", () => {
    expect(demoBarCode()).toContain("Reset Demo");
    expect(demoBarCode()).toContain("onClick={resetDemo}");
    expect(page.match(/>Reset Demo</g)?.length).toBe(1); // one button, none on the Dashboard
    expect(page).toContain('setNotice("Demo reset")');
    const reset = page.slice(at("const resetDemo = () => {"), at("const pickView"));
    for (const part of ['writeRaw("")', "setDrafts({})", "setFromReset(true)", "setResetCount"]) expect(reset).toContain(part);
    // The same Demo bar goes to the astronaut view and the Flight Surgeon view.
    expect(page).toContain("<SurgeonView key={`${tourIndex ?? \"none\"}-${resetCount}`} demo={demo}");
    expect(page).toContain("demo={demo} tour={tourStep} startOnDashboard={fromReset}");
  });

  it("orders Health History > Blood Check: score and timeline, forecast, map, table, charts", () => {
    const blood = page.slice(at('{sub === "blood" && ('));
    const order = ["<ImmuneScoreCard", "Immune Deviation Score Timeline", "<NextForecastCard", "<ImmuneStateMap", "<HistoryTable", "BLOOD_CHARTS.map"].map((t) => blood.indexOf(t));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(blood.match(/Immune Deviation Score Timeline/g)?.length).toBe(1); // not shown twice
    expect(blood).toContain("forecast={forecastPoint(forecasts.find"); // dashed forecast points stay on the charts
  });

  it("shows the forecast card in Today's Results > Blood and a summary on the Dashboard", () => {
    expect(page).toContain("<NextForecastCard blood={blood} />");
    expect(page).toContain("View Next Blood Check Forecast");
    expect(page).toContain("Forecast by HemoScope's machine learning model from this astronaut's own blood checks.");
  });
});

describe("tour card size and placement", () => {
  it("is 480px wide on desktop, full width minus 32px on phones, with 24px padding", () => {
    expect(tourUi).toContain("w-[480px]");
    expect(tourUi).toContain("const CARD_W = 480");
    expect(tourUi).toContain("fixed inset-x-4 bottom-4"); // 16px each side, docked at the bottom
    expect(tourUi).toContain("p-6");
  });

  it("uses a 20px bold title and 16px body text with relaxed line height", () => {
    expect(tourUi).toContain("font-heading text-xl font-bold");
    expect(tourUi).toContain("text-base leading-relaxed");
  });

  it("shows Step X of N and a thin progress bar", () => {
    expect(tourUi).toContain("stepLabel(index)");
    expect(tourUi).toContain('role="progressbar"');
    expect(tourUi).toContain("h-1");
  });

  it("has Back, Next and Exit buttons at least 44px tall, with Next primary", () => {
    for (const label of ["Back", "Next", "Exit"]) {
      const line = tourUi.split("\n").find((l) => l.includes(`>${label}<`));
      expect(line, label).toBeDefined();
      expect(line).toContain("!min-h-11"); // 2.75rem = 44px
    }
    expect(tourUi.split("\n").find((l) => l.includes(">Next<"))).toContain("btn-primary");
  });

  it("moves the card beside or below the highlighted area, not over it", () => {
    expect(tourUi).toContain('mode: "side"');
    expect(tourUi).toContain("SPACER"); // room to scroll the area above the docked card
  });
});

import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmergencyAstronaut, LearnView } from "../app/ui";
import { getAstronaut } from "./data";
import { EMERGENCY_DISCLAIMER, LEARN_DISCLAIMER, SCENARIOS, SOURCES_PAGE_URL, SOURCES_SECTION, type Disclaimer } from "./content";
import { evaluateBloodSeries, evaluateDailySeries } from "./engine";

const whole = (d: Disclaimer) => `${d.label} ${d.text} ${d.link}`;
const LEARN_WORDING = "About this content: Lessons are written by the HemoScope team in plain language from published research and NASA sources. They are educational and are not medical advice. See all sources";
const EMERGENCY_WORDING = "About these guides: Guides are written by the HemoScope team and adapted from published CPR, microgravity and allergy guidance. They are a hackathon demonstration, not an approved NASA procedure, and the crew's medical checklist and flight surgeon always come first. See all sources";

const a = getAstronaut("A");
const learn = () => renderToStaticMarkup(createElement(LearnView, { anchor: null, blood: evaluateBloodSeries(a.blood, a.daily).results, daily: evaluateDailySeries(a.daily), onEmergency: () => {} }));
const emergency = (initial?: string) => renderToStaticMarkup(createElement(EmergencyAstronaut as FunctionComponent<{ initial?: string }>, { initial }));
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
// The note's own markup, and everything after it.
const noteOf = (html: string) => html.slice(html.lastIndexOf("<p data-disclaimer"));

describe("disclaimer wording", () => {
  it("uses the exact wording", () => {
    expect(whole(LEARN_DISCLAIMER)).toBe(LEARN_WORDING);
    expect(whole(EMERGENCY_DISCLAIMER)).toBe(EMERGENCY_WORDING);
  });

  it("links to the Data and Sources page", () => {
    expect(SOURCES_PAGE_URL).toBe("https://hemoscope.framer.website/data-and-sources");
  });

  it("follows the wording rules: no em dashes, HemoScope spelled right, no word color", () => {
    for (const d of [LEARN_DISCLAIMER, EMERGENCY_DISCLAIMER]) {
      const s = whole(d);
      expect(s).not.toContain("—");
      expect(s).toContain("HemoScope");
      expect(s).not.toMatch(/hemascope|colou?r/i);
    }
  });
});

describe("Learn tab disclaimer", () => {
  it("is the last thing on the screen, after the Sources section", () => {
    const html = learn();
    expect(html.match(/data-disclaimer/g)?.length).toBe(1);
    expect(html.lastIndexOf("data-disclaimer")).toBeGreaterThan(html.lastIndexOf(SOURCES_SECTION.title));
    expect(noteOf(html)).toMatch(/^<p data-disclaimer[^>]*>[\s\S]*<\/p><\/div>$/); // nothing follows the note except the closing wrapper
    expect(text(noteOf(html))).toBe(LEARN_WORDING);
  });

  it("makes the label bold and links to the Data and Sources page in a new tab", () => {
    const note = noteOf(learn());
    expect(note).toContain("<b class=\"font-bold text-foreground\">About this content:</b>");
    expect(note).toContain(`<a href="${SOURCES_PAGE_URL}" target="_blank" rel="noopener noreferrer" class="underline">See all sources</a>`);
  });
});

describe("Emergency Mode disclaimer", () => {
  it("is at the bottom of the scenario list, after the emergency buttons and the CPR pacer", () => {
    const html = emergency();
    expect(html.match(/data-disclaimer/g)?.length).toBe(1);
    const at = html.indexOf("data-disclaimer");
    for (const s of SCENARIOS) expect(html.indexOf(s.title), s.title).toBeLessThan(at); // the buttons come first
    expect(html.indexOf("What Is Happening?")).toBeLessThan(at);
    expect(html.indexOf("Compression Pacer")).toBeLessThan(at);
    expect(noteOf(html)).toMatch(/^<p data-disclaimer[^>]*>[\s\S]*<\/p><\/section>$/);
    expect(text(noteOf(html))).toBe(EMERGENCY_WORDING);
  });

  it("is at the bottom of an open guide, after the step buttons", () => {
    const html = emergency(SCENARIOS[0].id);
    expect(html.match(/data-disclaimer/g)?.length).toBe(1);
    expect(html.indexOf("All Scenarios")).toBeLessThan(html.indexOf("data-disclaimer"));
    expect(text(noteOf(html))).toBe(EMERGENCY_WORDING);
  });

  it("makes the label bold and links to the Data and Sources page in a new tab", () => {
    const note = noteOf(emergency());
    expect(note).toContain("<b class=\"font-bold text-foreground\">About these guides:</b>");
    expect(note).toContain(`<a href="${SOURCES_PAGE_URL}" target="_blank" rel="noopener noreferrer" class="underline">See all sources</a>`);
  });
});

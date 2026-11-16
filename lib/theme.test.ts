import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const layout = readFileSync("app/layout.tsx", "utf8");
const ui = readFileSync("app/ui.tsx", "utf8");
const readme = readFileSync("README.md", "utf8");
const deck = readFileSync("public/deck.html", "utf8");

// Runs the script from app/layout.tsx against a fake page and a fake localStorage.
function themeAfterScript(saved: string | null | "throws"): string {
  const m = /const THEME_SCRIPT = `([^`]*)`;/.exec(layout);
  expect(m).not.toBeNull();
  let theme = "light"; // the data-theme the server sends
  const document = { documentElement: { setAttribute: (_: string, v: string) => { theme = v; } } };
  const localStorage = { getItem: () => { if (saved === "throws") throw new Error("blocked"); return saved; } };
  runInNewContext(m![1], { document, localStorage });
  return theme;
}

describe("light mode by default", () => {
  it("sends light in the page and says so in the comment", () => {
    expect(layout).toContain('data-theme="light"');
    expect(layout).not.toContain('data-theme="dark"');
    expect(layout).toContain("Light is the default");
  });

  it("uses dark only when the saved choice is exactly dark", () => {
    expect(themeAfterScript(null)).toBe("light"); // first visit, no saved choice
    expect(themeAfterScript("light")).toBe("light");
    expect(themeAfterScript("dark")).toBe("dark");
    expect(themeAfterScript("Dark")).toBe("light");
    expect(themeAfterScript("")).toBe("light");
    expect(themeAfterScript("throws")).toBe("light"); // storage blocked: stays on the page's light default
  });

  it("makes the toggle read and render light unless the page is dark", () => {
    expect(ui).toContain('getAttribute("data-theme") === "dark" ? "dark" : "light"');
    expect(ui).toContain('() => "light" as Theme');
    expect(ui).toContain("localStorage.setItem(THEME_KEY, next)"); // the choice is remembered
    expect(layout).toContain('getItem("hemoscope-theme")');
    expect(ui).toContain('const THEME_KEY = "hemoscope-theme"');
  });
});

describe("live app address", () => {
  const old = "hemoscope" + "-app.vercel.app"; // built from parts so this file does not match itself
  it("has no mention of the old address anywhere in the repository", () => {
    let hits = "";
    try {
      hits = execFileSync("git", ["grep", "-nI", old, "--", ".", ":(exclude)lib/theme.test.ts"], { encoding: "utf8" });
    } catch {
      hits = ""; // git grep exits with 1 when nothing matches
    }
    expect(hits).toBe("");
  });

  it("uses https://hemoscope.vercel.app in the README and the deck, keeping the tab links", () => {
    expect(readme).toContain("(https://hemoscope.vercel.app)");
    expect(deck).toContain("https://hemoscope.vercel.app/?tab=dashboard");
    expect(deck).toContain("https://hemoscope.vercel.app/?tab=emergency");
  });

  it("leaves the GitHub repository name alone", () => {
    expect(readFileSync("lib/tour.ts", "utf8")).toContain("https://github.com/jchang-888/hemoscope-app");
  });
});

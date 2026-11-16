// Where the astronaut view is, as plain functions so the tabs can be tested without a browser.

import type { PageId } from "./search";

export type ChecksTab = "daily" | "blood";
// My Health has four sub-tabs (dashboard, checks, results, history). Learn, Mind and Emergency Mode are the other main tabs.
export type View = "dashboard" | "checks" | "results" | "history" | "learn" | "mind" | "emergency";
// `checks` is the last selected inner tab of Health Checks. It is remembered for the visit, even while another tab is open.
// `results` is the same for Today's Results (Daily or Blood).
export type NavState = { view: View; checks: ChecksTab; results: ChecksTab };
export const NAV_START: NavState = { view: "dashboard", checks: "daily", results: "daily" };

// The tab ids the astronaut view accepts in the address (?tab=learn). Anything else is ignored.
export const TAB_IDS: View[] = ["dashboard", "checks", "results", "history", "learn", "mind", "emergency"];
export const tabFromParam = (value: string | null | undefined): View => TAB_IDS.find((t) => t === value) ?? "dashboard";
// The page opens on the tab named in the address, and on the Dashboard when there is none or it is not a known tab.
export const navFromParam = (value: string | null | undefined): NavState => ({ ...NAV_START, view: tabFromParam(value) });

export const isHealth = (v: View) => v === "dashboard" || v === "checks" || v === "results" || v === "history";

// A Today's Checklist card on the Dashboard opens Health Checks with the matching inner tab selected.
export const openChecks = (nav: NavState, tab: ChecksTab): NavState => ({ ...nav, view: "checks", checks: tab });
// The Health Checks sub-tab reopens whichever inner tab was used last.
export const openHealthTab = (nav: NavState, view: "dashboard" | "checks" | "results" | "history"): NavState => ({ ...nav, view });
// A submitted check, or a View Results button, opens Today's Results on the matching Daily or Blood view.
export const openResults = (nav: NavState, tab: ChecksTab): NavState => ({ ...nav, view: "results", results: tab });

// A search page shortcut.
export function openPage(nav: NavState, page: PageId): NavState {
  if (page === "daily" || page === "blood") return openChecks(nav, page);
  if (page === "todays-results") return { ...nav, view: "results" };
  return { ...nav, view: page };
}

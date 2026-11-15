// Take the Tour: the guided walkthrough for judges. The whole step list is in TOUR_STEPS, so the text is easy to edit.
// A step names where to go (astronaut or Flight Surgeon, tab, inner tab) and which area to outline (`target`, matched by a
// data-tour attribute in the page). The tour only moves around the app. It never reads or writes the astronaut's stored data.

import type { ChecksTab, View } from "./nav";

export type TourWho = "A" | "D" | "surgeon";
export type TourSurgeonTab = "crew" | "detail" | "emergency";

export type TourStep = {
  id: string;
  title: string;
  text: string;
  who: TourWho;
  // Astronaut view: the main tab, and the inner tab where one applies.
  view?: View;
  checks?: ChecksTab;
  results?: ChecksTab;
  history?: ChecksTab;
  // Flight Surgeon view: the main tab.
  surgeonTab?: TourSurgeonTab;
  // The data-tour value of the area to outline. Null for a card with nothing to outline.
  target: string | null;
};

export const TOUR_REPO_URL = "https://github.com/jchang-888/hemoscope-app";
export const TOUR_START_LABEL = "Take the Tour (for Judges)";
export const TOUR_START_NOTE = "A 2-minute guided walkthrough of HemoScope.";
export const TOUR_FINAL_TEXT = "Models trained on Microsoft Azure Machine Learning, run offline on the spacecraft.";

export const TOUR_STEPS: TourStep[] = [
  {
    id: "dashboard", who: "A", view: "dashboard", target: "dashboard-status",
    title: "Dashboard",
    text: "One status for the whole day, built from this astronaut's own preflight normal instead of a population average.",
  },
  {
    id: "daily-check", who: "A", view: "checks", checks: "daily", target: "daily-form",
    title: "Daily Check",
    text: "Vital signs are scored with NEWS2, adjusted for spaceflight, so a normal in-flight reading is not flagged by mistake.",
  },
  {
    id: "blood-check", who: "A", view: "checks", checks: "blood", target: "blood-form",
    title: "Blood Check",
    text: "Enter white cells and the cell counts. Each value is compared with this astronaut's own preflight baseline.",
  },
  {
    id: "todays-results", who: "A", view: "results", results: "blood", target: "results",
    title: "Today's Results",
    text: "After a Blood Check this page shows the status, the Immune Deviation Score and a Why list that names each marker behind the status.",
  },
  {
    id: "day-46", who: "D", view: "history", history: "blood", target: "blood-day-46",
    title: "Astronaut D, Day 46",
    text: "Neutrophils rise on day 46. The Forecast column reads \"Not what we expected\" because the value fell outside the forecast range.",
  },
  {
    id: "forecast", who: "D", view: "history", history: "blood", target: "forecast-card",
    title: "Next Blood Check Forecast",
    text: "For each marker, the value expected at the next blood check and its 95% range, from this astronaut's own history. The same card is in Today's Results and summarized on the Dashboard.",
  },
  {
    id: "state-map", who: "D", view: "history", history: "blood", target: "state-map",
    title: "Immune State Map",
    text: "The mission path for Astronaut D moves toward the neutrophil side of the map as the neutrophils rise.",
  },
  {
    id: "learn", who: "A", view: "learn", target: "learn",
    title: "Learn",
    text: "Short lessons that work offline, written for someone who is not a doctor.",
  },
  {
    id: "ask", who: "A", view: "learn", target: "ask",
    title: "Ask HemoScope",
    text: "Search the lessons and the app's pages by typing a question. It runs on the device, with no connection.",
  },
  {
    id: "emergency", who: "A", view: "emergency", target: "emergency",
    title: "Emergency Mode",
    text: "Step by step guides for treating someone in microgravity, with a CPR pacer that keeps the compression rhythm.",
  },
  {
    id: "surgeon", who: "surgeon", surgeonTab: "crew", target: "crew",
    title: "Flight Surgeon",
    text: "The crew overview ranks every astronaut by status, most urgent first, with the top reason for each.",
  },
  {
    id: "azure", who: "A", view: "dashboard", target: null,
    title: "Built on Azure",
    text: TOUR_FINAL_TEXT,
  },
];

export const lastStep = TOUR_STEPS.length - 1;
// Back and Next never leave the list.
export const nextStep = (i: number) => Math.min(i + 1, lastStep);
export const prevStep = (i: number) => Math.max(i - 1, 0);
export const stepLabel = (i: number) => `Step ${i + 1} of ${TOUR_STEPS.length}`;

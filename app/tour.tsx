"use client";

// Take the Tour: the guided walkthrough for judges. The step list and text are in lib/tour.ts. This file only draws the
// outline and the card. The page moves to the right tab for each step. Nothing here reads or writes the astronaut's stored data.

import { useEffect, useRef, useState } from "react";
import { TOUR_ML_DOC_URL, TOUR_REPO_URL, TOUR_START_LABEL, TOUR_START_NOTE, TOUR_STEPS, lastStep, nextStep, prevStep, stepLabel } from "../lib/tour";

type Box = { top: number; left: number; width: number; height: number };

const PAD = 6; // space between the outlined area and its outline
const SCROLL_GAP = 90; // the outlined area is scrolled to this far from the top of the window

// The highlighted button at the top of the start popup.
export function TourButton({ onClick }: { onClick: () => void }) {
  return (
    <div>
      <button type="button" className="btn btn-primary w-full !py-2.5 !text-base" onClick={onClick}>{TOUR_START_LABEL}</button>
      <p className="mt-1 text-sm text-muted">{TOUR_START_NOTE}</p>
    </div>
  );
}

export function Tour({ index, onIndex, onExit }: { index: number; onIndex: (i: number) => void; onExit: () => void }) {
  const step = TOUR_STEPS[index];
  const [box, setBox] = useState<Box | null>(null);
  const card = useRef<HTMLDivElement>(null);

  // Escape closes the tour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onExit(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  // (The page keys this component by step, so the outline starts empty for each step.)
  // The page switches tabs when the step changes, so the area may not exist yet. Look for it until it does, scroll it into
  // view once, then keep the outline in step with the layout (charts and fonts can move things after the first paint).
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
    if (!step.target) return;
    let scrolled = false;
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) return;
      let r = el.getBoundingClientRect();
      if (!scrolled) {
        scrolled = true;
        // A target inside a scrolling table (the day 46 row): centre it in the table first.
        const table = el.closest<HTMLElement>("[data-export-expand]");
        if (table) table.scrollTop += r.top - table.getBoundingClientRect().top - table.clientHeight / 2;
        r = el.getBoundingClientRect();
        window.scrollTo({ top: Math.max(0, window.scrollY + r.top - SCROLL_GAP), behavior: "instant" });
        r = el.getBoundingClientRect();
      }
      const next = { top: r.top + window.scrollY - PAD, left: r.left + window.scrollX - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
      setBox((prev) => (prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height ? prev : next));
    };
    find();
    const timer = window.setInterval(find, 150);
    window.addEventListener("resize", find);
    return () => { window.clearInterval(timer); window.removeEventListener("resize", find); };
  }, [step.target, step.id]);

  const last = index === lastStep;

  return (
    <>
      {box && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-[60] rounded-xl"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height, outline: "3px solid var(--accent)", outlineOffset: 0, boxShadow: "0 0 0 6px color-mix(in srgb, var(--accent) 25%, transparent)" }}
        />
      )}
      <div
        ref={card} tabIndex={-1} role="dialog" aria-label={`Tour, ${step.title}`}
        className="fixed inset-x-3 bottom-3 z-[70] rounded-2xl border border-accent bg-surface p-4 text-foreground shadow-xl outline-none sm:inset-x-auto sm:right-4 sm:w-96"
      >
        <p className="text-xs text-muted" aria-live="polite">{stepLabel(index)}</p>
        <h2 className="mt-0.5 font-heading text-lg font-bold">{step.title}</h2>
        <p className="mt-1 text-sm">{step.text}</p>
        {last && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a href={TOUR_REPO_URL} target="_blank" rel="noopener noreferrer" className="underline">GitHub repository</a>
            <a href={TOUR_ML_DOC_URL} target="_blank" rel="noopener noreferrer" className="underline">How the models work (MACHINE_LEARNING.md)</a>
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn" disabled={index === 0} onClick={() => onIndex(prevStep(index))}>Back</button>
          <button type="button" className="btn btn-primary" disabled={last} onClick={() => onIndex(nextStep(index))}>Next</button>
          <button type="button" className="btn ml-auto" onClick={onExit}>Exit</button>
        </div>
      </div>
    </>
  );
}

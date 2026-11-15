"use client";

// Take the Tour: the guided walkthrough for judges. The step list and text are in lib/tour.ts. This file only draws the
// outline and the card. The page moves to the right tab for each step. Nothing here reads or writes the astronaut's stored data.

import { useEffect, useRef, useState } from "react";
import { TOUR_REPO_URL, TOUR_START_LABEL, TOUR_START_NOTE, TOUR_STEPS, lastStep, nextStep, prevStep, stepLabel } from "../lib/tour";

type Box = { top: number; left: number; width: number; height: number };
// Where the card sits. "dock": fixed at the bottom of the window (always on phones). "side": beside the outlined area, next to it
// in the page, used on wide windows when there is room so the card never covers what it points at.
type Place = { mode: "dock"; left: boolean } | { mode: "side"; top: number; left: number };

const CARD_W = 480; // card width on wide windows
const WIDE = 640; // the window width where the card stops being full width
const EDGE = 16; // distance from the window edge, and between the card and the outlined area
const SPACER = 420; // empty space added under the page during the tour, so any area can be scrolled above the docked card

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
  const [place, setPlace] = useState<Place>({ mode: "dock", left: false });
  const card = useRef<HTMLDivElement>(null);

  // Escape closes the tour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onExit(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  // (The page keys this component by step, so the outline starts empty for each step.)
  // The page switches tabs when the step changes, so the area may not exist yet. Look for it until it does, scroll it into view,
  // then keep the outline and the card in step with it. The outline is measured again when the area or the page resizes (a
  // ResizeObserver), when the window resizes or scrolls, and when images and fonts finish loading, because those change heights.
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
    if (!step.target) return;
    const selector = `[data-tour="${step.target}"]`;
    let el: HTMLElement | null = null;
    let centred = false; // a row inside a scrolling table is centred in the table once
    let settling = true; // for the first moments the area is kept in place while the page finishes loading
    let userMoved = false; // ...unless the person scrolls
    const stop: (() => void)[] = [];

    // On a wide window the docked card can sit on the side the area does not reach. On phones it spans the window.
    const dockSide = (r: DOMRect) => {
      const wide = window.innerWidth >= WIDE;
      const hits = (from: number, to: number) => r.right + PAD > from && r.left - PAD < to;
      const hitsRight = !wide || hits(window.innerWidth - EDGE - CARD_W, window.innerWidth);
      const hitsLeft = !wide || hits(0, EDGE + CARD_W);
      return { left: wide && hitsRight && !hitsLeft, covers: wide ? hitsRight && hitsLeft : true };
    };

    // Scroll so the whole area sits above the docked card when it can, otherwise as high as the window allows.
    const align = (r: DOMRect) => {
      const cardH = card.current?.offsetHeight ?? 280;
      const room = window.innerHeight - cardH - EDGE * 2 - r.height;
      const gap = dockSide(r).covers ? Math.max(EDGE, Math.min(SCROLL_GAP, room)) : SCROLL_GAP;
      const top = Math.max(0, window.scrollY + r.top - gap);
      if (Math.abs(window.scrollY - top) > 1) window.scrollTo({ top, behavior: "instant" });
    };

    const ro = new ResizeObserver(() => measure());
    const watch = (target: HTMLElement) => {
      ro.disconnect();
      ro.observe(target);
      ro.observe(document.body); // content above the area growing or shrinking moves it
      target.addEventListener("load", measure, true); // images inside the area
      stop.push(() => target.removeEventListener("load", measure, true));
    };

    function measure() {
      if (!el || !el.isConnected) {
        el = document.querySelector<HTMLElement>(selector);
        if (!el) return;
        watch(el);
      }
      let r = el.getBoundingClientRect();
      if (!centred) {
        centred = true;
        const table = el.closest<HTMLElement>("[data-export-expand]");
        if (table) { table.scrollTop += r.top - table.getBoundingClientRect().top - table.clientHeight / 2; r = el.getBoundingClientRect(); }
      }
      if (settling && !userMoved) { align(r); r = el.getBoundingClientRect(); }

      // The outline hugs the area, plus PAD. Only a row inside a scrolling table is trimmed to the table's edges.
      let { top, bottom, left, right } = r;
      const scroller = el.closest<HTMLElement>("[data-export-expand]")?.getBoundingClientRect();
      if (scroller) { top = Math.max(top, scroller.top); bottom = Math.min(bottom, scroller.bottom); left = Math.max(left, scroller.left); right = Math.min(right, scroller.right); }
      const next = { top: top + window.scrollY - PAD, left: left + window.scrollX - PAD, width: right - left + PAD * 2, height: bottom - top + PAD * 2 };
      setBox((prev) => (prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height ? prev : next));

      // On a wide window, put the card beside the area when there is room on either side. Otherwise (and on phones) dock it at the
      // bottom, where the page has been scrolled so the area sits above it.
      let nextPlace: Place = { mode: "dock", left: dockSide(r).left };
      if (window.innerWidth >= WIDE) {
        const need = CARD_W + EDGE * 2;
        const cardTop = Math.max(window.scrollY + EDGE, next.top);
        if (window.innerWidth - (r.right + PAD) >= need) nextPlace = { mode: "side", top: cardTop, left: next.left + next.width + EDGE };
        else if (r.left - PAD >= need) nextPlace = { mode: "side", top: cardTop, left: next.left - EDGE - CARD_W };
      }
      setPlace((prev) => (prev.mode === "dock" && nextPlace.mode === "dock" ? (prev.left === nextPlace.left ? prev : nextPlace) : prev.mode === "side" && nextPlace.mode === "side" && prev.top === nextPlace.top && prev.left === nextPlace.left ? prev : nextPlace));
    }

    const moved = () => { userMoved = true; };
    for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"] as const) { window.addEventListener(ev, moved, { passive: true }); stop.push(() => window.removeEventListener(ev, moved)); }
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    void document.fonts?.ready.then(measure);
    document.fonts?.addEventListener?.("loadingdone", measure);
    const settle = window.setTimeout(() => { settling = false; }, 2000);
    const poll = window.setInterval(measure, 250); // finds the area after a tab switch, and catches it being replaced
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      document.fonts?.removeEventListener?.("loadingdone", measure);
      window.clearTimeout(settle);
      window.clearInterval(poll);
      stop.forEach((f) => f());
    };
  }, [step.target, step.id]);

  const last = index === lastStep;
  const pct = Math.round(((index + 1) / TOUR_STEPS.length) * 100);
  const where = place.mode === "side"
    ? "absolute w-[480px]"
    : `fixed inset-x-4 bottom-4 sm:inset-x-auto sm:w-[480px] ${place.left ? "sm:left-4" : "sm:right-4"}`;

  return (
    <>
      {box && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-[60] rounded-xl"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height, outline: "3px solid var(--accent)", outlineOffset: 0, boxShadow: "0 0 0 6px color-mix(in srgb, var(--accent) 25%, transparent)" }}
        />
      )}
      <div aria-hidden style={{ height: SPACER }} />
      <div
        ref={card} tabIndex={-1} role="dialog" aria-label={`Tour, ${step.title}`} data-tour-target={step.target ?? ""}
        className={`${where} z-[70] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-accent bg-surface p-6 text-foreground shadow-xl outline-none`}
        style={place.mode === "side" ? { top: place.top, left: place.left } : undefined}
      >
        <p className="text-sm font-semibold text-muted" aria-live="polite">{stepLabel(index)}</p>
        <div
          role="progressbar" aria-label="Tour progress" aria-valuemin={1} aria-valuemax={TOUR_STEPS.length} aria-valuenow={index + 1}
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <h2 className="mt-4 font-heading text-xl font-bold">{step.title}</h2>
        <p className="mt-2 text-base leading-relaxed">{step.text}</p>
        {last && (
          <p className="mt-3 flex flex-col gap-1 text-base leading-relaxed">
            <a href={TOUR_REPO_URL} target="_blank" rel="noopener noreferrer" className="underline">GitHub repository</a>
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className="btn !min-h-11 !px-5 !text-base" disabled={index === 0} onClick={() => onIndex(prevStep(index))}>Back</button>
          <button type="button" className="btn btn-primary !min-h-11 !px-6 !text-base" disabled={last} onClick={() => onIndex(nextStep(index))}>Next</button>
          <button type="button" className="btn !min-h-11 !px-5 !text-base ml-auto" onClick={onExit}>Exit</button>
        </div>
      </div>
    </>
  );
}

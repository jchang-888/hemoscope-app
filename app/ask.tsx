"use client";

// Ask HemoScope: the header form (a text box with a magnifying glass) and the chat-style side panel it opens.
// The search is in lib/search.ts and the open, close and clear rules are in lib/ask.ts. It runs in the browser on
// HemoScope's own content, so it needs no internet. The conversation is kept in memory for the visit only.

import { useEffect, useRef, useState } from "react";
import {
  ASK_START, ASK_SUGGESTIONS, afterGo, clearConversation, closePanel, pressEscape, pressGlass, submitQuestion, toggleAsk, type AskState,
} from "../lib/ask";
import { MAX_RESULTS, NO_RESULTS, SEARCH_FOOTER, type Answer, type Hit, type SearchTarget } from "../lib/search";
import { AlertIcon } from "./ui";

const EMERGENCY_BUTTON = "Open Emergency Mode";
const WIDE = "(min-width: 1024px)"; // the panel sits beside the page from this width, and covers it below

const visible = (el: HTMLElement | null) => !!el && el.offsetParent !== null;
const byId = (id: string) => document.getElementById(id);
const HEADER_INPUT = "ask-header-input";
const HEADER_GLASS = "ask-header-glass"; // the lone magnifying glass on narrow screens
const PANEL_INPUT = "ask-panel-input";

function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export type Ask = ReturnType<typeof useAsk>;

// All of the search state: the panel, the conversation, and where the focus goes.
export function useAsk(onGo: (t: SearchTarget) => void) {
  const [state, setState] = useState<AskState>(ASK_START);
  const wasOpen = useRef(false);

  // Focus moves into the panel when it opens and back to the header when it closes.
  useEffect(() => {
    if (state.open) byId(PANEL_INPUT)?.focus();
    else if (wasOpen.current) (visible(byId(HEADER_INPUT)) ? byId(HEADER_INPUT) : byId(HEADER_GLASS))?.focus();
    wasOpen.current = state.open;
  }, [state.open]);

  // "/" focuses the header input (or opens the panel when the input is hidden on a narrow screen). Escape closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setState(pressEscape); return; }
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      if (visible(byId(HEADER_INPUT))) byId(HEADER_INPUT)?.focus();
      else setState((s) => submitQuestion(s, ""));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return {
    open: state.open, history: state.history,
    glassPress: (text: string) => setState((s) => pressGlass(s, text)),
    ask: (text: string) => setState((s) => submitQuestion(s, text)),
    close: () => setState(closePanel),
    toggle: () => setState(toggleAsk),
    clear: () => setState(clearConversation),
    go: (t: SearchTarget) => { onGo(t); setState((s) => afterGo(s, window.matchMedia(WIDE).matches)); },
  };
}

// The header form: a text box with a magnifying glass at its right end. Enter or the glass asks the question. With an empty
// box the glass only opens the panel. The box is cleared after it submits. Below 640px only the glass shows.
export function AskForm({ ask }: { ask: Ask }) {
  const [q, setQ] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    ask.glassPress(q);
    setQ("");
  };
  return (
    <>
      <form role="search" onSubmit={submit} className="relative hidden sm:block">
        <input
          id={HEADER_INPUT} type="text" aria-label="Ask HemoScope" placeholder="Ask HemoScope..." autoComplete="off"
          aria-controls="ask-panel" className="input !w-72 !pr-11 font-sans" value={q} onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" aria-label="Ask HemoScope: send the question, or open the panel when the box is empty" className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-foreground hover:bg-accent/25">
          <SearchIcon size={18} />
        </button>
      </form>
      <button
        id={HEADER_GLASS} type="button" className="btn !p-2 sm:hidden" aria-label="Open Ask HemoScope" aria-controls="ask-panel" aria-expanded={ask.open}
        onClick={() => ask.glassPress("")}
      >
        <SearchIcon size={20} />
      </button>
    </>
  );
}

function Snippet({ hit }: { hit: Hit }) {
  return (
    <p className="mt-1 text-sm">
      {hit.snippet.map((s, i) => (s.hit ? <mark key={i} className="rounded bg-accent/30 px-0.5 text-foreground">{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </p>
  );
}

function AnswerBubble({ a, onGo }: { a: Answer; onGo: (t: SearchTarget) => void }) {
  const empty = a.pages.length === 0 && a.results.length === 0;
  return (
    <div className="max-w-[92%] space-y-3 rounded-2xl rounded-tl-sm border border-border bg-background p-3">
      {a.emergency && (
        <button
          type="button" onClick={() => onGo({ kind: "page", page: "emergency" })}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emergency px-4 py-2.5 text-sm font-bold text-on-emergency hover:brightness-110"
        >
          <AlertIcon />{EMERGENCY_BUTTON}
        </button>
      )}
      {a.pages.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">Go to</span>
          {a.pages.map((p) => (
            <button key={p.id} type="button" className="btn !px-2.5 !py-1 !text-sm" onClick={() => onGo(p.target)}>{p.title}</button>
          ))}
        </div>
      )}
      {a.results.slice(0, MAX_RESULTS).map((r) => (
        <article key={r.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-base font-bold">{r.title}</h3>
            <span className="chip rounded-lg border border-border px-2 py-0.5 text-xs">{r.section}</span>
          </div>
          <Snippet hit={r} />
          <button type="button" className="btn mt-2 !px-2.5 !py-1 !text-sm" onClick={() => onGo(r.target)}>Go to Section</button>
        </article>
      ))}
      {empty && <p className="text-sm">{NO_RESULTS}</p>}
    </div>
  );
}

// The side panel. From 1024px wide it slides in from the right, below the nav bar, and the page narrows to make room (the
// page adds right padding while it is open). Below that it covers the page. It stays mounted so the slide can animate.
export function AskPanel({ ask }: { ask: Ask }) {
  const [q, setQ] = useState("");
  const [top, setTop] = useState(0);
  const body = useRef<HTMLDivElement>(null);

  // The panel starts at the bottom edge of the nav bar, or at the top of the window once the nav bar has scrolled away.
  useEffect(() => {
    const place = () => setTop(Math.max(0, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0));
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place); window.removeEventListener("resize", place); };
  }, [ask.open]);

  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight; }, [ask.open, ask.history]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    ask.ask(q);
    setQ("");
  };

  return (
    <aside
      id="ask-panel" aria-label="Ask HemoScope" inert={!ask.open} style={{ "--ask-top": `${top}px` } as React.CSSProperties}
      className={`fixed inset-0 z-50 flex flex-col border-accent bg-surface text-foreground shadow-xl lg:inset-auto lg:bottom-0 lg:right-0 lg:top-[var(--ask-top)] lg:z-30 lg:w-[400px] lg:border-l ${ask.open ? "visible translate-x-0 [transition:transform_200ms_ease-out]" : "invisible translate-x-full [transition:transform_200ms_ease-out,visibility_0s_linear_200ms]"}`}
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <h2 className="font-heading text-lg font-bold">Ask HemoScope</h2>
        <span className="ml-auto" />
        {ask.history.length > 0 && (
          <button type="button" className="text-sm font-semibold text-accent-text underline" onClick={ask.clear}>Clear</button>
        )}
        <button type="button" className="btn !p-1.5" aria-label="Close Ask HemoScope" onClick={ask.close}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div ref={body} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {ask.history.length === 0 && (
          <div className="space-y-3 text-sm">
            <p className="text-muted">Ask about a measurement, a status or an emergency. Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {ASK_SUGGESTIONS.map((x) => (
                <button key={x} type="button" className="btn !px-3 !py-1.5 !text-sm" onClick={() => ask.ask(x)}>{x}</button>
              ))}
            </div>
          </div>
        )}
        {ask.history.map((a, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-3 py-2 text-sm font-semibold text-white">{a.query}</p>
            </div>
            <AnswerBubble a={a} onGo={ask.go} />
          </div>
        ))}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
        <input
          id={PANEL_INPUT} type="text" aria-label="Ask a follow-up question" placeholder="Ask a follow-up question..." autoComplete="off"
          className="input font-sans" value={q} onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn btn-primary shrink-0 !p-2.5" aria-label="Send question">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
        </button>
      </form>
      <p className="border-t border-border px-4 py-2 text-xs text-muted">{SEARCH_FOOTER}</p>
    </aside>
  );
}

// The tab on the right edge of the screen, vertically centered: a half circle with a chevron. It opens the panel. While the
// panel is open it sits on the panel's left edge, points the other way and closes the panel. Hidden below 640px, where the
// search icon in the header does the same job. From 640px to 1023px the panel covers the page, so the tab sits at the left edge.
export function AskTab({ ask }: { ask: Ask }) {
  const label = ask.open ? "Close Ask HemoScope" : "Open Ask HemoScope";
  const pos = ask.open
    ? "left-0 rounded-r-[28px] lg:left-auto lg:right-[400px] lg:rounded-l-[28px] lg:rounded-r-none"
    : "right-0 rounded-l-[28px]";
  // Closed: the chevron points left, into the page. Open: it points right, the way the panel slides back out.
  const chevron = ask.open ? "M10 7l5 5-5 5" : "M14 7l-5 5 5 5";
  return (
    <button
      id="ask-tab" type="button" aria-label={label} title={label} aria-expanded={ask.open} aria-controls="ask-panel" onClick={ask.toggle}
      className={`fixed top-1/2 z-[60] hidden h-14 w-7 -translate-y-1/2 items-center justify-center bg-accent text-white shadow-lg transition-[right] duration-200 ease-out hover:bg-accent-hover sm:flex ${pos}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={chevron} />
      </svg>
    </button>
  );
}

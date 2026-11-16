"use client";

// Shared pieces for the HemoScope interface: icons, modal, tabs, info tooltip, status text,
// form field, trend chart and the "Why" list. No app logic here, only presentation.

import Image from "next/image";
import Link from "next/link";
import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CONFIG, type Band, type FieldInfo } from "../lib/config";
import {
  BLOOD_SECTION, BLOOD_SOURCES, CPR_LEARN_SOURCE, CPR_SECTION, CPR_TEXT, CREW_ASK, CURRENT_PHASE_LABEL, DAILY_SECTION,
  DAILY_SOURCES, IMMUNE_SECTION, IMMUNE_TIP, LEARN_ANCHOR, LEARN_IMAGES, LEARN_MARKERS, LEARN_GROUPS, LEARN_MEASUREMENTS,
  LEARN_SOURCES, MAP_GROUPS, MAP_HINT, MAP_SECTION, MAP_SPOTS, NEWS2_SECTION, NEWS2_SOURCES, NEWS2_TEXT, NEWS2_TIP, NLR_SECTION,
  NUMBERS_SECTION, NUMBERS_TEXT, NUMBER_MARKERS, OPEN_EMERGENCY, PACER_BPM, PACER_REMINDER, PACER_SOURCE, REFERENCE_SECTION,
  EMERGENCY_DISCLAIMER, LEARN_DISCLAIMER, SCENARIOS, SOURCES_PAGE_URL, SOURCES_SECTION, STATE_MAP_SECTION, STATUS_MEANINGS, STATUS_ORDER, STATUS_SECTION, STATUS_SOURCE, TIMELINE_SECTION, TIMELINE_STOPS,
  type Disclaimer, type EmergencyStep, type LearnImage, type Scenario, type Source,
} from "../lib/content";
import { downloadPng, downloadTable, type Table } from "../lib/export";
import { MAP_ZONE_TEXT, forecastSeries, type MapZone } from "../lib/ml";
import {
  MARKER_NAMES, STATUS_TEXT, phaseOf, type BloodResult, type DailyResult, type FieldCheck, type Mark, type Reason, type StatusId,
} from "../lib/engine";

// ---------------------------------------------------------------------------
// Icons and status text
// ---------------------------------------------------------------------------

type IconKind = "check" | "warn" | "x" | "retry" | "alert";

function Icon({ kind, size = 18 }: { kind: IconKind; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 18 18", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (kind === "check") return <svg {...p}><circle cx="9" cy="9" r="7.5" /><path d="M5.5 9.3l2.4 2.4 4.6-5" /></svg>;
  if (kind === "warn") return <svg {...p}><path d="M9 2L16.5 15.5h-15z" /><path d="M9 7v4M9 13.2v.1" /></svg>;
  if (kind === "x") return <svg {...p}><circle cx="9" cy="9" r="7.5" /><path d="M6 6l6 6M12 6l-6 6" /></svg>;
  if (kind === "alert") return <svg {...p}><path d="M6 1.8h6l4.2 4.2v6L12 16.2H6L1.8 12V6z" /><path d="M9 5.5v4.5M9 12.3v.1" /></svg>;
  return <svg {...p}><path d="M14.5 9a5.5 5.5 0 1 1-1.8-4.1" /><path d="M14.5 2.5v3h-3" /></svg>;
}

// Alert icon used on the Emergency Mode tab.
export function AlertIcon({ size = 18 }: { size?: number }) {
  return <Icon kind="alert" size={size} />;
}

const STATUS_LOOK: Record<StatusId, { cls: string; icon: IconKind }> = {
  normal: { cls: "text-ok", icon: "check" },
  monitor: { cls: "text-caution", icon: "warn" },
  surgeon: { cls: "text-alert", icon: "warn" },
  surgeonNow: { cls: "text-danger", icon: "x" },
  retake: { cls: "text-retest", icon: "retry" },
};

// Status as coloured text with its icon. The words are always shown, so it never relies on the palette alone.
export function StatusText({ status, big }: { status: StatusId; big?: boolean }) {
  const look = STATUS_LOOK[status];
  return (
    <span className={`chip inline-flex items-center gap-1.5 rounded-lg bg-background px-2.5 py-1 font-semibold ${look.cls} ${big ? "font-heading text-xl" : "text-sm"}`}>
      <Icon kind={look.icon} size={big ? 24 : 18} />
      {STATUS_TEXT[status].label}
    </span>
  );
}

const MARK_LOOK: Record<Mark, { cls: string; icon: IconKind; name: string }> = {
  ok: { cls: "text-ok", icon: "check", name: "In range" },
  warn: { cls: "text-caution", icon: "warn", name: "Outside range" },
  high: { cls: "text-alert", icon: "warn", name: "Outside range, repeated or higher score" },
  bad: { cls: "text-danger", icon: "x", name: "Danger limit or error" },
};

// Mark next to one value: green check, yellow or orange warning, red X.
export function MarkIcon({ mark }: { mark: Mark }) {
  const look = MARK_LOOK[mark];
  return (
    <span className={`inline-flex shrink-0 ${look.cls}`} role="img" aria-label={look.name}>
      <Icon kind={look.icon} />
    </span>
  );
}

// Result of "Check for Measurement Errors" for one field. A red X offers Measure Again, which retakes that one measurement.
export function CheckLine({ check, onMeasureAgain }: { check: FieldCheck; onMeasureAgain?: () => void }) {
  const mark: Mark = check.level === "ok" ? "ok" : check.level === "warn" ? "warn" : "bad";
  const cls = MARK_LOOK[mark].cls;
  return (
    <p className={`chip mt-1 flex items-start gap-1.5 rounded-md bg-background px-2 py-1 text-xs font-semibold ${cls}`}>
      <MarkIcon mark={mark} />
      <span>
        {check.headline}
        {check.detail && <span className="block font-normal">{check.detail}</span>}
        {check.level === "error" && onMeasureAgain && (
          <button type="button" className="btn mt-1.5 !px-2 !py-1 !text-xs" onClick={onMeasureAgain}>
            Measure Again
          </button>
        )}
      </span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Theme toggle and export menu
// ---------------------------------------------------------------------------

// The theme lives on <html data-theme>. app/layout.tsx sets it before the first paint from this saved choice. Light is the default.
const THEME_KEY = "hemoscope-theme";
type Theme = "dark" | "light";
const themeListeners = new Set<() => void>();
const readTheme = (): Theme => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
const subscribeTheme = (l: () => void) => {
  themeListeners.add(l);
  return () => void themeListeners.delete(l);
};

function setTheme(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Storage blocked: the choice applies until the page is closed.
  }
  themeListeners.forEach((l) => l());
}

// Sun icon in dark mode (press to go light), moon icon in light mode (press to go dark).
export function ThemeToggle({ compact }: { compact?: boolean } = {}) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const size = compact ? 14 : 20;
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  return (
    <button type="button" className={compact ? "strip-ctl strip-ctl-icon" : "btn !p-2"} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`} onClick={() => setTheme(next)}>
      {theme === "dark" ? (
        <svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card and mood picker, shared by the main page and the Mind page
// ---------------------------------------------------------------------------

// `highlight` is the accent blue block with white bold text, used only for the essential dashboard blocks.
// `exportMenu` puts an Export menu at the right of the title. Its PNG is a picture of the whole card.
export function Card({ title, tip, children, className = "", highlight, exportMenu, exportName, tour }: {
  tour?: string; // data-tour value, so the guided tour can outline this card
  title?: string; tip?: ReactNode; children: ReactNode; className?: string; highlight?: boolean; exportMenu?: ReactNode;
  exportName?: string; // marks the card as a chart for "Export All Charts"
}) {
  return (
    <section data-export data-export-name={exportName} data-tour={tour} className={`rounded-2xl border p-4 sm:p-5 ${highlight ? "highlight border-transparent sm:p-6" : "border-border bg-surface"} ${className}`}>
      {title && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className={`font-heading flex flex-wrap items-center gap-x-2 font-bold ${highlight ? "text-2xl sm:text-3xl" : "text-lg"}`}>
            {title}
            {tip}
          </h2>
          {exportMenu}
        </div>
      )}
      {children}
    </section>
  );
}

const FACES = [
  "M9 22 Q16 14 23 22", "M9 21 Q16 17 23 21", "M9 20 L23 20", "M9 19 Q16 24 23 19", "M8 18 Q16 28 24 18",
];

export function MoodPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const Y = "var(--mood)";
  return (
    <div role="radiogroup" aria-label="Mood" className="flex gap-2">
      {FACES.map((mouth, i) => {
        const v = String(i + 1);
        const on = value === v;
        // Selected face: filled yellow with dark features. Others: yellow outline only.
        const ink = on ? "var(--background)" : Y;
        return (
          <button
            key={v} type="button" role="radio" aria-checked={on} aria-label={`Mood ${v} of 5`}
            onClick={() => onChange(on ? "" : v)}
            className="rounded-full p-0.5 hover:bg-accent/15"
          >
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <circle cx="16" cy="16" r="13" fill={on ? Y : "none"} stroke={Y} />
              <circle cx="11.5" cy="12.5" r="1" fill={ink} />
              <circle cx="20.5" cy="12.5" r="1" fill={ink} />
              <path d={mouth} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

// A small mood face for the journal list: the same faces as the Daily Check mood picker, drawn as a filled yellow circle.
export function MoodFace({ value, size = 24 }: { value: number; size?: number }) {
  const mouth = FACES[Math.min(Math.max(value, 1), 5) - 1];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="var(--background)" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="16" cy="16" r="13" fill="var(--mood)" stroke="var(--mood)" />
      <circle cx="11.5" cy="12.5" r="1" fill="var(--background)" />
      <circle cx="20.5" cy="12.5" r="1" fill="var(--background)" />
      <path d={mouth} />
    </svg>
  );
}

// Export menu for a table (PNG, CSV, JSON) or a chart (PNG only, when no table is given).
// The PNG is a picture of the nearest ancestor marked data-export, in the current theme.
export function ExportMenu({ astronaut, name, table }: { astronaut: string; name: string; table?: Table }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const png = async () => {
    const node = box.current?.closest<HTMLElement>("[data-export]");
    setOpen(false);
    if (!node) return;
    setBusy(true);
    setFailed(false);
    try {
      await downloadPng(node, astronaut, name);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const small = "btn !px-2 !py-1 !text-xs";
  return (
    <span ref={box} data-export-ignore="" className="relative inline-block text-sm font-normal" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      {table ? (
        <button type="button" className={small} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={busy}>
          {busy ? "Exporting" : "Export"}
        </button>
      ) : (
        <button type="button" className={small} onClick={png} disabled={busy}>{busy ? "Exporting" : "Export as PNG"}</button>
      )}
      {failed && <span role="status" className="ml-2 text-xs text-danger">Export failed. Try again.</span>}
      {table && open && (
        <span role="menu" aria-label="Export" className="absolute right-0 top-full z-20 mt-1 flex w-40 flex-col rounded-lg border border-border bg-surface p-1 text-left shadow-lg">
          {([
            ["Export as PNG", png],
            ["Export as CSV", () => { setOpen(false); downloadTable(table, "csv", astronaut, name); }],
            ["Export as JSON", () => { setOpen(false); downloadTable(table, "json", astronaut, name); }],
          ] as const).map(([label, run]) => (
            <button key={label} type="button" role="menuitem" className="rounded-md px-2 py-1.5 text-left text-xs font-semibold text-foreground hover:bg-accent/15" onClick={run}>
              {label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

// "Export All Charts": downloads every chart inside the nearest [data-export-all] container as its own PNG.
// A chart is any element marked data-export-name.
export function ExportAllButton({ astronaut }: { astronaut: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const run = async () => {
    const root = ref.current?.closest<HTMLElement>("[data-export-all]");
    if (!root) return;
    const charts = [...root.querySelectorAll<HTMLElement>("[data-export-name]")];
    setFailed(false);
    try {
      for (let i = 0; i < charts.length; i++) {
        setProgress(`Exporting ${i + 1} of ${charts.length}`);
        await downloadPng(charts[i], astronaut, charts[i].dataset.exportName ?? "chart");
        await new Promise((r) => setTimeout(r, 350)); // a short pause so the browser accepts every download
      }
    } catch {
      setFailed(true);
    } finally {
      setProgress(null);
    }
  };
  return (
    <span ref={ref} className="inline-flex items-center gap-2">
      <button type="button" className="btn" onClick={run} disabled={progress !== null}>{progress ?? "Export All Charts"}</button>
      {failed && <span role="status" className="text-xs text-danger">Export failed. Try again.</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

// Top of every page, in two parts. The thin Demo strip is for judges (View As, light or dark). It is not part of
// the app. Under it is the app's own nav bar: the logo, then `nav` (the tabs), then `search` on the right.
export function SiteHeader({ demo, nav, search }: { demo?: ReactNode; nav?: ReactNode; search?: ReactNode }) {
  return (
    <header className="relative z-40">
      <div className="strip border-b border-dashed border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-[10px]">
          <span className="inline-flex h-6 items-center rounded border border-border px-2 font-sans text-xs font-medium uppercase tracking-[0.05em] text-muted">Demo</span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {demo}
            <ThemeToggle compact />
          </div>
        </div>
      </div>
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2">
          <Link href="/" className="order-1 font-heading text-3xl font-bold text-foreground" aria-label="HemoScope home">
            Hemo<span className="text-accent-text">Scope</span>
          </Link>
          {nav && <div className="order-3 w-full sm:order-2 sm:w-auto">{nav}</div>}
          {search && <div className="order-2 ml-auto sm:order-3">{search}</div>}
        </div>
      </div>
    </header>
  );
}

// The page container used by the demo tabs, so every tab has the same width, margins and padding.
export function PageMain({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto max-w-6xl px-4 py-5 ${className}`.trim()}>{children}</main>;
}

// ---------------------------------------------------------------------------
// Modal and tabs
// ---------------------------------------------------------------------------

export function Modal({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4" style={{ background: "var(--overlay)" }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className="w-full max-w-lg rounded-2xl border border-accent bg-surface p-6 text-foreground shadow-xl">
        <h2 id={id} className="font-heading text-2xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export type TabDef = { id: string; label: string; emergency?: boolean };

export function Tabs({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="flex items-end gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={
            t.emergency
              ? `ml-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-4 bg-emergency px-4 py-2 text-sm font-bold text-on-emergency hover:brightness-110 ${active === t.id ? "border-on-emergency" : "border-transparent"}`
              : `whitespace-nowrap rounded-t-lg border-b-4 px-3 py-2 text-sm ${active === t.id ? "border-accent bg-surface font-bold text-foreground" : "border-transparent font-semibold text-muted hover:bg-accent/15 hover:text-foreground"}`
          }
        >
          {t.emergency && <AlertIcon />}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// The app's main tabs, inside the nav bar. Emergency Mode keeps its red style and alert icon and sits apart from the other tabs.
export function NavTabs({ tabs, active, onChange, label }: { tabs: TabDef[]; active: string; onChange: (id: string) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap items-center gap-1">
      {tabs.map((t) => (
        <button
          key={t.id} role="tab" aria-selected={active === t.id} onClick={() => onChange(t.id)}
          className={
            t.emergency
              ? `ml-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border-2 bg-emergency px-2 py-1.5 text-sm font-bold text-on-emergency hover:brightness-110 sm:ml-5 sm:px-3 ${active === t.id ? "border-on-emergency" : "border-transparent"}`
              : `whitespace-nowrap rounded-lg border-b-4 px-1.5 py-1.5 text-sm sm:px-3 ${active === t.id ? "border-accent font-bold text-foreground" : "border-transparent font-semibold text-muted hover:bg-accent/15 hover:text-foreground"}`
          }
        >
          {t.emergency && <AlertIcon />}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info tooltip and form field
// ---------------------------------------------------------------------------

// Learn More links. The astronaut view provides a function that switches to the Learn tab and scrolls to an id.
// The flight surgeon view provides none, so its popups have no Learn More button.
const LearnContext = createContext<((id: string) => void) | null>(null);
export const LearnProvider = LearnContext.Provider;

// Question mark button. Shows on hover or keyboard focus, and toggles on tap for touch screens.
export function Tip({ label, learn, children }: { label: string; learn?: string; children: ReactNode }) {
  const goLearn = useContext(LearnContext);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  return (
    <span ref={box} className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="tip-btn inline-flex h-[1.15em] w-[1.15em] items-center justify-center rounded-full border border-muted text-[0.75em] font-bold leading-none text-muted hover:bg-accent/15"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-0 top-full z-30 block w-72 max-w-[80vw] pt-1">
          <span id={id} role="tooltip" className="popup block rounded-lg border border-border bg-surface p-3 text-left leading-snug shadow-lg">
            {children}
            {learn && goLearn && (
              <button type="button" className="btn mt-2 !px-2 !py-1 !text-xs" onClick={() => { setOpen(false); goLearn(learn); }}>
                Learn More
              </button>
            )}
          </span>
        </span>
      )}
    </span>
  );
}

// Popup for a measurement or blood marker. `fieldKey` picks the Learn More destination.
export function InfoTip({ info, fieldKey }: { info: FieldInfo; fieldKey: string }) {
  return (
    <Tip label={`About ${info.label}`} learn={LEARN_ANCHOR[fieldKey]}>
      <span className="block"><b>What it is:</b> {info.what}</span>
      <span className="mt-1 block"><b>How to measure:</b> {info.how}</span>
      <span className="mt-1 block"><b>Why it matters in space:</b> {info.space}</span>
      <span className="mt-1 block"><b>Typical range:</b> {info.typical}</span>
    </Tip>
  );
}

export function News2Tip() {
  return <Tip label="About NEWS2" learn={LEARN_ANCHOR.news2}>{NEWS2_TIP}</Tip>;
}

export function ImmuneTip() {
  return <Tip label="About the Immune Deviation Score" learn={LEARN_ANCHOR.immune}>{IMMUNE_TIP}</Tip>;
}

export function FormField({
  id, fieldKey, label, info, hint, check, note, onMeasureAgain, children,
}: {
  id: string; fieldKey: string; label: string; info: FieldInfo; hint?: string; check?: FieldCheck; note?: string;
  onMeasureAgain?: () => void; children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-sm">
        <label htmlFor={id} className="font-semibold">
          {label} {info.unit && <span className="font-normal text-muted">({info.unit})</span>}
        </label>
        <span className="ml-1.5 inline-block align-middle"><InfoTip info={info} fieldKey={fieldKey} /></span>
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {note && <p className="mt-1 text-xs font-semibold text-ok">{note}</p>}
      {check && <CheckLine check={check} onMeasureAgain={onMeasureAgain} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Why" list
// ---------------------------------------------------------------------------

// Each line shows what was found with the actual numbers. Sources are listed once at the bottom.
export function WhyList({ reasons }: { reasons: Reason[] }) {
  const sources = Array.from(new Set(reasons.map((r) => r.source).filter((s): s is string => !!s)));
  return (
    <div>
      <ul className="space-y-1.5 text-sm">
        {reasons.map((r, i) => (
          <li key={i} className="flex items-start gap-2">
            <MarkIcon mark={r.mark} />
            <span>
              {r.text}
              {r.source && <sup className="ml-0.5 text-muted">{sources.indexOf(r.source) + 1}</sup>}
            </span>
          </li>
        ))}
      </ul>
      {sources.length > 0 && (
        <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-xs text-muted">
          {sources.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend chart (plain SVG)
// ---------------------------------------------------------------------------

export type Pt = { x: number; y: number };
export type BandPt = { x: number; lo: number; hi: number };
export type ForecastPt = { x: number; y: number; lo: number; hi: number };
export type RefLine = { y: number; label?: string; dashed?: boolean };

const W = 320;
const H = 150;
const M = { l: 38, r: 16, t: 10, b: 24 };

// Turns one band value per day into a stepped outline: flat across each day with square steps between days.
export function stepBand(band: BandPt[]): BandPt[] {
  return band.flatMap((b) => [{ ...b, x: b.x - 0.5 }, { ...b, x: b.x + 0.5 }]);
}

// Chart colors come from the theme variables in globals.css, so every chart follows the light or dark mode.
export const CHART = {
  line: "var(--chart-line)", flag: "var(--chart-flag)", threshold: "var(--chart-threshold)", thresholdText: "var(--chart-threshold-text)", text: "var(--text-muted)",
  grid: "var(--chart-grid)", band: "var(--chart-band)", bandEdge: "var(--chart-band-edge)",
  today: "var(--chart-today)", label: "var(--text)", forecast: "var(--accent)", forecastText: "var(--accent-text)",
};
const MONO = "var(--font-jetbrains-mono)";

// The band limits that apply at x. A stepped band holds one flat pair of entries per day, so the last entry at or
// before x belongs to that day. Returns null when the chart has no band or x is before it starts.
function bandAt(band: BandPt[] | undefined, x: number): BandPt | null {
  if (!band) return null;
  let hit: BandPt | null = null;
  for (const b of band) if (b.x <= x) hit = b;
  return hit;
}

// One chart: shaded band, optional reference lines, a line, points, and a highlighted point for today.
// Points outside the band are drawn red. yMin and yMax are the smallest range to show. The data can widen it,
// so no value is ever drawn outside.
export function TrendChart({
  title, unit, xMin, xMax, line, band, bandFits = true, refLines, today, dots, xTicks, yMin, yMax, note, tip, astronaut, exportName, forecast, hollowUntil,
}: {
  hollowUntil?: number; // points at or before this x are drawn hollow (used to tell preflight points from in-flight points)
  forecast?: ForecastPt | null; // next-check forecast: a dashed point with its 95% band, labeled "Forecast for next check"
  title: string; unit?: string; xMin: number; xMax: number; line: Pt[]; band?: BandPt[]; bandFits?: boolean;
  refLines?: RefLine[]; today?: Pt | null; dots?: boolean; xTicks?: number[]; yMin?: number; yMax?: number; note?: string; tip?: ReactNode;
  astronaut: string; exportName?: string; // every chart has an "Export as PNG" button; the file name uses the title unless exportName is given
}) {
  const ys = [
    ...line.map((p) => p.y), ...(today ? [today.y] : []), ...(refLines?.map((r) => r.y) ?? []),
    ...(bandFits ? (band?.flatMap((b) => [b.lo, b.hi]) ?? []) : []),
    ...(forecast ? [forecast.lo, forecast.hi] : []),
  ].filter(Number.isFinite);
  let lo = Math.min(yMin ?? Infinity, ...ys);
  let hi = Math.max(yMax ?? -Infinity, ...ys);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; } // flat data still gets a readable axis
  const pad = (hi - lo) * 0.06;
  if (yMin === undefined || lo < yMin) lo -= pad;
  if (yMax === undefined || hi > yMax) hi += pad;
  const sx = (x: number) => M.l + ((Math.min(Math.max(x, xMin), xMax) - xMin) / (xMax - xMin)) * (W - M.l - M.r);
  const sy = (y: number) => H - M.b - ((Math.min(Math.max(y, lo), hi) - lo) / (hi - lo)) * (H - M.t - M.b);
  const ticks = xTicks ?? [xMin, Math.round((xMin + xMax) / 2), xMax];
  const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2).replace(/\.?0+$/, ""));
  const bandPath = band && band.length
    ? `M${band.map((b) => `${sx(b.x)},${sy(b.hi)}`).join("L")}L${[...band].reverse().map((b) => `${sx(b.x)},${sy(b.lo)}`).join("L")}Z`
    : "";
  const isFlagged = (p: Pt) => { const b = bandAt(band, p.x); return !!b && (p.y < b.lo - 1e-9 || p.y > b.hi + 1e-9); };
  const showDots = dots || line.length <= 20;
  const todayFlagged = today ? isFlagged(today) : false;
  const label = { fontSize: 9, fill: CHART.text, fontFamily: MONO };
  const mid = (lo + hi) / 2;
  return (
    <figure data-export data-export-name={exportName ?? title} className="rounded-xl border border-border bg-surface p-3">
      <figcaption className="mb-1 flex flex-wrap items-center gap-x-1.5 text-sm font-semibold">
        <span>{title}</span> {unit && <span className="font-normal text-muted">({unit})</span>}
        {tip}
        <span className="ml-auto"><ExportMenu astronaut={astronaut} name={exportName ?? title} /></span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title} chart, ${line.length} points${today ? ", including today" : ""}${forecast ? ", with a forecast for the next check" : ""}`}>
        {bandPath && <path d={bandPath} fill={CHART.band} stroke={CHART.bandEdge} strokeWidth="0.75" />}
        {[lo, mid, hi].map((g) => <line key={g} x1={M.l} x2={W - M.r} y1={sy(g)} y2={sy(g)} stroke={CHART.grid} />)}
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke={CHART.text} strokeOpacity="0.6" />
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke={CHART.text} strokeOpacity="0.6" />
        <text x={M.l - 4} y={M.t + 4} textAnchor="end" {...label}>{fmt(hi)}</text>
        <text x={M.l - 4} y={H - M.b} textAnchor="end" {...label}>{fmt(lo)}</text>
        {ticks.map((t) => <text key={t} x={sx(t)} y={H - 8} textAnchor="middle" {...label}>{t}</text>)}
        {refLines?.map((r) => (
          <g key={r.y}>
            <line x1={M.l} x2={W - M.r} y1={sy(r.y)} y2={sy(r.y)} stroke={CHART.threshold} strokeWidth="1.2" strokeDasharray="4 3" />
            {r.label && <text x={W - M.r + 2} y={sy(r.y) + 3} fontSize="9" fill={CHART.thresholdText} fontFamily={MONO}>{r.label}</text>}
          </g>
        ))}
        {line.length > 1 && <polyline points={line.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")} fill="none" stroke={CHART.line} strokeWidth="2" strokeLinejoin="round" />}
        {line.map((p) => {
          const flagged = isFlagged(p);
          const hollow = hollowUntil !== undefined && p.x <= hollowUntil;
          return (showDots || flagged) ? (
            <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={showDots ? 4 : 3} fill={hollow ? "var(--surface)" : flagged ? CHART.flag : CHART.line} stroke={hollow ? CHART.line : "none"} strokeWidth="1.5" />
          ) : null;
        })}
        {forecast && (
          <g>
            {line.length > 0 && (
              <line x1={sx(line[line.length - 1].x)} y1={sy(line[line.length - 1].y)} x2={sx(forecast.x)} y2={sy(forecast.y)} stroke={CHART.forecast} strokeWidth="1.5" strokeDasharray="3 3" />
            )}
            <rect x={sx(forecast.x) - 6} y={sy(forecast.hi)} width="12" height={Math.max(sy(forecast.lo) - sy(forecast.hi), 2)} rx="3" fill={CHART.forecast} fillOpacity="0.25" stroke={CHART.forecast} strokeOpacity="0.6" strokeDasharray="2 2" />
            <circle cx={sx(forecast.x)} cy={sy(forecast.y)} r="4" fill="none" stroke={CHART.forecast} strokeWidth="2" strokeDasharray="2 2" />
            <text x={sx(forecast.x) + 8} y={sy(forecast.hi) - 3} textAnchor="end" fontSize="9" fontWeight="700" fill={CHART.forecastText} fontFamily={MONO}>Forecast for next check</text>
          </g>
        )}
        {today && (
          <g>
            <circle cx={sx(today.x)} cy={sy(today.y)} r="5" fill={CHART.today} stroke={todayFlagged ? CHART.flag : CHART.line} strokeWidth="2" />
            <text x={sx(today.x)} y={sy(today.y) - 9} textAnchor="middle" fontSize="9" fontWeight="700" fill={CHART.label}>Today</text>
          </g>
        )}
        {line.length === 0 && !today && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="11" fill={CHART.text}>No data</text>
        )}
      </svg>
      {note && <p className="text-xs text-muted">{note}</p>}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Immune Deviation Score timeline (plain SVG)
// ---------------------------------------------------------------------------

export type ScorePoint = { day: number; score: number };
export const dayName = (d: number) => (d <= 0 ? `L${d}` : `FD${d}`);

const SW = 360;
const SH = 220;
const SM = { l: 32, r: 30, t: 26, b: 26 };
const S_X0 = -92;
const S_X1 = 60;

// Scores on blood check days, a line through them, the typical range (0 to the Unusual line) and the preflight and
// in-flight bands. The highlighted day is Today once a Blood Check is submitted, otherwise the latest check.
export function ScoreTimeline({ points, highlightDay, highlightLabel }: {
  points: ScorePoint[]; highlightDay: number | null; highlightLabel: "Today" | "Latest";
}) {
  const [active, setActive] = useState<number | null>(null);
  const thr = CONFIG.immune.unusualFrom;
  const sorted = [...points].sort((a, b) => a.day - b.day);
  const sx = (x: number) => SM.l + ((x - S_X0) / (S_X1 - S_X0)) * (SW - SM.l - SM.r);
  const sy = (y: number) => SH - SM.b - (y / 100) * (SH - SM.t - SM.b);
  const hi = sorted.find((p) => p.day === highlightDay);
  const tipPoint = active !== null ? sorted[active] : null;
  const tipX = tipPoint ? Math.min(Math.max(sx(tipPoint.day), SM.l + 48), SW - SM.r - 48) : 0;
  return (
    <div>
      {hi && (
        <p className="font-mono text-sm">
          {dayName(hi.day)} ({hi.day <= 0 ? "Preflight" : "In flight"}, {highlightLabel === "Today" ? "today" : "latest"}): score {hi.score}
        </p>
      )}
      <svg viewBox={`0 0 ${SW} ${SH}`} className="mt-2 w-full" role="img" aria-label={`Immune Deviation Score on ${sorted.length} blood check days`}>
        <rect x={sx(0)} y={SM.t} width={sx(S_X1) - sx(0)} height={SH - SM.t - SM.b} fill="var(--chart-flight)" />
        <text x={(sx(S_X0) + sx(0)) / 2} y={SM.t - 8} textAnchor="middle" fontSize="9" fill={CHART.text}>Preflight</text>
        <text x={sx(0) + 6} y={SM.t - 8} fontSize="9" fill={CHART.text}>In flight</text>
        <rect x={SM.l} y={sy(thr)} width={SW - SM.l - SM.r} height={sy(0) - sy(thr)} fill={CHART.band} stroke={CHART.bandEdge} strokeWidth="0.75" />
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={SM.l} x2={SW - SM.r} y1={sy(g)} y2={sy(g)} stroke={CHART.grid} />
            <text x={SM.l - 4} y={sy(g) + 3} textAnchor="end" fontSize="9" fill={CHART.text} fontFamily={MONO}>{g}</text>
          </g>
        ))}
        <line x1={sx(0)} x2={sx(0)} y1={SM.t} y2={SH - SM.b} stroke={CHART.text} strokeOpacity="0.5" strokeDasharray="2 3" />
        <line x1={SM.l} x2={SW - SM.r} y1={sy(thr)} y2={sy(thr)} stroke={CHART.threshold} strokeWidth="1.2" strokeDasharray="5 3" />
        <text x={SM.l + 4} y={sy(thr) + 11} fontSize="9" fontWeight="700" fill={CHART.thresholdText}>Unusual {thr}</text>
        <text x={SM.l + 4} y={sy(0) - 5} fontSize="9" fill={CHART.text}>Typical range for this astronaut</text>
        {[-90, -60, -30, 0, 30, 60].map((t) => (
          <text key={t} x={sx(t)} y={SH - 10} textAnchor="middle" fontSize="9" fill={CHART.text} fontFamily={MONO}>{t}</text>
        ))}
        {sorted.length > 1 && <polyline points={sorted.map((p) => `${sx(p.day)},${sy(p.score)}`).join(" ")} fill="none" stroke={CHART.line} strokeWidth="2" strokeLinejoin="round" />}
        {sorted.map((p) => <circle key={p.day} cx={sx(p.day)} cy={sy(p.score)} r="4" fill={p.score >= thr ? CHART.flag : CHART.line} />)}
        {hi && (
          <g>
            <circle cx={sx(hi.day)} cy={sy(hi.score)} r="5.5" fill={CHART.today} stroke={hi.score >= thr ? CHART.flag : CHART.line} strokeWidth="2" />
            <text x={sx(hi.day)} y={sy(hi.score) - 11} textAnchor="middle" fontSize="10" fontWeight="700" fill={CHART.label}>{highlightLabel}</text>
          </g>
        )}
        {sorted.map((p, i) => (
          <circle
            key={`hit-${p.day}`} cx={sx(p.day)} cy={sy(p.score)} r="9" fill="transparent" tabIndex={0} role="img"
            aria-label={`${dayName(p.day)}, score ${p.score}`} className="cursor-pointer"
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)} onBlur={() => setActive(null)}
            onClick={() => setActive(active === i ? null : i)}
          />
        ))}
        {tipPoint && (
          <g pointerEvents="none">
            <rect x={tipX - 46} y={Math.max(sy(tipPoint.score) - 38, 2)} width="92" height="20" rx="4" fill="var(--surface)" stroke={CHART.text} strokeOpacity="0.8" />
            <text x={tipX} y={Math.max(sy(tipPoint.score) - 38, 2) + 14} textAnchor="middle" fontSize="10" fill={CHART.label} fontFamily={MONO}>
              {dayName(tipPoint.day)}: {tipPoint.score} / 100
            </text>
          </g>
        )}
      </svg>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-5" style={{ background: CHART.line }} aria-hidden />Score line</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-5 border" style={{ background: CHART.band, borderColor: CHART.bandEdge }} aria-hidden />Typical range</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: CHART.line, background: CHART.today }} aria-hidden />Today&apos;s reading</span>
      </p>
      <p className="mt-1 text-xs text-muted">L-n: days before launch. FD: flight day. Hover or tap a point to see exact values.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Learn tab (astronaut view)
// ---------------------------------------------------------------------------

const fmtBand = (b: Band) => (b.lo === null ? `${b.hi} or less` : b.hi === null ? `${b.lo} or more` : `${b.lo} to ${b.hi}`);
const bandsFor = (bands: Band[], points: number) => bands.filter((b) => b.points === points).map(fmtBand).join(", ");

const NEWS2_ROWS: { label: string; bands: Band[] }[] = [
  { label: "Breathing rate (per min)", bands: CONFIG.news2.respiration },
  { label: "Oxygen saturation (%)", bands: CONFIG.news2.oxygenSaturation },
  { label: "Systolic blood pressure (mmHg)", bands: CONFIG.news2.systolicBp },
  { label: "Heart rate (bpm)", bands: CONFIG.news2.heartRate },
  { label: "Temperature (°C)", bands: CONFIG.news2.temperature },
];

function Sources({ items }: { items: (string | Source)[] }) {
  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold">Sources</h4>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">
        {items.map((x) => {
          const src = typeof x === "string" ? { text: x } : x;
          return <li key={src.text}>{src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer" className="underline">{src.text}</a> : src.text}</li>;
        })}
      </ul>
    </div>
  );
}

// Picture with its credit. The width is capped so no picture is taller than 20 rem, and the width and height give the
// browser the shape of the picture before it loads, so the page does not jump.
const FIGURE_MAX_HEIGHT = 320;
function LearnFigure({ img, className = "" }: { img: LearnImage; className?: string }) {
  const maxWidth = Math.round((FIGURE_MAX_HEIGHT * img.width) / img.height);
  return (
    <figure className={className}>
      <Image
        src={encodeURI(`/learn/${img.file}`)} alt={img.alt} width={img.width} height={img.height}
        sizes={`(max-width: ${maxWidth}px) 100vw, ${maxWidth}px`} style={{ maxWidth }} className="mx-auto h-auto w-full rounded-xl"
      />
      <figcaption className="mt-1 text-xs text-muted">Image: NASA</figcaption>
    </figure>
  );
}

function LearnSection({ id, title, open, onToggle, children }: {
  id: string; title: string; open: boolean; onToggle: (open: boolean) => void; children: ReactNode;
}) {
  const img = LEARN_IMAGES[id];
  return (
    <details id={id} open={open} onToggle={(e) => onToggle(e.currentTarget.open)} className="scroll-mt-4 rounded-2xl border border-border bg-learn">
      <summary className="learn-summary flex cursor-pointer items-center gap-3 rounded-2xl p-4 font-heading text-xl font-bold sm:p-5">
        <svg className="chevron shrink-0 transition-transform" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6.5 3.5L12 9l-5.5 5.5" />
        </svg>
        {title}
      </summary>
      <div className="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">
        {img && <LearnFigure img={img} />}
        {children}
      </div>
    </details>
  );
}

function Sub({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <article id={id} className="scroll-mt-4 rounded-xl border border-border p-3 text-sm">
      <h3 className="font-heading text-base font-bold">{title}</h3>
      <div className="mt-1 space-y-1">{children}</div>
    </article>
  );
}

// Body Map: a simple body outline with a dot for each organ system. Hover, tap or focus a dot to open its card.
function BodyMap({ active, setActive }: { active: string | null; setActive: (id: string | null) => void }) {
  const spot = MAP_SPOTS.find((x) => x.id === active);
  const img = spot ? LEARN_IMAGES[`map-${spot.id}`] : undefined;
  return (
    <div className="grid gap-5 md:grid-cols-[18rem_1fr]" onKeyDown={(e) => { if (e.key === "Escape") setActive(null); }}>
      <div>
        <div className="relative mx-auto aspect-[200/460] w-full max-w-[18rem]">
          <svg viewBox="0 0 200 460" className="absolute inset-0 h-full w-full" fill="none" stroke="var(--text-muted)" strokeWidth="2" aria-hidden>
            <circle cx="100" cy="44" r="36" />
            <path d="M88 80v16M112 80v16" />
            <rect x="54" y="96" width="92" height="156" rx="22" />
            <rect x="22" y="104" width="30" height="150" rx="15" />
            <rect x="148" y="104" width="30" height="150" rx="15" />
            <rect x="56" y="244" width="40" height="200" rx="18" />
            <rect x="104" y="244" width="40" height="200" rx="18" />
          </svg>
          {MAP_SPOTS.map((x) => (
            <button
              key={x.id} type="button" aria-label={`${x.title}, ${MAP_GROUPS[x.group]}`} aria-pressed={active === x.id}
              className={`hotspot ${x.group === "tracked" ? "bg-accent text-accent-text" : "bg-muted text-muted"}`}
              style={{ left: `${(x.x / 200) * 100}%`, top: `${(x.y / 460) * 100}%` }}
              onMouseEnter={() => setActive(x.id)} onFocus={() => setActive(x.id)} onClick={() => setActive(x.id)}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs font-semibold" aria-label="Legend">
          <li className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-foreground bg-accent" aria-hidden />{MAP_GROUPS.tracked}</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-foreground bg-muted" aria-hidden />{MAP_GROUPS.effect}</li>
        </ul>
      </div>
      <div id={spot ? `map-${spot.id}` : undefined} aria-live="polite" className="scroll-mt-4 rounded-xl border border-border p-4 text-sm md:self-start">
        {spot ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-lg font-bold">{spot.title}</h3>
              <span className="chip rounded-lg border border-border px-2 py-0.5 text-xs font-semibold">{MAP_GROUPS[spot.group]}</span>
            </div>
            <p className="mt-2">{spot.text}</p>
            <p className="mt-2"><b>What HemoScope tracks:</b> {spot.tracks}</p>
            {img && <LearnFigure img={img} className="mt-3" />}
            <SourceNote source={spot.source} />
          </>
        ) : <p className="text-muted">{MAP_HINT}</p>}
      </div>
    </div>
  );
}

// Mission Timeline: scrolls sideways on wide screens and stacks on narrow ones. The current phase is highlighted.
function Timeline() {
  const current = phaseOf(CONFIG.mission.today);
  return (
    <div role="region" aria-label="Mission timeline" tabIndex={0} className="rounded-xl">
      <ol className="flex flex-col gap-3 sm:flex-row sm:overflow-x-auto sm:pb-2">
        {TIMELINE_STOPS.map((stop) => {
          const now = stop.phase === current;
          const img = LEARN_IMAGES[`timeline-${stop.id}`];
          return (
            <li
              key={stop.id} id={`timeline-${stop.id}`} aria-current={now ? "step" : undefined}
              className={`scroll-mt-4 rounded-xl p-3 text-sm sm:w-72 sm:shrink-0 ${now ? "border-2 border-accent" : "border border-border"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-heading text-base font-bold">{stop.title}</h3>
                {now && <span className="rounded-lg bg-accent px-2 py-0.5 text-xs font-semibold text-white">{CURRENT_PHASE_LABEL}</span>}
              </div>
              <p className="font-mono text-xs text-muted">{stop.days}</p>
              {img && <LearnFigure img={img} className="mt-2" />}
              <p className="mt-2 font-semibold">What changes</p>
              <ul className="list-disc space-y-0.5 pl-5">{stop.changes.map((c) => <li key={c}>{c}</li>)}</ul>
              <p className="mt-2"><b>What HemoScope does:</b> {stop.does}</p>
              {stop.source && <SourceNote source={stop.source} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const fmtNum = (n: number) => String(Number(n.toFixed(2)));
const FLAG_TEXT = { in: "In range", above: "Above range", below: "Below range" } as const;

// Numbers Explained: the latest Blood Check marker by marker, then the latest NEWS2 total and Immune Deviation Score.
// Without `onOpen` (the flight surgeon view) the Learn More buttons are left out. The sentences about results do not use
// "you", so the same text works for the astronaut and for the flight surgeon.
export function NumbersExplained({ blood, daily, onOpen }: { blood: BloodResult[]; daily: DailyResult[]; onOpen?: (id: string) => void }) {
  const latestBlood = [...blood].reverse().find((b) => b.day > 0 && b.markers.length > 0);
  const latestDaily = [...daily].reverse().find((d) => d.parts.length > 0);
  const forecasts = forecastSeries(blood.filter((b) => b.kind !== "retake").map((b) => b.sample), CONFIG.mission.today + NUMBERS_TEXT.forecastDays).next;
  const more = (id: string) => onOpen && (
    <button type="button" className="btn mt-2 !px-2 !py-1 !text-xs" onClick={() => onOpen(id)}>{NUMBERS_TEXT.learnMore}</button>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm">{NUMBERS_TEXT.intro}</p>
      {!latestBlood ? <p className="text-sm text-muted">{NUMBERS_TEXT.noBlood}</p> : (
        <>
          <p className="font-mono text-xs text-muted">Latest Blood Check, mission day {latestBlood.day}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {latestBlood.markers.map((m) => {
              const info = NUMBER_MARKERS[m.marker];
              const learn = LEARN_MARKERS.find((x) => x.id === info.id);
              const unit = m.marker === "NLR" ? "ratio" : "x10³ per µL";
              const meaning = m.flag === "in" ? NUMBERS_TEXT.inRange
                : m.marker === "NLR" ? (m.flag === "above" ? NUMBERS_TEXT.nlrAbove : NUMBERS_TEXT.nlrBelow)
                : (m.flag === "above" ? learn?.rise : learn?.drop) ?? "";
              return (
                <li key={m.marker} className="rounded-xl border border-border p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-x-2 font-semibold">
                    {MARKER_NAMES[m.marker]}<MarkIcon mark={m.mark} /><span>{FLAG_TEXT[m.flag]}</span>
                  </p>
                  <p className="mt-1 font-mono text-xs">{fmtNum(m.value)} {unit}. {NUMBERS_TEXT.rangeLabel}: {fmtNum(m.lo)} to {fmtNum(m.hi)}.</p>
                  <p className="mt-1 text-muted">{info.short}</p>
                  <p className="mt-1">{meaning}</p>
                  {forecasts.find((f) => f.marker === m.marker) && (() => {
                    const f = forecasts.find((x) => x.marker === m.marker) as (typeof forecasts)[number];
                    return <p className="mt-1 font-mono text-xs text-accent-text">{NUMBERS_TEXT.forecast(fmtNum(f.lo), fmtNum(f.hi), unit)}</p>;
                  })()}
                  {more(info.id)}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-3 text-sm">
          <p className="font-semibold">NEWS2</p>
          {latestDaily ? (
            <>
              <p className="mt-1 flex flex-wrap items-center gap-2"><StatusText status={latestDaily.status} /></p>
              <p className="mt-1">{NUMBERS_TEXT.news2(latestDaily.total, STATUS_TEXT[latestDaily.status].label)}</p>
            </>
          ) : <p className="mt-1 text-muted">{NUMBERS_TEXT.noDaily}</p>}
          {more(NEWS2_SECTION.id)}
        </div>
        <div className="rounded-xl border border-border p-3 text-sm">
          <p className="font-semibold">Immune Deviation Score</p>
          {latestBlood?.immune ? (
            <p className="mt-1">{NUMBERS_TEXT.immune(latestBlood.immune.score, CONFIG.immune.unusualFrom, latestBlood.immune.unusual)}</p>
          ) : <p className="mt-1 text-muted">{NUMBERS_TEXT.noBlood}</p>}
          {more(IMMUNE_SECTION.id)}
        </div>
      </div>
    </div>
  );
}

function StatusCards({ onEmergency }: { onEmergency?: () => void }) {
  return (
    <>
    <ul className="grid gap-3 sm:grid-cols-2">
      {STATUS_ORDER.map((id) => (
        <li key={id} id={`status-${id}`} className="scroll-mt-4 rounded-xl border border-border p-4 text-sm">
          <StatusText status={id} />
          <p className="mt-2">{STATUS_MEANINGS[id]}</p>
          {id === "surgeonNow" && onEmergency && (
            <button type="button" className="btn mt-3" onClick={onEmergency}>{OPEN_EMERGENCY}</button>
          )}
        </li>
      ))}
    </ul>
    <SourceNote source={STATUS_SOURCE} />
    </>
  );
}

// Ids of the sections that open and close.
const LEARN_DETAIL_IDS = [
  MAP_SECTION, TIMELINE_SECTION, NUMBERS_SECTION, STATUS_SECTION, CPR_SECTION, DAILY_SECTION, NEWS2_SECTION, BLOOD_SECTION,
  NLR_SECTION, IMMUNE_SECTION, STATE_MAP_SECTION, SOURCES_SECTION,
].map((x) => x.id);

// The section that has to be open for an id to be visible, so a Learn More link can open the right one.
function sectionOf(anchor: string | null): string | null {
  if (!anchor) return null;
  if (LEARN_DETAIL_IDS.includes(anchor)) return anchor;
  if (LEARN_MEASUREMENTS.some((m) => m.id === anchor)) return DAILY_SECTION.id;
  if (LEARN_MARKERS.some((m) => m.id === anchor)) return BLOOD_SECTION.id;
  if (anchor.startsWith("map-")) return MAP_SECTION.id;
  if (anchor.startsWith("timeline-")) return TIMELINE_SECTION.id;
  if (anchor.startsWith("status-")) return STATUS_SECTION.id;
  return null;
}

// One dropdown of the Learn jump menu. Hover or click opens it, Escape closes it and returns focus to the button, and the
// entries are ordinary buttons, so Tab and Enter work. On narrow screens the button shows only its icon.
function JumpDropdown({ title, icon, items, onJump, alignRight }: {
  title: string; icon: ReactNode; items: { id: string; title: string }[]; onJump: (id: string) => void; alignRight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const close = () => { setOpen(false); setPinned(false); };
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) close(); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  return (
    <div
      ref={box} className="relative shrink-0"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => !pinned && setOpen(false)}
      onKeyDown={(e) => { if (e.key === "Escape") { close(); button.current?.focus(); } }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close(); }}
    >
      <button
        ref={button} type="button" className="btn flex items-center gap-1.5 whitespace-nowrap !px-2.5 !py-1 !text-sm sm:!px-3"
        aria-label={title} aria-expanded={open} aria-controls={listId}
        onClick={() => { if (pinned) close(); else { setOpen(true); setPinned(true); } }}
      >
        {icon}
        <span className="hidden sm:inline">{title}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 3.5L5 6.5L8 3.5" />
        </svg>
      </button>
      {open && (
        <div id={listId} className={`absolute top-full z-50 w-60 max-w-[80vw] rounded-lg border border-border bg-surface p-1 shadow-lg ${alignRight ? "right-0" : "left-0"}`}>
          <p className="px-3 py-1 text-xs font-semibold text-muted sm:hidden">{title}</p>
          <ul>
            {items.map((x) => (
              <li key={x.id}>
                <button type="button" className="block w-full rounded-md px-3 py-1.5 text-left text-sm font-semibold text-foreground hover:bg-accent/15" onClick={() => { close(); onJump(x.id); }}>
                  {x.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const JUMP_ICONS = {
  "learn-group-space": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-25 12 12)" />
    </svg>
  ),
  "learn-group-measurements": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12h4l3-7 4 14 3-7h4" />
    </svg>
  ),
} as const;

// A large heading that starts one half of the Learn tab.
function GroupHeading({ id, title }: { id: string; title: string }) {
  return <h2 id={id} className="scroll-mt-4 border-b-2 border-border pb-2 pt-4 font-heading text-3xl font-bold sm:text-4xl">{title}</h2>;
}

// All sections start closed. `anchor` is the id to open and scroll to when the tab opens from a Learn More button.
export function LearnView({ anchor, blood, daily, onEmergency, onSearch }: {
  anchor: string | null; blood: BloodResult[]; daily: DailyResult[]; onEmergency: () => void; onSearch?: (text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const sec = sectionOf(anchor);
    return sec ? { [sec]: true } : {};
  });
  const [target, setTarget] = useState<{ id: string } | null>(anchor ? { id: anchor } : null);
  const [mapSpot, setMapSpot] = useState<string | null>(anchor?.startsWith("map-") ? anchor.slice(4) : null);
  useEffect(() => {
    if (target) document.getElementById(target.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [target]);
  const allOpen = LEARN_DETAIL_IDS.every((id) => open[id]);
  const setAll = (value: boolean) => setOpen(Object.fromEntries(LEARN_DETAIL_IDS.map((id) => [id, value])));
  // Opens whatever holds the id, then scrolls to it once it is showing.
  const jump = (id: string) => {
    const sec = sectionOf(id);
    if (sec) setOpen((o) => ({ ...o, [sec]: true }));
    if (id.startsWith("map-")) setMapSpot(id.slice(4));
    setTarget({ id });
  };
  const section = (s: { id: string; title: string }, children: ReactNode) => (
    <LearnSection key={s.id} id={s.id} title={s.title} open={!!open[s.id]} onToggle={(v) => setOpen((o) => (o[s.id] === v ? o : { ...o, [s.id]: v }))}>
      {children}
    </LearnSection>
  );
  return (
    <div className="space-y-4">
      <div data-tour="learn" className="space-y-4">
      {onSearch && (
        <form
          role="search" className="relative"
          onSubmit={(e) => { e.preventDefault(); onSearch(query); setQuery(""); }}
        >
          <input
            type="text" aria-label="Search Learn and HemoScope's resources" placeholder="Search Learn and HemoScope's resources..." autoComplete="off"
            className="input !pr-12 font-sans" value={query} onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" aria-label="Search" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-foreground hover:bg-accent/25">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          </button>
        </form>
      )}
      <div className="flex flex-nowrap items-center gap-2">
        <nav aria-label="Jump to a Learn section" className="flex flex-nowrap items-center gap-2">
          {LEARN_GROUPS.map((g, i) => (
            <JumpDropdown key={g.id} title={g.title} icon={JUMP_ICONS[g.id]} items={[...g.sections]} onJump={jump} alignRight={i > 0} />
          ))}
        </nav>
        <button type="button" className="btn btn-primary ml-auto shrink-0 whitespace-nowrap !px-3 !py-1 !text-sm" onClick={() => setAll(!allOpen)}>{allOpen ? "Collapse All" : "Expand All"}</button>
      </div>

      <GroupHeading id={LEARN_GROUPS[0].id} title={LEARN_GROUPS[0].title} />
      </div>
      {section(MAP_SECTION, <BodyMap active={mapSpot} setActive={setMapSpot} />)}
      {section(TIMELINE_SECTION, <Timeline />)}
      {section(CPR_SECTION, <>
        {CPR_TEXT.map((t) => <p key={t} className="text-sm">{t}</p>)}
        <button type="button" className="btn btn-primary" onClick={onEmergency}>{OPEN_EMERGENCY}</button>
        <SourceNote source={CPR_LEARN_SOURCE} />
      </>)}

      <GroupHeading id={LEARN_GROUPS[1].id} title={LEARN_GROUPS[1].title} />
      {section(NUMBERS_SECTION, <NumbersExplained blood={blood} daily={daily} onOpen={jump} />)}
      {section(STATUS_SECTION, <StatusCards onEmergency={onEmergency} />)}

      <section id={REFERENCE_SECTION.id} aria-labelledby="learn-reference-title" className="scroll-mt-4 space-y-3 pt-2">
        <h2 id="learn-reference-title" className="font-heading text-xl font-bold">{REFERENCE_SECTION.title}</h2>
        <p className="text-sm text-muted">The Daily Check, NEWS2, Blood Check, NLR, Immune Deviation Score and Immune State Map sections. Each one opens on its own.</p>

        {section(DAILY_SECTION, <>
          {LEARN_MEASUREMENTS.map((m) => (
            <Sub key={m.id} id={m.id} title={m.title}>
              <p><b>What it is:</b> {m.what}</p>
              <p><b>How to measure it:</b> {m.how}</p>
              <p><b>Why it matters in space:</b> {m.why}</p>
              <p><b>Typical range:</b> {m.typical}</p>
              {m.note && <p className="text-muted">{m.note}</p>}
            </Sub>
          ))}
          <Sources items={DAILY_SOURCES} />
        </>)}

        {section(NEWS2_SECTION, <>
          <p className="text-sm">{NEWS2_TEXT.what}</p>
          <p className="text-sm">{NEWS2_TEXT.points}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr><th className="py-1 pr-3">Vital sign</th><th className="pr-3">0 points</th><th className="pr-3">1 point</th><th className="pr-3">2 points</th><th>3 points</th></tr>
              </thead>
              <tbody>
                {NEWS2_ROWS.map((r) => (
                  <tr key={r.label} className="border-t border-border align-top">
                    <td className="py-1.5 pr-3 font-semibold">{r.label}</td>
                    {[0, 1, 2, 3].map((p) => <td key={p} className="pr-3 font-mono">{bandsFor(r.bands, p) || "None"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="font-heading text-base font-bold">{NEWS2_TEXT.totalsTitle}</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {NEWS2_TEXT.totals.map((t) => <li key={t.when}><span className="font-mono">{t.when}</span>: {t.status}</li>)}
            </ul>
          </div>
          <div>
            <h3 className="font-heading text-base font-bold">{NEWS2_TEXT.adjustTitle}</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{NEWS2_TEXT.adjust.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
          <p className="text-xs text-muted">{NEWS2_TEXT.note}</p>
          <Sources items={NEWS2_SOURCES} />
        </>)}

        {section(BLOOD_SECTION, <>
          {LEARN_MARKERS.map((m) => (
            <Sub key={m.id} id={m.id} title={m.title}>
              <p><b>What it does:</b> {m.does}</p>
              <p><b>What a rise can mean:</b> {m.rise}</p>
              <p><b>What a drop can mean:</b> {m.drop}</p>
            </Sub>
          ))}
          <Sources items={BLOOD_SOURCES} />
        </>)}

        {section(NLR_SECTION, <p className="text-sm">{NLR_SECTION.text}</p>)}
        {section(IMMUNE_SECTION, <div className="space-y-1 text-sm">{IMMUNE_SECTION.paragraphs.map((t) => <p key={t}>{t}</p>)}</div>)}

        {section(STATE_MAP_SECTION, <div className="space-y-3 text-sm">
          <p>{STATE_MAP_SECTION.intro}</p>
          <ul className="space-y-1">
            {STATE_MAP_SECTION.axes.map((x) => <li key={x.title}><b>{x.title}:</b> {x.text}</li>)}
          </ul>
          <p>{STATE_MAP_SECTION.zonesIntro}</p>
          <ul className="list-disc space-y-1 pl-5">
            {(Object.keys(MAP_ZONE_TEXT) as MapZone[]).map((z) => <li key={z}><b>{z}:</b> {MAP_ZONE_TEXT[z]}</li>)}
          </ul>
          <p>{STATE_MAP_SECTION.direction}</p>
        </div>)}
      </section>

      {section(SOURCES_SECTION, (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {LEARN_SOURCES.map((x) => (
            <li key={x.text}>{x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer" className="underline">{x.text}</a> : x.text}</li>
          ))}
        </ul>
      ))}
      <DisclaimerNote note={LEARN_DISCLAIMER} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Emergency Mode
// ---------------------------------------------------------------------------

// The note at the very bottom of the Learn tab and of Emergency Mode (text in lib/content.ts).
function DisclaimerNote({ note, className = "" }: { note: Disclaimer; className?: string }) {
  return (
    <p data-disclaimer className={`rounded-xl border border-border px-3 py-2 text-xs text-muted ${className}`.trim()}>
      <b className="font-bold text-foreground">{note.label}</b> {note.text}{" "}
      <a href={SOURCES_PAGE_URL} target="_blank" rel="noopener noreferrer" className="underline">{note.link}</a>
    </p>
  );
}

function SourceNote({ source }: { source: Source }) {
  return (
    <p className="mt-4 text-xs text-muted">
      Source:{" "}
      {source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{source.text}</a> : source.text}
    </p>
  );
}

// Compression Pacer. Visual only, no sound. The state lives outside React so the pacer keeps running while a scenario
// is opened, the tab changes or the view changes. Only the pacer displays re-render on each beat.
type PacerState = { running: boolean; count: number; seconds: number };
let pacer: PacerState = { running: false, count: 0, seconds: 0 };
let pacerBase = 0; // milliseconds counted before the current run
let pacerStart = 0; // when the current run began
let beatTimer: ReturnType<typeof setInterval> | undefined;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const pacerListeners = new Set<() => void>();
const setPacer = (next: PacerState) => {
  pacer = next;
  pacerListeners.forEach((l) => l());
};
const stopTimers = () => {
  clearInterval(beatTimer);
  clearInterval(clockTimer);
};
const pacerControls = {
  start() {
    if (pacer.running) return;
    pacerStart = Date.now();
    beatTimer = setInterval(() => setPacer({ ...pacer, count: pacer.count + 1 }), 60000 / PACER_BPM);
    clockTimer = setInterval(() => {
      const seconds = Math.floor((pacerBase + Date.now() - pacerStart) / 1000);
      if (seconds !== pacer.seconds) setPacer({ ...pacer, seconds });
    }, 200);
    setPacer({ ...pacer, running: true });
  },
  stop() {
    if (!pacer.running) return;
    stopTimers();
    pacerBase += Date.now() - pacerStart;
    setPacer({ ...pacer, running: false, seconds: Math.floor(pacerBase / 1000) });
  },
  reset() {
    stopTimers();
    pacerBase = 0;
    setPacer({ running: false, count: 0, seconds: 0 });
  },
};
const subscribePacer = (l: () => void) => {
  pacerListeners.add(l);
  return () => void pacerListeners.delete(l);
};
const usePacer = () => useSyncExternalStore(subscribePacer, () => pacer, () => pacer);
const mmss = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

function PacerButtons({ running, small }: { running: boolean; small?: boolean }) {
  const size = small ? "!px-3 !py-1.5 !text-sm" : "";
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <button type="button" className={`btn btn-primary ${size}`} onClick={pacerControls.start} disabled={running}>Start</button>
      <button type="button" className={`btn ${size}`} onClick={pacerControls.stop} disabled={!running}>Stop</button>
      <button type="button" className={`btn ${size}`} onClick={pacerControls.reset}>Reset</button>
    </div>
  );
}

// `compact` is the slim bar shown at the top of each scenario step.
export function CompressionPacer({ compact }: { compact?: boolean }) {
  const p = usePacer();
  const pulse = p.running ? { animation: `pace ${60 / PACER_BPM}s ease-in-out infinite` } : undefined;
  if (compact) {
    return (
      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-background p-2" role="group" aria-label="Compression Pacer">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent" style={pulse} aria-hidden>
          <span className="font-mono text-xl font-bold text-white">{p.count}</span>
        </div>
        <div className="text-sm">
          <p className="font-semibold">Compression Pacer, {PACER_BPM} per minute</p>
          <p className="font-mono">{p.count} compressions, {mmss(p.seconds)}</p>
        </div>
        <div className="ml-auto"><PacerButtons running={p.running} small /></div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-emergency bg-surface p-5" role="group" aria-label="Compression Pacer">
      <h2 className="font-heading text-xl font-bold">Compression Pacer, {PACER_BPM} per Minute</h2>
      <div className="flex h-52 w-52 items-center justify-center rounded-full bg-accent sm:h-60 sm:w-60" style={pulse} aria-hidden>
        <span className="font-mono text-6xl font-bold text-white">{p.count}</span>
      </div>
      <p className="font-mono text-lg" aria-live="off">
        <span className="font-semibold">{p.count}</span> compressions <span className="text-muted">|</span> <span className="font-semibold">{mmss(p.seconds)}</span>
      </p>
      <PacerButtons running={p.running} />
      <p className="text-center text-sm font-semibold">{PACER_REMINDER}</p>
      <p className="text-center text-xs text-muted">
        Source:{" "}
        {PACER_SOURCE.map((src, i) => (
          <span key={src.text}>
            {i > 0 && "; "}
            {src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer" className="underline">{src.text}</a> : src.text}
          </span>
        ))}
        {" "}(https://pmc.ncbi.nlm.nih.gov/articles/PMC7607644)
      </p>
    </div>
  );
}

function StepCard({ scenario, step, onStep, onSwitch, onRestart, onHome }: {
  scenario: Scenario; step: number; onStep: (n: number) => void; onSwitch: (id: string) => void; onRestart: () => void; onHome: () => void;
}) {
  const st: EmergencyStep = scenario.steps[step];
  const last = scenario.steps.length - 1;
  return (
    <section>
      <CompressionPacer compact />
      <div className="rounded-2xl border-2 border-emergency bg-surface p-5 sm:p-8">
        <p className="text-sm font-semibold text-muted">{scenario.title}</p>
        <p className="mt-1 font-mono text-lg">Step {step + 1} of {scenario.steps.length}</p>
        <p className="mt-4 font-heading text-2xl font-bold leading-snug sm:text-3xl">{st.text}</p>
        {st.switchTo && (
          <button className="btn btn-primary mt-4 !text-base" onClick={() => onSwitch(st.switchTo!.id)}>{st.switchTo.label}</button>
        )}
        <SourceNote source={st.source} />
        <div className="mt-6 flex flex-wrap gap-2">
          <button className="btn !px-5 !py-3 !text-base" onClick={() => onStep(step - 1)} disabled={step === 0}>Back</button>
          <button className="btn btn-accent !px-5 !py-3 !text-base" onClick={() => onStep(step + 1)} disabled={step === last}>Next</button>
          <button className="btn !px-5 !py-3 !text-base" onClick={onRestart}>Restart</button>
          <button className="btn !px-5 !py-3 !text-base" onClick={onHome}>All Scenarios</button>
        </div>
      </div>
      <DisclaimerNote note={EMERGENCY_DISCLAIMER} className="mt-6" />
    </section>
  );
}

export function EmergencyAstronaut({ initial }: { initial?: string } = {}) {
  const [sid, setSid] = useState<string | null>(initial ?? null);
  const [step, setStep] = useState(0);
  const scenario = SCENARIOS.find((s) => s.id === sid);
  const open = (id: string) => { setSid(id); setStep(0); };
  if (!scenario) {
    return (
      <section className="space-y-6">
        <div>
          <h2 className="font-heading text-2xl font-bold">What Is Happening?</h2>
          <div data-tour="emergency" className="mt-4 grid gap-3 sm:grid-cols-2">
            {SCENARIOS.map((s) => (
              <button
                key={s.id} onClick={() => open(s.id)}
                className="flex min-h-28 items-center gap-3 rounded-2xl border-2 border-emergency bg-surface p-5 text-left font-heading text-xl font-bold hover:bg-accent/20"
              >
                <AlertIcon size={28} />
                {s.title}
              </button>
            ))}
          </div>
        </div>
        <CompressionPacer />
        <DisclaimerNote note={EMERGENCY_DISCLAIMER} />
      </section>
    );
  }
  return (
    <StepCard
      scenario={scenario} step={step} onStep={(n) => setStep(Math.min(Math.max(n, 0), scenario.steps.length - 1))}
      onSwitch={open} onRestart={() => setStep(0)} onHome={() => setSid(null)}
    />
  );
}

// Flight surgeon view: the same scenarios as plain lists, plus what to ask the crew.
export function EmergencySurgeon() {
  return (
    <section className="space-y-4">
      <h2 className="font-heading text-2xl font-bold">Guide the Crew</h2>
      <div className="rounded-2xl border-2 border-emergency bg-surface p-4">
        <h3 className="font-heading text-lg font-bold">Ask the Crew For</h3>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{CREW_ASK.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {SCENARIOS.map((s) => (
          <div key={s.id} className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="font-heading text-lg font-bold">{s.title}</h3>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
              {s.steps.map((st) => (
                <li key={st.text}>
                  {st.text}
                  <span className="block text-xs text-muted">Source: {st.source.text}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <CompressionPacer />
    </section>
  );
}

"use client";

// Real Crew Replay: the four Inspiration4 crew members' real blood checks (NASA OSDR OSD-569), run through the same engine as the
// demo astronauts. The user steps through Preflight, Landing and Recovery and sees the status, Immune Deviation Score, forecast
// check, Why list and Immune State Map path at each check. Data and engine calls are in lib/replay.ts.

import { useState } from "react";
import { FORECAST_AS_EXPECTED, FORECAST_NOT_EXPECTED } from "../lib/export";
import { REPLAY_CREW, REPLAY_INTRO, REPLAY_SOURCE, REPLAY_STAGES, getReplay, type ReplayCrew } from "../lib/replay";
import { ImmuneStateMap } from "./state-map";
import { Card, ImmuneBadge, ImmuneTip, ScoreNumber, StatusText, Tabs, WhyList } from "./ui";

const CREW_TABS = REPLAY_CREW.map((c) => ({ id: c, label: c }));

export function ReplayView() {
  const [crew, setCrew] = useState<ReplayCrew>("C001");
  const [index, setIndex] = useState(0); // kept when the crew member changes, so the same timepoint can be compared across people
  const run = getReplay(crew);
  const step = run.steps[index];
  const { result } = step;
  const last = run.steps.length - 1;
  const afterLaunch = step.row.day > 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold">Real Crew Replay</h1>
        <p className="mt-1 text-sm">{REPLAY_INTRO}</p>
        <p className="mt-1 text-xs text-muted">
          Data: <a href={REPLAY_SOURCE.url} target="_blank" rel="noopener noreferrer" className="underline">{REPLAY_SOURCE.text}</a>.
          Landing and Recovery checks are compared with each crew member&apos;s personal baseline, because HemoScope has no landing or recovery adjustment.
        </p>
      </div>

      <Tabs tabs={CREW_TABS} active={crew} onChange={(id) => setCrew(id as ReplayCrew)} />

      <nav aria-label={`${crew} timeline`} className="space-y-2">
        <div className="grid gap-3 sm:grid-cols-[3fr_1fr_3fr]">
          {REPLAY_STAGES.map((s) => (
            <div key={s.stage} className="rounded-xl border border-border bg-surface p-3">
              <h2 className="font-heading text-base font-bold">{s.stage}</h2>
              <p className="text-xs text-muted">{s.text}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {s.timepoints.map((tp) => {
                  const i = run.steps.findIndex((x) => x.timepoint === tp);
                  return (
                    <button
                      key={tp} type="button" className={`btn ${i === index ? "btn-primary" : ""}`}
                      aria-current={i === index ? "step" : undefined} onClick={() => setIndex(i)}
                    >
                      {tp}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous Check</button>
          <button type="button" className="btn" disabled={index === last} onClick={() => setIndex(index + 1)}>Next Check</button>
          <span className="text-sm text-muted" aria-live="polite">Check {index + 1} of {run.steps.length}</span>
        </div>
      </nav>

      <Card title={`${crew}, ${step.stage}: ${step.timepoint}`}>
        <StatusText status={result.status} big />
        <p className="mt-2 text-sm">{result.message}</p>
        <div className="mt-3 rounded-xl bg-accent/15 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">Immune Deviation Score <ImmuneTip /></p>
          {result.immune ? (
            <>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1"><ScoreNumber immune={result.immune} big /><ImmuneBadge immune={result.immune} /></p>
              <p className="mt-1 text-sm">More unusual than {result.immune.score}% of this crew member&apos;s normal readings.</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Not scored. This sample was marked for a retake.</p>
          )}
        </div>
        {result.forecast && (
          <p className="mt-3 text-sm">
            <span className="font-semibold">Forecast check:</span> {result.forecast.expected ? FORECAST_AS_EXPECTED : FORECAST_NOT_EXPECTED}
          </p>
        )}
        <h3 className="mt-4 text-sm font-semibold">Why</h3>
        <div className="mt-1"><WhyList reasons={result.reasons} /></div>
        <p className="mt-3 text-xs text-muted">Counts are x10³ per µL.</p>
      </Card>

      <Card title="Immune State Map">
        {afterLaunch && step.path.length > 0 ? (
          <ImmuneStateMap path={step.path} astronaut={crew} exportName={`immune-state-map-${crew}`} />
        ) : (
          <p className="text-sm text-muted">
            {afterLaunch ? "This check has no map point because its sample was marked for a retake." : "The map path starts with the first check after preflight. Step to Landing to see it."}
          </p>
        )}
      </Card>
    </div>
  );
}

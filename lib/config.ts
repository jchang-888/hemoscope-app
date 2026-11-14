// Every threshold, multiplier, range, limit and tooltip text used by the app lives in this one object.
// Each group has a "source" string. A group may also carry a "flag":
//   "provisional" = a best estimate, replace it when better data is available
//   "verify"      = copied from a published table, check it against the official one
// flaggedConfig() at the bottom lists all flagged groups so they are easy to review.

export type Flag = "provisional" | "verify";

// Markers the blood check understands. NLR = neutrophils / lymphocytes (calculated, never entered).
export type Marker = "WBC" | "NEU" | "LYM" | "MON" | "EOS" | "NLR";

export type Band = { lo: number | null; hi: number | null; points: number };

// Help text shown by the question mark icon on every form field.
export type FieldInfo = { label: string; unit: string; what: string; how: string; space: string; typical: string };

// Limits for "Check my data". red = likely error (blocks Submit), warn = double-check.
type Limit = { redLo: number; redHi: number; warnLo?: number; warnHi?: number };

export const CONFIG = {
  mission: {
    source: "Demo scenario chosen for this app",
    length: 180, // days
    today: 60, // mission day the judge is entering data for
    preflightDays: [-92, -44, -3], // Inspiration4 preflight blood checks (L-92, L-44, L-3)
    flightBloodDays: [4, 18, 32, 46, 60], // in-flight blood check every 14 days
  },

  // The four demo astronauts. Each is paired with one Inspiration4 crew member for preflight blood.
  astronauts: [
    { id: "A", crew: "C001" },
    { id: "B", crew: "C002" },
    { id: "C", crew: "C003" },
    { id: "D", crew: "C004" },
  ],

  blood: {
    source: "Blood check settings chosen for this demo",
    flag: "provisional" as Flag,
    zLimit: 1.96, // |z| above this means outside your usual range (about 95 percent of normal readings)
    longTermDays: 60, // 60 or more days after the last preflight reading uses the long-term variation
    minBaselineSamples: 2, // fewest usable preflight readings needed for a baseline
    watchMarker: "EOS" as Marker, // shown with the label below
    watchLabel: "watch marker, not validated",
    nlrNote: "NLR is not affected by blood concentration changes in microgravity.",
    sameDirectionNote: "Repeat within 24 hours at the same time of day.",
  },

  // Within-person variation: standard deviation of the natural log of repeat readings.
  variation: {
    source:
      "Pooled from ImmPort SDY180, SDY296, SDY1252 pre-event sample pairs (n = 106 to 117 people). Long term from SDY301 over 7 months (n = 17 to 22).",
    sd: {
      WBC: { short: 0.129, long: 0.17 },
      NEU: { short: 0.194, long: 0.273 },
      LYM: { short: 0.147, long: 0.151 },
      MON: { short: 0.233, long: 0.284 },
      EOS: { short: 0.261, long: 0.383 },
      NLR: { short: 0.241, long: 0.343 },
    } as Record<Marker, { short: number; long: number }>,
  },

  // Expected change in each marker during flight, as a multiplier on the personal baseline.
  spaceflight: {
    flag: "provisional" as Flag,
    source: "Spaceflight adjustment based on published crew averages",
    earlyFlightLastDay: 14, // early flight is days 1 to 14, long flight is day 15 and later
    phases: {
      preflight: {
        sdPhase: 0,
        multiplier: { WBC: 1, NEU: 1, LYM: 1, MON: 1, EOS: 1, NLR: 1 } as Record<Marker, number>,
        source: "No adjustment before launch.",
      },
      earlyFlight: {
        sdPhase: 0.1,
        multiplier: { WBC: 1.1, NEU: 1.15, LYM: 1, MON: 1, EOS: 1, NLR: 1.15 } as Record<Marker, number>,
        source: "Crucian et al. 2015, npj Microgravity.",
      },
      longFlight: {
        sdPhase: 0.12,
        multiplier: { WBC: 1.17, NEU: 1.25, LYM: 1, MON: 1, EOS: 1, NLR: 1.25 } as Record<Marker, number>,
        source:
          "Stratis et al. 2023, citing about 17 percent white cell rise, mainly neutrophils per Crucian 2015. The NEU value is estimated.",
      },
    },
  },

  // Hard limits that always matter, whatever the personal baseline is. Units: x10^3 per microliter.
  absoluteLimits: {
    flag: "verify" as Flag,
    source: "CTCAE v5 grading for low blood counts.",
    neutrophilsContactBelow: 1.0,
    lymphocytesContactBelow: 0.5,
    wbcContactBelow: 2.0,
    neutrophilsContactNowBelow: 0.5,
  },

  // "Check my data" for the blood form, plus the sample error test used on preflight data.
  bloodChecks: {
    source: "Sanity checks chosen for this demo",
    flag: "provisional" as Flag,
    wbcMin: 0.5, // x10^3 per microliter
    wbcMax: 50,
    sumLimit: 1.1, // neutrophils + lymphocytes + monocytes + eosinophils may be at most 110 percent of white cells
    bigChangeFactor: 2, // more than double or less than half of baseline gives a warning
    percentMismatch: 0.2, // count may differ from (white cells x percent) by up to 20 percent
  },

  // Adapted from the Royal College of Physicians NEWS2 chart. Each list is checked top to bottom.
  news2: {
    flag: "verify" as Flag,
    source: "Royal College of Physicians NEWS2.",
    label: "Adapted from NEWS2 with spaceflight adjustments. Not validated for spaceflight.",
    respiration: [
      { lo: null, hi: 8, points: 3 },
      { lo: 9, hi: 11, points: 1 },
      { lo: 12, hi: 20, points: 0 },
      { lo: 21, hi: 24, points: 2 },
      { lo: 25, hi: null, points: 3 },
    ] as Band[],
    oxygenSaturation: [
      { lo: null, hi: 91, points: 3 },
      { lo: 92, hi: 93, points: 2 },
      { lo: 94, hi: 95, points: 1 },
      { lo: 96, hi: null, points: 0 },
    ] as Band[],
    systolicBp: [
      { lo: null, hi: 90, points: 3 },
      { lo: 91, hi: 100, points: 2 },
      { lo: 101, hi: 110, points: 1 },
      { lo: 111, hi: 219, points: 0 },
      { lo: 220, hi: null, points: 3 },
    ] as Band[],
    heartRate: [
      { lo: null, hi: 40, points: 3 },
      { lo: 41, hi: 50, points: 1 },
      { lo: 51, hi: 90, points: 0 },
      { lo: 91, hi: 110, points: 1 },
      { lo: 111, hi: 130, points: 2 },
      { lo: 131, hi: null, points: 3 },
    ] as Band[],
    // Temperature bands apply to the adjusted value (raw value minus the in-flight offset).
    temperature: [
      { lo: null, hi: 35.0, points: 3 },
      { lo: 35.1, hi: 36.0, points: 1 },
      { lo: 36.1, hi: 38.0, points: 0 },
      { lo: 38.1, hi: 39.0, points: 1 },
      { lo: 39.1, hi: null, points: 2 },
    ] as Band[],
  },

  // Spaceflight adjustments applied to the vital signs before scoring.
  vitalsAdjust: {
    flag: "provisional" as Flag,
    source:
      "Systolic: Norsk et al. 2015, about 10 mmHg lower in long flight. Temperature: Stahn et al. 2017, core body temperature about 1 C higher in long missions.",
    systolicAddInFlight: 10, // mmHg added to systolic before scoring
    temperatureReferenceC: 37.0, // offset = mean of the last 14 days minus this
    temperatureWindowDays: 14,
    temperatureMinDays: 3, // fewer earlier days than this: use the preflight temperature instead
    preflightTempC: 36.8,
    feverLineC: 39.1, // raw value at or above this is a fever and scores at least feverMinPoints
    feverMinPoints: 2,
    // Added rule: a rise this far above your own recent in-flight usual temperature is worth a closer look.
    riseNoteC: 0.7,
  },

  // How NEWS2 totals map to a daily status.
  statusRules: {
    flag: "verify" as Flag,
    source: "NEWS2 response bands: total 1 to 4 low, 5 to 6 medium or any single score of 3, 7 or more high.",
    monitorFrom: 1,
    surgeonFrom: 5,
    surgeonNowFrom: 7,
    singleVitalPoints: 3,
  },

  // Immune Deviation Score: one 0 to 100 number for how unusual the combined white-cell pattern is.
  immune: {
    flag: "provisional" as Flag,
    source:
      "Combined deviation score, chi-square method. Calibration checked on ImmPort SDY180, SDY296, SDY1252: 6.6% of 106 no-event sample pairs scored 95 or higher (expected 5%).",
    markers: ["NEU", "LYM", "MON", "EOS"] as Marker[], // white cells and NLR are derived from these, so they are left out
    unusualFrom: 95, // score at or above this is labeled Unusual
    reason: "Combined white-cell pattern is unusual for you.",
  },

  sleep: {
    flag: "verify" as Flag,
    source: "Adult recommendation of at least 7 hours, American Academy of Sleep Medicine.",
    targetHours: 7,
    shortNightHours: 6, // a night under this counts toward sleep debt
    nightsInARow: 3,
    verySleepyKss: 7, // Karolinska Sleepiness Scale 7 or higher
  },

  // "Check my data" for the daily form. red = Likely measurement error, warn = Double-check this value.
  dailyChecks: {
    source: "Limits chosen for this demo",
    flag: "provisional" as Flag,
    temp: { redLo: 30, redHi: 43, warnLo: 35.5, warnHi: 38.5 } as Limit,
    hr: { redLo: 25, redHi: 220, warnLo: 45, warnHi: 110 } as Limit,
    rr: { redLo: 4, redHi: 60, warnLo: 10, warnHi: 24 } as Limit,
    spo2: { redLo: 50, redHi: 100, warnLo: 94 } as Limit,
    sbp: { redLo: 60, redHi: 260, warnLo: 95, warnHi: 160 } as Limit,
    dbp: { redLo: 30, redHi: 160, warnLo: 55, warnHi: 100 } as Limit,
    sleepHours: { redLo: 0, redHi: 16, warnLo: 4, warnHi: 11 } as Limit,
    sleepQuality: { redLo: 1, redHi: 5 } as Limit,
    sleepiness: { redLo: 1, redHi: 9 } as Limit,
    mood: { redLo: 1, redHi: 5 } as Limit,
  },

  // Settings for the simulated in-flight history.
  simulation: {
    source: "Simulation settings chosen for this demo. Temperature and blood pressure follow the adjustments above.",
    flag: "provisional" as Flag,
    tempRiseC: 0.8, // total rise over the rise period
    tempRiseDays: 75,
    sbpFlightDrop: 10, // mmHg lower than preflight in flight
    noiseLimit: 2, // normal variation is cut off at this many standard deviations
    sd: { temp: 0.15, hr: 3.5, rr: 1, spo2: 0.5, sbp: 3.5, dbp: 3, sleepHours: 0.4, sleepQuality: 0.6, sleepiness: 1, mood: 0.7 },
    mean: { sleepQuality: 3.8, sleepiness: 3.5, mood: 3.8 },
  },

  // What to do when the status is Monitor Closely. The text depends on which check raised it.
  monitorActions: {
    daily: {
      flag: "verify" as Flag,
      source: "NEWS2 low score response (total 1 to 4): minimum monitoring every 4 to 6 hours.",
      text: "Repeat the vital signs in 4 to 6 hours and log any new symptoms.",
    },
    blood: { text: "Repeat the blood check tomorrow at the same time of day." },
    sleep: { text: "Protect the next sleep period." },
    bloodAfterShortSleep: { text: "Repeat the blood check after a full night of sleep. Short sleep can shift these counts." },
  },

  statusLabels: {
    source: "Wording chosen for this demo",
    actions: [
      "Protect your sleep. Keep a regular sleep period.",
      "Drink water regularly.",
      "Wash or sanitize your hands often and look after your skin.",
      "Limit close contact with crewmates if you feel unwell.",
      "Keep up your exercise routine.",
    ],
  },

  // Help text for the question mark icons.
  tooltips: {
    symptoms: ["Fever or chills", "Rash or skin sores", "Sore throat or cough", "Unusual fatigue", "Mouth sores", "Other"],
    fields: {
      temp: {
        label: "Temperature", unit: "°C",
        what: "Body temperature.",
        how: "Use the crew thermometer. Measure at the same time each day, before exercise.",
        space: "Core temperature runs a little higher on long missions. A rise above your own usual can be an early sign of infection.",
        typical: "About 36.5 to 37.5 °C before flight, up to about 38.0 °C in flight.",
      },
      hr: {
        label: "Heart rate", unit: "bpm",
        what: "Heartbeats per minute at rest.",
        how: "Sit quietly for 5 minutes, then count the pulse for 30 seconds and double it, or use the crew monitor.",
        space: "A raised resting heart rate can signal fever, dehydration, stress or poor sleep.",
        typical: "About 50 to 90 beats per minute at rest.",
      },
      rr: {
        label: "Breathing rate", unit: "per min",
        what: "Breaths per minute at rest.",
        how: "Sit quietly and count one breath in and out as one, for 60 seconds.",
        space: "Cabin air and fluid shifts can change breathing. A fast rate is an early warning sign in many illnesses.",
        typical: "About 12 to 20 breaths per minute.",
      },
      spo2: {
        label: "Oxygen saturation", unit: "%",
        what: "How much oxygen your blood is carrying.",
        how: "Clip the pulse oximeter on a warm finger and wait for a steady number.",
        space: "Cabin air mix is controlled, so a low reading can point to a lung problem or a poor sensor fit.",
        typical: "96 to 100 percent.",
      },
      sbp: {
        label: "Systolic blood pressure", unit: "mmHg",
        what: "The top blood pressure number, when the heart pushes blood out.",
        how: "Seated and rested, use the crew cuff on the upper arm at heart level.",
        space: "Fluid moves toward the head in microgravity and systolic pressure is often about 10 mmHg lower in flight.",
        typical: "About 100 to 130 mmHg in flight.",
      },
      dbp: {
        label: "Diastolic blood pressure", unit: "mmHg",
        what: "The bottom blood pressure number, when the heart relaxes. Recorded but not scored.",
        how: "Taken with the same cuff reading as the systolic number. It must be lower than systolic.",
        space: "Tracked over time so the flight surgeon can see slow changes.",
        typical: "About 60 to 85 mmHg.",
      },
      sleepHours: {
        label: "Sleep hours", unit: "hours",
        what: "How long you slept last night.",
        how: "Use your sleep monitor, or estimate from bedtime and wake time.",
        space: "Short sleep is common on orbit and can shift immune cells and mood. Several short nights in a row build sleep debt.",
        typical: "At least 7 hours.",
      },
      sleepQuality: {
        label: "Sleep quality", unit: "1 to 5",
        what: "How well you slept, from 1 (very poor) to 5 (very good).",
        how: "Rate it yourself shortly after waking.",
        space: "Noise, light and schedule shifts affect sleep in flight. Poor quality can matter even when hours look fine.",
        typical: "3 or higher.",
      },
      sleepiness: {
        label: "Sleepiness", unit: "1 to 9",
        what: "Karolinska Sleepiness Scale: 1 is extremely alert, 9 is very sleepy and fighting sleep.",
        how: "Pick the number that best matches how you feel right now.",
        space: "Very sleepy crew members make more mistakes. It is an early sign of sleep debt.",
        typical: "1 to 6. A score of 7 or more is very sleepy.",
      },
      mood: {
        label: "Mood", unit: "1 to 5",
        what: "How you feel today, from 1 (very low) to 5 (very good). Charted but never scored.",
        how: "Tap the face that fits best.",
        space: "Isolation and confinement can affect mood. The trend helps the crew and the flight surgeon notice changes early.",
        typical: "No fixed range. Your own trend matters most.",
      },
      symptoms: {
        label: "Symptoms", unit: "",
        what: "Anything you feel that is not usual for you.",
        how: "Tick every box that applies today.",
        space: "Small immune changes in flight can bring back dormant viruses and cause skin or throat problems.",
        typical: "None on most days.",
      },
      wbc: {
        label: "White cells", unit: "x10³ per µL",
        what: "Total white blood cells, the body's defence cells.",
        how: "Run the crew blood analyzer on a finger-prick sample.",
        space: "White cells usually rise a little in flight, mostly neutrophils, because of stress and altered immunity.",
        typical: "Lab range 3.8 to 10.8. Your own usual range is shown under the box.",
      },
      neu: {
        label: "Neutrophils", unit: "x10³ per µL",
        what: "The most common white cell. First responders to bacterial infection.",
        how: "Read from the same analyzer report as white cells.",
        space: "Neutrophils tend to rise in flight. A big jump or a very low count needs attention.",
        typical: "Lab range 1.5 to 7.8. Your own usual range is shown under the box.",
      },
      lym: {
        label: "Lymphocytes", unit: "x10³ per µL",
        what: "White cells that remember and fight viruses (T cells and B cells).",
        how: "Read from the same analyzer report as white cells.",
        space: "A steady fall can mean the immune system is under strain from stress, radiation or poor sleep.",
        typical: "Lab range 0.85 to 3.9. Your own usual range is shown under the box.",
      },
      mon: {
        label: "Monocytes", unit: "x10³ per µL",
        what: "White cells that clear debris and help start immune responses.",
        how: "Read from the same analyzer report as white cells.",
        space: "Changes can follow infection or inflammation.",
        typical: "Lab range 0.2 to 0.95. Your own usual range is shown under the box.",
      },
      eos: {
        label: "Eosinophils", unit: "x10³ per µL",
        what: "White cells linked to allergy and parasites. A watch marker, not validated.",
        how: "Read from the same analyzer report as white cells.",
        space: "Shown for tracking only. Rises can come with allergy or skin reactions.",
        typical: "Lab range 0.015 to 0.5. Your own usual range is shown under the box.",
      },
    } as Record<string, FieldInfo>,
  },
};

// Lists every group that carries a flag, with its path, so all provisional and verify values can be reviewed.
export function flaggedConfig(): { path: string; flag: Flag; source: string }[] {
  const found: { path: string; flag: Flag; source: string }[] = [];
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const obj = node as Record<string, unknown>;
    if (typeof obj.flag === "string") {
      found.push({ path, flag: obj.flag as Flag, source: String(obj.source ?? "") });
    }
    for (const [k, v] of Object.entries(obj)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(CONFIG, "");
  return found;
}

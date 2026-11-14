// Text for the Learn tab, the question mark popups that link to it, and Emergency Mode.
// Facts about measurements come from lib/config.ts so they are written once.

import { CONFIG } from "./config";

// ---------------------------------------------------------------------------
// Popups
// ---------------------------------------------------------------------------

export const NEWS2_TIP =
  "NEWS2 is an early warning score used in UK hospitals and ambulance services. Each vital sign earns 0 to 3 points, and the points are added into one total. A higher total means more concern.";

export const IMMUNE_TIP =
  "One number for how unusual today's white-cell pattern is compared with this astronaut's normal readings, after adjusting for spaceflight. 95 or higher is unusual.";

// Where each popup's Learn More button goes. Every value must be an id rendered by the Learn tab (checked by a test).
export const LEARN_ANCHOR: Record<string, string> = {
  temp: "learn-temp", hr: "learn-hr", rr: "learn-rr", spo2: "learn-spo2", sbp: "learn-bp", dbp: "learn-bp",
  sleepHours: "learn-sleepHours", sleepQuality: "learn-sleepQuality", sleepiness: "learn-sleepiness",
  mood: "learn-mood", symptoms: "learn-symptoms",
  wbc: "learn-wbc", neu: "learn-neu", lym: "learn-lym", mon: "learn-mon", eos: "learn-eos",
  nlr: "learn-nlr", news2: "learn-news2", immune: "learn-immune",
};

// ---------------------------------------------------------------------------
// Learn tab
// ---------------------------------------------------------------------------

export type LearnMeasurement = { id: string; title: string; what: string; how: string; why: string; typical: string; note?: string };

const f = CONFIG.tooltips.fields;
const field = (id: string, key: string, title: string, note?: string): LearnMeasurement => ({
  id, title, what: f[key].what, how: f[key].how, why: f[key].space, typical: f[key].typical, note,
});

export const DAILY_SECTION = { id: "learn-daily", title: "Daily Check Measurements" };

export const LEARN_MEASUREMENTS: LearnMeasurement[] = [
  field("learn-temp", "temp", "Temperature", "Core temperature runs about 1 °C higher during long missions (Stahn et al. 2017). HemoScope adjusts for this before scoring."),
  field("learn-hr", "hr", "Heart Rate"),
  field("learn-rr", "rr", "Breathing Rate"),
  field("learn-spo2", "spo2", "Oxygen Saturation"),
  {
    id: "learn-bp", title: "Blood Pressure",
    what: `${f.sbp.what} ${f.dbp.what}`,
    how: f.sbp.how,
    why: `${f.sbp.space} ${f.dbp.space}`,
    typical: `Systolic: ${f.sbp.typical} Diastolic: ${f.dbp.typical}`,
    note: "Systolic pressure runs about 10 mmHg lower in long flight (Norsk et al. 2015). HemoScope adds 10 mmHg to systolic before scoring.",
  },
  field("learn-sleepHours", "sleepHours", "Sleep Hours"),
  field("learn-sleepQuality", "sleepQuality", "Sleep Quality"),
  field("learn-sleepiness", "sleepiness", "Sleepiness"),
  field("learn-mood", "mood", "Mood"),
  field("learn-symptoms", "symptoms", "Symptoms"),
];

export const DAILY_SOURCES = [
  "Stahn et al. 2017, core body temperature in long missions.",
  "Norsk et al. 2015, blood pressure in long-duration spaceflight.",
  "Karolinska Sleepiness Scale, Åkerstedt and Gillberg 1990.",
  "American Academy of Sleep Medicine, adult sleep recommendation of at least 7 hours.",
];

export const NEWS2_SECTION = { id: "learn-news2", title: "NEWS2 Explained" };

export const NEWS2_TEXT = {
  what:
    "NEWS2 is the National Early Warning Score 2, an early warning score used in UK hospitals and ambulance services. It was published by the Royal College of Physicians. It turns a few simple vital signs into one number that shows how sick someone may be.",
  points:
    "Each vital sign earns 0 to 3 points. A reading in the normal range earns 0. The further a reading is from normal, the more points it earns. The points for all vitals entered are added into the NEWS2 total.",
  totalsTitle: "What the totals mean in HemoScope",
  totals: [
    { when: "0", status: "Normal For You" },
    { when: "1 to 4", status: "Monitor Closely" },
    { when: "Any single vital with 3 points, or a total of 5 to 6", status: "Contact Flight Surgeon" },
    { when: "7 or more", status: "Contact Flight Surgeon Now" },
  ],
  adjustTitle: "Spaceflight adjustments",
  adjust: [
    `Temperature: core temperature runs about 1 °C higher in long missions (Stahn et al. 2017). HemoScope compares today's reading with the astronaut's own recent in-flight average, measured against ${CONFIG.vitalsAdjust.temperatureReferenceC} °C, before scoring. A reading of ${CONFIG.vitalsAdjust.feverLineC} °C or more always counts as a fever.`,
    `Systolic blood pressure: runs about ${CONFIG.vitalsAdjust.systolicAddInFlight} mmHg lower in long flight (Norsk et al. 2015). HemoScope adds ${CONFIG.vitalsAdjust.systolicAddInFlight} mmHg to the reading before scoring.`,
  ],
  note: CONFIG.news2.label,
};

export const NEWS2_SOURCES = [
  "Royal College of Physicians. National Early Warning Score (NEWS) 2, 2017.",
  "Stahn et al. 2017, core body temperature in long missions.",
  "Norsk et al. 2015, blood pressure in long-duration spaceflight.",
];

export const BLOOD_SECTION = { id: "learn-blood", title: "Blood Check Markers" };

export type LearnMarker = { id: string; title: string; short: string; does: string; rise: string; drop: string };

export const LEARN_MARKERS: LearnMarker[] = [
  {
    id: "learn-wbc", title: "White Cells",
    short: "Total count of the body's defence cells.",
    does: "Total count of the body's defence cells. It is the sum of all the types below, plus a few rare ones.",
    rise: "Often follows infection, stress or inflammation. A small rise is expected in flight, mostly from neutrophils.",
    drop: "Can mean the body is making fewer defence cells, for example during a viral illness or after radiation. A very low count needs the flight surgeon.",
  },
  {
    id: "learn-neu", title: "Neutrophils",
    short: "First responders to bacterial infection and tissue injury.",
    does: "The most common white cell. They are the first responders to bacterial infection and tissue injury.",
    rise: "Often follows stress, infection or inflammation. Neutrophils tend to rise a little during flight.",
    drop: "Leaves less protection against bacteria. A very low count needs the flight surgeon.",
  },
  {
    id: "learn-lym", title: "Lymphocytes",
    short: "White cells that remember and fight viruses (T cells and B cells).",
    does: "White cells that remember and fight viruses (T cells and B cells).",
    rise: "Often follows a viral infection or an immune response.",
    drop: "A steady fall can mean the immune system is under strain from stress, radiation or poor sleep. A low count needs the flight surgeon.",
  },
  {
    id: "learn-mon", title: "Monocytes",
    short: "White cells that clear debris and help start immune responses.",
    does: "White cells that clear debris and help start immune responses.",
    rise: "Can follow infection, recovery from illness or inflammation.",
    drop: "A low count on its own is rarely a concern, but look at the other markers too.",
  },
  {
    id: "learn-eos", title: "Eosinophils",
    short: "White cells linked to allergy and parasites.",
    does: `White cells linked to allergy and parasites. In HemoScope this is a ${CONFIG.blood.watchLabel}.`,
    rise: "Can come with allergy or skin reactions.",
    drop: "Can follow stress or some medicines. A low count is rarely a concern on its own.",
  },
];

export const NLR_SECTION = {
  id: "learn-nlr",
  title: "Why NLR Is the Headline Marker",
  text:
    "The neutrophil to lymphocyte ratio (NLR) is neutrophils divided by lymphocytes. It combines the two cell types into one number that rises when the body is under stress or fighting infection. In microgravity, fluid shifts change how concentrated the blood is, which moves single counts up or down. Both counts move together, so the ratio is not affected by those concentration changes.",
};

export const IMMUNE_SECTION = {
  id: "learn-immune",
  title: "Immune Deviation Score",
  paragraphs: [
    "The Immune Deviation Score is one number from 0 to 100 for how unusual today's white-cell pattern is compared with this astronaut's own normal readings, after adjusting for spaceflight.",
    "Meaning: a score of 62 means today's pattern is more unusual than 62% of this astronaut's normal readings. A score of 95 or higher is labeled Unusual.",
    "Markers used: neutrophils, lymphocytes, monocytes and eosinophils, and only the ones entered. White cells and NLR are left out because they are calculated from these counts.",
    "Calibration: on ImmPort SDY180, SDY296 and SDY1252, 6.6% of 106 no-event sample pairs scored 95 or higher, close to the 5% expected.",
  ],
};

export const STATE_MAP_SECTION = {
  id: "learn-state-map",
  title: "Immune State Map",
  intro:
    "The Immune State Map shows one blood check as a point on a map and the astronaut's mission as a path of points, oldest to newest. Each point is placed using the same four z-scores as the Immune Deviation Score (neutrophils, lymphocytes, monocytes and eosinophils), measured against the astronaut's own expected values.",
  axes: [
    { title: "Overall Immune Cell Level (horizontal)", text: "Moving right means all four cell types are higher than expected for that day. Moving left means they are lower." },
    { title: "Neutrophil-Lymphocyte Balance (vertical)", text: "Moving up means neutrophils are higher while lymphocytes and eosinophils are lower, the stress pattern the neutrophil to lymphocyte ratio (NLR) follows. Moving down is the reverse." },
  ],
  zonesIntro: "The shaded zones were learned from healthy people's repeat checks. They show how common a pattern is. They do not say whether a result is good or bad.",
  direction:
    "The map shows direction: which way a pattern moved and how far. The status comes from the Immune Deviation Score and the safety checks, so a point in a Rare zone does not change the status by itself.",
};

// Sources with a link, used by the Blood Check Markers section and by the Body Map.
const CRUCIAN_2018: Source = {
  text: "Crucian et al. 2018, Frontiers in Immunology.",
  url: "https://www.frontiersin.org/journals/immunology/articles/10.3389/fimmu.2018.01437/full",
};
const ROONEY_2019: Source = {
  text: "Rooney et al. 2019, Frontiers in Microbiology.",
  url: "https://www.frontiersin.org/journals/microbiology/articles/10.3389/fmicb.2019.00016/full",
};

export const BLOOD_SOURCES: Source[] = [
  { text: "Crucian et al. 2015, npj Microgravity, immune changes in spaceflight." },
  CRUCIAN_2018,
  ROONEY_2019,
  { text: "ImmPort SDY180, SDY296, SDY1252 and SDY301, within-person variation and calibration." },
  { text: "CTCAE v5, grading of low blood counts." },
];

// Every id the Learn tab renders, used by a test to check that popup links land somewhere.
export const MAP_SECTION = { id: "learn-map", title: "Body Map" };
export const TIMELINE_SECTION = { id: "learn-timeline", title: "Mission Timeline" };
export const NUMBERS_SECTION = { id: "learn-numbers", title: "Your Numbers Explained" };
export const STATUS_SECTION = { id: "learn-status", title: "What Your Status Means" };
export const CPR_SECTION = { id: "learn-cpr", title: "CPR in Space" };
export const REFERENCE_SECTION = { id: "learn-reference", title: "Measurement Reference" };
export const SOURCES_SECTION = { id: "learn-sources", title: "Sources" };

// The Learn tab in order. Measurement Reference is a heading over the five sections that follow it in this file.
export const LEARN_ORDER = [MAP_SECTION, TIMELINE_SECTION, CPR_SECTION, NUMBERS_SECTION, STATUS_SECTION, REFERENCE_SECTION, SOURCES_SECTION];

// The two large headings of the Learn tab and the sections under each. Sources stay at the bottom, outside both.
export const LEARN_GROUPS = [
  { id: "learn-group-space", title: "How Space Affects Health", sections: [MAP_SECTION, TIMELINE_SECTION, CPR_SECTION] },
  { id: "learn-group-measurements", title: "Your Measurements", sections: [NUMBERS_SECTION, STATUS_SECTION, REFERENCE_SECTION] },
] as const;

export const LEARN_IDS: string[] = [
  ...LEARN_ORDER.map((x) => x.id),
  DAILY_SECTION.id, NEWS2_SECTION.id, BLOOD_SECTION.id, NLR_SECTION.id, IMMUNE_SECTION.id, STATE_MAP_SECTION.id,
  ...LEARN_MEASUREMENTS.map((m) => m.id),
  ...LEARN_MARKERS.map((m) => m.id),
];

// Images. To add one, put the file in public/learn/ and list it here. The key is a Learn section id (learn-daily,
// learn-news2, learn-blood, learn-cpr), a Mission Timeline stop (timeline-preflight, timeline-landing) or a Body Map
// card (map-brain, map-muscles). A key with no entry shows no image. Width and height are the real file size in pixels.
// Every image shows the credit "Image: NASA", so only list NASA images.
export type LearnImage = { file: string; alt: string; width: number; height: number };
export const LEARN_IMAGES: Record<string, LearnImage | undefined> = {
  "learn-cpr": { file: "cpr.jpg", alt: "An astronaut kneeling and performing chest compressions on a strapped-down mannequin on the space station.", width: 1041, height: 694 },
  "learn-blood": { file: "blood-draw.jpg", alt: "Two astronauts handling sample collection supplies in a space station module.", width: 1920, height: 1280 },
  "learn-daily": { file: "blood pressure.jpg", alt: "One astronaut fitting a blood pressure cuff and sensors on another astronaut's arm.", width: 855, height: 1280 },
  "learn-news2": { file: "medical-drill.jpg", alt: "An astronaut floating above a crew member strapped to a restraint during a medical drill on the space station.", width: 5504, height: 8256 },
  "timeline-preflight": { file: "launch.jpg", alt: "Three astronauts in black polo shirts reviewing papers and a tablet inside a module.", width: 517, height: 640 },
  "timeline-landing": { file: "splashdown.jpg", alt: "A crew capsule in the ocean with orange flotation balloons, surrounded by recovery crews on rafts.", width: 640, height: 426 },
  "map-brain": { file: "sleep.jpg", alt: "Crew members floating inside a space station module.", width: 640, height: 437 },
  "map-muscles": { file: "excercise.jpg", alt: "An astronaut running on a treadmill with a harness on the space station.", width: 640, height: 425 },
};

// ---------------------------------------------------------------------------
// Emergency Mode
// ---------------------------------------------------------------------------

export type Source = { text: string; url?: string };
export type EmergencyStep = {
  text: string;
  source: Source;
  switchTo?: { id: string; label: string }; // button that jumps to another guide
};
export type Scenario = { id: string; title: string; steps: EmergencyStep[] };

export const FINAL_STEP = "Follow the mission medical checklist and your flight surgeon's instructions.";

const GENERAL: Source = { text: "General emergency first aid practice." };
const CHECKLIST: Source = { text: "Mission medical checklist." };
const CPR_MICROGRAVITY: Source = {
  text: "Guideline for CPR in microgravity (PMC7607644).",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7607644",
};
const AHA: Source = { text: "American Heart Association adult CPR guidelines." };
const WAO: Source = { text: "World Allergy Organization anaphylaxis guidance." };

const ALERT: EmergencyStep = { text: "Alert the crew and Mission Control. Say what happened and when.", source: GENERAL };
const END: EmergencyStep = { text: FINAL_STEP, source: CHECKLIST };
const TO_UNRESPONSIVE = { id: "unresponsive", label: "Switch to the Unresponsive Guide" };

export const SCENARIOS: Scenario[] = [
  {
    id: "unresponsive",
    title: "Crewmate Unresponsive or Collapsed",
    steps: [
      ALERT,
      { text: "Check whether the crewmate responds and is breathing. Take no more than 10 seconds.", source: GENERAL },
      { text: "Send a crewmate for the defibrillator (AED) and the medical kit.", source: GENERAL },
      {
        text: "If the crewmate is not breathing normally, start chest compressions immediately with the Evetts-Russomano method. Wrap your legs around the patient's torso and lock your ankles so you stay attached.",
        source: CPR_MICROGRAVITY,
      },
      {
        text: "Compress the center of the chest 5 to 6 cm deep, 100 to 120 times per minute.",
        source: AHA,
      },
      { text: "Attach the defibrillator as soon as it arrives and follow its instructions.", source: CPR_MICROGRAVITY },
      {
        text: "Once the patient is secured to the medical restraint system, switch to the handstand method. Brace your feet on the opposite wall.",
        source: CPR_MICROGRAVITY,
      },
      { text: "Keep going until help takes over or the patient breathes normally.", source: AHA },
      END,
    ],
  },
  {
    id: "chest",
    title: "Chest Pain",
    steps: [
      ALERT,
      { text: "Stop all activity. Rest, secured in place.", source: GENERAL },
      { text: "Measure heart rate, blood pressure and oxygen saturation, and report them.", source: GENERAL },
      { text: "Bring the defibrillator and the medical kit close.", source: GENERAL },
      { text: "Follow the medical checklist and the flight surgeon for any medication.", source: CHECKLIST },
      { text: "If the person becomes unresponsive, switch to the Unresponsive guide.", source: GENERAL, switchTo: TO_UNRESPONSIVE },
      END,
    ],
  },
  {
    id: "breathing",
    title: "Trouble Breathing",
    steps: [
      ALERT,
      { text: "Check the cabin air alarms for carbon dioxide, smoke and pressure. If any alarm is active, move to a safe area.", source: GENERAL },
      { text: "Measure oxygen saturation and breathing rate, and report them.", source: GENERAL },
      { text: "Use supplemental oxygen as directed by the medical checklist.", source: CHECKLIST },
      {
        text: "If there is swelling, hives or a known allergen, switch to the Severe Allergic Reaction guide.",
        source: WAO, switchTo: { id: "allergy", label: "Switch to the Severe Allergic Reaction Guide" },
      },
      { text: "If the person becomes unresponsive, switch to the Unresponsive guide.", source: GENERAL, switchTo: TO_UNRESPONSIVE },
      END,
    ],
  },
  {
    id: "allergy",
    title: "Severe Allergic Reaction",
    steps: [
      ALERT,
      { text: "Look for signs: swelling of the face or throat, hives, trouble breathing, dizziness.", source: WAO },
      { text: "Give the epinephrine auto-injector from the medical kit into the outer thigh. Follow the instructions on the injector.", source: WAO },
      { text: "Note the time the injection was given.", source: WAO },
      { text: "Monitor breathing, heart rate and oxygen saturation.", source: WAO },
      { text: "Follow the medical checklist and the flight surgeon for any repeat dose or further treatment.", source: WAO },
      { text: "If the person becomes unresponsive, switch to the Unresponsive guide.", source: GENERAL, switchTo: TO_UNRESPONSIVE },
      END,
    ],
  },
];

// Flight surgeon view: what to ask the crew while guiding them.
export const CREW_ASK = [
  "Time the problem started",
  "Current vital signs",
  "Actions already taken",
  "Medications given and times",
];

export const PACER_BPM = 110;

export const PACER_REMINDER = "Push 5 to 6 cm deep at 100 to 120 per minute. Swap rescuers about every 2 minutes.";
export const PACER_SOURCE: Source[] = [
  { text: "American Heart Association adult CPR guidelines" },
  { text: "CPR in microgravity guideline", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7607644" },
];

// ---------------------------------------------------------------------------
// Learn tab: Body Map, Mission Timeline, Your Numbers Explained, What Your Status Means, CPR in Space, Sources
// Every fact has a source. Astronauts are described in the third person, except in Your Numbers Explained and
// What Your Status Means.
// ---------------------------------------------------------------------------

const PHASES = CONFIG.spaceflight.phases;
const GENERAL_PHYSIOLOGY: Source = { text: "General physiology." };
const NASA_HRP: Source = { text: "NASA Human Research Program." };
const BARGER_2014: Source = { text: "Barger et al. 2014, The Lancet Neurology." };
const NORSK_2015: Source = { text: "Norsk et al. 2015, blood pressure in long-duration spaceflight." };
const NASA_BONE: Source = {
  text: "NASA, Risk of Spaceflight-Induced Bone Changes.",
  url: "https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/",
};
// The phase multipliers in lib/config.ts cite these two sources.
const PHASE_MULTIPLIERS: Source = { text: `Spaceflight phase multipliers. ${PHASES.earlyFlight.source} ${PHASES.longFlight.source}` };

// Body Map. x and y are positions on the 200 by 460 body outline.
export type MapSpot = {
  id: string; title: string; group: "tracked" | "effect"; x: number; y: number;
  text: string; tracks: string; source: Source;
};

export const MAP_GROUPS = { tracked: "Tracked by HemoScope", effect: "Spaceflight Effect" } as const;
export const MAP_HINT = "Hover, tap or focus a dot on the body to read about it. Press Escape to clear the card.";

const NO_TRACK = "HemoScope does not track this.";

export const MAP_SPOTS: MapSpot[] = [
  {
    id: "marrow", title: "Bone Marrow", group: "tracked", x: 80, y: 262,
    text: "Where white cells are made.",
    tracks: "HemoScope tracks the cells it releases: white cells, neutrophils, lymphocytes, monocytes and eosinophils.",
    source: GENERAL_PHYSIOLOGY,
  },
  {
    id: "blood", title: "Blood", group: "tracked", x: 163, y: 180,
    text: "White cells shift during flight. Neutrophils rise slightly in flight and jump sharply at landing, so HemoScope adjusts each astronaut's expected range by mission phase.",
    tracks: "Every Blood Check marker, compared with the astronaut's own expected range for the mission phase.",
    source: PHASE_MULTIPLIERS,
  },
  {
    id: "lymph", title: "Lymph Nodes and Thymus", group: "tracked", x: 100, y: 116,
    text: "Home of lymphocytes, the T and B cells that fight viruses. T cell function is reduced during spaceflight.",
    tracks: "HemoScope tracks lymphocytes.",
    source: CRUCIAN_2018,
  },
  {
    id: "skin", title: "Skin and Lips", group: "tracked", x: 100, y: 68,
    text: "Viruses that stay dormant in the body can reawaken in space. 53% of astronauts on 10 to 16 day shuttle flights and 61% on ISS missions of 180 days or more shed at least one herpes virus (Epstein-Barr, chickenpox and shingles virus, cold sore virus, or cytomegalovirus).",
    tracks: "HemoScope tracks symptoms and lymphocytes.",
    source: ROONEY_2019,
  },
  {
    id: "brain", title: "Brain and Sleep", group: "effect", x: 100, y: 20,
    text: "Astronauts averaged about 6 hours of sleep a night on shuttle and ISS missions, below the 8.5 hours scheduled, and about three quarters of ISS crew used sleep medication at some point.",
    tracks: "HemoScope tracks sleep hours, sleep quality and sleepiness.",
    source: BARGER_2014,
  },
  {
    id: "eyes", title: "Eyes", group: "effect", x: 100, y: 44,
    text: "Some astronauts on long missions develop swelling at the back of the eye and changes in vision, called spaceflight associated neuro-ocular syndrome (SANS).",
    tracks: NO_TRACK,
    source: NASA_HRP,
  },
  {
    id: "heart", title: "Heart and Fluid Shift", group: "effect", x: 118, y: 146,
    text: `Without gravity, body fluids shift toward the head. Systolic blood pressure runs about ${CONFIG.vitalsAdjust.systolicAddInFlight} mmHg lower in long flight, and HemoScope adjusts for it.`,
    tracks: `HemoScope tracks blood pressure and adds ${CONFIG.vitalsAdjust.systolicAddInFlight} mmHg to the systolic reading before scoring.`,
    source: NORSK_2015,
  },
  {
    id: "kidneys", title: "Kidneys", group: "effect", x: 78, y: 184,
    text: "Calcium released from bone raises the risk of kidney stones in flight.",
    tracks: NO_TRACK,
    source: NASA_HRP,
  },
  {
    id: "bones", title: "Bones", group: "effect", x: 118, y: 224,
    text: "Weight-bearing bones in the spine and hips lose about 1% to 1.5% of their density each month on 4 to 6 month missions.",
    tracks: NO_TRACK,
    source: NASA_BONE,
  },
  {
    id: "muscles", title: "Muscles", group: "effect", x: 124, y: 346,
    text: "Muscles weaken without the load of gravity, so crews exercise every day on the station.",
    tracks: NO_TRACK,
    source: NASA_HRP,
  },
];

// Mission Timeline. The sentences about white cells are written from the multipliers in lib/config.ts.
const NAMES: Record<string, string> = {
  WBC: "White cells", NEU: "Neutrophils", LYM: "Lymphocytes", MON: "Monocytes", EOS: "Eosinophils", NLR: "The neutrophil to lymphocyte ratio",
};

function multiplierSentences(multiplier: Record<string, number>): string[] {
  const out: string[] = [];
  const unchanged: string[] = [];
  for (const [marker, value] of Object.entries(multiplier)) {
    const pct = Math.round(Math.abs(value - 1) * 100);
    if (pct === 0) unchanged.push(marker);
    else out.push(`${NAMES[marker]} expected about ${pct}% ${value > 1 ? "higher" : "lower"}.`);
  }
  if (unchanged.length > 0) {
    const names = unchanged.map((m, i) => (i === 0 ? NAMES[m] : NAMES[m].toLowerCase()));
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    out.push(`${list} expected unchanged.`);
  }
  return out;
}

export type TimelineStop = {
  id: string; title: string; days: string; phase: "preflight" | "earlyFlight" | "longFlight" | null;
  changes: string[]; does: string; source?: Source;
};

const EARLY_DAYS = CONFIG.spaceflight.earlyFlightLastDay;

export const TIMELINE_STOPS: TimelineStop[] = [
  {
    id: "preflight", title: "Preflight", days: "Before launch", phase: "preflight",
    changes: [PHASES.preflight.source],
    does: "Preflight blood checks set each astronaut's personal baseline.",
  },
  {
    id: "earlyFlight", title: "Early Flight", days: `Days 1 to ${EARLY_DAYS}`, phase: "earlyFlight",
    changes: multiplierSentences(PHASES.earlyFlight.multiplier),
    does: "HemoScope multiplies each astronaut's baseline by these values to set the expected range.",
    source: { text: PHASES.earlyFlight.source },
  },
  {
    id: "longFlight", title: "Long Flight", days: `Day ${EARLY_DAYS + 1} and later`, phase: "longFlight",
    changes: multiplierSentences(PHASES.longFlight.multiplier),
    does: "HemoScope multiplies each astronaut's baseline by these values to set the expected range.",
    source: { text: PHASES.longFlight.source },
  },
  {
    id: "landing", title: "Landing", days: "Return to Earth", phase: null,
    changes: ["Neutrophils jump sharply at landing."],
    does: "This demo has no landing multiplier, so it shows no landing values.",
    source: PHASE_MULTIPLIERS,
  },
  {
    id: "recovery", title: "Recovery", days: "After landing", phase: null,
    changes: ["Not modeled in this demo."],
    does: "The demo covers preflight, early flight and long flight.",
  },
];

export const CURRENT_PHASE_LABEL = "Current Phase";

// Your Numbers Explained. One entry per marker, keyed by the engine's marker name.
export const NUMBER_MARKERS: Record<string, { id: string; short: string }> = {
  ...Object.fromEntries(LEARN_MARKERS.map((m) => [m.id.replace("learn-", "").toUpperCase(), { id: m.id, short: m.short }])),
  NLR: { id: NLR_SECTION.id, short: "Neutrophils divided by lymphocytes, a number that rises when the body is under stress or fighting infection." },
};

export const NUMBERS_TEXT = {
  intro: "Each marker from the latest Blood Check, the personal expected range and what the result means.",
  noBlood: "No Blood Check with results yet.",
  noDaily: "No Daily Check with a NEWS2 total yet.",
  rangeLabel: "Personal expected range",
  inRange: "In the expected range, so nothing stands out.",
  nlrAbove: "The ratio rises when the body is under stress or fighting infection.",
  nlrBelow: "The ratio is lower than expected. Look at the neutrophil and lymphocyte counts to see which one moved.",
  news2: (total: number, status: string) => `The latest NEWS2 total is ${total}, which gives the status ${status}.`,
  immune: (score: number, unusualFrom: number, unusual: boolean) =>
    `The latest Immune Deviation Score is ${score}. A score of ${unusualFrom} or higher is labeled Unusual, so this pattern is ${unusual ? "" : "not "}Unusual.`,
  forecast: (lo: string, hi: string, unit: string) => `Next check expected between ${lo} and ${hi} ${unit}.`,
  forecastDays: 7, // the forecast is for one week after today
  learnMore: "Learn More",
};

// What Your Status Means. One card per status, in order of concern.
export const STATUS_ORDER = ["normal", "monitor", "surgeon", "surgeonNow", "retake"] as const;
export const STATUS_MEANINGS: Record<(typeof STATUS_ORDER)[number], string> = {
  normal: "Results are within this astronaut's own expected range. Keep doing the Daily Check.",
  monitor: "Something is a little outside the usual range. Keep doing the Daily Check and watch for symptoms. The app checks again with the next entry.",
  surgeon: "Discuss at the next scheduled contact with the flight surgeon.",
  surgeonNow: "Contact the flight surgeon immediately. For an emergency, open Emergency Mode.",
  retake: "The values don't add up, which usually means a measurement error. Measure again before reading the result.",
};
export const STATUS_SOURCE: Source = { text: "HemoScope status rules, described in the NEWS2 Explained and Blood Check Markers sections." };
export const OPEN_EMERGENCY = "Open Emergency Mode";

// CPR in Space.
export const CPR_TEXT = [
  "In microgravity a rescuer cannot use body weight to push, so the rescuer must anchor first. Five methods have been studied.",
  "The Evetts-Russomano method (legs wrapped around the patient's torso) is used to start immediately.",
  "The handstand method (feet braced on the opposite wall) is used once the patient is secured to the medical restraint system.",
];
export const CPR_LEARN_SOURCE: Source = CPR_MICROGRAVITY;

// Sources: every source used in the Learn tab, once each, with a link where one is given. The Blood card's entry already
// holds the early and long flight sources shown on the Mission Timeline.
const fromText = (text: string): Source => ({ text });
const learnSourceList = (): Source[] => {
  const all: Source[] = [
    ...MAP_SPOTS.map((x) => x.source),
    CPR_LEARN_SOURCE,
    STATUS_SOURCE,
    ...[...DAILY_SOURCES, ...NEWS2_SOURCES].map(fromText),
    ...BLOOD_SOURCES,
  ];
  const seen = new Set<string>();
  return all.filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true)));
};
export const LEARN_SOURCES: Source[] = learnSourceList();

// Every place in the Learn tab that a search result or a Learn More link can open: the sections, measurements and markers
// plus each Body Map card, Mission Timeline stop and status card.
export const LEARN_TARGET_IDS: string[] = [
  ...LEARN_IDS,
  ...MAP_SPOTS.map((x) => `map-${x.id}`),
  ...TIMELINE_STOPS.map((x) => `timeline-${x.id}`),
  ...STATUS_ORDER.map((x) => `status-${x}`),
];

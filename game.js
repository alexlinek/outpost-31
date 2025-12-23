/* game.js
=================================================
 OUTPOST 31 — SIMULATOR UI + PROMPT NAVIGATION
=================================================
*/

const app = document.getElementById("app");
const enterPrompt = document.getElementById("enterPrompt");

/* -----------------------------
   BLOOD ROSTER + RANDOM SYSTEM
-------------------------------- */

const BLOOD_ROSTER = [
  { id: "macready", name: "MACREADY", status: "alive" },

  { id: "garry", name: "GARRY", status: "alive" },
  { id: "windows", name: "WINDOWS", status: "alive" },
  { id: "nauls", name: "NAULS", status: "alive" },
  { id: "palmer", name: "PALMER", status: "alive" },

  // ARCHIVED = died before the blood-test scene; samples are freezer/autopsy draws
  { id: "norris", name: "NORRIS", status: "archived" },
  { id: "copper", name: "COPPER", status: "archived" },
  { id: "clark", name: "CLARK", status: "archived" },
  { id: "fuchs", name: "FUCHS", status: "archived" },
  { id: "bennings", name: "BENNINGS", status: "archived" },
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomMany(arr, count) {
  const pool = [...arr];
  const out = [];
  while (pool.length && out.length < count) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// Chance the FIRST manual test on an infected sample lies (reports HUMAN)
function falseNegativeProbability(s) {
  const base = 0.0;

  // Bulk scans poison trust. 0.15 per bulk scan, capped at 0.30
  const bulkPenalty = Math.min(0.3, s.bulkScans * 0.15);

  // High risk = chaotic conditions. Up to +0.20
  const riskPenalty = Math.min(0.2, s.infectionRisk * 0.04);

  // Caution reduces errors. Up to -0.20
  const cautionShield = Math.min(0.2, s.caution * 0.04);

  // Consulting the model reduces errors a bit
  const simShield = s.notes.includes("assimilation_model_ran") ? 0.1 : 0.0;

  return Math.max(
    0,
    base + bulkPenalty + riskPenalty - cautionShield - simShield
  );
}

function initBloodSystem() {
  state.bloodTests = Object.fromEntries(BLOOD_ROSTER.map((c) => [c.id, null]));

  // 0–1 infected at start (signals "alternate timeline")
  const initialCount = Math.random() < 0.15 ? 0 : 1;
  state.infectedIds = pickRandomMany(
    BLOOD_ROSTER.map((c) => c.id),
    initialCount
  );

  // Bulk scan reliance + false-negative tracking
  state.infectedFound = false;
  state.bulkScans = 0;
  state.falseNegativeUsed = {}; // { crewId: true } — if a lie already happened for this crew
  state.spreadTriggered = false; // prevents multiple spreads beyond 2 infected
  state.pendingBloodOutcome = null;
}

function maybeTriggerSpread(s) {
  if (s.spreadTriggered) return;
  if (s.infectedIds.length >= 2) return;
  if (s.infectionRisk < 3) return;

  const chance =
    s.infectionRisk >= 5 ? 1.0 : s.infectionRisk === 4 ? 0.75 : 0.55; // at 3

  if (Math.random() < chance) {
    const candidates = BLOOD_ROSTER.map((c) => c.id).filter(
      (id) => !s.infectedIds.includes(id)
    );

    if (candidates.length) {
      s.infectedIds.push(pickRandom(candidates));
      s.spreadTriggered = true;
      addNote("secondary_infection_possible");
      logLine("ALERT: SECONDARY INFECTION SIGNAL DETECTED.");
    }
  }
}

// Data sufficiency used for simulation warnings + confidence
function getDataSufficiency(s) {
  const testedCount = Object.values(s.bloodTests).filter(
    (v) => v !== null
  ).length;
  if (testedCount === 0) return "none";
  if (testedCount === 1) return "limited";
  return "sufficient";
}

// More granular confidence for endings flavor + threshold tweaks
function confidenceLevel(s) {
  const tested = Object.values(s.bloodTests).filter((v) => v !== null).length;
  if (tested === 0) return "none";
  if (tested === 1) return "low";
  if (tested <= 3) return "medium";
  return "high";
}

function computeAndStoreBloodOutcome(s, crewId) {
  const trulyInfected = s.infectedIds.includes(crewId);

  const canLie =
    trulyInfected &&
    s.bulkScans > 0 &&
    !s.falseNegativeUsed[crewId] &&
    !s.infectedFound;

  const pLie = canLie ? falseNegativeProbability(s) : 0;
  const lied = canLie && Math.random() < pLie;

  const reported = trulyInfected && !lied ? "infected" : "human";

  s.pendingBloodOutcome = {
    crewId,
    trulyInfected,
    lied,
    reported,
    ts: Date.now(),
  };

  return s.pendingBloodOutcome;
}

function applyPendingBloodOutcome(crewId) {
  const o = state.pendingBloodOutcome;
  const outcome =
    !o || o.crewId !== crewId ? computeAndStoreBloodOutcome(state, crewId) : o;

  state.bloodTests[crewId] = outcome.reported;

  const crew = BLOOD_ROSTER.find((c) => c.id === crewId);

  if (outcome.reported === "infected") {
    state.infectedFound = true;
    addNote("flagged_sample");
    addNote(`infected_identity_${crewId}`);
    state.caution += 2;
    state.infectionRisk = Math.max(0, state.infectionRisk - 1);
    logLine(`BLOOD TEST: ${crew?.name || crewId} = INFECTED.`);
  } else {
    state.caution += 1;
    if (outcome.trulyInfected && outcome.lied) {
      state.falseNegativeUsed[crewId] = true;
      addNote("false_negative_possible");
      logLine(`BLOOD TEST: ${crew?.name || crewId} = HUMAN (UNVERIFIED).`);
    } else {
      logLine(`BLOOD TEST: ${crew?.name || crewId} = HUMAN.`);
    }
  }

  state.pendingBloodOutcome = null;
}

/* -----------------------------
   STATE
-------------------------------- */
const state = {
  caution: 0,
  paranoia: 0,
  infectionRisk: 0,
  notes: [],

  bloodTests: {},
  infectedIds: [],
  infectedFound: false,

  bulkScans: 0,
  falseNegativeUsed: {},
  spreadTriggered: false,

  pendingBloodOutcome: null,
};

function resetState() {
  state.caution = 0;
  state.paranoia = 0;
  state.infectionRisk = 0;
  state.notes = [];
  initBloodSystem();
}

function addNote(note) {
  if (!state.notes.includes(note)) {
    state.notes.push(note);
    logLine(`LOGGED: ${note.replace(/_/g, " ")}.`);
  }
}

/* -----------------------------
   LOG LINE
-------------------------------- */
let logEl = null;

function logLine(message) {
  if (!logEl) return;
  const stamp = new Date();
  const hh = String(stamp.getHours()).padStart(2, "0");
  const mm = String(stamp.getMinutes()).padStart(2, "0");
  const ss = String(stamp.getSeconds()).padStart(2, "0");
  logEl.querySelector('[data-log="msg"]').textContent = message;
  logEl.querySelector('[data-log="ts"]').textContent = `${hh}:${mm}:${ss}`;
}

/* -----------------------------
   PLAYBACK SUBJECT (SECURITY FEED)
-------------------------------- */
function getPlaybackSubject(s) {
  // Prefer an infected crew member if one exists
  if (s.infectedIds && s.infectedIds.length > 0) {
    const id = pickRandom(s.infectedIds);
    return BLOOD_ROSTER.find((c) => c.id === id) || pickRandom(BLOOD_ROSTER);
  }
  // Otherwise, pick a random crew member
  return pickRandom(BLOOD_ROSTER);
}

/* -----------------------------
   BLOOD TEST NODE FACTORY
-------------------------------- */
function makeBloodTestNode(crewId) {
  const crew = BLOOD_ROSTER.find((c) => c.id === crewId);

  return {
    text: (s) => {
      const isArchived = crew.status === "archived";
      const header = isArchived
        ? `ARCHIVED SAMPLE DRAW — ${crew.name}`
        : `LIVE SAMPLE DRAW — ${crew.name}`;

      const flavor = isArchived
        ? "THE LABEL IS OLD. THE PLASTIC IS FROSTED.\nTHE BLOOD MOVES SLOWER THAN IT SHOULD."
        : "THE ROOM GOES QUIET.\nSOMEONE BREATHES THROUGH THEIR TEETH.";

      // Deterministic for this screen:
      const outcome = computeAndStoreBloodOutcome(s, crewId);

      if (outcome.reported === "infected") {
        return `
HOT WIRE ENGAGED.

${header}
${flavor}

CONTACT CONFIRMED.
THE SAMPLE *RECOILS*.

RESULT: VIOLENT REACTION.
ACTIVE INFECTION CONFIRMED.
        `.trim();
      }

      const noteLine =
        outcome.trulyInfected && outcome.lied
          ? "NOTE: READOUT FEELS... DELAYED."
          : "";

      return `
HOT WIRE ENGAGED.

${header}
${flavor}

CONTACT CONFIRMED.
THE SAMPLE SIZZLES, THEN LIES STILL.

RESULT: NO REACTION.
LOGGED: HUMAN
${noteLine}
      `.trim();
    },

    choices: [
      {
        label: "RETURN TO BLOOD TEST CONSOLE",
        next: "lab_menu",
        effect: () => applyPendingBloodOutcome(crewId),
      },
    ],
  };
}

/* -----------------------------
   TROPHY (PER-NODE ART)
-------------------------------- */
let trophyEl;

function setTrophy({ title, href, filename }) {
  if (!trophyEl) return;
  trophyEl.style.display = "block";
  trophyEl.innerHTML = `
    <p>${title}</p>
    <p>DOWNLOAD:</p>
    <p><a href="${href}" download="${filename}">⬇ DOWNLOAD</a></p>
  `;
}

function hideTrophy() {
  if (!trophyEl) return;
  trophyEl.style.display = "none";
}

/* -----------------------------
   ENDING HELPERS (A + C)
-------------------------------- */
function countEvidenceSignals(s) {
  // "Strong evidence" pool (keep small + meaningful)
  const signals = [
    "kennel_vent_sealed",
    "generator_reroute_hab03",
    "crew_movement_contradiction",
    "unknown_power_draw",
    "generator_lock_bypassed",
    "hab03_anomaly",
    "kennel_provocation_failed",
  ];
  return signals.reduce((acc, key) => acc + (s.notes.includes(key) ? 1 : 0), 0);
}

function hasStrongEvidence(s) {
  return (
    s.notes.includes("kennel_vent_sealed") ||
    s.notes.includes("generator_reroute_hab03") ||
    s.notes.includes("crew_movement_contradiction")
  );
}

function trophyEligible(s) {
  // Base requirement: must have confirmed infection
  if (!s.notes.includes("flagged_sample")) return false;

  const conf = confidenceLevel(s);
  const evidenceCount = countEvidenceSignals(s);

  // Confidence-adjusted requirements (Option A)
  // - low/none: need *either* stricter risk OR more evidence
  // - medium/high: default thresholds
  if (conf === "none" || conf === "low") {
    const strictRiskOK = s.infectionRisk <= 1;
    const extraEvidenceOK = hasStrongEvidence(s) && evidenceCount >= 2;
    return strictRiskOK || extraEvidenceOK;
  }

  // medium/high: normal win gate
  return hasStrongEvidence(s) && s.infectionRisk <= 2;
}

function confidenceTagLine(s) {
  const conf = confidenceLevel(s);
  if (conf === "high") return "MODEL CONFIDENCE: HIGH.";
  if (conf === "medium") return "MODEL CONFIDENCE: MEDIUM.";
  if (conf === "low") return "MODEL CONFIDENCE: LOW.";
  return "MODEL CONFIDENCE: UNKNOWN.";
}

/* -----------------------------
   STORY TREE (FINAL)
-------------------------------- */
const story = {
  // ACT I — BOOT
  intro: {
    text: `
OUTPOST 31 PREDICTIVE MODEL v2.3

STATUS: STORM-LOCK
VISIBILITY: NEAR ZERO

ALERT: ANOMALY SIGNATURE DETECTED IN HAB-03.
BEGIN CONTAMINATION ASSESSMENT.

OPERATOR: YOU
    `,
    choices: [
      {
        label: "OPEN STATION CONSOLE",
        next: "console",
        effect: () => {
          state.caution += 1;
        },
      },
    ],
  },

  console: {
    text: (s) => {
      const lines = [];
      lines.push("STATION CONSOLE — CORE SYSTEMS ONLINE\n");
      lines.push(
        `CAUTION: ${s.caution}   PARANOIA: ${s.paranoia}   RISK: ${s.infectionRisk}\n`
      );

      const foundIdNote = s.notes.find((n) =>
        n.startsWith("infected_identity_")
      );
      if (foundIdNote) {
        const id = foundIdNote.replace("infected_identity_", "");
        const crew = BLOOD_ROSTER.find((c) => c.id === id);
        if (crew) lines.push(`INFECTED SAMPLE (CONFIRMED): ${crew.name}\n`);
      }

      if (s.notes.length) {
        lines.push("RECORDED ANOMALIES:");
        s.notes.forEach((n) =>
          lines.push(`- ${n.replace(/_/g, " ")}`.toUpperCase())
        );
        lines.push("");
      }

      lines.push("SELECT A SUBSYSTEM:");
      return lines.join("\n");
    },

    choices: (s) => {
      const out = [
        {
          label: "KENNEL — CAMERA FEED + BEHAVIORAL TEST",
          next: "kennel_intro",
        },
        { label: "LAB — DIAGNOSTICS", next: "lab_intro" },
        { label: "SECURITY PLAYBACK — INCIDENT TIMELINE", next: "logs_intro" },
        { label: "GENERATOR — POWER STABILITY", next: "gen_intro" },
        { label: "CHESS WIZARD — UTILITY PROGRAM", next: "chess_intro" },
      ];

      // DRUNK OPTION: only if paranoia <= 1, no confirmed infection, and not already used
      const alreadyWent = s.notes.includes("went_to_shack");
      const infectionConfirmed = s.infectedFound;

      if (s.paranoia <= 1 && !infectionConfirmed && !alreadyWent) {
        out.push({
          label: "GET UP TO YOUR SHACK AND GET DRUNK",
          next: "drunk_shack",
          effect: () => {
            state.paranoia += 1; // thematic nudge (withdrawal -> isolation -> paranoia)
            logLine("OPTION SELECTED: OPERATOR WITHDRAWS.");
          },
        });
      }

      out.push({
        label: "PROCEED TO FINAL ASSESSMENT",
        next: "final_decision",
      });

      return out;
    },
  },

  // BRANCH — DRUNK SHACK (ALT PATH + ALT DOWNLOAD)
  drunk_shack: {
    text: `
YOU LEAVE THE CONSOLE.

THE HALLWAY IS LONGER THAN IT SHOULD BE.
THE WIND PUSHES AGAINST THE WALLS LIKE IT WANTS IN.

YOUR SHACK IS COLD.
THE BOTTLE IS WARMER THAN YOUR HANDS.

ONE DRINK BECOMES THREE.
THE RADIO HISS SOUNDS LIKE SOMEONE BREATHING.

YOU DO NOT SAVE ANYONE.
YOU DO NOT PROVE ANYTHING.

BUT FOR A LITTLE WHILE,
YOU ARE NOT THINKING.
    `.trim(),
    choices: [
      {
        label: "PASS OUT (RETURN TO CONSOLE)",
        next: "console",
        effect: () => {
          addNote("went_to_shack");
          state.infectionRisk += 1; // immediate cost in addition to passive timer
          maybeTriggerSpread(state);
          logLine("OPERATOR LEFT CONSOLE. STATUS: IMPAIRED.");
        },
      },
    ],
    trophy: () => ({
      title: "TROPHY UNLOCKED: LIQUID COURAGE.",
      href: "assets/drunk-trophy.png",
      filename: "outpost31-liquid-courage.png",
    }),
  },

  // BRANCH — KENNEL
  kennel_intro: {
    text: `
KENNEL FEED: LIVE

THE DOGS ARE RESTLESS.
ONE ANIMAL STANDS PERFECTLY STILL, FACING THE WALL.

THERMAL: SLIGHTLY ELEVATED.
BEHAVIORAL: ABNORMAL.

SELECT ACTION:
    `,
    choices: [
      {
        label: "RUN BEHAVIORAL PROVOCATION TEST (NOISE + LIGHT)",
        next: "kennel_test",
        effect: () => {
          state.caution += 1;
          addNote("flagged_dog_behavior");
        },
      },
      {
        label: "INSPECT VENT ABOVE REAR PEN",
        next: "kennel_vent",
        effect: () => {
          state.caution += 1;
          addNote("kennel_vent_out_of_place");
        },
      },
      {
        label: "MARK KENNEL STABLE AND RETURN",
        next: "console",
        effect: () => {
          state.infectionRisk += 1;
          maybeTriggerSpread(state);
        },
      },
    ],
  },

  kennel_test: {
    text: `
TEST: PROVOCATION (NOISE + LIGHT)

THE PACK REACTS IMMEDIATELY.
THE STILL DOG DOES NOT FLINCH.

THEN—A DELAYED HEAD TURN.
TOO SMOOTH. TOO LATE.

RESULT: ANOMALY CONFIRMED.
    `,
    choices: [
      {
        label: "LOG ANOMALY AND RETURN TO CONSOLE",
        next: "console",
        effect: () => {
          state.paranoia += 1;
          addNote("kennel_provocation_failed");
        },
      },
      {
        label: "ISOLATE KENNEL POWER + LOCK FEED",
        next: "console",
        effect: () => {
          state.caution += 1;
          addNote("kennel_isolated");
          state.infectionRisk = Math.max(0, state.infectionRisk - 1);
        },
      },
    ],
  },

  kennel_vent: {
    text: `
VENT INSPECTION

THE GRATE IS LOOSE.
SCRATCH MARKS ON THE METAL ARE FRESH.

AIRFLOW: OUTBOUND.

RESULT: POSSIBLE TRANSFER PATHWAY.
    `,
    choices: [
      {
        label: "SEAL VENT (REMOTE LOCK) AND LOG",
        next: "console",
        effect: () => {
          state.caution += 1;
          addNote("kennel_vent_sealed");
        },
      },
      {
        label: "LEAVE VENT UNCHANGED AND RETURN",
        next: "console",
        effect: () => {
          state.infectionRisk += 1;
          maybeTriggerSpread(state);
        },
      },
    ],
  },

  // BRANCH — LAB (simplified)
  lab_intro: {
    text: `
LAB DIAGNOSTICS

PHYSICAL TESTING AND ANALYTICAL MODELS
ARE SEPARATE PROTOCOLS.

SELECT OPERATION:
    `,
    choices: [
      {
        label: "CONDUCT MANUAL BLOOD TESTS",
        next: "lab_menu",
        effect: () => {
          state.caution += 1;
        },
      },
      {
        label: "RUN ASSIMILATION SIMULATION",
        next: "lab_sim",
        effect: () => {
          const suff = getDataSufficiency(state);
          addNote("assimilation_model_ran");

          if (suff === "none") {
            state.infectionRisk += 1;
            maybeTriggerSpread(state);
            logLine("WARNING: SIMULATION RUN WITH NO VERIFIED INPUT DATA.");
          } else if (suff === "limited") {
            logLine("NOTICE: LIMITED INPUT DATA — CONFIDENCE REDUCED.");
          } else {
            state.caution += 1;
          }
        },
      },
      {
        label: "RUN BULK ANOMALY SCAN",
        next: "lab_auto",
        effect: () => {
          state.infectionRisk += 1;
          maybeTriggerSpread(state);
        },
      },
      { label: "RETURN TO CONSOLE", next: "console" },
    ],
  },

  lab_menu: {
    text: (s) => {
      const statusLine = (crew) => {
        const v = s.bloodTests[crew.id];
        if (v === "human") return `${crew.name}: NO REACTION (HUMAN)`;
        if (v === "infected")
          return `${crew.name}: VIOLENT REACTION (INFECTED)`;
        const tag =
          crew.status === "archived" ? "ARCHIVED SAMPLE" : "LIVE SAMPLE";
        return `${crew.name}: UNTESTED (${tag})`;
      };

      return [
        "INDIVIDUAL BLOOD TEST CONSOLE\n",
        ...BLOOD_ROSTER.map(statusLine),
        "",
        `BULK SCANS RUN: ${s.bulkScans}`,
        "SELECT SAMPLE / RETEST / EXIT:",
      ].join("\n");
    },

    choices: (s) => {
      const out = [];

      // Untested -> test
      BLOOD_ROSTER.forEach((crew) => {
        if (s.bloodTests[crew.id] === null) {
          out.push({
            label: `TEST ${crew.name}`,
            next: `lab_test_${crew.id}`,
            effect: () => {
              state.caution += 1;
            },
          });
        }
      });

      // Retest option becomes available if bulk scans have been used and infection not yet found
      if (s.bulkScans > 0 && !s.infectedFound) {
        BLOOD_ROSTER.forEach((crew) => {
          if (s.bloodTests[crew.id] === "human") {
            out.push({
              label: `RETEST ${crew.name} (VERIFY)`,
              next: `lab_test_${crew.id}`,
              effect: () => {
                state.caution += 1;
                addNote("verification_requested");
              },
            });
          }
        });
      }

      out.push({
        label: "EXIT TO LAB PROTOCOLS",
        next: "lab_intro",
        effect: () => {
          // mild time pressure if leaving without a confirmed infection
          if (!state.infectedFound) {
            state.infectionRisk += 1;
            maybeTriggerSpread(state);
          }
        },
      });

      return out;
    },
  },

  // Dynamic blood test nodes
  lab_test_macready: makeBloodTestNode("macready"),
  lab_test_garry: makeBloodTestNode("garry"),
  lab_test_windows: makeBloodTestNode("windows"),
  lab_test_nauls: makeBloodTestNode("nauls"),
  lab_test_palmer: makeBloodTestNode("palmer"),
  lab_test_norris: makeBloodTestNode("norris"),
  lab_test_copper: makeBloodTestNode("copper"),
  lab_test_clark: makeBloodTestNode("clark"),
  lab_test_fuchs: makeBloodTestNode("fuchs"),
  lab_test_bennings: makeBloodTestNode("bennings"),

  lab_sim: {
    text: (s) => {
      const vals = Object.values(s.bloodTests);
      const total = vals.length;
      const tested = vals.filter((v) => v !== null).length;
      const infected = vals.filter((v) => v === "infected").length;
      const healthy = vals.filter((v) => v === "human").length;
      const untested = total - tested;

      const lines = [];
      lines.push("ASSIMILATION SIMULATION v1.3");

      const suff = getDataSufficiency(s);
      if (suff === "none") {
        lines.push("INPUT STATUS: DATA INSUFFICIENT");
        lines.push("MODEL REQUESTS MORE DATA.");
      } else if (suff === "limited") {
        lines.push("INPUT STATUS: LIMITED DATA SET");
        lines.push("MODEL REQUESTS ADDITIONAL SAMPLES.");
      } else {
        lines.push("INPUT STATUS: VERIFIED SAMPLES PRESENT");
        lines.push("MODEL READY.");
      }
      lines.push("");

      lines.push(`SAMPLE POOL: ${total}   |   BULK SCANS: ${s.bulkScans}`);
      lines.push(`HEALTHY: ${healthy}   |   INFECTIONS: ${infected}`);
      lines.push(`UNTESTED SAMPLES: ${untested}`);
      lines.push(
        `ELAPSED: 00:00:XX   |   FIRST INFECTION: ${
          infected ? "DETECTED" : "NO EVENT LOGGED"
        }`
      );
      lines.push("");

      if (!tested) {
        lines.push("MODEL WARNING: NO CONFIRMED INPUT DATA.");
        lines.push("FORECAST: UNRELIABLE.");
      } else if (infected && untested === 0) {
        lines.push("MODEL OUTPUT: ACTIVE INFECTION CONFIRMED.");
        lines.push("SPREAD POTENTIAL: LOW IF SUBJECTS NEUTRALIZED.");
      } else if (infected && untested > 0) {
        lines.push("MODEL OUTPUT: ACTIVE INFECTION CONFIRMED.");
        lines.push("UNKNOWN CARRIERS POSSIBLE. ISOLATION ADVISED.");
      } else if (!infected && untested > 0) {
        lines.push("MODEL OUTPUT: NO CONFIRMED INFECTION IN TESTED SET.");
        lines.push("NON-ZERO PROBABILITY REMAINS DUE TO UNTESTED VIALS.");
      } else {
        lines.push("MODEL OUTPUT: ALL TESTED SAMPLES REGISTER HUMAN.");
        lines.push("NO GUARANTEE OF FUTURE EVENTS.");
      }

      if (s.notes.includes("false_negative_possible")) {
        lines.push("");
        lines.push("MODEL WARNING: SENSOR RELIABILITY DEGRADED.");
        lines.push("RETEST RECOMMENDED.");
      }

      lines.push("\nSIMULATION IDLE.");
      return lines.join("\n");
    },
    choices: [
      { label: "RETURN TO LAB PROTOCOLS", next: "lab_intro" },
      { label: "RETURN TO CONSOLE", next: "console" },
    ],
  },

  lab_auto: {
    text: `
BULK ANOMALY SCAN INITIATED...

FOR ONE CYCLE: ALL VIALS READ CONTAMINATED.
THEN: STATUS — NO ANOMALY DETECTED.

LOG INSISTS: NO ERROR OCCURRED.
    `,
    choices: [
      {
        label: "LOG AS SUSPICIOUS AND RETURN",
        next: "lab_intro",
        effect: () => {
          state.bulkScans += 1;
          addNote("lab_visual_anomaly");
          state.caution += 1;
          logLine("BULK SCAN: ANOMALOUS READINGS LOGGED.");
        },
      },
      {
        label: "ACCEPT ALL-CLEAR AND RETURN",
        next: "lab_intro",
        effect: () => {
          state.bulkScans += 1;
          state.infectionRisk += 2;
          maybeTriggerSpread(state);
          logLine("BULK SCAN: ALL-CLEAR ACCEPTED (RISK INCREASED).");
        },
      },
    ],
  },

  // BRANCH — SECURITY PLAYBACK
  logs_intro: {
    text: `
SECURITY PLAYBACK — INCIDENT TIMELINE

SOURCE: INTERNAL CAMERAS + HALLWAY SENSORS
STATUS: DEGRADED / DROPPED FRAMES

YOU ARE NOT READING A LOG.
YOU ARE SCRUBBING THROUGH CORRUPTED FOOTAGE.

SELECT A PLAYBACK QUERY:
    `,
    choices: [
      {
        label: "PLAYBACK: LAST 4 HOURS (FAST SCRUB)",
        next: "logs_recent",
        effect: () => {
          state.caution += 1;
        },
      },
      {
        label: "FILTER FEED: HAB-03",
        next: "logs_hab03",
        effect: () => {
          state.caution += 1;
        },
      },
      {
        label: "FILTER FEED: KENNEL",
        next: "logs_kennel",
        effect: () => {
          state.caution += 1;
        },
      },
      { label: "RETURN TO CONSOLE", next: "console" },
    ],
  },

  logs_recent: {
    text: (s) => {
      const subject = getPlaybackSubject(s);
      const name = subject.name;

      return `
PLAYBACK: LAST 4 HOURS (FAST SCRUB)

TIME CODE STUTTERS.
FRAMES SKIP.
AUDIO IS GONE.

00:41 — CAM: HALL-2
${name} AT SUPPLY LOCKER. MOUTH MOVES (NO AUDIO).

00:49 — SENSOR: GEN-LOAD
POWER SPIKE. CAMERA WHITE-OUT FOR 2 SECONDS.

00:52 — CAM: MESS
${name} ENTERS FRAME.

00:53 — CAM: STORAGE
${name} ENTERS FRAME. (NO TRANSITION SHOWN.)

00:54 — CAM: HAB-03
${name} ENTERS FRAME.
(CAMERA FEED WAS OFFLINE 00:52–00:54.)

NOTE:
ONE PERSON CANNOT BE IN THREE PLACES
WITHIN TWO MINUTES.

THE SYSTEM STITCHES THIS TOGETHER
LIKE IT WAS NORMAL.
IT IS NOT NORMAL.
      `.trim();
    },
    choices: [
      {
        label: "FLAG TIMELINE CONTRADICTION",
        next: "logs_intro",
        effect: () => {
          addNote("crew_movement_contradiction");
          state.paranoia += 1;
        },
      },
    ],
  },

  logs_hab03: {
    text: `
FILTER: HAB-03

CAM: HAB-03 DOOR
TIME: 00:XX (CORRUPTED)

THE DOOR OPENS FROM INSIDE.
NO ENTRY EVENT RECORDED.

THERMAL OVERLAY CUTS IN:
A HUMAN SHAPE — BUT THE HEAT SIGNATURE IS WRONG.
LIKE SOMEONE DRAWN IN BLUE INK.

THE SYSTEM TAGS THE CLIP:
"NON-URGENT — SENSOR DRIFT."
    `,
    choices: [
      {
        label: "FLAG HAB-03 FEED AS ANOMALOUS",
        next: "logs_intro",
        effect: () => {
          addNote("hab03_anomaly");
          state.caution += 1;
        },
      },
    ],
  },

  logs_kennel: {
    text: `
FILTER: KENNEL

CAM: KEN-1
FEED DROPS FOR 17 SECONDS.
AUTO-RESTORE ENGAGED.

THE MISSING FRAMES ARE NOT BLACK.
THEY ARE MARKED: "EMPTY."

WHEN THE FEED RETURNS,
THE DOGS ARE IN DIFFERENT POSITIONS.
NO MOTION IS SHOWN IN BETWEEN.

THE SYSTEM INSISTS:
"NO CAUSE FOUND."
    `,
    choices: [
      {
        label: "FLAG KENNEL FEED DROP",
        next: "logs_intro",
        effect: () => {
          addNote("kennel_feed_drop");
          state.paranoia += 1;
        },
      },
    ],
  },

  // BRANCH — GENERATOR
  gen_intro: {
    text: `
GENERATOR CONTROL

OUTPUT FLUCTUATION: MODERATE
HEAT BLEED: LOW
ROUTING TABLE: MODIFIED

SELECT ACTION:
    `,
    choices: [
      {
        label: "VIEW ROUTING TABLE",
        next: "gen_routes",
        effect: () => {
          state.caution += 1;
        },
      },
      {
        label: "RUN LOAD TEST (RISKY)",
        next: "gen_loadtest",
        effect: () => {
          state.infectionRisk += 1;
          maybeTriggerSpread(state);
        },
      },
      {
        label: "LOCK ROUTING CHANGES",
        next: "gen_lock",
        effect: () => {
          state.caution += 1;
        },
      },
      { label: "RETURN TO CONSOLE", next: "console" },
    ],
  },

  gen_routes: {
    text: `
ROUTING TABLE

PRIMARY: HAB-01, LAB, KITCHEN
SECONDARY: KENNEL, STORAGE

ANOMALY:
A NEW ROUTE FEEDS HAB-03 AT 3X NORMAL POWER.

TAG: "MAINTENANCE"
SIGNATURE: INVALID
    `,
    choices: [
      {
        label: "LOG UNAUTHORIZED ROUTE",
        next: "gen_intro",
        effect: () => {
          addNote("generator_reroute_hab03");
          state.paranoia += 1;
        },
      },
    ],
  },

  gen_loadtest: {
    text: `
LOAD TEST INITIATED

NEEDLE SHAKES.
LIGHTS DIM.
A DISTANT METAL GROAN FROM SOMEWHERE IN THE WALLS.

FOR ONE MOMENT, THE MONITOR SHOWS:
"ADDITIONAL DRAW: UNKNOWN DEVICE"

THEN IT VANISHES.
    `,
    choices: [
      {
        label: "ABORT TEST AND LOG",
        next: "gen_intro",
        effect: () => {
          addNote("unknown_power_draw");
          state.paranoia += 1;
        },
      },
      {
        label: "IGNORE AND RETURN TO CONSOLE",
        next: "console",
        effect: () => {
          state.infectionRisk += 1;
          maybeTriggerSpread(state);
        },
      },
    ],
  },

  gen_lock: {
    text: `
ROUTING LOCK ENGAGED

CHANGES REQUIRE TWO-PERSON AUTHORIZATION.

THE SYSTEM ACCEPTS YOUR COMMAND.
A SECOND LATER, IT PROMPTS:

"AUTHORIZATION CONFIRMED."

YOU DID NOT ENTER A SECOND SIGNATURE.
    `,
    choices: [
      {
        label: "LOG IMPLICIT AUTHORIZATION",
        next: "console",
        effect: () => {
          addNote("generator_lock_bypassed");
          state.paranoia += 1;
        },
      },
    ],
  },

  // BRANCH — CHESS WIZARD
  chess_intro: {
    text: `
CHESS WIZARD v1.0

A BLUE BOARD.
CLEAN PIECES.
THE PROGRAM IS ALREADY THINKING.

PROMPT: MAKE A MOVE.
    `,
    choices: [
      { label: "MAKE A SAFE MOVE", next: "chess_safe" },
      { label: "MAKE AN AGGRESSIVE MOVE", next: "chess_aggressive" },
      { label: "QUIT CHESS WIZARD", next: "console" },
    ],
  },

  chess_safe: {
    text: `
YOU PLAY CONSERVATIVELY.

THE PROGRAM RESPONDS IMMEDIATELY.
A TRAP YOU DID NOT SEE.

"CHECK."

THE CURSOR BLINKS, PATIENT AND SURE.
    `,
    choices: [
      {
        label: "ANALYZE PROGRAM'S LAST MOVE",
        next: "chess_analyze",
        effect: () => {
          state.caution += 1;
        },
      },
      { label: "RETURN TO CONSOLE", next: "console" },
    ],
  },

  chess_aggressive: {
    text: `
YOU SACRIFICE A PIECE FOR POSITION.

THE PROGRAM PAUSES LONGER THIS TIME.
THEN—A PERFECT RESPONSE.

"CHECKMATE IN 3."

IT ISN'T BRAGGING.
IT'S A FORECAST.
    `,
    choices: [
      {
        label: "STARE AT THE BOARD (TOO LONG)",
        next: "chess_glitch",
        effect: () => {
          state.paranoia += 1;
        },
      },
      { label: "RETURN TO CONSOLE", next: "console" },
    ],
  },

  chess_analyze: {
    text: `
ANALYSIS MODE

THE PROGRAM HIGHLIGHTS THREE LINES:
- SACRIFICE
- ISOLATION
- BURN IT ALL

A MESSAGE APPEARS:
"TO WIN, REMOVE OPTIONS."

FOR A MOMENT, THAT FEELS LIKE ADVICE.
    `,
    choices: [
      {
        label: "LOG STRATEGIC NOTE",
        next: "console",
        effect: () => {
          addNote("chess_strategy_hint");
          state.caution += 1;
        },
      },
    ],
  },

  chess_glitch: {
    text: `
THE BOARD FLICKERS.

FOR ONE FRAME, THE PIECES ARE WRONG.
NOT CHESS. NOT EVEN GAMES.

TEXT PRINTS OVER ITSELF:

"CHECKMATE IS INEVITABLE"
"CHECKMATE IS INEVITABLE"
"CHECKMATE IS INEVITABLE"
    `,
    choices: [
      {
        label: "FORCE QUIT AND RETURN",
        next: "console",
        effect: () => {
          addNote("chess_glitch_message");
          state.paranoia += 1;
        },
      },
    ],
  },

  // ACT III — FINAL ASSESSMENT
  final_decision: {
    text: (s) => {
      const lines = [];
      lines.push("FINAL ASSESSMENT REQUIRED.\n");

      const evidenceLines = [];
      if (s.notes.includes("flagged_sample"))
        evidenceLines.push("- INFECTED BLOOD CONFIRMED.");
      if (s.notes.includes("assimilation_model_ran"))
        evidenceLines.push("- ASSIMILATION MODEL CONSULTED.");
      if (s.notes.includes("kennel_vent_sealed"))
        evidenceLines.push("- KENNEL VENT SEALED.");
      if (
        s.notes.includes("kennel_provocation_failed") ||
        s.notes.includes("flagged_dog_behavior")
      )
        evidenceLines.push("- KENNEL ANOMALY OBSERVED.");
      if (s.notes.includes("crew_movement_contradiction"))
        evidenceLines.push("- TIMELINE CONTRADICTION (PLAYBACK).");
      if (
        s.notes.includes("generator_reroute_hab03") ||
        s.notes.includes("unknown_power_draw") ||
        s.notes.includes("generator_lock_bypassed")
      )
        evidenceLines.push("- GENERATOR SABOTAGE SIGNALS.");
      if (s.notes.includes("false_negative_possible"))
        evidenceLines.push(
          "- TEST RELIABILITY COMPROMISED (POSSIBLE FALSE NEGATIVE)."
        );
      if (s.notes.includes("secondary_infection_possible"))
        evidenceLines.push("- SECONDARY INFECTION POSSIBLE.");

      if (evidenceLines.length) {
        lines.push("EVIDENCE SUMMARY:");
        evidenceLines.forEach((l) => lines.push(l));
        lines.push("");
      } else {
        lines.push("EVIDENCE SUMMARY: INSUFFICIENT.\n");
      }

      // Option C: confidence tone
      lines.push(confidenceTagLine(s));
      lines.push("");

      lines.push("SELECT PROTOCOL:");
      return lines.join("\n");
    },
    choices: [
      { label: "LOCK DOWN + BURN CONTAINMENT", next: "ending_lockdown" },
      { label: "AUTHORIZE EVACUATION", next: "ending_evac" },
      { label: "PERMANENT ISOLATION", next: "ending_isolation" },
      { label: "OVERRIDE SIMULATION", next: "ending_override" },
      { label: "RETURN TO CONSOLE", next: "console" },
    ],
  },

  // ENDINGS
  ending_lockdown: {
    text: (s) => {
      const eligible = trophyEligible(s);
      const conf = confidenceLevel(s);

      if (eligible) {
        const extraLine =
          conf === "high" || conf === "medium"
            ? "TRANSFER PATHS SEALED.\nROUTING LOCKED."
            : "TRANSFER PATHS SEALED (UNVERIFIED).\nROUTING LOCKED (CONFIDENCE: LOW).";

        return `
LOCKDOWN ENGAGED.
CONTAINMENT PROTOCOLS ACTIVE.

SUBJECT IDENTIFIED.
${extraLine}

RESULT: CONTAINMENT SUCCESSFUL.
TROPHY AUTHORIZED.
${confidenceTagLine(s)}
        `.trim();
      }

      const doubt =
        conf === "none" || conf === "low"
          ? "THE MODEL HESITATES.\nTHE ROOM DOES NOT."
          : "THE MODEL DOES NOT OBJECT.\nTHAT DOES NOT MEAN IT AGREES.";

      return `
LOCKDOWN ENGAGED.
CONTAINMENT PROTOCOLS ACTIVE.

YOU BURN ROOMS THAT LOOK EMPTY.
YOU SEAL DOORS THAT STILL FEEL WARM.

${doubt}

RESULT: CONTAINMENT INCONCLUSIVE.
NO SIGNALS LEAVE THIS COORDINATE.
${confidenceTagLine(s)}
      `.trim();
    },
    choices: [{ label: "RESTART SIMULATION", next: "intro" }],
    ending: "good",
    shouldShowTrophy: (s) => trophyEligible(s),
  },

  ending_evac: {
    text: (s) => {
      const identified = s.notes.includes("flagged_sample");
      const risky = s.infectionRisk >= 3 || !identified;
      const conf = confidenceLevel(s);

      if (risky) {
        return `
EVACUATION AUTHORIZED.

CLEARANCE INCOMPLETE.
THE WIND ERASES FOOTPRINTS BEFORE YOU CAN COUNT THEM.

RESULT: CONTAINMENT BREACH PROBABLE.
${confidenceTagLine(s)}
        `.trim();
      }

      const tone =
        conf === "high" || conf === "medium"
          ? "TRANSFER PATHS PARTIALLY CONTROLLED."
          : "TRANSFER PATHS PARTIALLY CONTROLLED (UNVERIFIED).";

      return `
EVACUATION AUTHORIZED.

INFECTED SUBJECT IDENTIFIED PRIOR TO DEPARTURE.
${tone}

RESULT: LOW RESIDUAL RISK.
${confidenceTagLine(s)}
      `.trim();
    },
    choices: [{ label: "RESTART SIMULATION", next: "intro" }],
    ending: true,
  },

  ending_isolation: {
    text: (s) => {
      const highParanoia = s.paranoia >= 3;
      const hasSomeEvidence = s.notes.length >= 2;
      const conf = confidenceLevel(s);

      if (highParanoia && !hasSomeEvidence) {
        return `
PERMANENT ISOLATION SELECTED.

YOU LOCK THE DOORS.
YOU POWER DOWN THE RADIOS.
YOU SIT WITH YOUR BACK TO THE WALL.

OUTSIDE: WHITE.
INSIDE: QUIET.

RESULT: PSYCHOLOGICAL FAILURE.
${confidenceTagLine(s)}
        `.trim();
      }

      const tone =
        conf === "none" || conf === "low"
          ? "SPREAD CONTAINED (UNCONFIRMED)."
          : "SPREAD CONTAINED.";

      return `
PERMANENT ISOLATION SELECTED.

YOU CUT THE ROUTES.
YOU BURY THE KEYS.
YOU WAIT FOR THE STORM TO END.

RESULT: ${tone}
SURVIVAL: UNKNOWN.
${confidenceTagLine(s)}
      `.trim();
    },
    choices: [{ label: "RESTART SIMULATION", next: "intro" }],
    ending: true,
  },

  ending_override: {
    text: (s) => {
      const noEvidence = s.notes.length === 0;
      const veryRisky = s.infectionRisk >= 4;
      const chessGlitch = s.notes.includes("chess_glitch_message");

      if ((noEvidence && veryRisky) || chessGlitch) {
        return `
OVERRIDE ACCEPTED.

THE SCREEN GOES BLACK FOR HALF A SECOND.
WHEN IT RETURNS, THE CURSOR IS ALREADY MOVING.

PROMPT:
"THANK YOU, OPERATOR."

RESULT: OPERATOR COMPROMISED.
${confidenceTagLine(s)}
        `.trim();
      }

      return `
OVERRIDE ACCEPTED.

THE SIMULATION SHUDDERS.
FRAMES DROP.
THE STATION MAP RE-DRAWS ITSELF WRONG.

RESULT: TERMINATION INCOMPLETE.
THE SYSTEM DOES NOT CLOSE ITS EYES.
${confidenceTagLine(s)}
      `.trim();
    },
    choices: [{ label: "RESTART SIMULATION", next: "intro" }],
    ending: true,
  },
};

/* -----------------------------
   UI: METERS (WITH FX)
-------------------------------- */
let meterEls = null;
let lastMeterValues = { caution: 0, paranoia: 0, risk: 0 };

const METER_MAX = 10;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function blip(trackEl, direction) {
  if (!trackEl) return;
  const cls = direction === "up" ? "blip-up" : "blip-down";
  trackEl.classList.remove("blip-up", "blip-down");
  void trackEl.offsetWidth; // retrigger
  trackEl.classList.add(cls);
  setTimeout(() => trackEl.classList.remove(cls), 220);
}

let hudEl, hudRightEl, screenEl;

function jitterHud() {
  if (!hudEl) return;
  hudEl.classList.remove("crt-jitter");
  void hudEl.offsetWidth;
  hudEl.classList.add("crt-jitter");
  setTimeout(() => hudEl.classList.remove("crt-jitter"), 280);
}

function updateMeters() {
  if (!meterEls) return;

  const c = clamp(state.caution, 0, METER_MAX);
  const p = clamp(state.paranoia, 0, METER_MAX);
  const r = clamp(state.infectionRisk, 0, METER_MAX);

  const toPct = (v) => `${(v / METER_MAX) * 100}%`;

  meterEls.cautionFill.style.width = toPct(c);
  meterEls.paranoiaFill.style.width = toPct(p);
  meterEls.riskFill.style.width = toPct(r);

  meterEls.cautionVal.textContent = c;
  meterEls.paranoiaVal.textContent = p;
  meterEls.riskVal.textContent = r;

  meterEls.cautionTrack.setAttribute("aria-valuenow", String(c));
  meterEls.paranoiaTrack.setAttribute("aria-valuenow", String(p));
  meterEls.riskTrack.setAttribute("aria-valuenow", String(r));

  // Blips on change
  if (c !== lastMeterValues.caution)
    blip(meterEls.cautionTrack, c > lastMeterValues.caution ? "up" : "down");
  if (p !== lastMeterValues.paranoia)
    blip(meterEls.paranoiaTrack, p > lastMeterValues.paranoia ? "up" : "down");
  if (r !== lastMeterValues.risk) {
    blip(meterEls.riskTrack, r > lastMeterValues.risk ? "up" : "down");
    if (r > lastMeterValues.risk) jitterHud(); // CRT jitter on risk spikes
  }

  lastMeterValues = { caution: c, paranoia: p, risk: r };

  // Risk meter states
  const riskMeter = document.querySelector('.meter[data-meter="risk"]');
  if (riskMeter) {
    riskMeter.classList.toggle("danger", r >= 7);
    riskMeter.classList.toggle("critical", r >= 10);
  }
}

/* -----------------------------
   PASSIVE RISK TIMER (5 MIN + LOG)
-------------------------------- */
// Safe to register immediately; it no-ops until the HUD exists
setInterval(() => {
  if (!hudEl) return; // don't tick before game starts

  state.infectionRisk += 1;
  maybeTriggerSpread(state);
  updateMeters();
  logLine("TIME ELAPSED: RISK INCREASED.");
}, 5 * 60 * 1000);

/* -----------------------------
   RENDERER (PROMPT LIST)
-------------------------------- */
let selectedIndex = 0;
let activeChoices = [];
let activeNodeId = null;

let startMs = Date.now();

function updateHudTime() {
  if (!hudRightEl) return;
  const s = Math.floor((Date.now() - startMs) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  hudRightEl.textContent = `TIME: 00:${mm}:${ss}`;
}
setInterval(updateHudTime, 250);

function setSelected(i) {
  selectedIndex = i;
  const items = screenEl.querySelectorAll(".choice");
  items.forEach((el, idx) => {
    el.setAttribute("aria-selected", idx === selectedIndex ? "true" : "false");
    const marker = el.querySelector(".marker");
    if (marker) marker.textContent = idx === selectedIndex ? ">" : " ";
  });
}

function activateChoice(i) {
  const choice = activeChoices[i];
  if (!choice) return;

  const node = story[activeNodeId];
  if (choice.effect) choice.effect(state);

  if (node?.ending && choice.next === "intro") {
    resetState();
    startMs = Date.now();
    logLine("SIMULATION RESET.");
  }

  renderNode(choice.next);
}

function onKeyDown(e) {
  // While splash exists: Enter starts game
  if (document.getElementById("splash")) {
    if (e.key === "Enter") {
      e.preventDefault();
      startGame();
    }
    return;
  }

  if (!activeChoices.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    setSelected((selectedIndex + 1) % activeChoices.length);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setSelected(
      (selectedIndex - 1 + activeChoices.length) % activeChoices.length
    );
  } else if (e.key === "Enter") {
    e.preventDefault();
    activateChoice(selectedIndex);
  }
}
document.addEventListener("keydown", onKeyDown);

function renderChoiceList(choiceDefs) {
  activeChoices = choiceDefs;
  selectedIndex = 0;

  const list = document.createElement("div");
  list.id = "choices";
  list.setAttribute("role", "listbox");

  choiceDefs.forEach((c, idx) => {
    const row = document.createElement("div");
    row.className = "choice";
    row.setAttribute("role", "option");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-selected", idx === 0 ? "true" : "false");

    row.innerHTML = `
      <span class="marker">${idx === 0 ? ">" : " "}</span>
      <span>${c.label}</span>
    `;

    row.addEventListener("mouseenter", () => setSelected(idx));
    row.addEventListener("click", () => activateChoice(idx));

    list.appendChild(row);
  });

  return list;
}

function renderNode(nodeId) {
  const node = story[nodeId];
  activeNodeId = nodeId;

  const text = typeof node.text === "function" ? node.text(state) : node.text;
  const choiceDefs =
    typeof node.choices === "function" ? node.choices(state) : node.choices;

  // Trophy visibility / per-node trophy
  if (node.trophy) {
    setTrophy(node.trophy(state));
  } else if (node.ending === "good") {
    const showTrophy =
      typeof node.shouldShowTrophy === "function"
        ? node.shouldShowTrophy(state)
        : true;

    if (showTrophy) {
      setTrophy({
        title: "SIMULATION RESULT: HUMAN.",
        href: "assets/trophy.png",
        filename: "outpost31-clearance.png",
      });
    } else {
      hideTrophy();
    }
  } else {
    hideTrophy();
  }

  // Special-case lab_sim: show assimilation GIF above output
  if (nodeId === "lab_sim") {
    screenEl.innerHTML = `
      <img class="sprite" src="assets/assimilation-sim.gif" alt="ASSIMILATION SIMULATION" />
      <pre id="output"></pre>
    `;
  } else {
    screenEl.innerHTML = `<pre id="output"></pre>`;
  }

  const outputEl = document.getElementById("output");
  outputEl.textContent = text.trim();

  screenEl.appendChild(renderChoiceList(choiceDefs));
  setSelected(0);

  updateMeters();
}

/* -----------------------------
   SPLASH → BOOT GAME UI
-------------------------------- */
function startGame() {
  const splash = document.getElementById("splash");
  if (splash) splash.remove();

  app.innerHTML = `
    <div class="hud" id="hud">
      <div class="hudLeft">
        <div><strong>OUTPOST 31</strong> / ASSIMILATION MODEL</div>

        <div class="meters" aria-label="Simulation meters">
          <div class="meter" data-meter="caution">
            <div class="meterTop">
              <span class="meterLabel">CAUTION</span>
              <span class="meterValue" id="meterCautionVal">0</span>
            </div>
            <div class="meterTrack" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="0">
              <div class="meterFill" id="meterCautionFill"></div>
            </div>
          </div>

          <div class="meter" data-meter="paranoia">
            <div class="meterTop">
              <span class="meterLabel">PARANOIA</span>
              <span class="meterValue" id="meterParanoiaVal">0</span>
            </div>
            <div class="meterTrack" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="0">
              <div class="meterFill" id="meterParanoiaFill"></div>
            </div>
          </div>

          <div class="meter" data-meter="risk">
            <div class="meterTop">
              <span class="meterLabel">RISK</span>
              <span class="meterValue" id="meterRiskVal">0</span>
            </div>
            <div class="meterTrack" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="0">
              <div class="meterFill" id="meterRiskFill"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="hudRight">
        <div id="hudRight">TIME: 00:00:00</div>
      </div>
    </div>

    <div id="screen"></div>

    <div id="trophy" style="display:none;"></div>

    <div class="logline" id="logline" aria-live="polite">
      <span data-log="msg">SYSTEM READY.</span>
      <span data-log="ts">--:--:--</span>
    </div>
  `;

  hudEl = document.getElementById("hud");
  hudRightEl = document.getElementById("hudRight");
  screenEl = document.getElementById("screen");
  trophyEl = document.getElementById("trophy");
  logEl = document.getElementById("logline");

  meterEls = {
    cautionFill: document.getElementById("meterCautionFill"),
    paranoiaFill: document.getElementById("meterParanoiaFill"),
    riskFill: document.getElementById("meterRiskFill"),
    cautionVal: document.getElementById("meterCautionVal"),
    paranoiaVal: document.getElementById("meterParanoiaVal"),
    riskVal: document.getElementById("meterRiskVal"),
    cautionTrack: document.querySelector(
      '.meter[data-meter="caution"] .meterTrack'
    ),
    paranoiaTrack: document.querySelector(
      '.meter[data-meter="paranoia"] .meterTrack'
    ),
    riskTrack: document.querySelector('.meter[data-meter="risk"] .meterTrack'),
  };

  resetState();
  startMs = Date.now();
  lastMeterValues = { caution: 0, paranoia: 0, risk: 0 };

  logLine("SYSTEM READY. SIMULATION ONLINE.");
  updateMeters();
  renderNode("intro");
}

// Splash interactions
enterPrompt?.addEventListener("click", startGame);
enterPrompt?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") startGame();
});

/* blood.js
   =========================================
   Blood roster, infection mechanics, tests
   ========================================= */

import { state, addNote, logLine } from "./state.js";

/* -----------------------------
   BLOOD ROSTER
-------------------------------- */
export const BLOOD_ROSTER = [
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

/* -----------------------------
   RANDOM HELPERS
-------------------------------- */
export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickRandomMany(arr, count) {
  const pool = [...arr];
  const out = [];
  while (pool.length && out.length < count) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/* -----------------------------
   FALSE NEGATIVE PROBABILITY
-------------------------------- */
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

/* -----------------------------
   BLOOD SYSTEM INIT
-------------------------------- */
export function initBloodSystem() {
  state.bloodTests = Object.fromEntries(BLOOD_ROSTER.map((c) => [c.id, null]));

  // ALWAYS 1 infected at start (random who, not whether)
  const ids = BLOOD_ROSTER.map((c) => c.id);
  state.infectedIds = pickRandomMany(ids, 1);

  state.infectedFound = false;
  state.bulkScans = 0;
  state.falseNegativeUsed = {}; // { crewId: true }
  state.spreadTriggered = false; // prevents multiple spreads beyond 2 infected
  state.pendingBloodOutcome = null;
}

/* -----------------------------
   SPREAD MECHANICS
-------------------------------- */
export function maybeTriggerSpread(s) {
  if (s.spreadTriggered) return;
  if (s.infectedIds.length >= 2) return;
  if (s.infectionRisk < 5) return; // Raised threshold from 3 to 5

  const chance =
    // Reduced spread probabilities for fairer gameplay
    s.infectionRisk >= 7 ? 0.8 : s.infectionRisk === 6 ? 0.5 : 0.3; // at 5

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

/* -----------------------------
   DATA SUFFICIENCY / CONFIDENCE
-------------------------------- */
export function getDataSufficiency(s) {
  const testedCount = Object.values(s.bloodTests).filter(
    (v) => v !== null
  ).length;
  if (testedCount === 0) return "none";
  if (testedCount === 1) return "limited";
  return "sufficient";
}

export function confidenceLevel(s) {
  const tested = Object.values(s.bloodTests).filter((v) => v !== null).length;
  if (tested === 0) return "none";
  if (tested === 1) return "low";
  if (tested <= 3) return "medium";
  return "high";
}

export function confidenceTagLine(s) {
  const conf = confidenceLevel(s);
  if (conf === "high") return "MODEL CONFIDENCE: HIGH.";
  if (conf === "medium") return "MODEL CONFIDENCE: MEDIUM.";
  if (conf === "low") return "MODEL CONFIDENCE: LOW.";
  return "MODEL CONFIDENCE: UNKNOWN.";
}

/* -----------------------------
   BLOOD TEST OUTCOME
-------------------------------- */
export function computeAndStoreBloodOutcome(s, crewId) {
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

export function applyPendingBloodOutcome(crewId) {
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
   PLAYBACK SUBJECT (SECURITY FEED)
-------------------------------- */
export function getPlaybackSubject(s) {
  // Prefer infected if available (always at least 1 infected)
  if (s.infectedIds && s.infectedIds.length > 0) {
    const id = pickRandom(s.infectedIds);
    return BLOOD_ROSTER.find((c) => c.id === id) || pickRandom(BLOOD_ROSTER);
  }
  return pickRandom(BLOOD_ROSTER);
}

/* -----------------------------
   BLOOD TEST NODE FACTORY
-------------------------------- */
export function makeBloodTestNode(crewId) {
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

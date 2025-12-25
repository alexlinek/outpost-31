/* story.js
   =========================================
   The story tree with all nodes/scenes
   ========================================= */

import { state, addNote, logLine } from "./state.js";
import { displayDifficultyLabel, requiredEvidenceCount } from "./state.js";
import {
  BLOOD_ROSTER,
  makeBloodTestNode,
  maybeTriggerSpread,
  getDataSufficiency,
  getPlaybackSubject,
  confidenceTagLine,
} from "./blood.js";

/* -----------------------------
   ENDING EVALUATION
-------------------------------- */
const STRONG_EVIDENCE_KEYS = [
  "kennel_provocation_failed",
  "crew_movement_contradiction",
  "generator_reroute_hab03",
];

export function countStrongEvidence(s) {
  return STRONG_EVIDENCE_KEYS.reduce(
    (acc, key) => acc + (s.notes.includes(key) ? 1 : 0),
    0
  );
}

export function countEvidenceSignals(s) {
  const signals = [
    ...STRONG_EVIDENCE_KEYS,
    "unknown_power_draw",
    "generator_lock_bypassed",
    "hab03_anomaly",
    "kennel_feed_drop",
    "flagged_dog_behavior",
    "lab_visual_anomaly",
    "false_negative_possible",
    "secondary_infection_possible",
  ];
  return signals.reduce((acc, key) => acc + (s.notes.includes(key) ? 1 : 0), 0);
}

export function containmentSuccess(s) {
  const strongCount = countStrongEvidence(s);
  const required = requiredEvidenceCount(s.difficulty);
  return s.infectedFound && strongCount >= required && s.infectionRisk <= 2;
}

/* -----------------------------
   STORY TREE
-------------------------------- */
export const story = {
  intro: {
    text: `
U.S. OUTPOST 31 PREDICTIVE MODEL v2.3

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
        `RIGOR: ${displayDifficultyLabel(
          s.difficulty
        )}  |  STRONG EVIDENCE REQUIRED: ${requiredEvidenceCount(
          s.difficulty
        )}/3`
      );
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
      ];

      // Chess Wizard disappears if you pour whiskey on it
      if (!s.notes.includes("chess_wizard_ruined")) {
        out.push({
          label: "CHESS WIZARD — UTILITY PROGRAM",
          next: "chess_intro",
        });
      } else {
        out.push({ label: "CHESS WIZARD — OFFLINE", next: "chess_offline" });
      }

      // Shack option: PARANOIA ≤ 2, no confirmed infection, and not already used
      const alreadyWent = s.notes.includes("went_to_shack");
      const infectionConfirmed = s.infectedFound;

      if (s.paranoia <= 2 && !infectionConfirmed && !alreadyWent) {
        out.push({
          label: "GET UP TO YOUR SHACK AND GET DRUNK",
          next: "drunk_shack",
          effect: () => {
            logLine("OPTION SELECTED: OPERATOR WITHDRAWS.");
          },
        });
      }

      out.push({ label: "FINAL ASSESSMENT", next: "final_assessment" });
      return out;
    },
  },

  // SHACK: modifier, not ending (easter egg download lives on this node only)
  drunk_shack: {
    text: `
YOU LEAVE THE CONSOLE.

THE HALLWAY IS LONGER THAN IT SHOULD BE.
THE WIND PUSHES AGAINST THE WALLS LIKE IT WANTS IN.

YOUR SHACK IS COLD.
THE BOTTLE IS WARMER THAN YOUR HANDS.

ONE DRINK BECOMES THREE.
THE RADIO HISS SOUNDS LIKE SOMEONE BREATHING.

YOU DO NOT PROVE ANYTHING.
YOU DO NOT SAVE ANYONE.

BUT FOR A LITTLE WHILE,
YOU ARE NOT THINKING.
    `.trim(),
    choices: [
      {
        label: "STUMBLE BACK TO THE CONSOLE",
        next: "console",
        effect: () => {
          addNote("went_to_shack");
          state.infectionRisk += 1;
          state.caution = Math.max(0, state.caution - 1);
          maybeTriggerSpread(state);
          logLine("OPERATOR LEFT CONSOLE. STATUS: IMPAIRED.");
        },
      },
    ],
    trophy: () => ({
      title: "FILE GENERATED: LIQUID COURAGE (UNOFFICIAL).",
      href: "assets/drunk-trophy.png",
      filename: "outpost31-liquid-courage.png",
    }),
  },

  /* -----------------------------
     KENNEL — vent removed
  -------------------------------- */
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
        label: "WATCH SILENTLY (60 SECONDS)",
        next: "kennel_watch",
        effect: () => {
          state.infectionRisk += 1;
          maybeTriggerSpread(state);
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

  kennel_watch: {
    text: `
YOU WATCH.

THE PACK SHIFTS AND WHINES.
THE STILL DOG DOES NOT MOVE.

THE CAMERA DROPS TWO FRAMES.
WHEN IT RETURNS, THE DOG'S HEAD IS TURNED.

NO MOTION IS SHOWN.
ONLY THE RESULT.

THE SYSTEM LABELS THIS:
"COMPRESSION ARTIFACT."
    `.trim(),
    choices: [
      {
        label: "FLAG FEED DROP AND RETURN",
        next: "console",
        effect: () => {
          addNote("kennel_feed_drop");
          state.paranoia += 1;
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

  /* -----------------------------
     LAB
  -------------------------------- */
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

      // Retest if bulk scans used and infection not yet found
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
          infected ? "DETECTED" : "NO CONFIRMATION"
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

  /* -----------------------------
     SECURITY PLAYBACK
  -------------------------------- */
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

  /* -----------------------------
     GENERATOR
  -------------------------------- */
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

  /* -----------------------------
     CHESS WIZARD — movie-accurate beats
  -------------------------------- */
  chess_intro: {
    text: `
CHESS WIZARD v1.0

BOARD STATE LOADED.
OPPONENT READY.

MAKE A MOVE:
    `.trim(),
    choices: [
      {
        label: "BISHOP TO KNIGHT 4 (ASSERTIVE POSITIONING)",
        next: "chess_b_n4",
        effect: () => {
          state.caution += 1;
        },
      },
      {
        label: "KING TO ROOK 1 (CONSERVATIVE WITHDRAWAL)",
        next: "chess_k_r1",
        effect: () => {
          state.caution += 1;
        },
      },
      { label: "QUIT CHESS WIZARD", next: "console" },
    ],
  },

  chess_b_n4: {
    text: `
MOVE REGISTERED:
BISHOP TO KNIGHT 4.

THE COMPUTER RESPONDS IMMEDIATELY.

KNIGHT TO ROOK 3.

NO HESITATION.
NO EVALUATION DELAY.

YOU CAN FEEL IT:
THE POSITION IS CLOSING.
    `.trim(),
    choices: [
      { label: "CONTINUE", next: "chess_checkmate" },
      { label: "QUIT CHESS WIZARD", next: "console" },
    ],
  },

  chess_k_r1: {
    text: `
MOVE REGISTERED:
KING TO ROOK 1.

THE COMPUTER PAUSES.
JUST LONG ENOUGH TO BE INSULTING.

ROOK TO KNIGHT 6.

CHECK.

YOU THINK:
"POOR BABY. YOU'RE STARTING TO LOSE IT, AREN'T YA?"
    `.trim(),
    choices: [
      { label: "CONTINUE", next: "chess_checkmate" },
      { label: "QUIT CHESS WIZARD", next: "console" },
    ],
  },

  chess_checkmate: {
    text: `
THE COMPUTER MAKES ITS MOVE.

ROOK TO KNIGHT 6.

CHECKMATE.
CHECKMATE.

IT ISN'T BRAGGING.
IT'S A FORECAST.

YOU MUTTER:
"YOU CHEATING BITCH."
    `.trim(),
    choices: [
      {
        label: "POUR WHISKEY ON THE COMPUTER",
        next: "chess_whiskey",
        effect: () => {
          // catharsis + cost
          state.paranoia = Math.max(0, state.paranoia - 1);
          state.infectionRisk += 1;
          maybeTriggerSpread(state);
          addNote("chess_wizard_ruined");
          logLine("NON-ESSENTIAL SYSTEM TERMINATED BY OPERATOR.");
        },
      },
      {
        label: "STARE AT THE BOARD",
        next: "chess_stare",
        effect: () => {
          state.paranoia += 1;
        },
      },
      { label: "RETURN TO CONSOLE", next: "console" },
    ],
  },

  chess_stare: {
    text: `
THE CURSOR STOPS BLINKING.

FOR A MOMENT, THE BOARD LOOKS WRONG.
NOT CHESS. NOT EVEN GAMES.

THEN IT'S NORMAL AGAIN.

NORMAL DOESN'T HELP.
    `.trim(),
    choices: [{ label: "RETURN TO CONSOLE", next: "console" }],
  },

  chess_whiskey: {
    text: `
YOU UNSCREW THE CAP.

THE LIQUID HITS THE KEYS.
THE SCREEN GOES BLACK MID-WORD.

NO SHUTDOWN SEQUENCE.
NO ERROR REPORT.

JUST SILENCE.
    `.trim(),
    choices: [{ label: "RETURN TO CONSOLE", next: "console" }],
  },

  chess_offline: {
    text: `
CHESS WIZARD: OFFLINE

STATUS: LIQUID DAMAGE
REPAIR: NOT SCHEDULED
PRIORITY: NON-ESSENTIAL
    `.trim(),
    choices: [{ label: "RETURN TO CONSOLE", next: "console" }],
  },

  /* -----------------------------
     FINAL — single execution → 2 endings
  -------------------------------- */
  final_assessment: {
    text: (s) => {
      const lines = [];
      lines.push("FINAL ASSESSMENT REQUIRED.\n");

      lines.push(
        `RIGOR: ${displayDifficultyLabel(
          s.difficulty
        )}  |  STRONG EVIDENCE REQUIRED: ${requiredEvidenceCount(
          s.difficulty
        )}/3`
      );
      lines.push(`STRONG EVIDENCE PRESENT: ${countStrongEvidence(s)}/3\n`);

      const evidenceLines = [];
      if (s.notes.includes("flagged_sample"))
        evidenceLines.push("- INFECTED BLOOD CONFIRMED.");
      if (s.notes.includes("assimilation_model_ran"))
        evidenceLines.push("- ASSIMILATION MODEL CONSULTED.");
      if (s.notes.includes("crew_movement_contradiction"))
        evidenceLines.push("- TIMELINE CONTRADICTION (PLAYBACK).");
      if (s.notes.includes("generator_reroute_hab03"))
        evidenceLines.push("- UNAUTHORIZED POWER ROUTE (HAB-03).");
      if (s.notes.includes("kennel_provocation_failed"))
        evidenceLines.push("- KENNEL PROVOCATION ANOMALY.");
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

      lines.push(confidenceTagLine(s));
      lines.push("");
      lines.push("NOTE:");
      lines.push("ALL ACTIONS CARRY NON-ZERO FAILURE RISK.");
      lines.push("THE MODEL WILL CLOSE AFTER EXECUTION.\n");

      lines.push("SELECT ACTION:");
      return lines.join("\n");
    },

    choices: (s) => {
      const next = containmentSuccess(s)
        ? "ending_containment_success"
        : "ending_containment_failure";
      return [
        {
          label: "EXECUTE CONTAINMENT PROTOCOL",
          next,
          effect: () =>
            logLine("ACTION SELECTED: EXECUTE CONTAINMENT PROTOCOL."),
        },
        { label: "RETURN TO CONSOLE", next: "console" },
      ];
    },
  },

  ending_containment_success: {
    text: (s) => {
      const evidenceCount = countEvidenceSignals(s);
      const strongCount = countStrongEvidence(s);
      return `
CONTAINMENT PROTOCOL COMPLETE.

INFECTED SUBJECT CONFIRMED.
STRONG EVIDENCE: ${strongCount}/3
EVIDENCE SIGNALS LOGGED: ${evidenceCount}
RISK INDEX AT TERMINATION: ${s.infectionRisk}

PATHWAYS SEALED.
NO FURTHER EVENTS DETECTED.

LAST LOG ENTRY:
"OBJECTIVE MET."

SIMULATION TERMINATED: CONTAINMENT SUCCESSFUL.
${confidenceTagLine(s)}
      `.trim();
    },
    choices: [{ label: "RESTART SIMULATION", next: "intro" }],
    trophy: () => ({
      title: "TROPHY UNLOCKED: CLEARANCE GRANTED.",
      href: "assets/trophy-containment-success.png",
      filename: "outpost31-clearance-granted.png",
    }),
    ending: true,
  },

  ending_containment_failure: {
    text: (s) => {
      const evidenceCount = countEvidenceSignals(s);
      const strongCount = countStrongEvidence(s);
      const hadConfirmed = s.infectedFound ? "YES" : "NO";
      return `
CONTAINMENT ACTION EXECUTED.

INFECTION CONFIRMED PRIOR TO ACTION: ${hadConfirmed}
STRONG EVIDENCE: ${strongCount}/3
EVIDENCE SIGNALS LOGGED: ${evidenceCount}
RISK INDEX AT TERMINATION: ${s.infectionRisk}

POST-ACTION ANALYSIS:
UNCONTROLLED VARIABLES REMAIN.

LAST LOG ENTRY:
"FAILURE STATE LOCKED."

SIMULATION TERMINATED: CONTAINMENT FAILURE.
${confidenceTagLine(s)}
      `.trim();
    },
    choices: [{ label: "RESTART SIMULATION", next: "intro" }],
    trophy: () => ({
      title: "TROPHY UNLOCKED: BREACH RECORDED.",
      href: "assets/trophy-containment-failure.png",
      filename: "outpost31-breach-recorded.png",
    }),
    ending: true,
  },
};

/* state.js
   =========================================
   State management, difficulty, notes
   ========================================= */

/* -----------------------------
   DIFFICULTY
-------------------------------- */
export const DIFFICULTIES = ["easy", "normal", "hard"];

export function displayDifficultyLabel(d) {
  if (d === "easy") return "RELAXED";
  if (d === "hard") return "STRICT";
  return "STANDARD";
}

export function requiredEvidenceCount(difficulty) {
  if (difficulty === "easy") return 0;
  if (difficulty === "hard") return 2;
  return 1; // normal
}

export function loadDifficulty() {
  const saved = localStorage.getItem("outpost31_difficulty");
  if (DIFFICULTIES.includes(saved)) return saved;
  return "normal";
}

export function saveDifficulty(d) {
  localStorage.setItem("outpost31_difficulty", d);
}

/* -----------------------------
   STATE
-------------------------------- */
export const state = {
  difficulty: loadDifficulty(),

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

/* -----------------------------
   LOG LINE (reference set externally)
-------------------------------- */
let logEl = null;

export function setLogEl(el) {
  logEl = el;
}

export function logLine(message) {
  if (!logEl) return;
  const stamp = new Date();
  const hh = String(stamp.getHours()).padStart(2, "0");
  const mm = String(stamp.getMinutes()).padStart(2, "0");
  const ss = String(stamp.getSeconds()).padStart(2, "0");
  logEl.querySelector('[data-log="msg"]').textContent = message;
  logEl.querySelector('[data-log="ts"]').textContent = `${hh}:${mm}:${ss}`;
}

export function addNote(note) {
  if (!state.notes.includes(note)) {
    state.notes.push(note);
    logLine(`LOGGED: ${note.replace(/_/g, " ")}.`);
  }
}


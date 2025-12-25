/* main.js
   =========================================
   Entry point - initialization & splash
   ========================================= */

import {
  state,
  setLogEl,
  logLine,
  DIFFICULTIES,
  saveDifficulty,
  displayDifficultyLabel,
} from "./state.js";
import { initBloodSystem } from "./blood.js";
import {
  bootGameUI,
  renderNode,
  updateMeters,
  updateHudTime,
  resetStartTime,
  setupKeyboardHandler,
  startPassiveRiskTimer,
} from "./ui.js";

/* -----------------------------
   RESET STATE
-------------------------------- */
export function resetState() {
  state.caution = 0;
  state.paranoia = 0;
  state.infectionRisk = 0;
  state.notes = [];
  initBloodSystem();
}

/* -----------------------------
   HANDLE RESTART (called from ui.js)
-------------------------------- */
export function handleRestart() {
  resetState();
  resetStartTime();
  logLine("SIMULATION RESET.");
}

/* -----------------------------
   DIFFICULTY UI (SPLASH)
-------------------------------- */
function wireDifficultyUI() {
  const valEl = document.getElementById("difficultyVal");
  const btnEl = document.getElementById("difficultyToggle");

  const render = () => {
    if (valEl) valEl.textContent = displayDifficultyLabel(state.difficulty);
  };

  const cycle = (dir = 1) => {
    const idx = DIFFICULTIES.indexOf(state.difficulty);
    const next = (idx + dir + DIFFICULTIES.length) % DIFFICULTIES.length;
    state.difficulty = DIFFICULTIES[next];
    saveDifficulty(state.difficulty);
    render();
  };

  if (btnEl) btnEl.addEventListener("click", () => cycle(1));

  // Allow Arrow Left/Right to change difficulty while splash is on screen
  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("splash")) return;
    if (e.key === "ArrowLeft") cycle(-1);
    if (e.key === "ArrowRight") cycle(1);
  });

  render();
}

/* -----------------------------
   START GAME
-------------------------------- */
const app = document.getElementById("app");
const enterPrompt = document.getElementById("enterPrompt");

function startGame() {
  const splash = document.getElementById("splash");
  if (splash) splash.remove();

  const logEl = bootGameUI(app);
  setLogEl(logEl);

  resetState();
  resetStartTime();

  logLine("SYSTEM READY. SIMULATION ONLINE.");
  updateMeters();
  renderNode("intro");
}

/* -----------------------------
   INIT
-------------------------------- */
enterPrompt?.addEventListener("click", startGame);
enterPrompt?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") startGame();
});

// Wire optional difficulty UI on splash
wireDifficultyUI();

// Setup keyboard navigation
setupKeyboardHandler(startGame);

// Start HUD time updater
setInterval(updateHudTime, 250);

// Start passive risk timer
startPassiveRiskTimer();


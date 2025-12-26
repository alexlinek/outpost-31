/* ui.js
   =========================================
   Meters, rendering, keyboard handling, HUD
   ========================================= */

import { state, logLine } from "./state.js";
import { maybeTriggerSpread } from "./blood.js";
import { story } from "./story.js";

/* -----------------------------
   DOM REFERENCES
-------------------------------- */
let meterEls = null;
let lastMeterValues = { caution: 0, paranoia: 0, risk: 0 };

let hudEl = null;
let hudRightEl = null;
let screenEl = null;
let trophyEl = null;

const METER_MAX = 10;

/* -----------------------------
   UTILITY
-------------------------------- */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/* -----------------------------
   TROPHY (PER-NODE ART)
-------------------------------- */
export function setTrophy({ title, href, filename, image }) {
  if (!trophyEl) return;
  trophyEl.style.display = "block";
  const imageHtml = image ? `<img src="${image}" alt="Trophy" />` : "";
  trophyEl.innerHTML = `
    <p>${title}</p>
    ${imageHtml}
    <p><a href="${href}" download="${filename}">⬇ DOWNLOAD</a></p>
  `;
}

export function hideTrophy() {
  if (!trophyEl) return;
  trophyEl.style.display = "none";
}

/* -----------------------------
   METER EFFECTS
-------------------------------- */
function blip(trackEl, direction) {
  if (!trackEl) return;
  const cls = direction === "up" ? "blip-up" : "blip-down";
  trackEl.classList.remove("blip-up", "blip-down");
  void trackEl.offsetWidth;
  trackEl.classList.add(cls);
  setTimeout(() => trackEl.classList.remove(cls), 220);
}

function jitterHud() {
  if (!hudEl) return;
  hudEl.classList.remove("crt-jitter");
  void hudEl.offsetWidth;
  hudEl.classList.add("crt-jitter");
  setTimeout(() => hudEl.classList.remove("crt-jitter"), 280);
}

export function updateMeters() {
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

  if (c !== lastMeterValues.caution)
    blip(meterEls.cautionTrack, c > lastMeterValues.caution ? "up" : "down");
  if (p !== lastMeterValues.paranoia)
    blip(meterEls.paranoiaTrack, p > lastMeterValues.paranoia ? "up" : "down");
  if (r !== lastMeterValues.risk) {
    blip(meterEls.riskTrack, r > lastMeterValues.risk ? "up" : "down");
    if (r > lastMeterValues.risk) jitterHud();
  }

  lastMeterValues = { caution: c, paranoia: p, risk: r };

  const riskMeter = document.querySelector('.meter[data-meter="risk"]');
  if (riskMeter) {
    riskMeter.classList.toggle("danger", r >= 7);
    riskMeter.classList.toggle("critical", r >= 10);
  }
}

/* -----------------------------
   PASSIVE RISK TIMER (5 MIN)
-------------------------------- */
export function startPassiveRiskTimer() {
  setInterval(() => {
    if (!hudEl) return;
    state.infectionRisk += 1;
    maybeTriggerSpread(state);
    updateMeters();
    logLine("TIME ELAPSED: RISK INCREASED.");
  }, 5 * 60 * 1000);
}

/* -----------------------------
   RENDERER (PROMPT LIST)
-------------------------------- */
let selectedIndex = 0;
let activeChoices = [];
let activeNodeId = null;

export let startMs = Date.now();

export function resetStartTime() {
  startMs = Date.now();
}

export function updateHudTime() {
  if (!hudRightEl) return;
  const s = Math.floor((Date.now() - startMs) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  hudRightEl.textContent = `TIME: 00:${mm}:${ss}`;
}

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
    // Handled by main.js resetState
    import("./main.js").then((m) => m.handleRestart());
  }

  renderNode(choice.next);
}

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

export function renderNode(nodeId) {
  const node = story[nodeId];
  activeNodeId = nodeId;

  const text = typeof node.text === "function" ? node.text(state) : node.text;
  const choiceDefs =
    typeof node.choices === "function" ? node.choices(state) : node.choices;

  if (node.trophy) setTrophy(node.trophy(state));
  else hideTrophy();

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
   KEYBOARD HANDLER
-------------------------------- */
export function setupKeyboardHandler(startGameFn) {
  document.addEventListener("keydown", (e) => {
    if (document.getElementById("splash")) {
      if (e.key === "Enter") {
        e.preventDefault();
        startGameFn();
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
  });
}

/* -----------------------------
   BOOT GAME UI
-------------------------------- */
export function bootGameUI(appEl) {
  appEl.innerHTML = `
    <div class="hud" id="hud">
      <div class="hudHeader">
        <div class="hudLeft"><strong>OUTPOST 31</strong></div>
        <div class="hudRight" id="hudRight">TIME: 00:00:00</div>
      </div>

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

  lastMeterValues = { caution: 0, paranoia: 0, risk: 0 };

  return document.getElementById("logline");
}

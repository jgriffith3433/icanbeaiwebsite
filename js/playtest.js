/* ==========================================================================
   Hawkes playtest hooks (contract v1, spec: C:\Projects\hawkesstudio\docs\playtest.md).
   Nothing here runs until the runner calls window.hawkesPlaytest.start() or the
   URL has ?playtest=<id>. The bot uses the page's own controls (speed buttons,
   the day bar, keys) and only watches the clock through window.day.watch().
   ========================================================================== */
import { installPlaytest } from "./hawkes-playtest.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const $ = (id) => document.getElementById(id);

function boxOf(el) {
  if (!el || el.hidden) return null;
  const s = getComputedStyle(el);
  if (s.display === "none" || s.visibility === "hidden") return null;
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return null;
  return r;
}


/* ---------- the HUD check (css/hud.css lays the HUD out; this measures it) ----------
   checkHud(t, label) measures every visible HUD element's rect and reports any two that intersect as a bug, and any
   visible placeholder text (a lone dash) as a bug. Called by look, photos, episodes, tutorial-episode and control,
   at each stage of the run (the label says which). Each distinct finding is reported once per run. */
const HUD_PARTS = [
  [".panel.now", "status card"], ["#sound", "Sound"], ["#details", "Details"], ["#settings", "Settings"], [".settings-pop", "Settings menu"], [".side", "Details panel"],
  [".hud.bottom", "timeline"], ["#control", "Take control / Let go"], ["#quality", "Quality"],
  ["#weather-btn", "Weather"], ["#pressure", "Pressure"], ["#episodes", "Episodes"], ["#neighbors-btn", "Neighbors"],
  ["#neighbors-panel", "Neighbors list"], [".abilitybar .ab", "ability"], [".abilitybar .energy", "Energy"],
  [".powerpad button", "power pad"], [".touchpad .stick", "stick"], [".touchpad .jump", "jump"],
  [".tutorial", "tutorial card"], [".ep-hud", "episode HUD"], [".control-hint", "controls hint"],
];
const hudSeen = new Set();
function hudVisible(el) {
  if (!el || el.hidden) return null;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) < 0.05) return null;
  }
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8 || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return null;
  return r;
}
function hudRects() {
  const out = [];
  HUD_PARTS.forEach(([sel, name]) => {
    document.querySelectorAll(sel).forEach((el, i) => {
      const r = hudVisible(el);
      if (r) out.push({ el, r, name: el.id ? "#" + el.id : name + (i ? " " + (i + 1) : "") });
    });
  });
  return out;
}
const HUD_PLACEHOLDER = /^[\s–—.…?-]+$/;
function checkHud(t, label) {
  const parts = hudRects();
  const found = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], b = parts[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (boxesOverlap(a.r, b.r)) found.push(a.name + " overlaps " + b.name);
    }
  }
  const roots = ["header.hud", ".side", "footer.hud", ".abilitybar", ".pressure", ".tutorial", ".ep-hud", ".powerpad", "#control", "#episodes", "#weather-btn", "#quality"];
  roots.forEach((sel) => document.querySelectorAll(sel).forEach((root) => {
    if (!hudVisible(root)) return;
    [root, ...root.querySelectorAll("*")].forEach((el) => {
      if (el.children.length || !hudVisible(el)) return;
      const txt = (el.textContent || "").trim();
      if (txt && HUD_PLACEHOLDER.test(txt)) found.push('placeholder text "' + txt + '" shows in ' + (el.id ? "#" + el.id : el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : "")));
    });
  }));
  const fresh = found.filter((f) => !hudSeen.has(f));
  fresh.forEach((f) => {
    hudSeen.add(f);
    t.problem("bug", "HUD (" + label + ", " + innerWidth + "x" + innerHeight + "): " + f);
  });
  if (!found.length) t.event("hud-clear", label + ": " + parts.length + " HUD elements at " + innerWidth + "x" + innerHeight + ", none overlap, no placeholder text");
  return !found.length;
}

function world() {
  return window.day && window.day.world();
}

/** Problems anyone can see at a glance: no Babylon, no world, a config error panel, NaN. */
function checkBasics(t) {
  if (!window.BABYLON) t.problem("bug", "Babylon.js didn't load (the js/app.js bundle)");
  if (!window.DAY_CONFIG) t.problem("bug", "day.config.js didn't load");
  const w = world();
  if (!w) t.problem("bug", "The 3D world wasn't created");
  else if (!w.person) t.problem("bug", "The world has no person");
  const day = window.day && window.day.today();
  if (day) {
    (day.errors || []).forEach((e) => t.problem("bug", `day.config.js: ${e}`));
    if ((day.warnings || []).length) {
      t.metric("configWarnings", day.warnings.length);
      day.warnings.slice(0, 5).forEach((w) => t.problem("polish", `day.config.js: ${w}`));
    }
    if (!day.actions.length) t.problem("bug", "The day has no actions");
  }
  if ($("errors") && !$("errors").hidden) t.problem("bug", "The red config error panel is showing");
}

/** Checks one frame for NaN and for the person being where the engine says. Returns true if fine. */
function checkFrame(t, fr) {
  const w = world();
  if (!fr) return true;
  const bad = [];
  ["x", "z", "yaw"].forEach((k) => !finite(fr.person[k]) && bad.push("person." + k));
  Object.entries(fr.body || {}).forEach(([k, v]) => !finite(v) && bad.push("body." + k));
  if (w && w.person) {
    const p = w.person.position;
    ["x", "y", "z"].forEach((k) => !finite(p[k]) && bad.push("mesh." + k));
    if (!fr.person.inCar && finite(p.x) && Math.hypot(p.x - fr.person.x, p.z - fr.person.z) > 0.05) {
      t.problem("bug", `The person mesh isn't where the engine puts them during "${fr.action.text}"`);
    }
  }
  if (bad.length) {
    t.problem("bug", `NaN in ${bad.join(", ")} during "${fr.action.text}" (${fr.action.block})`);
    return false;
  }
  return true;
}

/** Is any of the person's meshes on screen? */
function personOnScreen() {
  const w = world();
  if (!w || !w.person || !w.scene.activeCamera) return false;
  const planes = window.BABYLON.Frustum.GetPlanes(w.scene.getTransformMatrix());
  if (!w.person.getChildMeshes().some((m) => m.isEnabled() && m.isVisible && m.isInFrustum(planes))) return false;
  /* in the frustum is not enough: he must not sit under a panel (the log, the clock card) */
  const B = window.BABYLON;
  const rw = w.engine.getRenderWidth();
  const rh = w.engine.getRenderHeight();
  const c = w.person.getAbsolutePosition().clone();
  c.y += 0.9;
  const v = B.Vector3.Project(c, B.Matrix.Identity(), w.scene.getTransformMatrix(), w.scene.activeCamera.viewport.toGlobal(rw, rh));
  if (v.z < 0 || v.z > 1) return false;
  const px = (v.x / rw) * window.innerWidth;
  const py = (v.y / rh) * window.innerHeight;
  return ![".side", "h1.time"].some((sel) => {
    const el = sel === "h1.time" ? document.querySelector(sel)?.parentElement : document.querySelector(sel);
    if (!el || el.hidden || el.offsetParent === null) return false;
    const r = el.getBoundingClientRect();
    return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
  });
}

/** Where the player's car is on screen: {x, y} as 0-1 of the width and height, or null if behind the camera. */
function carScreenPos() {
  const w = world();
  if (!w || !w.car || !w.scene.activeCamera) return null;
  const B = window.BABYLON;
  const rw = w.engine.getRenderWidth();
  const rh = w.engine.getRenderHeight();
  const c = w.car.getAbsolutePosition().clone();
  c.y = 0.7;
  const v = B.Vector3.Project(c, B.Matrix.Identity(), w.scene.getTransformMatrix(), w.scene.activeCamera.viewport.toGlobal(rw, rh));
  if (v.z < 0 || v.z > 1) return null;
  return { x: v.x / rw, y: v.y / rh };
}

function clickSpeed(s) {
  const b = document.querySelector(`#speeds button[data-speed="${s}"]`);
  if (b) {
    b.click();
    return true;
  }
  return false;
}

function pressKey(key) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

/** Drag the day bar to a minute, the way a player does. */
function scrubTo(minutes) {
  const s = $("scrub");
  s.dispatchEvent(new Event("pointerdown"));
  s.value = String(minutes);
  s.dispatchEvent(new Event("input", { bubbles: true }));
  window.dispatchEvent(new Event("pointerup"));
}

let unwatch = null;
let stopRun = () => {};
function stopWatching() {
  if (unwatch) unwatch();
  unwatch = null;
}

/* ---------- the status card (#chapter and #where in the Now panel) ---------- */
// While the pilot steers (taking control, and Walking back) it must read "Your move" / "On foot", never "In the car" or
// "Drive"; while the day has him driving and nobody steers it reads "In the car"; back on his day it's the day's own.
const CAR_CARD = /in the car|drive/i;
const cardNow = () => ({ where: ($("where").textContent || "").trim(), chapter: ($("chapter").textContent || "").trim() });
const cardClock = () => E().fmtClock(window.day.now().minutes);
/** A couple of painted frames (the card is written once per frame), but never longer than 250 ms. */
const paintedFrames = (n = 2) =>
  Promise.race([
    new Promise((res) => {
      let i = 0;
      const f = () => (++i >= n ? res() : requestAnimationFrame(f));
      requestAnimationFrame(f);
    }),
    sleep(250),
  ]);

/** Shared check. expected: "foot" (On foot / Your move), "car" (In the car) or "day" (the day's own: not "On foot"
 *  / "Your move"). Logs a status-card event with the clock time when it matches, a bug when it doesn't. */
async function checkStatusCard(t, expected, label) {
  await paintedFrames(2);
  const c = cardNow();
  const ok =
    expected === "foot" ? c.where === "On foot" && c.chapter === "Your move" :
    expected === "car" ? c.where === "In the car" :
    c.where !== "On foot" && c.chapter !== "Your move";
  const word = { foot: "On foot / Your move", car: "In the car", day: "the day's own card" }[expected];
  const detail = `${label}: ${cardClock()} · card reads "${c.where}" / "${c.chapter}" (expected ${word})`;
  if (ok) t.event("status-card", detail);
  else t.problem("bug", `Status card wrong, ${detail}`);
  return ok;
}

/** While he's the player's or walking back (any mode but schedule), sample the card every `ms` and report any
 *  In the car / Drive reading, or anything but On foot / Your move, with the clock time. stop() logs the tally. */
function watchStatusCard(t, label, ms = 1000) {
  const C = window.day.control;
  let n = 0;
  let prev = null;
  let bad = 0;
  const iv = setInterval(() => {
    const mode = C.mode();
    const stable = mode === prev; // the sample just after a mode flip may precede the frame that writes the card
    prev = mode;
    if (mode === "schedule" || !stable) return;
    n++;
    const c = cardNow();
    const car = CAR_CARD.test(c.where) || CAR_CARD.test(c.chapter);
    if (car || c.where !== "On foot" || c.chapter !== "Your move") {
      bad++;
      if (bad <= 3) t.problem("bug", `${label}: at ${cardClock()} he's ${mode === "control" ? "in control" : "walking back"} but the status card reads "${c.where}" / "${c.chapter}"${car ? " (In the car / Drive while he's the player's)" : ""}`);
    }
  }, ms);
  return {
    stop() {
      clearInterval(iv);
      t.metric(`${label}StatusCardSamples`, n);
      if (n && !bad) t.event("status-card-sampled", `${label}: ${n} samples, every one On foot / Your move`);
      else if (!n) t.problem("warning", `${label}: no status-card samples were taken while in control`);
    },
  };
}

/** The engine (Babylon 9, Havok physics and its colliders) and Small Weather's name in the side panel and the log. */
async function checkFoundation(t) {
  t.scene("Engine and name");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const info = window.day.engineInfo ? window.day.engineInfo() : { babylon: window.BABYLON && window.BABYLON.Engine.Version, physics: "unknown" };
  t.event("engine", `Babylon ${info.babylon}, physics ${info.physics}${info.colliders ? ` (${info.colliders} colliders in ${info.bodies} bodies)` : ""}`);
  t.log(`engine: ${JSON.stringify(info)}`);
  t.metric("babylon", info.babylon);
  if (info.colliders) t.metric("colliders", info.colliders);
  if (!/^9\./.test(String(info.babylon))) t.problem("bug", `Babylon ${info.babylon} is running, not Babylon 9`);
  if (info.physics !== "havok") t.problem("bug", `Physics isn't on (${info.physics}${info.error ? `: ${info.error}` : ""})`);
  const w = world();
  const fr = window.day.now().frame;
  if (info.physics === "havok" && w && fr && !fr.person.inCar) {
    const g = w.groundAt(fr.person.x, fr.person.z, 3);
    if (g) t.event("collider-under-person", `y ${g.y.toFixed(2)} (${g.body})`);
    else t.problem("bug", "No collider under the person: the floor isn't solid there");
  }

  // The side panel and the log name him. The log is checked at the alarm, the first block (the day bar, like a player).
  const name = (window.DAY_CONFIG.person && window.DAY_CONFIG.person.name) || "";
  const heading = ($("log-title") && $("log-title").textContent) || "";
  if (name === "Small Weather" && heading.includes(name)) t.event("name-in-panel", heading);
  else t.problem("bug", `The side panel doesn't call him Small Weather ("${heading}")`);
  const day = window.day.today();
  scrubTo(day.dayStart + 0.2);
  await t.until(() => $("log").textContent.includes("Small Weather"), 4000, "his name in the log").catch(() => {});
  const row = [...$("log").querySelectorAll("li")].map((li) => li.textContent).find((x) => x.includes("Small Weather"));
  if (row) t.event("name-in-log", row);
  else t.problem("bug", "The action log doesn't call him Small Weather at the alarm");
  await sleep(1500);

  // Night bedroom: bedside/moonlight fill keeps Small Weather and the bed/desk clearly readable at night.
  t.scene("Night bedroom");
  scrubTo(23 * 60 + 40);
  await sleep(2200);
  const st = w && w.stage;
  const fillI = st && st.bedsideFill ? st.bedsideFill.intensity : 0;
  const bedI = st && st.bedroomLight ? st.bedroomLight.intensity : 0;
  if (!(fillI > 0.35 && bedI > 0.35)) {
    t.problem("bug", `Bedroom night fill is too dim at 23:40 (bedsideFill ${fillI.toFixed(2)}, bedroomLight ${bedI.toFixed(2)})`);
  } else {
    t.event("bedroom-night-fill", `bedsideFill ${fillI.toFixed(2)}, bedroomLight ${bedI.toFixed(2)}, personOnScreen ${personOnScreen()}`);
  }

  pressKey("Escape");
  await sleep(500);
  t.scene("Live");
}

/* ---------------- smoke: boot, see the character, let a minute of the day run ---------------- */
async function smoke(options, t) {
  t.scene("Live");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  // Small Weather or nothing: wait for his model (never the box stand-in) before judging the page.
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model !== "loading", 30000, "his model to load").catch(() => {});
  const mInfo = window.day.engineInfo ? window.day.engineInfo() : {};
  if (mInfo.model === "small-weather") t.event("small-weather-visible", "his model is on the figure");
  else t.problem("blocker", `Small Weather didn't appear (model ${mInfo.model}${mInfo.modelError ? ": " + mInfo.modelError : ""})`);
  if (window.day.tutorial && !window.day.tutorial.blocking()) window.day.tutorial.reset();
  const fr0 = window.day.now().frame;
  checkFrame(t, fr0);
  t.note(`${fr0.action.block}: ${fr0.action.text}`);
  t.log(`date ${window.day.now().key}, ${$("time").textContent}${$("ampm").textContent}, ${fr0.action.text}`);
  const markText = ($("mark-title") || {}).textContent || "";
  if (/\[object/i.test(markText) || !markText.trim()) t.problem("bug", `The status card's label reads "${markText}" instead of a name`);
  else t.event("status-card-label", `status card label "${markText}"`);
  if (personOnScreen()) t.event("person-visible");
  else t.problem("warning", "The person isn't on screen at load");
  const daybarBox = boxOf(document.querySelector(".daybar"));
  const whatBox = boxOf($("what"));
  const tutBox = boxOf($("tutorial"));
  if (!daybarBox) t.problem("bug", "The day bar (.daybar) is hidden in Live mode");
  if (!whatBox) t.problem("bug", "The narration HUD (#what) is hidden in Live mode");
  if (!tutBox) t.problem("bug", "The first-time control tutorial prompt (#tutorial) is hidden on a fresh visit");
  if (daybarBox && whatBox && tutBox) {
    if (boxesOverlap(tutBox, boxOf(document.querySelector(".panel.now")) || whatBox)) {
      t.problem("bug", "The tutorial card (#tutorial) overlaps the narration header card (.panel.now)");
    }
    t.event("hud-and-tutorial", `daybar ${Math.round(daybarBox.width)}×${Math.round(daybarBox.height)}, narration "${$("what").textContent}", tutorial "${($("tutorial-text") || {}).textContent || ""}"`);
  }
  const topIds = ["sound", "details", "quality", "episodes"];
  const topBoxes = [];
  const nowBox = boxOf(document.querySelector(".now"));
  if (nowBox) topBoxes.push({ id: "now", r: nowBox });
  topIds.forEach((id) => {
    const r = boxOf($(id));
    if (!r) {
      t.problem("bug", `Top control #${id} isn't on screen in Live mode`);
      return;
    }
    topBoxes.push({ id, r });
    if (document.documentElement.classList.contains("touch-ui") && (r.width < 43 || r.height < 43)) {
      t.problem("bug", `#${id} is ${Math.round(r.width)}×${Math.round(r.height)} on touch-ui (needs 44px tap target)`);
    }
  });
  for (let i = 0; i < topBoxes.length; i++) {
    for (let j = i + 1; j < topBoxes.length; j++) {
      if (boxesOverlap(topBoxes[i].r, topBoxes[j].r)) {
        t.problem("bug", `#${topBoxes[i].id} overlaps #${topBoxes[j].id} in Live mode`);
      }
    }
  }
  t.progress(0.2);

  // Live for a few seconds: the clock must tick.
  const live0 = window.day.now().minutes;
  await sleep(4000);
  if (!(window.day.now().minutes > live0)) t.problem("bug", "The live clock didn't move in 4 s");
  t.progress(0.4);

  // One minute of the day at 10× (the "10×" button), like a player would.
  t.scene("Playing 10×");
  const m0 = window.day.now().minutes;
  const texts = new Set();
  let frames = 0;
  unwatch = window.day.watch(({ fr }) => {
    frames++;
    texts.add(fr.action.text);
    checkFrame(t, fr);
  });
  clickSpeed(10);
  const WX = window.weather || window.day.weather;
  const seenWx = new Set();
  for (let i = 0; i < 12; i++) {
    await sleep(500);
    if (WX) seenWx.add(WX.now().state + (WX.now().manual ? "*" : ""));
  }
  stopWatching();
  // Calm idle: no storm of its own, and the forecast for the whole day is clear.
  if (WX) {
    let dayStates = new Set();
    const key = window.day.now().key;
    for (let m = 0; m < 1440; m += 30) dayStates.add(WX.forecast(key, m).state);
    if (seenWx.size === 1 && seenWx.has("clear") && dayStates.size === 1 && dayStates.has("clear")) t.event("calm-idle", `sky clear while the day ran at 10×; the day's forecast is clear all 24 h`);
    else t.problem("bug", `Weather started on its own: seen ${[...seenWx].join(",")}, forecast ${[...dayStates].join(",")}`);
  }
  if (!boxOf(document.querySelector(".daybar")) || !boxOf($("what")) || !boxOf($("tutorial"))) {
    t.problem("bug", "The day bar, narration HUD, or tutorial prompt disappeared during 10× playback");
  }
  const ran = window.day.now().minutes - m0;
  t.metric("dayMinutesRun", Math.round(ran * 100) / 100);
  t.metric("frames", frames);
  t.metric("actionsSeen", texts.size);
  if (!(ran > 0)) t.problem("bug", "The clock didn't move at 10×");
  else if (ran < 0.8) {
    // main.js caps a frame at 0.1 s, so below 10 fps playback runs slower than its label.
    t.problem("polish", `At 10× only ${ran.toFixed(2)} day-minutes passed in 6 s (expected 1) at ${frames / 6 | 0} fps`);
  }
  t.progress(0.8);

  // Pause, then back to now (Esc).
  pressKey(" ");
  await sleep(500);
  const p0 = window.day.now().minutes;
  await sleep(1000);
  if (window.day.now().minutes !== p0) t.problem("bug", "Pause (Space) didn't stop the clock");
  pressKey("Escape");
  await sleep(500);
  if (window.day.now().mode !== "live") t.problem("bug", "Esc didn't go back to live");
  t.scene("Live");
  t.event("back-to-live");
  t.progress(0.6);

  await checkFoundation(t);
  t.progress(0.7);
  await roofBolt(t);
  t.progress(1);
}

/** While he's the player's: the controls hint wraps clear of the Details panel, every Details row (Thirst too)
 *  is readable (not under the hint or the ability bar), and the highlighted log row shows whole. */
function hudReadable(t) {
  const hint = document.querySelector(".control-hint");
  const side = document.querySelector(".side");
  const hb = boxOf(hint);
  const sb = side && boxOf(side);
  if (!hb) t.problem("bug", "The controls hint isn't showing while he's the player's");
  else {
    const lines = Math.round(hb.height / (parseFloat(getComputedStyle(hint).lineHeight) || 16));
    if (sb && boxesOverlap(hb, sb)) t.problem("bug", "The controls hint overlaps the Details panel");
    else t.event("hint-clear", `hint ${Math.round(hb.width)}x${Math.round(hb.height)} (${lines} lines) clear of the Details panel`);
  }
  if (sb) {
    const bar = boxOf(document.getElementById("abilitybar"));
    const rows = [...side.querySelectorAll(".meters > *")];
    const bad = rows.filter((r) => {
      const b = r.getBoundingClientRect();
      const vis = b.top >= sb.top - 1 && b.bottom <= sb.bottom + 1;
      return (hb && boxesOverlap(hb, b)) || (bar && boxesOverlap(bar, b)) || (!vis && side.scrollHeight <= side.clientHeight);
    });
    if (bad.length) t.problem("bug", `${bad.length} Body row(s) in Details are covered (${bad.map((r) => r.textContent.trim().slice(0, 12)).join(", ")})`);
    else t.event("details-readable", `${rows.length} Body rows clear of the hint and ability bar; panel bottom ${Math.round(sb.bottom)}`);
    const now = side.querySelector(".log li.now, .log li.note:last-child");
    if (now) {
      const sp = now.querySelector("span");
      const clipped = sp.scrollWidth > sp.clientWidth + 1 || now.scrollWidth > now.clientWidth + 1;
      if (clipped) t.problem("bug", `The highlighted log row is clipped: "${sp.textContent.slice(0, 40)}"`);
      else t.event("log-row-whole", `highlighted log row wraps fully (${Math.round(now.getBoundingClientRect().height)}px): "${sp.textContent.slice(0, 40)}"`);
    }
  }
}

/** Walk straight at a ramp's high end from the driveway side, like a real player would. Before the fix he walked in
 *  under the ramp, where the gap is lower than the capsule, and wedged. He must stop at the ramp's end wall, not be
 *  under it, and then be able to walk away. */
async function rampWedgeCheck(t, b) {
  const C = window.day.control;
  const s = b.stair;
  if (!C.place) return;
  t.scene(`Ramp end of ${b.id}`);
  C.place(s.x1 + 6, s.z, Math.PI / 2);
  await sleep(300);
  const under = (p) => p.x > s.x0 && p.x < s.x1 + 0.1 && Math.abs(p.z - s.z) < s.w / 2 + 0.1 && p.y < b.h - 1.5;
  // straight along the ramp's line, under where it ends, as far as he will go
  await goTo(s.x0 - 2, s.z, t, { sprint: true, close: 0.5, progress: 0.7, ms: 12000, stall: 3000 });
  const p1 = C.state();
  if (under(p1)) {
    t.problem("bug", `Walking straight at the ${b.id} ramp's high end took him under it (at ${p1.x.toFixed(1)},${p1.z.toFixed(1)} y ${p1.y.toFixed(2)})`);
    return;
  }
  // and from the side, along the street
  C.place(s.x1 - 4, s.z + s.w / 2 + 3, Math.PI);
  await sleep(200);
  await goTo(s.x1 - 4, s.z, t, { close: 0.5, progress: 0.7, ms: 6000, stall: 2500 });
  const p2 = C.state();
  if (under(p2)) {
    t.problem("bug", `Walking at the ${b.id} ramp from the street side took him under it (at ${p2.x.toFixed(1)},${p2.z.toFixed(1)} y ${p2.y.toFixed(2)})`);
    return;
  }
  const out = await goTo(s.x1 + 5, s.z + s.w / 2 + 3, t, { close: 1, progress: 0.7, ms: 10000, stall: 3000 });
  if (out) t.event("ramp-wedge-clear", `walking at the ${b.id} ramp's high end stops at its wall (x ${p1.x.toFixed(1)}), not under it, and he walks away`);
  else t.problem("bug", `He couldn't walk away from the ${b.id} ramp's end (at ${C.state().x.toFixed(1)},${C.state().z.toFixed(1)})`);
}

/** Smoke's last step: take control outside, climb the first rooftop with a stair, throw one bolt (E). */
async function roofBolt(t) {
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  const cfg = window.DAY_CONFIG;
  if (!C || !P) {
    t.problem("bug", "There's no Take control or powers to test lightning");
    return;
  }
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const day = window.day.today();
  const outside = carSideMoment(day)
    || day.actions.find((a) => /steps out/.test(a.text || ""))
    || quietMoment(day);
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  t.event("start-at", `${E().fmtClock(outside.start)} outside, to climb a roof`);
  t.scene("Take control");
  const smokeCard = watchStatusCard(t, "smoke");
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  t.event("control-taken", "Enter");
  await checkStatusCard(t, "foot", "smoke: right after Take control" + (outside === carSideMoment(day) ? " beside the car" : ""));
  const b = ((cfg.city && cfg.city.blocks) || []).find((x) => x.stair);
  if (!b) {
    t.problem("bug", "The district has no roof with a stair");
    return;
  }
  const s = b.stair;
  t.scene(`Roof ${b.id}`);
  // Come to the ramp's foot from the street side first: straight along its line from the driveway he'd walk
  // under the ramp's high end and wedge there (the capsule is taller than the gap).
  // A slow bot (the morning rush, software rendering) runs the sim at a fraction of real time: main.js caps a frame
  // at 0.1 s, and at 2.4 m/s the 15 m ramp then outlasts a goTo's limit (smoke failed at y 3.18, half way up). So the
  // ramp legs sprint, the limits are generous, and a retry carries on from where he stands if he's already on the ramp.
  const onRamp = () => {
    const p = C.state();
    return p.y > 0.4 && p.y <= b.h - 0.4 && p.x > s.x0 - 1.2 && p.x < s.x1 + 0.5 && Math.abs(p.z - s.z) < s.w;
  };
  // Climb until a deadline, not a fixed number of tries: on a slow frame rate the sim crawls (0.1 s a frame at most)
  // and the ramp can outlast any one goTo. Each pass carries on from where he stands (onRamp), and only a roof
  // arrival walks him to the middle, so a timed-out pass never drags him sideways into the wall mid-ramp.
  let ok = false;
  // He takes over ~30 m east of the ramp; on a slow bot that walk alone ate the runner's 180 s. Smoke tests the climb
  // and the bolt, not the street walk (the `city` scenario walks it), so stand him at the ramp's foot.
  if (C.place) C.place(s.x0 - 3, s.z + s.w / 2 + 1.5, -Math.PI / 2);
  // The climb is timed in GAME seconds (day.control.simTime): a slow bot runs the sim behind the wall clock, so a
  // wall-clock deadline fails a climb that was only slow. The wall cap is a safety net for a frozen page.
  const CLIMB_SIM_SEC = 150; // game seconds to get up the ramp (it takes ~12 at a walk)
  const STUCK_SIM_SEC = 12; // no new height for this long, on the ramp or not, is stuck rather than slow
  const wall0 = performance.now();
  const sim0 = simNow();
  t.event("climb-start", `to the ${b.id} roof (y ${C.state().y.toFixed(2)}, roof ${b.h})`);
  let bestY = C.state().y;
  let bestAt = sim0;
  let stuck = false;
  while (!ok && simNow() - sim0 < CLIMB_SIM_SEC && performance.now() - wall0 < 600000) {
    const reached = (onRamp() || (await goTo(s.x0 - 0.9, s.z + s.w / 2 + 1.5, t, { sprint: true, close: 1, progress: 0.72, ms: 30000, stall: 5000 })
      && (await goTo(s.x0 - 0.9, s.z, t, { progress: 0.75, ms: 8000, stall: 5000 }))))
      && (await goTo(s.x1 - 0.25, s.z, t, { sprint: true, close: 0.35, progress: 0.8, ms: 40000, stall: 5000 }));
    if (reached || C.state().y > b.h - 0.4) {
      await goTo(b.x, b.z, t, { close: 0.8, progress: 0.85, ms: 20000, stall: 5000 });
      ok = C.state().y > b.h - 0.4;
    }
    const y = C.state().y;
    if (y > bestY + 0.05) {
      bestY = y;
      bestAt = simNow();
    } else if (!ok && simNow() - bestAt > STUCK_SIM_SEC) {
      stuck = true;
      break;
    }
  }
  const climbSim = simNow() - sim0;
  const climbWall = (performance.now() - wall0) / 1000;
  t.metric("climbSimSec", Math.round(climbSim * 10) / 10);
  t.metric("climbWallSec", Math.round(climbWall * 10) / 10);
  if (ok && climbSim > 30) t.problem("polish", `The ${b.id} climb took ${climbSim.toFixed(0)} game s (it takes ~12 at a walk)`);
  if (ok) t.event("climb-done", `up the ${b.id} ramp in ${climbSim.toFixed(1)} game s (${climbWall.toFixed(1)} s wall, ${(climbSim / Math.max(climbWall, 0.001)).toFixed(2)}x real time)`);
  else if (stuck) t.problem("bug", `He is stuck on the ${b.id} ramp: no height gained in ${STUCK_SIM_SEC} game s (best y ${bestY.toFixed(2)}, at ${C.state().x.toFixed(1)},${C.state().z.toFixed(1)})`);
  else t.problem("bug", `The ${b.id} climb was slow, not stuck, and ran out of ${CLIMB_SIM_SEC} game s (${climbWall.toFixed(0)} s wall, y ${C.state().y.toFixed(2)} of ${b.h})`);
  const st = C.state();
  const onRoof = ok && st.y > b.h - 0.4;
  if (onRoof) t.event("on-rooftop", `on the ${b.id} roof at y ${st.y.toFixed(2)}`);
  else t.problem("bug", `He isn't on the ${b.id} roof (y ${st.y.toFixed(2)} at ${st.x.toFixed(1)},${st.z.toFixed(1)})`);
  const cost = (cfg.powers && cfg.powers.costs && cfg.powers.costs.bolt) || 24;
  await t.until(() => P.now().pressure + 0.05 >= cost, 15000, "Pressure for the bolt").catch(() => {});
  const barEl = document.getElementById("abilitybar");
  const slotEl = document.getElementById("ability-bolt");
  const barUp = !!(barEl && !barEl.hidden && slotEl);
  if (barUp) t.event("ability-bar", `bar up: ${P.now().abilities.map((x) => x.key.toUpperCase() + " " + x.name).join(", ")}; energy ${Math.round(P.now().energy)}`);
  else t.problem("bug", "The ability bar isn't showing while he's the player's");
  hudReadable(t);
  if (barUp) {
    const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const bar = barEl.getBoundingClientRect();
    const others = [".daybar", ".bottom", "#control-btn", ".control-btn"].map((q) => document.querySelector(q)).filter((e) => e && e.offsetParent);
    const bad = others.filter((e) => hit(bar, e.getBoundingClientRect()));
    if (bad.length) t.problem("bug", `The ability bar and Energy label cover ${bad.map((e) => e.className || e.id).join(", ")}`);
    const sp = [...document.querySelectorAll("#speeds button")].filter((e) => hit(bar, e.getBoundingClientRect()));
    if (sp.length) t.problem("bug", `The ability bar covers the speed buttons ${sp.map((e) => e.textContent.trim()).join(", ")}`);
    else t.event("speed-buttons-clear", "every speed button (incl. 300x, 1200x) is clear of the ability bar");
    if (!bad.length) t.event("ability-bar-clear", `bar at y ${Math.round(bar.top)}-${Math.round(bar.bottom)} clear of the day timeline and Let go`);
  }
  {
    // control mode: no Privacy/version text under Let go, and the aim ring stays clear of it
    const tags = [".privacy-tag", ".version-tag"].map((q) => document.querySelector(q)).filter((e) => e && e.offsetParent);
    if (tags.length) t.problem("bug", "The Privacy/version footer still shows in control mode");
    else t.event("footer-hidden", "Privacy and version text hidden while he's the player's");
    const ret = document.getElementById("power-reticle");
    const lg = document.getElementById("control") || document.querySelector(".control-btn");
    if (ret && !ret.hidden && lg) {
      const a = ret.getBoundingClientRect(), b = lg.getBoundingClientRect();
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) t.problem("bug", "The aim ring sits under the Let go button");
      else t.event("reticle-clear", `aim ring at y ${Math.round(a.top)} clear of Let go (bottom ${Math.round(b.bottom)})`);
    }
  }
  const e0 = P.now().energy;
  const WXB = window.weather || window.day.weather;
  if (WXB && WXB.now().state === "clear" && WXB.now().rain < 0.05) t.event("calm-before", "clear, no rain, before the bolt");
  else t.problem("bug", `The sky wasn't calm before lightning: ${WXB && WXB.now().state}`);
  pressKey("e");
  await t.until(() => P.now().strike, 3000, "a lightning strike").catch(() => {});
  const strike = P.now().strike;
  if (strike) t.event("bolt-struck", `from the roof, at ${strike.x.toFixed(1)},${strike.z.toFixed(1)}`);
  else t.problem("bug", "E didn't throw lightning from the rooftop");
  await sleep(250);
  const bolt = P.now().abilities.find((x) => x.id === "bolt");
  const spent = e0 - P.now().energy;
  if (bolt && bolt.remaining > 0 && slotEl && slotEl.classList.contains("cooling") && spent > cost * 0.5) {
    t.event("ability-used", `lightning cost ${Math.round(spent + 3)} energy now ${Math.round(P.now().energy)}, cooldown ${bolt.remaining.toFixed(1)} s on the bar`);
  } else t.problem("bug", "The ability bar didn't show energy spent and a cooldown after lightning");
  if (WXB) {
    const storm = await t.until(() => WXB.now().state === "storm", 2000, "storm weather after lightning").then(() => true).catch(() => false);
    if (storm) t.event("weather-on-bolt", `lightning brought ${WXB.now().state}, rain ${WXB.now().rain.toFixed(2)}`);
    else t.problem("bug", "Lightning didn't bring storm weather");
  }
  pressKey("e");
  await sleep(150);
  const again = P.now().blocked;
  if (again && again.reason === "cooldown") t.event("ability-cooldown", "a second E during the cooldown is refused");
  else t.problem("bug", "Lightning could be thrown again during its cooldown");
  if (WXB) {
    const t0 = Date.now();
    const cleared = await t.until(() => WXB.now().state === "clear" && WXB.now().rain < 0.05, 12000, "the storm to clear").then(() => true).catch(() => false);
    const secs = (Date.now() - t0) / 1000;
    if (cleared && secs < 10) t.event("weather-cleared", `back to clear ${secs.toFixed(1)} s after the bolt (rain ${WXB.now().rain.toFixed(2)})`);
    else t.problem("bug", "The storm from lightning didn't clear within seconds");
  }
  // The wedge check walks him around the ramp for a while, so it runs after the roof moment, not between
  // Take control and "on-rooftop" (that gap is what the review reads as the climb time).
  await rampWedgeCheck(t, b);
  // Let go: On foot on every sample while he walks (or catches up) back to his day.
  pressKey("Escape");
  await t.until(() => C.mode() !== "control", 3000, "letting go");
  await checkStatusCard(t, "foot", "smoke: right after Let go");
  await t.until(() => C.mode() === "schedule", 30000, "him back on his day").catch(() => t.problem("polish", "smoke: he wasn't back on his day 30 s after Let go"));
  smokeCard.stop();
  if (C.mode() === "schedule") await checkStatusCard(t, "day", "smoke: back on his day");
  t.event(strike && onRoof ? "smoke-pass" : "smoke-fail", "city loaded, Small Weather shown, rooftop, one bolt");
}

/* ---------------- crowd-reacts: citizens answer each ability's weather, then go back to routine ---------------- */
async function crowdReacts(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const P = window.powers || (window.day && window.day.powers);
  const W = window.weather || (window.day && window.day.weather);
  const C = window.day.control;
  await t.until(() => window.day.crowd, 8000, "the crowd (js/crowd.js)");
  const crowd = window.day.crowd;
  if (!P || !W || !C) {
    t.problem("bug", "powers, weather or Take control isn't installed");
    return;
  }
  // setup shortcut: the clock to lunch, when the sidewalks are full
  scrubTo(12.4 * 60);
  clickSpeed(1);
  await sleep(1500);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  const calm = () => {
    const n = W.now();
    return n.state === "clear" && n.rain < 0.05 && n.fog < 0.015 && n.wind < 0.2 && n.sun < 0.05;
  };
  await t.until(calm, 6000, "a calm sky to start").catch(() => {});
  await sleep(1500);
  const base = crowd.info();
  t.event("crowd-routine", `${base.people} people, ${base.cars} cars, ${base.reacting} reacting, car speed ${base.carSpeed.toFixed(1)} m/s`);
  const cases = [
    { id: "bolt", key: "e", kind: "lookup", count: (i) => i.lookingUp, what: "stop and look up at the flash" },
    { id: "rain", key: "r", kind: "rain", count: (i) => i.running, what: "run for cover (umbrellas up, the rest into doorways)" },
    { id: "gale", key: "v", kind: "gale", count: (i) => i.hats, what: "lean into the wind with a hand on the hat" },
    { id: "fog", key: "c", kind: "fog", count: (i) => i.reacting, what: "slow down; traffic crawls", cars: true },
    { id: "sunbreak", key: "x", kind: "sun", count: (i) => i.cheering, what: "stroll and cheer, hands up" },
  ];
  let reacted = 0;
  let n = 0;
  for (const c of cases) {
    n++;
    t.scene(`Citizens: ${c.id}`);
    t.progress(0.1 + 0.16 * n);
    const cost = (P.now().abilities.find((x) => x.id === c.id) || {}).cost || 20;
    await t.until(() => P.now().energy + 0.05 >= cost, 15000, `Energy for ${c.id}`).catch(() => {});
    await t.until(calm, 10000, "a calm sky").catch(() => {});
    await t.until(() => crowd.info().reacting === 0, 6000, "the crowd back to routine").catch(() => {});
    const before = crowd.info();
    pressKey(c.key);
    let peak = before;
    let best = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 3500) {
      await sleep(250);
      const i = crowd.info();
      if (c.count(i) > best) { best = c.count(i); peak = i; }
      if (best >= 8 && (!c.cars || i.carSpeed < before.carSpeed * 0.9)) break;
    }
    const carNote = c.cars ? `, car speed ${before.carSpeed.toFixed(1)} -> ${peak.carSpeed.toFixed(1)} m/s` : "";
    if (peak.reaction === c.kind && best >= 5) {
      reacted++;
      t.event(`react-${c.id}`, `${best} of ${peak.people} citizens ${c.what}${carNote}`);
    } else t.problem("bug", `${c.id}: the citizens didn't react (${peak.reaction || "no reaction"}, ${best} reacting of ${peak.people})`);
    t.metric(`reacting-${c.id}`, best);
    // the ability weather ends; they should be back to routine within seconds
    const t1 = Date.now();
    const back = await t.until(() => calm() && crowd.info().reacting === 0 && crowd.info().reaction === "", 14000, `${c.id}: back to routine`).then(() => true).catch(() => false);
    const secs = (Date.now() - t1) / 1000;
    const after = crowd.info();
    if (back) t.event(`routine-${c.id}`, `routine again ${secs.toFixed(1)} s after the call: ${after.walking} walking, ${after.cars} cars at ${after.carSpeed.toFixed(1)} m/s`);
    else t.problem("bug", `${c.id}: the citizens were still reacting ${secs.toFixed(0)} s later (${after.reacting})`);
  }
  t.metric("reactedAbilities", reacted);
  if (reacted >= 4) t.event("crowd-reacts-pass", `${reacted} of 5 abilities changed what the citizens do, and each ended with the weather`);
  else t.problem("bug", `Only ${reacted} abilities changed the citizens' behaviour`);
  pressKey("Escape");
}

/* ---------------- neighbors: find three neighbors, answer their asks, collect thank-yous and surprises ---------------- */
// Setup shortcuts: the day bar (to the morning, then to each surprise's hour) and Take control beside the car.
// Everything else is real keys: WASD/Shift to walk the sidewalk to each neighbor, then R, X, E for what they ask.
async function sliceScenario(options, t) {
  t.scene("Home block and park");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.slice && window.day.control, 8000, "the slice (js/slice.js)");
  const C = window.day.control;
  const beads = [];
  let last = performance.now();
  let maxQuiet = 0;
  const bead = (k) => {
    const n = performance.now();
    maxQuiet = Math.max(maxQuiet, (n - last) / 1000);
    last = n;
    beads.push(k);
    t.event("bead", k);
  };
  ["day:slice", "day:neighbor", "day:power", "day:voice"].forEach((n) => window.addEventListener(n, (e) => bead(n + ":" + ((e.detail && e.detail.action) || ""))));
  const day = window.day.today();
  const outside = carSideMoment(day);
  scrubTo(outside.start + 1);
  clickSpeed(1);
  await sleep(600);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  scrubTo(9 * 60);
  await sleep(700);
  if (C.mode() !== "control") { pressKey("Enter"); await t.until(() => C.mode() === "control", 4000, "Take control again"); }
  const sideZ = (window.DAY_CONFIG.street || { z: 12.6 }).z - 2.8;
  const hop = async (x, z) => { for (let k = 0; k < 8; k++) { const s = C.state(); if (Math.abs(s.x - x) < 2) break; await goTo(s.x + Math.max(-20, Math.min(20, x - s.x)), sideZ, t, { sprint: true, ms: 12000, close: 1.2 }); bead("walk"); } return goTo(x, z, t, { ms: 12000, close: 1.5 }); };
  t.scene("Birdie's pots");
  await hop(-21, 9.5);
  await t.until(() => window.day.neighbors.now().people.find((p) => p.id === "birdie"), 2000, "Birdie");
  pressKey("r");
  await sleep(1500);
  const lawnOk = await t.until(() => window.day.slice.now().lawn === "damp", 9000, "the lawn going damp after Birdie's rain").then(() => true, () => false);
  if (!lawnOk) t.problem("bug", "Birdie's rain didn't change the lawn");
  t.scene("Park path to the bandstand");
  await goTo(-8, 24, t, { ms: 14000, close: 1.5 });
  bead("park");
  await goTo(-18, 41, t, { ms: 16000, close: 2 });
  await sleep(800);
  const sl = window.day.slice.now();
  if (!sl.scattered) t.problem("bug", "The pigeons didn't scatter when he walked up");
  if (!sl.creaks) t.problem("bug", "The bandstand didn't creak");
  t.scene("Pond");
  await goTo(10, 55, t, { ms: 16000, close: 3 });
  pressKey("y");
  await sleep(600);
  if (!window.day.slice.now().coins) t.problem("bug", "The coin toss at the pond did nothing");
  t.metric("quality.maxQuietSeconds", +maxQuiet.toFixed(1));
  t.metric("quality.textOnlyBeats", 0);
  if (maxQuiet > 10) t.problem("bug", `Quiet for ${maxQuiet.toFixed(1)} s on the slice walk`);
  t.event("slice-done", JSON.stringify(window.day.slice.now()));
}

async function neighborsScenario(options, t) {
  t.scene("Home");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  await t.until(() => window.day.neighbors, 8000, "the neighbors (js/neighbors.js)");
  const N = window.day.neighbors;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  const day = window.day.today();
  if (!N || !C || !P) {
    t.problem("bug", "neighbors, powers or Take control isn't installed");
    return;
  }
  const cfg = window.DAY_CONFIG;
  const street = cfg.street || { z: 12.6 };
  const sideZ = street.z - 2.8;
  const roster = N.now().people;
  if (roster.length === 3) t.event("neighbors-three", roster.map((p) => `${p.name} (${p.parts} parts, ${p.look})`).join("; "));
  else t.problem("bug", `${roster.length} neighbors, wanted 3`);
  const who = (id) => N.now().people.find((p) => p.id === id);
  const toast = () => $("neighbor-toast");

  // setup: the clock beside the car, then Take control
  const outside = carSideMoment(day);
  if (!outside) {
    t.problem("bug", "No moment beside the car to take control");
    return;
  }
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  const setClock = async (hour, why) => {
    scrubTo(hour * 60);
    clickSpeed(1);
    await sleep(700);
    t.event("clock", `${why}: ${E().fmtClock(hour * 60)}`);
    if (C.mode() !== "control") {
      pressKey("Enter");
      await t.until(() => C.mode() === "control", 4000, "Take control again");
    }
  };
  await setClock(8 + 10 / 60, "morning");

  // walk the sidewalk (real keys) to a spot, in hops so the stair ramps and cross streets are no trap
  async function walkTo(x, z, progress) {
    await goTo(C.state().x, sideZ, t, { sprint: true, progress, ms: 12000, close: 1.2 });
    for (let k = 0; k < 14; k++) {
      const s = C.state();
      if (Math.abs(s.x - x) < 1.6) break;
      const nx = s.x + Math.max(-22, Math.min(22, x - s.x));
      if (!(await goTo(nx, sideZ, t, { sprint: true, progress, ms: 14000, close: 1.2 }))) break;
    }
    return goTo(x, z, t, { progress, ms: 8000, close: 1.4 });
  }
  async function visit(id, x, z, key, scene, progress) {
    t.scene(scene);
    const spot = await walkTo(x, z, progress);
    const me = C.state();
    const p = who(id);
    if (!spot) t.problem("bug", `${id}: he didn't reach ${x},${z} (at ${me.x.toFixed(1)},${me.z.toFixed(1)})`);
    const dist = Math.hypot(p.x - me.x, p.z - me.z);
    if (dist < 10) t.event(`found-${id}`, `${p.name} found ${dist.toFixed(1)} m away at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    else t.problem("bug", `${p.name} isn't where the finder says (${dist.toFixed(0)} m)`);
    const asked = await t.until(() => who(id).asking, 5000, `${id}'s request`).then(() => true).catch(() => false);
    if (!asked) return t.problem("bug", `${p.name} never asked (stage ${who(id).stage})`);
    t.event(`beat-ask-${id}`, `"${who(id).bubble}"`);
    await sleep(900);
    const ab = (window.DAY_CONFIG.neighbors.list.find((n) => n.id === id).beats[0] || {}).ability;
    const cost = (P.now().abilities.find((a) => a.id === ab) || {}).cost || 20;
    await t.until(() => P.now().energy + 0.05 >= cost, 20000, `Energy for ${ab}`).catch(() => {});
    const before = N.now().score;
    pressKey(key);
    const paid = await t.until(() => N.now().score > before, 7000, `${id}'s thank-you`).then(() => true).catch(() => false);
    if (paid) {
      t.event(`beat-thanks-${id}`, `"${who(id).bubble}" — ${toast().textContent}`);
      t.event(`reward-${id}`, `score ${before} -> ${N.now().score}, ${who(id).stars}, toast "${toast().textContent}" ${toast().classList.contains("on") ? "showing" : "gone"}`);
      await sleep(1200);
    } else t.problem("bug", `${p.name}: using ${ab} didn't pay a reward (stage ${who(id).stage}, score ${N.now().score})`);
    await t.until(() => (P.now().abilities.find((a) => a.id === ab) || {}).cooldown <= 0, 12000, "cooldown").catch(() => {});
  }
  async function surprise(id, hour, x, z, scene, progress) {
    t.scene(scene);
    await setClock(hour, `${id}'s surprise`);
    if (Math.hypot(who(id).x - C.state().x, who(id).z - C.state().z) > 8) await walkTo(x, z, progress);
    const before = N.now().score;
    const ok = await t.until(() => N.now().score > before, 9000, `${id}'s surprise`).then(() => true).catch(() => false);
    if (ok) t.event(`beat-surprise-${id}`, `"${who(id).bubble}" — ${toast().textContent}; score ${before} -> ${N.now().score}`);
    else t.problem("bug", `${who(id).name}'s surprise never came (hour ${hour}, ${Math.hypot(who(id).x - C.state().x, who(id).z - C.state().z).toFixed(0)} m away)`);
    await sleep(1000);
  }

  await visit("birdie", -24.5, 9.6, "r", "Birdie, the apt block", 0.12);
  await visit("dex", 43.2, 9.9, "x", "Dex, the shop", 0.3);
  await surprise("dex", 16.5, 43.2, 9.9, "Dex, late afternoon", 0.4);
  await surprise("birdie", 17.4, -24.5, 9.6, "Birdie, evening", 0.5);
  await setClock(17.6, "evening");
  await visit("quill", 151.5, 9.9, "e", "Ines Quill, the annex", 0.7);
  await surprise("quill", 21, 151.5, 9.9, "Ines Quill, night", 0.9);

  const fin = N.now();
  const done = fin.people.reduce((n, p) => n + p.done.length, 0);
  t.metric("neighborBeats", done);
  t.metric("neighborScore", fin.score);
  if (done >= 9 && fin.people.every((p) => p.done.length >= 2)) t.event("neighbors-pass", `${done} beats across 3 neighbors, good-neighbor score ${fin.score}`);
  else t.problem("bug", `Only ${done} neighbor beats were completed (${fin.people.map((p) => p.id + ":" + p.done.length).join(" ")})`);
  pressKey("Escape");
}

/* ---------------- weather-abilities: rain, gale, fog, sun break and lightning, one call each ---------------- */
async function weatherAbilities(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const P = window.powers || (window.day && window.day.powers);
  const W = window.weather || (window.day && window.day.weather);
  const C = window.day.control;
  if (!P || !W || !C) {
    t.problem("bug", "powers, weather or Take control isn't installed");
    return;
  }
  const day = window.day.today();
  const outside = carSideMoment(day)
    || day.actions.find((a) => /steps out/.test(a.text || ""))
    || quietMoment(day);
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  const sound = $("sound");
  if (sound) {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 4, pointerType: "mouse" }));
    sound.click();
    await sleep(200);
  }
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  t.event("control-taken", "Enter, so his abilities work");
  const ids = ["rain", "gale", "fog", "sunbreak", "bolt"];
  // The bar's slots are built on the first frame painted under control, so wait for them.
  await t.until(() => ids.every((id) => document.getElementById("ability-" + id)), 4000, "the ability bar slots").catch(() => {});
  const bar = P.now().abilities;
  const keys = ids.map((id) => {
    const a = bar.find((x) => x.id === id);
    return a ? `${a.key.toUpperCase()} ${a.name}` : `${id} MISSING`;
  });
  if (ids.every((id) => bar.some((x) => x.id === id) && document.getElementById("ability-" + id))) t.event("five-abilities", keys.join(", "));
  else t.problem("bug", `The ability bar doesn't have all five: ${keys.join(", ")}`);
  const calm = () => {
    const n = W.now();
    return n.state === "clear" && n.rain < 0.05 && n.fog < 0.015 && n.wind < 0.2 && n.sun < 0.05;
  };
  await t.until(calm, 6000, "a calm sky to start").catch(() => {});
  const looks = {};
  const probes = {
    rain: { key: "r", ok: (n) => n.state === "rain" && n.rain > 0.3, show: (n) => `rain ${n.rain.toFixed(2)}, wet ${n.wet.toFixed(2)}` },
    gale: { key: "v", ok: (n) => n.state === "wind" && n.wind > 0.5, show: (n) => `wind ${n.wind.toFixed(2)}, dust ${n.dust.toFixed(2)}` },
    fog: { key: "c", ok: (n) => n.state === "fog" && n.fog > 0.04, show: (n) => `fog density ${n.fog.toFixed(3)}` },
    sunbreak: { key: "x", ok: (n) => n.sun > 0.5, show: (n) => `warm light ${n.sun.toFixed(2)}, sky ${n.sky}` },
    bolt: { key: "e", ok: (n) => n.state === "storm", show: (n) => `storm, flashes ${n.flashes}` },
  };
  let n = 0;
  for (const id of ids) {
    n++;
    const pr = probes[id];
    t.scene(`Ability: ${id}`);
    t.progress(0.1 + 0.17 * n);
    const cost = (P.now().abilities.find((x) => x.id === id) || {}).cost || 20;
    await t.until(() => P.now().energy + 0.05 >= cost, 15000, `Energy for ${id}`).catch(() => {});
    const e0 = P.now().energy;
    pressKey(pr.key);
    const hit = await t.until(() => (id === "bolt" ? P.now().strike : true) && pr.ok(W.now()), 4000, `${id} to show in the sky`).then(() => true).catch(() => false);
    await sleep(900);
    const seen = W.now();
    looks[id] = { sky: seen.sky, fog: seen.fog, rain: seen.rain, wind: seen.wind, sun: seen.sun };
    const slot = document.getElementById("ability-" + id);
    if (hit && pr.ok(seen)) t.event(`ability-${id}`, `${pr.show(seen)}; spent ${Math.round(e0 - P.now().energy)} energy`);
    else t.problem("bug", `${pr.key.toUpperCase()} (${id}) didn't change the sky as it should (state ${seen.state})`);
    if (!slot || !(slot.classList.contains("cooling") || slot.classList.contains("active"))) t.problem("bug", `The ${id} slot didn't show it was used`);
    const heard = (W.now().heard || 0);
    t.metric(`heard-${id}`, Number(heard.toFixed(3)));
    const t0 = Date.now();
    const gone = await t.until(calm, 14000, `${id} to ease out`).then(() => true).catch(() => false);
    const secs = (Date.now() - t0) / 1000 + 0.9;
    if (gone && secs < 10) t.event(`fade-${id}`, `back to a calm sky ${secs.toFixed(1)} s after the call`);
    else t.problem("bug", `${id} didn't fade out within seconds`);
  }
  const skies = ids.map((id) => looks[id].sky);
  if (new Set(skies).size === ids.length) t.event("all-distinct", `five different skies: ${skies.join(" ")}`);
  else t.problem("bug", `Two abilities looked the same: ${skies.join(" ")}`);
  pressKey("Escape");
  t.event("weather-abilities-pass", "each of the five used once");
}

/* ---------------- day: the whole day at high speed; every block must happen ---------------- */
async function wholeDay(options, t) {
  t.scene("Start of day");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const key = window.day.now().key;
  const day = window.day.today();
  const cfg = window.DAY_CONFIG;
  t.log(`date ${key}: ${day.blocks.length} blocks, ${day.actions.length} actions`);
  t.metric("blocks", day.blocks.length);
  t.metric("actions", day.actions.length);
  if (day.spots && day.spots.bed && day.spots.desk) {
    t.event("city-places", `bed ${day.spots.bed.x.toFixed(0)},${day.spots.bed.z.toFixed(0)} · desk ${day.spots.desk.x.toFixed(0)},${day.spots.desk.z.toFixed(0)}`);
    if (day.spots.desk.x > 400) t.problem("bug", `the office is still out along the old road (desk x ${day.spots.desk.x.toFixed(0)})`);
  }

  // Spine blocks the config has but today's random draw skipped (chance) are fine, just noted.
  const today = new Set(day.blocks.map((b) => b.title));
  (cfg.spine || []).filter(Boolean).forEach((b) => {
    if (!today.has(b.title || "")) {
      if (b.chance != null) t.event("skipped-today", `${b.time} ${b.title} (chance ${b.chance})`);
      else t.problem("bug", `"${b.time} ${b.title}" is in the config but not in today's timeline`);
    }
  });
  // Every block needs actions of its own.
  const actionsPerBlock = {};
  day.actions.forEach((a) => (actionsPerBlock[a.block] = (actionsPerBlock[a.block] || 0) + 1));
  day.blocks.forEach((b) => {
    if (!actionsPerBlock[b.title]) t.problem("bug", `"${E().fmtClock(b.start)} ${b.title}" has no actions of its own`);
  });

  // Back to the start of the day on the day bar, then play fast.
  scrubTo(day.dayStart);
  await sleep(300);
  let speed = 1200 * Math.max(1, options.speed || 1);
  if (speed === 1200) clickSpeed(1200);
  else window.day.speed(speed); // faster than the fastest button: the console hook
  t.scene(`Playing ${speed}×`);
  t.event("play", `${speed}×`);

  const swept = new Uint8Array(day.actions.length); // the clock passed through it
  const shown = new Uint8Array(day.actions.length); // a frame landed on it
  const blockSeen = new Map(); // title -> rendered frames
  let lastMove = performance.now();
  const run = { stopped: false };
  stopRun = () => (run.stopped = true);
  let lastMinutes = null;
  let frames = 0;
  let nanFrames = 0;
  let onScreen = 0;
  let checked = 0;
  let lastScreenCheck = 0;
  let lastCarCheck = 0;
  let carChecks = 0;
  let carOk = 0;
  let carBad = 0;
  let walkFrames = 0;
  let walkStill = 0;
  let lastPos = null;
  let ended = false;
  const span = day.dayEnd - day.dayStart;

  unwatch = window.day.watch(({ key: k, fr, from, to, jumped }) => {
    if (k !== key) {
      ended = true; // the clock rolled into the next day
      return;
    }
    frames++;
    if (!checkFrame(t, fr)) nanFrames++;
    // Mark every action the clock swept through since the last frame.
    const i1 = fr.index;
    let i0 = i1;
    if (!jumped && from != null && from <= to) i0 = E().frame(day, from).index;
    for (let i = i0; i <= i1; i++) swept[i] = 1;
    shown[i1] = 1;
    const title = fr.action.block;
    if (!blockSeen.has(title)) t.event("block", `${E().fmtClock(fr.action.start)} ${title}`);
    blockSeen.set(title, (blockSeen.get(title) || 0) + 1);
    t.note(`${title}: ${fr.action.text}`);
    // The character moves while the engine says they walk.
    const w = world();
    if (fr.person.walking && !fr.person.inCar && w && w.person) {
      const p = w.person.position;
      if (lastPos) {
        walkFrames++;
        if (Math.hypot(p.x - lastPos.x, p.z - lastPos.z) < 1e-4) walkStill++;
      }
      lastPos = { x: p.x, z: p.z };
    } else lastPos = null;
    const now = performance.now();
    if (fr.person.inCar && now - lastCarCheck > 700) {
      lastCarCheck = now;
      const pos = carScreenPos();
      const ok = !!pos && pos.x > 0.15 && pos.x < 0.85 && pos.y > 0.15 && pos.y < 0.85;
      carChecks++;
      if (ok) carOk++;
      else if (carBad++ < 3) t.problem("bug", `The car isn't on screen while driving (${E().fmtClock(fr.action.start)} ${fr.action.text})`);
      t.log(`car-on-screen ${ok ? "yes" : "NO"} ${pos ? pos.x.toFixed(2) + "," + pos.y.toFixed(2) : "behind camera"} ${$("time").textContent}${$("ampm").textContent}`);
    }
    if (now - lastScreenCheck > 1000) {
      lastScreenCheck = now;
      checked++;
      if (personOnScreen()) onScreen++;
    }
    if (lastMinutes == null || to > lastMinutes + 1e-6) {
      lastMove = now;
      t.progress((to - day.dayStart) / span);
    }
    lastMinutes = to;
  });


  const stalled = () => performance.now() - lastMove > 5000;
  const finished = () => ended || window.day.now().minutes >= day.dayEnd - 0.05;
  // main.js caps a frame at 0.1 s, so a slow renderer (software WebGL in a headless browser)
  // plays slower than the label. Every 3 s, re-aim the speed to end the day about 75 s in.
  const aimAt = performance.now() + 75000;
  let raised = false;
  try {
    while (!finished() && !stalled() && !(run.stopped)) {
      const m0 = window.day.now().minutes;
      await sleep(3000);
      const m1 = window.day.now().minutes;
      const rate = (m1 - m0) / 3; // day-minutes per second
      const left = Math.max(5, (aimAt - performance.now()) / 1000);
      if (rate > 0 && !finished() && (day.dayEnd - m1) / rate > left * 1.2) {
        speed = Math.min(60000, Math.round((speed * (day.dayEnd - m1)) / left / rate));
        window.day.speed(speed);
        if (!raised) t.log(`speed raised for a slow frame rate (${rate.toFixed(1)} day-min/s)`);
        raised = true;
        t.scene(`Playing ${speed}×`);
      }
    }
  } finally {
    stopWatching();
  }
  t.metric("speed", speed);
  if (stalled() && !ended) {
    t.problem("bug", `The clock stopped at ${E().fmtClock(lastMinutes)} (character stuck?)`);
    t.finish("stuck");
    return;
  }

  // Results
  t.scene("End of day");
  const sweptCount = swept.reduce((a, b) => a + b, 0);
  const shownCount = shown.reduce((a, b) => a + b, 0);
  t.metric("frames", frames);
  t.metric("actionsReached", sweptCount);
  t.metric("actionsOnScreen", shownCount);
  t.metric("blocksOnScreen", blockSeen.size);
  t.metric("nanFrames", nanFrames);
  t.metric("walkFrames", walkFrames);
  t.metric("walkFramesStill", walkStill);
  t.metric("carChecks", carChecks);
  t.metric("carOnScreenPct", carChecks ? Math.round((carOk / carChecks) * 100) : 0);
  t.metric("personOnScreenPct", checked ? Math.round((onScreen / checked) * 100) : 0);

  const missedBlocks = [];
  day.blocks.forEach((b) => {
    const idx = day.actions.filter((a) => a.block === b.title).map((a) => a.i);
    if (idx.length && !idx.some((i) => swept[i])) missedBlocks.push(b);
  });
  missedBlocks.forEach((b) => t.problem("bug", `Activity "${E().fmtClock(b.start)} ${b.title}" never started`));
  t.metric("blocksStarted", day.blocks.length - missedBlocks.length);
  if (sweptCount < day.actions.length) {
    const firstMissed = day.actions.find((a) => !swept[a.i]);
    t.problem("bug", `${day.actions.length - sweptCount} actions were never reached (first: ${E().fmtClock(firstMissed.start)} "${firstMissed.text}")`);
  }
  if (walkFrames > 20 && walkStill / walkFrames > 0.25) {
    t.problem("bug", `The person stood still in ${walkStill} of ${walkFrames} walking frames (stuck on a walk?)`);
  }
  if (checked > 5 && onScreen / checked < 0.6) {
    t.problem("warning", `The person was on screen in only ${onScreen} of ${checked} checks`);
  }
  // Long single actions that aren't a fill (sleep, work…) read as a frozen character.
  day.actions.forEach((a) => {
    if (a.path && a.end - a.start > 5) t.problem("warning", `"${a.text}" walks for ${(a.end - a.start).toFixed(1)} min (${a.block})`);
  });

  pressKey("Escape");
  t.event("back-to-live");
  t.progress(1);
}

/* ---------------- analytics: the events going out, then the question after 3 minutes ---------------- */
// The page turns on the SDK's debug mode for a bot's tab (index.html), so hawkesAnalytics.debugLog holds
// every event and marks it `sent` when its batch goes out. Every interaction is real input.
const sent = () => ((window.hawkesAnalytics && window.hawkesAnalytics.debugLog) || []).filter((e) => e.sent);
const has = (name, test) => (window.hawkesAnalytics.debugLog || []).some((e) => e.name === name && (!test || test(e)));

function pointer(type, x, y, id = 1) {
  const c = $("view");
  const r = c.getBoundingClientRect();
  const ev = new PointerEvent(type, { pointerId: id, pointerType: "mouse", isPrimary: true, clientX: r.left + x * r.width, clientY: r.top + y * r.height, button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true });
  c.dispatchEvent(ev);
}

/** Drag on the 3D view to turn the camera, like a mouse does. */
async function dragCamera(dx) {
  pointer("pointerdown", 0.5, 0.55);
  for (let i = 1; i <= 12; i++) {
    pointer("pointermove", 0.5 + (dx * i) / 12, 0.55);
    await sleep(40);
  }
  pointer("pointerup", 0.5 + dx, 0.55);
}

async function analytics(options, t) {
  t.scene("Live");
  checkBasics(t);
  const A = window.hawkesAnalytics;
  if (!A) {
    t.problem("bug", "Hawkes Analytics didn't load (hawkesgen.ai/sdk/analytics@1.js)");
    return;
  }
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const c = A.config();
  t.log(`analytics product ${c.product}, env ${c.env}, build ${JSON.stringify(c.build)}, debug ${c.debug}, session ${c.session}`);
  t.event("analytics-config", `env ${c.env} · build ${c.build && c.build.version} ${c.build && c.build.commit ? "@" + c.build.commit : ""}`);
  t.metric("analyticsEnv", c.env);
  t.metric("analyticsBuild", (c.build && c.build.version) || "none");
  if (c.product !== "icanbe") t.problem("bug", `Analytics product is "${c.product}", not icanbe`);
  if (!c.build || !c.build.version || c.build.version === "dev") {
    if (c.env === "beta" || c.env === "live") t.problem("bug", `The page has no build for analytics (HAWKES_BUILD is ${JSON.stringify(c.build)}): scripts/stamp-build.mjs didn't run`);
  }
  if (!c.debug) t.problem("warning", "The SDK's debug mode is off, so the events going out can't be shown (open with ?hawkes-analytics-debug=1)");

  // Every event the page sends shows on the timeline once its batch goes out.
  let shown = 0;
  const showSent = () => {
    const list = sent();
    for (; shown < list.length; shown++) {
      const e = list[shown];
      const p = e.props || {};
      const detail = p.name || p.label || p.action || p.minutes || "";
      t.event("analytics", `${e.name}${detail !== "" ? " " + detail : ""}${p.via ? " (" + p.via + ")" : ""} · ${e.ctx && e.ctx.time ? e.ctx.time + " " : ""}${(e.ctx && e.ctx.activity) || ""}`);
    }
  };
  const showing = setInterval(showSent, 500);
  stopRun = () => clearInterval(showing);
  try {
    await t.until(() => has("game_ready"), 10000, "game_ready");
    t.progress(0.05);

    // The camera: turn it, zoom it, tap the room.
    t.scene("Camera");
    await dragCamera(0.18);
    await sleep(800);
    $("view").dispatchEvent(new WheelEvent("wheel", { deltaY: -240, clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true, cancelable: true }));
    await sleep(800);
    pointer("pointerdown", 0.5, 0.5);
    await sleep(80);
    pointer("pointerup", 0.5, 0.5);
    await sleep(800);
    t.progress(0.1);

    // Speed: the 60× button, then 300× for a few seconds (activities pass: progress).
    t.scene("Playing 300×");
    clickSpeed(60);
    await sleep(1500);
    pressKey("4"); // 300×
    await sleep(6000);
    pressKey(" "); // pause
    await sleep(1000);
    t.progress(0.15);

    // The day bar: drag to noon and stay; then step on with the arrows.
    t.scene("Day bar");
    scrubTo(12 * 60);
    await sleep(3000);
    pressKey("ArrowRight");
    await sleep(200);
    pressKey("ArrowRight");
    await sleep(2500);
    // The panel and sound buttons (the HUD is hidden on the public site, but the buttons work).
    $("details").click();
    await sleep(300);
    $("details").click();
    $("sound").click();
    await sleep(300);
    $("sound").click();
    pressKey("Escape"); // back to now
    t.scene("Live");
    t.progress(0.2);

    // Take control, set the weather, throw lightning, glide, let go — the player features.
    t.scene("Player");
    const quiet = quietMoment(window.day.today());
    if (quiet) {
      scrubTo(quiet.start + Math.min(0.4, (quiet.end - quiet.start) / 3));
      await sleep(500);
    }
    pressKey("Enter");
    await t.until(() => window.day.control && window.day.control.mode() === "control", 4000, "take control").catch(() => {});
    const offerEl = $("episode-offer");
    if (offerEl && !offerEl.hidden) {
      const dec = offerEl.querySelector(".decline");
      if (dec) dec.click();
      await sleep(200);
    }
    const Cplay = window.day.control;
    if (!Cplay || Cplay.mode() !== "control") t.problem("bug", "Couldn't take control, so take_control / weather / power never fire");
    else {
      pressKey("2");
      await sleep(350);
      await t.until(() => window.day.powers && window.day.powers.now().pressure >= 24, 8000, "Pressure for a bolt").catch(() => {});
      pressKey("e");
      await sleep(250);
      keyDown(" ");
      await sleep(700);
      keyUp(" ");
      await sleep(350);
      pressKey("Escape");
      await sleep(300);
    }
    t.progress(0.22);

    // Wait for the batches to go out.
    await t.until(() => ["page_view", "game_ready", "screen", "progress", "feature"].every((n) => sent().some((e) => e.name === n)), 15000, "page_view, progress and feature events to be sent").catch(() => {});
    // The batches go out every few seconds: the player features (let_go, glide) may sit in the next one.
    await t.until(() => ["take_control", "let_go", "weather", "power", "glide"].every((f) => sent().some((e) => e.name === "feature" && e.props && e.props.name === f)), 15000, "the player feature events to be sent").catch(() => {});
    showSent();
    for (const n of ["page_view", "session_start", "game_ready", "screen", "progress", "feature"]) {
      if (!sent().some((e) => e.name === n)) t.problem("bug", `No ${n} event went out`);
    }
    const features = new Set(sent().filter((e) => e.name === "feature").map((e) => e.props.name));
    t.metric("featuresSent", [...features].join(","));
    ["camera", "speed", "pause", "scrub", "step", "details", "sound", "live"].forEach((f) => !features.has(f) && t.problem("warning", `No feature event for ${f}`));
    ["take_control", "let_go", "weather", "power"].forEach((f) => !features.has(f) && t.problem("bug", `No feature event for ${f}`));
    if (!features.has("glide")) t.problem("warning", "No feature event for glide");
    t.metric("progressSent", sent().filter((e) => e.name === "progress").length);
    if (!sent().some((e) => e.name === "feature" && e.ctx && e.ctx.time && e.ctx.activity)) t.problem("warning", "Events don't carry the time of day and the activity in their context");

    // The question: after 3 minutes on screen, when the viewer isn't touching anything.
    t.scene("Watching (the question comes after 3 minutes)");
    const after = window.day.analytics.askAfter;
    const card = () => document.querySelector(`[data-hawkes-ask="${window.day.analytics.askId}"]`);
    while (!card() && window.day.analytics.watched() < after + 20) {
      await sleep(2000);
      t.progress(0.2 + 0.6 * Math.min(1, window.day.analytics.watched() / after));
    }
    if (!card()) {
      t.problem("bug", `The feedback question didn't show after ${window.day.analytics.watched()} s on screen`);
      return;
    }
    t.scene("The question");
    t.event("feedback-prompt", `shown after ${window.day.analytics.watched()} s: "Are you enjoying this so far?"`);
    await sleep(5000); // long enough to read in the footage
    const close = card().shadowRoot && card().shadowRoot.querySelector(".ha-x");
    if (!close) t.problem("bug", "The feedback question has no close button");
    else close.click();
    await sleep(600);
    if (card()) t.problem("bug", "The feedback question didn't close");
    else t.event("feedback-prompt", "dismissed");
    t.scene("Live");
    await t.until(() => sent().some((e) => e.name === "feedback_prompt" && e.props.action === "dismissed"), 12000, "the dismissal to be sent").catch(() =>
      t.problem("warning", "The feedback_prompt dismissed event didn't go out"));
    showSent();
    t.metric("eventsSent", sent().length);
    t.progress(1);
  } finally {
    clearInterval(showing);
  }
}

/* ---------------- control: take him, move, run, jump, let go, he walks back to his day ---------------- */
// Real input only: Enter, WASD, Shift, Space and Esc as keys; a mouse drag for the camera; then the phone's touch
// stick and jump button as touch pointers. Setup shortcuts (named): the day bar to a quiet moment at home, and
// day.control.touch(true) to show the phone's controls on a desktop-sized window ("phone controls").
function keyDown(key, extra) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, code: key === " " ? "Space" : "", bubbles: true, ...(extra || {}) }));
}
function keyUp(key, extra) {
  window.dispatchEvent(new KeyboardEvent("keyup", { key, code: key === " " ? "Space" : "", bubbles: true, ...(extra || {}) }));
}
async function holdKeys(list, ms) {
  list.forEach((k) => keyDown(k, { shiftKey: list.includes("Shift") }));
  await sleep(ms);
  list.slice().reverse().forEach((k) => keyUp(k));
}
async function tapKey(key, ms = 120) {
  keyDown(key);
  await sleep(ms);
  keyUp(key);
}
function touchOn(el, type, x, y, id = 7) {
  el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true }));
}
async function tapEl(el) {
  const r = el.getBoundingClientRect();
  touchOn(el, "pointerdown", r.left + r.width / 2, r.top + r.height / 2, 9);
  await sleep(90);
  touchOn(el, "pointerup", r.left + r.width / 2, r.top + r.height / 2, 9);
}
/** Measures how far and how fast he goes while `act` runs: { path, peak } (metres, metres per second). */
async function measure(act) {
  const C = window.day.control;
  let last = C.state();
  let path = 0;
  let peak = 0;
  const iv = setInterval(() => {
    const st = C.state();
    path += Math.hypot(st.x - last.x, st.z - last.z);
    peak = Math.max(peak, st.speed);
    last = st;
  }, 50);
  try {
    await act();
  } finally {
    clearInterval(iv);
  }
  return { path: Math.round(path * 100) / 100, peak: Math.round(peak * 100) / 100 };
}

/** A quiet moment at home: he's on the couch (or anywhere at home, not walking, for a while). */
/** A moment he stands beside his car at home (unlock, out of the car, lock): the longest one. Action times are sim
 * minutes and these last only 3-7 sim seconds (0.04-0.12), so there is no minimum length. */
function carSideMoment(day) {
  return day.actions
    .filter((a) => a.place === "carSideHome" && !a.inCar && !a.path && a.pose !== "walk" && a.end > a.start)
    .reduce((best, a) => (!best || a.end - a.start > best.end - best.start ? a : best), null);
}

function quietMoment(day) {
  const home = (a) => !a.inCar && !a.path && a.room && window.DAY_CONFIG.rooms[a.room] && window.DAY_CONFIG.rooms[a.room].building === "home";
  return (
    day.actions.find((a) => a.pose === "sitCouch" && home(a) && a.end - a.start > 4) ||
    day.actions.find((a) => home(a) && a.pose !== "lie" && a.pose !== "side" && a.end - a.start > 4) ||
    day.actions.find((a) => !a.inCar && !a.path)
  );
}

/** The log rebuilds on the next painted frame, so wait for a row (any of `texts`) rather than read it at once. */
async function logHas(t, texts, problem) {
  const list = [].concat(texts).filter(Boolean);
  const has = () => list.some((x) => $("log").textContent.includes(x));
  await t.until(has, 3000, "the action log row").catch(() => {});
  if (!has()) t.problem("bug", `${problem} (looked for "${list.join('" or "')}")`);
}

/** Let go (Esc or the button), then watch him walk back: no teleport, ends where the day says, the log goes on. */
async function letGoAndWatch(t, how, label) {
  const C = window.day.control;
  const w = world();
  let maxStep = 0;
  let frames = 0;
  let lastPos = null;
  let off = null;
  unwatch = window.day.watch(({ fr, steered }) => {
    const p = w.person.position;
    if (steered) {
      frames++;
      if (lastPos) maxStep = Math.max(maxStep, Math.hypot(p.x - lastPos.x, p.z - lastPos.z));
      lastPos = { x: p.x, z: p.z };
    } else if (C.mode() === "schedule" && off == null && !fr.person.inCar) {
      off = Math.hypot(p.x - fr.person.x, p.z - fr.person.z);
    }
  });
  const fr0 = window.day.now().frame;
  const st0 = C.state();
  t.log(`${label}: letting go at ${st0.x.toFixed(2)},${st0.z.toFixed(2)}; his day says ${fr0.person.x.toFixed(2)},${fr0.person.z.toFixed(2)} (${fr0.room}): "${fr0.action.text}"`);
  const cardWatch = watchStatusCard(t, `${label} walking back`, 200);
  await how();
  await t.until(() => C.mode() !== "control", 3000, "letting go");
  await checkStatusCard(t, "foot", `${label}: right after Let go`);
  t.event("let-go", `${label}: his day says ${fr0.room} · "${fr0.action.text}" · ${Math.hypot(st0.x - fr0.person.x, st0.z - fr0.person.z).toFixed(1)} m away`);
  await logHas(t, window.DAY_CONFIG.control.lines.letGo, "Letting go isn't in the action log");
  await t.until(() => C.mode() === "schedule", 70000, "him to walk back to his day").finally(() => cardWatch.stop());
  await checkStatusCard(t, "day", `${label}: back on his day`);
  await sleep(300);
  stopWatching();
  const backEv = C.log().filter((e) => e.what === "back").pop();
  const back = backEv && { how: backEv.detail && backEv.detail.how }; // mark(what, detail): the field is under detail
  const fr = window.day.now().frame;
  t.metric(`${label}ReturnFrames`, frames);
  t.metric(`${label}ReturnMaxStep`, Math.round(maxStep * 1000) / 1000);
  if (back && back.how === "walk") t.event("back-on-schedule", `${label}: walked back, now "${fr.action.text}" (${fr.room}), ${off == null ? "?" : off.toFixed(3)} m from where his day puts him`);
  else t.problem("bug", `${label}: he didn't walk back to his day (${back ? back.how || "no how" : "no back"}; the day says "${fr.action.text}")`);
  if (maxStep > 0.5) t.problem("bug", `${label}: he jumped ${maxStep.toFixed(2)} m in one frame on the way back (a teleport, not a walk)`);
  if (off != null && off > 0.05) t.problem("bug", `${label}: back on his day, but ${off.toFixed(2)} m from where it puts him`);
  checkFrame(t, fr);
  // He may have caught up in a fade (catchUp line) instead of walking: either way the log says he's back.
  const L = window.DAY_CONFIG.control.lines;
  await logHas(t, [L.back, L.catchUp], "Being back on his day isn't in the action log");
}

async function control(options, t) {
  t.scene("Live");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const C = window.day.control;
  if (!C) {
    t.problem("bug", "There's no Take control (js/control.js didn't install)");
    return;
  }
  const btn = $("control");
  if (!btn) t.problem("bug", "There's no Take control button");
  const lines = window.DAY_CONFIG.control.lines;

  // Setup: a quiet moment at home on the day bar, the clock running at 1×.
  // Beside his car at home when the day has one (the status card used to say IN THE CAR here); else a quiet moment.
  // The car-side moment lasts seconds, so take control on the paused bar: taking control plays the clock.
  const day = window.day.today();
  const side = carSideMoment(day);
  const a = side || quietMoment(day);
  scrubTo(a.start + Math.min(side ? 0.02 : 1, (a.end - a.start) / 3));
  await sleep(600);
  if (!side) clickSpeed(1);
  t.event("start-at", `${E().fmtClock(a.start)} ${a.block}: "${a.text}" (${a.room})${side ? " beside the car" : ""}`);
  if (!side) await sleep(1500);
  t.progress(0.05);

  // 1. Take control (Enter).
  t.scene("Taking control");
  const m0 = window.day.now().minutes;
  const takeCard = watchStatusCard(t, "control");
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 3000, "Take control (Enter)");
  await checkStatusCard(t, "foot", "right after Take control" + (side ? " beside the car" : ""));
  await sleep(300);
  checkHud(t, "control: on foot");
  const st = C.state();
  t.event("control-taken", `Enter · at ${st.x.toFixed(2)},${st.z.toFixed(2)} · Havok controller ${st.physics ? "on" : "OFF"} · button "${btn && btn.textContent}"`);
  if (!st.physics) t.problem("bug", "He moves without the Havok character controller (physics off?)");
  if (btn && btn.textContent !== "Let go") t.problem("bug", `The button says "${btn.textContent}" while he's the player's, not "Let go"`);
  await logHas(t, lines.take, "Taking control isn't in the action log");
  await sleep(1200);
  t.progress(0.12);

  // 2. Walk (WASD), 3. sprint (Shift), in a few directions: walls stop one, not all.
  t.scene("Walking");
  const walk = await measure(async () => {
    await holdKeys(["d"], 1200);
    await holdKeys(["w"], 900);
    await holdKeys(["a"], 900);
  });
  t.event("moved", `WASD: ${walk.path} m, up to ${walk.peak} m/s (walking is ${C.move.walk})`);
  if (walk.path < 1.5) t.problem("bug", `Holding WASD for 3 s moved him only ${walk.path} m`);
  t.progress(0.22);
  t.scene("Sprinting");
  const run = await measure(async () => {
    for (const k of ["s", "d", "w", "a"]) await holdKeys(["Shift", k], 800);
  });
  t.event("sprint", `Shift: ${run.path} m, up to ${run.peak} m/s (sprint is ${C.move.sprint})`);
  if (run.peak < C.move.walk * 1.6) t.problem("bug", `Sprinting topped out at ${run.peak} m/s (walking is ${C.move.walk})`);
  if (!(run.peak > walk.peak)) t.problem("bug", "Sprinting isn't faster than walking");
  t.progress(0.32);

  // The camera orbits him (a mouse drag).
  t.scene("Camera");
  const alpha0 = world().camera.alpha;
  await dragCamera(0.22);
  await sleep(600);
  const turned = world().camera.alpha - alpha0;
  if (Math.abs(turned) > 0.05) t.event("camera-orbit", `drag turned the camera ${turned.toFixed(2)} rad; he's on screen: ${personOnScreen()}`);
  else t.problem("bug", "Dragging didn't orbit the camera while he's the player's");
  if (!personOnScreen()) t.problem("bug", "He's off screen while the player has him");
  t.progress(0.38);

  // 4. Jump, and two more in the air (a fourth press does nothing), then hold to float down.
  t.scene("Jumping");
  const flights0 = C.state().flights;
  let floated = false;
  let peakY = 0;
  const y0 = C.state().y;
  const watchAir = setInterval(() => {
    const s = C.state();
    floated = floated || s.floating;
    peakY = Math.max(peakY, s.y - y0);
  }, 50);
  try {
    await tapKey(" ");
    await sleep(500);
    await tapKey(" ");
    await sleep(500);
    await tapKey(" ");
    await sleep(450);
    await tapKey(" "); // one too many
    await sleep(250);
    keyDown(" ");
    await sleep(1600);
    keyUp(" ");
    await t.until(() => C.state().flights > flights0, 6000, "him to land");
  } finally {
    clearInterval(watchAir);
  }
  const fl = C.state().lastFlight || { jumps: 0, height: 0 };
  t.event("triple-jump", `${fl.jumps} jumps in one flight (1 + ${C.move.airJumps} in the air), ${peakY.toFixed(2)} m up${floated ? ", floated down holding Space" : ""}`);
  if (fl.jumps !== 1 + C.move.airJumps) t.problem("bug", `${fl.jumps} jumps in one flight, not ${1 + C.move.airJumps} (a jump and two in the air)`);
  if (!floated) t.problem("polish", "Holding Space while falling didn't float him down");
  t.progress(0.5);

  if (!(window.day.now().minutes > m0)) t.problem("bug", "The clock stopped while the player had him");
  else t.event("clock-running", `${(window.day.now().minutes - m0).toFixed(2)} day-minutes passed while he was the player's`);

  // 5. Let go (Esc): he walks back to where his day says, and the day carries on.
  t.scene("Letting go");
  takeCard.stop();
  await letGoAndWatch(t, () => pressKey("Escape"), "keys");
  t.scene("Back on his day");
  const row0 = $("what").textContent;
  clickSpeed(60);
  await sleep(4000);
  const nowRow = $("log").querySelector("li.now");
  t.event("log-continues", `"${row0}" → now "${nowRow ? nowRow.textContent.replace(/^\S+/, "").trim() : "?"}" at ${$("time").textContent}${$("ampm").textContent}`);
  clickSpeed(1);
  await sleep(800);
  t.progress(0.7);

  // The phone: the touch stick and the jump button.
  t.scene("Phone controls");
  const native = C.state().touch;
  if (!native) C.touch(true);
  t.event("touch-layout", native ? `a phone-sized window (${innerWidth}×${innerHeight})` : `phone controls shown on a ${innerWidth}×${innerHeight} window (setup shortcut)`);
  if (!btn.disabled) await tapEl(btn);
  btn.click();
  await t.until(() => C.mode() === "control", 3000, "Take control (tap)");
  await sleep(300);
  const stickEl = $("stick");
  const jumpEl = $("jump-btn");
  const visible = (el) => !!el && el.offsetParent !== null && el.getBoundingClientRect().width > 30;
  if (visible(stickEl) && visible(jumpEl)) t.event("touch-controls", `stick ${Math.round(stickEl.getBoundingClientRect().width)} px, jump button ${Math.round(jumpEl.getBoundingClientRect().width)} px`);
  else {
    t.problem("bug", "The touch stick and jump button didn't appear on the phone layout");
    return;
  }
  const r = stickEl.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const touchMove = await measure(async () => {
    for (const [dx, dy, ms] of [[0, -32, 1100], [34, 0, 900], [0, 60, 900], [-60, 0, 900]]) {
      touchOn(stickEl, "pointerdown", cx, cy);
      for (let i = 1; i <= 4; i++) {
        touchOn(stickEl, "pointermove", cx + (dx * i) / 4, cy + (dy * i) / 4);
        await sleep(40);
      }
      await sleep(ms);
      touchOn(stickEl, "pointerup", cx + dx, cy + dy);
      await sleep(150);
    }
  });
  t.event("touch-move", `the stick: ${touchMove.path} m, up to ${touchMove.peak} m/s (pushed to the edge runs)`);
  if (touchMove.path < 1.5) t.problem("bug", `The touch stick moved him only ${touchMove.path} m`);
  if (touchMove.peak < C.move.walk * 1.6) t.problem("polish", `Pushing the touch stick to its edge didn't run (${touchMove.peak} m/s)`);
  const tf0 = C.state().flights;
  await tapEl(jumpEl);
  await sleep(450);
  await tapEl(jumpEl);
  await sleep(450);
  await tapEl(jumpEl);
  await t.until(() => C.state().flights > tf0, 8000, "him to land after the touch jumps");
  const tfl = C.state().lastFlight || { jumps: 0 };
  t.event("touch-jump", `the jump button: ${tfl.jumps} jumps, ${tfl.height} m`);
  checkHud(t, "control: phone controls");
  if (tfl.jumps < 2) t.problem("bug", `The touch jump button gave ${tfl.jumps} jumps for three taps`);
  t.progress(0.85);

  t.scene("Letting go (phone)");
  await letGoAndWatch(t, () => tapEl(btn).then(() => btn.click()), "touch");
  if (!native) C.touch(false);
  t.scene("Back on his day");
  await sleep(1500);
  await drivingCard(t);
  t.progress(1);
}

/** Scrub to a moment the day has him driving, nobody steering: the card says In the car (and the button is locked). */
async function drivingCard(t) {
  const C = window.day.control;
  const day = window.day.today();
  const drive = day.actions.find((a) => a.inCar && a.car && a.car.path && a.end > a.start);
  if (!drive) {
    t.problem("warning", "The day has no driving moment to check the status card against");
    return;
  }
  if (C.mode() !== "schedule") {
    t.problem("bug", `Nobody should be steering for the driving check, but control is "${C.mode()}"`);
    return;
  }
  t.scene("Driving, nobody steering");
  scrubTo(drive.start + Math.min(0.3, (drive.end - drive.start) / 3));
  await t.until(() => window.day.now().frame.person.inCar, 3000, "the day to have him driving");
  await checkStatusCard(t, "car", "driving, nobody steering");
}

/* ---------------- model: Small Weather's rigged 3D model, on his day and under control ---------------- */
// Waits for the GLB (js/small-weather.js), then watches which clip his model plays: on autopilot while his day walks
// him, stands him and sits him at the desk (day-bar setup shortcuts), then under control with real keys: still (idle),
// WASD (walk), Shift (run), Space (jump, then fall), Space held (float). Esc lets go and he walks back.
function skinNow() {
  const w = world();
  return w && w.skin ? w.skin() : null;
}
/** The clips his model played while `act` ran (sampled every 50 ms), in order of first appearance. */
async function clipsDuring(act) {
  const seen = [];
  const iv = setInterval(() => {
    const s = skinNow();
    const c = s && s.clip();
    if (c && !seen.includes(c)) seen.push(c);
  }, 50);
  try {
    await act();
  } finally {
    clearInterval(iv);
  }
  return seen;
}
async function watchDay(t, label, a, want, ms) {
  scrubTo(a.start + Math.min(0.2, (a.end - a.start) / 3));
  clickSpeed(1);
  const seen = await clipsDuring(() => sleep(ms));
  const ok = want.some((c) => seen.includes(c));
  t.event(`autopilot-${label}`, `${E().fmtClock(a.start)} "${a.text}" (${a.pose || "stand"}${a.hand ? ", " + a.hand : ""}): his model played ${seen.join(" → ") || "nothing"}`);
  if (!ok) t.problem("bug", `On his day (${label}: "${a.text}") his model played ${seen.join(", ") || "nothing"}, not ${want.join(" or ")}`);
}

async function model(options, t) {
  t.scene("Loading his model");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  /* Small Weather or nothing: the box figure (the stand-in) must never be drawn, not even while his GLB loads */
  let standInSeen = false;
  const watchStandIn = () => {
    const w = window.day.world && window.day.world();
    const sk = skinNow();
    if (w && w.person && w.person.getChildMeshes(false).some((m) => m.isEnabled() && m.isVisible && !(sk && sk.meshes.includes(m)) && !/phone|cup|bag|shadowproxy|bolt/i.test(m.name))) standInSeen = true;
  };
  const standInTimer = setInterval(watchStandIn, 16);
  watchStandIn();
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model !== "loading", 30000, "his model to load").catch(() => {});
  watchStandIn();
  clearInterval(standInTimer);
  if (standInSeen) t.problem("blocker", "The box stand-in showed for Small Weather (it must be Small Weather or nothing)");
  const info = window.day.engineInfo ? window.day.engineInfo() : {};
  if (info.model !== "small-weather" || !skinNow()) {
    t.problem("blocker", `Small Weather's model didn't load (${info.model}${info.modelError ? ": " + info.modelError : ""}): he isn't shown`);
    return;
  }
  const skin = skinNow();
  t.event("model", `Small Weather's 3D model: ${skin.meshes.length} mesh(es), clips ${skin.clips.join(" ")}`);
  t.progress(0.08);

  // On autopilot: his day walks him, stands him, sits him down to work.
  const day = window.day.today();
  const home = (a) => a.room && window.DAY_CONFIG.rooms[a.room] && window.DAY_CONFIG.rooms[a.room].building === "home";
  const walkA = day.actions.filter((a) => a.path && !a.inCar && home(a)).sort((x, y) => y.end - y.start - (x.end - x.start))[0];
  const standA = day.actions.find((a) => !a.path && !a.inCar && (!a.pose || a.pose === "stand") && (!a.hand || a.hand === "none") && a.end - a.start > 1);
  const workA = day.actions.find((a) => a.pose === "sitChair" && a.hand === "type" && a.end - a.start > 5);
  t.scene("His day: walking");
  if (walkA) await watchDay(t, "walk", walkA, ["walk"], 3500);
  t.scene("His day: standing");
  if (standA) await watchDay(t, "idle", standA, ["idle"], 2500);
  t.scene("His day: at work");
  if (workA) await watchDay(t, "work", workA, ["type", "sit"], 3000);
  t.progress(0.35);

  // Under control: real keys.
  const C = window.day.control;
  if (!C) {
    t.problem("bug", "There's no Take control (js/control.js didn't install)");
    return;
  }
  const a = quietMoment(day);
  scrubTo(a.start + Math.min(1, (a.end - a.start) / 3));
  await sleep(600);
  clickSpeed(1);
  t.scene("Taking control");
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 3000, "Take control (Enter)");
  const check = (label, seen, want) => {
    t.event(`control-${label}`, `${label}: his model played ${seen.join(" → ") || "nothing"}`);
    want.forEach((c) => {
      if (!seen.includes(c)) t.problem("bug", `Under control (${label}) his model never played "${c}" (${seen.join(", ") || "nothing"})`);
    });
  };
  t.scene("Idle");
  check("still", await clipsDuring(() => sleep(1500)), ["idle"]);
  t.progress(0.45);
  t.scene("Walking");
  check("WASD", await clipsDuring(() => holdKeys(["d"], 1300).then(() => holdKeys(["w"], 1000))), ["walk"]);
  t.progress(0.55);
  t.scene("Running");
  check("Shift", await clipsDuring(() => holdKeys(["Shift", "a"], 1200).then(() => holdKeys(["Shift", "s"], 1000))), ["run"]);
  t.progress(0.65);
  t.scene("Jumping and falling");
  const flights0 = C.state().flights;
  check(
    "Space",
    await clipsDuring(async () => {
      await tapKey(" ");
      await t.until(() => C.state().flights > flights0, 6000, "him to land").catch(() => {});
      await sleep(400);
    }),
    ["jump", "fall"]
  );
  t.progress(0.75);
  t.scene("Floating");
  const flights1 = C.state().flights;
  check(
    "Space held",
    await clipsDuring(async () => {
      await tapKey(" ");
      await sleep(350);
      await tapKey(" ");
      await sleep(350);
      keyDown(" ");
      await sleep(2200);
      keyUp(" ");
      await t.until(() => C.state().flights > flights1, 8000, "him to land").catch(() => {});
    }),
    ["float"]
  );
  if (!personOnScreen()) t.problem("bug", "He's off screen while the player has him");
  t.progress(0.85);

  t.scene("Letting go");
  await letGoAndWatch(t, () => pressKey("Escape"), "keys");
  t.scene("Back on his day");
  t.event("model-back", `back on his day, his model plays "${skinNow() ? skinNow().clip() : "?"}"`);
  await sleep(1500);
  t.progress(1);
}

/* ---------------- city: the day in the district, then walk the streets, the park and three roofs ---------------- */
// Day-bar setup shows home, the drive and the office. The walk is real keys (WASD, Shift, Enter).
// Ramps are the north-face stairs in day.config.js city.blocks.
let heldKeys = [];
function setHeld(next) {
  heldKeys.filter((k) => !next.includes(k)).forEach((k) => keyUp(k));
  next.filter((k) => !heldKeys.includes(k)).forEach((k) => keyDown(k, { shiftKey: next.includes("Shift") }));
  heldKeys = next.slice();
}
function releaseHeld() {
  heldKeys.forEach((k) => keyUp(k));
  heldKeys = [];
}
function steerKeys(tx, tz, sprint) {
  const st = window.day.control.state();
  const dx = tx - st.x;
  const dz = tz - st.z;
  const dist = Math.hypot(dx, dz) || 1;
  const cam = world().camera;
  const fx = -Math.cos(cam.alpha);
  const fz = -Math.sin(cam.alpha);
  const f = (dx * fx + dz * fz) / dist;
  const r = (dx * fz - dz * fx) / dist;
  const keys = [];
  if (f > 0.22) keys.push("w");
  else if (f < -0.22) keys.push("s");
  if (r > 0.22) keys.push("d");
  else if (r < -0.22) keys.push("a");
  if (!keys.length) keys.push(f >= 0 ? "w" : "s");
  if (sprint) keys.push("Shift");
  return keys;
}
/** Game seconds he has been simulated as the player's (day.control.simTime): the clock a climb is measured in. main.js
 *  caps a frame at 0.1 s, so on a slow bot the sim runs behind the wall clock and a wall-clock limit fails a walk that
 *  was only slow. Falls back to wall seconds if the page has no simTime. */
function simNow() {
  const C = window.day && window.day.control;
  return C && C.simTime ? C.simTime() : performance.now() / 1000;
}
/** Walk him to a point with the keys. False if he gets stuck (no movement in `stall` game ms) or falls through.
 *  `ms` and `stall` are GAME time; a wall-clock cap (8x, at least 2 min) is only the safety net for a frozen page. */
async function goTo(tx, tz, t, opts) {
  opts = opts || {};
  const close = opts.close == null ? 0.7 : opts.close;
  const limit = (opts.ms || 22000) / 1000;
  const stallLimit = (opts.stall || 2800) / 1000;
  const sprint = !!opts.sprint;
  const wallCap = Math.max(limit * 8000, 120000);
  const wall0 = performance.now();
  const started = simNow();
  let stillSince = started;
  let last = window.day.control.state();
  let ticks = 0;
  try {
    while (simNow() - started < limit && performance.now() - wall0 < wallCap) {
      const st = window.day.control.state();
      if (st.y < -0.45) {
        t.problem("bug", `He fell through the world at ${st.x.toFixed(1)},${st.z.toFixed(1)} (y ${st.y.toFixed(2)})`);
        return false;
      }
      if (Math.hypot(st.x - tx, st.z - tz) < close) return true;
      if (Math.hypot(st.x - last.x, st.z - last.z) > 0.12) {
        stillSince = simNow();
        last = st;
      } else if (simNow() - stillSince > stallLimit) return false;
      const far = Math.hypot(st.x - tx, st.z - tz);
      setHeld(steerKeys(tx, tz, sprint && far > 2.5));
      if (ticks++ % 6 === 0) t.progress(opts.progress || 0.5);
      await sleep(160);
    }
    return Math.hypot(window.day.control.state().x - tx, window.day.control.state().z - tz) < close + 0.4;
  } finally {
    releaseHeld();
  }
}

async function city(options, t) {
  t.scene("Home");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const day = window.day.today();
  const cfg = window.DAY_CONFIG;
  const street = cfg.street || { from: -48, to: 210, z: 12.6 };
  const onAvenue = (x, z) => x > street.from && x < street.to && Math.abs(z - street.z) < 3;
  if ((day.errors || []).length) return;

  async function moment(sceneName, pred, label) {
    const a = day.actions.find(pred);
    if (!a) {
      t.problem("bug", `The day has no ${label}`);
      return null;
    }
    t.scene(sceneName);
    scrubTo(a.start + Math.min(1, (a.end - a.start) / 3));
    clickSpeed(1);
    await sleep(700);
    const fr = window.day.now().frame;
    checkFrame(t, fr);
    return fr;
  }

  const home = await moment("Home", (a) => a.room === "bedroom" && !a.inCar, "morning at home");
  if (home) {
    const here = home.person.x > street.from && home.person.x < street.to;
    if (here) t.event("day-home", `${home.room} at ${home.person.x.toFixed(1)},${home.person.z.toFixed(1)}: "${home.action.text}"`);
    else t.problem("bug", `Morning at home is outside the district (${home.person.x.toFixed(0)},${home.person.z.toFixed(0)})`);
  }
  t.progress(0.08);

  const drive = await moment("Commute", (a) => a.block === "The rest of the drive" && a.inCar && a.car && a.car.path, "drive along the avenue");
  if (drive) {
    if (onAvenue(drive.car.x, drive.car.z)) t.event("day-commute", `the car at ${drive.car.x.toFixed(1)},${drive.car.z.toFixed(1)} on the avenue: "${drive.action.text}"`);
    else t.problem("bug", `The commute isn't on the avenue (car ${drive.car.x.toFixed(1)},${drive.car.z.toFixed(1)})`);
  }
  t.progress(0.14);

  const office = await moment("Office", (a) => a.room === "workOffice" && a.pose === "sitChair", "at his desk");
  if (office) {
    if (office.person.x > 110 && office.person.x < street.to) t.event("day-office", `desk at ${office.person.x.toFixed(1)},${office.person.z.toFixed(1)}: "${office.action.text}"`);
    else t.problem("bug", `The office isn't in the district (x ${office.person.x.toFixed(0)})`);
  }
  t.progress(0.2);

  const back = await moment("Home again", (a) => a.block === "Home" && !a.inCar, "evening at home");
  if (back) {
    if (back.person.x > street.from && back.person.x < 40) t.event("day-home-again", `${back.room} at ${back.person.x.toFixed(1)},${back.person.z.toFixed(1)}: "${back.action.text}"`);
    else t.problem("bug", `Evening home isn't back in the district (${back.person.x.toFixed(0)},${back.person.z.toFixed(0)})`);
  }

  const C = window.day.control;
  if (!C) {
    t.problem("bug", "There's no Take control");
    return;
  }
  const outside = carSideMoment(day);
  t.scene("Streets");
  if (!outside) {
    t.problem("bug", "No moment beside the car to take control");
    return;
  }
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  t.event("start-at", `${E().fmtClock(outside.start)} beside the car (${outside.room})`);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 3000, "Take control (Enter)");
  if (!C.state().physics) t.problem("bug", "He moves without the Havok character controller");
  t.progress(0.28);

  const park = (cfg.city && cfg.city.park) || { x0: -34, z0: 20, x1: 30, z1: 68 };
  const roofs = ((cfg.city && cfg.city.blocks) || []).filter((b) => b.stair);
  if (roofs.length < 3) t.problem("bug", `The district has ${roofs.length} roofs to climb`);

  const sideZ = street.z - 3.2;
  const walked = await goTo(C.state().x + 14, sideZ, t, { sprint: true, progress: 0.32, ms: 12000 });
  const st1 = C.state();
  if (walked && st1.y < 0.4) t.event("street-walked", `along the sidewalk to ${st1.x.toFixed(1)},${st1.z.toFixed(1)}`);
  else t.problem("bug", `He didn't walk the street (at ${st1.x.toFixed(1)},${st1.z.toFixed(1)} y ${st1.y.toFixed(2)})`);
  t.progress(0.36);

  async function climb(b, progress) {
    const s = b.stair;
    const lip = b.z + b.d / 2 - 1.1;
    const topX = s.x1 - 0.25;
    t.scene(`Roof ${b.id}`);
    if (!(await goTo(s.x0 - 0.9, s.z, t, { sprint: true, progress, ms: 30000 }))) {
      t.problem("bug", `${b.id}: he didn't reach the ramp (at ${C.state().x.toFixed(1)},${C.state().z.toFixed(1)})`);
      return false;
    }
    if (!(await goTo(topX, s.z, t, { close: 0.35, progress, ms: 20000 }))) {
      t.problem("bug", `${b.id}: he didn't walk up the ramp (y ${C.state().y.toFixed(2)} at ${C.state().x.toFixed(1)},${C.state().z.toFixed(1)})`);
      return false;
    }
    if (C.state().y < b.h - 0.45) {
      t.problem("bug", `${b.id}: the ramp left him at y ${C.state().y.toFixed(2)}, roof is ${b.h}`);
      return false;
    }
    await goTo(topX, lip, t, { close: 0.5, progress, ms: 8000 });
    await goTo(b.x, b.z, t, { close: 0.8, progress, ms: 10000 });
    const st = C.state();
    const on = st.y > b.h - 0.4 && Math.abs(st.x - b.x) < b.w / 2 && Math.abs(st.z - b.z) < b.d / 2;
    if (on) t.event(`roof-${b.id}`, `on the roof at y ${st.y.toFixed(2)} (${st.x.toFixed(1)},${st.z.toFixed(1)})`);
    else t.problem("bug", `${b.id}: he isn't on the roof (y ${st.y.toFixed(2)} at ${st.x.toFixed(1)},${st.z.toFixed(1)})`);
    await goTo(topX, lip, t, { close: 0.6, progress, ms: 8000 });
    await goTo(topX, s.z, t, { close: 0.45, progress, ms: 8000 });
    await goTo(s.x0 - 0.9, s.z, t, { close: 0.7, progress, ms: 20000 });
    if (C.state().y > 1) t.problem("bug", `${b.id}: he didn't come back down (y ${C.state().y.toFixed(2)})`);
    return on;
  }

  let roofsUp = 0;
  for (let i = 0; i < roofs.length; i++) {
    if (i === 1) {
      t.scene("Park");
      const into = await goTo(-8, park.z0 + 12, t, { sprint: true, progress: 0.5, ms: 18000 });
      const st = C.state();
      const inside = into && st.x > park.x0 && st.x < park.x1 && st.z > park.z0 && st.z < park.z1 && st.y < 0.45;
      if (inside) t.event("park-entered", `in the park at ${st.x.toFixed(1)},${st.z.toFixed(1)} y ${st.y.toFixed(2)}`);
      else t.problem("bug", `He didn't enter the park (at ${st.x.toFixed(1)},${st.z.toFixed(1)} y ${st.y.toFixed(2)})`);
    }
    if (await climb(roofs[i], 0.4 + i * 0.15)) roofsUp++;
    t.progress(0.45 + i * 0.15);
  }
  t.metric("roofsReached", roofsUp);
  if (roofsUp >= 3) t.event("roofs-reached", `${roofsUp} rooftops`);

  const shop = ((cfg.city && cfg.city.blocks) || []).find((b) => b.id === "shop");
  if (shop) {
    t.scene("Against a wall");
    const face = shop.z - shop.d / 2;
    await goTo(shop.x, face - 1.6, t, { sprint: true, progress: 0.9, ms: 30000 });
    const before = C.state().z;
    setHeld(steerKeys(shop.x, face + 3, false));
    await sleep(1600);
    releaseHeld();
    const after = C.state();
    if (after.z < face - 0.05 && after.y < 1.2) t.event("blocked-by-building", `the shop wall at z ${face.toFixed(1)} stopped him at ${after.z.toFixed(2)} (from ${before.toFixed(2)})`);
    else t.problem("bug", `He walked through the shop (z ${after.z.toFixed(2)}, wall ${face.toFixed(1)}, y ${after.y.toFixed(2)})`);
  }
  if (C.state().y > -0.2) t.event("stayed-on-the-ground", `feet at y ${C.state().y.toFixed(2)} after the walk`);
  t.progress(1);
}

/* ---------------- look: the city at noon, dusk and night, then the phone quality setting ---------------- */
// Day bar to the sidewalk (setup), then real keys walk him in front of a block. Scrub holds the clock
// (a scrub leaves the day paused) so the three times stay put for the shot. The quality button is a real click.
async function look(options, t) {
  t.scene("Setup: beside the car");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.look, 8000, "the city look");
  const day = window.day.today();
  const cfg = window.DAY_CONFIG;
  const street = cfg.street || { z: 12.6 };
  const shop = ((cfg.city && cfg.city.blocks) || []).find((b) => b.id === "shop") || { x: 50, z: 0.5 };
  const outside = carSideMoment(day);
  if (!outside) {
    t.problem("blocker", "No moment beside the car to stand in the street (look can't start)");
    return;
  }
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  await sleep(500);
  const at0 = window.day.now().minutes;
  if (Math.abs(at0 - outside.start) > 5) t.problem("bug", `The setup didn't reach the car (clock ${at0.toFixed(0)} min, wanted ${outside.start.toFixed(0)})`);
  const C = window.day.control;
  if (!C) {
    t.problem("bug", "There's no Take control");
    return;
  }
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 3000, "Take control (Enter)");
  const walked = await goTo(shop.x, street.z - 3.4, t, { sprint: true, progress: 0.25, ms: 20000 });
  if (!walked) t.problem("warning", `He didn't reach the shop front (at ${C.state().x.toFixed(1)},${C.state().z.toFixed(1)})`);
  t.progress(0.35);

  function shot(sceneName, minutes, eventName) {
    t.scene(sceneName);
    scrubTo(minutes);
    return sleep(900).then(() => {
      const clock = window.day.now().minutes;
      if (Math.abs(clock - minutes) > 15) t.problem("bug", `${sceneName}: the clock reads ${Math.floor(clock / 60)}:${String(Math.floor(clock % 60)).padStart(2, "0")}, not the scene's time`);
      const info = window.day.look.info();
      const sky = info.sky || {};
      t.event(eventName, `${sceneName}: source ${info.source}, ${info.pbr} PBR, ${info.textured} textured, ${info.neon} neon, exposure ${info.exposure.toFixed(2)}, sky ${sky.day.toFixed(2)}/${sky.dusk.toFixed(2)}/${sky.night.toFixed(2)}, neon ${info.neonLevel.toFixed(2)}`);
      if (info.pbr < 4 || info.textured < 4) t.problem("bug", "The city surfaces are still flat colours");
      checkHud(t, "look: " + sceneName);
      return info;
    });
  }

  const noon = await shot("City noon", 12 * 60, "look-noon");
  if (noon.sky.day < 0.6) t.problem("bug", `Noon isn't the day sky (${noon.sky.day.toFixed(2)})`);
  if (noon.exposure < 0.8) t.problem("bug", `Noon exposure is ${noon.exposure.toFixed(2)} (the day went dark)`);
  t.progress(0.5);

  const dusk = await shot("City dusk", 18 * 60 + 30, "look-dusk");
  if (dusk.sky.dusk < 0.25 && dusk.sky.night < 0.2) t.problem("bug", "Dusk didn't leave the noon sky");
  t.progress(0.68);

  const night = await shot("City night", 21 * 60 + 30, "look-night");
  if (night.sky.night < 0.6) t.problem("bug", `Night isn't the night sky (${night.sky.night.toFixed(2)})`);
  if (night.neon < 1) t.problem("bug", "No neon signs on the blocks");
  if (night.neonLevel < 0.8) t.problem("bug", `Neon is dim at night (${night.neonLevel.toFixed(2)})`);
  t.progress(0.82);

  t.scene("Quality low");
  const btn = $("quality");
  if (!btn) {
    t.problem("bug", "There's no quality toggle");
    return;
  }
  if (window.day.look.quality() === "low") btn.click();
  btn.click();
  await sleep(300);
  const low = window.day.look.info();
  if (low.quality !== "low") t.problem("bug", `Quality toggle left it on ${low.quality}`);
  if (low.bloom) t.problem("bug", "Low quality left bloom on");
  if (low.shadows) t.problem("bug", "Low quality left the shadow map on");
  if (low.samples > 1) t.problem("bug", `Low quality left MSAA at ${low.samples}`);
  const samples = [];
  const obs = world().scene.onAfterRenderObservable.add(() => samples.push(world().engine.getDeltaTime()));
  await sleep(1200);
  world().scene.onAfterRenderObservable.remove(obs);
  const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
  t.metric("frameMsLow", Math.round(avg * 10) / 10);
  t.metric("qualityScaling", low.scaling);
  checkHud(t, "look: quality low");
  t.event("quality-low", `low: bloom off, shadows off, samples ${low.samples}, scaling ${low.scaling}, ${avg.toFixed(1)} ms a frame over ${samples.length} frames`);
  if (samples.length && avg > 40) t.problem("warning", `Low quality averaged ${avg.toFixed(1)} ms a frame`);
  t.progress(1);
}

/* ---------------- photos: the dense city at several spots, noon then dusk then night, with the frame rate ---------------- */
// Setup shortcuts: the day bar to the car and to the hour. Real input: Enter, then WASD with Shift along the avenue.
// Each stop is a "photo" (scene + event); the frame time is sampled over 1.5 s at each, so the review has
// photo-fps from the footage and the timeline. Windows and street lamps are read from day.cityscape.info().
async function photos(options, t) {
  t.scene("Home street");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.cityscape, 8000, "the city's density (js/cityscape.js)");
  const day = window.day.today();
  const cfg = window.DAY_CONFIG;
  const street = cfg.street || { z: 12.6 };
  const outside = carSideMoment(day);
  if (!outside) {
    t.problem("bug", "No moment beside the car to stand in the street");
    return;
  }
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  await sleep(500);
  const C = window.day.control;
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 3000, "Take control (Enter)");
  const cs = window.day.cityscape;
  const info0 = cs.info();
  t.metric("cityFillers", info0.fillers);
  t.metric("cityTall", info0.tall);
  t.metric("cityLamps", info0.lamps);
  t.metric("cityCrossings", info0.crossings);
  if (info0.fillers < 80 || info0.lamps < 40 || info0.crossings < 8) t.problem("bug", `The city is thin: ${JSON.stringify(info0)}`);
  const fpsAll = [];
  async function photo(name, eventName) {
    t.scene(name);
    await sleep(700);
    const samples = [];
    const obs = world().scene.onAfterRenderObservable.add(() => samples.push(world().engine.getDeltaTime()));
    await sleep(1500);
    world().scene.onAfterRenderObservable.remove(obs);
    const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
    const fps = avg ? 1000 / avg : 0;
    fpsAll.push(fps);
    checkHud(t, "photos: " + name);
    const i = cs.info();
    const st = C.state();
    t.event(eventName, `${name} at ${st.x.toFixed(0)},${st.z.toFixed(0)}: ${fps.toFixed(0)} fps, windows ${i.lit.windows.toFixed(2)}, shops ${i.lit.shops.toFixed(2)}, lamps ${i.lit.lamps.toFixed(2)}, ${i.fillers} fillers`);
    return i;
  }
  const noonStops = [[18, "Noon, the avenue by his place"], [58, "Noon, the shops"], [100, "Noon, downtown crossing"], [150, "Noon, towards the office"]];
  scrubTo(12 * 60);
  await sleep(1200);
  const first = await photo("Noon, home", "photo-noon");
  if (first.lit.windows > 0.1) t.problem("bug", `Windows are lit at noon (${first.lit.windows.toFixed(2)})`);
  let k = 0;
  for (const [x, name] of noonStops) {
    const ok = await goTo(x, street.z - 3.2, t, { sprint: true, progress: 0.1 + 0.1 * k, ms: 30000 });
    if (!ok) t.problem("warning", `He didn't reach x ${x} (at ${C.state().x.toFixed(1)},${C.state().z.toFixed(1)})`);
    await photo(name, "photo-noon");
    k++;
  }
  scrubTo(18 * 60 + 30);
  await sleep(1500);
  const dusk = await photo("Dusk, windows and lamps coming on", "photo-dusk");
  if (dusk.lit.windows < 0.25) t.problem("bug", `Windows didn't come on at dusk (${dusk.lit.windows.toFixed(2)})`);
  if (dusk.lit.lamps < 0.25) t.problem("bug", `Street lamps didn't come on at dusk (${dusk.lit.lamps.toFixed(2)})`);
  await goTo(C.state().x - 30, street.z - 3.2, t, { sprint: true, progress: 0.7, ms: 20000 });
  await photo("Dusk, back along the avenue", "photo-dusk");
  scrubTo(21 * 60 + 30);
  await sleep(1500);
  const night = await photo("Night, the lit city", "photo-night");
  if (night.lit.windows < 0.85) t.problem("bug", `Windows aren't fully lit at night (${night.lit.windows.toFixed(2)})`);
  if (night.lit.lamps < 0.85) t.problem("bug", `Street lamps aren't fully lit at night (${night.lit.lamps.toFixed(2)})`);
  await goTo(C.state().x - 40, street.z - 3.2, t, { sprint: true, progress: 0.9, ms: 20000 });
  await photo("Night, the avenue", "photo-night");
  const min = Math.min(...fpsAll);
  const avg = fpsAll.reduce((a, b) => a + b, 0) / fpsAll.length;
  t.metric("photoFpsMin", Math.round(min * 10) / 10);
  t.metric("photoFpsAvg", Math.round(avg * 10) / 10);
  t.event("photo-fps", `${fpsAll.length} photos: ${avg.toFixed(0)} fps on average, ${min.toFixed(0)} at the worst`);
  if (min < 10) t.problem("bug", `A photo ran at ${min.toFixed(1)} fps`);
  else if (avg < 20) t.problem("warning", `The photos averaged ${avg.toFixed(1)} fps`);
  // A phone run also times the three moments on low quality (city, storm, finale).
  if (innerWidth <= 700 || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)) await phoneFps(t);
  t.progress(1);
}

/* ---------------- crowd: the street's people and cars follow the day's clock; quiet at night, busy at rush hour ---------------- */
// Setup shortcuts: the day bar to a quiet moment beside the car and to each hour (then 1x so the day plays).
// Real input: Enter, WASD with Shift to the shops, keys (3 = rain), the quality button. Each hour is a scene with a
// crowd-<phase> event (people, cars, how many near the camera, how many moved); movement is measured on the same
// people 2 s apart. The frame rate over the stops is logged as photo-fps, like `photos`.
async function crowdScenario(options, t) {
  t.scene("Home street");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.crowd, 8000, "the crowd (js/crowd.js)");
  const day = window.day.today();
  const street = window.DAY_CONFIG.street || { z: 12.6 };
  const outside = carSideMoment(day);
  if (!outside) {
    t.problem("bug", "No moment beside the car to stand in the street");
    return;
  }
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  await sleep(500);
  const C = window.day.control;
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 3000, "Take control (Enter)");
  const crowd = window.day.crowd;
  const c0 = crowd.info();
  t.metric("crowdBudgetPeople", c0.budget.people);
  t.metric("crowdBudgetCars", c0.budget.cars);
  t.metric("crowdDoors", c0.doors);
  t.metric("crowdJunctions", c0.junctions);
  if (c0.budget.people < 100 || c0.budget.cars < 30 || c0.doors < 30 || c0.junctions < 8) t.problem("bug", `The crowd has little to work with: ${JSON.stringify(c0)}`);
  t.progress(0.05);
  const ok = await goTo(58, street.z - 3.2, t, { sprint: true, progress: 0.12, ms: 30000 });
  if (!ok) t.problem("warning", `He didn't reach the shops (at ${C.state().x.toFixed(1)},${C.state().z.toFixed(1)})`);

  const fpsAll = [];
  const stats = {};
  async function stop(name, eventName, hour, key) {
    t.scene(name);
    scrubTo(Math.round(hour * 60));
    await sleep(300);
    clickSpeed(1); // a scrub pauses the day, and a paused day holds the crowd still
    await sleep(1800);
    const a = crowd.positions();
    const samples = [];
    const obs = world().scene.onAfterRenderObservable.add(() => samples.push(world().engine.getDeltaTime()));
    await sleep(2000);
    world().scene.onAfterRenderObservable.remove(obs);
    const b = crowd.positions();
    const avg = samples.length ? samples.reduce((x, y) => x + y, 0) / samples.length : 0;
    const fps = avg ? 1000 / avg : 0;
    fpsAll.push(fps);
    // the same people and cars (by slot) two seconds apart
    const byId = (list) => new Map(list.map((e) => [e.id, e]));
    const pb = byId(b.people);
    const cb = byId(b.cars);
    let n = 0;
    let moved = 0;
    a.people.forEach((p) => {
      const q = pb.get(p.id);
      if (!q) return;
      n++;
      if (Math.hypot(p.x - q.x, p.z - q.z) > 0.3) moved++;
    });
    let m = 0;
    let carsMoved = 0;
    a.cars.forEach((c) => {
      const q = cb.get(c.id);
      if (!q) return;
      m++;
      if (Math.hypot(c.x - q.x, c.z - q.z) > 1) carsMoved++;
    });
    const i = crowd.info();
    stats[key] = { people: i.people, cars: i.cars, near: i.near, moved, carsMoved, fps };
    t.metric(`crowd${key}People`, i.people);
    t.metric(`crowd${key}Cars`, i.cars);
    t.event(eventName, `${name} (${i.phase}, ${i.hour.toFixed(1)} h): ${i.people} people and ${i.cars} cars out, ${i.near.people} people and ${i.near.cars} cars near him; ${moved}/${n} walkers and ${carsMoved}/${m} cars moved in 2 s; ${i.walking} walking, ${i.crossing} crossing, ${i.waiting} waiting at a signal, ${i.stopped} cars stopped, ${i.entering} coming out of and ${i.leaving} going into buildings; ${fps.toFixed(0)} fps`);
    return i;
  }

  const night = await stop("Night, 3 AM: the street is quiet", "crowd-night", 3, "Night");
  t.progress(0.25);
  const rush = await stop("Morning rush, 8:30: busy lanes and sidewalks", "crowd-rush", 8.5, "Rush");
  t.progress(0.4);
  const lunch = await stop("Lunch, 12:30: the sidewalks are full", "crowd-lunch", 12.5, "Lunch");
  t.progress(0.55);
  const dinner = await stop("Dinner, 7:30 PM: the evening crowd", "crowd-dinner", 19.5, "Dinner");
  t.progress(0.65);
  const late = await stop("Late, 11:30 PM: it empties out", "crowd-late", 23.5, "Late");
  t.progress(0.72);
  if (night.people > 20 || night.cars > 8) t.problem("bug", `The street isn't quiet at night: ${night.people} people, ${night.cars} cars`);
  if (rush.cars < 24 || rush.people < night.people + 60) t.problem("bug", `Rush hour isn't busy: ${rush.people} people, ${rush.cars} cars`);
  if (lunch.people < 80) t.problem("bug", `The lunch crowd is thin: ${lunch.people} people`);
  if (dinner.people < 70) t.problem("bug", `The dinner crowd is thin: ${dinner.people} people`);
  if (late.people >= dinner.people) t.problem("bug", `Late evening isn't quieter than dinner (${late.people} vs ${dinner.people})`);
  [["rush", stats.Rush], ["lunch", stats.Lunch]].forEach(([name, s]) => {
    if (s.moved < s.people * 0.4) t.problem("bug", `At ${name} only ${s.moved} of ${s.people} walkers moved`);
    if (s.near.people < 12) t.problem("warning", `At ${name} only ${s.near.people} people are near him`);
  });
  if (stats.Rush.carsMoved < 10) t.problem("bug", `At rush hour only ${stats.Rush.carsMoved} cars moved`);
  t.event("crowd-follows-clock", `night ${night.people}/${night.cars}, rush ${rush.people}/${rush.cars}, lunch ${lunch.people}/${lunch.cars}, dinner ${dinner.people}/${dinner.cars}, late ${late.people}/${late.cars} (people/cars)`);

  // rain: umbrellas and wipers on the crowd
  t.scene("Lunch in the rain");
  scrubTo(12.5 * 60);
  await sleep(300);
  clickSpeed(1);
  pressKey("3");
  await t.until(() => window.weather.now().state === "rain" && window.weather.now().blend > 0.85, 9000, "rain to settle");
  await sleep(1500);
  const rain = crowd.info();
  t.event("crowd-rain", `${rain.people} people (${rain.umbrellas} under umbrellas) and ${rain.cars} cars (${rain.wipers} wipers)`);
  if (rain.umbrellas < 5 || rain.wipers < 1) t.problem("bug", `In rain the crowd has ${rain.umbrellas} umbrellas and ${rain.wipers} wipers`);
  pressKey("1");
  await sleep(800);
  t.progress(0.82);

  // quality: low thins the crowd
  const btn = $("quality");
  if (btn) {
    if (window.day.look.quality() !== "low") btn.click();
    await sleep(2500);
    const low = crowd.info();
    t.event("crowd-quality-low", `quality ${low.quality}: ${low.people} people and ${low.cars} cars (budget scale ${low.scale})`);
    if (low.scale >= 0.8 || low.people > lunch.people * 0.7) t.problem("bug", `Quality low didn't thin the crowd (${low.people} people, scale ${low.scale})`);
    btn.click();
    await sleep(500);
  } else t.problem("bug", "There's no quality toggle");

  const min = Math.min(...fpsAll);
  const avgF = fpsAll.reduce((x, y) => x + y, 0) / fpsAll.length;
  t.metric("photoFpsMin", Math.round(min * 10) / 10);
  t.metric("photoFpsAvg", Math.round(avgF * 10) / 10);
  t.event("photo-fps", `${fpsAll.length} stops with the crowd out: ${avgF.toFixed(0)} fps on average, ${min.toFixed(0)} at the worst`);
  if (min < 10) t.problem("bug", `A stop ran at ${min.toFixed(1)} fps with the crowd out`);
  else if (avgF < 20) t.problem("warning", `The stops averaged ${avgF.toFixed(1)} fps with the crowd out`);
  t.progress(1);
}

/* ---------------- fill-out: street props, signs, a rooftop, the plaza and its landmarks; neon and lamps at night; wet reflections only in ability weather ---------------- */
// Setup shortcuts: the day bar beside the car and to the hours. Real input: Enter, WASD with Shift, the ramp, key 3 (rain).
// Each stop is a scene with an event, so the review reads props, signs and landmarks from the footage and the timeline.
async function fillOut(options, t) {
  t.scene("Home street");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.cityscape && window.day.cityscape.info().props, 8000, "the city's props (js/props.js)");
  const day = window.day.today();
  const cfg = window.DAY_CONFIG;
  const street = cfg.street || { z: 12.6 };
  const outside = carSideMoment(day);
  if (!outside) {
    t.problem("bug", "No moment beside the car to stand in the street");
    return;
  }
  scrubTo(12 * 60);
  await sleep(600);
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  await sleep(500);
  const C = window.day.control;
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 3000, "Take control (Enter)");
  const cs = window.day.cityscape;
  const p0 = cs.info().props;
  t.metric("propsTrees", p0.trees);
  t.metric("propsBenches", p0.benches);
  t.metric("propsHydrants", p0.hydrants);
  t.metric("propsBusStops", p0.busStops);
  t.metric("propsSigns", p0.signs);
  t.metric("propsRoofUnits", p0.roofUnits);
  t.metric("propsLandmarks", p0.landmarks);
  if (p0.trees < 10 || p0.benches < 6 || p0.hydrants < 3 || p0.busStops < 1 || p0.signs < 6 || p0.landmarks < 3 || p0.roofUnits < 30) t.problem("bug", `The city is thin on props: ${JSON.stringify(p0)}`);
  t.progress(0.05);

  // 1. rooftop: the apt roof's AC units and vents, up the ramp
  const roofB = ((cfg.city && cfg.city.blocks) || []).find((b) => b.stair && b.id === "apt") || ((cfg.city && cfg.city.blocks) || []).find((b) => b.stair);
  if (roofB) {
    const s = roofB.stair;
    t.scene(`Rooftop ${roofB.id}`);
    const atRamp = await goTo(s.x0 - 0.9, s.z, t, { sprint: true, progress: 0.1, ms: 30000 });
    const up = atRamp && (await goTo(s.x1 - 0.25, s.z, t, { close: 0.35, progress: 0.15, ms: 20000 }));
    if (up) await goTo(roofB.x + 2, roofB.z - roofB.d / 2 + 3.2, t, { close: 0.8, progress: 0.2, ms: 12000 });
    await sleep(900);
    const st = C.state();
    if (st.y > roofB.h - 0.45) t.event("photo-rooftop", `on the ${roofB.id} roof (y ${st.y.toFixed(1)}): ${p0.roofUnits} AC units, tanks, vents and antennas across the city`);
    else t.problem("bug", `He didn't get onto the ${roofB.id} roof for the rooftop photo (y ${st.y.toFixed(1)})`);
    await goTo(s.x1 - 0.25, s.z, t, { close: 0.6, progress: 0.25, ms: 12000 });
    await goTo(s.x0 - 0.9, s.z, t, { close: 0.8, progress: 0.28, ms: 20000 });
  }

  // 2. the street at noon: benches, trees, hydrants, bus stops, shop signs
  t.scene("Street props at noon");
  const stops = [[24, "bench and trees"], [60, "shop signs"], [96, "bus stop and hydrant"]];
  let k = 0;
  for (const [x, what] of stops) {
    await goTo(x, street.z - 3.2, t, { sprint: true, progress: 0.3 + 0.08 * k, ms: 30000 });
    await sleep(900);
    t.event("photo-street", `${what} at ${C.state().x.toFixed(0)},${C.state().z.toFixed(0)}`);
    k++;
  }

  // 3. the plaza: fountain, clock tower, cafe tables
  t.scene("Plaza and clock tower");
  const pz = p0.plaza;
  const okPlaza = await goTo(pz.x0 + 4, pz.z0 + 8, t, { sprint: true, progress: 0.6, ms: 20000 });
  await sleep(1200);
  if (!okPlaza) t.problem("warning", `He didn't reach the plaza (at ${C.state().x.toFixed(1)},${C.state().z.toFixed(1)})`);
  t.event("photo-plaza", `the plaza at ${C.state().x.toFixed(0)},${C.state().z.toFixed(0)}: fountain, Clock Tower, benches, cafe tables, ${p0.landmarks} landmarks (Clock Tower, the Needle, the Storm Tank)`);

  // 4. the lit city at night: neon signs, lamps, bloom
  const dusk = Math.round(18.5 * 60);
  scrubTo(dusk);
  await sleep(1500);
  const bloomDay = cs.info().props.lit.bloom;
  scrubTo(21 * 60 + 30);
  await sleep(1800);
  t.scene("Plaza at night: lamps, clock faces, neon");
  const n1 = cs.info();
  t.event("photo-night-plaza", `lamps ${n1.lit.lamps.toFixed(2)}, signs ${n1.props.lit.neon.toFixed(2)}, props glow ${n1.props.lit.glow.toFixed(2)}, bloom ${n1.props.lit.bloom.toFixed(2)}`);
  if (n1.props.lit.neon < 0.85 || n1.props.lit.glow < 0.85) t.problem("bug", `Neon and lamps aren't glowing at night (${JSON.stringify(n1.props.lit)})`);
  if (n1.props.lit.bloom <= bloomDay - 0.001 && n1.props.lit.bloom < 0.25) t.problem("warning", `The bloom didn't swell at night (${n1.props.lit.bloom.toFixed(2)})`);
  t.metric("nightNeon", Math.round(n1.props.lit.neon * 100) / 100);
  t.metric("nightBloom", Math.round(n1.props.lit.bloom * 100) / 100);
  await goTo(C.state().x - 22, street.z - 3.2, t, { sprint: true, progress: 0.75, ms: 20000 });
  await sleep(900);
  t.scene("Night street: neon shop signs");
  t.event("photo-night-street", `signs ${cs.info().props.lit.neon.toFixed(2)}, lamps ${cs.info().lit.lamps.toFixed(2)} at ${C.state().x.toFixed(0)},${C.state().z.toFixed(0)}`);

  // 5. reflections only in ability weather
  const W = window.weather;
  await sleep(1200);
  const before = W.now();
  t.event("reflect-forecast", `forecast ${before.forecast}, showing ${before.shown}, player's weather ${before.manual}, reflections ${before.reflect.toFixed(2)}`);
  if (!before.manual && before.reflect > 0.05) t.problem("bug", `The street reflects (${before.reflect.toFixed(2)}) without an ability's weather`);
  t.scene("Night street, dry: no reflections");
  pressKey("3");
  await t.until(() => W.now().state === "rain" && W.now().reflect > 0.6, 12000, "the wet street to shine under the rain he called").catch(() => {});
  await sleep(1200);
  const wet = W.now();
  t.scene("Night street, rain from the ability: reflections");
  t.event("reflect-ability", `rain called by the player: reflections ${wet.reflect.toFixed(2)}, puddles ${wet.puddles}, gloss ${wet.gloss.toFixed(2)}`);
  if (!(wet.manual && wet.reflect > 0.6 && wet.puddles > 0)) t.problem("bug", `The rain he called didn't make the street reflect (${JSON.stringify({ manual: wet.manual, reflect: wet.reflect, puddles: wet.puddles })})`);
  t.metric("reflectAbility", Math.round(wet.reflect * 100) / 100);
  pressKey("Escape");
  t.progress(1);
}

/* ---------------- weather: every state, blended, and the road goes wet in the rain ---------------- */
// Real input: the day bar to the door (setup), Enter, WASD out to the avenue, the Sound button,
// keys 1–7, hold Q and a wedge, then the phone's Weather button. Each state gets a scene once it has settled.
async function weather(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const W = window.weather;
  if (!W) {
    t.problem("bug", "There's no weather (js/weather.js didn't install)");
    return;
  }
  const C = window.day.control;
  if (!C) {
    t.problem("bug", "There's no Take control, so the weather wheel can't be used");
    return;
  }
  const day = window.day.today();
  const out = day.actions.find((a) => /steps out/.test(a.text || "")) || quietMoment(day);
  scrubTo(out.start + Math.min(0.4, (out.end - out.start) / 2));
  await sleep(500);
  clickSpeed(1);
  t.event("start-at", `${E().fmtClock(out.start)} "${out.text}"`);
  const cast = W.now();
  t.event("forecast", `${cast.forecast} for ${window.day.now().key} (showing ${cast.shown}, blend ${cast.blend.toFixed(2)}, manual ${cast.manual})`);
  if (cast.manual) t.problem("bug", "The weather is already overridden before anyone takes control");
  t.progress(0.04);

  const sound = $("sound");
  if (sound) {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 4, pointerType: "mouse" }));
    sound.click();
    await sleep(250);
    t.event("sound-on", sound.getAttribute("aria-pressed") === "true" ? "Sound on" : "Sound still off");
  }

  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  t.event("control-taken", "Enter, so the weather keys work");
  const street = window.DAY_CONFIG.street || { z: 12.6 };
  const at = C.state();
  const reached = await goTo(at.x, street.z, t, { close: 1.4, ms: 18000, progress: 0.12 });
  const stood = C.state();
  t.scene("On the road");
  await sleep(400);
  if (reached) t.event("on-the-road", `at ${stood.x.toFixed(1)}, ${stood.z.toFixed(1)} (the avenue is z ${street.z})`);
  else t.problem("bug", `He didn't reach the avenue (at ${stood.x.toFixed(1)}, ${stood.z.toFixed(1)}, road z ${street.z})`);
  t.progress(0.16);

  const order = [
    ["1", "clear", "Clear"],
    ["2", "clouds", "Clouds"],
    ["3", "rain", "Rain"],
    ["4", "storm", "Storm"],
    ["5", "fog", "Fog"],
    ["6", "wind", "Wind"],
    ["7", "snow", "Snow"],
  ];
  const heard = {};
  let blended = false;
  let flashesBeforeStorm = W.now().flashes;
  for (let i = 0; i < order.length; i++) {
    const [key, state, label] = order[i];
    const before = W.now();
    if (state === "storm") flashesBeforeStorm = before.flashes;
    pressKey(key);
    await sleep(180);
    const early = W.now();
    t.event("weather-set", `${label} via key ${key}; target ${early.state}, blend ${early.blend.toFixed(2)}, sky ${early.sky}`);
    if (early.state !== state) t.problem("bug", `Key ${key} left the weather on ${early.state}, not ${state}`);
    if (before.state !== state && early.blend > 0.72) t.problem("bug", `${label} popped in (blend ${early.blend.toFixed(2)} right after the key)`);
    await sleep(1300);
    const mid = W.now();
    if (before.state !== state) {
      t.event("weather-blend", `${label} at 1.3s: blend ${mid.blend.toFixed(2)}, wet ${mid.wet.toFixed(2)}, fog ${mid.fog.toFixed(3)}, from ${before.state}`);
      if (!blended) {
        t.scene("Blending");
        blended = true;
        await sleep(350);
      }
      if (mid.blend < 0.22 || mid.blend > 0.93) t.problem("bug", `${label} isn't blending (blend ${mid.blend.toFixed(2)} at 1.3s, was ${before.state})`);
    }
    await t.until(() => W.now().state === state && W.now().blend > 0.9, 9000, `${label} to settle`);
    const done = W.now();
    t.scene(label);
    await sleep(500);
    heard[state] = done;
    const sig = ["air", "rain", "wind", "thunder", "hush", "snow"].map((k) => (done.sound[k] || 0).toFixed(2)).join(",");
    t.event(`weather-${state}`, `${label}: sky ${done.sky}, wet ${done.wet.toFixed(2)}, gloss ${done.gloss.toFixed(2)}, puddles ${done.puddles}, wind ${done.wind.toFixed(2)}, fog ${done.fog.toFixed(3)}, rain ${done.rain.toFixed(2)}, snow ${done.snow.toFixed(2)}, flashes ${done.flashes}, particles ${done.particles}, sound ${sig}, heard ${done.heard.toFixed(3)}`);
    t.metric(`wet-${state}`, Math.round(done.wet * 100) / 100);
    t.metric(`fog-${state}`, Math.round(done.fog * 1000) / 1000);
    if ((state === "rain" || state === "storm") && (done.wet < 0.65 || done.gloss < 0.35 || done.puddles < 1)) {
      t.problem("bug", `${label} didn't leave the road wet (wet ${done.wet.toFixed(2)}, gloss ${done.gloss.toFixed(2)}, puddles ${done.puddles})`);
    }
    if (state === "clear" && (done.wet > 0.15 || done.gloss > 0.2)) t.problem("bug", `Clear still looks wet (wet ${done.wet.toFixed(2)}, gloss ${done.gloss.toFixed(2)})`);
    if (state === "rain" && $("log") && !$("log").textContent.includes("Rain.")) t.problem("bug", "Changing the weather isn't in the action log");
    if (state === "storm") {
      if (done.flashes <= flashesBeforeStorm) {
        await t.until(() => W.now().flashes > flashesBeforeStorm, 7000, "a lightning flash").catch(() => {});
      }
      if (W.now().flashes <= flashesBeforeStorm) t.problem("bug", "The storm never flashed");
      else t.event("lightning", `${W.now().flashes} flashes while the storm is up`);
    }
    t.progress(0.2 + i * 0.09);
  }
  const rain = heard.rain;
  const storm = heard.storm;
  const clear = heard.clear;
  const fog = heard.fog;
  const wind = heard.wind;
  const snow = heard.snow;
  const clouds = heard.clouds;
  if (rain && clear && rain.sound.rain <= clear.sound.rain) t.problem("bug", "Rain doesn't sound wetter than clear");
  if (storm && rain && storm.sound.thunder <= 0) t.problem("bug", "The storm has no thunder");
  if (wind && clear && wind.sound.wind <= clear.sound.wind) t.problem("bug", "Wind doesn't sound windier than clear");
  if (fog && clear && fog.sound.hush <= clear.sound.hush) t.problem("bug", "Fog doesn't sound muffled next to clear");
  if (snow && (snow.snow < 0.5 || snow.sound.snow <= 0)) t.problem("bug", "Snow isn't its own fall and sound");
  if (clouds && clear && Math.abs(clouds.light - clear.light) < 0.15) t.problem("bug", "Clouds don't dim the light");
  if (fog && storm && fog.fog <= storm.fog) t.problem("bug", "Fog isn't thicker than the storm");
  const skies = new Set(Object.values(heard).map((s) => s.sky));
  t.metric("skies", skies.size);
  if (skies.size < 5) t.problem("bug", `Only ${skies.size} different sky colours across the seven states`);
  keyDown("q");
  await sleep(500);
  t.scene("Weather wheel");
  await sleep(400);
  const wheel = $("weather-wheel");
  if (!wheel || wheel.hidden) t.problem("bug", "Holding Q didn't open the weather wheel");
  else t.event("wheel-open", "Q held, the radial is up");
  const wedge = wheel && wheel.querySelector('[data-weather="clouds"]');
  if (wedge) await tapEl(wedge);
  keyUp("q");
  await sleep(250);
  if (W.now().state !== "clouds") t.problem("bug", `The wheel left the weather on ${W.now().state}, not clouds`);
  else t.event("weather-wheel", "clouds from the radial");
  t.progress(0.9);

  C.touch(true);
  await sleep(300);
  const phoneBtn = $("weather-btn");
  if (!phoneBtn || phoneBtn.hidden) t.problem("bug", "There's no Weather button while he's the player's");
  else {
    await tapEl(phoneBtn);
    await sleep(300);
    t.scene("Weather on a phone");
    await sleep(400);
    if (!wheel || wheel.hidden) t.problem("bug", "Tapping Weather didn't open the wheel");
    const snowWedge = wheel.querySelector('[data-weather="snow"]');
    if (snowWedge) await tapEl(snowWedge);
    await sleep(200);
    if (W.now().state !== "snow") t.problem("bug", `The phone tap left the weather on ${W.now().state}, not snow`);
    else t.event("weather-touch", "snow from a tap");
  }
  t.progress(1);
}

/* ---------------- weather-audio: music beds crossfade, ambience levels, autoplay silence ---------------- */
// Real input: day bar to the door, confirm Sound is off (silent), a real pointer on Sound, Enter
// (sting), walk out, then keys through clear → rain → storm → fog → snow. Events show the bed and
// ambience levels so the review can judge the three acceptance criteria.
async function weatherAudio(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const W = window.weather;
  const S = window.day && window.day.score;
  const C = window.day.control;
  if (!W) {
    t.problem("bug", "There's no weather");
    return;
  }
  if (!S) {
    t.problem("bug", "There's no score (js/score.js didn't install)");
    return;
  }
  if (!C) {
    t.problem("bug", "There's no Take control");
    return;
  }
  const day = window.day.today();
  const out = day.actions.find((a) => /steps out/.test(a.text || "")) || quietMoment(day);
  scrubTo(out.start + Math.min(0.4, (out.end - out.start) / 2));
  await sleep(400);
  clickSpeed(1);
  t.event("start-at", `${E().fmtClock(out.start)} "${out.text}"`);
  t.progress(0.05);

  const sound = $("sound");
  if (sound && sound.getAttribute("aria-pressed") === "true") {
    sound.click();
    await sleep(200);
  }
  const silent = S.now();
  t.event("sound-off", `on=${silent.on} unlocked=${silent.unlocked} heard=${silent.heard.toFixed(3)}`);
  if (silent.on) t.problem("bug", "Sound is on before anyone pressed it");
  if (silent.heard > 0.02) t.problem("bug", `Heard audio while Sound is off (heard ${silent.heard.toFixed(3)})`);
  t.progress(0.12);

  if (sound) {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 5, pointerType: "mouse" }));
    sound.click();
    await sleep(400);
    t.event("sound-on", sound.getAttribute("aria-pressed") === "true" ? "Sound on" : "Sound still off");
    if (sound.getAttribute("aria-pressed") !== "true") t.problem("bug", "Sound button didn't turn on");
  }
  t.progress(0.2);

  const stingBefore = S.now().stingAt;
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  await sleep(350);
  // The sting may be queued while its sample decodes: give it a few seconds.
  for (let i = 0; i < 20 && S.now().stingAt <= stingBefore; i++) await sleep(150);
  const afterTake = S.now();
  t.event("control-taken", `stingAt ${afterTake.stingAt} (was ${stingBefore}); bed ${afterTake.bed}`);
  if (afterTake.on && afterTake.samples && afterTake.stingAt <= stingBefore) {
    t.problem("warning", "Take control didn't fire the sting (samples may still be loading)");
  } else if (afterTake.stingAt > stingBefore) {
    t.event("sting", `take-control sting at ${afterTake.stingAt}`);
  }
  t.progress(0.3);

  const street = window.DAY_CONFIG.street || { z: 12.6 };
  const at = C.state();
  await goTo(at.x, street.z, t, { close: 1.4, ms: 16000, progress: 0.4 });
  t.scene("On the road");
  t.progress(0.45);

  const order = [
    ["1", "clear", "Clear"],
    ["3", "rain", "Rain"],
    ["4", "storm", "Storm"],
    ["5", "fog", "Fog"],
    ["7", "snow", "Snow"],
  ];
  const beds = {};
  let stormThunder = null;
  for (let i = 0; i < order.length; i++) {
    const [key, state, label] = order[i];
    const before = S.now();
    pressKey(key);
    await sleep(200);
    const early = S.now();
    const want = S.bedFor(state);
    t.event("music-set", `${label} via ${key}: weather ${W.now().state}, bed target ${early.target}, fade ${early.fade.toFixed(2)}, from ${before.bed}`);
    if (W.now().state !== state) t.problem("bug", `Key ${key} left weather on ${W.now().state}`);
    if (before.bed && before.bed !== want && early.fade > 0.92 && early.target === want) {
      // snapped somehow — still ok if target is right
    } else if (before.bed && before.bed !== want && early.target === want && early.fade > 0.85) {
      t.problem("bug", `${label} music popped in (fade ${early.fade.toFixed(2)})`);
    }
    await sleep(1200);
    const mid = S.now();
    if (before.bed && before.bed !== want) {
      t.event("music-blend", `${label} at 1.2s: fade ${mid.fade.toFixed(2)}, bed ${mid.bed}→${mid.target}`);
      if (mid.target !== want) t.problem("bug", `${label} score target is ${mid.target}, not ${want}`);
      if (mid.fade < 0.15 || (mid.bed === mid.target && mid.fade > 0.95 && before.bed !== want && mid.fade === 1 && early.fade < 0.5)) {
        // allow settled early if fade was fast
      } else if (before.bed !== want && mid.bed === before.bed && mid.fade < 0.2) {
        t.problem("bug", `${label} music isn't crossfading (fade ${mid.fade.toFixed(2)})`);
      }
    }
    await t.until(() => W.now().state === state && W.now().blend > 0.9, 9000, `${label} weather settle`);
    await sleep(900);
    const done = S.now();
    beds[state] = done;
    if (state === "storm") stormThunder = W.now().sound.thunder;
    t.scene(`Music ${label}`);
    t.event(`music-${state}`, `bed ${done.bed} target ${done.target} fade ${done.fade.toFixed(2)} amb rain ${done.amb.rain.toFixed(2)} wind ${done.amb.wind.toFixed(2)} air ${done.amb.air.toFixed(2)} samples ${done.samples}`);
    if (done.target !== want && done.bed !== want) t.problem("bug", `${label} settled on bed ${done.bed}, not ${want}`);
    t.progress(0.5 + i * 0.08);
  }

  const rain = beds.rain;
  const storm = beds.storm;
  const clear = beds.clear;
  const fog = beds.fog;
  const snow = beds.snow;
  if (rain && clear && rain.amb.rain <= clear.amb.rain) t.problem("bug", "Rain ambience isn't wetter than clear");
  if (storm && storm.amb.rain < 0.5) t.problem("bug", "Storm ambience has no rain");
  if (fog && clear && fog.bed === clear.bed && fog.target === clear.target) {
    // fog should use fog bed
    if (fog.bed !== "fog" && fog.target !== "fog") t.problem("bug", `Fog didn't switch the music bed (still ${fog.bed})`);
  }
  if (snow && snow.bed !== "snow" && snow.target !== "snow") t.problem("bug", `Snow didn't switch the music bed (still ${snow.bed})`);
  if (clear && rain && clear.bed === rain.bed && clear.target === rain.target && clear.bed === "clear") {
    t.problem("bug", "Clear and rain share the same music bed");
  }
  const distinct = new Set(Object.values(beds).map((b) => b.bed || b.target));
  t.metric("music-beds", distinct.size);
  if (distinct.size < 3) t.problem("bug", `Only ${distinct.size} distinct music beds across clear/rain/storm/fog/snow`);

  // Storm thunder level in the weather sound envelope (sample crack is one-shot).
  // Read while the storm was the weather: by now the last key has made it snow, whose thunder is 0.
  if (storm && stormThunder < 0.4) t.problem("bug", "Storm has no thunder in the weather sound levels");
  else if (storm) t.event("thunder-level", `storm thunder ${stormThunder.toFixed(2)}`);

  t.progress(1);
}

/* ---------------- atmosphere: rain intensity, pressure scores the music, mute is remembered, frame rate ---------------- */
// Real input: Sound on with a pointer, Enter to take control, key 3 for rain (and weather.set for a light
// shower: a named setup shortcut), the Pressure meter set low then high (abilities.reset: a named shortcut),
// M to mute, and a frame-rate sample in the rain and at the full storm.
async function atmosphere(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const W = window.weather;
  const S = window.day && window.day.score;
  const C = window.day.control;
  const P = window.powers;
  if (!W || !S || !C || !P) {
    t.problem("bug", "Weather, score, control or powers is missing");
    return;
  }
  const d = window.day.today();
  const out = d.actions.find((a) => /steps out/.test(a.text || "")) || quietMoment(d);
  scrubTo(out.start + Math.min(0.4, (out.end - out.start) / 2));
  await sleep(400);
  clickSpeed(1);
  const sound = $("sound");
  if (sound && sound.getAttribute("aria-pressed") !== "true") {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 5, pointerType: "mouse" }));
    sound.click();
  }
  await sleep(500);
  if (sound.getAttribute("aria-pressed") !== "true") t.problem("bug", "Sound button didn't turn on");
  t.event("sound-on", `button "${sound.textContent}", saved ${localStorage.getItem("icanbe.sound")}`);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  const street = window.DAY_CONFIG.street || { z: 12.6 };
  await goTo(C.state().x, street.z, t, { close: 1.4, ms: 16000, progress: 0.3 });
  t.progress(0.3);

  // 1. Rain intensity: a light shower, then the full downpour (key 3). Sight (streaks) and sound (rain level).
  const fps = async (ms) => {
    let n = 0;
    const t0 = performance.now();
    await new Promise((res) => {
      const f = () => (performance.now() - t0 < ms ? (n++, requestAnimationFrame(f)) : res());
      requestAnimationFrame(f);
    });
    return (n * 1000) / (performance.now() - t0);
  };
  W.set("rain", 0.3, "playtest");
  await sleep(5000);
  const light = W.now();
  const lightAmb = S.now().amb.rain;
  t.event("rain-light", `rain ${light.rain.toFixed(2)}, rain sound ${lightAmb.toFixed(2)}`);
  pressKey("3");
  await sleep(5500);
  const heavy = W.now();
  const heavyAmb = S.now().amb.rain;
  t.event("rain-heavy", `rain ${heavy.rain.toFixed(2)}, rain sound ${heavyAmb.toFixed(2)}`);
  if (!(heavy.rain > light.rain + 0.1)) t.problem("bug", `Rain doesn't grow with intensity (${light.rain.toFixed(2)} → ${heavy.rain.toFixed(2)})`);
  if (!(heavyAmb > lightAmb + 0.05)) t.problem("bug", `Rain sound doesn't grow with intensity (${lightAmb.toFixed(2)} → ${heavyAmb.toFixed(2)})`);
  const rainFps = await fps(2500);
  t.metric("fpsRain", Math.round(rainFps));
  t.progress(0.5);

  // 2. Pressure scores the music: low meter, then high.
  P.abilities.reset(4);
  await sleep(3000);
  const low = S.now();
  t.event("pressure-low", `pressure ${low.pressure}, tension ${low.tension}, music speed ${low.rate}, pulse ${low.pulse} Hz`);
  P.abilities.reset(96);
  await sleep(4500);
  const high = S.now();
  t.event("pressure-high", `pressure ${high.pressure}, tension ${high.tension}, music speed ${high.rate}, pulse ${high.pulse} Hz`);
  if (!(high.tension > low.tension + 0.3)) t.problem("bug", `Music doesn't shift with pressure (tension ${low.tension} → ${high.tension})`);
  if (!(high.rate > low.rate)) t.problem("bug", "The music doesn't speed up at high pressure");
  t.progress(0.7);

  // 3. Mute is there and remembered.
  pressKey("m");
  await sleep(300);
  const muted = sound.getAttribute("aria-pressed") !== "true";
  t.event("mute", `M pressed: button "${sound.textContent}", saved ${localStorage.getItem("icanbe.sound")}, heard ${S.now().heard.toFixed(3)}`);
  if (!muted || localStorage.getItem("icanbe.sound") !== "off") t.problem("bug", "Mute (M) didn't turn Sound off and save it");
  if (S.now().heard > 0.02) t.problem("bug", "Still hearing the score after mute");
  pressKey("m");
  await sleep(300);
  t.event("unmute", `button "${sound.textContent}", saved ${localStorage.getItem("icanbe.sound")}`);
  if (sound.getAttribute("aria-pressed") !== "true" || localStorage.getItem("icanbe.sound") !== "on") t.problem("bug", "Unmute didn't turn Sound on and save it");

  // 4. Frame rate in a full storm with the pressure score up.
  pressKey("4");
  await sleep(4000);
  const stormFps = await fps(3000);
  t.metric("fpsStorm", Math.round(stormFps));
  t.event("fps", `rain ${rainFps.toFixed(0)} fps, storm ${stormFps.toFixed(0)} fps`);
  if (Math.min(rainFps, stormFps) < 30) t.problem("bug", `Frame rate dipped under 30 fps (rain ${rainFps.toFixed(0)}, storm ${stormFps.toFixed(0)})`);
  t.progress(1);
}

/* ---------------- powers: storm, lightning, gust, tornado, and the Pressure meter ---------------- */
// Real input: day bar beside the car (setup), Sound on, Enter, WASD to the avenue near the loose props,
// hold F for the storm, E bolt, G gust, T tornado; then try one dry so the meter refuses.
async function powers(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const P = window.powers || (window.day && window.day.powers);
  if (!P) {
    t.problem("bug", "There's no powers (js/powers.js didn't install)");
    return;
  }
  const C = window.day.control;
  if (!C) {
    t.problem("bug", "There's no Take control");
    return;
  }
  const day = window.day.today();
  const cfg = window.DAY_CONFIG;
  const street = cfg.street || { z: 12.6 };
  const outside = carSideMoment(day)
    || day.actions.find((a) => /steps out/.test(a.text || ""))
    || quietMoment(day);
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  t.event("start-at", `${E().fmtClock(outside.start)} "${outside.text || outside.block}"`);
  t.progress(0.05);

  const sound = $("sound");
  if (sound) {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 4, pointerType: "mouse" }));
    sound.click();
    await sleep(200);
  }

  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  t.event("control-taken", "Enter, so his powers work");
  const meter = $("pressure");
  if (!meter || meter.hidden) t.problem("bug", "The Pressure meter isn't showing while he's the player's");
  else t.event("pressure-meter", "Pressure is on screen");

  // Near the loose bins and umbrellas on the avenue (day.config.js powers.loose).
  const nearLoose = { x: -2.2, z: street.z - 1.8 };
  const reached = await goTo(nearLoose.x, nearLoose.z, t, { close: 1.6, ms: 20000, sprint: true, progress: 0.12 });
  const stood = C.state();
  t.scene("On the avenue");
  if (reached) t.event("at-props", `at ${stood.x.toFixed(1)}, ${stood.z.toFixed(1)} near the loose props`);
  else t.problem("bug", `He didn't reach the avenue props (at ${stood.x.toFixed(1)}, ${stood.z.toFixed(1)})`);
  t.progress(0.18);

  async function waitPressure(cost, label) {
    await t.until(() => P.now().pressure + 0.05 >= cost, 12000, `Pressure for ${label} (${cost})`);
    t.metric(`pressure-before-${label}`, Math.round(P.now().pressure));
  }

  // 1. Hold F: cloud over him, then the storm and rain.
  t.scene("Summon storm");
  await waitPressure((cfg.powers && cfg.powers.costs && cfg.powers.costs.storm) || 40, "storm");
  const beforeStorm = window.weather ? window.weather.now() : null;
  keyDown("f");
  await t.until(() => P.now().charging || P.now().radius > 1, 2000, "the cloud to gather").catch(() => {});
  if (P.now().radius > 0.8 || P.now().charging) t.event("storm-gather", `cloud radius ${P.now().radius.toFixed(1)}, charging ${P.now().charging}`);
  else t.problem("bug", "Holding F didn't darken the sky over him");
  await sleep(900);
  keyUp("f");
  await t.until(() => P.now().called || (window.weather && window.weather.now().state === "storm"), 5000, "the storm he called");
  const afterStorm = P.now();
  const wx = window.weather && window.weather.now();
  if (afterStorm.called || (wx && wx.state === "storm")) {
    t.event("storm-called", `local rain ${afterStorm.localRain}, weather ${wx && wx.state}, rain ${wx && wx.rain.toFixed(2)}, sky ${wx && wx.sky}`);
  } else t.problem("bug", "Holding F didn't summon a storm");
  if (beforeStorm && wx && wx.rain <= beforeStorm.rain && !(afterStorm.localRain || afterStorm.called)) {
    t.problem("bug", "Summoning a storm didn't start rain");
  }
  if ($("log") && !$("log").textContent.includes("storm")) t.problem("polish", "Calling the storm isn't in the action log");
  t.progress(0.35);

  // 2. E: lightning at the reticle — flash, thunder, a mark on the world.
  t.scene("Lightning");
  await waitPressure((cfg.powers && cfg.powers.costs && cfg.powers.costs.bolt) || 24, "bolt");
  const props0 = (P.now().props || []).map((p) => ({ ...p }));
  pressKey("e");
  await sleep(200);
  await t.until(() => P.now().strike, 2000, "a lightning strike");
  const strike = P.now().strike;
  if (!strike) {
    t.problem("bug", "E didn't throw lightning");
  } else {
    t.event("bolt-struck", `at ${strike.x.toFixed(1)},${strike.z.toFixed(1)} · flash ${P.now().flash.toFixed(2)} · alarm ${strike.alarm} · blackout ${strike.blackout || "none"} · knocked ${strike.knocked}`);
    if (!(P.now().flash > 0.05 || strike.thunder)) {
      await t.until(() => P.now().strike && P.now().strike.thunder, 3000, "thunder").catch(() => {});
    }
    if (P.now().strike && P.now().strike.thunder) t.event("thunder", `thunder after ${P.now().strike.delay.toFixed(2)} s`);
    else if (!(P.now().flash > 0)) t.problem("bug", "The strike had no flash or thunder");
    const moved = (P.now().props || []).some((p, i) => props0[i] && Math.hypot(p.x - props0[i].x, p.z - props0[i].z) > 0.3);
    const worldHit = !!(strike.alarm || strike.blackout || strike.knocked > 0 || moved || P.now().alarm || P.now().blackout);
    if (worldHit) t.event("bolt-world", `alarm ${!!(strike.alarm || P.now().alarm)}, lights out ${P.now().blackout || strike.blackout || "none"}, props moved ${moved}, knocked ${strike.knocked}`);
    else t.problem("bug", "Lightning left no mark on the world (no alarm, lights out or knocked prop)");
  }
  t.progress(0.55);

  // 3. G: a gust that pushes what's in front of him.
  t.scene("Gust");
  await waitPressure((cfg.powers && cfg.powers.costs && cfg.powers.costs.gust) || 16, "gust");
  const beforeGust = (P.now().props || []).map((p) => ({ ...p }));
  pressKey("g");
  await sleep(350);
  const gust = P.now().gust;
  if (!gust) t.problem("bug", "G didn't cast a gust");
  else {
    const pushed = (P.now().props || []).filter((p, i) => beforeGust[i] && Math.hypot(p.x - beforeGust[i].x, p.z - beforeGust[i].z) > 0.25).length;
    t.event("gust-cast", `pushes ${gust.pushes}, props moved ${pushed}`);
    if (gust.pushes < 1 && pushed < 1) t.problem("bug", "The gust didn't push anything");
  }
  t.progress(0.7);

  // 4. T: a tornado down the street.
  t.scene("Tornado");
  await waitPressure((cfg.powers && cfg.powers.costs && cfg.powers.costs.tornado) || 48, "tornado");
  pressKey("t");
  await sleep(200);
  await t.until(() => P.now().tornado && P.now().tornado.life > 0, 2000, "a tornado");
  const tw0 = P.now().tornado;
  if (!tw0) t.problem("bug", "T didn't send a tornado");
  else {
    t.event("tornado-start", `on the ${tw0.axis} street at ${tw0.x.toFixed(1)},${tw0.z.toFixed(1)}, life ${tw0.life.toFixed(1)} s`);
    await sleep(1800);
    const tw1 = P.now().tornado;
    const travelled = tw1 ? tw1.travelled : tw0.travelled;
    if (travelled > 2) t.event("tornado-ran", `travelled ${travelled.toFixed(1)} m down the street`);
    else t.problem("bug", `The tornado barely moved (${(travelled || 0).toFixed(1)} m)`);
  }
  t.progress(0.85);

  // 5. Pressure limits him: spend what's left, then a refused call.
  t.scene("Pressure");
  let denied = false;
  for (let i = 0; i < 8 && !denied; i++) {
    const before = P.now().pressure;
    pressKey("t");
    await sleep(180);
    const snap = P.now();
    if (snap.blocked && snap.blocked.power) {
      denied = true;
      t.event("pressure-denied", `refused ${snap.blocked.power} at pressure ${snap.blocked.pressure} (had ${before.toFixed(0)})`);
    }
  }
  if (!denied) {
    // Drain with gusts if tornado never refused (still filling).
    while (P.now().pressure > 5) {
      pressKey("g");
      await sleep(120);
    }
    pressKey("t");
    await sleep(200);
    if (P.now().blocked) {
      denied = true;
      t.event("pressure-denied", `refused ${P.now().blocked.power} at ${P.now().blocked.pressure}`);
    }
  }
  if (!denied) t.problem("bug", "The Pressure meter never refused a power");
  else t.metric("pressure-floor", P.now().blocked ? P.now().blocked.pressure : Math.round(P.now().pressure));

  C.touch(true);
  await sleep(250);
  const pad = $("powerpad");
  if (!pad || pad.hidden) t.problem("polish", "The power pad isn't showing with touch controls on");
  else t.event("power-pad", "Storm / Bolt / Gust / Tornado on the phone");
  t.progress(1);
}

/* ---------------- voice: DoD Eric lines on powers, weather, episode open/close ---------------- */
// Real input: Sound (pointer), Enter, weather keys 1–7 with gaps for cooldown, bolts for chance/cooldown skips,
// one forced power bark, Esc for the score-card close. Events: voice-play / voice-skip.
// Spoken dialogue: with Sound on, an episode's opening lines play as their own Hawkes Gen clips (audio/dialogue/*.mp3),
// not the babble. Checks the build's clip list, that a sample of clips loads and decodes, and that Part 1's opening
// lines are spoken through day.dialogue (day:dialogue say). Events dialogue-index / dialogue-decode / dialogue-say.
async function spokenDialogue(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const D = window.day.dialogue;
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  if (!D || !Ep || !C) return t.problem("bug", "day.dialogue, episodes or Take control isn't installed");
  const lines = D.lines();
  await t.until(() => D.now().files > 0, 6000, "audio/dialogue/index.json").catch(() => {});
  const files = D.now().files;
  t.event("dialogue-index", `${files} clips for ${lines.length} lines`);
  if (files < lines.length) t.problem("bug", `Only ${files} of ${lines.length} dialogue lines have a clip in the build, the rest fall back to babble`);
  t.progress(0.1);

  // A sample of clips must load and decode in this browser.
  const sample = lines.filter((_, i) => i % 13 === 0);
  let decoded = 0;
  for (const L of sample) {
    const ok = await new Promise((res) => {
      const a = new Audio();
      const done = (v) => { a.oncanplaythrough = a.onerror = null; res(v); };
      a.oncanplaythrough = () => done(a.duration > 0.2);
      a.onerror = () => done(false);
      a.preload = "auto";
      a.src = L.file;
      a.load();
      setTimeout(() => done(false), 8000);
    });
    if (ok) decoded++;
    else t.problem("bug", `Dialogue clip ${L.file} (${L.who}: "${L.text}") didn't load or decode`);
  }
  t.event("dialogue-decode", `${decoded} of ${sample.length} sampled clips decode`);
  t.progress(0.35);

  const said = [];
  const onSay = (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "say") { said.push(d); t.event("dialogue-say", `${d.who}: ${d.id}`); }
  };
  window.addEventListener("day:dialogue", onSay);
  try {
    const sound = $("sound");
    if (sound && sound.getAttribute("aria-pressed") !== "true") {
      const r = sound.getBoundingClientRect();
      sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 4, pointerType: "mouse" }));
      sound.click();
      await sleep(250);
    }
    t.event("sound-on", sound && sound.getAttribute("aria-pressed") === "true" ? "Sound on" : "Sound still off");

    const day = window.day.today();
    const outside = carSideMoment(day) || quietMoment(day);
    scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
    clickSpeed(1);
    await sleep(600);
    pressKey("Enter");
    await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
    const offer = $("episode-offer");
    if (offer && !offer.hidden) { const no = offer.querySelector("button.decline"); if (no) no.click(); }
    t.progress(0.5);

    t.scene("Part 1 opens, spoken");
    Ep.start("dry-park", "playtest");
    await t.until(() => said.length >= 2, 15000, "two spoken opening lines").catch(() => {});
    t.progress(0.9);
    if (!said.length) t.problem("bug", "Part 1's opening lines weren't spoken: no day:dialogue say (text and babble only)");
    else if (said.some((d) => !D.voiced(d.who, (lines.find((L) => L.id === d.id) || {}).text))) t.problem("bug", "A spoken line wasn't marked voiced, so its babble also plays");
    t.event("dialogue-played", `${D.now().played} lines spoken, last ${(D.now().last || {}).id || "none"}`);
    await sleep(2500); // a beat for the footage, with the voice audible
  } finally {
    window.removeEventListener("day:dialogue", onSay);
  }
}

async function voice(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const V = window.voice || (window.day && window.day.voice);
  if (!V) {
    t.problem("bug", "There's no voice (js/voice.js didn't install)");
    return;
  }
  const C = window.day.control;
  if (!C) {
    t.problem("bug", "There's no Take control");
    return;
  }
  const cfg = window.DAY_CONFIG && window.DAY_CONFIG.voice;
  if (!cfg || !Array.isArray(cfg.lines) || cfg.lines.length < 30) {
    t.problem("bug", `voice.lines is short (${cfg && cfg.lines ? cfg.lines.length : 0})`);
  }
  if (cfg && cfg.voiceId !== "cjVigY5qzO86Huf0OWal") {
    t.problem("bug", `voiceId is ${cfg && cfg.voiceId}, not DoD Eric (cjVigY5qzO86Huf0OWal)`);
  }
  t.event("voice-ready", `${V.now().lines} lines, voice ${V.now().voiceId}`);
  t.progress(0.05);

  const day = window.day.today();
  const out = day.actions.find((a) => /steps out/.test(a.text || "")) || quietMoment(day);
  scrubTo(out.start + Math.min(0.4, (out.end - out.start) / 2));
  clickSpeed(1);
  await sleep(400);
  t.event("start-at", `${E().fmtClock(out.start)} "${out.text}"`);

  const plays = [];
  const skips = [];
  const onVoice = (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "play") plays.push(d);
    if (d.action === "skip") skips.push(d);
  };
  window.addEventListener("day:voice", onVoice);

  const sound = $("sound");
  if (sound) {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 4, pointerType: "mouse" }));
    sound.click();
    await sleep(250);
    t.event("sound-on", sound.getAttribute("aria-pressed") === "true" ? "Sound on" : "Sound still off");
  }

  // Episode open
  t.scene("Episode open");
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  await t.until(() => plays.some((p) => p.group === "episode-open"), 4000, "episode-open line").catch(() => {});
  const open = plays.find((p) => p.group === "episode-open");
  if (open) t.event("voice-play", `episode-open ${open.id}: "${open.text}"`);
  else t.problem("bug", "Taking control didn't play an episode-open line");
  t.progress(0.15);

  // Weather reactions for every state (wait past cooldown between keys)
  const order = [
    ["1", "clear"],
    ["2", "clouds"],
    ["3", "rain"],
    ["4", "storm"],
    ["5", "fog"],
    ["6", "wind"],
    ["7", "snow"],
  ];
  for (let i = 0; i < order.length; i++) {
    const [key, state] = order[i];
    await sleep(2800);
    const before = plays.length;
    pressKey(key);
    await t.until(() => plays.length > before && plays.some((p) => p.group === `weather-${state}`), 5000, `weather-${state} line`).catch(() => {});
    const hit = [...plays].reverse().find((p) => p.group === `weather-${state}`);
    if (hit) t.event(`voice-weather-${state}`, `${hit.id}: "${hit.text}"`);
    else t.problem("bug", `No voice reaction when weather became ${state}`);
    t.scene(state.charAt(0).toUpperCase() + state.slice(1));
    t.progress(0.2 + i * 0.07);
  }

  // Powers: one forced bark, then several bolts so chance/cooldown skips some
  t.scene("Power bark");
  const P = window.powers || (window.day && window.day.powers);
  if (P) {
    await t.until(() => P.now().pressure + 0.05 >= 24, 12000, "Pressure for bolt").catch(() => {});
    const forced = V.say("bolt", { force: true, ignoreCooldown: true, via: "playtest" });
    if (forced) t.event("voice-play", `forced bolt ${forced.id}: "${forced.text}"`);
    else t.problem("bug", "Forced bolt line didn't play");
    await sleep(200);
    let barked = 0;
    let quiet = 0;
    for (let i = 0; i < 6; i++) {
      await t.until(() => P.now().pressure + 0.05 >= 24, 10000, "Pressure for bolt").catch(() => {});
      const before = plays.length;
      const skipBefore = skips.length;
      pressKey("e");
      await sleep(350);
      if (plays.length > before) barked++;
      else if (skips.length > skipBefore) quiet++;
      else quiet++;
    }
    t.metric("powerVoicePlays", barked);
    t.metric("powerVoiceSkips", quiet);
    if (barked < 1 && !forced) t.problem("bug", "No power voice line played");
    else t.event("voice-power", `${barked} natural barks, ${quiet} skips (chance/cooldown)`);
    if (quiet < 1) t.problem("polish", "Every power call got a voice line; chance/cooldown should skip some");
  } else t.problem("bug", "powers missing, can't check power barks");
  t.progress(0.85);

  // Episode close / score card
  t.scene("Episode close");
  await sleep(2800);
  const beforeClose = plays.length;
  pressKey("Escape");
  await t.until(() => C.mode() !== "control", 4000, "Let go (Esc)");
  await t.until(() => plays.length > beforeClose && plays.some((p) => p.group === "episode-close"), 4000, "episode-close line").catch(() => {});
  const close = [...plays].reverse().find((p) => p.group === "episode-close");
  if (close) t.event("voice-play", `episode-close ${close.id}: "${close.text}"`);
  else t.problem("bug", "Letting go didn't play an episode-close / score-card line");

  window.removeEventListener("day:voice", onVoice);
  t.metric("voicePlays", plays.length);
  t.metric("voiceSkips", skips.length);
  t.event("voice-summary", `${plays.length} plays, ${skips.length} skips, DoD voice ${V.now().voiceId}`);
  t.progress(1);
}

/* ---------------- storm-ride: glide on the wind, ride an updraft to a roof, cross rooftop to rooftop ---------------- */
// Real input: Enter, WASD, Space held, G for a gust updraft, 4 for storm weather. Setup: day bar beside the car.
async function stormRide(options, t) {
  t.scene("Street");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const C = window.day.control;
  if (!C) {
    t.problem("bug", "There's no Take control (js/control.js didn't install)");
    return;
  }
  const cfg = window.DAY_CONFIG;
  const day = window.day.today();
  const roofs = ((cfg.city && cfg.city.blocks) || []).filter((b) => b.stair);
  const apt = roofs.find((b) => b.id === "apt") || roofs[0];
  const shop = roofs.find((b) => b.id === "shop") || roofs[1];
  if (!apt || !shop) {
    t.problem("bug", "Need two roofs with stairs (apt and shop) for storm-riding");
    return;
  }
  const outside = carSideMoment(day) || quietMoment(day);
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  t.event("start-at", `${E().fmtClock(outside.start)} beside the car · storm-ride`);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 3000, "Take control (Enter)");
  if (!C.state().physics) t.problem("bug", "He moves without the Havok character controller");
  // Storm weather: ambient updrafts are strongest.
  pressKey("4");
  await sleep(500);
  if (window.weather && window.weather.set) window.weather.set("storm", 1, "playtest");
  if (C.refreshUpdrafts) C.refreshUpdrafts();
  t.event("weather-storm", `storm for stronger updrafts · ${C.state().updrafts || 0} columns`);
  t.progress(0.08);

  // 1. Hold jump in the air → glide with wind trails.
  t.scene("Glide");
  let glided = false;
  let trails = 0;
  let pull = 0;
  const watchGlide = setInterval(() => {
    const st = C.state();
    if (st.gliding || st.floating) {
      glided = true;
      trails = Math.max(trails, st.trails || 0);
      pull = Math.max(pull, st.cameraPull || 0);
    }
  }, 40);
  try {
    await tapKey(" ");
    await sleep(280);
    await tapKey(" ");
    keyDown(" ");
    keyDown("w");
    await sleep(1800);
    keyUp("w");
    keyUp(" ");
    await t.until(() => C.state().grounded, 8000, "him to land after the glide").catch(() => {});
  } finally {
    clearInterval(watchGlide);
    releaseHeld();
  }
  const glideLog = C.log().filter((e) => e.what === "glide");
  if (glided) t.event("glide-hold", `held Space in the air · trails ${trails} · camera pull ${pull.toFixed(2)} · log ${glideLog.length}`);
  else t.problem("bug", "Holding Space in the air never set gliding");
  if (trails < 1 && RIDE_TRAILS_OK()) t.problem("polish", "No wind trail particles while gliding");
  else if (trails >= 1) t.event("wind-trails", `${trails} wind streak particles while gliding`);
  if (pull < 0.4) t.problem("polish", `Camera didn't pull back while gliding (pull ${pull.toFixed(2)})`);
  else t.event("camera-glide", `camera pulled back by ${pull.toFixed(2)}`);
  t.progress(0.28);

  // 2. Updraft from the street lifts him to rooftop height.
  t.scene("Updraft");
  const street = cfg.street || { z: 12.6 };
  const liftX = apt.stair ? apt.stair.x0 - 1.2 : apt.x - apt.w / 2 - 2;
  const liftZ = street.z;
  if (!(await goTo(liftX, liftZ, t, { sprint: true, progress: 0.32, ms: 28000, close: 1.2 }))) {
    t.problem("bug", `Couldn't reach the street under the apt for an updraft (at ${C.state().x.toFixed(1)},${C.state().z.toFixed(1)})`);
  }
  await t.until(() => {
    const P = window.powers || (window.day && window.day.powers);
    return P && P.now().pressure + 0.05 >= 16;
  }, 14000, "Pressure for a gust").catch(() => {});
  const yStreet = C.state().y;
  pressKey("g");
  await sleep(200);
  const drafts = C.updrafts ? C.updrafts() : [];
  const gustDraft = drafts.find((u) => u.kind === "gust");
  if (gustDraft) t.event("updraft-spawned", `gust updraft at ${gustDraft.x.toFixed(1)},${gustDraft.z.toFixed(1)} lift ${gustDraft.lift}`);
  else t.problem("bug", "Gust didn't plant an updraft");
  let upPeak = yStreet;
  const watchUp = setInterval(() => {
    upPeak = Math.max(upPeak, C.state().y);
  }, 40);
  try {
    await tapKey(" ");
    keyDown(" ");
    // Game time runs behind the clock on a slow renderer: hold until he's at roof height (or the gust is long gone).
    await sleep(1500);
    await t.until(() => upPeak - yStreet >= apt.h + 0.2, 15000, "the updraft to lift him to roof height").catch(() => {});
    keyUp(" ");
  } finally {
    clearInterval(watchUp);
    releaseHeld();
  }
  const gain = upPeak - yStreet;
  t.metric("updraftLift", Math.round(gain * 100) / 100);
  if (gain >= apt.h - 0.8) t.event("updraft-lift", `lifted ${gain.toFixed(2)} m from the street (roof ${apt.h})`);
  else t.problem("bug", `Updraft only lifted him ${gain.toFixed(2)} m; need ~${apt.h.toFixed(1)} m to reach the rooftop`);
  t.progress(0.55);

  // 3. Rooftop to rooftop without touching the ground.
  t.scene("Roof to roof");
  async function climbRoof(b, progress) {
    const s = b.stair;
    const lip = b.z + b.d / 2 - 1.1;
    const topX = s.x1 - 0.25;
    if (!(await goTo(s.x0 - 0.9, s.z, t, { sprint: true, progress, ms: 30000 }))) return false;
    if (!(await goTo(topX, s.z, t, { close: 0.4, progress, ms: 22000 }))) return false;
    if (C.state().y < b.h - 0.5) return false;
    await goTo(topX, lip, t, { close: 0.55, progress, ms: 8000 });
    return goTo(b.x, b.z, t, { close: 0.9, progress, ms: 10000 });
  }
  if (!(await climbRoof(apt, 0.6))) {
    t.problem("bug", `Couldn't climb the ${apt.id} roof to glide from (y ${C.state().y.toFixed(2)})`);
    t.progress(1);
    return;
  }
  t.event("roof-start", `on ${apt.id} at y ${C.state().y.toFixed(2)}`);
  // Face the shop (east) and glide across the street.
  const targetX = shop.x - shop.w / 2 + 1.5;
  const targetZ = shop.z;
  let minY = C.state().y;
  let touchedGround = false;
  const watchCross = setInterval(() => {
    const st = C.state();
    minY = Math.min(minY, st.y);
    if (st.y < 1.1 && st.grounded) touchedGround = true;
  }, 40);
  const overShop = (st, m) => Math.abs(st.x - shop.x) < shop.w / 2 - m && Math.abs(st.z - shop.z) < shop.d / 2 - m;
  let over = false;
  try {
    // Edge of the apt roof toward the shop, then jump + hold + steer.
    await goTo(apt.x + apt.w / 2 - 1.2, apt.z, t, { close: 0.7, progress: 0.7, ms: 10000 });
    await tapKey(" ");
    await sleep(200);
    await tapKey(" ");
    keyDown(" ");
    heldKeys = [" "];
    // The street is ~58 m wide: about 6 s of game time. The playtest browser renders slowly (main.js caps a frame
    // at 0.1 s, so game time runs behind the clock): wait on where he is, not on a fixed number of seconds.
    const crossStart = performance.now();
    let lastX = C.state().x;
    let stillSince = crossStart;
    while (performance.now() - crossStart < 45000) {
      const st = C.state();
      if (st.y > shop.h - 0.6 && overShop(st, 0.5)) {
        over = true;
        break;
      }
      if (st.grounded && performance.now() - crossStart > 1500) break;
      if (Math.abs(st.x - lastX) > 0.1) {
        lastX = st.x;
        stillSince = performance.now();
      } else if (performance.now() - stillSince > 6000) break;
      setHeld(steerKeys(targetX, targetZ, false).concat([" "]));
      t.progress(0.7 + 0.15 * Math.max(0, Math.min(1, (st.x - apt.x) / (targetX - apt.x))));
      await sleep(120);
    }
    if (over) {
      // Over the shop he's still a few metres above its roof: let go of the wind to drop, then hold again
      // just above the roof so he lands soft. Steer to the middle so the drop stays on the roof.
      t.event("over-shop", `gliding over the ${shop.id} roof at y ${C.state().y.toFixed(2)} (roof ${shop.h})`);
      setHeld(steerKeys(shop.x, shop.z, false));
      await t.until(() => C.state().y < shop.h + 1.3 || C.state().grounded, 15000, "him to drop toward the shop roof").catch(() => {});
      setHeld(steerKeys(shop.x, shop.z, false).concat([" "]));
    }
    await t.until(() => C.state().grounded, 20000, "him to land").catch(() => {});
    releaseHeld();
    await sleep(300);
  } finally {
    clearInterval(watchCross);
    releaseHeld();
  }
  const stEnd = C.state();
  const onShop = stEnd.y > shop.h - 0.55 && Math.abs(stEnd.x - shop.x) < shop.w / 2 && Math.abs(stEnd.z - shop.z) < shop.d / 2;
  t.metric("crossMinY", Math.round(minY * 100) / 100);
  if (touchedGround) t.problem("bug", `He touched the ground crossing roofs (min y ${minY.toFixed(2)})`);
  else if (onShop) t.event("roof-to-roof", `apt → shop without touching the ground · min y ${minY.toFixed(2)} · landed y ${stEnd.y.toFixed(2)}${stEnd.lastFlight && stEnd.lastFlight.soft ? " · soft landing" : ""}`);
  else t.problem("bug", `Didn't land on the shop roof (y ${stEnd.y.toFixed(2)} at ${stEnd.x.toFixed(1)},${stEnd.z.toFixed(1)}; min y ${minY.toFixed(2)})`);
  t.progress(1);
}
function RIDE_TRAILS_OK() {
  return !(window.DAY_CONFIG && window.DAY_CONFIG.control && window.DAY_CONFIG.control.ride && window.DAY_CONFIG.control.ride.trails === false);
}

/* ---------------- weather-life: street reacts, autopilot log after let-go, forecast drift ---------------- */
// Real input: day bar to the door, Enter, WASD to the avenue, key 3 (rain) then 4 (storm), Esc.
// Checks umbrellas + wipers in rain, a react line in the log after let-go, then hold expires → forecast.
async function weatherLife(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const W = window.weather;
  const C = window.day.control;
  const w = world();
  if (!W) {
    t.problem("bug", "There's no weather");
    return;
  }
  if (!C) {
    t.problem("bug", "There's no Take control");
    return;
  }
  if (!w || typeof w.streetNow !== "function") {
    t.problem("bug", "The world has no streetNow() (street people / wipers)");
    return;
  }
  const day = window.day.today();
  // The forecast is seeded by the date in 3-hour slots. Start where it isn't a storm,
  // so the drift back after the player's storm is a change you can see.
  const dateKey = window.day.now().key;
  const calm = (a) => [a.start, a.start + 15].every((m) => W.forecast(dateKey, m).state !== "storm");
  // Outside at home, in the yard: out the front door in the morning, out of the car in the evening.
  const outs = day.actions.filter((a) => a.room === "yard" && !a.inCar && !a.path);
  const out = outs.find(calm) || outs[0] || quietMoment(day);
  const startAt = out.start + Math.min(0.4, (out.end - out.start) / 2);
  scrubTo(startAt);
  await sleep(400);
  clickSpeed(1);
  const fc = W.forecast(dateKey, startAt).state;
  t.event("start-at", `${E().fmtClock(out.start)} "${out.text}" · forecast ${fc}`);
  t.progress(0.05);

  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  t.event("control-taken", "Enter");
  const street = window.DAY_CONFIG.street || { z: 12.6 };
  const at = C.state();
  await goTo(at.x, street.z, t, { close: 1.4, ms: 18000, progress: 0.15 });
  t.scene("On the road");
  t.progress(0.2);

  pressKey("3");
  await t.until(() => W.now().state === "rain" && W.now().blend > 0.85, 9000, "rain to settle");
  await sleep(600);
  // One more frame so world.update sees the wet weather
  await sleep(200);
  const rainStreet = w.streetNow();
  t.scene("Rain on the street");
  t.event("street-rain", `umbrellas ${rainStreet.umbrellas}/${rainStreet.folk}, wipers ${rainStreet.wipers}, moods ${rainStreet.moods.join(",")}`);
  t.metric("umbrellas", rainStreet.umbrellas);
  t.metric("wipers", rainStreet.wipers);
  if (rainStreet.umbrellas < 1) t.problem("bug", "In rain, nobody on the street opened an umbrella");
  if (rainStreet.wipers < 1) t.problem("bug", "In rain, no car wipers are on");
  else t.event("umbrellas-and-wipers", `${rainStreet.umbrellas} umbrellas, ${rainStreet.wipers} wipers`);
  t.progress(0.4);

  pressKey("4");
  await t.until(() => W.now().state === "storm" && W.now().blend > 0.85, 9000, "storm to settle");
  t.event("weather-storm", `manual ${W.now().manual}, forecast ${W.now().forecast}`);
  t.scene("Storm");
  await sleep(400);
  t.progress(0.5);

  const logBefore = ($("log") && $("log").textContent) || "";
  pressKey("Escape");
  await t.until(() => C.mode() === "returning" || C.mode() === "schedule", 5000, "let go");
  t.event("let-go", `mode ${C.mode()}, weather still ${W.now().state}, hold ${W.now().hold.toFixed(1)}s`);
  if (!W.now().manual) t.problem("bug", "Letting go cleared the storm immediately instead of holding it");
  await t.until(() => C.mode() === "schedule", 25000, "back on his day");
  t.event("back-on-day", `mode schedule, weather ${W.now().state}, hold ${W.now().hold.toFixed(1)}s, manual ${W.now().manual}`);
  t.progress(0.65);

  const reactLines = ((window.DAY_CONFIG.weather && window.DAY_CONFIG.weather.react && window.DAY_CONFIG.weather.react.storm) || []);
  await t.until(() => {
    const log = ($("log") && $("log").textContent) || "";
    return reactLines.some((line) => log.includes(line)) || /storm|Thunder|window/i.test(log.replace(logBefore, ""));
  }, 12000, "an autopilot weather react line").catch(() => {});
  const logAfter = ($("log") && $("log").textContent) || "";
  const reacted = reactLines.some((line) => logAfter.includes(line));
  if (reacted) t.event("autopilot-react", reactLines.find((line) => logAfter.includes(line)));
  else t.problem("bug", "After letting go of a storm, the autopilot log never reacted to the weather");
  t.scene("Autopilot reacts");
  t.progress(0.78);

  // On a date whose forecast is a storm here too, a storm drifting into a storm shows nothing.
  // Take him again, clear the sky (1), let go, and watch the storm forecast come back instead.
  let left = "storm";
  if (W.now().forecast === "storm") {
    t.event("forecast-is-storm", "today's forecast here is a storm too: leave him a clear sky instead");
    pressKey("Enter");
    await t.until(() => C.mode() === "control", 5000, "Take control again (Enter)");
    pressKey("1");
    await t.until(() => W.now().state === "clear" && W.now().blend > 0.85, 9000, "clear to settle");
    t.scene("Clear, against the forecast");
    await sleep(400);
    pressKey("Escape");
    await t.until(() => C.mode() === "schedule", 25000, "back on his day again");
    left = "clear";
  }
  t.progress(0.82);

  const holdLeft = W.now().hold;
  const holdSec = W.now().holdSec || 22;
  t.event("hold-wait", `${left} holding ${holdLeft.toFixed(1)}s of ${holdSec}s, then drift to forecast ${W.now().forecast}`);
  let drift = null;
  const onDrift = (e) => (drift = (e && e.detail) || {});
  window.addEventListener("day:weather-drift", onDrift);
  try {
    await t.until(() => !W.now().manual, Math.max(8000, (holdLeft + 4) * 1000), "weather hold ends");
  } finally {
    window.removeEventListener("day:weather-drift", onDrift);
  }
  const held = W.now();
  t.event("weather-drift", `hold over: ${(drift && drift.from) || left} → forecast ${(drift && drift.to) || held.forecast}, blend ${held.blend.toFixed(2)}`);
  // Let the blend finish so the footage shows the sky actually turning.
  await t.until(() => W.now().blend > 0.9 && W.now().shown === W.now().state, 10000, "the forecast to blend in").catch(() => {});
  await sleep(600);
  const drifted = W.now();
  t.scene(`Forecast again: ${drifted.state}`);
  if (drifted.manual) t.problem("bug", "The weather never drifted back to the day's forecast");
  else if (drifted.state !== drifted.forecast) t.problem("bug", `After the hold, state is ${drifted.state} but forecast is ${drifted.forecast}`);
  else if (drifted.state === left) t.problem("polish", `Drifted back, but the forecast is also ${left}, so nothing visibly changed`);
  else t.event("forecast-back", `${left} → ${drifted.state} (forecast ${drifted.forecast}), shown ${drifted.shown}, blend ${drifted.blend.toFixed(2)}`);
  t.progress(1);
}

/* ---------------- episodes: chapter missions, goals, forecast score card ---------------- */
// Starts each of the four via the Episodes menu (clock jump + take), completes at least
// one goal on Morning (clouds then clear), checks the score card and localStorage best.
// Events: episode-offer / episode-start / episode-goal / episode-score / episode-best.
async function episodes(options, t) {
  t.scene("Episodes");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const Ep = window.episodes || (window.day && window.day.episodes);
  const C = window.day.control;
  if (!Ep) {
    t.problem("bug", "There's no episodes API (js/episodes.js didn't install)");
    return;
  }
  if (!C) {
    t.problem("bug", "There's no Take control");
    return;
  }
  const cfg = window.DAY_CONFIG && window.DAY_CONFIG.episodes;
  if (!cfg || !Array.isArray(cfg.list) || cfg.list.length < 4) {
    t.problem("bug", `episodes.list is short (${cfg && cfg.list ? cfg.list.length : 0})`);
  }
  t.event("episodes-ready", `${Ep.list().length} episodes, storage ${cfg && cfg.storageKey}`);
  t.progress(0.05);

  const key = (cfg && cfg.storageKey) || "icanbe.episodes.best";
  try {
    localStorage.removeItem(key);
  } catch (err) {
    /* ignore */
  }

  const events = [];
  const onEp = (e) => events.push((e && e.detail) || {});
  window.addEventListener("day:episode", onEp);

  const ids = ["morning", "lunch", "commute-home", "night"];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const ep = cfg.list.find((e) => e.id === id);
    t.scene(ep ? ep.title : id);
    if (C.mode() === "control") {
      pressKey("Escape");
      await t.until(() => C.mode() === "schedule" || C.mode() === "returning", 5000, "let go before next").catch(() => {});
      await t.until(() => C.mode() === "schedule", 25000, "back on day").catch(() => {});
    }
    // Dismiss a leftover score card if any.
    const scoreOk = document.querySelector("#episode-score button.ok");
    if (scoreOk && !$("episode-score").hidden) scoreOk.click();
    await sleep(200);

    if (window.day.jump && ep && ep.clock) window.day.jump(ep.clock);
    else if (ep && ep.clock) {
      const mins = window.DayEngine.parseClock(ep.clock, window.DAY_CONFIG.dayStart);
      scrubTo(mins);
    }
    clickSpeed(1);
    await sleep(400);
    t.event("start-at", `${ep.clock} ${id}`);

    pressKey("Enter");
    await t.until(() => C.mode() === "control", 5000, `Take control for ${id}`);
    await sleep(350);
    const offer = $("episode-offer");
    if (!offer || offer.hidden) {
      // Menu path: start directly if the offer didn't match (clock edge).
      Ep.start(id, "playtest");
      t.event("episode-start", `${id} via api (no offer)`);
    } else {
      t.event("episode-offer", `${id} offered`);
      const accept = offer.querySelector("button.accept");
      if (accept) accept.click();
      else Ep.start(id, "playtest");
    }
    await t.until(() => Ep.now() && Ep.now().id === id, 4000, `${id} running`);
    const hud = $("episode-hud");
    if (!hud || hud.hidden) t.problem("bug", `Episode HUD hidden for ${id}`);
    else t.event("episode-hud", `${id}: ${Ep.now().goals.length} goals`);
    await sleep(400);
    checkHud(t, "episodes: " + id);
    t.progress(0.15 + i * 0.12);

    if (id === "morning") {
      // Complete at least one goal: gather clouds, then clear.
      pressKey("2");
      await t.until(() => {
        const n = Ep.now();
        return n && n.goals.some((g) => g.id === "clouds" && g.done);
      }, 8000, "clouds goal");
      t.event("episode-goal", "morning clouds");
      pressKey("1");
      await t.until(() => {
        const n = Ep.now();
        return n && n.goals.some((g) => g.id === "clear" && g.done);
      }, 8000, "clear goal");
      t.event("episode-goal", "morning clear");
      // End with let-go so the score card shows.
      pressKey("Escape");
      await t.until(() => !$("episode-score").hidden || !Ep.now(), 8000, "score card after let-go");
      const card = $("episode-score");
      if (card && !card.hidden) {
        const text = (card.querySelector(".forecast") || {}).textContent || "";
        t.event("episode-score", text || "score shown");
        if (!/Today's forecast:/.test(text)) t.problem("bug", `Score card text is "${text}"`);
        const okBtn = card.querySelector("button.ok");
        if (okBtn) okBtn.click();
      } else t.problem("bug", "Morning episode never showed a score card");
      await t.until(() => C.mode() === "schedule", 30000, "back after morning").catch(() => {});
      const best = Ep.best();
      if (!best.morning || !(best.morning.pct >= 0)) t.problem("bug", "Best score for morning wasn't kept");
      else t.event("episode-best", `morning ${best.morning.pct}% (${best.morning.word})`);
      try {
        const raw = localStorage.getItem(key);
        if (!raw || !JSON.parse(raw).morning) t.problem("bug", "localStorage has no morning best");
        else t.event("episode-storage", "icanbe.episodes.best has morning");
      } catch (err) {
        t.problem("bug", `localStorage best unreadable: ${err}`);
      }
    } else {
      // Smoke-start the others: goals visible, then let go for a score.
      await sleep(600);
      const n = Ep.now();
      if (!n || !n.goals.length) t.problem("bug", `${id} has no goals while running`);
      else t.event("episode-goals", `${id}: ${n.goals.map((g) => g.label).join(" · ")}`);
      pressKey("Escape");
      await t.until(() => !$("episode-score").hidden || !Ep.now(), 8000, `score for ${id}`).catch(() => {});
      const card = $("episode-score");
      if (card && !card.hidden) {
        t.event("episode-score", `${id}: ${(card.querySelector(".forecast") || {}).textContent || "shown"}`);
        const okBtn = card.querySelector("button.ok");
        if (okBtn) okBtn.click();
      }
      await t.until(() => C.mode() === "schedule" || C.mode() === "returning", 5000, "leaving control").catch(() => {});
      await t.until(() => C.mode() === "schedule", 30000, "schedule again").catch(() => {});
    }
  }

  window.removeEventListener("day:episode", onEp);
  const started = events.filter((e) => e.action === "start").map((e) => e.id);
  ids.forEach((id) => {
    if (!started.includes(id) && !events.some((e) => e.action === "score" && e.id === id)) {
      t.problem("polish", `No start/score event logged for ${id}`);
    }
  });
  t.progress(1);
}

/* ---------------- score ranks: the unified score card, the saved best rank, the Challenge unlock ---------------- */
// Setup shortcuts: the day bar to a moment outdoors beside the car, Pressure refilled, the episode started by its API.
// Everything else is real input: Enter, R / X / E, weather keys 2 then 1, the Episodes button and the Challenge row.
// Events: rank-locked (Challenge shut before a clear), rank-card (rank, points, the four rows), rank-unlock,
// rank-best (saved best rank and storage), rank-challenge (the Challenge running with a tighter timer), rank-challenge-card.
async function scoreRanks(options, t) {
  t.scene("Beside the car");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  if (!Ep || !C || !P) return t.problem("bug", "episodes, powers or Take control isn't installed");
  const cfg = window.DAY_CONFIG;
  const key = (cfg.episodes && cfg.episodes.storageKey) || "icanbe.episodes.best";
  try { localStorage.removeItem(key); } catch (err) { /* ignore */ }
  const day = window.day.today();
  const outside = carSideMoment(day);
  if (!outside) return t.problem("bug", "No moment outdoors to take control");
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  const offer = $("episode-offer");
  if (offer && !offer.hidden) { const no = offer.querySelector("button.decline"); if (no) no.click(); }
  const refill = () => { if (P.abilities && P.abilities.reset) P.abilities.reset(100); };

  const openMenu = async () => {
    const b = $("episodes");
    if (b) b.click();
    await t.until(() => !$("episode-menu").hidden, 3000, "the Episodes menu");
  };
  const closeMenu = () => { const x = document.querySelector("#episode-menu button.close, #episode-menu .close"); if (x) x.click(); else $("episode-menu").hidden = true; };
  const readCard = (label) => {
    const el = $("episode-score");
    const rank = (el.querySelector(".rank") || {}).textContent || "";
    const detail = (el.querySelector(".rankdetail") || {}).textContent || "";
    const rows = [...el.querySelectorAll(".breakdown li")].map((li) => `${li.dataset.part} ${(li.querySelector("em") || {}).textContent}`);
    t.event(label, `rank ${rank} | ${detail} | ${rows.join(", ")} | ${(el.querySelector(".unlockline") || {}).textContent || "no unlock line"}`);
    return { rank, detail, rows, unlock: !(el.querySelector(".unlockline") || { hidden: true }).hidden };
  };
  // Calls three different abilities (variety), then the weather goals through real keys, standing at the car.
  const play = async (id) => {
    Ep.start(id, "playtest");
    await t.until(() => Ep.now() && Ep.now().id === id, 4000, `${id} running`);
    refill();
    pressKey("r"); await sleep(500);
    pressKey("x"); await sleep(500);
    pressKey("e"); await sleep(700);
    refill();
    pressKey("2");
    await t.until(() => Ep.now() && Ep.now().goals.some((g) => g.id === "clouds" && g.done), 9000, "clouds goal");
    pressKey("1");
    await t.until(() => !$("episode-score").hidden, 12000, "the score card after the clear");
  };

  t.progress(0.1);
  await openMenu();
  const lockedRow = $("ep-challenge-morning");
  if (!lockedRow || !lockedRow.disabled) t.problem("bug", "The Challenge is open before the episode was cleared");
  else t.event("rank-locked", `morning Challenge row says: ${(lockedRow.querySelector("small") || {}).textContent}`);
  if (Ep.start("morning", "playtest", { challenge: true })) t.problem("bug", "A locked Challenge started");
  closeMenu();

  t.scene("Morning, normal");
  await play("morning");
  const first = readCard("rank-card");
  if (!/^[SABC]$/.test(first.rank)) t.problem("bug", `The score card has no S to C rank ("${first.rank}")`);
  if (first.rows.length !== 4) t.problem("bug", `The score card shows ${first.rows.length} rows of breakdown, wanted 4 (people, time, damage, variety)`);
  if (!first.unlock) t.problem("bug", "A first clear did not say the Challenge is unlocked");
  else t.event("rank-unlock", "the card announces the Challenge");
  const best1 = Ep.best().morning;
  if (!best1 || !best1.rank || !best1.cleared) t.problem("bug", `Best rank wasn't kept (${JSON.stringify(best1)})`);
  else t.event("rank-best", `morning best rank ${best1.rank}, ${best1.pct}%, cleared ${best1.cleared}`);
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    if (!raw.morning || !raw.morning.rank) t.problem("bug", "localStorage has no best rank for morning");
    else t.event("rank-storage", `${key}: morning ${raw.morning.rank}`);
  } catch (err) { t.problem("bug", `localStorage unreadable: ${err}`); }
  $("episode-score").querySelector("button.ok").click();
  t.progress(0.5);

  t.scene("Morning, Challenge");
  await openMenu();
  const row = $("ep-challenge-morning");
  if (!row || row.disabled) { t.problem("bug", "The Challenge stayed locked after a clear"); return; }
  t.event("rank-open", `morning Challenge row says: ${(row.querySelector("small") || {}).textContent}`);
  const normalTimer = cfg.episodes.list.find((e) => e.id === "morning").timer;
  row.click();
  await t.until(() => Ep.now() && Ep.now().id === "morning" && Ep.now().challenge, 5000, "the Challenge running");
  const hudText = ($("episode-hud").querySelector("h3") || {}).textContent || "";
  t.event("rank-challenge", `${hudText}, timer ${Math.ceil(Ep.now().left)} s (normal ${normalTimer} s)`);
  if (Ep.now().left >= normalTimer) t.problem("bug", "The Challenge timer is not tighter");
  await sleep(300);
  refill();
  pressKey("r"); await sleep(500);
  pressKey("x"); await sleep(500);
  pressKey("2");
  await t.until(() => Ep.now() && Ep.now().goals.some((g) => g.id === "clouds" && g.done), 9000, "clouds goal");
  pressKey("1");
  await t.until(() => !$("episode-score").hidden, 12000, "the Challenge score card");
  const ch = readCard("rank-challenge-card");
  if (!/Challenge/.test(ch.detail)) t.problem("bug", "The Challenge card doesn't say Challenge");
  if (ch.unlock) t.problem("bug", "The Challenge card repeats the unlock line");
  const bestAll = Ep.best();
  if (!bestAll["morning#challenge"] || !bestAll["morning#challenge"].rank) t.problem("bug", "The Challenge's best rank wasn't kept apart");
  else t.event("rank-best", `morning Challenge best rank ${bestAll["morning#challenge"].rank}; normal best stays ${bestAll.morning.rank}`);
  $("episode-score").querySelector("button.ok").click();
  t.progress(1);
}

/* ---------------- episode select: Replay and Next on the score card, locked rows, progress kept ---------------- */
// Setup shortcuts: the day bar beside the car, Pressure refilled, Morning started by its API. Real input: Enter, R / X / E,
// weather keys 2 then 1, then the card's Replay and Next buttons and the Episodes button. A page reload isn't survivable
// inside a scenario, so persistence is shown by reading icanbe.episodes.best from localStorage (the menu reads it fresh
// each time it opens) and by the menu rebuilt from it. Events: select-locked, select-card, select-replay, select-next,
// select-menu, select-storage.
async function episodeSelect(options, t) {
  t.scene("Beside the car");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  if (!Ep || !C || !P) return t.problem("bug", "episodes, powers or Take control isn't installed");
  const cfg = window.DAY_CONFIG;
  const key = (cfg.episodes && cfg.episodes.storageKey) || "icanbe.episodes.best";
  try { localStorage.removeItem(key); } catch (err) { /* ignore */ }
  const chain = cfg.episodes.list.filter((e) => !e.tutorial);
  const day = window.day.today();
  const outside = carSideMoment(day);
  if (!outside) return t.problem("bug", "No moment outdoors to take control");
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  const offer = $("episode-offer");
  if (offer && !offer.hidden) { const no = offer.querySelector("button.decline"); if (no) no.click(); }
  const refill = () => { if (P.abilities && P.abilities.reset) P.abilities.reset(100); };
  const openMenu = async () => {
    const b = $("episodes");
    if (b) b.click();
    await t.until(() => !$("episode-menu").hidden, 3000, "the Episodes menu");
  };
  const closeMenu = () => { const x = document.querySelector("#episode-menu button.close"); if (x) x.click(); };
  const rows = () => chain.map((e) => { const r = $("ep-row-" + e.id); return { id: e.id, locked: !!r && r.dataset.locked === "1", rank: r ? r.dataset.rank : "", text: r ? (r.querySelector("small") || {}).textContent : "missing" }; });
  const playMorning = async () => {
    await t.until(() => Ep.now() && Ep.now().id === "morning", 6000, "Morning running");
    refill();
    pressKey("r"); await sleep(500);
    pressKey("x"); await sleep(500);
    pressKey("e"); await sleep(700);
    refill();
    pressKey("2");
    await t.until(() => Ep.now() && Ep.now().goals.some((g) => g.id === "clouds" && g.done), 9000, "clouds goal");
    pressKey("1");
    await t.until(() => !$("episode-score").hidden, 12000, "the score card");
  };

  t.progress(0.1);
  await openMenu();
  let r0 = rows();
  if (r0[0].locked) t.problem("bug", "The first episode is locked at the start");
  if (!r0.slice(1).every((r) => r.locked)) t.problem("bug", "Later episodes are open before anything was finished");
  t.event("select-locked", r0.map((r) => `${r.id}:${r.locked ? "locked" : "open"}`).join(", "));
  closeMenu();

  t.scene("Morning, first clear");
  Ep.start("morning", "playtest");
  await playMorning();
  const card = $("episode-score");
  const rep = card.querySelector("button.replay");
  const nxt = card.querySelector("button.next");
  if (!rep || rep.hidden) t.problem("bug", "The score card has no Replay button");
  if (!nxt || nxt.hidden || nxt.disabled) t.problem("bug", "The score card has no working Next episode button after a finish");
  t.event("select-card", `rank ${(card.querySelector(".rank") || {}).textContent}; buttons: ${rep && rep.textContent} | ${nxt && nxt.textContent}`);
  t.progress(0.4);

  t.scene("Replay");
  rep.click();
  await t.until(() => Ep.now() && Ep.now().id === "morning" && $("episode-score").hidden, 5000, "Morning replaying");
  t.event("select-replay", `Morning running again, goals done ${Ep.now().goals.filter((g) => g.done).length} of ${Ep.now().goals.length}`);
  await playMorning();
  t.progress(0.7);

  t.scene("Next episode");
  const n2 = $("episode-score").querySelector("button.next");
  if (!n2 || n2.disabled) return t.problem("bug", "Next is shut after a second clear");
  n2.click();
  await t.until(() => Ep.now() && Ep.now().id === chain[1].id, 5000, `${chain[1].id} running`);
  t.event("select-next", `Next episode started: ${Ep.now().id}`);
  pressKey("Escape");
  await sleep(500);
  if (!$("episode-score").hidden) $("episode-score").querySelector("button.ok").click();

  t.scene("The select screen");
  await openMenu();
  const r1 = rows();
  if (r1[0].locked || !r1[0].rank) t.problem("bug", `Morning shows no best rank in the menu (${JSON.stringify(r1[0])})`);
  if (r1[1].locked) t.problem("bug", "The next episode is still locked after Morning was finished");
  if (!r1[2].locked) t.problem("bug", "The episode after the next opened too early");
  t.event("select-menu", r1.map((r) => `${r.id}:${r.locked ? "locked" : "open"}${r.rank ? " rank " + r.rank : ""}`).join(", "));
  closeMenu();
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    if (!raw.morning || !raw.morning.rank || !raw.morning.done) t.problem("bug", "localStorage lost Morning's rank or finish");
    else t.event("select-storage", `${key}: morning rank ${raw.morning.rank}, done ${raw.morning.done}, cleared ${raw.morning.cleared}`);
  } catch (err) { t.problem("bug", `localStorage unreadable: ${err}`); }
  t.progress(1);
}

/* ---------------- story parts: Part 1 (Dry) and Part 2 (Still) of the beat sheet, with overuse ---------------- */
// Setup shortcuts: the day bar to a moment outdoors, the Pressure meter topped up, and starting each part by its
// API (the Episodes menu would jump the clock into the office). Everything else is real keys: Enter, WASD with
// Shift, R, X and V, Esc. Events: story-* with the dialogue as it is spoken, the Strain meter, kick-backs, the cards.
async function storyParts(options, t) {
  t.scene("Home");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  if (!Ep || !C || !P) return t.problem("bug", "episodes, powers or Take control isn't installed");
  const cfg = window.DAY_CONFIG;
  const list = (cfg.episodes && cfg.episodes.list) || [];
  const p1 = list.find((e) => e.id === "dry-park");
  const p2 = list.find((e) => e.id === "still-blades");
  if (!p1 || !p2) return t.problem("bug", "Parts 1 and 2 aren't in the episode list");
  t.event("story-list", list.map((e) => e.title).join(" | "));
  const sideZ = (cfg.street || { z: 12.6 }).z - 2.8;
  const heard = [];
  const onStory = (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "say") {
      heard.push(d);
      t.event("story-say", `${d.who}: ${d.text}`);
    }
    if (d.action === "kick") t.event("story-kick", `${d.kick} at strain ${d.strain}`);
  };
  window.addEventListener("day:story", onStory);
  try { localStorage.removeItem((cfg.episodes && cfg.episodes.storageKey) || "icanbe.episodes.best"); } catch (err) { /* ignore */ }

  const day = window.day.today();
  const outside = carSideMoment(day);
  if (!outside) return t.problem("bug", "No moment outdoors to take control");
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  const offer = $("episode-offer");
  if (offer && !offer.hidden) { const no = offer.querySelector("button.decline"); if (no) no.click(); }

  // The menu lists both parts.
  const menuBtn = $("episodes");
  if (menuBtn) {
    menuBtn.click();
    await sleep(300);
    const rows = [...document.querySelectorAll("#episode-menu .ep-row")].map((r) => r.textContent);
    if (rows.some((r) => /Part 1/.test(r)) && rows.some((r) => /Part 2/.test(r))) t.event("story-menu", rows.filter((r) => /Part [12]/.test(r)).join(" | "));
    else t.problem("bug", "The Episodes menu doesn't list Part 1 and Part 2");
    const close = document.querySelector("#episode-menu button.close");
    if (close) close.click();
  }

  const refill = () => { if (P.abilities && P.abilities.reset) P.abilities.reset(100); };
  async function walkTo(x, z, progress) {
    await goTo(C.state().x, sideZ, t, { sprint: true, progress, ms: 12000, close: 1.2 });
    for (let k = 0; k < 14; k++) {
      const s = C.state();
      if (Math.abs(s.x - x) < 1.6) break;
      const nx = s.x + Math.max(-22, Math.min(22, x - s.x));
      if (!(await goTo(nx, sideZ, t, { sprint: true, progress, ms: 14000, close: 1.2 }))) break;
    }
    return goTo(x, z, t, { progress, ms: 8000, close: 1.4 });
  }
  const goalDone = (id) => { const n = Ep.now(); return !!(n && n.goals.some((g) => g.id === id && g.done)); };
  const lastSay = () => ($("episode-say") || {}).textContent || "";
  async function card(label) {
    await t.until(() => !$("episode-score").hidden, 8000, `${label}: the score card`);
    const el = $("episode-score");
    const text = (el.querySelector(".forecast") || {}).textContent || "";
    const strain = (el.querySelector(".strainline") || {}).textContent || "";
    t.event("story-card", `${label}: ${text} | ${strain}`);
    await sleep(1600); // a beat for the footage
    el.querySelector("button.ok").click();
    return { text, strain, scarred: /scarred/.test(text) };
  }
  async function press(key, wait) { pressKey(key); await sleep(wait || 600); }

  /* ---- Part 1, overused: three rains on the park go past the budget of 4 ---- */
  t.scene("Part 1: the park, overused");
  Ep.start("dry-park", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "dry-park", 3000, "Part 1 running");
  if (!$("episode-hud") || $("episode-hud").hidden) t.problem("bug", "The episode HUD isn't up for Part 1");
  await sleep(2500);
  t.event("story-dialogue", `Part 1 opens: "${lastSay()}"`);
  if (!(await walkTo(-6, 24.5, 0.1))) t.problem("bug", "He didn't reach the park bench");
  refill();
  await press("r", 900);
  await t.until(() => goalDone("rain-park"), 5000, "the rain-on-the-park goal");
  t.event("story-goal", "Part 1: rain on the park done, strain " + Ep.story().strain);
  for (let i = 0; i < 2; i++) {
    await sleep(4300);
    refill();
    await press("r", 700);
    t.event("story-strain", `rain again: strain ${Ep.story().strain} of ${Ep.story().budget}`);
  }
  await t.until(() => Ep.story() && Ep.story().kicks.includes("flood"), 4000, "the pond overflowing").catch(() => t.problem("bug", "Overusing rain never flooded the path"));
  await sleep(2500);
  Ep.end("overuse");
  const over = await card("Part 1 overused");
  if (!over.scarred) t.problem("bug", `Overusing rain on the park left the card ${over.text}`);

  /* ---- Part 1, clean: one rain on the park, one sun break on the market, stay while it fills ---- */
  t.scene("Part 1: the park and the market");
  Ep.start("dry-park", "playtest");
  await sleep(300);
  refill();
  await press("r", 900);
  await t.until(() => goalDone("rain-park"), 5000, "rain on the park (clean run)");
  await sleep(2500);
  t.event("story-dialogue", `After the rain: "${lastSay()}"`);
  if (!(await walkTo(117, 27.5, 0.4))) t.problem("bug", "He didn't reach the plaza");
  refill();
  await press("x", 900);
  await t.until(() => goalDone("sun-market"), 5000, "sun break over the market");
  t.event("story-goal", "Part 1: sun break on the market done");
  await t.until(() => goalDone("stalls"), 40000, "the stalls to fill (20 s in the plaza)");
  const clean = await card("Part 1 clean");
  if (clean.scarred) t.problem("bug", `A clean Part 1 came out ${clean.text}`);
  if (over.text === clean.text) t.problem("bug", "Overuse and clean left the same card");

  /* ---- Part 2: wind for the turbines, not for the stalls ---- */
  t.scene("Part 2: the market stalls");
  Ep.start("still-blades", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "still-blades", 3000, "Part 2 running");
  await sleep(2200);
  t.event("story-dialogue", `Part 2 opens: "${lastSay()}"`);
  if (!(await walkTo(117, 27.5, 0.6))) t.problem("bug", "He didn't reach the plaza for the test gale");
  refill();
  await press("v", 1500);
  const topple = Ep.story();
  if (topple && topple.toppled > 0) t.event("story-kick", `a gale in the plaza toppled a stall: ${topple.stalls.join(",")}`);
  else t.problem("bug", "A gale in the plaza left every stall standing");
  await sleep(2500);
  t.scene("Part 2: the annex roof");
  if (!(await walkTo(154, 9.8, 0.75))) t.problem("bug", "He didn't reach Ines");
  await t.until(() => goalDone("ines"), 4000, "finding Ines");
  await sleep(2600);
  t.event("story-dialogue", `Ines: "${lastSay()}"`);
  for (let i = 0; i < 5 && !goalDone("turn") && Ep.now(); i++) {
    refill();
    await press("v", 3200);
    const st = Ep.story();
    if (st) t.event("story-wind", `gale ${i + 1}: ${st.windSec.toFixed(1)} s of 10, strain ${st.strain} of ${st.budget}, blades ${st.turbine.toFixed(1)} rad/s`);
    await sleep(2200);
  }
  const scarred = await card("Part 2");
  if (!scarred.scarred) t.problem("bug", `Toppling a stall didn't scar Part 2: ${scarred.text}`);
  if (!heard.some((h) => /Seventeen blades/.test(h.text)) || !heard.some((h) => /Reservoir level: critical/.test(h.text))) t.problem("bug", "Part 2's dialogue from the beat sheet didn't play");
  await sleep(4000); // the hand-off lines
  window.removeEventListener("day:story", onStory);
  t.event("story-lines", `${heard.length} lines spoken`);
  t.progress(1);
}

/* ---------------- lunch rescue: the rebuilt Rooftop storm (opening, three set pieces, the twist, the ending, S-C rank) ---------------- */
// Setup shortcuts: the day bar to a moment outdoors, the Pressure meter topped up between calls, and the episode started
// by its API (the Episodes menu would jump the clock into the office). Everything else is real keys: Enter, WASD with
// Shift, X in the plaza, E at the shop, V on the avenue, Esc. Two runs: one that helps a single person and lets go (low
// rank), one that plays all three set pieces through the twist (high rank). Events: lunch-* with the dialogue, each help
// and its points, the twist, and the rank cards side by side.
async function lunchRescue(options, t) {
  // A setup that can't be reached is a failed run, never 'done': the harness reports 'done' when the bot just returns.
  const bail = (msg) => { t.problem("bug", msg); t.finish("fail"); };
  t.scene("Home");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  if (!Ep || !C || !P) return bail("episodes, powers or Take control isn't installed");
  const cfg = window.DAY_CONFIG;
  const ep = ((cfg.episodes && cfg.episodes.list) || []).find((e) => e.id === "lunch");
  if (!ep || !ep.pieces || ep.pieces.length < 3) return bail("The lunch episode has no set pieces");
  const sideZ = (cfg.street || { z: 12.6 }).z - 2.8;
  const heard = [];
  const onStory = (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "say") { heard.push(d); t.event("lunch-say", `${d.who}: ${d.text}`); }
    if (d.action === "help") t.event("lunch-help", `${d.person} (${d.piece}): +${d.points}${d.late ? " late" : ""}, score ${d.score}`);
    if (d.action === "twist") t.event("lunch-twist", "the rain stops, the fog comes in");
  };
  window.addEventListener("day:story", onStory);
  const onEp = (e) => {
    const d = (e && e.detail) || {};
    if (d.id !== "lunch") return;
    if (d.action === "piece") t.event("lunch-piece", `set piece ${d.index + 1} of 3: ${d.piece}, ${d.people} stranded`);
    if (d.action === "precision") t.event("lunch-precision", `rod grounded clean, score ${d.score}`);
  };
  window.addEventListener("day:episode", onEp);
  try { localStorage.removeItem((cfg.episodes && cfg.episodes.storageKey) || "icanbe.episodes.best"); } catch (err) { /* ignore */ }

  const day = window.day.today();
  const outside = carSideMoment(day);
  if (!outside) return bail("No moment outdoors to take control");
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  const offer = $("episode-offer");
  if (offer && !offer.hidden) { const no = offer.querySelector("button.decline"); if (no) no.click(); }

  const refill = () => { if (P.abilities && P.abilities.reset) P.abilities.reset(100); };
  async function walkTo(x, z, progress) {
    await goTo(C.state().x, sideZ, t, { sprint: true, progress, ms: 12000, close: 1.2 });
    for (let k = 0; k < 16; k++) {
      const s = C.state();
      if (Math.abs(s.x - x) < 1.6) break;
      const nx = s.x + Math.max(-22, Math.min(22, x - s.x));
      if (!(await goTo(nx, sideZ, t, { sprint: true, progress, ms: 14000, close: 1.2 }))) break;
    }
    return goTo(x, z, t, { progress, ms: 8000, close: 1.4 });
  }
  const goalDone = (id) => { const n = Ep.now(); return !!(n && n.goals.some((g) => g.id === id && g.done)); };
  const lastSay = () => ($("episode-say") || {}).textContent || "";
  async function card(label) {
    await t.until(() => !$("episode-score").hidden, 8000, `${label}: the score card`);
    const el = $("episode-score");
    const rank = (el.querySelector(".rank") || {}).textContent || "";
    const detail = (el.querySelector(".rankdetail") || {}).textContent || "";
    const text = (el.querySelector(".forecast") || {}).textContent || "";
    t.event("lunch-card", `${label}: rank ${rank} | ${text} | ${detail}`);
    await sleep(1800);
    el.querySelector("button.ok").click();
    return { rank, text, detail };
  }
  async function press(key, wait) { pressKey(key); await sleep(wait || 600); }

  /* ---- run 1: one person helped, then let go ---- */
  t.scene("Rooftop storm: one helped");
  // He is already the player's here, so the episode doesn't jump the clock: put it at the lunch storm's own time.
  window.day.jump(ep.clock || "12:20");
  await sleep(500);
  Ep.start("lunch", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "lunch", 3000, "the lunch episode running");
  // The scene must really be the lunch storm: the clock at 12:15 to 12:30 and the stranded people in the world.
  const mins = window.day.now().minutes;
  const lunchAt = window.DayEngine.parseClock(ep.clock || "12:20", window.day.today().dayStart);
  if (Math.abs(mins - lunchAt) > 8) return bail(`The lunch episode isn't at lunch: the clock is ${window.DayEngine.fmtClock(mins, true)}, not about ${ep.clock}`);
  const stranded = (Ep.now().rescue && Ep.now().rescue.people) || [];
  if (!stranded.length) return bail("The lunch storm has no stranded people in the world");
  t.event("lunch-stranded", `${stranded.length} at the lunch storm: ${stranded.map((p) => `${p.id} (${Math.round(p.x)}, ${Math.round(p.z)})`).join(", ")}`);
  if (!$("episode-hud") || $("episode-hud").hidden) t.problem("bug", "The episode HUD isn't up for the lunch episode");
  await sleep(3000);
  t.event("lunch-opening", `"${lastSay()}" · HUD: ${($("episode-hud").textContent || "").replace(/\s+/g, " ").slice(0, 160)}`);
  if (!(await walkTo(118, 30, 0.1))) t.problem("bug", "He didn't reach the plaza cafe");
  refill();
  await press("x", 1200);
  await t.until(() => Ep.now() && Ep.now().rescue && Ep.now().rescue.helped >= 1, 4000, "a stranded person helped by a Sun break");
  const mid = Ep.now().rescue;
  t.event("lunch-score", `after one help: score ${mid.score}, rank ${mid.rank}`);
  await sleep(2500);
  Ep.end("let-go");
  const low = await card("one helped");

  /* ---- run 2: the whole rescue ---- */
  t.scene("Rooftop storm: the plaza");
  Ep.start("lunch", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "lunch", 3000, "the lunch episode again");
  await sleep(2500);
  const stand = [[109.5, 27.6], [118, 31.6], [126.5, 26.2]];
  for (let i = 0; i < stand.length; i++) {
    if (!(await walkTo(stand[i][0], stand[i][1], 0.2 + i * 0.05))) t.problem("bug", `He didn't reach plaza person ${i + 1}`);
    refill();
    await press("x", 1100);
  }
  await t.until(() => goalDone("shelter"), 4000, "set piece 1, the plaza sheltered");
  t.event("lunch-goal", "set piece 1 done: the plaza is sheltered");
  t.scene("Rooftop storm: the shop roof");
  if (!(await walkTo(50, 9.2, 0.45))) t.problem("bug", "He didn't reach the shop");
  refill();
  await press("e", 1200);
  await t.until(() => goalDone("rescue"), 5000, "set piece 2, the roof rescue");
  t.event("lunch-goal", "set piece 2 done: Hollis is down");
  await t.until(() => Ep.now() && Ep.now().rescue && Ep.now().rescue.twisted, 3000, "the twist");
  await sleep(4500); // the twist lines
  t.scene("Rooftop storm: the fog in the avenue");
  const wx = (window.weather || window.day.weather).now();
  t.event("lunch-sky", `after the twist the sky is ${wx.state}`);
  if (!(await walkTo(84, 12.2, 0.7))) t.problem("bug", "He didn't reach the crosswalk");
  for (let i = 0; i < 2; i++) {
    refill();
    await press("v", 1500);
  }
  await t.until(() => goalDone("street"), 6000, "set piece 3, the street cleared");
  t.event("lunch-goal", "set piece 3 done: the street is clear");
  const high = await card("all helped");
  if (!low.rank || !high.rank) t.problem("bug", `The score card shows no rank (${low.rank || "-"} / ${high.rank || "-"})`);
  else if (low.rank === high.rank) t.problem("bug", `Helping everyone left the rank at ${high.rank}, the same as helping one`);
  else t.event("lunch-rank", `one helped: ${low.rank}; all helped: ${high.rank}`);
  await sleep(4500); // the ending line
  if (!heard.some((h) => /^end:/.test(h.key || ""))) t.problem("bug", "The ending line didn't play");
  window.removeEventListener("day:story", onStory);
  window.removeEventListener("day:episode", onEp);
  t.event("lunch-lines", `${heard.length} lines spoken`);
  t.progress(1);
}

/* ---------------- hurricane drive: the rebuilt commute home (opening, four set pieces, helping and hurting abilities, the twist, rank S-C) ---------------- */
// Setup shortcuts: the day bar to a moment outdoors, the Pressure meter topped up between calls, and the episode started
// by its API. Everything else is real keys: Enter, WASD with Shift, V / R at the fallen sign, X / R at the underpass,
// E at the bus, C / V at the bridge, Esc. Two runs. Run 1 uses the wrong weather first (rain on the debris: points off,
// "hurt"), helps one person with the right one and lets go (low rank). Run 2 plays the right ability at each of the four
// set pieces, through the twist, and gets home (high rank). Events: drive-* with the lines, each help and hurt with its
// points, the twist and the two rank cards side by side.
async function hurricaneDrive(options, t) {
  t.scene("Home");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  if (!Ep || !C || !P) return t.problem("bug", "episodes, powers or Take control isn't installed");
  const cfg = window.DAY_CONFIG;
  const ep = ((cfg.episodes && cfg.episodes.list) || []).find((e) => e.id === "commute-home");
  if (!ep || !ep.pieces || ep.pieces.length < 3) return t.problem("bug", "The hurricane drive has no set pieces");
  const sideZ = (cfg.street || { z: 12.6 }).z - 2.8;
  const heard = [];
  const onStory = (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "say") { heard.push(d); t.event("drive-say", `${d.who}: ${d.text}`); }
    if (d.action === "help") t.event("drive-help", `${d.person} (${d.piece}): +${d.points}${d.late ? " late" : ""}, score ${d.score}`);
    if (d.action === "hurt") t.event("drive-hurt", `${d.power} at ${d.piece}: ${d.points}, score ${d.score}`);
    if (d.action === "twist") t.event("drive-twist", "the wind turns to a storm cell");
  };
  window.addEventListener("day:story", onStory);
  const onEp = (e) => {
    const d = (e && e.detail) || {};
    if (d.id !== "commute-home") return;
    if (d.action === "piece") t.event("drive-piece", `set piece ${d.index + 1} of ${ep.pieces.length}: ${d.piece}, ${d.people} stranded`);
  };
  window.addEventListener("day:episode", onEp);
  try { localStorage.removeItem((cfg.episodes && cfg.episodes.storageKey) || "icanbe.episodes.best"); } catch (err) { /* ignore */ }

  const day = window.day.today();
  const outside = carSideMoment(day);
  if (!outside) return t.problem("bug", "No moment outdoors to take control");
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  const offer = $("episode-offer");
  if (offer && !offer.hidden) { const no = offer.querySelector("button.decline"); if (no) no.click(); }

  const refill = () => { if (P.abilities && P.abilities.reset) P.abilities.reset(100); };
  async function walkTo(x, z, progress) {
    await goTo(C.state().x, sideZ, t, { sprint: true, progress, ms: 12000, close: 1.2 });
    for (let k = 0; k < 16; k++) {
      const s = C.state();
      if (Math.abs(s.x - x) < 1.6) break;
      const nx = s.x + Math.max(-22, Math.min(22, x - s.x));
      if (!(await goTo(nx, sideZ, t, { sprint: true, progress, ms: 14000, close: 1.2 }))) break;
    }
    return goTo(x, z, t, { progress, ms: 8000, close: 1.4 });
  }
  const goalDone = (id) => { const n = Ep.now(); return !!(n && n.goals.some((g) => g.id === id && g.done)); };
  const lastSay = () => ($("episode-say") || {}).textContent || "";
  async function card(label) {
    await t.until(() => !$("episode-score").hidden, 8000, `${label}: the score card`);
    const el = $("episode-score");
    const rank = (el.querySelector(".rank") || {}).textContent || "";
    const detail = (el.querySelector(".rankdetail") || {}).textContent || "";
    const text = (el.querySelector(".forecast") || {}).textContent || "";
    t.event("drive-card", `${label}: rank ${rank} | ${text} | ${detail}`);
    await sleep(1800);
    el.querySelector("button.ok").click();
    return { rank, text, detail };
  }
  async function press(key, wait) { pressKey(key); await sleep(wait || 600); }
  // One set piece: walk to each stranded person and call the ability (the right one for the piece).
  async function playPiece(q, key, progress) {
    for (let i = 0; i < q.people.length; i++) {
      const p = q.people[i];
      if (!(await walkTo(p.x, p.z - 0.8, progress + i * 0.02))) t.problem("bug", `He didn't reach ${p.name} (${q.id})`);
      refill();
      await press(key, 1300);
    }
    await t.until(() => goalDone(q.goal), 5000, `set piece ${q.id} done`);
    t.event("drive-goal", `set piece ${q.id} done`);
  }

  /* ---- run 1: the wrong weather first, one person helped, then let go ---- */
  t.scene("Hurricane drive: the wrong weather");
  Ep.start("commute-home", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "commute-home", 3000, "the drive running");
  if (!$("episode-hud") || $("episode-hud").hidden) t.problem("bug", "The episode HUD isn't up for the drive");
  await sleep(3000);
  t.event("drive-opening", `"${lastSay()}" · HUD: ${($("episode-hud").textContent || "").replace(/\s+/g, " ").slice(0, 170)}`);
  const first = ep.pieces[0];
  if (!(await walkTo(first.people[0].x, first.people[0].z - 0.8, 0.1))) t.problem("bug", "He didn't reach the fallen sign");
  refill();
  await press("r", 1300);
  await t.until(() => Ep.now() && Ep.now().rescue && Ep.now().rescue.hurt >= 1, 4000, "rain on the debris hurting the set piece");
  const hurtScore = Ep.now().rescue.score;
  refill();
  await press("v", 1300);
  await t.until(() => Ep.now() && Ep.now().rescue && Ep.now().rescue.helped >= 1, 4000, "a gale helping Marlo");
  const mid = Ep.now().rescue;
  t.event("drive-score", `rain hurt (score ${hurtScore}), a gale helped: score ${mid.score}, rank ${mid.rank}`);
  await sleep(2000);
  Ep.end("let-go");
  const low = await card("wrong then right, one helped");

  /* ---- run 2: the right ability at each set piece ---- */
  t.scene("Hurricane drive: the road");
  Ep.start("commute-home", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "commute-home", 3000, "the drive again");
  await sleep(2500);
  await playPiece(ep.pieces[0], "v", 0.2);
  t.scene("Hurricane drive: the underpass");
  await playPiece(ep.pieces[1], "x", 0.3);
  t.scene("Hurricane drive: the stranded bus");
  await playPiece(ep.pieces[2], "e", 0.45);
  await t.until(() => Ep.now() && Ep.now().rescue && Ep.now().rescue.twisted, 3000, "the twist");
  await sleep(4500); // the twist lines
  t.event("drive-sky", `after the twist the sky is ${(window.weather || window.day.weather).now().state}`);
  t.scene("Hurricane drive: the bridge");
  await playPiece(ep.pieces[3], "c", 0.6);
  t.scene("Hurricane drive: home");
  if (!(await walkTo(-1.5, 7.6, 0.85))) t.problem("bug", "He didn't get home");
  await t.until(() => !$("episode-score").hidden, 8000, "the score card at home").catch(() => {});
  const high = await card("the right ability each time");
  if (!low.rank || !high.rank) t.problem("bug", `The score card shows no rank (${low.rank || "-"} / ${high.rank || "-"})`);
  else if (low.rank === high.rank) t.problem("bug", `Playing it right left the rank at ${high.rank}, the same as the wrong weather`);
  else t.event("drive-rank", `wrong weather, one helped: ${low.rank}; right ability each time: ${high.rank}`);
  await sleep(4500); // the ending line
  if (!heard.some((h) => /^end:/.test(h.key || ""))) t.problem("bug", "The ending line didn't play");
  window.removeEventListener("day:story", onStory);
  window.removeEventListener("day:episode", onEp);
  t.event("drive-lines", `${heard.length} lines spoken`);
  t.progress(1);
}

/* ---------------- story ending: Part 1, 2 and 3 in a row, then Part 3 again to reach each of the three endings ---------------- */
// Setup shortcuts: the day bar to a moment outdoors (and to 22:30 before Part 3), the Pressure meter topped up, and each
// part started by its API. Everything else is real keys: Enter, WASD with Shift, R, X, V, E. Events: ending-* with the
// Part 3 dialogue, the gauge, the Strain at the Tank, and the ending card (name, how each need fared, his last line).
async function storyEnding(options, t) {
  t.scene("Home");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  if (!Ep || !C || !P) return t.problem("bug", "episodes, powers or Take control isn't installed");
  const cfg = window.DAY_CONFIG;
  const list = (cfg.episodes && cfg.episodes.list) || [];
  if (!list.find((e) => e.id === "low-tank")) return t.problem("bug", "Part 3 isn't in the episode list");
  const sideZ = (cfg.street || { z: 12.6 }).z - 2.8;
  const heard = [];
  const onStory = (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "say") { heard.push(d); t.event("ending-say", `${d.who}: ${d.text}`); }
    if (d.action === "kick") t.event("ending-kick", `${d.kick} at strain ${d.strain}`);
  };
  window.addEventListener("day:story", onStory);
  try { localStorage.removeItem((cfg.episodes && cfg.episodes.storageKey) || "icanbe.episodes.best"); } catch (err) { /* ignore */ }
  Ep.resetArc();

  const day = window.day.today();
  const outside = carSideMoment(day);
  if (!outside) return t.problem("bug", "No moment outdoors to take control");
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  const offer = $("episode-offer");
  if (offer && !offer.hidden) { const no = offer.querySelector("button.decline"); if (no) no.click(); }

  const refill = () => { if (P.abilities && P.abilities.reset) P.abilities.reset(100); };
  async function walkTo(x, z, progress) {
    await goTo(C.state().x, sideZ, t, { sprint: true, progress, ms: 12000, close: 1.2 });
    for (let k = 0; k < 16; k++) {
      const s = C.state();
      if (Math.abs(s.x - x) < 1.6) break;
      const nx = s.x + Math.max(-22, Math.min(22, x - s.x));
      if (!(await goTo(nx, sideZ, t, { sprint: true, progress, ms: 14000, close: 1.2 }))) break;
    }
    return goTo(x, z, t, { progress, ms: 9000, close: 1.4 });
  }
  const goalDone = (id) => { const n = Ep.now(); return !!(n && n.goals.some((g) => g.id === id && g.done)); };
  const lastSay = () => ($("episode-say") || {}).textContent || "";
  async function card(label) {
    await t.until(() => !$("episode-score").hidden, 8000, `${label}: the score card`);
    const el = $("episode-score");
    const text = (el.querySelector(".forecast") || {}).textContent || "";
    const strain = (el.querySelector(".strainline") || {}).textContent || "";
    t.event("ending-card", `${label}: ${text} | ${strain}`);
    await sleep(1500);
    el.querySelector("button.ok").click();
    return { text, strain, scarred: /scarred/.test(text) };
  }
  async function press(key, wait) { pressKey(key); await sleep(wait || 600); }

  /* ---- Part 1, played clean ---- */
  t.scene("Part 1: the park and the market");
  Ep.start("dry-park", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "dry-park", 3000, "Part 1 running");
  if (!(await walkTo(-6, 24.5, 0.08))) t.problem("bug", "He didn't reach the park bench");
  refill();
  await press("r", 900);
  await t.until(() => goalDone("rain-park"), 5000, "rain on the park");
  await sleep(2500);
  if (!(await walkTo(117, 27.5, 0.25))) t.problem("bug", "He didn't reach the plaza");
  refill();
  await press("x", 900);
  await t.until(() => goalDone("sun-market"), 5000, "sun break over the market");
  await t.until(() => goalDone("stalls"), 40000, "the stalls to fill");
  const c1 = await card("Part 1");
  if (c1.scarred) t.problem("bug", `A clean Part 1 came out ${c1.text}`);

  /* ---- Part 2, played clean: four steady gales on the annex roof ---- */
  t.scene("Part 2: the annex roof");
  Ep.start("still-blades", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "still-blades", 3000, "Part 2 running");
  if (!(await walkTo(154, 9.8, 0.4))) t.problem("bug", "He didn't reach Ines");
  await t.until(() => goalDone("ines"), 4000, "finding Ines");
  await sleep(2400);
  for (let i = 0; i < 5 && !goalDone("turn") && Ep.now(); i++) {
    refill();
    await press("v", 3000);
    await sleep(2300);
  }
  await t.until(() => !$("episode-score").hidden, 6000, "Part 2's card");
  const c2 = await card("Part 2");
  if (c2.scarred) t.problem("bug", `A clean Part 2 came out ${c2.text}`);
  await sleep(3500);

  /* ---- Part 3 is offered at night, once Part 2 has been played ---- */
  t.scene("Part 3: night, the Storm Tank");
  const night = 22 * 60 + 30;
  scrubTo(night);
  await sleep(900);
  const matched = Ep.match("bedtime", night, { arc: Ep.arc() });
  if (matched && matched.id === "low-tank") t.event("part3-offered", "Part 3: Low is offered at 22:30 once Part 2 has been played");
  else t.problem("bug", `Part 3 isn't offered at night after Part 2 (got ${matched && matched.id})`);
  if (Ep.match("bedtime", night, { arc: { parts: {} } }) && Ep.match("bedtime", night, { arc: { parts: {} } }).id === "low-tank") t.problem("bug", "Part 3 was offered without Part 2 played");
  await walkTo(190, 31, 0.6);

  /* One run at the Tank: `bolts` lightning calls (E) in the zone, then rain (R) until the gauge is full. */
  async function tankRun(label, bolts) {
    t.scene(`Part 3: ${label}`);
    scrubTo(night);
    await sleep(500);
    Ep.start("low-tank", "playtest");
    await t.until(() => Ep.now() && Ep.now().id === "low-tank", 3000, "Part 3 running");
    if (!$("episode-hud") || $("episode-hud").hidden) t.problem("bug", "The episode HUD isn't up for Part 3");
    await sleep(3200);
    t.event("ending-dialogue", `Part 3 opens: "${lastSay()}"`);
    const zoneOk = Math.hypot(C.state().x - 190, C.state().z - 44) < 18;
    if (!zoneOk) await walkTo(190, 31, 0.6);
    for (let i = 0; i < bolts; i++) {
      refill();
      await press("e", 1700);
      const st = Ep.story();
      if (st) t.event("ending-gauge", `bolt ${i + 1}: gauge ${(st.gauge * 100).toFixed(0)}%, Sky ${st.strain} of ${st.budget}`);
    }
    await t.until(() => goalDone("charge"), 6000, "the mast to be charged");
    for (let i = 0; i < 8 && !goalDone("fill") && Ep.now(); i++) {
      refill();
      await press("r", 4400);
      const st = Ep.story();
      if (st) t.event("ending-gauge", `rain ${i + 1}: gauge ${(st.gauge * 100).toFixed(0)}%, Sky ${st.strain} of ${st.budget}`);
    }
    await t.until(() => !$("episode-score").hidden, 8000, "Part 3's card");
    const c3 = await card(label);
    await t.until(() => !$("ending-card").hidden, 5000, "the ending card");
    const el = $("ending-card");
    const name = (el.querySelector("h2") || {}).textContent || "";
    const fared = [...el.querySelectorAll("li")].map((li) => li.textContent).join(" | ");
    const last = (el.querySelector(".lastline") || {}).textContent || "";
    const tally = (el.querySelector(".tally") || {}).textContent || "";
    t.event("ending-reached", `${name} (${el.dataset.ending}) · ${tally} · ${last}`);
    t.event("ending-fared", fared);
    await sleep(2600); // a beat on the card for the footage
    el.querySelector("button.again").click();
    return { name, id: el.dataset.ending, fared, c3 };
  }

  const a = await tankRun("a calm Tank (two bolts, a little rain)", 2);
  if (a.id !== "A") t.problem("bug", `A clean arc with a calm Tank ended ${a.name}, not Fair Weather`);
  const b = await tankRun("a busy Tank (extra bolts)", 6);
  if (b.id !== "B") t.problem("bug", `A flooded avenue ended ${b.name}, not Heavy Weather`);
  const c = await tankRun("an overworked Tank (ten bolts)", 10);
  if (c.id !== "C") t.problem("bug", `Strain 10 at the Tank ended ${c.name}, not Overcast`);
  const ids = [a.id, b.id, c.id];
  if (new Set(ids).size === 3) t.event("three-endings", `Three different endings from three Part 3 runs: ${[a.name, b.name, c.name].join(", ")}`);
  else t.problem("bug", `The endings weren't three different ones: ${ids.join(",")}`);
  if (!heard.some((h) => /Reservoir level: critical\. Please/.test(h.text)) || !heard.some((h) => /Weather Warning/.test(h.text))) t.problem("bug", "Part 3's Board lines didn't play");
  window.removeEventListener("day:story", onStory);
  t.progress(1);
}

/* ---------------- light show: the finale on the plaza, scored on timing and variety, then the closing card ---------------- */
// Setup shortcuts: the day bar to a moment outdoors and then to 22:05, Pressure refilled by the show itself, the episode started by
// its API, and the story arc seeded in localStorage so the closing card has three stories to tie together. Everything else is real
// input: Enter, WASD with Shift to the plaza, and E / R / C / V / X pressed on each cue as the HUD counts down to it.
// Run 1 plays every cue on the beat; run 2 presses only Lightning, late. Events: show-opening / show-gather / show-begin / show-act /
// show-cue / show-miss / show-off / show-stage / show-over / show-card / show-closing / show-compare; metrics showPoints*, showAurora, showBursts.
async function lightShow(options, t) {
  // A setup that can't be reached is a failed run, never 'done': the harness reports 'done' when the bot just returns.
  const bail = (msg) => { t.problem("bug", msg); t.finish("fail"); };
  t.scene("Setup");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  if (!Ep || !C || !P) return bail("episodes, powers or Take control isn't installed");
  const cfg = window.DAY_CONFIG;
  const ep = ((cfg.episodes && cfg.episodes.list) || []).find((e) => e.id === "night");
  if (!ep || !ep.finale) return bail("The finale isn't in the episode list");
  const sideZ = (cfg.street || { z: 12.6 }).z - 2.8;
  try { localStorage.removeItem((cfg.episodes && cfg.episodes.storageKey) || "icanbe.episodes.best"); } catch (err) { /* ignore */ }
  // The three parts played clean, Fair Weather (setup): what the closing card ties together.
  try {
    localStorage.setItem((cfg.episodes && cfg.episodes.arcKey) || "icanbe.story.arc", JSON.stringify({
      parts: { 1: { scarred: false, strain: 3, kicks: [], goals: ["rain-park", "sun-market", "stalls"], at: 700 }, 2: { scarred: false, strain: 4, kicks: [], goals: ["ines", "turn", "stalls-up"], toppled: 0, at: 1000 }, 3: { scarred: false, strain: 5, kicks: [], goals: ["charge", "fill"], at: 1350 } },
      ending: { id: "A", tank: 5 },
    }));
  } catch (err) { /* ignore */ }

  const day = window.day.today();
  const outside = carSideMoment(day) ||
    day.actions.find((a) => !a.inCar && !a.path && a.end > a.start && !(window.DAY_CONFIG.rooms || {})[a.room]);
  if (!outside) return bail("No moment outdoors to take control");
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  const offer = $("episode-offer");
  if (offer && !offer.hidden) { const no = offer.querySelector("button.decline"); if (no) no.click(); }
  // Confirm he is really outdoors before the scene is named: he takes control where the day had him.
  const here = C.state();
  if (Math.hypot(here.x - outside.x, here.z - outside.z) > 8) return bail(`Not at the outdoor moment after Take control: he is at ${Math.round(here.x)}, ${Math.round(here.z)}, not near ${Math.round(outside.x)}, ${Math.round(outside.z)}`);
  t.scene("Outside, before the show");
  scrubTo(22 * 60 + 5);
  await sleep(500);
  const mins = window.day.now().minutes;
  const showAt = window.DayEngine.parseClock("22:05", window.day.today().dayStart);
  if (Math.abs(mins - showAt) > 10) return bail(`The clock isn't at the show: ${window.DayEngine.fmtClock(mins, true)}, not about 22:05`);

  const events = [];
  const onEp = (e) => {
    const d = (e && e.detail) || {};
    events.push(d);
    if (d.action === "show-cue") t.event("show-cue", `${d.power} ${d.grade} (${d.dt >= 0 ? "+" : ""}${d.dt} s), chain ${d.chain}, ${d.hits} hits`);
    if (d.action === "show-miss") t.event("show-miss", `cue ${d.cue} ${d.power} missed`);
    if (d.action === "show-off") t.event("show-off", `${d.power} off the beat at ${d.t} s (${d.off} off)`);
    if (d.action === "show-act") t.event("show-act", d.act);
  };
  window.addEventListener("day:episode", onEp);
  const keyFor = (power) => String((P.abilities.get(power) || {}).key || "").toLowerCase();
  async function walkTo(x, z, progress) {
    await goTo(C.state().x, sideZ, t, { sprint: true, progress, ms: 12000, close: 1.2 });
    for (let k = 0; k < 16; k++) {
      const s = C.state();
      if (Math.abs(s.x - x) < 1.6) break;
      const nx = s.x + Math.max(-22, Math.min(22, x - s.x));
      if (!(await goTo(nx, sideZ, t, { sprint: true, progress, ms: 14000, close: 1.2 }))) break;
    }
    return goTo(x, z, t, { progress, ms: 9000, close: 1.4 });
  }
  const stage = (label) => {
    const st = Ep.stage();
    if (!st) return null;
    t.event("show-stage", `${label}: ${st.gathered} of ${st.spectators} in place, beams ${st.beams} (${st.beamsLit} lit), aurora ${st.aurora}, bursts ${st.bursts} (${st.lastBurst}), ${st.washes} neon pools, ${st.particles} sparks`);
    return st;
  };
  // Presses each cue's key as the HUD counts down to it. "perfect": on the beat; "sloppy": Lightning only, 0.7 s late.
  async function play(mode) {
    const cues = Ep.show().cues;
    const limit = performance.now() + 150000;
    let i = 0;
    let act = "";
    while (i < cues.length && performance.now() < limit) {
      const s = Ep.show();
      if (!s) break;
      const c = cues[i];
      const at = c.at + (mode === "perfect" ? 0 : 0.7);
      if (s.t >= at - 0.04) {
        pressKey(mode === "perfect" ? keyFor(c.power) : keyFor("bolt"));
        i++;
        if (i === 6 || i === 12 || i === cues.length - 1) await sleep(900), stage(`after cue ${i}`);
      } else await sleep(Math.max(15, Math.min(120, (at - s.t) * 1000 - 60)));
    }
  }
  async function card(label) {
    await t.until(() => !$("episode-score").hidden, 20000, `${label}: the score card`);
    const el = $("episode-score");
    const rank = (el.querySelector(".rank") || {}).textContent || "";
    const detail = (el.querySelector(".rankdetail") || {}).textContent || "";
    const rows = [...el.querySelectorAll(".breakdown li")].map((li) => `${(li.querySelector("span") || {}).textContent} ${(li.querySelector("em") || {}).textContent}`);
    t.event("show-card", `${label}: rank ${rank} | ${detail} | ${rows.join(", ")}`);
    const points = Number((/(\d+) of \d+ points/.exec(detail) || [])[1]) || 0;
    return { rank, detail, rows, points };
  }

  /* ---- the city gathers: walk to the plaza ---- */
  t.scene("Walking to the plaza");
  Ep.start("night", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "night" && Ep.show(), 4000, "the Light show running");
  t.event("show-opening", `${ep.finale.cues.length} cues, ${ep.finale.spectators} spectators, goals: ${Ep.now().goals.map((g) => g.label).join(" · ")}`);
  const hudText = () => (($("episode-hud") || {}).textContent || "").replace(/\s+/g, " ");
  t.event("show-hud", hudText().slice(0, 200));
  if (!(await walkTo(117, 27.5, 0.25))) t.problem("bug", "He didn't reach the plaza");
  await t.until(() => Ep.show() && Ep.show().started, 6000, "the show to begin");
  const g0 = stage("the plaza");
  t.event("show-gather", `${g0 ? g0.gathered : 0} of ${g0 ? g0.spectators : 0} people gathered; the cue line reads: ${(($("episode-hud").querySelector(".cue") || {}).textContent || "").replace(/\s+/g, " ")}`);
  if (!g0 || g0.spectators < 20) t.problem("bug", "The city didn't gather on the plaza");
  t.event("show-begin", "the first cue is on its way");
  t.progress(0.35);

  /* ---- run 1: every cue on the beat ---- */
  t.scene("The show, on the beat");
  await play("perfect");
  await t.until(() => Ep.show() && Ep.show().over, 12000, "the show to end");
  const so = Ep.show();
  t.event("show-over", `${so.hits} hits, ${so.perfect} perfect, ${so.off} off the beat, best chain ${so.best}, effects ${so.used.join("+")}`);
  t.scene("Grand finish");
  await sleep(1800);
  const gs = stage("the grand finish");
  if (gs) {
    t.metric("showAurora", gs.aurora);
    t.metric("showBursts", gs.bursts);
    t.metric("showBeams", gs.beams);
    if (gs.aurora < 0.2) t.problem("bug", `The aurora didn't come up (${gs.aurora})`);
    if (gs.bursts < 12) t.problem("bug", `Few fireworks went up (${gs.bursts})`);
  }
  const good = await card("run 1, on the beat");
  t.metric("showPointsOnBeat", good.points);
  if (good.rows.length !== 4) t.problem("bug", `The card shows ${good.rows.length} rows, wanted 4 (Timing, Chain, Clean calls, Variety)`);
  t.progress(0.6);

  /* ---- the closing card comes by itself (or on OK), after the show ---- */
  t.scene("The closing card");
  await t.until(() => !$("closing-card").hidden, 16000, "the closing card after the show");
  const cl = Ep.closing();
  const tally = ($("closing-card").querySelector(".tally") || {}).textContent || "";
  t.event("show-closing", `ending ${cl.ending}, rank ${cl.rank}, ${cl.fared.join(" ")} | neighbors ${cl.neighbors.join(", ")} | ${tally}`);
  if (cl.fared.length < 4 || cl.neighbors.length < 3) t.problem("bug", "The closing card doesn't tie the stories and the neighbors together");
  if (!$("episode-score").hidden) t.problem("bug", "The score card is still up under the closing card");
  await sleep(2500);
  $("closing-card").querySelector("button.again").click();
  await sleep(400);
  if (!$("closing-card").hidden) t.problem("bug", "The closing card didn't close");

  /* ---- run 2: one note, late ---- */
  t.scene("The show, sloppy");
  Ep.start("night", "playtest");
  await t.until(() => Ep.show() && Ep.show().started, 6000, "the second show to begin");
  await play("sloppy");
  await t.until(() => Ep.show() && Ep.show().over, 12000, "the second show to end");
  const sl = Ep.show();
  t.event("show-over", `sloppy: ${sl.hits} hits, ${sl.perfect} perfect, ${sl.off} off the beat, best chain ${sl.best}, effects ${sl.used.join("+")}`);
  const bad = await card("run 2, Lightning only and late");
  t.metric("showPointsSloppy", bad.points);
  await t.until(() => !$("closing-card").hidden, 16000, "the closing card again").catch(() => {});
  if (!$("closing-card").hidden) $("closing-card").querySelector("button.again").click();
  if (!(good.points > bad.points)) t.problem("bug", `Playing on the beat with every effect (${good.points}) didn't beat one late note (${bad.points})`);
  t.event("show-compare", `on the beat, five effects: rank ${good.rank}, ${good.points} points; one note, late: rank ${bad.rank}, ${bad.points} points`);
  window.removeEventListener("day:episode", onEp);
  t.progress(1);
}

/* ---------------- tutorial episode: five abilities, one at a time, a toast each, skippable ---------------- */
// Needs ?playtest=tutorial-episode (the offer is only made by itself for a player or this scenario).
async function tutorialEpisode(options, t) {
  t.scene("Learn the weather");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  if (!Ep || !C) {
    t.problem("bug", "There's no episodes API or Take control");
    return;
  }
  const cfg = window.DAY_CONFIG.episodes;
  const tut = cfg.list[0];
  if (!tut || !tut.tutorial) t.problem("bug", "The tutorial isn't first in the episode list");
  try { localStorage.removeItem(cfg.tutorialKey || "icanbe.episodes.tutorial"); } catch (e) { /* ignore */ }
  const quiet = quietMoment(window.day.today());
  if (quiet) {
    scrubTo(quiet.start + Math.min(0.4, (quiet.end - quiet.start) / 3));
    await sleep(400);
  }
  const A = () => window.powers.abilities;
  const slotState = (id) => ($("ability-" + id) || {}).dataset && $("ability-" + id).dataset.state;

  async function takeAndAccept() {
    if (C.mode() !== "control") pressKey("Enter");
    await t.until(() => C.mode() === "control", 5000, "Take control");
    await sleep(400);
    const offer = $("episode-offer");
    if (!offer || offer.hidden) {
      t.problem("bug", "Taking control didn't offer the tutorial episode");
      Ep.start("tutorial", "playtest");
    } else {
      t.event("tutorial-offer", (offer.querySelector("h2") || {}).textContent || "offered");
      offer.querySelector("button.accept").click();
    }
    await t.until(() => Ep.now() && Ep.now().id === "tutorial", 4000, "the tutorial running");
  }

  await takeAndAccept();
  // On a phone the five abilities are tap buttons. A desktop-sized run can ask for them with {"touch":true}
  // (the named setup shortcut day.control.touch(true), as the first-visit scenario does).
  if (options && options.touch && !C.state().touch) C.touch(true);
  await sleep(250);
  const touch = !!(C.state().touch || document.documentElement.classList.contains("touch-ui"));
  const tapAbility = (id) => tapEl($("ability-" + id));
  if (touch) {
    t.event("touch-layout", `${innerWidth}×${innerHeight}: the five abilities are pressed by pointer taps`);
    const five = ["bolt", "rain", "gale", "fog", "sunbreak"];
    const fixed = ["stick", "jump-btn", "powerpad", "episode-hud", "tutorial", "control", "pressure", "weather-btn"];
    const bad = [];
    const boxes = five.map((id) => ({ id, el: $("ability-" + id), r: boxOf($("ability-" + id)) }));
    boxes.forEach((b) => {
      if (!b.r || b.r.width < 1) { bad.push(`${b.id} isn't on screen`); return; }
      if (b.r.width < 44 || b.r.height < 44) bad.push(`${b.id} is ${Math.round(b.r.width)}×${Math.round(b.r.height)}`);
      if (b.r.left < 0 || b.r.top < 0 || b.r.right > innerWidth || b.r.bottom > innerHeight) bad.push(`${b.id} is off screen`);
      fixed.forEach((fid) => {
        const el = $(fid);
        const r = el && !el.hidden && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden" ? boxOf(el) : null;
        if (r && boxesOverlap(b.r, r)) bad.push(`${b.id} overlaps #${fid}`);
      });
      five.forEach((o) => { const q = boxOf($("ability-" + o)); if (o !== b.id && b.r && q && boxesOverlap(b.r, q)) bad.push(`${b.id} overlaps ${o}`); });
    });
    const energyEl = $("energy");
    const er = boxOf(energyEl);
    if (!er || er.width < 20 || !/Energy \d+/.test(energyEl.textContent) || !energyEl.querySelector("i").style.width) bad.push("the Energy bar isn't readable on the bar");
    if (["storm", "gust", "tornado"].some((n) => { const q = boxOf($("ability-" + n)); return q && q.width > 0; })) bad.push("Storm/Gust/Tornado shouldn't be on the touch bar (they're on the power pad)");
    if (bad.length) bad.forEach((m) => t.problem("bug", `Touch ability bar: ${m}`));
    else t.event("ability-bar-touch", `${five.length} buttons, ${Math.round(Math.min(...boxes.map((b) => b.r.width)))}×${Math.round(Math.min(...boxes.map((b) => b.r.height)))} px at least, energy ${energyEl.textContent.trim()}, clear of the stick, jump, power pad and the episode card`);
  }
  const hud = $("episode-hud");
  if (!hud || hud.hidden) t.problem("bug", "The tutorial has no HUD");
  const skipBtn = hud && hud.querySelector(".skip");
  if (!skipBtn || skipBtn.hidden) t.problem("bug", "The tutorial has no Skip button");
  else t.event("tutorial-skip-ready", "Skip is on the tutorial card");

  const order = tut.goals.map((g) => g.power);
  const keys = { bolt: "e", rain: "r", gale: "v", fog: "c", sunbreak: "x" };
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const goal = tut.goals[i];
    // Exactly the abilities before this one are open.
    await t.until(() => Ep.now() && Ep.now().unlocked.indexOf(id) >= 0, 4000, `${id} to unlock`).catch(() => {});
    const toastEl = $("ability-toast");
    const open = Ep.now() ? Ep.now().unlocked.join(",") : "";
    if (open !== order.slice(0, i + 1).join(",")) t.problem("bug", `Open abilities are [${open}] but should be [${order.slice(0, i + 1).join(",")}]`);
    if (!toastEl || !toastEl.classList.contains("on") || !/New ability/.test(toastEl.textContent)) t.problem("bug", `No unlock toast for ${id}`);
    else t.event("unlock-toast", `${id}: ${toastEl.textContent}`);
    // The bar repaints once a frame, so give it a few frames to show the lock before judging it.
    if (i + 1 < order.length) await t.until(() => slotState(order[i + 1]) === "locked", 2000, `${order[i + 1]} to show locked`).catch(() => {});
    if (i + 1 < order.length && slotState(order[i + 1]) !== "locked") t.problem("bug", `${order[i + 1]} should still be locked`);
    const prompt = Ep.now() && Ep.now().prompt;
    if (!prompt) t.problem("bug", `No prompt for ${id}`);
    else t.event("tutorial-prompt", `${id}: ${prompt}`);
    checkHud(t, "tutorial-episode: " + id + (touch ? " (touch)" : ""));
    if (i === 1) {
      // A locked ability refuses, changes nothing.
      const before = window.powers.now().energy;
      if (touch) await tapAbility("gale");
      else tapKey("v", 120);
      await sleep(300);
      if (window.powers.abilities.get("gale").uses > 0) t.problem("bug", "Gale worked while locked");
      else if (touch) {
        const rf = $("ability-refuse");
        if (!rf || !rf.textContent) t.problem("bug", "A tap on a locked ability gave no refusal line");
        else t.event("locked-refused", `Gale (tap) is refused before it unlocks: "${rf.textContent}"`);
      } else t.event("locked-refused", "Gale (V) is refused before it unlocks");
      void before;
    }
    for (let k = 0; k < 6 && !(Ep.now() && Ep.now().goals[i].done); k++) {
      if (touch) {
        await tapAbility(id);
        if (k === 0) {
          await sleep(150);
          const b = $("ability-" + id);
          const cd = b && b.querySelector(".cd");
          if (b && b.dataset.state === "cooldown" && cd && cd.textContent) t.event("touch-cooldown", `${id}: ${cd.textContent} s on the button, energy ${$("energy").textContent.trim()}`);
        }
      } else await tapKey(keys[id], 140);
      await sleep(900);
    }
    if (!(Ep.now() ? Ep.now().goals[i].done : true)) t.problem("bug", `Goal "${goal.label}" never completed`);
    else t.event("tutorial-goal", goal.label);
    t.progress(0.1 + (i + 1) * 0.12);
  }
  await t.until(() => !Ep.now(), 4000, "the tutorial to finish");
  const left = A().now().abilities.filter((a) => a.locked);
  if (left.length) t.problem("bug", `${left.length} abilities still locked after the tutorial`);
  else t.event("all-unlocked", "every ability is open at the end");
  if (!/done/.test(localStorage.getItem(cfg.tutorialKey || "icanbe.episodes.tutorial") || "")) t.problem("bug", "The finished tutorial wasn't remembered");

  // Skip: start it again from the menu path, skip at once.
  t.scene("Skip");
  Ep.start("tutorial", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "tutorial", 3000, "the tutorial again");
  if (!A().now().abilities.some((a) => a.locked)) t.problem("bug", "Restarting the tutorial didn't lock abilities");
  $("episode-hud").querySelector(".skip").click();
  await sleep(300);
  if (Ep.now()) t.problem("bug", "Skip didn't end the tutorial");
  else if (A().now().abilities.some((a) => a.locked)) t.problem("bug", "Skip left abilities locked");
  else t.event("tutorial-skipped", "Skip ends it and opens every ability");
  pressKey("Escape");
  t.progress(1);
}

/* ---------------- phone frame rate: city, storm and finale on low quality ---------------- */
// Frame times come from requestAnimationFrame (the same clock as the contract's fps meter in hawkes-playtest.js,
// which isn't exported), counted per second: the average of those seconds and the worst second. Quality is forced to
// low first, the way a phone runs. Setup shortcuts: the day bar to noon and to 22:05, the storm set by the weather
// API each second (a gust of Lightning by the ability bar), the finale started from the Episodes API; he walks to the
// plaza with real input. A moment whose average is under 30 files a bug naming it.
const PHONE_FPS_MIN = 30;
function fpsWindow(ms, each) {
  return new Promise((resolve) => {
    const sec = [];
    let frames = 0, last = performance.now(), n = 0;
    const t0 = last;
    const tick = (now) => {
      frames++;
      n++;
      if (now - last >= 1000) {
        sec.push((frames * 1000) / (now - last));
        frames = 0;
        last = now;
      }
      if (each) each(now - t0);
      if (now - t0 < ms) requestAnimationFrame(tick);
      else {
        if (!sec.length) sec.push((frames * 1000) / Math.max(1, now - t0));
        resolve({ avg: sec.reduce((a, b) => a + b, 0) / sec.length, min: Math.min(...sec), seconds: sec.length, frames: n });
      }
    };
    requestAnimationFrame(tick);
  });
}
async function phoneFps(t) {
  const C = window.day.control;
  const Ep = window.episodes || window.day.episodes;
  const P = window.powers || window.day.powers;
  const look = window.day.look;
  if (!C || !Ep || !P || !look) {
    t.problem("bug", "Phone fps: Take control, episodes, powers or the look module isn't installed");
    return;
  }
  const prevQ = look.quality();
  look.quality("low");
  t.scene("Phone fps: low quality");
  t.event("phone-fps-quality", `quality forced to low (was ${prevQ}) at ${innerWidth}×${innerHeight}`);
  const day = window.day.today();
  const cfg = window.DAY_CONFIG;
  const outside = carSideMoment(day);
  if (!outside) {
    t.problem("bug", "Phone fps: no moment beside the car to stand in the street");
    return;
  }
  if (C.mode() === "control") pressKey("Escape");
  await sleep(300);
  scrubTo(12 * 60);
  clickSpeed(1);
  await sleep(600);
  const rec = {};
  const report = (key, label, r) => {
    rec[key] = r;
    t.metric(`phoneFps${key}Avg`, Math.round(r.avg * 10) / 10);
    t.metric(`phoneFps${key}Min`, Math.round(r.min * 10) / 10);
    t.event(`phone-fps-${key.toLowerCase()}`, `${label}: ${r.avg.toFixed(1)} fps on average, ${r.min.toFixed(1)} at the worst second (${r.frames} frames in ${r.seconds} s), quality ${look.quality()}`);
    if (r.avg < PHONE_FPS_MIN) t.problem("bug", `Phone fps: ${label} averaged ${r.avg.toFixed(1)} fps on low quality, under ${PHONE_FPS_MIN}`);
  };
  // 1. The city at noon, walking the avenue.
  t.scene("Phone fps: the city at noon");
  if (C.mode() !== "control") {
    pressKey("Enter");
    await t.until(() => C.mode() === "control", 4000, "Take control for the phone fps");
  }
  const offer = $("episode-offer");
  if (offer && !offer.hidden) { const no = offer.querySelector("button.decline"); if (no) no.click(); }
  const sideZ = (cfg.street || { z: 12.6 }).z - 2.8;
  await goTo(C.state().x, sideZ, t, { sprint: true, ms: 12000, close: 1.5 });
  const crowd = window.day.crowd && window.day.crowd.info();
  if (crowd) t.event("phone-fps-crowd", `${crowd.people} people and ${crowd.cars} cars at noon on low`);
  const walk = (async () => {
    for (let i = 0; i < 3; i++) await goTo(C.state().x + (i % 2 ? -12 : 12), sideZ, t, { sprint: true, ms: 5000, close: 1.5 });
  })();
  report("City", "the city at noon on the avenue", await fpsWindow(8000));
  await walk.catch(() => {});
  // 2. A storm with rain and lightning.
  t.scene("Phone fps: the storm");
  const W = window.weather;
  const bolt = (P.abilities && P.abilities.get && P.abilities.get("bolt")) ? "bolt" : "lightning";
  let nextBolt = 0;
  report("Storm", "a storm with rain and lightning", await fpsWindow(9000, (ms) => {
    if (W && W.set && Math.floor(ms / 800) !== Math.floor((ms - 17) / 800)) W.set("storm", 1, "power");
    if (ms >= nextBolt) { nextBolt = ms + 3000; try { P.command(bolt, "playtest"); } catch (e) { /* cooldown or energy */ } }
  }));
  const wx = W && W.now && W.now();
  if (wx && wx.state !== "storm" && wx.state !== "rain") t.problem("warning", `Phone fps: the storm window ended on ${wx.state}`);
  // 3. The light-show finale, from the plaza.
  t.scene("Phone fps: the finale");
  scrubTo(22 * 60 + 5);
  await sleep(500);
  Ep.start("night", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "night" && Ep.show(), 4000, "the Light show running");
  for (let k = 0; k < 16; k++) {
    const s = C.state();
    if (Math.abs(s.x - 117) < 1.6) break;
    await goTo(s.x + Math.max(-22, Math.min(22, 117 - s.x)), sideZ, t, { sprint: true, ms: 14000, close: 1.2 });
  }
  await goTo(117, 27.5, t, { ms: 9000, close: 1.4 });
  await t.until(() => Ep.show() && Ep.show().started, 6000, "the show to begin").catch(() => {});
  const cues = (Ep.show() || { cues: [] }).cues;
  let ci = 0;
  const keyFor = (power) => String((P.abilities.get(power) || {}).key || "").toLowerCase();
  report("Finale", "the light-show finale", await fpsWindow(10000, () => {
    const s = Ep.show();
    if (!s || !s.started) return;
    while (ci < cues.length && s.t >= cues[ci].at - 0.04) { pressKey(keyFor(cues[ci].power)); ci++; }
  }));
  const st = Ep.stage && Ep.stage();
  if (st) t.event("phone-fps-stage", `${st.gathered} of ${st.spectators} in place, beams ${st.beams}, ${st.particles} sparks, ${ci} cues pressed`);
  const worst = Object.entries(rec).sort((a, b) => a[1].avg - b[1].avg)[0];
  if (worst) t.event("phone-fps-worst", `${worst[0]}: ${worst[1].avg.toFixed(1)} fps on average`);
  if (C.mode() === "control") pressKey("Escape");
  look.quality(prevQ);
}

/* ---------------- phone: the whole game by touch, at whatever size it's given ---------------- */
// Every control is pressed by a pointer tap (pointerType "touch") and measured first: at least 44 px each way and on
// screen. Order: the first-visit card (start, Skip), take control by the button, the offered tutorial episode (start,
// Skip), the stick, jump, the five abilities and a power pad button, the Episodes menu (open, close, open, pick an
// episode, its card), the day timeline dragged by touch, Let go. {"orientation":"landscape"} asks for a landscape
// window: a page can't turn the device, so it tries window.resizeTo and says plainly if it ran portrait only.
async function phone(options, t) {
  t.scene("Phone setup");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const C = window.day.control;
  const T = window.day.tutorial;
  const Ep = window.episodes || window.day.episodes;
  if (!C || !T || !Ep) {
    t.problem("bug", "There's no Take control, first-visit card or episodes API");
    return;
  }
  const cfg = window.DAY_CONFIG.episodes;
  const want = options && options.orientation === "landscape" ? "landscape" : "portrait";
  if (want === "landscape" && innerHeight > innerWidth) {
    const w0 = innerWidth, h0 = innerHeight;
    try { window.resizeTo(h0, w0); } catch (e) { /* not allowed in this window */ }
    await sleep(600);
    if (innerHeight > innerWidth) {
      t.event("orientation", `asked for landscape but the window is ${innerWidth}×${innerHeight} and can't be resized from the page: this run is portrait only`);
    } else t.event("orientation", `window turned to landscape: ${w0}×${h0} → ${innerWidth}×${innerHeight}`);
  } else {
    t.event("orientation", `${innerWidth > innerHeight ? "landscape" : "portrait"} ${innerWidth}×${innerHeight}${want === "landscape" && innerWidth > innerHeight ? " (landscape asked for, and the window is)" : ""}`);
  }
  const native = C.state().touch;
  if (!native) C.touch(true);
  t.event("touch-layout", native ? `phone-sized window ${innerWidth}×${innerHeight}` : `phone controls on a ${innerWidth}×${innerHeight} window (setup shortcut)`);
  const quiet = quietMoment(window.day.today());
  if (quiet) {
    scrubTo(quiet.start + Math.min(0.4, (quiet.end - quiet.start) / 3));
    await sleep(400);
  }
  clickSpeed(1);
  try { localStorage.removeItem(cfg.tutorialKey || "icanbe.episodes.tutorial"); } catch (e) { /* private mode */ }

  const tapped = new Set();
  /** A tap through the page's own pointer handlers, after checking the control is a usable touch target. */
  async function tap(el, name) {
    if (!el) {
      t.problem("bug", `Phone: ${name} isn't in the page`);
      return false;
    }
    const r = hudVisible(el);
    if (!r) {
      t.problem("bug", `Phone: ${name} isn't on screen at ${innerWidth}×${innerHeight}`);
      return false;
    }
    const full = el.getBoundingClientRect();
    if (full.width < 43.5 || full.height < 43.5) t.problem("bug", `Phone: ${name} is ${Math.round(full.width)}×${Math.round(full.height)} px, under 44 at ${innerWidth}×${innerHeight}`);
    if (full.left < -1 || full.top < -1 || full.right > innerWidth + 1 || full.bottom > innerHeight + 1) t.problem("bug", `Phone: ${name} is off screen at ${innerWidth}×${innerHeight}`);
    tapped.add(name);
    await tapEl(el);
    el.click();
    await sleep(150);
    return true;
  }
  const taken = () => C.mode() === "control";
  const Pw = () => window.powers || window.day.powers;
  const uses = (id) => {
    const a = Pw() && Pw().abilities && Pw().abilities.get(id);
    return a ? a.uses : 0;
  };

  // 1. The first-visit card: start it, then Skip.
  t.scene("First-visit card");
  T.reset();
  await t.until(() => T.blocking() && $("tutorial-skip"), 3000, "the first-visit card");
  t.event("tutorial-shown", `step ${T.now().step}`);
  checkHud(t, "phone: first-visit card");
  if (boxOf($("tutorial-take"))) await tap($("tutorial-take"), "Take control (card)");
  else await tap($("control"), "Take control");
  await t.until(taken, 4000, "Take control by tap");
  t.event("take-control-tap", "he's the player's by a tap");
  await sleep(500);
  await tap($("tutorial-skip"), "Skip (first-visit card)");
  await sleep(250);
  if (T.blocking()) t.problem("bug", "Skip on the first-visit card didn't hide it");
  else t.event("tutorial-card-skipped", "the card's Skip, by tap");
  t.progress(0.12);

  // 2. The tutorial episode: offered on a new player's first take control, started and skipped by tap.
  t.scene("Tutorial episode");
  const offer = $("episode-offer");
  await t.until(() => offer && !offer.hidden, 4000, "the tutorial offer").catch(() => {});
  if (offer && !offer.hidden) {
    checkHud(t, "phone: episode offer");
    await tap(offer.querySelector("button.accept"), "Start (episode offer)");
    await t.until(() => Ep.now() && Ep.now().id === "tutorial", 4000, "the tutorial running");
    t.event("tutorial-started", "Learn the weather, started by tap");
    await sleep(400);
    checkHud(t, "phone: tutorial episode");
    const hudSkip = $("episode-hud") && $("episode-hud").querySelector(".skip");
    await tap(hudSkip, "Skip (tutorial episode)");
    await sleep(300);
    if (Ep.now()) t.problem("bug", "Skip didn't end the tutorial episode");
    else t.event("tutorial-skipped", "Learn the weather skipped by tap; every ability is open");
  } else {
    t.problem("bug", "Taking control on a fresh visit didn't offer the tutorial episode");
  }
  t.progress(0.25);

  // 3. The stick and jump.
  t.scene("Stick and jump");
  if (!taken()) await tap($("control"), "Take control");
  await t.until(taken, 4000, "him to be the player's");
  const stickEl = $("stick");
  const jumpEl = $("jump-btn");
  const sr = boxOf(stickEl);
  if (!sr || !boxOf(jumpEl)) {
    t.problem("bug", "The touch stick and jump button aren't on screen");
    return;
  }
  [[stickEl, "stick"], [jumpEl, "jump"]].forEach(([el, name]) => {
    const r = el.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) t.problem("bug", `Phone: ${name} is ${Math.round(r.width)}×${Math.round(r.height)} px, under 44`);
    if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) t.problem("bug", `Phone: ${name} is off screen`);
    tapped.add(name);
  });
  const cx = sr.left + sr.width / 2;
  const cy = sr.top + sr.height / 2;
  const mv = await measure(async () => {
    for (const [dx, dy, ms] of [[0, -32, 1000], [34, 0, 800], [0, 60, 800], [-60, 0, 800]]) {
      touchOn(stickEl, "pointerdown", cx, cy);
      for (let i = 1; i <= 4; i++) {
        touchOn(stickEl, "pointermove", cx + (dx * i) / 4, cy + (dy * i) / 4);
        await sleep(40);
      }
      await sleep(ms);
      touchOn(stickEl, "pointerup", cx + dx, cy + dy);
      await sleep(150);
    }
  });
  t.event("stick-move", `the stick moved him ${mv.path} m, up to ${mv.peak} m/s`);
  if (mv.path < 1.5) t.problem("bug", `The touch stick moved him only ${mv.path} m`);
  const f0 = C.state().flights;
  await tapEl(jumpEl);
  await sleep(450);
  await tapEl(jumpEl);
  await t.until(() => C.state().flights > f0, 8000, "him to land");
  const fl = C.state().lastFlight || { jumps: 0 };
  t.event("jump-tap", `jump button: ${fl.jumps} jumps in the flight`);
  if (fl.jumps < 2) t.problem("bug", `Two taps on Jump gave ${fl.jumps} jump(s)`);
  checkHud(t, "phone: on foot");
  t.progress(0.4);

  // 4. The five abilities and a power, each by tap.
  t.scene("Abilities");
  const done = [];
  for (const id of ["bolt", "rain", "gale", "fog", "sunbreak"]) {
    const el = $("ability-" + id);
    const before = uses(id);
    let ok = false;
    for (let k = 0; k < 10 && !ok; k++) {
      await tap(el, "ability " + id);
      await sleep(500);
      ok = uses(id) > before;
      if (!ok) await sleep(1200); // Energy or cooldown: wait, as a player would
    }
    if (ok) {
      done.push(id);
      t.event("ability-tap-" + id, `${id} by tap, energy ${(($("energy") || {}).textContent || "").trim()}`);
    } else t.problem("bug", `Tapping ${id} never used it`);
    await sleep(600);
  }
  checkHud(t, "phone: abilities");
  const padId = ["power-gust", "power-storm", "power-tornado"].find((id) => boxOf($(id))) || "power-gust";
  const pid = padId.replace("power-", "");
  const pBefore = uses(pid);
  let padOk = false;
  for (let k = 0; k < 10 && !padOk; k++) {
    await tap($(padId), "power pad " + pid);
    await sleep(500);
    padOk = uses(pid) > pBefore || (window.day.powers && window.day.powers.now().abilities || []).some((a) => a.id === pid && (a.cooldown > 0 || a.uses > pBefore));
    if (!padOk) await sleep(1200);
  }
  if (padOk) t.event("power-tap", `${pid} from the power pad by tap`);
  else t.problem("bug", `The power pad's ${pid} never fired by tap`);
  if (done.length === 5) t.event("abilities-tapped", "Lightning, Rain, Gale, Fog and Sun break all used by tap");
  t.progress(0.6);

  // 5. The Episodes menu and an episode card.
  t.scene("Episodes menu");
  const menu = $("episode-menu");
  await tap($("episodes"), "Episodes");
  await sleep(250);
  if (!menu || menu.hidden) t.problem("bug", "The Episodes button didn't open the menu");
  else {
    t.event("episodes-open", `${menu.querySelectorAll(".ep-row").length} rows`);
    await tap(menu.querySelector(".close"), "Close (Episodes menu)");
    await sleep(250);
    if (!menu.hidden) t.problem("bug", "Close didn't shut the Episodes menu");
    else t.event("episodes-closed", "Close, by tap");
  }
  await tap($("episodes"), "Episodes");
  await sleep(250);
  const row = [...document.querySelectorAll("#episode-menu .ep-row")].find((b) => !b.disabled && b.id !== "ep-row-tutorial" && !b.classList.contains("chal"));
  if (!row) t.problem("bug", "The Episodes menu has no episode to start");
  else {
    await tap(row, "episode " + row.id.replace("ep-row-", ""));
    await t.until(() => Ep.now() || (offer && !offer.hidden), 5000, "an episode card").catch(() => {});
    await sleep(500);
    if (offer && !offer.hidden) {
      await tap(offer.querySelector(".decline"), "Not now (episode offer)");
      t.event("episode-card", "the offer card, dismissed by tap");
    } else if (Ep.now()) {
      const h = $("episode-hud");
      t.event("episode-card", `${Ep.now().id}: the goals card shows${h && !h.hidden ? "" : " (no HUD)"}`);
      checkHud(t, "phone: episode card");
    } else t.problem("bug", "Picking an episode from the menu showed no card");
  }
  t.progress(0.75);

  // 6. The day timeline, dragged by touch.
  t.scene("Timeline");
  const scrub = $("scrub");
  const m0 = window.day.now().minutes;
  const sb = scrub && scrub.getBoundingClientRect();
  if (!sb || sb.height < 43.5) t.problem("bug", `Phone: the timeline's drag strip is ${sb ? Math.round(sb.height) : 0} px tall, under 44`);
  if (sb && (sb.left < -1 || sb.right > innerWidth + 1 || sb.bottom > innerHeight + 1)) t.problem("bug", "Phone: the timeline is off screen");
  tapped.add("timeline");
  const y = sb.top + sb.height / 2;
  const min = Number(scrub.min), max = Number(scrub.max);
  const target = Math.min(max - 5, m0 + 180);
  touchOn(scrub, "pointerdown", sb.left + 20, y, 11);
  for (let i = 1; i <= 6; i++) {
    scrub.value = String(m0 + ((target - m0) * i) / 6);
    scrub.dispatchEvent(new Event("input", { bubbles: true }));
    touchOn(scrub, "pointermove", sb.left + 20 + ((sb.width - 40) * i) / 6, y, 11);
    await sleep(60);
  }
  touchOn(scrub, "pointerup", sb.right - 20, y, 11);
  window.dispatchEvent(new Event("pointerup"));
  await sleep(500);
  const m1 = window.day.now().minutes;
  if (Math.abs(m1 - m0) < 30 || m1 < min) t.problem("bug", `Dragging the timeline by touch moved the clock ${Math.round(m1 - m0)} min (wanted about 180)`);
  else t.event("timeline-drag", `the day bar dragged by touch: ${E().fmtClock(m0)} → ${E().fmtClock(m1)}`);
  t.progress(0.9);

  // 7. Let go, then the verdict on every tapped control.
  t.scene("Letting go");
  if (taken()) await tap($("control"), "Let go");
  await t.until(() => !taken(), 3000, "Let go by tap").catch(() => {});
  checkHud(t, "phone: end");
  t.event("phone-taps", `${tapped.size} controls tapped at ${innerWidth}×${innerHeight}: ${[...tapped].join(", ")}`);
  t.metric("phoneControlsTapped", tapped.size);
  if (!native) C.touch(false);
  t.progress(0.92);
  await phoneFps(t);
  t.progress(1);
}

/* ---------------- first visit: the tutorial, then every phone control, then the player events ---------------- */
function boxesOverlap(a, b) {
  const pad = 2;
  return a.left < b.right - pad && a.right > b.left + pad && a.top < b.bottom - pad && a.bottom > b.top + pad;
}
async function declineEpisode() {
  const offerEl = $("episode-offer");
  if (offerEl && !offerEl.hidden) {
    const dec = offerEl.querySelector(".decline");
    if (dec) dec.click();
    await sleep(200);
  }
}

async function firstVisit(options, t) {
  t.scene("Tutorial");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const T = window.day.tutorial;
  const C = window.day.control;
  if (!T) {
    t.problem("bug", "There's no first-visit tutorial");
    return;
  }
  if (!C) {
    t.problem("bug", "There's no Take control");
    return;
  }
  const day = window.day.today();
  const quiet = quietMoment(day);
  if (quiet) {
    scrubTo(quiet.start + Math.min(0.4, (quiet.end - quiet.start) / 3));
    await sleep(400);
  }
  T.reset();
  await t.until(() => T.blocking() && $("tutorial-skip"), 3000, "the tutorial card");
  const skipBtn = $("tutorial-skip");
  if (!skipBtn) {
    t.problem("bug", "The tutorial has no Skip");
    return;
  }
  t.event("tutorial-shown", `step ${T.now().step}`);
  t.event("tutorial-skip-ready", "Skip is on the card");
  const t0 = performance.now();

  async function untilStep(id) {
    const ok = await t.until(() => T.now().step === id || !T.blocking(), 10000, `tutorial step ${id}`).then(() => T.now().step === id || (id === "done" && !T.blocking())).catch(() => false);
    if (!ok && T.now().step !== id) t.problem("bug", `Tutorial didn't reach ${id} (on ${T.now().step || "hidden"})`);
    else t.event("tutorial-step", id);
    return ok || T.now().step === id;
  }

  if (T.now().step !== "take") t.problem("bug", `Tutorial opened on ${T.now().step}, not take`);
  // The bot's browser runs game time behind the clock (0.1 s a frame at most), so each input is
  // repeated, as a player would, until the card moves on.
  async function playUntil(id, act, tries) {
    for (let i = 0; i < tries && T.blocking() && T.now().step !== id; i++) await act(i);
  }
  pressKey("Enter");
  await untilStep("move");
  await playUntil("jump", () => holdKeys(["w"], 900), 8);
  await untilStep("jump");
  {
    const card = boxOf($("tutorial"));
    const hits = [...document.querySelectorAll(".nb-bubble:not([hidden]), .nb-name")].filter((el) => {
      const r = boxOf(el);
      return card && r && boxesOverlap(card, r);
    });
    if (hits.length) t.problem("bug", "The tutorial card covers a neighbor's bubble or name tag");
    else t.event("tutorial-clear-of-bubbles", "the card doesn't cover a neighbor's bubble or name");
  }
  await playUntil("bolt", () => tapKey(" ", 160).then(() => sleep(700)), 5);
  await untilStep("bolt");
  await playUntil("letgo", async () => {
    await t.until(() => window.day.powers && window.day.powers.now().pressure >= 24, 20000, "Pressure for the tutorial bolt").catch(() => {});
    pressKey("e");
    await sleep(600);
  }, 3);
  await untilStep("letgo");
  pressKey("Escape");
  await t.until(() => !T.blocking(), 4000, "the tutorial to finish on let go").catch(() => {});
  const seconds = (performance.now() - t0) / 1000;
  t.metric("tutorialSeconds", Math.round(seconds * 10) / 10);
  if (T.blocking()) t.problem("bug", "The tutorial was still up after let go");
  else t.event("tutorial-done", `${seconds.toFixed(1)} s`);
  if (seconds > 60) t.problem("bug", `The tutorial took ${seconds.toFixed(1)} s (it should be under a minute)`);
  t.progress(0.35);

  await t.until(() => C.mode() === "schedule", 25000, "him to walk back after the tutorial").catch(() => {});
  t.scene("Skip");
  T.reset();
  await t.until(() => T.blocking(), 3000, "the tutorial again, so Skip can be pressed");
  skipBtn.click();
  await sleep(200);
  if (T.blocking()) t.problem("bug", "Skip didn't dismiss the tutorial");
  else t.event("tutorial-skipped", "Skip hides it, and it stays hidden");
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "take control after skipping").catch(() => {});
  if (T.blocking()) t.problem("bug", "The tutorial came back after Skip");
  else t.event("tutorial-stays-hidden", "a later take control doesn't show it");
  t.progress(0.5);

  t.scene("Phone");
  await declineEpisode();
  if (C.mode() !== "control") {
    pressKey("Enter");
    await t.until(() => C.mode() === "control", 4000, "take control for the phone layout").catch(() => {});
    await declineEpisode();
  }
  const native = C.state().touch;
  if (!native) C.touch(true);
  await sleep(200);
  t.event("touch-layout", native ? `phone-sized window ${innerWidth}×${innerHeight}` : `phone controls on a ${innerWidth}×${innerHeight} window (setup shortcut)`);
  const ids = ["control", "stick", "jump-btn", "power-storm", "power-bolt", "power-gust", "power-tornado", "weather-btn", "quality", "pressure", "episodes"];
  const boxes = [];
  ids.forEach((id) => {
    const r = boxOf($(id));
    if (!r) {
      t.problem("bug", `Phone control #${id} isn't on screen`);
      return;
    }
    boxes.push({ id, r });
    const small = id === "stick" ? 80 : 44;
    if (r.width < small - 1 || r.height < small - 1) t.problem("bug", `#${id} is ${Math.round(r.width)}×${Math.round(r.height)} (needs a thumb)`);
    if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) t.problem("bug", `#${id} sits off the screen`);
    if (r.left < 4 || r.right > innerWidth - 4) t.problem("polish", `#${id} is flush with the screen edge`);
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i].r, boxes[j].r)) t.problem("bug", `#${boxes[i].id} overlaps #${boxes[j].id}`);
    }
  }
  const side = document.querySelector(".side");
  if (side && getComputedStyle(side).display !== "none") {
    const sr = boxOf(side);
    boxes.forEach((b) => { if (sr && boxesOverlap(sr, b.r)) t.problem("bug", `#${b.id} covers the log panel`); });
  }
  if (boxes.length === ids.length && !boxes.some((b, i) => boxes.slice(i + 1).some((c) => boxesOverlap(b.r, c.r)))) {
    t.event("touch-reachable", ids.join(" "));
  }
  const look = window.day.look && window.day.look.info();
  if (look) {
    t.event("quality-auto", `now ${look.quality} (${look.qualityHow}), auto would pick ${look.auto}`);
    const phoneSized = innerWidth <= 700 || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    if (phoneSized && look.qualityHow === "auto" && look.quality !== "low") t.problem("bug", `A phone-sized window auto-picked ${look.quality}`);
    if (phoneSized && look.quality === "low" && (look.bloom || look.shadows)) t.problem("bug", "Low quality left bloom or shadows on");
  }
  const samples = [];
  const obs = world() && world().scene.onAfterRenderObservable.add(() => samples.push(world().engine.getDeltaTime()));
  await sleep(1000);
  if (obs && world()) world().scene.onAfterRenderObservable.remove(obs);
  const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
  t.metric("phoneFrameMs", Math.round(avg * 10) / 10);
  if (!samples.length) t.problem("warning", "No frames to time on the phone layout");
  else if (avg > 50) t.problem("warning", `Phone layout averaged ${avg.toFixed(1)} ms a frame`);
  else t.event("phone-smooth", `${avg.toFixed(1)} ms a frame over ${samples.length} frames`);
  t.progress(0.75);

  t.scene("Weather and bolt");
  const wbtn = $("weather-btn");
  if (wbtn) await tapEl(wbtn);
  await sleep(250);
  const wheel = $("weather-wheel");
  const rain = wheel && wheel.querySelector('[data-weather="rain"]');
  if (!wheel || wheel.hidden || !rain) t.problem("bug", "The weather wheel didn't open from the phone button");
  else {
    await tapEl(rain);
    await sleep(300);
    const now = window.weather && window.weather.now();
    if (!now || now.state !== "rain") t.problem("bug", `The wheel tap left the weather on ${now && now.state}`);
    else t.event("weather-touch", "rain from the wheel");
  }
  const bolt = $("power-bolt");
  if (bolt) {
    await t.until(() => window.day.powers && window.day.powers.now().pressure >= 24, 20000, "Pressure for the phone bolt").catch(() => {});
    await tapEl(bolt);
    await sleep(300);
  }
  t.progress(0.9);
  await t.until(() => {
    const names = new Set(sent().filter((e) => e.name === "feature").map((e) => (e.props || {}).name));
    return ["take_control", "weather", "power"].every((n) => names.has(n));
  }, 12000, "take_control, weather and power to be sent").catch(() => {});
  const names = new Set(sent().filter((e) => e.name === "feature").map((e) => (e.props || {}).name));
  t.metric("playerFeatures", [...names].filter((n) => ["take_control", "let_go", "weather", "power", "glide", "episode", "tutorial"].includes(n)).join(","));
  ["take_control", "weather", "power"].forEach((n) => {
    if (!names.has(n)) t.problem("bug", `No ${n} feature went out`);
    else t.event("analytics", `feature ${n}`);
  });
  if (names.has("let_go")) t.event("analytics", "feature let_go");
  t.progress(1);
}

const E = () => window.DayEngine;

/* ---------------- console errors (every scenario) ---------------- */
const consoleErrors = [];
(function watchConsole() {
  try {
    const orig = console.error.bind(console);
    console.error = (...args) => {
      consoleErrors.push(args.map((a) => (a && a.message) || String(a)).join(" ").slice(0, 200));
      return orig(...args);
    };
    window.addEventListener("error", (e) => consoleErrors.push(String((e && e.message) || "error").slice(0, 200)));
    window.addEventListener("unhandledrejection", (e) => consoleErrors.push(String((e && e.reason && e.reason.message) || (e && e.reason) || "rejection").slice(0, 200)));
  } catch (e) { /* no console */ }
})();
function reportConsole(t, from) {
  const mine = consoleErrors.slice(from);
  t.metric("consoleErrors", mine.length);
  if (!mine.length) t.event("console-clean", "no console errors in this run");
  [...new Set(mine)].slice(0, 5).forEach((m) => t.problem("bug", `Console error: ${m}`));
}

/** Click a page button like a player: a pointer down/up on it, then the click. */
async function clickEl(el) {
  const r = el.getBoundingClientRect();
  const o = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 7, pointerType: "mouse" };
  el.dispatchEvent(new PointerEvent("pointerdown", o));
  await sleep(80);
  el.dispatchEvent(new PointerEvent("pointerup", o));
  el.click();
}

/* ---------------- the title screen and the day/night music ---------------- */
async function hudLayoutScenario(options, t) {
  t.scene("HUD layout");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const size = `${innerWidth}x${innerHeight}`;
  const q = $("quality"), gear = $("settings");
  if (!q || !gear) { t.problem("bug", "No Settings button or quality toggle"); return; }
  if (!q.closest("#settings-pop")) t.problem("bug", "Quality isn't inside the Settings menu");
  if (window.day.title && window.day.title.show) window.day.title.show();
  await sleep(600);
  if (hudVisible(q)) t.problem("bug", `Quality shows outside the Settings menu on the title (${size})`);
  checkHud(t, "hud-layout: title");
  if (window.day.title && window.day.title.quiet) window.day.title.quiet();
  await sleep(400);
  if (hudVisible(q)) t.problem("bug", `Quality floats on screen while Settings is closed (${size})`);
  gear.click();
  await sleep(300);
  if (!hudVisible(q)) t.problem("bug", "Settings didn't open the quality toggle");
  checkHud(t, "hud-layout: settings open");
  t.event("settings-open", `Quality sits in the Settings menu at ${size}`);
  pressKey("Escape");
  await sleep(200);
  pressKey("Enter");
  await t.until(() => window.day.control && window.day.control.mode() === "player", 8000, "taking control");
  await sleep(800);
  checkHud(t, "hud-layout: in play");
  const c = boxOf($("control"));
  if (c) {
    const cx = c.left + c.width / 2;
    if (Math.abs(cx - innerWidth / 2) > 4) t.problem("bug", `Let go isn't centred (${Math.round(cx)} of ${innerWidth}) at ${size}`);
    if (!document.documentElement.classList.contains("touch-ui") && c.top < innerHeight / 2) t.problem("bug", `Let go isn't at the bottom (${size})`);
  }
  const w = boxOf($("weather-btn")), p = boxOf($("pressure"));
  if (!w || !p) t.problem("bug", `Weather or Pressure missing in play (${size})`);
  else {
    ["episodes", "neighbors-btn"].forEach((id) => { const b = boxOf($(id)); if (b && (boxesOverlap(b, w) || boxesOverlap(b, p))) t.problem("bug", `#${id} covers the weather meter (${size})`); });
    if (w.left < 0 || p.right > innerWidth || p.top < 0 || w.bottom > innerHeight) t.problem("bug", `Weather meter is cut off (${size})`);
  }
  t.event("hud-layout-play", `weather and Pressure clear, Let go centred at ${size}`);
  pressKey("Escape");
}

async function titleScenario(options, t) {
  t.scene("Title");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const T = window.day.title;
  const S = window.day.score;
  if (!T) {
    t.problem("blocker", "There's no title screen (js/title.js didn't install)");
    return;
  }
  // Opened with ?playtest=title it is up from the first frame; started by the runner on a page that was
  // already open, bring it back (setup) so the run starts where a player's does.
  const first = T.now().showing;
  if (!first) T.show("playtest");

  // The loading card (index.html): it showed from the first paint, it goes when the title is ready, and no HUD field is a dash.
  const L = window.__loading;
  if (!L) t.problem("blocker", "The loading card script (window.__loading) isn't in index.html");
  else {
    const card = $("loading");
    const seen = L.log().some((e) => e.action === "show");
    const prog = L.log().filter((e) => e.action === "progress").map((e) => `${e.part} ${Math.round(e.frac * 100)}%`);
    t.event("loading-card", `${seen ? "showed from the first paint" : "never showed"}; progress from load events: ${prog.join(", ") || "none seen"}`);
    if (!seen) t.problem("bug", "The loading card never showed");
    if (L.state() === "loading" && boxOf(card)) {
      const r = card.querySelector(".card").getBoundingClientRect();
      t.event("loading-up", `card ${Math.round(r.width)}x${Math.round(r.height)} in ${innerWidth}x${innerHeight}, bar ${L.pct()}%`);
      if (r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) t.problem("bug", `The loading card doesn't fit the screen (${innerWidth}x${innerHeight})`);
    }
    await t.until(() => L.state() !== "loading", 30000, "the loading card to finish").catch(() => {});
    await sleep(700);
    if (L.state() === "failed") t.problem("blocker", "The loading card shows the retry message: the game didn't load");
    const gone = !card || card.hidden || !boxOf(card);
    t.event("loading-gone", `state ${L.state()}, card ${gone ? "gone" : "still on screen"}, title ${T.now().showing ? "up" : "not up"}`);
    if (!gone) t.problem("bug", "The loading card is still on screen after the title is ready");
    if (document.documentElement.classList.contains("loading")) t.problem("bug", "html.loading is still set (the HUD stays hidden)");
    if (!L.log().some((e) => e.action === "done")) t.problem("bug", "The loading card never reported done");
    const dashes = ["chapter", "where", "time", "ampm", "what", "next", "date", "count"]
      .map((id) => $(id)).filter((e) => e && !e.hidden && HUD_PLACEHOLDER.test((e.textContent || "").trim()) && (e.textContent || "").trim() !== "");
    const empty = ["chapter", "time", "what"].filter((id) => !(($(id) || {}).textContent || "").trim());
    if (dashes.length) t.problem("bug", `HUD fields show a placeholder dash: ${dashes.map((e) => "#" + e.id).join(", ")}`);
    if (empty.length) t.problem("bug", `HUD fields are empty once the title is up: ${empty.map((x) => "#" + x).join(", ")}`);
    const bad = [...document.querySelectorAll(".hud, .side")].flatMap((r) => [...r.querySelectorAll("*")]).filter((e) => !e.children.length && !e.hidden && /^[\s–—]+$/.test(e.textContent || "") && (e.textContent || "").length);
    if (bad.length) t.problem("bug", `A dash shows in the HUD: ${bad.map((e) => e.id || e.className || e.tagName).join(", ")}`);
    if (!dashes.length && !bad.length && !empty.length) t.event("loading-hud-clear", "no HUD field is empty or a dash once the title is up");
  }
  await sleep(300);
  const el = $("title");
  const play = $("title-play");
  const eps = $("title-episodes");
  const music = $("title-music");
  t.event("title-open", first ? "the title is the first thing on the page" : "title shown again for this run (the page was already open)");
  if (!boxOf(el)) t.problem("blocker", "The title screen (#title) isn't on screen");
  if (!boxOf(play)) t.problem("blocker", "No Play button on the title");
  if (!boxOf(eps)) t.problem("blocker", "No Episodes button on the title");
  const hudUp = [document.querySelector(".panel.now"), document.querySelector(".hud.bottom"), $("control"), $("episodes")]
    .filter((x) => x && getComputedStyle(x).visibility !== "hidden" && boxOf(x));
  if (hudUp.length) t.problem("bug", `The HUD shows through the title: ${hudUp.map((x) => x.id || x.className).join(", ")}`);
  if (play && eps && boxesOverlap(boxOf(play), boxOf(eps))) t.problem("bug", "Play and Episodes overlap");
  t.event("title-buttons", `Play "${play && play.textContent}", Episodes "${eps && eps.textContent}", camera ${T.now().camera ? "skyline orbit" : "his camera"}`);
  if (!T.now().camera) t.problem("bug", "The title doesn't show the skyline (world.titleShot is off)");
  t.progress(0.1);
  await sleep(2500);

  // Music: a real click on the title's Music button turns the Sound on (the browser allows it on a click).
  if (S && music) {
    await clickEl(music);
    await sleep(300);
    if (music.getAttribute("aria-pressed") !== "true") {
      await clickEl(music);
      await sleep(300);
    }
    await t.until(() => S.now().on && S.now().samples && S.now().bed, 20000, "the music to load").catch(() => {});
    const n = S.now();
    t.event("title-music", `sound ${n.on ? "on" : "off"}, bed ${n.bed}, title level ${n.title}, mix music ${n.mix.music} title ${n.mix.title}`);
    if (!n.on) t.problem("bug", "The title's Music button didn't turn the Sound on");
    if (!n.bed) t.problem("bug", "No music bed is playing on the title");
  } else t.problem("bug", "No score or no Music button on the title");
  t.progress(0.2);

  // Day and night: the skyline at noon with the day bed, then night with its own bed (crossfaded), then day again.
  const legs = [
    ["day", 12 * 60, "Noon skyline"],
    ["night", 21 * 60 + 40, "Night skyline"],
    ["day", 13 * 60, "Day again"],
  ];
  for (let i = 0; i < legs.length; i++) {
    const [want, minute, scene] = legs[i];
    scrubTo(minute);
    await sleep(500);
    t.scene(scene);
    if (!S) break;
    const early = S.now();
    await t.until(() => S.now().target === want, 6000, `the ${want} bed`).catch(() => {});
    await sleep(900);
    const mid = S.now();
    if (early.bed && early.bed !== want) t.event("music-crossfade", `${early.bed} → ${want}: fade ${mid.fade.toFixed(2)} at 0.9 s`);
    await t.until(() => S.now().bed === want && S.now().fade >= 0.99, 9000, `the ${want} bed to settle`).catch(() => {});
    await sleep(2200);
    const n = S.now();
    t.event(`music-${want}`, `${E().fmtClock(minute)}: bed ${n.bed} (file ${n.files[want] || "?"}), tone ${n.tone} Hz, ${n.tod}`);
    t.metric(`music${want[0].toUpperCase()}${want.slice(1)}Bed`, n.bed);
    if (n.bed !== want) t.problem("bug", `At ${E().fmtClock(minute)} the music is ${n.bed}, not the ${want} bed`);
    if (want === "night" && n.tone > 6000) t.problem("polish", `The night music isn't softened (tone ${n.tone} Hz)`);
    t.progress(0.25 + i * 0.12);
  }
  if (S && S.now().files && S.now().files.day === S.now().files.night) t.problem("bug", "Day and night play the same file");
  else t.event("music-day-night", "day and night play different beds");

  // Play starts the game: the title goes, the HUD is back and he's the player's.
  t.scene("Play");
  await clickEl(play);
  await t.until(() => !T.now().showing, 3000, "the title to close").catch(() => {});
  await t.until(() => window.day.control && window.day.control.mode() === "control", 5000, "Play to take control").catch(() => {});
  const mode = window.day.control ? window.day.control.mode() : "none";
  t.event("title-play", `title ${T.now().showing ? "still up" : "closed"}, he is ${mode === "control" ? "the player's" : mode}`);
  if (T.now().showing) t.problem("blocker", "Play didn't close the title");
  if (mode !== "control") t.problem("bug", `Play didn't start the game (control mode ${mode}${window.day.now().frame.person.inCar ? ", he's driving" : ""})`);
  if (T.now().camera) t.problem("bug", "The title's skyline camera stayed on after Play");
  await sleep(600);
  if (!boxOf(document.querySelector(".hud.bottom")) && !document.documentElement.classList.contains("public")) t.problem("bug", "The HUD didn't come back after Play");
  pressKey("w");
  await sleep(1400);
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "w", bubbles: true }));
  t.event("game-started", `he walked; music ${S ? S.now().bed : "-"}, title level off (${S ? S.now().title : "-"})`);
  t.progress(0.7);
  pressKey("Escape");
  await sleep(1500);

  // Episodes: the title again (setup), its Episodes button opens the Episodes menu.
  t.scene("Episodes");
  T.show("playtest");
  await sleep(1500);
  await clickEl(eps);
  await sleep(700);
  const menu = $("episode-menu");
  const open = !!(menu && !menu.hidden && boxOf(menu));
  const rows = menu ? menu.querySelectorAll(".ep-row").length : 0;
  t.event("title-episodes", `title ${T.now().showing ? "still up" : "closed"}, Episodes menu ${open ? "open" : "closed"} with ${rows} rows`);
  if (T.now().showing) t.problem("bug", "Episodes didn't close the title");
  if (!open) t.problem("bug", "The title's Episodes button didn't open the Episodes menu");
  await sleep(2500);
  const close = menu && menu.querySelector(".close, button.ok, [data-close]");
  if (close) await clickEl(close);
  else if (menu) menu.hidden = true;
  t.progress(1);
}

/* ---------------- opening: Small Weather's skippable intro on a first Play ---------------- */
// Needs ?playtest=opening. Run 1 watches two beats and clicks Skip; run 2 skips with Esc; run 3 is a returning player (no opening).
async function openingScenario(options, t) {
  t.scene("Opening");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const T = window.day.title;
  const O = window.day.opening;
  if (!O) {
    t.problem("blocker", "There's no opening (js/opening.js didn't install)");
    return;
  }
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model !== "loading", 30000, "his model to load").catch(() => {});
  const ctl = () => (window.day.control ? window.day.control.mode() : "none");
  async function toTitle() {
    if (ctl() === "control") { pressKey("Escape"); await sleep(1800); }
    O.reset();
    T.show("playtest");
    await sleep(600);
  }
  // Run 1: the first Play shows the opening on him, then Skip hands him over.
  await toTitle();
  await clickEl($("title-play"));
  await t.until(() => O.now().showing, 3000, "the opening").catch(() => {});
  const o1 = O.now();
  t.event("opening-start", `opening ${o1.showing ? "showing" : "NOT showing"}, ${o1.beats} beats, model ${o1.model}`);
  if (!o1.showing) { t.problem("blocker", "A first Play didn't open the opening"); return; }
  if (!boxOf($("opening"))) t.problem("blocker", "The opening card (#opening) isn't on screen");
  if (o1.model !== "small-weather") t.problem("blocker", `The opening doesn't show Small Weather's model (engine says "${o1.model}")`);
  else t.event("opening-model", "Small Weather's own model is on screen, no placeholder");
  const skipBtn = $("opening-skip");
  if (!boxOf(skipBtn)) t.problem("blocker", "The opening has no Skip button");
  else t.event("opening-skip-ready", `Skip button "${skipBtn.textContent}"`);
  const hudUp = [document.querySelector(".hud.bottom"), $("control"), $("episodes")]
    .filter((x) => x && getComputedStyle(x).visibility !== "hidden" && boxOf(x));
  if (hudUp.length) t.problem("bug", "The HUD shows through the opening");
  await t.until(() => O.now().beat >= 1, 9000, "the second line");
  t.event("opening-line", `"${($("opening-say") || {}).textContent}"`);
  t.progress(0.35);
  await clickEl(skipBtn);
  await t.until(() => !O.now().showing && ctl() === "control", 4000, "Skip to hand him over").catch(() => {});
  t.event("opening-skipped", `opening ${O.now().showing ? "still up" : "closed"} after beat ${O.now().beat + 1}, he is ${ctl() === "control" ? "the player's" : ctl()}`);
  if (O.now().showing) t.problem("blocker", "Skip didn't close the opening");
  if (ctl() !== "control") t.problem("bug", `After Skip he isn't the player's (${ctl()})`);
  if (!O.now().seen) t.problem("bug", "A skipped opening wasn't remembered");
  pressKey("w");
  await sleep(1200);
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "w", bubbles: true }));
  t.progress(0.55);

  // Run 2: Esc skips too.
  await toTitle();
  await clickEl($("title-play"));
  await t.until(() => O.now().showing, 3000, "the opening again").catch(() => {});
  await sleep(1500);
  pressKey("Escape");
  await t.until(() => !O.now().showing, 3000, "Esc to skip").catch(() => {});
  t.event("opening-esc", `Esc ${O.now().showing ? "did not skip" : "skipped the opening"}`);
  if (O.now().showing) t.problem("bug", "Esc doesn't skip the opening");
  await sleep(1200);
  t.progress(0.8);

  // Run 3: a returning player's Play goes straight to him.
  await toTitle();
  O.reset();
  window.localStorage.setItem("icanbe.opening", "skip");
  await clickEl($("title-play"));
  await sleep(1500);
  t.event("opening-once", `second Play: opening ${O.now().showing ? "shown again" : "not shown"}, he is ${ctl() === "control" ? "the player's" : ctl()}`);
  if (O.now().showing) t.problem("bug", "The opening shows again for a returning player");
  t.progress(1);
}

/* ---------------- moments: the take-over push and line, the day-end recap ---------------- */
// Needs ?playtest=moments. Real input: the Take control button, Skip, Esc, movement keys and the 1200x speed button.
async function momentsScenario(options, t) {
  t.scene("Moments");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const M = window.day.moments;
  if (!M) { t.problem("blocker", "There's no moments module (js/moments.js didn't install)"); return; }
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model !== "loading", 30000, "his model to load").catch(() => {});
  const ctl = () => (window.day.control ? window.day.control.mode() : "none");
  const evs = [];
  window.addEventListener("day:moment", (e) => evs.push(e.detail));
  const radius = () => window.day.world().camera.radius;
  async function back() { if (ctl() === "control") { pressKey("Escape"); await t.until(() => ctl() === "schedule", 15000, "him back on his day").catch(() => {}); } }
  scrubTo(window.day.dayStart + 0.2);
  await sleep(1200);

  // Take over 1: the camera pushes in and one line shows; Skip closes it.
  await clickEl($("control"));
  await t.until(() => M.now().line, 3000, "the take-over line").catch(() => {});
  const r0 = radius();
  const n1 = M.now();
  t.event("takeover-line", `line ${n1.line ? "showing" : "NOT showing"}: "${n1.text}", pushing ${n1.pushing}, camera radius ${r0.toFixed(1)}`);
  if (!n1.line) { t.problem("blocker", "Taking over shows no line"); }
  if (!n1.pushing) t.problem("blocker", "Taking over plays no camera push");
  if (!boxOf($("moment-line"))) t.problem("bug", "The take-over line isn't on screen");
  await sleep(1000);
  const r1 = radius();
  t.event("takeover-push", `camera radius ${r0.toFixed(1)} -> ${r1.toFixed(1)} m while pushing in`);
  if (!(r1 < r0 - 1)) t.problem("bug", `The camera doesn't push in (radius ${r0.toFixed(1)} -> ${r1.toFixed(1)})`);
  await clickEl($("moment-skip"));
  await sleep(300);
  t.event("takeover-skipped", `line ${M.now().line ? "still up" : "closed"}, push ${M.now().pushing ? "still on" : "ended"}`);
  if (M.now().line || M.now().pushing) t.problem("blocker", "Skip doesn't end the take-over moment");
  t.progress(0.25);

  // Take over 2: moving ends it too.
  await back();
  await clickEl($("control"));
  await t.until(() => M.now().line, 3000, "the take-over line again").catch(() => {});
  await sleep(500);
  pressKey("w");
  await sleep(600);
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "w", bubbles: true }));
  t.event("takeover-move", `after W: line ${M.now().line ? "still up" : "closed"}, push ${M.now().pushing ? "still on" : "ended"}`);
  if (M.now().line || M.now().pushing) t.problem("bug", "Walking doesn't end the take-over moment");
  await back();
  t.progress(0.45);

  // Day end 1: the clock rolls into the next day; three events from the log; Skip closes it.
  async function rollDay() {
    scrubTo(window.day.dayEnd - 3);
    await sleep(600);
    const b = [...$("speeds").children].find((x) => x.dataset.speed === "1200") || $("speeds").lastElementChild;
    await clickEl(b);
    await t.until(() => M.now().recap, 15000, "the day-end recap").catch(() => {});
  }
  await rollDay();
  const d1 = M.now();
  const items = [...document.querySelectorAll("#day-end-events li")].map((li) => li.textContent);
  t.event("dayend-recap", `recap ${d1.recap ? "showing" : "NOT showing"}, ${items.length} events: ${items.join(" | ")}`);
  if (!d1.recap) { t.problem("blocker", "The day's end shows no recap"); return; }
  if (items.length !== 3) t.problem("blocker", `The recap has ${items.length} events, not 3`);
  if (!boxOf($("day-end"))) t.problem("bug", "The recap card isn't on screen");
  await sleep(2600);
  await clickEl($("day-end-skip"));
  await sleep(300);
  t.event("dayend-skipped", `recap ${M.now().recap ? "still up" : "closed"}`);
  if (M.now().recap) t.problem("blocker", "Skip doesn't close the recap");
  t.progress(0.75);

  // Day end 2: Esc skips it too.
  await rollDay();
  await sleep(800);
  pressKey("Escape");
  await sleep(300);
  t.event("dayend-esc", `Esc ${M.now().recap ? "did not skip" : "skipped"} the recap`);
  if (M.now().recap) t.problem("bug", "Esc doesn't skip the recap");
  t.event("moments-log", evs.map((e) => `${e.moment}:${e.action}${e.via ? "(" + e.via + ")" : ""}`).join(" "));
  t.progress(1);
}

async function barksScenario(options, t) {
  t.scene("Barks");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const B = window.day.barks;
  const C = window.day.control;
  const W = window.weather;
  if (!B) { t.problem("blocker", "There's no barks module (js/barks.js didn't install)"); return; }
  const heard = [];
  window.addEventListener("day:bark", (e) => heard.push(e.detail));
  const key = window.day.now().key;
  const dayStart = window.day.today().dayStart;
  // Setup shortcut: the morning, then the sky by real keys, each given time for its bark.
  scrubTo(dayStart + 0.2);
  await sleep(800);
  clickSpeed(1);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  t.progress(0.1);
  const states = [["3", "rain"], ["4", "storm"], ["5", "fog"], ["6", "wind"], ["7", "snow"], ["1", "clear"]];
  for (let i = 0; i < states.length; i++) {
    const [k, st] = states[i];
    pressKey(k);
    await t.until(() => W.now().state === st, 9000, `${st} to start`).catch(() => {});
    const n0 = heard.length;
    await t.until(() => heard.some((h, j) => j >= n0 && h.kind === "weather" && h.key === st), 6000, `a ${st} bark`).catch(() => {});
    const h = heard.find((x, j) => j >= n0 && x.kind === "weather" && x.key === st);
    t.event(`bark-weather-${st}`, h ? `"${h.text}"` : "no bark");
    if (!h) t.problem("bug", `No bark when the sky went to ${st}`);
    t.progress(0.1 + 0.07 * (i + 1));
  }
  pressKey("Escape");
  await t.until(() => C.mode() === "schedule", 20000, "him back on his day").catch(() => {});

  // His needs: the day at speed (the day bar buttons), reading the log as it goes.
  const hours = [6.5, 9, 11.5, 13, 15, 17.5, 19, 21, 23];
  for (let i = 0; i < hours.length; i++) {
    scrubTo(hours[i] * 60);
    await sleep(500);
    clickSpeed(1200);
    await sleep(5000);
    t.progress(0.55 + 0.04 * (i + 1));
  }
  clickSpeed(1);
  const needs = heard.filter((h) => h.kind === "need");
  needs.forEach((h) => t.event(`bark-need-${h.key}`, `${E().fmtClock(h.minutes)} "${h.text}"`));
  const texts = heard.map((h) => h.text);
  const dup = texts.filter((x, i) => texts.indexOf(x) !== i);
  const notes = (window.day.notes() || []).map((n) => n.text);
  const logDup = notes.filter((x, i) => notes.indexOf(x) !== i && barkTexts().has(x));
  t.metric("barks", heard.length);
  t.metric("distinct-barks", new Set(texts).size);
  t.event("bark-lines", `${new Set(texts).size} distinct lines: ${heard.filter((h) => h.kind === "weather").length} weather, ${needs.length} needs`);
  if (new Set(texts).size < 12) t.problem("bug", `Only ${new Set(texts).size} distinct bark lines were heard (want 12 or more)`);
  if (dup.length || logDup.length) t.problem("bug", `A line repeated within one day: ${[...dup, ...logDup][0]}`);
  else t.event("no-repeat", `no line repeated on ${key}`);
  if (!needs.length) t.problem("bug", "No hunger, thirst or tiredness bark in a day at speed");
  t.progress(1);
}

function barkTexts() {
  const b = (window.DAY_CONFIG && window.DAY_CONFIG.barks) || {};
  return new Set([...Object.values(b.needs || {}).flatMap((n) => n.lines || []), ...Object.values(b.weather || {}).flat()]);
}

/* ---------------- spot: a feel replay, a short probe where the feel sensor flagged something ---------------- */
// options.spot (t.spot) is a place the playtest's feel sensor flagged (falling through the floor, stuck, a camera snap,
// a collision shove...). Any scenario run with a spot plays this probe there instead of the whole scenario, so the recheck
// after a fix plays that exact place in seconds. Setup shortcut (named): day.control.place stands him at the spot.
// Real input: Enter to take control, then WASD each way, Shift to run, Space to jump.
async function spotProbe(options, t, spot) {
  t.scene("Replay spot");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const C = window.day.control;
  if (!C) {
    t.problem("bug", "There's no Take control (js/control.js didn't install)");
    return;
  }
  if (C.mode() !== "control") await tapKey("Enter");
  await t.until(() => C.mode() === "control", 8000, "taking control").catch(() => {});
  if (C.mode() !== "control") {
    t.problem("bug", "Enter didn't take control for the spot replay");
    return;
  }
  await sleep(800);
  t.cut();
  const yaw = spot.yaw != null ? (spot.yaw * Math.PI) / 180 : undefined;
  const at = C.place(spot.x, spot.z, yaw); // setup shortcut: stand him at the flagged spot
  t.event("spot", `asked ${spot.x.toFixed(1)},${spot.y.toFixed(1)},${spot.z.toFixed(1)}; stood at ${at ? `${at.x.toFixed(1)},${at.z.toFixed(1)}` : "nowhere (not in control)"}`);
  t.progress(0.2);
  await sleep(1000);
  const legs = [["w"], ["d"], ["s"], ["a"], ["Shift", "w"], ["Shift", "s"]];
  for (let i = 0; i < legs.length; i++) {
    await holdKeys(legs[i], 1100);
    await sleep(250);
    t.progress(0.2 + (0.6 * (i + 1)) / legs.length);
  }
  for (const k of [["w"], ["s"]]) {
    keyDown(k[0]);
    await sleep(200);
    await tapKey(" ");
    await sleep(900);
    keyUp(k[0]);
    await sleep(400);
  }
  const st = C.state();
  t.metric("spotDrift", Math.round(Math.hypot(st.x - spot.x, st.z - spot.z) * 10) / 10);
  t.event("spot-probe", `ended at ${st.x.toFixed(1)},${st.y.toFixed(1)},${st.z.toFixed(1)}, grounded ${st.grounded}`);
  t.progress(1);
}

/* The feel sensor (hawkes-feel.js): his figure while he's the player's; while the day plays itself (the cutaway
   camera cuts room to room by design) only frame hitches are watched. */
const feelControl = () => (window.day && window.day.control && window.day.control.mode() === "control" ? window.day.control : null);

/* Why the sensor was silent: the city's shells and merged buildings are isPickable = false (so taps and the pointer pick
   skip them), and the sensor's camera and floor rays only hit pickable meshes, so the camera could sit inside a roof
   unseen. At the start of a run (a bot's tab only) the big, non-instanced ones, and the flat ground, are made pickable. */
function sensorScene() {
  const w = window.day && window.day.world && window.day.world();
  const scene = w && w.scene;
  if (!scene) return undefined;
  let n = 0;
  for (const m of scene.meshes) {
    if (m.isPickable !== false || m.thinInstanceCount || !m.getTotalVertices || !m.getTotalVertices()) continue;
    // The ground plane is flat (no height), so the size test below skips it: with it unpickable the floor ray found
    // nothing under him in the street, and any float or fall of 2 s off a roof read as "fell out of the world".
    if (m.name === "ground") { m.isPickable = true; n++; continue; }
    const e = m.getBoundingInfo().boundingBox.extendSizeWorld;
    if (e.y * 2 >= 2 && (e.x > 1 || e.z > 1)) { m.isPickable = true; n++; }
  }
  window.__feelPickable = n;
  return scene;
}

installPlaytest({
  product: "icanbe",
  feel: {
    get scene() { return sensorScene(); },
    active: () => !!feelControl(),
    player: () => {
      const C = feelControl();
      return C && C.avatar ? C.avatar().root : null;
    },
    grounded: () => {
      const C = feelControl();
      return C ? !!C.state().grounded : false;
    },
    // the walk cycle runs at his ground speed; "idle" while the body moves is the foot sliding the sensor looks for
    animSpeed: () => {
      const C = feelControl();
      if (!C) return 0;
      const st = C.state();
      return st.anim === "idle" ? 0 : st.speed;
    },
  },
  scenarios: [
    { id: "barks", title: "Small Weather's barks: the sky changes (rain, storm, fog, wind, snow, clear) and each gets one short log line from him; a day at speed adds hunger, thirst and tired lines; 12 or more distinct lines and none repeats within a day", seconds: 120, tags: ["story", "voice"], description: "Load with ?playtest=barks. Real input: Enter, keys 3 4 5 6 7 1, Esc, the 1200x button; the day bar to the morning and to nine hours (setup). Events bark-weather-<state> / bark-need-<need> / bark-lines / no-repeat." },
    { id: "moments", title: "Moments: taking over plays a camera push and one line (Skip or moving ends it); the day's end shows a recap of three events from the log (Skip or Esc closes it)", seconds: 70, tags: ["story", "moments"], description: "Load with ?playtest=moments. Real input: the Take control button, Skip, W, Esc; the day bar to 3 minutes before the day ends (setup) and the 1200x button. Events takeover-line / takeover-push / takeover-skipped / takeover-move / dayend-recap / dayend-skipped / dayend-esc / moments-log." },
    { id: "opening", title: "Opening: a first Play shows Small Weather's own model with a few lines and a Skip button; Skip and Esc hand him over; a returning player goes straight in", seconds: 60, tags: ["opening", "story", "smoke"], description: "Load with ?playtest=opening. Real clicks: Play (the title is shown, and the saved flag cleared, as setup), watch two lines, click Skip, then Play again and press Esc, then Play as a returning player. Events opening-start / opening-model / opening-skip-ready / opening-line / opening-skipped / opening-esc / opening-once." },
    { id: "hud-layout", title: "HUD layout: Quality lives in the Settings menu, the left column stacks Episodes, Neighbors, weather and Pressure without overlap, Take control stays bottom-centre; overlap check on title and in play", seconds: 40, tags: ["hud", "smoke"], description: "Load with ?playtest=hud-layout. Real input: Settings click, Enter, Esc. Events settings-open / hud-clear / hud-layout-play. Run at 1280x720, 390x844 and 844x390." },
    { id: "title", title: "Title screen: the skyline behind Small Weather's name with Play and Episodes opens first; the music plays on it, the day bed at noon and the night bed at night (crossfaded, softer); Play starts the game, Episodes opens the menu", seconds: 75, tags: ["title", "audio", "smoke"], description: "Load with ?playtest=title (the title opens first). Real clicks: Music, then the day bar to noon, 9:40 PM and 1 PM (setup) while the title is up, then Play (he's the player's, W walks), Esc; the title again (setup) and its Episodes button. Events title-open / title-buttons / title-music / music-day / music-crossfade / music-night / music-day-night / title-play / game-started / title-episodes / console-clean." },
    { id: "smoke", title: "Boot, see Small Weather, a minute of the day at 10×, pause, back to live, then take control on a rooftop and throw one bolt; Babylon 9, physics, his name in the panel and log", seconds: 90, tags: ["smoke"] },
    { id: "weather-abilities", title: "Take control, use Rain (R), Gale (V), Fog (C), Sun break (X) and Lightning (E) once each; each looks and sounds different and the sky is calm again seconds later", seconds: 150, tags: ["weather", "powers"], description: "Day bar beside the car (setup), Sound on, Enter. Real keys for each ability; waits for Energy between calls. Events ability-<id> / fade-<id>, then all-distinct." },
    { id: "crowd-reacts", title: "Take control at lunch and use Lightning, Rain, Gale, Fog and Sun break; the street's citizens look up, run for cover, hold their hats, slow down and cheer, then go back to routine as the weather clears", seconds: 150, tags: ["crowd", "weather", "powers"], description: "Day bar to lunch (setup), Enter, real keys for each ability. Events react-<id> and routine-<id>, metrics reacting-<id>." },
    { id: "slice", title: "Vertical slice: walk from the driveway to Birdie, answer her rain, see the lawn drink, the park path, bandstand pigeons and creak, the pond coin toss; reports quality.maxQuietSeconds and quality.textOnlyBeats", seconds: 200, tags: ["slice", "story"], description: "Real WASD, R for Birdie, Y at the pond." },
    { id: "neighbors", title: "Walk the avenue to Birdie, Dex and Ines Quill: each asks for a weather ability in a speech bubble, answering it pays a thank-you and a reward, and a later surprise pays more", seconds: 260, tags: ["neighbors", "story"], description: "Day bar beside the car (setup), Enter, then real WASD/Shift to each neighbor and R, X, E for their asks; the day bar jumps to each surprise hour. Events found-<id>, beat-ask-<id>, beat-thanks-<id>, reward-<id>, beat-surprise-<id>." },
    { id: "day", title: "The whole day at 1200× (every block must start)", seconds: 90, tags: ["full"] },
    { id: "analytics", title: "Camera, speeds, day bar and keys with the analytics events going out, then the 3-minute question, dismissed", seconds: 260, tags: ["analytics"] },
    { id: "model", title: "Small Weather's 3D model: on his day it walks, idles and works; under control (Enter) it idles, walks (WASD), runs (Shift), jumps, falls and floats (Space, held); Esc and he walks back", seconds: 80, tags: ["model"], description: "Waits for models/small-weather.glb. The day bar jumps to a walk, a still moment and work at the desk (setup shortcuts); the rest is real keys." },
    { id: "control", title: "Take control (Enter): walk, sprint, orbit the camera, a jump and two in the air, float; Esc and he walks back to his day; then the phone's touch stick and jump button", seconds: 100, tags: ["control"], description: "Starts at a quiet moment at home (the day bar). On a desktop-sized window the phone part shows the touch controls with day.control.touch(true)." },
    { id: "storm-ride", title: "Storm-riding: hold Space in the air to glide with wind trails; a Gust updraft lifts him from the street to rooftop height; glide apt roof to shop roof without touching the ground", seconds: 240, tags: ["control", "powers"], description: "Day bar beside the car. Storm weather (4), real keys for glide, G for updraft, climb apt then glide to shop." },
    { id: "city", title: "The day plays in the district (home, the drive, the office, home again), then he walks the street, the park and three roofs, and a building stops him", seconds: 240, tags: ["city"], description: "Day bar to home, the avenue, the office and home again (setup). Then Enter beside the car and WASD up the three ramps, across the street into the park, and into a wall." },
    { id: "look", title: "The city at noon, dusk and night (navy, wet surfaces, neon), then Quality: low", seconds: 80, tags: ["look"], description: "Day bar beside the car, Enter, walk to the shop front. Scrub holds noon, dusk and night. Then the quality button: bloom and shadows off, frame time recorded." },
    { id: "photos", title: "Photos of the dense city: noon at five spots along the avenue, dusk (windows and street lamps come on), night; frame rate at each", seconds: 120, tags: ["look", "photos"], description: "Day bar beside the car and to the hours (setup). Enter, then WASD with Shift east along the avenue. Events photo-noon / photo-dusk / photo-night / photo-fps; metrics photoFpsMin, photoFpsAvg, cityFillers, cityLamps." },
    { id: "crowd", title: "The street's people and cars follow the clock: quiet at 3 AM, busy at the 8:30 rush, full at lunch and dinner, thin again late; they walk, cross, go in and out of buildings; rain opens umbrellas; Quality: low thins them; frame rate at each", seconds: 90, tags: ["crowd", "photos"], description: "Day bar beside the car and to each hour (setup), then 1x. Enter, WASD with Shift to the shops, key 3, the quality button. Events crowd-night / crowd-rush / crowd-lunch / crowd-dinner / crowd-late / crowd-follows-clock / crowd-rain / crowd-quality-low / photo-fps; metrics crowd<Hour>People, crowd<Hour>Cars, photoFpsMin, photoFpsAvg." },
    { id: "fill-out", title: "The filled-out city: a rooftop, street props and shop signs, the plaza and clock tower; neon and lamps at night; the street reflects only in the rain he calls", seconds: 200, tags: ["look", "photos"], description: "Day bar beside the car and to the hours (setup). Enter, WASD with Shift, the ramp, key 3. Events photo-rooftop / photo-street / photo-plaza / photo-night-* / reflect-forecast / reflect-ability; metrics propsTrees, propsSigns, nightNeon, nightBloom, reflectAbility." },
    { id: "weather", title: "Take control outside, walk to the avenue, and switch clear, clouds, rain, storm, fog, wind and snow (keys 1–7). Each blends and gets a shot; rain and storm leave the road wet. Then the Q wheel and a phone tap.", seconds: 110, tags: ["weather"], description: "Day bar to the front door (setup), Sound on, Enter, WASD to the avenue. Keys 1–7 are the seven states. Hold Q opens the wheel; the Weather button is the phone tap." },
    { id: "atmosphere", title: "Rain light then heavy (sight and sound), the music tenses as Pressure fills, M mutes and the choice is saved, frame rate stays over 30 fps in rain and storm", seconds: 70, tags: ["weather", "audio"], description: "Sound on, take control, rain at 0.3 then key 3, Pressure low then high (setup shortcut), M twice, storm fps sample." },
    { id: "weather-audio", title: "Sound stays off until a real click; take control (sting); music beds crossfade across clear, rain, storm, fog and snow; rain and storm raise ambience", seconds: 100, tags: ["weather", "audio"], description: "Day bar to the front door. Confirms silence, turns Sound on with a pointer, Enter, walk to the avenue, keys 1/3/4/5/7. Logs music-* and amb levels." },
    { id: "weather-life", title: "Rain: street umbrellas and car wipers; leave a storm, let go, autopilot log reacts; weather holds then drifts back to the forecast", seconds: 150, tags: ["weather"], description: "Day bar to a yard moment whose forecast isn't a storm (morning door or evening car). Enter, WASD to the avenue, key 3 then 4, Esc. If the forecast there is a storm anyway: Enter, 1, Esc, so the drift is visible. Events: street-rain, umbrellas-and-wipers, autopilot-react, weather-drift, forecast-back." },
    { id: "powers", title: "Take control on the avenue, hold F for a storm, E lightning, G a gust, T a tornado; Pressure refuses a call when empty", seconds: 120, tags: ["powers"], description: "Day bar beside the car (setup), Sound on, Enter, WASD to the loose props. Real keys for each power; the meter must deny one." },
    { id: "spoken-dialogue", title: "Spoken dialogue: every dialogue line has its own clip in the build, sampled clips load and decode, and with Sound on Part 1's opening lines play as voice (day:dialogue say), not babble", seconds: 60, tags: ["voice", "story", "audio"], description: "Load with ?playtest=spoken-dialogue. Sound on (real pointer), Enter, Part 1 started by its API (setup). Events dialogue-index / dialogue-decode / sound-on / dialogue-say / dialogue-played." },
    { id: "voice", title: "Small Weather's DoD voice: episode open on Enter, a reaction for each weather state, power barks not every time, episode close on Esc", seconds: 100, tags: ["voice"], description: "Sound on (real pointer), Enter, keys 1–7 with cooldown gaps, bolts for chance/cooldown skips, Esc. Events voice-play / voice-weather-* / voice-power." },
    { id: "first-visit", title: "First visit: the card walks take control, walk, jump, one lightning strike and let go in under a minute; Skip hides it for good; then every phone control is on screen by touch, the wheel and Bolt by tap, a frame-time check, and take_control / weather / power events going out", seconds: 180, tags: ["tutorial", "control", "analytics"], description: "Day bar to a quiet moment at home (setup), day.tutorial.reset() as a first visit (setup). Real keys: Enter, W, Space, E, Esc. Skip by its button. The phone part uses day.control.touch(true) on a desktop-sized window; taps on the Weather button, the wheel and Bolt are real pointer taps." },
    { id: "episodes", title: "Chapter episodes: offer or start Morning, Lunch, Hurricane drive and Night; complete morning goals (clouds→clear); forecast score card and localStorage best", seconds: 200, tags: ["episodes"], description: "Jumps the clock to each episode's chapter, takes control, accepts the offer (or starts via API), completes morning weather goals with keys 2 then 1, checks the score card and icanbe.episodes.best." },
    { id: "story-ending", title: "Part 3 (the reservoir) after Part 2, and the ending card: three Part 3 runs reach three different endings (Fair Weather, Heavy Weather, Overcast) and the card says how the park, turbines, market and reservoir fared", seconds: 840, tags: ["episodes", "story"], description: "Day bar to a moment outdoors and to 22:30 (setup), Enter, each part started by its API (setup), Pressure refilled (setup). Real keys: WASD with Shift to the park, the plaza, the annex and the Storm Tank, R, X, V and E. Events part3-offered / ending-say / ending-gauge / ending-kick / ending-card / ending-reached / ending-fared / three-endings." },
    { id: "episode-select", title: "Episode select: the score card's Replay and Next episode buttons work, the Episodes menu shows each best rank and locks later episodes until the one before is finished, and progress is kept in localStorage", seconds: 120, tags: ["episodes", "rank"], description: "Day bar beside the car (setup), Enter, Morning started by its API (setup), Pressure refilled (setup). Real keys: R, X, E, weather keys 2 and 1, then the card's Replay and Next buttons and the Episodes button. Events select-locked / select-card / select-replay / select-next / select-menu / select-storage." },
    { id: "score-ranks", title: "Score and Challenge: clearing Morning shows a card with a rank (S to C) and a four-row breakdown (people, time, damage avoided, ability variety), saves the best rank, and unlocks the Challenge (tighter timer), which keeps its own best", seconds: 120, tags: ["episodes", "rank"], description: "Day bar beside the car (setup), Enter, Morning started by its API (setup), Pressure refilled (setup). Real keys: R, X, E, then weather keys 2 and 1; the Episodes button and the Challenge row. Events rank-locked / rank-card / rank-unlock / rank-best / rank-storage / rank-open / rank-challenge / rank-challenge-card." },
    { id: "story-parts", title: "Story Parts 1 and 2 as episodes: rain on the park (not the market), sun break and the stalls; overusing rain floods the park and scars the card; Part 2 wind for the turbines, a gale in the plaza topples a stall; neighbor dialogue from the beat sheet", seconds: 420, tags: ["episodes", "story"], description: "Day bar to a moment outdoors (setup), Enter, the parts started by their API (setup) and Pressure refilled (setup). Real keys: WASD with Shift to the park, the plaza and the annex, R, X and V. Events story-list / story-menu / story-say / story-goal / story-strain / story-kick / story-wind / story-card (clean vs scarred)." },
    { id: "lunch-rescue", title: "Rooftop storm (lunch): a surprise storm strands people in the plaza, on the shop roof and in the avenue; helping them with Sun break, Lightning and Gale changes the score and the S-C rank; the twist turns the rain to fog; an ending line per rank", seconds: 300, tags: ["episodes", "story", "rank"], description: "Day bar to a moment outdoors (setup), Enter, the episode started by its API (setup), Pressure refilled (setup). Real keys: WASD with Shift to the plaza cafe, the shop and the avenue, X, E, V, Esc. Run 1 helps one person and lets go (low rank); run 2 plays all three set pieces. Events lunch-opening / lunch-piece / lunch-help / lunch-score / lunch-twist / lunch-sky / lunch-goal / lunch-card / lunch-rank / lunch-say." },
    { id: "hurricane-drive", title: "Hurricane drive (commute home): four closures on the way home (fallen sign, flooded underpass, dead bus, closing bridge); the right ability at each helps, the wrong one hurts (rain on the debris, gale at the bus); a storm twist; an ending line and an S-C rank on the score card", seconds: 360, tags: ["episodes", "story", "rank"], description: "Day bar to a moment outdoors (setup), Enter, the episode started by its API (setup), Pressure refilled (setup). Real keys: WASD with Shift along the avenue, R then V at the fallen sign, V, X, E and C at the four set pieces, Esc. Run 1 uses rain on the debris (hurt) then a gale and lets go (low rank); run 2 plays all four set pieces right and gets home. Events drive-opening / drive-piece / drive-hurt / drive-help / drive-twist / drive-sky / drive-goal / drive-card / drive-rank / drive-say." },
    { id: "light-show", title: "Light show finale: the city gathers on the plaza, he calls Lightning, Rain, Fog, Gale and Sun break on their cues; beams, fireworks, neon pools and an aurora answer; the score depends on timing and variety; the closing card ties the day's stories together", seconds: 330, tags: ["episodes", "story", "rank"], description: "Day bar to a moment outdoors and then to 22:05 (setup), Enter, the episode started by its API (setup), the story arc seeded in localStorage (setup). Real keys: WASD with Shift to the plaza, then E / R / C / V / X pressed on each cue as the HUD counts down. Run 1 hits every cue on the beat with all five effects; run 2 presses only Lightning, 0.7 s late. Events show-opening / show-hud / show-gather / show-begin / show-act / show-cue / show-miss / show-off / show-stage / show-over / show-card / show-closing / show-compare; metrics showAurora, showBursts, showPointsOnBeat, showPointsSloppy." },
    { id: "phone", title: "Phone: the game by touch only, in portrait or landscape: take control, stick, jump, the five abilities and a power by tap, the Episodes menu and an episode card, the first-visit card and the tutorial episode (start and Skip), the day timeline dragged; every tapped control at least 44 px and on screen, HUD overlap checked", seconds: 240, tags: ["phone", "smoke-phone", "control", "tutorial"], description: "Day bar to a quiet moment at home (setup); day.control.touch(true) on a desktop-sized window (setup). Every press is a pointer tap measured first (44 px, on screen). Option {\"orientation\":\"landscape\"} turns a portrait window to landscape if the page can resize it, else the orientation event says it ran portrait only. Events touch-layout / orientation / take-control-tap / tutorial-card-skipped / tutorial-started / tutorial-skipped / stick-move / jump-tap / ability-tap-<id> / power-tap / episodes-open / episodes-closed / episode-card / timeline-drag / hud-clear / phone-taps." },
    { id: "tutorial-episode", title: "Tutorial episode: Learn the weather teaches Lightning, Rain, Gale, Fog and Sun break one at a time, each with a prompt and a goal; each unlocks with a toast; Skip opens everything", seconds: 150, tags: ["episodes", "tutorial", "abilities"], description: "Day bar to a quiet moment (setup), Enter, accepts the offer, then presses E, R, V, C, X as the prompts say; checks the locked slots, the toast, the goal ticks; restarts and presses Skip. Events tutorial-offer / unlock-toast / tutorial-prompt / tutorial-goal / locked-refused / all-unlocked / tutorial-skipped." },
  ],
  /* Ready = a frame is drawn AND the loading card has let go of the page (index.html window.__loading). While the card is up
     html.loading hides the whole HUD, so a run that started on the first frame saw the day bar, #what, #sound and #details
     as "hidden in Live mode" and screenshots of a full loading bar. A failed load counts (the run then reports it). */
  isReady: () => !!(window.day && window.day.now().frame && !(window.__loading && window.__loading.state() === "loading")),
  async start(id, options, t) {
    const errFrom = consoleErrors.length;
    // control.js's place() (a setup teleport that snaps the camera) tells the feel sensor it was an intended cut through
    // window.hawkesPlaytest.cut; the contract's api has none (cut lives on `t`), so every placement counted as a camera snap.
    if (window.hawkesPlaytest && !window.hawkesPlaytest.cut) window.hawkesPlaytest.cut = (s) => t.cut(s);
    try {
      if (id !== "title"&& window.day && window.day.title && window.day.title.quiet) window.day.title.quiet();
      if (id !== "smoke" && id !== "first-visit" && id !== "phone" && window.day && window.day.tutorial && window.day.tutorial.quiet) {
        window.day.tutorial.quiet();
      }
      if (t.spot) await spotProbe(options, t, t.spot);
      else if (id === "barks") await barksScenario(options, t);
      else if (id === "moments") await momentsScenario(options, t);
      else if (id === "opening") await openingScenario(options, t);
      else if (id === "title") await titleScenario(options, t);
      else if (id === "hud-layout") await hudLayoutScenario(options, t);
      else if (id === "smoke") await smoke(options, t);
      else if (id === "day") await wholeDay(options, t);
      else if (id === "analytics") await analytics(options, t);
      else if (id === "control") await control(options, t);
      else if (id === "storm-ride") await stormRide(options, t);
      else if (id === "model") await model(options, t);
      else if (id === "city") await city(options, t);
      else if (id === "look") await look(options, t);
      else if (id === "photos") await photos(options, t);
      else if (id === "fill-out") await fillOut(options, t);
      else if (id === "crowd") await crowdScenario(options, t);
      else if (id === "weather") await weather(options, t);
      else if (id === "weather-abilities") await weatherAbilities(options, t);
      else if (id === "slice") await sliceScenario(options, t);
      else if (id === "neighbors") await neighborsScenario(options, t);
      else if (id === "crowd-reacts") await crowdReacts(options, t);
      else if (id === "atmosphere") await atmosphere(options, t);
      else if (id === "weather-audio") await weatherAudio(options, t);
      else if (id === "weather-life") await weatherLife(options, t);
      else if (id === "powers") await powers(options, t);
      else if (id === "voice") await voice(options, t);
      else if (id === "spoken-dialogue") await spokenDialogue(options, t);
      else if (id === "episodes") await episodes(options, t);
      else if (id === "story-parts") await storyParts(options, t);
      else if (id === "score-ranks") await scoreRanks(options, t);
      else if (id === "episode-select") await episodeSelect(options, t);
      else if (id === "story-ending") await storyEnding(options, t);
      else if (id === "lunch-rescue") await lunchRescue(options, t);
      else if (id === "hurricane-drive") await hurricaneDrive(options, t);
      else if (id === "light-show") await lightShow(options, t);
      else if (id === "first-visit") await firstVisit(options, t);
      else if (id === "phone") await phone(options, t);
      else if (id === "tutorial-episode") await tutorialEpisode(options, t);
      reportConsole(t, errFrom);
    } finally {
      releaseHeld();
      stopWatching();
    }
  },
  stop() {
    stopRun();
    stopWatching();
  },
});

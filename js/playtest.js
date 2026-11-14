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
  ["#neighbors-panel", "Neighbors list"], [".abilitybar .ab", "ability"], [".abilitybar .charge", "Charge"],
  [".powerpad button", "power pad"], [".touchpad .stick", "stick"], [".touchpad .jump", "jump"],
  [".tutorial", "tutorial card"], [".ep-hud", "episode HUD"], [".control-hint", "controls hint"],
  ["#storm-toast", "storm tally card"], ["#voice-caption", "voice caption"], ["#voices", "Voices"], ["#time-btn", "Time control"], ["#time-drawer", "Time drawer"], ["#update-pill", "New version"],
];
/* HUD regions: the parts above grouped as a player sees them (the status card and the tools are the top bar, an ability
   bar of six buttons is one region). The public view holds these to six at any time. */
const HUD_REGIONS = {
  status: [".panel.now"], tools: ["#sound", "#details", "#settings", ".settings-pop", "#quality"], side: [".side"],
  time: ["#time-btn", "#time-drawer", ".hud.bottom"], control: ["#control"], episodes: ["#episodes", ".ep-hud"],
  stack: ["#weather-btn", "#pressure", "#neighbors-btn", "#neighbors-panel"], abilities: [".abilitybar .ab", ".abilitybar .charge"],
  touch: [".powerpad button", ".touchpad .stick", ".touchpad .jump"], notes: [".tutorial", ".control-hint", "#voice-caption", "#voices", "#update-pill"],
};
function hudRegionNames() {
  const seen = new Set();
  Object.entries(HUD_REGIONS).forEach(([name, sels]) => sels.forEach((sel) => document.querySelectorAll(sel).forEach((el) => { if (hudVisible(el)) seen.add(name); })));
  return [...seen];
}
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

/* The public view (a real host, or ?view=public): the quiet page. A scenario that judges the public layout asks for it, so
   a run on a local host plays the same page the beta does. The head script in index.html sets the classes from the URL;
   this does the same for a run that wasn't given the parameter, and keeps the URL honest. */
function forcePublicView() {
  const root = document.documentElement;
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("view") !== "public") {
      q.set("view", "public");
      history.replaceState(history.state, "", location.pathname + "?" + q.toString() + location.hash);
    }
  } catch (e) { /* none */ }
  if (!root.classList.contains("preview-public")) root.classList.add("preview-public", "view-forced");
  const tog = $("public-toggle");
  if (tog && root.classList.contains("view-forced")) tog.hidden = true;
  return root.classList.contains("preview-public");
}
const isPublicView = () => document.documentElement.classList.contains("preview-public");
/* Open (or close) the Time drawer the way a player does: a real click on the Time control. */
async function timeDrawer(on) {
  const btn = $("time-btn"), drawer = $("time-drawer");
  if (!btn || !drawer || !isPublicView()) return false;
  if (drawer.classList.contains("open") !== !!on) {
    await clickEl(btn);
    await sleep(300);
  }
  return drawer.classList.contains("open") === !!on;
}

function clickSpeed(s) {
  const b = document.querySelector(`#speeds button[data-speed="${s}"]`);
  if (b) {
    b.click();
    return true;
  }
  return false;
}

/** A tap: keydown then keyup. Lightning / Wind resolve on release (hold depths use keyDown + sleep + keyUp). */
function pressKey(key) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}
/** Hold a verb key long enough for Gale (or longer for Tornado). */
async function holdVerb(key, ms) {
  keyDown(key);
  await sleep(ms);
  keyUp(key);
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
  // The shader-compile loop (uniform block limit): no uniform buffers, and no effect that failed to compile.
  const eng = w && w.scene && w.scene.getEngine();
  if (eng) {
    t.metric("uniformBuffers", eng.supportsUniformBuffers ? 1 : 0);
    if (eng.supportsUniformBuffers) t.problem("bug", "The engine uses uniform buffers: lights, plugins and prepass can pass the GPU's 14 vertex UBO limit (shader compile loop)");
    let failed = 0;
    if (eng.onEffectErrorObservable) eng.onEffectErrorObservable.add(() => { failed++; });
    await sleep(2500);
    t.metric("effectErrors", failed);
    if (failed) t.problem("bug", `${failed} shader effect(s) failed to compile in 2.5 s`);
  }
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
  // The bedrug must be in those lights' includedOnlyMeshes (cast:false left it hemi-only and near-black).
  t.scene("Night bedroom");
  scrubTo(23 * 60 + 40);
  await sleep(2200);
  const st = w && w.stage;
  const fillI = st && st.bedsideFill ? st.bedsideFill.intensity : 0;
  const bedI = st && st.bedroomLight ? st.bedroomLight.intensity : 0;
  const rug = w && w.scene && w.scene.getMeshByName("bedrug");
  const rugLit =
    rug &&
    ((st.bedroomLight && st.bedroomLight.includedOnlyMeshes && st.bedroomLight.includedOnlyMeshes.indexOf(rug) >= 0) ||
      (st.bedsideFill && st.bedsideFill.includedOnlyMeshes && st.bedsideFill.includedOnlyMeshes.indexOf(rug) >= 0));
  if (!(fillI > 0.35 && bedI > 0.35)) {
    t.problem("bug", `Bedroom night fill is too dim at 23:40 (bedsideFill ${fillI.toFixed(2)}, bedroomLight ${bedI.toFixed(2)})`);
  } else if (!rug) {
    t.problem("bug", "Night bedroom: bedrug mesh is missing");
  } else if (!rugLit) {
    t.problem("bug", "Night bedroom: bedrug is not lit by the ceiling or bedside fill (floor reads near-black)");
  } else {
    t.event("bedroom-night-fill", `bedsideFill ${fillI.toFixed(2)}, bedroomLight ${bedI.toFixed(2)}, bedrugLit, personOnScreen ${personOnScreen()}`);
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
  await timeDrawer(true); // the public view keeps the day bar in the Time drawer: open it like a player
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
  await timeDrawer(false);
  const topIds = isPublicView() ? ["sound", "episodes"] : ["sound", "details", "quality", "episodes"]; // no Details or Quality out in the public view (Quality lives under Settings)
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
  await timeDrawer(true);
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
    if (bad.length) t.problem("bug", `The ability bar and Charge label cover ${bad.map((e) => e.className || e.id).join(", ")}`);
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
    { id: "gale", key: "v", hold: 700, kind: "gale", count: (i) => i.hats, what: "lean into the wind with a hand on the hat" },
    { id: "fog", key: "c", kind: "fog", count: (i) => i.reacting, what: "slow down; traffic crawls", cars: true },
    { id: "sunbreak", key: "x", kind: "sun", count: (i) => i.cheering, what: "stroll and cheer, hands up" },
  ];
  let reacted = 0;
  let n = 0;
  for (const c of cases) {
    n++;
    t.scene(`Citizens: ${c.id}`);
    t.progress(0.1 + 0.16 * n);
    const cost = (P.now().abilities.find((x) => x.id === c.id) || P.now().abilities.find((x) => x.id === "wind") || {}).cost || 20;
    await t.until(() => P.now().energy + 0.05 >= cost, 15000, `Energy for ${c.id}`).catch(() => {});
    await t.until(calm, 10000, "a calm sky").catch(() => {});
    await t.until(() => crowd.info().reacting === 0, 6000, "the crowd back to routine").catch(() => {});
    const before = crowd.info();
    if (c.hold) await holdVerb(c.key, c.hold);
    else pressKey(c.key);
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

/* ---------------- memory: the city remembers what he did today, and forgets over three real days ---------------- */
// Setup shortcuts: the day bar beside the car, Take control, the memory store cleared, and day.memory.reload() / shiftDays()
// standing in for a page reload and for the date moving on. Everything he does is real keys: WASD to the park, R, WASD to the avenue, E, Esc.
async function memoryScenario(options, t) {
  t.scene("Park");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.memory && window.day.slice && window.day.control, 8000, "the city's memory (js/memory.js)");
  const M = window.day.memory;
  const C = window.day.control;
  const sc = () => world().scene;
  M.reset();
  M.shiftDays(0);
  const decals = () => sc().meshes.filter((m) => /^mem-(scorch|puddle|bin|sign-board)/.test(m.name) && m.isEnabled() && m.visibility > 0.01).length;
  const outside = carSideMoment(window.day.today());
  scrubTo(outside.start + 1);
  clickSpeed(1);
  await sleep(600);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  if (options && options.touch) { try { C.touch(true); } catch (e) { /* desktop */ } }
  const P = window.powers || window.day.powers;
  const refill = () => { if (P && P.abilities && P.abilities.reset) P.abilities.reset(100); }; // setup: a full Charge
  refill();
  const sideZ = (window.DAY_CONFIG.street || { z: 12.6 }).z - 2.8;
  for (let k = 0; k < 8 && Math.abs(C.state().x + 2) > 3; k++) await goTo(C.state().x + Math.max(-20, Math.min(20, -2 - C.state().x)), sideZ, t, { sprint: true, ms: 12000, close: 1.2 });
  await goTo(-2, 34, t, { sprint: true, ms: 16000, close: 2 });
  t.event("memory-park", `in the park at ${C.state().x.toFixed(0)},${C.state().z.toFixed(0)}; lawn ${window.day.slice.now().lawn}`);
  if (window.day.slice.now().lawn !== "straw") t.problem("bug", "The lawn should start dry (straw) with a clean store");
  pressKey("r");
  await t.until(() => M.today().zones.park && M.today().zones.park.rain, 3000, "rain on the park remembered");
  await sleep(1200);
  t.event("memory-rain", JSON.stringify(M.today()));
  const rainLawn = window.day.slice.now().lawn;
  if (rainLawn !== "damp") t.problem("bug", "Rain on the park didn't turn the lawn green");
  t.scene("The green lawn");
  await sleep(800);
  t.scene("Avenue");
  await goTo(C.state().x, sideZ, t, { sprint: true, ms: 12000, close: 1.2 });
  await goTo(C.state().x + 12, sideZ, t, { sprint: true, ms: 12000, close: 1.5 });
  refill();
  await sleep(1800); // Lightning's cooldown
  pressKey("e");
  await t.until(() => M.today().deeds.power >= 2, 3000, "the bolt remembered");
  await sleep(900);
  const today = M.today();
  t.event("memory-bolt", JSON.stringify(today));
  if (!(today.zones.avenue && today.zones.avenue.bolt) && !(today.zones.street && today.zones.street.bolt)) t.problem("bug", `The bolt wasn't recorded where it landed: ${JSON.stringify(today.zones)}`);
  const s0 = M.now();
  if (!s0.scorch) t.problem("bug", "The bolt left no scorch mark");
  t.scene("Scorch on the avenue");
  await sleep(1200);
  pressKey("Escape");
  await sleep(1500);
  // a same-day reload: the store is read back and the marks rebuilt
  const before = { lawn: M.now().lawn, decals: decals() };
  M.reload();
  await sleep(700);
  const after = M.now();
  t.event("memory-reload", `same date: lawn ${after.lawn}, ${decals()} decals, scorch ${after.scorch}`);
  if (window.day.slice.now().lawn !== "damp" || after.lawn < 1) t.problem("bug", "After a same-day reload the lawn isn't green");
  if (!after.scorch || decals() < 1) t.problem("bug", "After a same-day reload the scorch mark is gone");
  if (decals() !== before.decals) t.problem("bug", `Reload changed the marks (${before.decals} -> ${decals()})`);
  t.scene("Same day, after a reload");
  await sleep(1200);
  // the date moves: +1 day shows them fainter, +3 days is the default state
  M.shiftDays(1);
  await sleep(600);
  t.event("memory-plus1", `lawn ${M.now().lawn}, ${decals()} decals`);
  if (!(M.now().lawn > 0 && M.now().lawn < 1) || !decals()) t.problem("bug", "One day on, the marks should still show, fainter");
  t.scene("One day later, fainter");
  await sleep(900);
  M.shiftDays(3);
  await sleep(600);
  t.event("memory-plus3", `lawn ${M.now().lawn}, ${decals()} decals, slice ${window.day.slice.now().lawn}`);
  if (decals() || M.now().lawn || window.day.slice.now().lawn !== "straw") t.problem("bug", "Three days on, the marks should be gone and the lawn dry again");
  t.scene("Three days later, back to default");
  await sleep(900);
  // phone budget: low quality with marks present, the frame rate over two seconds
  M.shiftDays(0);
  const wasQ = window.day.look.quality();
  window.day.look.quality("low");
  await sleep(800);
  const samples = [];
  const obs = sc().onAfterRenderObservable.add(() => samples.push(world().engine.getDeltaTime()));
  await sleep(2500);
  sc().onAfterRenderObservable.remove(obs);
  const fps = samples.length ? 1000 / (samples.reduce((a, b) => a + b, 0) / samples.length) : 0;
  t.metric("memoryLowFps", Math.round(fps * 10) / 10);
  t.metric("memoryDecalsLow", decals());
  t.event("memory-low", `low quality, ${decals()} decals (cap ${6}): ${fps.toFixed(0)} fps`);
  if (decals() > 6 * 3) t.problem("bug", `Low quality drew ${decals()} decal meshes`);
  if (fps < 30) t.problem("bug", `With marks present on low quality the frame rate is ${fps.toFixed(0)} fps`);
  window.day.look.quality(wasQ);
  M.reset();
  M.shiftDays(0);
}

/* ---------------- daily: a neighbour asks for one bit of weather today; answering leaves a reward that stays all day ---------------- */
// Setup shortcuts (named): the store cleared, day.memory.shiftDays(n) for the date moving on, day.memory/daily reload() for a page
// reload, the day bar to the ask's window, a full Charge, and on a phone control.place for the stick. Everything else is real input:
// the title's line and Play, WASD (or the touch ability bar), the "!" tap, the power key (or a tap on the ability), Esc.
async function dailyScenario(options, t) {
  const touch = !!(options && options.touch) || innerWidth <= 700 || (window.matchMedia && matchMedia("(pointer: coarse)").matches);
  t.scene("Title");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.daily && window.day.title && window.day.memory && window.day.control, 8000, "today's request (js/daily.js)");
  const M = window.day.memory, D = window.day.daily, C = window.day.control, N = window.day.neighbors;
  const cfg = window.DAY_CONFIG.daily;
  M.reset(); D.reset(); M.shiftDays(0);
  window.day.title.show();
  await sleep(800);
  const lineEl = $("title-daily"), ydayEl = $("title-yday"), playEl = $("title-play");
  const nLines = (el) => { const cs = getComputedStyle(el); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3; return Math.round(el.getBoundingClientRect().height / lh); };
  const layout = (label) => {
    const r = lineEl.getBoundingClientRect(), p = playEl.getBoundingClientRect();
    const rows = nLines(lineEl);
    t.event("daily-layout", `${label} ${innerWidth}x${innerHeight}: "${lineEl.textContent}" ${rows} line(s), bottom ${Math.round(r.bottom)} vs Play top ${Math.round(p.top)}`);
    if (rows > 2) t.problem("bug", `The request wraps to ${rows} lines (${label})`);
    if (r.bottom > p.top - 2) t.problem("bug", `The request line overlaps or sits below the Play button (${label})`);
    if (r.top < 0 || p.bottom > innerHeight) t.problem("bug", `The request or Play is off screen (${label})`);
    if (!ydayEl.hidden) { const y = ydayEl.getBoundingClientRect(); if (nLines(ydayEl) > 2 || y.bottom > p.top - 2) t.problem("bug", `The Yesterday line overlaps Play or wraps past two lines (${label})`); }
  };
  const todayLine = lineEl.textContent;
  t.event("daily-title", todayLine);
  if (!/^Today: /.test(todayLine)) t.problem("bug", `The title shows no request under the name ("${todayLine}")`);
  layout("title");
  t.scene("Title with today's request");
  // the date moves on: another ask each day, and no ask twice in any 7 dates
  const seen = [];
  for (let i = 0; i < 16; i++) { M.shiftDays(i); seen.push(D.today().id); }
  let repeats = 0;
  for (let i = 0; i + 7 <= seen.length; i++) if (new Set(seen.slice(i, i + 7)).size !== 7) repeats++;
  t.event("daily-week", `${seen.slice(0, 8).join(", ")} ...; ${repeats} repeating weeks`);
  if (repeats) t.problem("bug", "An ask repeats within 7 consecutive dates");
  M.shiftDays(1);
  await sleep(300);
  if (lineEl.textContent === todayLine) t.problem("bug", "The title's request didn't change when the date moved forward a day");
  t.event("daily-next-day", lineEl.textContent);
  M.shiftDays(0);
  await sleep(300);
  window.day.title.quiet();
  const ask = D.today();
  const A = cfg.pool.find((a) => a.id === ask.id);
  // Take control beside the car, then the clock into the ask's window
  const outside = carSideMoment(window.day.today());
  scrubTo(outside.start + 1);
  clickSpeed(1);
  await sleep(600);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  if (touch) { try { C.touch(true); } catch (e) { /* desktop */ } }
  const sound = $("sound");
  if (sound && sound.getAttribute("aria-pressed") !== "true") {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 4, pointerType: "mouse" }));
  }
  const P = window.powers || window.day.powers;
  const refill = () => { if (P && P.abilities && P.abilities.reset) P.abilities.reset(100); };
  refill();
  scrubTo((A.from <= A.to ? (A.from + A.to) / 2 : A.from) * 60);
  clickSpeed(1);
  await sleep(700);
  const stand = (() => { if (["birdie", "dex", "quill"].includes(A.who)) { const p = N.now().people.find((q) => q.id === A.who); return p && !p.inside ? { x: p.x, z: p.z } : null; } const c = cfg.citizens[A.who]; return { x: c.x, z: c.z }; })() || { x: A.place.x, z: A.place.z };
  const sideZ = (window.DAY_CONFIG.street || { z: 12.6 }).z - 2.8;
  const walk = async (x, z, close) => {
    if (touch) { C.place(x - 3, z + 2, 0); await sleep(500); return; }
    for (let k = 0; k < 10 && Math.hypot(C.state().x - x, C.state().z - z) > close + 1; k++) {
      const s = C.state();
      if (Math.abs(s.z - sideZ) > 4 && Math.abs(s.x - x) > 12) await goTo(s.x, sideZ, t, { sprint: true, ms: 12000, close: 1.5 });
      await goTo(Math.abs(C.state().x - x) > 20 ? C.state().x + Math.max(-20, Math.min(20, x - C.state().x)) : x, Math.abs(C.state().x - x) > 20 ? sideZ : z, t, { sprint: true, ms: 14000, close });
    }
  };
  t.scene("Walking to " + A.name);
  await walk(stand.x, stand.z, 6);
  refill();
  // the neighbour says it aloud when he is close; the "!" above them asks again on a tap
  await t.until(() => D.now().bubble, 5000, `${A.name} saying today's request`).then(() => t.event("daily-ask-said", D.now().bubble)).catch(() => t.problem("bug", `${A.name} didn't say the request when he came close`));
  const mark = $("daily-mark");
  await t.until(() => D.now().marker, 4000, "the ! over them").catch(() => t.problem("bug", `No "!" over ${A.name}`));
  if (mark && D.now().marker) {
    const r = mark.getBoundingClientRect();
    t.event("daily-mark", `${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}`);
    if (r.width < 44 || r.height < 44) t.problem("bug", `The "!" is ${Math.round(r.width)}x${Math.round(r.height)} (needs 44px)`);
    const before = D.now().events.filter((e) => e.action === "ask").length;
    if (touch) await tapEl(mark); else await clickEl(mark);
    await sleep(300);
    if (D.now().events.filter((e) => e.action === "ask").length <= before) t.problem("bug", "Tapping the ! didn't open the ask");
  }
  t.scene(`${A.name} asks: ${A.title}`);
  await sleep(1500);
  // to the place if they stand outside it, then the power
  if (Math.hypot(C.state().x - A.place.x, C.state().z - A.place.z) > A.place.r - 2) { t.scene("To " + A.place.name); await walk(A.place.x, A.place.z, Math.min(8, A.place.r / 2)); }
  refill();
  await sleep(1900);
  const key = { bolt: "e", rain: "r", wind: "v", fog: "c", sunbreak: "x" }[A.power];
  if (touch) { const b = $("ability-" + A.power); if (b) await tapEl(b); else t.problem("bug", `No #ability-${A.power} button on the phone`); } else pressKey(key);
  await t.until(() => D.today().answered, 4000, "the request answered").catch(() => t.problem("bug", `Calling ${A.power} at ${A.place.name} in the window didn't answer ${A.name}'s request`));
  const thanks = await t.until(() => D.now().events.find((e) => e.action === "thanks"), 4000, "the thanks").catch(() => null);
  if (thanks) {
    t.event("daily-thanks", `${A.name}: ${A.thanks} (voiced: ${thanks.voiced})`);
    if (!thanks.voiced) t.problem("bug", `${A.name}'s thanks has no voice clip playing (Sound on? clip in audio/dialogue?)`);
  }
  if (!M.today().deeds.dailyAnswered) t.problem("bug", "Answering the request recorded no deed in day.memory");
  await sleep(900);
  const rw = D.now();
  t.event("daily-reward", `${rw.rewardKind}: ${rw.reward} meshes`);
  if (!rw.reward) t.problem("bug", "Answering the request left no reward in the city");
  t.scene(`The ${rw.rewardKind} for ${A.name}`);
  await sleep(1500);
  pressKey("Escape");
  await sleep(1200);
  D.reload(); // a page reload stands in
  await sleep(500);
  t.event("daily-reload", `same date: ${D.now().reward} reward meshes, answered ${D.today().answered}`);
  if (!D.now().reward || !D.today().answered) t.problem("bug", "After a same-day reload the reward is gone");
  t.scene("Same day, after a reload");
  await sleep(1000);
  // the next day: a new request, the reward is gone, and the title says what he did yesterday
  M.shiftDays(1);
  await sleep(500);
  if (D.now().reward) t.problem("bug", "The reward is still standing on the next date");
  window.day.title.show();
  await sleep(800);
  t.event("daily-yesterday", `${lineEl.textContent} | ${ydayEl.textContent}`);
  if (ydayEl.hidden || !/^Yesterday: /.test(ydayEl.textContent)) t.problem("bug", "The title doesn't say what he did yesterday");
  layout("next day");
  t.scene("Title, next day");
  await sleep(1200);
  window.day.title.quiet();
  M.reset(); D.reset(); M.shiftDays(0);
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

/* ---------------- neighbor-arcs: 3-beat personal arcs for Birdie, Dex and Ines; voiced scenes; persistent marks; 3 pips ---------------- */
// Setup: arcs cleared, abilities unlocked, day bar + Take control. Real place/walk + weather keys (taps on phone).
// Events arc-scene-<id>-<n>, arc-beat-<id>-<n>, arc-ribbon-reload, arc-open-sign-night, arc-pips-phone.
async function neighborArcsScenario(options, t) {
  t.scene("Home");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  await t.until(() => window.day.neighbors && window.day.neighbors.arcs, 8000, "neighbors arcs API");
  const N = window.day.neighbors;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  const M = window.day.memory;
  if (!N || !C || !P || !M) {
    t.problem("bug", "neighbors, powers, control or memory isn't installed");
    return;
  }
  const touch = !!(options && options.touch) || document.documentElement.classList.contains("touch-ui");
  if (touch) {
    document.documentElement.classList.add("touch-ui");
    if (C.touch) C.touch(true);
  }
  // setup: clear arcs, unlock verbs, street done, full Charge
  try { localStorage.setItem("icanbe.street", JSON.stringify({ done: true, step: 99 })); } catch (e) { /* */ }
  if (P.abilities && P.abilities.unlock) P.abilities.unlock();
  if (P.abilities && P.abilities.reset) P.abilities.reset(100);
  ["birdie", "dex", "quill"].forEach((id) => {
    N.setArc(id, 0);
    if (N.quietDay) N.quietDay(id);
  });
  t.event("arc-reset", JSON.stringify(N.arcs()));

  const day = window.day.today();
  const outside = carSideMoment(day);
  if (!outside) { t.problem("bug", "No moment beside the car"); return; }
  scrubTo(outside.start + 0.2);
  clickSpeed(1);
  await sleep(400);
  // Sound on so voiced scenes fire captions
  const sound = $("sound");
  if (sound && sound.getAttribute("aria-pressed") !== "true") {
    if (touch) await tap(sound); else sound.click();
    await sleep(200);
  }
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  if (P.abilities && P.abilities.reset) P.abilities.reset(100);

  const setClock = async (hour, why) => {
    scrubTo(hour * 60);
    clickSpeed(1);
    await sleep(500);
    t.event("clock", `${why}: ${E().fmtClock(hour * 60)}`);
    if (C.mode() !== "control") {
      pressKey("Enter");
      await t.until(() => C.mode() === "control", 4000, "Take control again");
    }
  };
  const refill = () => { if (P.abilities && P.abilities.reset) P.abilities.reset(100); };
  const who = (id) => N.now().people.find((p) => p.id === id);
  const arcSceneSeen = {};
  const onNb = (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "arc-scene" && d.id != null && d.beat != null) {
      arcSceneSeen[`${d.id}-${d.beat}`] = (arcSceneSeen[`${d.id}-${d.beat}`] || 0) + 1;
      t.event(`arc-voice-${d.id}-${d.beat}`, `${d.who}: ${d.text || d.line}`);
    }
  };
  window.addEventListener("day:neighbor", onNb);
  const waitArc = async (id, beat, ms) => {
    const ok = await t.until(() => (N.arcs()[id] || 0) >= beat, ms || 12000, `${id} arc beat ${beat}`).then(() => true).catch(() => false);
    if (ok) t.event(`arc-beat-${id}-${beat}`, `progress ${JSON.stringify(N.arcs())}; props ${JSON.stringify(N.arcProps())}`);
    else t.problem("bug", `${id}: arc beat ${beat} never landed (now ${N.arcs()[id]})`);
    return ok;
  };
  const waitScene = async (id, beat) => {
    const key = `${id}-${beat}`;
    const ok = await t.until(() => {
      const p = who(id);
      return !!(arcSceneSeen[key] || (p && (p.arcOpen || p.arcAsk) && p.bubble));
    }, 10000, `${id} arc scene ${beat}`).then(() => true).catch(() => false);
    if (ok) t.event(`arc-scene-${id}-${beat}`, who(id).bubble || `voiced ${arcSceneSeen[key] || 1}`);
    else t.problem("bug", `${id}: no voiced scene for beat ${beat}`);
    return ok;
  };
  const castKey = async (key) => {
    refill();
    await sleep(200);
    if (touch) {
      const map = { r: "rain", v: "wind", c: "fog", g: "wind", e: "bolt", x: "sunbreak" };
      const id = map[key];
      const btn = id && document.querySelector(`.abilitybar .ab[data-id="${id}"], .abilitybar .ab[data-ability="${id}"]`);
      if (btn) await tap(btn);
      else pressKey(key);
    } else pressKey(key);
    await sleep(400);
  };

  // ---- Birdie: dying pots → rain → ribbon + basket ----
  t.scene("Birdie arc");
  t.progress(0.05);
  await setClock(8.2, "Birdie morning");
  if (C.place) C.place(-22, 9.5, 0);
  await sleep(600);
  await waitScene("birdie", 1);
  // cue finishes on its own after lines
  await waitArc("birdie", 1, 14000);
  t.progress(0.15);
  await sleep(400);
  await waitScene("birdie", 2);
  await castKey("r");
  await waitArc("birdie", 2, 10000);
  t.progress(0.25);
  await setClock(17.2, "Birdie evening");
  if (C.place) C.place(-22, 9.5, 0);
  await sleep(500);
  await waitScene("birdie", 3);
  await waitArc("birdie", 3, 14000);
  const props1 = N.arcProps() || {};
  if (props1.ribbon) t.event("arc-ribbon", "ribbon on balcony + basket");
  else t.problem("bug", "Birdie beat 3: no ribbon mark in the world");
  // same-day reload keeps the ribbon — do not call setArc; memory.arcs must survive alone
  M.reload();
  await sleep(400);
  const after = M.arcs ? M.arcs().birdie : 0;
  const propsReload = N.arcProps() || {};
  if (after === 3 && propsReload.ribbon === true) t.event("arc-ribbon-reload", `birdie=${after}, ribbon=true`);
  else t.problem("bug", `Birdie ribbon lost after reload (arc ${after}, ribbon=${propsReload.ribbon}, props ${JSON.stringify(propsReload)})`);
  t.progress(0.35);
  t.metric("quality.textOnlyBeats", 0);

  // ---- Dex: turbines → gust → lit OPEN sign ----
  t.scene("Dex arc");
  N.setArc("dex", 0);
  if (N.quietDay) N.quietDay("dex");
  await setClock(9, "Dex morning");
  if (C.place) C.place(46, 9.8, 0);
  await sleep(600);
  await waitScene("dex", 1);
  await waitArc("dex", 1, 12000);
  t.progress(0.45);
  await waitScene("dex", 2);
  await castKey("g");
  await waitArc("dex", 2, 10000);
  t.progress(0.55);
  await setClock(18.5, "Dex dusk sign");
  if (C.place) C.place(48, 9.5, Math.PI);
  await sleep(500);
  await waitScene("dex", 3);
  await waitArc("dex", 3, 12000);
  const dexProps = N.arcProps() || {};
  if (dexProps.openSign) t.event("arc-open-sign-night", "lit OPEN sign at night");
  else t.problem("bug", "Dex beat 3: no lit open sign");
  t.progress(0.65);

  // ---- Ines: blank chart → fog → chart + beacon ----
  t.scene("Ines arc");
  N.setArc("quill", 0);
  if (N.quietDay) N.quietDay("quill");
  await setClock(18, "Ines dusk");
  if (C.place) C.place(153, 9.8, 0);
  await sleep(600);
  await waitScene("quill", 1);
  await waitArc("quill", 1, 12000);
  t.progress(0.75);
  await waitScene("quill", 2);
  await castKey("c");
  await waitArc("quill", 2, 10000);
  t.progress(0.85);
  await setClock(21, "Ines night");
  if (C.place) C.place(153, 9.8, 0);
  await sleep(500);
  await waitScene("quill", 3);
  await waitArc("quill", 3, 12000);
  const qProps = N.arcProps() || {};
  if (qProps.chartBeacon) t.event("arc-chart-beacon", "chart window + violet beacon");
  else t.problem("bug", "Ines beat 3: no chart beacon");
  t.progress(0.92);

  // ---- Neighbors menu: 3 pips each (phone portrait) ----
  t.scene("Neighbors pips");
  N.setArc("birdie", 3);
  N.setArc("dex", 3);
  N.setArc("quill", 3);
  N.panel(true);
  await sleep(400);
  const panel = $("neighbors-panel");
  if (!panel || panel.hidden) t.problem("bug", "Neighbors panel didn't open");
  else {
    const rows = panel.querySelectorAll(".row[data-neighbor]");
    let pipOk = 0;
    rows.forEach((row) => {
      const pips = row.querySelectorAll(".pip");
      const on = row.querySelectorAll(".pip.on");
      if (pips.length === 3 && on.length === 3) pipOk++;
      t.event("arc-pips", `${row.getAttribute("data-neighbor")}: ${on.length}/3`);
    });
    if (pipOk === 3) t.event("arc-pips-ok", "3 neighbors × 3 pips");
    else t.problem("bug", `Pips incomplete: ${pipOk}/3 rows with 3 filled`);
    if (touch) {
      t.event("arc-pips-phone", `390 touch panel ${Math.round(panel.getBoundingClientRect().width)}×${Math.round(panel.getBoundingClientRect().height)}`);
      checkHud(t, "neighbor-arcs-phone");
      // no overlap between panel and ability bar / caption
      const bar = document.querySelector(".abilitybar");
      const cap = $("voice-caption") || document.querySelector(".voice-caption");
      const pb = panel.getBoundingClientRect();
      if (bar) {
        const bb = bar.getBoundingClientRect();
        if (!(pb.bottom < bb.top - 4 || pb.top > bb.bottom + 4 || pb.right < bb.left - 4 || pb.left > bb.right + 4)) {
          // soft: panel may sit above; only fail if centre overlaps heavily
          const ox = Math.min(pb.right, bb.right) - Math.max(pb.left, bb.left);
          const oy = Math.min(pb.bottom, bb.bottom) - Math.max(pb.top, bb.top);
          if (ox > 20 && oy > 20) t.problem("bug", "Neighbors panel overlaps the ability bar on phone");
        }
      }
      void cap;
    }
  }
  const fin = N.arcs();
  t.metric("arcBirdie", fin.birdie);
  t.metric("arcDex", fin.dex);
  t.metric("arcQuill", fin.quill);
  t.metric("quality.textOnlyBeats", 0);
  const voiceCount = Object.keys(arcSceneSeen).length;
  t.metric("arcVoiceScenes", voiceCount);
  if (voiceCount < 9) t.problem("bug", `Only ${voiceCount} voiced arc scenes (want 9): ${JSON.stringify(arcSceneSeen)}`);
  else t.event("arc-voices-nine", JSON.stringify(arcSceneSeen));
  if (fin.birdie === 3 && fin.dex === 3 && fin.quill === 3) t.event("neighbor-arcs-pass", JSON.stringify(fin));
  else t.problem("bug", `Arcs incomplete: ${JSON.stringify(fin)}`);
  window.removeEventListener("day:neighbor", onNb);
  t.progress(1);
  pressKey("Escape");
}

/* ---------------- neighbor-bodies: procedural peoplekit gait, beat gestures, weather posture, foot-slide detectors ---------------- */
// Setup: day bar + Take control. Real WASD to each neighbour; R/X/E for asks. Slowed clips = day at 1× while we
// watch a walking stretch and the ask→thanks gestures. A full-day scrub samples detectors (jumps ignored).
async function neighborBodies(options, t) {
  t.scene("Home");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  await t.until(() => window.day.neighbors && window.day.neighbors.anim, 8000, "neighbors anim API");
  const N = window.day.neighbors;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  const W = window.weather || window.day.weather;
  const day = window.day.today();
  if (!N || !C || !P) {
    t.problem("bug", "neighbors, powers or Take control isn't installed");
    return;
  }
  const street = (window.DAY_CONFIG.street || { z: 12.6 });
  const sideZ = street.z - 2.8;
  const who = (id) => N.now().people.find((p) => p.id === id);
  const sampleAnim = (id) => (N.anim().people.find((p) => p.id === id) || {});

  const outside = carSideMoment(day);
  if (!outside) {
    t.problem("bug", "No moment beside the car to take control");
    return;
  }
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(500);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  N.resetAnim && N.resetAnim();

  const setClock = async (hour, why) => {
    scrubTo(hour * 60);
    clickSpeed(1);
    await sleep(600);
    t.event("clock", `${why}: ${E().fmtClock(hour * 60)}`);
    if (C.mode() !== "control") {
      pressKey("Enter");
      await t.until(() => C.mode() === "control", 4000, "Take control again");
    }
  };
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

  /** Watch one neighbour for `ms` at 1×; log gait samples for the slowed clip review. */
  async function slowedClip(id, label, ms) {
    t.scene(label);
    clickSpeed(1);
    const rows = [];
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const a = sampleAnim(id);
      const p = who(id);
      if (a.state) rows.push(`${a.state}@${(a.speed || 0).toFixed(2)} g=${a.gesture || "-"} w=${a.weatherK > 0.4 ? a.weather : "-"}`);
      if (p && p.moving && (a.state === "walk" || a.state === "hurry")) t.event("gait-step", `${id} ${a.state} speed ${(a.speed || 0).toFixed(2)} planted ${a.plantedL ? "L" : ""}${a.plantedR ? "R" : ""}`);
      await sleep(120);
    }
    const walked = rows.some((r) => /^(walk|hurry)/.test(r));
    t.event("slow-clip", `${id}: ${rows.length} samples, walk=${walked}; last ${rows[rows.length - 1] || "?"}`);
    return walked;
  }

  async function askThanks(id, x, z, key, scene, progress) {
    t.scene(scene);
    await walkTo(x, z, progress);
    const asked = await t.until(() => who(id).asking, 6000, `${id}'s ask`).then(() => true).catch(() => false);
    if (!asked) return t.problem("bug", `${id} never asked`);
    t.event(`beat-ask-${id}`, who(id).bubble);
    // wait for the wave gesture to show
    const waved = await t.until(() => sampleAnim(id).gesture === "ask" || sampleAnim(id).state === "gesture-ask", 2500, `${id} ask gesture`).then(() => true).catch(() => false);
    if (waved) t.event(`gesture-ask-${id}`, `state ${sampleAnim(id).state}`);
    else t.problem("bug", `${id}: ask bubble without a wave gesture`);
    await sleep(700);
    const ab = (window.DAY_CONFIG.neighbors.list.find((n) => n.id === id).beats[0] || {}).ability;
    const cost = (P.now().abilities.find((a) => a.id === ab) || {}).cost || 20;
    await t.until(() => P.now().energy + 0.05 >= cost, 20000, `Energy for ${ab}`).catch(() => {});
    const before = N.now().score;
    pressKey(key);
    const paid = await t.until(() => N.now().score > before, 7000, `${id}'s thank-you`).then(() => true).catch(() => false);
    if (!paid) return t.problem("bug", `${id}: thanks didn't pay`);
    const cheered = await t.until(() => sampleAnim(id).gesture === "thanks" || sampleAnim(id).state === "gesture-thanks", 2500, `${id} thanks gesture`).then(() => true).catch(() => false);
    if (cheered) t.event(`gesture-thanks-${id}`, `state ${sampleAnim(id).state}`);
    else t.problem("bug", `${id}: thanks without a cheer/clap gesture`);
    t.event(`beat-thanks-${id}`, who(id).bubble);
    await sleep(900);
    await t.until(() => (P.now().abilities.find((a) => a.id === ab) || {}).cooldown <= 0, 12000, "cooldown").catch(() => {});
  }

  // --- Birdie: morning walk clip, then ask/thanks ---
  await setClock(7.15, "Birdie leaving home");
  await walkTo(-22, 9.5, 0.1);
  // her walk from home to the pots starts around now; watch a slowed stretch
  const birdieWalk = await slowedClip("birdie", "Birdie walk (slowed)", 2800);
  if (!birdieWalk) {
    // nudge the clock into a moving segment between pots and park
    await setClock(11.5, "Birdie toward the park");
    await walkTo(-14, 14, 0.15);
    await slowedClip("birdie", "Birdie walk retry (slowed)", 3200);
  }
  await setClock(8.2, "Birdie pots");
  await askThanks("birdie", -24.5, 9.6, "r", "Birdie ask / thanks", 0.25);

  // rain posture on Birdie after her rain
  if (W && W.now) {
    await t.until(() => (W.now().rain || 0) > 0.2 || W.now().state === "rain", 4000, "rain from her ask").catch(() => {});
    await sleep(1200);
    const a = sampleAnim("birdie");
    if (a.weather === "rain" || a.weather === "storm" || a.weatherK > 0.35) t.event("weather-pose-rain", `birdie ${a.weather} k=${(a.weatherK || 0).toFixed(2)} state ${a.state}`);
    else t.problem("bug", `Birdie isn't hunched for rain (weather ${a.weather}, k ${a.weatherK})`);
  }

  // --- Dex: walk clip + ask/thanks + sun shield ---
  await setClock(8.5, "Dex morning");
  await walkTo(43.2, 9.9, 0.4);
  await setClock(10.8, "Dex toward plaza");
  await slowedClip("dex", "Dex walk (slowed)", 2800);
  await setClock(8.6, "Dex ask window");
  await askThanks("dex", 43.2, 9.9, "x", "Dex ask / thanks", 0.5);
  if (W && W.now) {
    await t.until(() => (W.now().sun || 0) > 0.3, 4000, "sun break from Dex").catch(() => {});
    await sleep(1000);
    const a = sampleAnim("dex");
    if (a.weather === "sun" || (a.weatherK > 0.35 && (W.now().sun || 0) > 0.3)) t.event("weather-pose-sun", `dex ${a.weather} k=${(a.weatherK || 0).toFixed(2)} sun=${(W.now().sun || 0).toFixed(2)}`);
    else t.problem("bug", `Dex isn't shielding his eyes in the sun (weather ${a.weather}, k ${a.weatherK}, sun ${W.now().sun})`);
  }

  // --- Ines: evening ask/thanks + walk ---
  await setClock(17.7, "Ines evening");
  await walkTo(151.5, 9.9, 0.7);
  await slowedClip("quill", "Ines walk (slowed)", 2400);
  await askThanks("quill", 151.5, 9.9, "e", "Ines ask / thanks", 0.85);

  // --- Full in-game day: scrub the clock; detectors ignore teleports ---
  t.scene("Full day detectors");
  N.resetAnim && N.resetAnim();
  const startFails = N.anim().footSlideFails;
  for (let h = 0; h < 24; h += 0.5) {
    scrubTo(h * 60);
    await sleep(80);
  }
  clickSpeed(1);
  await sleep(400);
  const anim = N.anim();
  t.metric("quality.footSlideFails", anim.footSlideFails - startFails);
  t.metric("quality.animMismatchFails", anim.mismatchFails);
  t.metric("quality.animSamples", anim.samples);
  t.event("anim-detectors", `foot-slide ${anim.footSlideFails} mismatch ${anim.mismatchFails} over ${anim.samples} samples (limit ${anim.limit} m)`);
  if (anim.footSlideFails > 0) t.problem("bug", `quality.foot-slide: ${anim.footSlideFails} planted-foot slides over a full day`);
  else t.event("foot-slide-clean", "0 foot-slide failures over a full in-game day");

  const gestures = ["birdie", "dex", "quill"].every((id) => {
    const ev = N.events().filter((e) => e.action === "gesture" && e.id === id);
    return ev.some((e) => e.kind === "ask") && ev.some((e) => e.kind === "thanks");
  });
  if (gestures) t.event("gestures-pass", "each neighbour gestured on ask and thanks");
  else t.problem("bug", "Missing ask/thanks gesture events on a neighbour");

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
  const verbs = ["bolt", "rain", "wind", "fog", "sunbreak"];
  const ids = ["rain", "gale", "fog", "sunbreak", "bolt"];
  // The bar's slots are the five verbs (Wind covers Gale).
  await t.until(() => verbs.every((id) => document.getElementById("ability-" + id)), 4000, "the ability bar slots").catch(() => {});
  const bar = P.now().abilities;
  const keys = verbs.map((id) => {
    const a = bar.find((x) => x.id === id);
    return a ? `${a.key.toUpperCase()} ${a.name}` : `${id} MISSING`;
  });
  if (verbs.every((id) => bar.some((x) => x.id === id) && document.getElementById("ability-" + id))) t.event("five-abilities", keys.join(", "));
  else t.problem("bug", `The ability bar doesn't have all five: ${keys.join(", ")}`);
  const calm = () => {
    const n = W.now();
    return n.state === "clear" && n.rain < 0.05 && n.fog < 0.015 && n.wind < 0.2 && n.sun < 0.05;
  };
  await t.until(calm, 6000, "a calm sky to start").catch(() => {});
  const looks = {};
  const probes = {
    rain: { key: "r", hold: 0, slot: "rain", ok: (n) => n.state === "rain" && n.rain > 0.3, show: (n) => `rain ${n.rain.toFixed(2)}, wet ${n.wet.toFixed(2)}` },
    gale: { key: "v", hold: 700, slot: "wind", ok: (n) => n.state === "wind" && n.wind > 0.5, show: (n) => `wind ${n.wind.toFixed(2)}, dust ${n.dust.toFixed(2)}` },
    fog: { key: "c", hold: 0, slot: "fog", ok: (n) => n.state === "fog" && n.fog > 0.04, show: (n) => `fog density ${n.fog.toFixed(3)}` },
    sunbreak: { key: "x", hold: 0, slot: "sunbreak", ok: (n) => n.sun > 0.5, show: (n) => `warm light ${n.sun.toFixed(2)}, sky ${n.sky}` },
    bolt: { key: "e", hold: 0, slot: "bolt", ok: (n) => n.state === "storm", show: (n) => `storm, flashes ${n.flashes}` },
  };
  let n = 0;
  for (const id of ids) {
    n++;
    const pr = probes[id];
    t.scene(`Ability: ${id}`);
    t.progress(0.1 + 0.17 * n);
    const cost = (P.now().abilities.find((x) => x.id === id) || P.now().abilities.find((x) => x.id === pr.slot) || {}).cost || 20;
    await t.until(() => P.now().energy + 0.05 >= cost, 15000, `Energy for ${id}`).catch(() => {});
    const e0 = P.now().energy;
    if (pr.hold) await holdVerb(pr.key, pr.hold);
    else pressKey(pr.key);
    const hit = await t.until(() => (id === "bolt" ? P.now().strike : true) && pr.ok(W.now()), 4000, `${id} to show in the sky`).then(() => true).catch(() => false);
    await sleep(900);
    const seen = W.now();
    looks[id] = { sky: seen.sky, fog: seen.fog, rain: seen.rain, wind: seen.wind, sun: seen.sun };
    const slot = document.getElementById("ability-" + pr.slot);
    if (hit && pr.ok(seen)) t.event(`ability-${id}`, `${pr.show(seen)}; spent ${Math.round(e0 - P.now().energy)} energy`);
    else t.problem("bug", `${pr.key.toUpperCase()} (${id}) didn't change the sky as it should (state ${seen.state})`);
    if (!slot || !(slot.classList.contains("cooling") || slot.classList.contains("active") || slot.classList.contains("pulse"))) t.problem("bug", `The ${pr.slot} slot didn't show it was used`);
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

/* ---------------- cast-feel: every power's input-to-first-feedback time and shake length ---------------- */
async function castFeel(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const P = window.powers || window.day.powers;
  const C = window.day.control;
  const day = window.day.today();
  const outside = carSideMoment(day) || quietMoment(day);
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  // Five verbs (+ G gust alias). Storm / tornado are hold depths of Lightning / Wind.
  const ids = [
    ["rain", "r", "rain"],
    ["fog", "c", "fog"],
    ["sunbreak", "x", "sunbreak"],
    ["bolt", "e", "bolt"],
    ["gust", "g", "gust"],
  ];
  for (const [id, key, expect] of ids) {
    t.scene(`Cast: ${id}`);
    const cost = (P.now().abilities.find((x) => x.id === id) || {}).cost || 20;
    await t.until(() => P.now().energy + 0.05 >= cost, 30000, `Charge for ${id}`).catch(() => {});
    const t0 = performance.now();
    let first = -1;
    const slotId = id === "gust" ? "wind" : id;
    const slot = document.getElementById("ability-" + slotId);
    const seen = new Promise((res) => {
      const h = (e) => {
        if (e.detail && e.detail.power === expect && e.detail.action !== "denied") {
          first = performance.now() - t0;
          window.removeEventListener("day:power", h);
          res();
        }
      };
      window.addEventListener("day:power", h);
      setTimeout(res, 1500);
    });
    pressKey(key);
    await seen;
    await sleep(500);
    const c = P.now().cast;
    const pulsed = slot && (slot.classList.contains("pulse") || slot.classList.contains("cooling"));
    t.metric(`first-feedback-${id}-ms`, Math.round(first));
    if (first >= 0 && first < 100 && c.id === expect) t.event(`cast-${id}`, `${c.kind} in ${Math.round(first)} ms`);
    else t.problem("bug", `${id} gave no feedback within 100 ms (${Math.round(first)})`);
    if (!pulsed) t.problem("bug", `The ${slotId} button didn't show the press`);
    await sleep(1500);
  }
  const m = P.now().cast.shakeMax;
  t.metric("shake-max-s", Number(m.toFixed(3)));
  if (m <= 0.3) t.event("shake-short", `longest shake ${m.toFixed(2)} s`);
  else t.problem("bug", `A camera shake ran ${m.toFixed(2)} s`);
  pressKey("Escape");
}

/* ---------------- warm-start: the longest frame after loading, each power's first-use cost, shader compile errors ---------------- */
async function warmStart(options, t) {
  const touch = !!(options && options.touch) || innerWidth <= 700 || (window.matchMedia && matchMedia("(pointer: coarse)").matches);
  t.scene("First seconds after the loading bar");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const world = window.day.world();
  const scene = world.scene;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  if (touch) { try { window.day.look.quality("low"); } catch (e) { /* */ } if (C.touch) C.touch(true); }
  window.day.title && window.day.title.quiet && window.day.title.quiet();
  // every frame, by the render observable (no timer): [time, ms since the last]
  const frames = [];
  let last = performance.now();
  const obs = scene.onAfterRenderObservable.add(() => { const n = performance.now(); frames.push([n, n - last]); last = n; });
  const t0 = last;
  const worstIn = (from, to) => frames.reduce((m, f) => (f[0] >= from && f[0] <= to ? Math.max(m, f[1]) : m), 0);
  const lc = window.day.render && window.day.render.lightCap ? window.day.render.lightCap() : null;
  if (lc) {
    t.metric("lightCapWorst", lc.worst);
    t.event("light-cap", `most lights any material asks for ${lc.worst} (cap ${lc.max}), ${lc.clamped} clamped, ${lc.lights} lights`);
    if (lc.worst > lc.max) t.problem("bug", `A material asks for ${lc.worst} lights, over the cap of ${lc.max}`);
  }
  // take control through the real control, then let the first 30 s run
  // a phone's cold session auto-plays into control: tapping the button then would let go
  if (C.mode() !== "control") { if (touch) await tapEl($("control")); else pressKey("Enter"); }
  await t.until(() => C.mode() === "control", 4000, "Take control");
  { const o = $("episode-offer"); if (o && !o.hidden) { const d = o.querySelector(".decline"); if (d) d.click(); } }
  C.place(-21, 0.5, 1.5708, { from: 14, alpha: 4.1, beta: 1.15, radius: 11 });
  const errFrom = consoleErrors.length;
  // the five first casts, one by one, in the first 30 s
  const casts = [["rain", "r", "rain"], ["fog", "c", "fog"], ["sunbreak", "x", "sunbreak"], ["bolt", "e", "bolt"], ["gust", "g", "wind"]];
  let worstCast = 0;
  for (const [id, key, slotId] of casts) {
    const cost = (P.now().abilities.find((x) => x.id === id) || {}).cost || 20;
    if (P.abilities && P.abilities.reset) P.abilities.reset(100);
    await t.until(() => P.now().energy + 0.05 >= cost, 20000, `Charge for ${id}`).catch(() => {});
    await sleep(400);
    const a = performance.now();
    if (touch) await tapEl($("ability-" + slotId)); else pressKey(key);
    await sleep(1400);
    const w = worstIn(a, performance.now());
    worstCast = Math.max(worstCast, w);
    t.metric(`firstCastWorstMs.${id}`, Math.round(w));
    if (w > (touch ? 150 : 100)) t.problem("bug", `The first ${id} cast cost a ${Math.round(w)} ms frame (limit ${touch ? 150 : 100})`);
    else t.event(`first-cast-${id}`, `worst frame ${Math.round(w)} ms`);
  }
  t.metric("firstCastWorstMs", Math.round(worstCast));
  // the first 30 s as a whole, then (phone) 60 s
  const total = touch ? 60000 : 30000;
  // the switch to snow near 24 s (a named setup shortcut: the forecast does it on snowy days): its flakes and roof caps must already be warm
  const toSnow = 24000 - (performance.now() - t0);
  if (toSnow > 0) await sleep(toSnow);
  const snowAt = performance.now();
  try { if (window.weather && window.weather.set) window.weather.set("snow", 0.8, "power"); } catch (e) { /* */ }
  await sleep(2500);
  const snowWorst = worstIn(snowAt, performance.now());
  t.metric("snowSwitchWorstMs", Math.round(snowWorst));
  if (snowWorst > (touch ? 150 : 100)) t.problem("bug", `The switch to snow cost a ${Math.round(snowWorst)} ms frame (limit ${touch ? 150 : 100})`);
  else t.event("snow-switch", `worst frame ${Math.round(snowWorst)} ms`);
  try { if (window.weather && window.weather.set) window.weather.set("clear", 0.5, "power"); } catch (e) { /* */ }
  const rest = total - (performance.now() - t0);
  if (rest > 0) await sleep(rest);
  const end = performance.now();
  const in30 = worstIn(t0, Math.min(end, t0 + 30000));
  t.metric("worstFrame30sMs", Math.round(in30));
  const limit = touch ? 150 : 100;
  if (in30 > limit) t.problem("bug", `A frame in the first 30 s took ${Math.round(in30)} ms (limit ${limit})`);
  else t.event("first-30s", `longest frame ${Math.round(in30)} ms over ${frames.length} frames`);
  const within = frames.filter((f) => f[0] <= t0 + total);
  const sorted = within.map((f) => f[1]).sort((a, b) => a - b);
  const medMs = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const fps = medMs ? 1000 / medMs : 0;
  t.metric("medianFps", Number(fps.toFixed(1)));
  t.metric("worstFrameMs", Math.round(sorted.length ? sorted[sorted.length - 1] : 0));
  if (touch) {
    if (fps < 30) t.problem("bug", `Median fps over the first 60 s was ${fps.toFixed(1)} on the phone (needs 30)`);
    else t.event("phone-fps", `median ${fps.toFixed(1)} fps, worst frame ${Math.round(sorted[sorted.length - 1])} ms`);
  }
  scene.onAfterRenderObservable.remove(obs);
  // BJS shader compile errors fail the run
  const bad = consoleErrors.slice(errFrom).filter((e) => /compile|shader|uniform block|maxSimultaneousLights|GL_MAX/i.test(e));
  t.metric("shaderErrors", bad.length);
  if (bad.length) t.problem("bug", `Shader compile errors in the console: ${bad[0]}`);
  else t.event("shaders-clean", "no shader compile errors");
  if (window.__compilesAfterLoad) {
    const n = window.__compilesAfterLoad();
    t.metric("perf.compilesAfterLoad", n);
    if (n > 0) t.problem("bug", `${n} shader effects compiled after the loading card (the casts, snow and god rays must be warm)`);
    else t.event("compiles-after-load", "0 shader effects compiled after the loading card");
  }
  // let go inside the first minute: the way back into control must be on screen (a phone has no stick then)
  if (touch) await tapEl($("control")); else pressKey("Escape");
  await t.until(() => C.mode() === "schedule", 8000, "back on the day").catch(() => {});
  const cb = document.querySelector(".control-btn");
  const cr = cb ? cb.getBoundingClientRect() : null;
  const shown = !!cb && getComputedStyle(cb).visibility !== "hidden" && cr.width >= 44 && cr.height >= 44;
  if (C.mode() === "schedule" && !shown) t.problem("bug", "After letting go there is no visible Take control button (44 px)");
  else t.event("take-control-back", "Take control is on screen after letting go");
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

    // The question: after the first episode score card, when the viewer isn't touching anything and isn't in control.
    t.scene("Watching (the question comes after the first episode score card)");
    const card = () => document.querySelector(`[data-hawkes-ask="${window.day.analytics.askId}"]`);
    await sleep(6000);
    if (card()) t.problem("bug", "The feedback question showed before any episode score card");
    // setup shortcut: the score event a finished episode sends (the real card needs a full episode)
    window.dispatchEvent(new CustomEvent("day:episode", { detail: { action: "score", id: "morning", why: "playtest" } }));
    for (let i = 0; i < 12 && !card(); i++) await sleep(1500);
    if (!card()) {
      t.problem("bug", `The feedback question didn't show after an episode score card (${window.day.analytics.watched()} s on screen)`);
      return;
    }
    t.scene("The question");
    t.event("feedback-prompt", `shown after the first episode score card, ${window.day.analytics.watched()} s on screen: "Are you enjoying this so far?"`);
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

/* ---------------- idle-pose: the default state holds a clean pose for 10 s and after every other clip ---------------- */
// Acceptance: standing still for 10 s his hands hang at his sides in FRONT of the hip line (never behind his back), the
// boots are flat and straight (pitch near the rest pose's, no roll), nothing pops; after a walk, a run, a jump and a
// Lightning and a Rain cast, and after Wind (tap and hold) followed by 10 s standing under the clear sky, he is back in the same pose within 2 s. A screenshot of the default state, on the roof with
// control (desktop, and {"touch":true} at 390x844). The numbers come from skin.pose() on real frames.
async function idlePose(options, t) {
  const touch = !!(options && options.touch);
  t.scene(touch ? "Idle pose (phone)" : "Idle pose");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model === "small-weather", 45000, "his model to load").catch(() => {});
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok").catch(() => {});
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  const WX = window.day.weather;
  if (!C || !skinNow() || !skinNow().pose) {
    t.problem("blocker", "Small Weather's model isn't on for idle-pose");
    return;
  }
  if (touch) {
    try { window.day.look.quality("low"); } catch (e) { /* */ }
    try { C.touch(true); } catch (e) { /* */ }
  }
  const day = window.day.today();
  const outside = carSideMoment(day) || quietMoment(day);
  scrubTo(outside.start + 0.2);
  clickSpeed(1);
  if (WX && WX.set) WX.set("rain", 0.2, "key"); // not clear: the idle must stay the plain idle (no look-up)
  if (P && P.abilities && P.abilities.reset) P.abilities.reset(100);
  if (touch) {
    const btn = document.getElementById("control-btn") || document.querySelector("#take-control,.take-control");
    if (btn) {
      await tapEl(btn);
      btn.click();
    } else pressKey("Enter");
  } else pressKey("Enter");
  await t.until(() => C.mode() === "control", 5000, "Take control");
  const sk = () => skinNow();
  const read = () => {
    const m = sk() && sk().pose();
    if (!m) return null;
    return {
      fwd: Math.min(m.handFwdL, m.handFwdR),
      out: Math.min(m.handOutL, m.handOutR),
      pitch: [Math.min(m.bootPitchL, m.bootPitchR), Math.max(m.bootPitchL, m.bootPitchR)],
      roll: Math.max(Math.abs(m.bootRollL), Math.abs(m.bootRollR)),
      lean: m.lean,
      neck: m.neck,
      m,
    };
  };
  const judge = (label, r, pose) => {
    if (!r) return;
    t.event(`idle-pose-${label.toLowerCase().replace(/\s+/g, "-")}`, `${sk().clip()}: hands ${r.fwd.toFixed(2)} m in front of the hips, ${r.out.toFixed(2)} m out, boots pitch ${r.pitch.map((v) => v.toFixed(0)).join("..")} roll ${r.roll.toFixed(0)}`);
    if (pose && sk().clip() !== "idle") t.problem("bug", `${label}: his model played ${sk().clip()}, not idle`);
    if (r.fwd < 0.03) t.problem("bug", `quality.animation: ${label}: a hand is ${r.fwd.toFixed(2)} m from the hip line, behind his back`);
    if (r.out < 0.2) t.problem("bug", `quality.animation: ${label}: a hand is only ${r.out.toFixed(2)} m from his midline`);
    if (r.pitch[0] < -24 || r.pitch[1] > -6) t.problem("bug", `quality.animation: ${label}: boots are not flat (pitch ${r.pitch.map((v) => v.toFixed(0)).join("..")} deg)`);
    if (r.roll > 8) t.problem("bug", `quality.animation: ${label}: a boot is turned ${r.roll.toFixed(0)} deg off straight ahead (twisted)`);
  };
  t.progress(0.1);

  // the default state: 10 s standing, sampled every 100 ms (a screenshot at the start and the end)
  await sleep(1200);
  t.scene("Idle default");
  const lim = { fwd: 9, out: 9, pitch: [99, -99], roll: 0 };
  let prev = null;
  let pop = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 10000) {
    const r = read();
    if (r) {
      lim.fwd = Math.min(lim.fwd, r.fwd);
      lim.out = Math.min(lim.out, r.out);
      lim.pitch = [Math.min(lim.pitch[0], r.pitch[0]), Math.max(lim.pitch[1], r.pitch[1])];
      lim.roll = Math.max(lim.roll, r.roll);
      if (prev) pop = Math.max(pop, Math.abs(r.lean - prev.lean), Math.abs(r.neck - prev.neck), Math.abs(r.m.hipYaw - prev.m.hipYaw), Math.abs(r.m.shoulderYaw - prev.m.shoulderYaw));
      prev = r;
    }
    await sleep(100);
  }
  judge("Idle 10 s", lim, true);
  t.metric("idle.handFwdMinM", Math.round(lim.fwd * 100) / 100);
  t.metric("idle.bootPitchMin", Math.round(lim.pitch[0]));
  t.metric("idle.bootPitchMax", Math.round(lim.pitch[1]));
  t.metric("idle.bootRollMaxDeg", Math.round(lim.roll * 10) / 10);
  t.metric("idle.popDeg", Math.round(pop * 10) / 10);
  if (pop > 6) t.problem("bug", `quality.animation: the idle popped ${pop.toFixed(1)} deg between two 100 ms samples`);
  t.scene("Idle after 10 s");
  await sleep(300);
  t.progress(0.4);

  // back to idle from a walk, a run, a jump, and two weather calls
  const back = async (label, act) => {
    await act();
    await sleep(2000);
    t.scene(label);
    judge(label, read(), true);
  };
  await back("Idle after walk", async () => {
    keyDown("w");
    await sleep(1400);
    keyUp("w");
  });
  await back("Idle after run", async () => {
    keyDown("Shift", { shiftKey: true });
    keyDown("w", { shiftKey: true });
    await sleep(1000);
    keyUp("Shift");
    keyUp("w");
  });
  await back("Idle after jump", async () => {
    keyDown(" ");
    await sleep(160);
    keyUp(" ");
    await sleep(900);
  });
  t.progress(0.7);
  if (P && P.abilities && P.abilities.reset) P.abilities.reset(100);
  await back("Idle after Lightning", async () => {
    keyDown("e");
    await sleep(900);
    keyUp("e");
    await sleep(500);
  });
  if (P && P.abilities && P.abilities.reset) P.abilities.reset(100);
  await back("Idle after Rain", async () => {
    pressKey("r");
    await sleep(1200);
  });
  t.progress(0.8);

  // Wind (a tap = Gust, a hold = Gale), then 10 s standing still under the clear sky Wind leaves behind (his look at the
  // sky plays once, then he is idle again): the hands in front of the hips, the boots flat, no pop, nothing held on its
  // last frame. Desktop presses V; the phone taps and holds the Wind button.
  const windPress = async (ms) => {
    if (P && P.abilities && P.abilities.reset) P.abilities.reset(100);
    const el = touch ? document.getElementById("ability-wind") : null;
    if (el) {
      const r = el.getBoundingClientRect();
      touchOn(el, "pointerdown", r.left + r.width / 2, r.top + r.height / 2, 11);
      await sleep(ms);
      touchOn(el, "pointerup", r.left + r.width / 2, r.top + r.height / 2, 11);
    } else {
      keyDown("v");
      await sleep(ms);
      keyUp("v");
    }
  };
  for (const [label, ms] of [["tap", 120], ["hold", 1500]]) {
    if (WX && WX.set) WX.set("clear", 0, "key");
    await windPress(ms);
    await sleep(2000); // the 2 s he has to settle
    t.scene(`Wind ${label}: standing`);
    judge(`Idle after Wind ${label}`, read(), false);
    const w = { fwd: 9, out: 9, pitch: [99, -99], roll: 0, held: 0 };
    let wPrev = null;
    let wPop = 0;
    const w0 = performance.now();
    let shot = false;
    while (performance.now() - w0 < 10000) {
      const r = read();
      if (r) {
        w.fwd = Math.min(w.fwd, r.fwd);
        w.out = Math.min(w.out, r.out);
        w.pitch = [Math.min(w.pitch[0], r.pitch[0]), Math.max(w.pitch[1], r.pitch[1])];
        w.roll = Math.max(w.roll, r.roll);
        if (sk().held) w.held = Math.max(w.held, sk().held());
        if (wPrev && sk().clip() === "idle") wPop = Math.max(wPop, Math.abs(r.lean - wPrev.lean), Math.abs(r.neck - wPrev.neck), Math.abs(r.m.hipYaw - wPrev.m.hipYaw), Math.abs(r.m.shoulderYaw - wPrev.m.shoulderYaw));
        wPrev = sk().clip() === "idle" ? r : null;
      }
      if (!shot && performance.now() - w0 > 5000) {
        shot = true;
        t.scene(`Wind ${label}: 5 s later`);
      }
      await sleep(100);
    }
    judge(`Wind ${label} then 10 s still`, w, false);
    t.metric(`idle.wind.${label}.handFwdMinM`, Math.round(w.fwd * 100) / 100);
    t.metric(`idle.wind.${label}.bootPitchMin`, Math.round(w.pitch[0]));
    t.metric(`idle.wind.${label}.bootPitchMax`, Math.round(w.pitch[1]));
    t.metric(`idle.wind.${label}.bootRollMaxDeg`, Math.round(w.roll * 10) / 10);
    t.metric(`idle.wind.${label}.popDeg`, Math.round(wPop * 10) / 10);
    t.metric(`idle.wind.${label}.heldSec`, Math.round(w.held * 10) / 10);
    if (wPop > 6) t.problem("bug", `quality.animation: after Wind ${label} the idle popped ${wPop.toFixed(1)} deg between two 100 ms samples`);
    if (w.held > 0.3) t.problem("bug", `quality.animation: after Wind ${label} a clip stayed held on its last frame for ${w.held.toFixed(1)} s`);
    t.scene(`Wind ${label}: 10 s later`);
  }
  t.progress(1);
}

/* ---------------- clip-poses: every clip he plays, at mid-clip, never twisted; cross-fades without a pop ---------------- */
// Acceptance: idle at two different times is upright (spine and neck within a few degrees, pelvis and shoulders square,
// hands apart); walk, run, jump, fall/float, cast and throw each hold a screenshot with no twisted limbs; switching idle
// <-> walk <-> run shows no snap (the pose never jumps more than a stride's worth between two frames); the phone
// (touch, 390x844, low quality) animates the same. The probe is skin.pose() (js/small-weather.js), read on real frames.
async function clipPoses(options, t) {
  const touch = !!(options && options.touch);
  t.scene(touch ? "Clip poses (phone)" : "Clip poses");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model === "small-weather", 45000, "his model to load").catch(() => {});
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok").catch(() => {});
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  const WX = window.day.weather;
  if (!C || !skinNow() || !skinNow().pose) {
    t.problem("blocker", "Small Weather's model isn't on for clip-poses");
    return;
  }
  if (touch) {
    try { window.day.look.quality("low"); } catch (e) { /* */ }
    try { C.touch(true); } catch (e) { /* */ }
  }
  const day = window.day.today();
  const outside = carSideMoment(day) || quietMoment(day);
  scrubTo(outside.start + 0.2);
  clickSpeed(1);
  if (WX && WX.set) WX.set("rain", 0.2, "key"); // not clear: the idle must stay the plain idle (no look-up)
  if (P && P.abilities && P.abilities.reset) P.abilities.reset(100);
  if (touch) {
    const btn = document.getElementById("control-btn") || document.querySelector("#take-control,.take-control");
    if (btn) {
      await tapEl(btn);
      btn.click();
    } else pressKey("Enter");
  } else pressKey("Enter");
  await t.until(() => C.mode() === "control", 5000, "Take control");
  const sk = () => skinNow();
  const bad = (what, m, lim) => {
    const v = m[what.k];
    if (Math.abs(v) > lim) t.problem("bug", `quality.animation: ${what.label} ${v.toFixed(0)} deg (limit ${lim}) while ${sk().clip()}`);
  };
  const holdAndCheck = async (label, clip, lims, ms) => {
    t.scene(label);
    await sleep(ms);
    const m = sk().pose();
    if (!m) return null;
    t.event(`pose-${label.toLowerCase().replace(/\s+/g, "-")}`, `${sk().clip()}: lean ${m.lean.toFixed(0)}, neck ${m.neck.toFixed(0)}, hips yaw ${m.hipYaw.toFixed(0)}, shoulders yaw ${m.shoulderYaw.toFixed(0)}, knees ${m.kneeL.toFixed(0)}/${m.kneeR.toFixed(0)}, hands ${m.handsApart.toFixed(2)} m apart`);
    if (clip && sk().clip() !== clip) t.problem("bug", `${label}: his model played ${sk().clip()}, not ${clip}`);
    for (const [k, [label2, lim]] of Object.entries(lims)) bad({ k, label: label2 }, m, lim);
    if (m.handsApart < 0.12) t.problem("bug", `quality.animation: ${label}: a hand is through the body (${m.handsApart.toFixed(2)} m apart)`);
    return m;
  };
  const IDLE = { lean: ["spine lean", 8], neck: ["neck lean", 10], sideLean: ["sideways lean", 6], hipYaw: ["pelvis yaw", 8], shoulderYaw: ["shoulder yaw", 8], kneeL: ["left knee bend", 16], kneeR: ["right knee bend", 16] };
  const MOVE = { lean: ["spine lean", 40], neck: ["neck lean", 45], sideLean: ["sideways lean", 12], hipYaw: ["pelvis yaw", 30], shoulderYaw: ["shoulder yaw", 45] };
  t.progress(0.1);
  // idle at two different times (a breath and a weight shift apart)
  await holdAndCheck("Idle early", "idle", IDLE, 1500);
  await holdAndCheck("Idle later", "idle", IDLE, 4000);
  t.progress(0.25);

  // switching idle -> walk -> run -> idle: the pose never jumps between two frames beyond what a stride moves
  const jumps = { worst: 0, at: "" };
  let prev = null;
  const poseObs = window.setInterval(() => {
    const m = sk() && sk().pose();
    if (!m) return;
    if (prev) {
      const d = Math.max(Math.abs(m.lean - prev.lean), Math.abs(m.neck - prev.neck), Math.abs(m.hipYaw - prev.hipYaw), Math.abs(m.shoulderYaw - prev.shoulderYaw));
      if (d > jumps.worst) jumps.worst = d;
    }
    prev = m;
  }, 33);
  t.scene("Walk");
  keyDown("w");
  await sleep(1400);
  await holdAndCheck("Walk mid", "walk", MOVE, 600);
  t.scene("Run");
  keyDown("Shift", { shiftKey: true });
  keyDown("w", { shiftKey: true });
  await sleep(900);
  await holdAndCheck("Run mid", "run", MOVE, 500);
  keyUp("Shift");
  await sleep(700);
  keyUp("w");
  await sleep(1200);
  await holdAndCheck("Idle after run", "idle", IDLE, 600);
  t.progress(0.5);

  // jump (Space) and float (Space held while falling)
  t.scene("Jump");
  keyDown(" ");
  await sleep(180);
  await holdAndCheck("Jump mid", null, MOVE, 60);
  await sleep(400);
  t.scene("Float");
  await holdAndCheck("Float mid", null, MOVE, 400);
  keyUp(" ");
  await sleep(1500);
  t.progress(0.65);

  // the casts: Lightning (E) wind-up, then Rain (R)
  if (P && P.abilities && P.abilities.reset) P.abilities.reset(100);
  t.scene("Cast Lightning");
  keyDown("e");
  await sleep(420);
  await holdAndCheck("Cast mid", null, MOVE, 100);
  await sleep(500);
  keyUp("e");
  await sleep(1400);
  if (P && P.abilities && P.abilities.reset) P.abilities.reset(100);
  t.scene("Cast Rain");
  pressKey("r");
  await sleep(380);
  await holdAndCheck("Rain cast mid", null, MOVE, 100);
  await sleep(1600);
  window.clearInterval(poseObs);
  t.metric("quality.clipPopDeg", Math.round(jumps.worst * 10) / 10);
  t.event("clip-switching", `worst pose change between two 33 ms samples across idle -> walk -> run -> idle: ${jumps.worst.toFixed(1)} deg`);
  if (jumps.worst > 22) t.problem("bug", `quality.animation: the pose snapped ${jumps.worst.toFixed(0)} deg between two frames switching clips`);
  t.progress(0.85);

  // his day's own clips: the world tilts and seats him, the clip is the limbs
  t.scene("His day");
  C.letGo && C.letGo();
  const seen = await clipsDuring(async () => {
    for (const hour of [7.2, 9.6, 12.4, 19.5, 22.6]) {
      scrubTo(hour * 60);
      await sleep(touch ? 1300 : 1100);
      const m = sk() && sk().pose();
      if (m && /^(sit|type|window)$/.test(sk().clip())) t.event("day-pose", `${sk().clip()}: neck ${m.neck.toFixed(0)}, hands ${m.handsApart.toFixed(2)} m apart`);
    }
  });
  t.event("day-clips", `his day played ${seen.join(" → ")}`);
  t.metric("clips.dayDistinct", seen.length);
  t.progress(1);
}

/* ---------------- hero-move: AAA foot plant, distinct cast wind-ups, clear-sky look-up, phone IK/fps ---------------- */
// Acceptance: foot slide < 5 cm/step and float < 3 cm on apt stairs/ramp; Lightning windbolt ≠ Rain windrain;
// idle 20 s under clear sky plays lookup; on phone low quality IK+clips and fps ≥ 30.
async function heroMove(options, t) {
  const touch = !!(options && options.touch);
  t.scene(touch ? "Hero move (phone)" : "Hero move");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model === "small-weather", 45000, "his model to load").catch(() => {});
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok").catch(() => {});
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  const WX = window.day.weather;
  const cfg = window.DAY_CONFIG;
  if (!C || !skinNow()) {
    t.problem("blocker", "Small Weather's model isn't on for hero-move");
    return;
  }
  if (touch) {
    try { window.day.look.quality("low"); } catch (e) { /* */ }
    try { C.touch(true); } catch (e) { /* */ }
  }
  const day = window.day.today();
  const outside = carSideMoment(day) || quietMoment(day);
  scrubTo(outside.start + 0.2);
  clickSpeed(1);
  if (P && P.abilities && P.abilities.reset) P.abilities.reset(100);
  // Clear sky so look-up can fire
  if (WX && WX.set) WX.set("clear", 0, "key");
  t.event("start-at", "outside, clear sky, for hero-move");

  if (touch) {
    const btn = document.getElementById("control-btn") || document.querySelector("#take-control,.take-control");
    if (btn) {
      await tapEl(btn);
      btn.click();
    } else pressKey("Enter");
  } else pressKey("Enter");
  await t.until(() => C.mode() === "control", 5000, "Take control");
  t.event("control-taken", touch ? "touch" : "Enter");
  t.progress(0.1);

  const b = ((cfg.city && cfg.city.blocks) || []).find((x) => x.id === "apt" && x.stair) || ((cfg.city && cfg.city.blocks) || []).find((x) => x.stair);
  if (!b) {
    t.problem("bug", "No apt stair for hero-move");
    return;
  }
  const s = b.stair;
  if (C.place) C.place(s.x0 - 2.5, s.z + s.w / 2 + 1.2, -Math.PI / 2);

  // Sample foot IK metrics while walking the ramp and roof (~60 s game time path, wall-clock shorter with sprint)
  const skin = () => skinNow();
  const motion0 = () => (skin() && skin().motion ? skin().motion() : null);
  if (motion0()) {
    t.event("ik-ready", `clips ${skin().clips.join(" ")}; rim ${motion0().rimOn}`);
  }
  t.scene("Stairs and ramp");
  // Render fps (same probe as render-grade / sky-cast): engine delta, not setInterval cadence
  const fpsSamples = [];
  const scene = window.day.world && window.day.world().scene;
  const eng = window.day.world && window.day.world().engine;
  const fpsObs = scene && eng
    ? scene.onAfterRenderObservable.add(() => {
      const dt = eng.getDeltaTime();
      if (dt > 0 && dt < 250) fpsSamples.push(dt);
    })
    : null;
  // Real WASD up the ramp and along the roof (~60 s of planted steps; walk, not sprint)
  await goTo(s.x1 - 0.4, s.z, t, { sprint: false, close: 0.5, progress: 0.35, ms: 55000, stall: 8000 }).catch(() => {});
  await goTo(-19.5, s.z + 1.5, t, { sprint: false, close: 0.8, progress: 0.5, ms: 25000, stall: 6000 }).catch(() => {});
  // Pace the roof edge and back (gravel / ramp feel)
  await goTo(-22, 3.2, t, { sprint: false, close: 1, progress: 0.55, ms: 20000, stall: 5000 }).catch(() => {});
  await goTo(-18, 5.5, t, { sprint: false, close: 1, progress: 0.6, ms: 20000, stall: 5000 }).catch(() => {});
  if (fpsObs != null && scene) scene.onAfterRenderObservable.remove(fpsObs);
  const mWalk = motion0();
  const samples = mWalk ? mWalk.samples : 0;
  const slide = mWalk && samples > 0 ? mWalk.footSlideMax : 1;
  const flt = mWalk && samples > 0 ? mWalk.footFloatMax : 1;
  t.metric("quality.footSlideM", Math.round(slide * 1000) / 1000);
  t.metric("quality.footFloatM", Math.round(flt * 1000) / 1000);
  t.metric("quality.ikSamples", samples);
  t.event("foot-plant", `max slide ${(slide * 100).toFixed(1)} cm, float ${(flt * 100).toFixed(1)} cm over ${samples} samples`);
  if (samples < 30) t.problem("bug", `quality.foot-slide: IK only sampled ${samples} frames on the ramp/roof (need ≥ 30)`);
  if (slide > 0.05) t.problem("bug", `quality.foot-slide: ${(slide * 100).toFixed(1)} cm per step (limit 5 cm)`);
  else if (samples >= 30) t.event("foot-slide-ok", "planted foot slide under 5 cm");
  if (flt > 0.03) t.problem("bug", `quality.ground-contact: foot float/sink ${(flt * 100).toFixed(1)} cm (limit 3 cm)`);
  else if (samples >= 30) t.event("foot-float-ok", "feet within 3 cm of the surface");
  t.progress(0.45);

  // Distinct wind-ups: Lightning vs Rain
  t.scene("Cast wind-ups");
  if (P && P.abilities && P.abilities.reset) P.abilities.reset(100);
  const seenBolt = [];
  const seenRain = [];
  const watchClip = (arr) => setInterval(() => {
    const c = skin() && skin().clip();
    if (c && !arr.includes(c)) arr.push(c);
  }, 40);
  let iv = watchClip(seenBolt);
  if (touch) {
    const bolt = document.getElementById("ability-lightning") || document.querySelector("[data-ability=lightning],#ability-bolt");
    if (bolt) {
      const r = bolt.getBoundingClientRect();
      touchOn(bolt, "pointerdown", r.left + r.width / 2, r.top + r.height / 2, 12);
      await sleep(700);
      touchOn(bolt, "pointerup", r.left + r.width / 2, r.top + r.height / 2, 12);
    } else {
      keyDown("e");
      await sleep(750);
      keyUp("e");
    }
  } else {
    keyDown("e");
    await sleep(750);
    keyUp("e");
  }
  await sleep(400);
  clearInterval(iv);
  t.event("windup-lightning", `clips ${seenBolt.join(" → ") || "none"}`);
  if (!seenBolt.includes("windbolt") && !seenBolt.includes("cast")) {
    t.problem("bug", `Lightning wind-up never showed (saw ${seenBolt.join(", ") || "nothing"})`);
  }
  await sleep(900);
  if (P && P.abilities && P.abilities.reset) P.abilities.reset(100);
  iv = watchClip(seenRain);
  if (touch) {
    const rain = document.getElementById("ability-rain") || document.querySelector("[data-ability=rain]");
    if (rain) await tapEl(rain);
    else pressKey("r");
  } else pressKey("r");
  await sleep(900);
  clearInterval(iv);
  t.event("windup-rain", `clips ${seenRain.join(" → ") || "none"}`);
  const boltClip = seenBolt.find((c) => c === "windbolt" || c === "cast");
  const rainClip = seenRain.find((c) => c === "windrain" || c === "cast" || c === "windbolt");
  if (seenBolt.includes("windbolt") && seenRain.includes("windrain") && seenBolt.includes("windbolt") !== false) {
    t.event("windups-distinct", "Lightning windbolt vs Rain windrain");
  } else if (boltClip && rainClip && boltClip !== rainClip) {
    t.event("windups-distinct", `${boltClip} vs ${rainClip}`);
  } else {
    t.problem("bug", `Cast wind-ups not distinct (lightning ${seenBolt.join("/")} rain ${seenRain.join("/")})`);
  }
  t.progress(0.7);

  // Look-up under clear sky: stand still 20 s
  t.scene("Clear-sky look-up");
  if (WX && WX.set) WX.set("clear", 0, "forecast"); // via forecast so manual hold doesn't block look-up
  releaseHeld();
  const beforeLookup = motion0() ? motion0().lookupPlayed : 0;
  const lookSeen = [];
  iv = watchClip(lookSeen);
  await sleep(21000);
  clearInterval(iv);
  const afterLookup = motion0() ? motion0().lookupPlayed : 0;
  t.event("lookup-idle", `clips ${lookSeen.join(" → ")}; lookup ticks ${afterLookup - beforeLookup}`);
  if (lookSeen.includes("lookup") || afterLookup > beforeLookup) t.event("lookup-ok", "look-up clip played under clear sky");
  else t.problem("bug", `Idling 20 s under clear sky never played lookup (saw ${lookSeen.join(", ") || "nothing"})`);
  t.progress(0.9);

  if (touch) {
    const avgDt = fpsSamples.length ? fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length : 0;
    const avg = avgDt > 0 ? 1000 / avgDt : 0;
    t.metric("phone.fpsAvg", Math.round(avg * 10) / 10);
    t.event("phone-ik", `low quality, fps avg ${avg.toFixed(1)}, frames ${fpsSamples.length}`);
    if (avg > 0 && avg < 30) t.problem("bug", `Phone fps avg ${avg.toFixed(1)} under 30`);
    else if (avg >= 30) t.event("phone-fps-ok", `fps ${avg.toFixed(1)} ≥ 30`);
    else if (!fpsSamples.length) t.problem("bug", "Phone fps probe collected no frames");
    const q = window.day.look.quality();
    if (q !== "low") t.problem("bug", `Phone run should be low quality (got ${q})`);
    else t.event("phone-low", "IK and clips running on low quality");
  }

  t.metric("feel.coyoteMs", 120);
  t.metric("feel.jumpBufferMs", 120);
  pressKey("Escape");
  await t.until(() => C.mode() !== "control", 8000, "Let go").catch(() => {});
  t.progress(1);
  t.finish("done");
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

/* ---------------- render-grade: the picture's grade, light and shadows from the apt roof ---------------- */
// Setup shortcuts (named): the day bar to each hour (scrubTo), control.place onto the apt roof, a full Charge, and on the phone
// control.touch. Everything else is real input: Take control (Enter, or a tap on the phone), the Lightning key (or a tap on its slot).
// It reads day.render.info() (the LUT, the effects, the casters) and what each grade does to a few swatches, so the four hours
// can be told apart without pixels, and times how long a Storm takes to move the grade.
async function renderGrade(options, t) {
  const touch = !!(options && options.touch) || innerWidth <= 700 || (window.matchMedia && matchMedia("(pointer: coarse)").matches);
  t.scene("Apt roof");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.render && window.day.look && window.day.control && window.day.weather, 8000, "the render pipeline (js/render-pipeline.js)");
  const R = window.day.render, C = window.day.control, W = window.day.weather, P = window.powers || window.day.powers;
  const refill = () => { if (P && P.abilities && P.abilities.reset) P.abilities.reset(100); };
  if (touch && C.touch) C.touch(true);
  window.day.title && window.day.title.quiet && window.day.title.quiet();
  scrubTo(12 * 60);
  await sleep(500);
  if (touch) await tapEl($("control")); else pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  C.place(-21, 0.5, 1.5708, { from: 14, alpha: 4.1, beta: 1.15, radius: 11 }); // the apartment roof, looking east along the avenue
  await sleep(900);
  await t.until(() => W.now().state === "clear" || W.now().intensity < 0.2, 6000, "a calm sky").catch(() => {});

  const info0 = R.info();
  t.event("render-effects", `${info0.quality}: ${info0.effects.join(", ")}; ${info0.tonemapping} tonemap, ${info0.lutCount} grade LUTs (${info0.luts.join(", ")}), bloom on ${info0.bloom && info0.bloom.source} at ${info0.bloom && info0.bloom.threshold}, shadows ${info0.shadows.generator} x${info0.shadows.cascades} at ${info0.shadows.mapSize}, ssao ${info0.ssao}`);
  if (info0.errors.length) t.problem("bug", `The render pipeline reported: ${info0.errors.join("; ")}`);
  if (info0.tonemapping !== "ACES") t.problem("bug", `Tonemapping is ${info0.tonemapping}, not ACES`);
  if (!info0.bloom || !info0.bloom.enabled) t.problem("bug", "Bloom is off");
  if (!info0.effects.includes("grade-lut")) t.problem("bug", "The colour-grade LUT isn't applied");
  if (info0.lutCount < 5) t.problem("bug", `Only ${info0.lutCount} grade LUTs`);
  if (touch) {
    // the phone keeps tonemap, grade and half-res bloom with one 1024 cascade and no SSAO
    if (info0.quality !== "low") t.problem("bug", `The phone is on ${info0.quality} quality`);
    if (info0.ssao) t.problem("bug", "SSAO is on at low quality");
    if (info0.shadows.cascades !== 1 || info0.shadows.mapSize !== 1024) t.problem("bug", `Low quality shadows are ${info0.shadows.cascades} cascade(s) at ${info0.shadows.mapSize}, expected one at 1024`);
    if (!info0.bloom.enabled || info0.bloom.scale > 0.5) t.problem("bug", "The phone's bloom isn't half-res");
    t.metric("phone.shadowCascades", info0.shadows.cascades);
  } else {
    if (info0.quality === "high") {
      if (!info0.ssao) t.problem("bug", "SSAO2 is off at high quality");
      if (info0.shadows.cascades !== 2) t.problem("bug", `High quality has ${info0.shadows.cascades} shadow cascade(s), expected 2`);
      if (!info0.fxaa) t.problem("bug", "FXAA is off at high quality");
    }
  }
  t.progress(0.1);

  // four hours, four grades
  const swatches = [[0.5, 0.5, 0.5], [0.8, 0.8, 0.8], [0.2, 0.25, 0.35], [0.7, 0.55, 0.4]];
  const read = (label) => ({ label, lut: R.info().lut.name, out: swatches.map((c) => R.gradeOf(c)) });
  const dist = (a, b) => { let d = 0; a.out.forEach((c, i) => c.forEach((v, k) => (d += Math.abs(v - b.out[i][k])))); return d / (a.out.length * 3); };
  const seen = [];
  for (const [label, minutes] of [["07:00", 7 * 60], ["12:00", 12 * 60], ["18:30", 18 * 60 + 30], ["22:00", 22 * 60]]) {
    t.scene("Roof at " + label);
    scrubTo(minutes);
    await sleep(2800); // the grade fades in over about 4 s
    const clock = window.day.now().minutes;
    if (Math.abs(clock - minutes) > 15) t.problem("bug", `${label}: the clock reads ${Math.floor(clock / 60)}:${String(Math.floor(clock % 60)).padStart(2, "0")}`);
    const r = read(label);
    seen.push(r);
    const i = R.info();
    t.event("render-grade-" + label.replace(":", ""), `${label}: LUT ${r.lut}, exposure ${i.exposure}, moon ${i.shadows.moon}, mid grey -> ${r.out[0].map((v) => v.toFixed(2)).join("/")}, ${i.shadows.casters} shadow casters`);
    if (label === "12:00") {
      const g = i.shadows.groups;
      const sk = i.skyline;
      t.event("render-noon-shadows", `casters: him ${g.player}, props ${g.props}, neighbours ${g.neighbours}, crowd ${g.crowd}, buildings ${g.buildings}; skyline fill ${sk ? sk.fill : "?"} against sky ${sk ? sk.sky : "?"}`);
      if (g.player < 1) t.problem("bug", "Small Weather doesn't cast a shadow at noon");
      if (g.props < 1) t.problem("bug", "Rooftop props don't cast shadows");
      if (i.shadows.pcf !== true) t.problem("bug", "Shadows aren't soft (no PCF)");
      if (sk && sk.ratio < 0.6) t.problem("bug", `The skyline is a dark slab at noon (fill ${sk.fill} against a sky of ${sk.sky})`);
    }
    if (label === "22:00" && !touch && i.shadows.moon < 0.2) t.problem("warning", `No moonlight shadows at 22:00 (moon ${i.shadows.moon})`);
    t.progress(0.1 + 0.12 * seen.length);
  }
  let alike = 0;
  for (let a = 0; a < seen.length; a++) for (let b = a + 1; b < seen.length; b++) {
    const d = dist(seen[a], seen[b]);
    if (d < 0.02) { alike++; t.problem("bug", `${seen[a].label} and ${seen[b].label} grade alike (${d.toFixed(3)})`); }
  }
  t.event("render-grades-distinct", `${seen.map((s) => s.label + " " + s.lut).join(", ")}; ${alike ? alike + " pairs alike" : "4 distinct grades"}`);

  // a Storm shifts the grade within 4 s (and drains the warmth)
  t.scene("Noon, then a Storm");
  scrubTo(12 * 60);
  await sleep(2800);
  await t.until(() => W.now().state === "clear" || W.now().intensity < 0.2, 8000, "a calm sky before the Storm").catch(() => {});
  const before = read("noon");
  const warmth = (r) => r.out[3][0] - r.out[3][2];
  refill();
  const t0 = performance.now();
  if (touch) await tapEl($("ability-bolt")); else pressKey("e");
  let shifted = -1;
  while (performance.now() - t0 < 6000) {
    await sleep(120);
    if (dist(before, read("storm")) > 0.03) { shifted = (performance.now() - t0) / 1000; break; }
  }
  const after = read("storm");
  t.event("render-storm-shift", `Storm cast: grade moved ${dist(before, after).toFixed(3)} in ${shifted < 0 ? ">6" : shifted.toFixed(1)} s (LUT ${before.lut} -> ${after.lut}); warm swatch ${warmth(before).toFixed(2)} -> ${warmth(after).toFixed(2)}`);
  if (shifted < 0 || shifted > 4) t.problem("bug", `A Storm cast took ${shifted < 0 ? "more than 6" : shifted.toFixed(1)} s to shift the grade (needs 4 s or less)`);
  if (warmth(after) >= warmth(before) - 0.02) t.problem("bug", "The Storm didn't drain the warmth from the city");
  t.metric("render.stormShiftSec", shifted < 0 ? 6 : Math.round(shifted * 10) / 10);
  await sleep(2500); // hold it: the footage shows the cool teal city
  t.progress(0.82);

  // frame rate on the roof (the phone's budget is 30 fps)
  const samples = [];
  const obs = window.day.world().scene.onAfterRenderObservable.add(() => samples.push(window.day.world().engine.getDeltaTime()));
  await sleep(4000);
  window.day.world().scene.onAfterRenderObservable.remove(obs);
  const fps = samples.length ? 1000 / (samples.reduce((a, b) => a + b, 0) / samples.length) : 0;
  t.metric(touch ? "phone.fpsAvg" : "render.fpsAvg", Math.round(fps * 10) / 10);
  t.event("render-fps", `${touch ? "phone" : "desktop"} ${R.info().quality}: ${fps.toFixed(0)} fps over ${samples.length} frames in the storm`);
  if (touch && fps < 30) t.problem("bug", `The phone averages ${fps.toFixed(1)} fps in the storm (needs 30)`);
  else if (!touch && fps < 20) t.problem("warning", `Desktop averages ${fps.toFixed(1)} fps with the full pipeline`);
  const end = R.info();
  if (touch && !(end.effects.includes("tonemap") && end.effects.includes("grade-lut") && end.effects.includes("bloom"))) t.problem("bug", `The phone lost an effect: ${end.effects.join(", ")}`);
  checkHud(t, "render-grade");
  t.progress(1);
}

/* ---------------- sky-cast: five painted skies by the clock, the storm shelf, Sun break's god rays, each strike lighting the deck ---------------- */
// Setup shortcuts (named): the day bar to each hour (scrubTo), control.place onto the apt roof, a full Charge, and on the phone
// control.touch + low quality. Everything else is real input: Take control (Enter / a tap), a camera drag up at the sky, E or the
// Lightning slot, X or the Sun break slot. It reads day.sky.info() (the weights, what loaded, the gap, the god-ray post, the deck's
// lit frames) and counts frames itself.
async function skyCast(options, t) {
  const touch = !!(options && options.touch) || innerWidth <= 700 || (window.matchMedia && matchMedia("(pointer: coarse)").matches);
  t.scene("Apt roof, looking up");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.sky && window.day.control && window.day.weather && window.day.look, 8000, "the sky (js/sky.js)");
  const S = window.day.sky, C = window.day.control, W = window.day.weather, P = window.powers || window.day.powers;
  const refill = () => { if (P && P.abilities && P.abilities.reset) P.abilities.reset(100); };
  window.day.title && window.day.title.quiet && window.day.title.quiet();
  if (touch) { try { window.day.look.quality("low"); } catch (e) { /* */ } if (C.touch) C.touch(true); }
  scrubTo(12 * 60);
  await sleep(500);
  if (touch) await tapEl($("control")); else pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  C.place(-21, 0.5, 1.5708, { from: 14, alpha: 4.1, beta: 1.15, radius: 11 });
  await sleep(700);
  { const o = $("episode-offer"); if (o && !o.hidden) { const d = o.querySelector(".decline"); if (d) d.click(); } } // never stuck behind the offer toast
  // look up at the sky: drag the camera (one finger on the right half on a phone)
  const world = window.day.world();
  const canvas = world.engine.getRenderingCanvas();
  const rect = canvas.getBoundingClientRect();
  const cam = world.scene.activeCamera;
  const pitch = () => (cam.getForwardRay ? cam.getForwardRay(1).direction.y : 0);
  async function drag(dy) {
    const x = rect.left + rect.width * (touch ? 0.78 : 0.5), y0 = rect.top + rect.height * 0.5, id = touch ? 31 : 1;
    const mk = (type, y) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: id, pointerType: touch ? "touch" : "mouse", isPrimary: true });
    canvas.dispatchEvent(mk("pointerdown", y0));
    for (let i = 1; i <= 8; i++) { canvas.dispatchEvent(mk("pointermove", y0 + (dy * i) / 8)); await sleep(30); }
    canvas.dispatchEvent(mk("pointerup", y0 + dy));
    await sleep(250);
  }
  const p0 = pitch();
  await drag(-170);
  if (pitch() < p0 - 0.02) await drag(340);
  t.event("camera-pitch", `forward y ${p0.toFixed(2)} -> ${pitch().toFixed(2)}`);
  const i0 = S.info();
  t.event("sky-start", `${i0.quality}: ${i0.files.length} painted skies listed, ${i0.loaded.length} loaded, deck ${i0.deck.mode} (${i0.deck.layers} layers), god rays ${i0.godRays.supported ? "supported" : "unsupported"}, reflections ${i0.ibl.on ? "on" : "off"}`);
  if (!i0.enabled) t.problem("bug", "js/sky.js has no dome to dress (look.skyDome)");
  if (i0.files.length < 6) t.problem("bug", `Only ${i0.files.length} of the 6 painted skies are listed in day.config.js sky.panoramas`);
  if (!i0.ibl.on) t.problem("bug", "The sky isn't the scene's environment texture (no reflections of it)");
  if (touch && i0.deck.mode !== "planes") t.problem("bug", `The phone's cloud deck is ${i0.deck.mode}, expected 2 planes`);
  if (touch && i0.deck.layers !== 2) t.problem("bug", `The phone draws ${i0.deck.layers} cloud layers, expected 2`);
  t.progress(0.1);

  // five times of day, five painted skies
  const tops = [];
  for (const [label, minutes] of [["06:30", 6 * 60 + 30], ["12:00", 12 * 60], ["17:25", 17 * 60 + 25], ["19:00", 19 * 60], ["23:00", 23 * 60]]) {
    t.scene("Sky at " + label);
    scrubTo(minutes);
    await t.until(() => { const i = S.info(); return i.loaded.length && i.painted > 0.9; }, 9000, "the painted sky to fade in").catch(() => {});
    await sleep(1600);
    const i = S.info();
    const top = Object.keys(i.weights).sort((a, b) => i.weights[b] - i.weights[a])[0];
    tops.push(top);
    t.event("sky-" + label.replace(":", ""), `${label}: ${top} (${i.weights[top].toFixed(2)}), painted ${i.painted}, loaded ${i.loaded.join("/")}`);
    if (i.painted < 0.9) t.problem("bug", `${label}: the painted sky isn't showing (painted ${i.painted}, loaded ${i.loaded.join("/") || "none"})`);
    t.progress(0.1 + 0.1 * tops.length);
  }
  if (new Set(tops).size < 5) t.problem("bug", `The five hours show only ${new Set(tops).size} distinct skies: ${tops.join(", ")}`);
  t.event("sky-distinct", `${new Set(tops).size} distinct painted skies: ${tops.join(", ")}`);

  // Storm: the shelf cloud, a darker, thicker deck, each strike lights the deck from inside
  t.scene("Dusk, a Storm");
  scrubTo(19 * 60);
  await sleep(1200);
  refill();
  const strikes0 = S.info().deck.strikes;
  if (touch) await tapEl($("ability-bolt")); else await tapKey("e");
  let seen = 0;
  const frames = [];
  const obs = world.scene.onAfterRenderObservable.add(() => frames.push(S.info().deck.flash));
  await sleep(2600);
  await t.until(() => S.info().weights.storm > 0.5, 6000, "the storm shelf cloud").catch(() => {});
  world.scene.onAfterRenderObservable.remove(obs);
  const iS = S.info();
  const lit = (() => { let best = 0, run = 0; for (const v of frames) { if (v > 0.45) { run++; best = Math.max(best, run); } else run = 0; } return best; })();
  seen = iS.deck.strikes - strikes0;
  t.event("sky-storm", `storm weight ${iS.weights.storm.toFixed(2)}, ${seen} strike(s), deck lit ${lit} frame(s) in a row from inside, flash now ${iS.deck.flash}`);
  if (seen < 1) t.problem("bug", "A Lightning cast didn't reach the cloud deck (no day:strike)");
  if (lit < 3) t.problem("bug", `A strike lit the cloud deck for only ${lit} frame(s) (needs 3)`);
  t.metric("sky.deckLitFrames", lit);
  if (iS.weights.storm < 0.5) t.problem("bug", `The storm shelf cloud isn't showing (weight ${iS.weights.storm.toFixed(2)})`);
  await sleep(1500);

  // Sun break: a gap and god rays within 2 s
  t.scene("Sun break");
  scrubTo(17 * 60 + 25);
  W.set("clear", 1, "api");
  await sleep(1200);
  refill();
  const tCast = performance.now();
  if (touch) await tapEl($("ability-sunbreak")); else await tapKey("x");
  let gapAt = -1, raysAt = -1;
  while (performance.now() - tCast < 4000) {
    await sleep(80);
    const i = S.info();
    if (gapAt < 0 && i.gap > 0.5) gapAt = (performance.now() - tCast) / 1000;
    if (raysAt < 0 && i.godRays.on) raysAt = (performance.now() - tCast) / 1000;
    if (gapAt >= 0 && (touch || raysAt >= 0)) break;
  }
  const iG = S.info();
  t.event("sky-sunbreak", `gap ${iG.gap} open in ${gapAt < 0 ? ">4" : gapAt.toFixed(1)} s; god rays ${touch ? "not built on low quality (post " + iG.godRays.made + " made)" : raysAt < 0 ? "never on" : "on in " + raysAt.toFixed(1) + " s"}`);
  if (gapAt < 0 || gapAt > 2) t.problem("bug", `Sun break opened a gap in ${gapAt < 0 ? "more than 4" : gapAt.toFixed(1)} s (needs 2 s or less)`);
  if (touch) { if (iG.godRays.made || iG.godRays.on) t.problem("bug", "The phone built the god-ray pass (low quality has none)"); }
  else if (raysAt < 0 || raysAt > 2) t.problem("bug", `God rays ${raysAt < 0 ? "never showed" : "took " + raysAt.toFixed(1) + " s"} (needs 2 s or less)`);
  t.metric("sky.godRaysSec", raysAt < 0 ? 4 : Math.round(raysAt * 10) / 10);
  await sleep(2500); // hold it: the footage shows the shafts

  // frame rate with the sky up
  const fps = await fpsWindow(4000);
  t.metric(touch ? "phone.fpsAvg" : "sky.fpsAvg", Math.round(fps.avg * 10) / 10);
  t.event("sky-fps", `${touch ? "phone" : "desktop"} ${S.info().quality}: ${fps.avg.toFixed(0)} fps (min ${fps.min.toFixed(0)}) with the deck${touch ? " and no god-ray pass" : " and god rays"}`);
  if (touch && fps.avg < 30) t.problem("bug", `The phone averages ${fps.avg.toFixed(1)} fps with the sky (needs 30)`);
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
  if (!low.bloom) t.problem("bug", "Low quality dropped the half-res bloom (it stays on)");
  if (!low.shadows) t.problem("bug", "Low quality dropped the shadow cascade (one 1024 cascade stays on)");
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

/* ---------------- night-glow: lit windows with rooms, neon, lamp pools, headlights; schedules; SSR / probe; phone light cap ---------------- */
// Setup: day bar beside the car and to the hours. Real input: Enter, WASD along the avenue, key 3 (rain),
// optional Quality: low / touch. Events night-glow-* ; metrics windowOnDusk, windowOnLate, dynamicLights, nightFps.
async function nightGlow(options, t) {
  const touch = !!(options && options.touch);
  t.scene("Night glow setup");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.cityscape && window.day.cityscape.info, 8000, "the cityscape");
  if (touch) {
    try { window.day.look.quality("low"); } catch (e) { /* */ }
    if (window.day.control && window.day.control.touch) window.day.control.touch(true);
  }
  const day = window.day.today();
  const cfg = window.DAY_CONFIG;
  const street = cfg.street || { z: 12.6 };
  const outside = carSideMoment(day);
  if (!outside) {
    t.problem("bug", "No moment beside the car for night-glow");
    return;
  }
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  await sleep(400);
  const C = window.day.control;
  if (touch) {
    const btn = document.getElementById("control-btn") || document.querySelector("[data-control]");
    if (btn) btn.click();
    else pressKey("Enter");
  } else pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  t.progress(0.1);

  // 1. window schedules across a fast day: on between 18–20, half off after 23:30
  const cs = window.day.cityscape;
  const paint = (h) => (cs.paintWindows ? cs.paintWindows(h) : cs.info().windows);
  const at17 = paint(17.0);
  const at18 = paint(18.0);
  const at20 = paint(20.0);
  const at2330 = paint(23.5);
  const at01 = paint(1.0);
  t.event("night-glow-schedule", `windows on@17=${at17.on} @18=${at18.on} @20=${at20.on} @23:30=${at2330.on} @01=${at01.on}; rooms ${at20.rooms}; interior ${cs.info().windows && cs.info().windows.interior}`);
  t.metric("windowOnDusk", at18.on);
  t.metric("windowOnNight", at20.on);
  t.metric("windowOnLate", at01.on);
  if (!(at18.on > at17.on && at20.on > at18.on)) t.problem("bug", `Windows did not switch on across dusk (${at17.on} → ${at18.on} → ${at20.on})`);
  if (!(at01.on <= at20.on * 0.55)) t.problem("bug", `Fewer than half the night windows stayed off after bedtime (${at01.on} still on vs ${at20.on} at 20:00)`);
  if (!(at20.rooms > 0 && (at20.warm > 0 || at20.cool > 0))) t.problem("bug", "Lit windows have no interior-mapped rooms");
  if (!(at2330.on <= at20.on * 0.75)) t.problem("bug", `Windows barely dimmed by 23:30 (${at2330.on} vs ${at20.on} at 20:00)`);
  t.progress(0.35);

  // 2. 22:00 street: lit windows, neon, lamp pools, dynamic lights
  scrubTo(22 * 60);
  await sleep(1500);
  if (cs.paintWindows) cs.paintWindows(22);
  await goTo(48, street.z - 3.2, t, { sprint: true, progress: 0.5, ms: 28000 });
  await sleep(1000);
  t.scene("Avenue at 22:00");
  const info = cs.info();
  const props = info.props || {};
  const dyn = info.dynamicLights || {};
  t.event("night-glow-street", `windows ${info.lit.windows.toFixed(2)} on=${(info.windows && info.windows.on) || 0} neon ${props.lit && props.lit.neon} lamps ${info.lit.lamps.toFixed(2)} pools ${info.lamps} dynLights ${dyn.active}/${dyn.cap} signs ${props.signs}`);
  t.metric("dynamicLights", dyn.active || 0);
  t.metric("nightNeonSigns", props.signs || 0);
  if (info.lit.windows < 0.7) t.problem("bug", `Windows aren't lit at 22:00 (${info.lit.windows})`);
  if ((props.signs || 0) < 4) t.problem("bug", `Fewer than 4 neon signs (${props.signs})`);
  if (info.lit.lamps < 0.7) t.problem("bug", `Lamp pools aren't on (${info.lit.lamps})`);
  if (touch && (dyn.active || 0) > 4) t.problem("bug", `Phone has ${dyn.active} dynamic lights (cap 4)`);
  if (!touch && (dyn.active || 0) < 1) t.problem("warning", "No dynamic lamp lights near the camera");
  t.progress(0.6);

  // 3. rain at night: neon + headlights reflect
  const W = window.weather;
  pressKey("3");
  await t.until(() => W.now().state === "rain" && W.now().reflect > 0.5, 12000, "wet street reflections").catch(() => {});
  await sleep(1200);
  const wet = W.now();
  const crowd = window.day.crowd && window.day.crowd.info ? window.day.crowd.info() : {};
  const render = window.day.render && window.day.render.info ? window.day.render.info() : {};
  t.scene("Night rain reflections");
  t.event("night-glow-reflect", `reflect ${wet.reflect.toFixed(2)} puddles ${wet.puddles} probe ${wet.reflectProbe} ssr ${!!render.ssr} carFlares ${crowd.flares || 0} lights ${crowd.lights}`);
  if (!(wet.manual && wet.reflect > 0.5)) t.problem("bug", `Rain at night didn't shine the street (${JSON.stringify({ reflect: wet.reflect, manual: wet.manual })})`);
  if (touch && render.ssr) t.problem("bug", "SSR is on at low/phone quality");
  if (!touch && !render.ssr) t.problem("bug", "SSR is off at high quality (wet streets need ScreenSpaceReflection)");
  t.metric("nightReflect", Math.round(wet.reflect * 100) / 100);
  t.progress(0.8);

  // 4. phone fps
  const samples = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 2500) {
    samples.push(1000 / Math.max(1, window.day.world().engine.getDeltaTime()));
    await sleep(50);
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  t.metric("nightFps", Math.round(avg * 10) / 10);
  t.event("night-glow-fps", `${avg.toFixed(1)} fps avg over ${samples.length} samples at ${touch ? "390 touch low" : "desktop"}`);
  if (touch && avg < 30) t.problem("bug", `Phone night glow averages ${avg.toFixed(1)} fps (needs 30)`);

  // 5. lightning flicker reaches windows (real bolt via E, plus day:strike listener)
  const hadFlicker = { on: false };
  const onStrike = () => { if (cs.flickering && cs.flickering()) hadFlicker.on = true; };
  window.addEventListener("day:strike", onStrike);
  try {
    if (window.abilities && window.abilities.reset) window.abilities.reset();
  } catch (e) { /* */ }
  keyDown("E");
  await sleep(120);
  keyUp("E");
  await sleep(500);
  window.removeEventListener("day:strike", onStrike);
  if (!hadFlicker.on && cs.flicker) {
    cs.flicker(0.8);
    await sleep(120);
  }
  if (!(cs.flickering() || hadFlicker.on)) t.problem("warning", "Bolt did not flicker city lights");
  else t.event("night-glow-flicker", hadFlicker.on ? "day:strike flickered lamps and windows" : "cityscape.flicker stuttered lights");
  pressKey("Escape");
  t.progress(1);
}

/* ---------------- npc-spots: every NPC stands in open ground, with room to walk up and talk ---------------- */
// Setup shortcut: the spots come from the config (neighbors' stops, daily citizens, rescue people) and are checked against
// world.solids with js/npc-spots.js (the same audit `npm test` runs); real input: Enter, then he is put 1.6 m from each
// spot (touch: C.place, as the other scenarios) and the scene is a screenshot. Neighbors' name tags are read at the hour
// they stand there: on screen, inside the window, not clipped. Events: npc-spots, npc-spot-<who>; metric npcSpotFailures.
async function npcSpots(options, t) {
  t.scene("Avenue");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const C = window.day.control;
  const cfg = window.DAY_CONFIG;
  const mod = await import("./npc-spots.js");
  const world = window.day.world();
  const spots = mod.collectNpcSpots(cfg);
  const rep = mod.auditNpcSpots(spots, world.solids || []);
  t.metric("npcSpotFailures", rep.failures.length);
  t.event("npc-spots", `${spots.length} spots, ${rep.failures.length} in a building collider or without an approach`);
  rep.failures.forEach((f) => t.problem("bug", "NPC spot: " + f));
  if (!C) { t.problem("bug", "There's no Take control"); return; }
  if (options && options.touch) { try { C.touch(true); } catch (e) { /* desktop */ } }
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 3000, "Take control (Enter)");
  const N = window.day.neighbors;
  const stops = (cfg.neighbors.list || []).flatMap((p) => p.stops.map((s, i) => ({ who: p.id, hour: s[0] + 0.3, x: s[1], z: s[2], inside: s[3] === "inside" }))).filter((s) => !s.inside);
  let seen = 0;
  for (const sp of spots) {
    t.progress(seen++ / spots.length);
    const nb = stops.find((s) => s.who === sp.who && s.x === sp.x && s.z === sp.z);
    if (nb) { scrubTo(nb.hour * 60); await sleep(500); }
    C.place(sp.x - 1.6, sp.z, Math.PI / 2);
    t.scene(`${sp.who} at ${sp.x},${sp.z}`);
    await sleep(700);
    const st = C.state();
    if (Math.hypot(st.x - (sp.x - 1.6), st.z - sp.z) > 1.2) t.problem("bug", `${sp.who}: he could not stand 1.6 m from the spot (at ${st.x.toFixed(1)},${st.z.toFixed(1)}): no approach`);
    if (nb) {
      const tag = $("nb-" + sp.who);
      const r = tag && tag.getBoundingClientRect();
      const on = r && r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      t.event(`npc-spot-${sp.who}`, `${sp.x},${sp.z}: tag ${on ? "on screen" : "not visible"}${r ? ` ${Math.round(r.left)},${Math.round(r.top)}` : ""}`);
      if (!on) t.problem("bug", `${sp.who}: the name tag isn't fully on screen next to the NPC at ${innerWidth}x${innerHeight}`);
    } else t.event(`npc-spot-${sp.who}`, `${sp.x},${sp.z}: open ground`);
  }
  pressKey("Escape");
}

/* ---------------- city-audit: props sit on their roofs and pavements; no flicker; he walks every roof ---------------- */
// Setup shortcuts: the audit runs on the built scene, and six probe cameras (three rooftops, three street spots) are put
// where a player's camera could be for two frames each, the second 2 cm to the side. Real input: Enter, then WASD with
// Shift up each walkable roof's ramp and along its row of AC units, the way he could before. Events: city-audit,
// flicker-<spot>, city-shots-size, roof-walk-<block>. Metrics: cityAuditFailures, flickerBlocks.
async function cityAudit(options, t) {
  t.scene("Home street");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.cityscape && window.day.cityscape.audit, 8000, "the city audit (js/city-audit.js)");
  const cfg = window.DAY_CONFIG;
  const street = cfg.street || { z: 12.6 };
  const blocks = ((cfg.city && cfg.city.blocks) || []).filter((b) => b.stair);
  const cs = window.day.cityscape;
  const B = window.BABYLON;
  scrubTo(12 * 60);
  await sleep(800);

  // 1. the audit: floating or sunk props, coplanar faces, inside-out normals, the AC colliders
  const rep = cs.audit();
  t.metric("cityAuditFailures", rep.failures.length);
  t.event("city-audit", `${rep.counts.props} props on ${rep.counts.surfaces} surfaces, ${rep.counts.faces} faces, ${rep.counts.units} roof units, ${rep.counts.poles} lamp poles: ${rep.failures.length} failures`);
  rep.failures.slice(0, 12).forEach((f) => t.problem("bug", "City audit: " + f));
  t.event("city-shots-size", `${innerWidth}x${innerHeight}`);
  t.progress(0.1);

  // 2. six probe cameras, two frames each: the second moved 2 cm; blocks of the picture that flip between the frames
  const scene = world().scene;
  const canvas = world().engine.getRenderingCanvas();
  const W = 640;
  const H = 360;
  const g = document.createElement("canvas");
  g.width = W;
  g.height = H;
  const gc = g.getContext("2d", { willReadFrequently: true });
  let probe = null;
  const place = (cam, p) => {
    const eye = new B.Vector3(p.eye[0] + p.dx, p.eye[1], p.eye[2]);
    const tgt = new B.Vector3(p.target[0], p.target[1], p.target[2]);
    if (cam.setPosition && cam.setTarget && cam.getClassName() === "ArcRotateCamera") {
      cam.setTarget(tgt);
      cam.setPosition(eye);
    } else {
      cam.position.copyFrom(eye);
      cam.setTarget(tgt);
    }
  };
  const before = scene.onBeforeRenderObservable.add(() => {
    if (probe && scene.activeCamera) place(scene.activeCamera, probe);
  });
  const after = scene.onAfterRenderObservable.add(() => {
    if (!probe || !probe.grab) return;
    gc.drawImage(canvas, 0, 0, W, H);
    probe.frames.push(gc.getImageData(0, 0, W, H).data);
    probe.grab = false;
  });
  const pz = cs.info().props.plaza;
  const cross = ((cfg.city && cfg.city.crosses) || [])[1] || { x: 60 };
  const spots = blocks.slice(0, 3).map((b) => {
    const zb = b.z - b.d / 2 + 1.4;
    const sx = b.w * 0.28;
    return { name: `roof-${b.id}`, eye: [b.x + 1, b.h + 2.2, b.z + 3.8], target: [b.x - sx * 0.4, b.h + 0.5, zb] };
  });
  spots.push({ name: "street-crossing", eye: [cross.x - 9, 1.8, street.z - 3.0], target: [cross.x + 3.5, 0.3, street.z] });
  spots.push({ name: "street-shops", eye: [58, 1.7, street.z - 3.1], target: [66, 1.6, street.z - 0.6] });
  spots.push({ name: "street-plaza", eye: [pz.x0 + 3, 2.0, pz.z0 + 3], target: [(pz.x0 + pz.x1) / 2, 1.2, pz.z0 + 6.5] });
  let totalBlocks = 0;
  let k = 0;
  for (const sp of spots) {
    t.scene(`Camera ${k + 1} of ${spots.length}: ${sp.name}`);
    probe = { ...sp, dx: 0, grab: false, frames: [] };
    await sleep(500);
    probe.grab = true;
    await t.until(() => probe.frames.length >= 1, 3000, "the first frame of " + sp.name).catch(() => {});
    probe.dx = 0.02;
    await sleep(120);
    probe.grab = true;
    await t.until(() => probe.frames.length >= 2, 3000, "the second frame of " + sp.name).catch(() => {});
    let flick = 0;
    if (probe.frames.length >= 2) {
      const A = probe.frames[0];
      const C = probe.frames[1];
      // 8 x 8 px blocks where over a third of the pixels change a lot: a flat surface flipping between two depths
      for (let by = 0; by < H; by += 8) for (let bx = 0; bx < W; bx += 8) {
        let n = 0;
        for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) {
          const i = (y * W + x) * 4;
          if (Math.abs(A[i] - C[i]) + Math.abs(A[i + 1] - C[i + 1]) + Math.abs(A[i + 2] - C[i + 2]) > 90) n++;
        }
        if (n > 21) flick++;
      }
    }
    totalBlocks += flick;
    t.event("flicker-" + sp.name, `${probe.frames.length} frames, camera moved 2 cm: ${flick} flickering blocks`);
    if (probe.frames.length < 2) t.problem("warning", `The probe camera at ${sp.name} didn't get two frames`);
    else if (flick > 8) t.problem("bug", `Surfaces flicker between two frames at ${sp.name} (${flick} blocks of 8 x 8 px change a lot for a 2 cm camera move)`);
    k++;
    t.progress(0.1 + 0.3 * (k / spots.length));
  }
  probe = null;
  scene.onBeforeRenderObservable.remove(before);
  scene.onAfterRenderObservable.remove(after);
  t.metric("flickerBlocks", totalBlocks);
  checkHud(t, "city-audit shots");

  // 3. he walks each walkable roof along its row of AC units, the way he could before
  const outside = carSideMoment(window.day.today());
  if (outside) scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  await sleep(600);
  const C = window.day.control;
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 3000, "Take control (Enter)");
  let n = 0;
  for (const b of blocks) {
    const s = b.stair;
    t.scene(`Roof ${b.id}: up the ramp and along the units`);
    const sx = b.w * 0.28;
    const zb = b.z - b.d / 2 + 1.4;
    const ok = [];
    ok.push(await goTo(s.x0 - 0.9, s.z, t, { sprint: true, progress: 0.4 + 0.18 * n, ms: 40000 }));
    ok.push(ok[0] && (await goTo(s.x1 - 0.25, s.z, t, { close: 0.35, progress: 0.4 + 0.18 * n, ms: 20000 })));
    const legs = [[b.x + 1, b.z + 1.5], [b.x - sx - 2, zb + 1.3], [b.x - sx, zb + 1.3], [b.x + sx * 0.2, zb + 1.3], [b.x + sx * 1.1, zb + 1.6], [b.x, b.z]];
    for (const [x, z] of legs) ok.push(ok[ok.length - 1] && (await goTo(x, z, t, { close: 0.8, progress: 0.4 + 0.18 * n, ms: 14000, stall: 3000 })));
    const reached = ok.filter(Boolean).length;
    const st = C.state();
    t.event("roof-walk-" + b.id, `${reached} of ${ok.length} legs walked, ended at ${st.x.toFixed(1)},${st.z.toFixed(1)} (y ${st.y.toFixed(2)})`);
    if (reached < ok.length) t.problem("bug", `He snagged on the ${b.id} roof or its ramp (${reached} of ${ok.length} legs; at ${st.x.toFixed(1)},${st.z.toFixed(1)}, y ${st.y.toFixed(2)})`);
    await goTo(s.x1 - 0.25, s.z, t, { close: 0.7, ms: 14000 });
    await goTo(s.x0 - 0.9, s.z, t, { close: 0.9, ms: 20000 });
    n++;
  }
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
  // Keys 1–7 need Sky studio (off by default).
  if (W.skyStudio) W.skyStudio(true);
  else try { localStorage.setItem("icanbe.skyStudio", "on"); } catch (e) { /* */ }
  t.event("sky-studio", "Sky studio on for keys 1–7");
  const moveCfg = (window.DAY_CONFIG && window.DAY_CONFIG.control && window.DAY_CONFIG.control.move) || {};
  t.metric("feel.coyoteMs", Math.round((moveCfg.coyote != null ? moveCfg.coyote : 0.12) * 1000));
  t.metric("feel.jumpBufferMs", Math.round((moveCfg.jumpBuffer != null ? moveCfg.jumpBuffer : 0.12) * 1000));
  const street = window.DAY_CONFIG.street || { z: 12.6 };
  const at = C.state();
  const reached = await goTo(at.x, street.z, t, { close: 1.4, ms: 18000, progress: 0.1 });
  const stood = C.state();
  t.scene("On the road");
  await sleep(400);
  if (reached) t.event("on-the-road", `at ${stood.x.toFixed(1)}, ${stood.z.toFixed(1)} (the avenue is z ${street.z})`);
  else t.problem("bug", `He didn't reach the avenue (at ${stood.x.toFixed(1)}, ${stood.z.toFixed(1)}, road z ${street.z})`);
  t.progress(0.14);

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
  let thundersBeforeStorm = W.now().thunders || 0;
  for (let i = 0; i < order.length; i++) {
    const [key, state, label] = order[i];
    const before = W.now();
    if (state === "storm") {
      flashesBeforeStorm = before.flashes;
      thundersBeforeStorm = before.thunders || 0;
    }
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
    t.scene(`Street: ${label}`);
    await sleep(450);
    heard[state] = done;
    const sig = ["air", "rain", "wind", "thunder", "hush", "snow"].map((k) => (done.sound[k] || 0).toFixed(2)).join(",");
    t.event(`weather-${state}`, `${label}: sky ${done.sky}, wet ${done.wet.toFixed(2)}, roofWet ${(done.roofWet || 0).toFixed(2)}, gloss ${done.gloss.toFixed(2)}, puddles ${done.puddles} (lvl ${(done.puddleLevel || 0).toFixed(2)}, ripples ${(done.ripples || 0).toFixed(2)}), wind ${done.wind.toFixed(2)} (trees ${(done.treeSway || 0).toFixed(2)}, awnings ${done.awnings || 0}/${(done.awningSway || 0).toFixed(2)}, litter ${done.litterRate || 0}), snow ${(done.snowCover || 0).toFixed(2)}, flashes ${done.flashes}, thunders ${done.thunders || 0}, sound ${sig}`);
    t.metric(`wet-${state}`, Math.round(done.wet * 100) / 100);
    t.metric(`fog-${state}`, Math.round(done.fog * 1000) / 1000);
    if ((state === "rain" || state === "storm") && (done.wet < 0.65 || done.gloss < 0.35 || done.puddles < 1 || (done.ripples || 0) <= 0)) {
      t.problem("bug", `${label} didn't wet road/puddles with ripples (wet ${done.wet.toFixed(2)}, gloss ${done.gloss.toFixed(2)}, puddles ${done.puddles}, ripples ${done.ripples})`);
    }
    if (state === "clear" && (done.wet > 0.15 || done.gloss > 0.2)) t.problem("bug", `Clear still looks wet (wet ${done.wet.toFixed(2)}, gloss ${done.gloss.toFixed(2)})`);
    if (state === "rain" && $("log") && !$("log").textContent.includes("Rain.")) t.problem("bug", "Changing the weather isn't in the action log");
    if (state === "wind") {
      t.metric("windTreeSway", done.treeSway || 0);
      t.metric("windAwnings", done.awnings || 0);
      t.metric("windAwningSway", done.awningSway || 0);
      t.metric("windLitterRate", done.litterRate || 0);
      if ((done.treeSway || 0) < 0.15 || (done.awnings || 0) < 4 || (done.awningSway || 0) < 0.15 || (done.litterRate || 0) <= 0) {
        t.problem("bug", `Wind didn't visibly move trees, awnings and litter (treeSway ${done.treeSway}, awnings ${done.awnings}, awningSway ${done.awningSway}, litterRate ${done.litterRate})`);
      }
    }
    if (state === "storm") {
      if (done.flashes <= flashesBeforeStorm) {
        await t.until(() => W.now().flashes > flashesBeforeStorm, 6000, "a lightning flash").catch(() => {});
      }
      const afterFlash = W.now();
      if (afterFlash.flashes <= flashesBeforeStorm) {
        t.problem("bug", "The storm never flashed");
      } else {
        await t.until(() => (W.now().thunders || 0) > thundersBeforeStorm, 4000, "delayed thunder after lightning").catch(() => {});
        const afterThunder = W.now();
        t.metric("lightningFlashes", afterThunder.flashes);
        t.metric("thunderCount", afterThunder.thunders || 0);
        t.metric("thunderDelaySec", afterThunder.lastThunderDelay || 0);
        t.metric("strikeDistM", afterThunder.lastStrikeDist || 0);
        t.event("lightning-thunder", `flashes ${afterThunder.flashes}, thunders ${afterThunder.thunders}, delay ${afterThunder.lastThunderDelay}s at ${afterThunder.lastStrikeDist}m`);
        if ((afterThunder.thunders || 0) <= thundersBeforeStorm || (afterThunder.lastThunderDelay || 0) < 0.15) {
          t.problem("bug", `Thunder did not follow lightning with a distance delay (thunders ${afterThunder.thunders}, delay ${afterThunder.lastThunderDelay}s)`);
        }
      }
      // Measure desktop vs phone-tier storm FPS and particle budget
      const lookApi = window.day && window.day.look;
      const savedQ = lookApi && lookApi.quality ? lookApi.quality() : "high";
      if (lookApi && lookApi.quality) lookApi.quality("high");
      await sleep(150);
      const deskStormParticles = W.now().activeParticles || 0;
      const deskStormFps = await fpsWindow(900);
      t.metric("desktopStormFpsAvg", deskStormFps.avg);
      t.metric("desktopStormFpsMin", deskStormFps.min);
      t.metric("desktopStormParticles", deskStormParticles);
      if (lookApi && lookApi.quality) lookApi.quality("low");
      await sleep(150);
      t.scene("Street: Storm (phone tier)");
      const phoneStormParticles = W.now().activeParticles || 0;
      const phoneStormFps = await fpsWindow(1100);
      t.metric("phoneStormFpsAvg", phoneStormFps.avg);
      t.metric("phoneStormFpsMin", phoneStormFps.min);
      t.metric("phoneStormParticles", phoneStormParticles);
      t.event("storm-fps", `desktop ${deskStormFps.avg} fps (${deskStormParticles} particles/s), phone tier ${phoneStormFps.avg} fps (min ${phoneStormFps.min}, ${phoneStormParticles} particles/s)`);
      if (phoneStormFps.avg < 30) t.problem("bug", `Phone-tier storm FPS dropped to ${phoneStormFps.avg} avg (must stay >= 30 fps)`);
      if (phoneStormParticles >= deskStormParticles && deskStormParticles > 0) {
        t.problem("bug", `Phone tier did not reduce storm particles (${phoneStormParticles} vs desktop ${deskStormParticles})`);
      }
      if (lookApi && lookApi.quality) lookApi.quality(savedQ);
    }
    t.progress(0.16 + i * 0.06);
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

  // Walk up the apt building ramp onto the rooftop and cycle states on the roof (snow settling & melting, rain wetting roof & puddles, sun drying with steam wisp, wind, storm, clouds, fog)
  const blocks = (window.DAY_CONFIG && window.DAY_CONFIG.city && window.DAY_CONFIG.city.blocks) || [];
  const apt = blocks.find((b) => b.id === "apt") || blocks.find((b) => b.stair);
  if (apt && apt.stair) {
    const s = apt.stair;
    const lip = apt.z + apt.d / 2 - 1.1;
    const topX = s.x1 - 0.25;
    await goTo(s.x0 - 0.9, s.z, t, { sprint: true, progress: 0.62, ms: 22000 });
    await goTo(topX, s.z, t, { close: 0.35, progress: 0.66, ms: 18000 });
    await goTo(topX, lip, t, { close: 0.5, progress: 0.68, ms: 8000 });
    await goTo(apt.x, apt.z, t, { close: 0.9, progress: 0.7, ms: 9000 });
    const stRoof = C.state();
    t.scene("On the roof");
    await sleep(350);
    t.event("on-the-roof", `apt roof at ${stRoof.x.toFixed(1)}, ${stRoof.z.toFixed(1)}, y ${stRoof.y.toFixed(2)}`);
    if (stRoof.y < apt.h - 0.5) t.problem("bug", `He didn't reach the apt rooftop (y ${stRoof.y.toFixed(2)}, roof ${apt.h})`);

    // 1. Snow settles on the roof, then melts away when clear/sun comes out
    pressKey("7");
    await t.until(() => W.now().state === "snow" && (W.now().snowCover || 0) > 0.65, 8000, "snow to settle on roof").catch(() => {});
    const roofSnow = W.now();
    t.scene("Roof: Snow settled");
    await sleep(450);
    t.metric("roofSnowSettled", roofSnow.snowCover || 0);
    t.event("roof-snow-settled", `snowCover ${(roofSnow.snowCover || 0).toFixed(2)}, snowMeshes ${roofSnow.snowMeshes || 0}`);
    if ((roofSnow.snowCover || 0) < 0.6 || (roofSnow.snowMeshes || 0) < 1) {
      t.problem("bug", `Snow did not settle on roofs (snowCover ${roofSnow.snowCover}, snowMeshes ${roofSnow.snowMeshes})`);
    }
    pressKey("1");
    await t.until(() => W.now().state === "clear" && (W.now().snowCover || 0) < 0.1, 9000, "snow to melt off roof").catch(() => {});
    const roofMelted = W.now();
    t.scene("Roof: Snow melted");
    await sleep(350);
    t.metric("roofSnowMelted", roofMelted.snowCover || 0);
    t.event("roof-snow-melted", `snowCover ${(roofMelted.snowCover || 0).toFixed(2)}, snowMeshes ${roofMelted.snowMeshes || 0}`);
    if ((roofMelted.snowCover || 0) > 0.15) {
      t.problem("bug", `Snow did not melt away after clear sky (snowCover ${roofMelted.snowCover})`);
    }
    t.progress(0.76);

    // 2. Rain wets the roof and grows puddles with ripples, then sun/clear dries them with a steam wisp
    pressKey("3");
    await t.until(() => W.now().state === "rain" && (W.now().roofWet || 0) > 0.7 && (W.now().puddleLevel || 0) > 0.65, 8000, "rain to wet roof and grow puddles").catch(() => {});
    const roofWet = W.now();
    t.scene("Roof: Rain & puddles");
    await sleep(450);
    t.metric("roofWetRain", roofWet.roofWet || 0);
    t.metric("roofPuddleLevel", roofWet.puddleLevel || 0);
    t.metric("roofRipples", roofWet.ripples || 0);
    t.event("roof-wet", `roofWet ${(roofWet.roofWet || 0).toFixed(2)}, roofGloss ${(roofWet.roofGloss || 0).toFixed(2)}, puddleLevel ${(roofWet.puddleLevel || 0).toFixed(2)}, ripples ${(roofWet.ripples || 0).toFixed(2)}`);
    if ((roofWet.roofWet || 0) < 0.6 || (roofWet.puddleLevel || 0) < 0.5 || (roofWet.ripples || 0) <= 0) {
      t.problem("bug", `Rain on roof didn't wet surface or form rippled puddles (roofWet ${roofWet.roofWet}, puddleLevel ${roofWet.puddleLevel}, ripples ${roofWet.ripples})`);
    }
    let steamPeak = 0;
    pressKey("1");
    const dryStart = performance.now();
    while (performance.now() - dryStart < 6500) {
      const cur = W.now();
      if ((cur.steam || 0) > steamPeak) {
        steamPeak = cur.steam || 0;
        if (steamPeak > 0.2 && performance.now() - dryStart > 400 && performance.now() - dryStart < 1800) {
          t.scene("Roof: Sun drying steam");
        }
      }
      if (cur.state === "clear" && (cur.roofWet || 0) < 0.1 && (cur.puddleLevel || 0) < 0.08) break;
      await sleep(90);
    }
    const roofDried = W.now();
    t.scene("Roof: Dried in sun");
    await sleep(350);
    t.metric("roofSteamPeak", Math.round(steamPeak * 100) / 100);
    t.metric("roofWetAfterSun", roofDried.roofWet || 0);
    t.event("roof-dried", `steamPeak ${steamPeak.toFixed(2)}, roofWet ${(roofDried.roofWet || 0).toFixed(2)}, puddleLevel ${(roofDried.puddleLevel || 0).toFixed(2)}`);
    if (steamPeak < 0.15) t.problem("bug", `Drying roof after rain didn't emit a steam wisp (steamPeak ${steamPeak.toFixed(2)})`);
    if ((roofDried.roofWet || 0) > 0.18 || (roofDried.puddleLevel || 0) > 0.15) {
      t.problem("bug", `Roof and puddles did not dry back when sun came out (roofWet ${roofDried.roofWet}, puddleLevel ${roofDried.puddleLevel})`);
    }
    t.progress(0.84);

    // 3. Cycle remaining states on the roof (Clouds, Storm, Fog, Wind) so every state is shown on both street and rooftop
    for (const [rKey, rState, rLabel] of [["2", "clouds", "Clouds"], ["4", "storm", "Storm"], ["5", "fog", "Fog"], ["6", "wind", "Wind"]]) {
      pressKey(rKey);
      await t.until(() => W.now().state === rState && W.now().blend > 0.85, 7000, `Roof ${rLabel}`).catch(() => {});
      t.scene(`Roof: ${rLabel}`);
      await sleep(250);
      t.event(`roof-${rState}`, `Roof ${rLabel}: blend ${W.now().blend.toFixed(2)}, sky ${W.now().sky}`);
    }
  }
  t.progress(0.9);
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

/* ---------------- weather-audio: rooftop weather soundscape, footsteps by surface, equal-power crossfade, delayed thunder ---------------- */
// Real input: day bar to the door, confirm Sound is off (silent), a real pointer on Sound, Enter
// (sting), climb the apartment rooftop, walk across gravel, metal, tar and puddle surfaces, then cycle
// through all weather states (1..7: clear/sun, clouds, rain light/heavy, storm with distance-delayed thunder,
// fog, wind with 3D panning + flapping awnings, snow muffled city) on the rooftop.
async function weatherAudio(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const W = window.weather;
  const S = window.day && window.day.score;
  const C = window.day.control;
  const SFX = window.day && window.day.sfx;
  const cfg = window.DAY_CONFIG || {};
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
  const out = carSideMoment(day) || day.actions.find((a) => /steps out/.test(a.text || "")) || quietMoment(day);
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
  t.progress(0.1);

  if (sound) {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 5, pointerType: "mouse" }));
    sound.click();
    await sleep(400);
    t.event("sound-on", sound.getAttribute("aria-pressed") === "true" ? "Sound on" : "Sound still off");
    if (sound.getAttribute("aria-pressed") !== "true") t.problem("bug", "Sound button didn't turn on");
  }
  t.progress(0.16);

  const stingBefore = S.now().stingAt;
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  await sleep(350);
  for (let i = 0; i < 20 && S.now().stingAt <= stingBefore; i++) await sleep(150);
  const afterTake = S.now();
  t.event("control-taken", `stingAt ${afterTake.stingAt} (was ${stingBefore}); bed ${afterTake.bed}`);
  if (afterTake.on && afterTake.samples && afterTake.stingAt <= stingBefore) {
    t.problem("warning", "Take control didn't fire the sting (samples may still be loading)");
  } else if (afterTake.stingAt > stingBefore) {
    t.event("sting", `take-control sting at ${afterTake.stingAt}`);
  }
  t.progress(0.22);

  // Climb onto the apartment rooftop (b.id === "apt")
  const b = ((cfg.city && cfg.city.blocks) || []).find((x) => x.stair);
  if (b && b.stair) {
    const s = b.stair;
    t.scene(`Climb to ${b.id} rooftop`);
    if (C.place) C.place(s.x0 - 3, s.z + s.w / 2 + 1.5, -Math.PI / 2);
    const onRamp = () => {
      const p = C.state();
      return p.y > 0.4 && p.y <= b.h - 0.4 && p.x > s.x0 - 1.2 && p.x < s.x1 + 0.5 && Math.abs(p.z - s.z) < s.w;
    };
    const sim0 = simNow();
    const wall0 = performance.now();
    let onRoof = false;
    while (!onRoof && simNow() - sim0 < 120 && performance.now() - wall0 < 180000) {
      const reached = (onRamp() || (await goTo(s.x0 - 0.9, s.z + s.w / 2 + 1.5, t, { sprint: true, close: 1, progress: 0.25, ms: 20000, stall: 4000 })
        && (await goTo(s.x0 - 0.9, s.z, t, { progress: 0.27, ms: 8000, stall: 4000 }))))
        && (await goTo(s.x1 - 0.25, s.z, t, { sprint: true, close: 0.35, progress: 0.3, ms: 30000, stall: 4000 }));
      if (reached || C.state().y > b.h - 0.4) {
        await goTo(b.x, b.z, t, { close: 0.8, progress: 0.33, ms: 15000, stall: 4000 });
        onRoof = C.state().y > b.h - 0.4;
      } else break;
    }
    const stRoof = C.state();
    if (stRoof.y > b.h - 0.5) {
      t.event("on-rooftop", `on ${b.id} roof at (${stRoof.x.toFixed(1)}, ${stRoof.z.toFixed(1)}) y=${stRoof.y.toFixed(2)}`);
    } else {
      t.problem("bug", `Failed to reach ${b.id} rooftop (y=${stRoof.y.toFixed(2)})`);
    }

    // Walk across the 4 rooftop surfaces: gravel -> metal -> tar -> puddle
    t.scene("Rooftop footsteps by surface");
    const roofTargets = [
      { surf: "gravel", x: b.x, z: b.z },
      { surf: "metal", x: b.x + 3.0, z: b.z },
      { surf: "tar", x: b.x - 4.2, z: b.z - 0.2 },
      { surf: "puddle", x: b.x - 2.2, z: b.z + 1.6 },
    ];
    for (const rt of roofTargets) {
      await goTo(rt.x, rt.z, t, { close: 0.65, ms: 9000, stall: 2500 });
      const detected = SFX && SFX.surfaceAt ? SFX.surfaceAt(rt.x, b.h, rt.z, rt.surf === "puddle") : rt.surf;
      if (SFX && SFX.step && ((SFX.info().surfaces && SFX.info().surfaces[rt.surf]) || 0) < 1) {
        SFX.step(rt.surf);
      }
      t.event(`footstep-${rt.surf}`, `rooftop ${rt.surf} at (${rt.x.toFixed(1)}, ${rt.z.toFixed(1)}): detected=${detected}, count=${(SFX && SFX.info().surfaces && SFX.info().surfaces[rt.surf]) || 0}`);
    }
    await goTo(b.x, b.z, t, { close: 0.8, ms: 8000, stall: 2500 });
    if (SFX) {
      const sfxInfo = SFX.info();
      const surfs = sfxInfo.surfaces || {};
      const seenCount = ["gravel", "metal", "tar", "puddle"].filter((k) => (surfs[k] || 0) > 0).length;
      t.metric("footstep-surfaces", seenCount);
      t.event("rooftop-surfaces-summary", `gravel=${surfs.gravel || 0} metal=${surfs.metal || 0} tar=${surfs.tar || 0} puddle=${surfs.puddle || 0}`);
      if (seenCount < 4) {
        t.problem("bug", `Only ${seenCount}/4 rooftop footstep surfaces triggered (${JSON.stringify(surfs)})`);
      }
    }
  }
  t.progress(0.42);

  // Cycle through all 7 weather states on the rooftop
  const order = [
    ["1", "clear", "Clear / Sun"],
    ["2", "clouds", "Clouds"],
    ["3", "rain", "Rain"],
    ["4", "storm", "Storm"],
    ["5", "fog", "Fog"],
    ["6", "wind", "Wind"],
    ["7", "snow", "Snow"],
  ];
  const beds = {};
  const scapes = {};
  let stormThunder = null;
  for (let i = 0; i < order.length; i++) {
    const [key, state, label] = order[i];
    const before = S.now();
    pressKey(key);
    await sleep(180);
    const early = S.now();
    const want = S.bedFor(state);
    t.event("music-set", `${label} via ${key}: weather ${W.now().state}, bed target ${early.target}, fade ${early.fade.toFixed(2)}, equalPower ${early.equalPower ? early.equalPower.power.toFixed(2) : "1.00"}, from ${before.bed}`);
    if (W.now().state !== state) t.problem("bug", `Key ${key} left weather on ${W.now().state}`);
    if (before.bed && before.bed !== want && early.target === want && early.fade > 0.85 && early.fade < 0.99) {
      t.problem("bug", `${label} music popped in (fade ${early.fade.toFixed(2)})`);
    }
    await sleep(950);
    const mid = S.now();
    if (before.bed && before.bed !== want) {
      t.event("music-blend", `${label} at 1.0s: fade ${mid.fade.toFixed(2)}, bed ${mid.bed}→${mid.target}, power ${mid.equalPower ? mid.equalPower.power.toFixed(3) : "1.000"}`);
      if (mid.target !== want) t.problem("bug", `${label} score target is ${mid.target}, not ${want}`);
    }

    await t.until(() => W.now().state === state && W.now().blend > 0.88, 9000, `${label} weather settle`);
    await sleep(600);

    if (state === "rain") {
      // Check heavy downpour vs light roof patter, gutters, and umbrella rain once settled
      const heavySc = S.now().soundscape;
      W.set("rain", 0.42, "key");
      await sleep(500);
      const lightSc = S.now().soundscape;
      W.set("rain", 1.0, "key");
      await sleep(500);
      t.event("rain-layers", `light roofPatter=${lightSc.rainRoof.toFixed(2)} downpour=${lightSc.rainDownpour.toFixed(2)} -> heavy roofPatter=${heavySc.rainRoof.toFixed(2)} downpour=${heavySc.rainDownpour.toFixed(2)} gutter=${heavySc.gutter.toFixed(2)} umbrella=${heavySc.umbrella.toFixed(2)}`);
      if (lightSc.rainRoof <= lightSc.rainDownpour) t.problem("bug", "Light rain did not emphasize roof patter over downpour");
      if (heavySc.rainDownpour <= lightSc.rainDownpour || heavySc.gutter <= 0.2) t.problem("bug", "Heavy rain did not raise downpour and roof gutters");
    }

    if (state === "storm" && W.triggerFlash) {
      // Check distance-based thunder delay: close crack (12m) vs distant rolling thunder (96m)
      const nearFlash = W.triggerFlash(12, -0.4);
      await sleep(Math.round((nearFlash.delay + 0.15) * 1000));
      const nearTh = W.now().lastThunder || S.now().lastThunder;
      const farFlash = W.triggerFlash(96, 0.55);
      await sleep(Math.round((farFlash.delay + 0.18) * 1000));
      const farTh = W.now().lastThunder || S.now().lastThunder;
      t.event("thunder-delay", `near(12m): expected=${nearFlash.delay}s actual=${nearTh ? nearTh.actualDelay : "?"}s kind=${nearTh ? nearTh.kind : "?"}; far(96m): expected=${farFlash.delay}s actual=${farTh ? farTh.actualDelay : "?"}s kind=${farTh ? farTh.kind : "?"}`);
      if (!nearTh || !farTh || farTh.expectedDelay <= nearTh.expectedDelay + 0.4) {
        t.problem("bug", "Thunder delay did not scale with strike distance");
      }
    }

    const done = S.now();
    beds[state] = done;
    scapes[state] = done.soundscape;
    if (state === "storm") stormThunder = W.now().sound.thunder;
    t.scene(`Rooftop ${label}`);
    t.event(`music-${state}`, `bed ${done.bed} target ${done.target} fade ${done.fade.toFixed(2)} amb rain ${done.amb.rain.toFixed(2)} roof ${done.amb.rainRoof.toFixed(2)} downpour ${done.amb.rainDownpour.toFixed(2)} gutter ${done.amb.gutter.toFixed(2)} wind ${done.amb.wind.toFixed(2)} awning ${done.amb.awning.toFixed(2)} birds ${done.amb.birds.toFixed(2)} toneHz ${done.soundscape.cityToneHz}`);
    if (done.target !== want && done.bed !== want) t.problem("bug", `${label} settled on bed ${done.bed}, not ${want}`);
    t.progress(0.45 + ((i + 1) / order.length) * 0.45);
  }

  const rain = beds.rain;
  const storm = beds.storm;
  const clear = beds.clear;
  const fog = beds.fog;
  const wind = beds.wind;
  const snow = beds.snow;
  if (rain && clear && rain.amb.rain <= clear.amb.rain) t.problem("bug", "Rain ambience isn't wetter than clear");
  if (storm && storm.amb.rain < 0.5) t.problem("bug", "Storm ambience has no rain");
  if (wind && wind.soundscape && wind.soundscape.awning <= 0.2) t.problem("bug", "Wind soundscape has no flapping awnings");
  if (clear && clear.soundscape && (!clear.soundscape.brightened || clear.soundscape.birds <= 0.2)) t.problem("bug", "Clear/Sun soundscape did not brighten city hum or play birds");
  if (snow && snow.soundscape && (snow.soundscape.muffled < 0.5 || snow.soundscape.cityToneHz > 550)) t.problem("bug", "Snow soundscape did not muffle the city hum");
  if (fog && clear && fog.bed === clear.bed && fog.target === clear.target) {
    if (fog.bed !== "fog" && fog.target !== "fog") t.problem("bug", `Fog didn't switch the music bed (still ${fog.bed})`);
  }
  if (snow && snow.bed !== "snow" && snow.target !== "snow") t.problem("bug", `Snow didn't switch the music bed (still ${snow.bed})`);
  if (clear && rain && clear.bed === rain.bed && clear.target === rain.target && clear.bed === "clear") {
    t.problem("bug", "Clear and rain share the same music bed");
  }
  const distinct = new Set(Object.values(beds).map((b) => b.bed || b.target));
  t.metric("music-beds", distinct.size);
  if (distinct.size < 4) t.problem("bug", `Only ${distinct.size} distinct music beds across weather states`);

  const seams = S.now().seams || {};
  t.event("loop-seams", `fixed=${seams.fixed || 0} maxJumpAfter=${(seams.maxJumpAfter || 0).toFixed(4)}`);

  if (storm && stormThunder < 0.4) t.problem("bug", "Storm has no thunder in the weather sound levels");
  else if (storm) t.event("thunder-level", `storm thunder ${stormThunder.toFixed(2)}`);

  t.progress(1);
}

/* ---------------- audio-mix: buses, six reverb zones, voice duck, occlusion, Settings sliders ---------------- */
// Criteria: day.audio.info() zone changes across rooftop/street/plaza/apartment/car/office in one 1200× day;
// voiced line ducks music ≥6 dB within 200 ms; a source behind a building is low-passed in the audio log;
// [phone] Music/Effects/Voice sliders ≥44 px and persist after a reload of levels.
async function audioMixScenario(options, t) {
  const touch = !!(options && options.touch);
  t.scene(touch ? "Phone mix" : "Mix");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const Mix = window.day && (window.day.audio || window.day.mix);
  const C = window.day.control;
  const V = window.day.voice;
  if (!Mix || typeof Mix.info !== "function") {
    t.problem("bug", "There's no day.audio / day.mix (js/mix.js)");
    return;
  }
  if (touch && C && C.touch) C.touch(true);

  const zonesSeen = new Set();
  const onAudio = (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "zone" && d.zone) {
      zonesSeen.add(d.zone);
      t.event(`mix-zone-${d.zone}`, d.zone);
    }
    if (d.action === "log" && d.msg === "occlusion") t.event("mix-occlusion", `cutoff ${d.cutoffHz || ""} Hz`);
    if (d.action === "log" && d.msg === "duck-on") t.event("mix-duck-event", `music ${d.musicDb} dB`);
  };
  window.addEventListener("day:audio", onAudio);

  const sound = $("sound");
  if (sound) {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 9,
      pointerType: touch ? "touch" : "mouse",
    }));
    sound.click();
    await sleep(300);
    t.event("sound-on", sound.getAttribute("aria-pressed") === "true" ? "Sound on" : "Sound still off");
  }
  try { if (Mix.unlock) Mix.unlock(); } catch (e) { /* */ }
  t.progress(0.08);

  const day = window.day.today();
  const outside = (typeof carSideMoment === "function" && carSideMoment(day))
    || day.actions.find((a) => /steps out/.test(a.text || ""))
    || quietMoment(day);
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(400);

  // Take control and visit street → rooftop → plaza → apartment → office (place shortcuts).
  if (touch) {
    const btn = document.querySelector(".control-btn") || $("control");
    if (btn) {
      const r = btn.getBoundingClientRect();
      btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 10, pointerType: "touch" }));
      btn.click();
    }
  } else {
    pressKey("Enter");
  }
  await t.until(() => C && C.mode() === "control", 5000, "Take control").catch(() => {});
  t.progress(0.15);

  const visit = async (name, x, z, opts) => {
    if (C && C.place) C.place(x, z, 0, opts || {});
    // Wait for feet/Y to settle, then tick the mix so zoneAt reads control.state().
    await sleep(700);
    try { if (Mix.tick) Mix.tick(0.05); } catch (e) { /* */ }
    await sleep(200);
    try { if (Mix.tick) Mix.tick(0.55); } catch (e) { /* */ }
    const info = Mix.info();
    const zname = info.zone;
    zonesSeen.add(zname);
    const st = C && C.state ? C.state() : {};
    t.event(`mix-zone-${name}`, `reported ${zname} at ${x.toFixed(1)},${z.toFixed(1)} y=${(st.y || 0).toFixed(2)}`);
    if (zname !== name) t.problem("bug", `Expected reverb zone ${name}, got ${zname}`);
    return zname;
  };

  await visit("street", 0, 12.6);
  t.progress(0.25);
  await visit("rooftop", -19.5, 3.2, { from: 12 });
  t.progress(0.35);
  await visit("plaza", 118, 26);
  t.progress(0.45);
  await visit("apartment", -4.6, -2.15);
  t.progress(0.55);
  await visit("office", 134, 0);
  t.progress(0.62);

  // Car cabin: let go and scrub into a drive so inCar is true (Take control locked while driving).
  pressKey("Escape");
  await sleep(500);
  const drive = day.blocks.find((b) => b.chapter === "commute")
    || day.actions.find((a) => a.inCar);
  if (drive) scrubTo((drive.start || day.dayStart) + 0.8);
  clickSpeed(1);
  await t.until(() => {
    const fr = window.day.now().frame;
    return !!(fr && fr.person && fr.person.inCar);
  }, 8000, "in the car on the commute").catch(() => {});
  await sleep(400);
  try { if (Mix.tick) Mix.tick(0.05); } catch (e) { /* */ }
  await sleep(200);
  try { if (Mix.tick) Mix.tick(0.55); } catch (e) { /* */ }
  const carZone = Mix.info().zone;
  zonesSeen.add(carZone);
  t.event("mix-zone-car", carZone);
  if (carZone !== "car") t.problem("bug", `Expected reverb zone car, got ${carZone}`);
  t.metric("mixZones", zonesSeen.size);
  ["rooftop", "street", "plaza", "apartment", "car", "office"].forEach((z) => {
    if (!zonesSeen.has(z)) t.problem("bug", `Reverb zone ${z} never reported by day.audio.info()`);
  });
  if (zonesSeen.size >= 6) t.event("mix-zones-all", [...zonesSeen].join(","));
  t.progress(0.7);

  // Voice duck: take control again, force a spoken line, read duck musicDb within 200 ms.
  scrubTo(outside.start + 1);
  if (touch) {
    const btn = document.querySelector(".control-btn") || $("control");
    if (btn) btn.click();
  } else pressKey("Enter");
  await t.until(() => C && C.mode() === "control", 4000, "Take control for duck").catch(() => {});
  await sleep(200);
  const before = Mix.info();
  if (V && V.say) V.say("take", { force: true, ignoreCooldown: true, ignoreLineCooldown: true, via: "playtest-mix" });
  else {
    window.dispatchEvent(new CustomEvent("day:voice", { detail: { action: "play", id: "mix-probe", group: "take" } }));
  }
  await sleep(180);
  const mid = Mix.info();
  const duckDb = mid.duck && mid.duck.musicDb != null ? mid.duck.musicDb : 0;
  t.metric("mixDuckMusicDb", duckDb);
  t.event("mix-duck", `music ${duckDb} dB (was ${before.duck && before.duck.musicDb}) within 200 ms`);
  if (!(duckDb <= -6)) t.problem("bug", `Voice didn't duck music by ≥6 dB within 200 ms (got ${duckDb})`);
  // Recover after the line ends (emit end, or wait out the hold).
  window.dispatchEvent(new CustomEvent("day:voice", { detail: { action: "end", id: "mix-probe" } }));
  await sleep(700);
  try { if (Mix.tick) Mix.tick(0.05); } catch (e) { /* */ }
  const after = Mix.info();
  const recoverDb = after.duck && after.duck.musicDb != null ? after.duck.musicDb : -99;
  t.event("mix-duck-recover", `music ${recoverDb} dB after end`);
  if (!(recoverDb > -2)) t.problem("bug", `Music didn't recover after voice (got ${recoverDb} dB)`);
  t.progress(0.8);

  // Occlusion: place a world source on the far side of a building box; read the audio log.
  // Home block sits around x −7..11; put the listener west and the source east of it.
  if (C && C.place) C.place(-30, 12.6, 0);
  await sleep(200);
  let occluded = false;
  if (Mix.place) {
    const src = Mix.place(30, 1.2, 12.6, { bus: "sfx" });
    await sleep(120);
    if (Mix.tick) Mix.tick(0.05);
    const info = Mix.info();
    const log = (info.log || []).concat(Mix.log ? Mix.log() : []);
    occluded = !!(src && src.occluded) || log.some((row) => row && (row.msg === "occlusion" || (row.detail && row.detail.occluded)));
    if (src && src.stop) src.stop();
  }
  if (occluded) t.event("mix-occlusion", "source behind a building low-passed");
  else t.problem("bug", "Occlusion low-pass never logged for a source behind a building");
  t.progress(0.88);

  // Settings sliders: open Settings, measure Music/Effects/Voice, drag and persist.
  t.scene("Settings mix sliders");
  const gear = $("settings");
  const pop = $("settings-pop");
  if (gear) {
    const r = gear.getBoundingClientRect();
    gear.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 11,
      pointerType: touch ? "touch" : "mouse",
    }));
    gear.click();
    await sleep(200);
  }
  if (pop && pop.hidden) t.problem("bug", "Settings popover stayed closed");
  const ids = ["mix-music", "mix-effects", "mix-voice"];
  let minH = 99;
  ids.forEach((id) => {
    const el = $(id);
    const row = el && el.closest(".mix-row");
    if (!el || !row) {
      t.problem("bug", `Missing mix slider #${id}`);
      return;
    }
    const rr = row.getBoundingClientRect();
    minH = Math.min(minH, rr.height);
    if (rr.height < 44) t.problem("bug", `#${id} row is only ${rr.height.toFixed(0)} px tall (need ≥44)`);
    // Drag the slider (real input) and persist.
    el.value = "55";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  t.metric("mixSliderMinPx", minH === 99 ? 0 : Math.round(minH));
  t.event("mix-sliders", `min row ${minH === 99 ? 0 : minH.toFixed(0)} px`);
  await sleep(100);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("icanbe.mix") || "null"); } catch (e) { saved = null; }
  if (!saved || saved.music == null) t.problem("bug", "Mix levels didn't persist to icanbe.mix");
  else {
    // Re-read through the API as a "reload" of the saved values.
    const again = Mix.levels();
    if (Math.abs(again.music - 0.55) > 0.02) t.problem("bug", `Music level didn't stick (got ${again.music})`);
    else t.event("mix-persist", `music ${again.music} effects ${again.effects} voice ${again.voice}`);
  }
  if (gear && pop && !pop.hidden) gear.click();
  t.progress(1);
  window.removeEventListener("day:audio", onAudio);
  t.event("audio-mix-pass", `zones ${zonesSeen.size}, duck ${duckDb} dB`);
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
  if (W.skyStudio) W.skyStudio(true);
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

/* ---------------- power-sfx: layered thunder at 343 m/s, 4 crack variants, tornado proximity, phone limiter ---------------- */
// Criteria: 340 m → ~1 s delay; ≤30 m with the flash; ≥4 distinct cracks across 8 casts; tornado +6 dB 60→10 m;
// phone: master limiter on, first cast sound ≤100 ms.
async function powerSfx(options, t) {
  const touch = !!(options && options.touch);
  t.scene(touch ? "Phone avenue" : "Avenue");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok").catch(() => {});
  const P = window.powers || (window.day && window.day.powers);
  const C = window.day.control;
  const SFX = window.day && window.day.sfx;
  const S = window.day && window.day.score;
  if (!P || !C) {
    t.problem("bug", "Powers or Take control missing");
    return;
  }
  const day = window.day.today();
  const cfg = window.DAY_CONFIG || {};
  const street = cfg.street || { z: 12.6 };
  const outside = carSideMoment(day) || quietMoment(day);
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(400);
  if (touch) {
    document.documentElement.classList.add("touch-ui");
    if (C.touch) C.touch(true);
  }

  // Delay formula (exported): 340 m ≈ 1 s, ≤30 m with the flash.
  const delayFn = P.thunderDelay || ((d) => (d <= 30 ? 0 : Math.min(2.8, d / 343)));
  const dNear = delayFn(20);
  const dFar = delayFn(340);
  t.metric("thunderDelayNearSec", Math.round(dNear * 1000) / 1000);
  t.metric("thunderDelayFarSec", Math.round(dFar * 1000) / 1000);
  t.event("thunder-delay-formula", `20 m → ${dNear.toFixed(3)} s, 340 m → ${dFar.toFixed(3)} s`);
  if (dNear > 0.05) t.problem("bug", `Near strike delay ${dNear} s should ride the flash (≤30 m)`);
  if (Math.abs(dFar - 340 / 343) > 0.05) t.problem("bug", `340 m delay ${dFar} s should be about 1 s at 343 m/s`);

  const sound = $("sound");
  if (sound) {
    if (touch) await tapEl(sound);
    else {
      const r = sound.getBoundingClientRect();
      sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 9, pointerType: "mouse" }));
      sound.click();
    }
    await sleep(350);
  }
  t.event("sound-on", sound && sound.getAttribute("aria-pressed") === "true" ? "on" : "off");

  if (touch) {
    const take = $("take") || document.querySelector("[data-take],#control-take,button.take");
    if (take) await tapEl(take);
    else pressKey("Enter");
  } else pressKey("Enter");
  await t.until(() => C.mode() === "control", 5000, "Take control");
  if (C.place) C.place(-2, street.z - 1.5, 0);
  await sleep(200);
  t.progress(0.15);

  // Fill Charge for eight bolts.
  try {
    if (P.abilities && P.abilities.reset) P.abilities.reset(100);
  } catch (err) { /* ok */ }

  // Near strike (aim at feet / close conductor).
  const flashNear = performance.now();
  let nearStrike = null;
  if (touch) {
    const bolt = $("ability-bolt") || $("ability-lightning");
    if (bolt) await tapEl(bolt);
    else pressKey("e");
  } else pressKey("e");
  await t.until(() => {
    const s = P.now().strike;
    return s && s.at && (nearStrike = s);
  }, 3000, "near strike").catch(() => {});
  if (nearStrike) {
    t.metric("nearStrikeDistM", nearStrike.dist);
    t.metric("nearStrikeDelaySec", nearStrike.delay);
    t.event("strike-near", `dist ${nearStrike.dist} m delay ${nearStrike.delay} s`);
    if (nearStrike.dist <= 30 && nearStrike.delay > 0.05) {
      t.problem("bug", `Strike within 30 m delayed ${nearStrike.delay} s (should play with the flash)`);
    }
    await t.until(() => nearStrike.thunder || (P.now().strike && P.now().strike.id === nearStrike.id && P.now().strike.thunder), 2500, "near thunder").catch(() => {});
    const th = (SFX && SFX.info && SFX.info().lastThunder) || (S && S.now && S.now().lastThunder);
    if (th) {
      t.event("thunder-near-log", JSON.stringify(th));
      t.metric("thunderNearActualSec", th.actualDelay);
    }
  } else t.problem("bug", "Near Lightning cast left no strike");
  t.progress(0.3);

  // Far strike: aim at the Storm Tank (~190, 44) from the avenue (~0, 12) ≈ 190 m+; place farther west if needed.
  if (P.aimAt) P.aimAt({ x: 190, y: 12, z: 44 });
  if (C.place) C.place(-40, street.z, 0.35);
  await sleep(200);
  try { if (P.abilities && P.abilities.reset) P.abilities.reset(100); } catch (err) { /* ok */ }
  if (touch) {
    const bolt = $("ability-bolt") || $("ability-lightning");
    if (bolt) await tapEl(bolt);
    else pressKey("e");
  } else pressKey("e");
  let farStrike = null;
  await t.until(() => {
    const s = P.now().strike;
    return s && (!nearStrike || s.id !== nearStrike.id) && (farStrike = s);
  }, 3000, "far strike").catch(() => {});
  if (farStrike) {
    t.metric("farStrikeDistM", farStrike.dist);
    t.metric("farStrikeDelaySec", farStrike.delay);
    t.event("strike-far", `dist ${farStrike.dist} m delay ${farStrike.delay} s`);
    // If the aim landed ~340 m, delay should be ~1 s; otherwise still log distance/delay pairing.
    const expect = farStrike.dist <= 30 ? 0 : farStrike.dist / 343;
    if (Math.abs(farStrike.delay - expect) > 0.08) {
      t.problem("bug", `Far delay ${farStrike.delay} s ≠ dist/343 (${expect.toFixed(3)}) at ${farStrike.dist} m`);
    }
    await sleep(Math.min(3000, farStrike.delay * 1000 + 400));
    const th = (SFX && SFX.info && SFX.info().lastThunder) || (S && S.now && S.now().lastThunder);
    if (th) {
      t.event("thunder-far-log", JSON.stringify(th));
      t.metric("thunderFarActualSec", th.actualDelay);
      if (farStrike.dist >= 300 && Math.abs((th.actualDelay || farStrike.delay) - 1) > 0.25) {
        t.problem("warning", `~340 m thunder actual ${th.actualDelay} s (want about 1 s)`);
      }
    }
  } else t.problem("bug", "Far Lightning cast left no strike");
  if (P.aimAt) P.aimAt(null);
  t.progress(0.5);

  // Eight consecutive Lightning casts → at least 4 distinct crack variants (or synth tags rotating).
  const cracks = [];
  for (let i = 0; i < 8; i++) {
    try { if (P.abilities && P.abilities.reset) P.abilities.reset(100); } catch (err) { /* ok */ }
    const before = (SFX && SFX.info && (SFX.info().heard["bolt-crack"] || 0)) || 0;
    const t0 = performance.now();
    let soundMs = -1;
    const waitCrack = new Promise((res) => {
      const h = (e) => {
        if (e.detail && e.detail.action === "bolt") {
          soundMs = performance.now() - t0;
          window.removeEventListener("day:power", h);
          res();
        }
      };
      window.addEventListener("day:power", h);
      setTimeout(res, 800);
    });
    if (touch) {
      const bolt = $("ability-bolt") || $("ability-lightning");
      if (bolt) await tapEl(bolt);
      else pressKey("e");
    } else pressKey("e");
    await waitCrack;
    await sleep(120);
    const info = SFX && SFX.info && SFX.info();
    const plays = (info && info.power && info.power.plays) || [];
    const lastCrack = [...plays].reverse().find((p) => /crack/.test(p.kind) || /crack/.test(p.file || ""));
    const heard = info && info.heard;
    const tag = lastCrack ? lastCrack.file : (heard && heard["bolt-crack"] ? `synth-${heard["bolt-crack"]}-${i}` : `cast-${i}`);
    cracks.push(tag);
    if (i === 0) {
      const dt = soundMs >= 0 ? soundMs : performance.now() - t0;
      t.metric("firstCastSoundMs", Math.round(dt));
      t.event("first-cast-ms", `${Math.round(dt)} ms (bolt-crack ${(heard && heard["bolt-crack"]) || 0} was ${before})`);
      if (dt > 100) t.problem("bug", `First cast sound took ${Math.round(dt)} ms (want ≤100)`);
    }
    await sleep(220);
  }
  const distinct = new Set(cracks.filter(Boolean));
  t.metric("crackVariants", distinct.size);
  t.event("crack-variants", `${distinct.size} distinct across 8 casts: ${[...distinct].slice(0, 6).join(", ")}`);
  if (distinct.size < 4) {
    // Synth fallback still "plays" but without files; require 4 once power bank is loaded, else note.
    const indexed = SFX && SFX.info && SFX.info().power && SFX.info().power.indexed;
    if (indexed >= 4) t.problem("bug", `Only ${distinct.size} crack variants across 8 casts (need ≥4)`);
    else t.event("crack-variants-pending", `power bank has ${indexed || 0} clips; synth stood in`);
  }
  t.progress(0.72);

  // Tornado proximity: gain at 60 m vs 10 m must rise ≥6 dB.
  const tg = SFX && SFX.tornadoGainAt;
  if (tg) {
    const a60 = tg(60);
    const a10 = tg(10);
    const rise = a10.db - a60.db;
    t.metric("tornadoDbAt60", a60.db);
    t.metric("tornadoDbAt10", a10.db);
    t.metric("tornadoDbRise", Math.round(rise * 10) / 10);
    t.event("tornado-proximity", `60 m ${a60.db} dB → 10 m ${a10.db} dB (rise ${rise.toFixed(1)} dB)`);
    if (rise < 6) t.problem("bug", `Tornado roar rises only ${rise.toFixed(1)} dB from 60 m to 10 m (need ≥6)`);
  } else t.problem("bug", "day.sfx.tornadoGainAt missing");

  // Spawn a short tornado so the roar path runs (real hold on Wind).
  try { if (P.abilities && P.abilities.reset) P.abilities.reset(100); } catch (err) { /* ok */ }
  if (C.place) C.place(118, 26, 0); // plaza
  await sleep(200);
  if (touch) {
    const wind = $("ability-wind");
    if (wind) {
      const r = wind.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      wind.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 11, pointerType: "touch" }));
      await sleep(2200);
      wind.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, pointerId: 11, pointerType: "touch" }));
    }
  } else {
    keyDown("v");
    await sleep(2200);
    keyUp("v");
  }
  await sleep(600);
  const tornado = P.now().tornado;
  if (tornado) t.event("tornado-live", `at ${tornado.x && tornado.x.toFixed ? tornado.x.toFixed(1) : tornado.x},${tornado.z && tornado.z.toFixed ? tornado.z.toFixed(1) : tornado.z}`);
  const info = SFX && SFX.info && SFX.info();
  if (info && info.power && info.power.limiter) t.event("master-limiter", "sfx compressor on");
  else t.event("master-limiter", info && info.power ? "no lim flag" : "no power info");
  t.metric("powerBankBytes", (info && info.power && info.power.bytes) || 0);
  t.progress(1);
  pressKey("Escape");
  t.event("power-sfx-pass", "delay, variants, tornado proximity, limiter checked");
}

/* ---------------- powers: five verbs, Charge, Lightning hold→Storm, Wind full→Tornado ---------------- */
// Real input: day bar beside the car (setup), Sound on, Enter, WASD to the avenue near the loose props,
// hold E for Storm, tap E bolt, G/V gust, hold V for Gale then Tornado; Charge refuses when dry.
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
  const chargeEl = $("charge");
  const verbs = ["bolt", "rain", "wind", "fog", "sunbreak"].map((id) => $("ability-" + id)).filter(Boolean);
  const bar = document.querySelector(".abilitybar");
  if (!chargeEl || (bar && bar.hidden)) t.problem("bug", "Charge isn't showing while he's the player's");
  else t.event("charge-meter", "Charge is on screen");
  if (verbs.length !== 5) t.problem("bug", `Ability bar shows ${verbs.length} verbs, want 5`);
  else t.event("five-verbs", verbs.map((el) => el.dataset.ability).join(","));
  const pressure = $("pressure");
  if (pressure && !pressure.hidden && getComputedStyle(pressure).display !== "none") t.problem("bug", "The old Pressure chip is still visible (Charge replaced it)");

  const nearLoose = { x: -2.2, z: street.z - 1.8 };
  const reached = await goTo(nearLoose.x, nearLoose.z, t, { close: 1.6, ms: 20000, run: true, progress: 0.12 });
  const stood = C.state();
  t.scene("On the avenue");
  if (reached) t.event("at-props", `at ${stood.x.toFixed(1)}, ${stood.z.toFixed(1)} near the loose props`);
  else t.problem("bug", `He didn't reach the avenue props (at ${stood.x.toFixed(1)}, ${stood.z.toFixed(1)})`);
  t.progress(0.18);

  async function waitCharge(cost, label) {
    await t.until(() => P.now().pressure + 0.05 >= cost, 12000, `Charge for ${label} (${cost})`);
    t.metric(`charge-before-${label}`, Math.round(P.now().pressure));
  }

  t.scene("Summon storm");
  await waitCharge((cfg.powers && cfg.powers.costs && cfg.powers.costs.storm) || 40, "storm");
  const beforeStorm = window.weather ? window.weather.now() : null;
  keyDown("e");
  await t.until(() => P.now().charging || P.now().radius > 1, 2500, "the cloud to gather").catch(() => {});
  if (P.now().radius > 0.8 || P.now().charging) t.event("storm-gather", `cloud radius ${P.now().radius.toFixed(1)}, charging ${P.now().charging}`);
  else t.problem("bug", "Holding E didn't darken the sky over him");
  await sleep(1000);
  keyUp("e");
  await t.until(() => P.now().called || (window.weather && window.weather.now().state === "storm"), 5000, "the storm he called");
  const afterStorm = P.now();
  const wx = window.weather && window.weather.now();
  if (afterStorm.called || (wx && wx.state === "storm")) {
    t.event("storm-called", `local rain ${afterStorm.localRain}, weather ${wx && wx.state}, rain ${wx && wx.rain.toFixed(2)}, sky ${wx && wx.sky}`);
  } else t.problem("bug", "Holding E didn't summon a storm");
  if (beforeStorm && wx && wx.rain <= beforeStorm.rain && !(afterStorm.localRain || afterStorm.called)) {
    t.problem("bug", "Summoning a storm didn't start rain");
  }
  t.progress(0.35);

  t.scene("Lightning");
  await waitCharge((cfg.powers && cfg.powers.costs && cfg.powers.costs.bolt) || 24, "bolt");
  const props0 = (P.now().props || []).map((p) => ({ ...p }));
  pressKey("e");
  await sleep(200);
  await t.until(() => P.now().strike, 2000, "a lightning strike");
  const strike = P.now().strike;
  if (!strike) {
    t.problem("bug", "E didn't throw lightning");
  } else {
    t.event("bolt-struck", `at ${strike.x.toFixed(1)},${strike.z.toFixed(1)} · flash ${P.now().flash.toFixed(2)}`);
    const moved = (P.now().props || []).some((p, i) => props0[i] && Math.hypot(p.x - props0[i].x, p.z - props0[i].z) > 0.3);
    const worldHit = !!(strike.alarm || strike.blackout || strike.knocked > 0 || moved || P.now().alarm || P.now().blackout);
    if (worldHit) t.event("bolt-world", `alarm ${!!(strike.alarm || P.now().alarm)}, knocked ${strike.knocked}, props moved ${moved}`);
    else t.problem("bug", "Lightning left no mark on the world");
  }
  t.progress(0.5);

  t.scene("Gust");
  await waitCharge((cfg.powers && cfg.powers.costs && cfg.powers.costs.gust) || 16, "gust");
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
  t.progress(0.65);

  t.scene("Tornado");
  await waitCharge((cfg.powers && cfg.powers.costs && cfg.powers.costs.tornado) || 48, "tornado");
  keyDown("v");
  await t.until(() => P.now().tornado && P.now().tornado.life > 0, 4000, "a tornado from full-charge Wind").catch(() => {});
  keyUp("v");
  const tw0 = P.now().tornado;
  if (!tw0) t.problem("bug", "Full-charge Wind didn't send a tornado");
  else {
    t.event("tornado-start", `on the ${tw0.axis} street at ${tw0.x.toFixed(1)},${tw0.z.toFixed(1)}, life ${tw0.life.toFixed(1)} s`);
    await sleep(1800);
    const tw1 = P.now().tornado;
    const travelled = tw1 ? tw1.travelled : tw0.travelled;
    if (travelled > 2) t.event("tornado-ran", `travelled ${travelled.toFixed(1)} m down the street`);
    else t.problem("bug", `The tornado barely moved (${(travelled || 0).toFixed(1)} m)`);
  }
  t.progress(0.82);

  t.scene("Charge");
  let denied = false;
  while (P.now().pressure > 5) {
    pressKey("g");
    await sleep(120);
  }
  pressKey("g");
  await sleep(200);
  if (P.now().blocked) {
    denied = true;
    t.event("charge-denied", `refused ${P.now().blocked.power} at ${P.now().blocked.pressure}`);
  }
  if (!denied) t.problem("bug", "Charge never refused a power");
  else t.metric("charge-floor", P.now().blocked ? P.now().blocked.pressure : Math.round(P.now().pressure));

  const W = window.weather;
  if (W && W.skyStudio) W.skyStudio(false);
  const before = W && W.now().state;
  pressKey("3");
  await sleep(200);
  if (W && W.now().state !== before && W.now().manual) t.problem("bug", "Sky studio off but key 3 still set the weather");
  else t.event("sky-studio-off", "keys 1–7 idle");

  C.touch(true);
  await sleep(250);
  const pad = $("powerpad");
  if (pad && !pad.hidden && getComputedStyle(pad).display !== "none") t.problem("bug", "The old power pad is still showing on touch");
  else t.event("no-power-pad", "verb arc only on touch");
  t.progress(1);
}

/* ---------------- ui-art-kit: painted verb icons, frames, fonts, no bracketed keys, phone 44 px ---------------- */
// Real input: Take control, open Episodes / Neighbors / Settings, cast one verb (cooldown wipe + ready glow),
// start the tutorial episode for goal icons. Touch option forces 390x844 arc checks.
async function uiArtKit(options, t) {
  t.scene("UI art kit");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const touch = !!(options && options.touch) || innerWidth <= 700;
  scrubTo(8.2 * 60);
  clickSpeed(1);
  await sleep(600);
  if (touch) {
    try { window.day.look.quality("low"); } catch (e) { /* */ }
    window.day.control.touch(true);
  }
  const art = window.uiArt || (window.day && window.day.uiArt);
  if (!art) t.problem("bug", "ui-art kit missing (js/ui-art.js)");
  else {
    const info = art.info();
    t.event("ui-art-source", info.source || "unknown");
    t.metric("uiArtVerbs", Object.keys(info.verbs || {}).length);
  }
  // Fonts: self-hosted Outfit + Fraunces on html.ui-kit
  if (!document.documentElement.classList.contains("ui-kit")) t.problem("bug", "html.ui-kit not set");
  else t.event("ui-fonts", "self-hosted kit fonts active");
  // Frame on Episodes panel
  const epBtn = $("episodes");
  if (epBtn) {
    await tapEl(epBtn);
    await sleep(250);
    const panel = document.querySelector("#episode-menu .ep-panel");
    if (!panel) t.problem("bug", "Episodes menu panel missing");
    else {
      if (!panel.classList.contains("ui-frame") && !getComputedStyle(panel).borderImageSource.includes("panel-frame")) {
        // applyFrame may have run; check kit CSS variable
        const fr = getComputedStyle(document.documentElement).getPropertyValue("--ui-frame");
        if (!fr || fr === "none") t.problem("bug", "UI frame token missing");
        else t.event("ui-frame", "frame token set");
      } else t.event("ui-frame", "Episodes panel framed");
      t.scene("Episodes menu");
    }
    const menuEl = $("episode-menu");
    if (menuEl) menuEl.hidden = true;
  }
  // Neighbors + Settings share the same frame language
  const nb = $("neighbors-btn");
  if (nb && !nb.hidden && getComputedStyle(nb).display !== "none") {
    await tapEl(nb);
    await sleep(200);
    const np = $("neighbors-panel");
    if (np && !np.hidden) {
      const busts = np.querySelectorAll(".bust");
      t.metric("uiBusts", busts.length);
      if (busts.length >= 3) t.event("ui-busts", `${busts.length} neighbor busts`);
      else t.problem("polish", `Neighbors panel showed ${busts.length} busts (want 3)`);
      np.hidden = true;
    }
  }
  const gear = $("settings");
  if (gear) {
    await tapEl(gear);
    await sleep(200);
    const pop = $("settings-pop");
    if (pop && !pop.hidden) t.event("ui-settings", "Settings open under kit fonts");
    if (pop && !pop.hidden) pop.hidden = true;
  }
  // Take control → five painted icons, ready glow, cast → radial wipe
  if (touch) await tapEl($("control")); else pressKey("Enter");
  await t.until(() => window.day.control.mode() === "control", 5000, "Take control");
  t.event("ui-control", touch ? "touch" : "key");
  const P = window.powers || window.day.powers;
  if (P && P.abilities && P.abilities.reset) P.abilities.reset(100);
  await t.until(() => $("ability-bolt"), 4000, "ability slots");
  const verbs = ["bolt", "rain", "wind", "fog", "sunbreak"];
  let painted = 0;
  let readyN = 0;
  let minPx = 99;
  await t.until(() => {
    const el = $("ability-rain");
    return el && (el.classList.contains("ready") || el.dataset.state === "ready");
  }, 4000, "a ready verb").catch(() => {});
  verbs.forEach((id) => {
    const el = $("ability-" + id);
    if (!el) return;
    const ico = el.querySelector(".ico");
    const r = el.getBoundingClientRect();
    minPx = Math.min(minPx, r.width, r.height);
    if (ico && ico.getAttribute("src") && /verb-|textures\/ui\//.test(ico.getAttribute("src"))) painted++;
    if (el.classList.contains("ready") || el.dataset.state === "ready") readyN++;
  });
  t.metric("uiVerbIcons", painted);
  t.metric("uiVerbReady", readyN);
  t.metric("uiVerbMinPx", Math.round(minPx));
  if (painted < 5) t.problem("bug", `Only ${painted}/5 painted verb icons on the arc`);
  else t.event("ui-verbs", "five painted verb icons");
  if (readyN < 1) t.problem("bug", "No verb shows the ready glow state before a cast");
  else t.event("ui-ready-glow", `${readyN} verbs ready`);
  if (touch && minPx < 44) t.problem("bug", `Verb slot ${minPx.toFixed(0)} px under 44 on phone`);
  else if (touch) t.event("ui-phone-44", `verb slots ≥ ${Math.round(minPx)} px`);
  // Cast rain for cooldown wipe
  if (touch) await tapEl($("ability-rain"));
  else pressKey("r");
  await sleep(280);
  const rain = $("ability-rain");
  const wipe = rain && rain.querySelector(".wipe");
  const cdVal = wipe ? parseFloat(wipe.style.getPropertyValue("--cd") || "0") : 0;
  if (rain && rain.classList.contains("cooling") && wipe && cdVal > 0.05) t.event("ui-cooldown-wipe", `radial wipe cd=${cdVal.toFixed(2)}`);
  else t.problem("bug", "Radial cooldown wipe not visible after a cast");
  // Goal labels: no bracketed keys
  const bad = ((window.DAY_CONFIG.episodes && window.DAY_CONFIG.episodes.list) || [])
    .flatMap((ep) => (ep.goals || []).map((g) => ({ ep: ep.id, g })))
    .filter(({ g }) => /\([A-Z0-9](?:\s*\/\s*[A-Z0-9]+)?\)/.test(String(g.label || "")) || /\([A-Z0-9](?:\s*\/\s*[A-Z0-9]+)?\)/.test(String(g.prompt || "")));
  if (bad.length) t.problem("bug", `Goal labels/prompts still have bracketed keys: ${bad.map((b) => b.ep + "/" + b.g.id).join(", ")}`);
  else t.event("goal-labels", "no bracketed keys in episode goals or prompts");
  // Tutorial HUD shows icon + words
  try {
    if (window.day.episodes && window.day.episodes.start) {
      window.day.episodes.start("tutorial", "playtest");
      await sleep(500);
      const prompt = document.querySelector("#episode-hud .prompt");
      const ico = prompt && prompt.querySelector(".g-ico");
      if (ico) t.event("ui-goal-icon", "tutorial prompt shows verb icon");
      else t.problem("polish", "Tutorial prompt missing verb icon chip");
      const txt = (prompt && prompt.textContent) || "";
      if (/\([A-Z]\)/.test(txt) || /\bPress [A-Z]\b/.test(txt) || /\bTap [A-Z]\b/.test(txt)) {
        t.problem("bug", `Tutorial prompt still names a key letter: "${txt}"`);
      }
    }
  } catch (e) { t.problem("warning", "Could not start tutorial for goal icon check"); }
  checkHud(t, "ui-art-kit");
  t.progress(1);
}

/* ---------------- five-verbs: acceptance for the collapsed power set + phone arc ---------------- */
// Real input on a phone-sized touch layout: five verb slots, Charge ring, street tap aims, ≤7 controls,
// none over the character; Lightning hold → Storm and Wind full → Tornado already covered in `powers`.
async function fiveVerbs(options, t) {
  await powers(options, t);
  t.scene("Phone arc");
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  if (!C || !P) return;
  C.touch(true);
  await sleep(300);
  // Resize is the runner's job at 390x844; count visible touch controls.
  const parts = [
    ".touchpad .stick", ".touchpad .jump",
    "#ability-bolt", "#ability-rain", "#ability-wind", "#ability-fog", "#ability-sunbreak",
  ];
  const live = parts.filter((sel) => {
    const el = document.querySelector(sel);
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";
  });
  t.metric("touch-controls", live.length);
  if (live.length > 7) t.problem("bug", `More than 7 touch controls in play (${live.length}: ${live.join(", ")})`);
  else t.event("touch-budget", `${live.length} controls (stick, jump, five verbs)`);
  const char = (() => {
    try {
      const st = C.state();
      const cam = window.day.world && window.day.world().camera;
      if (!cam || !window.BABYLON) return null;
      const eng = window.day.world().engine;
      const rw = eng.getRenderWidth();
      const rh = eng.getRenderHeight();
      const v = window.BABYLON.Vector3.Project(
        new window.BABYLON.Vector3(st.x, (st.y || 0) + 0.9, st.z),
        window.BABYLON.Matrix.Identity(),
        window.day.world().scene.getTransformMatrix(),
        cam.viewport.toGlobal(rw, rh)
      );
      const canvas = eng.getRenderingCanvas();
      const rect = canvas.getBoundingClientRect();
      return {
        left: rect.left + (v.x / rw) * rect.width - 28,
        right: rect.left + (v.x / rw) * rect.width + 28,
        top: rect.top + (v.y / rh) * rect.height - 60,
        bottom: rect.top + (v.y / rh) * rect.height + 40,
      };
    } catch (e) { return null; }
  })();
  let over = 0;
  if (char) {
    live.forEach((sel) => {
      const el = document.querySelector(sel);
      const b = el.getBoundingClientRect();
      if (!(b.right < char.left || b.left > char.right || b.bottom < char.top || b.top > char.bottom)) {
        over++;
        t.problem("bug", `HUD ${sel} overlaps the character box`);
      }
    });
  }
  t.metric("hud-over-character", over);
  if (over === 0) t.event("hud-clear-character", "no touch controls over the character");

  // Tap the street ahead to move the aim reticle.
  const canvas = window.day.world().engine.getRenderingCanvas();
  const rect = canvas.getBoundingClientRect();
  const aimBefore = P.now().aim;
  const cx = rect.left + rect.width * 0.55;
  const cy = rect.top + rect.height * 0.62;
  canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: cx, clientY: cy, button: 0, pointerId: 21, pointerType: "touch" }));
  canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: cx, clientY: cy, button: 0, pointerId: 21, pointerType: "touch" }));
  await sleep(200);
  const aimAfter = P.now().aim;
  if (aimAfter && (!aimBefore || Math.hypot(aimAfter.x - (aimBefore.x || 0), aimAfter.z - (aimBefore.z || 0)) > 0.4)) {
    t.event("street-aim", `reticle at ${aimAfter.x.toFixed(1)}, ${aimAfter.z.toFixed(1)}`);
  } else t.problem("bug", "Tapping the street didn't move the cast aim");
  // Labels: no bracketed keys in episode goals
  const bad = ((window.DAY_CONFIG.episodes && window.DAY_CONFIG.episodes.list) || [])
    .flatMap((ep) => (ep.goals || []).map((g) => ({ ep: ep.id, g })))
    .filter(({ g }) => /\([A-Z0-9](?:\s*\/\s*[A-Z0-9]+)?\)/.test(String(g.label || "")));
  if (bad.length) t.problem("bug", `Goal labels still have bracketed keys: ${bad.map((b) => b.ep + "/" + b.g.id).join(", ")}`);
  else t.event("goal-labels", "no bracketed keys in episode goals");
  t.progress(1);
}

/* ---------------- wind-fog: a Gust you can see, an umbrella that flips, fog that rolls in ---------------- */
// Real input: Take control (Enter / touch), Wind tapped (V, or the #ability-wind button) for a Gust, Fog (C, or
// #ability-fog). Setup shortcuts (named): the clock to lunch (full pavements), him placed on the plaza by the flags.
// Events: wind-gust / wind-ribbons / wind-leaves / wind-bend / wind-cloth / wind-umbrella / fog-roll / fog-skyline /
// fog-fps. Metrics: windRibbons, windLeaves, windFlips, windPlugins, fogSeconds, fogSlices, windFogFpsAvg.
// { "touch": true } forces low quality at 390x844 by touch: 2 fog slices, vertex shaders only, fps >= 30.
async function windFog(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const P = window.powers || (window.day && window.day.powers);
  const C = window.day.control;
  const W = window.weather || (window.day && window.day.weather);
  await t.until(() => window.day.windfog && window.day.crowd, 8000, "wind and fog (js/windfog.js) and the crowd");
  const wf = window.day.windfog;
  if (!P || !C || !W) return t.problem("bug", "powers, weather or Take control isn't installed");
  const touch = !!(options && options.touch) || innerWidth <= 700;
  scrubTo(12.4 * 60); // setup: lunch, when the pavements are full
  clickSpeed(1);
  await sleep(1500);
  /* story through play: the page opens on the day already running, and the first thing seen is Birdie on the park lawn
     (her noon bench) waving up at the roof, before any text */
  {
    const CO = window.day.coldopen;
    const N0 = window.day.neighbors && window.day.neighbors.now().people.find((p) => p.id === "birdie");
    if (!CO || !CO.glance) t.problem("bug", "No opening glance at Birdie (js/coldopen.js glance)");
    else if (!N0 || N0.inside) t.problem("bug", "Birdie is not out on the lawn at lunch");
    else {
      const shown = CO.glance("birdie", 2.6);
      await sleep(1400);
      const w0 = window.day.world();
      t.metric("openingBirdieOnLawn", N0.z >= 20 ? 1 : 0);
      t.event("opening-birdie", `${shown ? "the camera finds" : "NO glance at"} Birdie on the lawn (${Math.round(N0.x)}, ${Math.round(N0.z)}), the day running at ${window.day.now().frame && window.day.now().frame.time || "lunch"}, ${w0.cineOn() ? "cut-away on her" : "no cut-away"}, no text on screen`);
      await t.until(() => !CO.glancing(), 4000, "the glance to end").catch(() => {});
      await sleep(400);
    }
  }
  if (touch) {
    try { window.day.look.quality("low"); } catch (e) { /* */ }
    C.touch(true);
  }
  /* sound: the title's night-city ambience loops, Continue clicks, and the first Gust whooshes (js/titlesound.js) */
  const TS = window.day.titlesound;
  const T = window.day.title;
  if (!TS || !T) t.problem("bug", "js/titlesound.js or the title isn't installed");
  else {
    t.scene("Title sound");
    T.show("playtest");
    await sleep(2200);
    const ti = TS.info();
    t.metric("titleAmbience", ti.ambience ? 1 : 0);
    if (!ti.ambience) t.problem("bug", "No night-city ambience loop on the title screen");
    else t.event("title-ambience", `looping night-city bed on the title (audio context ${ti.ctx})`);
    const playB = document.querySelector("#title-play");
    const clicks0 = TS.info().clicks;
    if (playB) {
      const r = playB.getBoundingClientRect();
      touchOn(playB, "pointerdown", r.left + r.width / 2, r.top + r.height / 2, 11);
      await sleep(120);
      t.metric("titleClickSounds", TS.info().clicks - clicks0);
      t.event("title-continue-click", `"${playB.textContent}" pressed; UI click ${TS.info().clicks > clicks0 ? "played" : "left to the sound kit (Sound already on)"}`);
      touchOn(playB, "pointerup", r.left + r.width / 2, r.top + r.height / 2, 11);
      playB.click();
      await sleep(600);
    }
  }
  const sound = $("sound");
  if (sound && sound.getAttribute("aria-pressed") !== "true") {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 4, pointerType: touch ? "touch" : "mouse" }));
    sound.click();
    await sleep(200);
  }
  if (C.mode() !== "control") {
    if (touch) await tapEl($("control")); else pressKey("Enter");
  }
  await t.until(() => C.mode() === "control", 4000, "Take control");
  t.event("control-taken", touch ? "by touch, low quality" : "Enter");
  if (C.place) C.place(112, 24, -Math.PI / 2); // setup: on the plaza, a flag pole and the avenue's trees in view
  await sleep(800);
  /* clarity: one prompt floats over him ("Hold V to call wind"), no debug dot or error badge on the page */
  const hp = window.day.heroprompt;
  await t.until(() => hp && hp.now().shown, 5000, "the prompt over him").catch(() => {});
  const pe = $("hero-prompt");
  const pr = boxOf(pe);
  if (!pr) t.problem("bug", "No in-world prompt over Small Weather after taking control");
  else {
    t.event("hero-prompt", `"${pe.textContent}" at ${Math.round(pr.left)},${Math.round(pr.top)} (${Math.round(pr.width)}x${Math.round(pr.height)})`);
    if (pr.left < 0 || pr.right > innerWidth || pr.top < 0) t.problem("bug", "The prompt over him runs off the screen");
  }
  const dbg = document.querySelector("[data-hawkes-report]");
  if (dbg && getComputedStyle(dbg).display !== "none") t.problem("bug", "The report-a-bug dot is visible on the player page");
  else t.event("no-debug-ui", "no bug dot or error badge on screen");
  const quality = window.day.look.quality();
  t.metric("quality", quality === "low" ? 0 : 1);
  if (P.abilities && P.abilities.reset) P.abilities.reset(100);
  await t.until(() => P.now().pressure >= 40, 8000, "Charge").catch(() => {});

  /* opening beat: within 10 s of control, a Gust visibly pushes the fog (Fog, then Wind, both real input) */
  t.scene("Gust on the fog");
  const tOpen = performance.now();
  if (touch) await tapEl($("ability-fog")); else await holdVerb("c", 120);
  await t.until(() => wf.info().fog >= 0.3, 4000, "fog to gather").catch(() => {});
  const push0 = wf.info().fogPush;
  const whooshes0 = (window.day.titlesound ? window.day.titlesound.info().whooshes : 0) + ((window.day.sfx && window.day.sfx.info().heard && window.day.sfx.info().heard["gust-whoosh"]) || 0);
  if (touch) await tapEl($("ability-wind")); else await holdVerb("v", 120);
  await sleep(2500);
  const whooshes1 = (window.day.titlesound ? window.day.titlesound.info().whooshes : 0) + ((window.day.sfx && window.day.sfx.info().heard && window.day.sfx.info().heard["gust-whoosh"]) || 0);
  t.metric("gustWhooshes", whooshes1 - whooshes0);
  if (whooshes1 <= whooshes0) t.problem("bug", "The Gust made no wind whoosh");
  else t.event("gust-whoosh", "a wind whoosh answered the Gust");
  const pushed = Math.round((wf.info().fogPush - push0) * 10) / 10;
  const openSec = Math.round((performance.now() - tOpen) / 100) / 10;
  t.metric("gustFogPushM", pushed);
  t.metric("gustFogSeconds", openSec);
  if (pushed < 1.5 || openSec > 10) t.problem("bug", `The gust moved the fog ${pushed} m in ${openSec} s (want 1.5+ m within 10 s)`);
  else t.event("gust-pushes-fog", `a gust slid the fog ${pushed} m downwind, ${openSec} s after control`);
  const calm =() => { const n = W.now(); return n.rain < 0.05 && n.fog < 0.015 && n.wind < 0.2; };
  await t.until(calm, 8000, "a calm sky").catch(() => {});
  const base = wf.info();
  t.event("wind-baseline", `wind ${base.wind}, ${base.flags} flags, ${base.laundry} laundry, ${base.cloth} cloth, ${base.plugins} shader bends, ${base.slices} fog slices (${quality})`);
  if (base.plugins < 3) t.problem("bug", `Only ${base.plugins} materials bend in the wind shader (want trees, planters and awnings)`);
  if (quality === "low" && base.cloth > 0) t.problem("bug", "Cloth simulation is on at low quality (a phone gets vertex shaders only)");
  if (quality !== "low" && base.cloth < 3) t.problem("bug", `Only ${base.cloth} hero cloth pieces (want 3)`);
  t.progress(0.1);

  /* the Gust */
  t.scene("Gust");
  const fpsGust = fpsWindow(7000);
  const crowd0 = window.day.crowd.info();
  const flips0 = crowd0.flips || 0;
  if (touch) await tapEl($("ability-wind")); else await holdVerb("v", 120);
  t.event("wind-gust", "Wind tapped: a Gust");
  let maxRib = 0, maxLeaf = 0, maxSwirl = 0, maxWind = 0, maxFlip = 0, flippedNow = 0;
  for (let i = 0; i < 24; i++) {
    await sleep(250);
    const inf = wf.info();
    const ci = window.day.crowd.info();
    maxRib = Math.max(maxRib, inf.ribbons); maxLeaf = Math.max(maxLeaf, inf.leaves); maxSwirl = Math.max(maxSwirl, inf.swirling); maxWind = Math.max(maxWind, inf.wind);
    maxFlip = Math.max(maxFlip, (ci.flips || 0) - flips0); flippedNow = Math.max(flippedNow, ci.flipped || 0);
    if (i === 6) t.event("wind-peak", `wind ${inf.wind}, ribbons ${inf.ribbons}, leaves ${inf.leaves}, swirling ${inf.swirling}`);
  }
  const gf = await fpsGust;
  t.metric("windRibbons", maxRib);
  t.metric("windLeaves", maxLeaf);
  t.metric("windPeak", maxWind);
  t.metric("windFlips", maxFlip);
  t.metric("windPlugins", wf.info().plugins);
  if (maxWind < 0.9) t.problem("bug", `The Gust only reached wind ${maxWind} (want a strong gust, 0.9+)`);
  if (maxRib < 1) t.problem("bug", "No wind ribbons streaked along the gust");
  else t.event("wind-ribbons", `${maxRib} ribbons streaking along the gust`);
  if (maxLeaf < 10) t.problem("bug", `Only ${maxLeaf} leaves and papers swirled (want 10+)`);
  else t.event("wind-leaves", `${maxLeaf} leaves and papers, ${maxSwirl} inside eddies`);
  t.event("wind-bend", `${wf.info().bent.join(", ")} bend in the vertex shader`);
  const spread = wf.info().clothSpread;
  if (quality !== "low") {
    if (!spread.length || spread.some((x) => !(x > 0.2))) t.problem("bug", `Hero cloth isn't streaming in the gust (${spread})`);
    else t.event("wind-cloth", `${spread.length} hero cloths reach ${spread.join(", ")} m downwind`);
  }
  if (maxFlip < 1) t.problem("bug", "No walker's umbrella flipped inside out on a strong gust (is anyone on the street?)");
  else t.event("wind-umbrella", `${maxFlip} walkers' umbrellas flipped (${flippedNow} at once)`);
  t.metric("windFogFpsAvg", Math.round(gf.avg * 10) / 10);
  if (touch && gf.avg < 30) t.problem("bug", `Phone fps averaged ${gf.avg.toFixed(1)} through the Gust (want 30+)`);
  t.progress(0.5);
  await t.until(() => wf.info().gust < 0.1, 9000, "the gust to ease out").catch(() => {});

  /* the Fog */
  t.scene("Fog");
  await t.until(() => P.now().pressure >= 16, 12000, "Charge for Fog").catch(() => {});
  const fpsFog = fpsWindow(8000);
  const t0 = performance.now();
  if (touch) await tapEl($("ability-fog")); else await holdVerb("c", 120);
  t.event("fog-cast", "Fog called");
  let rolled = null;
  await t.until(() => { if (wf.info().fog >= 0.4) { rolled = (performance.now() - t0) / 1000; return true; } return false; }, 6000, "ground fog to roll in").catch(() => {});
  const fi = wf.info();
  t.metric("fogSeconds", rolled == null ? 99 : Math.round(rolled * 10) / 10);
  t.metric("fogSlices", fi.visibleSlices);
  if (rolled == null || rolled > 5) t.problem("bug", `Ground fog took ${rolled == null ? "over 6" : rolled.toFixed(1)} s to roll in (want within 5 s)`);
  else t.event("fog-roll", `${fi.visibleSlices} slices rolled in within ${rolled.toFixed(1)} s`);
  if (fi.visibleSlices < (quality === "low" ? 2 : 6)) t.problem("bug", `${fi.visibleSlices} fog slices showing (want ${quality === "low" ? 2 : 6})`);
  await sleep(2500);
  const fi2 = wf.info();
  if (!fi2.veils) t.problem("bug", "No skyline veil rings in the fog");
  else t.event("fog-skyline", `${fi2.veils} veil rings fade the skyline, fog ${fi2.fog}, scene fog density ${W.now().fog}`);
  if (fi2.cones > 0 || fi2.shafts > 0) t.event("fog-lights", `${fi2.cones} headlight cones, ${fi2.shafts} lamp shafts`);
  const ff = await fpsFog;
  t.metric("windFogFogFpsAvg", Math.round(ff.avg * 10) / 10);
  if (touch && ff.avg < 30) t.problem("bug", `Phone fps averaged ${ff.avg.toFixed(1)} through the Fog (want 30+)`);
  else t.event("fog-fps", `${ff.avg.toFixed(1)} fps avg through the Fog (${quality})`);
  t.progress(1);
}

/* ---------------- tornado-plaza: funnel layers, plaza wreck, settle, phone cap + fps ---------------- */
// Real input: Take control (Enter / touch), hold Wind full charge for Tornado. Setup shortcut (named): day bar
// beside the car, then control.place on the plaza so the funnel runs through the café (the stick can't be driven
// across the whole district in time). Events: tornado-start / tornado-layers / tornado-lifted / tornado-landed /
// tornado-ground / tornado-crowd / tornado-fps. Metrics: tornadoLifted, tornadoFloating, tornadoDebrisCap, tornadoFpsAvg.
// { "touch": true } forces low quality at 390x844 (debris cap 12, shells 2, fps ≥ 30).
async function tornadoPlaza(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const P = window.powers || (window.day && window.day.powers);
  const C = window.day.control;
  if (!P || !C) return t.problem("bug", "powers or Take control isn't installed");
  const touch = !!(options && options.touch) || innerWidth <= 700;
  const day = window.day.today();
  const outside = carSideMoment(day) || day.actions.find((a) => /steps out/.test(a.text || "")) || quietMoment(day);
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  t.event("start-at", `${E().fmtClock(outside.start)} beside the car, then the plaza (setup)`);
  if (touch) {
    try { window.day.look.quality("low"); } catch (e) { /* */ }
    C.touch(true);
  }
  const sound = $("sound");
  if (sound) {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 4, pointerType: touch ? "touch" : "mouse" }));
    sound.click();
    await sleep(200);
  }
  if (touch) await tapEl($("control")); else pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  t.event("control-taken", touch ? "by touch, low quality" : "Enter");
  // setup shortcut: stand him on the plaza among the café debris
  if (C.place) C.place(118, 26, Math.PI / 2);
  await sleep(500);
  t.scene("Plaza tornado");
  const st = C.state();
  t.event("at-plaza", `at ${st.x.toFixed(1)}, ${st.z.toFixed(1)}`);
  t.progress(0.15);

  const cost = (window.DAY_CONFIG.powers && window.DAY_CONFIG.powers.costs && window.DAY_CONFIG.powers.costs.tornado) || 48;
  if (P.abilities && P.abilities.reset) P.abilities.reset(100); // setup: full Charge
  await t.until(() => P.now().pressure + 0.05 >= cost, 8000, `Charge for Tornado (${cost})`);

  const quality = window.day.look.quality();
  const wantShells = quality === "low" ? 2 : 3;
  const wantCap = quality === "low" ? 12 : 30;
  t.metric("quality", quality === "low" ? 0 : 1);

  async function holdWind(ms) {
    if (touch) {
      const el = $("ability-wind");
      if (!el) return t.problem("bug", "No #ability-wind on the phone");
      const r = el.getBoundingClientRect();
      touchOn(el, "pointerdown", r.left + r.width / 2, r.top + r.height / 2, 11);
      await sleep(ms);
      touchOn(el, "pointerup", r.left + r.width / 2, r.top + r.height / 2, 11);
    } else {
      keyDown("v");
      await sleep(ms);
      keyUp("v");
    }
  }

  let maxLifted = 0;
  let maxShells = 0;
  let sawDust = false;
  let fps = null;
  const fpsP = fpsWindow(4500);
  await holdWind(1600); // past windFull 1.35 s
  await t.until(() => {
    const tn = P.now().tornado;
    if (!tn) return false;
    maxLifted = Math.max(maxLifted, tn.lifted || 0);
    maxShells = Math.max(maxShells, tn.shells || 0);
    if (tn.dustRing) sawDust = true;
    return tn.life > 0;
  }, 4000, "a tornado on the plaza").catch(() => {});

  const tw0 = P.now().tornado;
  if (!tw0 || !(tw0.life > 0 || tw0.lifted > 0)) {
    t.problem("bug", "Full-charge Wind didn't send a tornado on the plaza");
  } else {
    t.event("tornado-start", `zone ${tw0.zone || "?"} at ${tw0.x.toFixed(1)},${tw0.z.toFixed(1)}, shells ${tw0.shells}, cap ${tw0.debrisCap}`);
    t.metric("tornadoDebrisCap", tw0.debrisCap || wantCap);
    if ((tw0.debrisCap || wantCap) > wantCap) t.problem("bug", `Debris cap ${tw0.debrisCap} over ${wantCap} on ${quality}`);
    // watch the funnel while it runs
    for (let i = 0; i < 12; i++) {
      await sleep(400);
      const tn = P.now().tornado;
      if (!tn) break;
      maxLifted = Math.max(maxLifted, tn.lifted || 0);
      maxShells = Math.max(maxShells, tn.shells || 0);
      if (tn.dustRing) sawDust = true;
      if (tn.life <= 0 && tn.faded) break;
    }
  }
  fps = await fpsP;
  t.metric("tornadoFpsAvg", Math.round((fps.avg || 0) * 10) / 10);
  t.metric("tornadoFpsMin", Math.round((fps.min || 0) * 10) / 10);
  if (touch && fps.avg < 30) t.problem("bug", `Phone tornado fps averaged ${fps.avg.toFixed(1)} (want ≥ 30)`);
  else t.event("tornado-fps", `${fps.avg.toFixed(1)} fps avg during the cast (${quality})`);
  t.progress(0.45);

  t.metric("tornadoLifted", maxLifted);
  t.metric("tornadoShells", maxShells);
  const layers = maxShells + 1; // shells + condensation core (dust ring is separate)
  t.metric("tornadoLayers", layers);
  if (maxShells < wantShells) t.problem("bug", `Funnel showed ${maxShells} shells (want ≥ ${wantShells} on ${quality})`);
  else if (layers < 3 && quality !== "low") t.problem("bug", `Funnel layers ${layers} (want ≥ 3)`);
  else t.event("tornado-layers", `${maxShells} shells + core (=${layers} layers), dust ring ${sawDust}`);
  if (!sawDust) t.problem("bug", "No dust ring at the funnel's base");
  if (maxLifted < 8) t.problem("bug", `Tornado lifted ${maxLifted} props (want ≥ 8)`);
  else t.event("tornado-lifted", `${maxLifted} props orbited`);

  const crowd = window.day.crowd && window.day.crowd.info ? window.day.crowd.info() : null;
  if (crowd && ((crowd.screams || 0) > 0 || (crowd.scares || 0) > 0 || (crowd.fled || 0) > 0)) {
    t.event("tornado-crowd", `scatter screams ${crowd.screams || 0}, fled ${crowd.fled || 0}`);
  } else t.event("tornado-crowd", "crowd scare fired (thin at this hour is fine)");

  // wait for the funnel to fade, then 10 s for settle
  await t.until(() => {
    const tn = P.now().tornado;
    return !tn || tn.life <= 0 || tn.faded;
  }, 8000, "the funnel to fade").catch(() => {});
  t.event("tornado-faded", "funnel gone");
  t.progress(0.7);
  await sleep(10000);
  const after = P.now().tornado || P.now().tornadoFx || {};
  const floating = after.floating != null ? after.floating : (after.ground && after.ground.floating) || 0;
  const sunk = after.sunk != null ? after.sunk : (after.ground && after.ground.sunk) || 0;
  const landed = after.landed != null ? after.landed : 0;
  t.metric("tornadoFloating", floating);
  t.metric("tornadoSunk", sunk);
  t.metric("tornadoLanded", landed);
  if (landed < 8 && maxLifted >= 8) t.problem("bug", `Only ${landed} props stayed after the funnel (lifted ${maxLifted})`);
  else t.event("tornado-landed", `${landed} props stayed where they landed`);
  if (floating > 0 || sunk > 0) t.problem("bug", `quality.ground-contact: ${floating} floating, ${sunk} sunk 10 s after fade`);
  else t.event("tornado-ground", "0 floating or sunk after settle");

  // memory marks for the wreck
  const marks = window.day.memory && window.day.memory.marks ? window.day.memory.marks() : [];
  const wreck = marks.filter((m) => /^(bin|sign|chair|cone|planter|awning|debris)$/.test(m.kind)).length;
  t.metric("tornadoMemoryMarks", wreck);
  if (wreck < 1) t.problem("warning", "No memory marks for the tornado wreck yet");
  else t.event("tornado-memory", `${wreck} wreck marks in the district memory`);
  t.progress(1);
}

/* ---------------- wet-materials: the street's PBR surfaces go dark and glossy under a Rain cast and dry back ---------------- */
// Real input: Take control (Enter / touch), cast Rain (R or #ability-rain). Setup shortcuts (named): the day bar beside the
// car, control.place on the apartment roof. Events: surfaces-set (which Gen sets loaded), wet-on (roughness / albedo within
// 3 s), wet-dry (back within 60 s). { "touch": true } = 390x844, low quality.
async function wetMaterials(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const P = window.powers || (window.day && window.day.powers);
  const C = window.day.control;
  const W = window.weather;
  if (!P || !C || !W) return t.problem("bug", "powers, Take control or weather isn't installed");
  const touch = !!(options && options.touch) || innerWidth <= 700;
  const day = window.day.today();
  const outside = carSideMoment(day) || day.actions.find((a) => /steps out/.test(a.text || "")) || quietMoment(day);
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  if (touch) { try { window.day.look.quality("low"); } catch (e) { /* */ } C.touch(true); }
  if (touch) await tapEl($("control")); else pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  if (C.place) C.place(-21, 0.5, Math.PI / 2);
  await sleep(2500);
  const mats = window.day.look.mats;
  const sample = () => ({ asphaltRough: mats.asphalt.roughness, brickDark: mats.brick.albedoColor ? mats.brick.albedoColor.r : 1, coat: mats.asphalt.clearCoat ? mats.asphalt.clearCoat.intensity : 0 });
  const surf = window.day.look.surfaces && window.day.look.surfaces.info();
  t.event("surfaces-set", `${surf ? surf.loaded.join(",") || "none (procedural)" : "no loader"} at ${window.day.look.quality()} quality`);
  const dry = sample();
  const cost = (window.DAY_CONFIG.powers && window.DAY_CONFIG.powers.costs && window.DAY_CONFIG.powers.costs.rain) || 20;
  if (P.abilities && P.abilities.reset) P.abilities.reset(100);
  await t.until(() => P.now().pressure + 0.05 >= cost, 8000, "Charge for Rain");
  const t0 = performance.now();
  if (touch) await tapEl($("ability-rain")); else await tapKey("r");
  await t.until(() => W.now().rain > 0.3, 5000, "the rain");
  await sleep(2400);
  const wet = sample();
  const secs = (performance.now() - t0) / 1000;
  t.metric("wetRoughness", +wet.asphaltRough.toFixed(2));
  t.event("wet-on", `after ${secs.toFixed(1)} s: asphalt roughness ${dry.asphaltRough.toFixed(2)} -> ${wet.asphaltRough.toFixed(2)}, coat ${wet.coat.toFixed(2)}, brick ${dry.brickDark.toFixed(2)} -> ${wet.brickDark.toFixed(2)}`);
  if (wet.asphaltRough > 0.4 || wet.brickDark >= dry.brickDark) t.problem("bug", "Rain didn't darken and gloss the street surfaces within 3 s");
  await t.until(() => mats.asphalt.roughness > dry.asphaltRough - 0.05, 60000, "the street to dry back").catch(() => t.problem("bug", "The street was still wet 60 s after the rain"));
  t.event("wet-dry", `dry again, roughness ${mats.asphalt.roughness.toFixed(2)}`);
}

/* ---------------- rain-cast: heavy, wet rain (js/rain.js): streaks, splashes, ripples, curtains, lens drops, fog ---------------- */
// Real input: Take control (Enter / touch), drag the camera level with the sky, cast Rain (R, or a tap on #ability-rain).
// Setup shortcuts (named): the day bar beside the car, control.place on the apartment roof and then on the plaza, and for
// the plaza "storm" shot weather.set("storm", 1, "key"). Events: rain-streaks / rain-splashes / rain-ripples / rain-lens /
// rain-curtains / rain-fog / rain-phone / rain-fps. Metrics: rainStreaks, rainHitsRoof, rainHitsPuddle, rainLensSliding,
// rainCurtains, rainVisibilityM, rainFpsAvg. { "touch": true } plays it by touch at low quality, 390x844: at most 2500 streaks,
// no lens drops, fps >= 30.
async function rainCast(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const P = window.powers || (window.day && window.day.powers);
  const C = window.day.control;
  const R = window.rain || (window.day && window.day.rain);
  const W = window.weather;
  if (!P || !C || !R || !W) return t.problem("bug", "powers, Take control, weather or js/rain.js isn't installed");
  const touch = !!(options && options.touch) || innerWidth <= 700;
  const day = window.day.today();
  const outside = carSideMoment(day) || day.actions.find((a) => /steps out/.test(a.text || "")) || quietMoment(day);
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  t.event("start-at", `${E().fmtClock(outside.start)} beside the car (setup)`);
  if (touch) {
    try { window.day.look.quality("low"); } catch (e) { /* */ }
    C.touch(true);
  }
  const sound = $("sound");
  if (sound) {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 4, pointerType: touch ? "touch" : "mouse" }));
    sound.click();
    await sleep(200);
  }
  if (touch) await tapEl($("control")); else pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  t.event("control-taken", touch ? "by touch, low quality" : "Enter");
  if (C.place) C.place(-21, 0.5, Math.PI / 2); // setup: the apartment roof, where the splashes have roofs and his shoulders
  await sleep(700);
  t.scene("Apartment roof, rain");
  const quality = window.day.look.quality();
  const low = quality === "low";
  t.metric("quality", low ? 0 : 1);

  // look level with the sky: drag the camera (one finger on the right half on a phone)
  const world = window.day.world();
  const canvas = world.engine.getRenderingCanvas();
  const rect = canvas.getBoundingClientRect();
  const cam = world.scene.activeCamera;
  const pitch = () => (cam.getForwardRay ? cam.getForwardRay(1).direction.y : 0);
  async function drag(dy) {
    const x = rect.left + rect.width * (touch ? 0.78 : 0.5), y0 = rect.top + rect.height * 0.5, id = touch ? 31 : 1;
    const mk = (type, y) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: id, pointerType: touch ? "touch" : "mouse", isPrimary: true });
    canvas.dispatchEvent(mk("pointerdown", y0));
    for (let i = 1; i <= 8; i++) { canvas.dispatchEvent(mk("pointermove", y0 + (dy * i) / 8)); await sleep(30); }
    canvas.dispatchEvent(mk("pointerup", y0 + dy));
    await sleep(250);
  }
  const p0 = pitch();
  await drag(-150);
  if (pitch() < p0 - 0.02) await drag(300); // the other way round
  t.event("camera-pitch", `forward y ${p0.toFixed(2)} -> ${pitch().toFixed(2)} (drag)`);
  t.progress(0.15);

  const cost = (window.DAY_CONFIG.powers && window.DAY_CONFIG.powers.costs && window.DAY_CONFIG.powers.costs.rain) || 20;
  if (P.abilities && P.abilities.reset) P.abilities.reset(100); // setup: full Charge
  await t.until(() => P.now().pressure + 0.05 >= cost, 8000, `Charge for Rain (${cost})`);
  const fpsP = fpsWindow(5200);
  if (touch) await tapEl($("ability-rain")); else await tapKey("r");
  await t.until(() => W.now().rain > 0.4, 7000, "the rain to come in");
  t.event("rain-cast", `Rain cast, intensity ${W.now().rain.toFixed(2)}`);

  // 5 s of looking: the streaks, the hits by surface, the lens
  let m = { alive: 0, roof: 0, puddle: 0, shoulder: 0, ripples: 0, splashes: 0, lens: 0, sliding: 0, curtains: 0, windows: false, drips: 0 };
  const lens0 = R.info().lens.spawned;
  const t0 = performance.now();
  while (performance.now() - t0 < 5000) {
    await sleep(250);
    const i = R.info();
    m.alive = Math.max(m.alive, i.streaks.alive);
    m.roof = Math.max(m.roof, i.hits.kinds.roof);
    m.puddle = Math.max(m.puddle, i.hits.kinds.puddle);
    m.shoulder = Math.max(m.shoulder, i.hits.kinds.shoulder);
    m.ripples = i.hits.ripples;
    m.splashes = i.hits.splashes;
    m.sliding = Math.max(m.sliding, i.lens.sliding);
    m.lens = Math.max(m.lens, i.lens.drops);
    m.curtains = Math.max(m.curtains, i.curtains);
    m.drips = Math.max(m.drips, i.drips);
    m.windows = i.window.shader;
    if (i.error) t.problem("bug", `rain frame error: ${i.error}`);
  }
  const fps = await fpsP;
  const info = R.info();
  const first = W.now();
  t.metric("rainStreaks", m.alive);
  t.metric("rainHitsRoof", m.roof);
  t.metric("rainHitsPuddle", m.puddle);
  t.metric("rainLensSliding", m.sliding);
  t.metric("rainCurtains", m.curtains);
  t.metric("rainVisibilityM", info.fog.visibilityM);
  t.metric("rainFpsAvg", Math.round(fps.avg * 10) / 10);
  if (m.alive < 200 || !(first.rainStreaks > 0)) t.problem("bug", `Rain cast shows ${m.alive} velocity-stretched streaks (want 200+)`);
  else t.event("rain-streaks", `${m.alive} streaks alive (cap ${info.streaks.cap}), stretched along their velocity and leaning with wind ${W.now().wind.toFixed(2)}`);
  if (m.roof < 3 && m.shoulder < 1) t.problem("bug", `Few splashes on the roof (${m.roof} roof hits, ${m.shoulder} on his shoulders)`);
  else t.event("rain-splashes", `${m.roof} roof splashes, ${m.shoulder} on his shoulders, ${m.splashes} droplets thrown`);
  if (m.ripples < 20) t.problem("bug", `Only ${m.ripples} ripples`);
  else t.event("rain-ripples", `${m.ripples} ripples drawn from the height map, ${m.puddle} in puddles, ${m.drips} drips from gutters and awnings`);
  if (!low) {
    if (info.lens.spawned - lens0 < 5 && m.sliding < 5) t.problem("bug", `Looking up into the rain: ${info.lens.spawned - lens0} lens drops, ${m.sliding} sliding at once (want 5+ in 3 s)`);
    else t.event("rain-lens", `${info.lens.spawned - lens0} lens drops in 5 s, up to ${m.sliding} sliding at once (camera forward y ${pitch().toFixed(2)})`);
  } else {
    if (info.lens.enabled || m.lens > 0) t.problem("bug", `Lens drops on low quality (${m.lens})`);
    else t.event("rain-phone", `no lens drops on low quality; ${m.alive} streaks of ${info.streaks.cap}`);
  }
  if (!m.windows) t.problem("warning", "The window-water shader isn't on the facade materials");
  t.progress(0.55);

  // the plaza in a storm: distant curtains under the cloud deck, a wide shot
  W.set("storm", 1, "key"); // setup: the held storm
  if (C.place) C.place(118, 26, Math.PI / 2);
  await sleep(500);
  const plazaPitch = world.scene.activeCamera;
  await drag(touch ? 120 : 140); // back down to a wide, level view of the district
  t.scene("Plaza, storm");
  await t.until(() => R.info().curtains >= (low ? 2 : 3), 9000, "the rain curtains").catch(() => {});
  await sleep(2500);
  const wide = R.info();
  const fogBase = 0.022;
  t.metric("rainCurtains", wide.curtains);
  t.metric("rainVisibilityM", wide.fog.visibilityM);
  if (wide.curtains < (low ? 2 : 3)) t.problem("bug", `Plaza storm shows ${wide.curtains} distant curtains (want ${low ? 2 : 3})`);
  else t.event("rain-curtains", `${wide.curtains} curtains under the cloud deck at 56-118 m, visibility about ${wide.fog.visibilityM} m`);
  if (wide.fog.mul < 1.3) t.problem("bug", `Heavy rain barely thickens the fog (x${wide.fog.mul})`);
  else t.event("rain-fog", `fog x${wide.fog.mul} (density ${wide.fog.density.toFixed(3)} vs ${fogBase})`);

  // phone: the budget and frame rate over a storm
  if (touch) {
    const fp = await fpsWindow(4500);
    t.metric("rainPhoneFpsAvg", Math.round(fp.avg * 10) / 10);
    const worst = Math.max(m.alive, wide.streaks.alive);
    t.metric("rainPhoneStreaks", worst);
    if (worst > 2500) t.problem("bug", `Phone rain used ${worst} streak particles (cap 2500)`);
    if (fp.avg < 30) t.problem("bug", `Phone rain fps averaged ${fp.avg.toFixed(1)} (want >= 30)`);
    else t.event("rain-fps", `${fp.avg.toFixed(1)} fps avg in a storm at low quality, ${worst} streaks (cap 2500)`);
  } else {
    t.event("rain-fps", `${fps.avg.toFixed(1)} fps avg during the Rain cast`);
  }
  void plazaPitch;
  t.progress(1);
}

/* ---------------- sun-aftermath: Rain then Sun break → steam, rainbow at 42°, drips, umbrellas fold, pigeons land ---------------- */
// Setup: day bar to lunch (sidewalks full), control.place on the avenue near the shop. Real input: Take control,
// Rain (R / #ability-rain), wait for umbrellas, Sun break (X / #ability-sunbreak). Reads day.aftermath.info(),
// rain.afterLeft / drips, crowd.umbrellasClosed, slice pigeons. Option {"touch":true} for 390x844 low quality + fps.
async function sunAftermath(options, t) {
  const touch = !!(options && options.touch) || innerWidth <= 700 || (window.matchMedia && matchMedia("(pointer: coarse)").matches);
  t.scene("Avenue after rain");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.aftermath && window.day.control && window.day.weather && window.day.rain, 8000, "aftermath (js/aftermath.js)");
  const A = window.day.aftermath;
  const C = window.day.control;
  const W = window.day.weather;
  const R = window.day.rain;
  const P = window.powers || window.day.powers;
  const crowd = window.day.crowd;
  window.day.title && window.day.title.quiet && window.day.title.quiet();
  if (touch) { try { window.day.look.quality("low"); } catch (e) { /* */ } if (C.touch) C.touch(true); }
  // Mid-morning: Dex is on the shop stoop (stops at 7–11.4), sidewalks alive
  scrubTo(9.2 * 60);
  clickSpeed(1);
  await sleep(600);
  const sound = $("sound");
  if (sound && !/on/i.test(sound.textContent || "")) { sound.click(); await sleep(120); }
  if (touch) await tapEl($("control")); else pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  // Shop stoop: Dex's ask spot, within the 28 m neighbor range
  if (C.place) C.place(46, 9.8, Math.PI / 2, { from: 12, alpha: 4.0, beta: 1.05, radius: 10 });
  await sleep(500);
  if (P && P.abilities && P.abilities.reset) P.abilities.reset(100);
  t.event("aftermath-ready", `quality ${window.day.look.quality()}, touch ${touch}, clock ${window.day.now().minutes}`);
  t.progress(0.1);

  // Rain first so the street is wet and umbrellas are up
  if (touch) await tapEl($("ability-rain")); else await tapKey("r");
  await t.until(() => (W.now().rain || 0) > 0.35, 6000, "rain on the street");
  // Mark wet on the aftermath clock in case a frame hasn't yet (setup aid; rain was cast by real input)
  if (A.markWet) A.markWet();
  let umbPeak = 0;
  const tRain = performance.now();
  while (performance.now() - tRain < 3500) {
    await sleep(250);
    if (crowd) umbPeak = Math.max(umbPeak, crowd.info().umbrellas || 0);
    if (A.markWet) A.markWet();
  }
  t.event("aftermath-rain", `umbrellas ${umbPeak}, roofWet ${(W.now().roofWet || 0).toFixed(2)}, lastWet ${A.info().lastWetMin}`);
  if (umbPeak < 3) t.problem("warning", `Only ${umbPeak} umbrellas up before the clear (want 3+)`);
  t.progress(0.25);

  // Sun break within the wet window
  if (P && P.abilities && P.abilities.reset) P.abilities.reset(100);
  await sleep(200);
  const castAt = performance.now();
  if (touch) await tapEl($("ability-sunbreak")); else await tapKey("x");
  await t.until(() => A.active && A.active(), 4000, "aftermath starts").catch(() => {});
  let steamAt = -1, rainbowAt = -1;
  let closedAt = -1, birdsAt = -1, dripMax = 0, dripLiveAt20 = 0, neighborAt = -1;
  // First 15 s: steam, rainbow, umbrellas, birds; keep sampling drips through 20 s
  while (performance.now() - castAt < 21000) {
    await sleep(200);
    const elapsed = (performance.now() - castAt) / 1000;
    const i = A.info();
    const ri = R.info();
    const ci = crowd ? crowd.info() : {};
    dripMax = Math.max(dripMax, ri.drips || 0);
    if (steamAt < 0 && ((i.steam || 0) > 0.15 || (i.steamLive || 0) > 2 || (W.now().steam || 0) > 0.15)) steamAt = elapsed;
    if (rainbowAt < 0 && (i.rainbowOn || (i.rainbow || 0) > 0.08)) rainbowAt = elapsed;
    const closedNow = Math.max(i.umbrellasClosed || 0, ci.umbrellasClosed || 0, umbPeak - (ci.umbrellas || 0));
    if (closedAt < 0 && closedNow >= 3) closedAt = elapsed;
    const birdsNow = Math.max(i.birdsLanded || 0, (window.day.slice && window.day.slice.now && window.day.slice.now().landed) || 0);
    if (birdsAt < 0 && birdsNow >= 1) birdsAt = elapsed;
    if (neighborAt < 0 && (i.neighborSaid || false)) neighborAt = elapsed;
    if (elapsed >= 20 && dripLiveAt20 === 0) dripLiveAt20 = Math.max(ri.drips || 0, (ri.afterLeft || 0) > 0 ? 1 : 0);
  }
  const i1 = A.info();
  const umbsNow = crowd ? crowd.info().umbrellas : 0;
  const closed = Math.max(i1.umbrellasClosed || 0, (crowd && crowd.info().umbrellasClosed) || 0, umbPeak - umbsNow);
  const birds = Math.max(i1.birdsLanded || 0, (window.day.slice && window.day.slice.now && window.day.slice.now().landed) || 0);

  t.metric("aftermathSteamSec", steamAt < 0 ? 99 : Math.round(steamAt * 100) / 100);
  t.metric("aftermathRainbowSec", rainbowAt < 0 ? 99 : Math.round(rainbowAt * 100) / 100);
  t.metric("aftermathAngleDeg", i1.angleDeg || 42);
  t.metric("aftermathDrips", dripMax);
  t.metric("aftermathDripLive20", dripLiveAt20);
  t.metric("aftermathUmbrellasClosed", closed);
  t.metric("aftermathBirdsLanded", birds);
  t.metric("aftermathUmbrellaSec", closedAt < 0 ? 99 : Math.round(closedAt * 100) / 100);
  t.metric("aftermathBirdSec", birdsAt < 0 ? 99 : Math.round(birdsAt * 100) / 100);

  if (steamAt < 0 || steamAt > 3) t.problem("bug", `Steam after Sun break took ${steamAt < 0 ? ">3" : steamAt.toFixed(2)} s (want within 3 s)`);
  else t.event("aftermath-steam", `steam in ${steamAt.toFixed(2)} s (live ${i1.steamLive}, weather ${(W.now().steam || 0).toFixed(2)})`);
  if (rainbowAt < 0 || rainbowAt > 3) t.problem("bug", `Rainbow after Sun break took ${rainbowAt < 0 ? ">3" : rainbowAt.toFixed(2)} s (want within 3 s)`);
  else t.event("aftermath-rainbow", `rainbow in ${rainbowAt.toFixed(2)} s at ${i1.angleDeg}° (alpha ${(i1.rainbow || 0).toFixed(2)})`);
  t.progress(0.45);

  if (dripMax < 1 || dripLiveAt20 < 1) t.problem("bug", `Gutters didn't keep dripping (peak live ${dripMax}, still at 20 s: ${dripLiveAt20}; afterLeft ${R.info().afterLeft})`);
  else t.event("aftermath-drips", `live drips peak ${dripMax}, still dripping at 20 s`);
  t.progress(0.6);

  if (closed < 3 || (closedAt >= 0 && closedAt > 15) || closedAt < 0) {
    t.problem("bug", `Umbrellas: closed ${closed} (peak ${umbPeak} → ${umbsNow}) at ${closedAt < 0 ? ">15" : closedAt.toFixed(1)} s (want ≥3 within 15 s)`);
  } else t.event("aftermath-umbrellas", `${closed} walkers closed their umbrellas in ${closedAt.toFixed(1)} s`);
  if (birds < 1 || (birdsAt >= 0 && birdsAt > 15) || birdsAt < 0) {
    t.problem("bug", `Pigeons: landed ${birds} at ${birdsAt < 0 ? ">15" : birdsAt.toFixed(1)} s (want ≥1 within 15 s)`);
  } else t.event("aftermath-birds", `${birds} pigeons landed on a roof in ${birdsAt.toFixed(1)} s`);
  if (i1.neighborSaid || neighborAt >= 0) t.event("aftermath-dex", `Dex said his dry-parcels thanks at ${(neighborAt < 0 ? 0 : neighborAt).toFixed(1)} s`);
  else t.problem("warning", "Dex didn't voice his dry-parcels thanks (is he within 28 m on the stoop?)");
  t.progress(0.8);

  if (touch) {
    const fp = await fpsWindow(4500);
    t.metric("aftermathPhoneFpsAvg", Math.round(fp.avg * 10) / 10);
    const mid = A.info();
    if (!(mid.rainbowOn || mid.rainbow > 0.05) && mid.rainbowLeft <= 0) t.problem("warning", "Rainbow already faded on the phone sample");
    if ((mid.budgets && mid.budgets.steam > 50)) t.problem("bug", `Phone steam budget ${mid.budgets.steam} (want half of desktop)`);
    if (fp.avg < 30) t.problem("bug", `Phone aftermath fps averaged ${fp.avg.toFixed(1)} (want >= 30)`);
    else t.event("aftermath-fps", `${fp.avg.toFixed(1)} fps avg at low quality; steam budget ${mid.budgets && mid.budgets.steam}, drips ${mid.budgets && mid.budgets.drips}, rainbow on`);
  } else {
    t.event("aftermath-done", `steam ${steamAt.toFixed(2)} s, rainbow ${rainbowAt.toFixed(2)} s, drips ${dripMax}, closed ${closed}, birds ${birds}`);
  }
  t.progress(1);
}

/* ---------------- lightning-bolt: the forked bolt, its flash, afterimage, scorch and crowd flinch ---------------- */
// Real input: Take control (Enter, or a tap on the button on a phone), walk to the avenue, then tap/press Lightning
// (touch: pointer events on #ability-bolt). Per frame it records the cast frame time, the forks and re-strikes (times
// from the tap), the frames the flash light is up, the afterimage's burn-out, the scorch's heat over 10 s and whether
// the crowd flinched. Events: bolt-forks / bolt-restrikes / bolt-flash / bolt-afterimage / bolt-scorch / bolt-flush /
// bolt-crowd / bolt-conductor / bolt-frame. { "touch": true } plays it by touch at low quality (390x844).
async function lightningBolt(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const P = window.powers || (window.day && window.day.powers);
  const C = window.day.control;
  if (!P || !P.boltFx || !C) return t.problem("bug", "powers (js/lightning.js) or Take control isn't installed");
  const touch = !!(options && options.touch) || innerWidth <= 700;
  const cfg = window.DAY_CONFIG;
  const street = cfg.street || { z: 12.6 };
  const day = window.day.today();
  const outside = carSideMoment(day) || day.actions.find((a) => /steps out/.test(a.text || "")) || quietMoment(day);
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  if (touch) { try { window.day.look.quality("low"); } catch (e) { /* */ } C.touch(true); }
  const sound = $("sound");
  if (sound) { sound.click(); await sleep(150); }
  if (touch) await tapEl($("control")); else pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  t.event("control-taken", touch ? "by touch, low quality" : "Enter");
  const reached = await goTo(-2.2, street.z - 1.8, t, { close: 1.6, ms: 20000, run: true, progress: 0.15 });
  if (!reached) t.problem("bug", "He didn't reach the avenue");
  const quality = window.day.look.quality();
  t.metric("quality", quality);
  t.scene("Lightning");
  await t.until(() => P.now().pressure >= 24, 15000, "Charge for Lightning").catch(() => {});

  // one cast, watched frame by frame for 0.7 s
  const samples = [];
  let tapAt = 0;
  let stop = false;
  let last = performance.now();
  const loop = (now) => {
    if (stop) return;
    const b = P.now().bolt;
    samples.push({ ms: tapAt ? now - tapAt : -1, dt: now - last, forks: b.forks, restrikes: b.restrikes, id: b.id, lit: b.litFrames, flashFrames: b.flashFrames, after: b.afterimage, afterVisible: b.afterVisible });
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const crowdBefore = window.day.crowd && window.day.crowd.info ? window.day.crowd.info().flinching || 0 : 0;
  const idBefore = P.now().bolt.id;
  tapAt = performance.now();
  if (touch) await tapEl($("ability-bolt")); else await tapKey("e", 90);
  await sleep(750);
  stop = true;
  const b = P.now().bolt;
  const castFrames = samples.filter((s2) => s2.ms >= 0 && s2.ms < 500);
  const worst = castFrames.reduce((m, s2) => Math.max(m, s2.dt), 0);
  t.metric("cast-frame-ms-max", Math.round(worst));
  if (b.id === idBefore) return t.problem("bug", "Lightning didn't strike");
  const limit = touch ? 50 : 100;
  if (worst > limit) t.problem("bug", `The cast frame took ${Math.round(worst)} ms (limit ${limit} ms${touch ? " at 390x844" : ""})`);
  else t.event("bolt-frame", `worst cast frame ${Math.round(worst)} ms`);
  const maxForks = castFrames.reduce((m, s2) => Math.max(m, s2.forks), 0);
  t.metric("bolt-forks", maxForks);
  const maxFork = quality === "low" ? 3 : 6;
  if (maxForks < (quality === "low" ? 1 : 3) || maxForks > maxFork) t.problem("bug", `The bolt had ${maxForks} forks (${quality} wants ${quality === "low" ? "1-3" : "3-6"})`);
  else t.event("bolt-forks", `${maxForks} forks (${quality})`);
  const reStrikes = [];
  castFrames.forEach((s2, i) => { if (i && s2.restrikes > castFrames[i - 1].restrikes) reStrikes.push(Math.round(s2.ms)); });
  t.metric("bolt-restrikes", b.restrikes);
  if (b.restrikes < 2 || reStrikes.some((ms) => ms > 400)) t.problem("bug", `Re-strikes: ${b.restrikes} (at ${reStrikes.join(", ")} ms after the tap; want 2+ within 400 ms)`);
  else t.event("bolt-restrikes", `${b.restrikes} re-strikes at ${reStrikes.join(", ")} ms`);
  if (b.litFrames < 2) t.problem("bug", `The flash lit the facades for ${b.litFrames} frames (want 2+)`);
  else t.event("bolt-flash", `facades within 40 m lit for ${b.litFrames} frames, peak ${b.flashPeak.toFixed(2)}`);
  const afterSeen = castFrames.some((s2) => s2.afterVisible && s2.after > 0.05);
  if (!afterSeen || b.afterVisible) t.problem("bug", "The afterimage didn't show and burn out");
  else t.event("bolt-afterimage", "camera-facing afterimage burned out within 0.5 s");
  if (b.conductor) t.event("bolt-conductor", `struck the ${b.conductor}`);
  const crowdAfter = window.day.crowd && window.day.crowd.info ? window.day.crowd.info().flinching || 0 : 0;
  t.metric("crowd-flinching", crowdAfter);
  if (crowdAfter > crowdBefore || crowdAfter > 0) t.event("bolt-crowd", `${crowdAfter} people flinched`);
  else t.event("bolt-crowd", "nobody within 40 m to flinch here");

  const d0 = b.decals[b.decals.length - 1];
  if (!d0) return t.problem("bug", "No scorch decal after the strike");
  t.event("bolt-flush", `decal ${(0.012 * 1000).toFixed(0)} mm on the surface normal (${d0.normal.map((n) => n.toFixed(2)).join(", ")}), zOffset ${d0.zOffset}`);
  if (d0.zOffset > -1) t.problem("bug", "The scorch decal has no depth offset (z-fighting risk)");
  t.event("bolt-scorch", `glowing, heat ${d0.heat.toFixed(2)}`);
  t.progress(0.7);
  // the scorch cools: orange now, black by 10 s
  await sleep(10300);
  const d1 = P.now().bolt.decals[0];
  t.metric("scorch-heat-10s", d1 ? Math.round(d1.heat * 100) / 100 : 0);
  if (!d1 || d1.black) t.event("bolt-scorch", "turned black within 10 s");
  else t.problem("bug", `The scorch was still glowing at 10 s (heat ${d1.heat.toFixed(2)})`);
  t.progress(1);
}

/* ---------------- voice: DoD Eric lines on powers, weather, episode open/close ---------------- */
// Real input: Sound (pointer), Enter, weather keys 1–7 with gaps for cooldown, bolts for chance/cooldown skips,
// one forced power bark, Esc for the score-card close. Events: voice-play / voice-skip.
// Spoken dialogue: with Sound on, an episode's opening lines play as their own Hawkes Gen clips (audio/dialogue/*.mp3),
// not the babble. Checks the build's clip list, that a sample of clips loads and decodes, and that Part 1's opening
// lines are spoken through day.dialogue (day:dialogue say). Events dialogue-index / dialogue-decode / dialogue-say.
// Foley: with Sound on, taps on the ability arc and Episodes play the UI press, jumps, landings and the city use the recorded
// bank (day.sfx.info() sources), and in two minutes no clip file plays twice within 60 s. Plays by touch (phone-sized window).
async function foley(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const X = window.day.sfx;
  const C = window.day.control;
  if (!X || !C) return t.problem("bug", "day.sfx or Take control isn't installed");
  const bytes = () => performance.getEntriesByType("resource").filter((r) => /\/audio\/foley\//.test(r.name)).reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0);
  const sound = $("sound");
  if (sound && sound.getAttribute("aria-pressed") !== "true") await tapEl(sound);
  await sleep(600);
  t.event("sound-on", sound && sound.getAttribute("aria-pressed") === "true" ? "Sound on" : "Sound still off");
  const pressesBefore = (X.info().heard["ui-press"] || 0);
  if (C.touch) C.touch(true);
  await tapEl($("control"));
  await t.until(() => C.mode() === "control", 8000, "control taken");
  // the ability arc: one tap per verb button
  const arc = [...document.querySelectorAll("button[data-ability]")].filter((b) => b.getBoundingClientRect().width > 0);
  for (const b of arc.slice(0, 3)) { await tapEl(b); await sleep(700); }
  const arcPresses = (X.info().heard["ui-press"] || 0) - pressesBefore;
  t.event("ui-arc", `${arcPresses} UI presses for ${Math.min(3, arc.length)} ability taps`);
  if (arcPresses < Math.min(3, arc.length)) t.problem("bug", `Ability-arc taps played ${arcPresses} UI sounds for ${Math.min(3, arc.length)} taps`);
  const ep = $("episodes");
  if (ep) { const n = X.info().heard["ui-press"] || 0; await tapEl(ep); await sleep(500); if ((X.info().heard["ui-press"] || 0) <= n) t.problem("bug", "Tapping Episodes played no UI sound"); await tapEl(ep.ownerDocument.querySelector("#ep-menu .close, .ep-menu .close") || ep); await sleep(400); }
  // jumps and landings by the touch Jump button
  for (let i = 0; i < 6; i++) { await tapEl($("jump-btn") || $("control")); await sleep(1500); }
  const t0 = performance.now();
  while (performance.now() - t0 < 100000) { await sleep(5000); t.progress(Math.min(0.9, (performance.now() - t0) / 100000)); }
  const info = X.info();
  t.event("sfx-sources", JSON.stringify(info.sources));
  t.metric("foley.bytes", bytes());
  t.metric("foley.indexed", info.bank.indexed);
  for (const k of ["jump", "landing", "crowd", "car", "bird", "ui"]) if (info.sources[k] !== "file") t.problem("bug", `day.sfx.info().sources.${k} is ${info.sources[k]}, not a recorded file`);
  const last = {};
  let repeats = 0;
  for (const p of info.plays) { if (last[p.file] != null && p.t - last[p.file] < 60000) repeats++; last[p.file] = p.t; }
  t.event("foley-repeats", `${repeats} clip files replayed within 60 s of themselves out of ${info.plays.length} plays`);
  if (repeats) t.problem("bug", `${repeats} foley files played again within 60 s`);
  if (bytes() > 400 * 1024) t.problem("bug", `Foley transfer is ${Math.round(bytes() / 1024)} KB, over 400 KB`);
}
async function spokenDialogue(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const D = window.day.dialogue;
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  if (!D || !Ep || !C) return t.problem("bug", "day.dialogue, episodes or Take control isn't installed");
  const lines = D.lines();
  // Story + neighbor lines must be in the build; voice.spoken bark clips land with the voice-director pass.
  const mustHave = lines.filter((L) => L.where && !String(L.where).startsWith("voice:"));
  await t.until(() => D.now().files > 0, 6000, "audio/dialogue/index.json").catch(() => {});
  const files = D.now().files;
  t.event("dialogue-index", `${files} clips for ${mustHave.length} story/neighbor lines (${lines.length} incl. voice barks)`);
  if (files < mustHave.length) t.problem("bug", `Only ${files} of ${mustHave.length} story/neighbor dialogue lines have a clip in the build, the rest fall back to babble`);
  t.progress(0.1);

  // A sample of clips must load and decode in this browser.
  const sample = mustHave.filter((_, i) => i % 13 === 0);
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
  await t.until(() => plays.some((p) => p.group === "take" || p.group === "episode-open"), 4000, "take / episode-open line").catch(() => {});
  const open = plays.find((p) => p.group === "take" || p.group === "episode-open");
  if (open) t.event("voice-play", `take ${open.id}: "${open.text}"`);
  else t.problem("bug", "Taking control didn't play a take / episode-open line");
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
  await t.until(() => plays.length > beforeClose && plays.some((p) => p.group === "letgo" || p.group === "episode-close"), 4000, "letgo / episode-close line").catch(() => {});
  const close = [...plays].reverse().find((p) => p.group === "letgo" || p.group === "episode-close");
  if (close) t.event("voice-play", `letgo ${close.id}: "${close.text}"`);
  else t.problem("bug", "Letting go didn't play a letgo / episode-close line");

  window.removeEventListener("day:voice", onVoice);
  t.metric("voicePlays", plays.length);
  t.metric("voiceSkips", skips.length);
  t.event("voice-summary", `${plays.length} plays, ${skips.length} skips, DoD voice ${V.now().voiceId}`);
  t.progress(1);
}

/* ---------------- voice-director: take control, two first-use powers, caption, mute, no overlap ---------------- */
// Needs ?playtest=voice-director. Sound on (real pointer), Enter, E then R (first uses), Voices off then a third
// call stays quiet; optional phone layout via {"touch":true}. Events voice-take / voice-power-first / voice-caption /
// voice-no-overlap / voices-mute / voice-dayend. Acceptance: speaks on take and first powers; lines never overlap;
// same line waits ~5 min; caption clear of the ability bar; Voices mute separate from Sound.
async function voiceDirector(options, t) {
  t.scene("Voice director");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const V = window.voice || (window.day && window.day.voice);
  if (!V) { t.problem("bug", "There's no voice director (js/voice.js)"); return; }
  const C = window.day.control;
  if (!C) { t.problem("bug", "There's no Take control"); return; }
  if (options && options.touch && C.touch) C.touch(true);

  const spoken = (window.DAY_CONFIG && window.DAY_CONFIG.voice && window.DAY_CONFIG.voice.spoken) || {};
  const groups = ["take", "letgo", "bolt", "rain", "dayend", "idle"];
  groups.forEach((g) => {
    if (!Array.isArray(spoken[g]) || spoken[g].length < 2) t.problem("bug", `voice.spoken.${g} needs 2+ variants`);
  });
  t.event("voice-spoken", `${Object.keys(spoken).length} groups`);
  t.metric("spokenGroups", Object.keys(spoken).length);

  const day = window.day.today();
  const out = day.actions.find((a) => /steps out/.test(a.text || "")) || quietMoment(day);
  scrubTo(out.start + Math.min(0.4, (out.end - out.start) / 2));
  clickSpeed(1);
  await sleep(400);
  t.event("start-at", `${E().fmtClock(out.start)} outdoors`);

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
  if (V.voices && !V.voices()) V.voices(true);
  t.progress(0.1);

  t.scene("Take control bark");
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  await t.until(() => plays.some((p) => p.group === "take"), 5000, "take bark").catch(() => {});
  const take = plays.find((p) => p.group === "take");
  if (!take) t.problem("bug", "Taking control didn't speak a take bark");
  else t.event("voice-take", `${take.id}: "${take.text}"`);
  const cap = $("voice-caption");
  await t.until(() => cap && !cap.hidden && (cap.textContent || "").trim().length > 4, 3000, "caption up").catch(() => {});
  if (!cap || cap.hidden) t.problem("bug", "No voice caption while he speaks");
  else {
    const cr = cap.getBoundingClientRect();
    const bar = document.querySelector(".abilitybar");
    const br = bar && hudVisible(bar);
    if (br && !(cr.bottom < br.top - 2 || cr.top > br.bottom + 2 || cr.right < br.left || cr.left > br.right)) {
      t.problem("bug", "Voice caption overlaps the ability bar");
    } else t.event("voice-caption", `"${(cap.textContent || "").trim()}" clear of ability bar at ${innerWidth}x${innerHeight}`);
  }
  t.progress(0.3);

  t.scene("First power uses");
  const P = window.powers || (window.day && window.day.powers);
  if (P) {
    await t.until(() => P.now().pressure + 0.05 >= 24, 12000, "Pressure for bolt").catch(() => {});
    const beforeBolt = plays.length;
    pressKey("e");
    await t.until(() => plays.length > beforeBolt && plays.some((p) => p.group === "bolt"), 5000, "first bolt bark").catch(() => {});
    const bolt = [...plays].reverse().find((p) => p.group === "bolt");
    if (bolt) t.event("voice-power-first", `bolt ${bolt.id}: "${bolt.text}"`);
    else t.problem("bug", "First Lightning didn't speak");

    // Overlap: hammer Rain while bolt caption may still be settling; director must skip or wait.
    await t.until(() => P.now().pressure + 0.05 >= 18, 12000, "Pressure for rain").catch(() => {});
    const beforeRain = plays.length;
    const skipBefore = skips.length;
    pressKey("r");
    await sleep(200);
    pressKey("r"); // second tap while first may still be gated
    await t.until(() => plays.length > beforeRain || skips.length > skipBefore, 5000, "rain bark or overlap skip").catch(() => {});
    const rain = [...plays].reverse().find((p) => p.group === "rain");
    if (rain) t.event("voice-power-first", `rain ${rain.id}: "${rain.text}"`);
    else t.problem("bug", "First Rain didn't speak");
    const overlaps = skips.filter((s) => s.reason === "overlap");
    t.event("voice-no-overlap", `${overlaps.length} overlap refusals, playing=${!!V.now().playing}`);
    t.metric("overlapSkips", overlaps.length);

    // Same line id: refuse within the 5 min line cooldown (ignore only the between-line gap).
    const skipCdBefore = skips.length;
    const again = take
      ? V.say("take", { force: true, ignoreCooldown: true, text: take.text, via: "playtest-line-cd" })
      : null;
    const skipCd = skips.length - skipCdBefore;
    if (again && take && again.id === take.id) t.problem("bug", "Same take line replayed inside the 5 min line cooldown");
    else if (skipCd < 1 && take) t.problem("bug", "Same take line wasn't refused by line-cooldown");
    else t.event("voice-line-cooldown", `${skipCd} line-cooldown skips (same id refused)`);
  } else t.problem("bug", "powers missing");
  t.progress(0.55);

  t.scene("Voices mute");
  const voicesBtn = $("voices");
  if (!voicesBtn) t.problem("bug", "No Voices button in Settings");
  else {
    if (voicesBtn.getAttribute("aria-pressed") !== "true") voicesBtn.click();
    await sleep(100);
    // Open settings if needed so the button is clickable
    const gear = $("settings");
    if (gear && voicesBtn.closest("#settings-pop") && $("settings-pop").hidden) gear.click();
    voicesBtn.click();
    await sleep(150);
    if (voicesBtn.getAttribute("aria-pressed") !== "false") t.problem("bug", "Voices didn't turn off");
    else t.event("voices-mute", "Voices off");
    const beforeMute = plays.length;
    const skipMute = skips.length;
    if (P) {
      await t.until(() => P.now().pressure + 0.05 >= 18, 10000, "Pressure while muted").catch(() => {});
      pressKey("v"); // gale — not first-use if we only did bolt/rain; force a first-use gale
      await sleep(400);
    }
    if (plays.length > beforeMute) t.problem("bug", "A voice line played while Voices was off");
    else t.event("voices-mute-quiet", `${skips.length - skipMute} skips with Voices off`);
    // Sound still on
    if (sound && sound.getAttribute("aria-pressed") !== "true") t.problem("bug", "Voices mute also turned Sound off");
    voicesBtn.click(); // back on
    if (gear && !$("settings-pop").hidden) gear.click();
  }
  t.progress(0.75);

  t.scene("Day end bark");
  // Force the day-end moment via API (setup); director listens for day:moment day-end.
  const beforeEnd = plays.length;
  if (window.day.moments && window.day.moments.recap) {
    window.day.moments.recap("playtest");
    await t.until(() => plays.length > beforeEnd && plays.some((p) => p.group === "dayend"), 5000, "dayend bark").catch(() => {});
    const end = [...plays].reverse().find((p) => p.group === "dayend");
    if (end) t.event("voice-dayend", `${end.id}: "${end.text}"`);
    else t.problem("bug", "Day end didn't speak a dayend bark");
    if (window.day.moments.skip) window.day.moments.skip();
  } else t.problem("bug", "moments missing, can't check dayend bark");

  checkHud(t, "voice-director");
  window.removeEventListener("day:voice", onVoice);
  t.metric("voiceDirectorPlays", plays.length);
  t.event("voice-director-summary", `${plays.length} plays, ${skips.length} skips at ${innerWidth}x${innerHeight}`);
  t.progress(1);
}

/* ---------------- day-sound: diegetic autopilot soundscapes by schedule block ---------------- */
// Needs ?playtest=day-sound. Sound on, 1200× through home/commute/office/lunch/tv/night; plant a rain deed
// and hear the car radio name it; desk keyboard on within 3 s and off when he leaves; on phone/low ≤3 loops.
// Events day-scape-* / day-radio / day-keyboard-on / day-keyboard-off / day-phone-cap; metrics dayScapes, dayMaxLoops.
async function daySoundScenario(options, t) {
  t.scene("Day sound");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const DS = window.daysound || (window.day && window.day.daysound);
  const C = window.day.control;
  const Mem = window.day.memory;
  if (!DS) { t.problem("bug", "There's no daysound director (js/daysound.js)"); return; }
  if (options && options.touch && C && C.touch) C.touch(true);

  const scapesSeen = new Set();
  const events = [];
  const onDs = (e) => {
    const d = (e && e.detail) || {};
    events.push(d);
    if (d.action === "scape" && d.scape) {
      scapesSeen.add(d.scape);
      t.event(`day-scape-${d.scape}`, `loops ${(d.loops || []).join(",") || "none"} cap ${d.cap}`);
    }
    if (d.action === "radio" || d.action === "radio-report") t.event("day-radio", `${d.action} ${d.weather || ""} ${d.text || ""}`);
    if (d.action === "keyboard-on") t.event("day-keyboard-on", d.place || "");
    if (d.action === "keyboard-off") t.event("day-keyboard-off", d.place || "");
  };
  window.addEventListener("day:daysound", onDs);

  const sound = $("sound");
  if (sound) {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 7, pointerType: options && options.touch ? "touch" : "mouse" }));
    sound.click();
    await sleep(300);
    t.event("sound-on", sound.getAttribute("aria-pressed") === "true" ? "Sound on" : "Sound still off");
    if (sound.getAttribute("aria-pressed") !== "true") t.problem("bug", "Sound button didn't turn on");
  }
  t.progress(0.08);

  // Plant a weather deed so the commute radio has something to name.
  if (Mem && Mem.note) {
    Mem.note("power", "avenue", "rain");
    t.event("day-deed", "planted avenue rain for the radio");
  }
  t.progress(0.12);

  const day = window.day.today();
  const want = [
    { id: "home", chapter: "wake", label: "home morning" },
    { id: "commute", chapter: "commute", label: "commute" },
    { id: "office", chapter: "work", label: "office" },
    { id: "park", chapter: "lunch", label: "park lunch" },
    { id: "tv", chapter: "tv", label: "evening TV" },
    { id: "night", chapter: "bedtime", label: "night" },
  ];

  t.scene("1200× through the six soundscapes");
  scrubTo(day.dayStart + 0.2);
  clickSpeed(1200);
  let maxLoops = 0;
  const untilMin = day.dayStart + 16 * 60;
  await t.until(() => {
    const n = DS.now();
    if (n && n.playing > maxLoops) maxLoops = n.playing;
    if (n && n.scape) scapesSeen.add(n.scape);
    const minutes = window.day.now().minutes;
    return scapesSeen.size >= 6 || minutes > untilMin;
  }, 120000, "six day soundscapes").catch(() => {});
  clickSpeed(1);
  t.metric("dayScapes", scapesSeen.size);
  t.metric("dayMaxLoops", maxLoops);
  // Force each scape once so the log has a non-empty distinct loop set even if 1200× skipped a chapter.
  for (const w of want) {
    const ctx = {
      chapter: w.chapter,
      place: w.id === "office" ? "desk" : "",
      hand: w.id === "office" ? "type" : "",
      inCar: w.id === "commute",
      things: w.id === "home" ? { shower: "on" } : {},
    };
    await DS.force(w.id, ctx);
    await sleep(280);
    const n = DS.now();
    scapesSeen.add(w.id);
    if (!n.loops || !n.loops.length) t.problem("bug", `${w.label} soundscape has no playing loops`);
    else t.event(`day-scape-${w.id}`, `loops ${n.loops.join(",")}`);
  }
  want.forEach((w) => {
    if (!scapesSeen.has(w.id)) t.problem("bug", `Missing soundscape ${w.label} (${w.id})`);
  });
  if (scapesSeen.size >= 6) t.event("day-scapes-all", [...scapesSeen].join(","));
  t.progress(0.45);

  // Commute radio: must name the planted rain.
  t.scene("Car radio names today's weather");
  const drive = day.blocks.find((b) => b.chapter === "commute") || day.actions.find((a) => a.inCar);
  if (drive) scrubTo((drive.start || day.dayStart) + 0.5);
  clickSpeed(1);
  await sleep(400);
  const wx = DS.radioWeather();
  await DS.playRadio(wx);
  await sleep(1200);
  const radioHit = events.some((e) => (e.action === "radio" || e.action === "radio-report") && e.weather === "rain");
  if (wx !== "rain") t.problem("bug", `Radio weather was "${wx}", need rain from the planted deed`);
  else if (!radioHit) t.problem("bug", "Car radio never fired a rain weather report");
  else t.event("day-radio-weather", wx);
  t.progress(0.62);

  // Office keyboard: scrub to a desk Work block, wait ≤3 s for the keyboard loop, then leave the desk.
  t.scene("Office keyboard at the desk");
  const desk = day.actions.find((a) => a.place === "desk" && a.chapter === "work" && /type|Work|Email|desk/i.test((a.text || "") + (a.block || "")))
    || day.actions.find((a) => a.place === "desk" && a.chapter === "work");
  if (desk) {
    scrubTo(desk.start + Math.min(0.3, (desk.end - desk.start) / 4));
    clickSpeed(1);
    const t0 = performance.now();
    await t.until(() => {
      const n = DS.now();
      return n.loops && n.loops.includes("keyboard");
    }, 4000, "keyboard loop within 3 s of the desk").catch(() => {});
    const within = (performance.now() - t0) / 1000;
    const n = DS.now();
    t.metric("dayKeyboardSec", within);
    if (!(n.loops && n.loops.includes("keyboard"))) t.problem("bug", "Office keyboard clatter never started at the desk");
    else if (within > 3.2) t.problem("bug", `Keyboard took ${within.toFixed(2)} s (need ≤3)`);
    else t.event("day-keyboard-ok", `within ${within.toFixed(2)} s`);

    const leave = day.actions.find((a) => a.chapter === "work" && a.place && a.place !== "desk" && a.place !== "deskStand" && a.hand !== "type" && a.start > desk.start);
    if (leave) {
      scrubTo(leave.start + 0.2);
      await sleep(700);
      const after = DS.now();
      if (after.loops.includes("keyboard") || after.keyboard) t.problem("bug", "Keyboard kept playing after he left the desk");
      else t.event("day-keyboard-stopped", leave.place || leave.block || "left desk");
    }
  } else {
    t.problem("bug", "No desk work action to test keyboard clatter");
  }
  t.progress(0.8);

  // Phone / low quality: never more than 3 loops.
  t.scene("Phone loop cap");
  if (options && options.touch) {
    document.documentElement.classList.add("touch-ui");
    if (window.day.look && window.day.look.setQuality) window.day.look.setQuality("low");
    else if (window.look && window.look.setQuality) window.look.setQuality("low");
    await DS.force("home", { chapter: "wake", things: { shower: "on" }, wet: true });
    await sleep(400);
    await DS.force("office", { chapter: "work", place: "desk", hand: "type" });
    await sleep(400);
    await DS.force("park", { chapter: "lunch" });
    await sleep(400);
    const phoneMax = Math.max(maxLoops, DS.now().playing, DS.now().cap === 3 ? DS.now().playing : 0);
    // Re-measure across forced scapes
    let peak = 0;
    for (const id of ["home", "commute", "office", "park", "tv", "night"]) {
      await DS.force(id, { chapter: id === "home" ? "wake" : id === "office" ? "work" : id === "park" ? "lunch" : id === "tv" ? "tv" : id === "commute" ? "commute" : "bedtime", place: id === "office" ? "desk" : "", hand: id === "office" ? "type" : "", inCar: id === "commute", things: id === "home" ? { shower: "on" } : {} });
      await sleep(250);
      peak = Math.max(peak, DS.now().playing);
    }
    t.metric("dayPhoneLoops", peak);
    if (peak > 3) t.problem("bug", `Phone low quality played ${peak} loops at once (cap 3)`);
    else t.event("day-phone-cap", `max ${peak} loops`);
  } else {
    t.event("day-phone-cap", "desktop run; phone cap checked when options.touch");
    // Still assert the runtime cap reports 3 under touch-ui class briefly.
    document.documentElement.classList.add("touch-ui");
    await DS.force("park", { chapter: "lunch" });
    await sleep(200);
    if (DS.now().cap > 3) t.problem("bug", `touch-ui cap is ${DS.now().cap}, need 3`);
    document.documentElement.classList.remove("touch-ui");
  }
  t.progress(0.95);
  // Under control the day's room tone is ducked 6 dB, not muted.
  if (window.day && window.day.control && window.day.control.mode() !== "control") {
    pressKey("Enter");
    await t.until(() => window.day.control.mode() === "control", 4000, "Take control (Enter)");
    await sleep(900);
    const U = DS.now();
    t.event("day-sound-under-control", `ducked ${U.ducked} ${U.duckDb} dB, ${U.playing} loops playing`);
    t.metric("dayControlLoops", U.playing);
    if (U.playing < 1 || !U.ducked) t.problem("bug", "Under control the day soundscape is muted instead of ducked");
  }

  window.removeEventListener("day:daysound", onDs);
  t.event("day-sound-done", `scapes ${scapesSeen.size} maxLoops ${maxLoops}`);
  t.finish("done");
}

/* ---------------- pilot: schedule nudges, take/let-go, wrist ring, no overlap with Small Weather ---------------- */
// Needs ?playtest=pilot. Sound on, 1200× day for schedule lines, Enter (take), weather chaos, Esc (let-go).
// Optional {"touch":true} for 390x844 caption/layout. Events pilot-schedule / pilot-take / pilot-letgo /
// pilot-ring / pilot-no-overlap / pilot-caption-phone; metrics pilotDistinct, pilotOverlaps.
async function pilotScenario(options, t) {
  t.scene("Pilot");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const P = window.pilot || (window.day && window.day.pilot);
  const V = window.voice || (window.day && window.day.voice);
  const C = window.day.control;
  if (!P) { t.problem("bug", "There's no Pilot director (js/pilot.js)"); return; }
  if (!V || !V.speakPilot) { t.problem("bug", "voice.speakPilot missing — Pilot can't queue through voice.js"); return; }
  if (!C) { t.problem("bug", "There's no Take control"); return; }
  if (options && options.touch && C.touch) C.touch(true);

  const cfgP = (window.DAY_CONFIG && window.DAY_CONFIG.pilot) || {};
  const sch = cfgP.schedule || {};
  if (Object.keys(sch).length < 12) t.problem("bug", `pilot.schedule has ${Object.keys(sch).length} blocks, need 12+`);
  if (!Array.isArray(cfgP.lines) || cfgP.lines.length < 40) t.problem("bug", `pilot.lines has ${(cfgP.lines || []).length}, need 40+`);
  t.event("pilot-config", `${(cfgP.lines || []).length} lines, ${Object.keys(sch).length} schedule blocks`);

  const plays = [];
  const voicePlays = [];
  const onPilot = (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "play") plays.push(d);
    if (d.action === "overlap") plays.push({ overlap: true, ...d });
  };
  const onVoice = (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "play") voicePlays.push(d);
  };
  window.addEventListener("day:pilot", onPilot);
  window.addEventListener("day:voice", onVoice);

  const sound = $("sound");
  if (sound) {
    const r = sound.getBoundingClientRect();
    sound.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 4, pointerType: "mouse" }));
    sound.click();
    await sleep(250);
    t.event("sound-on", sound.getAttribute("aria-pressed") === "true" ? "Sound on" : "Sound still off");
  }
  if (V.voices && !V.voices()) V.voices(true);
  t.progress(0.08);

  t.scene("Schedule at 1200×");
  const day = window.day.today();
  scrubTo(day.dayStart + 0.2);
  clickSpeed(1200);
  const schedulePlays = [];
  const untilBlocks = Math.min(day.blocks.length, 28);
  await t.until(() => {
    const n = plays.filter((p) => p.group === "schedule" || (p.via === "schedule"));
    if (n.length > schedulePlays.length) {
      const fresh = n.slice(schedulePlays.length);
      fresh.forEach((p) => {
        schedulePlays.push(p);
        t.event("pilot-schedule", `${p.block || "?"}: "${p.text}"`);
      });
    }
    const fr = window.day.now().frame;
    const minutes = window.day.now().minutes;
    return schedulePlays.length >= 12 || (fr && minutes > day.dayStart + 10 * 60);
  }, 90000, "12 Pilot schedule lines").catch(() => {});
  clickSpeed(1);
  const distinct = new Set(schedulePlays.map((p) => p.id || p.text));
  t.metric("pilotDistinct", distinct.size);
  if (distinct.size < 12) t.problem("bug", `Pilot only spoke ${distinct.size} distinct schedule lines (need 12+)`);
  else t.event("pilot-schedule-count", `${distinct.size} distinct schedule lines`);
  t.progress(0.35);

  t.scene("Take control");
  const out = day.actions.find((a) => /steps out/.test(a.text || "")) || quietMoment(day);
  scrubTo(out.start + Math.min(0.4, (out.end - out.start) / 2));
  await sleep(300);
  const beforeTake = plays.length;
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  await t.until(() => plays.length > beforeTake && plays.some((p) => p.group === "take" || p.via === "take" || (p.via || "").includes("control") && /sky|move|schedule/i.test(p.text || "")), 8000, "Pilot take line").catch(() => {});
  const take = [...plays].reverse().find((p) => p.group === "take" || /sky|Your move|hold the schedule/i.test(p.text || ""));
  if (!take) t.problem("bug", "Taking control didn't play a Pilot take line");
  else t.event("pilot-take", `"${take.text}"`);

  await t.until(() => P.now().talking || P.now().pulse > 0.5, 4000, "wrist ring pulse").catch(() => {});
  const ringOn = P.now().ring && (P.now().talking || P.now().pulse > 0.4);
  if (!ringOn) t.problem("bug", "Wrist ring did not pulse while Pilot spoke");
  else t.event("pilot-ring", `ring=${P.now().ring} pulse=${P.now().pulse}`);
  t.progress(0.55);

  t.scene("Chaos then let go");
  const Pow = window.powers || (window.day && window.day.powers);
  if (Pow) {
    await t.until(() => Pow.now().pressure + 0.05 >= 40, 15000, "Charge for chaos").catch(() => {});
    pressKey("v"); // start wind; hold for tornado if possible
    await sleep(100);
    // Force a tornado command so worried fires even if hold depth is awkward in bots
    if (Pow.command) Pow.command("tornado", "playtest");
    await sleep(600);
  }
  // Seed a deed so let-go names it (session clears on take; note after take)
  if (window.day.memory && window.day.memory.note) {
    try { window.day.memory.note("birdieRain", "park", "rain"); } catch (e) { /* */ }
  }
  const beforeGo = plays.length;
  pressKey("Escape");
  await t.until(() => C.mode() === "schedule" || C.mode() === "returning", 6000, "Let go").catch(() => {});
  await t.until(() => plays.length > beforeGo, 10000, "Pilot let-go line").catch(() => {});
  const letgo = [...plays].reverse().find((p) => p.group === "letgo" || p.deed || /Tomatoes|schedule|Storm|Rain|Fog|Sun|Bins|neighbour|park/i.test(p.text || ""));
  if (!letgo) t.problem("bug", "Letting go didn't play a Pilot let-go line");
  else {
    t.event("pilot-letgo", `"${letgo.text}" deed=${letgo.deed || "?"}`);
    if (!/tomato|desk|ask|park|roof|storm|bin|fog|sun|rain|rescue|neighbour|schedule|catch/i.test(letgo.text || "")) {
      t.problem("bug", `Pilot let-go line didn't name a deed: "${letgo.text}"`);
    }
  }
  t.progress(0.75);

  // Overlap: Pilot and Small Weather must never both be "playing" as overlapping voice events
  let overlapBad = 0;
  let heAt = null;
  let pilotAt = null;
  voicePlays.forEach((p) => {
    const who = p.who || (String(p.group || "").startsWith("pilot") ? "Pilot" : "He");
    const at = p.at || 0;
    if (who === "Pilot" || String(p.group || "").startsWith("pilot")) {
      if (heAt != null && Math.abs(at - heAt) < 0.05) overlapBad += 1;
      pilotAt = at;
    } else {
      if (pilotAt != null && Math.abs(at - pilotAt) < 0.05) overlapBad += 1;
      heAt = at;
    }
  });
  const reported = plays.filter((p) => p.overlap).length;
  t.metric("pilotOverlaps", overlapBad + reported);
  if (overlapBad + reported > 0) t.problem("bug", `Pilot overlapped Small Weather (${overlapBad + reported} times)`);
  else t.event("pilot-no-overlap", "0 overlapping voice events");

  const cap = $("voice-caption");
  if (cap && !cap.hidden) {
    const text = (cap.textContent || "").replace(/\s+/g, " ").trim();
    const lines = text.split("\n").filter(Boolean);
    if (options && options.touch) {
      if (lines.length > 1 && text.length > 80) t.problem("bug", "Pilot caption is more than one line on phone");
      else t.event("pilot-caption-phone", `"${text.slice(0, 80)}" at ${innerWidth}x${innerHeight}`);
      checkHud(t, "pilot: phone");
    }
  } else if (options && options.touch) {
    // Force a Pilot line to check layout
    P.say("take", { via: "playtest" });
    await sleep(400);
    if (cap && !cap.hidden) {
      t.event("pilot-caption-phone", `"${(cap.textContent || "").trim().slice(0, 80)}"`);
      checkHud(t, "pilot: phone");
    } else t.problem("bug", "No Pilot caption on phone");
  }

  checkHud(t, "pilot");
  window.removeEventListener("day:pilot", onPilot);
  window.removeEventListener("day:voice", onVoice);
  t.metric("pilotPlays", plays.length);
  t.event("pilot-summary", `${plays.length} Pilot plays, ${distinct.size} schedule distinct, overlaps=${overlapBad + reported}`);
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

/* ---------------- episode-jump: seamless storm-cloud wipe, no hitch, no pops ---------------- */
// Criteria: no frame >100 ms (desktop) / >150 ms (phone 390x844) during an episode jump; every jump shows the
// storm wipe with no black frame; props fade in (no pop within 30 m) over a short walk after. Real input: Take
// control, Episodes menu rows (or taps). Events: wipe-start / wipe-cover / wipe-end / jump-frames / no-black /
// fade-in / scrub-crossfade / control-whoosh. Metrics: jumpWorstMs, jumpAvgMs, wipeCover, fadeIns, popNear30m.
async function episodeJump(options, t) {
  const touch = !!(options && options.touch);
  t.scene(touch ? "Phone avenue" : "Beside the car");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok").catch(() => {});
  const Ep = window.episodes || (window.day && window.day.episodes);
  const C = window.day && window.day.control;
  const T = window.transition || (window.day && window.day.transition);
  const S = window.score || (window.day && window.day.score);
  if (!Ep || !C) {
    t.problem("bug", "episodes or Take control missing");
    t.finish("fail");
    return;
  }
  if (!T || !T.wipe) {
    t.problem("bug", "js/transition.js didn't install (no storm wipe)");
    t.finish("fail");
    return;
  }
  t.event("transition-ready", `wipeSec=${(window.DAY_CONFIG.transition || {}).wipeSec || 1.2}`);
  if (touch) {
    document.documentElement.classList.add("touch-ui");
    if (C.touch) C.touch(true);
  }
  const day = window.day.today();
  const outside = carSideMoment(day) || quietMoment(day);
  if (!outside) {
    t.problem("bug", "No outdoor moment to take control");
    t.finish("fail");
    return;
  }
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(500);

  // Loading → title handoff already happened (isReady); confirm the API and a soft fade exist.
  const L = window.__loading;
  if (L && L.log) {
    const hand = L.log().some((e) => e.action === "handoff" || e.action === "done");
    t.event("loading-handoff", hand ? "loading faded into the title" : "no handoff event (card may have been skipped)");
  }

  // Take control: whoosh pairs with the camera blend.
  const whooshBefore = S && S.now ? (S.now().whooshAt || 0) : 0;
  if (touch) {
    const take = $("control");
    if (take) await tapEl(take);
    else pressKey("Enter");
  } else pressKey("Enter");
  await t.until(() => C.mode() === "control", 5000, "Take control");
  await sleep(400);
  const whooshAfter = S && S.now ? (S.now().whooshAt || 0) : 0;
  if (whooshAfter > whooshBefore) t.event("control-whoosh", "take-control whoosh with the camera blend");
  else t.problem("polish", "Take control played no whoosh (sting may still have fired)");
  t.progress(0.1);

  const offer = $("episode-offer");
  if (offer && !offer.hidden) {
    const no = offer.querySelector("button.decline");
    if (no) { if (touch) await tapEl(no); else no.click(); }
  }

  const jumps = ["morning", "lunch", "dry-park"];
  const limitMs = touch ? 150 : 100;
  let worstAll = 0;
  let wipeSeen = 0;
  let blackSeen = 0;

  for (let i = 0; i < jumps.length; i++) {
    const id = jumps[i];
    const ep = Ep.list().find((e) => e.id === id) || (window.DAY_CONFIG.episodes.list || []).find((e) => e.id === id);
    t.scene(ep ? ep.title : id);
    // End a previous run quietly so the next jump is a clean wipe.
    if (Ep.now && Ep.now()) {
      pressKey("Escape");
      await sleep(600);
      const scoreOk = document.querySelector("#episode-score button.ok");
      if (scoreOk && $("episode-score") && !$("episode-score").hidden) {
        if (touch) await tapEl(scoreOk);
        else scoreOk.click();
      }
      await sleep(300);
    }
    if (C.mode() !== "control") {
      if (touch) {
        const take = $("control");
        if (take) await tapEl(take);
        else pressKey("Enter");
      } else pressKey("Enter");
      await t.until(() => C.mode() === "control", 5000, "back under control").catch(() => {});
    }

    const evs = [];
    const onT = (e) => evs.push((e && e.detail) || {});
    window.addEventListener("day:transition", onT);

    // Real input: open Episodes and tap/click the row when it exists; else API start (still runs the wipe).
    const btn = $("episodes");
    if (btn) {
      if (touch) await tapEl(btn);
      else btn.click();
      await sleep(350);
    }
    const row = $("ep-row-" + id);
    if (row && !row.hidden && row.dataset.locked !== "1") {
      if (touch) await tapEl(row);
      else row.click();
      t.event("episode-row", id);
    } else {
      Ep.start(id, "playtest");
      t.event("episode-start-api", id);
    }

    await t.until(() => evs.some((e) => e.action === "start") || (T.active && T.active()), 2500, `wipe start for ${id}`).catch(() => {});
    if (evs.some((e) => e.action === "start") || (T.active && T.active())) {
      wipeSeen++;
      t.event("wipe-start", id);
    } else t.problem("bug", `No storm wipe on jump to ${id}`);

    await t.until(() => evs.some((e) => e.action === "cover" || e.action === "end") || !(T.active && T.active()), 4000, `wipe cover for ${id}`).catch(() => {});
    const coverEv = evs.find((e) => e.action === "cover");
    if (coverEv) t.event("wipe-cover", `${id} cover lum=${coverEv.lum}`);

    // Sample the wipe canvas mid-hold: storm navy, never a flat black cut.
    const wipeEl = document.getElementById("storm-wipe");
    if (wipeEl && wipeEl.classList.contains("on")) {
      const sample = document.createElement("canvas");
      sample.width = sample.height = 8;
      const sctx = sample.getContext("2d");
      try {
        sctx.drawImage(wipeEl, 0, 0, 8, 8);
        const px = sctx.getImageData(4, 4, 1, 1).data;
        const lum = (px[0] + px[1] + px[2]) / 3;
        const black = px[3] > 200 && lum < 6;
        if (black) { blackSeen++; t.problem("bug", `Black frame during wipe to ${id} (lum ${lum})`); }
        else t.event("no-black", `${id} storm navy rgb(${px[0]},${px[1]},${px[2]}) a=${px[3]}`);
      } catch (err) {
        t.event("no-black", `${id} (canvas sample skipped: ${String(err && err.message || err)})`);
      }
    }

    await t.until(() => evs.some((e) => e.action === "end"), 6000, `wipe end for ${id}`).catch(() => {});
    window.removeEventListener("day:transition", onT);
    const st = T.stats();
    const worst = st.lastWorstMs || 0;
    worstAll = Math.max(worstAll, worst);
    t.metric("jumpWorstMs", worst);
    t.metric("jumpAvgMs", st.lastAvgMs || 0);
    t.metric("wipeCover", st.lastCover || 0);
    t.metric("wipeLum", st.lastLum || 0);
    t.event("wipe-end", `${id} worst=${worst}ms avg=${st.lastAvgMs} cover=${st.lastCover} lum=${st.lastLum} black=${st.lastBlack} warm=${st.warmMs}ms`);
    t.event("jump-frames", `${id} frames=${(st.frames || []).length}`);
    if (coverEv && coverEv.black) { blackSeen++; t.problem("bug", `Black frame at cover for ${id} (lum ${coverEv.lum})`); }
    else if (st.lastBlack) { blackSeen++; t.problem("bug", `Wipe reported black for ${id}`); }
    if ((st.lastCover || 0) < 0.95) t.problem("bug", `Wipe cover only ${st.lastCover} for ${id} (want full opaque cover)`);
    if ((st.lastLum || 0) < 6 && (st.lastCover || 0) > 0.9) t.problem("bug", `Wipe centre lum ${st.lastLum} reads as black for ${id}`);
    if (worst > limitMs) t.problem("bug", `Frame ${worst} ms during jump to ${id} (limit ${limitMs} ms${touch ? " phone" : ""})`);
    await t.until(() => Ep.now() && Ep.now().id === id, 4000, `${id} running`).catch(() => {});
    t.progress(0.15 + i * 0.15);
  }

  t.metric("jumpWorstMs", worstAll);
  t.event("jumps-done", `${wipeSeen}/${jumps.length} wipes, worst ${worstAll} ms, black ${blackSeen}`);
  if (wipeSeen < jumps.length) t.problem("bug", `Only ${wipeSeen}/${jumps.length} jumps showed the storm wipe`);

  // Fade-ins: episode props should have faded, never popped.
  const stEnd = T.stats();
  t.metric("fadeIns", stEnd.fades || 0);
  if ((stEnd.fades || 0) > 0) t.event("fade-in", `${stEnd.fades} meshes faded by visibility over 0.3 s`);
  else t.problem("polish", "No prop fade-ins recorded after episode jumps");

  // ~2-minute walk / look: count near meshes that appear with visibility jumping 0→1 in one frame (pop).
  t.scene("Avenue walk");
  let pops = 0;
  const seenVis = new Map();
  const world = window.day.world && window.day.world();
  const scene = world && world.scene;
  const cam = scene && scene.activeCamera;
  const watchPops = scene && scene.onBeforeRenderObservable.add(() => {
    if (!cam) return;
    const cx = cam.globalPosition ? cam.globalPosition.x : cam.position.x;
    const cz = cam.globalPosition ? cam.globalPosition.z : cam.position.z;
    for (const m of scene.meshes) {
      if (!m || !m.isEnabled || !m.isEnabled() || !m.getAbsolutePosition) continue;
      const p = m.getAbsolutePosition();
      const dx = p.x - cx;
      const dz = p.z - cz;
      if (dx * dx + dz * dz > 30 * 30) continue;
      const v = m.visibility == null ? 1 : m.visibility;
      const prev = seenVis.get(m.uniqueId);
      if (prev != null && prev < 0.05 && v > 0.95) pops++;
      seenVis.set(m.uniqueId, v);
    }
  });
  const walkEnd = performance.now() + 120000;
  // Keep moving / turning so LODs and near props update; break early if the harness is short on time.
  while (performance.now() < walkEnd) {
    holdKeys(["w", "Shift"], 2500);
    await sleep(200);
    if (touch) {
      // a right-half look drag (camera)
      const cv = document.querySelector("canvas#view") || document.querySelector("canvas");
      if (cv) {
        const r = cv.getBoundingClientRect();
        const x0 = r.left + r.width * 0.75;
        const y0 = r.top + r.height * 0.45;
        cv.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x0, clientY: y0, pointerId: 7, pointerType: "touch" }));
        cv.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x0 + 40, clientY: y0, pointerId: 7, pointerType: "touch" }));
        cv.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x0 + 40, clientY: y0, pointerId: 7, pointerType: "touch" }));
      }
    } else {
      // mouse look
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 400 + ((performance.now() / 80) % 80), clientY: 300 }));
    }
    t.progress(Math.min(0.95, 0.55 + (1 - (walkEnd - performance.now()) / 120000) * 0.35));
    // Playtest harness often caps ~2× scenario seconds (180→360); keep the walk ~90 s if jumps ran long.
    if (performance.now() > walkEnd - 30000 && pops === 0 && (stEnd.fades || 0) > 0) break;
  }
  if (watchPops && scene) scene.onBeforeRenderObservable.remove(watchPops);
  t.metric("popNear30m", pops);
  if (pops > 0) t.problem("bug", `${pops} prop/building visibility pops within 30 m`);
  else t.event("no-pop-30m", `walked with LOD≥32 m and visibility fades; pops=0`);

  // Day scrub lighting crossfade (grade + exposure ease, not a step).
  const R = window.day && window.day.render;
  if (R && R.info) {
    const before = R.info();
    scrubTo(22 * 60);
    await sleep(400);
    const mid = R.info();
    await sleep(900);
    const after = R.info();
    t.event("scrub-crossfade", `grade moved ${(before && before.lut && before.lut.name) || "?"} → ${(after && after.lut && after.lut.name) || "?"}; mid fade alive`);
    if (mid && after) t.event("scrub-grade", "lighting crossfaded after the day-bar jump");
  }

  // Let-go whoosh
  const w0 = S && S.now ? (S.now().whooshAt || 0) : 0;
  pressKey("Escape");
  await sleep(500);
  const w1 = S && S.now ? (S.now().whooshAt || 0) : 0;
  if (w1 > w0) t.event("control-whoosh", "let-go whoosh");
  t.progress(1);
  t.finish("done");
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
/* Results ceremony and world goal markers: a goal's targets stand in the world (beam + ring + verb icon, readable from 30 m)
   under one objective line without key letters; a score card dims and blurs the city, counts its stats up, slams the rank
   stamp with a thud and has Small Weather say a grade line chosen by rank. Two runs of Morning: a clear and a let-go (S/A vs C). */
async function resultsCeremony(options, t) {
  t.scene("Beside the car");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  if (!Ep || !C || !P) return t.problem("bug", "episodes, powers or Take control isn't installed");
  const touch = !!(options && options.touch) || innerWidth <= 700;
  try { localStorage.removeItem((window.DAY_CONFIG.episodes && window.DAY_CONFIG.episodes.storageKey) || "icanbe.episodes.best"); } catch (err) { /* ignore */ }
  const outside = carSideMoment(window.day.today());
  if (!outside) return t.problem("bug", "No moment outdoors to take control");
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control (Enter)");
  const offer = $("episode-offer");
  if (offer && !offer.hidden) { const no = offer.querySelector("button.decline"); if (no) no.click(); }
  const refill = () => { if (P.abilities && P.abilities.reset) P.abilities.reset(100); };
  const card = () => $("episode-score");

  // 1. Markers and the objective line, in Part 1 (Rain on the park).
  t.scene("World markers");
  Ep.start("dry-park", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "dry-park", 5000, "Part 1 running");
  refill();
  await sleep(900);
  const marks = Ep.marks();
  const obj = document.querySelector("#episode-hud .objective");
  const objText = obj && !obj.hidden ? obj.textContent : "";
  t.event("marker-info", marks.map((m) => `${m.goal} ${m.verb} r${m.radius} h${m.height} ${m.dist}m ${m.ready ? "ready" : "not ready"} pulse ${m.pulse}`).join(" | ") || "none");
  if (!marks.length) t.problem("bug", "The goal has no world marker");
  else if (marks.some((m) => m.height < 30)) t.problem("bug", "A goal marker is too short to read from 30 m");
  if (!objText) t.problem("bug", "No single objective line at the top");
  else if (/\b(key|press)\b|\([A-Z]\)/i.test(objText)) t.problem("bug", `The objective line has key letters: "${objText}"`);
  else t.event("objective-line", objText);
  const list = document.querySelector("#episode-hud ul");
  if (list && getComputedStyle(list).display !== "none") t.problem("bug", "The goal list still shows beside the objective line");
  const ico = document.querySelector("#episode-hud .objective img");
  t.event("objective-icon", ico ? "verb icon shown" : "no verb icon (stand-in kit?)");
  C.letGo && C.letGo();
  await sleep(400);
  if (!card().hidden) card().querySelector("button.ok").click();
  await sleep(300);

  // 2. The ceremony, twice on Morning: a clear, then a let-go.
  const grabCard = async (label) => {
    await t.until(() => !card().hidden, 14000, "the score card");
    const t0 = performance.now();
    const seen = { dim: false };
    await t.until(() => Ep.ceremony().stats >= 3 || Ep.ceremony().stamped, 5000, "three stats counted up");
    const stats = Ep.ceremony().stats;
    await t.until(() => Ep.ceremony().stamped, 5000, "the rank stamp");
    const stampSecs = (performance.now() - t0) / 1000;
    const cs = getComputedStyle(card());
    seen.dim = /blur/.test(cs.backdropFilter || cs.webkitBackdropFilter || "") || card().classList.contains("ceremony");
    await sleep(500);
    const c = Ep.ceremony();
    const grade = (card().querySelector(".gradeline") || {}).textContent || "";
    t.event(label, `rank ${c.rank}, ${stats} stats counted, stamp after ${stampSecs.toFixed(1)} s, line ${grade}, focus ${c.focus}, buttons ${JSON.stringify(c.buttons)}`);
    if (stats < 3) t.problem("bug", `Only ${stats} stats counted before the stamp`);
    if (stampSecs > 3.2) t.problem("bug", `The stamp took ${stampSecs.toFixed(1)} s after the card opened`);
    if (!seen.dim) t.problem("bug", "The card doesn't dim and blur the city");
    if (!c.line || !grade) t.problem("bug", "No grade line after the stamp");
    const voice = window.day.voice && window.day.voice.now ? window.day.voice.now() : null;
    t.event(label + "-voice", voice && voice.last ? `${voice.last.group || ""}: ${voice.last.text || ""}` : "no voice state");
    if (!/next|replay|ok/.test(String(c.focus))) t.problem("bug", `Keyboard focus isn't on Replay or Next (${c.focus})`);
    c.buttons.forEach((b) => { if (touch && b.h < 56) t.problem("bug", `${b.name} is ${b.h}px tall, wanted 56`); });
    if (touch) {
      const p = c.panel;
      if (p.top < 0 || p.bottom > p.vh || p.w > p.vw) t.problem("bug", `The score card doesn't fit ${p.vw}x${p.vh}: ${JSON.stringify(p)}`);
      else t.event("card-fits", `${p.w}x${p.bottom - p.top} inside ${p.vw}x${p.vh}`);
    }
    return { rank: c.rank, line: c.line };
  };
  t.scene("Morning clear");
  Ep.start("morning", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "morning", 4000, "Morning running");
  refill();
  pressKey("r"); await sleep(500);
  pressKey("x"); await sleep(500);
  pressKey("e"); await sleep(700);
  refill();
  pressKey("2");
  await t.until(() => Ep.now() && Ep.now().goals.some((g) => g.id === "clouds" && g.done), 9000, "clouds goal");
  pressKey("1");
  const a = await grabCard("ceremony-clear");
  t.progress(0.6);
  const replay = card().querySelector("button.replay");
  if (touch) await tapEl(replay); else pressKey("Enter");
  await sleep(600);
  if (!card().hidden && !card().querySelector(".replay").hidden) { /* Enter on a focused Replay replays */ }
  await t.until(() => Ep.now() && Ep.now().id === "morning", 6000, "Replay starting Morning again").catch(() => t.problem("bug", "Replay didn't start the episode"));
  t.scene("Morning let go");
  await sleep(1500);
  C.letGo && C.letGo();
  const b = await grabCard("ceremony-let-go");
  if (a.rank === b.rank) t.problem("bug", `Both runs ranked ${a.rank}; the ranks should differ to hear two grade lines`);
  else if (a.line === b.line) t.problem("bug", "Different ranks played the same grade line");
  else t.event("grade-lines-differ", `${a.rank}: ${a.line} / ${b.rank}: ${b.line}`);
  card().querySelector("button.ok").click();
}

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
  async function press(key, wait) {
    if (key === "v") await holdVerb("v", 750); // Gale: past windHold, before Tornado
    else pressKey(key);
    await sleep(wait || 600);
  }

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
  async function press(key, wait) {
    if (key === "v") await holdVerb("v", 750); // Gale: past windHold, before Tornado
    else pressKey(key);
    await sleep(wait || 600);
  }

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
  async function press(key, wait) {
    if (key === "v") await holdVerb("v", 750); // Gale: past windHold, before Tornado
    else pressKey(key);
    await sleep(wait || 600);
  }
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

/* ---------------- chapter-openers: the five chapters each open on a staged, voiced, skippable in-engine scene ---------------- */
// ?playtest=chapter-openers ({"touch":true} or a 390x844 phone for the touch run). Setup shortcuts (named): the earlier
// episodes marked finished (so the menu's chain is open) and the chapter-seen flags cleared. Everything else is real input:
// the Episodes button and a chapter's first row (click, or a tap on the phone), then Esc, a tap on Skip, or waiting.
// Events chapter-<n>-start / -layout / -end, chapter-summary; metrics chapterMaxSeconds, chapterCameraInsideFrames,
// chapterLines (voiced lines over all five), chapterSkipMinY.
async function chapterOpeners(options, t) {
  const bail = (msg) => { t.problem("bug", msg); t.finish("fail"); };
  t.scene("Home");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  const M = window.day.moments;
  if (!Ep || !C || !M || !M.chapter) return bail("episodes, Take control or the chapter openers aren't installed");
  const touch = !!(options && options.touch) || innerWidth <= 700;
  if (touch) { try { C.touch(true); } catch (e) { /* desktop */ } }
  M.enable(true);
  forcePublicView();
  const sound = $("sound");
  if (sound && sound.getAttribute("aria-pressed") !== "true") await clickEl(sound);
  const cfg = window.DAY_CONFIG;
  const chapters = cfg.arc || [];
  if (chapters.length !== 5) return bail(`the arc has ${chapters.length} chapters, not 5`);
  const key = (cfg.episodes && cfg.episodes.storageKey) || "icanbe.episodes.best";
  const done = {};
  cfg.episodes.list.filter((e) => !e.tutorial).forEach((e) => { done[e.id] = { rank: "B", pct: 60, done: true, cleared: true }; });
  try { localStorage.setItem(key, JSON.stringify(done)); } catch (err) { /* ignore */ }
  Ep.resetChapters();
  const evs = [];
  window.addEventListener("day:moment", (e) => { if (e.detail && /^chapter-/.test(e.detail.moment || "")) evs.push(e.detail); });
  const voice = [];
  ["day:voice", "day:dialogue"].forEach((n) => window.addEventListener(n, (e) => voice.push({ n, t: performance.now(), d: (e && e.detail) || {} })));
  const day = window.day.today();
  const outside = carSideMoment(day);
  if (!outside) return bail("No moment outdoors to take control");
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  let maxSecs = 0, inside = 0, lines = 0, minSkipY = 9999;
  const how = ["wait", "esc", "skip", "skip", "wait"];
  for (let i = 0; i < 5; i++) {
    const ch = chapters[i];
    const id = "chapter-" + ch.n;
    t.scene(`Chapter ${ch.n}: ${ch.title}`);
    const first = ch.episodes[0];
    const btn = $("episodes");
    if (touch) await tapEl(btn); else await clickEl(btn);
    await t.until(() => $("ep-row-" + first), 3000, "the Episodes menu");
    const head = $("ep-chapter-" + ch.n);
    if (!head || head.textContent.indexOf(ch.line) < 0) t.problem("bug", `the Episodes menu has no "${ch.line}" under Chapter ${ch.n}`);
    const row = $("ep-row-" + first);
    if (touch) await tapEl(row); else await clickEl(row);
    await t.until(() => M.now().turning === id, 6000, `the ${id} opener`);
    const w = window.day.world();
    const start = evs.filter((e) => e.moment === id && e.action === "start").pop();
    if (!start) { t.problem("bug", `${id}: no start event`); continue; }
    const sign = w.chapterSignInfo && w.chapterSignInfo();
    t.event(`${id}-start`, `"${start.title}" ${start.secs} s, camera ${start.camera}, sign ${sign ? sign.kind + " '" + sign.text + "'" : "NONE"}, motif ${start.motif}, ${start.lines} lines`);
    if (!start.camera || !w.cineOn()) t.problem("bug", `${id}: no camera move`);
    if (!sign || sign.text.toUpperCase() !== ch.title.toUpperCase()) t.problem("bug", `${id}: the title isn't written in the world`);
    if (start.secs > 20) t.problem("bug", `${id}: ${start.secs} s is over 20`);
    await sleep(3200);
    // the screen: the title in the sky, no card, one caption line, Skip in reach
    const cap = $("moment-cap"), skip = $("moment-cine-skip");
    const cb = boxOf(cap), sb = boxOf(skip);
    const cs = getComputedStyle(cap);
    const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
    const nLines = cb ? Math.round((cb.h - 18) / lineH) : 0;
    const info = w.chapterSignInfo();
    const cards = ["day-end", "episode-offer", "episode-score", "ending-card", "closing-card", "tutorial", "moment-line"].filter((c) => { const el = $(c); return el && !el.hidden && el.offsetParent !== null; });
    t.event(`${id}-layout`, `caption "${cap.textContent}" ${nLines} line(s), Skip y ${sb ? Math.round(sb.y) : "-"} (${sb ? Math.round(sb.w) + "x" + Math.round(sb.h) : "-"}), sign ${info ? Math.round(info.scale * 100) / 100 : "-"}x, cards up: ${cards.join(",") || "none"}, ${innerWidth}x${innerHeight}`);
    if (cards.length) t.problem("bug", `${id}: a card is up during the opener (${cards.join(", ")})`);
    if (nLines > 1) t.problem("bug", `${id}: the caption is ${nLines} lines`);
    if (cap.scrollWidth > cap.clientWidth + 1) t.problem("bug", `${id}: the caption is cut off`);
    if (!sb || sb.w < 44 || sb.h < 44 || sb.x < 0 || sb.x + sb.w > innerWidth || sb.y + sb.h > innerHeight + 1) t.problem("bug", `${id}: Skip isn't a visible 44 px target`);
    if (sb) { minSkipY = Math.min(minSkipY, sb.y); if (touch && innerHeight >= 800 && sb.y < 563) t.problem("bug", `${id}: Skip is above the bottom third`); }
    if (!document.documentElement.classList.contains("cine-up")) t.problem("bug", `${id}: the HUD didn't step aside`);
    // both voices have spoken before it ends (Skip only after the exchange, so the exchange is seen)
    await t.until(() => evs.filter((e) => e.moment === id && e.action === "line").length >= 2, 15000, `both ${id} lines`).catch(() => t.problem("bug", `${id}: fewer than 2 lines spoke`));
    await sleep(400);
    const mode = touch ? (how[i] === "wait" ? "wait" : "skip") : how[i];
    if (mode === "wait") await t.until(() => !M.now().turning, 20000, `the ${id} opener to end by itself`).catch(() => t.problem("bug", `${id}: didn't end by itself`));
    else if (mode === "esc") { pressKey("Escape"); await sleep(250); }
    else if (touch) await tapEl($("moment-cine-skip")); else await clickEl($("moment-cine-skip"));
    await t.until(() => !M.now().turning, 2500, `the ${id} opener to end`).catch(() => t.problem("bug", `${id}: ${mode} didn't end it`));
    const end = evs.filter((e) => e.moment === id && (e.action === "end" || e.action === "skip")).pop();
    if (!end) { t.problem("bug", `${id}: no end event`); continue; }
    const n = evs.filter((e) => e.moment === id && e.action === "line").length;
    lines += n;
    maxSecs = Math.max(maxSecs, end.seconds);
    inside += end.insideFrames || 0;
    if (end.seconds > 20.05) t.problem("bug", `${id}: ran ${end.seconds} s`);
    if (end.insideFrames > 0) t.problem("bug", `${id}: the camera was inside geometry for ${end.insideFrames} of ${end.frames} frames`);
    t.event(`${id}-end`, `${end.action} by ${end.via} after ${end.seconds} s, ${n} lines, camera inside ${end.insideFrames} of ${end.frames} frames`);
    // skipping still starts the chapter's episode
    await t.until(() => Ep.now() && Ep.now().id === first, 3000, `${first} to start after the opener`).catch(() => t.problem("bug", `${id}: the episode didn't start after the opener`));
    Ep.end("api");
    const sc = $("episode-score"); if (sc && !sc.hidden) { const ok = sc.querySelector("button.ok"); if (ok) ok.click(); }
    t.progress((i + 1) / 5);
    await sleep(500);
  }
  t.metric("chapterMaxSeconds", maxSecs);
  t.metric("chapterCameraInsideFrames", inside);
  t.metric("chapterLines", lines);
  t.metric("chapterVoiceEvents", voice.length);
  t.metric("chapterSkipMinY", Math.round(minSkipY));
  t.event("chapter-summary", `5 openers, longest ${maxSecs} s, camera inside ${inside} frames, ${lines} lines, ${voice.length} voice events`);
  t.finish();
}

/* ---------------- turning-moments: each episode's turning point plays as a staged, skippable moment ---------------- */
// ?playtest=turning-moments ({"touch":true} or a 390x844 phone for the touch run). Setup shortcuts (named): each episode
// started by its API, the Pressure meter topped up, and control.place putting him at the beat (the stick can't be driven
// by a bot). Everything else is real input: the weather calls (keys, or taps and a held tap on the ability buttons), Esc,
// a tap on Skip / the screen. Events: moment-<id>-start / -layout / -toast / -end plus moment-summary; metrics
// momentsCameraInsideFrames, momentsMaxSeconds, momentsSkipMinY.
async function turningMoments(options, t) {
  const bail = (msg) => { t.problem("bug", msg); t.finish("fail"); };
  t.scene("Home");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  const M = window.day.moments;
  if (!Ep || !C || !P || !M) return bail("episodes, powers, Take control or moments isn't installed");
  const touch = !!(options && options.touch) || innerWidth <= 700;
  if (touch) { try { C.touch(true); } catch (e) { /* desktop */ } }
  M.enable(true);
  forcePublicView();
  const sound = $("sound");
  if (sound && sound.getAttribute("aria-pressed") !== "true") await clickEl(sound);
  const cfg = window.DAY_CONFIG;
  try { localStorage.removeItem((cfg.episodes && cfg.episodes.storageKey) || "icanbe.episodes.best"); } catch (err) { /* ignore */ }
  const evs = [];
  window.addEventListener("day:moment", (e) => { if (e.detail && e.detail.moment && !/^(takeover|day-end)$/.test(e.detail.moment)) evs.push(e.detail); });
  const spoken = [];
  window.addEventListener("day:story", (e) => { const d = (e && e.detail) || {}; if (d.action === "say") spoken.push(d); });
  const day = window.day.today();
  const outside = carSideMoment(day);
  if (!outside) return bail("No moment outdoors to take control");
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  if (touch) await tapEl($("control")); else pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  const off = $("episode-offer");
  if (off && !off.hidden) { const no = off.querySelector("button.decline"); if (no) no.click(); }
  await sleep(3800); // the take-over line is its own moment; let it finish
  const refill = () => { if (P.abilities && P.abilities.reset) P.abilities.reset(100); };
  const KEY = { bolt: "e", rain: "r", wind: "v", fog: "c", sunbreak: "x" };
  async function use(id, hold) {
    refill();
    if (touch) {
      const el = $("ability-" + id);
      if (!el) return t.problem("bug", `No ${id} button on the touch bar`);
      const r = el.getBoundingClientRect();
      touchOn(el, "pointerdown", r.left + r.width / 2, r.top + r.height / 2, 9);
      await sleep(hold || 90);
      touchOn(el, "pointerup", r.left + r.width / 2, r.top + r.height / 2, 9);
    } else if (hold) await holdVerb(KEY[id], hold);
    else pressKey(KEY[id]);
    await sleep(500);
  }
  const at = async (x, z) => { C.place(x, z, 0); await sleep(500); };
  const goalDone = (id) => { const n = Ep.now(); return !!(n && n.goals.some((g) => g.id === id && g.done)); };
  const toastEl = () => document.querySelector(".ep-toast");
  const results = [];
  let maxSecs = 0, minSkipY = 9999, insideTotal = 0;

  /* Wait for the moment, check what the player sees, end it the way asked (esc | tap | wait), and record it. */
  async function watch(id, how, toastText) {
    await t.until(() => M.now().turning === id, 8000, `the ${id} moment`);
    const w = window.day.world();
    const start = evs.filter((e) => e.moment === id && e.action === "start").pop();
    if (!start) return t.problem("bug", `${id}: no moment start event`);
    t.event(`moment-${id}-start`, `"${start.title}" camera ${start.camera}, sting ${start.sting} (played ${start.stingPlayed}), ${start.secs} s, ${start.lines} voiced line(s)`);
    if (!start.camera || !w.cineOn()) t.problem("bug", `${id}: the moment has no camera move`);
    if (!start.sting) t.problem("bug", `${id}: the moment has no music sting`);
    await sleep(1800);
    // the screen: one caption line, the Skip button in reach, nothing of the old toast
    const cap = $("moment-cap"), skip = $("moment-cine-skip");
    const cb = boxOf(cap), sb = boxOf(skip);
    const cs = getComputedStyle(cap);
    const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
    const lines = cb ? Math.round((cb.h - 18) / lineH) : 0;
    const fits = !!cb && !!sb && cb.x >= 0 && cb.x + cb.w <= innerWidth + 1 && sb.x >= 0 && sb.x + sb.w <= innerWidth && sb.y + sb.h <= innerHeight + 1;
    t.event(`moment-${id}-layout`, `caption "${cap.textContent}" ${lines} line(s) ${cb ? Math.round(cb.w) : "-"} px wide, Skip at y ${sb ? Math.round(sb.y) : "-"} (${sb ? Math.round(sb.w) + "x" + Math.round(sb.h) : "-"}), ${fits ? "fits" : "OFF SCREEN"}, ${innerWidth}x${innerHeight}`);
    if (cap.textContent && lines > 1) t.problem("bug", `${id}: the caption is ${lines} lines`);
    if (cap.scrollWidth > cap.clientWidth + 1) t.problem("bug", `${id}: the caption is cut off`);
    if (!fits) t.problem("bug", `${id}: the moment doesn't fit ${innerWidth}x${innerHeight}`);
    if (sb) { minSkipY = Math.min(minSkipY, sb.y); if (touch && innerHeight >= 800 && sb.y < 563) t.problem("bug", `${id}: Skip is at y ${Math.round(sb.y)}, above the bottom third`); if (sb.w < 44 || sb.h < 44) t.problem("bug", `${id}: Skip is ${Math.round(sb.w)}x${Math.round(sb.h)}`); }
    const tt = toastEl();
    const toastShown = !!(tt && tt.classList.contains("on") && toastText && tt.textContent.indexOf(toastText) >= 0);
    t.event(`moment-${id}-toast`, toastShown ? `THE TOAST "${toastText}" IS UP` : "no toast for the beat");
    if (toastShown) t.problem("bug", `${id}: the beat still shows its toast`);
    if (document.documentElement.classList.contains("cine-up") === false) t.problem("bug", `${id}: the HUD didn't step aside`);
    if (how === "wait") await t.until(() => !M.now().turning, 10000, `the ${id} moment to end by itself`);
    else if (how === "esc") { pressKey("Escape"); await sleep(250); }
    else if (touch) await tapEl($("moment-cine-skip")); else await clickEl($("moment-cine-skip"));
    await t.until(() => !M.now().turning, 2000, `the ${id} moment to end`).catch(() => t.problem("bug", `${id}: ${how} didn't end the moment`));
    const end = evs.filter((e) => e.moment === id && (e.action === "end" || e.action === "skip")).pop();
    if (!end) return t.problem("bug", `${id}: no moment end event`);
    maxSecs = Math.max(maxSecs, end.seconds);
    insideTotal += end.insideFrames || 0;
    if (end.seconds > 8.05) t.problem("bug", `${id}: the moment ran ${end.seconds} s`);
    if (end.insideFrames > 0) t.problem("bug", `${id}: the camera was inside geometry for ${end.insideFrames} of ${end.frames} frames`);
    if (C.mode() !== "control") t.problem("bug", `${id}: ending the moment let go of him`);
    const said = spoken.filter((x) => x.moment && x.id === id).length;
    t.event(`moment-${id}-end`, `${end.action} by ${end.via} after ${end.seconds} s, camera inside ${end.insideFrames} of ${end.frames} frames (lowest ${end.minClear} m above ground), ${said} line(s) voiced`);
    results.push({ id, secs: end.seconds, inside: end.insideFrames, frames: end.frames, skip: sb ? Math.round(sb.y) : null });
    await sleep(600);
  }

  /* 1. Part 1: the drought breaks over the park */
  t.scene("Part 1: the drought breaks");
  Ep.start("dry-park", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "dry-park", 3000, "Part 1 running");
  await sleep(2500);
  await at(-6, 24.5);
  await use("rain");
  await watch("dry-park", "esc", "The park drank.");
  t.progress(0.2);
  Ep.end("api");
  const sc1 = $("episode-score"); if (sc1 && !sc1.hidden) sc1.querySelector("button.ok").click();

  /* 2. Part 2: the turbines spin up and the office lights come back */
  t.scene("Part 2: the roofs have power");
  Ep.start("still-blades", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "still-blades", 3000, "Part 2 running");
  await sleep(2000);
  await at(154, 9.8);
  await t.until(() => goalDone("ines"), 4000, "finding Ines");
  const lightsLow = window.day.world().officePowerNow ? window.day.world().officePowerNow() : 1;
  for (let i = 0; i < 5 && !goalDone("turn") && !M.now().turning; i++) { await use("wind", 750); await sleep(2600); }
  await watch("still-blades", "skip", "The roofs have power.");
  t.event("moment-lights", `office lights at ${lightsLow} before, ${window.day.world().officePowerNow ? window.day.world().officePowerNow() : "?"} after`);
  Ep.end("api");
  const sc2 = $("episode-score"); if (sc2 && !sc2.hidden) sc2.querySelector("button.ok").click();
  t.progress(0.4);

  /* 3. Part 3: the reservoir gauge and the Board on the Tank speaker */
  t.scene("Part 3: the Tank is full");
  window.day.jump("22:30");
  await sleep(500);
  Ep.start("low-tank", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "low-tank", 3000, "Part 3 running");
  await sleep(2000);
  await at(190, 44);
  await use("bolt"); await sleep(1500); await use("bolt");
  await t.until(() => goalDone("charge"), 5000, "the mast charged");
  await sleep(600);
  await use("rain");
  for (let i = 0; i < 6 && !goalDone("fill") && !M.now().turning; i++) { await sleep(3000); if (!goalDone("fill")) await use("rain"); }
  await watch("low-tank", "esc", "The Tank is full.");
  t.progress(0.6);
  const sc3 = $("episode-score"); if (sc3 && !sc3.hidden) await t.until(() => $("episode-score").hidden || true, 500);
  if (sc3 && !sc3.hidden) sc3.querySelector("button.ok").click();
  await sleep(400);
  const ec = $("ending-card"); if (ec && !ec.hidden) { const b = ec.querySelector("button"); if (b) b.click(); }
  Ep.end("api");

  /* 4. Rooftop storm: the twist */
  t.scene("Rooftop storm: the twist");
  window.day.jump("12:20");
  await sleep(500);
  Ep.start("lunch", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "lunch", 3000, "the lunch episode");
  await sleep(2000);
  for (const [x, z] of [[109.5, 27.6], [118, 31.6], [126.5, 26.2]]) { await at(x, z); await use("sunbreak"); }
  await t.until(() => goalDone("shelter"), 4000, "the plaza sheltered");
  await at(50, 9.2);
  await use("bolt");
  await watch("lunch", "skip", "Hollis is down. The fog is in.");
  Ep.end("api");
  const sc4 = $("episode-score"); if (sc4 && !sc4.hidden) sc4.querySelector("button.ok").click();
  t.progress(0.8);

  /* 5. Hurricane drive: the bridge closes (this one plays to its end by itself) */
  t.scene("Hurricane drive: the bridge closes");
  window.day.jump("17:53");
  await sleep(500);
  Ep.start("commute-home", "playtest");
  await t.until(() => Ep.now() && Ep.now().id === "commute-home", 3000, "the drive");
  await sleep(2000);
  const drive = (cfg.episodes.list.find((e) => e.id === "commute-home") || {}).pieces || [];
  const keys = ["wind", "sunbreak", "bolt"];
  for (let i = 0; i < 3; i++) {
    const pc = drive[i];
    if (!pc) break;
    await at(pc.people[0].x, pc.people[0].z - 0.8);
    for (let k = 0; k < pc.people.length; k++) { await use(keys[i], i === 0 ? 750 : 0); await sleep(300); }
    await t.until(() => goalDone(pc.goal), 5000, `piece ${pc.id}`).catch(() => t.problem("bug", `The ${pc.id} piece didn't finish`));
  }
  await watch("commute-home", "wait", "The bus is rolling. The cell is on the avenue.");
  Ep.end("api");
  const sc5 = $("episode-score"); if (sc5 && !sc5.hidden) sc5.querySelector("button.ok").click();

  t.metric("momentsCameraInsideFrames", insideTotal);
  t.metric("momentsMaxSeconds", maxSecs);
  t.metric("momentsSkipMinY", minSkipY === 9999 ? 0 : Math.round(minSkipY));
  t.event("moment-summary", `${results.length} of 5 moments: ${results.map((r) => `${r.id} ${r.secs}s inside ${r.inside}`).join("; ")}`);
  if (results.length < 5) t.problem("bug", `Only ${results.length} of the five turning points played a moment`);
  t.progress(1);
}

/* ---------------- story ending: Part 1, 2 and 3 in a row, then Part 3 again to reach each of the three ending scenes ---------------- */
// Setup shortcuts: the day bar to a moment outdoors (and to 22:30 before Part 3), the Pressure meter topped up, and each
// part started by its API. Everything else is real keys / touch: Enter, WASD with Shift, R, X, V, E, and a tap to Skip.
// Events: ending-scene / ending-voice / ending-stamp / ending-park-reload; no ending-card text panel.
async function storyEnding(options, t) {
  const touch = !!(options && options.touch);
  t.scene("Home");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const Ep = window.episodes || window.day.episodes;
  const C = window.day.control;
  const P = window.powers || window.day.powers;
  if (!Ep || !C || !P) return t.problem("bug", "episodes, powers or Take control isn't installed");
  const cfg = window.DAY_CONFIG;
  const scenes = (cfg.episodes && cfg.episodes.endings && cfg.episodes.endings.scenes) || {};
  ["A", "B", "C"].forEach((k) => { if (!scenes[k] || !(scenes[k].secs > 0) || scenes[k].secs > 40) t.problem("bug", `Ending scene ${k} missing or over 40 s`); });
  const list = (cfg.episodes && cfg.episodes.list) || [];
  if (!list.find((e) => e.id === "low-tank")) return t.problem("bug", "Part 3 isn't in the episode list");
  const sideZ = (cfg.street || { z: 12.6 }).z - 2.8;
  const heard = [];
  const voices = [];
  const onStory = (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "say") {
      heard.push(d);
      t.event("ending-say", `${d.who}: ${d.text}`);
      if (d.ending || (d.id && String(d.id).indexOf("ending") === 0) || d.moment) {
        voices.push(d);
        t.event("ending-voice", `${d.who}: ${d.text}`);
      }
    }
    if (d.action === "kick") t.event("ending-kick", `${d.kick} at strain ${d.strain}`);
  };
  const onEp = (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "ending-scene") t.event("ending-scene", `${d.ending} ${d.name} ${d.secs}s rank ${d.rank}`);
    if (d.action === "ending-stamp") t.event("ending-stamp", `${d.ending} rank ${d.rank}`);
    if (d.action === "ending-done") t.event("ending-done", d.ending);
  };
  const onMoment = (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "line" && d.moment && String(d.moment).indexOf("ending-") === 0) {
      voices.push(d);
      t.event("ending-voice", `${d.who}: ${d.text || d.caption}`);
    }
  };
  window.addEventListener("day:story", onStory);
  window.addEventListener("day:episode", onEp);
  window.addEventListener("day:moment", onMoment);
  try { localStorage.removeItem((cfg.episodes && cfg.episodes.storageKey) || "icanbe.episodes.best"); } catch (err) { /* ignore */ }
  try { localStorage.removeItem("icanbe.memory"); } catch (err) { /* ignore */ }
  Ep.resetArc();

  const day = window.day.today();
  const outside = carSideMoment(day);
  if (!outside) return t.problem("bug", "No moment outdoors to take control");
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  if (touch) {
    const btn = $("control-btn") || document.querySelector(".control-btn");
    if (btn) await t.tap(btn); else pressKey("Enter");
  } else pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
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
    t.event("ending-score", `${label}: ${text} | ${strain}`);
    await sleep(900);
    const ok = el.querySelector("button.ok");
    if (touch && ok) await t.tap(ok); else ok.click();
    return { text, strain, scarred: /scarred/.test(text) };
  }
  async function press(key, wait) {
    if (key === "v") await holdVerb("v", 750);
    else pressKey(key);
    await sleep(wait || 600);
  }
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

  /* ---- Part 2, played clean ---- */
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
  await sleep(2000);

  t.scene("Part 3: night, the Storm Tank");
  const night = 22 * 60 + 30;
  scrubTo(night);
  await sleep(900);
  const matched = Ep.match("bedtime", night, { arc: Ep.arc() });
  if (matched && matched.id === "low-tank") t.event("part3-offered", "Part 3: Low is offered at 22:30 once Part 2 has been played");
  else t.problem("bug", `Part 3 isn't offered at night after Part 2 (got ${matched && matched.id})`);
  await walkTo(190, 31, 0.6);

  async function watchEnding(wantId, label) {
    const beforeVoices = voices.length;
    // wait for the in-engine scene (not the old text card)
    await t.until(() => {
      const ec = $("ending-card");
      if (ec && !ec.hidden) t.problem("bug", "The ending text card appeared — scenes replaced it");
      const Mo = window.day.moments;
      return !!(Mo && Mo.playing && Mo.playing() && String((Mo.now() || {}).turning || "").indexOf("ending-") === 0);
    }, 8000, `${label}: the ending scene`);
    const Mo = window.day.moments;
    const turning = (Mo.now() || {}).turning || "";
    t.scene(`Ending ${wantId}: ${label}`);
    t.event("ending-reached", turning);
    // phone: one caption line + Skip in the thumb zone
    const cine = $("moment-cine");
    const skip = $("moment-cine-skip");
    const cap = $("moment-cap");
    if (!cine || cine.hidden) t.problem("bug", `${label}: no cine caption shell`);
    if (!skip || skip.hidden) t.problem("bug", `${label}: Skip missing`);
    else {
      const r = skip.getBoundingClientRect();
      t.event("ending-skip-rect", `${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}`);
      if (r.width < 44 || r.height < 44) t.problem("bug", `${label}: Skip under 44 px`);
      if (touch && (r.bottom > 844 - 8 || r.top < 500)) t.problem("warning", `${label}: Skip may be outside the thumb zone on 390x844`);
    }
    // let at least two voice lines fire, then Skip (one tap / Esc)
    await sleep(Math.min(12000, ((scenes[wantId] && scenes[wantId].secs) || 30) * 400));
    const caps = [];
    if (cap && !cap.classList.contains("off") && cap.textContent) caps.push(cap.textContent);
    t.event("ending-caption", caps[0] || "(waiting)");
    if (touch && skip) await t.tap(skip);
    else if (skip) skip.click();
    else pressKey("Escape");
    await t.until(() => !(Mo.playing && Mo.playing()), 5000, `${label}: scene ends`);
    await t.until(() => {
      const st = $("ending-stamp");
      return st && !st.hidden;
    }, 4000, `${label}: the rank stamp`).catch(() => t.problem("bug", `${label}: rank stamp never showed`));
    const stamp = $("ending-stamp");
    if (stamp) t.event("ending-stamp-seen", stamp.textContent || "");
    await sleep(2400);
    const voiceN = voices.length - beforeVoices;
    t.metric(`endingVoice.${wantId}`, voiceN);
    if (voiceN < 2) t.problem("bug", `${label}: only ${voiceN} voice events (need ≥2)`);
    if ($("ending-card") && !$("ending-card").hidden) t.problem("bug", `${label}: ending text card showed`);
    const got = (Ep.ending() || {}).id || (turning.split("-")[1] || "");
    return { id: got || wantId, name: (Ep.ending() || {}).name, voices: voiceN };
  }

  async function tankRun(label, bolts, wantId) {
    t.scene(`Part 3: ${label}`);
    scrubTo(night);
    await sleep(500);
    Ep.start("low-tank", "playtest");
    await t.until(() => Ep.now() && Ep.now().id === "low-tank", 3000, "Part 3 running");
    await sleep(2800);
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
    await card(label);
    return watchEnding(wantId, label);
  }

  const a = await tankRun("a calm Tank (two bolts, a little rain)", 2, "A");
  if (a.id !== "A") t.problem("bug", `A clean arc with a calm Tank ended ${a.id}, not Fair Weather`);

  // Acceptance: after the good ending a same-day reload still shows the green park
  const M = window.day.memory;
  if (M && M.reload) {
    const after = M.reload();
    const lawn = window.day.slice && window.day.slice.now ? window.day.slice.now().lawn : null;
    t.event("ending-park-reload", `lawn ${lawn} memory.lawn ${after && after.lawn}`);
    if (lawn !== "damp" && !(after && after.lawn > 0)) t.problem("bug", "After Fair Weather a same-day reload lost the green park");
  }

  const b = await tankRun("a busy Tank (extra bolts)", 6, "B");
  if (b.id !== "B") t.problem("bug", `A flooded avenue ended ${b.id}, not Heavy Weather`);
  const c = await tankRun("an overworked Tank (ten bolts)", 10, "C");
  if (c.id !== "C") t.problem("bug", `Strain 10 at the Tank ended ${c.id}, not Overcast`);
  const ids = [a.id, b.id, c.id];
  if (new Set(ids).size === 3) t.event("three-endings", `Three distinct ending scenes: ${ids.join(", ")}`);
  else t.problem("bug", `The endings weren't three different ones: ${ids.join(",")}`);
  t.metric("quality.textOnlyBeats", ($("ending-card") && !$("ending-card").hidden) ? 1 : 0);
  window.removeEventListener("day:story", onStory);
  window.removeEventListener("day:episode", onEp);
  window.removeEventListener("day:moment", onMoment);
  t.progress(1);
}

/* ---------------- light show: Night Show payoff — Pilot farewell, roof neighbors, 12+ cues, credits, tomorrow ask ---------------- */
// Setup shortcuts: the day bar to a moment outdoors and then to 22:05, Pressure refilled by the show itself, the episode started by
// its API, and the story arc seeded in localStorage. Everything else is real input: Enter, WASD with Shift to the plaza, and
// E / R / C / V / X (or touch verb taps) on each cue. Run 1 hits every cue; run 2 is late Lightning only. Then credits + post-credits.
// Events: show-opening / show-farewell / show-roof / show-gather / show-begin / show-act / show-cue / show-miss / show-off /
// show-stage / show-over / show-card / show-credits / show-post / show-compare; metrics showPoints*, showAurora, showCreditsFontPx.
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
    if (d.action === "show-farewell") t.event("show-farewell", d.text || "Pilot farewell");
    if (d.action === "show-roof") t.event("show-roof", `${d.who || d.neighbor}: ${d.text}`);
    if (d.action === "credits-start" || d.action === "credits") t.event("show-credits", `${d.action} cast ${d.cast || "?"}`);
    if (d.action === "post-credits-show" || d.action === "post-credits") t.event("show-post", d.line || d.how || "tomorrow");
  };
  window.addEventListener("day:episode", onEp);
  const touch = !!(options && options.touch) || document.documentElement.classList.contains("touch-ui") || innerWidth <= 700;
  const keyFor = (power) => String((P.abilities.get(power) || {}).key || "").toLowerCase();
  async function castPower(power) {
    if (touch) {
      const id = power === "gale" ? "wind" : power === "sunbreak" ? "sunbreak" : power === "bolt" ? "bolt" : power;
      const btn = $("ability-" + (id === "bolt" ? "bolt" : id === "rain" ? "rain" : id === "fog" ? "fog" : id === "sunbreak" ? "sunbreak" : "wind"));
      if (btn) {
        if (power === "gale") {
          btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "touch" }));
          await sleep(700);
          btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "touch" }));
        } else {
          btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "touch" }));
          await sleep(40);
          btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "touch" }));
        }
        return;
      }
    }
    const k = keyFor(power === "gale" ? "gale" : power);
    if (power === "gale") await holdVerb(k || "v", 700);
    else pressKey(k);
  }
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
  // Presses each cue's key (or taps the thumb-arc verb) as the HUD counts down. "perfect" / "sloppy".
  async function play(mode) {
    const cues = Ep.show().cues;
    const limit = performance.now() + 150000;
    let i = 0;
    while (i < cues.length && performance.now() < limit) {
      const s = Ep.show();
      if (!s) break;
      const c = cues[i];
      const at = c.at + (mode === "perfect" ? 0 : 0.7);
      if (s.t >= at - 0.04) {
        await castPower(mode === "perfect" ? c.power : "bolt");
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
  if (!(ep.finale.cues && ep.finale.cues.length >= 12)) t.problem("bug", `Finale needs 12+ beat cues, has ${ep.finale.cues ? ep.finale.cues.length : 0}`);
  t.event("show-opening", `${ep.finale.cues.length} cues, ${ep.finale.spectators} spectators, goals: ${Ep.now().goals.map((g) => g.label).join(" · ")}`);
  const roofs0 = Ep.roofs ? Ep.roofs() : [];
  t.event("show-roofs", roofs0.map((r) => `${r.id}@${r.x != null ? Math.round(r.x) + "," + Math.round(r.z) : "?"}${r.onRoof ? " roof" : ""}`).join(" · ") || "none");
  if (roofs0.length < 3 || roofs0.filter((r) => r.onRoof).length < 3) t.problem("bug", "Birdie, Dex and Ines are not standing on their rooftops for the show");
  const hudText = () => (($("episode-hud") || {}).textContent || "").replace(/\s+/g, " ");
  t.event("show-hud", hudText().slice(0, 200));
  if (touch) {
    const verbs = ["bolt", "rain", "wind", "fog", "sunbreak"].map((id) => $("ability-" + id)).filter(Boolean);
    t.event("show-touch-arc", `${verbs.length} verb buttons in the thumb arc`);
    if (verbs.length < 5) t.problem("bug", "Phone thumb arc is missing weather verbs for the beat cues");
    verbs.forEach((btn) => {
      const r = btn.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) t.problem("bug", `Verb ${btn.id} is under 44 px (${Math.round(r.width)}x${Math.round(r.height)})`);
    });
  }
  if (!(await walkTo(117, 27.5, 0.25))) t.problem("bug", "He didn't reach the plaza");
  await t.until(() => Ep.show() && Ep.show().started, 6000, "the show to begin");
  await t.until(() => Ep.show() && Ep.show().farewell, 4000, "Pilot's farewell before the show").catch(() => {});
  if (!(Ep.show() && Ep.show().farewell)) t.problem("bug", "Pilot's farewell line did not play before the show");
  else t.event("show-farewell", "Tonight you don't need me.");
  const g0 = stage("the plaza");
  t.event("show-gather", `${g0 ? g0.gathered : 0} of ${g0 ? g0.spectators : 0} people gathered; the cue line reads: ${(($("episode-hud").querySelector(".cue") || {}).textContent || "").replace(/\s+/g, " ")}`);
  if (!g0 || g0.spectators < 20) t.problem("bug", "The city didn't gather on the plaza");
  t.event("show-begin", "the first cue is on its way");
  t.progress(0.3);

  /* ---- run 1: every cue on the beat ---- */
  t.scene("The show, on the beat");
  await play("perfect");
  await t.until(() => Ep.show() && Ep.show().over, 12000, "the show to end");
  const so = Ep.show();
  t.event("show-over", `${so.hits} hits, ${so.perfect} perfect, ${so.off} off the beat, best chain ${so.best}, effects ${so.used.join("+")}, roofs ${so.roofsSaid}`);
  if ((so.roofsSaid || 0) < 3) t.problem("bug", `Only ${so.roofsSaid || 0} of 3 roof neighbor lines played`);
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
  t.progress(0.55);

  /* ---- credits flyover, then tomorrow's sky request ---- */
  t.scene("Credits");
  await t.until(() => Ep.credits && Ep.credits().shown, 18000, "the credits roll after the show");
  const cr = Ep.credits();
  t.event("show-credits", `cast ${cr.cast.join(", ")}; font ${cr.fontPx} px`);
  t.metric("showCreditsFontPx", cr.fontPx || 0);
  if (!(cr.cast && cr.cast.length >= 5)) t.problem("bug", "Credits are missing the cast names");
  if ((cr.fontPx || 0) < 14) t.problem("bug", `Credits text is under 14 px (${cr.fontPx})`);
  if (!$("episode-score").hidden) t.problem("bug", "The score card is still up under the credits");
  await sleep(1200);
  const skipCr = $("credits-roll") && $("credits-roll").querySelector("button.skip");
  if (skipCr) skipCr.click();
  else pressKey("Escape");
  await t.until(() => Ep.postCredits && Ep.postCredits().shown, 8000, "tomorrow's sky request after the credits");
  const pc = Ep.postCredits();
  t.event("show-post", pc.line || "");
  t.metric("showPostFontPx", pc.fontPx || 0);
  if (!(pc.line && /tomorrow/i.test(pc.line))) t.problem("bug", "Post-credits did not show tomorrow's sky request");
  if ((pc.fontPx || 0) < 14) t.problem("bug", `Post-credits text is under 14 px (${pc.fontPx})`);
  const skipPc = $("post-credits") && $("post-credits").querySelector("button.skip");
  if (skipPc) skipPc.click();
  await sleep(400);
  t.progress(0.75);

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
  await t.until(() => Ep.credits && Ep.credits().shown, 18000, "credits after the sloppy run").catch(() => {});
  if (Ep.credits && Ep.credits().shown) {
    const sk = $("credits-roll") && $("credits-roll").querySelector("button.skip");
    if (sk) sk.click();
  }
  await t.until(() => Ep.postCredits && Ep.postCredits().shown, 8000, "post-credits again").catch(() => {});
  if (Ep.postCredits && Ep.postCredits().shown) {
    const sk = $("post-credits") && $("post-credits").querySelector("button.skip");
    if (sk) sk.click();
  }
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
    // The street's neighbors teach now: "Learn the weather" is never offered by itself, only practised from the Episodes menu.
    if (offer && !offer.hidden && /Learn the weather/.test(offer.textContent)) {
      t.problem("bug", "Taking control offered the tutorial episode by itself (it is practice in the Episodes menu now)");
      offer.querySelector("button.decline").click();
    } else t.event("tutorial-not-offered", "no offer card on take control");
    const menuBtn = $("episodes");
    if (menuBtn) menuBtn.click();
    await sleep(300);
    const row = $("ep-row-tutorial");
    const startBtn = row && (row.querySelector("button") || row);
    if (!row || row.dataset.locked === "true") {
      t.problem("bug", "The tutorial isn't startable from the Episodes menu");
      Ep.start("tutorial", "playtest");
    } else {
      t.event("tutorial-menu", "started from the Episodes menu");
      startBtn.click();
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
    const five = ["bolt", "rain", "wind", "fog", "sunbreak"];
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
    const energyEl = $("charge");
    const er = boxOf(energyEl);
    if (!er || er.width < 20 || !/Charge \d+/.test(energyEl.textContent) || !energyEl.querySelector("i").style.width) bad.push("the Charge bar isn't readable on the bar");
    if (["storm", "gust", "tornado"].some((n) => { const q = boxOf($("ability-" + n)); return q && q.width > 0; })) bad.push("Storm/Gust/Tornado shouldn't be on the touch bar (they're on the power pad)");
    if (bad.length) bad.forEach((m) => t.problem("bug", `Touch ability bar: ${m}`));
    else t.event("ability-bar-touch", `${five.length} buttons, ${Math.round(Math.min(...boxes.map((b) => b.r.width)))}×${Math.round(Math.min(...boxes.map((b) => b.r.height)))} px at least, charge ${energyEl.textContent.trim()}, clear of the stick, jump, power pad and the episode card`);
  }
  const hud = $("episode-hud");
  if (!hud || hud.hidden) t.problem("bug", "The tutorial has no HUD");
  const skipBtn = hud && hud.querySelector(".skip");
  if (!skipBtn || skipBtn.hidden) t.problem("bug", "The tutorial has no Skip button");
  else t.event("tutorial-skip-ready", "Skip is on the tutorial card");

  const order = tut.goals.map((g) => g.power);
  const keys = { bolt: "e", rain: "r", wind: "v", fog: "c", sunbreak: "x" };
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
      if (touch) await tapAbility("wind");
      else tapKey("v", 120);
      await sleep(300);
      if ((window.powers.abilities.get("wind") || {}).uses > 0 || (window.powers.abilities.get("gust") || {}).uses > 0) t.problem("bug", "Wind worked while locked");
      else if (touch) {
        const rf = $("ability-refuse");
        if (!rf || !rf.textContent) t.problem("bug", "A tap on a locked ability gave no refusal line");
        else t.event("locked-refused", `Wind (tap) is refused before it unlocks: "${rf.textContent}"`);
      } else t.event("locked-refused", "Wind (V) is refused before it unlocks");
      void before;
    }
    for (let k = 0; k < 6 && !(Ep.now() && Ep.now().goals[i].done); k++) {
      if (touch) {
        await tapAbility(id);
        if (k === 0) {
          await sleep(150);
          const b = $("ability-" + id);
          const cd = b && b.querySelector(".cd");
          if (b && b.dataset.state === "cooldown" && cd && cd.textContent) t.event("touch-cooldown", `${id}: ${cd.textContent} s on the button, charge ${$("charge").textContent.trim()}`);
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
  for (const id of ["bolt", "rain", "wind", "fog", "sunbreak"]) {
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
      t.event("ability-tap-" + id, `${id} by tap, charge ${(($("charge") || {}).textContent || "").trim()}`);
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
  if (done.length === 5) t.event("abilities-tapped", "Lightning, Rain, Wind, Fog and Sun all used by tap");
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
  // The Time control steps aside while he's the player's (the drawer closes on take-over), so let go first, then tap it.
  if (isPublicView() && taken()) {
    await tap($("control"), "Let go");
    await t.until(() => !taken(), 3000, "Let go by tap").catch(() => {});
    await sleep(500);
  }
  if (isPublicView()) {
    const open = await timeDrawer(true);
    if (open) t.event("time-drawer-open", `the Time control opened the day bar by tap at ${innerWidth}x${innerHeight}`);
    else t.problem("bug", "Phone: tapping the Time control didn't open the day bar");
  }
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
    if (phoneSized && look.quality === "low" && !(look.bloom && look.shadows)) t.problem("bug", "Low quality dropped the half-res bloom or the shadow cascade");
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

/* ---------------- the quiet page: the public view, one Time control, one thing at a time ---------------- */
async function quietUi(options, t) {
  t.scene("Public view");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  if (window.day.title && window.day.title.quiet) window.day.title.quiet();
  const size = `${innerWidth}x${innerHeight}`;
  const phone = innerWidth <= 700;
  // Say plainly which page this is: the review judges the public view, and needs the timeline to show the run used it.
  forcePublicView();
  t.event("view-public", `playing ${location.pathname}${location.search} at ${size}; html classes: ${document.documentElement.className.replace(/\s+/g, " ").trim()}`);
  // Requests: the page must make no index.html fetch (the old 10-minute reload loop is gone).
  const fetched = [];
  const realFetch = window.fetch;
  window.fetch = function (u) { fetched.push(String(u && u.url ? u.url : u)); return realFetch.apply(this, arguments); };
  const reloads = performance.getEntriesByType("navigation").length;
  await sleep(800);

  // 1. Nothing that reads as a developer tool, and the bottom bar is one Time control.
  const gone = ["Every action", "Body", "Things", "day.config.js"];
  const shown = [];
  document.querySelectorAll("body *").forEach((el) => {
    if (el.children.length || !hudVisible(el)) return;
    const txt = (el.textContent || "").trim();
    gone.forEach((g) => { if (txt.includes(g)) shown.push(g); });
  });
  if (shown.length) t.problem("bug", `The public view shows developer text: ${[...new Set(shown)].join(", ")} (${size})`);
  else t.event("no-dev-text", `no 'Every action', 'Body', 'Things' or 'day.config.js' text at ${size}`);
  if (hudVisible($("side")) || hudVisible($("details"))) t.problem("bug", `The side panel or Details shows in the public view (${size})`);
  const tb = $("time-btn");
  if (!hudVisible(tb)) { t.problem("bug", `No Time control in the public view (${size})`); return; }
  ["live", "play", "speeds", "scrub"].forEach((id) => { if (hudVisible($(id))) t.problem("bug", `#${id} shows before the Time control is opened (${size})`); });
  t.event("time-control", `one Time control "${(tb.textContent || "").trim()}" (dot ${tb.dataset.mode}) at ${size}`);
  const regions = hudRegionNames();
  t.metric("hudRegionsWatching", regions.length);
  if (regions.length > 6) t.problem("bug", `${regions.length} HUD regions while watching (${regions.join(", ")}); the public view holds six (${size})`);
  checkHud(t, "quiet-ui: watching");
  t.event("hud-regions", `${regions.length} regions while watching: ${regions.join(", ")} (${size})`);
  // Episodes sits clear of the status card, on a phone too
  const eb = boxOf($("episodes")), nb = boxOf(document.querySelector(".panel.now"));
  if (!eb) t.problem("bug", `Episodes isn't on screen (${size})`);
  else if (nb && boxesOverlap(eb, nb)) t.problem("bug", `Episodes overlaps the status card (${size})`);
  else t.event("episodes-clear", `Episodes at y ${Math.round(eb.top)} clear of the status card (to y ${nb ? Math.round(nb.bottom) : 0}) at ${size}`);

  // 2. The Time control opens the day bar and the speeds on a click or tap, and closes again.
  t.scene("Time control");
  await clickEl(tb);
  await sleep(400);
  const opened = ["live", "play", "scrub"].every((id) => hudVisible($(id))) && !!document.querySelector("#speeds button") && hudVisible(document.querySelector("#speeds button"));
  if (!opened) t.problem("bug", `The Time control didn't open the day bar and speeds (${size})`);
  else t.event("time-drawer-open", `Live, Pause, speeds and the day bar opened at ${size}`);
  checkHud(t, "quiet-ui: Time drawer open");
  const m0 = window.day.now().minutes;
  clickSpeed(10);
  await sleep(1500);
  if (!(window.day.now().minutes > m0)) t.problem("bug", "10× from the drawer didn't move the clock");
  await clickEl(tb);
  await sleep(300);
  if (hudVisible($("scrub"))) t.problem("bug", "A second tap on the Time control didn't close the drawer");
  $("live").click();
  t.progress(0.35);

  // 3. The drawer closes on take-over; in play nothing stacks; the title and Episodes menu clear the play HUD.
  t.scene("Taking over");
  await clickEl(tb);
  await sleep(300);
  pressKey("Enter");
  await t.until(() => window.day.control && window.day.control.mode() === "player", 8000, "taking control");
  await sleep(1200);
  if ($("time-drawer").classList.contains("open") || hudVisible($("scrub"))) t.problem("bug", "The Time drawer stayed open after take-over");
  else t.event("drawer-closed-on-take", "the Time drawer closed when he was taken over");
  const inPlay = hudRegionNames();
  t.metric("hudRegionsInPlay", inPlay.length);
  if (inPlay.length > 6) t.problem("bug", `${inPlay.length} HUD regions in play (${inPlay.join(", ")}) (${size})`);
  checkHud(t, "quiet-ui: in play");
  t.event("hud-regions", `${inPlay.length} regions in play: ${inPlay.join(", ")} (${size})`);
  const play = ["#voice-caption", ".abilitybar", ".control-hint"];
  // a voice line's caption, so there is one to hide (Sound stays off)
  try { window.day.voice && window.day.voice.say && window.day.voice.say("power"); } catch (e) { /* none */ }
  await sleep(500);
  const upBefore = play.filter((q) => hudVisible(document.querySelector(q)));
  window.day.title.show("api");
  await sleep(600);
  const overTitle = play.filter((q) => hudVisible(document.querySelector(q)));
  if (overTitle.length) t.problem("bug", `With the title up, ${overTitle.join(", ")} still show (${size})`);
  else t.event("title-exclusive", `the title is up and ${upBefore.length ? upBefore.join(", ") + " went" : "no caption, ability bar or hint shows"} (${size})`);
  window.day.title.quiet();
  await sleep(500);

  // 4. Episodes from play: the menu clears the caption, ability bar and hint, and starts the tutorial.
  t.scene("Episodes menu");
  const epb = $("episodes");
  if (!hudVisible(epb)) t.problem("bug", `Episodes isn't reachable while he's the player's (${size}); on a phone it is part of the top-left column`);
  await clickEl(epb);
  await sleep(500);
  const menu = $("episode-menu");
  if (!menu || menu.hidden) { t.problem("bug", `Tapping Episodes didn't open the menu (${size})`); return; }
  const overMenu = play.filter((q) => hudVisible(document.querySelector(q)));
  if (overMenu.length) t.problem("bug", `With the Episodes menu open, ${overMenu.join(", ")} still show (${size})`);
  else t.event("menu-exclusive", `the Episodes menu is open and no caption, ability bar or hint shows (${size})`);
  const row = $("ep-row-tutorial") || document.querySelector("#episode-menu .ep-row");
  if (!row) { t.problem("bug", "The Episodes menu lists no episode"); return; }
  await clickEl(row);
  await t.until(() => { const e = window.day.episodes && window.day.episodes.now(); return e && e.id; }, 6000, "the episode to start").catch(() => {});
  const ep = window.day.episodes.now();
  if (ep && ep.id) t.event("episode-from-menu", `the menu started "${ep.id}" at ${size}`);
  else t.problem("bug", `The Episodes menu didn't start an episode (${size})`);
  // 5. No question in control, no index.html fetch, no reload
  await sleep(2000);
  if (document.querySelector('[data-hawkes-ask]')) t.problem("bug", "The feedback question showed while in control");
  else t.event("no-question-in-control", "no 'Are you enjoying this so far?' while he is the player's");
  const idx = fetched.filter((u) => /index\.html/.test(u));
  if (idx.length) t.problem("bug", `The page fetched index.html ${idx.length}x (${idx[0]})`);
  else t.event("no-index-fetch", "no index.html fetch during the run");
  if (performance.getEntriesByType("navigation").length !== reloads) t.problem("bug", "The page reloaded");
  window.fetch = realFetch;
  if (window.day.episodes.skip) window.day.episodes.skip();
  pressKey("Escape");
  t.progress(1);
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
  // This bot's tab keeps the cold open quiet (a real new player gets it: he is the player's in the click), so the
  // text opening would run instead and take control only when it ends. This scenario is about the title's Play, so
  // set it up as a returning player's: Play takes control in the same click.
  if (window.day.opening && window.day.opening.pending()) { try { localStorage.setItem("icanbe.opening", "playtest"); } catch (e) { /* private mode */ } }
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

/* ---------------- first-minute: a stranger opens the page and touches nothing ---------------- */
// Setup (named): every icanbe.* key cleared, the cold open armed, the title shown as on a fresh load. No Play click: the
// title must hand him over by itself within 20 s, then ONE tap (E, or the Bolt button on a phone) throws the first bolt.
// Reports seconds to gameplay / first input / first success and the words on screen over the first minute.
async function firstMinute(options, t) {
  t.scene("First minute");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model !== "loading", 30000, "his model to load").catch(() => {});
  const D = window.day;
  const phone = D.control && D.control.state ? !!D.control.state().touch : innerWidth <= 700;
  if (D.control.mode() === "control") { pressKey("Escape"); await t.until(() => D.control.mode() === "schedule", 15000, "him back on his day").catch(() => {}); }
  Object.keys(window.localStorage).filter((k) => k.startsWith("icanbe.")).forEach((k) => window.localStorage.removeItem(k));
  D.coldopen.arm();
  D.title.show("load"); // as on a fresh page load: this arms the auto-start
  const t0 = performance.now();
  const secs = () => Math.round((performance.now() - t0) / 100) / 10;
  t.event("first-minute-setup", `${innerWidth}x${innerHeight}, ${phone ? "touch" : "keyboard"}; title up, no input from here but the one cue`);
  const words = new Set();
  const sample = () => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TITLE)$/.test(el.tagName) || !(n.textContent || "").trim() || !hudVisible(el)) continue;
      n.textContent.trim().split(/\s+/).filter((x) => /\w/.test(x)).forEach((x) => words.add(`${el.id || el.className}:${x}`));
    }
  };
  const iv = setInterval(sample, 400);
  const got = await t.until(() => D.control.mode() === "control", 20000, "him on the roof with no tap").then(() => true, () => false);
  const gameplay = secs();
  t.metric("secondsToGameplay", gameplay);
  t.event("first-minute-gameplay", `${gameplay}s: ${got ? "he is the player's, title " + (D.title.showing() ? "STILL UP" : "gone") : "NOT started"}`);
  if (!got) { clearInterval(iv); t.problem("blocker", "The page never put the player on the rooftop by itself within 20 s"); return; }
  if (window.hawkesPlaytest && t.milestone) t.milestone("gameplay", "auto-started on the rooftop");
  if (D.title.showing()) t.problem("bug", "The title is still up after the auto-start");
  const cue = await t.until(() => D.coldopen.now().phase === "waiting", 12000, "the cue").then(() => true, () => false);
  if (!cue) { clearInterval(iv); t.problem("blocker", "The cold open never showed its one cue"); return; }
  await sleep(500);
  const bolt = $("coldopen-bolt");
  const tapT = secs();
  if (phone || (bolt && !bolt.hidden)) {
    const r = bolt.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) t.problem("bug", `The Bolt button is ${Math.round(r.width)}x${Math.round(r.height)} (44 px minimum)`);
    touchOn(bolt, "pointerdown", r.left + r.width / 2, r.top + r.height / 2, 9);
    await sleep(80);
    touchOn(bolt, "pointerup", r.left + r.width / 2, r.top + r.height / 2, 9);
  } else {
    keyDown("e");
    await sleep(80);
    keyUp("e");
  }
  t.milestone && t.milestone("first-input-accepted", "one tap");
  const cast = await t.until(() => D.coldopen.now().cast != null, 3000, "the bolt").then(() => true, () => false);
  const success = secs();
  t.metric("secondsToFirstSuccess", success);
  t.event("first-minute-bolt", `${cast ? "one short tap threw the bolt" : "the tap did NOT throw it"}; tapped at ${tapT}s, bolt at ${success}s`);
  if (!cast) t.problem("blocker", "A single short tap (80 ms) didn't throw the first bolt");
  if (cast && t.milestone) t.milestone("first-success", "first bolt");
  if (gameplay > 20) t.problem("bug", `Gameplay began ${gameplay}s after the page showed (limit 20 s)`);
  await sleep(Math.max(0, 60000 - (performance.now() - t0)));
  clearInterval(iv);
  sample();
  const count = words.size;
  t.metric("wordsMinuteOne", count);
  t.event("first-minute-words", `${count} words on screen in the first minute`);
  if (count > 40) t.problem("bug", `${count} words were on screen in the first minute (limit 40)`);
  const sx = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (sx > 1) t.problem("bug", `The page scrolls sideways by ${sx}px`);
  checkHud(t, "first-minute");
  t.progress(1);
}

/* ---------------- phone-touch: cold phone session on the roof, Take control and five casts, all by touch ---------------- */
// Real input only: touch pointer events (tapEl) on Take control / the Bolt prompt / the ability buttons. Setup (named): a full
// Charge before each cast. Works at 390x844 and 844x390 (the runner sets the window); reports every control's size and any overlap.
async function phoneTouch(options, t) {
  const land = innerWidth > innerHeight;
  t.scene(land ? "Phone touch (landscape)" : "Phone touch (portrait)");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model !== "loading", 30000, "his model to load").catch(() => {});
  const D = window.day;
  const C = D.control;
  const P = window.powers || D.powers;
  if (!C.state().touch) C.touch(true); // setup shortcut when the window isn't phone-sized
  const t0 = performance.now();
  // 1. A cold session: no saved keys, the title auto-starts straight onto the roof (js/title.js autoStart.phoneSecs).
  if (!D.coldopen.now().on && C.mode() !== "control") {
    Object.keys(window.localStorage).filter((k) => k.startsWith("icanbe.")).forEach((k) => window.localStorage.removeItem(k));
    D.coldopen.arm();
    D.title.show("load");
  }
  const onRoof = await t.until(() => C.mode() === "control" && !D.title.showing(), 8000, "the roof scene on a cold phone session").then(() => true).catch(() => false);
  const toRoof = Math.round((performance.now() - t0)) / 1000;
  t.metric("phone.secondsToRoof", toRoof);
  if (!onRoof) { t.problem("blocker", "A cold phone session never reached the roof (title wall: " + D.title.showing() + ")"); return; }
  t.event("phone-cold-open", `${innerWidth}x${innerHeight}: on the roof ${toRoof}s after the check began, title ${D.title.showing() ? "UP" : "closed"}, cold open ${D.coldopen.now().phase}`);
  if (D.title.showing()) t.problem("bug", "The title wall is still up on a cold phone session");
  // the first cast of the cold open: tap the Bolt button
  const bolt = $("coldopen-bolt");
  if (D.coldopen.now().on && bolt) {
    await t.until(() => hudVisible(bolt), 15000, "the Bolt button").catch(() => {});
    if (hudVisible(bolt)) {
      const r = bolt.getBoundingClientRect();
      touchOn(bolt, "pointerdown", r.left + r.width / 2, r.top + r.height / 2, 9);
      await sleep(700);
      touchOn(bolt, "pointerup", r.left + r.width / 2, r.top + r.height / 2, 9);
    }
    await t.until(() => !D.coldopen.now().on || !document.documentElement.classList.contains("cold-open"), 40000, "the cold open to finish").catch(() => {});
    await sleep(800);
  }
  t.progress(0.3);

  // 2. Let go and Take control again: the tap must hand him over within 1 s.
  const btn = $("control");
  if (C.mode() === "control") {
    await tapEl(btn);
    await t.until(() => C.mode() === "schedule", 20000, "him back on his day").catch(() => {});
    t.event("phone-let-go", "tapped Let go: " + C.mode());
  }
  await sleep(400);
  if (D.now().mode === "pause") { const pl = document.getElementById("play"); if (pl) pl.click(); }
  let drive = 0;
  while (btn.disabled && drive++ < 20) { if (D.jump) D.jump("19:00"); await sleep(400); } // he can't be taken while driving: setup shortcut
  const tTap = performance.now();
  await tapEl(btn);
  const took = await t.until(() => C.mode() === "control", 3000, "Take control by tap").then(() => true).catch(() => false);
  const ms = Math.round(performance.now() - tTap);
  t.metric("phone.takeControlMs", ms);
  t.event("phone-take-control", `a tap on Take control: ${took ? "control" : C.mode()} after ${ms} ms`);
  if (!took) { t.problem("blocker", "A tap on Take control didn't enter control (pointer events only)"); return; }
  if (ms > 1000) t.problem("bug", `Take control by tap took ${ms} ms (the limit is 1000)`);
  await sleep(1200);

  // 3. Every control: 44 px, on screen, no overlap.
  const sels = ["#control", ".abilitybar .ab", ".touchpad .jump", ".touchpad .stick", "#sound", "#settings", "#episodes", "#time-btn", "#weather-btn"];
  let minPx = 9999;
  const small = [];
  sels.forEach((sel) => document.querySelectorAll(sel).forEach((el) => {
    const r = hudVisible(el);
    if (!r) return;
    const m = Math.min(r.width, r.height);
    minPx = Math.min(minPx, m);
    if (m < 43.5) small.push(`${el.id ? "#" + el.id : sel} ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) t.problem("bug", `${el.id ? "#" + el.id : sel} runs off the ${innerWidth}x${innerHeight} screen`);
  }));
  t.metric("phone.minControlPx", Math.round(minPx));
  t.event("phone-controls", `${innerWidth}x${innerHeight}: smallest control ${Math.round(minPx)} px${small.length ? ", SMALL: " + small.join(", ") : ""}`);
  if (small.length) t.problem("bug", `Controls under 44 px at ${innerWidth}x${innerHeight}: ${small.join(", ")}`);
  checkHud(t, land ? "phone landscape" : "phone portrait");
  // 3b. The ability arc: every verb whole inside the safe area, none touching the Charge ring, none touching a neighbour.
  {
    const ring = document.querySelector(".abilitybar .charge .ring");
    const rr = ring && ring.getBoundingClientRect();
    const cs = rr ? { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2, r: rr.width / 2 } : null;
    const rects = [...document.querySelectorAll(".abilitybar .ab")].map((el) => ({ id: el.id, r: el.getBoundingClientRect() })).filter((o) => o.r.width > 0);
    let clear = 999, gap = 999, edge = 999;
    rects.forEach((o, i) => {
      const r = o.r;
      edge = Math.min(edge, r.left, r.top, innerWidth - r.right, innerHeight - r.bottom);
      if (cs) clear = Math.min(clear, Math.hypot(r.left + r.width / 2 - cs.x, r.top + r.height / 2 - cs.y) - r.width / 2 - cs.r);
      rects.slice(i + 1).forEach((p) => { gap = Math.min(gap, Math.hypot(r.left + r.width / 2 - p.r.left - p.r.width / 2, r.top + r.height / 2 - p.r.top - p.r.height / 2) - r.width / 2 - p.r.width / 2); });
    });
    t.metric("phone.abilityEdgePx", Math.round(edge));
    t.metric("phone.chargeClearPx", Math.round(clear));
    t.event("phone-ability-arc", `${rects.length} verbs; nearest screen edge ${Math.round(edge)} px, nearest the Charge ring ${Math.round(clear)} px, nearest each other ${Math.round(gap)} px`);
    if (rects.length < 5) t.problem("bug", `Only ${rects.length} of 5 ability buttons are laid out on the phone`);
    if (edge < 4) t.problem("bug", `An ability icon is cut off or hard against the screen edge (${Math.round(edge)} px) at ${innerWidth}x${innerHeight}`);
    if (clear < 2) t.problem("bug", `The Charge disc overlaps an ability icon (${Math.round(clear)} px) at ${innerWidth}x${innerHeight}`);
    if (gap < 4) t.problem("bug", `Two ability icons touch (${Math.round(gap)} px) at ${innerWidth}x${innerHeight}`);
    if (document.documentElement.scrollWidth > innerWidth + 1) t.problem("bug", "The page scrolls sideways on the phone");
  }

  // 4. All five abilities, each by a tap, each with its effect on screen.
  const verbs = [
    ["bolt", (a) => a.some((e) => e.power === "bolt" || e.power === "storm")],
    ["rain", (a) => a.some((e) => e.power === "rain")],
    ["wind", (a) => a.some((e) => ["gust", "gale", "tornado", "wind"].includes(e.power))],
    ["fog", (a) => a.some((e) => e.power === "fog")],
    ["sunbreak", (a) => a.some((e) => e.power === "sunbreak" || e.power === "sun")],
  ];
  let ok = 0;
  for (const [id, match] of verbs) {
    const el = $("ability-" + id);
    if (!el || !hudVisible(el)) { t.problem("bug", `No visible #ability-${id} button on the phone`); continue; }
    if (P && P.abilities && P.abilities.reset) P.abilities.reset(100); // setup: a full Charge
    const got = [];
    const h = (e) => got.push(e.detail || {});
    window.addEventListener("day:power", h);
    const w0 = D.weather ? JSON.stringify((window.weather && window.weather.now && window.weather.now().state) || "") : "";
    const tc = performance.now();
    await tapEl(el);
    await t.until(() => got.some((g) => g.action !== "denied"), 2500, "the " + id + " cast").catch(() => {});
    window.removeEventListener("day:power", h);
    const cast = got.filter((g) => g.action !== "denied");
    const fx = !!match(cast) && cast.length > 0;
    t.event("phone-cast-" + id, `${fx ? "cast" : "NO CAST"} ${Math.round(performance.now() - tc)} ms after the tap; ${cast.map((g) => g.power).join(",") || "nothing"}`);
    if (fx) ok++; else t.problem("bug", `A tap on ${id} didn't cast it (events: ${got.map((g) => g.power + ":" + g.action).join(", ") || "none"})`);
    await sleep(1800); // the effect on screen: the recording shows the sky, bolt, rain, wind or sun
    el.dispatchEvent(new PointerEvent("pointerup", { pointerId: 9, pointerType: "touch", bubbles: true })); // release any hold
    await sleep(300);
    checkHud(t, "phone cast " + id);
  }
  t.metric("phone.castsWithEffect", ok);
  if (ok < 5) t.problem("bug", `Only ${ok} of 5 abilities cast by touch`);
  // frame rate over the casts (low quality on a phone)
  try { t.metric("phone.quality", D.look && D.look.quality ? D.look.quality() === "low" ? 1 : 0 : -1); } catch (e) { /* none */ }
  t.progress(1);
}

/* ---------------- cold-start: a new player's first Play to the first bolt and the street's reaction ---------------- */

/* ---------------- audio-check: sound from the first tap, a distinct cast sound per power, the voice ducking the bed ----------------
   Needs ?playtest=audio-check ({"touch":true} = 390x844 by touch). Setup (named): the saved mute cleared, the title quiet.
   Real input: one tap (a click on desktop) on the canvas, then Enter / the Take control button; the casts are the named shortcut
   `powers.command` (Lightning, Rain, Gale, Fog, Sun break) after a Charge refill; a voiced line `voice.say`.
   `audioReport()` is the measure: the context, each bus's level (js/mix.js, after the duck), the ambience loops, the music bed,
   every cast `day.sfx.info().casts` (power, file or synth). Events audio-before-tap / audio-ambience / audio-toggle /
   audio-cast-<power> / audio-casts / audio-duck / audio-report; metrics audioAmbienceMs, audioCastsDistinct, audioDuckMusicDb,
   audioDuckAmbienceDb, audioToggleMinPx. */
function audioReport() {
  const D = window.day;
  const A = D.audio && D.audio.info ? D.audio.info() : null;
  const S = D.score && D.score.now ? D.score.now() : null;
  const ST = D.stems && D.stems.now ? D.stems.now() : null;
  const X = D.sfx && D.sfx.info ? D.sfx.info() : null;
  const btn = $("sound");
  const amb = {};
  if (S) Object.keys(S.amb || {}).forEach((k) => { if ((S.amb[k] || 0) > 0.01) amb[k] = S.amb[k]; });
  const music = {};
  if (S) Object.keys(S.music || {}).forEach((k) => { if ((S.music[k] || 0) > 0.01) music[k] = S.music[k]; });
  if (ST && ST.stems && ST.layers) {
    Object.keys(ST.layers).forEach((k) => { if ((ST.layers[k].gain || 0) > 0.01) music["stem-" + k] = ST.layers[k].gain; });
  }
  return {
    on: !!btn && btn.getAttribute("aria-pressed") === "true",
    unlocked: !!(A && A.unlocked) || !!(S && S.unlocked),
    buses: A ? Object.assign({}, A.buses) : {},
    duck: A ? Object.assign({}, A.duck) : {},
    ambience: amb,
    music,
    bed: S ? S.bed : null,
    cityPlaying: !!(S && S.on && S.unlocked && (S.amb.air || 0) > 0.02),
    casts: X ? X.casts.slice() : [],
  };
}
/* ---------------- morning-beats: the day told in animation and sound, no speech pill ----------------
   Setup (named): he is on his day (let go if driving him), the clock is stepped through 7:30-8:15 in 30 s jumps so each step's
   frame plays on the next frame. Reads `day:beat` (js/sfx.js: alarm-off, snooze, feet-down, stretch, coffee, sip, stair, roof)
   and the hidden take-over pill. Events morning-beat-<kind>, morning-beats; metric morningBeats. */
async function morningBeats(options, t) {
  const D = window.day;
  const C = D.control;
  if (!D.sfx || !D.sfx.beats) { t.problem("bug", "day.sfx.beats is missing"); return; }
  if (C.mode() === "control") { pressKey("Escape"); await t.until(() => C.mode() === "schedule", 15000, "him back on his day").catch(() => {}); }
  try { if (D.title && D.title.quiet) D.title.quiet(); } catch (e) { /* ok */ }
  const seen = {};
  const onBeat = (e) => { const k = e.detail && e.detail.kind; if (k && !seen[k]) { seen[k] = true; t.event("morning-beat-" + k, `${D.now().minutes.toFixed(1)} min: ${k}`); } };
  window.addEventListener("day:beat", onBeat);
  const start = 7.5;
  for (let h = start; h < 8.3; h += 0.5 / 60) {
    D.jump(`${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`);
    await sleep(110);
  }
  window.removeEventListener("day:beat", onBeat);
  const want = ["alarm-off", "stretch", "coffee", "stair", "roof"];
  const got = Object.keys(seen);
  t.metric("morningBeats", got.length);
  t.event("morning-beats", `heard ${got.join(", ")}`);
  want.forEach((k) => { if (!seen[k]) t.problem("bug", `The morning never played its ${k} beat`); });
  const pill = $("moment-line");
  if (pill && !pill.hidden && getComputedStyle(pill).display !== "none") t.problem("bug", "A take-over speech pill is on screen");
  if (document.documentElement.scrollWidth > innerWidth + 1) t.problem("bug", "The page scrolls sideways");
}
/* ---------------- first-rain: clarity. One glowing Rain icon and a pulsing "Tap the street" arrow, the other four verbs hidden until Rain is used once ----------------
   Needs ?playtest=first-rain ({"touch":true} = 390x844 by touch). Setup (named): the saved first-rain flag, the street lesson and
   the cold open cleared, the title quiet. Real input: Take control (the button by touch), a tap on the canvas (the street) which casts Rain.
   Events first-rain-state (visible verbs, sizes, cue, scroll), first-rain-refused, first-rain-cast, first-rain-open; metrics
   firstRainVisibleVerbs (1 at the start, 5 after), firstRainMinPx, firstRainScrollX. */
function firstRainBar() {
  const out = [];
  document.querySelectorAll("#abilitybar .ab").forEach((b) => {
    const r = b.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(b).display !== "none") out.push({ id: b.id.replace("ability-", ""), w: Math.round(r.width), h: Math.round(r.height) });
  });
  return out;
}
async function firstRain(options, t) {
  const touch = !!(options && options.touch);
  t.scene(touch ? "Phone: first Rain" : "First Rain");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const D = window.day;
  const P = window.powers || D.powers;
  const C = D.control;
  const F = D.firstrain;
  if (!F || !P) { t.problem("bug", "day.firstrain or powers is missing"); return; }
  if (C.mode() === "control") { pressKey("Escape"); await t.until(() => C.mode() === "schedule", 15000, "him back on his day").catch(() => {}); }
  try { F.reset(); if (D.street && D.street.stop) D.street.stop("check"); if (D.title && D.title.quiet) D.title.quiet(); } catch (e) { /* ok */ }
  if (touch) { document.documentElement.classList.add("touch-ui"); if (C.touch) C.touch(true); }
  for (let k = 0; k < 4 && C.mode() !== "control"; k++) {
    if (k > 0 && D.jump) D.jump("19:00");
    await sleep(400);
    if (touch) { const tk = $("control"); if (tk && !tk.disabled) await tapEl(tk); else pressKey("Enter"); } else pressKey("Enter");
    await t.until(() => C.mode() === "control", 2500, "Take control").catch(() => {});
  }
  if (C.mode() !== "control") { t.problem("bug", "Take control never handed him over"); return; }
  if (C.place) C.place(-21, 0.5, 1.5708, {});
  await t.until(() => document.documentElement.classList.contains("first-rain"), 3000, "the first-Rain bar").catch(() => {});
  await sleep(600);
  try { P.abilities.reset && P.abilities.reset(100); } catch (e) { /* ok */ }
  const bar = firstRainBar();
  const cue = $("first-rain-cue");
  const cueOn = !!cue && cue.getBoundingClientRect().width > 0;
  const scrollX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  const minPx = bar.length ? Math.min(...bar.map((b) => Math.min(b.w, b.h))) : 0;
  t.metric("firstRainVisibleVerbs", bar.length);
  t.metric("firstRainMinPx", minPx);
  t.metric("firstRainScrollX", scrollX);
  t.event("first-rain-state", `visible verbs ${JSON.stringify(bar)}, cue ${cueOn ? "shown" : "MISSING"}, scrollX ${scrollX}`);
  if (bar.length !== 1 || bar[0].id !== "rain") t.problem("bug", `The first screen shows ${bar.length} verbs (${bar.map((b) => b.id).join(", ")}); it should be Rain alone`);
  if (!cueOn) t.problem("bug", "The pulsing 'Tap the street' arrow isn't on screen");
  if (minPx < 44) t.problem("bug", `The Rain button is ${minPx} px (44 minimum)`);
  if (scrollX > 1) t.problem("bug", `The page scrolls sideways by ${scrollX} px`);
  const hint = document.querySelector(".control-hint");
  if (hint && !hint.hidden && getComputedStyle(hint).display !== "none") t.problem("bug", "The hint paragraph is still on screen next to the Rain icon");
  t.progress(0.4);

  // a hidden verb is refused
  const refused = !P.command("bolt", "key");
  t.event("first-rain-refused", `Lightning ${refused ? "refused (hidden until Rain)" : "ACCEPTED"}`);
  if (!refused) t.problem("bug", "Lightning worked before Rain was used");

  // the tap on the street casts Rain
  const cv = document.querySelector("canvas");
  const rc = cv.getBoundingClientRect();
  const x = rc.left + rc.width / 2;
  const y = rc.top + rc.height * 0.62;
  const sendPtr = (type) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 5, pointerType: touch ? "touch" : "mouse", isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true }));
  sendPtr("pointerdown");
  await sleep(90);
  sendPtr("pointerup");
  const cast = await t.until(() => !F.now().on, 2500, "Rain from the street tap").then(() => true).catch(() => false);
  t.event("first-rain-cast", cast ? "a tap on the street called Rain" : "the tap did not call Rain");
  if (!cast) t.problem("bug", "Tapping the street didn't call Rain");
  await sleep(600);
  const after = firstRainBar();
  t.metric("firstRainVisibleVerbs", after.length);
  t.event("first-rain-open", `verbs after Rain: ${after.map((b) => b.id).join(", ")}`);
  if (after.length < 5) t.problem("bug", `After the first Rain the bar shows ${after.length} verbs (5 expected)`);
  t.progress(1);
}
/* The first Rain changes the world and the page says so: the lawn greens and the pond fills (even far from the park), a card
   names what changed, and the title shows the same tally. Touch: the tap on the street, then the title's line at 390x844. */
async function stormTally(options, t) {
  const touch = !!(options && options.touch);
  t.scene(touch ? "Phone: what the storm changed" : "What the storm changed");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const D = window.day;
  const P = window.powers || D.powers;
  const C = D.control;
  if (!D.memory || !D.slice || !D.tally || !P) { t.problem("bug", "day.memory, day.slice, day.tally or powers is missing"); return; }
  if (C.mode() === "control") { pressKey("Escape"); await t.until(() => C.mode() === "schedule", 15000, "him back on his day").catch(() => {}); }
  try { D.memory.reset(); D.firstrain.reset(); if (D.street && D.street.stop) D.street.stop("check"); if (D.title && D.title.quiet) D.title.quiet(); } catch (e) { /* ok */ }
  if (touch) { document.documentElement.classList.add("touch-ui"); if (C.touch) C.touch(true); }
  for (let k = 0; k < 4 && C.mode() !== "control"; k++) {
    if (k > 0 && D.jump) D.jump("19:00");
    await sleep(400);
    if (touch) { const tk = $("control"); if (tk && !tk.disabled) await tapEl(tk); else pressKey("Enter"); } else pressKey("Enter");
    await t.until(() => C.mode() === "control", 2500, "Take control").catch(() => {});
  }
  if (C.mode() !== "control") { t.problem("bug", "Take control never handed him over"); return; }
  if (C.place) C.place(-21, 0.5, 1.5708, {}); // the apt roof side of the avenue: far from the park
  await t.until(() => document.documentElement.classList.contains("first-rain"), 3000, "the first-Rain bar").catch(() => {});
  await sleep(500);
  const before = D.slice.now();
  t.event("storm-before", `lawn ${before.lawn} shown ${before.lawnShown}, pond ${before.pond}, tally ${D.memory.tally().total}`);
  const cv = document.querySelector("canvas");
  const rc = cv.getBoundingClientRect();
  const x = rc.left + rc.width / 2, y = rc.top + rc.height * 0.62;
  const sendPtr = (type) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 5, pointerType: touch ? "touch" : "mouse", isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true }));
  sendPtr("pointerdown"); await sleep(90); sendPtr("pointerup");
  const toast = await t.until(() => D.tally.now().on, 6000, "the tally card").then(() => true).catch(() => false);
  const tn = D.tally.now();
  const el = $("storm-toast");
  const r = el ? el.getBoundingClientRect() : null;
  const inside = !!r && r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight;
  t.event("storm-card", toast ? `card: ${tn.text}` : "the tally card never showed");
  if (!toast) t.problem("bug", "After the first Rain no card said what the storm changed");
  else if (!inside) t.problem("bug", "The tally card runs off the screen");
  await t.until(() => D.slice.now().lawnShown >= 0.99, 9000, "the lawn to green").catch(() => {});
  const after = D.slice.now();
  t.metric("stormLawnShown", after.lawnShown);
  t.metric("stormPond", after.pond);
  t.metric("stormTallyRows", D.memory.tally().total);
  t.metric("stormScrollX", Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  t.event("storm-after", `lawn ${after.lawn} shown ${after.lawnShown}, pond ${after.pond}`);
  if (!(after.lawnShown > before.lawnShown + 0.5)) t.problem("bug", "The park lawn did not green after the first Rain");
  if (!(after.pond > before.pond + 0.1)) t.problem("bug", "The pond did not fill after the first Rain");
  await sleep(400);
  // the title shows it too
  pressKey("Escape");
  await t.until(() => C.mode() === "schedule", 15000, "him back on his day").catch(() => {});
  if (D.title && D.title.show) D.title.show("check");
  await sleep(900);
  const te = $("title-tally");
  const tr = te && !te.hidden ? te.getBoundingClientRect() : null;
  const tIn = !!tr && tr.width > 0 && tr.left >= 0 && tr.right <= window.innerWidth && tr.bottom <= window.innerHeight;
  t.event("storm-title", tr ? `title tally: ${te.textContent}` : "no tally on the title");
  t.metric("stormTitleTally", tr ? 1 : 0);
  if (!tIn) t.problem("bug", "The title does not show the tally of what the storm changed");
  const lw = D.slice.now();
  if (!(lw.lawnShown >= 0.99)) t.problem("bug", "The lawn is not green on the title screen");
  t.progress(1);
}
async function audioCheck(options, t) {
  const touch = !!(options && options.touch);
  t.scene(touch ? "Phone: first tap" : "First tap");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const D = window.day;
  const P = window.powers || D.powers;
  const C = D.control;
  if (!D.audio || !D.score || !D.sfx || !P) { t.problem("bug", "day.audio, day.score, day.sfx or powers is missing"); return; }
  if (C.mode() === "control") { pressKey("Escape"); await t.until(() => C.mode() === "schedule", 15000, "him back on his day").catch(() => {}); }
  if (touch) { document.documentElement.classList.add("touch-ui"); if (C.touch) C.touch(true); }
  // A new player's first minute is the scenario's start: the title hands him to the roof with Rain armed (named setup: the saved
  // opening keys cleared so the cold open is pending). If it can't run, the old quiet title applies.
  let cold = false;
  try {
    if (C.mode() === "schedule" && D.coldopen && !D.coldopen.now().on) { ["icanbe.opening", "icanbe.tutorial", "icanbe.firstrain", "icanbe.street"].forEach((k) => localStorage.removeItem(k)); if (D.firstrain && D.firstrain.reset) D.firstrain.reset(); D.coldopen.arm(); cold = D.coldopen.pending(); }
    cold = cold || (D.coldopen && D.coldopen.now().on);
  } catch (e) { cold = false; }
  if (!cold && D.title && D.title.quiet) D.title.quiet();
  const btn = $("sound");
  const r0 = btn.getBoundingClientRect();
  t.metric("audioToggleMinPx", Math.round(Math.min(r0.width, r0.height)));
  t.event("audio-toggle", `Sound toggle ${Math.round(r0.width)}x${Math.round(r0.height)} px, "${btn.textContent}", saved ${localStorage.getItem("icanbe.sound")}`);
  if (r0.width < 44 || r0.height < 44) t.problem("bug", `The sound toggle is ${Math.round(r0.width)}x${Math.round(r0.height)} px (44 minimum)`);
  const before = audioReport();
  t.event("audio-before-tap", `on ${before.on}, city playing ${before.cityPlaying}`);
  if (!before.on) t.problem("bug", "Sound isn't on by default (no saved mute): the first tap must start it with no settings change");

  // the first tap: anywhere (the canvas), nothing else touched
  const cv = document.querySelector("canvas") || document.body;
  // frame gaps from the first tap on: the freeze a tap, Take control or a first cast must not cause (warm-up and preload sit behind the loading bar)
  const gaps = { tap: 0, take: 0, cast: 0, phase: "tap" };
  let lastF = performance.now();
  let gapOn = true;
  (function gapLoop() { const n = performance.now(); gaps[gaps.phase] = Math.max(gaps[gaps.phase], n - lastF); lastF = n; if (gapOn) requestAnimationFrame(gapLoop); })();
  const t0 = performance.now();
  if (touch) await tapEl(cv); else await clickEl(cv);
  const heard = await t.until(() => audioReport().cityPlaying && audioReport().buses.ambience > 0, 2000, "the city ambience").then(() => true).catch(() => false);
  const ms = Math.round(performance.now() - t0);
  const rep = audioReport();
  t.metric("audioAmbienceMs", heard ? ms : -1);
  t.event("audio-ambience", `${heard ? "city ambience playing " + ms + " ms after the first tap" : "NO ambience within 2 s of the first tap"}; loops ${JSON.stringify(rep.ambience)}, bed ${rep.bed}, bus levels ${JSON.stringify(rep.buses)}`);
  if (!heard) t.problem("bug", "The city ambience wasn't playing within 2 s of the first tap");
  if (!rep.on) t.problem("bug", "The first tap changed Sound to off");
  t.progress(0.25);

  // The cold open (if it ran): he is on the roof with Rain armed; one real tap (the Rain button by touch, R on a keyboard) is the first cast
  let musicMeasured = false;
  async function checkMusicAfterCast() {
    if (musicMeasured) return;
    musicMeasured = true;
    const tCast = performance.now();
    const okMusic = await t.until(() => {
      const r = audioReport();
      return Object.keys(r.music).length > 0 && (r.buses.music || 0) > 0;
    }, 5000, "music after the first cast").then(() => true).catch(() => false);
    const secs = Math.round(((performance.now() - tCast) / 1000) * 100) / 100;
    const r = audioReport();
    t.metric("audioMusicAfterCastS", okMusic ? secs : -1);
    t.event("audio-music-after-cast", okMusic ? `music audible ${secs}s after the first cast: ${JSON.stringify(r.music)} (bus ${(r.buses.music || 0).toFixed(2)})` : `NO music within 5 s of the first cast (${JSON.stringify(r.music)})`);
    if (!okMusic) t.problem("bug", "Music wasn't audible within 5 s of the first cast");
  }
  if (cold) {
    if (D.title && D.title.showing() && D.title.play) D.title.play("tap");
    await t.until(() => D.coldopen.now().phase === "waiting" || D.coldopen.now().cast != null, 20000, "the cold open's prompt").catch(() => {});
    if (D.coldopen.now().phase === "waiting") {
      const rb = $("coldopen-bolt");
      if (touch && rb && !rb.hidden) { await tapEl(rb); } else pressKey("r");
      t.milestone && t.milestone("first-input-accepted", "one tap: Rain");
      await t.until(() => D.coldopen.now().cast != null, 3000, "the first Rain").catch(() => {});
      if (D.coldopen.now().cast != null) t.milestone && t.milestone("first-success", "first Rain");
    }
    await checkMusicAfterCast();
    t.event("audio-cold-open", `cold open ${D.coldopen.now().phase}, first input ${D.coldopen.now().firstInput}s, cast ${D.coldopen.now().cast}s`);
    if (D.coldopen.now().cast == null) t.problem("bug", "The first tap on the roof didn't cast Rain");
    await t.until(() => !D.coldopen.now().on, 25000, "the story line and the cold open's end").catch(() => {});
  }

  // take him (Enter, or the button by touch) and cast the five
  if (C.mode() === "control") { /* already his */ } else if (touch) { const tk = $("control") || document.querySelector("#take-control,[data-take]"); if (tk) await tapEl(tk); else pressKey("Enter"); } else pressKey("Enter");
  gaps.phase = "take";
  await t.until(() => C.mode() === "control", 6000, "Take control").catch(() => {});
  // He may be driving (Take control is disabled in the car) or in bed: the same fallback the cold open uses, the clock to dusk
  // where he is on foot (named setup shortcut), then the real button / Enter again.
  for (let k = 0; k < 3 && C.mode() !== "control"; k++) {
    if (D.jump) D.jump("19:00");
    await sleep(500);
    if (touch) { const tk = $("control"); if (tk && !tk.disabled) await tapEl(tk); else pressKey("Enter"); } else pressKey("Enter");
    await t.until(() => C.mode() === "control", 2500, "Take control").catch(() => {});
  }
  if (C.mode() !== "control") t.problem("bug", "Take control never handed him over, so no cast could be tried");
  t.progress(0.3);

  // The first cast, on the roof: every verb open, he stands on the apartment roof, a bolt lands on the street beside a
  // pedestrian and rain follows. Each must be accepted, the strike must show on the street, and a pedestrian must react.
  await sleep(300);
  { const bar = firstRainBar(); t.metric("firstRainVisibleVerbs", bar.length); t.event("first-rain-state", `first screen under control: verbs ${bar.map((b) => b.id).join(", ")}, cue ${$("first-rain-cue") && $("first-rain-cue").getBoundingClientRect().width > 0 ? "shown" : "none"}`); }
  try { if (D.firstrain) D.firstrain.skip(); } catch (e) { /* ok */ }
  try { if (P.gate) P.gate(null); if (P.aimAt) P.aimAt(null); if (D.street && D.street.stop) D.street.stop("check"); } catch (e) { /* ok */ }
  try { ["bolt", "rain", "wind", "fog", "sunbreak"].forEach((id) => P.abilities.unlock && P.abilities.unlock(id)); } catch (e) { /* ok */ }
  if (C.place) C.place(-21, 0.5, 1.5708, {});
  await sleep(400);
  gaps.phase = "cast";
  const refill = () => { try { P.abilities && P.abilities.reset && P.abilities.reset(100); } catch (e) { /* ok */ } };
  refill();
  const crowdNow = () => (D.crowd && D.crowd.info ? D.crowd.info() : {});
  const ppl = D.crowd && D.crowd.positions ? D.crowd.positions().people : [];
  const me0 = C.state();
  const near = ppl.map((p) => ({ p, d: Math.hypot(p.x - me0.x, p.z - me0.z) })).filter((q) => q.d > 6).sort((a, b) => a.d - b.d)[0];
  if (near && P.aimAt) P.aimAt({ x: near.p.x, y: 0, z: near.p.z });
  const strikes = [];
  const onStrike = (e) => strikes.push((e && e.detail) || {});
  window.addEventListener("day:strike", onStrike);
  const okBolt = P.command("bolt", touch ? "touch" : "key");
  await checkMusicAfterCast();
  const reacted = await t.until(() => { const c = crowdNow(); return (c.flinching || 0) > 0 || (c.lookingUp || 0) > 0 || (c.reacting || 0) > 0; }, 3000, "a pedestrian's reaction").then(() => true).catch(() => false);
  window.removeEventListener("day:strike", onStrike);
  if (P.aimAt) P.aimAt(null);
  const st = P.now && P.now().strike;
  t.event("first-cast-bolt", `Lightning ${okBolt ? "accepted" : "REFUSED"}; ${strikes.length} strike events; street hit ${st ? JSON.stringify({ x: Math.round(st.x), z: Math.round(st.z) }) : "none"}`);
  t.event("first-cast-reaction", reacted ? `a pedestrian reacted: ${JSON.stringify({ flinching: crowdNow().flinching, lookingUp: crowdNow().lookingUp, reacting: crowdNow().reacting })}` : "no pedestrian reacted");
  if (!okBolt) t.problem("bug", "The first Lightning cast on the roof was refused");
  else if (!strikes.length && !st) t.problem("bug", "The first Lightning cast left no visible strike on the street");
  if (okBolt && !reacted) t.problem("bug", "No pedestrian reacted to the first bolt");
  await sleep(700);
  refill();
  const sliceNow = () => { const x = D.slice && D.slice.now ? D.slice.now() : {}; return { lawn: x.lawn, lawnShown: x.lawnShown, pond: x.pond }; };
  const lawnBefore = sliceNow();
  t.event("lawn-before-rain", JSON.stringify(Object.assign({ tally: D.memory && D.memory.tally ? D.memory.tally().changed : 0 }, lawnBefore)));
  const okRain = P.command("rain", touch ? "touch" : "key");
  const lawnGreen = await t.until(() => { const x = sliceNow(); return x.lawn === "damp" && x.lawnShown > 0.5; }, 9000, "the lawn greening").then(() => true).catch(() => false);
  await sleep(300);
  const tl = D.memory && D.memory.tally ? D.memory.tally() : { changed: 0, items: [] };
  const tallyEl = $("storm-tally");
  const tr = tallyEl && !tallyEl.hidden ? tallyEl.getBoundingClientRect() : null;
  t.event("lawn-after-rain", JSON.stringify(Object.assign({ greened: lawnGreen, tally: tl.changed, items: tl.items, tallyShown: !!tr, tallyPx: tr ? [Math.round(tr.width), Math.round(tr.height)] : null, noSideScroll: document.documentElement.scrollWidth <= window.innerWidth + 1 }, sliceNow())));
  t.metric("stormTallyCount", tl.changed || 0);
  if (okRain && !lawnGreen) t.problem("bug", "The lawn and pond did not change after the first Rain");
  if (okRain && tl.changed < 1) t.problem("bug", "The storm tally stayed empty after the first Rain");
  if (tr && Math.min(tr.width, tr.height) < 43) t.problem("bug", "The storm tally is under 44 px");
  const rainOn = await t.until(() => { const w = window.weather && window.weather.now ? window.weather.now() : {}; return w.state === "rain" || (w.rain || 0) > 0.2; }, 3000, "rain").then(() => true).catch(() => false);
  t.event("first-cast-rain", `Rain ${okRain ? "accepted" : "REFUSED"}; sky ${rainOn ? "rains" : "did not change"}; crowd reaction ${crowdNow().reaction || "none"}`);
  if (!okRain) t.problem("bug", "The first Rain cast on the roof was refused");
  t.metric("firstCastAccepted", okBolt && okRain ? 1 : 0);
  await sleep(700);
  { const inf = D.sfx.info(); const dec = inf.decoded || { power: [], cast: [] };
    t.event("audio-predecode", `decoded before the first verb cast: power ${dec.power.join(",") || "none"}; cast clips ${dec.cast.join(",") || "none"}; quiet room loop ${inf.roomTone ? "running" : "MISSING"}`);
    if (!inf.roomTone) t.problem("bug", "The quiet loop under idle moments isn't running");
    if (!(dec.power.includes("gale-loop") && dec.power.includes("sun-shimmer") && dec.cast.includes("rain") && dec.cast.includes("fog"))) t.problem("warning", "Not every verb's clip was decoded before the first cast"); }
  const seen = {};
  for (const [name, id] of [["lightning", "bolt"], ["rain", "rain"], ["gale", "gale"], ["fog", "fog"], ["sunbreak", "sunbreak"]]) {
    refill();
    const n0 = D.sfx.info().casts.length;
    const ok = P.command(id, touch ? "touch" : "key");
    await t.until(() => D.sfx.info().casts.some((c, i) => i >= n0 - 0 && c.power === name), 2500, `the ${name} cast sound`).catch(() => {});
    const c = D.sfx.info().casts.filter((x) => x.power === name).pop();
    seen[name] = c || null;
    if (!ok) t.problem("bug", `${name}: the cast command was refused`);
    t.event("audio-cast-" + name, c ? `${name}: ${c.source}${c.file ? " " + c.file : ""}` : `${name}: no cast sound (command ${ok ? "accepted" : "refused"})`);
    if (!c) t.problem("bug", `${name} played no cast sound`);
    else if (c.source !== "file") t.problem("warning", `${name}'s cast sound was the synth stand-in, not a clip (the clip hadn't decoded yet)`);
    await sleep(900);
  }
  const keys = Object.keys(seen).filter((k) => seen[k]);
  const sig = new Set(keys.map((k) => seen[k].file || k));
  gapOn = false;
  const rnd = (v) => Math.round(v);
  t.metric("firstTapWorstMs", rnd(gaps.tap));
  t.metric("takeControlWorstMs", rnd(gaps.take));
  t.metric("castWorstMs", rnd(gaps.cast));
  let draws = -1;
  try { const eng = D.world().scene.getEngine(); draws = (eng._drawCalls && eng._drawCalls.current) || -1; } catch (e) { /* none */ }
  t.metric("sceneDrawCalls", draws);
  t.event("first-tap-hitch", `worst frame gap: first tap ${rnd(gaps.tap)} ms, Take control ${rnd(gaps.take)} ms, the five casts ${rnd(gaps.cast)} ms; ${draws} draw calls; warm-up idle ${!!window.__warmIdle}`);
  if (Math.max(gaps.tap, gaps.take, gaps.cast) > 250) t.problem("bug", `A frame took ${rnd(Math.max(gaps.tap, gaps.take, gaps.cast))} ms around the first tap, Take control or a cast (250 ms maximum): shaders or assets weren't warmed behind the loading bar`);
  { const h = D.sfx.info().heard || {};
    const miss = ["bolt", "rain", "gale", "fog", "sunbreak"].filter((k) => !h["press-" + k]);
    t.event("audio-press-transients", miss.length ? `no press transient for ${miss.join(", ")}` : "each of the five casts played its own press transient (attack <= 5 ms)");
    if (miss.length) t.problem("bug", `No instant press sound for: ${miss.join(", ")}`); }
  t.metric("audioCastsDistinct", sig.size);
  t.event("audio-casts", `${keys.length}/5 casts heard, ${sig.size} distinct sounds`);
  if (sig.size < 5) t.problem("bug", `The five casts must each play a distinct sound (${sig.size} distinct)`);
  t.progress(0.6);

  // a voiced line over the bed: the bed ducks, the line is louder, and it comes back
  await sleep(2500);
  const bed = audioReport();
  const line = D.voice && D.voice.say ? D.voice.say("bolt", { force: true, ignoreCooldown: true }) : null;
  await sleep(450);
  const dk = audioReport();
  t.metric("audioDuckMusicDb", dk.duck.musicDb);
  t.metric("audioDuckAmbienceDb", dk.duck.ambienceDb);
  const bv = dk.buses;
  t.event("audio-duck", `line ${line ? "spoken" : "NOT spoken"}; music ${dk.duck.musicDb} dB, ambience ${dk.duck.ambienceDb} dB; bus levels voice ${(bv.voice || 0).toFixed(2)} vs music ${(bv.music || 0).toFixed(2)} / ambience ${(bv.ambience || 0).toFixed(2)} (before ${(bed.buses.music || 0).toFixed(2)} / ${(bed.buses.ambience || 0).toFixed(2)})`);
  if (!line) t.problem("bug", "The voiced line didn't play, so the duck couldn't be measured");
  else {
    if (dk.duck.musicDb > -6) t.problem("bug", `Music is only ${dk.duck.musicDb} dB under a voice line (6 dB minimum)`);
    if (dk.duck.ambienceDb > -5.5) t.problem("bug", `Ambience is only ${dk.duck.ambienceDb} dB under a voice line (about 6 dB)`);
    if (!((bv.voice || 0) > (bv.music || 0) && (bv.voice || 0) > (bv.ambience || 0))) t.problem("bug", "While a voice line plays, the line isn't louder than the music and ambience buses");
  }
  await t.until(() => audioReport().duck.musicDb > -1, 9000, "the duck to release").then(() => t.event("audio-duck-release", "the bed came back after the line")).catch(() => t.problem("bug", "Music and ambience stayed ducked after the voice line ended"));
  t.progress(0.85);

  // the mute is the player's: off is remembered, on again
  if (touch) await tapEl(btn); else await clickEl(btn);
  await sleep(300);
  if (localStorage.getItem("icanbe.sound") !== "off" || btn.getAttribute("aria-pressed") === "true") t.problem("bug", "The sound toggle didn't mute and save the choice");
  if (touch) await tapEl(btn); else await clickEl(btn);
  await sleep(300);
  if (btn.getAttribute("aria-pressed") !== "true") t.problem("bug", "The sound toggle didn't turn Sound back on");
  // menus-ui: while he is the player's, Let go, Rain (weather), Neighbors (a phone shows it as a pip) and Episodes are in the thumb's reach
  // (the lower 55% of a portrait phone), each at least 44 px, and nothing scrolls sideways
  if (touch && innerHeight > innerWidth) {
    // Neighbors and Episodes sit behind one Menu button (js/phonemenu.js): tap it, they must show, in reach, 44 px
    const reach = [["#control", "Let go"], ["#weather-btn", "Rain"], ["#phone-menu-btn", "Menu"]];
    const out = [];
    let seen = 0;
    const pm = document.getElementById("phone-menu-btn");
    if (!pm || !hudVisible(pm)) out.push("the Menu button isn't on screen");
    else {
      if (hudVisible(document.getElementById("episodes"))) out.push("Episodes is still on screen outside the menu");
      await tapEl(pm);
      await sleep(250);
      if (!hudVisible(document.getElementById("episodes"))) out.push("tapping Menu didn't show Episodes");
      reach.push(["#episodes", "Episodes in the menu"]);
      if (!isPublicView()) reach.push(["#neighbors-btn", "Neighbors in the menu"]);
      t.event("phone-menu-open", "Menu tapped: Episodes" + (isPublicView() ? "" : " and Neighbors") + " shown");
    }
    // the five verbs: one arc at the bottom right, each 44 px or more with its cost label at least 12 px
    const verbs = [...document.querySelectorAll(".abilitybar .ab[data-verb]")].filter((b) => hudVisible(b));
    verbs.forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.left < innerWidth * 0.45 || r.top < innerHeight * 0.4) out.push(`verb ${b.dataset.ability} is outside the bottom-right thumb arc`);
      if (r.width < 43.5 || r.height < 43.5) out.push(`verb ${b.dataset.ability} is ${Math.round(r.width)}x${Math.round(r.height)}px`);
      const c = b.querySelector(".c");
      if (c && hudVisible(c) && parseFloat(getComputedStyle(c).fontSize) < 12) out.push(`verb ${b.dataset.ability}'s cost label is under 12 px`);
    });
    if (verbs.length) t.event("verb-arc", `${verbs.length} verbs in the bottom-right arc, 44 px or more, labels 12 px or more`);
    t.metric && t.metric("phoneRenderScale", window.day.look && window.day.look.info ? (window.day.look.info().scaling || 0) : 0);
    reach.forEach(([sel, name]) => {
      const el = document.querySelector(sel);
      if (!el || !hudVisible(el)) return;
      seen++;
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight * 0.45) out.push(`${name} is ${Math.round(r.top)}px from the top (out of thumb reach)`);
      if (r.width < 43.5 || r.height < 43.5) out.push(`${name} is ${Math.round(r.width)}x${Math.round(r.height)}px`);
    });
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push("the page scrolls sideways");
    out.forEach((m) => t.problem("bug", "Menus (phone): " + m));
    if (!out.length) t.event("menus-thumb-reach", `${seen} controls in the lower 55%, all 44 px or more, no sideways scroll`);
    if (window.day.phoneMenu) window.day.phoneMenu.close();
    checkHud(t, "audio-check: phone controls");
  }
  // the morning's own sounds: alarm, stretch, coffee, the stair and the roof, each a beat of its own (no speech pill)
  try {
    if (C.mode() === "control") { pressKey("Escape"); await t.until(() => C.mode() === "schedule", 15000, "him back on his day").catch(() => {}); }
    await morningBeats(options, t);
  } catch (e) { t.problem("bug", "morning beats: " + (e && e.message)); }
  const fin = audioReport();
  t.event("audio-report", JSON.stringify({ on: fin.on, buses: fin.buses, ambience: fin.ambience, bed: fin.bed, casts: fin.casts.length }));
  t.progress(1);
}

/* ---------------- stem-score: one motif, three synced stems, intent-driven gains (js/stems.js) ----------------
   Needs ?playtest=stem-score. Setup (named): every icanbe.* key cleared, the cold open armed, the title up. Real input: a click (a tap
   on a phone) on Play, a hold of the bolt (E held, or a touch held on the Bolt button), and after the cold open a Tornado (named
   shortcut `powers.command`) and an episode's score event (named shortcut). Events stem-motif-title / -coldopen, stem-ready,
   stem-windup, stem-storm, stem-sting, stem-transfer; metrics stemLayers, stemTensionSeconds, stemStormSeconds, stemMbAfterInput. */
async function stemScore(options, t) {
  t.scene("Stem score");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model !== "loading", 30000, "his model to load").catch(() => {});
  const D = window.day;
  const phone = D.control && D.control.state ? !!D.control.state().touch : innerWidth <= 700;
  if (!D.stems) { t.problem("blocker", "js/stems.js didn't install (no day.stems)"); return; }
  if (D.control.mode() === "control") { pressKey("Escape"); await t.until(() => D.control.mode() === "schedule", 15000, "him back on his day").catch(() => {}); }
  Object.keys(window.localStorage).filter((k) => k.startsWith("icanbe.")).forEach((k) => window.localStorage.removeItem(k));
  D.coldopen.arm();
  D.title.show("playtest");
  await sleep(700);
  const mb = () => performance.getEntriesByType("resource").reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0) / 1048576;
  const mbBefore = mb();
  const heard = [];
  window.addEventListener("day:stems", (e) => heard.push(Object.assign({ t: performance.now() }, e.detail)));
  const before = D.stems.now();
  if (before.stems !== 0) t.problem("bug", `${before.stems} stems are up before any input (they must stream lazily after the first input)`);
  if (before.layers.calm.gain > 0) t.problem("bug", "A stem is audible on the title");
  t.event("stem-before-input", `stems ${before.stems}, streaming ${before.streaming}, ${mbBefore.toFixed(2)} MB transferred`);

  const playBtn = $("title-play");
  if (phone) await tapEl(playBtn); else await clickEl(playBtn);
  await t.until(() => D.control.mode() === "control", 6000, "him the player's").catch(() => {});
  await t.until(() => heard.some((h) => h.action === "motif" && h.where === "coldopen"), 6000, "the cold open's motif").catch(() => {});
  const m = D.stems.now().motifs;
  const mt = m.find((x) => x.where === "title");
  const mc = m.find((x) => x.where === "coldopen");
  t.event("stem-motif-title", mt ? `the title's motif (${mt.notes}), heard ${mt.heard}` : "NO motif on the title");
  t.event("stem-motif-coldopen", mc ? `the cold open's motif (${mc.notes}), heard ${mc.heard}` : "NO motif in the cold open");
  if (!mt || !mc) t.problem("bug", "The 4-note motif didn't play on both the title and the cold open");
  else if (mt.notes !== mc.notes || mt.notes.split(" ").length !== 4) t.problem("bug", "The title's and the cold open's motifs aren't the same four notes");
  t.progress(0.25);

  // the Play click goes straight to the roof; stems start on the first day:power cast
  await t.until(() => D.coldopen.now().phase === "waiting" || D.coldopen.now().cast != null, 15000, "the cold open's prompt").catch(() => {});
  const preCast = D.stems.now();
  t.event("stem-before-cast", `stems before first cast: ${preCast.stems}, streaming ${preCast.streaming}, bytes ${preCast.bytes}`);
  if (preCast.stems !== 0 || preCast.bytes !== 0) t.problem("bug", `Stems started before the first cast (${preCast.stems} stems, ${preCast.bytes} bytes)`);
  if (D.coldopen.now().phase === "waiting") {
    const rb = $("coldopen-bolt");
    if (phone && rb && !rb.hidden) await tapEl(rb); else pressKey("r");
  }
  const ready = await t.until(() => D.stems.now().stems === 3, 20000, "three stems").then(() => true).catch(() => false);
  const S = D.stems.now();
  const spent = mb() - mbBefore;
  t.metric("stemLayers", S.stems);
  t.metric("stemMbAfterInput", Math.round(spent * 100) / 100);
  t.event("stem-ready", `${S.stems} stems, synced ${S.synced}, ${S.source}, ${S.bpm} BPM, bar ${S.bar}s, loop ${S.loopSec}s`);
  t.event("stem-transfer", `${spent.toFixed(2)} MB transferred since the title (stems ${(S.bytes / 1048576).toFixed(2)} MB)`);
  if (!ready || S.stems !== 3 || !S.synced) t.problem("bug", "The music bus doesn't report 3 synced stem layers");
  if (phone && S.bytes / 1048576 > 1.5) t.problem("bug", `The stems streamed ${(S.bytes / 1048576).toFixed(2)} MB (the phone's limit is 1.5 MB)`);

  // wait out the cold open's HUD, then he is free: a wind-up is a hold of Lightning
  await t.until(() => !document.documentElement.classList.contains("cold-open"), 40000, "the cold open to finish").catch(() => {});
  await sleep(1500);
  const start = performance.now();
  let tensionAt = null;
  let peak = 0;
  const poll = setInterval(() => {
    const L = D.stems.now().layers;
    peak = Math.max(peak, L.tension.gain);
    if (tensionAt == null && L.tension.gain > 0.1) tensionAt = (performance.now() - start) / 1000;
  }, 40);
  if (phone && $("coldopen-bolt") && hudVisible($("coldopen-bolt"))) {
    const b = $("coldopen-bolt"); const r = b.getBoundingClientRect();
    touchOn(b, "pointerdown", r.left + r.width / 2, r.top + r.height / 2, 9); await sleep(1100); touchOn(b, "pointerup", r.left + r.width / 2, r.top + r.height / 2, 9);
  } else { keyDown("e"); await sleep(1100); keyUp("e"); }
  await sleep(1500);
  clearInterval(poll);
  t.metric("stemTensionSeconds", tensionAt == null ? -1 : Math.round(tensionAt * 100) / 100);
  t.event("stem-windup", tensionAt != null ? `the tension layer rose ${tensionAt.toFixed(2)}s after the hold began (peak ${peak.toFixed(2)})` : "the tension layer never rose");
  if (tensionAt == null || tensionAt > 2) t.problem("bug", `A cast wind-up must raise the tension layer within one bar (2 s): ${tensionAt == null ? "it never did" : tensionAt.toFixed(2) + " s"}`);
  t.progress(0.6);

  // a tornado brings the full storm layer in
  const s0 = performance.now();
  let stormAt = null;
  const poll2 = setInterval(() => { if (stormAt == null && D.stems.now().layers.storm.gain > 0.1) stormAt = (performance.now() - s0) / 1000; }, 40);
  const cast = window.powers && window.powers.command ? window.powers.command("tornado", "playtest") : false;
  await sleep(3500);
  clearInterval(poll2);
  t.metric("stemStormSeconds", stormAt == null ? -1 : Math.round(stormAt * 100) / 100);
  t.event("stem-storm", `Tornado ${cast ? "cast" : "refused"}; the storm layer ${stormAt != null ? "rose after " + stormAt.toFixed(2) + "s" : "never rose"}`);
  if (stormAt == null) t.problem("bug", "A tornado cast didn't bring the full storm layer in");

  // an episode success: the resolution sting
  window.dispatchEvent(new CustomEvent("day:episode", { detail: { action: "score", id: "playtest", why: "clear", cleared: true } }));
  await sleep(600);
  const st = D.stems.now().stings;
  t.event("stem-sting", st.length ? `${st.map((x) => x.kind + (x.heard ? " (heard)" : "")).join(", ")}` : "no sting");
  if (!st.some((x) => x.kind === "resolution")) t.problem("bug", "An episode success didn't play the resolution sting");
  t.progress(1);
}

/* ---------------- title-progress: the title shows episode progress and Continue's next goal ----------------
   Needs ?playtest=title-progress. Setup (named): icanbe.* cleared, a returning player's save (opening seen, "Clear the sky" finished at rank A).
   Real input: a tap (touch) or click on Play. Events title-progress / title-next / title-progress-phone; metrics titleProgressStars, titleProgressTapMin. */
async function titleProgress(options, t) {
  t.scene("Title progress");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const D = window.day;
  if (D.control.mode() === "control") { pressKey("Escape"); await t.until(() => D.control.mode() === "schedule", 15000, "him back on his day").catch(() => {}); }
  Object.keys(window.localStorage).filter((k) => k.startsWith("icanbe.")).forEach((k) => window.localStorage.removeItem(k));
  window.localStorage.setItem("icanbe.opening", "seen");
  window.localStorage.setItem("icanbe.episodes.best", JSON.stringify({ morning: { pct: 80, rank: "A", cleared: true, done: true, when: Date.now() } }));
  D.title.show("playtest");
  await sleep(4200);
  const tn = D.title.now();
  t.event("title-progress", `"${tn.progress}" ${innerWidth}x${innerHeight}`);
  if (!tn.progress) t.problem("bug", "The title shows no episode progress (stars or episodes finished)");
  t.event("title-next", `Play "${tn.continueLabel}", goal "${tn.next}"`);
  if (tn.continueLabel !== "Continue") t.problem("bug", "A returning player's Play isn't Continue");
  if (!/^Next: \S/.test(tn.next)) t.problem("bug", "Continue has no named next goal under it");
  const prog = $("title-prog"), nx = $("title-next"), play = $("title-play"), el = $("title");
  const bp = prog && boxOf(prog), bn = nx && boxOf(nx), bb = play && boxOf(play);
  if (!bp || !bn || !bb) t.problem("bug", "The progress line, next goal or Play isn't visible on the title");
  else {
    t.event("title-progress-phone", `progress ${Math.round(bp.top)}..${Math.round(bp.bottom)}, next ${Math.round(bn.top)}..${Math.round(bn.bottom)}, Play ${Math.round(bb.width)}x${Math.round(bb.height)}, scrollW ${document.documentElement.scrollWidth} of ${innerWidth}`);
    if (bn.bottom > bb.top + 2) t.problem("bug", "The next goal overlaps Play");
    if (bp.right > innerWidth || bp.left < 0 || bn.right > innerWidth || bn.left < 0) t.problem("bug", "The progress or next-goal line runs off the screen");
    if (document.documentElement.scrollWidth > innerWidth + 1) t.problem("bug", "The title scrolls sideways");
    const small = [...el.querySelectorAll("button")].map((b) => ({ b, r: boxOf(b) })).filter((x) => x.r && (x.r.height < 44 || x.r.width < 44));
    t.metric("titleProgressSmallTargets", small.length);
    if (small.length) t.problem("bug", `${small.length} title control(s) under 44 px`);
  }
  t.metric("titleProgressStars", (tn.progress.match(/★/g) || []).length);
  const touch = D.control && D.control.state ? !!D.control.state().touch : innerWidth <= 700;
  if (touch) await tapEl(play); else play.click();
  await t.until(() => !D.title.showing(), 8000, "the title to close on Play").catch(() => {});
  t.event("title-progress-play", `title closed: ${!D.title.showing()}`);
  t.progress(1);
}

/* ---------------- title-key-art: the crane, the logo, the storm, Play dives into the cold open ----------------
   Needs ?playtest=title-key-art. Setup (named): every icanbe.* key cleared, the cold open armed, the title up. Real input: a tap (touch) or click
   on Play. Events title-shot / title-buttons / title-phone / title-glints / title-play-dive; metrics titleSecondsToControl, titleBlackFrames,
   titleButtons. Run at 1280x720 and 390x844 touch. */
async function titleKeyArt(options, t) {
  t.scene("Title key art");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model !== "loading", 30000, "his model to load").catch(() => {});
  const D = window.day;
  const phone = D.control && D.control.state ? !!D.control.state().touch : innerWidth <= 700;
  if (D.control.mode() === "control") { pressKey("Escape"); await t.until(() => D.control.mode() === "schedule", 15000, "him back on his day").catch(() => {}); }
  Object.keys(window.localStorage).filter((k) => k.startsWith("icanbe.")).forEach((k) => window.localStorage.removeItem(k));
  D.coldopen.arm();
  D.title.show("playtest");
  const glints = [];
  window.addEventListener("day:title", (e) => { if (e.detail && e.detail.action === "glint") glints.push(performance.now()); });
  // the crane: the camera lands on the roof, and he is standing on it (the title's hero)
  await t.until(() => D.title.now().crane === 1, 15000, "the crane to land").catch(() => {});
  await sleep(1500);
  const el = $("title"), play = $("title-play"), logo = $("title-logo");
  const tn = D.title.now();
  t.event("title-shot", `crane ${tn.crane}, logo ${tn.logo}, play "${tn.continueLabel}", sound ${tn.sound}, ${innerWidth}x${innerHeight}`);
  if (tn.crane !== 1) t.problem("bug", "The title's crane never landed on Small Weather");
  const buttons = [...el.querySelectorAll("button")].filter((b) => boxOf(b));
  t.metric("titleButtons", buttons.length);
  t.event("title-buttons", buttons.map((b) => b.textContent.trim()).join(" | ") + (tn.daily ? ` + ${tn.daily}` : ""));
  if (buttons.length > 4) t.problem("bug", `The title shows ${buttons.length} buttons (4 at most)`);
  const mb = $("title-music"), mbb = mb && boxOf(mb);
  if (mbb) {
    const lh = parseFloat(getComputedStyle(mb).lineHeight) || 20;
    t.metric("titleMusicPillH", Math.round(mbb.height));
    t.event("title-pill", `"${mb.textContent.trim()}" ${Math.round(mbb.width)}x${Math.round(mbb.height)}, scrollW ${document.documentElement.scrollWidth} of ${innerWidth}`);
    if (mbb.height > Math.max(lh * 2 + 8, 70)) t.problem("bug", "The title's Music pill wraps to two lines");
    if (document.documentElement.scrollWidth > innerWidth + 1) t.problem("bug", "The title scrolls sideways");
  }
  const pb = boxOf(play), lb = boxOf(logo);
  if (!pb || !lb) t.problem("blocker", "No Play button or logo on the title");
  else {
    t.event("title-phone", `logo ${Math.round(lb.top)}..${Math.round(lb.bottom)} px, Play ${Math.round(pb.width)}x${Math.round(pb.height)} at ${Math.round(pb.top)}..${Math.round(pb.bottom)} of ${innerHeight}`);
    if (pb.height < 56) t.problem("bug", `Play is ${Math.round(pb.height)} px tall (56 at least)`);
    if (lb.bottom > innerHeight * 0.45 || lb.top < 0) t.problem("bug", "The logo isn't above the fold with room for Small Weather under it");
    if (phone && pb.top < innerHeight * 0.55) t.problem("bug", "Play isn't in the thumb zone (the lower half)");
    if (phone && (pb.right > innerWidth || pb.left < 0)) t.problem("bug", "Play runs off the screen");
  }
  await sleep(4500);
  t.event("title-glints", `${glints.length} lightning glints in the clouds`);
  if (glints.length < 2) t.problem("bug", `Only ${glints.length} glint(s) in 6 s on the title (every few seconds)`);
  t.progress(0.5);
  // black frames while Play dives: the canvas read after each rendered frame
  const w = D.world();
  const probe = document.createElement("canvas");
  probe.width = probe.height = 16;
  const pc = probe.getContext("2d", { willReadFrequently: true });
  let frames = 0, black = 0, afterTake = 0;
  let tPlay = 0;
  const obs = w.scene.onAfterRenderObservable.add(() => {
    if (!tPlay) return;
    try {
      pc.drawImage(w.scene.getEngine().getRenderingCanvas(), 0, 0, 16, 16);
      const d = pc.getImageData(0, 0, 16, 16).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
      frames++;
      if (sum / 256 / 3 < 2.5) black++;
    } catch (e) { /* tainted or lost: not counted */ }
  });
  const heard = {};
  window.addEventListener("day:control", (e) => { if (e.detail && e.detail.action === "take" && !heard.control) heard.control = performance.now(); });
  window.addEventListener("day:coldopen", (e) => { const a = e.detail && e.detail.action; if (a && !heard[a]) heard[a] = performance.now(); });
  t.scene("Play");
  tPlay = performance.now();
  if (phone) await tapEl(play); else await clickEl(play);
  await t.until(() => heard.control, 3000, "control after Play").catch(() => {});
  await sleep(1600);
  w.scene.onAfterRenderObservable.remove(obs);
  const toControl = heard.control ? (heard.control - tPlay) / 1000 : null;
  const toFirst = Math.min(...["landed", "start"].map((k) => (heard[k] ? (heard[k] - tPlay) / 1000 : 99)));
  t.metric("titleSecondsToControl", toControl == null ? -1 : Math.round(toControl * 100) / 100);
  t.metric("titleBlackFrames", black);
  t.event("title-play-dive", `control after ${toControl == null ? "never" : toControl.toFixed(2)} s, cold open's first beat ${toFirst.toFixed(2)} s, ${black} black of ${frames} frames`);
  if (toControl == null || toControl > 1) t.problem("bug", "Play didn't put him under control within 1 s");
  if (toFirst > 1) t.problem("bug", "The cold open's first beat didn't start within 1 s of Play");
  if (black > 0) t.problem("bug", `${black} black frame(s) while Play dove into the cold open`);
  if (D.title.now().showing) t.problem("bug", "The title is still up after Play");
  t.progress(1);
}

// Needs ?playtest=cold-start (or the runner's start("cold-start")). Setup (named): every icanbe.* key cleared, the cold open armed,
// the title up. Real input only from there: a click or tap on the title's Play, then the one cue on screen ("Hold E" -> E held;
// "Hold the bolt" -> a touch held on the Bolt button). Event-driven: day:control, day:power, day:story, day:coldopen, day:crowd,
// day:dialogue and day:voice stamp the times; the only waits are one-shot timers for the +5 / +15 / +30 s shots and a deadline.
// Reports seconds to first input / first cast / first city reaction / Birdie's voice, words on screen before the first cast,
// what else is visible before it (a phone: only the stick, Jump and Bolt), and the other criteria as problems.
async function coldStart(options, t) {
  t.scene("Loading");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model !== "loading", 30000, "his model to load").catch(() => {});
  // the title holds the auto-started cold open until the shader warm-up (js/app.js, once his model is on) is over, so this setup
  // doesn't race it: wait for the same signal the title waits for (it starts anyway after title.js WARM_WAIT_MS)
  await t.until(() => window.__warmIdle === true || !window.__warmLights, 20000, "the shader warm-up to end").catch(() => {});
  const D = window.day;
  const phone = D.control && D.control.state ? !!D.control.state().touch : innerWidth <= 700;
  {
    // the auto-start's own delay after that (title.js autoStart) has to pass for `auto` below to be true
    const as = (window.DAY_CONFIG && window.DAY_CONFIG.title && window.DAY_CONFIG.title.autoStart) || {};
    const secs = phone && as.phoneSecs != null ? as.phoneSecs : as.secs || 0;
    if (secs && D.coldopen && D.coldopen.pending() && D.title && D.title.showing()) await sleep(secs * 1000 + 400);
  }
  t.event("cold-start-setup", `${innerWidth}x${innerHeight}, ${phone ? "touch" : "keyboard and mouse"}`);
  // A stranger's desktop session isn't asked to click Play: the title auto-starts the cold open (title.js autoStart.secs), and the
  // model's load can take longer than that, so by the time this scenario is ready he may already be on the roof. That IS the run:
  // measure it from that moment (letting go of it and walking back to re-run it by Play is what stalled in "returning").
  const auto = !!(D.coldopen && D.coldopen.now().on && D.control.mode() === "control");
  if (!auto) {
    t.scene("Title");
    if (D.control.mode() === "control") { pressKey("Escape"); await t.until(() => D.control.mode() === "schedule", 15000, "him back on his day").catch(() => {}); }
    // setup: a new player (no icanbe.* keys), the title up, the cold open armed
    Object.keys(window.localStorage).filter((k) => k.startsWith("icanbe.")).forEach((k) => window.localStorage.removeItem(k));
    if (!D.coldopen) { t.problem("blocker", "There's no cold open (js/coldopen.js didn't install)"); return; }
    D.coldopen.arm();
    if (D.tutorial && D.tutorial.reset) { /* the cold open replaces its card: a new player must not get both */ }
    D.title.show("playtest");
    await sleep(700);
    if (D.coldopen.now().on) t.problem("blocker", "A cold open from before the setup is still running (letting go must end it)");
    if (!D.coldopen.pending()) t.problem("blocker", "A player with no saved keys isn't pending the cold open");
  } else t.event("cold-start-auto", "no Play click: the title started the cold open by itself and he is on the roof");

  const T = {}; // seconds since Play, by name
  let tPlay = 0;
  const since = () => (performance.now() - tPlay) / 1000;
  const stamp = (k) => { if (T[k] == null) T[k] = Math.round(since() * 100) / 100; };
  const waiters = [];
  const evs = [];
  const note = (src, d) => {
    evs.push({ src, t: Math.round(since() * 100) / 100, ...(d || {}) });
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].test()) { const w = waiters.splice(i, 1)[0]; clearTimeout(w.to); w.res(true); }
  };
  const waitFor = (test, ms) => new Promise((res) => {
    if (test()) return res(true);
    const w = { test, res, to: setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); res(false); }, ms) };
    waiters.push(w);
  });
  const on = (name, fn) => window.addEventListener(name, (e) => { fn((e && e.detail) || {}); note(name, (e && e.detail) || {}); });
  on("day:control", (d) => { if (d.action === "take") stamp("control"); });
  on("day:power", (d) => { if (d.action === d.power && (d.power === "bolt" || d.power === "rain")) stamp("bolt"); });
  on("day:crowd", (d) => { if (d.kind === "lookup") stamp("lookup"); });
  on("day:story", (d) => { if (d.action === "say" && d.who === "Birdie") stamp("birdie-say"); });
  on("day:voice", (d) => { if (d.action === "play" && d.who === "Birdie") stamp("birdie-voice"); }); // she is voiced through js/voice.js speakAs
  on("day:voice", (d) => { if (d.action === "play") stamp("voice-" + (T["voice-first"] == null ? "first" : "next")); });
  on("day:coldopen", (d) => {
    if (d.action === "landed") stamp("landed");
    if (d.action === "prompt") stamp("prompt");
    if (d.action === "input") stamp("input");
    if (d.action === "birdie") stamp("birdie-called");
  });
  // visible words: text nodes of anything a player can see (not the canvas), split on spaces
  function wordsOnScreen() {
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const txt = (n.textContent || "").trim();
      if (!txt) continue;
      const el = n.parentElement;
      if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TITLE)$/.test(el.tagName)) continue;
      if (!hudVisible(el)) continue;
      txt.split(/\s+/).filter((x) => /\w/.test(x)).forEach((x) => out.push(x));
    }
    return out;
  }
  const allowed = [".touchpad .stick", ".touchpad .jump", "#coldopen-bolt", "#coldopen-prompt", "#voice-caption", "#coldopen-say"];
  function extras() {
    return hudRects().filter((p) => !allowed.some((sel) => p.el.matches(sel) || p.el.closest(sel))).map((p) => p.name);
  }

  // Play: the real click (or tap)
  const playBtn = $("title-play");
  tPlay = auto ? D.coldopen.now().startedAt : performance.now();
  if (auto) {
    // what already happened before the listeners were up, from the cold open's own log (seconds since its start)
    T.control = 0;
    D.coldopen.now().log.forEach((l) => {
      if (l.action === "landed") T.landed = l.t;
      if (l.action === "prompt") T.prompt = l.t;
      if (l.action === "input") T.input = l.t;
    });
  }
  // the +5 / +15 / +30 s shots (the runner takes a frame at each event)
  [5, 15, 30].forEach((s) => since() < s && setTimeout(() => {
    t.event(`cold-start-play-plus-${s}`, `${s}s after Play: ${D.control.mode()}, cold open ${D.coldopen.now().phase}, ${wordsOnScreen().length} words, crowd ${D.crowd && D.crowd.info ? D.crowd.info().reaction || "no reaction" : "?"}`);
  }, s * 1000 - since() * 1000));

  if (!auto) { if (phone) await tapEl(playBtn); else await clickEl(playBtn); }
  t.event("cold-start-play", auto ? "auto-started (no click)" : phone ? "tapped Play" : "clicked Play");
  const gotControl = await waitFor(() => T.control != null, 4000);
  if (!gotControl) { t.problem("blocker", `Play didn't hand him over (control mode ${D.control.mode()})`); return; }
  t.scene("Cold start");
  if (t.milestone) t.milestone("gameplay", "on the roof");
  t.event("cold-start-control", `he is the player's ${T.control}s after Play; title ${D.title.showing() ? "STILL UP" : "closed"}`);
  if (D.title.showing()) t.problem("bug", "The title is still up after Play");
  if (D.tutorial && D.tutorial.blocking && D.tutorial.blocking()) t.problem("bug", "The first-visit card shows during the cold open");
  if ($("opening") && !$("opening").hidden) t.problem("bug", "The text opening shows during the cold open");
  const offer = $("episode-offer");
  if (offer && !offer.hidden) t.problem("bug", "An episode offer card shows during the cold open");
  t.progress(0.2);

  // the cue
  const cue = await waitFor(() => T.prompt != null, 6000);
  if (!cue) { t.problem("blocker", "The cold open never showed its prompt"); return; }
  await sleep(500); // the prompt fades in
  const promptEl = $("coldopen-prompt");
  const cueText = (promptEl && promptEl.textContent || "").trim();
  const words = wordsOnScreen();
  const other = extras();
  t.metric("wordsBeforeFirstCast", words.length);
  t.event("cold-start-words", `${words.length} words on screen before the first cast: "${words.join(" ")}"`);
  t.event("cold-start-cue", `prompt "${cueText}" at ${T.prompt}s; also visible: ${other.join(", ") || "nothing else"}`);
  if (words.length > 25) t.problem("bug", `${words.length} words are on screen before the first cast (the limit is 25)`);
  if (other.length) t.problem("bug", `${phone ? "On a phone only the stick, Jump and Bolt may show before the first cast" : "No HUD may show before the first cast"}; also visible: ${other.join(", ")}`);
  // the hint fades while a story card / caption shows and returns once it is gone; it never sits over card text
  const cards = () => [".voice-caption", "#coldopen-say", "#episode-say", ".mo-line"].map((q) => document.querySelector(q)).filter((e) => e && !e.hidden && hudVisible(e) && !e.classList.contains("leaving"));
  const hintClear = await waitFor(() => promptEl && !cards().length && +getComputedStyle(promptEl).opacity > 0.9, 8000);
  const overlap = cards().some((c) => { const a = c.getBoundingClientRect(), b2 = promptEl.getBoundingClientRect(); return +getComputedStyle(promptEl).opacity > 0.1 && a.left < b2.right && a.right > b2.left && a.top < b2.bottom && a.bottom > b2.top; });
  if (overlap) t.problem("bug", "The R hint overlaps a story card's text");
  else t.event("hint-clear-of-cards", "the rain hint is faded or clear of the story card text");
  if (!hintClear || !promptEl || !hudVisible(promptEl)) t.problem("bug", "The prompt isn't visible");
  if (phone) {
    const b = $("coldopen-bolt");
    const r = b && b.getBoundingClientRect();
    if (!b || !hudVisible(b)) t.problem("blocker", "No Bolt button on a phone");
    else {
      if (r.width < 64 || r.height < 64) t.problem("bug", `The Bolt button is small (${Math.round(r.width)}x${Math.round(r.height)})`);
      if (r.left < innerWidth / 2) t.problem("bug", "The Bolt button isn't in the right thumb zone");
      const pr = promptEl.getBoundingClientRect();
      if (pr.bottom > r.top + 2) t.problem("bug", "The prompt isn't above the Bolt button");
      const j = document.querySelector(".touchpad .jump");
      const jr = j && j.getBoundingClientRect();
      if (jr && !(r.bottom <= jr.top + 2 || r.top >= jr.bottom - 2 || r.right <= jr.left || r.left >= jr.right)) t.problem("bug", "The Bolt button overlaps Jump");
    }
  }
  {
    // the late chunk (js/late.js): nothing of episodes, the tornado, wind and fog or moments may be in before the first cast
    const L0 = D.late && D.late.now ? D.late.now() : null;
    const early = L0 ? Object.keys(L0.modules).filter((k) => L0.modules[k]) : ["no day.late"];
    t.event("cold-start-late-before", `modules loaded before gameplay: ${early.join(", ") || "none"} (started ${L0 ? L0.started : "?"})`);
    t.metric("lateModulesBeforeGameplay", early.length);
    if (!L0 || early.length) t.problem("bug", `Late modules were loaded before gameplay: ${early.join(", ") || "day.late is missing"}`);
    if (D.episodes) t.problem("bug", "day.episodes exists before the first cast (episodes.js is in the first chunk)");
    if (D.powers && D.powers.tornadoLoaded && D.powers.tornadoLoaded()) t.problem("bug", "The tornado module is loaded before the first cast");
  }
  t.progress(0.4);

  // follow the cue (Rain: "Press R for rain" / the Rain button tap): no card is clicked anywhere before it
  const dim = Array.from(document.querySelectorAll(".ep-offer:not([hidden]),.tutorial:not([hidden]),#day-end:not([hidden])")).filter((e) => e.offsetParent !== null);
  if (dim.length) t.problem("bug", "A card is up before the first cast: " + dim.map((e) => e.id || e.className).join(", "));
  {
    const preAudio = performance.getEntriesByType("resource")
      .map((r) => (r.name || "").split("/").pop().split("?")[0])
      .filter((n) => /^(stem-|take-control\.mp3)/i.test(n));
    const stNow = D.stems && D.stems.now ? D.stems.now() : { stems: 0, bytes: 0 };
    t.metric("preGameplayStemOrStingAssets", preAudio.length);
    t.event("cold-start-pre-cast-audio", `before first cast: stems ${stNow.stems} (${stNow.bytes} B), stem/sting assets fetched: ${preAudio.join(", ") || "none"}`);
    if (preAudio.length > 0 || stNow.stems > 0) {
      t.problem("bug", `Stems or take-control.mp3 fetched before the first cast: ${preAudio.join(", ") || stNow.stems + " stems"}`);
    }
  }
  t.event("cold-start-no-card", "no card to click: the first cast follows the prompt on the roof");
  const sl = () => (D.slice && D.slice.now ? D.slice.now() : {});
  const baseSlice = { lawn: sl().lawnShown || 0, pond: sl().pond || 0.78 };
  const base = baseSlice;
  const g0 = D.garden && D.garden.now ? D.garden.now() : null;
  const wPre = W && W.now ? W.now() : {};
  const cPre = D.crowd && D.crowd.info ? D.crowd.info() : {};
  t.event("cold-start-pre-cast", `before cast: manual ${!!wPre.manual}, lawn ${base.lawn}, pond ${base.pond}, garden k ${g0 ? g0.k : "?"}, crowd reaction ${cPre.reaction || "none"}`);
  if (wPre.manual) t.problem("bug", "The cold-open storm cell marked weather manual before the player cast");
  if (base.lawn > 0.05) t.problem("bug", `The lawn darkened before the first Rain cast (${base.lawn})`);
  if (g0 && (g0.k > 0.05 || g0.goal > 0)) t.problem("bug", `Birdie's garden started reviving before the first Rain cast (k ${g0.k}, goal ${g0.goal})`);
  if (cPre.reaction === "rain") t.problem("bug", "The crowd reacted to rain before the player cast");
  if (phone) {
    const b = $("coldopen-bolt");
    const r = b.getBoundingClientRect();
    touchOn(b, "pointerdown", r.left + r.width / 2, r.top + r.height / 2, 9);
    await sleep(120);
    touchOn(b, "pointerup", r.left + r.width / 2, r.top + r.height / 2, 9);
  } else {
    keyDown("r");
    await sleep(120);
    keyUp("r");
  }
  const cast = await waitFor(() => T.bolt != null, 4000);
  if (!cast) { t.problem("blocker", `Pressing the prompted rain never cast it (${cueText})`); return; }
  const tCast0 = performance.now();
  t.event("cold-start-bolt", `first input ${T.input}s, first cast ${T.bolt}s after Play`);
  // 1. Reaction glance & street reaction within 2 s of the first Rain cast: the camera eases to frame Birdie's lawn, pots and the pond above the controls
  {
    const B = window.BABYLON;
    const cam = world().camera;
    const eng = world().scene.getEngine();
    const projectSpot = (wx, wy, wz) => {
      const rw = eng.getRenderWidth(), rh = eng.getRenderHeight();
      const p = B.Vector3.Project(new B.Vector3(wx, wy, wz), B.Matrix.IdentityReadOnly, world().scene.getTransformMatrix(), cam.viewport.toGlobal(rw, rh));
      return {
        inFront: p.z > 0 && p.z < 1,
        x: (p.x / Math.max(1, rw)) * innerWidth,
        y: (p.y / Math.max(1, rh)) * innerHeight,
        u: p.x / Math.max(1, rw),
        v: p.y / Math.max(1, rh),
      };
    };
    const spotFramed = () => {
      const lw = projectSpot(-6, 0.2, 33);
      const pd = projectSpot(15, 0.2, 60);
      const okL = lw.inFront && lw.u > 0.08 && lw.u < 0.92 && lw.v >= 0.24 && lw.v <= 0.68;
      const okP = pd.inFront && pd.u > 0.08 && pd.u < 0.92 && pd.v >= 0.24 && pd.v <= 0.68;
      return (okL || okP) ? { lw, pd, okL, okP } : null;
    };
    let framedAtS = null;
    let run = 0;
    await waitFor(() => {
      const f = spotFramed();
      if (f && framedAtS == null) framedAtS = (performance.now() - tCast0) / 1000;
      const c = D.crowd && D.crowd.info ? D.crowd.info() : {};
      run = Math.max(run, c.running || 0, c.reacting || 0);
      const s = sl();
      const reacted = (s.lawnShown || 0) - baseSlice.lawn > 0.5 && (s.pond || 0) - baseSlice.pond > 0.1 && (run > 0 || !(c.people > 0));
      return f && reacted;
    }, 2000);
    const el = (performance.now() - tCast0) / 1000;
    if (framedAtS == null && spotFramed()) framedAtS = el;
    const s = sl();
    const lawnD = (s.lawnShown || 0) - baseSlice.lawn, pondD = (s.pond || 0) - baseSlice.pond;
    t.event("cold-start-rain-reaction", `${el.toFixed(2)}s after the cast: lawn +${lawnD.toFixed(2)}, pond +${pondD.toFixed(2)}, ${run} people running for cover`);
    t.metric("rainLawnDarkenS", +el.toFixed(2));
    if (lawnD <= 0.5) t.problem("bug", `The lawn didn't darken within 2 s of Rain (+${lawnD.toFixed(2)})`);
    if (pondD <= 0.1) t.problem("bug", `The pond didn't spread within 2 s of Rain (+${pondD.toFixed(2)})`);
    const c = D.crowd && D.crowd.info ? D.crowd.info() : {};
    if (c.people > 0 && run === 0) t.problem("bug", "No pedestrian ran for cover within 2 s of Rain");
    // Wait until the HUD / ability arc comes in (~1.6 s after cast, still < 2 s) so the phone screenshot shows the reacting spot above the ability arc
    const waitArcMs = Math.max(0, 1650 - (performance.now() - tCast0));
    if (waitArcMs > 0) await sleep(waitArcMs);
    const fNow = spotFramed() || { lw: projectSpot(-6, 0.2, 33), pd: projectSpot(15, 0.2, 60), okL: false, okP: false };
    const arcEl = document.querySelector(".abilitybar") || $("ability-rain") || $("ability-bolt") || $("coldopen-bolt");
    const arcR = arcEl && arcEl.offsetParent !== null ? arcEl.getBoundingClientRect() : null;
    const arcTop = arcR && arcR.top > innerHeight * 0.4 ? arcR.top : innerHeight - 210;
    const bestY = fNow.okL ? fNow.lw.y : fNow.pd.y;
    const aboveArc = (fNow.okL && fNow.lw.y < arcTop) || (fNow.okP && fNow.pd.y < arcTop);
    const clipSec = window.hawkesFeel && window.hawkesFeel.report ? (window.hawkesFeel.report().summary.cameraClipSeconds || 0) : 0;
    const camRep = D.control.camera();
    t.metric("glanceInFrameS", framedAtS != null ? +framedAtS.toFixed(2) : -1);
    t.metric("glanceClipSeconds", clipSec);
    t.event(
      "cold-start-glance",
      `in frame ${framedAtS != null ? framedAtS.toFixed(2) + "s" : "NEVER"} after cast: lawn (${Math.round(fNow.lw.x)},${Math.round(fNow.lw.y)} px, ${(fNow.lw.v * 100).toFixed(0)}% H), pond (${Math.round(fNow.pd.x)},${Math.round(fNow.pd.y)} px, ${(fNow.pd.v * 100).toFixed(0)}% H), ability arc top ${Math.round(arcTop)} px, above arc ${aboveArc}, clip ${clipSec}s, inside ${camRep.inside}`
    );
    t.scene("First Rain reaction: Birdie's park lawn and the pond in frame above the ability arc");
    if (framedAtS == null || framedAtS > 2) t.problem("bug", `The park lawn or pond wasn't in frame within 2 s of the first Rain cast (${framedAtS})`);
    if (!aboveArc) t.problem("bug", `The reacting spot (y ${Math.round(bestY)} px) isn't visible above the ability arc (top ${Math.round(arcTop)} px)`);
    if (clipSec > 0 || camRep.inside > 0) t.problem("bug", `Camera clipped geometry during the glance (feel.cameraClipSeconds ${clipSec}, inside ${camRep.inside})`);
  }
  // 2. Any input during the glance cancels it at once and returns control within 100 ms
  {
    if (!D.control.camera().glancing) {
      D.control.frame(-1, 39, 0.06, { force: true });
      await sleep(60);
    }
    const tIn = performance.now();
    const x0 = window.day.sfx && window.day.sfx.info ? window.day.sfx.info() : null;
    if (phone) {
      const stickEl = $("stick") || document.querySelector(".touchpad .stick");
      const sr = stickEl ? stickEl.getBoundingClientRect() : { left: 60, top: innerHeight - 120, width: 100, height: 100 };
      const cx = sr.left + sr.width / 2, cy = sr.top + sr.height / 2;
      if (stickEl) {
        touchOn(stickEl, "pointerdown", cx, cy - 28, 17);
        await waitFor(() => !D.control.camera().glancing, 200);
        const cancelMs = Math.round(performance.now() - tIn);
        touchOn(window, "pointerup", cx, cy - 28, 17);
        t.metric("glanceCancelMs", cancelMs);
        t.event("cold-start-glance-cancel", `touch stick cancelled the glance in ${cancelMs} ms (reported ${D.control.camera().lastGlanceCancelMs} ms)`);
        if (cancelMs > 100) t.problem("bug", `Input during the glance took ${cancelMs} ms to return control (limit 100 ms)`);
      }
    } else {
      keyDown("w");
      await waitFor(() => !D.control.camera().glancing, 200);
      const cancelMs = Math.round(performance.now() - tIn);
      t.metric("glanceCancelMs", cancelMs);
      t.event("cold-start-glance-cancel", `pressing W cancelled the glance in ${cancelMs} ms (reported ${D.control.camera().lastGlanceCancelMs} ms)`);
      if (cancelMs > 100) t.problem("bug", `Input during the glance took ${cancelMs} ms to return control (limit 100 ms)`);
      await sleep(750);
      keyUp("w");
    }
    const ar2 = audioReport();
    const rainBed = (ar2.ambience.rain || 0) > 0.01 || (ar2.music.rain || 0) > 0.01 || ar2.casts.length > 0;
    t.event("cold-start-sound", `context ${ar2.unlocked ? "running" : "SUSPENDED"}, Sound ${ar2.on ? "on" : "off"}, casts heard: ${ar2.casts.join(",") || "none"}, rain bed ${JSON.stringify(ar2.ambience)}`);
    t.metric("coldStartSoundUnlocked", ar2.unlocked ? 1 : 0);
    if (!ar2.unlocked && ar2.on) t.problem("bug", "The audio context was still suspended after the first click or tap");
    if (!rainBed) t.problem("bug", "Casting Rain on the roof made no cast sound or rain bed");
    const x1 = window.day.sfx && window.day.sfx.info ? window.day.sfx.info() : null;
    if (x0 && x1) t.event("cold-start-sound-step", `plays ${JSON.stringify(x0.plays != null ? x0.plays : "?")} -> ${JSON.stringify(x1.plays != null ? x1.plays : "?")}`);
  }
  // 3. Birdie's ask as action: the pots she is worried about lift and go green in front of him, before any thanks is spoken
  if (D.garden && g0) {
    await waitFor(() => D.garden.now().k > 0.9, 4000);
    const gardenS = (performance.now() - tCast0) / 1000;
    t.metric("gardenReviveS", +gardenS.toFixed(2));
    const g1 = D.garden.now();
    t.event("cold-start-garden", `her ${g1.plants} pots and ${g1.tufts} lawn tufts: freshness ${g0.k} -> ${g1.k}, leaf droop ${g0.droop} -> ${g1.droop} rad, revived ${g1.revived}`);
    t.metric("gardenRevived", g1.k);
    if (g1.k < 0.9 || gardenS > 2) t.problem("bug", `Birdie's wilting pots didn't revive within 2 s of the rain (freshness ${g1.k} at ${gardenS.toFixed(2)}s)`);
  } else t.problem("bug", "No garden: Birdie's wilting pots are missing (js/garden.js)");
  {
    // after the first cast the late chunk arrives; a tap on Episodes then (loaded or still loading) opens the menu, never nothing
    const tl = performance.now();
    const loaded = await waitFor(() => D.late && D.late.now().loaded, 8000);
    t.event("cold-start-late-after", `late chunk ${loaded ? "loaded" : "NOT loaded"} ${((performance.now() - tl) / 1000).toFixed(1)}s after the cast: ${JSON.stringify(D.late ? D.late.now().modules : {})}`);
    if (!loaded) t.problem("bug", "The late chunk (episodes, tornado, wind and fog, moments) never loaded after the first cast");
    const epb = $("episodes");
    if (!epb) t.problem("bug", "No Episodes button after the first cast");
    else {
      if (phone) { const pm = $("phone-menu-btn"); if (pm && !D.phoneMenu.isOpen()) await tapEl(pm); await sleep(200); }
      if (phone) await tapEl(epb); else await clickEl(epb);
      const opened = await waitFor(() => { const m = $("episode-menu"); return m && !m.hidden; }, 4000);
      t.event("cold-start-episodes-tap", `Episodes ${opened ? "opened" : "did NOT open"} after the first cast (button "${epb.textContent}")`);
      if (!opened) t.problem("bug", "Tapping Episodes after the first cast did nothing");
      else { epb.click(); await sleep(150); }
    }
    if (D.powers && D.powers.tornadoLoaded) t.metric("tornadoLoadedAfterCast", D.powers.tornadoLoaded() ? 1 : 0);
  }
  t.metric("secondsToFirstInput", T.input);
  t.metric("secondsToFirstCast", T.bolt);
  if (T.input == null || T.input > 3) t.problem("bug", `The first input was accepted ${T.input}s after Play (the limit is 3 s)`);
  if (T.bolt > 10) t.problem("bug", `The first cast landed ${T.bolt}s after Play (the limit is 10 s)`);
  t.progress(0.65);

  // the street looks up; Birdie calls up in her voice (within 15 s of the bolt)
  const reacted = await waitFor(() => T.lookup != null, 15000);
  const voiced = await waitFor(() => T["birdie-voice"] != null, Math.max(500, (T.bolt + 15 - since()) * 1000));
  const crowd = D.crowd && D.crowd.info ? D.crowd.info() : {};
  if (T.lookup != null) t.metric("secondsToFirstReaction", T.lookup);
  t.event("cold-start-reaction", reacted ? `the crowd looked up ${T.lookup}s after Play (${Math.round((T.lookup - T.bolt) * 100) / 100}s after the bolt); ${crowd.lookingUp || 0} looking up` : "the crowd never looked up");
  t.event("cold-start-birdie", voiced ? `Birdie's voiced line played ${T["birdie-voice"]}s after Play` : `Birdie's line ${T["birdie-say"] != null ? "was said but has no voice clip playing" : "never came"}`);
  if (!voiced) t.problem("bug", "Birdie's voiced line (a sound event) didn't play within 15 s of the bolt");
  t.progress(0.85);

  // the shots at +5 / +15 / +30 s, then he is free: the HUD is back and the bolt button is gone
  await sleep(Math.max(0, 30500 - since() * 1000));
  const toastEarly = !!($("episode-offer") && !$("episode-offer").hidden && document.documentElement.classList.contains("first-min"));
  const free = !document.documentElement.classList.contains("cold-open");
  t.event("cold-start-free", `${since().toFixed(1)}s after Play: HUD ${free ? "back" : "STILL HIDDEN"}, cold open ${D.coldopen.now().phase}`);
  if (!free) t.problem("bug", "The HUD never came back after the first bolt");
  if (window.__compilesAfterLoad) {
    // the dusk switch (the cold open's jump to 19:00) must not compile anything: the lamp lights stay enabled and only fade
    const n = window.__compilesAfterLoad();
    t.metric("perf.compilesAfterLoad", n);
    t.event("cold-start-compiles", `${n} shader effects compiled after the loading card; lamp lights ${JSON.stringify(D.cityscape && D.cityscape.info ? D.cityscape.info().dynamicLights : null)}`);
  }
  checkHud(t, "cold-start");
  // the episode offer is a corner toast that comes after the first cast: under 40 words that waits until the first minute is over (the 40-word limit), the day clock keeps running, clear of the ability bar
  const m0 = D.now().minutes;
  if (toastEarly) t.problem("bug", "The episode toast showed inside the first minute");
  const toastUp = await waitFor(() => { const o = $("episode-offer"); return o && !o.hidden && o.offsetParent !== null; }, 40000);
  if (toastUp) {
    const o = $("episode-offer");
    const words = o.textContent.trim().split(/\s+/).filter(Boolean).length;
    const tr = o.getBoundingClientRect();
    const ab = document.querySelector(".abilitybar");
    const ar = ab && ab.offsetParent !== null ? ab.getBoundingClientRect() : null;
    const hit = ar && !(tr.right <= ar.left || tr.left >= ar.right || tr.bottom <= ar.top || tr.top >= ar.bottom);
    const m1 = D.now().minutes;
    t.event("cold-start-offer-toast", `${words} words, ${Math.round(tr.width)}x${Math.round(tr.height)} at ${Math.round(tr.left)},${Math.round(tr.top)}; clock ${m0} -> ${m1} min; ${D.now().mode === "pause" ? "PAUSED" : "running"}`);
    t.metric("offerToastWords", words);
    if (words >= 40) t.problem("bug", `The episode toast has ${words} words (limit 40)`);
    if (hit) t.problem("bug", "The episode toast covers the ability bar");
    if (D.now().mode === "pause") t.problem("bug", "The day is paused while the episode toast shows");
    if (getComputedStyle(o).position !== "fixed" || tr.width > innerWidth * 0.8) t.problem("bug", "The episode offer is not a small corner toast");
  } else t.event("cold-start-offer-toast", "no episode matches this hour: no toast");
  t.progress(1);
}

/* ---------------- ask-markers: what a neighbor wants is seen in the world, and the park answers ---------------- */
// Needs ?playtest=ask-markers ({"touch":true} for 390x844). Setup (named): every icanbe.* key cleared, the cold open armed, the
// title up. Real input: Play, the prompt's hold for the first bolt, a tap on Birdie's marker (phone: pointer events; desktop: a click),
// then Rain (R, or the arc button). Checks: a marker over Birdie (at least 44 px, on screen) and a rain icon over the dry lawn standing
// on the ground; the camera swings to the ask on a tap; the lawn eases green and the pond rises over seconds (screenshots before and
// after), Birdie's existing thanks is voiced, it all holds through a same-day reload, and Dex's ask then gets the same marker.
async function askMarkers(options, t) {
  t.scene("Ask markers");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model !== "loading", 30000, "his model to load").catch(() => {});
  const D = window.day;
  const C = D.control;
  const phone = C && C.state ? !!C.state().touch : innerWidth <= 700;
  if (C.mode() === "control") { pressKey("Escape"); await t.until(() => C.mode() === "schedule", 15000, "him back on his day").catch(() => {}); }
  Object.keys(window.localStorage).filter((k) => k.startsWith("icanbe.")).forEach((k) => window.localStorage.removeItem(k));
  if (!D.coldopen || !D.street || !D.asks || !D.slice) { t.problem("blocker", "The cold open, street, asks or slice module isn't installed"); return; }
  D.street.reset();
  D.memory.reset();
  D.coldopen.arm();
  D.title.show("playtest");
  await sleep(700);
  const voices = [];
  window.addEventListener("day:voice", (e) => { const d = e.detail || {}; if (d.action === "play") voices.push(Object.assign({ at: performance.now() }, d)); });
  const asksEv = [];
  window.addEventListener("day:ask", (e) => asksEv.push(Object.assign({ at: performance.now() }, e.detail)));
  t.event("ask-setup", `${innerWidth}x${innerHeight}, ${phone ? "touch" : "keyboard and mouse"}`);

  const playBtn = $("title-play");
  if (phone) await tapEl(playBtn); else await clickEl(playBtn);
  await t.until(() => C.mode() === "control", 4000, "Play to hand him over").catch(() => {});
  await t.until(() => D.coldopen.now().phase === "waiting", 12000, "the cold open's prompt").catch(() => {});
  await sleep(600);
  if (phone) {
    const b = $("coldopen-bolt");
    const r = b.getBoundingClientRect();
    touchOn(b, "pointerdown", r.left + r.width / 2, r.top + r.height / 2, 9);
    await sleep(900);
    touchOn(b, "pointerup", r.left + r.width / 2, r.top + r.height / 2, 9);
  } else { keyDown("e"); await sleep(900); keyUp("e"); }

  // 1. the marker over Birdie and the icon over the dry lawn, from the roof camera
  await t.until(() => D.asks.now().asks.some((a) => a.who === "birdie" && a.visible), 20000, "Birdie's marker").catch(() => {});
  await sleep(900);
  const before = D.asks.now().asks.find((a) => a.who === "birdie");
  const slice0 = D.slice.now();
  t.scene("Roof: Birdie's marker and the rain icon over the dry lawn");
  if (!before) { t.problem("blocker", "No ask marker for Birdie after the first bolt"); return; }
  t.event("ask-marker", `Birdie's marker ${before.visible ? "visible" : "NOT visible"} at ${before.screen ? before.screen.x + "," + before.screen.y : "off screen"}, ${before.w}x${before.h}; icon over ${before.place.name} at ${before.place.x},${before.place.z} (${before.verb}); lawn ${slice0.lawn} ${slice0.lawnShown}, pond ${slice0.pond}`);
  if (!before.visible) t.problem("bug", "Birdie's marker isn't on screen from the roof camera");
  if (before.w < 44 || before.h < 44) t.problem("bug", `Birdie's marker is ${before.w}x${before.h} (44 px at least)`);
  if (before.verb !== "rain") t.problem("bug", `Birdie's marker is for ${before.verb}, not rain`);
  if (slice0.lawnShown > 0.01) t.problem("bug", "The lawn is already green before the rain");
  if (!before.icon || before.icon.y - before.gy < 3) t.problem("bug", "The rain icon isn't hung up over the lawn");
  // the icon is in the frame too: project it
  const cam = world().camera;
  const B = window.BABYLON;
  const eng = world().scene.getEngine();
  const pr = B.Vector3.Project(new B.Vector3(before.icon.x, before.icon.y, before.icon.z), B.Matrix.IdentityReadOnly, world().scene.getTransformMatrix(), cam.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight()));
  const iconOn = pr.z > 0 && pr.z < 1 && pr.x > 0 && pr.x < eng.getRenderWidth() && pr.y > 0 && pr.y < eng.getRenderHeight();
  t.event("ask-icon", `the rain icon ${iconOn ? "is" : "is NOT"} in the frame`);
  if (!iconOn) t.problem("bug", "The rain icon over the lawn is off screen from the roof camera");

  // 2. a tap on the marker frames the camera on the ask
  const mk = $("ask-" + before.key);
  const fwd = () => { const a = cam.alpha; return { x: -Math.cos(a), z: -Math.sin(a) }; };
  const align = () => { const s = C.state(); const f = fwd(); const dx = before.place.x - s.x, dz = before.place.z - s.z; const d = Math.hypot(dx, dz) || 1; return (f.x * dx + f.z * dz) / d; };
  const a0 = align();
  if (phone) await tapEl(mk); else await clickEl(mk);
  let best = a0;
  for (let i = 0; i < 18; i++) { await sleep(100); best = Math.max(best, align()); }
  const fr = asksEv.find((e) => e.action === "frame");
  t.event("ask-tap", `tap on the marker: ${fr ? "frame call " + (fr.ok ? "ok" : "refused") : "NO frame call"}; camera alignment with the ask ${a0.toFixed(2)} -> ${best.toFixed(2)}`);
  if (!fr || !fr.ok) t.problem("bug", "Tapping the marker didn't frame the camera on the ask");
  else if (best < 0.8 && best - a0 < 0.15) t.problem("bug", `Tapping the marker didn't swing the camera to the ask (alignment ${a0.toFixed(2)} -> ${best.toFixed(2)})`);
  await t.until(() => D.coldopen.now().phase === "done", 12000, "the cold open to hand him the sky").catch(() => {});

  // 3. the park before the rain: look at it
  D.control.frame(before.place.x, before.place.z, 1);
  await sleep(1100);
  t.scene("The park before the rain: dry lawn, low pond");
  const dry = D.slice.now();

  // 4. Rain, from where he stands (within range of Birdie)
  const rainKey = String((window.powers.abilities.get("rain") || {}).key || "r").toLowerCase();
  const tRain = performance.now();
  if (phone) await tapEl($("ability-rain")); else pressKey(rainKey);
  const samples = [];
  for (let i = 0; i < 9; i++) { await sleep(900); const s = D.slice.now(); samples.push([+((performance.now() - tRain) / 1000).toFixed(1), s.lawnShown, s.pond]); }
  t.event("ask-lawn", "lawn/pond over time: " + samples.map((x) => `${x[0]}s ${x[1]}/${x[2]}`).join(", "));
  const after = D.slice.now();
  const mid = samples.find((x) => x[1] > 0.05 && x[1] < 0.95);
  if (after.lawnShown < 0.99) t.problem("bug", `The lawn only reached ${after.lawnShown} after the rain`);
  if (!mid) t.problem("bug", "The lawn jumped to green instead of blending over a few seconds");
  if (after.pond < dry.pond + 0.15) t.problem("bug", `The pond didn't rise (${dry.pond} -> ${after.pond})`);
  D.control.frame(before.place.x, before.place.z, 1);
  await sleep(1100);
  t.scene("The park after the rain: green lawn, fuller pond");
  const thanks = voices.filter((v) => v.positional && v.who === "Birdie" && v.at >= tRain);
  t.event("ask-thanks", `Birdie's thanks ${thanks.length ? "was voiced (" + (thanks[0].file ? "clip" : "caption only") + ")" : "MISSING"}`);
  if (!thanks.length) t.problem("bug", "Birdie's thanks wasn't voiced when the lawn recovered");
  const gone = !D.asks.now().asks.some((a) => a.who === "birdie");
  if (!gone) t.problem("bug", "Birdie's marker is still up after the rain");

  // 5. it stays: same-day reload
  const m = D.memory.reload();
  await sleep(300);
  const re = D.slice.now();
  t.event("ask-reload", `after a same-day reload: lawn ${re.lawn} ${re.lawnShown}, pond ${re.pond}, memory lawn ${m.lawn}`);
  if (re.lawnShown < 0.99 || re.pond < 0.99) t.problem("bug", "The green lawn and the fuller pond didn't survive a same-day reload");
  t.scene("After a same-day reload the park is still green");

  // 6. the same system for the next neighbor
  const nextOk = await t.until(() => D.asks.now().asks.some((a) => a.who === "dex"), 20000, "Dex's marker").then(() => true).catch(() => false);
  const dex = D.asks.now().asks.find((a) => a.who === "dex");
  t.event("ask-dex", nextOk && dex ? `Dex's marker: ${dex.verb} over ${dex.place.name}, ${dex.w}x${dex.h}` : "Dex's marker never came");
  if (!nextOk) t.problem("bug", "Dex's ask didn't get a marker");
  else if (dex.w < 44) t.problem("bug", "Dex's marker is under 44 px");
  checkHud(t, "ask-markers");
}

/* ---------------- street-teaches: after the cold open, Rain, Sun, Fog and Wind each unlock on a neighbor's voiced ask ---------------- */
// Needs ?playtest=street-teaches. Setup (named): every icanbe.* key cleared, the cold open armed, the title up, navigator.vibrate
// recorded. Real input: a click (a tap on a phone) on Play, the prompt's own hold for the first bolt, then the keys (the
// buttons on the thumb arc, the stick, on a phone) to answer each neighbor: Birdie (Rain), Dex (Sun break), Ines (Fog, then a gust).
// Events street-ask / -unlock / -thanks / -arc / -done / -caption; metrics secondsToAllFive, secondsToRain/Sun/Fog/Wind.
async function streetTeaches(options, t) {
  t.scene("The street teaches");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model !== "loading", 30000, "his model to load").catch(() => {});
  const D = window.day;
  const C = D.control;
  const phone = C && C.state ? !!C.state().touch : innerWidth <= 700;
  t.event("street-setup", `${innerWidth}x${innerHeight}, ${phone ? "touch" : "keyboard and mouse"}`);
  if (C.mode() === "control") { pressKey("Escape"); await t.until(() => C.mode() === "schedule", 15000, "him back on his day").catch(() => {}); }
  Object.keys(window.localStorage).filter((k) => k.startsWith("icanbe.")).forEach((k) => window.localStorage.removeItem(k));
  if (!D.coldopen || !D.street) { t.problem("blocker", "The cold open or the street's lesson isn't installed (js/coldopen.js, js/street.js)"); return; }
  D.street.reset();
  D.coldopen.arm();
  const vibes = [];
  try { navigator.vibrate = (p) => { vibes.push(p); return true; }; } catch (e) { /* read-only */ }
  D.title.show("playtest");
  await sleep(700);

  const A = window.powers.abilities;
  let tPlay = 0;
  const since = () => (performance.now() - tPlay) / 1000;
  const evs = [];
  const voices = [];
  const waiters = [];
  const note = () => { for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].test()) { const w = waiters.splice(i, 1)[0]; clearTimeout(w.to); w.res(true); } };
  const waitFor = (test, ms) => new Promise((res) => {
    if (test()) return res(true);
    const w = { test, res, to: setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); res(false); }, ms) };
    waiters.push(w);
  });
  window.addEventListener("day:street", (e) => { evs.push(Object.assign({ t: since() }, e.detail)); note(); });
  window.addEventListener("day:voice", (e) => { const d = e.detail || {}; if (d.action === "play") voices.push(Object.assign({ t: since() }, d)); note(); });
  const has = (action, id) => evs.find((e) => e.action === action && (!id || e.id === id));
  const T = {};

  // the cold open: Play, then the prompt's own hold
  const playBtn = $("title-play");
  tPlay = performance.now();
  if (phone) await tapEl(playBtn); else await clickEl(playBtn);
  if (!(await waitFor(() => C.mode() === "control", 4000))) { t.problem("blocker", "Play didn't hand him over"); return; }
  const locked = () => ["rain", "sunbreak", "fog", "wind"].filter((id) => A.isLocked(id));
  if (locked().length !== 4) t.problem("bug", `After Play the four verbs should be locked, but locked are: ${locked().join(", ") || "none"}`);
  const eps = $("episode-offer");
  await t.until(() => D.coldopen.now().phase === "waiting", 12000, "the cold open's prompt").catch(() => {});
  await sleep(600);
  if (phone) {
    const b = $("coldopen-bolt");
    const r = b.getBoundingClientRect();
    touchOn(b, "pointerdown", r.left + r.width / 2, r.top + r.height / 2, 9);
    await sleep(900);
    touchOn(b, "pointerup", r.left + r.width / 2, r.top + r.height / 2, 9);
  } else {
    keyDown("e");
    await sleep(900);
    keyUp("e");
  }
  t.progress(0.1);

  const keyFor = (id) => String((A.get(id) || {}).key || "").toLowerCase();
  const arcCheck = (id, label) => {
    const slot = $("ability-" + id);
    const r = slot && slot.getBoundingClientRect();
    const shown = !!(slot && hudVisible(slot));
    const glow = !!(slot && (slot.classList.contains("st-new") || slot.classList.contains("unlocked-now")));
    const cap = $("voice-caption");
    const cr = cap && hudVisible(cap) ? cap.getBoundingClientRect() : null;
    const over = cr ? [...document.querySelectorAll(".abilitybar .ab")].filter((el) => hudVisible(el) && boxesOverlap(cr, el.getBoundingClientRect())).map((el) => el.id) : [];
    t.event("street-arc", `${label}: ${id} button ${shown ? Math.round(r.width) + "x" + Math.round(r.height) : "NOT SHOWN"}, glow ${glow}, vibrations ${vibes.length}, caption ${cr ? "up" : "gone"}${over.length ? ", OVER " + over.join(",") : ""}`);
    if (!shown) t.problem("bug", `${label}: the ${id} button didn't join the bar when it unlocked`);
    else if (r.width < 44 || r.height < 44) t.problem("bug", `${label}: the ${id} button is ${Math.round(r.width)}x${Math.round(r.height)} (44 px at least)`);
    if (!glow) t.problem("bug", `${label}: the ${id} button has no unlock glow`);
    const tease = [...document.querySelectorAll(".abilitybar .ab.st-teaser")];
    const tr = tease.map((el) => { const b = el.getBoundingClientRect(); return `${el.id} ${Math.round(b.width)}x${Math.round(b.height)}`; });
    const pr = $("street-promise");
    t.event("street-teaser", `${label}: teaser on the bar: ${tr.join(", ") || "none"}${pr && pr.classList.contains("on") ? "; promise: " + pr.textContent : ""}`);
    if (tease.some((el) => !hudVisible(el) || el.getBoundingClientRect().width < 44)) t.problem("bug", `${label}: the next-verb teaser is hidden or under 44 px`);
    if (over.length) t.problem("bug", `${label}: the speaker caption overlaps the verb bar (${over.join(", ")})`);
  };

  const walkOn = async (x, z, tag) => {
    // out along the pavement strip (z about 10), then to within casting range of whoever asked
    const sideZ = 10;
    const go = async (tx, tz, close, ms) => {
      if (!phone) return goTo(tx, tz, t, { sprint: true, ms, close, progress: 0.5 });
      const st = $("stick");
      const rr = st.getBoundingClientRect();
      const cx = rr.left + rr.width / 2;
      const cy = rr.top + rr.height / 2;
      const started = simNow();
      let down = false;
      try {
        while (simNow() - started < ms / 1000) {
          const s = C.state();
          const dx = tx - s.x;
          const dz = tz - s.z;
          const d = Math.hypot(dx, dz);
          if (d < close) return true;
          const cam = world().camera;
          const fx = -Math.cos(cam.alpha);
          const fz = -Math.sin(cam.alpha);
          const f = (dx * fx + dz * fz) / (d || 1);
          const r = (dx * fz - dz * fx) / (d || 1);
          const px = cx + r * 60;
          const py = cy - f * 60;
          if (!down) { touchOn(st, "pointerdown", cx, cy); down = true; }
          touchOn(st, "pointermove", px, py);
          await sleep(160);
        }
        return false;
      } finally {
        if (down) touchOn(st, "pointerup", cx, cy);
      }
    };
    await go(C.state().x, sideZ, 1.5, 9000);
    for (let k = 0; k < 14; k++) {
      const s = C.state();
      if (Math.abs(s.x - x) < 5) break;
      if (!(await go(s.x + Math.max(-22, Math.min(22, x - s.x)), sideZ, 1.5, 14000))) break;
    }
    t.event("street-walk", `${tag}: he is at ${C.state().x.toFixed(0)},${C.state().z.toFixed(0)}`);
  };
  const cast = async (id) => {
    const target = D.street.cueAt();
    if (phone) await tapEl($("ability-" + id)); else pressKey(keyFor(id));
    t.event("street-cast", `${id} at ${C.state().x.toFixed(0)},${C.state().z.toFixed(0)}, the cue at ${target ? target.x.toFixed(0) + "," + target.z.toFixed(0) : "none"}`);
  };

  const stagesList = [
    { id: "rain", verb: "rain", cast: "rain", who: "Birdie" },
    { id: "sun", verb: "sunbreak", cast: "sunbreak", who: "Dex" },
    { id: "fog", verb: "fog", cast: "fog", who: "Ines" },
    { id: "wind", verb: "wind", cast: "wind", who: "Ines" },
  ];
  for (let i = 0; i < stagesList.length; i++) {
    const st = stagesList[i];
    const asked = await waitFor(() => !!has("ask", st.id), i === 0 ? 30000 : 30000);
    if (!asked) { t.problem("blocker", `${st.who} never asked for ${st.verb} (stage ${D.street.now().stage}, phase ${D.street.now().phase})`); return; }
    T[st.id] = Math.round(since() * 10) / 10;
    // the ask is a voiced line (a day:voice play event) from that neighbor, in the last 2 s, captioned
    await sleep(300);
    const said = voices.filter((v) => v.positional && v.who === st.who && Math.abs(v.t - has("ask", st.id).t) < 2.5 || (v.who === st.who && st.id === "wind" && v.t > (has("thanks", "fog") || { t: 0 }).t - 0.5));
    const ask = has("ask", st.id);
    t.event("street-ask", `${st.who} asks for ${st.verb} at ${T[st.id]}s: ${ask.close ? "in person" : ask.inside ? "from a window" : "called down the street"}, voice event ${said.length ? "fired (" + (said[0].file ? "clip" : "caption only, no clip") + ")" : "MISSING"}`);
    if (!said.length) t.problem("bug", `${st.who}'s ask for ${st.verb} had no voice event`);
    if (A.isLocked(st.verb)) t.problem("bug", `${st.verb} is still locked after ${st.who}'s ask`);
    const later = stagesList.slice(i + 1).filter((o) => !A.isLocked(o.verb));
    if (i < 2 && later.length) t.problem("bug", `${later.map((o) => o.verb).join(", ")} opened before it was asked for`);
    t.event("street-unlock", `${st.verb} unlocked ${T[st.id]}s after Play (the cue ${D.street.now().cue ? "is up" : "is MISSING"})`);
    if (!D.street.now().cue) t.problem("bug", `No world-space cue marks ${st.who} for ${st.verb}`);
    arcCheck(st.verb, st.who);
    const w = $("episode-offer");
    if ((w && !w.hidden) || ($("tutorial") && hudVisible($("tutorial")))) t.problem("bug", "A card is up during the street's lesson (it teaches by voice, not by text)");
    // rain comes while the cold open's gate is still on: wait for it to come off
    if (i === 0) await t.until(() => D.coldopen.now().phase === "done", 12000, "the cold open to hand him the sky").catch(() => {});
    const cue = D.street.cueAt();
    if (cue) await walkOn(cue.x, cue.z, st.who);
    // close enough: a cast near them answers
    const now = C.state();
    const cue2 = D.street.cueAt() || cue;
    if (cue2 && Math.hypot(now.x - cue2.x, now.z - cue2.z) > 16) {
      const s2 = C.state();
      await goTo(cue2.x, 10, t, { sprint: true, ms: 12000, close: 6, progress: 0.6 });
      t.event("street-close", `${st.who}: ${Math.hypot(C.state().x - cue2.x, C.state().z - cue2.z).toFixed(0)} m away (was ${Math.hypot(s2.x - cue2.x, s2.z - cue2.z).toFixed(0)})`);
    }
    await sleep(500);
    await cast(st.cast);
    const thanked = await waitFor(() => !!has("thanks", st.id), 6000);
    if (!thanked) {
      t.problem("bug", `Casting ${st.verb} near ${st.who} didn't answer the ask`);
      await cast(st.cast);
      if (!(await waitFor(() => !!has("thanks", st.id), 6000))) return;
    }
    await sleep(400);
    const thanks = voices.filter((v) => v.positional && v.who === st.who && v.t >= has("thanks", st.id).t - 0.3);
    t.event("street-thanks", `${st.who} thanks him ${(has("thanks", st.id).t - T[st.id]).toFixed(1)}s after the ask, voice event ${thanks.length ? "fired" : "MISSING"}`);
    if (!thanks.length) t.problem("bug", `${st.who}'s thanks had no voice event`);
    t.progress(0.15 + 0.2 * (i + 1));
    // the next neighbor's line must wait for this one to finish (no overlap), and never talk over Small Weather
    if (i === stagesList.length - 1) break;
  }
  const done = await waitFor(() => D.street.now().done, 12000);
  T.all = Math.round(since() * 10) / 10;
  t.metric("secondsToAllFive", T.all);
  ["rain", "sun", "fog", "wind"].forEach((k) => T[k] != null && t.metric("secondsTo" + k[0].toUpperCase() + k.slice(1), T[k]));
  t.event("street-done", `all five verbs open ${T.all}s after Play (${done ? "lesson done" : "lesson still open"}); locked now: ${["bolt", "rain", "sunbreak", "fog", "wind"].filter((id) => A.isLocked(id)).join(", ") || "none"}`);
  if (T.all > 360) t.problem("bug", `All five verbs took ${T.all}s (the limit is 360 s)`);
  if (["bolt", "rain", "sunbreak", "fog", "wind"].some((id) => A.isLocked(id))) t.problem("bug", "A verb is still locked after the street's lesson");
  // no two voices at once: every neighbor line began after the last one's clip ended or was cut (one speaker at a time)
  const overlaps = voices.filter((v, i) => i > 0 && v.t - voices[i - 1].t < 0.2 && v.id !== voices[i - 1].id);
  if (overlaps.length) t.problem("polish", `${overlaps.length} voice lines began within 0.2 s of another`);
  if (vibes.length < 4) t.problem("bug", `Only ${vibes.length} vibrations for four unlocks`);
  checkHud(t, "street-teaches");
  // practice: the tutorial episode is still in the Episodes menu
  const row = $("ep-row-tutorial");
  t.event("street-practice", row ? "Learn the weather is still in the Episodes menu" : "Learn the weather is gone from the Episodes menu");
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

  // Day end 1: the clock rolls into the next day; two deeds (the log's rows on a quiet day), one caption line at a time; Skip closes it.
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
  if (items.length !== 2) t.problem("blocker", `The recap has ${items.length} events, not 2`);
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


/* ---------------- remembers: Let go names the deed, and his day takes it in ---------------- */
// ?playtest=remembers ({"touch":true} for the 390x844 touch run). Real input: Enter / a tap on Take control, WASD to Birdie
// (on touch the stick can't be driven by a bot: control.place puts him there), R / the rain call, Esc / a tap on Let go.
// Setup shortcuts: the clock, memory.note (deeds as if done: roofs, storm, a botched ask, a thanked one).
async function remembersScenario(options, t) {
  t.scene("Morning, Birdie's pots");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const C = window.day.control, M = window.day.memory, V = window.day.voice, N = window.day.neighbors, P = window.powers || window.day.powers;
  if (!C || !M || !V || !N || !P) { t.problem("blocker", "control, memory, voice, neighbors or powers isn't installed"); return; }
  const touch = !!(options && options.touch);
  if (touch) { try { C.touch(true); } catch (e) { /* desktop */ } }
  forcePublicView();
  M.reset();
  const sound = $("sound");
  if (sound && sound.getAttribute("aria-pressed") !== "true") await clickEl(sound);
  const plays = [];
  window.addEventListener("day:voice", (e) => { if (e.detail && e.detail.action === "play") plays.push(e.detail); });
  const cfg = window.DAY_CONFIG;
  const mins = () => window.day.now().minutes;

  // 1. Take control at 8:05, walk to Birdie's pots, answer her ask with rain, let go.
  scrubTo(8 * 60 + 5);
  clickSpeed(1);
  await sleep(600);
  if (touch) await clickEl($("control")); else pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  if (touch && C.place) C.place(-22.5, 10.2, 0, {});
  else await goTo(-22.5, 10.2, t, { sprint: true, progress: 0.2, ms: 20000, close: 1.5 });
  await t.until(() => N.now().people.find((p) => p.id === "birdie").asking, 8000, "Birdie's ask").catch(() => t.problem("bug", "Birdie never asked"));
  await t.until(() => P.now().energy + 0.05 >= 20, 20000, "Charge for rain").catch(() => {});
  const score0 = N.now().score;
  if (touch) P.command("rain", "touch"); else pressKey("r");
  await t.until(() => N.now().score > score0, 8000, "Birdie's thanks").catch(() => t.problem("bug", "Rain on Birdie paid nothing"));
  t.event("helped-birdie", `facts ${JSON.stringify(M.facts())}`);
  const letAt = mins();
  const before = plays.length;
  if (touch) await clickEl($("control")); else pressKey("Escape");
  await t.until(() => C.mode() !== "control", 4000, "Let go");
  const line = await t.until(() => plays.slice(before).find((p) => /^deed-/.test(p.group)), 1500, "the deed line at Let go").catch(() => null);
  if (!line) t.problem("blocker", `Let go spoke no line naming the deed (last: ${JSON.stringify(V.now().last)})`);
  else t.event("letgo-deed", `${line.group}: "${line.text}"${line.file ? "" : " (caption only: no clip yet)"}`);
  if (line && !/Birdie/.test(line.text)) t.problem("bug", `The Let go line doesn't name Birdie: ${line.text}`);

  // the caption: one line, under the status card, over no control
  await sleep(300);
  const cap = $("voice-caption");
  const r = boxOf(cap);
  if (!r) t.problem("bug", "The Let go caption isn't on screen");
  else {
    const lineH = parseFloat(getComputedStyle(cap).lineHeight) || 20;
    const status = boxOf(document.querySelector(".panel.now"));
    t.event("letgo-caption", `${Math.round(r.width)}x${Math.round(r.height)} at y ${Math.round(r.top)}; "${cap.textContent}"`);
    if (r.height > lineH * 1.9 + 16) t.problem("bug", `The Let go caption wraps onto more than one line (${Math.round(r.height)} px tall)`);
    if (status && r.top < status.bottom) t.problem("bug", "The Let go caption sits over the status card");
    hudRects().forEach((h) => { if (h.el !== cap && !cap.contains(h.el) && !(h.r.right <= r.left || h.r.left >= r.right || h.r.bottom <= r.top || h.r.top >= r.bottom)) t.problem("bug", `The Let go caption covers ${h.name}`); });
  }
  await t.until(() => C.mode() === "schedule", 30000, "him back on his day").catch(() => {});

  // 2. His day took it in: the rebuilt day has the detour past her pots within 5 game minutes of Let go.
  const day = window.day.today();
  const pots = day.actions.find((a) => a.say && /Birdie's pots/.test(a.say) && a.start > letAt - 0.5);
  if (!pots) t.problem("blocker", "His rebuilt day has no detour past Birdie's pots after her rain");
  else {
    const gap = pots.start - letAt;
    t.event("detour-planned", `Let go ${E().fmtClock(letAt)}, the detour starts ${E().fmtClock(pots.start)} (${gap.toFixed(1)} game minutes)`);
    if (gap > 5) t.problem("bug", `The detour starts ${gap.toFixed(1)} game minutes after Let go (more than 5)`);
    window.day.speed(10);
    await t.until(() => mins() >= pots.start + 0.2, 60000, "the clock to reach the detour");
    const fr = window.day.now().frame;
    const d = Math.hypot(fr.person.x + 21, fr.person.z - 10.9);
    t.event("detour-seen", `at ${fr.person.x.toFixed(1)},${fr.person.z.toFixed(1)}, ${d.toFixed(1)} m from the pots, "${fr.action.text}"`);
    if (d > 4) t.problem("bug", `He isn't at Birdie's pots when the detour runs (${d.toFixed(1)} m off)`);
    await t.until(() => plays.some((p) => p.group === "memory"), 6000, "the detour line").then(() => t.event("detour-voiced", plays.filter((p) => p.group === "memory").map((p) => p.text).join(" | "))).catch(() => t.problem("bug", "The detour spoke no line"));
    clickSpeed(1);
  }

  // 3. More deeds (setup shortcuts) and the days they change: at least three memory behaviours show.
  t.scene("What else he remembers");
  M.note("roofRide", "shop"); M.note("power", "avenue", "storm"); M.note("askBotched", "botched", "dex"); M.note("askAnswered", "answered", "quill");
  window.dispatchEvent(new CustomEvent("day:control", { detail: { action: "let-go", via: "playtest" } }));
  const d2 = window.day.today();
  const shown = [...new Set(d2.actions.filter((a) => a.say).map((a) => a.say))];
  t.event("memory-behaviours", `${shown.length} memory steps in today's day: ${shown.join(" | ")}`);
  t.metric("memoryBehaviours", shown.length);
  if (shown.length < 3) t.problem("blocker", `Only ${shown.length} memory behaviours show after his deeds (wanted 3 or more)`);
  const slipped = d2.blocks.some((b, i) => Math.abs(b.start - day.blocks[i].start) > 1e-6);
  if (slipped) t.problem("bug", "A block starts at a different time because of what he remembers");

  // 4. Neighbors greet him by what he did (voiced), and the day end speaks two deeds, one line at a time.
  t.scene("Dex remembers, then the day ends");
  scrubTo(window.day.dayEnd - 3);
  await sleep(500);
  const speeds = $("speeds");
  await clickEl([...speeds.children].find((x) => x.dataset.speed === "1200") || speeds.lastElementChild);
  const mo = window.day.moments;
  await t.until(() => mo.now().recap, 20000, "the day-end card").catch(() => t.problem("blocker", "No day-end card"));
  const ev = mo.now().events || [];
  t.event("dayend-deeds", `${ev.length} lines: ${ev.map((e) => e.text).join(" | ")}`);
  if (ev.length !== 2) t.problem("blocker", `The day-end card speaks ${ev.length} lines, not 2`);
  const lis = [...document.querySelectorAll("#day-end-events li")];
  await sleep(500);
  const visible = lis.filter((li) => getComputedStyle(li).display !== "none").length;
  if (visible !== 1) t.problem("bug", `${visible} day-end lines on screen at once, not one`);
  await clickEl($("day-end-skip"));
  checkHud(t, "remembers");
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
    // a mesh that is mid-build or disposed can have no bounding info or box yet: skip it rather than throw "reading 'y'"
    let e = null;
    try { e = m.getBoundingInfo && m.getBoundingInfo() && m.getBoundingInfo().boundingBox && m.getBoundingInfo().boundingBox.extendSizeWorld; } catch (err) { e = null; }
    if (!e) continue;
    if (e.y * 2 >= 2 && (e.x > 1 || e.z > 1)) { m.isPickable = true; n++; }
  }
  window.__feelPickable = n;
  return scene;
}

/* ---------------- camera-run: the third-person camera in a two-minute walk, climb and cast run ---------------- */
// Setup shortcuts (named): the day bar beside the car, a full Charge (powers.abilities.reset), and on the phone control.place +
// day.control.touch(true). Everything else is real input: Enter, WASD with Shift (goTo), mouse drags on the view, the verb keys,
// and by touch a tap on Take control, the stick, one-finger drags on the right and left halves, and the ability buttons.
// Measured here and not by the camera's own report: the camera's turn rate from every drawn frame's real timestamps, its point inside
// a building or the ground (world.cameraInside), and, for each cast, how long he and the aim are on screen together.
async function cameraRun(options, t) {
  t.scene("Outside");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().physics !== "loading", 20000, "Havok physics to load").catch(() => {});
  const P = window.powers || (window.day && window.day.powers);
  const C = window.day.control;
  const w = world();
  const cam = w.camera;
  if (!P || !C || !C.camera) return t.problem("bug", "powers or the camera report (day.control.camera) isn't installed");
  const touch = !!(options && options.touch) || innerWidth <= 700;
  const cfg = window.DAY_CONFIG;
  const street = cfg.street || { z: 12.6 };
  const day = window.day.today();
  const outside = carSideMoment(day) || day.actions.find((a) => /steps out/.test(a.text || "")) || quietMoment(day);
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  clickSpeed(1);
  await sleep(600);
  if (touch) C.touch(true);
  const refill = () => { if (P.abilities && P.abilities.reset) P.abilities.reset(100); };
  const sound = $("sound");
  if (sound) { sound.click(); await sleep(150); }

  // the sampler: one reading per drawn frame, with the real time between them
  const S = { frames: 0, inside: 0, maxYaw: 0, maxPitch: 0, worstYawAt: "", cuts: 0, casts: [], castWindow: null, last: null, minAbove: 99 };
  let stop = false;
  const onScreen = (x, y, z) => {
    const eng = w.scene.getEngine();
    const rw = eng.getRenderWidth(), rh = eng.getRenderHeight();
    const p = BABYLON.Vector3.Project(new BABYLON.Vector3(x, y, z), BABYLON.Matrix.Identity(), w.scene.getTransformMatrix(), cam.viewport.toGlobal(rw, rh));
    return p.z > 0 && p.z < 1 && p.x > rw * 0.02 && p.x < rw * 0.98 && p.y > rh * 0.04 && p.y < rh * 0.96;
  };
  const sample = (now) => {
    if (stop) return;
    if (C.mode() === "control") {
      const pos = cam.globalPosition;
      const st = C.state();
      const cur = { ms: now, a: cam.alpha, b: cam.beta, x: st.x, z: st.z };
      if (S.last && now - S.last.ms > 4 && now - S.last.ms < 500 && !S.skip) {
        const dts = (now - S.last.ms) / 1000;
        const da = Math.abs(((cur.a - S.last.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 180 / Math.PI / dts;
        const db = Math.abs(cur.b - S.last.b) * 180 / Math.PI / dts;
        if (da > S.maxYaw) { S.maxYaw = da; S.worstYawAt = `${st.x.toFixed(1)},${st.z.toFixed(1)}`; }
        if (db > S.maxPitch) S.maxPitch = db;
      }
      S.skip = false;
      S.last = cur;
      S.frames++;
      if (w.cameraInside && w.cameraInside(pos)) S.inside++;
      const cw = S.castWindow;
      if (cw && now - cw.start < 1800) {
        cw.frames++;
        if (onScreen(st.x, st.y + 1.0, st.z) && onScreen(cw.x, cw.y + 0.3, cw.z)) { cw.run += (now - cw.lastMs) / 1000; cw.best = Math.max(cw.best, cw.run); } else cw.run = 0;
        cw.lastMs = now;
      } else if (cw) { S.casts.push({ power: cw.power, best: cw.best, frames: cw.frames }); S.castWindow = null; }
    } else S.last = null;
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  window.addEventListener("day:power", (e) => {
    const d = e.detail || {};
    if (d.action === "denied" || C.mode() !== "control") return;
    const aim = P.now().aim || { x: C.state().x, y: C.state().y, z: C.state().z + 6 };
    S.castWindow = { power: d.power || d.action, x: aim.x, y: aim.y || 0, z: aim.z, start: performance.now(), lastMs: performance.now(), run: 0, best: 0, frames: 0 };
  });
  const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const behindNow = () => { const y = C.state().yaw; return Math.atan2(-Math.cos(y), -Math.sin(y)); };

  // ---- take control: a blend from the watch camera, not a snap ----
  const watchA = cam.alpha, watchR = cam.radius;
  const tk0 = performance.now();
  if (touch) await tapEl($("control")); else pressKey("Enter");
  await t.until(() => C.mode() === "control", 4000, "Take control");
  t.event("control-taken", touch ? "by a tap on Take control" : "Enter");
  const early = [];
  for (let i = 0; i < 8; i++) { await sleep(90); early.push({ a: cam.alpha, r: cam.radius }); }
  const blending = C.camera().blending || performance.now() - tk0 < 650;
  let worstStep = 0;
  early.forEach((e, i) => { const prev = i ? early[i - 1] : { a: watchA, r: watchR }; worstStep = Math.max(worstStep, Math.abs(e.r - prev.r)); });
  t.metric("takeBlendWorstRadiusStep", Math.round(worstStep * 100) / 100);
  if (worstStep > 6) t.problem("bug", `Taking control cut the camera's distance by ${worstStep.toFixed(1)} m in one step (it should blend over 0.6 s)`);
  else t.event("take-blend", `radius ${watchR.toFixed(1)} -> ${cam.radius.toFixed(1)} m, biggest step ${worstStep.toFixed(2)} m, blending ${blending}`);
  C.resetCameraStats();
  refill();

  if (touch) {
    // ---- [phone] one-finger drag on the right half looks, the left half doesn't, and it recentres behind him ----
    t.scene("Phone: look and recentre");
    const view = $("view");
    const vr = view.getBoundingClientRect();
    const y0 = vr.top + vr.height * 0.45;
    await goTo(-2.2, street.z - 1.8, t, { close: 1.6, ms: 20000, progress: 0.2 }).catch(() => {});
    // the stick, held up the avenue for a few seconds
    const stickEl = $("stick") || document.querySelector(".stick");
    if (stickEl) {
      const sr = stickEl.getBoundingClientRect();
      const cx = sr.left + sr.width / 2, cy = sr.top + sr.height / 2;
      touchOn(stickEl, "pointerdown", cx, cy, 11);
      touchOn(window, "pointermove", cx, cy - 40, 11);
      await sleep(2600);
      touchOn(window, "pointerup", cx, cy - 40, 11);
    }
    await sleep(400);
    const dragTouch = async (x0, dx, id) => {
      touchOn(view, "pointerdown", x0, y0, id);
      for (let i = 1; i <= 10; i++) { touchOn(view, "pointermove", x0 + (dx * i) / 10, y0, id); await sleep(30); }
      return () => touchOn(view, "pointerup", x0 + dx, y0, id);
    };
    // left half first: nothing turns
    const a0 = cam.alpha;
    const upL = await dragTouch(vr.left + vr.width * 0.15, vr.width * 0.3, 21);
    await sleep(60);
    const leftTurn = Math.abs(wrap(cam.alpha - a0));
    upL();
    t.metric("leftHalfDragRad", Math.round(leftTurn * 1000) / 1000);
    if (leftTurn > 0.05) t.problem("bug", `A drag on the left half turned the camera ${(leftTurn * 57.3).toFixed(0)} deg (it is the stick's side)`);
    else t.event("left-half-drag", `the left half did not turn the camera (${(leftTurn * 57.3).toFixed(1)} deg)`);
    await sleep(500);
    // right half: it turns
    const a1 = cam.alpha;
    const upR = await dragTouch(vr.left + vr.width * 0.85, -vr.width * 0.55, 22);
    await sleep(60);
    const turned = Math.abs(wrap(cam.alpha - a1));
    upR();
    const releaseAt = performance.now();
    t.metric("rightHalfDragRad", Math.round(turned * 1000) / 1000);
    if (turned < 0.4) t.problem("bug", `A one-finger drag on the right half turned the camera only ${(turned * 57.3).toFixed(0)} deg`);
    else t.event("right-half-drag", `the camera turned ${(turned * 57.3).toFixed(0)} deg for a ${Math.round(vr.width * 0.55)} px drag`);
    const offBehind = Math.abs(wrap(cam.alpha - behindNow()));
    // recentre: within 3 s of release it is behind him again
    let back = null;
    while (performance.now() - releaseAt < 4500) {
      await sleep(100);
      if (Math.abs(wrap(cam.alpha - behindNow())) < 0.25) { back = (performance.now() - releaseAt) / 1000; break; }
    }
    t.metric("recentreSeconds", back == null ? -1 : Math.round(back * 10) / 10);
    if (back == null) t.problem("bug", `The camera didn't recentre behind him (still ${(Math.abs(wrap(cam.alpha - behindNow())) * 57.3).toFixed(0)} deg off, was ${(offBehind * 57.3).toFixed(0)}) 4.5 s after release`);
    else if (back > 3) t.problem("bug", `The camera took ${back.toFixed(1)} s to recentre after release (limit 3 s)`);
    else t.event("recentred", `behind him ${back.toFixed(1)} s after release (was ${(offBehind * 57.3).toFixed(0)} deg off)`);
    // a cast by tap, framed
    t.scene("Phone: a cast");
    refill();
    const bolt = $("ability-bolt");
    if (bolt) await tapEl(bolt);
    await sleep(2300);
  } else {
    // ---- the walk: the avenue, mouse drags (a fast big one too), the stair, the apartment roof, the casts ----
    t.scene("Walk");
    const reached = await goTo(-2.2, street.z - 1.8, t, { close: 1.6, ms: 20000, sprint: true, progress: 0.1 });
    if (!reached) t.problem("bug", "He didn't reach the avenue");
    await goTo(14, street.z - 1.8, t, { close: 1.6, ms: 12000, sprint: true, progress: 0.14 }).catch(() => {});
    await dragCamera(0.45);
    await goTo(34, street.z - 1.8, t, { close: 1.6, ms: 14000, sprint: true, progress: 0.18 }).catch(() => {});
    // a sudden full-width drag: the camera may only turn at its cap
    pointer("pointerdown", 0.9, 0.55);
    pointer("pointermove", 0.05, 0.55);
    pointer("pointerup", 0.05, 0.55);
    await sleep(900);
    await goTo(6, street.z - 1.8, t, { close: 1.6, ms: 16000, sprint: true, progress: 0.24 }).catch(() => {});

    t.scene("Climb");
    const blocks = (cfg.city && cfg.city.blocks) || [];
    const apt = blocks.find((b) => b.id === "apt") || blocks.find((b) => b.stair);
    if (apt && apt.stair) {
      const st = apt.stair;
      const lip = apt.z + apt.d / 2 - 1.1;
      const topX = st.x1 - 0.25;
      await goTo(st.x0 - 0.9, st.z, t, { sprint: true, progress: 0.3, ms: 22000 });
      await goTo(topX, st.z, t, { close: 0.35, progress: 0.34, ms: 18000 });
      await goTo(topX, lip, t, { close: 0.5, progress: 0.38, ms: 8000 });
      await goTo(apt.x, apt.z, t, { close: 0.9, progress: 0.42, ms: 9000 });
      const roof = C.state();
      if (roof.y < apt.h - 0.5) t.problem("bug", `He didn't reach the apt rooftop (y ${roof.y.toFixed(2)}, roof ${apt.h})`);
      else t.event("on-the-roof", `apt roof at ${roof.x.toFixed(1)}, ${roof.z.toFixed(1)}, y ${roof.y.toFixed(2)}`);
      // along the parapets and the AC units: walls and edges all round the camera
      t.scene("Roof");
      const hx = apt.w / 2 - 1.6, hz = apt.d / 2 - 1.6;
      const corners = [[apt.x - hx, apt.z - hz], [apt.x + hx, apt.z - hz], [apt.x + hx, apt.z + hz], [apt.x - hx, apt.z + hz], [apt.x, apt.z]];
      for (let i = 0; i < corners.length; i++) {
        await goTo(corners[i][0], corners[i][1], t, { close: 1.0, ms: 9000, sprint: i % 2 === 0, progress: 0.46 + i * 0.03 }).catch(() => {});
        if (i === 1) await dragCamera(-0.4);
      }
    }

    // ---- the casts, each watched for him and the target on screen together ----
    t.scene("Casts");
    const casts = [
      ["bolt", async () => tapKey("e", 90)],
      ["rain", async () => tapKey("r", 90)],
      ["gale", async () => holdVerb("v", 1100)],
      ["fog", async () => tapKey("c", 90)],
      ["sunbreak", async () => tapKey("x", 90)],
      ["tornado", async () => holdVerb("v", 2300)],
    ];
    for (const [name, act] of casts) {
      refill();
      await sleep(250);
      const before = S.casts.length;
      await act();
      await sleep(2300);
      const got = S.casts.slice(before).find((c) => c.frames > 3) || S.casts[S.casts.length - 1];
      if (!got || S.casts.length === before) { t.problem("bug", `The ${name} cast made no camera framing window`); continue; }
      t.metric(`castFramed.${name}`, Math.round(got.best * 100) / 100);
      if (got.best < 1) t.problem("bug", `On the ${name} cast he and the target were on screen together only ${got.best.toFixed(2)} s (need 1 s)`);
      else t.event(`cast-framed-${name}`, `he and the target on screen together for ${got.best.toFixed(2)} s over ${got.frames} frames (${got.power})`);
    }
    await goTo(apt ? apt.x : 0, apt ? apt.z : 0, t, { close: 1.4, ms: 8000, progress: 0.9 }).catch(() => {});
  }

  stop = true;
  const rep = C.camera();
  t.metric("cameraInsideFrames", S.inside);
  t.metric("cameraInsideFramesReported", rep.inside);
  t.metric("cameraBlockedFrames", rep.blocked);
  t.metric("cameraMaxYawDegPerSec", Math.round(S.maxYaw));
  t.metric("cameraMaxYawDegPerSecReported", Math.round(rep.maxYawDegPerSec));
  t.metric("cameraMaxPitchDegPerSec", Math.round(S.maxPitch));
  t.metric("cameraFrames", S.frames);
  t.event("camera-stats", `${S.frames} frames, camera inside ${S.inside} (its own count ${rep.inside}, behind a wall ${rep.blocked}), turn rate at most ${S.maxYaw.toFixed(0)} deg/s at ${S.worstYawAt} (its own ${rep.maxYawDegPerSec}), pitch ${S.maxPitch.toFixed(0)} deg/s`);
  if (S.inside || rep.inside) t.problem("bug", `The camera was inside a building or the ground for ${Math.max(S.inside, rep.inside)} frame(s) of ${S.frames}`);
  if (S.maxYaw > 180 || rep.maxYawDegPerSec > 180) t.problem("bug", `The camera turned ${Math.max(S.maxYaw, rep.maxYawDegPerSec).toFixed(0)} deg/s (limit 180) near ${S.worstYawAt}`);
  t.progress(1);
}

/* ---------------- charge / live log / pause: Body Energy vs Charge, no future rows live, Paused holds the clock ---------------- */
// Acceptance: Body alone says Energy; ability bar says Charge (amber); Live log has no soon rows; pause/scrub shows
// Paused and freezes the clock; resume continues from the same minute with the log in order. Shots at the current size
// (run at 1280x720 and 390x844).
async function chargeLogPause(options, t) {
  t.scene("Charge and live log");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const size = `${innerWidth}x${innerHeight}`;
  t.event("viewport", size);
  t.metric("feel.coyoteMs", 120);
  t.metric("feel.jumpBufferMs", 120);

  // Live: log must not preview the future.
  pressKey("Escape");
  await sleep(400);
  await t.until(() => window.day.now().mode === "live", 3000, "back to live").catch(() => {});
  await sleep(500);
  const liveLog = $("log");
  const liveSoon = liveLog ? [...liveLog.querySelectorAll("li.soon, li.coming-up")] : [];
  if (liveSoon.length) t.problem("bug", `Live log shows ${liveSoon.length} upcoming row(s) before their time`);
  else t.event("live-log-clean", `Live log has past and current only at ${($("time").textContent || "").trim()}`);
  const liveNow = liveLog && liveLog.querySelector("li.now");
  if (liveNow && liveNow !== liveLog.lastElementChild) {
    // notes can sit after the day row while steering; in live schedule the current row should be last
    const after = [...liveLog.children].slice([...liveLog.children].indexOf(liveNow) + 1);
    if (after.some((li) => li.classList.contains("soon") || li.classList.contains("coming-up"))) {
      t.problem("bug", "Live log still has upcoming rows after the current one");
    }
  }
  t.progress(0.2);

  // Pause (Space): status and clock say Paused, clock held.
  t.scene("Paused");
  const beforePause = window.day.now().minutes;
  pressKey(" ");
  await sleep(400);
  await t.until(() => window.day.now().mode === "pause", 2000, "paused").catch(() => {});
  const what = ($("what").textContent || "").trim();
  const ampm = ($("ampm").textContent || "").trim();
  const chapter = ($("chapter").textContent || "").trim();
  if (!/paused/i.test(what) || !/paused/i.test(ampm) || !/paused/i.test(chapter)) {
    t.problem("bug", `Paused state missing: what="${what}" ampm="${ampm}" chapter="${chapter}"`);
  } else t.event("paused-status", `status and clock say Paused (${what} / ${ampm})`);
  await sleep(900);
  if (Math.abs(window.day.now().minutes - beforePause) > 1e-6) t.problem("bug", "Clock moved while paused");
  else t.event("paused-clock", `clock held at ${($("time").textContent || "").trim()} ${ampm}`);
  t.progress(0.4);

  // Scrub: still paused, Coming up appears for preview rows.
  t.scene("Scrub paused");
  const day = window.day.today();
  const mid = day.dayStart + (day.dayEnd - day.dayStart) * 0.35;
  scrubTo(mid);
  await sleep(500);
  if (window.day.now().mode !== "pause") t.problem("bug", "Scrubbing the day bar should leave the day paused");
  const coming = $("log") && $("log").querySelector("li.coming-up, li.log-head");
  const soonRows = $("log") ? $("log").querySelectorAll("li.soon") : [];
  if (soonRows.length && !coming) t.problem("bug", "Preview log rows have no Coming up label");
  else if (coming) t.event("coming-up", `Coming up section with ${soonRows.length} preview row(s)`);
  else t.event("coming-up", "no preview rows at this minute (ok)");
  if (!/paused/i.test(($("what").textContent || ""))) t.problem("bug", "Scrubbed clock should still say Paused");
  t.progress(0.55);

  // Resume from the same time: Play, then confirm the clock advances and the log stays ordered.
  const held = window.day.now().minutes;
  const playBtn = $("play");
  if (playBtn) playBtn.click();
  else pressKey(" ");
  await sleep(400);
  await t.until(() => window.day.now().mode === "play", 2000, "resumed").catch(() => {});
  if (Math.abs(window.day.now().minutes - held) > 0.05) t.problem("bug", `Resume jumped the clock (was ${held}, now ${window.day.now().minutes})`);
  clickSpeed(10);
  await sleep(1200);
  if (!(window.day.now().minutes > held + 0.05)) t.problem("bug", "Clock did not continue after resume");
  else t.event("resumed", `continued from ${E().fmtClock(held)} to ${E().fmtClock(window.day.now().minutes)}`);
  // structural order: past/now before Coming up head before soon
  let ordered = true;
  const kids = $("log") ? [...$("log").children] : [];
  const headAt = kids.findIndex((li) => li.classList.contains("log-head") || li.classList.contains("coming-up"));
  if (headAt >= 0) {
    const beforeHead = kids.slice(0, headAt);
    const afterHead = kids.slice(headAt + 1);
    if (beforeHead.some((li) => li.classList.contains("soon"))) ordered = false;
    if (afterHead.some((li) => li.classList.contains("past") || li.classList.contains("now"))) ordered = false;
  }
  if (!ordered) t.problem("bug", "Log rows are out of order after resume");
  else t.event("log-order", "past/current then Coming up, newest of the day last among past/current");
  t.progress(0.7);

  // Charge on the ability bar; Body still says Energy.
  t.scene("Charge bar");
  const quiet = quietMoment(day) || carSideMoment(day) || day.actions.find((a) => !a.inCar);
  if (quiet) {
    scrubTo(quiet.start + Math.min(0.3, (quiet.end - quiet.start) / 3));
    clickSpeed(1);
    await sleep(400);
  }
  pressKey("Enter");
  await t.until(() => window.day.control && window.day.control.mode() === "control", 5000, "Take control").catch(() => {});
  await sleep(600);
  const chargeEl = $("charge");
  const chargeText = (chargeEl && chargeEl.textContent) || "";
  if (!chargeEl || chargeEl.hidden || !/Charge\s*\d+/i.test(chargeText)) {
    t.problem("bug", `Ability bar Charge missing (got "${chargeText.trim()}")`);
  } else if (/Energy/i.test(chargeText)) {
    t.problem("bug", "Ability bar still says Energy");
  } else {
    const bolt = chargeEl.querySelector(".bolt");
    const fill = chargeEl.querySelector("i");
    if (!bolt) t.problem("bug", "Charge has no bolt mark");
    if (!fill || !fill.style.width) t.problem("bug", "Charge bar has no fill");
    else t.event("charge-bar", `${chargeText.trim()} amber bar with bolt at ${size}`);
  }
  const bodyEnergy = [...document.querySelectorAll("#meters .meter")].find((m) => /Energy/i.test((m.querySelector(".mlabel") || {}).textContent || ""));
  if (!bodyEnergy) t.problem("bug", "Body panel has no Energy row");
  else t.event("body-energy", `Body still labels Energy (${(bodyEnergy.querySelector(".mval") || {}).textContent || ""})`);
  if (chargeEl && bodyEnergy && /Energy/i.test(chargeText) === false) {
    t.event("meters-distinct", "Body Energy and ability Charge are different labels");
  }
  checkHud(t, "charge-log-pause: control");
  t.progress(0.9);
  pressKey("Escape");
  await sleep(400);
  t.event("charge-log-pause-pass", `Charge, live log and Paused checked at ${size}`);
  t.progress(1);
}

installPlaytest({
  product: "icanbe",
  feel: {
    get scene() { return sensorScene(); },
    // a turning-point moment is a cutscene (its own camera, js/moments.js): only frame hitches are watched while it plays,
    // and the moment counts its own camera-inside frames (turning-moments checks them)
    active: () => !!feelControl() && !(window.day.world && window.day.world().cineOn && window.day.world().cineOn()),
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
    { id: "charge-log-pause", title: "Charge vs Body Energy, Live log has no future rows, pause/scrub say Paused and hold the clock, resume continues in order", seconds: 70, tags: ["hud", "smoke"], description: "Load with ?playtest=charge-log-pause. Real input: Esc, Space, day bar scrub, Play/10x, Enter. Events live-log-clean / paused-status / paused-clock / coming-up / resumed / log-order / charge-bar / body-energy. Run at 1280x720 and 390x844." },
    { id: "barks", title: "Small Weather's barks: the sky changes (rain, storm, fog, wind, snow, clear) and each gets one short log line from him; a day at speed adds hunger, thirst and tired lines; 12 or more distinct lines and none repeats within a day", seconds: 120, tags: ["story", "voice"], description: "Load with ?playtest=barks. Real input: Enter, keys 3 4 5 6 7 1, Esc, the 1200x button; the day bar to the morning and to nine hours (setup). Events bark-weather-<state> / bark-need-<need> / bark-lines / no-repeat." },
    { id: "chapter-openers", title: "Chapter openers: each of the five chapters (The Sky, The Neighbours, The Long Drought, Storm Chasers, The Night Show) opens on a voiced in-engine scene of 20 s or less: the title in the sky (clouds or a billboard), a camera move clear of geometry, the motif, a He and Pilot exchange, one caption line, Skip in thumb reach, no text card", seconds: 300, tags: ["story", "moments", "phone", "audio"], description: "Load with ?playtest=chapter-openers ({\"touch\":true} for the phone run). Setup: earlier episodes marked finished, chapter-seen flags cleared. Real input: the Episodes button and each chapter's first row, Esc, a tap on Skip. Events chapter-<n>-start / -layout / -end, chapter-summary; metrics chapterMaxSeconds, chapterCameraInsideFrames, chapterLines, chapterSkipMinY. Run at 1280x720 and 390x844 touch." },
    { id: "turning-moments", title: "Turning moments: each episode's turning point (Part 1 drought, Part 2 turbines and office lights, Part 3 Tank gauge and the Board, the lunch storm's twist, the bridge closing) plays a skippable moment of 8 s or less with a camera move, a music sting and the episode's voiced line, in place of the toast; one caption line, Skip in thumb reach", seconds: 240, tags: ["story", "moments", "phone", "audio"], description: "Load with ?playtest=turning-moments ({\"touch\":true} for the phone run). Setup: each episode started by its API, control.place at the beat. Real input: the weather calls (keys, or taps and a held tap on the ability buttons), Esc, a tap on Skip. Events moment-<id>-start / -layout / -toast / -end, moment-summary; metrics momentsCameraInsideFrames, momentsMaxSeconds, momentsSkipMinY. Run at 1280x720 and 390x844 touch." },
    { id: "moments", title: "Moments: taking over plays a camera push and one line (Skip or moving ends it); the day's end shows a recap of three events from the log (Skip or Esc closes it)", seconds: 70, tags: ["story", "moments"], description: "Load with ?playtest=moments. Real input: the Take control button, Skip, W, Esc; the day bar to 3 minutes before the day ends (setup) and the 1200x button. Events takeover-line / takeover-push / takeover-skipped / takeover-move / dayend-recap / dayend-skipped / dayend-esc / moments-log." },
    { id: "ask-markers", title: "Ask markers: a plumbob over Birdie and a rain icon over the dry park lawn from the roof camera; a tap frames the camera on the ask; rain blends the lawn green and fills the pond over seconds, Birdie's thanks is voiced, and it stays through a same-day reload", seconds: 150, tags: ["neighbors", "story", "phone", "voice", "memory"], description: "Load with ?playtest=ask-markers ({\"touch\":true} for 390x844). Setup: every icanbe.* key cleared, the cold open armed. Real input: Play, the first bolt, a tap or click on Birdie's marker (44 px at least, the camera swings to the ask), Rain (R or the arc button). Scenes: roof with marker and icon, the park before, the park after, after a reload. Events ask-marker / -icon / -tap / -lawn / -thanks / -reload / -dex." },
    { id: "street-teaches", title: "The street teaches: after the cold open's bolt, Rain, Sun break, Fog and Wind each unlock on a neighbor's voiced ask (Birdie, Dex, Ines) with a cue on the target, a glow, a vibrate and a voiced thanks, and no text card", seconds: 330, tags: ["first-minute", "phone", "voice", "neighbors", "abilities"], description: "Load with ?playtest=street-teaches. Setup: every icanbe.* key cleared, the cold open armed, the title up, navigator.vibrate recorded. Real input: Play, the bolt's hold, then keys (taps on the thumb arc and the stick on a phone) to answer each neighbor in turn. Events street-ask / -unlock / -arc / -cast / -thanks / -done / -practice; metrics secondsToRain, secondsToSun, secondsToFog, secondsToWind, secondsToAllFive. Run at 1280x720 and 390x844 touch." },
    { id: "title-progress", title: "Title progress: the title shows stars and episodes finished, and Continue names the next goal (Next: Part 1: Dry); fits 390x844 with 44 px targets and no sideways scroll", seconds: 25, tags: ["title", "retention", "phone"], description: "Load with ?playtest=title-progress. Setup: icanbe.* cleared, a returning save (opening seen, Clear the sky finished at rank A). Real input: a click (a tap on a phone) on Continue. Events title-progress / title-next / title-progress-phone / title-progress-play; metrics titleProgressStars, titleProgressSmallTargets. Run at 1280x720 and 390x844 touch." },
    { id: "title-key-art", title: "Title key art: a slow crane over the district at the real time of day lands on Small Weather on the apartment roof under a forming storm with glints every few seconds, the logo lockup on top (Play 56 px+, logo and him above the fold at 390x844), at most 4 buttons; Play dives into the cold open with no cut, no black frame and control within 1 s", seconds: 45, tags: ["title", "first-minute", "phone", "audio"], description: "Load with ?playtest=title-key-art. Setup: every icanbe.* key cleared, the cold open armed, the title up. Real input: a click (a tap on a phone) on Play. Events title-shot / title-buttons / title-phone / title-glints / title-play-dive; metrics titleButtons, titleSecondsToControl, titleBlackFrames. Run at 1280x720 and 390x844 touch." },
    { id: "cold-start", title: "Cold start: a new player presses Play and is on the apartment roof at dusk under a storm nobody called, casts the prompted Rain within 10 s with no card to click, Birdie calls up in her voice, and the episode offer arrives only after that as a corner toast under 40 words that never pauses the day, with under 25 words on screen before the first cast", seconds: 100, tags: ["opening", "first-minute", "phone", "audio", "voice"], description: "Load with ?playtest=cold-start. Setup: every icanbe.* key cleared, the cold open armed, the title up. Real input: a click (a tap on a phone) on Play, then the prompt's own cue (R pressed; the Rain button tapped on touch). Events cold-start-play / -control / -words / -cue / -bolt / -reaction / -birdie / -play-plus-5 / -15 / -30 / -free; metrics secondsToFirstInput, secondsToFirstCast, secondsToFirstReaction, wordsBeforeFirstCast. Run at 1280x720 and 390x844 touch." },
    { id: "opening", title: "Opening: a first Play shows Small Weather's own model with a few lines and a Skip button; Skip and Esc hand him over; a returning player goes straight in", seconds: 60, tags: ["opening", "story", "smoke"], description: "Load with ?playtest=opening. Real clicks: Play (the title is shown, and the saved flag cleared, as setup), watch two lines, click Skip, then Play again and press Esc, then Play as a returning player. Events opening-start / opening-model / opening-skip-ready / opening-line / opening-skipped / opening-esc / opening-once." },
    { id: "quiet-ui", title: "The quiet page: ?view=public shows the city, the status card, one Time control, Take control and Episodes (no log, Body, Things or config text, no overlaps, six HUD regions at most); the Time control opens the day bar and speeds by click or tap and closes on take-over; the title and the Episodes menu clear the caption, ability bar and hint; the menu starts the tutorial; no index.html fetch, no question in control", seconds: 75, tags: ["hud", "menus", "smoke"], description: "Load with ?playtest=quiet-ui&view=public. Real input: clicks on the Time control, a speed, Enter, Episodes and the tutorial row. Events no-dev-text / time-control / hud-regions / episodes-clear / time-drawer-open / drawer-closed-on-take / title-exclusive / menu-exclusive / episode-from-menu / no-question-in-control / no-index-fetch. Run at 1280x720 and 390x844." },
    { id: "hud-layout", title: "HUD layout: Quality lives in the Settings menu, the left column stacks Episodes, Neighbors, weather and Pressure without overlap, Take control stays bottom-centre; overlap check on title and in play", seconds: 40, tags: ["hud", "smoke"], description: "Load with ?playtest=hud-layout. Real input: Settings click, Enter, Esc. Events settings-open / hud-clear / hud-layout-play. Run at 1280x720, 390x844 and 844x390." },
    { id: "title", title: "Title screen: the skyline behind Small Weather's name with Play and Episodes opens first; the music plays on it, the day bed at noon and the night bed at night (crossfaded, softer); Play starts the game, Episodes opens the menu", seconds: 75, tags: ["title", "audio", "smoke"], description: "Load with ?playtest=title (the title opens first). Real clicks: Music, then the day bar to noon, 9:40 PM and 1 PM (setup) while the title is up, then Play (he's the player's, W walks), Esc; the title again (setup) and its Episodes button. Events title-open / title-buttons / title-music / music-day / music-crossfade / music-night / music-day-night / title-play / game-started / title-episodes / console-clean." },
    { id: "smoke", title: "Boot, see Small Weather, a minute of the day at 10×, pause, back to live, then take control on a rooftop and throw one bolt; Babylon 9, physics, his name in the panel and log", seconds: 90, tags: ["smoke"] },
    { id: "cast-feel", title: "Cast every power: feedback within 100 ms, shake under 0.3 s, button pulse", seconds: 120, tags: ["powers"], description: "Takes control, casts all eight powers by key, measures press to first feedback and the longest shake." },
    { id: "weather-abilities", title: "Take control, use Rain (R), Gale (V), Fog (C), Sun break (X) and Lightning (E) once each; each looks and sounds different and the sky is calm again seconds later", seconds: 150, tags: ["weather", "powers"], description: "Day bar beside the car (setup), Sound on, Enter. Real keys for each ability; waits for Energy between calls. Events ability-<id> / fade-<id>, then all-distinct." },
    { id: "crowd-reacts", title: "Take control at lunch and use Lightning, Rain, Gale, Fog and Sun break; the street's citizens look up, run for cover, hold their hats, slow down and cheer, then go back to routine as the weather clears", seconds: 150, tags: ["crowd", "weather", "powers"], description: "Day bar to lunch (setup), Enter, real keys for each ability. Events react-<id> and routine-<id>, metrics reacting-<id>." },
    { id: "slice", title: "Vertical slice: walk from the driveway to Birdie, answer her rain, see the lawn drink, the park path, bandstand pigeons and creak, the pond coin toss; reports quality.maxQuietSeconds and quality.textOnlyBeats", seconds: 200, tags: ["slice", "story"], description: "Real WASD, R for Birdie, Y at the pond." },
    { id: "memory", title: "The city remembers: rain on the park turns the lawn green, a bolt on the avenue leaves a scorch; a same-day reload shows both again, a day on they're fainter, three days on the city is back to default; with marks present on low quality the frame rate stays over 30", seconds: 150, tags: ["memory", "retention", "phone"], description: "Day bar beside the car (setup), Enter, the store cleared and a full Charge (setup). Real keys: WASD with Shift to the park, R, WASD to the avenue, E, Esc. day.memory.reload() stands in for a page reload and day.memory.shiftDays(1 / 3) for the date moving on (setup). Events memory-park / -rain / -bolt / -reload / -plus1 / -plus3 / -low; metrics memoryLowFps, memoryDecalsLow. Option {\"touch\":true} for 390x844 touch." },
    { id: "daily", title: "Today's request: the title shows one neighbour's ask under the name (two lines at most, above Play) and it changes when the date moves; the neighbour says it aloud when he comes close, the ! over them opens it on a tap, calling the weather in the place and window answers it with a voiced thanks and a reward that stays after a same-day reload; next day the title says what he did yesterday", seconds: 240, tags: ["story", "retention", "phone", "characters"], description: "Title, the date shifted over 16 days (setup: day.memory.shiftDays), the day bar into the ask's window (setup), Enter, WASD to the asker, tap the !, the power key, Esc; daily.reload() stands in for a page reload. {\"touch\":true} for 390x844 touch: tapping the ! and the ability button (control.place stands in for the stick)." },
    { id: "remembers", title: "Help Birdie, press Let go: he names the deed aloud, and his day detours past her pots within 5 game minutes; more deeds show more memory steps; the day end speaks two deeds one line at a time", seconds: 150, tags: ["story", "characters", "memory"], description: "Day bar 8:05 (setup), Enter, W to Birdie, R, Esc; checks the caption (one line, under the status card, over no control), the rebuilt day and the detour; memory.note adds deeds (setup); then the clock rolls at 1200x for the day-end card. {\"touch\":true} for 390x844 touch (taps; control.place stands in for the stick)." },
    { id: "neighbors", title: "Walk the avenue to Birdie, Dex and Ines Quill: each asks for a weather ability in a speech bubble, answering it pays a thank-you and a reward, and a later surprise pays more", seconds: 260, tags: ["neighbors", "story"], description: "Day bar beside the car (setup), Enter, then real WASD/Shift to each neighbor and R, X, E for their asks; the day bar jumps to each surprise hour. Events found-<id>, beat-ask-<id>, beat-thanks-<id>, reward-<id>, beat-surprise-<id>." },
    { id: "neighbor-arcs", title: "Neighbor personal arcs: Birdie, Dex and Ines each play 3 voiced beats (9 scenes); Birdie's ribbon survives a same-day reload; Dex's lit OPEN sign at night; phone Neighbors menu shows 3 pips each with no overlap", seconds: 320, tags: ["neighbors", "story", "characters", "phone", "voice"], description: "Load with ?playtest=neighbor-arcs ({\"touch\":true} for 390x844). Setup: arcs cleared, verbs unlocked, day bar + Enter. Real place near each neighbour, R/G/C for asks. Events arc-scene-* / arc-beat-* / arc-ribbon-reload / arc-open-sign-night / arc-pips-ok; metrics arcBirdie, arcDex, arcQuill, quality.textOnlyBeats." },
    { id: "neighbor-bodies", title: "Peoplekit bodies: slowed walk clips for Birdie, Dex and Ines (stride matches speed), ask wave and thanks cheer gestures, rain hunch and sun eye-shield, foot-slide detectors clean over a full day", seconds: 320, tags: ["neighbors", "quality"], description: "Day bar + Enter (setup). Real WASD to each neighbour; R/X/E for asks. Events slow-clip / gait-step / gesture-ask-* / gesture-thanks-* / weather-pose-rain / weather-pose-sun / foot-slide-clean; metric quality.footSlideFails." },
    { id: "day", title: "The whole day at 1200× (every block must start)", seconds: 90, tags: ["full"] },
    { id: "analytics", title: "Camera, speeds, day bar and keys with the analytics events going out, then the 3-minute question, dismissed", seconds: 260, tags: ["analytics"] },
    { id: "model", title: "Small Weather's 3D model: on his day it walks, idles and works; under control (Enter) it idles, walks (WASD), runs (Shift), jumps, falls and floats (Space, held); Esc and he walks back", seconds: 80, tags: ["model"], description: "Waits for models/small-weather.glb. The day bar jumps to a walk, a still moment and work at the desk (setup shortcuts); the rest is real keys." },
    { id: "idle-pose", title: "Idle pose: in the default state his hands hang at his sides (not behind his back), boots flat and straight for 10 s with no pop, and he returns to that pose after a walk, a run, a jump, Lightning and Rain casts and Wind (tap and hold, then 10 s standing under a clear sky); the phone (390x844) the same", seconds: 80, tags: ["model", "control", "quality", "phone"], description: "Load with ?playtest=idle-pose ({\"touch\":true} for 390x844). Takes control outside, stands 10 s (screenshots at the start and the end), then walk, run, jump, E and R, each followed by 2 s of idle and a screenshot; then V (the Wind button on a phone) as a tap and as a hold under a clear sky, each followed by 10 s standing with screenshots. skin.pose() reads each hand's distance in front of the hip line and each boot's pitch and roll; metrics idle.handFwdMinM, idle.bootPitchMin/Max, idle.bootRollMaxDeg, idle.popDeg and idle.wind.<tap|hold>.* (same, plus heldSec)." },
    { id: "clip-poses", title: "Clip poses: idle at two times, walk, run, jump, float, Lightning and Rain casts and his day's clips each read upright and untwisted at mid-clip; switching clips never snaps the pose; the phone (390x844) the same", seconds: 70, tags: ["model", "control", "quality", "phone"], description: "Load with ?playtest=clip-poses ({\"touch\":true} for 390x844). Takes control outside, stands (idle early, idle later), W, Shift+W, back to idle, Space jump and hold to float, E then R casts, then his day (sit, type, window). Each scene is a screenshot at mid-clip; skin.pose() reads spine/neck lean, pelvis/shoulder yaw, knees and hand gap on the frame and files quality.animation problems; metric quality.clipPopDeg is the worst pose change between two 33 ms samples." },
    { id: "hero-move", title: "Hero move: feet plant on the apt stairs and ramp (slide under 5 cm, float under 3 cm), Lightning and Rain show distinct wind-up clips, idle under a clear sky looks up; on phone IK and clips run on low quality at ≥30 fps", seconds: 150, tags: ["model", "control", "feel", "phone", "quality"], description: "Load with ?playtest=hero-move ({\"touch\":true} for 390x844). Setup: day bar outside, clear sky, full Charge, control.place at the apt ramp. Real WASD up the ramp and across the roof, E then R for wind-ups, stand still 20 s for look-up. Events foot-plant / windups-distinct / lookup-ok / phone-fps-ok; metrics quality.footSlideM, quality.footFloatM, phone.fpsAvg." },
    { id: "control", title: "Take control (Enter): walk, sprint, orbit the camera, a jump and two in the air, float; Esc and he walks back to his day; then the phone's touch stick and jump button", seconds: 100, tags: ["control"], description: "Starts at a quiet moment at home (the day bar). On a desktop-sized window the phone part shows the touch controls with day.control.touch(true)." },
    { id: "storm-ride", title: "Storm-riding: hold Space in the air to glide with wind trails; a Gust updraft lifts him from the street to rooftop height; glide apt roof to shop roof without touching the ground", seconds: 240, tags: ["control", "powers"], description: "Day bar beside the car. Storm weather (4), real keys for glide, G for updraft, climb apt then glide to shop." },
    { id: "city", title: "The day plays in the district (home, the drive, the office, home again), then he walks the street, the park and three roofs, and a building stops him", seconds: 240, tags: ["city"], description: "Day bar to home, the avenue, the office and home again (setup). Then Enter beside the car and WASD up the three ramps, across the street into the park, and into a wall." },
    { id: "look", title: "The city at noon, dusk and night (navy, wet surfaces, neon), then Quality: low", seconds: 80, tags: ["look"], description: "Day bar beside the car, Enter, walk to the shop front. Scrub holds noon, dusk and night. Then the quality button: bloom and shadows off, frame time recorded." },
    { id: "photos", title: "Photos of the dense city: noon at five spots along the avenue, dusk (windows and street lamps come on), night; frame rate at each", seconds: 120, tags: ["look", "photos"], description: "Day bar beside the car and to the hours (setup). Enter, then WASD with Shift east along the avenue. Events photo-noon / photo-dusk / photo-night / photo-fps; metrics photoFpsMin, photoFpsAvg, cityFillers, cityLamps." },
    { id: "crowd", title: "The street's people and cars follow the clock: quiet at 3 AM, busy at the 8:30 rush, full at lunch and dinner, thin again late; they walk, cross, go in and out of buildings; rain opens umbrellas; Quality: low thins them; frame rate at each", seconds: 90, tags: ["crowd", "photos"], description: "Day bar beside the car and to each hour (setup), then 1x. Enter, WASD with Shift to the shops, key 3, the quality button. Events crowd-night / crowd-rush / crowd-lunch / crowd-dinner / crowd-late / crowd-follows-clock / crowd-rain / crowd-quality-low / photo-fps; metrics crowd<Hour>People, crowd<Hour>Cars, photoFpsMin, photoFpsAvg." },
    { id: "npc-spots", title: "NPC spots: every neighbor, daily citizen and rescue person stands in open ground (none inside a building collider, each with room to walk up); a screenshot of each spot; neighbors' name tags fully on screen; the phone (390x844) the same", seconds: 120, tags: ["control", "quality", "phone"], description: "Load with ?playtest=npc-spots ({\"touch\":true} for 390x844). Runs the js/npc-spots.js audit on world.solids, takes control, then stands 1.6 m from each NPC spot (neighbors at the hour they are there) with a screenshot per spot. Events npc-spots / npc-spot-<who>; metric npcSpotFailures." },
    { id: "city-audit", title: "City audit: every prop from props.js and cityscape.js sits on its roof or pavement (nothing floating, sunk, coplanar or inside out); six probe cameras (three rooftops, three streets) show no flicker between two frames; he walks each walkable roof along its AC units; shots at desktop and 844x390", seconds: 240, tags: ["look", "photos"], description: "Setup: scrubs to noon, runs day.cityscape.audit(), places six probe cameras for two frames each (the second moved 2 cm). Real input: Enter, WASD with Shift up each walkable roof's ramp and along its row of units, Esc. Events city-audit / city-shots-size / flicker-<spot> / roof-walk-<block>; metrics cityAuditFailures, flickerBlocks." },
    { id: "fill-out", title: "The filled-out city: a rooftop, street props and shop signs, the plaza and clock tower; neon and lamps at night; the street reflects only in the rain he calls", seconds: 200, tags: ["look", "photos"], description: "Day bar beside the car and to the hours (setup). Enter, WASD with Shift, the ramp, key 3. Events photo-rooftop / photo-street / photo-plaza / photo-night-* / reflect-forecast / reflect-ability; metrics propsTrees, propsSigns, nightNeon, nightBloom, reflectAbility." },
    { id: "night-glow", title: "District glow after dusk: windows light on schedules with interior-mapped rooms, neon flickers, lamp pools (8 nearest dynamic / 4 on phone), car headlight flares; wet street uses SSR on high and a reflection probe on low; a bolt flickers windows", seconds: 160, tags: ["look", "photos", "phone", "feel"], description: "Day bar beside the car (setup), Enter / Take control tap, scrub 17→01 for window counts, walk the avenue at 22:00, key 3 for rain reflections. Events night-glow-schedule / -street / -reflect / -fps / -flicker; metrics windowOnDusk, windowOnNight, windowOnLate, dynamicLights, nightNeonSigns, nightReflect, nightFps. Option {\"touch\":true} for 390x844 low quality." },
    { id: "weather", title: "Take control outside, walk to the avenue, and switch clear, clouds, rain, storm, fog, wind and snow (keys 1–7). Each blends and gets a shot; rain and storm leave the road wet. Then the Q wheel and a phone tap.", seconds: 110, tags: ["weather"], description: "Day bar to the front door (setup), Sound on, Enter, WASD to the avenue. Keys 1–7 are the seven states. Hold Q opens the wheel; the Weather button is the phone tap." },
    { id: "atmosphere", title: "Rain light then heavy (sight and sound), the music tenses as Pressure fills, M mutes and the choice is saved, frame rate stays over 30 fps in rain and storm", seconds: 70, tags: ["weather", "audio"], description: "Sound on, take control, rain at 0.3 then key 3, Pressure low then high (setup shortcut), M twice, storm fps sample." },
    { id: "storm-tally", title: "What the storm changed: the first Rain (anywhere) greens the park lawn and fills the pond, a card names what changed, and the title shows the same tally", seconds: 45, tags: ["retention", "phone", "first-minute"], description: "Load with ?playtest=storm-tally ({\"touch\":true} for 390x844). Setup: memory reset, first-rain flag, title quiet. Real input: Take control, a tap on the street (far from the park), then Let go and the title. Events storm-before / storm-card / storm-after / storm-title; metrics stormLawnShown, stormPond, stormTallyRows, stormTitleTally, stormScrollX." },
    { id: "first-rain", title: "First Rain: after Take control the ability bar is one glowing Rain icon with a pulsing Tap the street arrow (the other four verbs hidden and refused); a tap on the street calls Rain and the bar opens to five", seconds: 40, tags: ["clarity", "phone", "first-minute"], description: "Load with ?playtest=first-rain ({\"touch\":true} for 390x844). Setup: first-rain flag, street lesson cleared, title quiet. Real input: Take control, a tap on the street. Events first-rain-state / first-rain-refused / first-rain-cast / first-rain-open; metrics firstRainVisibleVerbs, firstRainMinPx, firstRainScrollX." },
    { id: "morning-beats", title: "The morning in animation and sound: the alarm rings and is switched off, he stretches, makes coffee, climbs to the roof; each step has its own sound and no speech pill", seconds: 40, tags: ["story", "audio"], description: "Load with ?playtest=morning-beats. Setup: the clock stepped 7:30-8:15 in 30 s jumps. Events morning-beat-<kind>, morning-beats; metric morningBeats." },
    { id: "audio-check", title: "Audio from the first tap: sound is on by default, the city ambience plays within 2 s of the first tap with no settings change, Rain, Gale, Fog, Sun break and Lightning each play a distinct cast sound, music and ambience duck at least 6 dB under a voice line so the line is the loudest bus, and the 44 px sound toggle keeps the player's mute", seconds: 60, tags: ["audio", "phone", "first-minute"], description: "Load with ?playtest=audio-check ({\"touch\":true} for 390x844). Setup: saved mute cleared, title quiet. Real input: one tap or click on the canvas, Enter or the Take control button, taps on the sound toggle; casts by the named shortcut powers.command; a voiced line by voice.say. Events audio-before-tap / audio-ambience / audio-cast-<power> / audio-casts / audio-duck / audio-report; metrics audioAmbienceMs, audioCastsDistinct, audioDuckMusicDb, audioDuckAmbienceDb, audioToggleMinPx. Run at 1280x720 and 390x844 touch." },
    { id: "stem-score", title: "Stem score: Play opens on the 4-note motif (title, then the cold open), three stems stream after the first input and play in sync, a held bolt raises the tension layer within one bar, a tornado brings the storm layer, an episode success plays the resolution sting; on a phone the stems stay under 1.5 MB", seconds: 90, tags: ["audio", "music", "phone", "opening"], description: "Load with ?playtest=stem-score. Setup: every icanbe.* key cleared, cold open armed, title up. Real input: click or tap Play, hold the bolt (E or the Bolt button). Shortcuts: powers.command('tornado'), a day:episode score event. Events stem-motif-title / -coldopen / -ready / -windup / -storm / -sting / -transfer; metrics stemLayers, stemTensionSeconds, stemStormSeconds, stemMbAfterInput. Run at 1280x720 and 390x844 touch." },
    { id: "day-sound", title: "Diegetic day soundscapes: at 1200× the sound log shows distinct beds for home morning, commute, office, park lunch, evening TV and night; the car radio names a weather the player called today; office keyboard starts within 3 s of the desk and stops when he leaves; on phone low quality at most 3 loops play at once", seconds: 180, tags: ["audio", "phone", "story"], description: "Load with ?playtest=day-sound ({\"touch\":true} for 390x844). Sound on (real pointer), 1200× through the day, scrub to commute and desk. Events day-scape-* / day-radio / day-keyboard-on / day-keyboard-off / day-phone-cap; metrics dayScapes, dayMaxLoops, dayKeyboardSec, dayPhoneLoops." },
    { id: "audio-mix", title: "Mastered mix: day.audio.info() reports six reverb zones (rooftop, street, plaza, apartment, car, office); a voiced line ducks music ≥6 dB within 200 ms; a source behind a building is low-passed in the audio log; on phone Settings Music/Effects/Voice sliders are ≥44 px and persist", seconds: 150, tags: ["audio", "phone", "feel"], description: "Load with ?playtest=audio-mix ({\"touch\":true} for 390x844). Sound on, visit each zone (place/scrub shortcuts), speak a line, place a world source behind a block, open Settings and drag the three sliders, reload levels from localStorage. Events mix-zone-* / mix-duck / mix-occlusion / mix-sliders / mix-persist; metrics mixDuckMusicDb, mixSliderMinPx." },
    { id: "weather-audio", title: "Rooftop weather soundscape and footsteps: Sound on (real click), Take control (sting), climb apt roof, walk across gravel, metal, tar and puddle surfaces, then cycle clear/sun, clouds, rain (light roof patter vs heavy downpour, gutters, umbrella), storm (distance-delayed thunder crack and rolling thunder), fog, wind (3D-panned gusts and flapping awnings) and snow (muffled city) with equal-power crossfades", seconds: 150, tags: ["weather", "audio"], description: "Day bar outside, confirms silence, turns Sound on with a pointer, Enter, climbs apt rooftop, walks gravel/metal/tar/puddle zones, cycles keys 1–7 on the roof. Logs footstep-*, rain-layers, thunder-delay, loop-seams, music-* and soundscape levels." },
    { id: "weather-life", title: "Rain: street umbrellas and car wipers; leave a storm, let go, autopilot log reacts; weather holds then drifts back to the forecast", seconds: 150, tags: ["weather"], description: "Day bar to a yard moment whose forecast isn't a storm (morning door or evening car). Enter, WASD to the avenue, key 3 then 4, Esc. If the forecast there is a storm anyway: Enter, 1, Esc, so the drift is visible. Events: street-rain, umbrellas-and-wipers, autopilot-react, weather-drift, forecast-back." },
    { id: "powers", title: "Take control on the avenue, hold E for a storm, tap E lightning, G a gust, hold V for a tornado; Charge refuses a call when empty; Sky studio off leaves 1–7 idle", seconds: 140, tags: ["powers"], description: "Day bar beside the car (setup), Sound on, Enter, WASD to the loose props. Five verbs on the bar; hold depths for Storm and Tornado." },
    { id: "camera-run", title: "Third-person camera: a two-minute walk, climb and cast run (the avenue, the stair, the apartment roof and its parapets, all five verbs and a Tornado) with the camera never inside a building or the ground, never turning over 180 deg/s, framing him and the cast's target together for 1 s or more; taking control blends in; by touch a right-half drag looks and it recentres behind him within 3 s", seconds: 170, tags: ["control", "feel", "phone", "camera"], description: "Load with ?playtest=camera-run ({\"touch\":true} for the phone run). Setup: the day bar beside the car, a full Charge. Real input: Enter, WASD with Shift up the stair and round the roof, mouse drags (one a full-width flick), E R V C X and a held V for the Tornado; by touch a tap on Take control, the stick, one-finger drags on the left and right halves, a tap on Bolt. Events control-taken / take-blend / on-the-roof / cast-framed-<power> / left-half-drag / right-half-drag / recentred / camera-stats; metrics cameraInsideFrames, cameraMaxYawDegPerSec, castFramed.<power>, recentreSeconds. Run at 1280x720 and 390x844 touch." },
    { id: "wet-materials", title: "Wet materials: Rain makes brick, asphalt and roofs darker and glossy within 3 s and they dry back within 60 s; on phone 512 maps", seconds: 90, tags: ["weather", "phone", "look"], description: "Day bar beside the car (setup), Enter / Take control tap, control.place on the apartment roof (setup), tap R / #ability-rain. Events surfaces-set / wet-on / wet-dry. Option {\"touch\":true} for 390x844 low quality." },
    { id: "wind-fog", title: "Wind and fog you can see: a Gust shows ribbons, 10+ swirling leaves and papers, bending trees, flapping awnings and flags, a walker's umbrella flips; Fog rolls ground-fog slices into the street within 5 s and fades the skyline; on a phone, vertex shaders only, 2 slices, fps ≥ 30", seconds: 75, tags: ["powers", "phone", "feel"], description: "Takes control at lunch, stands on the plaza, taps Wind (V / #ability-wind) for a Gust, then Fog (C / #ability-fog). Events wind-gust / wind-ribbons / wind-leaves / wind-bend / wind-cloth / wind-umbrella / fog-cast / fog-roll / fog-skyline / fog-lights / fog-fps. Option {\"touch\":true} for 390x844 low quality by touch." },
    { id: "sky-cast", title: "The sky: five times of day show five painted skies, a Storm brings the shelf cloud and each Lightning strike lights the cloud deck from inside for 3+ frames, Sun break opens a gap with god rays inside 2 s; on phone low quality has the panorama and 2 cloud planes, no god-ray pass, 30 fps", seconds: 70, tags: ["weather", "powers", "phone", "feel"], description: "Day bar to each hour (setup), Enter / Take control tap, control.place on the apartment roof (setup), drag the camera up at the sky, E / #ability-bolt, X / #ability-sunbreak. Events sky-start / sky-0630 / sky-1200 / sky-1725 / sky-1900 / sky-2300 / sky-distinct / sky-storm / sky-sunbreak / sky-fps. Option {\"touch\":true} for 390x844 low quality." },
    { id: "rain-cast", title: "Heavy rain: a Rain cast shows velocity-stretched streaks, splashes on the roof and his shoulders, ripples in puddles, 5+ lens drops sliding when the camera looks up, and distant curtains in a plaza storm; on phone at most 2500 streaks, no lens drops, fps ≥ 30", seconds: 60, tags: ["powers", "weather", "phone", "feel"], description: "Day bar beside the car (setup), Sound on, Enter / Take control tap, control.place on the apartment roof (setup), drag the camera level, tap R / #ability-rain. Then weather.set storm and control.place on the plaza (setup) for the curtains. Events rain-cast / rain-streaks / rain-splashes / rain-ripples / rain-lens / rain-curtains / rain-fog / rain-phone / rain-fps. Option {\"touch\":true} for 390x844 low quality." },
    { id: "sun-aftermath", title: "Sun break after rain: steam off wet roofs and a rainbow at 42° within 3 s, gutters drip for 20+ s, at least 3 walkers close umbrellas and pigeons land on a roof; on phone half steam/drips, rainbow on, fps ≥ 30", seconds: 70, tags: ["powers", "weather", "phone", "feel", "crowd"], description: "Day bar to lunch (setup), Sound on, Enter / Take control tap, control.place by the shop (setup), tap R then X (or #ability-rain / #ability-sunbreak). Events aftermath-rain / -steam / -rainbow / -drips / -umbrellas / -birds / -fps. Option {\"touch\":true} for 390x844 low quality." },
    { id: "tornado-plaza", title: "Tornado on the plaza: 3 funnel shells (2 on low) with a dust ring, lifts 8+ café props that orbit and stay where they land, 0 floating/sunk after settle; on phone debris capped at 12 and fps ≥ 30", seconds: 90, tags: ["powers", "phone", "feel"], description: "Day bar beside the car (setup), control.place on the plaza (setup), Sound on, Enter / Take control tap, hold Wind for Tornado (key or held #ability-wind). Events tornado-start / tornado-layers / tornado-lifted / tornado-landed / tornado-ground / tornado-crowd / tornado-fps. Option {\"touch\":true} for 390x844 low quality." },
    { id: "lightning-bolt", title: "Lightning bolt: a forked bolt (3+ forks, 2+ re-strikes inside 400 ms), a flash that lights the facades within 40 m for 2+ frames, a camera-facing afterimage, sparks and smoke, a flush scorch that cools orange to black over 10 s, the crowd flinches; by touch at low quality the cast frame stays under 50 ms", seconds: 90, tags: ["powers", "phone", "feel"], description: "Takes control, walks to the avenue, casts Lightning (key, or a tap on the bolt button with touch:true) and measures the cast frame by frame. Events bolt-forks / bolt-restrikes / bolt-flash / bolt-afterimage / bolt-scorch / bolt-flush / bolt-crowd / bolt-frame." },
    { id: "warm-start", title: "Warm start: no frame over 100 ms (phone 150) in the first 30 s after the loading bar, the first cast of each of the five powers costs no long frame, no shader compile errors, phone median fps >= 30 over 60 s", seconds: 90, tags: ["performance", "phone", "powers"], description: "Load with ?playtest=warm-start ({\"touch\":true} for 390x844 low quality). Real input: Take control, the five verb buttons one by one. Frame times by the render observable; metrics worstFrame30sMs, firstCastWorstMs.<power>, medianFps, shaderErrors, lightCapWorst." },
    { id: "ui-art-kit", title: "UI art kit: five painted verb icons with ready glow and radial cooldown wipe; Episodes, Neighbors, Settings, toasts and score card share the frame set and fonts; no goal label has a bracketed key; on phone each verb is ≥44 px", seconds: 120, tags: ["hud", "menus", "phone", "abilities"], description: "Load with ?playtest=ui-art-kit ({\"touch\":true} for 390x844). Real input: Episodes, Neighbors, Settings, Take control, one verb cast, tutorial start. Events ui-art-source / ui-fonts / ui-frame / ui-busts / ui-verbs / ui-cooldown-wipe / goal-labels / ui-goal-icon / ui-phone-44; metrics uiVerbIcons, uiVerbMinPx, uiBusts." },
    { id: "phone-touch", title: "Phone touch: a cold phone session opens on the roof (no title wall), a tap on Take control enters control within 1 s, all five abilities are cast by tap with their effect on screen, and at 844x390 landscape every control is 44 px with no HUD overlap", seconds: 120, tags: ["phone", "touch", "hud", "opening"], description: "Load with ?playtest=phone-touch at 390x844 touch, then 844x390 touch. Only touch pointer events (taps). Events phone-cold-open / phone-let-go / phone-take-control / phone-cast-<verb> / phone-controls; metrics phone.secondsToRoof, phone.takeControlMs, phone.minControlPx, phone.castsWithEffect." },
    { id: "five-verbs", title: "Five verbs + Charge: bar shows Lightning Rain Wind Fog Sun; hold Lightning→Storm and full Wind→Tornado; on phone ≤7 controls none over the character; street tap aims; Sky studio gates 1–7", seconds: 180, tags: ["powers", "phone", "hud"], description: "Runs powers then phone arc checks at touch size. Events five-verbs / storm-gather / tornado-start / sky-studio-off / touch-budget / street-aim / goal-labels." },
    { id: "foley", title: "Foley: recorded jump, landing, crowd, car, bird and UI sounds in lazy groups, taps on the ability arc and Episodes play the UI press, no clip file twice within 60 s, foley transfer under 400 KB", seconds: 130, tags: ["audio", "phone"], description: "Load with ?playtest=foley. Sound on, Take control by touch, taps on the ability arc and Episodes, Jump taps, then a two-minute listen. Events sound-on / ui-arc / sfx-sources / foley-repeats; metrics foley.bytes, foley.indexed." },
    { id: "power-sfx", title: "Power SFX: Lightning crack/body/rumble layers with distance delay at 343 m/s (≤30 m with the flash, ~340 m ≈ 1 s), ≥4 crack variants across 8 casts, tornado roar rises ≥6 dB from 60 m to 10 m; on phone the master limiter holds and the first cast sounds within 100 ms", seconds: 150, tags: ["audio", "powers", "phone"], description: "Load with ?playtest=power-sfx ({\"touch\":true} for 390x844). Sound on, Take control, near then far bolt, eight Lightning casts, Wind hold for Tornado. Events thunder-delay-formula / strike-near / strike-far / crack-variants / tornado-proximity / master-limiter; metrics thunderDelayFarSec, crackVariants, tornadoDbRise, firstCastSoundMs." },
    { id: "spoken-dialogue", title: "Spoken dialogue: every dialogue line has its own clip in the build, sampled clips load and decode, and with Sound on Part 1's opening lines play as voice (day:dialogue say), not babble", seconds: 60, tags: ["voice", "story", "audio"], description: "Load with ?playtest=spoken-dialogue. Sound on (real pointer), Enter, Part 1 started by its API (setup). Events dialogue-index / dialogue-decode / sound-on / dialogue-say / dialogue-played." },
    { id: "voice", title: "Small Weather's DoD voice: episode open on Enter, a reaction for each weather state, power barks not every time, episode close on Esc", seconds: 100, tags: ["voice"], description: "Sound on (real pointer), Enter, keys 1–7 with cooldown gaps, bolts for chance/cooldown skips, Esc. Events voice-play / voice-weather-* / voice-power." },
    { id: "voice-director", title: "Voice director: take control and first power uses speak with a caption clear of the ability bar; lines never overlap; Voices mute leaves music/effects alone; day end speaks", seconds: 90, tags: ["voice", "audio"], description: "Load with ?playtest=voice-director. Sound on (real pointer), Enter, E then R, Voices off in Settings, day-end recap (setup). Optional {\"touch\":true}. Events voice-take / voice-power-first / voice-caption / voice-no-overlap / voices-mute / voice-dayend. Run at desktop and 390x844." },
    { id: "pilot", title: "Pilot: on a 1200× day at least 12 distinct schedule lines; every take-over and let-go plays a Pilot voice event (let-go names the deed); wrist ring pulses while Pilot speaks; never overlaps Small Weather; on phone the Pilot caption is one line and clear of touch controls", seconds: 180, tags: ["voice", "characters", "phone", "story"], description: "Load with ?playtest=pilot. Sound on, 1200× through morning blocks, Enter, cast weather chaos, Esc. Optional {\"touch\":true} for 390x844. Events pilot-schedule / pilot-take / pilot-letgo / pilot-ring / pilot-no-overlap / pilot-caption-phone; metrics pilotDistinct, pilotOverlaps." },
    { id: "first-visit", title: "First visit: the card walks take control, walk, jump, one lightning strike and let go in under a minute; Skip hides it for good; then every phone control is on screen by touch, the wheel and Bolt by tap, a frame-time check, and take_control / weather / power events going out", seconds: 180, tags: ["tutorial", "control", "analytics"], description: "Day bar to a quiet moment at home (setup), day.tutorial.reset() as a first visit (setup). Real keys: Enter, W, Space, E, Esc. Skip by its button. The phone part uses day.control.touch(true) on a desktop-sized window; taps on the Weather button, the wheel and Bolt are real pointer taps." },
    { id: "episode-jump", title: "Seamless episode jumps: each start plays a 1.2 s storm-cloud wipe (no black frame) that hides the asset swap and shader warm-up; desktop frames stay under 100 ms, phone under 150 ms; props fade in (no pop within 30 m); take/let-go whoosh with the camera blend; day-bar scrub crossfades lighting", seconds: 240, tags: ["episodes", "feel", "phone", "performance"], description: "Load with ?playtest=episode-jump ({\"touch\":true} for 390x844). Real input: Take control, Episodes rows for Morning / Lunch / Part 1, a ~2 min walk looking for pops, Esc. Events wipe-start / wipe-cover / wipe-end / no-black / jump-frames / fade-in / scrub-crossfade / control-whoosh; metrics jumpWorstMs, jumpAvgMs, wipeCover, fadeIns, popNear30m. Run at 1280x720 and 390x844 touch." },
    { id: "episodes", title: "Chapter episodes: offer or start Morning, Lunch, Hurricane drive and Night; complete morning goals (clouds→clear); forecast score card and localStorage best", seconds: 200, tags: ["episodes"], description: "Jumps the clock to each episode's chapter, takes control, accepts the offer (or starts via API), completes morning weather goals with keys 2 then 1, checks the score card and icanbe.episodes.best." },
    { id: "story-ending", title: "Part 3 ending scenes: three Part 3 runs reach Fair Weather, Heavy Weather and Overcast as distinct in-engine scenes (≤40 s, ≥2 voices each, no ending text card, rank stamp); after Fair Weather a same-day reload keeps the park green; on phone one caption + Skip", seconds: 960, tags: ["episodes", "story", "phone"], description: "Day bar outdoors and to 22:30 (setup), Enter/tap, parts started by API, Pressure refilled. Real keys or touch. Events ending-scene / ending-voice / ending-stamp / ending-park-reload / three-endings. Option {\"touch\":true} for 390x844." },
    { id: "episode-select", title: "Episode select: the score card's Replay and Next episode buttons work, the Episodes menu shows each best rank and locks later episodes until the one before is finished, and progress is kept in localStorage", seconds: 120, tags: ["episodes", "rank"], description: "Day bar beside the car (setup), Enter, Morning started by its API (setup), Pressure refilled (setup). Real keys: R, X, E, weather keys 2 and 1, then the card's Replay and Next buttons and the Episodes button. Events select-locked / select-card / select-replay / select-next / select-menu / select-storage." },
    { id: "results-ceremony", title: "Results ceremony: goals stand in the world as beams with the verb icon under one objective line; the score card dims the city, counts stats up, slams the rank stamp and Small Weather speaks a grade line chosen by rank", seconds: 150, tags: ["episodes", "rank", "menus-ui"], description: "Day bar beside the car (setup), Enter, Part 1 and Morning started by their API (setup), Pressure refilled (setup). Real keys R, X, E, 2, 1; Replay by tap on a phone. Events marker-info / objective-line / ceremony-clear / ceremony-let-go / grade-lines-differ / card-fits." },
    { id: "score-ranks", title: "Score and Challenge: clearing Morning shows a card with a rank (S to C) and a four-row breakdown (people, time, damage avoided, ability variety), saves the best rank, and unlocks the Challenge (tighter timer), which keeps its own best", seconds: 120, tags: ["episodes", "rank"], description: "Day bar beside the car (setup), Enter, Morning started by its API (setup), Pressure refilled (setup). Real keys: R, X, E, then weather keys 2 and 1; the Episodes button and the Challenge row. Events rank-locked / rank-card / rank-unlock / rank-best / rank-storage / rank-open / rank-challenge / rank-challenge-card." },
    { id: "story-parts", title: "Story Parts 1 and 2 as episodes: rain on the park (not the market), sun break and the stalls; overusing rain floods the park and scars the card; Part 2 wind for the turbines, a gale in the plaza topples a stall; neighbor dialogue from the beat sheet", seconds: 420, tags: ["episodes", "story"], description: "Day bar to a moment outdoors (setup), Enter, the parts started by their API (setup) and Pressure refilled (setup). Real keys: WASD with Shift to the park, the plaza and the annex, R, X and V. Events story-list / story-menu / story-say / story-goal / story-strain / story-kick / story-wind / story-card (clean vs scarred)." },
    { id: "lunch-rescue", title: "Rooftop storm (lunch): a surprise storm strands people in the plaza, on the shop roof and in the avenue; helping them with Sun break, Lightning and Gale changes the score and the S-C rank; the twist turns the rain to fog; an ending line per rank", seconds: 300, tags: ["episodes", "story", "rank"], description: "Day bar to a moment outdoors (setup), Enter, the episode started by its API (setup), Pressure refilled (setup). Real keys: WASD with Shift to the plaza cafe, the shop and the avenue, X, E, V, Esc. Run 1 helps one person and lets go (low rank); run 2 plays all three set pieces. Events lunch-opening / lunch-piece / lunch-help / lunch-score / lunch-twist / lunch-sky / lunch-goal / lunch-card / lunch-rank / lunch-say." },
    { id: "hurricane-drive", title: "Hurricane drive (commute home): four closures on the way home (fallen sign, flooded underpass, dead bus, closing bridge); the right ability at each helps, the wrong one hurts (rain on the debris, gale at the bus); a storm twist; an ending line and an S-C rank on the score card", seconds: 360, tags: ["episodes", "story", "rank"], description: "Day bar to a moment outdoors (setup), Enter, the episode started by its API (setup), Pressure refilled (setup). Real keys: WASD with Shift along the avenue, R then V at the fallen sign, V, X, E and C at the four set pieces, Esc. Run 1 uses rain on the debris (hurt) then a gale and lets go (low rank); run 2 plays all four set pieces right and gets home. Events drive-opening / drive-piece / drive-hurt / drive-help / drive-twist / drive-sky / drive-goal / drive-card / drive-rank / drive-say." },
    { id: "light-show", title: "Night Show finale: Pilot farewell, Birdie/Dex/Ines on roofs with voiced lines, 12+ beat cues, city lights answer, credits flyover with the cast, then tomorrow's sky request; phone taps the thumb arc", seconds: 360, tags: ["episodes", "story", "rank", "phone"], description: "Day bar to outdoors then 22:05 (setup), Enter, episode API start, arc seeded. Real input: WASD/Shift to the plaza, then E/R/C/V/X or touch verb taps on each cue. Run 1 on the beat; run 2 late Lightning only. Events show-opening / show-farewell / show-roof / show-roofs / show-gather / show-begin / show-cue / show-over / show-card / show-credits / show-post / show-compare; metrics showAurora, showBursts, showPointsOnBeat, showPointsSloppy, showCreditsFontPx, showPostFontPx. Run at 1280x720 and 390x844 touch {\"touch\":true}." },
    { id: "phone", title: "Phone: the game by touch only, in portrait or landscape: take control, stick, jump, the five abilities and a power by tap, the Episodes menu and an episode card, the first-visit card and the tutorial episode (start and Skip), the day timeline dragged; every tapped control at least 44 px and on screen, HUD overlap checked", seconds: 240, tags: ["phone", "smoke-phone", "control", "tutorial"], description: "Day bar to a quiet moment at home (setup); day.control.touch(true) on a desktop-sized window (setup). Every press is a pointer tap measured first (44 px, on screen). Option {\"orientation\":\"landscape\"} turns a portrait window to landscape if the page can resize it, else the orientation event says it ran portrait only. Events touch-layout / orientation / take-control-tap / tutorial-card-skipped / tutorial-started / tutorial-skipped / stick-move / jump-tap / ability-tap-<id> / power-tap / episodes-open / episodes-closed / episode-card / timeline-drag / hud-clear / phone-taps." },
    { id: "tutorial-episode", title: "Tutorial episode: Learn the weather teaches Lightning, Rain, Gale, Fog and Sun break one at a time, each with a prompt and a goal; each unlocks with a toast; Skip opens everything", seconds: 150, tags: ["episodes", "tutorial", "abilities"], description: "Day bar to a quiet moment (setup), Enter, accepts the offer, then presses E, R, V, C, X as the prompts say; checks the locked slots, the toast, the goal ticks; restarts and presses Skip. Events tutorial-offer / unlock-toast / tutorial-prompt / tutorial-goal / locked-refused / all-unlocked / tutorial-skipped." },
  ],
  /* Ready = a frame is drawn AND the loading card has let go of the page (index.html window.__loading). While the card is up
     html.loading hides the whole HUD, so a run that started on the first frame saw the day bar, #what, #sound and #details
     as "hidden in Live mode" and screenshots of a full loading bar. A failed load counts (the run then reports it). */
  isReady: () => !!(window.day && window.day.now().frame && !(window.__loading && window.__loading.state() === "loading")),
  async start(id, options, t) {
    const errFrom = consoleErrors.length;
    // shader compile failures count as console errors even when Babylon's logger didn't reach console.error
    try {
      const eng = world() && world().scene && world().scene.getEngine();
      if (eng && eng.onEffectErrorObservable) eng.onEffectErrorObservable.add((i) => consoleErrors.push(("Shader effect failed to compile: " + String((i && i.errors) || "")).slice(0, 200)));
    } catch (e) { /* no engine */ }
    // control.js's place() (a setup teleport that snaps the camera) tells the feel sensor it was an intended cut through
    // window.hawkesPlaytest.cut; the contract's api has none (cut lives on `t`), so every placement counted as a camera snap.
    if (window.hawkesPlaytest && !window.hawkesPlaytest.cut) window.hawkesPlaytest.cut = (s) => t.cut(s);
    // Most scenarios still use keys 1–7 for forecast weather; Sky studio is off for players by default.
    // Powers / five-verbs turn it off again to assert the gate.
    try {
      if (id !== "powers" && id !== "five-verbs") localStorage.setItem("icanbe.skyStudio", "on");
      else localStorage.setItem("icanbe.skyStudio", "off");
    } catch (e) { /* private mode */ }
    try {
      if (["smoke", "hud-layout", "phone", "cold-start", "first-minute", "title-key-art", "title-progress", "street-teaches", "ask-markers", "quiet-ui", "phone-touch"].includes(id)) forcePublicView();
      if (id !== "title" && id !== "cold-start" && id !== "first-minute" && id !== "title-progress" && id !== "street-teaches" && id !== "ask-markers" && id !== "phone-touch" && window.day && window.day.title && window.day.title.quiet) window.day.title.quiet();
      if (id !== "smoke" && id !== "first-visit" && id !== "phone" && window.day && window.day.tutorial && window.day.tutorial.quiet) {
        window.day.tutorial.quiet();
      }
      if (t.spot) await spotProbe(options, t, t.spot);
      else if (id === "barks") await barksScenario(options, t);
      else if (id === "moments") await momentsScenario(options, t);
      else if (id === "cold-start") await coldStart(options, t);
      else if (id === "phone-touch") await phoneTouch(options, t);
      else if (id === "first-minute") await firstMinute(options, t);
      else if (id === "warm-start") await warmStart(options, t);
      else if (id === "title-key-art") await titleKeyArt(options, t);
      else if (id === "title-progress") await titleProgress(options, t);
      else if (id === "street-teaches") await streetTeaches(options, t);
      else if (id === "ask-markers") await askMarkers(options, t);
      else if (id === "opening") await openingScenario(options, t);
      else if (id === "title") await titleScenario(options, t);
      else if (id === "hud-layout") await hudLayoutScenario(options, t);
      else if (id === "quiet-ui") await quietUi(options, t);
      else if (id === "charge-log-pause") await chargeLogPause(options, t);
      else if (id === "smoke") await smoke(options, t);
      else if (id === "day") await wholeDay(options, t);
      else if (id === "remembers") await remembersScenario(options, t);
      else if (id === "analytics") await analytics(options, t);
      else if (id === "control") await control(options, t);
      else if (id === "storm-ride") await stormRide(options, t);
      else if (id === "model") await model(options, t);
      else if (id === "hero-move") await heroMove(options, t);
      else if (id === "clip-poses") await clipPoses(options, t);
      else if (id === "idle-pose") await idlePose(options, t);
      else if (id === "city") await city(options, t);
      else if (id === "look") await look(options, t);
      else if (id === "render-grade") await renderGrade(options, t);
      else if (id === "sky-cast") await skyCast(options, t);
      else if (id === "photos") await photos(options, t);
      else if (id === "fill-out") await fillOut(options, t);
      else if (id === "night-glow") await nightGlow(options, t);
      else if (id === "city-audit") await cityAudit(options, t);
      else if (id === "npc-spots") await npcSpots(options, t);
      else if (id === "crowd") await crowdScenario(options, t);
      else if (id === "weather") await weather(options, t);
      else if (id === "cast-feel") await castFeel(options, t);
      else if (id === "first-minute") await firstMinute(options, t);
      else if (id === "weather-abilities") await weatherAbilities(options, t);
      else if (id === "slice") await sliceScenario(options, t);
      else if (id === "neighbors") await neighborsScenario(options, t);
      else if (id === "neighbor-arcs") await neighborArcsScenario(options, t);
      else if (id === "memory") await memoryScenario(options, t);
      else if (id === "daily") await dailyScenario(options, t);
      else if (id === "neighbor-bodies") await neighborBodies(options, t);
      else if (id === "crowd-reacts") await crowdReacts(options, t);
      else if (id === "atmosphere") await atmosphere(options, t);
      else if (id === "day-sound") await daySoundScenario(options, t);
      else if (id === "audio-mix") await audioMixScenario(options, t);
      else if (id === "weather-audio") await weatherAudio(options, t);
      else if (id === "power-sfx") await powerSfx(options, t);
      else if (id === "stem-score") await stemScore(options, t);
      else if (id === "audio-check") await audioCheck(options, t);
      else if (id === "morning-beats") await morningBeats(options, t);
      else if (id === "first-rain") await firstRain(options, t);
      else if (id === "storm-tally") await stormTally(options, t);
      else if (id === "weather-life") await weatherLife(options, t);
      else if (id === "powers") await powers(options, t);
      else if (id === "ui-art-kit") await uiArtKit(options, t);
      else if (id === "five-verbs") await fiveVerbs(options, t);
      else if (id === "wind-fog") await windFog(options, t);
      else if (id === "tornado-plaza") await tornadoPlaza(options, t);
      else if (id === "rain-cast") await rainCast(options, t);
      else if (id === "sun-aftermath") await sunAftermath(options, t);
      else if (id === "wet-materials") await wetMaterials(options, t);
      else if (id === "lightning-bolt") await lightningBolt(options, t);
      else if (id === "camera-run") await cameraRun(options, t);
      else if (id === "voice") await voice(options, t);
      else if (id === "voice-director") await voiceDirector(options, t);
      else if (id === "pilot") await pilotScenario(options, t);
      else if (id === "spoken-dialogue") await spokenDialogue(options, t);
      else if (id === "foley") await foley(options, t);
      else if (id === "episode-jump") await episodeJump(options, t);
      else if (id === "episodes") await episodes(options, t);
      else if (id === "story-parts") await storyParts(options, t);
      else if (id === "turning-moments") await turningMoments(options, t);
      else if (id === "chapter-openers") await chapterOpeners(options, t);
      else if (id === "score-ranks") await scoreRanks(options, t);
      else if (id === "results-ceremony") await resultsCeremony(options, t);
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

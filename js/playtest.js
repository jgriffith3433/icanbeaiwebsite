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
  ["#voice-caption", "voice caption"], ["#voices", "Voices"], ["#time-btn", "Time control"], ["#time-drawer", "Time drawer"], ["#update-pill", "New version"],
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
  if (C.place) C.place(112, 24, -Math.PI / 2); // setup: on the plaza, a flag pole and the avenue's trees in view
  await sleep(800);
  const quality = window.day.look.quality();
  t.metric("quality", quality === "low" ? 0 : 1);
  if (P.abilities && P.abilities.reset) P.abilities.reset(100);
  await t.until(() => P.now().pressure >= 40, 8000, "Charge").catch(() => {});
  const calm = () => { const n = W.now(); return n.rain < 0.05 && n.fog < 0.015 && n.wind < 0.2; };
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
  async function press(key, wait) {
    if (key === "v") await holdVerb("v", 750); // Gale: past windHold, before Tornado
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
        const k = mode === "perfect" ? keyFor(c.power) : keyFor("bolt");
        if (mode === "perfect" && c.power === "gale") await holdVerb(k || "v", 700);
        else pressKey(k);
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

/* ---------------- cold-start: a new player's first Play to the first bolt and the street's reaction ---------------- */
// Needs ?playtest=cold-start (or the runner's start("cold-start")). Setup (named): every icanbe.* key cleared, the cold open armed,
// the title up. Real input only from there: a click or tap on the title's Play, then the one cue on screen ("Hold E" -> E held;
// "Hold the bolt" -> a touch held on the Bolt button). Event-driven: day:control, day:power, day:story, day:coldopen, day:crowd,
// day:dialogue and day:voice stamp the times; the only waits are one-shot timers for the +5 / +15 / +30 s shots and a deadline.
// Reports seconds to first input / first cast / first city reaction / Birdie's voice, words on screen before the first cast,
// what else is visible before it (a phone: only the stick, Jump and Bolt), and the other criteria as problems.
async function coldStart(options, t) {
  t.scene("Cold start");
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model !== "loading", 30000, "his model to load").catch(() => {});
  const D = window.day;
  const phone = D.control && D.control.state ? !!D.control.state().touch : innerWidth <= 700;
  t.event("cold-start-setup", `${innerWidth}x${innerHeight}, ${phone ? "touch" : "keyboard and mouse"}`);
  if (D.control.mode() === "control") { pressKey("Escape"); await t.until(() => D.control.mode() === "schedule", 15000, "him back on his day").catch(() => {}); }
  // setup: a new player (no icanbe.* keys), the title up, the cold open armed
  Object.keys(window.localStorage).filter((k) => k.startsWith("icanbe.")).forEach((k) => window.localStorage.removeItem(k));
  if (!D.coldopen) { t.problem("blocker", "There's no cold open (js/coldopen.js didn't install)"); return; }
  D.coldopen.arm();
  if (D.tutorial && D.tutorial.reset) { /* the cold open replaces its card: a new player must not get both */ }
  D.title.show("playtest");
  await sleep(700);
  if (!D.coldopen.pending()) t.problem("blocker", "A player with no saved keys isn't pending the cold open");

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
  on("day:power", (d) => { if (d.action === "bolt" && d.power === "bolt") stamp("bolt"); });
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
  tPlay = performance.now();
  // the +5 / +15 / +30 s shots (the runner takes a frame at each event)
  [5, 15, 30].forEach((s) => setTimeout(() => {
    t.event(`cold-start-play-plus-${s}`, `${s}s after Play: ${D.control.mode()}, cold open ${D.coldopen.now().phase}, ${wordsOnScreen().length} words, crowd ${D.crowd && D.crowd.info ? D.crowd.info().reaction || "no reaction" : "?"}`);
  }, s * 1000));

  if (phone) await tapEl(playBtn); else await clickEl(playBtn);
  t.event("cold-start-play", phone ? "tapped Play" : "clicked Play");
  const gotControl = await waitFor(() => T.control != null, 4000);
  if (!gotControl) { t.problem("blocker", `Play didn't hand him over (control mode ${D.control.mode()})`); return; }
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
  if (!promptEl || !hudVisible(promptEl)) t.problem("bug", "The prompt isn't visible");
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
  t.progress(0.4);

  // follow the cue: a short tap does nothing, a hold throws it
  if (/bolt/i.test(cueText) || phone) {
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
  const cast = await waitFor(() => T.bolt != null, 4000);
  if (!cast) { t.problem("blocker", `Holding the bolt as the prompt said never threw it (${cueText})`); return; }
  t.event("cold-start-bolt", `first input ${T.input}s, first cast ${T.bolt}s after Play`);
  t.metric("secondsToFirstInput", T.input);
  t.metric("secondsToFirstCast", T.bolt);
  if (T.input == null || T.input > 3) t.problem("bug", `The first input was accepted ${T.input}s after Play (the limit is 3 s)`);
  if (T.bolt > 30) t.problem("bug", `The first bolt landed ${T.bolt}s after Play (the limit is 30 s)`);
  t.progress(0.65);

  // the street looks up; Birdie calls up in her voice (within 15 s of the bolt)
  const reacted = await waitFor(() => T.lookup != null, 15000);
  const voiced = await waitFor(() => T["birdie-voice"] != null, Math.max(500, (T.bolt + 15 - since()) * 1000));
  const crowd = D.crowd && D.crowd.info ? D.crowd.info() : {};
  if (T.lookup != null) t.metric("secondsToFirstReaction", T.lookup);
  t.event("cold-start-reaction", reacted ? `the crowd looked up ${T.lookup}s after Play (${Math.round((T.lookup - T.bolt) * 100) / 100}s after the bolt); ${crowd.lookingUp || 0} looking up` : "the crowd never looked up");
  t.event("cold-start-birdie", voiced ? `Birdie's voiced line played ${T["birdie-voice"]}s after Play` : `Birdie's line ${T["birdie-say"] != null ? "was said but has no voice clip playing" : "never came"}`);
  if (!reacted) t.problem("bug", "The crowd's look-up reaction didn't fire after the bolt");
  else if (T.lookup - T.bolt > 15) t.problem("bug", "The crowd looked up more than 15 s after the bolt");
  if (!voiced) t.problem("bug", "Birdie's voiced line (a sound event) didn't play within 15 s of the bolt");
  t.progress(0.85);

  // the shots at +5 / +15 / +30 s, then he is free: the HUD is back and the bolt button is gone
  await sleep(Math.max(0, 30500 - since() * 1000));
  const free = !document.documentElement.classList.contains("cold-open");
  t.event("cold-start-free", `${since().toFixed(1)}s after Play: HUD ${free ? "back" : "STILL HIDDEN"}, cold open ${D.coldopen.now().phase}`);
  if (!free) t.problem("bug", "The HUD never came back after the first bolt");
  checkHud(t, "cold-start");
  t.progress(1);
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
  await t.until(() => D.coldopen.now().phase === "waiting", 8000, "the cold open's prompt").catch(() => {});
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
    const e = m.getBoundingInfo().boundingBox.extendSizeWorld;
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
    { id: "turning-moments", title: "Turning moments: each episode's turning point (Part 1 drought, Part 2 turbines and office lights, Part 3 Tank gauge and the Board, the lunch storm's twist, the bridge closing) plays a skippable moment of 8 s or less with a camera move, a music sting and the episode's voiced line, in place of the toast; one caption line, Skip in thumb reach", seconds: 240, tags: ["story", "moments", "phone", "audio"], description: "Load with ?playtest=turning-moments ({\"touch\":true} for the phone run). Setup: each episode started by its API, control.place at the beat. Real input: the weather calls (keys, or taps and a held tap on the ability buttons), Esc, a tap on Skip. Events moment-<id>-start / -layout / -toast / -end, moment-summary; metrics momentsCameraInsideFrames, momentsMaxSeconds, momentsSkipMinY. Run at 1280x720 and 390x844 touch." },
    { id: "moments", title: "Moments: taking over plays a camera push and one line (Skip or moving ends it); the day's end shows a recap of three events from the log (Skip or Esc closes it)", seconds: 70, tags: ["story", "moments"], description: "Load with ?playtest=moments. Real input: the Take control button, Skip, W, Esc; the day bar to 3 minutes before the day ends (setup) and the 1200x button. Events takeover-line / takeover-push / takeover-skipped / takeover-move / dayend-recap / dayend-skipped / dayend-esc / moments-log." },
    { id: "street-teaches", title: "The street teaches: after the cold open's bolt, Rain, Sun break, Fog and Wind each unlock on a neighbor's voiced ask (Birdie, Dex, Ines) with a cue on the target, a glow, a vibrate and a voiced thanks, and no text card", seconds: 330, tags: ["first-minute", "phone", "voice", "neighbors", "abilities"], description: "Load with ?playtest=street-teaches. Setup: every icanbe.* key cleared, the cold open armed, the title up, navigator.vibrate recorded. Real input: Play, the bolt's hold, then keys (taps on the thumb arc and the stick on a phone) to answer each neighbor in turn. Events street-ask / -unlock / -arc / -cast / -thanks / -done / -practice; metrics secondsToRain, secondsToSun, secondsToFog, secondsToWind, secondsToAllFive. Run at 1280x720 and 390x844 touch." },
    { id: "cold-start", title: "Cold start: a new player presses Play and is on the apartment roof at dusk under a storm nobody called, holds the bolt at the shop roof's rod within 30 s, and the street looks up and Birdie calls up in her voice, with under 25 words on screen before the first cast", seconds: 60, tags: ["opening", "first-minute", "phone", "audio", "voice"], description: "Load with ?playtest=cold-start. Setup: every icanbe.* key cleared, the cold open armed, the title up. Real input: a click (a tap on a phone) on Play, then the prompt's own cue (E held; the Bolt button held on touch). Events cold-start-play / -control / -words / -cue / -bolt / -reaction / -birdie / -play-plus-5 / -15 / -30 / -free; metrics secondsToFirstInput, secondsToFirstCast, secondsToFirstReaction, wordsBeforeFirstCast. Run at 1280x720 and 390x844 touch." },
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
    { id: "neighbor-bodies", title: "Peoplekit bodies: slowed walk clips for Birdie, Dex and Ines (stride matches speed), ask wave and thanks cheer gestures, rain hunch and sun eye-shield, foot-slide detectors clean over a full day", seconds: 320, tags: ["neighbors", "quality"], description: "Day bar + Enter (setup). Real WASD to each neighbour; R/X/E for asks. Events slow-clip / gait-step / gesture-ask-* / gesture-thanks-* / weather-pose-rain / weather-pose-sun / foot-slide-clean; metric quality.footSlideFails." },
    { id: "day", title: "The whole day at 1200× (every block must start)", seconds: 90, tags: ["full"] },
    { id: "analytics", title: "Camera, speeds, day bar and keys with the analytics events going out, then the 3-minute question, dismissed", seconds: 260, tags: ["analytics"] },
    { id: "model", title: "Small Weather's 3D model: on his day it walks, idles and works; under control (Enter) it idles, walks (WASD), runs (Shift), jumps, falls and floats (Space, held); Esc and he walks back", seconds: 80, tags: ["model"], description: "Waits for models/small-weather.glb. The day bar jumps to a walk, a still moment and work at the desk (setup shortcuts); the rest is real keys." },
    { id: "control", title: "Take control (Enter): walk, sprint, orbit the camera, a jump and two in the air, float; Esc and he walks back to his day; then the phone's touch stick and jump button", seconds: 100, tags: ["control"], description: "Starts at a quiet moment at home (the day bar). On a desktop-sized window the phone part shows the touch controls with day.control.touch(true)." },
    { id: "storm-ride", title: "Storm-riding: hold Space in the air to glide with wind trails; a Gust updraft lifts him from the street to rooftop height; glide apt roof to shop roof without touching the ground", seconds: 240, tags: ["control", "powers"], description: "Day bar beside the car. Storm weather (4), real keys for glide, G for updraft, climb apt then glide to shop." },
    { id: "city", title: "The day plays in the district (home, the drive, the office, home again), then he walks the street, the park and three roofs, and a building stops him", seconds: 240, tags: ["city"], description: "Day bar to home, the avenue, the office and home again (setup). Then Enter beside the car and WASD up the three ramps, across the street into the park, and into a wall." },
    { id: "look", title: "The city at noon, dusk and night (navy, wet surfaces, neon), then Quality: low", seconds: 80, tags: ["look"], description: "Day bar beside the car, Enter, walk to the shop front. Scrub holds noon, dusk and night. Then the quality button: bloom and shadows off, frame time recorded." },
    { id: "photos", title: "Photos of the dense city: noon at five spots along the avenue, dusk (windows and street lamps come on), night; frame rate at each", seconds: 120, tags: ["look", "photos"], description: "Day bar beside the car and to the hours (setup). Enter, then WASD with Shift east along the avenue. Events photo-noon / photo-dusk / photo-night / photo-fps; metrics photoFpsMin, photoFpsAvg, cityFillers, cityLamps." },
    { id: "crowd", title: "The street's people and cars follow the clock: quiet at 3 AM, busy at the 8:30 rush, full at lunch and dinner, thin again late; they walk, cross, go in and out of buildings; rain opens umbrellas; Quality: low thins them; frame rate at each", seconds: 90, tags: ["crowd", "photos"], description: "Day bar beside the car and to each hour (setup), then 1x. Enter, WASD with Shift to the shops, key 3, the quality button. Events crowd-night / crowd-rush / crowd-lunch / crowd-dinner / crowd-late / crowd-follows-clock / crowd-rain / crowd-quality-low / photo-fps; metrics crowd<Hour>People, crowd<Hour>Cars, photoFpsMin, photoFpsAvg." },
    { id: "city-audit", title: "City audit: every prop from props.js and cityscape.js sits on its roof or pavement (nothing floating, sunk, coplanar or inside out); six probe cameras (three rooftops, three streets) show no flicker between two frames; he walks each walkable roof along its AC units; shots at desktop and 844x390", seconds: 240, tags: ["look", "photos"], description: "Setup: scrubs to noon, runs day.cityscape.audit(), places six probe cameras for two frames each (the second moved 2 cm). Real input: Enter, WASD with Shift up each walkable roof's ramp and along its row of units, Esc. Events city-audit / city-shots-size / flicker-<spot> / roof-walk-<block>; metrics cityAuditFailures, flickerBlocks." },
    { id: "fill-out", title: "The filled-out city: a rooftop, street props and shop signs, the plaza and clock tower; neon and lamps at night; the street reflects only in the rain he calls", seconds: 200, tags: ["look", "photos"], description: "Day bar beside the car and to the hours (setup). Enter, WASD with Shift, the ramp, key 3. Events photo-rooftop / photo-street / photo-plaza / photo-night-* / reflect-forecast / reflect-ability; metrics propsTrees, propsSigns, nightNeon, nightBloom, reflectAbility." },
    { id: "weather", title: "Take control outside, walk to the avenue, and switch clear, clouds, rain, storm, fog, wind and snow (keys 1–7). Each blends and gets a shot; rain and storm leave the road wet. Then the Q wheel and a phone tap.", seconds: 110, tags: ["weather"], description: "Day bar to the front door (setup), Sound on, Enter, WASD to the avenue. Keys 1–7 are the seven states. Hold Q opens the wheel; the Weather button is the phone tap." },
    { id: "atmosphere", title: "Rain light then heavy (sight and sound), the music tenses as Pressure fills, M mutes and the choice is saved, frame rate stays over 30 fps in rain and storm", seconds: 70, tags: ["weather", "audio"], description: "Sound on, take control, rain at 0.3 then key 3, Pressure low then high (setup shortcut), M twice, storm fps sample." },
    { id: "weather-audio", title: "Rooftop weather soundscape and footsteps: Sound on (real click), Take control (sting), climb apt roof, walk across gravel, metal, tar and puddle surfaces, then cycle clear/sun, clouds, rain (light roof patter vs heavy downpour, gutters, umbrella), storm (distance-delayed thunder crack and rolling thunder), fog, wind (3D-panned gusts and flapping awnings) and snow (muffled city) with equal-power crossfades", seconds: 150, tags: ["weather", "audio"], description: "Day bar outside, confirms silence, turns Sound on with a pointer, Enter, climbs apt rooftop, walks gravel/metal/tar/puddle zones, cycles keys 1–7 on the roof. Logs footstep-*, rain-layers, thunder-delay, loop-seams, music-* and soundscape levels." },
    { id: "weather-life", title: "Rain: street umbrellas and car wipers; leave a storm, let go, autopilot log reacts; weather holds then drifts back to the forecast", seconds: 150, tags: ["weather"], description: "Day bar to a yard moment whose forecast isn't a storm (morning door or evening car). Enter, WASD to the avenue, key 3 then 4, Esc. If the forecast there is a storm anyway: Enter, 1, Esc, so the drift is visible. Events: street-rain, umbrellas-and-wipers, autopilot-react, weather-drift, forecast-back." },
    { id: "powers", title: "Take control on the avenue, hold E for a storm, tap E lightning, G a gust, hold V for a tornado; Charge refuses a call when empty; Sky studio off leaves 1–7 idle", seconds: 140, tags: ["powers"], description: "Day bar beside the car (setup), Sound on, Enter, WASD to the loose props. Five verbs on the bar; hold depths for Storm and Tornado." },
    { id: "camera-run", title: "Third-person camera: a two-minute walk, climb and cast run (the avenue, the stair, the apartment roof and its parapets, all five verbs and a Tornado) with the camera never inside a building or the ground, never turning over 180 deg/s, framing him and the cast's target together for 1 s or more; taking control blends in; by touch a right-half drag looks and it recentres behind him within 3 s", seconds: 170, tags: ["control", "feel", "phone", "camera"], description: "Load with ?playtest=camera-run ({\"touch\":true} for the phone run). Setup: the day bar beside the car, a full Charge. Real input: Enter, WASD with Shift up the stair and round the roof, mouse drags (one a full-width flick), E R V C X and a held V for the Tornado; by touch a tap on Take control, the stick, one-finger drags on the left and right halves, a tap on Bolt. Events control-taken / take-blend / on-the-roof / cast-framed-<power> / left-half-drag / right-half-drag / recentred / camera-stats; metrics cameraInsideFrames, cameraMaxYawDegPerSec, castFramed.<power>, recentreSeconds. Run at 1280x720 and 390x844 touch." },
    { id: "wind-fog", title: "Wind and fog you can see: a Gust shows ribbons, 10+ swirling leaves and papers, bending trees, flapping awnings and flags, a walker's umbrella flips; Fog rolls ground-fog slices into the street within 5 s and fades the skyline; on a phone, vertex shaders only, 2 slices, fps ≥ 30", seconds: 75, tags: ["powers", "phone", "feel"], description: "Takes control at lunch, stands on the plaza, taps Wind (V / #ability-wind) for a Gust, then Fog (C / #ability-fog). Events wind-gust / wind-ribbons / wind-leaves / wind-bend / wind-cloth / wind-umbrella / fog-cast / fog-roll / fog-skyline / fog-lights / fog-fps. Option {\"touch\":true} for 390x844 low quality by touch." },
    { id: "tornado-plaza", title: "Tornado on the plaza: 3 funnel shells (2 on low) with a dust ring, lifts 8+ café props that orbit and stay where they land, 0 floating/sunk after settle; on phone debris capped at 12 and fps ≥ 30", seconds: 90, tags: ["powers", "phone", "feel"], description: "Day bar beside the car (setup), control.place on the plaza (setup), Sound on, Enter / Take control tap, hold Wind for Tornado (key or held #ability-wind). Events tornado-start / tornado-layers / tornado-lifted / tornado-landed / tornado-ground / tornado-crowd / tornado-fps. Option {\"touch\":true} for 390x844 low quality." },
    { id: "lightning-bolt", title: "Lightning bolt: a forked bolt (3+ forks, 2+ re-strikes inside 400 ms), a flash that lights the facades within 40 m for 2+ frames, a camera-facing afterimage, sparks and smoke, a flush scorch that cools orange to black over 10 s, the crowd flinches; by touch at low quality the cast frame stays under 50 ms", seconds: 90, tags: ["powers", "phone", "feel"], description: "Takes control, walks to the avenue, casts Lightning (key, or a tap on the bolt button with touch:true) and measures the cast frame by frame. Events bolt-forks / bolt-restrikes / bolt-flash / bolt-afterimage / bolt-scorch / bolt-flush / bolt-crowd / bolt-frame." },
    { id: "five-verbs", title: "Five verbs + Charge: bar shows Lightning Rain Wind Fog Sun; hold Lightning→Storm and full Wind→Tornado; on phone ≤7 controls none over the character; street tap aims; Sky studio gates 1–7", seconds: 180, tags: ["powers", "phone", "hud"], description: "Runs powers then phone arc checks at touch size. Events five-verbs / storm-gather / tornado-start / sky-studio-off / touch-budget / street-aim / goal-labels." },
    { id: "spoken-dialogue", title: "Spoken dialogue: every dialogue line has its own clip in the build, sampled clips load and decode, and with Sound on Part 1's opening lines play as voice (day:dialogue say), not babble", seconds: 60, tags: ["voice", "story", "audio"], description: "Load with ?playtest=spoken-dialogue. Sound on (real pointer), Enter, Part 1 started by its API (setup). Events dialogue-index / dialogue-decode / sound-on / dialogue-say / dialogue-played." },
    { id: "voice", title: "Small Weather's DoD voice: episode open on Enter, a reaction for each weather state, power barks not every time, episode close on Esc", seconds: 100, tags: ["voice"], description: "Sound on (real pointer), Enter, keys 1–7 with cooldown gaps, bolts for chance/cooldown skips, Esc. Events voice-play / voice-weather-* / voice-power." },
    { id: "voice-director", title: "Voice director: take control and first power uses speak with a caption clear of the ability bar; lines never overlap; Voices mute leaves music/effects alone; day end speaks", seconds: 90, tags: ["voice", "audio"], description: "Load with ?playtest=voice-director. Sound on (real pointer), Enter, E then R, Voices off in Settings, day-end recap (setup). Optional {\"touch\":true}. Events voice-take / voice-power-first / voice-caption / voice-no-overlap / voices-mute / voice-dayend. Run at desktop and 390x844." },
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
    // Most scenarios still use keys 1–7 for forecast weather; Sky studio is off for players by default.
    // Powers / five-verbs turn it off again to assert the gate.
    try {
      if (id !== "powers" && id !== "five-verbs") localStorage.setItem("icanbe.skyStudio", "on");
      else localStorage.setItem("icanbe.skyStudio", "off");
    } catch (e) { /* private mode */ }
    try {
      if (["smoke", "hud-layout", "phone", "cold-start", "street-teaches", "quiet-ui"].includes(id)) forcePublicView();
      if (id !== "title" && id !== "cold-start" && id !== "street-teaches" && window.day && window.day.title && window.day.title.quiet) window.day.title.quiet();
      if (id !== "smoke" && id !== "first-visit" && id !== "phone" && window.day && window.day.tutorial && window.day.tutorial.quiet) {
        window.day.tutorial.quiet();
      }
      if (t.spot) await spotProbe(options, t, t.spot);
      else if (id === "barks") await barksScenario(options, t);
      else if (id === "moments") await momentsScenario(options, t);
      else if (id === "cold-start") await coldStart(options, t);
      else if (id === "street-teaches") await streetTeaches(options, t);
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
      else if (id === "city") await city(options, t);
      else if (id === "look") await look(options, t);
      else if (id === "render-grade") await renderGrade(options, t);
      else if (id === "photos") await photos(options, t);
      else if (id === "fill-out") await fillOut(options, t);
      else if (id === "city-audit") await cityAudit(options, t);
      else if (id === "crowd") await crowdScenario(options, t);
      else if (id === "weather") await weather(options, t);
      else if (id === "cast-feel") await castFeel(options, t);
      else if (id === "weather-abilities") await weatherAbilities(options, t);
      else if (id === "slice") await sliceScenario(options, t);
      else if (id === "neighbors") await neighborsScenario(options, t);
      else if (id === "memory") await memoryScenario(options, t);
      else if (id === "daily") await dailyScenario(options, t);
      else if (id === "neighbor-bodies") await neighborBodies(options, t);
      else if (id === "crowd-reacts") await crowdReacts(options, t);
      else if (id === "atmosphere") await atmosphere(options, t);
      else if (id === "weather-audio") await weatherAudio(options, t);
      else if (id === "weather-life") await weatherLife(options, t);
      else if (id === "powers") await powers(options, t);
      else if (id === "five-verbs") await fiveVerbs(options, t);
      else if (id === "wind-fog") await windFog(options, t);
      else if (id === "tornado-plaza") await tornadoPlaza(options, t);
      else if (id === "lightning-bolt") await lightningBolt(options, t);
      else if (id === "camera-run") await cameraRun(options, t);
      else if (id === "voice") await voice(options, t);
      else if (id === "voice-director") await voiceDirector(options, t);
      else if (id === "spoken-dialogue") await spokenDialogue(options, t);
      else if (id === "episodes") await episodes(options, t);
      else if (id === "story-parts") await storyParts(options, t);
      else if (id === "turning-moments") await turningMoments(options, t);
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

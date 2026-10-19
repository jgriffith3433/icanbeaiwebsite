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
  return w.person.getChildMeshes().some((m) => m.isEnabled() && m.isVisible && m.isInFrustum(planes));
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
  pressKey("Escape");
  await sleep(500);
  t.scene("Live");
}

/* ---------------- smoke: boot, see the character, let a minute of the day run ---------------- */
async function smoke(options, t) {
  t.scene("Live");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  const fr0 = window.day.now().frame;
  checkFrame(t, fr0);
  t.note(`${fr0.action.block}: ${fr0.action.text}`);
  t.log(`date ${window.day.now().key}, ${$("time").textContent}${$("ampm").textContent}, ${fr0.action.text}`);
  if (personOnScreen()) t.event("person-visible");
  else t.problem("warning", "The person isn't on screen at load");
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
  await sleep(6000);
  stopWatching();
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
  t.progress(0.9);

  await checkFoundation(t);
  t.progress(1);
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
    t.problem("bug", "Hawkes Analytics didn't load (js/hawkes-analytics.js)");
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

    // Wait for the batches to go out.
    await t.until(() => ["page_view", "game_ready", "screen", "progress", "feature"].every((n) => sent().some((e) => e.name === n)), 15000, "page_view, progress and feature events to be sent").catch(() => {});
    showSent();
    for (const n of ["page_view", "session_start", "game_ready", "screen", "progress", "feature"]) {
      if (!sent().some((e) => e.name === n)) t.problem("bug", `No ${n} event went out`);
    }
    const features = new Set(sent().filter((e) => e.name === "feature").map((e) => e.props.name));
    t.metric("featuresSent", [...features].join(","));
    ["camera", "speed", "pause", "scrub", "step", "details", "sound", "live"].forEach((f) => !features.has(f) && t.problem("warning", `No feature event for ${f}`));
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
    t.event("feedback-prompt", `shown after ${window.day.analytics.watched()} s: "What would you want this to be?"`);
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

const E = () => window.DayEngine;

installPlaytest({
  product: "icanbe",
  scenarios: [
    { id: "smoke", title: "Boot, see Small Weather, a minute of the day at 10×, pause, back to live; Babylon 9, physics, his name in the panel and log", seconds: 30, tags: ["smoke"] },
    { id: "day", title: "The whole day at 1200× (every block must start)", seconds: 90, tags: ["full"] },
    { id: "analytics", title: "Camera, speeds, day bar and keys with the analytics events going out, then the 3-minute question, dismissed", seconds: 260, tags: ["analytics"] },
  ],
  isReady: () => !!(window.day && window.day.now().frame),
  async start(id, options, t) {
    try {
      if (id === "smoke") await smoke(options, t);
      else if (id === "day") await wholeDay(options, t);
      else if (id === "analytics") await analytics(options, t);
    } finally {
      stopWatching();
    }
  },
  stop() {
    stopRun();
    stopWatching();
  },
});

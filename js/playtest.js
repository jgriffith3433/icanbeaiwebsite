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
function quietMoment(day) {
  const home = (a) => !a.inCar && !a.path && a.room && window.DAY_CONFIG.rooms[a.room] && window.DAY_CONFIG.rooms[a.room].building === "home";
  return (
    day.actions.find((a) => a.pose === "sitCouch" && home(a) && a.end - a.start > 4) ||
    day.actions.find((a) => home(a) && a.pose !== "lie" && a.pose !== "side" && a.end - a.start > 4) ||
    day.actions.find((a) => !a.inCar && !a.path)
  );
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
  await how();
  await t.until(() => C.mode() !== "control", 3000, "letting go");
  t.event("let-go", `${label}: his day says ${fr0.room} · "${fr0.action.text}" · ${Math.hypot(st0.x - fr0.person.x, st0.z - fr0.person.z).toFixed(1)} m away`);
  if (!$("log").textContent.includes(window.DAY_CONFIG.control.lines.letGo)) t.problem("bug", "Letting go isn't in the action log");
  await t.until(() => C.mode() === "schedule", 70000, "him to walk back to his day");
  await sleep(300);
  stopWatching();
  const back = C.log().filter((e) => e.what === "back").pop();
  const fr = window.day.now().frame;
  t.metric(`${label}ReturnFrames`, frames);
  t.metric(`${label}ReturnMaxStep`, Math.round(maxStep * 1000) / 1000);
  if (back && back.how === "walk") t.event("back-on-schedule", `${label}: walked back, now "${fr.action.text}" (${fr.room}), ${off == null ? "?" : off.toFixed(3)} m from where his day puts him`);
  else t.problem("bug", `${label}: he didn't walk back to his day (${back ? back.how : "no back"})`);
  if (maxStep > 0.5) t.problem("bug", `${label}: he jumped ${maxStep.toFixed(2)} m in one frame on the way back (a teleport, not a walk)`);
  if (off != null && off > 0.05) t.problem("bug", `${label}: back on his day, but ${off.toFixed(2)} m from where it puts him`);
  checkFrame(t, fr);
  if (!$("log").textContent.includes(window.DAY_CONFIG.control.lines.back)) t.problem("bug", "Being back on his day isn't in the action log");
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
  const day = window.day.today();
  const a = quietMoment(day);
  scrubTo(a.start + Math.min(1, (a.end - a.start) / 3));
  await sleep(600);
  clickSpeed(1);
  t.event("start-at", `${E().fmtClock(a.start)} ${a.block}: "${a.text}" (${a.room})`);
  await sleep(1500);
  t.progress(0.05);

  // 1. Take control (Enter).
  t.scene("Taking control");
  const m0 = window.day.now().minutes;
  pressKey("Enter");
  await t.until(() => C.mode() === "control", 3000, "Take control (Enter)");
  const st = C.state();
  t.event("control-taken", `Enter · at ${st.x.toFixed(2)},${st.z.toFixed(2)} · Havok controller ${st.physics ? "on" : "OFF"} · button "${btn && btn.textContent}"`);
  if (!st.physics) t.problem("bug", "He moves without the Havok character controller (physics off?)");
  if (btn && btn.textContent !== "Let go") t.problem("bug", `The button says "${btn.textContent}" while he's the player's, not "Let go"`);
  if (!$("log").textContent.includes(lines.take)) t.problem("bug", "Taking control isn't in the action log");
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
  if (tfl.jumps < 2) t.problem("bug", `The touch jump button gave ${tfl.jumps} jumps for three taps`);
  t.progress(0.85);

  t.scene("Letting go (phone)");
  await letGoAndWatch(t, () => tapEl(btn).then(() => btn.click()), "touch");
  if (!native) C.touch(false);
  t.scene("Back on his day");
  await sleep(1500);
  t.progress(1);
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
  await t.until(() => window.day.engineInfo && window.day.engineInfo().model !== "loading", 30000, "his model to load").catch(() => {});
  const info = window.day.engineInfo ? window.day.engineInfo() : {};
  if (info.model !== "small-weather" || !skinNow()) {
    t.problem("blocker", `Small Weather's model didn't load (${info.model}${info.modelError ? ": " + info.modelError : ""}): the box figure shows`);
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
/** Walk him to a point with the keys. False if he gets stuck or falls through. */
async function goTo(tx, tz, t, opts) {
  opts = opts || {};
  const close = opts.close == null ? 0.7 : opts.close;
  const limit = opts.ms || 22000;
  const sprint = !!opts.sprint;
  const started = performance.now();
  let stillSince = started;
  let last = window.day.control.state();
  let ticks = 0;
  try {
    while (performance.now() - started < limit) {
      const st = window.day.control.state();
      if (st.y < -0.45) {
        t.problem("bug", `He fell through the world at ${st.x.toFixed(1)},${st.z.toFixed(1)} (y ${st.y.toFixed(2)})`);
        return false;
      }
      if (Math.hypot(st.x - tx, st.z - tz) < close) return true;
      if (Math.hypot(st.x - last.x, st.z - last.z) > 0.12) {
        stillSince = performance.now();
        last = st;
      } else if (performance.now() - stillSince > 2800) return false;
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
  const outside = day.actions.find((a) => a.place === "carSideHome" && !a.inCar && !a.path && a.end - a.start > 1);
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

const E = () => window.DayEngine;

installPlaytest({
  product: "icanbe",
  scenarios: [
    { id: "smoke", title: "Boot, see Small Weather, a minute of the day at 10×, pause, back to live; Babylon 9, physics, his name in the panel and log", seconds: 30, tags: ["smoke"] },
    { id: "day", title: "The whole day at 1200× (every block must start)", seconds: 90, tags: ["full"] },
    { id: "analytics", title: "Camera, speeds, day bar and keys with the analytics events going out, then the 3-minute question, dismissed", seconds: 260, tags: ["analytics"] },
    { id: "model", title: "Small Weather's 3D model: on his day it walks, idles and works; under control (Enter) it idles, walks (WASD), runs (Shift), jumps, falls and floats (Space, held); Esc and he walks back", seconds: 80, tags: ["model"], description: "Waits for models/small-weather.glb. The day bar jumps to a walk, a still moment and work at the desk (setup shortcuts); the rest is real keys." },
    { id: "control", title: "Take control (Enter): walk, sprint, orbit the camera, a jump and two in the air, float; Esc and he walks back to his day; then the phone's touch stick and jump button", seconds: 100, tags: ["control"], description: "Starts at a quiet moment at home (the day bar). On a desktop-sized window the phone part shows the touch controls with day.control.touch(true)." },
    { id: "city", title: "The day plays in the district (home, the drive, the office, home again), then he walks the street, the park and three roofs, and a building stops him", seconds: 240, tags: ["city"], description: "Day bar to home, the avenue, the office and home again (setup). Then Enter beside the car and WASD up the three ramps, across the street into the park, and into a wall." },
  ],
  isReady: () => !!(window.day && window.day.now().frame),
  async start(id, options, t) {
    try {
      if (id === "smoke") await smoke(options, t);
      else if (id === "day") await wholeDay(options, t);
      else if (id === "analytics") await analytics(options, t);
      else if (id === "control") await control(options, t);
      else if (id === "model") await model(options, t);
      else if (id === "city") await city(options, t);
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

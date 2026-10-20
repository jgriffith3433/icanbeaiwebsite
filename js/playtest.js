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

/* ---------------- look: the city at noon, dusk and night, then the phone quality setting ---------------- */
// Day bar to the sidewalk (setup), then real keys walk him in front of a block. Scrub holds the clock
// (a scrub leaves the day paused) so the three times stay put for the shot. The quality button is a real click.
async function look(options, t) {
  t.scene("City noon");
  checkBasics(t);
  await t.until(() => window.day.now().frame, 15000, "the first frame");
  await t.until(() => window.day.look, 8000, "the city look");
  const day = window.day.today();
  const cfg = window.DAY_CONFIG;
  const street = cfg.street || { z: 12.6 };
  const shop = ((cfg.city && cfg.city.blocks) || []).find((b) => b.id === "shop") || { x: 50, z: 0.5 };
  const outside = day.actions.find((a) => a.place === "carSideHome" && !a.inCar && !a.path && a.end - a.start > 1);
  if (!outside) {
    t.problem("bug", "No moment beside the car to stand in the street");
    return;
  }
  scrubTo(outside.start + Math.min(0.4, (outside.end - outside.start) / 3));
  await sleep(500);
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
      const info = window.day.look.info();
      const sky = info.sky || {};
      t.event(eventName, `${sceneName}: source ${info.source}, ${info.pbr} PBR, ${info.textured} textured, ${info.neon} neon, exposure ${info.exposure.toFixed(2)}, sky ${sky.day.toFixed(2)}/${sky.dusk.toFixed(2)}/${sky.night.toFixed(2)}, neon ${info.neonLevel.toFixed(2)}`);
      if (info.pbr < 4 || info.textured < 4) t.problem("bug", "The city surfaces are still flat colours");
      return info;
    });
  }

  const noon = await shot("City noon", 12 * 60, "look-noon");
  if (noon.sky.day < 0.6) t.problem("bug", `Noon isn't the day sky (${noon.sky.day.toFixed(2)})`);
  if (noon.exposure < 1) t.problem("bug", `Noon exposure is ${noon.exposure.toFixed(2)} (the day went dark)`);
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
  t.event("quality-low", `low: bloom off, shadows off, samples ${low.samples}, scaling ${low.scaling}, ${avg.toFixed(1)} ms a frame over ${samples.length} frames`);
  if (samples.length && avg > 40) t.problem("warning", `Low quality averaged ${avg.toFixed(1)} ms a frame`);
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
  if (storm && W.now().sound.thunder < 0.4) t.problem("bug", "Storm has no thunder in the weather sound levels");
  else if (storm) t.event("thunder-level", `storm thunder ${W.now().sound.thunder.toFixed(2)}`);

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
  const outside = day.actions.find((a) => a.place === "carSideHome" && !a.inCar && !a.path && a.end - a.start > 1)
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
  const outside = day.actions.find((a) => a.place === "carSideHome" && !a.inCar && !a.path && a.end - a.start > 1) || quietMoment(day);
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

const E = () => window.DayEngine;

installPlaytest({
  product: "icanbe",
  scenarios: [
    { id: "smoke", title: "Boot, see Small Weather, a minute of the day at 10×, pause, back to live; Babylon 9, physics, his name in the panel and log", seconds: 30, tags: ["smoke"] },
    { id: "day", title: "The whole day at 1200× (every block must start)", seconds: 90, tags: ["full"] },
    { id: "analytics", title: "Camera, speeds, day bar and keys with the analytics events going out, then the 3-minute question, dismissed", seconds: 260, tags: ["analytics"] },
    { id: "model", title: "Small Weather's 3D model: on his day it walks, idles and works; under control (Enter) it idles, walks (WASD), runs (Shift), jumps, falls and floats (Space, held); Esc and he walks back", seconds: 80, tags: ["model"], description: "Waits for models/small-weather.glb. The day bar jumps to a walk, a still moment and work at the desk (setup shortcuts); the rest is real keys." },
    { id: "control", title: "Take control (Enter): walk, sprint, orbit the camera, a jump and two in the air, float; Esc and he walks back to his day; then the phone's touch stick and jump button", seconds: 100, tags: ["control"], description: "Starts at a quiet moment at home (the day bar). On a desktop-sized window the phone part shows the touch controls with day.control.touch(true)." },
    { id: "storm-ride", title: "Storm-riding: hold Space in the air to glide with wind trails; a Gust updraft lifts him from the street to rooftop height; glide apt roof to shop roof without touching the ground", seconds: 240, tags: ["control", "powers"], description: "Day bar beside the car. Storm weather (4), real keys for glide, G for updraft, climb apt then glide to shop." },
    { id: "city", title: "The day plays in the district (home, the drive, the office, home again), then he walks the street, the park and three roofs, and a building stops him", seconds: 240, tags: ["city"], description: "Day bar to home, the avenue, the office and home again (setup). Then Enter beside the car and WASD up the three ramps, across the street into the park, and into a wall." },
    { id: "look", title: "The city at noon, dusk and night (navy, wet surfaces, neon), then Quality: low", seconds: 80, tags: ["look"], description: "Day bar beside the car, Enter, walk to the shop front. Scrub holds noon, dusk and night. Then the quality button: bloom and shadows off, frame time recorded." },
    { id: "weather", title: "Take control outside, walk to the avenue, and switch clear, clouds, rain, storm, fog, wind and snow (keys 1–7). Each blends and gets a shot; rain and storm leave the road wet. Then the Q wheel and a phone tap.", seconds: 110, tags: ["weather"], description: "Day bar to the front door (setup), Sound on, Enter, WASD to the avenue. Keys 1–7 are the seven states. Hold Q opens the wheel; the Weather button is the phone tap." },
    { id: "weather-audio", title: "Sound stays off until a real click; take control (sting); music beds crossfade across clear, rain, storm, fog and snow; rain and storm raise ambience", seconds: 100, tags: ["weather", "audio"], description: "Day bar to the front door. Confirms silence, turns Sound on with a pointer, Enter, walk to the avenue, keys 1/3/4/5/7. Logs music-* and amb levels." },
    { id: "weather-life", title: "Rain: street umbrellas and car wipers; leave a storm, let go, autopilot log reacts; weather holds then drifts back to the forecast", seconds: 150, tags: ["weather"], description: "Day bar to a yard moment whose forecast isn't a storm (morning door or evening car). Enter, WASD to the avenue, key 3 then 4, Esc. If the forecast there is a storm anyway: Enter, 1, Esc, so the drift is visible. Events: street-rain, umbrellas-and-wipers, autopilot-react, weather-drift, forecast-back." },
    { id: "powers", title: "Take control on the avenue, hold F for a storm, E lightning, G a gust, T a tornado; Pressure refuses a call when empty", seconds: 120, tags: ["powers"], description: "Day bar beside the car (setup), Sound on, Enter, WASD to the loose props. Real keys for each power; the meter must deny one." },
    { id: "voice", title: "Small Weather's DoD voice: episode open on Enter, a reaction for each weather state, power barks not every time, episode close on Esc", seconds: 100, tags: ["voice"], description: "Sound on (real pointer), Enter, keys 1–7 with cooldown gaps, bolts for chance/cooldown skips, Esc. Events voice-play / voice-weather-* / voice-power." },
    { id: "episodes", title: "Chapter episodes: offer or start Morning, Lunch, Hurricane drive and Night; complete morning goals (clouds→clear); forecast score card and localStorage best", seconds: 200, tags: ["episodes"], description: "Jumps the clock to each episode's chapter, takes control, accepts the offer (or starts via API), completes morning weather goals with keys 2 then 1, checks the score card and icanbe.episodes.best." },
  ],
  isReady: () => !!(window.day && window.day.now().frame),
  async start(id, options, t) {
    try {
      if (id === "smoke") await smoke(options, t);
      else if (id === "day") await wholeDay(options, t);
      else if (id === "analytics") await analytics(options, t);
      else if (id === "control") await control(options, t);
      else if (id === "storm-ride") await stormRide(options, t);
      else if (id === "model") await model(options, t);
      else if (id === "city") await city(options, t);
      else if (id === "look") await look(options, t);
      else if (id === "weather") await weather(options, t);
      else if (id === "weather-audio") await weatherAudio(options, t);
      else if (id === "weather-life") await weatherLife(options, t);
      else if (id === "powers") await powers(options, t);
      else if (id === "voice") await voice(options, t);
      else if (id === "episodes") await episodes(options, t);
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

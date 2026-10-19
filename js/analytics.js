/* ==========================================================================
   Hawkes Analytics: what viewers watch and touch (the SDK is js/hawkes-analytics.js,
   a copy of hawkesgen/clients/js/hawkes-analytics.js; the contract is
   hawkesgen/docs/analytics.md; how it's wired here is in AGENTS.md "Analytics").
   It only listens: the page's controls, the day bar, the keys and the camera
   gestures, plus one frame callback through day.watch(). Nothing per frame is
   sent, and nothing personal. Any failure here stays here.
   ========================================================================== */
(function () {
  "use strict";
  const A = window.hawkesAnalytics;
  const E = window.DayEngine;
  if (!A || !window.day || !E) return;
  const $ = (id) => document.getElementById(id);
  const safe = (fn) => (...args) => {
    try {
      return fn(...args);
    } catch (e) {
      /* analytics never breaks the day */
    }
  };
  const pub = document.documentElement.classList.contains("public");
  const clock24 = (m) => {
    const t = ((m % 1440) + 1440) % 1440;
    return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(Math.floor(t % 60)).padStart(2, "0");
  };
  const chapterLabel = (c) => ((window.DAY_CONFIG.chapters || {})[c] || {}).label || c || "";
  const MODE_SCREEN = { live: "live", play: "playback", pause: "paused" };

  /* ---------------- input: what the viewer is doing right now ---------------- */
  let lastInput = 0;
  let lastKey = 0;
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach((ev) =>
    window.addEventListener(ev, () => (lastInput = performance.now()), { capture: true, passive: true })
  );
  window.addEventListener("keydown", () => (lastKey = performance.now()), { capture: true, passive: true });
  // A button "clicked" by a key (Space, 1–5, Esc) arrives as a click right after the keydown.
  const via = () => (performance.now() - lastKey < 80 ? "key" : "click");

  /* ---------------- features: every control ---------------- */
  const feature = safe((name, props) => A.feature(name, props));
  $("speeds").addEventListener("click", safe((e) => {
    const b = e.target.closest("button[data-speed]");
    if (b) feature("speed", { value: Number(b.dataset.speed), via: via() });
  }));
  // main.js updates the button label in its own click handler (registered first): "Play" now = it just paused.
  $("play").addEventListener("click", safe(() => feature($("play").textContent === "Play" ? "pause" : "play", { via: via() })));
  $("live").addEventListener("click", safe(() => feature("live", { via: via() })));
  $("sound").addEventListener("click", safe(() => feature("sound", { value: $("sound").getAttribute("aria-pressed") === "true" ? "on" : "off" })));
  $("details").addEventListener("click", safe(() => feature("details", { value: $("details").getAttribute("aria-pressed") === "true" ? "open" : "closed" })));
  document.querySelectorAll('a[href="whatsnew.html"]').forEach((a) => a.addEventListener("click", () => feature("whatsnew")));
  document.querySelectorAll('a[href="privacy.html"]').forEach((a) => a.addEventListener("click", () => feature("privacy")));

  // The day bar: one event when the drag settles, with where it landed.
  let scrubTimer = null;
  let scrubbing = false;
  $("scrub").addEventListener("input", () => {
    scrubbing = true;
    clearTimeout(scrubTimer);
    scrubTimer = setTimeout(safe(() => {
      scrubbing = false;
      const n = window.day.now();
      feature("scrub", { to: clock24(n.minutes), activity: blockAt(n.minutes).title });
    }), 1200);
  });
  // ← → step through the day: one event per burst of presses.
  let stepTimer = null;
  let steps = 0;
  window.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.target && e.target.tagName === "INPUT") return;
    steps += e.key === "ArrowRight" ? 1 : -1;
    clearTimeout(stepTimer);
    stepTimer = setTimeout(safe(() => {
      const n = window.day.now();
      feature("step", { presses: steps, to: clock24(n.minutes), activity: blockAt(n.minutes).title });
      steps = 0;
    }), 1200);
  });

  // The camera: a drag turns it, the wheel or a pinch zooms, a tap is a click on something in the room.
  const canvas = $("view");
  const pointers = new Map();
  let gesture = null;
  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) gesture = { x: e.clientX, y: e.clientY, moved: 0, pinch: false, t: performance.now() };
    if (pointers.size > 1) gesture.pinch = true;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!gesture || !pointers.has(e.pointerId)) return;
    gesture.moved = Math.max(gesture.moved, Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y));
  });
  const endGesture = safe((e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size || !gesture) return;
    const g = gesture;
    gesture = null;
    if (g.pinch) feature("camera", { action: "pinch" });
    else if (g.moved > 8) feature("camera", { action: "turn" });
    else if (performance.now() - g.t < 600) feature("camera", { action: "tap", on: picked(e.clientX, e.clientY) });
  });
  window.addEventListener("pointerup", endGesture);
  window.addEventListener("pointercancel", endGesture);
  let wheelTimer = null;
  canvas.addEventListener("wheel", () => {
    if (wheelTimer) return;
    wheelTimer = setTimeout(() => (wheelTimer = null), 1500);
    feature("camera", { action: "zoom" });
  }, { passive: true });

  /** What a tap landed on: "person", "car", a spot in the room ("bed", "couch"…), or "room". One pick per tap. */
  function picked(x, y) {
    const w = window.day.world();
    if (!w) return undefined;
    const r = canvas.getBoundingClientRect();
    const hit = w.scene.pick(x - r.left, y - r.top);
    if (!hit || !hit.hit || !hit.pickedMesh) return "nothing";
    for (let n = hit.pickedMesh; n; n = n.parent) {
      if (n === w.person) return "person";
      if (n === w.car) return "car";
      if (/^at-/.test(n.name || "")) return n.name.slice(3, 43);
    }
    return "room";
  }

  /* ---------------- where in the day: context, screen and progress ---------------- */
  let blocks = [];
  let blocksKey = null;
  function blockAt(minutes) {
    let i = 0;
    while (i + 1 < blocks.length && blocks[i + 1].start <= minutes + 1e-6) i++;
    return blocks[i] ? Object.assign({ index: i }, blocks[i]) : { index: 0, title: "", chapter: "" };
  }

  // progress.step only grows in a session: the block's place in the day (1…n), +100 for each later day.
  const PKEY = "icanbe.progress";
  let prog = null;
  function loadProgress() {
    const sid = A.config().session;
    try {
      prog = JSON.parse(sessionStorage.getItem(PKEY) || "null");
    } catch (e) {
      prog = null;
    }
    if (!prog || prog.sid !== sid) prog = { sid, key: null, base: 0, max: 0 };
  }
  function saveProgress() {
    try {
      sessionStorage.setItem(PKEY, JSON.stringify(prog));
    } catch (e) {
      /* private mode */
    }
  }
  function reached(key, b, how) {
    if (!prog || prog.sid !== A.config().session) loadProgress();
    if (prog.key && key < prog.key) return; // went back a day: not further into it
    if (prog.key && key > prog.key) prog.base += 100;
    prog.key = key;
    const step = prog.base + b.index + 1;
    if (step <= prog.max) return;
    prog.max = step;
    saveProgress();
    A.track("progress", { step, of: prog.base + blocks.length, label: b.title, chapter: chapterLabel(b.chapter), clock: clock24(b.start), via: how });
  }

  let ready = false;
  let screen = null;
  let ctxKey = "";
  let curBlock = null;
  let pending = null; // a block landed on by a jump: it counts once the viewer stays 1.5 s
  let lastKeySeen = null;

  window.day.watch(safe((info) => {
    const w = window.day.world();
    if (!ready) {
      ready = true;
      if (!w) {
        A.screen("unsupported");
        A.error("This browser can't draw the day (no WebGL)", "webgl");
        return;
      }
      A.ready({ view: pub ? "public" : "hud", blocks: info.day.blocks.length });
    }
    if (!w) return;
    const now = window.day.now();
    if (blocksKey !== info.key) {
      blocksKey = info.key;
      blocks = info.day.blocks || [];
    }
    const b = blockAt(info.to);
    const ctx = { time: clock24(info.to), activity: b.title, chapter: chapterLabel(b.chapter), mode: now.mode, speed: now.mode === "play" ? now.speed : 1, view: pub ? "public" : "hud" };
    const k = ctx.time + ctx.activity + ctx.mode + ctx.speed;
    if (k !== ctxKey) {
      ctxKey = k;
      A.setContext(ctx);
    }
    const s = MODE_SCREEN[now.mode] || now.mode;
    if (s !== screen) {
      screen = s;
      A.screen(s);
    }
    // The end of the day: the clock rolled into the next day while it was being watched.
    if (lastKeySeen && info.key > lastKeySeen && !info.jumped && now.mode !== "pause") dayEnded(now);
    lastKeySeen = info.key;

    const t = performance.now();
    if (!curBlock || curBlock.key !== info.key || curBlock.index !== b.index) {
      curBlock = { key: info.key, index: b.index };
      if (now.mode === "pause" || info.jumped) pending = { key: info.key, b, since: t };
      else {
        pending = null;
        reached(info.key, b, now.mode);
      }
    } else if (pending && t - pending.since > 1500 && !scrubbing) {
      reached(pending.key, pending.b, "jump");
      pending = null;
    }
  }));

  /* ---------------- watching time, the end of the day, and the question ---------------- */
  // Watching a day needs no input, so the SDK's active time (input in the last minute) undercounts it:
  // watch_time counts the minutes the tab was on screen.
  const MILESTONES = [1, 3, 5, 10, 20, 30, 60, 120, 240, 480];
  const ASK_AFTER = 180; // seconds on screen before the question
  let watched = 0;
  let askDue = null;
  setInterval(safe(() => {
    if (document.hidden || !ready) return;
    watched++;
    const m = watched / 60;
    if (MILESTONES.includes(m)) A.track("watch_time", { minutes: m, mode: window.day.now().mode });
    if (watched === ASK_AFTER) askDue = askDue || "3 minutes";
    if (askDue && performance.now() - lastInput > 4000 && !scrubbing && !gesture) {
      const why = askDue;
      askDue = null;
      ask(why);
    }
  }), 1000);

  let dayEndSent = false;
  function dayEnded(now) {
    if (dayEndSent) return;
    dayEndSent = true;
    A.track("day_end", { mode: now.mode, speed: now.mode === "play" ? now.speed : 1, watched: Math.round(watched / 60) });
    askDue = "the end of the day";
  }

  // The direction of I Can Be is open, so the comment is the point: thumbs, then "anything goes".
  const ASK_ID = "direction";
  let asked = false;
  function ask(context) {
    if (asked) return;
    asked = true;
    const p = A.ask({
      id: ASK_ID,
      question: "What would you want this to be?",
      context,
      comment: true,
      placeholder: "Anything goes. A screensaver, a game, a story, something else…",
      thanks: "Thank you. We read every one.",
      theme: { background: "rgba(14, 16, 22, 0.94)", color: "#f6f1e8", accent: "#f0c27a", font: 'Outfit, "Segoe UI", system-ui, sans-serif', radius: "18px" },
    });
    if (!document.querySelector(`[data-hawkes-ask="${ASK_ID}"]`)) return; // asked already this session, or closed in the last 7 days
    A.track("feedback_prompt", { action: "shown", context });
    p.then(safe((answer) => A.track("feedback_prompt", { action: answer ? "answered" : "dismissed", context, commented: !!(answer && answer.text) })));
  }

  /* for the playtest (js/playtest.js) and the console */
  window.day.analytics = { watched: () => watched, askAfter: ASK_AFTER, askId: ASK_ID };
})();

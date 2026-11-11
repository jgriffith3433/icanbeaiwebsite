/* ==========================================================================
   The page: clock, playback, the HUD, and the render loop.
   ========================================================================== */
(function () {
  "use strict";
  const cfg = window.DAY_CONFIG;
  const E = window.DayEngine;
  const $ = (id) => document.getElementById(id);
  const el = {
    time: $("time"),
    ampm: $("ampm"),
    what: $("what"),
    chapter: $("chapter"),
    where: $("where"),
    prog: $("prog"),
    next: $("next"),
    log: $("log"),
    meters: $("meters"),
    things: $("things"),
    segs: $("segs"),
    ticks: $("ticks"),
    scrub: $("scrub"),
    live: $("live"),
    play: $("play"),
    speeds: $("speeds"),
    date: $("date"),
    count: $("count"),
    sound: $("sound"),
    details: $("details"),
    side: $("side"),
    errors: $("errors"),
    title: $("mark-title"),
    logTitle: $("log-title"),
  };

  if (!cfg || !E) {
    el.what.textContent = "day.config.js didn't load. Check it for a syntax error.";
    return;
  }
  // `title` is also the title screen's object in day.config.js (a later key wins), so take its kicker.
  const markTitle = typeof cfg.title === "string" ? cfg.title : (cfg.title && (cfg.title.kicker || cfg.title.name)) || "";
  el.title.textContent = markTitle || "I Can Be";
  const who = (cfg.person && cfg.person.name) || "";
  if (who && el.logTitle) el.logTitle.textContent = `${who} · every action`;
  const dayStart = E.parseClock(cfg.dayStart || "7:30");

  /* ---------------- days ---------------- */
  const cache = new Map();
  /* What the city remembers (js/memory.js) goes into the day's build as `facts`: steps with `remembers` appear or not.
     It is read at load, when he is let go (his day takes in what you did together) and when the memory is shifted or
     reset, never mid-control, so the day under his feet doesn't change while you play. */
  let memFacts = {};
  let memSig = "";
  function readFacts() {
    const m = window.day && window.day.memory;
    const f = (m && m.facts && m.facts()) || {};
    const sig = JSON.stringify(Object.keys(f).sort().map((k) => [k, f[k]]));
    if (sig === memSig) return false;
    memFacts = Object.assign({}, f);
    memSig = sig;
    cache.clear();
    return true;
  }
  function keyOf(d) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function locate(ms) {
    const d = new Date(ms);
    const mins = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    const base = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (mins < dayStart ? 1 : 0));
    const key = keyOf(base);
    const minutes = (ms - base.getTime()) / 60000;
    return { key, base, minutes };
  }
  function getDay(key) {
    if (cache.has(key)) return cache.get(key);
    let day;
    try {
      day = E.build(cfg, key, memFacts);
    } catch (err) {
      console.error(err);
      day = { errors: ["The engine stopped: " + err.message], warnings: [], actions: [], segments: [], blocks: [] };
    }
    day.rows = mergeRows(day.actions || []);
    cache.set(key, day);
    if (cache.size > 4) cache.delete(cache.keys().next().value);
    if (day.warnings && day.warnings.length) console.info("[day] " + key + "\n" + day.warnings.join("\n"));
    return day;
  }
  function mergeRows(actions) {
    const rows = [];
    let lastBase = null; // the last non-micro row: the base line comes back after each micro, and the log shows it once
    actions.forEach((a) => {
      const last = rows[rows.length - 1];
      if (last && last.text === a.text && last.kind === a.kind) {
        last.end = a.end;
        last.last = a.i;
      } else {
        const row = { start: a.start, end: a.end, text: a.text, kind: a.kind, first: a.i, last: a.i };
        if (a.kind !== "micro") {
          if (lastBase && lastBase.text === a.text) row.again = true;
          lastBase = row;
        }
        rows.push(row);
      }
    });
    return rows;
  }
  function rowAt(rows, m) {
    let lo = 0;
    let hi = rows.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (rows[mid].start <= m) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /* ---------------- clock & playback ---------------- */
  const SPEEDS = [1, 10, 60, 300, 1200];
  let mode = "live"; // live | play | pause
  let speed = 1;
  let simMs = Date.now();
  let dragging = false;

  SPEEDS.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = s + "×";
    b.dataset.speed = String(s);
    b.addEventListener("click", () => {
      if (mode === "live") simMs = Date.now();
      speed = s;
      mode = "play";
      syncButtons();
    });
    el.speeds.appendChild(b);
  });

  function syncButtons() {
    el.live.setAttribute("aria-pressed", mode === "live" ? "true" : "false");
    el.live.textContent = mode === "live" ? "● Live" : "Back to now";
    el.play.textContent = mode === "pause" ? "Play" : "Pause";
    el.play.setAttribute("aria-label", mode === "pause" ? "Play" : "Pause");
    [...el.speeds.children].forEach((b) => b.setAttribute("aria-pressed", mode === "play" && Number(b.dataset.speed) === speed ? "true" : "false"));
  }
  el.live.addEventListener("click", () => {
    mode = "live";
    simMs = Date.now();
    world && world.resetCamera();
    syncButtons();
  });
  el.play.addEventListener("click", () => {
    if (mode === "pause") mode = "play";
    else {
      if (mode === "live") simMs = Date.now();
      mode = "pause";
    }
    syncButtons();
  });

  let jumped = false;
  function jumpTo(minutes) {
    const loc = locate(simMs);
    simMs = loc.base.getTime() + minutes * 60000;
    if (mode === "live") mode = "pause";
    jumped = true;
    syncButtons();
  }
  el.scrub.addEventListener("pointerdown", () => (dragging = true));
  window.addEventListener("pointerup", () => (dragging = false));
  el.scrub.addEventListener("input", () => jumpTo(Number(el.scrub.value)));

  window.addEventListener("keydown", (e) => {
    if (e.target && e.target.tagName === "INPUT" && e.key !== "Escape") return;
    if (e.key === " ") {
      el.play.click();
      e.preventDefault();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      if (mode === "live") simMs = Date.now();
      const step = (e.shiftKey ? 1 : 5) * (e.key === "ArrowRight" ? 1 : -1);
      jumpTo(locate(simMs).minutes + step);
      e.preventDefault();
    } else if (e.key === "Escape") {
      el.live.click();
    } else if (/^[1-5]$/.test(e.key)) {
      el.speeds.children[Number(e.key) - 1].click();
    }
  });

  /* ---------------- zoom belongs to the camera, not the page ---------------- */
  // Ctrl+wheel and trackpad pinch (which browsers send as Ctrl+wheel) would zoom the whole page.
  // Over the 3D view Babylon handles them as camera zoom; everywhere else they are simply blocked.
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    },
    { passive: false }
  );
  ["gesturestart", "gesturechange", "gestureend"].forEach((t) =>
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false })
  );
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && ["+", "=", "-", "_", "0"].includes(e.key)) e.preventDefault();
  });

  /* ---------------- sound ---------------- */
  let audio = null;
  let soundOn = false;
  let nextBeep = 0;
  function paintSound() {
    el.sound.setAttribute("aria-pressed", soundOn ? "true" : "false");
    el.sound.textContent = soundOn ? "Sound on" : "Sound off";
  }
  function ensureAudio() {
    if (soundOn && !audio) {
      try {
        audio = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        audio = null;
      }
    }
    if (audio && audio.state === "suspended") audio.resume();
  }
  el.sound.addEventListener("click", () => {
    soundOn = !soundOn;
    try { localStorage.setItem("icanbe.sound", soundOn ? "on" : "off"); } catch (e) { /* private mode */ }
    paintSound();
    ensureAudio();
  });
  // The mute choice is remembered. A saved "on" shows as on and starts the audio at the first gesture
  // (browsers won't play before one); a saved "off" stays off, and the title's Play leaves it off.
  let savedSound = null;
  try { savedSound = localStorage.getItem("icanbe.sound"); } catch (e) { /* none */ }
  window.__soundSaved = savedSound;
  if (savedSound === "on") {
    soundOn = true;
    paintSound();
    const arm = () => ensureAudio();
    ["pointerdown", "keydown", "touchstart"].forEach((t) => window.addEventListener(t, arm, { once: true, capture: true }));
  }
  // M mutes and unmutes (not while typing, or with a modifier).
  window.addEventListener("keydown", (e) => {
    if ((e.key || "").toLowerCase() !== "m" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const tg = e.target && e.target.tagName;
    if (tg === "INPUT" || tg === "TEXTAREA") return;
    el.sound.click();
  });
  function beep(at, freq, len, vol) {
    if (!audio) return;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol || 0.035, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g);
    g.connect(audio.destination);
    o.start(at);
    o.stop(at + len + 0.02);
  }

  /* ---------------- the Time control (public view) ----------------
     One pill: a live dot and the clock. A click or tap opens the drawer (Live, Pause, speeds, date and the day bar);
     it closes on a second tap, a tap outside, or when he's taken over. The dev HUD shows the drawer open and no pill. */
  function isPublicView() {
    return document.documentElement.classList.contains("preview-public");
  }
  const timeBtn = $("time-btn");
  const timeDrawer = $("time-drawer");
  const timeClock = $("time-btn-clock");
  function setDrawer(on, via) {
    if (!timeBtn || !timeDrawer) return;
    on = !!on && isPublicView() && !document.documentElement.classList.contains("in-control");
    if (timeDrawer.classList.contains("open") === on) return;
    timeDrawer.classList.toggle("open", on);
    timeBtn.setAttribute("aria-expanded", on ? "true" : "false");
    window.dispatchEvent(new CustomEvent("day:time-drawer", { detail: { open: on, via: via || "click" } }));
  }
  if (timeBtn) {
    timeBtn.addEventListener("click", () => setDrawer(!timeDrawer.classList.contains("open"), "click"));
    window.addEventListener("pointerdown", (e) => {
      if (timeDrawer.classList.contains("open") && !e.target.closest("#timebar")) setDrawer(false, "outside");
    }, true);
    window.addEventListener("day:control", (e) => {
      const d = (e && e.detail) || {};
      if (d.action === "take") setDrawer(false, "take-over");
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && timeDrawer.classList.contains("open")) setDrawer(false, "key");
    });
  }

  /* ---------------- details panel ---------------- */
  const wide = () => window.matchMedia("(min-width: 900px)").matches;
  let sideOpen = wide() && !isPublicView(); // the public view has no developer panel (CSS hides it, the toggle (H) can switch)
  function syncSide() {
    el.side.hidden = !sideOpen;
    el.details.setAttribute("aria-pressed", sideOpen ? "true" : "false");
  }
  el.details.addEventListener("click", () => {
    sideOpen = !sideOpen;
    syncSide();
  });
  syncSide();

  /* body meters */
  const bodyShow = (cfg.body && cfg.body.show) || Object.keys((cfg.body && cfg.body.start) || {});
  const meterEls = {};
  bodyShow.forEach((k) => {
    const row = document.createElement("div");
    row.className = "meter";
    row.innerHTML = `<span class="mlabel">${k[0].toUpperCase() + k.slice(1)}</span><span class="mbar"><i></i></span><span class="mval"></span>`;
    el.meters.appendChild(row);
    meterEls[k] = { bar: row.querySelector("i"), val: row.querySelector(".mval"), row };
  });

  /* things */
  const thingDefs = Object.entries(cfg.things || {}).filter(([, v]) => v && v.show);
  const thingEls = {};
  thingDefs.forEach(([k, v]) => {
    const c = document.createElement("div");
    c.className = "chip";
    c.innerHTML = `<span class="clabel"></span><span class="cval"></span>`;
    c.querySelector(".clabel").textContent = v.label || k;
    el.things.appendChild(c);
    thingEls[k] = { chip: c, val: c.querySelector(".cval"), last: undefined };
  });

  /* ---------------- day bar ---------------- */
  let barKey = null;
  function buildBar(day) {
    el.segs.innerHTML = "";
    el.ticks.innerHTML = "";
    const span = day.dayEnd - day.dayStart;
    (day.segments || []).forEach((s) => {
      const ch = (cfg.chapters || {})[s.chapter] || { label: s.chapter, color: "#556" };
      const d = document.createElement("div");
      d.className = "seg";
      d.style.flex = String(s.end - s.start);
      d.style.background = ch.color;
      d.title = `${ch.label} · ${E.fmtClock(s.start)}–${E.fmtClock(s.end)}`;
      if ((s.end - s.start) / span > 0.045) {
        const l = document.createElement("span");
        l.textContent = ch.label;
        d.appendChild(l);
      }
      el.segs.appendChild(d);
    });
    const first = Math.ceil(day.dayStart / 120) * 120;
    for (let m = first; m < day.dayEnd; m += 120) {
      const t = document.createElement("span");
      t.className = "tick";
      t.style.left = ((m - day.dayStart) / span) * 100 + "%";
      const h = Math.floor((m % 1440) / 60);
      t.textContent = (h % 12 || 12) + (h < 12 ? "a" : "p");
      el.ticks.appendChild(t);
    }
    el.scrub.min = String(day.dayStart);
    el.scrub.max = String(day.dayEnd - 0.01);
    el.count.textContent = `${day.actions.length} actions · ${day.rows.filter((r) => r.kind === "micro").length} small ones`;
    const base = new Date(day.dateKey + "T12:00:00");
    el.date.textContent = base.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    showErrors(day);
  }

  function showErrors(day) {
    if (!day.errors || !day.errors.length) {
      el.errors.hidden = true;
      return;
    }
    el.errors.hidden = false;
    el.errors.innerHTML = "<strong>day.config.js needs a look</strong>";
    const ul = document.createElement("ul");
    day.errors.slice(0, 8).forEach((m) => {
      const li = document.createElement("li");
      li.textContent = m;
      ul.appendChild(li);
    });
    if (day.errors.length > 8) {
      const li = document.createElement("li");
      li.textContent = `…and ${day.errors.length - 8} more (see the console).`;
      ul.appendChild(li);
    }
    el.errors.appendChild(ul);
    console.warn("[day] config problems:\n" + day.errors.join("\n"));
  }

  /* ---------------- log ---------------- */
  /* Notes: lines that aren't in the day's timeline (taking control, letting go, back on his day), written
     into the log at the minute they happened by day.note() (js/control.js). Kept per day.
     Live mode: past and current only (newest last) — never an action before its time.
     Play/pause: the same, then a labelled "Coming up" block for preview rows. */
  const notes = new Map(); // dateKey -> [{ start, text }]
  let logKey = "";
  function renderLog(day, idx, now, steering, playMode) {
    const mine = (notes.get(day.dateKey) || []).filter((n) => n.start <= now + 1e-6);
    const showSoon = playMode !== "live";
    const key = day.dateKey + ":" + idx + ":" + mine.length + ":" + !!steering + ":" + playMode;
    if (key === logKey) return;
    logKey = key;
    const rows = day.rows;
    const from = Math.max(0, idx - 6);
    const to = showSoon ? Math.min(rows.length - 1, idx + 2) : idx;
    const pastNow = [];
    const soon = [];
    for (let i = from; i <= to; i++) {
      const r = rows[i];
      if (r.again && i !== idx) continue;
      const item = { at: r.start, start: r.start, text: r.text, cls: (i < idx ? "past" : i === idx ? "now" : "soon") + (r.kind === "micro" ? " micro" : "") };
      if (i > idx) soon.push(item);
      else pastNow.push(item);
    }
    // Notes since the earliest row shown. While the player has him, the latest note is what's happening; after,
    // the day's current line comes back under the notes, from the minute he was back.
    const lastNote = mine.filter((n) => n.start >= rows[from].start).pop();
    mine.filter((n) => n.start >= rows[from].start).forEach((n) => {
      pastNow.push({ at: n.start, start: n.start, text: n.text, cls: (steering && n === lastNote ? "now" : "past") + " note" });
    });
    const cur = pastNow.find((r) => r.cls.startsWith("now") && !r.cls.includes("note"));
    if (cur && steering) cur.cls = cur.cls.replace("now", "past");
    else if (cur && lastNote && lastNote.start > rows[idx].start) cur.at = cur.start = lastNote.start + 1e-6;
    pastNow.sort((a, b) => a.at - b.at);
    const list = pastNow.slice(-10);
    el.log.innerHTML = "";
    const addRow = (r) => {
      const li = document.createElement("li");
      li.className = r.cls;
      const t = document.createElement("time");
      t.textContent = E.fmtClock(r.start, true).replace(/ (AM|PM)/, "");
      const s = document.createElement("span");
      s.textContent = r.text;
      li.appendChild(t);
      li.appendChild(s);
      el.log.appendChild(li);
    };
    list.forEach(addRow);
    if (showSoon && soon.length) {
      const head = document.createElement("li");
      head.className = "log-head coming-up";
      head.setAttribute("aria-label", "Coming up");
      head.textContent = "Coming up";
      el.log.appendChild(head);
      soon.forEach(addRow);
    }
    // the log is a capped scroller (css/site.css): keep the current row in view
    const nowLi = el.log.querySelector("li.now");
    if (nowLi) el.log.scrollTop = Math.max(0, nowLi.offsetTop - el.log.offsetTop - el.log.clientHeight / 2);
  }

  /* ---------------- world ---------------- */
  const canvas = $("view");
  let world = null;
  const firstDay = getDay(locate(simMs).key);
  try {
    world = window.DayWorld.create(canvas, cfg, firstDay.spots, firstDay.rooms);
  } catch (err) {
    console.error(err);
    el.what.textContent = "This browser can't draw the day (" + err.message + ").";
  }
  window.addEventListener("resize", () => world && world.resize());
  syncButtons();

  let lastFrameMs = performance.now();
  let lastMinutes = null;
  let lastFr = null;
  const watchers = []; // playtest hooks (js/playtest.js); empty unless a playtest is running
  let pilot = null; // js/control.js: while the player has him, it says where he is and what's happening
  let lastThings = null;
  let rowIdx = -1;

  function tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrameMs) / 1000);
    lastFrameMs = now;
    if (mode === "live") simMs = Date.now();
    else if (mode === "play") simMs += dt * speed * 1000;

    const loc = locate(simMs);
    const day = getDay(loc.key);
    if (barKey !== loc.key) {
      barKey = loc.key;
      buildBar(day);
    }
    if (!day.actions.length) return;
    const fr = E.frame(day, loc.minutes);
    const a = fr.action;
    const steer = pilot ? pilot(fr, dt, day) : null;

    const paused = mode === "pause";
    const clock = E.fmtClock(loc.minutes, true).split(" ");
    el.time.textContent = clock[0];
    el.ampm.textContent = paused ? "Paused" : clock[1];
    if (timeClock) {
      const pillText = clock[0] + " " + clock[1];
      if (timeClock.textContent !== pillText) timeClock.textContent = pillText;
      if (timeBtn.dataset.mode !== mode) timeBtn.dataset.mode = mode;
    }
    const nowPanel = el.time.closest(".panel.now") || el.what.closest(".panel.now");
    if (nowPanel) nowPanel.classList.toggle("is-paused", paused);
    rowIdx = rowAt(day.rows, loc.minutes);
    const row = day.rows[rowIdx];
    const whatText = paused ? "Paused" : (steer && steer.text ? steer.text : row.text);
    if (el.what.textContent !== whatText) {
      el.what.textContent = whatText;
      el.what.classList.remove("fresh");
      if (!paused) {
        void el.what.offsetWidth;
        el.what.classList.add("fresh");
      }
    }
    el.what.classList.toggle("micro", !paused && !steer && row.kind === "micro");
    el.what.classList.toggle("steered", !paused && !!steer);
    el.what.classList.toggle("paused", paused);
    if (!paused) {
      el.prog.style.width = (Math.max(0, Math.min(1, (loc.minutes - row.start) / Math.max(1e-6, row.end - row.start))) * 100).toFixed(1) + "%";
    }
    const ch = (cfg.chapters || {})[a.chapter] || { label: a.chapter, color: "#888" };
    // while he's the player's he's on foot, whatever the day's own car is doing: don't say DRIVE / IN THE CAR
    el.chapter.textContent = paused ? "Paused" : (steer ? "Your move" : ch.label);
    el.chapter.style.setProperty("--c", paused ? "#9aa4b2" : ch.color);
    const room = paused ? "" : (steer ? "On foot" : a.inCar ? "In the car" : (day.rooms[a.room] && day.rooms[a.room].label) || "");
    el.where.textContent = room;
    el.where.hidden = !room;
    const wsep = $("where-sep");
    if (wsep) wsep.hidden = !room;
    const nb = day.blocks.find((b) => b.start > loc.minutes + 1e-6);
    el.next.textContent = paused
      ? "Paused · clock held"
      : (nb ? `Next · ${E.fmtClock(nb.start)} · ${nb.title}` : "Next · the alarm");
    renderLog(day, rowIdx, loc.minutes, !!steer, mode);
    if (!dragging) el.scrub.value = String(loc.minutes);
    document.documentElement.style.setProperty("--marker", ((loc.minutes - day.dayStart) / (day.dayEnd - day.dayStart)) * 100 + "%");

    bodyShow.forEach((k) => {
      const v = fr.body[k];
      if (v == null) return;
      const m = meterEls[k];
      m.bar.style.width = (v * 100).toFixed(1) + "%";
      m.val.textContent = Math.round(v * 100);
      m.row.classList.toggle("high", v > 0.7);
    });
    if (fr.things !== lastThings) {
      thingDefs.forEach(([k]) => {
        const t = thingEls[k];
        const v = fr.things[k];
        if (v !== t.last) {
          t.val.textContent = v == null ? "" : String(v);
          t.chip.hidden = v == null; // a thing with no value yet shows nothing, not a lone dash
          t.chip.classList.toggle("on", v === "on" || v === "ringing" || v === "open" || v === "in hand" || v === "full");
          if (t.last !== undefined && lastMinutes != null && Math.abs(loc.minutes - lastMinutes) < 2) {
            t.chip.classList.remove("changed");
            void t.chip.offsetWidth;
            t.chip.classList.add("changed");
          }
          t.last = v;
        }
      });
    }

    /* sound */
    if (soundOn && audio && (mode === "live" || speed <= 10)) {
      if (fr.things.alarm === "ringing" && audio.currentTime >= nextBeep) {
        beep(audio.currentTime, 880, 0.11);
        beep(audio.currentTime + 0.18, 880, 0.11);
        nextBeep = audio.currentTime + 1.1;
      }
      if (lastThings && lastThings.microwave === "on" && fr.things.microwave === "off") {
        [0, 0.35, 0.7].forEach((d) => beep(audio.currentTime + d, 1560, 0.18, 0.025));
      }
    }

    const snap = jumped || lastMinutes == null || Math.abs(loc.minutes - lastMinutes) > 3;
    const fromMinutes = lastMinutes;
    const userJumped = jumped;
    jumped = false;
    lastFr = fr;
    lastMinutes = loc.minutes;
    lastThings = fr.things;
    if (world) {
      world.update(fr, dt, { snap, player: steer });
      world.scene.render();
    }
    if (watchers.length) {
      const info = { key: loc.key, day, fr, from: fromMinutes, to: loc.minutes, jumped: userJumped, dt, steered: !!steer };
      watchers.slice().forEach((fn) => fn(info));
    }
  }

  if (world) world.engine.runRenderLoop(tick);
  else setInterval(tick, 250);

  /* ---------------- version ---------------- */
  // The version is releases.json's (js/hawkes-release.js fills [data-hawkes-version]); the build stamp is the meta.
  const buildMeta = document.querySelector('meta[name="build"]');
  const BUILD = buildMeta ? buildMeta.content : "dev";
  const foot = document.querySelector(".foot");
  if (foot) foot.insertAdjacentHTML("beforeend", ` <span class="ver" data-hawkes-version hidden></span>`);
  // The page is meant to stay open all day, so a newer build can be waiting. No polling: the check runs when the tab
  // comes back into view (visibilitychange), at most once every 30 minutes, and only offers a small "New version" pill.
  // It never reloads by itself, and never shows while he's the player's or an episode is running.
  let updateFound = false;
  let lastCheck = performance.now();
  let updatePill = null;
  const busy = () => {
    const h = document.documentElement;
    if (h.classList.contains("in-control")) return true;
    const ep = window.day && window.day.episodes && window.day.episodes.now && window.day.episodes.now();
    return !!(ep && (ep.active || ep.id));
  };
  function paintUpdate() {
    if (!updateFound) return;
    if (!updatePill) {
      updatePill = document.createElement("button");
      updatePill.type = "button";
      updatePill.id = "update-pill";
      updatePill.className = "update-pill";
      updatePill.textContent = "New version";
      updatePill.title = "A newer version is out. Tap to reload.";
      updatePill.addEventListener("click", () => location.reload());
      document.body.appendChild(updatePill);
    }
    updatePill.hidden = busy();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !document.documentElement.classList.contains("public") || !buildMeta) return;
    if (updateFound) return paintUpdate();
    if (performance.now() - lastCheck < 30 * 60 * 1000) return;
    lastCheck = performance.now();
    fetch("index.html?check=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((html) => {
        const m = /<meta name="(?:build|version)" content="([^"]+)"/.exec(html);
        if (m && m[1] !== BUILD) {
          updateFound = true;
          paintUpdate();
        }
      })
      .catch(() => {});
  });
  // keep the pill out of control and episodes: hide it when either starts, show it again after
  window.addEventListener("day:control", () => setTimeout(paintUpdate, 0));
  window.addEventListener("day:episode", () => setTimeout(paintUpdate, 0));

  window.addEventListener("day:control", (e) => {
    const a = e && e.detail && e.detail.action;
    if ((a === "let-go" || a === "letgo") && readFacts()) { barKey = null; rowIdx = -1; }
  });
  window.addEventListener("day:memory", (e) => {
    const a = e && e.detail && e.detail.action;
    if ((a === "shift" || a === "apply") && (!window.day.control || window.day.control.mode() === "schedule") && readFacts()) { barKey = null; rowIdx = -1; }
  });

  /* for tinkering in the console */
  window.day = {
    jump: (clock) => jumpTo(E.parseClock(clock, dayStart)),
    speed: (s) => {
      speed = s;
      mode = "play";
      syncButtons();
    },
    live: () => el.live.click(),
    today: () => getDay(locate(simMs).key),
    world: () => world,
    /* for the playtest (js/playtest.js) */
    now: () => ({ mode, speed, key: locate(simMs).key, minutes: locate(simMs).minutes, frame: lastFr }),
    watch: (fn) => {
      watchers.push(fn);
      return () => watchers.splice(watchers.indexOf(fn), 1);
    },
    /* for the player's controller (js/control.js) */
    pilot: (fn) => (pilot = fn),
    note: (text) => {
      const loc = locate(simMs);
      if (!notes.has(loc.key)) notes.set(loc.key, []);
      notes.get(loc.key).push({ start: loc.minutes, text });
      if (notes.size > 3) notes.delete(notes.keys().next().value);
    },
    notes: () => (notes.get(locate(simMs).key) || []).slice(),
  };
})();

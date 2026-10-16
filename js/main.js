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
  };

  if (!cfg || !E) {
    el.what.textContent = "day.config.js didn't load. Check it for a syntax error.";
    return;
  }
  el.title.textContent = cfg.title || "A day";
  const dayStart = E.parseClock(cfg.dayStart || "7:30");

  /* ---------------- days ---------------- */
  const cache = new Map();
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
      day = E.build(cfg, key);
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
    actions.forEach((a) => {
      const last = rows[rows.length - 1];
      if (last && last.text === a.text && last.kind === a.kind) {
        last.end = a.end;
        last.last = a.i;
      } else {
        rows.push({ start: a.start, end: a.end, text: a.text, kind: a.kind, first: a.i, last: a.i });
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
  el.sound.addEventListener("click", () => {
    soundOn = !soundOn;
    el.sound.setAttribute("aria-pressed", soundOn ? "true" : "false");
    el.sound.textContent = soundOn ? "Sound on" : "Sound off";
    if (soundOn && !audio) {
      try {
        audio = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        audio = null;
      }
    }
    if (audio && audio.state === "suspended") audio.resume();
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

  /* ---------------- details panel ---------------- */
  const wide = () => window.matchMedia("(min-width: 900px)").matches;
  let sideOpen = wide();
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
  let logKey = "";
  function renderLog(day, idx) {
    const key = day.dateKey + ":" + idx;
    if (key === logKey) return;
    logKey = key;
    const rows = day.rows;
    const from = Math.max(0, idx - 6);
    const to = Math.min(rows.length - 1, idx + 2);
    el.log.innerHTML = "";
    for (let i = from; i <= to; i++) {
      const r = rows[i];
      const li = document.createElement("li");
      li.className = (i < idx ? "past" : i === idx ? "now" : "soon") + (r.kind === "micro" ? " micro" : "");
      const t = document.createElement("time");
      t.textContent = E.fmtClock(r.start, true).replace(/ (AM|PM)/, "");
      const s = document.createElement("span");
      s.textContent = r.text;
      li.appendChild(t);
      li.appendChild(s);
      el.log.appendChild(li);
    }
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

    const clock = E.fmtClock(loc.minutes, true).split(" ");
    el.time.textContent = clock[0];
    el.ampm.textContent = clock[1];
    rowIdx = rowAt(day.rows, loc.minutes);
    const row = day.rows[rowIdx];
    if (el.what.textContent !== row.text) {
      el.what.textContent = row.text;
      el.what.classList.remove("fresh");
      void el.what.offsetWidth;
      el.what.classList.add("fresh");
    }
    el.what.classList.toggle("micro", row.kind === "micro");
    el.prog.style.width = (Math.max(0, Math.min(1, (loc.minutes - row.start) / Math.max(1e-6, row.end - row.start))) * 100).toFixed(1) + "%";
    const ch = (cfg.chapters || {})[a.chapter] || { label: a.chapter, color: "#888" };
    el.chapter.textContent = ch.label;
    el.chapter.style.setProperty("--c", ch.color);
    const room = a.inCar ? "In the car" : (day.rooms[a.room] && day.rooms[a.room].label) || "";
    el.where.textContent = room;
    const nb = day.blocks.find((b) => b.start > loc.minutes + 1e-6);
    el.next.textContent = nb ? `Next · ${E.fmtClock(nb.start)} · ${nb.title}` : "Next · the alarm";
    renderLog(day, rowIdx);
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
          t.val.textContent = v == null ? "–" : String(v);
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
      world.update(fr, dt, { snap });
      world.scene.render();
    }
    if (watchers.length) {
      const info = { key: loc.key, day, fr, from: fromMinutes, to: loc.minutes, jumped: userJumped, dt };
      watchers.slice().forEach((fn) => fn(info));
    }
  }

  if (world) world.engine.runRenderLoop(tick);
  else setInterval(tick, 250);

  /* ---------------- version ---------------- */
  const versionMeta = document.querySelector('meta[name="version"]');
  const VERSION = versionMeta ? versionMeta.content : "dev";
  const foot = document.querySelector(".foot");
  if (foot) foot.insertAdjacentHTML("beforeend", ` <span class="ver">v${VERSION}</span>`);
  // The page is meant to stay open all day. On the live site, check for a newly
  // published version every 10 minutes and reload into it.
  if (document.documentElement.classList.contains("public") && versionMeta) {
    setInterval(() => {
      fetch("index.html?check=" + Date.now(), { cache: "no-store" })
        .then((r) => (r.ok ? r.text() : ""))
        .then((html) => {
          const m = /<meta name="version" content="([^"]+)"/.exec(html);
          if (m && m[1] !== VERSION) location.reload();
        })
        .catch(() => {});
    }, 10 * 60 * 1000);
  }

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
  };
})();

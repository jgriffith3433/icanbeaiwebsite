/* ==========================================================================
   Moments: two staged beats that carry the story, both skippable.
   1. You take over: the camera starts wide and pushes in to his shoulder
      (control.js `push`) while one line, in his own voice, shows on screen.
   2. The day ends: when the clock rolls into the next day, a card in his
      voice speaks two deeds of the day, one caption line at a time (the deeds
      he did under control, from day.memory; the log's rows when he did none).
      Words in day.config.js `moments`, lines in `voice.spoken` `recap-*`.
   Skip: the Skip button, a tap, Esc/Enter (day-end card), or any movement
   (take-over push). Events `day:moment` start / skip / end for analytics.
   `day.moments`: now(), recap(), pickEvents(), takeover(), skip().
   ========================================================================== */

import { factsFrom, deedsFrom } from "./deeds.js";

const DEF = {
  takeover: { push: { from: 15, secs: 1.5, fov: 0.22 }, lineSecs: 3.2, skip: "Skip", lines: ["Okay. My turn."] },
  dayEnd: { kicker: "Small Weather", title: "That was the day.", intro: "Here's what I remember.", outro: "Same again tomorrow.", outroPlayed: "Tomorrow I'd like the sky again.", skip: "Skip", hint: "Esc to skip", secs: 12, events: 3, speakDeeds: 2, lineSecs: 3.8 },
};

export function startMoments() {
  const day = window.day;
  if (!day || day.moments || !document.body) return day && day.moments;
  const user = (window.DAY_CONFIG && window.DAY_CONFIG.moments) || {};
  const T = Object.assign({}, DEF.takeover, user.takeover || {});
  const D = Object.assign({}, DEF.dayEnd, user.dayEnd || {});
  const html = document.documentElement;
  let param = null;
  try { param = new URLSearchParams(location.search).get("playtest"); } catch (e) { /* no location */ }
  // a bot's tab only sees these when the scenario is about them
  const botElsewhere = !!param && param !== "moments";

  const style = document.createElement("style");
  style.textContent = `
.mo-line{z-index:37;display:flex;align-items:center;gap:14px;max-width:min(92vw,34em);padding:12px 14px 12px 22px;border-radius:999px;background:rgba(10,13,22,.62);border:1px solid rgba(126,200,255,.35);backdrop-filter:blur(10px);color:#f6f1e8;font:600 clamp(1.05rem,2.6vw,1.45rem)/1.25 Fraunces,Georgia,serif;text-shadow:0 2px 14px rgba(0,0,0,.6);opacity:1;transition:opacity .45s ease}
.mo-line[hidden]{display:none}
.mo-line.leaving{opacity:0;pointer-events:none}
.mo-line b{font:600 .7rem/1 Outfit,system-ui,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#7ec8ff}
.mo-line button,.mo-end button{appearance:none;min-height:44px;min-width:44px;padding:8px 18px;border-radius:999px;border:1px solid rgba(246,241,232,.32);background:rgba(14,16,22,.55);color:#f6f1e8;font:600 .9rem Outfit,system-ui,sans-serif;cursor:pointer}
.mo-line button:hover,.mo-end button:hover{background:rgba(126,200,255,.16);border-color:rgba(126,200,255,.6)}
.mo-line button:focus-visible,.mo-end button:focus-visible{outline:2px solid #7ec8ff;outline-offset:3px}
.mo-end{position:fixed;inset:0;z-index:38;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:radial-gradient(ellipse at 50% 40%,rgba(8,12,24,.72),rgba(4,6,12,.9));color:#f6f1e8;font:500 1rem/1.4 Outfit,system-ui,sans-serif;opacity:1;transition:opacity .6s ease;cursor:pointer;text-align:center}
.mo-end[hidden]{display:none}
.mo-end.leaving{opacity:0;pointer-events:none}
.mo-end .k{margin:0 0 10px;font:600 .8rem/1 Outfit,system-ui,sans-serif;letter-spacing:.32em;text-transform:uppercase;color:#7ec8ff;text-shadow:0 0 18px rgba(126,200,255,.55)}
.mo-end h2{margin:0 0 6px;font:600 clamp(1.8rem,5vw,3rem)/1.1 Fraunces,Georgia,serif}
.mo-end .intro{margin:0 0 20px;color:rgba(246,241,232,.7)}
.mo-end ol{list-style:none;margin:0 0 22px;padding:0;display:flex;flex-direction:column;gap:12px;max-width:30em;width:100%}
.mo-end li{display:flex;gap:14px;align-items:baseline;text-align:left;padding:12px 16px;border-radius:14px;background:rgba(246,241,232,.07);border:1px solid rgba(246,241,232,.12);opacity:0;transform:translateY(8px);animation:mo-in .6s ease forwards}
.mo-end li{display:none}.mo-end li.on{display:flex;font:600 clamp(1.15rem,3.4vw,1.7rem)/1.3 Fraunces,Georgia,serif;animation-delay:0s}
.mo-end ol{min-height:4.6em;justify-content:center}
.mo-end li.note{border-color:rgba(240,194,122,.5)}
.mo-end time{flex:none;min-width:4.4em;font:600 .85rem Outfit,system-ui,sans-serif;color:#f0c27a;font-variant-numeric:tabular-nums}
.mo-end .outro{margin:0 0 22px;font:600 clamp(1.1rem,2.8vw,1.5rem)/1.3 Fraunces,Georgia,serif;opacity:0;transition:opacity .6s ease}
.mo-end .outro.on{opacity:1}
.mo-end .hint{margin:10px 0 0;font-size:.78rem;color:rgba(246,241,232,.55)}
.mo-cine{display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none}
.mo-cine[hidden],.mo-cine-tap[hidden]{display:none}
.mo-cine .who{margin:0;font:600 .68rem/1 Outfit,system-ui,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#7ec8ff;text-shadow:0 2px 10px rgba(0,0,0,.7);min-height:.7rem}
.mo-cine .cap{margin:0;max-width:100%;box-sizing:border-box;padding:9px 18px;border-radius:999px;background:rgba(10,13,22,.66);border:1px solid rgba(126,200,255,.35);backdrop-filter:blur(8px);color:#f6f1e8;font:600 clamp(.82rem,3.6vw,1.3rem)/1.25 Fraunces,Georgia,serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 12px rgba(0,0,0,.6);transition:opacity .35s ease;opacity:1}
.mo-cine .cap.off{opacity:0}
.mo-cine button{pointer-events:auto;appearance:none;min-height:48px;min-width:96px;padding:10px 26px;border-radius:999px;border:1px solid rgba(246,241,232,.4);background:rgba(14,16,22,.62);color:#f6f1e8;font:600 .95rem Outfit,system-ui,sans-serif;cursor:pointer;touch-action:manipulation}
.mo-cine button:active,.mo-cine button:hover{background:rgba(126,200,255,.22);border-color:rgba(126,200,255,.7)}
.mo-cine button:focus-visible{outline:2px solid #7ec8ff;outline-offset:3px}
@keyframes mo-in{to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.mo-end li,.mo-end .outro{animation-duration:.01s;animation-delay:0s;transition:none}}
`;
  document.head.appendChild(style);

  const log = [];
  function emit(moment, action, extra) {
    const detail = Object.assign({ moment, action }, extra || {});
    log.push(Object.assign({ t: performance.now() }, detail));
    if (log.length > 40) log.shift();
    window.dispatchEvent(new CustomEvent("day:moment", { detail }));
  }
  const clockOf = (m) => (window.DayEngine && window.DayEngine.fmtClock ? window.DayEngine.fmtClock(m, true).replace(/ (AM|PM)/, "") : String(Math.round(m)));

  /* ---------- 1. you take over ---------- */
  const line = document.createElement("div");
  line.className = "mo-line";
  line.id = "moment-line";
  line.hidden = true;
  line.setAttribute("role", "status");
  line.innerHTML = `<b>Small Weather</b><span id="moment-say"></span><button type="button" id="moment-skip"></button>`;
  line.querySelector("#moment-skip").textContent = T.skip;
  document.body.appendChild(line);
  const sayEl = line.querySelector("#moment-say");
  let lineUp = false;
  let lineTimer = 0;
  let lineAt = 0;
  let lineText = "";
  let lastLine = -1;
  function endLine(action, via) {
    if (!lineUp) return false;
    lineUp = false;
    clearTimeout(lineTimer);
    if (day.control && day.control.push) day.control.push(null);
    line.classList.add("leaving");
    setTimeout(() => { if (!lineUp) line.hidden = true; }, 480);
    if (document.activeElement && line.contains(document.activeElement)) document.activeElement.blur();
    emit("takeover", action, { via: via || "auto", seconds: Math.round((performance.now() - lineAt) / 100) / 10 });
    return true;
  }
  function takeover(via) {
    if (lineUp) endLine("end", "again");
    let i = Math.floor(Math.random() * T.lines.length);
    if (T.lines.length > 1 && i === lastLine) i = (i + 1) % T.lines.length;
    lastLine = i;
    lineText = T.lines[i];
    // When his voice just spoke a take-over line (js/voice.js listens to the same event first), the caption is that line,
    // so what's read and what's heard match.
    const v = day.voice && day.voice.now && day.voice.now();
    if (v && v.on && v.last && v.last.group === "episode-open" && performance.now() / 1000 - v.last.at < 0.5) lineText = v.last.text;
    sayEl.textContent = lineText;
    lineUp = true;
    lineAt = performance.now();
    line.classList.remove("leaving");
    line.hidden = false;
    const pushed = !!(day.control && day.control.push && day.control.push(T.push));
    emit("takeover", "start", { via: via || "take", text: lineText, push: pushed, from: T.push && T.push.from });
    lineTimer = setTimeout(() => endLine("end", "auto"), T.lineSecs * 1000);
    return true;
  }
  line.querySelector("#moment-skip").addEventListener("click", (e) => { e.stopPropagation(); endLine("skip", "click"); });
  line.addEventListener("click", () => endLine("skip", "tap"));
  window.addEventListener("day:control", (e) => {
    const a = e && e.detail && e.detail.action;
    if (a === "take" && !botElsewhere && !(window.day.coldopen && window.day.coldopen.active && window.day.coldopen.active())) takeover(e.detail.via);
    else if ((a === "let-go" || a === "letgo") && lineUp) endLine("skip", "let-go");
  });
  // moving ends the push in control.js; the line goes with it
  window.addEventListener("keydown", (e) => {
    if (lineUp && performance.now() - lineAt > 250 && /^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright| )$/i.test(e.key)) endLine("skip", "move");
  }, true);

  /* ---------- 2. the day ends ---------- */
  const end = document.createElement("div");
  end.className = "mo-end";
  end.id = "day-end";
  end.hidden = true;
  end.setAttribute("role", "dialog");
  end.setAttribute("aria-label", "End of the day");
  end.innerHTML = `<p class="k"></p><h2></h2><p class="intro"></p><ol id="day-end-events"></ol><p class="outro"></p><button type="button" id="day-end-skip"></button><p class="hint"></p>`;
  end.querySelector(".k").textContent = D.kicker;
  end.querySelector("h2").textContent = D.title;
  end.querySelector(".intro").textContent = D.intro;
  end.querySelector("#day-end-skip").textContent = D.skip;
  end.querySelector(".hint").textContent = D.hint;
  document.body.appendChild(end);
  const listEl = end.querySelector("#day-end-events");
  let endUp = false;
  let endTimer = 0;
  let endAt = 0;
  let shown = null;
  let lastDay = null;
  let lastKey = "";
  let lastNotes = [];

  /* The deeds he did under control on the sim day (day:memory `deed` events, js/memory.js), as DEED_ORDER names. */
  const dayFacts = {}; // sim day key -> facts
  window.addEventListener("day:memory", (e) => {
    const d = (e && e.detail) || {};
    if (d.action !== "deed" || !d.kind) return;
    const k = day.now().key;
    const one = factsFrom({ deeds: { [d.kind]: 1 }, zones: d.zone ? { [d.zone]: { [d.power || d.kind]: 1 } } : {} });
    const f = dayFacts[k] || (dayFacts[k] = {});
    Object.keys(one).forEach((n) => (f[n] = (f[n] || 0) + one[n]));
  });
  const spokenOf = (group) => {
    const pool = ((window.DAY_CONFIG && window.DAY_CONFIG.voice && window.DAY_CONFIG.voice.spoken) || {})[group];
    return Array.isArray(pool) && pool.length ? pool[0] : null;
  };
  /** The day's deeds with a line to speak: [{ kind, text }], most telling first (at most n). */
  function pickDeeds(key, n) {
    return deedsFrom(dayFacts[key] || {}).map((kind) => ({ kind, text: spokenOf("recap-" + kind) })).filter((x) => x.text).slice(0, n);
  }

  /* Three events from the log: rows of the day that was (not micro-steps), spread early / middle / late;
     the player's own note (taking over, letting go...) wins the middle slot when there is one. */
  function pickEvents(dayObj, notes, n) {
    n = n || D.events || 3;
    const rows = ((dayObj && dayObj.rows) || []).filter((r) => r.kind !== "micro" && r.text && r.text.length > 3 && r.text !== "…");
    const out = [];
    const used = new Set();
    const add = (start, text, note) => { if (text && !used.has(text) && out.length < n) { used.add(text); out.push({ start, text, note: !!note }); } };
    const at = (f) => rows[Math.min(rows.length - 1, Math.floor(rows.length * f))];
    const mine = (notes || []).filter((x) => x.text).slice();
    const slots = n === 3 ? [0.12, 0.5, 0.88] : Array.from({ length: n }, (_, i) => (i + 0.5) / n);
    slots.forEach((f, i) => {
      if (i === Math.floor(slots.length / 2) && mine.length) { const m = mine[mine.length - 1]; add(m.start, m.text, true); return; }
      const r = at(f);
      if (r) add(r.start, r.text);
    });
    // fill gaps (a duplicate line, a short day) from any remaining rows
    for (let i = 0; i < rows.length && out.length < n; i++) add(rows[i].start, rows[i].text);
    return out.sort((a, b) => a.start - b.start);
  }
  const timers = [];
  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
  function recap(via, dayObj, notes, key) {
    if (endUp) return false;
    const want = D.speakDeeds || 2;
    // two deeds of the day: the ones he did under control (spoken), then the log's rows (a quiet day)
    const deeds = pickDeeds(key || lastKey, want).map((x) => ({ start: null, text: x.text, note: true, deed: x.kind }));
    let events = deeds;
    if (events.length < want) {
      const rows = pickEvents(dayObj || lastDay, [], 6).filter((r) => !events.some((e) => e.text === r.text));
      const early = rows.slice(0, 1), late = rows.slice(-1);
      (events.length ? late : early.concat(late)).forEach((r) => { if (events.length < want && !events.some((e) => e.text === r.text)) events.push({ start: r.start, text: r.text, note: false }); });
    }
    events = events.slice(0, want);
    if (!events.length) return false;
    if (lineUp) endLine("skip", "day-end");
    shown = events;
    end.querySelector(".outro").textContent = events.some((e) => e.note) ? D.outroPlayed : D.outro;
    listEl.innerHTML = "";
    events.forEach((e) => {
      const li = document.createElement("li");
      if (e.note) li.className = "note";
      const t = document.createElement("time");
      t.textContent = e.start == null ? "" : clockOf(e.start);
      if (e.start == null) t.hidden = true;
      const s = document.createElement("span");
      s.textContent = e.text;
      li.appendChild(t);
      li.appendChild(s);
      listEl.appendChild(li);
    });
    endUp = true;
    endAt = performance.now();
    end.classList.remove("leaving");
    end.hidden = false;
    const nDeeds = events.filter((e) => e.deed).length;
    emit("day-end", "start", { via: via || "roll", events: events.map((e) => e.text), times: events.map((e) => (e.start == null ? "" : clockOf(e.start))), deeds: nDeeds, kinds: events.map((e) => e.deed || null) });
    // one caption line at a time: each shows (and is spoken, for a deed) in turn, then the outro
    const lis = [...listEl.children];
    const lineMs = (D.lineSecs || 3.8) * 1000;
    const showLine = (i) => {
      lis.forEach((li, j) => li.classList.toggle("on", j === i));
      if (i >= lis.length) { end.querySelector(".outro").classList.add("on"); return; }
      const e = events[i];
      emit("day-end", "line", { index: i, text: e.text, deed: e.deed || null, spoken: !!e.deed });
      if (e.deed && day.voice && day.voice.say) day.voice.say("recap-" + e.deed, { force: true, ignoreCooldown: true, ignoreLineCooldown: true, via: "dayend" });
      later(() => showLine(i + 1), lineMs);
    };
    end.querySelector(".outro").classList.remove("on");
    showLine(0);
    endTimer = setTimeout(() => closeEnd("end", "auto"), Math.max((D.secs || 12) * 1000, (events.length + 1) * lineMs + 1500));
    try { end.querySelector("#day-end-skip").focus({ preventScroll: true }); } catch (e) { /* old browser */ }
    return true;
  }
  function closeEnd(action, via) {
    if (!endUp) return false;
    endUp = false;
    clearTimeout(endTimer);
    timers.splice(0).forEach(clearTimeout);
    end.classList.add("leaving");
    setTimeout(() => { if (!endUp) end.hidden = true; }, 620);
    if (document.activeElement && end.contains(document.activeElement)) document.activeElement.blur();
    emit("day-end", action, { via: via || "click", seconds: Math.round((performance.now() - endAt) / 100) / 10 });
    return true;
  }
  end.querySelector("#day-end-skip").addEventListener("click", (e) => { e.stopPropagation(); closeEnd("skip", "click"); });
  end.addEventListener("click", () => closeEnd("skip", "tap"));
  window.addEventListener("keydown", (e) => {
    if (!endUp || (e.key !== "Escape" && e.key !== "Enter")) return;
    e.preventDefault();
    e.stopPropagation();
    closeEnd("skip", e.key === "Escape" ? "key" : "enter");
  }, true);

  // The clock rolls into the next day while it plays (a jump on the day bar doesn't count).
  day.watch((info) => {
    if (lastKey && info.key !== lastKey && !info.jumped && !botElsewhere && day.now().mode !== "pause" && !html.classList.contains("title-up")) {
      recap("roll", lastDay, lastNotes, lastKey);
    }
    if (info.key !== lastKey) { lastKey = info.key; lastNotes = []; }
    lastDay = info.day;
    const n = day.notes();
    if (n.length) lastNotes = n;
  });

  /* ---------- 3. turning points: one staged moment per episode beat (config `moments.turning`) ---------- */
  const TURN = Object.assign({}, user.turning || {});
  const turnLog = [];
  const cine = document.createElement("div");
  cine.className = "mo-cine";
  cine.id = "moment-cine";
  cine.hidden = true;
  cine.setAttribute("role", "status");
  cine.innerHTML = `<p class="who"></p><p class="cap" id="moment-cap"></p><button type="button" id="moment-cine-skip"></button>`;
  const tap = document.createElement("div");
  tap.className = "mo-cine-tap";
  tap.id = "moment-cine-tap";
  tap.hidden = true;
  document.body.append(tap, cine);
  const cineWho = cine.querySelector(".who");
  const cineCap = cine.querySelector(".cap");
  const cineSkip = cine.querySelector("#moment-cine-skip");
  cineSkip.textContent = T.skip;
  // a bot's tab only plays them when the scenario is about them (the other scenarios wait on the toasts)
  let turnOn = true;
  try {
    const id = new URLSearchParams(location.search).get("playtest");
    if (id && id !== "turning-moments" && id !== "chapter-openers") turnOn = false;
    else if (!id && navigator.webdriver) turnOn = false;
  } catch (e) { /* no location */ }
  let cur = null; // { id, spec, t0, timers, raf, said }
  const MAX_SECS = 8;
  const MAX_OPENER = 20; // a chapter opener: 20 s at most
  function fitCaption() {
    cineCap.style.fontSize = "";
    let px = parseFloat(getComputedStyle(cineCap).fontSize) || 16;
    let n = 0;
    while (cineCap.scrollWidth > cineCap.clientWidth + 1 && px > 11 && n++ < 24) { px -= 0.5; cineCap.style.fontSize = px + "px"; }
  }
  function showCaption(who, text) {
    cineWho.textContent = who || "";
    cineCap.textContent = text;
    cineCap.classList.remove("off");
    fitCaption();
  }
  function endTurn(how, via) {
    const c = cur;
    if (!c) return false;
    cur = null;
    cancelAnimationFrame(c.raf);
    c.timers.forEach(clearTimeout);
    const w = day.world && day.world();
    if (w && w.chapterSign) w.chapterSign(null);
    const info = w && w.cineInfo ? w.cineInfo() : null;
    if (w && w.cineShot) w.cineShot(null);
    if (day.control && day.control.hold) day.control.hold(false);
    html.classList.remove("cine-up");
    tap.hidden = true;
    cine.hidden = true;
    if (document.activeElement && cine.contains(document.activeElement)) document.activeElement.blur();
    try { window.hawkesPlaytest && window.hawkesPlaytest.cut && window.hawkesPlaytest.cut(); } catch (e) { /* no sensor */ }
    const secs = Math.round((performance.now() - c.t0) / 100) / 10;
    const d = { moment: c.id, action: how, via: via || "auto", seconds: secs, insideFrames: info ? info.inside : 0, frames: info ? info.frames : 0, minClear: info ? Math.round(info.minClear * 10) / 10 : null };
    turnLog.push(Object.assign({ t: performance.now() }, d));
    if (turnLog.length > 20) turnLog.shift();
    emit(c.id, how === "end" ? "end" : "skip", d);
    try { c.spec.onEnd && c.spec.onEnd(how, d); } catch (e) { console.error("[moments]", e); }
    return true;
  }
  /** Play a turning-point moment: spec { id, title, secs, sting, shot, lines: [{ who, text, at, caption }], speak, tick, onStart, onEnd }.
      `force: true` plays even when turning moments are off (Part 3 ending scenes). */
  function play(spec) {
    if (!spec || (!turnOn && !spec.force) || !day.world) return false;
    if (cur) endTurn("skip", "replaced");
    const w = day.world();
    if (lineUp) endLine("skip", "moment");
    if (endUp) return false;
    const secs = Math.min(spec.max || MAX_SECS, spec.secs || 6);
    cur = { id: spec.id, spec, t0: performance.now(), timers: [], raf: 0 };
    const c = cur;
    html.classList.add("cine-up");
    try { window.hawkesPlaytest && window.hawkesPlaytest.cut && window.hawkesPlaytest.cut(secs + 1); } catch (e) { /* no sensor */ }
    if (day.control && day.control.hold) day.control.hold(true);
    const camera = !!(w && w.cineShot && spec.shot && w.cineShot(Object.assign({ secs }, spec.shot)));
    let sting = false;
    try { sting = !!(day.score && day.score.momentSting && day.score.momentSting(spec.sting)); } catch (e) { /* no audio */ }
    const sign = !!(w && w.chapterSign && spec.sign && w.chapterSign(spec.sign));
    cineCap.textContent = "";
    cineWho.textContent = "";
    cineCap.classList.add("off");
    cine.hidden = false;
    tap.hidden = false;
    emit(spec.id, "start", { title: spec.title || "", secs, camera, sign: sign && w.chapterSignInfo ? w.chapterSignInfo() : null, chapter: spec.chapter || 0, motif: !!spec.motif, sting: spec.sting || null, stingPlayed: sting, lines: (spec.lines || []).length, shot: spec.shot ? { tx: spec.shot.tx, tz: spec.shot.tz } : null });
    try { spec.onStart && spec.onStart(); } catch (e) { console.error("[moments]", e); }
    (spec.lines || []).forEach((L, i) => {
      c.timers.push(setTimeout(() => {
        if (cur !== c) return;
        showCaption(L.label || L.who, L.caption || L.text);
        emit(spec.id, "line", { index: i, who: L.who, voiced: !!L.voiced, text: L.text, caption: L.caption || L.text });
        if (spec.speak) spec.speak(L.who, L.text);
        const hold = Math.max(1.8, Math.min(5.2, 1.2 + L.text.length * 0.065));
        c.timers.push(setTimeout(() => { if (cur === c) cineCap.classList.add("off"); }, hold * 1000));
      }, Math.max(0, (L.at || 0) * 1000)));
    });
    const loop = () => {
      if (cur !== c) return;
      const k = Math.min(1, (performance.now() - c.t0) / (secs * 1000));
      if (sign && spec.sign) { const f = spec.sign.from || 0, e = spec.sign.to || 6; w.chapterSignK(Math.max(0, Math.min(1, (k * secs - f) / Math.max(0.5, e - f)))); }
      try { spec.tick && spec.tick(k, secs); } catch (e) { /* a tick must not end the moment */ }
      c.raf = requestAnimationFrame(loop);
    };
    c.raf = requestAnimationFrame(loop);
    c.timers.push(setTimeout(() => endTurn("end", "auto"), secs * 1000));
    try { cineSkip.focus({ preventScroll: true }); } catch (e) { /* old browser */ }
    return true;
  }

  /* ---------- 4. chapter openers (config `arc`): the arc's five in-engine scenes ---------- */
  const chapters = () => (window.DAY_CONFIG && window.DAY_CONFIG.arc) || [];
  const ENGINE = { He: "Small Weather", Pilot: "Pilot" };
  /** Play chapter n's opener (<= 20 s): the title written in the sky, the motif, one spoken He / Pilot exchange. opts.onEnd(how, d). */
  function chapter(which, opts) {
    opts = opts || {};
    const ch = chapters().find((c) => c.n === which || c.id === which);
    if (!ch || !ch.opener) return false;
    const O = ch.opener;
    const pilotLines = (window.DAY_CONFIG && window.DAY_CONFIG.pilot && window.DAY_CONFIG.pilot.lines) || [];
    const ok = play({
      id: "chapter-" + ch.n, chapter: ch.n, title: ch.title, secs: O.secs || 16, max: MAX_OPENER, sting: O.sting, shot: O.shot,
      sign: Object.assign({ text: ch.title }, O.sign || {}), motif: true,
      lines: (O.lines || []).map((L) => ({ who: L.who, label: ENGINE[L.who] || L.who, text: L.text, at: L.at, caption: L.caption, voiced: true })),
      speak: (who, text) => {
        if (who === "Pilot") {
          const line = pilotLines.find((p) => p.text === text);
          try { if (line && day.voice && day.voice.speakPilot) day.voice.speakPilot(line, { via: "chapter", queue: false, radio: window.DAY_CONFIG.pilot.radio }); } catch (e) { /* no voice */ }
        } else {
          // dialogue.js speaks a `day:story` say in his Eric voice (clip under audio/dialogue)
          try { window.dispatchEvent(new window.CustomEvent("day:story", { detail: { action: "say", who, text, moment: true, id: "chapter-" + ch.n } })); } catch (e) { /* node */ }
        }
      },
      onStart: () => {
        try { day.stems && day.stems.motif && day.stems.motif("chapter-" + ch.n); } catch (e) { /* no stems */ }
      },
      onEnd: (how, d) => { try { opts.onEnd && opts.onEnd(how, d); } catch (e) { console.error("[moments]", e); } },
    });
    return ok;
  }
  cineSkip.addEventListener("click", (e) => { e.stopPropagation(); endTurn("skip", "click"); });
  cineSkip.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") { e.stopPropagation(); endTurn("skip", "tap"); } });
  tap.addEventListener("click", () => endTurn("skip", "tap"));
  tap.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") endTurn("skip", "tap"); });
  window.addEventListener("keydown", (e) => {
    if (!cur) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); endTurn("skip", "esc"); }
  }, true);
  window.addEventListener("day:control", (e) => {
    const a = e && e.detail && e.detail.action;
    if (cur && (a === "let-go" || a === "letgo")) endTurn("skip", "let-go");
  });

  /* ---------- 5. Part 3 ending scenes (config episodes.endings.scenes): always on, ≤40 s, no text card ---------- */
  const MAX_ENDING = 40;
  const stamp = document.createElement("div");
  stamp.id = "ending-stamp";
  stamp.className = "mo-stamp";
  stamp.hidden = true;
  stamp.innerHTML = `<b class="rank"></b><span class="name"></span>`;
  document.body.appendChild(stamp);
  const stampRank = stamp.querySelector(".rank");
  const stampName = stamp.querySelector(".name");
  style.textContent += `
.mo-stamp{display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;background:radial-gradient(ellipse at 50% 42%,rgba(8,12,24,.35),rgba(4,6,12,.55));opacity:0;transition:opacity .45s ease}
.mo-stamp.on{opacity:1}
.mo-stamp[hidden]{display:none}
.mo-stamp .rank{font:700 clamp(4.2rem,22vw,9rem)/1 Fraunces,Georgia,serif;color:#f6f1e8;text-shadow:0 4px 28px rgba(0,0,0,.75),0 0 40px rgba(126,200,255,.45);letter-spacing:.04em}
.mo-stamp .name{margin-top:8px;font:600 .85rem/1 Outfit,system-ui,sans-serif;letter-spacing:.34em;text-transform:uppercase;color:#7ec8ff;text-shadow:0 2px 12px rgba(0,0,0,.7)}
`;
  function clearEndingStage() {
    try {
      const N = day.neighbors;
      if (N && N.stand) ["birdie", "dex", "ines"].forEach((id) => N.stand(id, null, null));
    } catch (e) { /* none */ }
  }
  function runEndingFx(fx, id) {
    if (!fx) return;
    try {
      if (fx.weather && day.weather && day.weather.set) day.weather.set(fx.weather, fx.intensity != null ? fx.intensity : 0.6, "ending");
      if (fx.lawn != null && day.slice && day.slice.setLawn) day.slice.setLawn(fx.lawn > 0 ? "damp" : "straw", fx.lawn, true);
      if (fx.celebrate) window.dispatchEvent(new window.CustomEvent("day:crowd", { detail: { action: "celebrate", secs: fx.celebrate } }));
      if (fx.umbrellas) window.dispatchEvent(new window.CustomEvent("day:crowd", { detail: { action: "hush", secs: fx.secs || 16 } }));
      if (fx.flood && day.episodes && day.episodes.floodAvenue) day.episodes.floodAvenue();
      if (fx.spin != null && day.episodes) {
        if (!((day.episodes.story && day.episodes.story()) || {}).turbine && day.episodes.ensureTurbines) day.episodes.ensureTurbines();
        if (day.episodes.spinTurbines) day.episodes.spinTurbines(fx.spin);
      }
      if (fx.lawnAnim != null && day.slice && day.slice.setLawn) {
        // time-lapse bloom: ease straw → damp over a few seconds of the cut
        const from = fx.lawnFrom != null ? fx.lawnFrom : 0;
        const to = fx.lawnAnim;
        const dur = Math.max(0.8, fx.lawnSecs || 4);
        const t0 = performance.now();
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
          const e = k * k * (3 - 2 * k);
          try { day.slice.setLawn("damp", from + (to - from) * e, true); } catch (err) { /* */ }
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    } catch (e) { console.error("[moments ending fx]", e); }
  }
  /** Play ending A/B/C in-engine. Always available (not gated by turning-moments). opts: { rank, name, onEnd }. */
  function ending(which, opts) {
    opts = opts || {};
    const END = (window.DAY_CONFIG && window.DAY_CONFIG.episodes && window.DAY_CONFIG.episodes.endings) || {};
    const scene = END.scenes && END.scenes[which];
    const meta = END[which];
    if (!scene || !day.world) return false;
    const secs = Math.min(MAX_ENDING, scene.secs || 32);
    const shots = (scene.shots || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    const fxList = (scene.fx || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    let shotI = 0;
    let fxI = 0;
    const pilotLines = (window.DAY_CONFIG && window.DAY_CONFIG.pilot && window.DAY_CONFIG.pilot.lines) || [];
    const N = day.neighbors;
    (scene.places || []).forEach((p) => {
      try {
        if (N && N.stand) N.stand(p.id, p.x, p.z);
        if (N && N.gesture && p.gesture) N.gesture(p.id, p.gesture);
      } catch (e) { /* none */ }
    });
    const first = shots[0] || { tx: 118, ty: 4, tz: 26, alpha: -1.8, beta: 1.1, radius: 22 };
    const ok = play({
      id: "ending-" + which,
      force: true, // endings always play, even when turning-moments are off for other playtests
      title: (meta && meta.name) || which,
      secs,
      max: MAX_ENDING,
      sting: null, // the score stem sting plays below; momentSting stays for turning points
      shot: Object.assign({ secs }, first),
      lines: (scene.lines || []).map((L) => ({
        who: L.who,
        label: ENGINE[L.who] || L.who,
        text: L.text,
        at: L.at,
        caption: L.caption || L.text,
        voiced: true,
        id: L.id,
      })),
      speak: (who, text) => {
        if (who === "Pilot") {
          const line = pilotLines.find((p) => p.text === text);
          try { if (line && day.voice && day.voice.speakPilot) day.voice.speakPilot(line, { via: "ending", queue: false, radio: window.DAY_CONFIG.pilot.radio }); } catch (e) { /* */ }
        } else {
          try { window.dispatchEvent(new window.CustomEvent("day:story", { detail: { action: "say", who, text, moment: true, ending: which, id: "ending-" + which } })); } catch (e) { /* */ }
        }
      },
      onStart: () => {
        try {
          if (day.stems && day.stems.sting) day.stems.sting(scene.sting === "failure" ? "failure" : "resolution");
        } catch (e) { /* */ }
        try { window.dispatchEvent(new window.CustomEvent("day:episode", { detail: { action: "ending-scene", ending: which, name: meta && meta.name, secs, rank: opts.rank || null } })); } catch (e) { /* */ }
      },
      tick: (k, total) => {
        const t = k * total;
        while (shotI + 1 < shots.length && t >= (shots[shotI + 1].at || 0)) {
          shotI++;
          const s = shots[shotI];
          const left = Math.max(1.2, total - t);
          try { day.world() && day.world().cineShot(Object.assign({ secs: left, cut: true }, s)); } catch (e) { /* */ }
        }
        while (fxI < fxList.length && t >= (fxList[fxI].at || 0)) {
          runEndingFx(fxList[fxI], which);
          fxI++;
        }
      },
      onEnd: (how, d) => {
        clearEndingStage();
        const rank = opts.rank || "C";
        const name = (meta && meta.name) || which;
        stampRank.textContent = rank;
        stampName.textContent = name;
        stamp.hidden = false;
        stamp.classList.add("on");
        try { window.dispatchEvent(new window.CustomEvent("day:episode", { detail: { action: "ending-stamp", ending: which, name, rank, how, seconds: d && d.seconds } })); } catch (e) { /* */ }
        setTimeout(() => {
          stamp.classList.remove("on");
          setTimeout(() => { stamp.hidden = true; }, 500);
        }, 2200);
        try { opts.onEnd && opts.onEnd(how, Object.assign({}, d, { ending: which, rank, name })); } catch (e) { console.error("[moments]", e); }
      },
    });
    if (!ok) clearEndingStage();
    return ok;
  }

  const api = {
    takeover,
    recap: (via) => recap(via || "api"),
    pickEvents,
    pickDeeds: (key, n) => pickDeeds(key || day.now().key, n || D.speakDeeds || 2),
    play,
    chapter,
    ending,
    chapters: () => chapters().map((c) => ({ n: c.n, id: c.id, title: c.title, line: c.line, episodes: c.episodes.slice(), secs: c.opener && c.opener.secs })),
    playing: () => !!cur,
    turning: (id) => (id ? TURN[id] || null : Object.assign({}, TURN)),
    enabled: () => turnOn,
    enable: (on) => { turnOn = on !== false; return turnOn; },
    skip: () => endTurn("skip", "api") || endLine("skip", "api") || closeEnd("skip", "api"),
    now: () => ({ line: lineUp, text: lineText, recap: endUp, events: shown, pushing: !!(day.control && day.control.pushing && day.control.pushing()), turning: cur ? cur.id : null, turnLog: turnLog.slice(), log: log.slice() }),
  };
  day.moments = api;
  window.moments = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startMoments();

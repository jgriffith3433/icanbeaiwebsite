/* ==========================================================================
   Moments: two staged beats that carry the story, both skippable.
   1. You take over: the camera starts wide and pushes in to his shoulder
      (control.js `push`) while one line, in his own voice, shows on screen.
   2. The day ends: when the clock rolls into the next day, a card in his
      voice recaps three events from the log. Words in day.config.js `moments`.
   Skip: the Skip button, a tap, Esc/Enter (day-end card), or any movement
   (take-over push). Events `day:moment` start / skip / end for analytics.
   `day.moments`: now(), recap(), pickEvents(), takeover(), skip().
   ========================================================================== */

const DEF = {
  takeover: { push: { from: 15, secs: 1.5, fov: 0.22 }, lineSecs: 3.2, skip: "Skip", lines: ["Okay. My turn."] },
  dayEnd: { kicker: "Small Weather", title: "That was the day.", intro: "Here's what I remember.", outro: "Same again tomorrow.", outroPlayed: "Tomorrow I'd like the sky again.", skip: "Skip", hint: "Esc to skip", secs: 12, events: 3 },
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
.mo-line{position:fixed;left:50%;bottom:max(230px,calc(env(safe-area-inset-bottom) + 210px));transform:translateX(-50%);z-index:37;display:flex;align-items:center;gap:14px;max-width:min(92vw,34em);padding:12px 14px 12px 22px;border-radius:999px;background:rgba(10,13,22,.62);border:1px solid rgba(126,200,255,.35);backdrop-filter:blur(10px);color:#f6f1e8;font:600 clamp(1.05rem,2.6vw,1.45rem)/1.25 Fraunces,Georgia,serif;text-shadow:0 2px 14px rgba(0,0,0,.6);opacity:1;transition:opacity .45s ease}
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
.mo-end li:nth-child(2){animation-delay:.7s}.mo-end li:nth-child(3){animation-delay:1.4s}
.mo-end li.note{border-color:rgba(240,194,122,.5)}
.mo-end time{flex:none;min-width:4.4em;font:600 .85rem Outfit,system-ui,sans-serif;color:#f0c27a;font-variant-numeric:tabular-nums}
.mo-end .outro{margin:0 0 22px;font:600 clamp(1.1rem,2.8vw,1.5rem)/1.3 Fraunces,Georgia,serif;opacity:0;animation:mo-in .6s ease 2.1s forwards}
.mo-end .hint{margin:10px 0 0;font-size:.78rem;color:rgba(246,241,232,.55)}
@keyframes mo-in{to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.mo-end li,.mo-end .outro{animation-duration:.01s;animation-delay:0s}}
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
    if (a === "take" && !botElsewhere) takeover(e.detail.via);
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
  function recap(via, dayObj, notes) {
    if (endUp) return false;
    const events = pickEvents(dayObj || lastDay, notes || lastNotes);
    if (!events.length) return false;
    if (lineUp) endLine("skip", "day-end");
    shown = events;
    end.querySelector(".outro").textContent = events.some((e) => e.note) ? D.outroPlayed : D.outro;
    listEl.innerHTML = "";
    events.forEach((e) => {
      const li = document.createElement("li");
      if (e.note) li.className = "note";
      const t = document.createElement("time");
      t.textContent = clockOf(e.start);
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
    emit("day-end", "start", { via: via || "roll", events: events.map((e) => e.text), times: events.map((e) => clockOf(e.start)) });
    endTimer = setTimeout(() => closeEnd("end", "auto"), (D.secs || 12) * 1000);
    try { end.querySelector("#day-end-skip").focus({ preventScroll: true }); } catch (e) { /* old browser */ }
    return true;
  }
  function closeEnd(action, via) {
    if (!endUp) return false;
    endUp = false;
    clearTimeout(endTimer);
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
      recap("roll", lastDay, lastNotes);
    }
    if (info.key !== lastKey) { lastKey = info.key; lastNotes = []; }
    lastDay = info.day;
    const n = day.notes();
    if (n.length) lastNotes = n;
  });

  const api = {
    takeover,
    recap: (via) => recap(via || "api"),
    pickEvents,
    skip: () => endLine("skip", "api") || closeEnd("skip", "api"),
    now: () => ({ line: lineUp, text: lineText, recap: endUp, events: shown, pushing: !!(day.control && day.control.pushing && day.control.pushing()), log: log.slice() }),
  };
  day.moments = api;
  window.moments = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startMoments();

/* ==========================================================================
   First Rain (clarity): until a new player has called Rain once, the ability bar is ONE glowing Rain icon with a
   pulsing "Tap the street" arrow; Lightning, Wind, Fog and Sun break are hidden (and refused: reason `locked`) until
   that first Rain lands. A tap on the street (a pointerup on the canvas that wasn't a drag) casts Rain where it
   landed (R and the Rain button work too). The hint paragraph, the Neighbors button and the Charge row step aside
   while it is up (`html.first-rain`), so the first screen is the city, the stick, Jump and one thing to do.
   Not during the cold open (the roof's bolt is Lightning: this takes over when it ends) and it doesn't fight the
   street lesson (street.js keeps Sun, Fog and Wind locked past Rain). Kept in localStorage `icanbe.firstrain`.
   Any episode start finishes it. A bot's tab (`?playtest=` other than audio-check / first-rain) never meets it.
   `day.firstrain`: now(), reset(); events `day:firstrain` (show / done). Playtest: `first-rain`.
   ========================================================================== */
export function startFirstRain() {
  const day = window.day;
  if (!day || day.firstrain || typeof document === "undefined" || !document.body) return day && day.firstrain;
  const html = document.documentElement;
  const KEY = "icanbe.firstrain";
  const HIDDEN = ["bolt", "wind", "fog", "sunbreak"];
  const ALL = ["bolt", "rain", "wind", "fog", "sunbreak"];

  let quiet = false;
  try {
    const id = new URLSearchParams(location.search).get("playtest");
    if (id && id !== "audio-check" && id !== "first-rain") quiet = true;
    else if (!id && navigator.webdriver) quiet = true;
  } catch (e) { /* no location */ }

  let done = quiet;
  if (!quiet) { try { done = localStorage.getItem(KEY) === "1"; } catch (e) { /* private mode */ } }
  let on = false;
  const log = [];

  const style = document.createElement("style");
  style.textContent = `
html.first-rain .abilitybar .ab:not(#ability-rain), html.first-rain .abilitybar .et, html.first-rain .abilitybar .cd,
html.first-rain .control-hint, html.first-rain #neighbors-btn { display: none !important; }
html.first-rain #ability-rain { border-color: #9fd4ff; animation: frGlow 1.5s ease-in-out infinite; }
@keyframes frGlow { 0%,100% { box-shadow: 0 0 10px 2px rgba(126,200,255,.6); } 50% { box-shadow: 0 0 30px 10px rgba(159,212,255,1); } }
.first-rain-cue { position: fixed; left: 50%; top: 58%; z-index: 7; transform: translate(-50%,-50%); display: none; flex-direction: column; align-items: center; gap: 2px; pointer-events: none; color: #f6f1e8; font: 700 1.05rem/1.1 Outfit, system-ui, sans-serif; text-shadow: 0 2px 10px rgba(0,0,0,.7); }
html.first-rain .first-rain-cue { display: flex; }
html.title-up .first-rain-cue, html.cold-open .first-rain-cue, html.cine-up .first-rain-cue, html.ep-menu-up .first-rain-cue { display: none; }
.first-rain-cue b { padding: 6px 14px; border-radius: 999px; background: rgba(10,13,22,.78); border: 1px solid rgba(126,200,255,.6); }
.first-rain-cue i { font-style: normal; font-size: 2.2rem; line-height: 1; color: #9fd4ff; animation: frArrow 1s ease-in-out infinite; }
@keyframes frArrow { 0%,100% { transform: translateY(-6px); opacity: .6; } 50% { transform: translateY(8px); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .first-rain-cue i, html.first-rain #ability-rain { animation: none; } }
`;
  document.head.appendChild(style);
  const cue = document.createElement("div");
  cue.className = "first-rain-cue";
  cue.id = "first-rain-cue";
  cue.setAttribute("role", "status");
  cue.innerHTML = `<b>Tap the street</b><i aria-hidden="true">▼</i>`;
  document.body.appendChild(cue);

  const abil = () => { const P = window.powers || day.powers; return P && P.abilities ? P.abilities : null; };
  const powers = () => window.powers || day.powers;
  const inControl = () => !!(day.control && day.control.mode && day.control.mode() === "control");
  const coldOn = () => !!(day.coldopen && day.coldopen.active && day.coldopen.active());
  function emit(action, extra) {
    const detail = Object.assign({ action }, extra || {});
    log.push(Object.assign({ t: Math.round(performance.now()) }, detail));
    if (log.length > 20) log.shift();
    try { window.dispatchEvent(new window.CustomEvent("day:firstrain", { detail })); } catch (e) { /* node */ }
  }

  function show() {
    if (done || on || !inControl() || coldOn()) return;
    const A = abil();
    if (!A) return;
    A.lock(HIDDEN);
    A.unlock("rain");
    on = true;
    html.classList.add("first-rain");
    emit("show");
  }
  function finish(why) {
    if (done && !on) return;
    done = true;
    try { localStorage.setItem(KEY, "1"); } catch (e) { /* private mode */ }
    const wasOn = on;
    on = false;
    html.classList.remove("first-rain");
    const A = abil();
    if (A && wasOn) {
      // Lightning is not the street lesson's; the other three open too unless that lesson still holds them back
      const st = day.street && day.street.now ? day.street.now() : null;
      const teaching = !!(st && st.stage >= 0 && !st.done);
      ALL.forEach((id) => { if (id === "bolt" || id === "rain" || !teaching) A.unlock(id); });
    }
    emit("done", { why: why || "rain" });
  }
  function hide() { if (on) { on = false; html.classList.remove("first-rain"); } }

  window.addEventListener("day:power", (e) => {
    const d = (e && e.detail) || {};
    if (d.denied || d.action === "denied") return;
    if (on && (d.power === "rain" || d.action === "rain")) finish("rain");
  });
  window.addEventListener("day:control", (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "take") setTimeout(show, 80);
    else if (d.action === "let-go") hide();
  });
  window.addEventListener("day:coldopen", (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "end" || d.action === "failed") setTimeout(show, 80);
  });
  window.addEventListener("day:episode", (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "start" && !done) { on = true; finish("episode"); }
  });

  // a tap on the street (not a drag) is the cast: Rain where the finger landed (powers.js already took the aim on pointerdown)
  let down = null;
  window.addEventListener("pointerdown", (e) => {
    const cv = day.world && day.world().engine && day.world().engine.getRenderingCanvas && day.world().engine.getRenderingCanvas();
    down = on && cv && e.target === cv && e.button === 0 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  }, true);
  window.addEventListener("pointerup", (e) => {
    const d0 = down;
    down = null;
    if (!d0 || !on || !inControl()) return;
    if (Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 12 || performance.now() - d0.t > 500) return;
    const P = powers();
    if (P && P.command) P.command("rain", e.pointerType === "touch" ? "touch" : "mouse");
  }, true);

  const api = {
    now: () => ({ on, done, quiet, locked: ALL.filter((id) => { const A = abil(); return A && A.isLocked(id); }), log: log.slice() }),
    /** Opens everything now (the playtests' named setup, a settings skip). */
    skip() { if (!on) { done = true; return; } finish("skip"); },
    reset() { done = false; try { localStorage.removeItem(KEY); } catch (e) { /* private */ } if (inControl() && !coldOn()) show(); },
  };
  day.firstrain = api;
  window.firstrain = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startFirstRain();

/* ==========================================================================
   Day one's card (retention, "reasons to come back"). A moment after a new player's FIRST cast (the cold open's bolt, the
   first Rain, the wake-him Lightning: any `day:power` that isn't denied) a short card closes day one with THREE outcomes
   from what he just did (the sky he called, what it changed in the city, who it helped) and hands over the next ability:
   Tornado, which stays locked (a full-Charge Wind hold stays a Gale; `gauge.spend("tornado")` refuses) until the player taps
   "Start day two". The unlock is kept in localStorage `icanbe.dayone` ("1"), so it is a one-time reward and a reload keeps it.
   Waits for a quiet moment (not the cold open, a cutscene, an episode, the title or a menu); a bot's tab never meets it unless
   `?playtest=` is day-one / wake-him / audio-check. `day.dayone`: now(), show(), start(), reset(); event `day:dayone`
   { action: show | start | skip }. Playtest: `wake-him` (day-one events and metrics).
   ========================================================================== */
export function startDayOne() {
  const day = window.day;
  if (!day || day.dayone || typeof document === "undefined" || !document.body) return day && day.dayone;
  const html = document.documentElement;
  const KEY = "icanbe.dayone";
  const AFTER_MS = 2800; // after the first cast's own payoff (lawn, pond, Birdie's cheer: js/firstcast.js)

  let quiet = false;
  try {
    const id = new URLSearchParams(location.search).get("playtest");
    if (id && id !== "day-one" && id !== "wake-him" && id !== "audio-check") quiet = true;
    else if (!id && navigator.webdriver) quiet = true;
  } catch (e) { /* no location */ }

  let done = quiet;
  if (!quiet) { try { done = localStorage.getItem(KEY) === "1"; } catch (e) { /* private mode */ } }
  let armed = false;
  let up = false;
  let first = null; // the cast that started it { power, at }
  let timer = 0;
  const log = [];

  const NAME = { bolt: "Lightning", storm: "Storm", rain: "Rain", wind: "Wind", gust: "Gust", gale: "Gale", fog: "Fog", sunbreak: "Sun break", tornado: "Tornado", lightning: "Lightning" };
  const SKY = { bolt: "Lightning struck", storm: "A storm answered", rain: "Rain fell on the street", wind: "Wind swept through", gust: "Wind swept through", gale: "A gale swept through", fog: "Fog rolled in", sunbreak: "The sun broke through", tornado: "A tornado ran the street" };

  const style = document.createElement("style");
  style.textContent = `
.day-one{position:fixed;inset:0;z-index:37;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:radial-gradient(ellipse at 50% 45%,rgba(8,12,24,.5),rgba(4,6,12,.82));opacity:0;transition:opacity .4s ease;box-sizing:border-box}
.day-one[hidden]{display:none}
.day-one.on{opacity:1}
.day-one .card{box-sizing:border-box;width:min(360px,100%);max-height:100%;overflow:auto;padding:20px 18px 18px;border-radius:20px;background:rgba(14,22,30,.95);border:1px solid #7ec8ff;box-shadow:0 14px 44px rgba(0,0,0,.5);color:#f6f1e8;font:500 1rem/1.35 Outfit,system-ui,sans-serif;text-align:center;transform:translateY(10px);transition:transform .4s ease}
.day-one.on .card{transform:none}
.day-one .k{margin:0 0 2px;color:#9fd4ff;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;font-weight:700}
.day-one h2{margin:0 0 12px;font:700 1.45rem/1.1 Outfit,system-ui,sans-serif}
.day-one ol{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-direction:column;gap:8px;text-align:left}
.day-one li{display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:12px;background:rgba(126,200,255,.08);border:1px solid rgba(126,200,255,.22);opacity:0;transform:translateX(-8px);transition:opacity .35s ease,transform .35s ease}
.day-one li.on{opacity:1;transform:none}
.day-one li i{flex:0 0 auto;width:22px;height:22px;border-radius:50%;background:#7ec8ff;color:#0a0d16;font:800 .85rem/22px Outfit,system-ui,sans-serif;text-align:center;font-style:normal}
.day-one li b{display:block;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:#9fd4ff;font-weight:700}
.day-one li span{font-size:.95rem}
.day-one .next{margin:0 0 14px;padding:10px 12px;border-radius:12px;border:1px dashed #f0a84a;background:rgba(240,168,74,.1);opacity:0;transition:opacity .4s ease}
.day-one .next.on{opacity:1}
.day-one .next b{display:block;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:#f0a84a}
.day-one button{appearance:none;width:100%;min-height:48px;padding:10px 18px;border-radius:999px;border:1px solid #9fd4ff;background:linear-gradient(180deg,#2a6fa8,#1d4f7c);color:#f6f1e8;font:700 1rem Outfit,system-ui,sans-serif;cursor:pointer}
.day-one button:hover{background:linear-gradient(180deg,#3a82bf,#235f94)}
.day-one button:active{transform:scale(.97)}
.day-one button:focus-visible{outline:2px solid #fff;outline-offset:3px}
html.title-up .day-one{display:none}
@media (max-height:520px){.day-one .card{padding:12px 14px}.day-one h2{font-size:1.2rem;margin-bottom:8px}.day-one ol{gap:5px;margin-bottom:8px}.day-one li{padding:5px 10px}.day-one .next{margin-bottom:8px;padding:6px 10px}}
@media (prefers-reduced-motion:reduce){.day-one,.day-one .card,.day-one li,.day-one .next{transition:none}}
`;
  document.head.appendChild(style);

  const el = document.createElement("div");
  el.className = "day-one";
  el.id = "day-one";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Day one");
  el.innerHTML = `<div class="card"><p class="k">Day one</p><h2>That was your first storm.</h2><ol id="day-one-outcomes"></ol><p class="next" id="day-one-next"></p><button type="button" id="day-one-start">Start day two</button></div>`;
  document.body.appendChild(el);
  const list = el.querySelector("#day-one-outcomes");
  const nextEl = el.querySelector("#day-one-next");
  const btn = el.querySelector("#day-one-start");

  const abil = () => { const P = window.powers || day.powers; return P && P.abilities ? P.abilities : null; };
  const inControl = () => !!(day.control && day.control.mode && day.control.mode() === "control");
  function emit(action, extra) {
    const detail = Object.assign({ action }, extra || {});
    log.push(Object.assign({ t: Math.round(performance.now()) }, detail));
    if (log.length > 20) log.shift();
    try { window.dispatchEvent(new window.CustomEvent("day:dayone", { detail })); } catch (e) { /* node */ }
  }
  const busy = () => {
    if (html.classList.contains("title-up") || html.classList.contains("cine-up") || html.classList.contains("ep-menu-up") || html.classList.contains("cold-open")) return true;
    if (day.coldopen && day.coldopen.active && day.coldopen.active()) return true;
    const ep = day.episodes && day.episodes.now ? day.episodes.now() : null;
    return !!(ep && ep.id);
  };

  /* Three outcomes of the first cast, from what really happened: the sky he called, what it changed, who it helped. */
  function outcomes() {
    const p = first && first.power;
    const out = [{ k: "The sky", t: SKY[p] || "You called the weather" }];
    let rows = [];
    try { const t = day.memory && day.memory.tally ? day.memory.tally() : null; rows = (t && t.rows) || []; } catch (e) { /* no memory */ }
    out.push({ k: "The city", t: rows.length ? rows.slice(0, 3).map((r) => r.text).join(" · ") : "Birdie looked up and cheered" });
    let n = 0;
    try { n = day.helped && day.helped.now ? day.helped.now().count : 0; } catch (e) { /* no counter */ }
    out.push({ k: "The street", t: n > 0 ? (n === 1 ? "1 neighbour helped" : n + " neighbours helped") : "Your street is waiting on the sky" });
    return out;
  }

  function show() {
    if (up || done) return false;
    if (!first) first = { power: "rain", at: performance.now() };
    list.innerHTML = "";
    const o = outcomes();
    o.forEach((x) => {
      const li = document.createElement("li");
      li.innerHTML = `<i aria-hidden="true">✓</i><div><b></b><span></span></div>`;
      li.querySelector("b").textContent = x.k;
      li.querySelector("span").textContent = x.t;
      list.appendChild(li);
    });
    nextEl.innerHTML = `<b>Unlocked for day two</b><span>Tornado: hold Wind until Charge is full.</span>`;
    nextEl.classList.remove("on");
    up = true;
    el.hidden = false;
    html.classList.add("day-one-up");
    requestAnimationFrame(() => el.classList.add("on"));
    [...list.children].forEach((li, i) => setTimeout(() => li.classList.add("on"), 250 + i * 380));
    setTimeout(() => nextEl.classList.add("on"), 250 + o.length * 380);
    try { if (day.control && day.control.hold) { /* the day keeps running; the card only waits for a tap */ } } catch (e) { /* ok */ }
    emit("show", { outcomes: o.map((x) => x.k + ": " + x.t), power: first.power, unlocks: "tornado" });
    try { btn.focus({ preventScroll: true }); } catch (e) { /* old browser */ }
    return true;
  }
  function close(action, via) {
    if (!up) return false;
    up = false;
    done = true;
    try { localStorage.setItem(KEY, "1"); } catch (e) { /* private mode */ }
    el.classList.remove("on");
    html.classList.remove("day-one-up");
    setTimeout(() => { if (!up) el.hidden = true; }, 420);
    if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
    const A = abil();
    if (A) A.unlock("tornado");
    emit(action, { via: via || "tap", unlocked: "tornado" });
    return true;
  }
  btn.addEventListener("click", (e) => { e.stopPropagation(); close("start", "tap"); });
  window.addEventListener("keydown", (e) => {
    if (!up || (e.key !== "Enter" && e.key !== "Escape")) return;
    e.preventDefault();
    e.stopPropagation();
    close(e.key === "Enter" ? "start" : "skip", "key");
  }, true);

  /* Wait out whatever is on screen, then show (checked on the cast's own timer and on each event that ends one: no polling). */
  function attempt() {
    clearTimeout(timer);
    if (done || up || !armed) return;
    if (busy() || !inControl()) { timer = setTimeout(attempt, 1500); return; }
    show();
  }

  function lockIfNew() {
    if (done) return;
    const A = abil();
    if (A) A.lock(["tornado"]);
  }
  lockIfNew();
  window.addEventListener("day:control", (e) => { if (e && e.detail && e.detail.action === "take") lockIfNew(); });

  window.addEventListener("day:power", (e) => {
    const d = (e && e.detail) || {};
    if (done || armed || d.denied || d.action === "denied") return;
    armed = true;
    first = { power: d.power || d.action || d.id || "rain", at: performance.now() };
    emit("armed", { power: first.power });
    timer = setTimeout(attempt, AFTER_MS);
  });

  const api = {
    now: () => ({ done, quiet, armed, up, locked: !!(abil() && abil().isLocked("tornado")), first, log: log.slice() }),
    show,
    start: () => close("start", "api"),
    reset() { done = false; armed = false; first = null; try { localStorage.removeItem(KEY); } catch (e) { /* private */ } lockIfNew(); },
  };
  day.dayone = api;
  window.dayone = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startDayOne();

/* ==========================================================================
   What the storm changed (return hook). After a deed under control (his first Rain most of all) a short card says what
   the weather just did to the world, from `day.memory.tally()` (the lawn and pond, puddles, scorches, things knocked
   over, signs, the tomato wall), e.g. "Your rain changed the city: Park lawn green · Pond full". Only the rows that are
   new since the last card are named, with the running total. The same tally is a line on the title (js/title.js).
   Placement: `.storm-toast` in css/hud.css. `day.tally`: now(), log(). Events `day:tally` (show). Playtest: `storm-tally`.
   ========================================================================== */
export function startTally() {
  const day = window.day;
  if (!day || day.tally || typeof document === "undefined" || !document.body) return day && day.tally;
  const style = document.createElement("style");
  style.textContent = `.storm-toast{z-index:9;transform:translate(-50%,-8px);opacity:0;transition:opacity .3s,transform .3s;pointer-events:none;padding:10px 18px;border-radius:16px;background:rgba(14,22,30,.93);border:1px solid #7ec8ff;color:#f6f1e8;font:600 .95rem/1.3 Outfit,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4);text-align:center;width:max-content;max-width:calc(100vw - 32px)}
.storm-toast b{display:block;color:#9fd4ff;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;margin-bottom:2px}
.storm-toast.on{opacity:1;transform:translate(-50%,0)}
@media (prefers-reduced-motion: reduce){.storm-toast{transition:none}}`;
  document.head.appendChild(style);
  const el = document.createElement("div");
  el.className = "storm-toast";
  el.id = "storm-toast";
  el.setAttribute("role", "status");
  document.body.appendChild(el);

  const WORD = { rain: "Your rain", bolt: "Your lightning", storm: "Your storm", gale: "Your gale", tornado: "Your tornado" };
  let seen = new Set();
  let ready = false;
  let hideT = 0;
  let last = null;
  const log = [];
  const inControl = () => !!(day.control && day.control.mode && day.control.mode() === "control");
  const rowsNow = () => { const t = day.memory && day.memory.tally ? day.memory.tally() : null; return t && Array.isArray(t.rows) ? t.rows : []; };
  const sync = () => { seen = new Set(rowsNow().map((r) => r.id + ":" + r.n)); ready = true; };

  function show(power) {
    const t = day.memory && day.memory.tally ? day.memory.tally() : null;
    if (!t || !Array.isArray(t.rows)) return;
    const fresh = t.rows.filter((r) => !seen.has(r.id + ":" + r.n));
    t.rows.forEach((r) => seen.add(r.id + ":" + r.n));
    if (!fresh.length || !inControl()) return;
    const el2 = el;
    el2.innerHTML = `<b></b><span></span>`;
    el2.firstChild.textContent = `${WORD[power] || "Your weather"} changed the city`;
    el2.lastChild.textContent = fresh.map((r) => r.text).join(" · ") + (t.total > fresh.length ? ` (${t.total} changes in all)` : "");
    el2.classList.add("on");
    last = { power, rows: fresh.map((r) => r.text), total: t.total, text: el2.lastChild.textContent };
    log.push(Object.assign({ t: Math.round(performance.now()) }, last));
    if (log.length > 20) log.shift();
    try { window.dispatchEvent(new window.CustomEvent("day:tally", { detail: Object.assign({ action: "show" }, last) })); } catch (e) { /* node */ }
    clearTimeout(hideT);
    hideT = setTimeout(() => el2.classList.remove("on"), 6500);
  }

  let pendingPower = "rain";
  window.addEventListener("day:power", (e) => {
    const d = (e && e.detail) || {};
    if (!d.denied && d.action !== "denied") pendingPower = d.power || d.action || pendingPower;
    if (!d.denied && d.action !== "denied" && (d.power === "rain" || d.action === "rain")) setTimeout(rainNow, 450);
  });
  /* The instant answer to a Rain cast (well inside one second): the lawn is already darkening (slice.js drench, 0.8 s) and
     the crowd opening umbrellas (crowd.js), and this card names it. The slower tally card above follows with what stayed. */
  function rainNow() {
    if (!inControl()) return;
    let umbs = 0;
    try { umbs = (day.crowd && day.crowd.info && day.crowd.info().umbrellas) || 0; } catch (e) { /* none */ }
    el.innerHTML = `<b></b><span></span>`;
    el.firstChild.textContent = "Your rain";
    el.lastChild.textContent = "Lawn darkening" + (umbs > 0 ? ` · ${umbs} people under umbrellas` : " · pedestrians opening umbrellas");
    el.classList.add("on");
    last = { power: "rain", rows: [], total: 0, text: el.lastChild.textContent, instant: true };
    log.push(Object.assign({ t: Math.round(performance.now()) }, last));
    try { window.dispatchEvent(new window.CustomEvent("day:tally", { detail: Object.assign({ action: "show" }, last) })); } catch (e) { /* node */ }
    clearTimeout(hideT);
    hideT = setTimeout(() => el.classList.remove("on"), 6500);
  }
  window.addEventListener("day:memory", (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "apply" && ["load", "reload", "shift", "reset", "quality", "api"].includes(d.why)) { sync(); return; }
    if (d.action === "apply" || d.action === "deed") setTimeout(() => show(pendingPower), 1400);
  });
  window.addEventListener("day:control", (e) => { const d = (e && e.detail) || {}; if (d.action === "let-go") el.classList.remove("on"); });
  setTimeout(sync, 0);

  const api = {
    now: () => ({ on: el.classList.contains("on"), ready, last, text: el.textContent }),
    log: () => log.slice(),
  };
  day.tally = api;
  window.tally = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startTally();

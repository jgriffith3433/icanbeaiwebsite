/* ==========================================================================
   Neighbours helped today (return hook). When a cast answers a neighbour's ask, the thanks they already speak (the street's
   lesson in js/street.js, the day's beats in js/neighbors.js: voiced, positional, no text card) is joined by a short reward
   pop at the spot (a ring of sparkles that rises, projected from the world; plus sfx.js's sparkle and goal chime, existing
   sounds only) and a small counter that ticks. The count is the neighbours helped on the real local date, kept in
   localStorage `icanbe.helped` ({ date, who: [...] }); a reload the same day shows it again (the green lawn is memory.js's).
   Placement: `.helped-count` in css/hud.css (desktop top centre; phone top-left, only while he's the player's, a heart and
   the number so it never meets Let go). `day.helped`: now(), add(who, at), reload(). Events `day:helped` (add / reload).
   Playtest: `ask-markers`.
   ========================================================================== */
const KEY = "icanbe.helped";
const NAMES = { birdie: "Birdie", dex: "Dex", quill: "Ines", ines: "Ines" };
const first = (w) => String(w || "").toLowerCase().split(/\s+/)[0].replace(/^quill$/, "ines");

/** Pure: the saved record for `date` (a record from another day is empty). */
export function readHelped(raw, date) {
  try {
    const r = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (r && r.date === date && Array.isArray(r.who)) return { date, who: [...new Set(r.who.map(String))] };
  } catch (e) { /* bad store */ }
  return { date, who: [] };
}
/** Pure: add a neighbour to a day's record; `fresh` says whether the count went up. */
export function addHelped(rec, who) {
  const id = first(who);
  if (!id || rec.who.includes(id)) return { rec, fresh: false };
  return { rec: { date: rec.date, who: rec.who.concat(id) }, fresh: true };
}

export function startHelped() {
  const day = window.day;
  const world = day && day.world && day.world();
  if (!day || day.helped || typeof document === "undefined" || !document.body) return day && day.helped;
  const html = document.documentElement;
  const today = () => (day.memory && day.memory.today ? day.memory.today().date : new Date().toISOString().slice(0, 10));
  const load = () => { let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) { /* private mode */ } return readHelped(raw, today()); };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* private mode */ } };
  let rec = load();
  const log = [];

  const style = document.createElement("style");
  style.textContent = `
.helped-count{z-index:9;display:none;align-items:center;gap:8px;height:40px;padding:0 14px;border-radius:20px;background:rgba(14,22,30,.9);border:1px solid #f0c27a;color:#f6f1e8;font:600 .9rem/1 Outfit,system-ui,sans-serif;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.35);white-space:nowrap}
.helped-count.has{display:inline-flex}
.helped-count .hc-h{color:#f0c27a;font-size:1.05rem}
.helped-count.bump{animation:hcBump .7s ease-out}
@keyframes hcBump{0%{transform:translateX(-50%) scale(1)}30%{transform:translateX(-50%) scale(1.25);box-shadow:0 0 22px 6px rgba(240,194,122,.7)}100%{transform:translateX(-50%) scale(1)}}
html.touch-ui .helped-count{padding:0 12px}
html.touch-ui .helped-count .hc-t{display:none}
html.touch-ui .helped-count.bump{animation-name:hcBumpL}
@keyframes hcBumpL{0%{transform:scale(1)}30%{transform:scale(1.25);box-shadow:0 0 22px 6px rgba(240,194,122,.7)}100%{transform:scale(1)}}
html.touch-ui:not(.in-control) .helped-count,html.title-up .helped-count,html.cold-open .helped-count,html.cine-up .helped-count{display:none}
.helped-pop{position:fixed;z-index:15;width:0;height:0;pointer-events:none}
.helped-pop i{position:absolute;left:-6px;top:-6px;width:12px;height:12px;background:#ffe9b0;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);filter:drop-shadow(0 0 5px #f0c27a);opacity:0;animation:hpUp 1.5s ease-out forwards}
@keyframes hpUp{0%{opacity:0;transform:translate(0,0) scale(.3)}15%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1.1) rotate(160deg)}}
html.title-up .helped-pop,html.cine-up .helped-pop{display:none}
@media (prefers-reduced-motion:reduce){.helped-pop i{animation-duration:.01s}.helped-count.bump{animation:none}}
`;
  document.head.appendChild(style);
  const el = document.createElement("div");
  el.className = "helped-count";
  el.id = "helped-count";
  el.setAttribute("role", "status");
  el.innerHTML = `<span class="hc-h" aria-hidden="true">♥</span><span class="hc-n">0</span><span class="hc-t"></span>`;
  document.body.appendChild(el);

  function paint() {
    const n = rec.who.length;
    el.querySelector(".hc-n").textContent = String(n);
    el.querySelector(".hc-t").textContent = n === 1 ? "neighbour helped today" : "neighbours helped today";
    el.setAttribute("aria-label", `${n} ${n === 1 ? "neighbour" : "neighbours"} helped today`);
    el.classList.toggle("has", n > 0);
  }

  /** Where the pop goes: the spot the ask is for (config places), else his own position. */
  function spotFor(who, verb) {
    const places = day.asks && day.asks.places ? day.asks.places() : {};
    const mine = places[first(who)] || places[who] || {};
    const norm = verb === "sun" ? "sunbreak" : verb;
    const p = mine[norm] || mine[Object.keys(mine)[0]];
    if (p) return { x: p.x, z: p.z };
    const s = day.control && day.control.state ? day.control.state() : null;
    return s ? { x: s.x, z: s.z } : null;
  }
  function pop(at) {
    const B = window.BABYLON;
    const scene = world && world.scene;
    const cam = scene && scene.activeCamera;
    let sx = innerWidth / 2;
    let sy = innerHeight * 0.4;
    if (B && cam && at) {
      const eng = scene.getEngine();
      const rect = eng.getRenderingCanvas().getBoundingClientRect();
      const w = eng.getRenderWidth();
      const h = eng.getRenderHeight();
      const gy = world.surfaceAt ? world.surfaceAt(at.x, at.z) : 0;
      const pr = B.Vector3.Project(new B.Vector3(at.x, gy + 1.4, at.z), B.Matrix.IdentityReadOnly, scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
      if (pr.z > 0 && pr.z < 1) { sx = rect.left + (pr.x * rect.width) / w; sy = rect.top + (pr.y * rect.height) / h; }
    }
    // always inside the screen, clear of the thumbs' arcs and the top rows
    sx = Math.max(70, Math.min(innerWidth - 70, sx));
    sy = Math.max(120, Math.min(innerHeight * 0.55, sy));
    const root = document.createElement("div");
    root.className = "helped-pop";
    root.style.left = sx.toFixed(0) + "px";
    root.style.top = sy.toFixed(0) + "px";
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.2;
      const r = 36 + (i % 3) * 16;
      const s = document.createElement("i");
      s.style.setProperty("--dx", (Math.cos(a) * r).toFixed(0) + "px");
      s.style.setProperty("--dy", (Math.sin(a) * r * 0.8 - 34).toFixed(0) + "px");
      s.style.animationDelay = (i % 4) * 0.05 + "s";
      root.appendChild(s);
    }
    document.body.appendChild(root);
    setTimeout(() => root.remove(), 1900);
    return { x: Math.round(sx), y: Math.round(sy) };
  }

  const emit = (action, extra) => {
    const d = Object.assign({ action, count: rec.who.length }, extra || {});
    log.push(Object.assign({ t: Math.round(performance.now()) }, d));
    if (log.length > 20) log.shift();
    try { window.dispatchEvent(new window.CustomEvent("day:helped", { detail: d })); } catch (e) { /* node */ }
  };

  function add(who, verb) {
    const r = addHelped(rec, who);
    if (!r.fresh) return false;
    rec = r.rec;
    save();
    paint();
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
    const at = pop(spotFor(who, verb));
    emit("add", { who: first(who), name: NAMES[first(who)] || who, screen: at });
    if (day.note) day.note(`${NAMES[first(who)] || who} is helped (${rec.who.length} today)`);
    return true;
  }

  // the thanks has just begun to be spoken by street.js / neighbors.js: the pop and the counter go with it
  window.addEventListener("day:street", (e) => {
    const d = e.detail || {};
    if (d.action === "thanks" && d.who) add(d.who, d.id || d.verb);
  });
  window.addEventListener("day:neighbor", (e) => {
    const d = e.detail || {};
    if (d.action === "reward" && d.kind === "thanks" && d.id) add(d.id);
  });
  // a same-day reload (or a date shift in the playtest) rereads the day's record
  window.addEventListener("day:memory", () => {
    const now = load();
    if (now.date !== rec.date || now.who.length !== rec.who.length) { rec = now; paint(); }
  });

  paint();
  const api = {
    now: () => ({ count: rec.who.length, who: rec.who.slice(), date: rec.date, visible: !!(el.offsetWidth && el.offsetHeight), log: log.slice() }),
    add,
    reload: () => { rec = load(); paint(); emit("reload"); return api.now(); },
  };
  day.helped = api;
  window.helped = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startHelped();

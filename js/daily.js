/* ==========================================================================
   Today's request (day.config.js `daily`): each real local date, one neighbour asks for one specific bit of
   weather at a place and a time window. The title shows it as one line; in the world the neighbour (Birdie,
   Dex, Ines, or a citizen from the episodes, who stands at their spot all day) says it aloud, voiced, when he
   comes close, and a "!" over their head (a 52 px button) says it again on a tap. Answering it (he calls the
   power inside the place and the window) records askAnswered + dailyAnswered in day.memory, plays the voiced
   thanks and leaves a reward standing for the rest of the date: bunting, lanterns, pinwheels or an easel with
   their photograph. State is localStorage `icanbe.daily` (no accounts). Pure helpers are exported for
   scripts/check-daily.mjs. `day.daily`: today(), line(), yesterdayLine(), forDate(key), now(), reload().
   ========================================================================== */
import { dateKey, dayDiff } from "./memory.js";
import { buildFigure } from "./peoplekit.js";

/* ---------------------------------- pure ---------------------------------- */

/** Days since 1970-01-01 of a "YYYY-MM-DD" key. */
export function dayNumber(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
/** The pool index for a date: the date's day number times `step` (coprime to the pool's size), modulo the size. Any run of
 *  `size` consecutive dates gets `size` different asks, so no ask repeats within a week (the pool is 21). */
export function askIndex(key, size, step) {
  const n = dayNumber(key);
  return (((n * (step || 1)) % size) + size) % size;
}
export function gcd(a, b) { return b ? gcd(b, a % b) : Math.abs(a); }
export function pickAsk(cfg, key) {
  const pool = (cfg && cfg.pool) || [];
  return pool.length ? pool[askIndex(key, pool.length, cfg.step || 1)] : null;
}
/** Is hour `h` in [from, to]? from > to wraps past midnight. */
export function inHours(h, from, to) {
  if (from == null || to == null) return true;
  return from <= to ? h >= from && h <= to : h >= from || h <= to;
}
/** Which power ids answer which ask: wind takes a Gust, Gale or Tornado; bolt takes Lightning and its Storm. */
export function powerMatches(want, power) {
  if (!want || !power) return false;
  if (want === "wind") return power === "wind" || power === "gust" || power === "gale" || power === "tornado";
  if (want === "bolt") return power === "bolt" || power === "storm";
  return want === power;
}
export function fmtHour(h) {
  const m = Math.round((((h % 24) + 24) % 24) * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${((hh + 11) % 12) + 1}${mm ? ":" + String(mm).padStart(2, "0") : ""} ${hh < 12 ? "AM" : "PM"}`;
}
export function hourOf(minutes) { return (((minutes % 1440) + 1440) % 1440) / 60; }
export function emptyState() { return { v: 1, days: {} }; }
export function parseState(raw) {
  try {
    const s = raw ? JSON.parse(raw) : null;
    return s && s.v === 1 && s.days && typeof s.days === "object" ? s : emptyState();
  } catch (e) { return emptyState(); }
}
/** Keep two weeks of answers. */
export function pruneState(s, todayKey) {
  Object.keys(s.days).forEach((k) => { if (dayDiff(k, todayKey) > 14) delete s.days[k]; });
}
/** "Today: Ines wants fog over the plaza at dusk" */
export function todayLine(cfg, ask) {
  return ask ? `${(cfg.lines && cfg.lines.today) || "Today: "}${ask.title}` : "";
}
/** "Yesterday: you brought Dex the sun", only when yesterday's ask was answered. */
export function yesterdayLine(cfg, state, key) {
  const [yy, mm, dd] = String(key).split("-").map(Number);
  const y = dateKey(new Date(yy, mm - 1, dd, 12).getTime(), -1);
  const rec = state.days[y];
  const ask = pickAsk(cfg, y);
  return rec && rec.done && ask && rec.id === ask.id ? `${(cfg.lines && cfg.lines.yesterday) || "Yesterday: "}${ask.did}` : "";
}

/* ---------------------------------- the page ---------------------------------- */

const lerp = (a, b, t) => a + (b - a) * t;

export function installDaily(day, world) {
  const C = typeof window !== "undefined" ? window.DAY_CONFIG : null;
  const cfg = C && C.daily;
  const B = typeof window !== "undefined" ? window.BABYLON : null;
  if (!day || !world || !world.scene || !B || !cfg || !(cfg.pool || []).length || day.daily) return day && day.daily;
  const scene = world.scene;
  const L = cfg.lines || {};
  const key = cfg.storageKey || "icanbe.daily";
  const html = document.documentElement;

  const todayKey = () => {
    try { if (day.memory && day.memory.today) return day.memory.today().date; } catch (e) { /* not up yet */ }
    return dateKey(Date.now(), 0);
  };
  let state = (() => { try { return parseState(localStorage.getItem(key)); } catch (e) { return emptyState(); } })();
  const save = () => { try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) { /* private mode */ } };
  const events = [];
  const emit = (action, detail) => {
    events.push(Object.assign({ action, t: performance.now() }, detail));
    if (events.length > 40) events.shift();
    try { window.dispatchEvent(new window.CustomEvent("day:daily", { detail: Object.assign({ action }, detail) })); } catch (e) { /* node */ }
  };

  let dateNow = todayKey();
  let ask = pickAsk(cfg, dateNow);
  const doneToday = () => !!(state.days[dateNow] && state.days[dateNow].done && state.days[dateNow].id === (ask && ask.id));
  const isNeighbor = (a) => a && ["birdie", "dex", "quill"].includes(a.who);

  /* ---------- DOM: the "!" over the asker's head and their bubble ---------- */
  const style = document.createElement("style");
  style.textContent = `
.daily-layer{position:fixed;inset:0;z-index:8;pointer-events:none;overflow:hidden;font-family:Outfit,system-ui,sans-serif}
.daily-tag{position:absolute;transform:translate(-50%,-100%);text-align:center;pointer-events:none}
.daily-mark{pointer-events:auto;appearance:none;width:52px;height:52px;border-radius:50%;border:2px solid var(--dc,#f0c27a);background:rgba(10,14,22,.86);color:var(--dc,#f0c27a);font:800 1.5rem/1 Outfit,system-ui,sans-serif;cursor:pointer;box-shadow:0 0 18px color-mix(in srgb,var(--dc,#f0c27a) 55%,transparent);animation:dailyBob 1.6s ease-in-out infinite;touch-action:manipulation}
.daily-mark:active{transform:scale(.92)}
.daily-mark:focus-visible{outline:2px solid #7ec8ff;outline-offset:3px}
@keyframes dailyBob{0%,100%{margin-top:0}50%{margin-top:-6px}}
.daily-say{display:block;position:relative;margin:0 auto 10px;width:max-content;max-width:min(260px,calc(100vw - 32px));padding:9px 13px;border-radius:14px;background:#f6f1e8;color:#1a1c22;font:600 .84rem/1.3 Outfit,system-ui,sans-serif;text-align:left;box-shadow:0 8px 22px rgba(0,0,0,.4);border:2px solid var(--dc,#f0c27a)}
.daily-say small{display:block;margin-top:4px;color:#6a5a2a;font-weight:700}
.daily-say[hidden]{display:none}
html.title-up .daily-layer,html.ep-menu-up .daily-layer,html.cold-open .daily-layer{visibility:hidden}
`;
  document.head.appendChild(style);
  const layer = document.createElement("div");
  layer.id = "daily-layer";
  layer.className = "daily-layer";
  const tag = document.createElement("div");
  tag.className = "daily-tag";
  tag.id = "daily-tag";
  tag.innerHTML = `<span class="daily-say" id="daily-say" role="status" hidden></span><button type="button" class="daily-mark" id="daily-mark" aria-label="Today's request">!</button>`;
  tag.style.display = "none";
  layer.appendChild(tag);
  document.body.appendChild(layer);
  const sayEl = tag.querySelector(".daily-say");
  const markBtn = tag.querySelector(".daily-mark");

  /* ---------- the asker: a neighbour's own figure, or a citizen who stands at their spot ---------- */
  let citizen = null; // { id, root, fig, meshes, x, z }
  const surf = (x, z) => { try { return world.surfaceAt ? world.surfaceAt(x, z) : 0; } catch (e) { return 0; } };
  function dropCitizen() {
    if (!citizen) return;
    try { citizen.root.dispose(false, true); } catch (e) { /* gone */ }
    citizen = null;
  }
  function raiseCitizen() {
    const c = ask && !isNeighbor(ask) && cfg.citizens && cfg.citizens[ask.who];
    if (!c) { dropCitizen(); return; }
    if (citizen && citizen.id === ask.who) return;
    dropCitizen();
    const fig = buildFigure(B, scene, "daily-" + ask.who, c.look, c.scale || 1);
    fig.root.position.set(c.x, surf(c.x, c.z), c.z);
    citizen = { id: ask.who, root: fig.root, fig, meshes: fig.meshes, x: c.x, z: c.z, yaw: Math.PI, want: null, c };
  }
  raiseCitizen();

  const hero = () => {
    const Cn = day.control;
    if (Cn && Cn.mode && Cn.mode() === "control") { const s = Cn.state(); return { x: s.x, z: s.z, y: s.y }; }
    return null;
  };
  const askerPos = () => {
    if (!ask) return null;
    if (isNeighbor(ask)) {
      const p = day.neighbors && day.neighbors.now ? day.neighbors.now().people.find((q) => q.id === ask.who) : null;
      return p ? { x: p.x, z: p.z, inside: p.inside, scale: ask.who === "quill" ? 1.1 : ask.who === "birdie" ? 0.88 : 1 } : null;
    }
    const c = cfg.citizens[ask.who];
    return c ? { x: c.x, z: c.z, inside: false, scale: c.scale || 1 } : null;
  };
  const colorOf = () => {
    if (!ask) return "#f0c27a";
    const n = (C.neighbors && C.neighbors.list || []).find((p) => p.id === ask.who);
    return (n && n.color) || (cfg.citizens[ask.who] && cfg.citizens[ask.who].color) || "#f0c27a";
  };
  const powerName = () => {
    const names = (C.powers && C.powers.names) || {};
    const map = { wind: "Wind", sunbreak: "Sun", bolt: "Lightning", rain: "Rain", fog: "Fog" };
    return map[ask.power] || names[ask.power] || ask.power;
  };

  /* ---------- the ask, aloud ---------- */
  let sayUntil = 0;
  let thanksAt = 0;
  let spokenKey = ""; // date + id the auto line was last said for (once per page session)
  const speak = (text) => { try { return day.dialogue && day.dialogue.speak ? day.dialogue.speak(ask.name, text) : null; } catch (e) { return null; } };
  function showBubble(html, secs) {
    sayEl.innerHTML = html;
    sayEl.hidden = false;
    sayUntil = performance.now() + secs * 1000;
  }
  function hours() { return `${fmtHour(ask.from)} to ${fmtHour(ask.to)}`; }
  function sayAsk(via) {
    if (!ask || doneToday()) return false;
    showBubble(`${ask.ask}<small>${powerName()} · ${ask.place.name} · ${hours()}</small>`, 9);
    const L2 = speak(ask.ask);
    if (day.neighbors && day.neighbors.gesture && isNeighbor(ask)) day.neighbors.gesture(ask.who, "ask");
    if (citizen) citizen.want = "ask";
    emit("ask", { id: ask.id, who: ask.who, via, voiced: !!L2 });
    return true;
  }
  const tap = (() => {
    let last = 0;
    return () => {
      const t = performance.now();
      if (t - last < 350) return;
      last = t;
      sayAsk("tap");
    };
  })();
  markBtn.addEventListener("click", tap);
  markBtn.addEventListener("pointerup", tap);

  /* ---------- answering ---------- */
  function answer() {
    if (!ask || doneToday()) return;
    state.days[dateNow] = { id: ask.id, done: true, at: Date.now() };
    pruneState(state, dateNow);
    save();
    try {
      if (day.memory && day.memory.note) {
        day.memory.note("dailyAnswered", "answered", ask.who);
        day.memory.note("askAnswered", "answered", ask.who);
      }
    } catch (e) { /* no memory */ }
    const A = (window.powers || day.powers || {}).abilities;
    if (A && A.reset && cfg.pressure) {
      const cur = (A.now && A.now().energy) || 0;
      const max = (A.now && A.now().max) || 100;
      A.reset(Math.min(max, cur + cfg.pressure));
    }
    thanksAt = performance.now() + 1100;
    if (day.note) day.note(`${ask.name}: ${ask.thanks}`);
    emit("answered", { id: ask.id, who: ask.who, power: ask.power });
    buildReward();
  }
  function thanks() {
    thanksAt = 0;
    showBubble(ask.thanks, 7);
    const L2 = speak(ask.thanks);
    if (day.neighbors && day.neighbors.gesture && isNeighbor(ask)) day.neighbors.gesture(ask.who, "thanks");
    if (citizen) citizen.want = "thanks";
    emit("thanks", { id: ask.id, who: ask.who, voiced: !!L2 });
  }

  window.addEventListener("day:power", (e) => {
    const d = (e && e.detail) || {};
    if (!ask || doneToday() || !d.power || d.action === "denied") return;
    const me = hero();
    if (!me) return; // the player's calls only: the day's own weather and the cold open don't count
    const p = d.power || d.action;
    if (!powerMatches(ask.power, p) && !powerMatches(ask.power, d.action)) return;
    const pw = window.powers && window.powers.now ? window.powers.now() : null;
    const hit = p === "bolt" && pw && pw.strike ? pw.strike : me;
    const fr = day.now && day.now();
    const h = fr && fr.minutes != null ? hourOf(fr.minutes) : 12;
    const near = Math.hypot(hit.x - ask.place.x, hit.z - ask.place.z) <= ask.place.r || Math.hypot(me.x - ask.place.x, me.z - ask.place.z) <= ask.place.r;
    if (!inHours(h, ask.from, ask.to)) {
      if (day.note) day.note(String(L.wrongHour || "{name} asked for it {when}.").replace("{name}", ask.name).replace("{when}", `between ${hours().replace(" to ", " and ")}`));
      return;
    }
    if (!near) {
      if (day.note) day.note(String(L.wrongPlace || "{name} wanted it {where}.").replace("{name}", ask.name).replace("{where}", ask.place.name));
      return;
    }
    answer();
  });

  /* ---------- the reward: stays standing until the date turns ---------- */
  let rewardRoot = null;
  const spinners = [];
  const mats = {};
  const mat = (hex, glow) => {
    const k = hex + (glow || 0);
    if (!mats[k]) {
      const m = new B.StandardMaterial("daily-" + k, scene);
      const c = B.Color3.FromHexString(hex);
      m.diffuseColor = c;
      m.emissiveColor = c.scale(glow == null ? 0.25 : glow);
      m.specularColor = new B.Color3(0.05, 0.05, 0.05);
      m.backFaceCulling = false;
      mats[k] = m;
    }
    return mats[k];
  };
  function clearReward() {
    if (rewardRoot) { try { rewardRoot.dispose(false, false); } catch (e) { /* gone */ } }
    rewardRoot = null;
    spinners.length = 0;
  }
  const keep = (m, parent) => { m.parent = parent; m.isPickable = false; return m; };
  function post(parent, x, z, h, hex) {
    const gy = surf(x, z);
    const m = B.MeshBuilder.CreateCylinder("daily-post", { diameter: 0.1, height: h, tessellation: 8 }, scene);
    m.position.set(x, gy + h / 2, z);
    m.material = mat(hex || "#5a4a3a", 0.2);
    return keep(m, parent);
  }
  /** Flat two-sided triangles (front faces -z, back faces +z), from a list of [x, y] triples. Winding and normals agree. */
  function triMesh(name, tris, hex, glow) {
    const pos = [], nor = [], idx = [];
    tris.forEach((t) => {
      const a = pos.length / 3;
      t.forEach((p) => { pos.push(p[0], p[1], 0); nor.push(0, 0, -1); });
      idx.push(a, a + 1, a + 2);
      t.forEach((p) => { pos.push(p[0], p[1], 0); nor.push(0, 0, 1); });
      idx.push(a + 3, a + 5, a + 4);
    });
    const m = new B.Mesh(name, scene);
    const vd = new B.VertexData();
    vd.positions = pos; vd.normals = nor; vd.indices = idx;
    vd.applyToMesh(m);
    m.material = mat(hex, glow);
    return m;
  }
  const sag = (t, drop) => -Math.sin(Math.PI * t) * drop;
  function buildBunting(parent, r) {
    const [ax, az] = r.at, half = 3.2, top = 2.5;
    post(parent, ax - half, az, top); post(parent, ax + half, az, top);
    const gy = surf(ax, az);
    const cols = [r.color, "#f6f1e8", "#3a6ea5"];
    const tris = [[], [], []];
    const N = 13;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const x = ax - half + 2 * half * t;
      const y = gy + top - 0.1 + sag(t, 0.45);
      tris[i % 3].push([[x - 0.15 - ax, y - gy, 0], [x + 0.15 - ax, y - gy, 0], [x - ax, y - gy - 0.34, 0]]);
    }
    const root = new B.TransformNode("daily-bunting", scene);
    root.position.set(ax, gy, az);
    root.parent = parent;
    tris.forEach((tt, k) => { if (tt.length) keep(triMesh("daily-flags-" + k, tt.map((q) => q.map((p) => [p[0], p[1]])), cols[k], 0.35), root); });
    // the string: thin dashes along the sag
    const str = [];
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const x0 = -half + 2 * half * t0, x1 = -half + 2 * half * t1;
      const y0 = top - 0.1 + sag(t0, 0.45), y1 = top - 0.1 + sag(t1, 0.45);
      str.push([[x0, y0], [x1, y1], [x1, y1 - 0.025]], [[x0, y0], [x1, y1 - 0.025], [x0, y0 - 0.025]]);
    }
    keep(triMesh("daily-string", str, "#3a2f28", 0.1), root);
  }
  function buildLanterns(parent, r) {
    const [ax, az] = r.at, half = 3, top = 2.6;
    post(parent, ax - half, az, top); post(parent, ax + half, az, top);
    const gy = surf(ax, az);
    const N = 7;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const y = gy + top - 0.15 + sag(t, 0.4);
      const m = B.MeshBuilder.CreateSphere("daily-lantern", { diameter: 0.26, segments: 8 }, scene);
      m.position.set(ax - half + 2 * half * t, y - 0.14, az);
      m.material = mat(r.color, 0.9);
      keep(m, parent);
    }
  }
  function buildPinwheels(parent, r) {
    const [ax, az] = r.at;
    [-1.6, 0, 1.6].forEach((dx, i) => {
      const x = ax + dx, z = az + (i === 1 ? 0.3 : 0);
      const h = 1.2 + i * 0.12;
      post(parent, x, z, h, "#7a6a58");
      const gy = surf(x, z);
      const hub = new B.TransformNode("daily-pinwheel", scene);
      hub.parent = parent;
      hub.position.set(x, gy + h + 0.02, z - 0.07);
      const cols = [r.color, "#f6f1e8"];
      [0, 1].forEach((k) => {
        const tris = [];
        for (let b = k; b < 4; b += 2) {
          const a = (b * Math.PI) / 2;
          const c = Math.cos(a), s = Math.sin(a);
          const P = (u, v) => [u * c - v * s, u * s + v * c];
          tris.push([P(0, 0), P(0.3, 0.02), P(0.12, 0.28)]);
        }
        keep(triMesh("daily-blades", tris, cols[k], 0.4), hub);
      });
      spinners.push({ node: hub, speed: 2.2 + i * 0.5 });
    });
  }
  function photoTexture(power) {
    const W = 128, H = 160;
    const tex = new B.DynamicTexture("daily-photo", { width: W, height: H }, scene, false);
    const g = tex.getContext();
    const sky = { fog: ["#9fb0b8", "#d8e0e2"], wind: ["#4f8fc7", "#bfe0f2"], sunbreak: ["#f0b45a", "#ffe7a8"], bolt: ["#1a1f3c", "#4a3f7a"], rain: ["#3a4a6a", "#7a8aa4"] }[power] || ["#4f8fc7", "#bfe0f2"];
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = power === "bolt" ? "#0a0c18" : "#2a3340";
    [[6, 96, 20, 64], [30, 78, 18, 82], [52, 104, 24, 56], [80, 70, 16, 90], [100, 90, 22, 70]].forEach((b) => g.fillRect(b[0], b[1], b[2], b[3]));
    if (power === "fog") { g.fillStyle = "rgba(235,240,242,.7)"; g.fillRect(0, 88, W, 22); g.fillRect(0, 118, W, 18); }
    if (power === "sunbreak") { g.fillStyle = "#fff2b8"; g.beginPath(); g.arc(88, 36, 16, 0, 7); g.fill(); g.strokeStyle = "rgba(255,240,170,.8)"; g.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i * 0.785; g.beginPath(); g.moveTo(88 + Math.cos(a) * 22, 36 + Math.sin(a) * 22); g.lineTo(88 + Math.cos(a) * 34, 36 + Math.sin(a) * 34); g.stroke(); } }
    if (power === "bolt") { g.strokeStyle = "#f4f8ff"; g.lineWidth = 4; g.beginPath(); g.moveTo(70, 0); g.lineTo(58, 40); g.lineTo(74, 46); g.lineTo(52, 100); g.stroke(); }
    if (power === "rain") { g.strokeStyle = "rgba(200,220,255,.7)"; g.lineWidth = 2; for (let i = 0; i < 30; i++) { const x = (i * 37) % W, y = (i * 53) % H; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 6, y + 16); g.stroke(); } }
    if (power === "wind") { g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 3; [30, 50, 70].forEach((y) => { g.beginPath(); g.moveTo(10, y); g.bezierCurveTo(50, y - 12, 80, y + 12, 118, y - 4); g.stroke(); }); }
    tex.update();
    return tex;
  }
  function buildPhoto(parent, r) {
    const ax = r.at[0] + 2.4, az = r.at[1];
    post(parent, ax - 0.55, az, 1.95, "#5a4a3a"); post(parent, ax + 0.55, az, 1.95, "#5a4a3a");
    const gy = surf(ax, az);
    const board = B.MeshBuilder.CreateBox("daily-board", { width: 1.1, height: 1.35, depth: 0.06 }, scene);
    board.position.set(ax, gy + 1.45, az);
    board.material = mat("#3a2f28", 0.15);
    keep(board, parent);
    const pic = B.MeshBuilder.CreatePlane("daily-picture", { width: 0.92, height: 1.15, sideOrientation: B.Mesh.FRONTSIDE }, scene);
    pic.rotation.y = Math.PI; // faces +z, toward the avenue
    pic.position.set(ax, gy + 1.45, az + 0.035);
    const m = new B.StandardMaterial("daily-picture-mat", scene);
    m.disableLighting = true;
    let tex = null;
    try { tex = photoTexture(r.power); } catch (e) { /* no 2d canvas (a Node check): a flat print */ }
    if (tex) m.emissiveTexture = tex; else m.emissiveColor = new B.Color3(0.6, 0.7, 0.8);
    m.specularColor = new B.Color3(0, 0, 0);
    pic.material = m;
    keep(pic, parent);
  }
  function buildReward() {
    clearReward();
    if (!ask || !ask.reward || !doneToday()) return;
    rewardRoot = new B.TransformNode("daily-reward", scene);
    const r = ask.reward;
    if (r.kind === "bunting") buildBunting(rewardRoot, r);
    else if (r.kind === "lanterns") buildLanterns(rewardRoot, r);
    else if (r.kind === "pinwheels") buildPinwheels(rewardRoot, r);
    else if (r.kind === "photo") buildPhoto(rewardRoot, r);
    rewardRoot.getChildMeshes().forEach((m) => { m.isPickable = false; });
    emit("reward", { id: ask.id, kind: r.kind, meshes: rewardRoot.getChildMeshes().length });
  }

  /* ---------- the date turns: a new ask, the old reward goes ---------- */
  function newDay() {
    const k = todayKey();
    if (k === dateNow && ask) return;
    dateNow = k;
    ask = pickAsk(cfg, dateNow);
    sayEl.hidden = true;
    thanksAt = 0;
    spokenKey = "";
    clearReward();
    raiseCitizen();
    buildReward();
    emit("date", { date: dateNow, id: ask && ask.id });
  }
  window.addEventListener("day:memory", (e) => { const d = (e && e.detail) || {}; if (d.action === "shift" || d.action === "reload") newDay(); });

  /* ---------- per frame ---------- */
  const v = new B.Vector3();
  let frameN = 0;
  scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    if (!cam) return;
    const nowMs = performance.now();
    if (++frameN % 90 === 0) newDay();
    const eng = scene.getEngine();
    const dt = Math.min(0.1, eng.getDeltaTime() / 1000 || 0.016);
    spinners.forEach((s) => {
      const sky = (window.weather && window.weather.now && window.weather.now()) || {};
      s.node.rotation.z -= dt * s.speed * (1 + 2 * (sky.state === "wind" || sky.state === "storm" ? 1 : 0));
    });
    if (thanksAt && nowMs >= thanksAt) thanks();
    if (!sayEl.hidden && nowMs > sayUntil) sayEl.hidden = true;
    const pos = askerPos();
    // the citizen's figure: stand at the spot, face him, wave when the ask or the thanks is said
    if (citizen) {
      const me = hero() || (day.now && day.now().frame && day.now().frame.person ? day.now().frame.person : null);
      if (me) {
        const yaw = Math.atan2(me.x - citizen.x, me.z - citizen.z);
        if (Math.hypot(me.x - citizen.x, me.z - citizen.z) < 18) citizen.yaw += Math.atan2(Math.sin(yaw - citizen.yaw), Math.cos(yaw - citizen.yaw)) * Math.min(1, dt * 4);
      }
      citizen.root.rotation.y = citizen.yaw;
      const sky = (window.weather && window.weather.now && window.weather.now()) || {};
      const f = citizen.fig;
      const g = citizen.want;
      const sample = f.step({ dt, speed: 0, moving: false, yawErr: 0, sit: false, weather: sky.state || "clear", sunShield: typeof sky.sun === "number" ? sky.sun : 0,
        gesture: g || (f.anim && f.anim.gesture && f.anim.gesture !== "react" ? f.anim.gesture : null), react: false, personality: null, jump: false });
      if (g && f.anim && f.anim.gesture === g) citizen.want = null;
      citizen.root.position.y = surf(citizen.x, citizen.z);
      void sample;
      // fade with distance to the camera like the neighbors, so an orbit camera beside them never shows a slab
      const cd = Math.hypot(cam.position.x - citizen.x, cam.position.y - (citizen.root.position.y + 0.9), cam.position.z - citizen.z);
      const vis = Math.max(0, Math.min(1, (cd - 0.6) / 0.8));
      if (vis !== citizen.vis) { citizen.vis = vis; citizen.meshes.forEach((m) => { m.visibility = vis; m.setEnabled(vis > 0.02); }); }
    }
    // the "!" over their head
    const show = !!(ask && pos && !pos.inside && !doneToday());
    const wantBubble = !sayEl.hidden && pos && !pos.inside;
    if (!pos || pos.inside || (!show && !wantBubble)) { tag.style.display = "none"; return; }
    const w = eng.getRenderWidth(), hh = eng.getRenderHeight();
    const canvas = eng.getRenderingCanvas();
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: w, height: hh };
    v.set(pos.x, 2.4 * pos.scale + 0.2, pos.z);
    const pr = B.Vector3.Project(v, B.Matrix.IdentityReadOnly, scene.getTransformMatrix(), cam.viewport.toGlobal(w, hh));
    const cd = cam.position ? B.Vector3.Distance(cam.position, v) : 0;
    const on = pr.z > 0 && pr.z < 1 && cd < 90;
    tag.style.display = on ? "" : "none";
    if (!on) return;
    tag.style.setProperty("--dc", colorOf());
    tag.style.left = (rect.left + (pr.x * rect.width) / w).toFixed(1) + "px";
    tag.style.top = (rect.top + (pr.y * rect.height) / hh).toFixed(1) + "px";
    tag.style.zIndex = String(Math.round(1000 - cd));
    markBtn.style.display = show ? "" : "none";
    // the neighbour says it aloud when he walks up (once per date per page session)
    const me = hero();
    if (show && me && spokenKey !== dateNow + ask.id && Math.hypot(me.x - pos.x, me.z - pos.z) < (cfg.near || 12)) {
      spokenKey = dateNow + ask.id;
      sayAsk("near");
    }
  });

  const api = {
    today: () => ({ date: dateNow, id: ask && ask.id, who: ask && ask.who, name: ask && ask.name, power: ask && ask.power, title: ask && ask.title, from: ask && ask.from, to: ask && ask.to,
      place: ask && ask.place, answered: doneToday(), line: todayLine(cfg, ask), yesterday: yesterdayLine(cfg, state, dateNow), reward: doneToday() && ask && ask.reward ? ask.reward.kind : null }),
    line: () => { newDay(); return todayLine(cfg, ask); },
    yesterdayLine: () => { newDay(); return yesterdayLine(cfg, state, dateNow); },
    /** The ask for any date (pure; the playtest checks a week never repeats). */
    forDate: (k) => pickAsk(cfg, k),
    /** Does this neighbour's own ask give way today (the daily ask is theirs, unanswered or not)? */
    owns: (id) => !!(ask && isNeighbor(ask) && ask.who === id),
    /** What a page reload does: read the store again and rebuild the reward. */
    reload() { try { state = parseState(localStorage.getItem(key)); } catch (e) { state = emptyState(); } newDay(); buildReward(); return api.today(); },
    reset() { state = emptyState(); save(); clearReward(); sayEl.hidden = true; return api.today(); },
    now: () => ({ date: dateNow, ask: ask && ask.id, answered: doneToday(), reward: rewardRoot ? rewardRoot.getChildMeshes().length : 0, rewardKind: doneToday() && ask && ask.reward ? ask.reward.kind : null,
      marker: tag.style.display !== "none" && markBtn.style.display !== "none", bubble: sayEl.hidden ? "" : sayEl.textContent, citizen: citizen ? citizen.id : null, spinners: spinners.length, events: events.slice() }),
    events: () => events.slice(),
  };
  day.daily = api;
  window.daily = api;
  buildReward();
  return api;
}

if (typeof window !== "undefined" && window.day && window.day.world && typeof document !== "undefined" && document.body) {
  const w = window.day.world();
  if (w) installDaily(window.day, w);
}

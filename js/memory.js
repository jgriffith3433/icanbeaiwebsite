/* ==========================================================================
   The city remembers (docs/world-bible.md "The city remembers").
   A small store in localStorage `icanbe.memory`, keyed by the real local date: the deeds he did under control (asks
   answered or botched, where each power landed by zone, rescues, scars, endings), recorded from the events the
   game already sends (day:power, day:neighbor, day:episode, day:story): no polling. Persistent marks come from it:
   the park lawn green after rain, scorch decals where bolts struck, toppled bins and a leaning sign after wind,
   puddles that dry slowly, fuller tomatoes after Birdie's rain. A mark is full strength for the rest of the real
   day it was made and fades over 3 real days after (strength 1 - days/3); at most 20 decals are kept, 6 are drawn on
   low quality (phones). `day.memory`: today(), since(days), marks(), shiftDays(n) (the playtest's clock), now().
   ========================================================================== */
import { FACT_DAYS, factsFrom, DEED_ORDER, deedsFrom } from "./deeds.js";
const B = typeof window !== "undefined" ? window.BABYLON : null;

export const KEY = "icanbe.memory";
export const SHIFT_KEY = "icanbe.memory.shift"; // sessionStorage: days added to today's date (the playtest fakes +1 / +3)
export const FADE_DAYS = 3;
export const CAP = 20;
export const LOW_CAP = 6;
export const KEEP_DAYS = 14;

/* Where things land: [x0, z0, x1, z1] rects from day.config.js (the park lawn, the plaza, the shop roof, the annex roof, the
   Storm Tank's yard); the avenue is the road's band. First match wins. */
export const ZONES = [
  ["shop", [43, -5.5, 57, 6.5]],
  ["annex", [149, -5.5, 165, 6.5]],
  ["tank", [180, 34, 200, 54]],
  ["plaza", [106, 16.8, 130, 36]],
  ["park", [-33, 21, 29, 67]],
];
export const AVENUE_Z = 12.6;
export function zoneOf(x, z) {
  for (const [name, r] of ZONES) if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return name;
  if (Math.abs(z - AVENUE_Z) <= 4) return "avenue";
  return "street";
}

/** "YYYY-MM-DD" in the local time zone, `shift` days on. */
export function dateKey(ms, shift) {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0); // noon: a DST change never moves the day
  d.setDate(d.getDate() + (shift || 0));
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function dayDiff(a, b) {
  const t = (k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}
/** 1 for a mark made today (and for one that looks future-dated), down to 0 at FADE_DAYS days old. */
export function strength(madeKey, todayKey) {
  const n = dayDiff(madeKey, todayKey);
  return n <= 0 ? 1 : Math.max(0, 1 - n / FADE_DAYS);
}

export function emptyArcs() { return { birdie: 0, dex: 0, quill: 0 }; }
export function emptyStore() { return { v: 1, days: {}, arcs: emptyArcs() }; }
export function parse(raw) {
  try {
    const s = raw ? JSON.parse(raw) : null;
    if (!(s && s.v === 1 && s.days && typeof s.days === "object")) return emptyStore();
    if (!s.arcs || typeof s.arcs !== "object") s.arcs = emptyArcs();
    ["birdie", "dex", "quill"].forEach((id) => {
      const n = Number(s.arcs[id]) || 0;
      s.arcs[id] = n < 0 ? 0 : n > 3 ? 3 : (n | 0);
    });
    return s;
  } catch (e) { return emptyStore(); }
}
function dayOf(store, key) {
  return store.days[key] || (store.days[key] = { deeds: {}, zones: {}, marks: [] });
}
/** Count a deed (kind, optionally where and with which power). */
export function addDeed(store, key, kind, zone, power) {
  const d = dayOf(store, key);
  d.deeds[kind] = (d.deeds[kind] || 0) + 1;
  if (zone) {
    const z = d.zones[zone] || (d.zones[zone] = {});
    const p = power || kind;
    z[p] = (z[p] || 0) + 1;
  }
  return d;
}
/** Add a decal-type mark to a day; the store keeps CAP of them across all days (the oldest go first). */
export function addMark(store, key, mark) {
  dayOf(store, key).marks.push(mark);
  const all = [];
  Object.keys(store.days).sort().forEach((k) => store.days[k].marks.forEach((m) => all.push([k, m])));
  while (all.length > CAP) { const [k, m] = all.shift(); store.days[k].marks.splice(store.days[k].marks.indexOf(m), 1); }
}
/** Forget days older than KEEP_DAYS. */
export function prune(store, todayKey) {
  Object.keys(store.days).forEach((k) => { if (dayDiff(k, todayKey) > KEEP_DAYS) delete store.days[k]; });
}
/** Every mark that still shows on `todayKey`, newest last, each with its strength; `cap` keeps the newest. */
export function liveMarks(store, todayKey, cap) {
  const out = [];
  Object.keys(store.days).sort().forEach((k) => {
    const s = strength(k, todayKey);
    if (s <= 0.02) return;
    store.days[k].marks.forEach((m) => out.push(Object.assign({}, m, { date: k, k: s })));
  });
  return out.slice(-Math.max(0, cap == null ? CAP : cap));
}
/** Strongest "did X" over the live days: the lawn (rain on the park or Birdie's rain), Birdie's tomatoes. */
export function liveFlag(store, todayKey, test) {
  let best = 0;
  Object.keys(store.days).forEach((k) => { if (test(store.days[k])) best = Math.max(best, strength(k, todayKey)); });
  return best;
}
/* Rain anywhere greens the lawn and fills the pond (the first Rain is the first change the player sees); the park's own rain and Birdie's too. */
export const parkRain = (d) => !!(d.deeds.birdieRain || Object.keys(d.zones || {}).some((z) => z !== "answered" && z !== "botched" && d.zones[z] && d.zones[z].rain));
/** What the weather changed in the world, as counted rows for the tally (pure): `d.marks` are the live marks. */
export function tallyOf(d, lawnK, tomatoes) {
  const marks = (d && d.marks) || [];
  const n = (kind) => marks.filter((m) => m.kind === kind).length;
  const rows = [];
  if (lawnK > 0) rows.push({ id: "lawn", n: 1, text: "Park lawn green" }, { id: "pond", n: 1, text: "Pond full" });
  const p = n("puddle"), sc = n("scorch"), bn = n("bin") + n("chair") + n("cone") + n("planter") + n("awning") + n("debris"), sg = n("sign");
  if (p) rows.push({ id: "puddle", n: p, text: p === 1 ? "1 puddle" : `${p} puddles` });
  if (sc) rows.push({ id: "scorch", n: sc, text: sc === 1 ? "1 scorch" : `${sc} scorches` });
  if (bn) rows.push({ id: "wreck", n: bn, text: bn === 1 ? "1 thing knocked over" : `${bn} things knocked over` });
  if (sg) rows.push({ id: "sign", n: sg, text: sg === 1 ? "1 sign leaning" : `${sg} signs leaning` });
  if (tomatoes > 0) rows.push({ id: "tomato", n: 1, text: "Tomato wall full" });
  return rows;
}
export const endingHalfLawn = (d) => !!(d.deeds && d.deeds.endingHalf);
export const birdieRain = (d) => !!d.deeds.birdieRain;
/** Add up the deeds and zones of the last `days` days (today counts as 1). */
export function sinceDays(store, todayKey, days) {
  const out = { days, from: todayKey, to: todayKey, deeds: {}, zones: {}, marks: 0 };
  Object.keys(store.days).sort().forEach((k) => {
    const n = dayDiff(k, todayKey);
    if (n < 0 || n >= days) return;
    if (k < out.from || out.from === todayKey) out.from = k < out.from ? k : out.from;
    const d = store.days[k];
    Object.keys(d.deeds).forEach((a) => (out.deeds[a] = (out.deeds[a] || 0) + d.deeds[a]));
    Object.keys(d.zones).forEach((z) => Object.keys(d.zones[z]).forEach((p) => {
      const o = out.zones[z] || (out.zones[z] = {});
      o[p] = (o[p] || 0) + d.zones[z][p];
    }));
    out.marks += d.marks.length;
  });
  return out;
}

export { FACT_DAYS, factsFrom, DEED_ORDER, deedsFrom };

/* ---------------------------------- the page ---------------------------------- */
export function installMemory(day, world) {
  if (!day || !world || !world.scene || !B) return null;
  const scene = world.scene;
  const emit = (action, detail) => {
    try { window.dispatchEvent(new window.CustomEvent("day:memory", { detail: Object.assign({ action }, detail) })); } catch (e) { /* node */ }
  };
  const lowQ = () => { try { return (day.look && day.look.quality && day.look.quality() === "low") || document.documentElement.classList.contains("touch-ui"); } catch (e) { return false; } };
  const readShift = () => { try { return Number(sessionStorage.getItem(SHIFT_KEY)) || 0; } catch (e) { return 0; } };
  let shift = readShift();
  const today = () => dateKey(Date.now(), shift);
  let store = (() => { try { return parse(localStorage.getItem(KEY)); } catch (e) { return emptyStore(); } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode */ } };
  prune(store, today());

  const surf = (x, z) => { try { return world.surfaceAt ? world.surfaceAt(x, z) : 0; } catch (e) { return 0; } };
  const who = () => (day.control && day.control.mode && day.control.mode() === "control" ? day.control.state() : null);

  /* ---- the marks: shared materials, one mesh per decal (at most 20, 6 on low), no lights ---- */
  const mat = (name, hex, alpha, emissive) => {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = B.Color3.FromHexString(hex);
    m.specularColor = B.Color3.Black();
    if (emissive) m.emissiveColor = B.Color3.FromHexString(hex).scale(emissive);
    m.alpha = alpha;
    if (alpha < 1) { m.transparencyMode = B.Material.MATERIAL_ALPHABLEND; m.zOffset = -3; }
    return m;
  };
  const M = {
    char: mat("mem-char", "#050506", 1),
    ring: mat("mem-ring", "#4a3520", 1),
    puddle: mat("mem-puddle", "#4d6f8c", 1, 0.25),
    bin: mat("mem-bin", "#2f5b44", 1),
    lid: mat("mem-lid", "#1d3a2c", 1),
    pole: mat("mem-pole", "#8a8f98", 1),
    board: mat("mem-board", "#d8b23a", 1),
  };
  const built = [];
  const clear = () => { built.splice(0).forEach((m) => m.dispose()); };
  const flat = (name, r, x, y, z, m) => {
    const d = B.MeshBuilder.CreateDisc(name, { radius: r, tessellation: 24 }, scene);
    d.rotation.x = Math.PI / 2;
    d.position.set(x, y, z);
    d.material = m;
    d.isPickable = false;
    built.push(d);
    return d;
  };
  const place = (m, markK, hours) => {
    if (m.kind === "scorch") {
      const y = (m.y != null ? m.y : surf(m.x, m.z)) + 0.02;
      const a = flat("mem-scorch-ring", 1.5, m.x, y, m.z, M.ring); // the brown edge shows on asphalt; the char shows on grass and roofs
      const b = flat("mem-scorch", 0.95, m.x, y + 0.008, m.z, M.char);
      a.visibility = 0.7 * markK; b.visibility = 0.92 * markK;
    } else if (m.kind === "puddle") {
      // slow-drying: shrinks and thins over its first 36 real hours, then follows the 3-day fade
      const dry = Math.max(0.15, 1 - (hours || 0) / 36);
      const p = flat("mem-puddle", (m.r || 1.4) * (0.55 + 0.45 * dry), m.x, surf(m.x, m.z) + 0.016, m.z, M.puddle);
      p.visibility = 0.55 * markK * dry;
    } else if (m.kind === "bin") {
      const y = surf(m.x, m.z);
      const body = B.MeshBuilder.CreateCylinder("mem-bin", { diameter: 0.56, height: 0.8, tessellation: 12 }, scene);
      body.material = M.bin;
      body.rotation.z = Math.PI / 2; // on its side
      body.rotation.y = m.yaw || 0;
      body.position.set(m.x, y + 0.28, m.z);
      body.isPickable = false;
      built.push(body);
      const lid = B.MeshBuilder.CreateCylinder("mem-lid", { diameter: 0.6, height: 0.05, tessellation: 12 }, scene);
      lid.material = M.lid;
      lid.position.set(m.x + 1.0, y + 0.03, m.z + (m.yaw > 0 ? 0.5 : -0.5)); // the lid rolled off
      lid.isPickable = false;
      built.push(lid);
    } else if (m.kind === "sign") {
      const y = surf(m.x, m.z);
      const root = new B.TransformNode("mem-sign", scene);
      root.position.set(m.x, y, m.z);
      root.rotation.z = 0.32; // leaning
      const pole = B.MeshBuilder.CreateCylinder("mem-sign-pole", { diameter: 0.1, height: 2.4, tessellation: 8 }, scene);
      pole.parent = root; pole.position.y = 1.2; pole.material = M.pole;
      const board = B.MeshBuilder.CreateBox("mem-sign-board", { width: 0.12, height: 0.6, depth: 0.9 }, scene);
      board.parent = root; board.position.y = 2.1; board.material = M.board;
      [pole, board].forEach((q) => (q.isPickable = false));
      built.push(pole, board, root);
    } else if (m.kind === "chair" || m.kind === "cone" || m.kind === "planter" || m.kind === "awning" || m.kind === "debris") {
      // tornado wreck: a tipped stand-in that lasts the real day (the live Havok body stays in-session;
      // this mark is what a later visit / reload still shows)
      const y = surf(m.x, m.z);
      const body = B.MeshBuilder.CreateBox("mem-" + m.kind, { width: 0.5, height: 0.4, depth: 0.5 }, scene);
      body.material = M.bin;
      body.rotation.z = Math.PI / 2;
      body.rotation.y = m.yaw || 0;
      body.position.set(m.x, y + 0.22, m.z);
      body.isPickable = false;
      built.push(body);
    }
  };

  let nowInfo = { lawn: 0, tomatoes: 0, decals: 0, scorch: 0, bin: 0, sign: 0, puddle: 0, quality: "high", date: today() };
  function apply(why) {
    const t = today();
    clear();
    const low = lowQ();
    const list = liveMarks(store, t, low ? LOW_CAP : CAP);
    const now = Date.now();
    const counts = { scorch: 0, bin: 0, sign: 0, puddle: 0 };
    list.forEach((m) => {
      const hours = m.at ? (now - m.at) / 3600000 : 0;
      place(m, m.k, hours);
      counts[m.kind] = (counts[m.kind] || 0) + 1;
    });
    const lawn = liveFlag(store, t, parkRain);
    const half = liveFlag(store, t, endingHalfLawn);
    const tom = liveFlag(store, t, birdieRain);
    try {
      // a fresh deed eases the lawn green and the pond up over a few seconds; a load, reload, shift or reset jumps to it
      const jump = ["load", "reload", "shift", "reset", "quality", "api"].includes(why);
      if (half > 0 && lawn > 0) day.slice && day.slice.setLawn && day.slice.setLawn("damp", 0.45 * half, true, jump);
      else day.slice && day.slice.setLawn && day.slice.setLawn(lawn > 0 ? "damp" : "straw", lawn || 1, true, jump);
    } catch (e) { /* slice not up */ }
    try { day.slice && day.slice.setTomatoes && day.slice.setTomatoes(tom); } catch (e) { /* slice not up */ }
    nowInfo = { lawn: +lawn.toFixed(2), tomatoes: +tom.toFixed(2), decals: list.length, quality: low ? "low" : "high", date: t, ...counts };
    paintTally();
    emit("apply", Object.assign({ why }, nowInfo));
  }

  /* ---- recording ---- */
  /* deeds since he was last taken (what "the deed just done" is at Let go) */
  let session = {};
  let factsCache = null;
  const addSession = (kind, zone, power) => {
    const one = { deeds: {}, zones: {} };
    addDeed({ days: { x: one } }, "x", kind, zone, power);
    const f = factsFrom({ deeds: one.deeds, zones: one.zones });
    Object.keys(f).forEach((k) => (session[k] = (session[k] || 0) + f[k]));
  };
  function record(kind, zone, power, mark) {
    const t = today();
    addSession(kind, zone, power);
    factsCache = null;
    addDeed(store, t, kind, zone, power);
    if (mark) addMark(store, t, Object.assign({ at: Date.now() }, mark));
    prune(store, t);
    save();
    emit("deed", { kind, zone, power, mark: mark ? mark.kind : null });
    if (mark || kind === "birdieRain" || (kind === "power" && power === "rain")) apply(kind);
    else paintTally();
  }
  const sidewalkZ = (z) => (z < AVENUE_Z ? AVENUE_Z - 2.8 : AVENUE_Z + 2.8);

  window.addEventListener("day:power", (e) => {
    const d = e.detail || {};
    if (d.action === "denied") return;
    const p = d.power || d.action;
    const me = who();
    if (!me) return; // deeds are the player's: the cold open and the day's own weather don't count
    const pw = window.powers && window.powers.now ? window.powers.now() : null;
    if (p === "bolt" || p === "storm") {
      const s = p === "bolt" && pw && pw.strike ? pw.strike : null;
      const x = s ? s.x : me.x, z = s ? s.z : me.z;
      const zone = zoneOf(x, z);
      record("power", zone, p, p === "bolt" ? { kind: "scorch", x: +x.toFixed(2), z: +z.toFixed(2), y: s ? +s.y.toFixed(2) : undefined } : null);
    } else if (p === "rain") {
      const zone = zoneOf(me.x, me.z);
      record("power", zone, p, zone === "park" ? null : { kind: "puddle", x: +(me.x + 1.2).toFixed(2), z: +me.z.toFixed(2), r: 1.4 });
      if (zone !== "park") {
        const d0 = dayOf(store, today());
        const zp = d0.zones.park || (d0.zones.park = {});
        zp.rain = (zp.rain || 0) + 1;
        addSession("power", "park", "rain");
        factsCache = null;
        save();
        apply("rain");
      }
    } else if (p === "gale" || p === "tornado") {
      const tn = p === "tornado" && pw && pw.tornado ? pw.tornado : null;
      const x = tn ? tn.x : me.x, z = tn ? tn.z : me.z;
      const zone = zoneOf(x, z);
      const sz = sidewalkZ(z);
      record("power", zone, p, { kind: "bin", x: +x.toFixed(2), z: sz, yaw: z < AVENUE_Z ? -0.6 : 0.6 });
      addMark(store, today(), { at: Date.now(), kind: "bin", x: +(x + 2.2).toFixed(2), z: sz, yaw: z < AVENUE_Z ? 0.9 : -0.9 });
      addMark(store, today(), { at: Date.now(), kind: "sign", x: +(x - 3).toFixed(2), z: sz });
      save();
      apply("wind");
    } else {
      record("power", zoneOf(me.x, me.z), p);
    }
  });
  window.addEventListener("day:neighbor", (e) => {
    const d = e.detail || {};
    if (d.action === "beat-done" && d.kind === "ask") record("askAnswered", "answered", d.id);
    else if (d.action === "beat-missed") record("askBotched", "botched", d.id);
    else if (d.action === "reward" && d.id === "birdie") record("birdieRain", "park", "rain");
    else if (d.action === "reward") record("neighborReward", undefined, d.id);
    else if (d.action === "arc-beat" && d.id && d.beat != null) {
      // neighbors.js already wrote the beat via setArc; record a deed so Let go / facts can name it
      record("arc-" + d.id, d.id, "beat" + d.beat);
      if (d.id === "birdie" && d.beat >= 2) record("birdieRain", "park", "rain");
    }
  });
  // the street's lesson: Birdie asked for rain, he gave it near her: the park drinks (same deed as her morning ask)
  window.addEventListener("day:street", (e) => {
    const d = e.detail || {};
    if (d.action === "thanks" && d.who === "birdie" && d.id === "rain") record("birdieRain", "park", "rain");
  });
  window.addEventListener("day:episode", (e) => {
    const d = e.detail || {};
    if (["score", "ending", "arc"].includes(d.action)) record("episode-" + d.action, undefined, d.id);
    // Part 3 ending scenes: the district keeps the outcome for the rest of the real day.
    if (d.action === "ending" || d.action === "ending-scene") {
      const id = d.ending || d.id;
      if (id === "A") {
        // Fair Weather: park stays green on a same-day reload
        record("power", "park", "rain");
        record("birdieRain", "park", "rain");
      } else if (id === "B") {
        // Heavy Weather: half-green lawn + a leaning sign scar
        record("endingHalf", "park", "B");
        record("power", "park", "rain");
        addMark(store, today(), { at: Date.now(), kind: "sign", x: 154, z: 4.5 });
        save();
        apply("ending-B");
      } else if (id === "C") {
        addMark(store, today(), { at: Date.now(), kind: "puddle", x: 66, z: 12.6, r: 3.2 });
        addMark(store, today(), { at: Date.now(), kind: "puddle", x: 80, z: 13.2, r: 2.4 });
        addMark(store, today(), { at: Date.now(), kind: "scorch", x: 70, z: 12.6, y: 0.05 });
        save();
        apply("ending-C");
      }
    }
  });
  window.addEventListener("day:story", (e) => {
    const d = e.detail || {};
    if (d.action === "kick") record("scar", undefined, d.id || d.kick);
    else if (d.action === "help" || d.action === "twist") record("rescue", undefined, d.piece || d.action);
    else if (d.action === "hurt") record("scar", undefined, d.piece);
  });
  window.addEventListener("day:quality", () => apply("quality"));
  window.addEventListener("day:control", (e) => {
    const d = e.detail || {};
    if (d.action === "take") { session = {}; roofSecs = 0; }
  });

  /* Roof riding: standing on a walkable roof (the apt block, the shop, the annex) under control counts a deed per 12 s up there. */
  const ROOFS = [[-32, -5.5, -16, 6.5, 6.16], [42, -5.5, 58, 6.5, 3.3], [149, -5.5, 165, 6.5, 5.72]];
  let roofSecs = 0;
  scene.onBeforeRenderObservable.add(() => {
    const me = who();
    if (!me) { roofSecs = 0; return; }
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    const up = ROOFS.some((r) => me.x >= r[0] && me.x <= r[2] && me.z >= r[1] && me.z <= r[3] && me.y >= r[4] - 1);
    if (!up) return;
    roofSecs += dt;
    if (roofSecs >= 12) { roofSecs = 0; record("roofRide", zoneOf(me.x, me.z)); }
  });

  /* ---- Visible Storm Tally & Return Hook (HUD + Title) ---- */
  function tally() {
    const sl = day.slice && day.slice.now ? day.slice.now() : null;
    const gd = day.garden && day.garden.now ? day.garden.now() : null;
    const lawn = nowInfo.lawn > 0 || !!(sl && (sl.lawn === "damp" || sl.lawnShown > 0.35));
    const pond = nowInfo.lawn > 0 || !!(sl && sl.pond > 0.85);
    const garden = nowInfo.tomatoes > 0 || !!(gd && (gd.revived || gd.k > 0.5));
    const scorch = nowInfo.scorch || 0;
    const wind = (nowInfo.bin || 0) + (nowInfo.sign || 0) + (nowInfo.chair || 0) + (nowInfo.cone || 0)
      + (nowInfo.planter || 0) + (nowInfo.awning || 0) + (nowInfo.debris || 0);
    const puddle = nowInfo.puddle || 0;
    const d0 = store.days[today()] || { deeds: {} };
    const casts = d0.deeds.power || 0;
    const helped = (d0.deeds.askAnswered || 0) + (nowInfo.tomatoes > 0 ? 1 : 0) + (d0.deeds.rescue || 0);
    const items = [];
    if (lawn) items.push("Park lawn green");
    if (pond) items.push("Pond full");
    if (garden) items.push("Garden revived");
    if (scorch > 0) items.push(`${scorch} ${scorch === 1 ? "scorch" : "scorches"}`);
    if (wind > 0) items.push(`${wind} toppled`);
    if (puddle > 0 && !lawn) items.push(`${puddle} ${puddle === 1 ? "puddle" : "puddles"}`);
    const changed = (lawn ? 1 : 0) + (pond ? 1 : 0) + (garden ? 1 : 0) + scorch + wind + puddle;
    let nextAsk = "";
    try {
      const tmrwKey = dateKey(Date.now(), shift + 1);
      const tmrw = day.daily && day.daily.forDate ? day.daily.forDate(tmrwKey) : null;
      if (tmrw && tmrw.title) nextAsk = tmrw.title;
    } catch (e) { /* daily not up */ }
    const hook = nextAsk
      ? `Holds 3 days · Tomorrow: ${nextAsk}`
      : "City keeps your marks 3 days · New request tomorrow";
    const summary = items.length ? `World changed (${changed}): ${items.slice(0, 4).join(" · ")}` : "";
    return { lawn, pond, garden, scorch, wind, puddle, casts, helped, changed, items, hook, summary };
  }

  let tallyEl = null;
  let tallyItemsEl = null;
  let tallyHookEl = null;
  let tallyBadgeEl = null;
  function buildTallyDom() {
    if (typeof document === "undefined" || !document.body || !document.body.appendChild || document.getElementById("storm-tally")) return;
    const st = document.createElement("style");
    st.textContent = `
.storm-tally{appearance:none;box-sizing:border-box;min-height:44px;min-width:44px;max-width:min(460px,calc(100vw - 24px));padding:6px 14px;border-radius:14px;border:1px solid rgba(240,194,122,.5);background:linear-gradient(180deg,rgba(14,20,30,.88),rgba(8,12,18,.92));box-shadow:0 6px 20px rgba(0,0,0,.45),inset 0 1px 0 rgba(240,194,122,.22);color:#f6f1e8;font:600 .78rem/1.25 Outfit,system-ui,sans-serif;text-align:left;cursor:pointer;display:flex;flex-direction:column;justify-content:center;gap:2px;z-index:11;touch-action:manipulation;transition:transform .15s,border-color .15s}
.storm-tally[hidden]{display:none}
.storm-tally:hover{border-color:rgba(240,194,122,.85)}
.storm-tally:active{transform:scale(.97)}
.storm-tally .st-row{display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.storm-tally .st-kicker{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;background:rgba(44,184,80,.24);border:1px solid rgba(68,214,104,.6);color:#8ef5a8;font:700 .68rem/1.2 Outfit,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;flex-shrink:0}
.storm-tally .st-items{color:#f6f1e8;font-weight:600;overflow:hidden;text-overflow:ellipsis}
.storm-tally .st-hook{color:#f0c27a;font:500 .7rem/1.2 Outfit,system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:700px){.storm-tally{max-width:calc(100vw - 108px);padding:5px 11px}.storm-tally .st-items{font-size:.73rem}.storm-tally .st-hook{font-size:.66rem}}
`;
    document.head.appendChild(st);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "storm-tally";
    btn.className = "storm-tally";
    btn.dataset.hawkesUi = "1";
    btn.hidden = true;
    btn.setAttribute("aria-label", "Storm tally: tap to look at the park lawn and pond");
    btn.innerHTML = `<span class="st-row"><b class="st-kicker" id="storm-tally-badge">World changed</b><span class="st-items" id="storm-tally-items"></span></span><span class="st-hook" id="storm-tally-hook"></span>`;
    let tapAt = 0;
    const onAct = (via) => {
      try {
        if (day.control && day.control.mode && day.control.mode() !== "control" && day.control.take) day.control.take("tally");
        if (day.control && day.control.frame) day.control.frame(0, 33, 1);
      } catch (e) { /* no control */ }
      emit("tally-tap", { via, x: 0, z: 33 });
    };
    btn.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      tapAt = performance.now();
      onAct("touch");
    });
    btn.addEventListener("click", () => { if (performance.now() - tapAt > 800) onAct("click"); });
    document.body.appendChild(btn);
    tallyEl = btn;
    tallyBadgeEl = btn.querySelector("#storm-tally-badge");
    tallyItemsEl = btn.querySelector("#storm-tally-items");
    tallyHookEl = btn.querySelector("#storm-tally-hook");
  }
  function paintTally() {
    if (!tallyEl) buildTallyDom();
    if (!tallyEl) return;
    const tl = tally();
    if (!tl.items.length) {
      tallyEl.hidden = true;
      return;
    }
    tallyBadgeEl.textContent = `Changed · ${tl.changed}`;
    tallyItemsEl.textContent = tl.items.slice(0, 4).join(" · ");
    tallyHookEl.textContent = tl.hook;
    tallyEl.hidden = false;
  }
  window.addEventListener("day:slice", () => paintTally());
  window.addEventListener("day:garden", () => paintTally());
  window.addEventListener("day:power", () => setTimeout(paintTally, 60));
  window.addEventListener("day:control", () => paintTally());
  window.addEventListener("day:daily", () => paintTally());

  const api = {
    today: () => {
      const d = store.days[today()] || { deeds: {}, zones: {}, marks: [] };
      return { date: today(), deeds: Object.assign({}, d.deeds), zones: JSON.parse(JSON.stringify(d.zones)), marks: d.marks.length };
    },
    /** What the storm changed (live marks of the last days, the lawn and pond, the tomatoes): rows { id, n, text } for the title and the toast. */
    /* ONE tally with both shapes (it was two keys, `tally:` and a later `tally,` that replaced it, so `rows` was undefined and
       js/tally.js threw): rows / total / text / date for the title and the toast, items / hook / summary / changed for the card. */
    tally: () => {
      const t = today();
      const rows = tallyOf({ marks: liveMarks(store, t, CAP) }, liveFlag(store, t, parkRain), liveFlag(store, t, birdieRain));
      return Object.assign(tally(), { rows, total: rows.length, text: rows.map((r) => r.text).join(" · "), date: t });
    },
    since: (days) => sinceDays(store, today(), Math.max(1, days || 1)),
    marks: () => liveMarks(store, today(), CAP),
    now: () => Object.assign({}, nowInfo, { shift, total: Object.keys(store.days).reduce((n, k) => n + store.days[k].marks.length, 0), tally: tally() }),
    /** The playtest's clock: today is `n` real days on (kept for the session, so a reload keeps it). Rebuilds the marks. */
    shiftDays(n) {
      factsCache = null;
      shift = Number(n) || 0;
      try { sessionStorage.setItem(SHIFT_KEY, String(shift)); } catch (e) { /* private mode */ }
      apply("shift");
      emit("shift", { days: shift, date: today() });
      return today();
    },
    /** What a page reload does: read the store back from localStorage and rebuild the marks (the playtest can't reload mid-run). */
    reload() { factsCache = null; try { store = parse(localStorage.getItem(KEY)); } catch (e) { store = emptyStore(); } shift = readShift(); apply("reload"); return nowInfo; },
    /** What he remembers: the deeds of today and yesterday as `remembers` names (see factsFrom). Cached until the next deed. */
    facts: () => (factsCache || (factsCache = factsFrom(sinceDays(store, today(), FACT_DAYS)))),
    /** The deeds of this take-over (since Take control), as DEED_ORDER names, most telling first. */
    justDid: () => deedsFrom(session),
    /** The deeds of today, as DEED_ORDER names. */
    todayDeeds: () => { const d = store.days[today()]; return d ? deedsFrom(factsFrom({ deeds: d.deeds, zones: d.zones })) : []; },
    /** How many real days he has been taken out to play with the sky (days with at least one deed, kept for 14): the barks' warmth. */
    skyDays: () => Object.keys(store.days).filter((k) => Object.keys(store.days[k].deeds).length > 0).length,
    /** For the playtest: write a deed as if he had done it (named setup shortcut). */
    note: (kind, zone, power) => { record(kind, zone, power); return api.facts(); },
    /** Neighbor personal arcs (0..3 each). Persists across real days; same-day reload keeps beat-3 marks. */
    arcs: () => Object.assign(emptyArcs(), store.arcs || {}),
    /** Set one neighbour's arc beat (0..3). Emits day:memory action `arc`. */
    setArc(id, beat) {
      if (!store.arcs) store.arcs = emptyArcs();
      if (!(id in store.arcs) && id !== "birdie" && id !== "dex" && id !== "quill") return api.arcs();
      store.arcs[id] = Math.max(0, Math.min(3, beat | 0));
      save();
      emit("arc", { id, beat: store.arcs[id], arcs: api.arcs() });
      return api.arcs();
    },
    /** Tornado wreck that stayed: keep a few solid marks (skip paper/leaf) so scorches aren't flooded out. */
    noteDebris(marks) {
      const keep = (marks || []).filter((m) => m && m.x != null && m.z != null
        && m.kind !== "paper" && m.kind !== "leaf");
      const t = today();
      // at most 4 wreck marks per cast (bins/chairs/signs read clearest)
      keep.slice(0, 4).forEach((m) => {
        const kind = m.kind === "bin" || m.kind === "sign" || m.kind === "chair" || m.kind === "cone"
          || m.kind === "planter" || m.kind === "awning" ? m.kind : "debris";
        addMark(store, t, { at: Date.now(), kind, x: +m.x, z: +m.z, y: m.y, yaw: m.yaw || 0 });
      });
      if (keep.length) {
        prune(store, t);
        save();
        apply("tornado");
        emit("deed", { kind: "tornadoDebris", zone: zoneOf(keep[0].x, keep[0].z), power: "tornado", mark: "debris", count: Math.min(4, keep.length) });
      }
      return Math.min(4, keep.length);
    },
    apply: () => apply("api"),
    reset() { store = emptyStore(); session = {}; factsCache = null; save(); apply("reset"); },
  };
  // keep arcs on the store after reload
  if (!store.arcs) store.arcs = emptyArcs();
  window.addEventListener("day:tornado-debris", (e) => {
    const d = (e && e.detail) || {};
    if (d.marks && d.marks.length) api.noteDebris(d.marks);
  });
  day.memory = api;
  apply("load");
  return api;
}

const live = typeof window !== "undefined" && window.day && window.day.world && window.day.world();
if (live) installMemory(window.day, live);

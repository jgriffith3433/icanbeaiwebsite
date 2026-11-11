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

export function emptyStore() { return { v: 1, days: {} }; }
export function parse(raw) {
  try {
    const s = raw ? JSON.parse(raw) : null;
    return s && s.v === 1 && s.days && typeof s.days === "object" ? s : emptyStore();
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
export const parkRain = (d) => !!((d.zones.park && d.zones.park.rain) || d.deeds.birdieRain);
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
    const tom = liveFlag(store, t, birdieRain);
    try { day.slice && day.slice.setLawn && day.slice.setLawn(lawn > 0 ? "damp" : "straw", lawn || 1, true); } catch (e) { /* slice not up */ }
    try { day.slice && day.slice.setTomatoes && day.slice.setTomatoes(tom); } catch (e) { /* slice not up */ }
    nowInfo = { lawn: +lawn.toFixed(2), tomatoes: +tom.toFixed(2), decals: list.length, quality: low ? "low" : "high", date: t, ...counts };
    emit("apply", Object.assign({ why }, nowInfo));
  }

  /* ---- recording ---- */
  function record(kind, zone, power, mark) {
    const t = today();
    addDeed(store, t, kind, zone, power);
    if (mark) addMark(store, t, Object.assign({ at: Date.now() }, mark));
    prune(store, t);
    save();
    emit("deed", { kind, zone, power, mark: mark ? mark.kind : null });
    if (mark || kind === "birdieRain" || (kind === "power" && power === "rain" && zone === "park")) apply(kind);
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
    if (d.action === "beat-done" && d.kind === "ask") record("askAnswered", undefined, d.id);
    else if (d.action === "beat-missed") record("askBotched", undefined, d.id);
    else if (d.action === "reward" && d.id === "birdie") record("birdieRain", "park", "rain");
    else if (d.action === "reward") record("neighborReward", undefined, d.id);
  });
  window.addEventListener("day:episode", (e) => {
    const d = e.detail || {};
    if (["score", "ending", "arc"].includes(d.action)) record("episode-" + d.action, undefined, d.id);
  });
  window.addEventListener("day:story", (e) => {
    const d = e.detail || {};
    if (d.action === "kick") record("scar", undefined, d.id || d.kick);
    else if (d.action === "help" || d.action === "twist") record("rescue", undefined, d.piece || d.action);
    else if (d.action === "hurt") record("scar", undefined, d.piece);
  });
  window.addEventListener("day:quality", () => apply("quality"));

  const api = {
    today: () => {
      const d = store.days[today()] || { deeds: {}, zones: {}, marks: [] };
      return { date: today(), deeds: Object.assign({}, d.deeds), zones: JSON.parse(JSON.stringify(d.zones)), marks: d.marks.length };
    },
    since: (days) => sinceDays(store, today(), Math.max(1, days || 1)),
    marks: () => liveMarks(store, today(), CAP),
    now: () => Object.assign({}, nowInfo, { shift, total: Object.keys(store.days).reduce((n, k) => n + store.days[k].marks.length, 0) }),
    /** The playtest's clock: today is `n` real days on (kept for the session, so a reload keeps it). Rebuilds the marks. */
    shiftDays(n) {
      shift = Number(n) || 0;
      try { sessionStorage.setItem(SHIFT_KEY, String(shift)); } catch (e) { /* private mode */ }
      apply("shift");
      emit("shift", { days: shift, date: today() });
      return today();
    },
    /** What a page reload does: read the store back from localStorage and rebuild the marks (the playtest can't reload mid-run). */
    reload() { try { store = parse(localStorage.getItem(KEY)); } catch (e) { store = emptyStore(); } shift = readShift(); apply("reload"); return nowInfo; },
    apply: () => apply("api"),
    reset() { store = emptyStore(); save(); apply("reset"); },
  };
  day.memory = api;
  apply("load");
  return api;
}

const live = typeof window !== "undefined" && window.day && window.day.world && window.day.world();
if (live) installMemory(window.day, live);

/* ==========================================================================
   Street barks: a named neighbour says one short voiced line when Small Weather passes them or casts near them
   (config `neighbors.barks`). Event-driven (day:neighbor look / react, no polling). Lines are existing dialogue clips,
   spoken through day.voice.speakAs (positional, captioned, the music ducks under it). A line is never used again
   within `repeat` s; an empty pool stays quiet. day.npcbarks: now(), log(), pick(...).
   ========================================================================== */

/** Pure: choose a line from `pool` not used in the last `repeat` s (lastUsed: text -> seconds). Cycles from the least recent. */
export function pickBark(pool, lastUsed, now, repeat, rnd) {
  const free = (pool || []).filter((t) => now - (lastUsed[t] == null ? -1e9 : lastUsed[t]) >= repeat);
  if (!free.length) return null;
  return free[Math.floor((rnd ? rnd() : Math.random()) * free.length) % free.length];
}

/** Pure: the most uses of one line inside any window of `win` s, minus one summed: pairs of same line closer than win. */
export function repeatsWithin(log, win) {
  let n = 0;
  const by = {};
  log.forEach((b) => { (by[b.text] = by[b.text] || []).push(b.t); });
  Object.keys(by).forEach((k) => { const a = by[k]; for (let i = 1; i < a.length; i++) if (a[i] - a[i - 1] < win) n++; });
  return n;
}

const KIND = { bolt: "bolt", lightning: "bolt", storm: "bolt", rain: "rain", sun: "sun", sunbreak: "sun", fog: "fog", gust: "wind", gale: "wind", tornado: "wind", wind: "wind" };

export function startBarks(dayApi) {
  const day = dayApi || (typeof window !== "undefined" && window.day);
  if (!day || day.npcbarks) return day && day.npcbarks;
  const C = (window.DAY_CONFIG && window.DAY_CONFIG.neighbors) || {};
  const B = C.barks;
  if (!B) return null;
  const nowS = () => performance.now() / 1000;
  const lastUsed = {};
  const lastPerson = {};
  const log = [];
  let lastAt = -1e9;
  const timers = new Set();

  const blocked = () => {
    if (day.coldopen && day.coldopen.active && day.coldopen.active()) return true;
    const n = day.now && day.now();
    if (n && (n.mode === "pause" || n.speed > 10)) return true;
    const V = day.voice && day.voice.now && day.voice.now();
    // never talk over another line (a neighbour's ask, a story line, his own); our own bark may be replaced by a cast bark
    if (V && V.playing && V.last && V.last.via !== "bark") return true;
    return false;
  };

  function bark(id, kind, pool, cast, x, z) {
    const t = nowS();
    if (!pool || !pool.length || blocked()) return null;
    if (!cast && t - (lastPerson[id] || -1e9) < B.person) return null;
    if (t - lastAt < (cast ? Math.min(B.gap, 1.5) : B.gap)) return null;
    const text = pickBark(pool, lastUsed, t, B.repeat);
    const V = day.voice;
    if (!text || !V || !V.speakAs) return null;
    const who = FIRST[id] || id;
    lastUsed[text] = t;
    lastAt = t;
    lastPerson[id] = t;
    V.speakAs(who, text, { x, z, via: "bark" });
    const row = { t, id, who, text, kind: cast ? "cast" : "pass" };
    log.push(row);
    window.dispatchEvent(new window.CustomEvent("day:npcbark", { detail: row }));
    return row;
  }

  const FIRST = { birdie: "Birdie", dex: "Dex", quill: "Ines" };
  const later = (fn) => { const h = setTimeout(() => { timers.delete(h); fn(); }, (B.delay || 0.6) * 1000); timers.add(h); };

  window.addEventListener("day:neighbor", (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "look" && B.pass[d.id]) later(() => bark(d.id, "pass", B.pass[d.id], false, d.x, d.z));
    else if (d.action === "react") {
      const k = KIND[d.power];
      const pool = k && B.cast[d.id] && B.cast[d.id][k];
      if (pool) bark(d.id, k, pool, true, d.x, d.z);
    }
  });

  const api = {
    log: () => log.slice(),
    now: () => ({ heard: log.length, repeats180: repeatsWithin(log, B.repeat), last: log[log.length - 1] || null }),
  };
  day.npcbarks = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) startBarks(window.day);

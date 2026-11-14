/* Placement: every neighbour stop and every step of a walk between stops stays out of building footprints.
   Pure (no Babylon), shared by js/neighbors.js (fixes the routes when the city is built), scripts/check-placement.mjs
   and the `placement-audit` playtest. Solids are { x, z, w, d, yaw?, ... } like world.solids (see js/npc-spots.js). */
import { inSolid } from "./npc-spots.js";

export const BODY = 0.35; // a neighbour's body radius against a footprint
const CELL = 0.5;
const SEARCH = 14; // how far (m) a route may swing around a building

const free = (solids, x, z) => !inSolid(solids, x, z, BODY);

/** Nearest open point to (x, z) (a door or the pavement in front of it): rings out to 20 m. */
export function nearestFree(solids, x, z) {
  if (free(solids, x, z)) return [x, z];
  for (let r = CELL; r <= 20; r += CELL) {
    let best = null;
    const n = Math.max(8, Math.round((2 * Math.PI * r) / CELL));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (free(solids, px, pz)) { best = [px, pz]; break; }
    }
    if (best) return best;
  }
  return [x, z];
}

function clear(solids, a, b) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(d / 0.25));
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    if (!free(solids, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)) return false;
  }
  return true;
}

/** Waypoints (without a and b) that walk a -> b around buildings; [] when the straight line is open. */
export function routeAround(solids, a, b) {
  if (clear(solids, a, b)) return [];
  const x0 = Math.min(a[0], b[0]) - SEARCH;
  const z0 = Math.min(a[1], b[1]) - SEARCH;
  const W = Math.ceil((Math.abs(a[0] - b[0]) + 2 * SEARCH) / CELL);
  const H = Math.ceil((Math.abs(a[1] - b[1]) + 2 * SEARCH) / CELL);
  const at = (i, j) => [x0 + i * CELL, z0 + j * CELL];
  const cellOf = (p) => [Math.round((p[0] - x0) / CELL), Math.round((p[1] - z0) / CELL)];
  const blocked = new Map();
  const isBlocked = (i, j) => {
    const k = j * W + i;
    let v = blocked.get(k);
    if (v === undefined) { const p = at(i, j); v = !free(solids, p[0], p[1]); blocked.set(k, v); }
    return v;
  };
  const s = cellOf(a);
  const g = cellOf(b);
  const open = [{ i: s[0], j: s[1], g: 0, f: 0 }];
  const best = new Map([[s[1] * W + s[0], 0]]);
  const from = new Map();
  let end = null;
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
    const c = open.splice(bi, 1)[0];
    if (c.i === g[0] && c.j === g[1]) { end = c; break; }
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const i = c.i + di;
      const j = c.j + dj;
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const goal = i === g[0] && j === g[1];
      if (!goal && isBlocked(i, j)) continue;
      if (di && dj && (isBlocked(c.i + di, c.j) || isBlocked(c.i, c.j + dj))) continue;
      const ng = c.g + (di && dj ? 1.414 : 1);
      const key = j * W + i;
      if (best.has(key) && best.get(key) <= ng) continue;
      best.set(key, ng);
      from.set(key, c.j * W + c.i);
      open.push({ i, j, g: ng, f: ng + Math.hypot(g[0] - i, g[1] - j) });
    }
  }
  if (!end) return [];
  const cells = [];
  let k = end.j * W + end.i;
  while (k !== undefined) { cells.push(at(k % W, Math.floor(k / W))); k = from.get(k); }
  cells.reverse();
  cells[0] = a;
  cells[cells.length - 1] = b;
  // string-pull: keep a corner only when the line past it is shut
  const out = [];
  let anchor = a;
  for (let i = 1; i < cells.length - 1; i++) {
    if (!clear(solids, anchor, cells[i + 1])) { out.push(cells[i]); anchor = cells[i]; }
  }
  return out;
}

/** Stops with every standing point moved to open ground, and a `via` list on each segment that would cross a building.
    Returns { stops, moved: [{ index, from, to }], detours: [{ index, via }] }; the stops array is a copy. */
export function fixStops(stops, solids) {
  const moved = [];
  const detours = [];
  const out = stops.map((s, index) => {
    const p = nearestFree(solids, s[1], s[2]);
    if (p[0] !== s[1] || p[1] !== s[2]) moved.push({ index, from: [s[1], s[2]], to: p });
    const c = s.slice();
    c[1] = p[0];
    c[2] = p[1];
    return c;
  });
  out.forEach((s, index) => {
    const n = out[(index + 1) % out.length];
    const via = routeAround(solids, [s[1], s[2]], [n[1], n[2]]);
    s.via = via;
    if (via.length) detours.push({ index, via });
  });
  return { stops: out, moved, detours };
}

/** Walk length of a segment through its via points. */
export const segLength = (a, b) => {
  let d = 0;
  let p = [a[1], a[2]];
  for (const v of a.via || []) { d += Math.hypot(v[0] - p[0], v[1] - p[1]); p = v; }
  return d + Math.hypot(b[1] - p[0], b[2] - p[1]);
};

/** Point a fraction f (0..1) along a -> b through a.via; { x, z, yaw }. */
export function along(a, b, f) {
  const pts = [[a[1], a[2]], ...(a.via || []), [b[1], b[2]]];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let want = total * f;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (want <= L || i === pts.length - 1) {
      const k = L > 0 ? Math.min(1, want / L) : 1;
      return {
        x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k,
        z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k,
        yaw: Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]),
      };
    }
    want -= L;
  }
  return { x: b[1], z: b[2], yaw: 0 };
}

/** Scrub `from`..`to` hours every `stepMin` minutes; list each neighbour that is drawn inside a footprint or more than
    `tol` m off the ground. `read(p, h)` returns { x, z, y, inside } for the neighbour at hour h (y = drawn feet height);
    `groundAt(x, z)` the surface under it. */
export function auditPlacement(people, read, solids, groundAt, { from = 6, to = 23, stepMin = 5, tol = 0.1 } = {}) {
  const failures = [];
  let samples = 0;
  let worstOff = 0;
  const seen = new Set();
  for (let m = from * 60; m <= to * 60; m += stepMin) {
    const h = m / 60;
    for (const p of people) {
      const r = read(p, h);
      if (!r || r.inside) continue;
      samples++;
      const hit = inSolid(solids, r.x, r.z, 0.2);
      const real = Math.abs((r.y == null ? groundAt(r.x, r.z) : r.y) - groundAt(r.x, r.z));
      worstOff = Math.max(worstOff, real);
      const hh = `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
      if (hit) {
        const k = `${p.id}:in:${hit.x},${hit.z}`;
        if (!seen.has(k)) { seen.add(k); failures.push(`${p.id} is inside a footprint at ${r.x.toFixed(1)},${r.z.toFixed(1)} (${hh}; solid ${hit.x.toFixed(1)},${hit.z.toFixed(1)} ${hit.w.toFixed(1)}x${hit.d.toFixed(1)})`); }
      }
      if (real > tol) {
        const k = `${p.id}:y`;
        if (!seen.has(k)) { seen.add(k); failures.push(`${p.id} is ${real.toFixed(2)} m off the ground at ${r.x.toFixed(1)},${r.z.toFixed(1)} (${hh})`); }
      }
    }
  }
  return { failures, samples, worstOff };
}

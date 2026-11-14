/* The pavement graph: where a neighbour may walk between stops. Pure (no Babylon), used by js/neighbors.js (routes),
   scripts/check-placement.mjs and the `placement-audit` playtest.
   Lines run along every avenue and cross street at `side` m from the road's centre (the same 2.6 m the crowd's corner
   nodes use, on the sidewalk); they meet at the junction corners, and the segment between two corners of one junction
   is its crosswalk. A route is: stop -> nearest pavement point, along the lines (A*), pavement point -> stop. The two
   short legs are routed round footprints (js/placement.js `routeAround`), and the park's lawn is passed in as a solid
   so no leg crosses its edge. Never a straight line through a lawn or a house. */
import { routeAround } from "./placement.js";

export const SIDE = 2.6;

/** The graph from `city` ({ avenues, crosses }) and the main street ({ z, from, to }). { nodes: [{x,z,edges:[{to,len}]}], lines } */
export function buildPavement(city, street, side = SIDE) {
  const avs = [];
  const seen = new Set();
  [street ? { z: street.z, from: street.from, to: street.to } : null].concat(city.avenues || []).forEach((a) => {
    if (a && !seen.has(a.z)) { seen.add(a.z); avs.push(a); }
  });
  const crs = city.crosses || [];
  const lines = []; // { axis: "x" (runs along x, fixed z) | "z", c, from, to, nodes: [] }
  avs.forEach((a) => [-1, 1].forEach((s) => lines.push({ axis: "x", c: a.z + s * side, from: a.from, to: a.to, nodes: [] })));
  crs.forEach((c) => [-1, 1].forEach((s) => lines.push({ axis: "z", c: c.x + s * side, from: c.from, to: c.to, nodes: [] })));
  const nodes = [];
  const key = (x, z) => `${x.toFixed(2)},${z.toFixed(2)}`;
  const byKey = new Map();
  const node = (x, z) => {
    const k = key(x, z);
    let n = byKey.get(k);
    if (!n) { n = { id: nodes.length, x, z, edges: [] }; byKey.set(k, n); nodes.push(n); }
    return n;
  };
  const hor = lines.filter((l) => l.axis === "x");
  const ver = lines.filter((l) => l.axis === "z");
  hor.forEach((h) => ver.forEach((v) => {
    if (v.c < h.from || v.c > h.to || h.c < v.from || h.c > v.to) return;
    const n = node(v.c, h.c);
    h.nodes.push(n);
    v.nodes.push(n);
  }));
  hor.forEach((h) => { h.nodes.push(node(h.from, h.c), node(h.to, h.c)); });
  ver.forEach((v) => { v.nodes.push(node(v.c, v.from), node(v.c, v.to)); });
  const link = (a, b) => {
    if (a === b) return;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (a.edges.some((e) => e.to === b)) return;
    a.edges.push({ to: b, len });
    b.edges.push({ to: a, len });
  };
  lines.forEach((l) => {
    const pts = [...new Set(l.nodes)].sort((p, q) => (l.axis === "x" ? p.x - q.x : p.z - q.z));
    for (let i = 1; i < pts.length; i++) link(pts[i - 1], pts[i]);
  });
  return { nodes, lines, side };
}

/** Nearest point on the graph's edges to (x, z): { x, z, a, b } (the edge's two nodes), or null. */
export function snap(g, x, z) {
  let best = null;
  for (const a of g.nodes) {
    for (const e of a.edges) {
      const b = e.to;
      if (b.id < a.id) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const L2 = dx * dx + dz * dz || 1;
      const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const d = Math.hypot(px - x, pz - z);
      if (!best || d < best.d) best = { x: px, z: pz, a, b, d };
    }
  }
  return best;
}

/** Shortest walk over the pavement between two snapped points: the corner list between them (the snapped points included). */
export function walk(g, s, e) {
  const A = { id: -1, x: s.x, z: s.z, edges: [{ to: s.a, len: Math.hypot(s.a.x - s.x, s.a.z - s.z) }, { to: s.b, len: Math.hypot(s.b.x - s.x, s.b.z - s.z) }] };
  const goal = { id: -2, x: e.x, z: e.z, edges: [] };
  // both ends on one edge: straight along it
  if ((s.a === e.a && s.b === e.b) || (s.a === e.b && s.b === e.a)) return [[s.x, s.z], [e.x, e.z]];
  const endLen = (n) => Math.hypot(n.x - e.x, n.z - e.z);
  const dist = new Map([[A, 0]]);
  const from = new Map();
  const open = [A];
  const done = new Set();
  const h = (n) => Math.hypot(n.x - e.x, n.z - e.z);
  const cost = new Map([[A, h(A)]]);
  let found = false;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (cost.get(open[i]) < cost.get(open[bi])) bi = i;
    const c = open.splice(bi, 1)[0];
    if (c === goal) { found = true; break; }
    if (done.has(c)) continue;
    done.add(c);
    const out = c.edges.slice();
    if (c === e.a || c === e.b) out.push({ to: goal, len: endLen(c) });
    for (const ed of out) {
      const nd = dist.get(c) + ed.len;
      if (dist.has(ed.to) && dist.get(ed.to) <= nd) continue;
      dist.set(ed.to, nd);
      from.set(ed.to, c);
      cost.set(ed.to, nd + (ed.to === goal ? 0 : h(ed.to)));
      open.push(ed.to);
    }
  }
  if (!found) return null;
  const pts = [];
  for (let n = goal; n; n = from.get(n)) pts.push([n.x, n.z]);
  return pts.reverse();
}

/** A router for js/placement.js `fixStops`: (a, b) -> the `via` corners from stop a to stop b (without the stops). */
export function makeRouter(city, street, solids) {
  const g = buildPavement(city, street);
  const memo = new Map();
  const snapped = (x, z) => {
    const k = key2(x, z);
    if (!memo.has(k)) memo.set(k, snap(g, x, z));
    return memo.get(k);
  };
  const router = (a, b) => {
    const s = snapped(a[0], a[1]);
    const e = snapped(b[0], b[1]);
    if (!s || !e) return routeAround(solids, a, b);
    const mid = walk(g, s, e);
    if (!mid) return routeAround(solids, a, b);
    const pts = [a, ...mid, b];
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      // each leg round any footprint or lawn in the way (the first and last legs leave and join the pavement)
      const via = routeAround(solids, pts[i - 1], pts[i]);
      via.forEach((v) => out.push(v));
      if (i < pts.length - 1) out.push(pts[i]);
    }
    // drop corners that are the stop itself
    return out.filter((p, i) => Math.hypot(p[0] - (i ? out[i - 1][0] : a[0]), p[1] - (i ? out[i - 1][1] : a[1])) > 0.05);
  };
  router.graph = g;
  return router;
}
const key2 = (x, z) => `${x.toFixed(3)},${z.toFixed(3)}`;

/** Distance from (x, z) to the nearest pavement line point (for the audit: a walker is on the pavement or a short leg off it). */
export function offPavement(g, x, z) {
  const s = snap(g, x, z);
  return s ? s.d : Infinity;
}

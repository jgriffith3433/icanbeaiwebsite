// Placement audit: every neighbour stop and every minute of every walk, 06:00 to 23:00, stays out of building
// footprints and on the ground (no browser). Builds the world and city under the NullEngine like check-npc-spots,
// fixes the routes the way js/neighbors.js does (js/placement.js) and fails naming any neighbour inside a footprint or
// more than 0.1 m off the ground. Also proves the fixer: a stop planted in a building moves to open ground.
import * as core from '@babylonjs/core';
import { fixStops, nearestFree, auditPlacement } from '../js/placement.js';
import { makeRouter, buildPavement, offPavement } from '../js/pavement.js';
import { lawnSolids } from '../js/neighbors.js';
import { placeAt } from '../js/neighbors.js';
import { inSolid } from '../js/npc-spots.js';

class Engine extends core.NullEngine {
  constructor() {
    super({ renderHeight: 360, renderWidth: 640, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 1 });
    this.getCaps().instancedArrays = true;
  }
}
core.Logger.LogLevels = core.Logger.NoneLogLevel;
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) });
const document = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0, style: {} }) };
const events = { addEventListener() {}, removeEventListener() {} };
Object.assign(globalThis, { window: globalThis, BABYLON: { ...core, Engine }, document, devicePixelRatio: 1, ...events });
const origWarn = console.warn;
const origLog = console.log;
console.warn = () => {};
console.log = (...a) => { if (!/^BJS/.test(String(a[0]))) origLog(...a); };
const root = new URL('../', import.meta.url);
for (const f of ['day.config.js', 'js/schedule.js', 'js/world.js']) await import(new URL(f, root).href);
const cfg = globalThis.DAY_CONFIG;
const day = globalThis.DayEngine.build(cfg, '2026-10-19');
const world = globalThis.DayWorld.create({ ...events, removeAttribute() {}, setAttribute() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) }, cfg, day.spots, day.rooms);
const { installLook } = await import(new URL('js/look.js', root).href);
installLook(world);
const { installCityscape } = await import(new URL('js/cityscape.js', root).href);
installCityscape(world);
console.warn = origWarn;
console.log = origLog;

const fails = [];
// the routes are the pavement graph's (js/pavement.js); the lawn counts as a footprint, so no walk crosses its edge
const lawn = lawnSolids(cfg.city);
const solids = world.solids.concat(lawn);
const router = makeRouter(cfg.city, cfg.street, solids);
const people = (cfg.neighbors.list || []).map((p) => ({ id: p.id, stops: fixStops(p.stops, solids, router).stops }));
const rep = auditPlacement(people, (p, h) => { const pl = placeAt(p.stops, h); return { x: pl.x, z: pl.z, inside: pl.inside, y: world.surfaceAt(pl.x, pl.z) }; }, solids, (x, z) => world.surfaceAt(x, z));
fails.push(...rep.failures);
// walks stay on the pavement: while moving, a walker is within 1.5 m of a sidewalk line (kerb props and trees swing a walk a metre) or crosswalk, except on the short
// legs that leave a stop and join the pavement (the first and last 12 m of a walk)
const g = router.graph;
let walked = 0;
let worstOff = 0;
for (const p of people) {
  for (let m = 0; m < 1440; m += 0.25) {
    const h = m / 60;
    const pl = placeAt(p.stops, h);
    if (!pl.moving) continue;
    walked++;
    const off = offPavement(g, pl.x, pl.z);
    // distance to either end of this walk
    const ends = p.stops.map((s) => Math.hypot(s[1] - pl.x, s[2] - pl.z));
    if (off > 1.5 && Math.min(...ends) > 12) { worstOff = Math.max(worstOff, off); fails.push(`${p.id} walks ${off.toFixed(1)} m off the pavement at ${pl.x.toFixed(1)},${pl.z.toFixed(1)} (${h.toFixed(2)} h)`); break; }
  }
}
for (const p of people) {
  const at = [8, 12, 18].map((h) => placeAt(p.stops, h).stop);
  if (new Set(at).size !== 3) fails.push(`${p.id} is at stops ${at.join(', ')} at 08:00, 12:00, 18:00 (wanted three different)`);
}
if (!buildPavement(cfg.city, cfg.street).nodes.length) fails.push('the pavement graph is empty');

// the fixer: a stop planted inside a building comes out on open ground, and its walk goes round
const block = world.solids.filter((s) => s.w > 8 && s.d > 8 && !s.roll)[0];
const bad = fixStops([[0, 0, 5], [12, block.x, block.z], [20, 0, 5]], world.solids);
if (inSolid(world.solids, bad.stops[1][1], bad.stops[1][2], 0.35)) fails.push('a stop planted in a building was not moved to open ground');
if (!bad.moved.length) fails.push('the fixer did not report moving the planted stop');
const open = nearestFree(world.solids, block.x, block.z);
if (inSolid(world.solids, open[0], open[1], 0.35)) fails.push('nearestFree returned a point inside a footprint');

if (fails.length) {
  console.error(`check-placement: ${fails.length} failure(s)\n - ` + fails.join('\n - '));
  process.exit(1);
}
console.log(`check-placement: ok (${people.length} neighbours, ${rep.samples} samples 06:00-23:00, none in a footprint or on the lawn, ${walked} walking samples on the pavement, three different stops at 08/12/18, worst ground offset ${rep.worstOff.toFixed(3)} m)`);

// Placement audit: every neighbour stop and every minute of every walk, 06:00 to 23:00, stays out of building
// footprints and on the ground (no browser). Builds the world and city under the NullEngine like check-npc-spots,
// fixes the routes the way js/neighbors.js does (js/placement.js) and fails naming any neighbour inside a footprint or
// more than 0.1 m off the ground. Also proves the fixer: a stop planted in a building moves to open ground.
import * as core from '@babylonjs/core';
import { fixStops, nearestFree, auditPlacement } from '../js/placement.js';
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
const people = (cfg.neighbors.list || []).map((p) => ({ id: p.id, stops: fixStops(p.stops, world.solids).stops }));
const rep = auditPlacement(people, (p, h) => { const pl = placeAt(p.stops, h); return { x: pl.x, z: pl.z, inside: pl.inside, y: world.surfaceAt(pl.x, pl.z) }; }, world.solids, (x, z) => world.surfaceAt(x, z));
fails.push(...rep.failures);

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
console.log(`check-placement: ok (${people.length} neighbours, ${rep.samples} samples 06:00-23:00, none in a footprint, worst ground offset ${rep.worstOff.toFixed(3)} m)`);

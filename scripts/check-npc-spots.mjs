// NPC spots: every talkable NPC's standing position against the building colliders (no browser).
//
//   node scripts/check-npc-spots.mjs        (part of npm test; DEBUG=1 lists every spot)
//
// Builds the world and the city under the NullEngine, collects each place an NPC stands (neighbors' stops, the daily
// citizens, the people of every rescue episode piece) and fails when a spot is inside a solid (a block, a filler
// building, a stair hut, a prop collider) with a 0.4 m body, or when fewer than 3 of 8 points on a 1.6 m ring around it
// are open ground (no approach to talk from). `npcSpots(solids, cfg)` is shared with the `npc-spots` playtest.
import * as core from '@babylonjs/core';
import { collectNpcSpots, auditNpcSpots } from '../js/npc-spots.js';

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

const spots = collectNpcSpots(cfg);
const report = auditNpcSpots(spots, world.solids, cfg);
if (process.env.DEBUG) report.rows.forEach((r) => console.log(JSON.stringify(r)));
if (report.failures.length) {
  console.error(`check-npc-spots: ${report.failures.length} failure(s)\n - ` + report.failures.join('\n - '));
  process.exit(1);
}
console.log(`check-npc-spots: ok (${spots.length} spots, none in a building collider, each with open ground to talk from)`);

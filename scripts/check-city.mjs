// City audit, without a GPU: builds the world and the city under Babylon's NullEngine and audits every prop and surface
// from js/props.js and js/cityscape.js:
//   - floating / sunk: each prop (a cluster of touching boxes in a props-* mesh) has its lowest point compared with a ray
//     down to the roof or ground below it; more than 2 cm either way fails (wall-mounted things are exempt),
//   - coplanar: two axis-aligned faces facing the same way in the same plane (within 3 mm) that overlap, in the props and
//     the facades (roof tops vs parapets, markings, plazas, panels), and duplicate faces inside one mesh,
//   - inside-out or zero normals: any prop-mesh vertex whose normal is zero or against its winding,
//   - walkable roofs: no prop other than the two AC units may stand in the AC colliders, and every collider matches its
//     unit (1.5 x 0.9 x 1.1).
//
//   node scripts/check-city.mjs            (part of npm test)
//   DEBUG=1 node scripts/check-city.mjs    lists every failure with its position; `window.cityAudit()` is the same run in the page
import * as core from '@babylonjs/core';
import { runCityAudit } from '../js/city-audit.js';

const B = core;
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
world.update(globalThis.DayEngine.frame(day, 12 * 60), 0.016, { snap: true });
world.scene.render();
console.warn = origWarn;
console.log = origLog;

const report = runCityAudit(world.scene, B, cfg, { solids: world.solids, debug: !!process.env.DEBUG });
if (process.env.DEBUG) report.details.forEach((d) => console.log(d));
if (report.failures.length) {
  console.error(`check-city: ${report.failures.length} failure(s)\n - ` + report.failures.slice(0, 40).join('\n - '));
  process.exit(1);
}
console.log(`check-city: ok (${report.counts.props} props on ${report.counts.surfaces} surfaces: none floating or sunk, ${report.counts.faces} faces without coplanar overlap, normals outward, ${report.counts.units} roof units match their colliders, ${report.counts.poles} lamp poles on the ground)`);

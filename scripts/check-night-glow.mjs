// Night glow under NullEngine: window schedules (dusk on, bedtime off), interior rooms,
// dynamic lamp caps (8 high / 4 low), and cityscape.info() fields the playtest reads.
//   node scripts/check-night-glow.mjs   (part of npm test)
import * as core from "@babylonjs/core";

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
const root = new URL("../", import.meta.url);
for (const f of ["day.config.js", "js/schedule.js", "js/world.js"]) await import(new URL(f, root).href);
const cfg = globalThis.DAY_CONFIG;
const day = globalThis.DayEngine.build(cfg, "2026-10-19");
const world = globalThis.DayWorld.create({ ...events, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) }, cfg, day.spots, day.rooms);
const { installLook } = await import(new URL("js/look.js", root).href);
installLook(world);
const { installCityscape } = await import(new URL("js/cityscape.js", root).href);
const api = installCityscape(world);
world.update(globalThis.DayEngine.frame(day, 22 * 60), 0.016, { snap: true });
world.scene.render();
console.warn = origWarn;
console.log = origLog;

const fails = [];
if (!api || !api.paintWindows) fails.push("cityscape.paintWindows missing");
else {
  const at17 = api.paintWindows(17);
  const at18 = api.paintWindows(18);
  const at20 = api.paintWindows(20);
  const at01 = api.paintWindows(1);
  if (!(at18.on > at17.on)) fails.push(`windows did not rise at dusk (${at17.on} → ${at18.on})`);
  if (!(at20.on > at18.on)) fails.push(`windows did not keep rising 18:00→20:00 (${at18.on} → ${at20.on})`);
  if (!(at01.on <= at20.on * 0.55)) fails.push(`bedtime off failed (${at01.on} still on vs ${at20.on})`);
  if (!(at20.rooms > 0)) fails.push("no interior-mapped rooms");
}
const info = api.info();
if (!(info.windows && typeof info.windows.on === "number")) fails.push("info().windows missing");
if (!(info.dynamicLights && info.dynamicLights.max === 8)) fails.push("dynamicLights.max should be 8");
if (!(info.lamps > 10)) fails.push(`too few lamps (${info.lamps})`);
if (!(info.props && info.props.signs >= 4)) fails.push(`fewer than 4 neon signs (${info.props && info.props.signs})`);
// low quality cap
if (world.look && world.look.quality) {
  const prev = world.look.quality();
  world.look.quality("low");
  const low = api.info().dynamicLights.cap;
  if (low > 4) fails.push(`low quality dynamic light cap ${low} > 4`);
  world.look.quality(prev);
}

if (fails.length) {
  console.error("check-night-glow FAILED:\n - " + fails.join("\n - "));
  process.exit(1);
}
console.log(`check-night-glow: ok (windows dusk→night→late via paintWindows; ${info.lamps} lamps; ${info.props.signs} neon; dyn max ${info.dynamicLights.max}; interior ${info.windows.interior})`);

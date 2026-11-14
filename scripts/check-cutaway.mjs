// The cutaway camera never flashes a partition wall across the view while it glides to a new room (the playtest's
// "camera inside geometry" finding in smoke: a dark slab filled the bedroom's corner after the clock jumped there).
//
// For each room of the home: settle the automatic camera on it and note which interior walls it hides. Then jump the
// clock to that room from every other room of the home and step the camera frame by frame (a simulated clock, so the
// wall's 0.7 s hold runs as it does on a page): a wall that is hidden once the camera has settled must never be drawn
// (visibility over 0.5) on the way.
//
//   node scripts/check-cutaway.mjs   (part of npm test)
import * as core from '@babylonjs/core';

class Engine extends core.NullEngine {
  constructor() {
    super({ renderHeight: 360, renderWidth: 640, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 1 });
  }
}
core.Logger.LogLevels = core.Logger.NoneLogLevel;
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) });
const document = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0, style: {} }) };
const events = { addEventListener() {}, removeEventListener() {} };
Object.assign(globalThis, { window: globalThis, BABYLON: { ...core, Engine }, document, devicePixelRatio: 1, ...events });
let fake = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => fake }, configurable: true });
const origWarn = console.warn;
const origLog = console.log;
console.warn = () => {};
console.log = (...a) => { if (!/^BJS/.test(String(a[0]))) origLog(...a); };
const root = new URL('../', import.meta.url);
for (const f of ['day.config.js', 'js/schedule.js', 'js/world.js']) await import(new URL(f, root).href);
const cfg = globalThis.DAY_CONFIG;
const day = globalThis.DayEngine.build(cfg, '2026-10-19');
const world = globalThis.DayWorld.create({ ...events, removeAttribute() {}, setAttribute() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) }, cfg, day.spots, day.rooms);
console.warn = origWarn;

const F = (m) => globalThis.DayEngine.frame(day, m);
const walls = world.scene.meshes.filter((m) => /^home-(left|right|wall\d+|crownL|crownR)$/.test(m.name));
const problems = [];
if (walls.length < 5) problems.push(`only ${walls.length} interior wall meshes found in the home`);

// a minute when he is standing in each room of the home (not walking, and still there a minute on), and the clock
// is held there: the camera's shot is then the room's own
const at = new Map();
for (let m = 0; m < 1440; m += 1) {
  const f = F(m);
  const b = cfg.rooms[f.room] && cfg.rooms[f.room].building;
  if (b !== 'home' || at.has(f.room) || f.person.walking || f.person.inCar) continue;
  const g = F(m + 1);
  if (g.room === f.room && !g.person.walking) at.set(f.room, m);
}
if (at.size < 3) problems.push(`the day has him standing in only ${at.size} rooms of the home`);

const step = (minute, snap) => {
  fake += 16;
  world.update(F(minute), 0.016, snap ? { snap: true } : {});
};
const settle = (minute) => {
  fake += 5000;
  step(minute, true);
  for (let i = 0; i < 400; i++) step(minute);
};

let jumps = 0;
for (const [to, toMin] of at) {
  settle(toMin);
  const hidden = walls.filter((m) => m.visibility < 0.5);
  for (const [from, fromMin] of at) {
    if (from === to) continue;
    settle(fromMin);
    fake += 3000; // the clock jump is its own moment, after a pause
    const flashed = new Map();
    for (let i = 0; i < 400; i++) {
      step(toMin);
      for (const m of hidden) if (m.visibility > 0.5 && !flashed.has(m.name)) flashed.set(m.name, i);
    }
    jumps++;
    if (flashed.size) problems.push(`jumping ${from} -> ${to}: ${[...flashed].map(([n, i]) => `${n} drawn solid at frame ${i}`).join(', ')} (hidden once settled)`);
  }
}
if (problems.length) {
  console.error('cutaway camera check FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`ok: ${jumps} room-to-room jumps across ${at.size} rooms of the home, no partition wall flashed on the way (${walls.length} walls)`);
process.exit(0);

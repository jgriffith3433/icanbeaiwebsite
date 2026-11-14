// The render pipeline's grades (js/render-pipeline.js), without a GPU: the LUT parameters are authored in code, so the
// maths can be checked in Node. Four hours must grade four different ways, the weather overlays must drain or lift the
// warmth, the hour blend must be continuous across the day, and the module installs on the world under NullEngine.
//
//   node scripts/check-render-pipeline.mjs   (part of npm test)
import * as core from '@babylonjs/core';

const problems = [];
const ok = (c, m) => (c ? true : (problems.push(m), false));
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
const R = await import(new URL('js/render-pipeline.js', root).href);

const SR = 7.083;
const SS = 18.416;
const at = (h, ow) => R.blendGrade(R.timeWeights(h, SR, SS), ow || null);
const swatches = [[0.5, 0.5, 0.5], [0.8, 0.8, 0.8], [0.2, 0.25, 0.35], [0.7, 0.55, 0.4]];
const look = (g) => swatches.map((c) => R.applyGrade(g, c));
const dist = (a, b) => {
  let d = 0;
  a.forEach((c, i) => c.forEach((v, k) => (d += Math.abs(v - b[i][k]))));
  return d / (a.length * 3);
};

// four hours, four grades
const hours = { '07:00': 7, '12:00': 12, '18:30': 18.5, '22:00': 22 };
const names = Object.keys(hours);
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const d = dist(look(at(hours[names[i]])), look(at(hours[names[j]])));
    ok(d > 0.02, `${names[i]} and ${names[j]} grade alike (mean difference ${d.toFixed(3)})`);
  }
}
// the dominant block at each hour
const dom = (h) => { const w = R.timeWeights(h, SR, SS); return Object.keys(w).reduce((a, b) => (w[b] > w[a] ? b : a)); };
ok(dom(7) === 'dawn', `07:00 is ${dom(7)}, not dawn`);
ok(dom(12) === 'noon', `12:00 is ${dom(12)}, not noon`);
ok(dom(17.8) === 'golden', `17:48 is ${dom(17.8)}, not golden hour`);
ok(dom(19) === 'dusk', `19:00 is ${dom(19)}, not dusk`);
ok(dom(22) === 'night' && dom(2) === 'night', `night isn't night (${dom(22)}, ${dom(2)})`);
// golden hour is warm, night is cool, a storm drains the warmth
const warm = (g) => { const c = R.applyGrade(g, [0.6, 0.6, 0.6]); return c[0] - c[2]; };
ok(warm(at(17.8)) > 0.05, `golden hour isn't warm (${warm(at(17.8)).toFixed(3)})`);
ok(warm(at(22)) < -0.03, `night isn't cool (${warm(at(22)).toFixed(3)})`);
const storm = at(17.8, { storm: 1, fog: 0, sunbreak: 0 });
ok(warm(storm) < warm(at(17.8)) - 0.08, `a storm doesn't drain the golden hour's warmth (${warm(storm).toFixed(3)} vs ${warm(at(17.8)).toFixed(3)})`);
const sat = (g) => { const c = R.applyGrade(g, [0.8, 0.4, 0.3]); return Math.max(...c) - Math.min(...c); };
ok(sat(at(12, { storm: 1 })) < sat(at(12)) * 0.8, 'the storm grade is not desaturated');
const con = (g) => { const a = R.applyGrade(g, [0.2, 0.2, 0.2]); const b = R.applyGrade(g, [0.8, 0.8, 0.8]); return b[1] - a[1]; };
ok(con(at(12, { fog: 1 })) < con(at(12)) - 0.08, 'the fog grade is not milky (low contrast)');
ok(warm(at(12, { sunbreak: 1 })) > warm(at(12)) + 0.04, 'the sun break grade does not warm the picture');
ok(dist(look(at(12)), look(at(12, { storm: 1 }))) > 0.04, 'a storm barely moves the noon grade');
// continuous: no jump between neighbouring minutes anywhere in the day
let worst = 0;
let prev = look(at(0));
for (let m = 1; m <= 1440; m++) {
  const cur = look(at(m / 60));
  worst = Math.max(worst, dist(prev, cur));
  prev = cur;
}
ok(worst < 0.01, `the grade jumps between two minutes (${worst.toFixed(4)})`);
// the LUT bake: right size, black stays dark, white stays light, nothing NaN
for (const size of [16, 32]) {
  const d = R.bakeLut(at(12), size);
  ok(d.length === size * size * size * 4, `LUT ${size} has the wrong size`);
  ok(d[0] < 40 && d[d.length - 4] > 215 && d[d.length - 1] === 255, `LUT ${size} black/white ends are off (${d[0]}, ${d[d.length - 4]})`);
}
ok(R.LUT_NAMES.length >= 5 && R.LUT_NAMES.length === 8, `expected 8 grades, have ${R.LUT_NAMES.length}`);

// installs on the world without a GPU, and says what is on
const cfg = globalThis.DAY_CONFIG;
const day = globalThis.DayEngine.build(cfg, '2026-10-19');
const world = globalThis.DayWorld.create({ ...events, removeAttribute() {}, setAttribute() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) }, cfg, day.spots, day.rooms);
const { installLook } = await import(new URL('js/look.js', root).href);
installLook(world);
const api = R.installRenderPipeline(world);
ok(api && world.render === api, 'the render pipeline did not install');
world.update(globalThis.DayEngine.frame(day, 12 * 60), 0.016, { snap: true });
world.scene.render();
const info = api.info();
ok(info.tonemapping === 'ACES', `tonemapping is ${info.tonemapping}`);
ok(info.bloom && info.bloom.enabled && info.bloom.source === 'emissives', 'bloom is not on emissives');
ok(info.lutCount >= 5, `${info.lutCount} grade LUTs`);
ok(info.luts.includes('storm') && info.luts.includes('fog') && info.luts.includes('sunbreak'), 'a weather grade is missing');
world.look.quality('low');
world.scene.render();
const low = api.info();
ok(low.quality === 'low' && !low.bloom.enabled && !low.ssao && !low.fxaa, `low quality: bloom ${low.bloom.enabled}, ssao ${low.ssao}, fxaa ${low.fxaa}`);
world.look.quality('high');
world.scene.render();
ok(api.info().quality === 'high', 'high quality did not come back');

console.warn = origWarn;
if (problems.length) {
  console.error('render pipeline check failed:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log('render pipeline ok: 4 hours grade apart, storm drains the warmth, fog is milky, sun break is warm, grade continuous, installs under NullEngine');
process.exit(0);

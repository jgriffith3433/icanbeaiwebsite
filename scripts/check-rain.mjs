// Heavy rain (js/rain.js): the pure parts (budgets, height map, lens drops, fog) and the quad batch under the NullEngine.
//
//   node scripts/check-rain.mjs
//
import * as B from "@babylonjs/core";
B.Logger.LogLevels = B.Logger.NoneLogLevel;
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) });
const doc = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0, style: {}, setAttribute() {} }), body: { appendChild() {} } };
class NEngine extends B.NullEngine {
  constructor() { super({ renderHeight: 360, renderWidth: 640, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 1 }); this.getCaps().instancedArrays = true; }
}
const evs = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
Object.assign(globalThis, { window: globalThis, BABYLON: { ...B, Engine: NEngine }, document: doc, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, ...evs });
const warn0 = console.warn;
console.warn = () => {};
import { budget, streakBudget, streakRate, fogBoost, visibilityM, curtainAlpha, createHeightMap, spawnLensDrop, stepLensDrop, lensRate, makeRng, createQuadBatch, RAIN_BUDGET, CURTAIN_R } from "../js/rain.js";

const problems = [];
const ok = (c, m) => { if (!c) problems.push(m); return c; };

ok(budget("low").lens === 0, "no lens drops on low quality");
ok(budget("high").lens >= 40, "lens drops on high quality");
ok(streakBudget("low") === 2500 && streakBudget("high") > 4000, "phone streak cap is 2500");
ok(streakRate(100000, 0.6, "low") * 0.6 <= 2500 + 1e-6, "streakRate keeps a phone under 2500 alive");
ok(streakRate(50, 0.6, "low") === 50, "a light rain isn't cut");
ok(RAIN_BUDGET.low.hits < RAIN_BUDGET.high.hits && RAIN_BUDGET.low.curtains === 2 && budget("high").curtains === CURTAIN_R.length, "phone has fewer hits and 2 curtains");
ok(fogBoost(0.2, 0) === 1 && fogBoost(1, 1) > 1.7 && fogBoost(0.8, 0) > fogBoost(0.5, 0), "heavy rain thickens fog, light rain doesn't");
ok(visibilityM(0.022 * fogBoost(1, 1)) < visibilityM(0.022), "downpour lowers visibility");
ok(curtainAlpha(0.05) === 0 && curtainAlpha(1) > 0.3, "curtains only in real rain");

// height map: ground, roof, a yawed box, tiny and flat solids ignored
const solids = [
  { x: 10, y: 6, z: 10, w: 8, h: 12, d: 8 },
  { x: 30, y: 0.8, z: 10, w: 2, h: 1.6, d: 4, yaw: Math.PI / 2 },
  { x: 40, y: 3, z: 10, w: 0.28, h: 6, d: 0.28 },
  { x: 50, y: 0.05, z: 10, w: 9, h: 0.1, d: 9 },
];
const hm = createHeightMap(() => solids, () => 0.06);
ok(hm.at(10, 10).roof && Math.abs(hm.at(10, 10).y - 12) < 1e-6, "roof top found");
ok(!hm.at(20, 10).solid && hm.at(20, 10).y === 0.06, "open ground uses the ground height");
ok(Math.abs(hm.at(31.5, 10).y - 1.6) < 1e-6 && hm.at(30, 11.5).y === 0.06, "a yawed box is read in its own frame");
ok(hm.at(40, 10).y === 0.06 && hm.at(50, 10).y === 0.06, "lamp posts and flat slabs are ignored");

// lens: beads, then slides, then clears; most when level or up, a quarter looking down, none on low
const r = makeRng(3);
ok(lensRate(0.75, 0.1, 56) * 3 >= 5, "a Rain cast looking up makes >= 5 drops in 3 s");
ok(lensRate(0.75, -0.6, 56) < lensRate(0.75, 0.1, 56) && lensRate(0.75, 0.1, 0) === 0 && lensRate(0, 0.1, 56) === 0, "lens rate by pitch, quality and rain");
const d = spawnLensDrop(r, 400, 300);
let t = 0; let slid = false;
while (!d.gone && t < 10) { stepLensDrop(d, 1 / 30, 300, 0); t += 1 / 30; if (d.sliding) slid = true; }
ok(d.gone && slid && t < 6, `a drop beads, slides and clears (${t.toFixed(1)} s)`);
ok(d.r >= 1.4 && d.trail.length <= 28, "a sliding drop keeps a short trail");

// quad batch
const engine = new B.NullEngine();
const scene = new B.Scene(engine);
const mat = new B.StandardMaterial("m", scene);
const q = createQuadBatch(B, scene, "q", 4, mat);
q.begin();
q.flat(0, 0, 0, 1, 1, 1, 1, 0.5);
q.billboard(0, 1, 0, 1, 1, new B.Vector3(1, 0, 0), new B.Vector3(0, 1, 0), 1, 1, 1, 1);
for (let i = 0; i < 5; i++) q.flat(i, 0, 0, 1, 1, 1, 1, 1);
ok(q.count() === 4, "a batch stops at its capacity");
q.end();
ok(q.mesh.getTotalVertices() === 16 && q.mesh.isEnabled(), "a batch is one mesh of 4 quads");
const pos = q.mesh.getVerticesData("position");
ok(pos[1] === 0 && pos[0] === -1, "flat quads lie at their y");
q.begin(); q.end();
ok(!q.mesh.isEnabled(), "an empty batch is off");


// the world: the module installs, and a downpour draws splashes, curtains, drips and a lens
const root = new URL("../", import.meta.url);
for (const f of ["day.config.js", "js/schedule.js", "js/world.js"]) await import(new URL(f, root).href);
const cfg = globalThis.DAY_CONFIG;
const day = globalThis.DayEngine.build(cfg, "2026-10-19");
const world = globalThis.DayWorld.create({ ...evs, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) }, cfg, day.spots, day.rooms);
const { installLook } = await import(new URL("js/look.js", root).href);
installLook(world);
const { startWeather } = await import(new URL("js/weather.js", root).href);
const dayApi = { now: () => ({ key: "date", minutes: 12 * 60 }), world: () => world, notes: () => [], note() {} };
const wx = startWeather(world, dayApi);
dayApi.weather = wx;
const { startRain } = await import(new URL("js/rain.js", root).href);
const rain = startRain(world, dayApi);
ok(rain && world.__rain === rain, "rain installs on the world");
wx.set("storm", 1, "key");
world.indoorsAt = () => false; // the camera starts in the office cutaway: the test wants the street
const fr = globalThis.DayEngine.frame(day, 12 * 60);
for (let i = 0; i < 200; i++) world.update(fr, 0.05, { snap: i === 0 });
world.scene.render();
const info = rain.info();
ok(!info.error, `rain frame error: ${info.error}`);
ok(info.rain > 0.5, `weather rain ${info.rain}`);
ok(info.hits.ripples > 20 && info.hits.live > 0 && info.hits.live <= info.hits.cap, `ripples ${info.hits.ripples}, live ${info.hits.live}, cap ${info.hits.cap}`);
ok(info.curtains >= 1 && info.curtainCount === 3, `curtains shown ${info.curtains} of ${info.curtainCount}`);
ok(info.fog.mul > 1.3, `fog multiplier ${info.fog.mul}`);
ok(info.hits.kinds.ground + info.hits.kinds.roof > 10, "hits land on the ground and roofs");
ok(rain.heightAt(-19.5, 9.5).y >= 0, "height map answers");
world.look.quality("low");
for (let i = 0; i < 40; i++) world.update(fr, 0.05, {});
const lo = rain.info();
ok(lo.quality === "low" && !lo.lens.enabled && lo.hits.live <= lo.hits.cap, `phone: ${JSON.stringify(lo.hits)}`);
ok(lo.streaks.cap === 2500, "phone streak cap");
console.warn = warn0;
if (problems.length) { console.error("check-rain FAILED:\n  " + problems.join("\n  ")); process.exit(1); }
console.log("check-rain ok: budgets, height map, lens drops, fog, quad batch, the world under NullEngine");
process.exit(0);

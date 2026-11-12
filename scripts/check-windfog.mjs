// Wind and fog you can see (js/windfog.js): pure helpers, then the whole effect under the NullEngine.
//
//   node scripts/check-windfog.mjs
//
import * as B from "@babylonjs/core";
import {
  counts, windStrength, fogPresence, umbrellaState, noiseField, createWindFog,
  RIBBONS_HIGH, RIBBONS_LOW, LEAVES_HIGH, LEAVES_LOW, SLICES_HIGH, SLICES_LOW, FLIP_MIN, FLIP_MAX,
} from "../js/windfog.js";

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

// budgets
ok(counts("high").ribbons === RIBBONS_HIGH && counts("low").ribbons === RIBBONS_LOW, "ribbon budgets");
ok(counts("high").leaves === LEAVES_HIGH && counts("low").leaves === LEAVES_LOW, "leaf budgets");
ok(counts("high").slices === SLICES_HIGH && counts("low").slices === SLICES_LOW && SLICES_LOW === 2, "fog slices: 6 high, 2 low");
ok(counts("high").cloth === true && counts("low").cloth === false, "cloth is desktop only: a phone has vertex shaders only");
ok(LEAVES_HIGH >= 10 && LEAVES_LOW >= 10, "at least 10 leaves even on a phone");

// the wind
ok(windStrength(0.06, 0) < 0.1, "a calm day is a breeze");
ok(windStrength(0, 1) > FLIP_MAX + 0.2, "a gust is strong enough to flip any umbrella");
ok(windStrength(1, 1) <= 1.6, "wind is capped");
ok(fogPresence(0.0065) === 0 && fogPresence(0.09) === 1, "fog presence runs 0..1 over the weather's fog density");

// an umbrella: closed, open, flipped; it stays flipped until the wind is nearly gone
ok(umbrellaState(0.1, 0.7, "closed") === "closed", "closed in a breeze");
ok(umbrellaState(0.4, 0.7, "closed") === "open", "opened against the wind");
ok(umbrellaState(0.75, 0.7, "open") === "flipped", "flipped past its threshold");
ok(umbrellaState(0.45, 0.7, "flipped") === "flipped", "stays flipped while it is still blowing");
ok(umbrellaState(0.1, 0.7, "flipped") === "open", "righted once the wind is gone");
ok(FLIP_MIN < FLIP_MAX && FLIP_MAX < 1, "flip thresholds sit under a Gust's strength");

// noise tiles and has gaps
const nz = noiseField(64, 7);
let mn = 1, mx = 0;
for (const v of nz) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
ok(mx - mn > 0.3 && mn >= 0 && mx <= 1, `noise has range ${mn.toFixed(2)}..${mx.toFixed(2)}`);

const engine = new B.NullEngine();
const ctx2d = {
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  putImageData() {}, drawImage() {}, fillRect() {}, clearRect() {},
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
};
engine.createCanvas = (w, h) => ({ width: w, height: h, getContext: () => ctx2d, style: {} });

function stage() {
  const scene = new B.Scene(engine);
  scene.fogColor = new B.Color3(0.8, 0.82, 0.84);
  // the world's own materials the effect bends
  const solid = new B.Mesh("props-solid", scene);
  solid.material = new B.StandardMaterial("props-solid", scene);
  const aw = B.MeshBuilder.CreateBox("weather-awnings", {}, scene);
  aw.material = new B.StandardMaterial("weather-awning-mat", scene);
  aw.thinInstanceAdd(B.Matrix.Identity());
  const trunk = B.MeshBuilder.CreateBox("trunk", {}, scene);
  trunk.material = new B.StandardMaterial("trunk-m", scene);
  trunk.thinInstanceAdd(B.Matrix.Identity());
  const crown = B.MeshBuilder.CreateSphere("crown0", {}, scene);
  crown.material = new B.StandardMaterial("crown-m", scene);
  crown.thinInstanceAdd(B.Matrix.Identity());
  new B.FreeCamera("cam", new B.Vector3(0, 6, -10), scene);
  return scene;
}
const blocks = [
  { id: "apt", x: -24, z: 0.5, w: 16, d: 12, h: 6.16 },
  { id: "shop", x: 50, z: 0.5, w: 16, d: 12, h: 3.3 },
  { id: "annex", x: 157, z: 0.5, w: 16, d: 12, h: 5.72 },
  { id: "mid", x: 86, z: 0.5, w: 12, d: 12, h: 11 },
];

for (const q of ["high", "low"]) {
  const scene = stage();
  const night = { day: 0, dusk: 0.2, night: 0.8 };
  let sky = { day: 1, dusk: 0, night: 0 };
  const fx = createWindFog(B, scene, {
    quality: () => q,
    focus: () => ({ x: 0, y: 1, z: 0 }),
    cameraPos: () => ({ x: 0, y: 6, z: -10 }),
    sky: () => sky,
    cars: () => [{ x: 8, z: 4, yaw: Math.PI / 2 }, { x: -6, z: 2, yaw: 0 }],
    lamps: () => [[3, 5], [12, 4], [-9, 7]],
    avenues: [12.6],
    blocks,
    cfg: { prevailing: [0.82, -0.57], river: [0, 1] },
  });
  const info0 = fx.info();
  ok(info0.plugins >= 3, `${q}: the shader bend is on props, trees and awnings (${info0.plugins})`);
  ok(info0.bent.includes("props-solid") && info0.bent.includes("weather-awning-mat"), `${q}: bent materials ${info0.bent}`);
  ok(info0.flags >= 3, `${q}: roof and plaza flags (${info0.flags})`);
  ok(info0.laundry >= 4, `${q}: laundry lines (${info0.laundry})`);
  ok(q === "high" ? info0.cloth === 3 : info0.cloth === 0, `${q}: hero cloth pieces ${info0.cloth}`);
  ok(info0.slices === (q === "high" ? 6 : 2), `${q}: fog slices ${info0.slices}`);

  // a calm sky: nothing streaks, no fog shows
  for (let i = 0; i < 30; i++) fx.update(1 / 30, { wind: 0.06, fog: 0.0065 });
  ok(fx.info().ribbons === 0, `${q}: no ribbons in a breeze`);
  ok(fx.info().visibleSlices === 0, `${q}: no fog in a clear sky`);

  // a Gust: ribbons, leaves, a strong wind that eases out
  fx.gust("gust", { x: 1, z: 0 });
  let maxRib = 0, maxLeaf = 0, maxK = 0, maxSwirl = 0;
  for (let i = 0; i < 90; i++) {
    fx.update(1 / 30, { wind: 0.06, fog: 0.0065 });
    const inf = fx.info();
    maxRib = Math.max(maxRib, inf.ribbons); maxLeaf = Math.max(maxLeaf, inf.leaves); maxK = Math.max(maxK, inf.wind); maxSwirl = Math.max(maxSwirl, inf.swirling);
  }
  ok(maxK > FLIP_MAX, `${q}: a gust peaks over the flip threshold (${maxK})`);
  ok(maxRib >= 6, `${q}: wind ribbons streak (${maxRib})`);
  ok(maxLeaf >= 10, `${q}: at least 10 leaves and papers swirl (${maxLeaf})`);
  ok(maxSwirl > 0, `${q}: leaves are inside the eddies (${maxSwirl})`);
  ok(Math.abs(fx.direction().x) > 0.9, `${q}: the wind turned to the cast direction (${JSON.stringify(fx.direction())})`);
  if (q === "high") ok(fx.info().clothSpread.every((s) => Number.isFinite(s) && s > 0.2), `hero cloth reaches out: ${fx.info().clothSpread}`);
  for (let i = 0; i < 300; i++) fx.update(1 / 30, { wind: 0.06, fog: 0.0065 });
  ok(fx.info().gust < 0.05 && fx.strength() < 0.2, `${q}: the gust eased out (${fx.strength()})`);
  ok(fx.info().ribbons === 0, `${q}: and the ribbons are gone`);

  // Fog: slices roll in within 5 s, the veils fade the skyline, headlights and shafts at night
  let seen = -1;
  for (let i = 0; i < 150; i++) {
    fx.update(1 / 30, { wind: 0.04, fog: 0.09 });
    if (seen < 0 && fx.info().fog > 0.4) seen = (i + 1) / 30;
  }
  ok(seen >= 0 && seen <= 5, `${q}: ground fog rolls in within 5 s (${seen})`);
  ok(fx.info().visibleSlices === (q === "high" ? 6 : 2), `${q}: all slices show`);
  ok(fx.info().veils >= 1, `${q}: skyline veil rings`);
  ok(fx.info().cones > 0, `${q}: headlight cones in fog (${fx.info().cones})`);
  const slice = scene.getMeshByName("wf-fog-slice0");
  ok(slice && slice.material.alpha > 0.05 && slice.position.y < 1, `${q}: the lowest slice hugs the street (alpha ${slice && slice.material.alpha})`);
  sky = night;
  for (let i = 0; i < 60; i++) fx.update(1 / 30, { wind: 0.04, fog: 0.09 });
  ok(fx.info().shafts >= 3, `${q}: lamp light shafts at night (${fx.info().shafts})`);
  for (let i = 0; i < 400; i++) fx.update(1 / 30, { wind: 0.04, fog: 0.0065 });
  ok(fx.info().visibleSlices === 0 && fx.info().fog === 0, `${q}: the fog eases out (${fx.info().fog})`);

  // nothing went non-finite
  scene.meshes.forEach((m) => {
    const p = m.getVerticesData && m.getVerticesData(B.VertexBuffer.PositionKind);
    if (p) for (let i = 0; i < p.length; i += 7) if (!Number.isFinite(p[i])) { ok(false, `${q}: ${m.name} has a non-finite vertex`); break; }
  });
  fx.dispose();
  scene.dispose();
}

if (problems.length) {
  console.error("windfog check failed:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log("windfog check ok");
process.exit(0);

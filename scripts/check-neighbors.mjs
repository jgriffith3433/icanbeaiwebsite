// Neighbors: data, routines and beat windows (no browser).
//
//   node scripts/check-neighbors.mjs
//
import { inWindow, hourOf, placeAt } from "../js/neighbors.js";
import { nextBeat, powerMatches, clampBeat, arcLines, emptyArcs } from "../js/neighbor-arcs.js";

const root = new URL("../", import.meta.url);
const problems = [];
const ok = (cond, msg) => {
  if (!cond) problems.push(msg);
  return cond;
};
Object.assign(globalThis, { window: globalThis });
await import(new URL("day.config.js", root).href);
const cfg = globalThis.DAY_CONFIG;
const nb = cfg.neighbors;
ok(nb && Array.isArray(nb.list), "day.config.js has no neighbors.list");
const list = (nb && nb.list) || [];
ok(list.length === 3, `${list.length} neighbors, wanted 3`);
ok(inWindow(23, 17, 5) && inWindow(3, 17, 5) && !inWindow(12, 17, 5) && inWindow(9, 7, 11.5) && !inWindow(12, 7, 11.5), "inWindow is wrong");
ok(Math.abs(hourOf(1890) - 7.5) < 1e-9 && Math.abs(hourOf(450) - 7.5) < 1e-9, "hourOf is wrong");

const abilities = Object.keys((cfg.powers && cfg.powers.keys) || {});
const blocks = (cfg.city && cfg.city.blocks) || [];
const inBlock = (x, z) => blocks.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.3 && Math.abs(z - b.z) < b.d / 2 + 0.3);
const stairs = blocks.filter((b) => b.stair).map((b) => b.stair);
const onStair = (x, z) => stairs.some((s) => x > s.x0 - 1 && x < s.x1 + 1 && Math.abs(z - s.z) < s.w / 2 + 0.7);
const colors = new Set();
const ids = new Set();

for (const p of list) {
  ok(p.id && p.name && p.role && p.home, `${p.id}: needs id, name, role, home`);
  ok(!ids.has(p.id), `${p.id}: duplicate id`);
  ids.add(p.id);
  ok(!colors.has(p.color), `${p.id}: look colour repeats`);
  colors.add(p.color);
  ok(p.look && p.look.hat !== undefined || p.look && p.look.hair, `${p.id}: no look`);
  const kinds = (p.beats || []).map((b) => b.kind);
  ok((p.beats || []).length >= 2 && (p.beats || []).length <= 3, `${p.id}: ${kinds.length} beats, wanted 2 or 3`);
  ok(kinds[0] === "ask" && kinds[1] === "thanks", `${p.id}: beats go ask, thanks, then surprise`);
  for (const b of p.beats || []) {
    ok(b.text && b.text.length < 140, `${b.id}: bubble text missing or long`);
    if (b.kind === "ask") ok(abilities.includes(b.ability), `${b.id}: ability ${b.ability} isn't a power`);
    if (b.kind !== "ask") ok(b.reward && b.reward.score > 0, `${b.id}: a completed beat pays a reward`);
  }
  const s = p.stops;
  ok(s[0][0] === 0 && s.every((x, i) => i === 0 || x[0] > s[i - 1][0]), `${p.id}: stops must start at hour 0 and rise`);
  for (const [, x, z] of s) {
    ok(!inBlock(x, z) && !onStair(x, z), `${p.id}: stop ${x},${z} is inside a building or on a stair`);
  }
  // sampled across a day: never inside a building, jumps no more than a walking step, out when a window opens
  let prev = null;
  let outHours = 0;
  for (let h = 0; h < 24; h += 1 / 3600) {
    const q = placeAt(s, h);
    if (!q.inside) outHours += 1 / 3600;
    if (!q.inside) ok(!inBlock(q.x, q.z) || !!(q.moving), `${p.id}: stands in a building at ${h.toFixed(2)}`);
    if (prev && !prev.inside && !q.inside) ok(Math.hypot(q.x - prev.x, q.z - prev.z) < 1.5, `${p.id}: jumps ${Math.hypot(q.x - prev.x, q.z - prev.z).toFixed(1)} m at ${h.toFixed(2)}`);
    prev = q;
  }
  ok(outHours > 6, `${p.id}: out only ${outHours.toFixed(1)} h`);
  for (const b of p.beats) {
    if (b.kind === "thanks") continue;
    let seen = false;
    for (let h = 0; h < 24 && !seen; h += 0.25) if (inWindow(h, b.from, b.to) && !placeAt(s, h).inside) seen = true;
    ok(seen, `${b.id}: they are never outside during its window`);
  }
}

// The module itself, in a NullEngine scene with a fake day: figures, an ask answered by an ability, a thank-you, a surprise.
{
  const BABYLON = await import("@babylonjs/core");
  globalThis.BABYLON = BABYLON;
  const el = () => ({ style: { setProperty() {} }, dataset: {}, classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, append() {}, remove() {}, setAttribute() {}, addEventListener() {}, querySelector: () => el(), set innerHTML(v) {}, get innerHTML() { return ""; } });
  globalThis.document = { createElement: el, head: el(), body: el(), getElementById: () => null };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  const events = [];
  const listeners = {};
  globalThis.addEventListener = (n, f) => (listeners[n] = (listeners[n] || []).concat(f));
  globalThis.dispatchEvent = (e) => { events.push(e); (listeners[e.type] || []).forEach((f) => f(e)); };
  globalThis.CustomEvent = class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } };
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const cam = new BABYLON.FreeCamera("c", new BABYLON.Vector3(0, 5, -10), scene);
  scene.activeCamera = cam;
  let minutes = 8 * 60 + 10;
  let energy = 0;
  const pos = { x: -20, z: 9.5 };
  globalThis.window = globalThis;
  globalThis.innerWidth = 800; globalThis.innerHeight = 600;
  globalThis.day = {
    world: () => ({ scene }),
    now: () => ({ key: "d1", minutes, frame: { person: { x: pos.x, z: pos.z } } }),
    control: { mode: () => "control", state: () => ({ x: pos.x, z: pos.z, y: 0 }) },
    note() {},
  };
  globalThis.powers = { abilities: { now: () => ({ energy, max: 100 }), reset: (v) => (energy = v), get: (id) => ({ name: id }) } };
  await import("../js/neighbors.js?smoke");
  const N = globalThis.day.neighbors;
  ok(!!N, "neighbors didn't install");
  const meshes = scene.transformNodes.filter((n) => n.name.startsWith("neighbor-"));
  ok(meshes.length === 3, "three figures in the scene");
  const frames = async (n) => { for (let i = 0; i < n; i++) { scene.render(); await new Promise((r) => setTimeout(r, 20)); } };
  await frames(3);
  const by = (id) => N.now().people.find((p) => p.id === id);
  ok(by("birdie").asking, "Birdie asks when he is close in the morning");
  globalThis.dispatchEvent(new CustomEvent("day:power", { detail: { action: "bolt", power: "bolt" } }));
  ok(by("birdie").stage === 0 && by("birdie").asking, "the wrong ability doesn't answer her");
  pos.x = -60; // too far to count
  globalThis.dispatchEvent(new CustomEvent("day:power", { detail: { action: "rain", power: "rain" } }));
  ok(by("birdie").stage === 0, "an answer from far away doesn't count");
  pos.x = -20;
  globalThis.dispatchEvent(new CustomEvent("day:power", { detail: { action: "rain", power: "rain" } }));
  ok(by("birdie").stage === 1, "rain close by answers Birdie's ask");
  await frames(70);
  ok(by("birdie").done.includes("birdie-thanks") && N.now().score === 50 && energy >= 25, "the thank-you pays score and Pressure: " + JSON.stringify([N.now().score, energy]));
  minutes = 17 * 60 + 20;
  await frames(4);
  ok(by("birdie").done.includes("birdie-surprise") && N.now().score === 150, "the evening surprise pays more: " + N.now().score);
  const rewards = events.filter((e) => e.detail && e.detail.action === "reward");
  ok(rewards.length === 2, rewards.length + " reward events");
  minutes += 1440 * 2; // the next day: fresh beats
  globalThis.day.now = () => ({ key: "d2", minutes: 8 * 60 + 10, frame: { person: { x: pos.x, z: pos.z } } });
  await frames(3);
  ok(by("birdie").stage === 0 && by("birdie").asking, "a new day starts the beats again");
  ok(typeof N.anim === "function" && typeof N.resetAnim === "function", "neighbors.anim detectors API");

  // Procedural gait: drive a figure at walking speed and require 0 planted-foot slides.
  const { buildFigure, detectAnimProblems, FOOT_SLIDE_LIMIT, WALK_STRIDE } = await import("../js/peoplekit.js");
  const fig = buildFigure(BABYLON, scene, "walk-test", { skin: "#e0b794", top: "#888", pants: "#333", shoes: "#222" }, 1);
  fig.root.position.set(0, 0, 0);
  let prev = null;
  let slides = 0;
  let mismatches = 0;
  const walkSpeed = 1.3;
  for (let i = 0; i < 180; i++) {
    const dt = 1 / 60;
    fig.root.position.z += walkSpeed * dt;
    const sample = fig.step({ dt, speed: walkSpeed, moving: true, yawErr: 0, weather: "clear", sunShield: 0, jump: false });
    const hit = detectAnimProblems(sample, prev, { limit: FOOT_SLIDE_LIMIT });
    if (hit.footSlide) slides++;
    if (hit.mismatch) mismatches++;
    prev = sample;
  }
  ok(slides === 0, `planted foot slid on ${slides} frames (limit ${FOOT_SLIDE_LIMIT} m, stride ${WALK_STRIDE})`);
  ok(mismatches === 0, `state/motion mismatch on ${mismatches} frames`);
  const gAsk = fig.step({ dt: 0.016, speed: 0, moving: false, gesture: "ask" });
  ok(gAsk.gesture === "ask" && gAsk.state === "gesture-ask", "ask gesture plays");
  const gTh = fig.step({ dt: 0.016, speed: 0, moving: false, gesture: "thanks" });
  ok(gTh.gesture === "thanks", "thanks gesture plays");
  let rainPose = null;
  for (let i = 0; i < 40; i++) rainPose = fig.step({ dt: 0.05, speed: 0, moving: false, weather: "rain", sunShield: 0 });
  ok(rainPose.weather === "rain" && rainPose.weatherK > 0.5, "rain posture blends in");
  let sunPose = null;
  for (let i = 0; i < 40; i++) sunPose = fig.step({ dt: 0.05, speed: 0, moving: false, weather: "clear", sunShield: 1 });
  ok(sunPose.weather === "sun" && sunPose.weatherK > 0.5, "sun shield posture blends in");

  // Birdie's park stop and Dex's plaza stop sit
  ok(placeAt(list.find((p) => p.id === "birdie").stops, 12).sit, "Birdie sits on the park bench at noon");
  ok(placeAt(list.find((p) => p.id === "dex").stops, 12).sit, "Dex sits in the plaza at lunch");

  scene.dispose();
}

// Personal arcs: 3 beats each, ability asks match powers, lines short
{
  const arcs = nb.arcs;
  ok(arcs && arcs.list, "neighbors.arcs is missing");
  const ids = ["birdie", "dex", "quill"];
  ok(nextBeat(0) === 1 && nextBeat(2) === 3 && nextBeat(3) === 0 && clampBeat(9) === 3, "nextBeat/clampBeat");
  ok(JSON.stringify(emptyArcs()) === JSON.stringify({ birdie: 0, dex: 0, quill: 0 }), "emptyArcs");
  for (const id of ids) {
    const a = arcs && arcs.list && arcs.list[id];
    ok(a && (a.beats || []).length === 3, `${id}: arc needs 3 beats`);
    if (!a) continue;
    ok(a.beats[0].kind === "cue" && a.beats[1].kind === "ask" && a.beats[2].kind === "scene", `${id}: arc kinds cue/ask/scene`);
    a.beats.forEach((b) => {
      ok(b.id && b.prop, `${b.id}: needs id and prop`);
      if (b.kind === "ask") {
        ok(b.text && b.thanks, `${b.id}: ask needs text and thanks`);
        ok(b.ability || (b.abilities && b.abilities.length), `${b.id}: ask needs ability`);
        if (b.ability) ok(powerMatches(b, b.ability), `${b.id}: powerMatches ability`);
        if (b.abilities) ok(powerMatches(b, b.abilities[0]), `${b.id}: powerMatches abilities`);
      } else {
        ok((b.lines || []).length >= 1, `${b.id}: cue/scene needs lines`);
        (b.lines || []).forEach((L) => ok(L.who && L.text && L.text.length < 140, `${b.id}: line long or missing`));
      }
    });
  }
  const lines = arcLines(arcs);
  ok(lines.length >= 9, `arc lines sparse: ${lines.length}`);
}

if (problems.length) {
  console.error("check-neighbors FAILED:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log(`check-neighbors: ${list.length} neighbors, ${list.reduce((n, p) => n + p.beats.length, 0)} beats + arcs ok`);

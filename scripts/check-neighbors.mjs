// Neighbors: data, routines and beat windows (no browser).
//
//   node scripts/check-neighbors.mjs
//
import { inWindow, hourOf, placeAt } from "../js/neighbors.js";

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
  scene.dispose();
}
if (problems.length) {
  console.error("check-neighbors FAILED:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log(`check-neighbors: ${list.length} neighbors, ${list.reduce((n, p) => n + p.beats.length, 0)} beats ok`);

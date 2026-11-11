// Checks today's request (js/daily.js, day.config.js `daily`): a pool of at least 21 asks, each complete, one a day from the
// real date, no ask repeating within any 7 (in fact 21) consecutive dates, one-line titles, every ask and thanks has a voice.
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
globalThis.window = globalThis;
await import(pathToFileURL(path.join(root, "day.config.js")).href);
const D = await import(pathToFileURL(path.join(root, "js/daily.js")).href);
const { dialogueLines } = await import(pathToFileURL(path.join(root, "js/dialogue.js")).href);
const { dateKey } = await import(pathToFileURL(path.join(root, "js/memory.js")).href);
const problems = [];
const ok = (c, m) => { if (!c) problems.push(m); };
const cfg = DAY_CONFIG.daily;
const pool = cfg.pool;

ok(pool.length >= 21, `the pool has ${pool.length} asks, wanted at least 21`);
ok(new Set(pool.map((a) => a.id)).size === pool.length, "ask ids are unique");
ok(D.gcd(cfg.step, pool.length) === 1, `step ${cfg.step} isn't coprime to ${pool.length}`);
const powers = new Set(["bolt", "rain", "wind", "fog", "sunbreak"]);
const nbrs = new Set(["birdie", "dex", "quill"]);
const kinds = new Set(["bunting", "lanterns", "pinwheels", "photo"]);
const used = {};
pool.forEach((a) => {
  const id = a.id;
  ok(powers.has(a.power), `${id}: power ${a.power}`);
  ok(nbrs.has(a.who) || cfg.citizens[a.who], `${id}: who ${a.who} is neither a neighbour nor a citizen`);
  ok(a.name && a.title && a.did && a.ask && a.thanks && a.rewardWhere, `${id}: missing name/title/did/ask/thanks`);
  ok(a.place && typeof a.place.x === "number" && typeof a.place.z === "number" && a.place.r > 0 && a.place.name, `${id}: place`);
  ok(typeof a.from === "number" && typeof a.to === "number", `${id}: window`);
  const wlen = a.from <= a.to ? a.to - a.from : a.to + 24 - a.from;
  ok(wlen >= 4, `${id}: a ${wlen} h window is too short to plan around`);
  ok(a.reward && kinds.has(a.reward.kind) && Array.isArray(a.reward.at), `${id}: reward`);
  ok(a.reward && (a.reward.kind === "photo" ? !!a.reward.power : /^#[0-9a-f]{6}$/i.test(a.reward.color || "")), `${id}: reward needs a power (photo) or a colour`);
  ok(("Today: " + a.title).length <= 64, `${id}: title too long for two phone lines (${("Today: " + a.title).length})`);
  ok(a.ask.length <= 100 && a.thanks.length <= 70, `${id}: ask/thanks too long to say in a breath`);
  used[a.who] = (used[a.who] || 0) + 1;
});
["birdie", "dex", "quill"].forEach((n) => ok(used[n] >= 3, `${n} has only ${used[n] || 0} asks`));
Object.keys(cfg.citizens).forEach((c) => ok(used[c] >= 1, `citizen ${c} never asks`));
[...powers].forEach((p) => ok(pool.filter((a) => a.power === p).length >= 3, `power ${p} asked fewer than 3 times`));
// citizens: names the episodes use
const eps = JSON.stringify(DAY_CONFIG.episodes);
Object.values(cfg.citizens).forEach((c) => ok(eps.includes(`name: "${c.name}"`) || eps.includes(`"name":"${c.name}"`), `${c.name} isn't a named citizen of the episodes`));

// no repeat within any 7 consecutive dates, across 800 days (and a DST change: the keys are plain dates)
const keyOf = (i) => dateKey(new Date(2026, 0, 1 + i, 12).getTime(), 0);
const seq = []; for (let i = 0; i < 800; i++) seq.push(D.pickAsk(cfg, keyOf(i)).id);
let bad = 0;
for (let i = 0; i + 7 <= seq.length; i++) if (new Set(seq.slice(i, i + 7)).size !== 7) bad++;
ok(bad === 0, `${bad} runs of 7 dates repeat an ask`);
for (let i = 0; i + pool.length <= seq.length; i += 37) ok(new Set(seq.slice(i, i + pool.length)).size === pool.length, "a run of the whole pool repeats");
ok(D.pickAsk(cfg, "2026-11-11").id !== D.pickAsk(cfg, "2026-11-12").id, "the ask changes when the date moves");
ok(D.pickAsk(cfg, "2026-11-11").id === D.pickAsk(cfg, "2026-11-11").id, "same date, same ask");
// the neighbours get their share across a month
const month = seq.slice(0, 63).map((id) => pool.find((a) => a.id === id).who);
["birdie", "dex", "quill"].forEach((n) => ok(month.includes(n), `${n} never asks in nine weeks`));

// windows and powers
ok(D.inHours(8, 7, 14) && !D.inHours(15, 7, 14) && D.inHours(2, 22, 5) && D.inHours(23, 22, 5), "inHours");
ok(D.powerMatches("wind", "gale") && D.powerMatches("wind", "gust") && D.powerMatches("bolt", "storm") && !D.powerMatches("rain", "fog"), "powerMatches");
ok(D.fmtHour(14.5) === "2:30 PM" && D.fmtHour(0) === "12 AM", "fmtHour");
ok(D.todayLine(cfg, pool[0]).startsWith("Today: "), "todayLine");
// yesterday's line only when answered
const st = D.emptyState();
const y = D.pickAsk(cfg, "2026-11-10");
ok(D.yesterdayLine(cfg, st, "2026-11-11") === "", "no yesterday line when it wasn't answered");
st.days["2026-11-10"] = { id: y.id, done: true };
ok(D.yesterdayLine(cfg, st, "2026-11-11") === `Yesterday: ${y.did}`, "yesterday line when answered");
ok(D.parseState("junk").v === 1, "parse survives junk");

// every ask and thanks is a line with a voice (js/dialogue.js; the clips are checked by check-dialogue)
const lines = dialogueLines(DAY_CONFIG);
pool.forEach((a) => {
  ok(lines.some((l) => l.who === a.name && l.text === a.ask), `${a.id}: the ask has no voice line`);
  ok(lines.some((l) => l.who === a.name && l.text === a.thanks), `${a.id}: the thanks has no voice line`);
});


// The module itself, in a NullEngine scene with a fake day: each of the 21 asks is answered by its power inside its place and
// window (and not outside), records its deeds, says the thanks, leaves its reward, and the reward goes when the date turns.
{
  const BABYLON = await import("@babylonjs/core");
  globalThis.BABYLON = BABYLON;
  const el = () => ({ style: { setProperty() {} }, dataset: {}, classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, append() {}, remove() {}, setAttribute() {}, addEventListener() {}, querySelector: () => el(), set innerHTML(v) {}, get innerHTML() { return ""; } });
  globalThis.document = { createElement: el, head: el(), body: el(), getElementById: () => null, documentElement: el() };
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => (store[k] = v) };
  const listeners = {};
  globalThis.addEventListener = (n, f) => (listeners[n] = (listeners[n] || []).concat(f));
  globalThis.dispatchEvent = (e) => { (listeners[e.type] || []).forEach((f) => f(e)); };
  globalThis.CustomEvent = class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } };
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("c", new BABYLON.Vector3(0, 5, -10), scene);
  let date = "2026-11-11", minutes = 12 * 60, pos = { x: 0, z: 0, y: 0 };
  const notes = [], spoken = [];
  globalThis.innerWidth = 800; globalThis.innerHeight = 600;
  globalThis.day = {
    world: () => ({ scene, surfaceAt: () => 0.06 }),
    now: () => ({ key: "d", minutes, frame: { person: pos } }),
    control: { mode: () => "control", state: () => pos },
    memory: { today: () => ({ date }), note: (k, z, p) => notes.push([k, z, p]) },
    dialogue: { speak: (who, text) => { spoken.push([who, text]); return { id: "x" }; } },
    neighbors: { now: () => ({ people: [] }), gesture() {} },
    note() {},
  };
  const { installDaily } = await import(pathToFileURL(path.join(root, "js/daily.js")).href);
  const A = installDaily(globalThis.day, globalThis.day.world());
  ok(!!A, "daily didn't install");
  const frames = async (n) => { for (let i = 0; i < n; i++) { scene.render(); await new Promise((r) => setTimeout(r, 15)); } };
  const keyFor = (id) => { for (let i = 0; i < 400; i++) { const k = keyOf(i); if (D.pickAsk(cfg, k).id === id) return k; } return null; };
  const power = (p) => globalThis.dispatchEvent(new CustomEvent("day:power", { detail: { action: p, power: p } }));
  const call = { bolt: "bolt", rain: "rain", wind: "gale", fog: "fog", sunbreak: "sunbreak" };
  for (const a of pool) {
    date = keyFor(a.id);
    globalThis.dispatchEvent(new CustomEvent("day:memory", { detail: { action: "shift" } }));
    ok(A.today().id === a.id && !A.today().answered, `${a.id}: not today's ask after the date turned`);
    const mid = a.from <= a.to ? (a.from + a.to) / 2 : a.from;
    // wrong hour, wrong place and the wrong power don't answer
    minutes = ((a.to + 2) % 24) * 60; if (D.inHours(minutes / 60, a.from, a.to)) minutes = ((a.from + 24 - 2) % 24) * 60;
    pos = { x: a.place.x, z: a.place.z, y: 0 };
    power(call[a.power]);
    ok(!A.today().answered, `${a.id}: answered outside its window`);
    minutes = mid * 60;
    pos = { x: a.place.x + a.place.r + 60, z: a.place.z, y: 0 };
    power(call[a.power]);
    ok(!A.today().answered, `${a.id}: answered from far away`);
    pos = { x: a.place.x, z: a.place.z, y: 0 };
    power(Object.values(call).find((p) => !D.powerMatches(a.power, p)));
    ok(!A.today().answered, `${a.id}: answered by the wrong power`);
    power(call[a.power]);
    ok(A.today().answered, `${a.id}: not answered by its power at its place`);
    ok(notes.some((n) => n[0] === "dailyAnswered" && n[2] === a.who) && notes.some((n) => n[0] === "askAnswered" && n[2] === a.who), `${a.id}: deeds not recorded`);
    await frames(80);
    ok(spoken.some((s) => s[0] === a.name && s[1] === a.thanks), `${a.id}: thanks not spoken`);
    ok(A.now().reward > 0 && A.now().rewardKind === a.reward.kind, `${a.id}: no ${a.reward.kind} reward standing`);
    ok(JSON.parse(store["icanbe.daily"]).days[date].done, `${a.id}: not saved`);
    A.reload();
    ok(A.now().reward > 0, `${a.id}: reward gone after a same-day reload`);
    const rootNodes = scene.transformNodes.filter((n) => n.name === "daily-reward").length;
    ok(rootNodes === 1, `${a.id}: ${rootNodes} reward roots`);
    scene.meshes.filter((m) => m.name.startsWith("daily-") && m.getTotalVertices() === 0).forEach((m) => ok(false, `${a.id}: empty mesh ${m.name}`));
    date = "2030-01-01";
    globalThis.dispatchEvent(new CustomEvent("day:memory", { detail: { action: "shift" } }));
    ok(A.now().reward === 0 || !A.now().answered, `${a.id}: reward stayed after the date turned`);
    ok(scene.transformNodes.filter((n) => n.name === "daily-reward").length === 0, `${a.id}: reward not removed on the new date`);
  }
  // yesterday's line
  const k0 = keyFor(pool[3].id);
  date = k0; globalThis.dispatchEvent(new CustomEvent("day:memory", { detail: { action: "shift" } }));
  ok(A.today().answered, "answers kept for the date");
  const [yy, mm, dd] = k0.split("-").map(Number);
  date = dateKey(new Date(yy, mm - 1, dd + 1, 12).getTime(), 0);
  globalThis.dispatchEvent(new CustomEvent("day:memory", { detail: { action: "shift" } }));
  ok(A.yesterdayLine() === `Yesterday: ${pool[3].did}`, "the next day's title says what he did yesterday: " + A.yesterdayLine());
  ok(A.line().startsWith("Today: "), "title line");
  // a citizen stands where they said
  const cit = pool.find((a) => !nbrs.has(a.who));
  date = keyFor(cit.id); globalThis.dispatchEvent(new CustomEvent("day:memory", { detail: { action: "shift" } }));
  await frames(3);
  ok(A.now().citizen === cit.who && scene.transformNodes.some((n) => n.name === "neighbor-daily-" + cit.who), "the citizen's figure stands at their spot");
}

if (problems.length) { console.error("check-daily failed:"); problems.forEach((p) => console.error(" -", p)); process.exit(1); }
console.log(`check-daily: ok (${pool.length} asks, no repeat in 7 dates, ${month.length} days spread)`);

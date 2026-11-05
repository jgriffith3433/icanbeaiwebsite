// Episode data and scoring helpers (no browser).
//
//   node scripts/check-episodes.mjs
//
import { createRequire } from "node:module";
import {
  clockMinutes,
  matchEpisode,
  scoreCard,
  loadBest,
  saveBest,
  recordBest,
  inZone,
  strainCost,
  carryStrain,
  pickEnding,
  cityFared,
  rankFor,
} from "../js/episodes.js";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const problems = [];
const ok = (cond, msg) => {
  if (!cond) problems.push(msg);
  return cond;
};

Object.assign(globalThis, {
  window: globalThis,
  document: { createElement: () => ({ style: {}, appendChild() {}, querySelector() { return null; }, addEventListener() {} }), head: { appendChild() {} }, body: { append() {}, appendChild() {} } },
  localStorage: undefined,
});
await import(new URL("day.config.js", root).href);
const cfg = globalThis.DAY_CONFIG;
ok(cfg && cfg.episodes, "day.config.js has no episodes section");
const E = cfg.episodes;
ok(E.storageKey === "icanbe.episodes.best", `storageKey is ${E.storageKey}`);
ok(Array.isArray(E.list) && E.list.length === 8, `expected 8 episodes, got ${E.list && E.list.length}`);

const ids = E.list.map((e) => e.id);
ok(ids.join(",") === "tutorial,morning,dry-park,lunch,still-blades,commute-home,low-tank,night", `episode ids are ${ids.join(",")}`);

const tut = E.list[0];
ok(tut.tutorial && tut.id === "tutorial", "the tutorial is first in the list");
ok(tut.goals.map((g) => g.power).join(",") === "bolt,rain,gale,fog,sunbreak", "the tutorial teaches the five abilities in order");
tut.goals.forEach((g, i) => ok(g.kind === "ability" && g.prompt && g.label && (i === 0 ? !g.after : g.after === tut.goals[i - 1].id), `tutorial goal ${g.id}: kind, prompt, label and a chain`));
ok(!matchEpisode(E.list, "ready", clockMinutes("7:55")).tutorial, "the tutorial is never matched by chapter");

E.list.filter((e) => !e.tutorial).forEach((ep) => {
  ok(ep.title && ep.tagline, `${ep.id}: needs title and tagline`);
  ok(Array.isArray(ep.chapters) && ep.chapters.length, `${ep.id}: needs chapters`);
  ok(ep.clock, `${ep.id}: needs a clock jump`);
  ok(Array.isArray(ep.goals) && ep.goals.length >= 2 && ep.goals.length <= 3, `${ep.id}: wants 2–3 goals, has ${ep.goals && ep.goals.length}`);
  ep.goals.forEach((g) => ok(g.id && g.kind && g.label, `${ep.id}/${g && g.id}: goal needs id, kind, label`));
});

ok(matchEpisode(E.list, "ready", clockMinutes("7:55")), "morning matches ready @ 7:55");
ok(matchEpisode(E.list, "lunch", clockMinutes("12:20")), "lunch matches lunch chapter");
ok(matchEpisode(E.list, "work", clockMinutes("17:55")), "commute-home matches work lot @ 17:55");
ok(!matchEpisode(E.list, "commute", clockMinutes("8:20")), "morning drive is not hurricane drive");
ok(!matchEpisode(E.list, "work", clockMinutes("17:55"), { inCar: true }), "no offer while driving");
ok(matchEpisode(E.list, "bedtime", clockMinutes("22:10")), "night matches bedtime");

// Story arc, Parts 1 and 2 (docs/story-arc-beat-sheet.md)
const p1 = E.list.find((e) => e.id === "dry-park");
const p2 = E.list.find((e) => e.id === "still-blades");
ok(p1 && p1.part === 1 && p2 && p2.part === 2, "Parts 1 and 2 are in the list");
ok(p1.strain.budget === 4 && p2.strain.budget === 7, "strain budgets are the sheet's 4 and 7");
ok(matchEpisode(E.list, "lunch", clockMinutes("11:50")).id === "dry-park", "Part 1 is offered at 11:50");
ok(matchEpisode(E.list, "lunch", clockMinutes("12:20")).id === "lunch", "the rod episode still owns 12:20");
ok(matchEpisode(E.list, "work", clockMinutes("16:40")).id === "still-blades", "Part 2 is offered at 16:40");
ok(matchEpisode(E.list, "work", clockMinutes("17:55")).id === "commute-home", "the hurricane drive still owns 17:55");
const powersOf = (ep) => ep.goals.filter((g) => g.kind === "ability-in").map((g) => g.power).join(",");
ok(powersOf(p1) === "rain,sunbreak", "Part 1 asks for rain then sun break");
ok(p2.goals.some((g) => g.kind === "wind-time" && g.seconds === 10), "Part 2 wants 10 s of wind");
ok(p1.goals[0].zone === "park" && p1.zones.park && p1.zones.market, "Part 1 has a park and a market zone");
[p1, p2].forEach((ep) => {
  ["start", "end:clean", "end:scarred", "edgy"].forEach((k) => ok(Array.isArray(ep.say[k]) && ep.say[k].length, `${ep.id}: dialogue for ${k}`));
  ep.goals.forEach((g) => ok(!g.after || ep.goals.some((x) => x.id === g.after), `${ep.id}/${g.id}: after points at a goal`));
  ok(ep.lines.done && ep.lines.scarred, `${ep.id}: a done and a scarred line`);
  Object.values(ep.say).forEach((ls) => ls.forEach((l) => ok(l.length === 2 && l[0] && l[1], `${ep.id}: a say line is [who, text]`)));
});
ok(p1.say["goal:rain-park"].some((l) => l[1] === "Look at them drink. Bless you.") && p1.say.start[0][1].startsWith("There you are. My tomatoes"), "Part 1 keeps the sheet's Birdie lines");
ok(p2.say["goal:ines"].some((l) => l[1] === "Steady."), "Part 2 keeps the sheet's 'Steady.'");
ok(p2.say["end:clean"].some((l) => l[1] === "Reservoir level: critical."), "Part 2 hands off to Part 3 with the Board");
ok(inZone(p1.zones.park, -6, 22.5) && !inZone(p1.zones.park, 118, 26), "the park zone has the bench, not the plaza");
ok(inZone(p1.zones.market, 118, 26) && !inZone(p1.zones.market, -6, 22.5), "the market zone has the fountain, not the park");
ok(!inZone(p2.zones.roofs, 118, 26) && !inZone(p2.zones.market, 157, 0.5), "the roofs and the market do not overlap");
ok(strainCost(E.strain, "rain", null, 0) === 1 && strainCost(E.strain, "rain", 0, 30) === 2 && strainCost(E.strain, "rain", 0, 90) === 1, "the same call inside 60 s costs double");
ok(strainCost(E.strain, "bolt", null, 0) === 2, "lightning costs 2");
const clean = scoreCard(3, 3, 100, 300, E.bands, { value: 2, budget: 4, kicks: 0, penalty: 25 });
const scar = scoreCard(3, 3, 100, 300, E.bands, { value: 6, budget: 4, kicks: 1, penalty: 25 });
ok(!clean.scarred && /clean$/.test(clean.text), `a part under budget is clean: ${clean.text}`);
ok(scar.scarred && /scarred$/.test(scar.text) && scar.pct === clean.pct - 25, `over budget is scarred and costs 25: ${scar.text}`);
ok(scoreCard(3, 3, 100, 300, E.bands, { value: 3, budget: 4, kicks: 1 }).scarred, "a kick-back scars even inside the budget");
ok(!/scarred|clean/.test(scoreCard(3, 3, 40, 150, E.bands).text), "episodes without strain keep the old card");

// The lunch episode (Rooftop storm): a rescue with three set pieces, a twist, an ending per rank and a rank S to C
const lunch = E.list.find((e) => e.id === "lunch");
ok(lunch && lunch.pieces && lunch.pieces.length === 3, "lunch has three set pieces");
ok(lunch.goals.length === 3 && lunch.goals.every((g) => g.kind === "help" && lunch.pieces.some((q) => q.id === g.piece && q.people.length === g.count)), "each lunch goal is a set piece with its people counted");
ok(lunch.goals.every((g, i) => (i === 0 ? !g.after : g.after === lunch.goals[i - 1].id)), "the set pieces chain in order");
ok(lunch.pieces.filter((q) => q.twist).length === 1 && lunch.pieces.find((q) => q.twist).id === "rescue" && Array.isArray(lunch.say.twist), "the twist fires after the second set piece and has lines");
["start", "twist", "end:S", "end:A", "end:B", "end:C"].forEach((k) => ok(Array.isArray(lunch.say[k]) && lunch.say[k].length, `lunch: dialogue for ${k}`));
lunch.pieces.forEach((q) => {
  ok(q.powers.length && q.range > 0 && q.limit > 0, `lunch/${q.id}: powers, range and limit`);
  ok(lunch.say["piece:" + q.id] && lunch.say["late:" + q.id], `lunch/${q.id}: opening and late lines`);
  q.people.forEach((p) => ok(p.id && p.name && p.thanks && Math.hypot(p.x, p.z) > 0, `lunch/${q.id}/${p.id}: a person with a thanks line`));
});
const pts = lunch.pieces.reduce((n, q) => n + q.people.length, 0) * lunch.rank.help + lunch.rank.precision + lunch.rank.time;
ok(pts === lunch.rank.max, `rank.max (${lunch.rank.max}) is every help + the rod + the full time bonus (${pts})`);
ok(["S", "A", "B", "C"].join() === lunch.rank.bands.map((b) => b.rank).join(), "rank bands run S, A, B, C");
const rk = (n) => rankFor(n, lunch.rank).rank;
ok(rk(lunch.rank.max) === "S" && rk(0) === "C" && rk(100) === "C", "full points is S, nothing is C");
ok(rk(6 * lunch.rank.help + lunch.rank.precision + 90) === "S", "everyone, the rod and most of the time left is S");
ok(rk(6 * lunch.rank.help) === "A" && rk(3 * lunch.rank.help) === "C" && rk(5 * lunch.rank.help) === "B", "more people helped is a higher rank");
ok(rk(6 * lunch.rank.late) < rk(6 * lunch.rank.help) || rankFor(6 * lunch.rank.late, lunch.rank).pct < rankFor(6 * lunch.rank.help, lunch.rank).pct, "late help is worth less");
ok(inZone(lunch.zones.plaza, 118, 30) && lunch.pieces[0].people.every((p) => inZone(lunch.zones.plaza, p.x, p.z)), "the shelter people stand in the plaza");

// Story arc, Part 3 and the three endings
const p3 = E.list.find((e) => e.id === "low-tank");
ok(p3 && p3.part === 3 && p3.afterPart === 2 && p3.strain.budget === 6, "Part 3 is in the list, after Part 2, budget 6");
ok(p3.goals.map((g) => g.id).join(",") === "charge,fill" && p3.gauge && p3.zones.tank, "Part 3 has charge and fill goals, a gauge and a tank zone");
ok(inZone(p3.zones.tank, 190, 44) && !inZone(p3.zones.tank, 118, 26), "the tank zone has the Storm Tank");
["start", "end:clean", "end:scarred", "edgy", "kick:flood", "kick:overcast"].forEach((k) => ok(Array.isArray(p3.say[k]) && p3.say[k].length, `low-tank: dialogue for ${k}`));
ok(p3.say.start[0][1] === "Reservoir level: critical. Please. Anyone with weather.", "Part 3 opens with the Board's line from the sheet");
const arcP2 = { parts: { 2: { strain: 7, at: 1000 } } };
ok(!matchEpisode(E.list, "bedtime", clockMinutes("22:30")) || matchEpisode(E.list, "bedtime", clockMinutes("22:30")).id !== "low-tank", "Part 3 is not offered before Part 2 is played");
ok(matchEpisode(E.list, "bedtime", clockMinutes("22:30"), { arc: arcP2 }).id === "low-tank", "Part 3 is offered at 22:30 once Part 2 is played");
ok(matchEpisode(E.list, "bedtime", clockMinutes("22:10")).id === "night", "the light show still owns 22:10");
ok(carryStrain({ parts: { 1: { strain: 4, at: 710 }, 2: { strain: 7, at: 1000 } } }, 1350, 3) === 1, "strain falls an hour at a time: 7 from 16:40 is 1 at 22:30, 4 from 11:50 is gone");
ok(carryStrain({ parts: { 2: { strain: 7, at: 1000 } } }, 1000, 3) === 7, "no time has passed, no strain has fallen");
const mk = (marks) => ({ parts: { 1: { scarred: marks[0] }, 2: { scarred: marks[1] }, 3: { scarred: marks[2] } } });
ok(pickEnding(mk([false, false, false]), 5, E.endings.rules) === "A", "three clean parts, calm Tank: Fair Weather");
ok(pickEnding(mk([false, false, false]), 7, E.endings.rules) === "B", "three clean parts, but the avenue flooded: Heavy Weather");
ok(pickEnding(mk([true, false, false]), 4, E.endings.rules) === "B", "one scarred part: Heavy Weather");
ok(pickEnding(mk([false, false, false]), 10, E.endings.rules) === "C", "strain 10 at the Tank: Overcast");
ok(pickEnding(mk([true, true, true]), 3, E.endings.rules) === "C", "all three scarred: Overcast");
ok(pickEnding({ parts: { 3: { scarred: false } } }, 3, E.endings.rules) === "B", "an unplayed part keeps it from Fair Weather");
["A", "B", "C"].forEach((k) => ok(E.endings[k] && E.endings[k].name && E.endings[k].scene && E.endings[k].last.length === 2, `ending ${k} has a name, scene and last line`));
ok(E.endings.A.last[1] === "Clear skies. He did that, and then stopped." && E.endings.B.last[1] === "It worked. It cost." && E.endings.C.last[0] === "He", "endings keep the sheet's last lines");
const fa = cityFared({ parts: { 1: { goals: ["rain-park", "stalls"], kicks: ["flood"] }, 2: { goals: ["turn"], kicks: [] }, 3: { goals: ["charge", "fill"], kicks: [] } } }, E.endings.fared);
ok(fa.map((f) => f.state).join(",") === "scar,ok,ok,ok" && fa.length === 4 && fa.every((f) => f.text && !/: (ok|scar|open)$/.test(f.text)), `the city fared: ${fa.map((f) => f.state)}`);
ok(cityFared({ parts: {} }, E.endings.fared).every((f) => f.state === "open"), "nothing played, every need open");

const card = scoreCard(3, 3, 40, 150, E.bands);
ok(card.pct >= 90, `full clear should be awesome-ish, got ${card.pct}% ${card.word}`);
ok(/Today's forecast: \d+% chance of /.test(card.text), `score text is "${card.text}"`);
const mid = scoreCard(1, 3, 0, 150, E.bands);
ok(mid.pct < 50, `1/3 goals should be low, got ${mid.pct}`);

const mem = {
  _d: {},
  getItem(k) {
    return this._d[k] ?? null;
  },
  setItem(k, v) {
    this._d[k] = String(v);
  },
};
ok(saveBest(E.storageKey, {}, mem), "saveBest works");
const r1 = recordBest(E.storageKey, "morning", { pct: 80, word: "great weather", text: "x" }, mem);
ok(r1.improved, "first score is a best");
const r2 = recordBest(E.storageKey, "morning", { pct: 70, word: "drama", text: "y" }, mem);
ok(!r2.improved, "lower score must not replace best");
ok(loadBest(E.storageKey, mem).morning.pct === 80, "best stays 80");
const r3 = recordBest(E.storageKey, "morning", { pct: 95, word: "awesome", text: "z" }, mem);
ok(r3.improved && loadBest(E.storageKey, mem).morning.pct === 95, "higher score replaces best");

ok(clockMinutes("7:55") === 7 * 60 + 55, "clockMinutes 7:55");
ok(clockMinutes("18:00") === 18 * 60, "clockMinutes 18:00");

if (problems.length) {
  console.error("check-episodes failed:");
  problems.forEach((p) => console.error(" -", p));
  process.exit(1);
}
console.log("check-episodes: ok");

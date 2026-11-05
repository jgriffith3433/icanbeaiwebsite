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
ok(Array.isArray(E.list) && E.list.length === 7, `expected 7 episodes, got ${E.list && E.list.length}`);

const ids = E.list.map((e) => e.id);
ok(ids.join(",") === "tutorial,morning,dry-park,lunch,still-blades,commute-home,night", `episode ids are ${ids.join(",")}`);

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

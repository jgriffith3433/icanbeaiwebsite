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
ok(Array.isArray(E.list) && E.list.length === 4, `expected 4 episodes, got ${E.list && E.list.length}`);

const ids = E.list.map((e) => e.id);
ok(ids.join(",") === "morning,lunch,commute-home,night", `episode ids are ${ids.join(",")}`);

E.list.forEach((ep) => {
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

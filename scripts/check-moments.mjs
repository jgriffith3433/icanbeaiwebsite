// The turning-point moments' data (day.config.js moments.turning): one per episode beat, 8 s or less, each with a real
// episode, a real beat, spoken lines that exist (and have a clip in the build), a one-line caption that is the line's own
// words, a music sting the score knows, and a camera that stays above ground. No page.
//   node scripts/check-moments.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
Object.assign(globalThis, { window: globalThis });
await import(new URL('day.config.js', root).href);
const { lineId } = await import(new URL('js/dialogue.js', root).href);
const cfg = globalThis.DAY_CONFIG;
const T = (cfg.moments && cfg.moments.turning) || {};
const eps = (cfg.episodes && cfg.episodes.list) || [];
const clips = new Set(JSON.parse(fs.readFileSync(new URL('audio/dialogue/index.json', root), 'utf8')).files);
const score = fs.readFileSync(new URL('js/score.js', root), 'utf8');
let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.error('FAIL', m); } };

const want = ['dry-park', 'still-blades', 'low-tank', 'lunch', 'commute-home'];
want.forEach((id) => ok(T[id], `${id} has no turning-point moment`));
Object.keys(T).forEach((id) => {
  const m = T[id];
  const ep = eps.find((e) => e.id === id);
  ok(ep, `${id}: no such episode`);
  if (!ep) return;
  ok(m.secs > 0 && m.secs <= 8, `${id}: ${m.secs} s is over 8`);
  ok(m.on === 'twist' ? !!(ep.pieces || []).some((p) => p.twist) : (ep.goals || []).some((g) => 'goal:' + g.id === m.on), `${id}: beat ${m.on} isn't in the episode`);
  ok(new RegExp(`\\b${m.sting}:`).test(score), `${id}: the score has no sting "${m.sting}"`);
  const s = m.shot || {};
  ['tx', 'ty', 'tz', 'alpha', 'beta', 'radius'].forEach((k) => ok(s[k] != null, `${id}: shot has no ${k}`));
  [].concat(s.beta || []).forEach((b) => ok(b > 0.5 && b < 1.45, `${id}: beta ${b} puts the camera too low or straight overhead`));
  ok(Math.min(...[].concat(s.radius)) >= 14, `${id}: the camera comes closer than 14 m`);
  const keys = [m.say.key, m.say.scarredKey].filter(Boolean);
  keys.forEach((k) => ok(ep.say && ep.say[k], `${id}: no say key ${k}`));
  ok(m.say.play.length >= 1, `${id}: no line to play`);
  m.say.play.forEach((p) => {
    keys.forEach((k) => {
      const line = ep.say[k] && ep.say[k][p.i];
      ok(line, `${id}: ${k} has no line ${p.i}`);
      if (!line) return;
      ok(p.at >= 0 && p.at + 1 <= m.secs, `${id}: line ${p.i} starts at ${p.at} s in a ${m.secs} s moment`);
      const cap = p.caption || line[1];
      ok(cap.length <= 40, `${id}: caption "${cap}" is ${cap.length} characters: too long for one line on a phone`);
      ok(line[1].includes(cap), `${id}: caption "${cap}" isn't the line's own words`);
      ok(line[0] === 'He' ? !/\b(he|him|his)\b/i.test(line[1]) : true, `${id}: "${line[1]}" is narration, not a spoken line`);
      ok(clips.has(`audio/dialogue/${lineId(line[0], line[1])}.mp3`), `${id}: no voice clip for ${line[0]}: ${line[1]}`);
    });
  });
  // the toast it replaces
  ok(!!(ep.toasts && ep.toasts[m.on]) || m.on === 'twist', `${id}: nothing for the moment to replace at ${m.on}`);
});
if (failed) { console.error(`check-moments: ${failed} failure(s)`); process.exit(1); }
console.log(`check-moments: ok (${Object.keys(T).length} turning points, each 8 s or less with a sting, a voiced line and a one-line caption)`);

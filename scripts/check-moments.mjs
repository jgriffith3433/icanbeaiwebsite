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

// the five-chapter arc (day.config.js `arc`): an opener of 20 s or less each, a title in the world, He and Pilot spoken
const arc = cfg.arc || [];
ok(arc.length === 5, `the arc has ${arc.length} chapters, not 5`);
const pilotLines = (cfg.pilot && cfg.pilot.lines) || [];
const inArc = new Set();
arc.forEach((c, i) => {
  const O = c.opener || {};
  ok(c.n === i + 1 && c.title && c.line, `chapter ${i + 1}: needs n, title and line`);
  ok(O.secs > 0 && O.secs <= 20, `chapter ${c.n}: opener is ${O.secs} s (20 at most)`);
  ok(O.sign && (O.sign.kind === 'cloud' || O.sign.kind === 'billboard') && O.sign.w >= 12, `chapter ${c.n}: the title must be a cloud or billboard sign in the world`);
  ok(O.shot && O.shot.ty && (Array.isArray(O.shot.ty) ? O.shot.ty[0] : O.shot.ty) >= 30, `chapter ${c.n}: the camera hangs above the rooftops`);
  ok(/score|drought|turbines|tank|twist|bridge/.test(O.sting || ''), `chapter ${c.n}: unknown sting ${O.sting}`);
  const who = (O.lines || []).map((l) => l.who);
  ok(who.includes('He') && who.includes('Pilot'), `chapter ${c.n}: needs a He line and a Pilot line`);
  (O.lines || []).forEach((l) => {
    ok(l.at + 4 <= O.secs, `chapter ${c.n}: "${l.text}" starts too late to finish`);
    ok((l.caption || l.text).length <= 40, `chapter ${c.n}: caption for "${l.text}" is too long for one phone line`);
    ok((l.caption ? l.text.includes(l.caption) : true), `chapter ${c.n}: caption isn't the line's own words`);
    if (l.who === 'Pilot') ok(pilotLines.some((p) => p.id === l.id && p.text === l.text && p.file), `chapter ${c.n}: Pilot line "${l.text}" isn't in pilot.lines`);
    else ok(!/\b(he|him|his)\b/i.test(l.text), `chapter ${c.n}: "${l.text}" is narration, not a spoken line`);
  });
  (c.episodes || []).forEach((id) => { inArc.add(id); const ep = eps.find((e) => e.id === id); ok(ep && ep.chapter === c.n, `chapter ${c.n}: episode ${id} doesn't say chapter ${c.n}`); });
});
eps.forEach((e) => ok(inArc.has(e.id), `episode ${e.id} is in no chapter`));
if (failed) { console.error(`check-moments: ${failed} failure(s)`); process.exit(1); }
console.log(`check-moments: ok (${Object.keys(T).length} turning points, each 8 s or less with a sting, a voiced line and a one-line caption)`);

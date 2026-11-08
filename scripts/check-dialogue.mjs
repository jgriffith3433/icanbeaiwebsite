// Spoken dialogue: every story and neighbor line has a speaker's voice, a recipe and a file path, and each one plays
// (in the right voice's clip, once Sound is on, one at a time, ducking the music) when its clip is in the build. A line
// whose clip isn't in the build stays silent and keeps its babble, so nothing 404s. No page, no network.
//   node scripts/check-dialogue.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const listeners = new Map();
Object.assign(globalThis, {
  window: globalThis,
  addEventListener: (t, f) => listeners.set(t, [...(listeners.get(t) || []), f]),
  CustomEvent: class {
    constructor(type, o) {
      this.type = type;
      this.detail = o && o.detail;
    }
  },
});
globalThis.dispatchEvent = (e) => (listeners.get(e.type) || []).forEach((f) => f(e));
await import(new URL('day.config.js', root).href);
const { dialogueLines, startDialogue, lineId } = await import(new URL('js/dialogue.js', root).href);
const cfg = globalThis.DAY_CONFIG;

let failed = 0;
const ok = (cond, msg) => {
  if (!cond) {
    failed++;
    console.error('FAIL', msg);
  }
};

// 1. The lines: story and neighbors, each with a voice, short enough to hear in passing (quality rule 6).
const lines = dialogueLines(cfg);
ok(lines.length >= 80, `only ${lines.length} spoken lines`);
ok(lines.some((L) => L.where.startsWith('neighbor:')), 'no neighbor beats are spoken');
const ids = new Set(lines.map((L) => L.id));
ok(ids.size === lines.length, 'two lines share an id');
lines.forEach((L) => {
  ok(/^[A-Za-z0-9]{20}$/.test(L.voice), `${L.id} (${L.who}) has no ElevenLabs voice id`);
  ok(L.file === `audio/dialogue/${L.id}.mp3` && L.id === lineId(L.who, L.text), `${L.id} file path is ${L.file}`);
  ok(L.text.length <= 140, `${L.id} is ${L.text.length} characters, too long to hear in passing: "${L.text}"`);
  ok(!(L.who === 'He' && /\b(he|him|his)\b/i.test(L.text)), `${L.id}: his own voice says a third-person line`);
});
const cast = (cfg.dialogue && cfg.dialogue.cast) || {};
['He', 'Birdie', 'Dex', 'Ines'].forEach((w) => ok(cast[w], `${w} has no voice in dialogue.cast`));

// 2. hawkes.assets.json has one recipe per line and audio/dialogue/index.json lists exactly the clips on disk.
const { expected, current } = await import(new URL('scripts/sync-dialogue.mjs', root).href);
const want = expected();
const have = current();
ok(JSON.stringify(have.recipes) === JSON.stringify(want.recipes), 'hawkes.assets.json dialogue recipes are out of date: run node scripts/sync-dialogue.mjs');
ok(JSON.stringify(have.index) === JSON.stringify(want.index), 'audio/dialogue/index.json does not match the clips on disk: run node scripts/sync-dialogue.mjs');
want.index.files.forEach((f) => ok(lines.some((L) => L.file === f), `${f} is on disk but no line uses it`));

// 3. Each line plays: with every clip present and Sound on, the line's event plays its own clip.
const played = [];
class FakeAudio {
  constructor(src) {
    this.src = src;
    this.paused = false;
    played.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}
let sound = true;
const ducks = [];
globalThis.addEventListener('day:dialogue', (e) => ducks.push(e.detail));
const day = {};
const api = startDialogue(day, { files: lines.map((L) => L.file), Audio: FakeAudio, soundOn: () => sound });
ok(day.dialogue === api, 'day.dialogue is not set');
const beatOf = new Map();
(cfg.neighbors.list || []).forEach((p) => (p.beats || []).forEach((b) => beatOf.set(b.id, b)));
let unplayed = [];
lines.forEach((L) => {
  const before = played.length;
  if (L.where.startsWith('neighbor:')) {
    const beat = L.where.slice('neighbor:'.length);
    globalThis.dispatchEvent(new CustomEvent('day:neighbor', { detail: { action: 'beat', beat, text: beatOf.get(beat).text } }));
  } else {
    globalThis.dispatchEvent(new CustomEvent('day:story', { detail: { action: 'say', who: L.who, text: L.text } }));
  }
  const a = played[played.length - 1];
  if (played.length !== before + 1 || a.src !== L.file) unplayed.push(L.id);
});
ok(unplayed.length === 0, `${unplayed.length} lines did not play their clip: ${unplayed.slice(0, 5).join(', ')}`);
ok(played.slice(0, -1).every((a) => a.paused), 'a new line did not stop the one before it');
ok(ducks.length === lines.length && ducks.every((d) => d.action === 'say' && ids.has(d.id)), `day:dialogue fired ${ducks.length} times for ${lines.length} lines`);
ok(lines.every((L) => api.voiced(L.who, L.text)), 'a line with its clip is not marked voiced (sfx would babble over it)');

// 4. Sound off: nothing plays and every line keeps its babble.
sound = false;
const n = played.length;
globalThis.dispatchEvent(new CustomEvent('day:story', { detail: { action: 'say', who: lines[0].who, text: lines[0].text } }));
ok(played.length === n, 'a line played with Sound off');
ok(!api.voiced(lines[0].who, lines[0].text), 'a line counts as voiced with Sound off');

// 5. Clip missing from the build: no Audio, no 404, babble stays.
sound = true;
const day2 = {};
const played2 = played.length;
const api2 = startDialogue(day2, { files: [], Audio: FakeAudio, soundOn: () => true });
ok(api2.speak(lines[0].who, lines[0].text) === null && played.length === played2, 'a line without its clip tried to play');
ok(!api2.voiced(lines[0].who, lines[0].text), 'a line without its clip counts as voiced');

// 6. js/sfx.js and js/score.js listen: babble skips voiced lines, the music ducks under day:dialogue.
const sfx = fs.readFileSync(new URL('js/sfx.js', root), 'utf8');
const score = fs.readFileSync(new URL('js/score.js', root), 'utf8');
ok(/dialogue\.voiced\(/.test(sfx) && /dialogue\.beatVoiced\(/.test(sfx), 'js/sfx.js does not skip babble under voiced lines');
ok(/"day:dialogue"/.test(score), 'js/score.js does not duck the music under day:dialogue');

if (failed) {
  console.error(`check-dialogue: ${failed} failed`);
  process.exit(1);
}
console.log(`check-dialogue: ok (${lines.length} lines, ${want.index.files.length} clips in the build)`);
process.exit(0);

// js/sfx.js without a browser: a stand-in AudioContext and a stand-in day, then the events the game sends. Checks that
// every player action, episode beat and story line makes a sound (the "a living world" quality rule: feedback is heard,
// not only read), that the Sound button off means silence, and that moving him gives steps, a jump and a landing.
//
//   node scripts/check-sfx.mjs   (part of npm test)
const problems = [];
const ok = (c, m) => (c ? true : (problems.push(m), false));

// ---- a WebAudio stand-in: every node takes any call ----
let started = 0;
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
const node = () => ({ connect() {}, disconnect() {}, start() { started++; }, stop() {}, frequency: param(), Q: param(), gain: param(), pan: param(), playbackRate: param(), type: '', buffer: null, loop: false });
class FakeCtx {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); }
  resume() { return Promise.resolve(); }
  createGain() { return node(); }
  createBiquadFilter() { return node(); }
  createOscillator() { return node(); }
  createBufferSource() { return node(); }
  createStereoPanner() { return node(); }
  createDynamicsCompressor() { return node(); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
}

// ---- the page and the day ----
const listeners = {};
let pressed = 'true';
const soundBtn = { getAttribute: () => pressed };
const observers = [];
const scene = { onBeforeRenderObservable: { add: (fn) => observers.push(fn) }, getEngine: () => ({ getDeltaTime: () => 16 }), activeCamera: null };
let st = { mode: 'schedule', x: 0, y: 0, z: 0, speed: 0, grounded: true, jumps: 0 };
const day = {
  world: () => ({ scene }),
  control: { state: () => st },
  weather: { now: () => ({ state: 'rain', wet: 1 }) },
  powers: { now: () => ({ strike: { x: 3, z: 4 }, tornado: null }) },
  crowd: { info: () => ({ cars: 20 }) },
  now: () => ({ minutes: 8 * 60 }),
};
Object.assign(globalThis, {
  window: globalThis,
  day,
  BABYLON: { Axis: { X: {} } },
  AudioContext: FakeCtx,
  document: { getElementById: (id) => (id === 'sound' ? soundBtn : null) },
  addEventListener: (type, fn) => (listeners[type] = listeners[type] || []).push(fn),
});
await import(new URL('../js/sfx.js', import.meta.url).href);
ok(day.sfx && day.sfx.info, 'js/sfx.js did not install day.sfx');
const send = (type, detail) => (listeners[type] || []).forEach((fn) => fn({ detail }));
const frames = (n) => { for (let i = 0; i < n; i++) observers.forEach((fn) => fn()); };
const heard = () => day.sfx.info().heard;

// Sound off: nothing at all.
pressed = 'false';
send('day:episode', { action: 'goal' });
ok(started === 0, `sound plays with the Sound button off (${started} sources)`);
pressed = 'true';

// Every beat the player causes is heard.
const beats = [
  ['day:episode', { action: 'goal' }, 'goal'],
  ['day:episode', { action: 'goal-failed' }, 'fail'],
  ['day:episode', { action: 'hurt' }, 'fail'],
  ['day:episode', { action: 'piece' }, 'blip'],
  ['day:episode', { action: 'kick' }, 'rumble'],
  ['day:episode', { action: 'unlock' }, 'unlock'],
  ['day:episode', { action: 'score', cleared: true }, 'fanfare'],
  ['day:episode', { action: 'score', cleared: false }, 'fanfare-minor'],
  ['day:episode', { action: 'show-cue', grade: 'perfect' }, 'cue-perfect'],
  ['day:episode', { action: 'show-miss' }, 'cue-off'],
  ['day:episode', { action: 'ending' }, 'pad'],
  ['day:story', { action: 'say', who: 'Ines', text: 'The river is rising, you need to slow it down.' }, 'babble'],
  ['day:neighbor', { action: 'beat', id: 'birdie', text: 'Could you water my tomatoes?' }, 'babble'],
  ['day:neighbor', { action: 'reward', id: 'birdie' }, 'goal'],
  ['day:power', { action: 'bolt' }, 'bolt-crack'],
  ['day:power', { action: 'denied' }, 'denied'],
  ['day:control', { action: 'let-go' }, 'let-go'],
  ['day:control', { action: 'updraft' }, 'updraft'],
];
for (const [type, detail, name] of beats) {
  const before = heard()[name] || 0;
  send(type, detail);
  ok((heard()[name] || 0) > before, `${type} ${detail.action}${detail.grade ? ' ' + detail.grade : ''} makes no sound (${name})`);
}

// Moving him: steps while he walks, a jump, a landing with dust.
st = { mode: 'control', x: 0, y: 0, z: 0, speed: 2.25, grounded: true, jumps: 0 };
frames(120); // 2 s of walking
ok((heard().step || 0) >= 4, `only ${heard().step || 0} footsteps in 2 s of walking`);
st = { ...st, grounded: false, jumps: 1, y: 3 };
frames(2);
ok((heard().jump || 0) >= 1, 'a jump makes no sound');
st = { ...st, grounded: true, y: 0 };
frames(2);
ok((heard().land || 0) >= 1, 'landing from 3 m makes no sound');

// Rooftop surfaces: gravel, metal, tar, and puddle splash
window.DAY_CONFIG = {
  city: {
    blocks: [
      { id: 'apt', x: -24, z: 0.5, w: 16, d: 12, h: 6.16, stair: { x0: -28.5, x1: -17, z: 7.2, w: 1.45 } },
    ],
  },
};
ok(day.sfx.surfaceAt(-24, 6.16, 0.5, false) === 'gravel', 'apt roof centre is gravel');
ok(day.sfx.surfaceAt(-21, 6.16, 0.5, false) === 'metal', 'apt roof east grating is metal');
ok(day.sfx.surfaceAt(-28.2, 6.16, -0.2, false) === 'tar', 'apt roof west membrane is tar');
ok(day.sfx.surfaceAt(-26.2, 6.16, 2.1, false) === 'puddle', 'apt roof drain basin is puddle');
for (const surf of ['gravel', 'metal', 'tar', 'puddle']) {
  day.sfx.step(surf);
  ok((heard()['step-' + surf] || 0) >= 1, `rooftop footstep on ${surf} did not play`);
  ok((day.sfx.info().surfaces[surf] || 0) >= 1, `rooftop surface counter for ${surf} did not increment`);
}

// The city: birds by day, cars when the crowd has cars (rain here, so no birds yet).
frames(60 * 20);
ok((heard().car || 0) >= 1, 'no passing cars in 20 s with 20 cars about');
ok(!(heard().bird || 0), 'birds sing in the rain');
day.weather.now = () => ({ state: 'clear', wet: 0 });
frames(60 * 20);
ok((heard().bird || 0) >= 1, 'no birds in 20 s of a clear morning');

if (problems.length) {
  console.error('check-sfx: ' + problems.length + ' problem(s)\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log(`check-sfx: ok (${Object.keys(heard()).length} kinds of sound: ${Object.entries(heard()).map(([k, v]) => k + ' ' + v).join(', ')})`);

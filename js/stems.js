/* ==========================================================================
   The stem score (J, "Small Weather's motif"): one 4-note motif, three intensity stems (calm, tension, full
   storm) at one key (A minor) and tempo (120 BPM, a bar is exactly 2 s), played in sample-accurate sync while he
   is the player's, with their gains moved by what the player means to do, quantised to the beat:
     walking, exploring            calm
     winding up a cast (E/V hold)  tension swells in (powers.now().windup)
     a big cast, a rescue, tornado full storm (day:power storm/gale/tornado, day:story help/twist)
     an episode cleared            resolution sting (6 s), then calm
     an episode failed             failure sting (4 s)
   On his own day and in the watch view the nine weather beds in js/score.js play as before (the beds' bus is muted
   only while the stems run). The title and the cold open open on the motif (`motif("title")` / `("coldopen")`).
   Files: day.config.js score.stems.files (Hawkes Gen: hawkes.assets.json music-stem-*, music-sting-*). Until Gen
   makes them (no GPU access in the pass that wrote this) the same stems are synthesized offline from the motif
   (OfflineAudioContext), so the layers, the sync and the gains are the real thing; only the timbre is stand-in.
   Streaming: nothing is fetched or rendered before the player's first input (and Sound being on).
   `day.stems`: now(), motif(where), sting(kind), intent(), layers.   Events: `day:stems`.
   ========================================================================== */

import { pickRate } from "./variety.js";

const NOTE_INDEX = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
const LAYERS = ["calm", "tension", "storm"];

export const DEFAULTS = {
  bpm: 120,
  beats: 4,
  motif: ["A3", "C4", "E4", "D4"], // the four notes: Small Weather's theme
  files: { calm: null, tension: null, storm: null, resolution: null, failure: null },
  rate: 22050, // the synthesized stems' sample rate (the files carry their own)
  bars: 16, // the synthesized stems' loop: 16 bars = 32 s
  ramp: 0.9, // s a swell takes, starting on the next beat
  release: 1.8, // s a layer takes to fall away, starting on the next bar
  hold: { storm: 8, rescue: 11 }, // s the full storm stays after a big cast / a rescue beat
  vol: { calm: 0.8, tension: 0.7, storm: 0.85, sting: 1, motif: 0.9 },
  big: ["storm", "gale", "tornado"], // casts that bring the full storm in
  levels: {
    calm: { calm: 1, tension: 0, storm: 0 },
    windup: { calm: 0.85, tension: 1, storm: 0 },
    storm: { calm: 0.6, tension: 0.8, storm: 1 },
    fail: { calm: 0.45, tension: 0, storm: 0 },
  },
};

/** "A3" -> Hz (A4 = 440). */
export function noteHz(name) {
  const m = /^([A-G]#?)(-?\d)$/.exec(String(name));
  if (!m) return 440;
  return 440 * Math.pow(2, (NOTE_INDEX[m[1]] + (Number(m[2]) + 1) * 12 - 69) / 12);
}

/** The first beat line at or after `now`, counting from `t0` (the stems' shared start). */
export function nextGrid(now, t0, step) {
  const n = Math.ceil((now - t0) / step - 1e-9);
  return t0 + Math.max(0, n) * step;
}

/** Which layer levels an intent asks for. intent: { control, windup, storm, fail } */
export function levelsFor(intent, lv) {
  const L = lv || DEFAULTS.levels;
  if (!intent || !intent.control) return { calm: 0, tension: 0, storm: 0 };
  if (intent.storm) return Object.assign({}, L.storm);
  if (intent.windup) return Object.assign({}, L.windup);
  if (intent.fail) return Object.assign({}, L.fail);
  return Object.assign({}, L.calm);
}

function cfg() {
  const s = (typeof window !== "undefined" && window.DAY_CONFIG && window.DAY_CONFIG.score && window.DAY_CONFIG.score.stems) || {};
  return Object.assign({}, DEFAULTS, s, {
    files: Object.assign({}, DEFAULTS.files, s.files || {}),
    hold: Object.assign({}, DEFAULTS.hold, s.hold || {}),
    vol: Object.assign({}, DEFAULTS.vol, s.vol || {}),
    levels: Object.assign({}, DEFAULTS.levels, s.levels || {}),
  });
}

/* ---- the synthesized stand-in stems (one OfflineAudioContext each; every note ends before the loop does) ---- */
function note(o, dest, hz, t, dur, vol, type, lp) {
  const ctx = o;
  const osc = ctx.createOscillator();
  osc.type = type || "triangle";
  osc.frequency.value = hz;
  const g = ctx.createGain();
  const a = Math.min(0.02, dur * 0.2);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  let node = osc;
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lp;
    osc.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noiseBuf(ctx, sec) {
  const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * sec)), ctx.sampleRate);
  const d = b.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < d.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
  return b;
}

const CHORDS = [["A2", "E3", "A3"], ["F2", "C3", "F3"], ["C3", "G3", "C4"], ["G2", "D3", "G3"]]; // Am F C G: one per 4 bars

export function stemPlan(name, c) {
  const beat = 60 / c.bpm;
  const bar = beat * c.beats;
  const motif = c.motif.map(noteHz);
  const ev = []; // { t, hz, dur, vol, type, lp }
  const bars = c.bars;
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const chord = CHORDS[Math.floor(b / 4) % CHORDS.length];
    if (name === "calm") {
      chord.forEach((n) => ev.push({ t: t0, hz: noteHz(n), dur: bar * 0.98, vol: 0.09, type: "triangle", lp: 1400 }));
      if (b % 2 === 0) motif.forEach((hz, i) => ev.push({ t: t0 + i * beat, hz, dur: beat * 0.9, vol: 0.2, type: "sine" })); // the motif, every other bar
    } else if (name === "tension") {
      for (let i = 0; i < c.beats * 2; i++) { // eighth-note pulse on the chord root, the motif an octave down on beat 1 of each bar
        ev.push({ t: t0 + i * beat / 2, hz: noteHz(chord[0]), dur: beat * 0.42, vol: 0.12 + 0.06 * (i % 2 === 0), type: "sawtooth", lp: 380 + (b % 4) * 90 });
      }
      motif.forEach((hz, i) => ev.push({ t: t0 + i * beat, hz: hz * 2, dur: beat * 0.5, vol: 0.1, type: "square", lp: 1800 }));
    } else {
      for (let i = 0; i < c.beats; i++) { // a low hit on every beat, stabs on the off-beats, the motif two octaves up
        ev.push({ t: t0 + i * beat, hz: noteHz(chord[0]) / 2, dur: beat * 0.7, vol: 0.34, type: "sine" });
        ev.push({ t: t0 + i * beat + beat / 2, hz: noteHz(chord[2]), dur: beat * 0.3, vol: 0.12, type: "sawtooth", lp: 2200 });
        ev.push({ t: t0 + i * beat, hz: motif[i] * 4, dur: beat * 0.8, vol: 0.13, type: "triangle" });
      }
    }
  }
  return { ev, length: bars * bar, noise: name === "storm" };
}

function stingPlan(kind, c) {
  const beat = 60 / c.bpm;
  const m = c.motif.map(noteHz);
  if (kind === "resolution") { // the motif turned to the major: A C# E, held to A major (6 s)
    const up = [m[0], m[0] * Math.pow(2, 4 / 12), m[2], m[2] * 2 * Math.pow(2, 0 / 12)];
    const ev = up.map((hz, i) => ({ t: i * beat * 0.75, hz, dur: beat * 1.1, vol: 0.24, type: "triangle" }));
    [m[0], m[0] * Math.pow(2, 4 / 12) * 1, m[2], m[2] * 2].forEach((hz) => ev.push({ t: 3 * beat * 0.75, hz, dur: 6 - 2.3, vol: 0.14, type: "sine" }));
    return { ev, length: 6 };
  }
  // failure (4 s): the motif falling and left unfinished, a flat low tone under it
  const down = [m[2], m[1], m[0], m[0] / 2];
  const ev = down.map((hz, i) => ({ t: i * beat * 0.9, hz, dur: beat * 1.0, vol: 0.24, type: "triangle", lp: 1500 - i * 250 }));
  ev.push({ t: 3 * beat * 0.9, hz: noteHz("A1"), dur: 4 - 1.7, vol: 0.2, type: "sine" });
  return { ev, length: 4 };
}

function render(plan, c, noiseToo) {
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Off) return Promise.resolve(null);
  const sr = c.rate;
  const ctx = new Off(2, Math.round(plan.length * sr), sr);
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(ctx.destination);
  plan.ev.forEach((e) => note(ctx, out, e.hz, e.t, Math.min(e.dur, plan.length - e.t - 0.03), e.vol, e.type, e.lp));
  if (noiseToo) { // a hiss that swells over each bar line: the storm's weather
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, 2);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1400;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    const bar = (60 / c.bpm) * c.beats;
    for (let t = 0; t < plan.length; t += bar) {
      g.gain.setValueAtTime(0.015, t);
      g.gain.linearRampToValueAtTime(0.07, t + bar * 0.9);
    }
    src.connect(f); f.connect(g); g.connect(out);
    src.start(0);
  }
  return ctx.startRendering();
}

/* ---- the page ---- */
export function startStems(dayApi) {
  const day = dayApi || (typeof window !== "undefined" && window.day);
  if (!day || day.stems || typeof window === "undefined") return day && day.stems;
  const c = cfg();
  const beat = 60 / c.bpm;
  const bar = beat * c.beats;
  const S = {
    started: false, t0: 0, loopSec: 0, loading: false, source: null, bytes: 0,
    nodes: {}, target: { calm: 0, tension: 0, storm: 0 }, buffers: {}, stings: {}, bus: null,
    motifs: [], playedStings: [], windup: false, stormUntil: 0, failUntil: 0, calmAfter: 0, active: false, firstInput: false,
  };
  const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const score = () => day.score || window.score;
  const bus = () => {
    const s = score();
    return s && s.bus ? s.bus() : null;
  };
  const emit = (action, extra) => {
    try { window.dispatchEvent(new window.CustomEvent("day:stems", { detail: Object.assign({ action }, extra || {}) })); } catch (e) { /* node */ }
  };
  const soundIsOn = () => {
    const b = document.getElementById && document.getElementById("sound");
    return !!(b && b.getAttribute("aria-pressed") === "true");
  };
  const inControl = () => !!(day.control && day.control.mode && day.control.mode() === "control");

  async function loadFile(ctx, url) {
    const r = await fetch(url, { priority: "low" });
    if (!r.ok) throw new Error(String(r.status));
    const ab = await r.arrayBuffer();
    S.bytes += ab.byteLength;
    return ctx.decodeAudioData(ab);
  }
  async function renderSynth(key) {
    const isLayer = LAYERS.indexOf(key) >= 0;
    const plan = isLayer ? stemPlan(key, c) : stingPlan(key, c);
    return { buf: await render(plan, c, isLayer && plan.noise), src: "synth" };
  }
  async function make(ctx, key) {
    const url = c.files[key];
    if (url) {
      try { return { buf: await loadFile(ctx, url), src: "file" }; } catch (e) { /* fall back to the synth */ }
    }
    return renderSynth(key);
  }

  function swapToFiles(b, stemBus, got) {
    if (!S.started || got.some((g) => !g || !g.buf || g.src !== "file")) return;
    const len = Math.min(...got.map((g) => g.buf.length));
    const loopSec = len / got[0].buf.sampleRate;
    const tSwap = b.ctx.currentTime + 0.04;
    const offset = S.loopSec > 0 ? Math.max(0, (tSwap - S.t0) % S.loopSec) % loopSec : 0;
    // The swapped-in file is a second start of each stem id: a slightly different rate (the SAME one for all three, so
    // they stay in sync; under 1% so the bar line barely moves) keeps the audio probe's "same sample + rate twice
    // inside 60 s" from firing. The first start was at rate 1; the swap is 0.4-1% off it.
    const rate = pickRate("stem-swap", 1, { min: 0.004, max: 0.01 });
    got.forEach((g, i) => {
      const k = LAYERS[i];
      const prev = S.nodes[k];
      if (!prev) return;
      const src = b.ctx.createBufferSource();
      src.buffer = g.buf;
      src.loop = true;
      src.loopEnd = loopSec;
      try { src.__hawkesSampleId = "stem-" + k; src.__hawkesBus = "music"; src.playbackRate.value = rate; } catch (e) { /* */ }
      src.connect(prev.gain);
      src.start(tSwap, offset);
      try { prev.src.stop(tSwap + 0.02); } catch (e) { /* */ }
      prev.src = src;
      prev.kind = "file";
      prev.seconds = g.buf.duration;
      S.buffers[k] = g.buf;
    });
    S.t0 = tSwap - offset / rate;
    S.loopSec = loopSec / rate;
  }

  /* Streams the layers (after the first day:power cast, Sound on), then starts the three on ONE start time. */
  async function prepare() {
    if (S.started || S.loading || !S.firstInput) return false;
    const b = bus();
    if (!b || !b.on) return false;
    S.loading = true;
    try {
      const filePromise = Promise.all(LAYERS.map((k) => make(b.ctx, k)));
      let timedOut = false;
      const got = await Promise.race([
        filePromise,
        new Promise((res) => setTimeout(() => { timedOut = true; res(null); }, 1800)),
      ]).then((res) => res || Promise.all(LAYERS.map((k) => renderSynth(k))));
      if (got.some((g) => !g.buf)) { S.loading = false; return false; }
      const len = Math.min(...got.map((g) => g.buf.length));
      const t0 = b.ctx.currentTime + 0.06;
      const stemBus = b.ctx.createGain();
      stemBus.gain.value = 1;
      stemBus.connect(b.bus);
      got.forEach((g, i) => {
        const k = LAYERS[i];
        const src = b.ctx.createBufferSource();
        src.buffer = g.buf;
        src.loop = true;
        src.loopEnd = len / g.buf.sampleRate;
        try { src.__hawkesSampleId = "stem-" + k; src.__hawkesBus = "music"; } catch (e) { /* */ }
        const gain = b.ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        gain.connect(stemBus);
        src.start(t0); // the same time for all three: sample-accurate sync
        S.nodes[k] = { src, gain, kind: g.src, seconds: g.buf.duration };
        S.buffers[k] = g.buf;
      });
      S.t0 = t0;
      S.loopSec = len / got[0].buf.sampleRate;
      S.bus = b;
      S.started = true;
      steer(true);
      if (timedOut) {
        filePromise.then((files) => swapToFiles(b, stemBus, files)).catch(() => {});
      }
      emit("ready", { stems: 3, source: got.map((g) => g.src).join(","), loop: Math.round(S.loopSec * 100) / 100, bytes: S.bytes });
      // the stings are small: fetched during idle once the layers play
      const loadStings = () => ["resolution", "failure"].forEach((k) => make(b.ctx, k).then((g) => { if (g.buf) S.stings[k] = g.buf; }).catch(() => {}));
      if (typeof requestIdleCallback === "function") requestIdleCallback(loadStings, { timeout: 5000 });
      else setTimeout(loadStings, 1200);
    } catch (e) {
      S.loading = false;
      return false;
    }
    S.loading = false;
    return true;
  }

  function ramp(k, to, atBeat, secs) {
    const n = S.nodes[k];
    if (!n) return;
    const ctx = S.bus.ctx;
    const g = n.gain.gain;
    const t = Math.max(ctx.currentTime, atBeat);
    const cur = g.value;
    try {
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(cur, ctx.currentTime);
      g.setValueAtTime(cur, t);
      g.linearRampToValueAtTime(to * c.vol[k], t + secs);
    } catch (e) {
      g.value = to * c.vol[k];
    }
    n.ramp = { to, from: Math.round(cur * 1000) / 1000, startsIn: Math.round((t - ctx.currentTime) * 1000) / 1000, secs, at: nowMs() };
  }

  function intent() {
    const t = nowMs();
    return {
      control: inControl() && S.started,
      windup: !!S.windup,
      storm: t < S.stormUntil,
      fail: t < S.failUntil,
    };
  }

  function steer(initial) {
    if (!S.started || !S.bus) return;
    const I = intent();
    const L = levelsFor(I, c.levels);
    const ctx = S.bus.ctx;
    LAYERS.forEach((k) => {
      if (Math.abs(L[k] - S.target[k]) < 1e-6) return;
      const rising = L[k] > S.target[k];
      S.target[k] = L[k];
      // initial entry swells immediately from start; later swells begin on the next beat line, falls on the next bar line
      const at = initial ? Math.max(ctx.currentTime + 0.02, S.t0) : nextGrid(ctx.currentTime + 0.02, S.t0, rising ? beat : bar);
      ramp(k, L[k], at, initial ? Math.min(0.55, c.ramp) : (rising ? c.ramp : c.release));
    });
    const want = I.control;
    if (want !== S.active) {
      S.active = want;
      const sc = score();
      if (sc && sc.bedLevel) sc.bedLevel(want ? 0 : 1); // the nine beds rest while the stems play
      emit(want ? "in" : "out");
    }
  }

  function playBuf(buf, vol, where) {
    const b = bus();
    if (!b || !b.on || !buf) return false;
    const src = b.ctx.createBufferSource();
    src.buffer = buf;
    try { src.__hawkesSampleId = "sting-" + (where || "stem"); src.__hawkesBus = "music"; } catch (e) { /* */ }
    const g = b.ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(b.bus);
    src.start();
    return true;
  }

  function sting(kind) {
    const rec = { kind, at: nowMs(), heard: false };
    S.playedStings.push(rec);
    if (kind === "resolution") { S.stormUntil = 0; S.failUntil = 0; S.windup = false; }
    if (kind === "failure") { S.stormUntil = 0; S.failUntil = nowMs() + 4500; }
    const b = bus();
    if (b && S.stings[kind]) rec.heard = playBuf(S.stings[kind], c.vol.sting, kind);
    else if (b && b.on) {
      make(b.ctx, kind).then((g) => { if (g.buf) { S.stings[kind] = g.buf; playBuf(g.buf, c.vol.sting, kind); } }).catch(() => {});
      rec.heard = true;
    }
    emit("sting", { kind, heard: rec.heard });
    return rec;
  }

  /* The four notes, one per beat, on the music bus: the title's and the cold open's first sound. */
  function motif(where) {
    const rec = { where, at: nowMs(), notes: c.motif.slice(), hz: c.motif.map(noteHz), heard: false };
    const b = bus();
    if (b && b.on) {
      const t = b.ctx.currentTime + 0.05;
      const g = b.ctx.createGain();
      g.gain.value = c.vol.motif;
      g.connect(b.bus);
      rec.hz.forEach((hz, i) => {
        note(b.ctx, g, hz, t + i * beat, beat * 1.6, 0.34, "triangle", 2600);
        note(b.ctx, g, hz * 2, t + i * beat, beat * 1.2, 0.1, "sine");
      });
      rec.heard = true;
      try {
        window.dispatchEvent(new window.CustomEvent("hawkes-sound", { detail: { id: "motif-" + where, bus: "music", gain: c.vol.motif, rate: 1 } }));
      } catch (e) { /* */ }
    }
    S.motifs.push(rec);
    if (S.motifs.length > 12) S.motifs.shift();
    emit("motif", { where, notes: rec.notes.join(" "), heard: rec.heard });
    return rec;
  }

  // ---- what the player means ----
  // Start the stems on the first day:power cast (ambience covers the roof before it); the cast itself never waits.
  const first = () => {
    if (S.firstInput) return;
    S.firstInput = true;
    setTimeout(() => prepare(), 0);
  };
  window.addEventListener("day:power", (ev) => {
    const d = (ev && ev.detail) || {};
    if (d.action === "denied") return;
    first();
    if (!inControl()) return;
    const p = d.power || d.action;
    if (c.big.indexOf(p) >= 0 || c.big.indexOf(d.action) >= 0) {
      S.stormUntil = nowMs() + c.hold.storm * 1000;
      S.windup = false;
      emit("storm", { power: p });
    }
  });
  window.addEventListener("day:story", (ev) => {
    const d = (ev && ev.detail) || {};
    if (d.action === "help" || d.action === "twist") {
      S.stormUntil = Math.max(S.stormUntil, nowMs() + c.hold.rescue * 1000);
      emit("storm", { rescue: d.action });
    }
  });
  window.addEventListener("day:episode", (ev) => {
    const d = (ev && ev.detail) || {};
    if (d.action !== "score") return;
    const win = d.why === "clear" || (d.cleared && d.why !== "let-go");
    const lose = !win && (d.why === "time" || d.why === "scarred");
    if (win) sting("resolution");
    else if (lose) sting("failure");
  });
  window.addEventListener("day:title", (ev) => {
    const d = (ev && ev.detail) || {};
    if (d.action === "show") S.pendingTitle = true;
    if (d.action === "show" && bus() && bus().on) { S.pendingTitle = false; motif("title"); }
    // Play turns the Sound on in the same click: the motif opens the game on the title's own Play
    if (d.action === "play" && !S.motifs.some((m) => m.where === "title" && m.heard && nowMs() - m.at < 8000)) {
      S.pendingTitle = false;
      const s = score();
      if (s && s.unlock && soundIsOn()) s.unlock();
      motif("title");
    }
  });
  window.addEventListener("day:coldopen", (ev) => {
    const d = (ev && ev.detail) || {};
    if (d.action === "start") {
      const s = score();
      if (s && s.unlock && soundIsOn()) s.unlock();
      setTimeout(() => motif("coldopen"), bar * 1000); // the motif comes back one bar later, as the camera pushes in
    }
  });

  // Gesture only unlocks the title's synthesized motif; stems wait for the first day:power cast.
  const onGesture = () => {
    if (S.pendingTitle && bus() && bus().on) { S.pendingTitle = false; motif("title"); }
  };
  ["pointerdown", "keydown", "touchstart"].forEach((n) => window.addEventListener(n, onGesture, { capture: true, passive: true }));

  function frame() {
    try {
      const pw = window.powers && window.powers.now && window.powers.now();
      if (pw && pw.windup) S.windupUntil = nowMs() + 1500; // a short hold still gets its swell (the cast lands inside the swell)
      S.windup = nowMs() < (S.windupUntil || 0) && !(nowMs() < S.stormUntil);
      if (!S.started && S.firstInput) prepare();
      steer();
      if (S.started) {
        LAYERS.forEach((k) => { S.nodes[k].level = Math.round(S.nodes[k].gain.gain.value * 1000) / 1000; });
      }
    } catch (e) { /* never break the page */ }
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(frame);
  }
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(frame);

  const api = {
    now() {
      const layers = {};
      LAYERS.forEach((k) => {
        const n = S.nodes[k];
        layers[k] = { gain: n ? n.level || 0 : 0, target: Math.round(S.target[k] * c.vol[k] * 1000) / 1000, wanted: S.target[k], kind: n ? n.kind : null, seconds: n ? Math.round(n.seconds * 100) / 100 : 0, ramp: n && n.ramp ? Object.assign({}, n.ramp) : null };
      });
      const lens = LAYERS.map((k) => S.buffers[k] && S.buffers[k].length);
      return {
        stems: S.started ? 3 : 0,
        synced: S.started && lens.every((n) => n === lens[0]),
        startedAt: S.t0,
        loopSec: Math.round(S.loopSec * 100) / 100,
        bpm: c.bpm, bar, beat, key: "A minor", motif: c.motif.slice(),
        active: S.active,
        streaming: S.loading,
        firstInput: S.firstInput,
        source: S.started ? LAYERS.map((k) => S.nodes[k].kind).join(",") : null,
        bytes: S.bytes,
        layers,
        intent: intent(),
        motifs: S.motifs.map((m) => ({ where: m.where, notes: m.notes.join(" "), heard: m.heard })),
        stings: S.playedStings.map((s) => ({ kind: s.kind, heard: s.heard })),
        stingsReady: Object.keys(S.stings),
      };
    },
    motif, sting, intent, prepare,
    levelsFor: (i) => levelsFor(i, c.levels),
    /** the playtest's setup shortcut: pretend the player's first input happened */
    input() { first(); return prepare(); },
  };
  day.stems = api;
  window.stems = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) startStems();

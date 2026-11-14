/* ==========================================================================
   Sound for what the player does and what the world does around him: no files, all WebAudio synthesis
   (one shared AudioContext, gated on the Sound button like the rest of the page).

   - Moving him: footsteps timed to his stride (wetter in rain), a jump whoosh, a landing thump that grows
     with the fall, a puff of dust where he lands, a falling sweep when the player lets go.
   - Powers: layered Gen clips in audio/sfx/power (crack + body + rumble, whoosh, gale, sun shimmer,
     tornado roar/debris/pressure); synth only as the fallback. Thunder delay is distance / 343 m/s
     (js/powers.js). Instant crack at the flash; body + rumble after the delay, low-passed by distance,
     sub-bass on close strikes; music/ambience sidechain-ducked 6 dB for 1.5 s.
   - Episodes and the finale: goal, fail, hurt, piece, kick, unlock, score (major when cleared, minor when
     not), show cues graded perfect / good / off, the ending.
   - Story: every line in the episode dialogue and every neighbor bubble gets a short babble, a voice of
     its own per speaker (pitch from the name), so the story is heard as well as read.
   - Recorded foley first (audio/foley, see the bank below), the synthesis only as the fallback.
   - The city: birds by day in fair weather, cars passing (more in rush hour, from the crowd), a far siren
     now and then at night.

   Hooks are window events (day:control, day:power, day:episode, day:story, day:neighbor) and one
   onBeforeRender observer that reads day.control.state(): nothing here changes the day or polls the network.
   day.sfx.info() says what played (the playtest and the console).
   ========================================================================== */
import { pickRate } from "./variety.js";

(function () {
  const day = window.day;
  const world = day && day.world && day.world();
  if (!world || !world.scene || typeof window.addEventListener !== "function") return;
  const B = window.BABYLON;
  const scene = world.scene;

  const heard = {}; // name -> count, for info()
  const clockMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let lastHeardMs = clockMs();
  /* note() only counts. lastHeardMs is stamped where a source really starts (started()): a note() for an event whose sound never
     started (a muted bus, a clip not decoded yet, a one-shot gated off) must not hold the ambient fill back. */
  const started = () => { lastHeardMs = clockMs(); };
  const note = (name) => { return (heard[name] = (heard[name] || 0) + 1); };

  /* ---------------- the audio graph ---------------- */
  let audio = null;
  function soundOn() {
    const btn = document.getElementById && document.getElementById("sound");
    return !!(btn && btn.getAttribute("aria-pressed") === "true");
  }
  function mixApi() {
    return (day && day.mix) || window.mix || (day && day.audio) || null;
  }
  function ctx() {
    if (!soundOn()) return null;
    if (!audio) {
      try {
        const Mix = mixApi();
        if (Mix && typeof Mix.ctx === "function") {
          try { if (typeof Mix.unlock === "function") Mix.unlock(); } catch (e) { /* */ }
          const c = Mix.ctx();
          if (c) {
            const bus = Mix.bus && Mix.bus("sfx");
            const master = (bus && bus.bus) || (Mix.master && Mix.master()) || c.createGain();
            const len = c.sampleRate * 2;
            const white = c.createBuffer(1, len, c.sampleRate);
            const d = white.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            audio = { c, master, lim: true, white, mix: true, ui: Mix.bus && Mix.bus("ui") };
          }
        }
      } catch (err) { /* fall through */ }
    }
    if (!audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        const c = new Ctx();
        const master = c.createGain();
        master.gain.value = 0.7;
        // Master limiter: phone speakers must not clip during a storm (true-peak headroom).
        const lim = c.createDynamicsCompressor();
        if (lim.threshold) lim.threshold.value = -6;
        if (lim.knee) lim.knee.value = 12;
        if (lim.ratio) lim.ratio.value = 12;
        if (lim.attack) lim.attack.value = 0.003;
        if (lim.release) lim.release.value = 0.18;
        master.connect(lim);
        lim.connect(c.destination);
        const len = c.sampleRate * 2;
        const white = c.createBuffer(1, len, c.sampleRate);
        const d = white.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        audio = { c, master, lim, white, mix: false };
      } catch (err) {
        audio = null;
        return null;
      }
    }
    if (audio.c.state === "suspended" && !audio.resuming) {
      audio.resuming = true; // once until it answers: a page without a gesture yet stays suspended quietly
      audio.c.resume().catch(() => {}).then(() => setTimeout(() => (audio.resuming = false), 1000));
    }
    return audio.c.state === "closed" ? null : audio;
  }

  /* Where a point in the world sits for the ear: pan by the camera's right vector, quieter with distance.
     When js/mix.js is up, placeWorld() builds a real PannerNode (HRTF / occlusion); this helper stays for
     the synth oneshots that only need a pan value. */
  function place(x, z) {
    const cam = scene.activeCamera;
    if (!cam || x == null || z == null) return { pan: 0, gain: 1 };
    const p = cam.globalPosition || cam.position;
    const dx = x - p.x;
    const dz = z - p.z;
    const dist = Math.hypot(dx, dz);
    let pan = 0;
    try {
      const right = cam.getDirection(B.Axis.X);
      pan = dist > 0.5 ? (dx * right.x + dz * right.z) / dist : 0;
    } catch (err) { /* no camera matrix yet */ }
    return { pan: Math.max(-0.9, Math.min(0.9, pan)), gain: 1 / (1 + Math.max(0, dist - 8) / 18) };
  }
  function placeWorld(x, y, z, opts) {
    const Mix = mixApi();
    if (Mix && typeof Mix.place === "function") {
      try { return Mix.place(x, y != null ? y : 1.2, z, opts || { bus: "sfx" }); } catch (e) { /* */ }
    }
    return null;
  }
  function out(a, pan, busName, world) {
    // Prefer the mix spatial graph when a world position was attached.
    const w = world || (a && a.__world);
    if (w && w.input) return w.input;
    const dest = (busName === "ui" && a.ui && a.ui.bus) ? a.ui.bus
      : (busName === "sfx" && a.mix && a.master) ? a.master
      : a.master;
    if (pan == null || pan === false || !a.c.createStereoPanner) return dest;
    const p = a.c.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    return p;
  }
  /** Connect a synth oneshot into an HRTF/occlusion place when mix is up; else stereo pan. */
  function outAt(a, x, z, busName) {
    if (x != null && z != null) {
      const w = placeWorld(x, 1.2, z, { bus: busName || "sfx" });
      if (w && w.input) {
        // Auto-stop the spatial slot after a couple of seconds (oneshots are short).
        setTimeout(() => { try { w.stop(); } catch (e) { /* */ } }, 2800);
        return w.input;
      }
      const at = place(x, z);
      return out(a, at.pan, busName);
    }
    return out(a, 0, busName);
  }

  /* Footstep / landing voicing context: while a step or landing is synthesized every layer is tagged for the audio probe
     with the surface and a round-robin take ("step-gravel-2:syn-noise-..."), takes differ in pitch, and the level follows
     the phone / voice mix (stepGain). */
  let curTag = "";
  let curVar = 1;
  let curGain = 1;
  const RR_PITCH = [1, 0.93, 1.08, 0.97];
  const rr = {};
  let voiceOn = 0;
  function stepGain() {
    let g = 1;
    try { if (document.documentElement.classList.contains("touch-ui")) g *= 0.7; } catch (e) { /* */ }
    if (voiceOn > 0) g *= 0.5;
    return g;
  }
  let voiceTimer = 0;
  ["day:voice", "day:dialogue"].forEach((n) => window.addEventListener(n, (ev) => {
    const act = (ev && ev.detail && ev.detail.action) || "play";
    clearTimeout(voiceTimer);
    if (act === "end" || act === "stop") { voiceOn = 0; return; }
    voiceOn = 1;
    voiceTimer = setTimeout(() => { voiceOn = 0; }, 7000); // failsafe if an end never comes
  }));
  function voicing(tag, fn, pitched) {
    const n = (rr[tag] = ((rr[tag] || 0) + 1) % RR_PITCH.length);
    curTag = tag + "-" + n;
    curVar = pitched === false ? 1 : RR_PITCH[n];
    curGain = stepGain();
    try { fn(); } finally { curTag = ""; curVar = 1; curGain = 1; }
    return curTag || tag;
  }
  /** Filtered noise: a hit, a thump, a whoosh (sweep with `to`). Pass x/z for HRTF+occlusion via mix. */
  function noise(o) {
    const a = ctx();
    if (!a) return;
    const t = a.c.currentTime + (o.delay || 0);
    const src = a.c.createBufferSource();
    src.buffer = a.white;
    // Tagged for the audio probe (hawkes-audio.js): the id names the voicing, the rate carries the pitch jitter, so
    // the shared white-noise buffer isn't read as one sample repeating.
    const pj = 0.94 + Math.random() * 0.12;
    const nid = (curTag ? curTag + ":" : "") + "syn-noise-" + (o.type || "lowpass") + "-" + Math.round(o.freq || 0) + (o.to ? ">" + Math.round(o.to) : "");
    src.playbackRate.value = pickRate(nid, o.rate || 1);
    try {
      src.__hawkesSampleId = nid;
      src.__hawkesBus = o.bus || "sfx";
      src.__hawkesGain = Math.max(0.0002, o.vol);
      src.__hawkesDur = o.dur;
    } catch (e) { /* */ }
    const f = a.c.createBiquadFilter();
    f.type = o.type || "lowpass";
    f.Q.value = o.q || 0.8;
    // Every synthesized hit varies a little (pitch ~+-6%, level ~+-8%) so repeats never sound identical.
    f.frequency.setValueAtTime(o.freq * pj * curVar, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to * pj * curVar, t + o.dur);
    const g = a.c.createGain();
    const vol = Math.max(0.0002, o.vol) * curGain * (0.92 + Math.random() * 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.max(0.006, o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    g.gain.setValueAtTime(0, t + o.dur + 0.002); // true zero before the source stops: no click
    src.connect(f);
    f.connect(g);
    const bus = o.bus || "sfx";
    g.connect(o.x != null && o.z != null ? outAt(a, o.x, o.z, bus) : out(a, o.pan, bus));
    src.start(t, Math.random() * 1.5); started();
    src.stop(t + o.dur + 0.05);
  }
  /** One oscillator note, optionally gliding. Pass x/z for HRTF+occlusion via mix. */
  function tone(o) {
    const a = ctx();
    if (!a) return;
    const t = a.c.currentTime + (o.delay || 0);
    const osc = a.c.createOscillator();
    osc.type = o.wave || "sine";
    const pj = (0.97 + Math.random() * 0.06) * curVar; // +-3% pitch: musical notes stay in tune, repeats still differ
    osc.frequency.setValueAtTime(o.freq * pj, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to * pj, t + o.dur);
    const g = a.c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol) * curGain * (0.94 + Math.random() * 0.12), t + Math.max(0.008, o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    g.gain.setValueAtTime(0, t + o.dur + 0.002);
    let node = osc;
    if (o.band) {
      const f = a.c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = o.band;
      f.Q.value = o.q || 2;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    const bus = o.bus || "sfx";
    g.connect(o.x != null && o.z != null ? outAt(a, o.x, o.z, bus) : out(a, o.pan, bus));
    osc.start(t); started();
    osc.stop(t + o.dur + 0.05);
    // An oscillator isn't a buffer source, so the audio probe can't see it: say so through the sound kit's event.
    try {
      window.dispatchEvent(new CustomEvent("hawkes-sound", { detail: { type: "sound-start", sample: (curTag ? curTag + ":" : "") + "syn-tone-" + o.freq + (o.to ? ">" + o.to : "") + "-" + (o.wave || "sine"), bus: o.bus || "sfx", rate: Math.round(pj * 1000) / 1000, gain: o.vol, dur: o.dur } }));
    } catch (e) { /* */ }
  }
  const notes = (freqs, gap, vol, wave, dur) => freqs.forEach((f, i) => tone({ freq: f, dur: dur || 0.5, vol, wave: wave || "triangle", delay: i * gap }));


  /* ---------------- the foley bank (audio/foley/*.mp3, made with Hawkes Gen audio.sfx) ----------------
     Recorded clips first, the synthesis below only as the fallback for a clip that isn't in the build. audio/foley/index.json
     (vite.config.js writes it from the files on disk) lists what exists, so nothing 404s. A clip is <kind>-<n>.mp3; a kind
     belongs to a lazy group: `ui` and `move` load when Sound comes on, `crowd` and `city` on the first time one is wanted.
     Every play picks a variant that isn't the one before, with 5-10% pitch and 5-10% volume jitter. */
  const GROUPS = [
    [/^(jump|land-)/, "move"],
    [/^(crowd-|umbrella-)/, "crowd"],
    [/^(car-|siren|pigeon|bird|door|dog|chatter|awning)/, "city"],
    [/^ui-/, "ui"],
  ];
  const groupOf = (kind) => { for (const [re, g] of GROUPS) if (re.test(kind)) return g; return "misc"; };
  const bank = { index: null, indexing: false, files: {}, buffers: {}, groups: {}, last: {}, plays: [], sources: {}, bytes: 0, usedAt: {}, lastSrc: null, lastDur: 0 };
  const lastRate = {};
  function loadGroup(g) {
    if (bank.groups[g] || !bank.index) return;
    bank.groups[g] = "loading";
    const a = audio;
    const todo = Object.keys(bank.files).filter((k) => groupOf(k) === g);
    let left = todo.reduce((n, k) => n + bank.files[k].length, 0);
    if (!left) { bank.groups[g] = "empty"; return; }
    todo.forEach((kind) => bank.files[kind].forEach((url) => {
      fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status)))).then((buf) => {
        bank.bytes += buf.byteLength;
        return new Promise((ok, no) => a.c.decodeAudioData(buf, ok, no));
      }).then((b) => { (bank.buffers[kind] = bank.buffers[kind] || []).push({ url, b }); }).catch(() => {}).then(() => { if (--left === 0) bank.groups[g] = "ready"; });
    }));
  }
  function wantGroup(g) {
    if (!audio) return;
    if (!bank.index) {
      if (!bank.indexing && typeof fetch === "function") {
        bank.indexing = true;
        fetch("audio/foley/index.json").then((r) => (r.ok ? r.json() : { files: [] })).catch(() => ({ files: [] })).then((j) => {
          (j.files || []).forEach((f) => {
            const m = /([^/]+?)-(\d+)\.mp3$/.exec(f);
            if (m) (bank.files[m[1]] = bank.files[m[1]] || []).push(f);
          });
          bank.index = true;
          Object.keys(bank.pending || {}).forEach(loadGroup);
        });
      }
      (bank.pending = bank.pending || {})[g] = 1;
      return;
    }
    loadGroup(g);
  }
  /** Play a recorded clip for `kind`; false when there isn't one loaded (the caller synthesizes instead). */
  function sample(kind, o) {
    o = o || {};
    const a = ctx();
    if (!a) return true; // Sound off: silence, nothing to fall back to
    wantGroup(groupOf(kind));
    const list = bank.buffers[kind];
    if (!list || !list.length) return false;
    // Never the same file twice inside 60 s while another variant is free (the audio probe counts an identical sample); a caller
    // that needs it strict (the scheduler) passes `fresh` and gets false, then picks another kind.
    const nowMs = clockMs();
    let cands = list.filter((p) => !(bank.usedAt[p.url] > nowMs - 60000));
    if (!cands.length) { if (o.fresh) return false; cands = list; }
    let pick = cands[Math.floor(Math.random() * cands.length)];
    if (cands.length > 1 && pick.url === bank.last[kind]) pick = cands[(cands.indexOf(pick) + 1) % cands.length];
    bank.last[kind] = pick.url;
    bank.usedAt[pick.url] = nowMs;
    let rate = 1 + (0.05 + Math.random() * 0.05) * (Math.random() < 0.5 ? -1 : 1); // 5-10% either way
    if (Math.abs(rate - (lastRate[pick.url] || 0)) < 0.01) rate += 0.012;
    lastRate[pick.url] = rate;
    const vol = (o.gain == null ? 1 : o.gain) * (1 + (0.05 + Math.random() * 0.05) * (Math.random() < 0.5 ? -1 : 1));
    const src = a.c.createBufferSource();
    src.buffer = pick.b;
    // Name it by its file: same-length foley clips would otherwise share the probe's "buf:<secs>x<len>" id.
    try { src.__hawkesSampleId = "foley-" + String(pick.url).split("/").pop(); } catch (e) { /* */ }
    src.playbackRate.value = rate;
    const g = a.c.createGain();
    g.gain.value = Math.max(0.0002, vol);
    src.connect(g);
    const bus = o.bus || (String(kind).startsWith("ui-") ? "ui" : "sfx");
    g.connect(o.x != null && o.z != null ? outAt(a, o.x, o.z, bus) : out(a, o.pan, bus));
    src.start(a.c.currentTime + (o.delay || 0)); started();
    bank.lastSrc = src;
    bank.lastDur = (pick.b && pick.b.duration ? pick.b.duration : 2) / rate;
    const tag = groupOf(kind) === "move" ? (kind === "jump" ? "jump" : "landing") : kind.split("-")[0] === "crowd" || kind === "umbrella-pop" ? "crowd" : kind.startsWith("car") || kind === "siren-far" ? "car" : kind === "bird" || kind === "pigeon" ? "bird" : "ui";
    bank.sources[tag] = "file";
    bank.plays.push({ kind, file: pick.url, rate: +rate.toFixed(3), t: Math.round(typeof performance !== "undefined" ? performance.now() : Date.now()) });
    if (bank.plays.length > 60) bank.plays.shift();
    note("file-" + kind);
    return true;
  }
  /** What a sound kind is for info(): a recorded clip played, or the synthesis stood in. */
  const synthTag = (tag) => { if (bank.sources[tag] !== "file") bank.sources[tag] = "synth"; };
  const fx = (kind, tag, o, synth) => { if (sample(kind, o)) return; synthTag(tag); synth(); };

  /* ---------------- power bank (audio/sfx/power/*.mp3) — layered cast sounds ----------------
     Eager: load the first crack/whoosh set when Sound is on so the first cast answers within 100 ms.
     Lazy: remaining variants and loops when first wanted. Index rewritten at build from disk. */
  const power = {
    index: null,
    indexing: false,
    files: {},
    buffers: {},
    last: {},
    plays: [],
    sources: {},
    eager: false,
    bytes: 0,
  };
  const POWER_EAGER = ["crack", "whoosh"];
  function powerIndex() {
    if (power.index || power.indexing || typeof fetch !== "function") return;
    power.indexing = true;
    fetch("audio/sfx/power/index.json")
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .catch(() => ({ files: [] }))
      .then((j) => {
        (j.files || []).forEach((f) => {
          const m = /([^/]+?)-(\d+)\.mp3$/.exec(f);
          if (m) (power.files[m[1]] = power.files[m[1]] || []).push(f);
        });
        power.index = true;
        if (soundOn() && ctx()) loadPowerKinds(ALL_POWER_KINDS);
      });
  }
  function loadPowerKinds(kinds) {
    const a = audio;
    if (!a || !power.index) return;
    kinds.forEach((kind) => {
      const urls = power.files[kind];
      if (!urls || !urls.length || power.buffers[kind]) return;
      power.buffers[kind] = [];
      urls.forEach((url) => {
        fetch(url)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
          .then((buf) => {
            power.bytes += buf.byteLength;
            return new Promise((ok, no) => a.c.decodeAudioData(buf, ok, no));
          })
          .then((b) => {
            power.buffers[kind].push({ url, b });
            power.sources[kind] = "file";
          })
          .catch(() => {});
      });
    });
  }
  function wantPower(kind) {
    powerIndex();
    if (!power.index) return;
    // First cast: eager set already loading; also pull this kind.
    loadPowerKinds(POWER_EAGER.concat([kind]));
  }
  function pickPower(kind) {
    const list = power.buffers[kind];
    if (!list || !list.length) return null;
    let pick = list[Math.floor(Math.random() * list.length)];
    if (list.length > 1 && pick.url === power.last[kind]) pick = list[(list.indexOf(pick) + 1) % list.length];
    power.last[kind] = pick.url;
    return pick;
  }
  /** Play one power clip through a filter/gain chain. Returns false when no buffer yet. */
  function playPowerBuf(pick, o) {
    const a = ctx();
    if (!a || !pick) return false;
    const t = a.c.currentTime + (o.delay || 0);
    const src = a.c.createBufferSource();
    src.buffer = pick.b;
    try { src.__hawkesSampleId = "power-" + String(pick.url).split("/").pop(); } catch (e) { /* */ }
    src.playbackRate.value = pickRate("power-" + String(pick.url).split("/").pop(), o.rate || 1); // (rate || 1) + jitter, never a passed rate with none
    let node = src;
    if (o.lp != null && a.c.createBiquadFilter) {
      const f = a.c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = Math.max(120, o.lp);
      f.Q.value = 0.7;
      src.connect(f);
      node = f;
    }
    const g = a.c.createGain();
    const vol = Math.max(0.0002, o.gain == null ? 1 : o.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.008));
    if (o.dur) g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    node.connect(g);
    g.connect(o.x != null && o.z != null ? outAt(a, o.x, o.z, "sfx") : out(a, o.pan, "sfx"));
    src.start(t);
    started();
    if (o.dur) try { src.stop(t + o.dur + 0.05); } catch (err) { /* ok */ }
    power.plays.push({ kind: o.kind || "power", file: pick.url, t: Math.round(typeof performance !== "undefined" ? performance.now() : Date.now()) });
    if (power.plays.length > 40) power.plays.shift();
    note("power-" + (o.kind || "clip"));
    return true;
  }
  function powerSample(kind, o) {
    o = o || {};
    wantPower(kind);
    const pick = pickPower(kind);
    if (!pick) return false;
    return playPowerBuf(pick, Object.assign({ kind }, o));
  }
  /** Distance → low-pass cutoff (Hz): close stays bright, far rolls off. */
  function distLp(dist) {
    const d = Math.max(0, dist || 0);
    return Math.max(280, 5200 - d * 12);
  }
  /** Instant crack at the flash (and a chest sub hit when the strike is close). */
  function crackLayered(pan, gain, dist, at) {
    wantPower("crack");
    const g = gain == null ? 1 : gain;
    const d = dist == null ? 12 : dist;
    const xz = at && at.x != null ? { x: at.x, z: at.z } : null;
    const filed = powerSample("crack", { pan, gain: 0.95 * g, lp: distLp(d * 0.35), x: xz && xz.x, z: xz && xz.z });
    if (!filed) {
      note("bolt-crack");
      synthTag("bolt");
      noise({ type: "highpass", freq: 2600, dur: 0.16, vol: 0.5 * g, attack: 0.002, pan, ...(xz || {}) });
      noise({ type: "bandpass", freq: 900, q: 0.7, dur: 0.35, vol: 0.25 * g, attack: 0.004, pan, delay: 0.01, ...(xz || {}) });
    } else note("bolt-crack");
    if (d < 30) {
      // Sub-bass hit in the chest on close strikes.
      tone({ freq: 48, to: 28, dur: 0.55, vol: 0.32 * g, wave: "sine", attack: 0.004, pan, ...(xz || {}) });
      tone({ freq: 70, to: 40, dur: 0.35, vol: 0.14 * g, wave: "triangle", attack: 0.004, pan, ...(xz || {}) });
      note("bolt-sub");
    }
    return true;
  }
  /**
   * Delayed body + rumble after the flash (powers.js schedules by thunderDelay).
   * Low-passed by distance; logs lastThunder for the playtest.
   */
  function thunderLayered(meta) {
    const m = meta || {};
    const dist = m.dist != null ? m.dist : 40;
    const pan = m.pan != null ? m.pan : 0;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const expectedDelay = m.delay != null ? m.delay : (dist <= 30 ? 0 : Math.min(2.8, dist / 343));
    const actualDelay = m.flashAt != null ? Math.max(0, (now - m.flashAt) / 1000) : expectedDelay;
    const near = dist <= 30;
    liveThunder = {
      kind: near ? "near" : "far",
      dist: Math.round(dist * 10) / 10,
      expectedDelay: Math.round(expectedDelay * 1000) / 1000,
      actualDelay: Math.round(actualDelay * 1000) / 1000,
      pan: Math.round(pan * 100) / 100,
      crack: power.last.crack || null,
      body: null,
      rumble: null,
      at: Math.round(now),
    };
    if (!soundOn()) return false;
    wantPower("body");
    wantPower("rumble");
    const lp = distLp(dist);
    const bodyGain = near ? 0.95 : Math.max(0.35, 0.95 - dist / 220);
    const rumbleGain = near ? 0.7 : Math.max(0.4, 0.85 - dist / 280);
    let ok = false;
    const body = pickPower("body");
    if (body) {
      ok = playPowerBuf(body, { kind: "body", pan, gain: bodyGain, lp, attack: 0.02 }) || ok;
      liveThunder.body = body.url;
    }
    const rumble = pickPower("rumble");
    if (rumble) {
      ok = playPowerBuf(rumble, { kind: "rumble", pan, gain: rumbleGain, lp: Math.min(lp, 900), attack: 0.05, delay: near ? 0.04 : 0.08 }) || ok;
      liveThunder.rumble = rumble.url;
    }
    if (!ok) {
      // Fall back: let score.crack play the near/far beds; caller also keeps a synth under.
      note("thunder-synth");
      return false;
    }
    note("thunder-layered");
    if (day.score && day.score.crack) {
      // Keep the score's lastThunder log in sync for weather-audio / checks.
      day.score.crack(near ? "near" : "far", { dist, delay: expectedDelay, flashAt: m.flashAt, pan, silent: true });
    }
    return true;
  }
  /* ---------------- cast clips (audio/sfx/*.mp3, already in the repo) ----------------
     Rain and Fog have no clip of their own in the power bank, so they play the page's existing recordings, shaped per cast
     (an envelope, a low-pass, a rate): Rain = rain-roof-light, Fog = wind-awning slowed and muffled. Loaded when Sound
     comes on (first gesture) so the first cast answers at once. `casts` logs every cast (power, file or synth, time):
     day.sfx.info().casts, what the playtest's audio check reads. */
  const CAST_CLIPS = { rain: "audio/sfx/rain-roof-light.mp3", fog: "audio/sfx/wind-awning.mp3" };
  const castBufs = {};
  const casts = [];
  const logCast = (power, source, file) => {
    casts.push({ power, source, file: file || null, t: Math.round(typeof performance !== "undefined" ? performance.now() : Date.now()) });
    if (casts.length > 40) casts.shift();
  };
  function loadCastClips() {
    const a = audio;
    if (!a || typeof fetch !== "function") return;
    Object.keys(CAST_CLIPS).forEach((k) => {
      if (castBufs[k] !== undefined) return;
      castBufs[k] = null;
      fetch(CAST_CLIPS[k]).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((buf) => new Promise((ok, no) => a.c.decodeAudioData(buf, ok, no)))
        .then((b) => { castBufs[k] = b; }).catch(() => {});
    });
  }
  /* ---------------- pre-decode and the quiet loop under idle moments ----------------
     `preDecode()` runs at the first gesture with Sound on: the crack, whoosh, gale loop, sun shimmer, thunder body and rumble
     from the power bank and the rain/fog clips are fetched and decoded before any cast, so every verb answers with its own
     recording the first time (not a synth stand-in). `roomTone()` is a looping, very quiet low-passed noise bed on the
     ambience bus (-40 dB-ish, pitch-shifted slow breathing) so no idle stretch is dead air. */
  const ALL_POWER_KINDS = POWER_EAGER.concat(["gale-loop", "sun-shimmer", "body", "rumble"]);
  function preDecode() {
    if (!soundOn()) return;
    powerIndex();
    if (ctx()) { loadPowerKinds(ALL_POWER_KINDS); loadCastClips(); roomTone(); }
  }
  let tone0 = null;
  function roomTone() {
    if (tone0 || !audio) return;
    const a = audio;
    try {
      const len = Math.floor(a.c.sampleRate * 6);
      const buf = a.c.createBuffer(1, len, a.c.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const fade = Math.floor(a.c.sampleRate * 0.5); // seamless seam: the tail fades into the head's level
      for (let i = 0; i < fade; i++) { const k = i / fade; d[len - 1 - i] = d[len - 1 - i] * k + d[fade - 1 - i] * (1 - k); }
      const src = a.c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      try { src.__hawkesSampleId = "room-tone"; src.__hawkesBus = "ambience"; } catch (e) { /* */ }
      const lp = a.c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 420;
      const g = a.c.createGain();
      g.gain.setValueAtTime(0.0001, a.c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.03, a.c.currentTime + 2.5);
      const Mix = mixApi();
      const ab = Mix && Mix.bus && Mix.bus("ambience");
      src.connect(lp); lp.connect(g);
      g.connect((ab && ab.bus) || a.master);
      src.start();
      tone0 = { src, g };
    } catch (e) { tone0 = null; }
  }
  /** One clip shaped as a cast: swell in, hold, fade out over `dur`, optional low-pass and rate. */
  function playCastClip(k, o) {
    const a = ctx();
    const b = castBufs[k];
    if (!a || !b) return false;
    const t = a.c.currentTime;
    const src = a.c.createBufferSource();
    src.buffer = b;
    try { src.__hawkesSampleId = "castclip-" + k; } catch (e) { /* */ }
    src.playbackRate.value = pickRate("castclip-" + k, o.rate || 1);
    let node = src;
    if (o.lp) {
      const f = a.c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.lp;
      src.connect(f);
      node = f;
    }
    const g = a.c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + o.attack);
    g.gain.setValueAtTime(o.gain, t + Math.max(o.attack, o.dur - o.release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    node.connect(g);
    g.connect(out(a, 0, "sfx"));
    src.__hawkesSampleId = "cast-" + k;
    src.start(t, Math.random() * Math.max(0, b.duration - o.dur - 0.1));
    try { src.stop(t + o.dur + 0.05); } catch (err) { /* ok */ }
    return true;
  }

  /* The press transient: each cast answers the press on the same frame with a short rendered buffer (attack 5 ms or less,
     0.1-0.2 s), before its swell (Rain's clip ramps in over 0.5 s, Fog's over 0.9 s). One voicing per power so each sounds
     different: Lightning a sharp snap, Rain a patter of ticks, Wind a breath, Fog a low hush, Sun a bright chime.
     Rendered once per sample rate, played as a buffer source tagged "press-<id>" (the audio probe reads buffer sources). */
  const pressBufs = {};
  function pressBuffer(a, id) {
    const sr = a.c.sampleRate;
    const key = id + "@" + sr;
    if (pressBufs[key]) return pressBufs[key];
    const dur = { bolt: 0.14, rain: 0.2, gust: 0.18, gale: 0.18, fog: 0.2, sunbreak: 0.2 }[id] || 0.15;
    const n = Math.floor(sr * dur);
    const b = a.c.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    let lp = 0, ph = 0, ph2 = 0;
    // a fixed pseudo-random stream (no Math.random in the render, so each voicing is repeatable)
    let s = 12345 + id.length * 977;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
    const ticks = id === "rain" ? [0, 0.022, 0.047, 0.071, 0.1, 0.13] : null;
    for (let i = 0; i < n; i++) {
      const x = i / sr;
      const att = Math.min(1, x / 0.004);
      let v = 0;
      if (id === "bolt") {
        v = (rnd() * Math.exp(-x * 70) * 0.9 + Math.sin(2 * Math.PI * 95 * x) * Math.exp(-x * 30) * 0.7);
      } else if (id === "rain") {
        for (const t0 of ticks) if (x >= t0) v += rnd() * Math.exp(-(x - t0) * 220) * 0.55;
        lp += (v - lp) * 0.55; v = lp * 1.6;
      } else if (id === "gust" || id === "gale") {
        const f = id === "gale" ? 0.18 : 0.28;
        lp += (rnd() - lp) * (0.08 + 0.5 * Math.min(1, x / dur)); // the breath opens as it goes
        v = lp * 2.2 * Math.sin(Math.PI * Math.min(1, x / dur)) ** f;
      } else if (id === "fog") {
        ph += 2 * Math.PI * (110 - 30 * (x / dur)) / sr; ph2 += 2 * Math.PI * 165 / sr;
        v = (Math.sin(ph) * 0.7 + Math.sin(ph2) * 0.3) * Math.exp(-x * 9);
      } else {
        ph += 2 * Math.PI * 1568 / sr; ph2 += 2 * Math.PI * 2093 / sr;
        v = (Math.sin(ph) * 0.6 + Math.sin(ph2) * 0.4) * Math.exp(-x * 14);
      }
      d[i] = v * att * Math.min(1, (dur - x) / 0.02) * 0.8; // 20 ms tail: ends on zero
    }
    pressBufs[key] = b;
    return b;
  }
  function pressCast(id) {
    const a = ctx();
    if (!a) return false;
    try {
      const src = a.c.createBufferSource();
      src.buffer = pressBuffer(a, id);
      src.playbackRate.value = pickRate("press-" + id);
      const vol = { bolt: 0.55, rain: 0.5, gust: 0.4, gale: 0.45, fog: 0.5, sunbreak: 0.3 }[id] || 0.4;
      try { src.__hawkesSampleId = "press-" + id; src.__hawkesBus = "sfx"; src.__hawkesGain = vol; } catch (e) { /* */ }
      const g = a.c.createGain();
      g.gain.value = vol;
      src.connect(g);
      g.connect(out(a, 0, "sfx"));
      src.start(a.c.currentTime);
      started();
      note("press-" + id);
      return true;
    } catch (e) { return false; }
  }

  let liveThunder = null;
  let galeLoop = null;

  function castPower(id) {
    const a = ctx();
    if (!a) return false;
    pressCast(id);
    if (id === "gust") {
      if (powerSample("whoosh", { gain: 0.85 })) { note("gust-whoosh"); return true; }
      note("gust-whoosh");
      noise({ type: "bandpass", freq: 400, to: 1800, q: 1.1, dur: 0.55, vol: 0.14, attack: 0.02 });
      return true;
    }
    if (id === "gale") {
      const whoosh = powerSample("whoosh", { gain: 0.7 });
      wantPower("gale-loop");
      const pick = pickPower("gale-loop");
      if (pick && !galeLoop) {
        const src = a.c.createBufferSource();
        src.buffer = pick.b;
        src.loop = true;
        const g = a.c.createGain();
        g.gain.value = 0.0001;
        src.connect(g);
        g.connect(a.master);
        const t = a.c.currentTime;
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.35);
        g.gain.setValueAtTime(0.22, t + 2.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
        src.start(t);
        try { src.stop(t + 3.5); } catch (err) { /* ok */ }
        galeLoop = { until: t + 3.5 };
        setTimeout(() => { galeLoop = null; }, 3600);
        note("gale-loop");
        logCast("gale", "file", pick.url);
        return true;
      }
      if (whoosh) { logCast("gale", "file", "audio/sfx/power/whoosh"); return true; }
      note("gale-whoosh");
      logCast("gale", "synth", null);
      return false;
    }
    if (id === "fog") {
      note("fog-veil");
      if (day.score && day.score.fogColor) day.score.fogColor(1);
      pad2Fog();
      // wind-awning slowed and muffled under the pad: a low, wet hush no other cast has
      const hush = playCastClip("fog", { gain: 0.5, attack: 0.9, dur: 4.2, release: 1.6, rate: 0.62, lp: 650 });
      logCast("fog", hush ? "file" : "synth", hush ? CAST_CLIPS.fog : null);
      return true;
    }
    if (id === "sunbreak") {
      const shimmer = powerSample("sun-shimmer", { gain: 0.75 });
      note("sun-shimmer");
      logCast("sunbreak", shimmer ? "file" : "synth", shimmer ? "audio/sfx/power/sun-shimmer" : null);
      if (!shimmer) {
        tone({ freq: 523.25, dur: 1.2, vol: 0.08, wave: "triangle", attack: 0.15 });
        tone({ freq: 783.99, dur: 1.4, vol: 0.06, wave: "triangle", attack: 0.2, delay: 0.1 });
      }
      // Birds returning: nudge the score's bird bed up briefly.
      if (day.score && day.score.birdLift) day.score.birdLift(4);
      return true;
    }
    if (id === "rain") {
      note("rain-cast");
      // the roof-rain recording swells in, holds and thins out: bright, steady, with no pitch movement (Gale sweeps, Fog is low)
      const ok = playCastClip("rain", { gain: 0.55, attack: 0.5, dur: 3.6, release: 1.4, rate: 1 });
      logCast("rain", ok ? "file" : "synth", ok ? CAST_CLIPS.rain : null);
      return ok; // false keeps the powers.js hiss until the clip has decoded
    }
    return false;
  }
  function pad2Fog() {
    const a = ctx();
    if (!a) return;
    const t = a.c.currentTime;
    [110, 165, 220].forEach((hz, i) => {
      const o = a.c.createOscillator();
      const g = a.c.createGain();
      o.type = "sine";
      o.frequency.value = hz * (1 + i * 0.002);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      o.connect(g);
      g.connect(a.master);
      o.start(t);
      o.stop(t + 3.45);
    });
  }

  /* ---------------- surface detection (rooftop gravel, metal, tar, puddle + street) ---------------- */
  const SURFACES = ["gravel", "metal", "tar", "puddle", "pavement", "grass", "wood"];
  const surfaces = { gravel: 0, metal: 0, tar: 0, puddle: 0, pavement: 0, grass: 0, wood: 0 };
  let lastSurface = "pavement";
  const recentSteps = [];
  let lastStepId = "";
  let lastLandId = "";

  function surfaceAt(x, y, z, isWet) {
    const cfg = window.DAY_CONFIG || {};
    const city = cfg.city || {};
    const blocks = city.blocks || [];
    const wy = y == null ? 0 : y;
    const wNow = (day.weather && day.weather.now && day.weather.now()) || {};
    const wetLvl = isWet ? 1 : Math.max(wNow.wet || 0, wNow.state === "rain" || wNow.state === "storm" ? 0.8 : 0);

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.stair && wy > 0.35 && wy < b.h - 0.15) {
        const s = b.stair;
        if (x >= s.x0 - 0.6 && x <= s.x1 + 0.6 && Math.abs(z - s.z) <= s.w * 0.75) {
          return "metal";
        }
      }
      if (wy >= b.h - 0.55 && Math.abs(x - b.x) <= b.w / 2 + 0.8 && Math.abs(z - b.z) <= b.d / 2 + 1.2) {
        const dx = x - b.x;
        const dz = z - b.z;
        // 1. Roof-drain puddle basin at (-2.2, +1.6) always holds standing water; secondary basin at (+1.2, +1.8) fills when wet
        if (Math.hypot(dx - (-2.2), dz - 1.6) <= 1.45 || (wetLvl > 0.15 && Math.hypot(dx - 1.2, dz - 1.8) <= 1.35)) {
          return "puddle";
        }
        // 2. Metal grating catwalk (dx in 1.75..4.35, |dz| <= 1.7), south AC/vent mechanical strip (dz <= -2.0), or stair landing
        if (
          (dx >= 1.75 && dx <= 4.35 && Math.abs(dz) <= 1.75) ||
          dz <= -2.0 ||
          (b.stair && dz >= b.d / 2 - 1.4 && x >= b.stair.x1 - 1.8 && x <= b.stair.x1 + 1.2)
        ) {
          return "metal";
        }
        // 3. Tar membrane patch on the west side (dx <= -2.6) or outer parapet flashing
        if (dx <= -2.6 || Math.abs(dx) >= b.w / 2 - 1.4 || Math.abs(dz) >= b.d / 2 - 1.1) {
          return "tar";
        }
        // 4. Central gravel roof ballast bed
        return "gravel";
      }
    }

    // Street / ground level
    if (wetLvl > 0.25 && Math.abs(z - 12.6) < 4.5 && Math.sin(x * 0.41 + z * 0.63) > 0.55) {
      return "puddle";
    }
    if (city.park && x >= city.park.x0 && x <= city.park.x1 && z >= city.park.z0 && z <= city.park.z1 && Math.abs(x - (-8)) > 1.2) {
      return isWet ? "puddle" : "grass";
    }
    const blds = Object.values(cfg.buildings || {});
    for (let i = 0; i < blds.length; i++) {
      const bd = blds[i];
      if (!bd || !bd.bounds) continue;
      const o = bd.origin || [0, 0];
      if (x >= bd.bounds[0] + o[0] && x <= bd.bounds[2] + o[0] && z >= bd.bounds[1] + o[1] && z <= bd.bounds[3] + o[1]) {
        return "wood";
      }
    }
    return isWet ? "puddle" : "pavement";
  }

  /* ---------------- the palette ---------------- */
  const S = {
    step(wetOrSurface, pan, surfaceOverride) {
      let surf = surfaceOverride;
      let isWet = false;
      if (typeof wetOrSurface === "string" && SURFACES.indexOf(wetOrSurface) >= 0) {
        surf = wetOrSurface;
        isWet = surf === "puddle";
      } else {
        isWet = !!wetOrSurface;
        if (!surf) {
          try {
            const st = day.control && day.control.state && day.control.state();
            if (st && st.mode === "control") surf = surfaceAt(st.x, st.y, st.z, isWet);
          } catch (e) { /* fallback */ }
        }
        if (!surf) surf = isWet ? "puddle" : "pavement";
      }
      note("step");
      note("step-" + surf);
      surfaces[surf] = (surfaces[surf] || 0) + 1;
      lastSurface = surf;
      recentSteps.push({ surface: surf, id: lastStepId, wet: isWet || surf === "puddle", t: typeof performance !== "undefined" ? Math.round(performance.now()) : Date.now() });
      if (recentSteps.length > 20) recentSteps.shift();
      try {
        window.dispatchEvent(new CustomEvent("day:footstep", { detail: { surface: surf, wet: isWet || surf === "puddle", pan: pan || 0 } }));
      } catch (e) { /* ignore */ }

      const sid = voicing("step-" + surf, () => {
      if (surf === "gravel") {
        // Crunchy multi-grain gravel roof step: three staggered high-mid pebble crunches + dry sole thud
        noise({ type: "bandpass", freq: 2350 + Math.random() * 350, q: 2.4, dur: 0.055, vol: 0.068, attack: 0.003, pan });
        noise({ type: "bandpass", freq: 3400 + Math.random() * 450, q: 2.8, dur: 0.05, vol: 0.055, attack: 0.003, delay: 0.018, pan });
        noise({ type: "highpass", freq: 4200, q: 1.4, dur: 0.045, vol: 0.038, attack: 0.003, delay: 0.036, pan });
        tone({ freq: 185, to: 115, dur: 0.048, vol: 0.042, wave: "triangle", pan });
      } else if (surf === "metal") {
        // Resonant hollow metal grating / AC deck clank: inharmonic metallic ring partials + sharp transient
        tone({ freq: 430 + Math.random() * 25, to: 390, dur: 0.11, vol: 0.062, wave: "triangle", attack: 0.002, pan });
        tone({ freq: 1160 + Math.random() * 60, to: 1080, dur: 0.095, vol: 0.045, wave: "sine", band: 1200, q: 4.5, attack: 0.002, pan });
        tone({ freq: 2340 + Math.random() * 90, to: 2100, dur: 0.065, vol: 0.028, wave: "sine", attack: 0.002, delay: 0.006, pan });
        noise({ type: "bandpass", freq: 1750, q: 3.2, dur: 0.045, vol: 0.05, attack: 0.002, pan });
      } else if (surf === "tar") {
        // Heavy damped roof tar membrane thud + sticky sole peel snap
        tone({ freq: 138, to: 62, dur: 0.075, vol: 0.078, wave: "sine", attack: 0.004, pan });
        noise({ type: "lowpass", freq: 390, q: 1.1, dur: 0.07, vol: 0.062, attack: 0.005, pan });
        noise({ type: "bandpass", freq: 2850 + Math.random() * 250, q: 4.2, dur: 0.028, vol: 0.034, attack: 0.002, delay: 0.038, pan });
      } else if (surf === "puddle") {
        // Clear water puddle splash: swept water slosh + scattered droplet pings
        noise({ type: "bandpass", freq: 720, to: 2650, q: 1.3, dur: 0.14, vol: 0.082, attack: 0.005, pan });
        noise({ type: "highpass", freq: 3400, q: 1.1, dur: 0.11, vol: 0.045, attack: 0.004, delay: 0.015, pan });
        tone({ freq: 1350 + Math.random() * 250, to: 1950, dur: 0.045, vol: 0.028, wave: "sine", delay: 0.022, pan });
        tone({ freq: 1780 + Math.random() * 320, to: 2450, dur: 0.04, vol: 0.024, wave: "sine", delay: 0.052, pan });
      } else if (surf === "grass") {
        noise({ type: "bandpass", freq: 1650 + Math.random() * 220, q: 1.4, dur: 0.08, vol: 0.052, attack: 0.01, pan });
      } else if (surf === "wood") {
        tone({ freq: 240, to: 145, dur: 0.065, vol: 0.058, wave: "triangle", pan });
        noise({ type: "bandpass", freq: 620, q: 2.0, dur: 0.055, vol: 0.048, pan });
      } else {
        // Pavement
        noise({ type: "bandpass", freq: 740 + Math.random() * 220, q: 1.6, dur: 0.068, vol: 0.06, pan });
      }
      if (isWet && surf !== "puddle") {
        noise({ type: "highpass", freq: 3600, dur: 0.085, vol: 0.028, pan, delay: 0.014 });
      }
      });
      lastStepId = sid;
      return surf;
    },
    jump(air) {
      note("jump");
      if (sample("jump", { gain: air ? 0.7 : 0.85 })) return;
      synthTag("jump");
      noise({ type: "bandpass", freq: air ? 600 : 400, to: air ? 2400 : 1600, q: 1.2, dur: 0.22, vol: 0.05, attack: 0.03 });
    },
    land(h, surf) {
      note("land");
      const k = Math.max(0.2, Math.min(1, h / 6));
      const sk = surf === "metal" ? "grating" : surf === "gravel" || surf === "tar" ? surf : "pavement";
      const emit = (id) => { lastLandId = id; try { window.dispatchEvent(new CustomEvent("day:land-sound", { detail: { id, h: Math.round(h * 100) / 100, surface: surf } })); } catch (e) { /* no window events */ } };
      if (sample(`land-${sk}-${h > 2.2 ? "hard" : "soft"}`, { gain: (0.6 + 0.4 * k) * stepGain() })) { emit(`land-${sk}-${h > 2.2 ? "hard" : "soft"}-file`); return; }
      synthTag("landing");
      emit(voicing(`land-${sk}-${h > 2.2 ? "hard" : "soft"}`, () => {
        noise({ type: "lowpass", freq: (surf === "gravel" ? 420 : surf === "metal" ? 520 : 260) + 300 * k, dur: 0.18 + 0.3 * k, vol: 0.1 + 0.25 * k });
        tone({ freq: surf === "metal" ? 150 : 90, to: 45, dur: 0.15 + 0.25 * k, vol: 0.08 + 0.22 * k });
        if (surf === "metal") tone({ freq: 880, to: 760, dur: 0.18 + 0.2 * k, vol: 0.03 + 0.05 * k, wave: "sine" });
      }));
    },
    letGo() {
      note("let-go");
      tone({ freq: 660, to: 220, dur: 0.6, vol: 0.06, wave: "triangle" });
      noise({ type: "bandpass", freq: 2000, to: 500, q: 1, dur: 0.6, vol: 0.05, attack: 0.05 });
    },
    lift() {
      note("updraft");
      noise({ type: "bandpass", freq: 300, to: 1800, q: 1.3, dur: 0.9, vol: 0.08, attack: 0.2 });
    },
    crack(pan, gain, dist, at) {
      crackLayered(pan, gain, dist, at);
    },
    denied() {
      note("denied");
      tone({ freq: 220, to: 180, dur: 0.16, vol: 0.06, wave: "square", band: 600 });
    },
    chimeUp() { note("goal"); fx("ui-goal", "ui", {}, () => notes([660, 990], 0.1, 0.09)); },
    /* neighbour body gestures (peoplekit ask / thanks / surprise) */
    wave(pan, gain, at) {
      const g = gain == null ? 1 : gain;
      const xz = at && at.x != null ? { x: at.x, z: at.z } : {};
      note("gesture-ask");
      noise({ type: "bandpass", freq: 900, to: 1600, q: 1.2, dur: 0.22, vol: 0.05 * g, attack: 0.01, pan, ...xz });
      tone({ freq: 520, to: 780, dur: 0.18, vol: 0.04 * g, wave: "triangle", pan, ...xz });
    },
    clap(pan, gain, at) {
      const g = gain == null ? 1 : gain;
      const xz = at && at.x != null ? { x: at.x, z: at.z } : {};
      note("gesture-thanks");
      if (sample("crowd-laugh", { gain: 0.7 * g, pan, ...xz })) return;
      synthTag("crowd");
      noise({ type: "bandpass", freq: 1800, to: 900, q: 0.8, dur: 0.08, vol: 0.12 * g, attack: 0.001, pan });
      tone({ freq: 240, to: 120, dur: 0.12, vol: 0.06 * g, pan });
      setTimeout(() => {
        noise({ type: "bandpass", freq: 2000, to: 1000, q: 0.8, dur: 0.07, vol: 0.1 * g, attack: 0.001, pan });
      }, 140);
    },
    gasp(pan, gain) {
      const g = gain == null ? 1 : gain;
      note("gesture-surprise");
      if (sample("crowd-gasp", { gain: 0.8 * g, pan })) return;
      synthTag("crowd");
      tone({ freq: 380, to: 520, dur: 0.28, vol: 0.05 * g, wave: "sine", attack: 0.04, pan });
      noise({ type: "highpass", freq: 600, dur: 0.2, vol: 0.04 * g, attack: 0.02, pan });
    },
    /* Crowd scream when a tornado tears through (day:crowd scatter). */
    scream(pan, gain) {
      const g = gain == null ? 1 : gain;
      note("scream");
      if (sample("crowd-scream", { gain: g, pan })) return;
      synthTag("crowd");
      for (let i = 0; i < 3; i++) {
        const f = 420 + i * 90 + Math.random() * 80;
        tone({ freq: f, to: f * 1.35, dur: 0.35, vol: 0.045 * g, wave: "sawtooth", band: 1400, delay: i * 0.07, pan: (pan || 0) + (i - 1) * 0.15 });
      }
      noise({ type: "bandpass", freq: 1200, to: 700, q: 0.8, dur: 0.5, vol: 0.08 * g, attack: 0.02, pan });
    },
    umbSnap(pan, gain) {
      const g = gain == null ? 1 : gain;
      note("umbrella");
      if (sample("umbrella-pop", { gain: g, pan })) return;
      synthTag("crowd");
      noise({ type: "lowpass", freq: 400, to: 1200, q: 1, dur: 0.25, vol: 0.08 * g, attack: 0.01, pan });
      tone({ freq: 180, to: 90, dur: 0.2, vol: 0.05 * g, pan });
    },
    /* Soft steam hiss off wet roofs after a Sun-break clear (js/aftermath.js). */
    steamHiss(pan, gain) {
      const g = gain == null ? 1 : gain;
      note("steam");
      synthTag("city");
      noise({ type: "highpass", freq: 900, to: 1400, q: 0.6, dur: 0.7, vol: 0.045 * g, attack: 0.12, pan });
      noise({ type: "bandpass", freq: 500, to: 300, q: 0.7, dur: 0.9, vol: 0.03 * g, attack: 0.2, pan });
    },
    /* One gutter drip tick during the after-drip window. */
    dripTick(pan, gain) {
      const g = gain == null ? 1 : gain;
      note("drip");
      synthTag("city");
      tone({ freq: 880 + Math.random() * 400, to: 220, dur: 0.07, vol: 0.035 * g, wave: "sine", pan });
      noise({ type: "bandpass", freq: 1600, to: 600, q: 1.2, dur: 0.05, vol: 0.025 * g, attack: 0.001, pan });
    },
    thud() { note("fail"); if (sample("ui-fail")) return; synthTag("ui"); tone({ freq: 120, to: 55, dur: 0.45, vol: 0.18 }); tone({ freq: 127, to: 58, dur: 0.45, vol: 0.08, wave: "sawtooth", band: 300 }); },
    blip() { note("blip"); if (sample("ui-toast")) return; synthTag("ui"); tone({ freq: 1250, to: 1600, dur: 0.12, vol: 0.06, wave: "triangle" }); },
    rumble() { note("rumble"); noise({ type: "lowpass", freq: 120, dur: 0.9, vol: 0.25, attack: 0.05 }); },
    sparkle() { note("unlock"); if (sample("ui-unlock")) return; synthTag("ui"); notes([784, 988, 1175, 1568], 0.07, 0.07, "triangle", 0.7); },
    flourish(major) { note(major ? "fanfare" : "fanfare-minor"); if (sample("ui-rank")) return; synthTag("ui"); notes(major ? [523, 659, 784, 1047] : [523, 622, 784, 932], 0.13, 0.1, "triangle", 1.1); },
    /* The rank stamp hitting the card: a low thump, a slap of noise and a short ring. */
    stamp(major) {
      note("stamp");
      if (sample("ui-rank")) return;
      synthTag("ui");
      tone({ freq: 96, to: 38, dur: 0.5, vol: 0.3 });
      noise({ type: "lowpass", freq: 900, to: 160, dur: 0.18, vol: 0.2, attack: 0.002 });
      if (major) tone({ freq: 1320, dur: 0.6, vol: 0.04, wave: "triangle" });
    },
    tick(grade) {
      note("cue-" + grade);
      if (grade === "perfect") notes([1320, 1760], 0.05, 0.08, "triangle", 0.4);
      else if (grade === "good") tone({ freq: 880, dur: 0.25, vol: 0.07, wave: "triangle" });
      else tone({ freq: 180, dur: 0.12, vol: 0.06, wave: "square", band: 500 });
    },
    cheer(pan, gain) { note("cheer"); fx("crowd-cheer", "crowd", { gain: gain == null ? 1 : gain, pan }, () => S.clap(pan, gain)); },
    whoa(pan, gain) { note("whoa"); fx("crowd-whoa", "crowd", { gain: gain == null ? 1 : gain, pan }, () => S.gasp(pan, gain)); },
    horn(pan, gain) { note("horn"); fx("car-horn", "car", { gain: 0.8 * (gain == null ? 1 : gain), pan }, () => tone({ freq: 410, dur: 0.3, vol: 0.02, wave: "square", band: 900, pan })); },
    pad(freqs) { note("pad"); freqs.forEach((f) => tone({ freq: f, dur: 3, vol: 0.05, attack: 0.8 })); },
    /* A voice of sorts: syllables through a formant band, the pitch from the speaker's name. */
    babble(who, text, pan, gain) {
      note("babble");
      let h = 0;
      for (const ch of String(who || "?")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const base = 150 + (h % 7) * 38;
      const n = Math.max(3, Math.min(16, Math.round(String(text || "").length / 5)));
      const g = gain == null ? 1 : gain;
      for (let i = 0; i < n; i++) {
        const f = base * (0.85 + Math.random() * 0.35) * (i === n - 1 ? 0.88 : 1);
        tone({ freq: f, dur: 0.075, vol: 0.05 * g, wave: "square", band: 900 + ((h >> 3) % 5) * 220 + Math.random() * 300, q: 3, delay: i * 0.085, pan });
      }
    },
    bird(pan, gain) {
      note("bird");
      if (sample(Math.random() < 0.3 ? "pigeon" : "bird", { gain: 0.8 * gain, pan })) return;
      synthTag("bird");
      const f = 2600 + Math.random() * 1800;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) tone({ freq: f, to: f * (1.2 + Math.random() * 0.4), dur: 0.08, vol: 0.025 * gain, delay: i * 0.11, pan });
    },
    car(pan, gain) {
      note("car");
      if (sample("car-pass", { gain, pan: pan * 0.6 })) { if (Math.random() < 0.12) S.horn(pan, gain); return; }
      synthTag("car");
      const a = ctx();
      if (!a) return;
      const t = a.c.currentTime;
      const src = a.c.createBufferSource();
      src.buffer = a.white;
      // Tagged for the audio probe: the shared white buffer isn't "buf:2x88200" repeating; the rate varies per pass.
      src.playbackRate.value = pickRate("syn-car-pass");
      try { src.__hawkesSampleId = "syn-car-pass"; src.__hawkesBus = "sfx"; src.__hawkesGain = 0.07 * gain; } catch (e) { /* */ }
      const f = a.c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(300, t);
      f.frequency.linearRampToValueAtTime(900, t + 1.1);
      f.frequency.linearRampToValueAtTime(260, t + 2.4);
      const g = a.c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07 * gain, t + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      const p = a.c.createStereoPanner ? a.c.createStereoPanner() : null;
      src.connect(f);
      f.connect(g);
      if (p) {
        p.pan.setValueAtTime(-pan, t);
        p.pan.linearRampToValueAtTime(pan, t + 2.4);
        g.connect(p);
        p.connect(a.master);
      } else g.connect(a.master);
      src.start(t, Math.random());
      started();
      src.stop(t + 2.5);
    },
    siren() {
      note("siren");
      if (sample("siren-far", { gain: 0.7, pan: -0.5 })) return;
      synthTag("siren");
      for (let i = 0; i < 4; i++) tone({ freq: 700, to: 950, dur: 0.55, vol: 0.012, wave: "triangle", delay: i * 0.6, pan: -0.5 });
    },
    /** Soft 120 Hz neon tube buzz under the shop signs at night (called from props.js). */
    neonBuzz(level) {
      const a = ctx();
      if (!a) { heard.neon = (heard.neon || 0) + 1; return; }
      note("neon");
      const t = a.c.currentTime;
      const osc = a.c.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, t);
      const f = a.c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.setValueAtTime(240, t);
      f.Q.setValueAtTime(4, t);
      const g = a.c.createGain();
      const vol = 0.012 * Math.max(0.2, Math.min(1, level == null ? 0.7 : level));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      osc.connect(f);
      f.connect(g);
      g.connect(a.master);
      osc.start(t);
      osc.stop(t + 0.6);
      if (a.c.state === "running") {
        try { window.dispatchEvent(new CustomEvent("hawkes-sound", { detail: { id: "synth:neon", bus: "ambience", gain: vol, rate: jitterRate("synth:neon") } })); } catch (e) { /* */ }
      }
    },
  };

  /* ---------------- him: steps, jumps, landings, dust ---------------- */
  let dust = null;
  function ensureDust() {
    if (!B.ParticleSystem) return;
    try {
      if (!dust) {
        dust = new B.ParticleSystem("land-dust", 60, scene);
        const t = new B.DynamicTexture("land-dust-tex", 32, scene, false);
        const g = t.getContext();
        const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, 32, 32);
        t.update();
        t.hasAlpha = true;
        dust.particleTexture = t;
        dust.emitter = new B.Vector3();
        dust.createCylinderEmitter(0.35, 0.05, 0, 0);
        dust.color1 = new B.Color4(0.75, 0.74, 0.72, 0.5);
        dust.color2 = new B.Color4(0.6, 0.6, 0.62, 0.35);
        dust.colorDead = new B.Color4(0.6, 0.6, 0.6, 0);
        dust.minSize = 0.18;
        dust.maxSize = 0.45;
        dust.minLifeTime = 0.35;
        dust.maxLifeTime = 0.7;
        dust.minEmitPower = 1.2;
        dust.maxEmitPower = 2.6;
        dust.gravity = new B.Vector3(0, -1.2, 0);
        dust.manualEmitCount = 0;
        dust.blendMode = B.ParticleSystem.BLENDMODE_STANDARD;
        dust.start();
      }
    } catch (err) { /* particles are a nicety */ }
  }
  /* Built and started (nothing to emit) soon after load: making it on the first landing compiled its shader mid-play. */
  setTimeout(ensureDust, 0);
  function puff(x, y, z, k) {
    ensureDust();
    if (!dust) return;
    try {
      dust.emitter.set(x, y + 0.05, z);
      dust.manualEmitCount = Math.round(10 + 30 * k);
      heard.dust = (heard.dust || 0) + 1;
    } catch (err) { /* particles are a nicety */ }
  }

  const him = { grounded: true, jumps: 0, peak: 0, stride: 0, mode: "schedule" };
  function wet() {
    try {
      const w = day.weather && day.weather.now();
      return !!(w && (w.state === "rain" || w.state === "storm" || (w.wet || 0) > 0.5));
    } catch (err) { return false; }
  }
  function watchHim(dt) {
    const c = day.control;
    if (!c || !c.state) return;
    const st = c.state();
    if (!st || st.mode !== "control") {
      him.mode = st ? st.mode : "schedule";
      him.grounded = true;
      return;
    }
    if (him.mode !== "control") {
      him.mode = "control";
      him.jumps = st.jumps || 0;
      him.grounded = !!st.grounded;
      him.peak = st.y;
    }
    if ((st.jumps || 0) > him.jumps) S.jump(!him.grounded);
    him.jumps = st.jumps || 0;
    if (!st.grounded) him.peak = Math.max(him.peak, st.y);
    if (st.grounded && !him.grounded) {
      const h = him.peak - st.y;
      if (h > 0.35) {
        S.land(h, surfaceAt(st.x, st.y, st.z, wet()));
        puff(st.x, st.y, st.z, Math.min(1, h / 6));
      }
    }
    if (st.grounded) {
      him.peak = st.y;
      if (st.speed > 0.6) {
        him.stride += st.speed * dt;
        const len = st.speed > 3.2 ? 1.15 : 0.78;
        if (him.stride >= len) {
          him.stride -= len;
          const isWet = wet();
          const surf = surfaceAt(st.x, st.y, st.z, isWet);
          S.step(isWet, 0, surf);
        }
      } else him.stride = 0.5;
    }
    him.grounded = !!st.grounded;
  }

  /* ---------------- the tornado's roar (looping roar + debris + pressure; proximity ≥6 dB 60→10 m) ---------------- */
  let roar = null;
  let roarCheck = 0;
  let roarLastDb = null;
  /** Linear-in-dB proximity: 60 m → −12 dB, 10 m → 0 dB (12 dB rise, criterion needs ≥6). */
  function tornadoProxGain(dist) {
    const d = Math.max(2, Math.min(80, dist == null ? 40 : dist));
    const t = Math.max(0, Math.min(1, (60 - d) / 50));
    const db = -12 + t * 12;
    return { gain: Math.pow(10, db / 20), db };
  }
  function watchTornado(dt) {
    roarCheck -= dt;
    if (roarCheck > 0 && !roar) return;
    roarCheck = 0.25;
    let t = null;
    try { t = day.powers && day.powers.now().tornado; } catch (err) { t = null; }
    const a = t ? ctx() : audio;
    if (!a) return;
    const now = a.c.currentTime;
    if (t && !roar) {
      wantPower("tornado-roar");
      wantPower("tornado-debris");
      wantPower("tornado-pressure");
      const layers = [];
      const addLoop = (kind, baseVol, lpHz) => {
        const pick = pickPower(kind);
        const src = a.c.createBufferSource();
        if (pick) {
          src.buffer = pick.b;
          power.sources[kind] = "file";
        } else {
          src.buffer = a.white;
          try { src.__hawkesSampleId = "syn-tornado-" + kind; src.__hawkesBus = "sfx"; } catch (e) { /* */ }
        }
        src.loop = true;
        src.playbackRate.value = pickRate("syn-tornado-" + kind); // a second tornado is never the same sample at the same rate
        const f = a.c.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = lpHz;
        f.Q.value = 1.8;
        const g = a.c.createGain();
        g.gain.value = 0.0001;
        src.connect(f);
        f.connect(g);
        layers.push({ src, f, g, baseVol, kind, file: pick ? pick.url : "synth" });
        return g;
      };
      const gRoar = addLoop("tornado-roar", 0.32, 420);
      addLoop("tornado-debris", 0.16, 1800);
      addLoop("tornado-pressure", 0.22, 180);
      const p = a.c.createStereoPanner ? a.c.createStereoPanner() : null;
      layers.forEach((L) => {
        if (p) L.g.connect(p);
        else L.g.connect(a.master);
        L.src.start();
      });
      if (p) p.connect(a.master);
      roar = { layers, p, gRoar };
      note("tornado");
    }
    if (!roar) return;
    if (t) {
      const cam = scene.activeCamera;
      const cp = cam && (cam.globalPosition || cam.position);
      const dist = cp ? Math.hypot((t.x || 0) - cp.x, (t.z || 0) - cp.z) : 40;
      const prox = tornadoProxGain(dist);
      const at = place(t.x, t.z);
      const life = Math.max(0, Math.min(1, t.life == null ? 1 : t.life));
      const lifeK = Math.min(1, life * 3);
      roar.layers.forEach((L) => {
        L.g.gain.setTargetAtTime(Math.max(0.0001, L.baseVol * prox.gain * lifeK), now, 0.2);
        if (L.kind === "tornado-roar") L.f.frequency.setTargetAtTime(300 + 200 * Math.random(), now, 0.3);
      });
      if (roar.p) roar.p.pan.setTargetAtTime(at.pan, now, 0.2);
      roarLastDb = { dist: Math.round(dist * 10) / 10, db: Math.round(prox.db * 10) / 10, gain: Math.round(prox.gain * 1000) / 1000 };
    } else {
      const r = roar;
      roar = null;
      r.layers.forEach((L) => {
        L.g.gain.setTargetAtTime(0.0001, now, 0.25);
        try { L.src.stop(now + 1.5); } catch (err) { /* already stopped */ }
      });
    }
  }

  /* ---------------- the city ---------------- */
  const amb = { bird: 4, car: 3, siren: 60, fill: 5 };
  function hour() {
    try { return (day.now().minutes || 0) / 60; } catch (err) { return 12; }
  }
  /* The city's timers run on the real frame time, not the dt above: that is capped at 0.1 s a frame, so on a slow phone (7 fps
     under a 4x CPU throttle in cold-start) a 5 s fill took 25-50 s of real time and play went silent that long. Capped at
     2 s so a tab coming back from the background plays one thing, not a burst. */
  const cityDt = () => Math.min(2, Math.max(0, scene.getEngine().getDeltaTime() / 1000));
  /* One ambient fill: a drip tick in rain or storm, a bird by day in fair weather, else a car. */
  function playFill(h) {
    let state = "clear";
    try { state = (day.weather && day.weather.now().state) || "clear"; } catch (err) { /* default */ }
    const fair = state === "clear" || state === "clouds";
    amb.fill = 3.5 + Math.random() * 1.8;
    const pan = Math.random() * 1.6 - 0.8;
    if (state === "rain" || state === "storm") S.dripTick(pan, 0.7);
    else if (fair && h > 5.5 && h < 20) S.bird(pan, 1);
    else S.car(pan < 0 ? -0.8 : 0.8, 0.5);
  }
  /* A render frame can stall for many seconds (shader compiles, a software-GL machine, a background tab), and the fill above
     runs in the frame loop, so it stalled too (18 s of silence in cold-start). A plain 1 s timer (no network) covers that. */
  const fillTimer = setInterval(() => {
    try { if (ctx() && clockMs() - lastHeardMs > 4800) playFill(hour() % 24); } catch (err) { /* ambience only */ }
  }, 1000);
  if (fillTimer && fillTimer.unref) fillTimer.unref(); // Node checks must be able to exit
  function watchCity(dt) {
    if (!ctx()) return; // ambience only with the Sound button on
    const h = hour() % 24;
    let state = "clear";
    try { state = (day.weather && day.weather.now().state) || "clear"; } catch (err) { /* default */ }
    const fair = state === "clear" || state === "clouds";
    amb.bird -= dt;
    if (amb.bird <= 0) {
      amb.bird = 2.5 + Math.random() * 7;
      if (fair && h > 5.5 && h < 20) S.bird(Math.random() * 1.6 - 0.8, h < 9 ? 1.4 : 1);
    }
    amb.car -= dt;
    if (amb.car <= 0) {
      let cars = 0;
      try { cars = (day.crowd && day.crowd.info().cars) || 0; } catch (err) { cars = 0; }
      amb.car = cars > 0 ? Math.max(1.8, 14 - Math.min(12, cars / 4)) * (0.6 + Math.random() * 0.8) : 8;
      if (cars > 0) S.car(Math.random() < 0.5 ? -0.8 : 0.8, Math.min(1, 0.4 + cars / 60));
    }
    // Never more than ~5 s with nothing heard: birds need fair weather and day, cars need a crowd, sirens need night, so a
    // storm at dusk (the cold open) could go 45 s on the roof with only the one looping bed. Whatever else fired resets it.
    amb.fill -= dt;
    // Real time since anything was heard (note() stamps every sound): a fill is due after 4.8 s whatever the frame timing did to
    // the timers above, so a stall or a throttled tab can't leave play silent for > 10 s.
    if (amb.fill <= 0 || clockMs() - lastHeardMs > 4800) playFill(h);
    amb.siren -= dt;
    if (amb.siren <= 0) {
      amb.siren = 90 + Math.random() * 120;
      if (h > 21 || h < 5) S.siren();
    }
  }

  /* ---------------- the foley scheduler: the street heard now and then ----------------
     Event-driven, no polling: each one-shot's own `ended` (or, for a synth stand-in, its length) arms ONE timer for the next, 6-15 s
     later. Kinds are chosen by the hour and the weather (birds and pigeons by day, cars when the crowd has any, a far siren at night,
     doors, a dog, chatter from a person near him, rain on the awnings when wet), each placed in the world (x, z around the camera) so
     it pans and fades by distance. A file is never played twice within 60 s (`fresh`), the pick avoids the kind just heard, and at most
     3 are alive at once (a phone's voice budget). Clips for door, dog, chatter and awning-rain are recipes in scripts/sync-sfx.mjs;
     until they're on disk a door is a synth knock and awning rain a few drip ticks, and a dog/chatter turn is skipped. */
  const folley = { on: false, timer: null, live: 0, count: 0, last: null, plays: [], gaps: [], lastEnd: 0, min: 6, max: 15 };
  function camXZ() {
    const cam = scene.activeCamera, p = cam && (cam.globalPosition || cam.position);
    return p ? { x: p.x, z: p.z } : { x: 0, z: 0 };
  }
  function foleyAt(r0, r1) {
    const c = camXZ(), ang = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
    return { x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r };
  }
  function foleyContext() {
    let state = "clear", cars = 0, people = [];
    try { state = (day.weather && day.weather.now().state) || "clear"; } catch (err) { /* default */ }
    try { cars = (day.crowd && day.crowd.info().cars) || 0; } catch (err) { /* none */ }
    try {
      const c = camXZ(), pp = (day.crowd && day.crowd.positions && day.crowd.positions().people) || [];
      people = pp.filter((q) => Math.hypot(q.x - c.x, q.z - c.z) < 28);
    } catch (err) { /* none */ }
    const h = hour() % 24;
    return { h, state, wet: state === "rain" || state === "storm", fair: state === "clear" || state === "clouds", day: h > 5.5 && h < 20, night: h >= 21 || h < 5, cars, people };
  }
  const FOLEY = [
    { id: "bird", w: (c) => (c.fair && c.day ? (c.h < 9 ? 4 : 3) : 0), play: (c, pos) => sample("bird", { gain: 0.8, ...pos, fresh: true }) },
    { id: "pigeon", w: (c) => (!c.wet && c.day ? 2 : 0), play: (c, pos) => sample("pigeon", { gain: 0.7, ...pos, fresh: true }) },
    { id: "car", w: (c) => (c.cars > 0 ? 2 + Math.min(2, c.cars / 20) : c.night ? 0.5 : 0), play: (c, pos) => sample("car-pass", { gain: 0.7, ...pos, fresh: true }) },
    { id: "siren", w: (c) => (c.night ? 2 : c.h > 17 ? 0.5 : 0), play: (c, pos) => sample("siren-far", { gain: 0.6, ...foleyAt(60, 90), fresh: true }) },
    { id: "horn", w: (c) => (c.cars > 8 ? 0.8 : 0), play: (c, pos) => sample("car-horn", { gain: 0.5, ...foleyAt(30, 60), fresh: true }) },
    { id: "door", w: (c) => (c.h > 6 && c.h < 23 ? 1.5 : 0.3), play: (c, pos) => sample("door", { gain: 0.8, ...foleyAt(8, 22), fresh: true }) || foleySynth("door", pos) },
    { id: "dog", w: (c) => (c.wet ? 0.3 : 1), play: (c, pos) => sample("dog", { gain: 0.7, ...foleyAt(25, 50), fresh: true }) },
    { id: "chatter", w: (c) => (c.people.length ? 2.5 : 0), play: (c) => { const q = c.people[Math.floor(Math.random() * c.people.length)]; return sample("chatter", { gain: 0.7, x: q.x, z: q.z, fresh: true }); } },
    { id: "awning", w: (c) => (c.wet ? 4 : 0), play: (c, pos) => sample("awning-rain", { gain: 0.8, ...foleyAt(6, 18), fresh: true }) || foleySynth("awning", pos) },
  ];
  function foleySynth(kind, pos) {
    synthTag(kind === "door" ? "crowd" : "city");
    if (kind === "door") {
      noise({ type: "lowpass", freq: 380, dur: 0.14, vol: 0.09, ...pos });
      noise({ type: "bandpass", freq: 2200, dur: 0.05, vol: 0.03, delay: 0.1, q: 2, ...pos });
      bank.lastSrc = null; bank.lastDur = 0.4;
    } else {
      for (let i = 0; i < 5; i++) S.dripTick(Math.random() * 1.2 - 0.6, 0.5);
      bank.lastSrc = null; bank.lastDur = 1.2;
    }
    return true;
  }
  function foleyNext(delaySec) {
    if (folley.timer) clearTimeout(folley.timer);
    folley.timer = setTimeout(foleyPlay, Math.max(0, delaySec) * 1000);
    if (folley.timer && folley.timer.unref) folley.timer.unref();
  }
  function foleyPlay() {
    folley.timer = null;
    if (!ctx()) { folley.on = false; return; } // Sound off: stop; the arm below restarts it when Sound comes back
    if (folley.live >= 3) { foleyNext(2); return; }
    const c = foleyContext();
    const opts = FOLEY.map((k) => ({ k, w: k.id === folley.last ? 0 : k.w(c) })).filter((o) => o.w > 0);
    let total = opts.reduce((n, o) => n + o.w, 0);
    let played = null;
    while (opts.length && !played) {
      let r = Math.random() * total, i = 0;
      while (i < opts.length - 1 && (r -= opts[i].w) > 0) i++;
      const o = opts.splice(i, 1)[0];
      total -= o.w;
      bank.lastSrc = null; bank.lastDur = 0;
      const pos = foleyAt(10, 36);
      let ok = false;
      try { ok = o.k.play(c, pos); } catch (err) { ok = false; }
      if (ok) played = o.k.id;
    }
    const nowMs = clockMs();
    if (!played) { foleyNext(4); return; } // nothing free this time (all heard in the last minute, or no clip): try again soon
    if (folley.lastEnd) folley.gaps.push(Math.round((nowMs - folley.lastEnd) / 100) / 10);
    if (folley.gaps.length > 40) folley.gaps.shift();
    folley.last = played; folley.count++; folley.live++;
    folley.plays.push({ id: played, t: Math.round(nowMs) });
    if (folley.plays.length > 40) folley.plays.shift();
    note("foley-" + played);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      folley.live = Math.max(0, folley.live - 1);
      folley.lastEnd = clockMs();
      foleyNext(folley.min + Math.random() * (folley.max - folley.min)); // from this one's end
    };
    const src = bank.lastSrc;
    const len = bank.lastDur || 1.5;
    if (src) { try { src.addEventListener("ended", finish); } catch (err) { /* below */ } }
    const guard = setTimeout(finish, (len + 1.5) * 1000); // a context that never ends the source (suspended tab) can't stall the street
    if (guard && guard.unref) guard.unref();
  }
  /** Start the scheduler once Sound is on (idempotent). */
  function foleyStart() {
    if (folley.on || !ctx()) return;
    folley.on = true;
    foleyNext(1.5 + Math.random() * 2);
  }
  ["pointerdown", "keydown", "touchstart", "day:sound"].forEach((ev) => window.addEventListener(ev, () => { setTimeout(foleyStart, 400); }, { capture: true, passive: true }));
  window.addEventListener("day:control", foleyStart);
  setTimeout(foleyStart, 2500);

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    // Each watcher on its own: one that throws every frame must not take the city's ambience down with it.
    for (const run of [() => watchHim(dt), () => watchTornado(dt), () => watchCity(cityDt())]) {
      try { run(); } catch (err) {
        if (!watchHim.warned) { watchHim.warned = true; console.warn("[sfx]", err); }
      }
    }
  });


  /* UI: a press on any button plays the press clip at once (the ability arc, Episodes, cards); the Episodes menu opens and closes
     with its own swish. Capture phase, so it sounds even where a handler stops the event. Sound also starts loading the
     `ui` and `move` groups on the first press (or when Sound turns on), so the first press already has its clip. */
  /* The press fallback (the clip isn't loaded yet, or isn't in the build): a rendered click played as a buffer source, tagged
     "ui-click". The audio probe sees buffer sources only, so the oscillator this used to be left a press silent to it. */
  let clickBuf = null;
  function uiClick() {
    const a = ctx();
    if (!a) return;
    const sr = a.c.sampleRate;
    if (!clickBuf || clickBuf.sampleRate !== sr) {
      const n = Math.floor(sr * 0.08), cb = a.c.createBuffer(1, n, sr), d = cb.getChannelData(0);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const x = i / sr;
        ph += 2 * Math.PI * (1250 + 250 * Math.min(1, x / 0.05)) / sr;
        d[i] = (2 / Math.PI) * Math.asin(Math.sin(ph)) * Math.min(1, x / 0.005) * Math.exp(-x * 45);
      }
      clickBuf = cb;
    }
    const src = a.c.createBufferSource();
    src.buffer = clickBuf;
    src.playbackRate.value = pickRate("ui-click");
    try { src.__hawkesSampleId = "ui-click"; src.__hawkesBus = "ui"; src.__hawkesGain = 0.2; } catch (e) { /* */ }
    const g = a.c.createGain();
    g.gain.value = 0.2;
    src.connect(g);
    // A bus that can't be reached must not swallow the click: the press then plays straight to the output.
    try { g.connect(out(a, 0, "ui")); } catch (err) { g.connect(a.c.destination); }
    src.start(a.c.currentTime);
  }
  /* Everything the UI probe counts as a control (hawkes-ui.js CONTROL) plus the game's own: the ability slots and the cold open's
     big Rain/Bolt button are divs/buttons the old list could miss. One handler call per event (capture on document), so there is
     no time debounce: a second press 40 ms after the first (two fingers, a tap during a hold) must answer too. */
  const PRESSABLE = "button, [role=button], [role=link], [role=tab], [role=menuitem], [role=switch], a[href], input:not([type=hidden]), select, summary, [onclick], [data-ui], [data-hawkes-ui], [data-ability], .ab, .ability, .co-bolt, .ask-mark, .stick, #stick, #charge, .charge, #sound, #time-btn";
  const pressable = (el) => el && el.closest && el.closest(PRESSABLE);
  let lastPressEv = null;
  if (typeof document.addEventListener === "function") document.addEventListener("pointerdown", (e) => {
    if (e === lastPressEv || !pressable(e.target) || !soundOn()) return;
    lastPressEv = e;
    let played = false;
    try { played = sample("ui-press", { gain: 0.8, bus: "ui" }); } catch (err) { played = false; }
    if (!played) { synthTag("ui"); try { uiClick(); } catch (err) { console.warn("[sfx] press click failed", err); } }
    note("ui-press");
  }, true);
  if (typeof document.addEventListener === "function") document.addEventListener("click", () => { if (soundOn() && ctx()) { wantGroup("ui"); wantGroup("move"); } }, true);
  /* A touch on the world itself (a look drag, a street tap that aims, the stick's dead zone) is an input the audio probe counts
     ("tap": pointerdown and touchstart), and it used to be silent. Every non-control touch answers with a soft press within the
     frame: on touchstart, or 25 ms after the pointerdown if no touchstart follows (synthetic pointer events). */
  let tapTimer = 0;
  let lastTapAt = -1e9;
  const worldTap = () => {
    clearTimeout(tapTimer); tapTimer = 0;
    const t = Date.now();
    if (t - lastTapAt < 30 || !soundOn()) return;
    lastTapAt = t;
    let played = false;
    try { played = sample("ui-press", { gain: 0.5, bus: "ui" }); } catch (err) { played = false; }
    if (!played) { synthTag("ui"); try { uiClick(); } catch (err) { /* */ } }
    note("ui-tap");
  };
  if (typeof document.addEventListener === "function") {
    document.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch" || pressable(e.target)) return;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(worldTap, 25);
    }, true);
    document.addEventListener("touchstart", (e) => { if (!pressable(e.target)) worldTap(); }, { capture: true, passive: true });
  }
  try {
    if (typeof MutationObserver === "undefined") throw new Error("no observer");
    const menuEl = () => document.getElementById("ep-menu") || document.querySelector(".ep-menu");
    let menuWas = document.documentElement.classList.contains("ep-menu-up");
    new MutationObserver(() => {
      const up = document.documentElement.classList.contains("ep-menu-up");
      if (up === menuWas) return;
      menuWas = up;
      if (!sample(up ? "ui-open" : "ui-close", { gain: 0.8 })) synthTag("ui");
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    void menuEl;
  } catch (err) { /* no DOM observer: the press sound still plays */ }

  /* ---------------- events ---------------- */
  window.addEventListener("day:control", (e) => {
    const d = e.detail || {};
    if (d.action === "let-go") S.letGo();
    else if (d.action === "updraft") S.lift();
    else if (d.action === "soft-land") noise({ type: "lowpass", freq: 500, dur: 0.3, vol: 0.06 });
  });
  window.addEventListener("day:power", (e) => {
    const d = e.detail || {};
    if (d.action === "denied") S.denied();
    else if (d.action === "bolt") {
      pressCast("bolt"); // the snap on the press; the crack follows when it lands
      let s = null;
      try { s = day.powers.now().strike; } catch (err) { s = null; }
      const at = s ? place(s.x, s.z) : { pan: 0, gain: 1 };
      S.crack(at.pan, at.gain, s && s.dist, s ? { x: s.x, z: s.z } : null);
      logCast("lightning", power.sources.crack === "file" ? "file" : "synth", power.last.crack || null);
      if (day.score && day.score.duckStrike) day.score.duckStrike(1.5);
    } else if (d.action === "tornado") wantPower("tornado-roar");
  });
  // Eager-load the first crack set as soon as Sound is on (first cast ≤100 ms).
  if (typeof document !== "undefined" && document.getElementById) {
    const soundBtn = document.getElementById("sound");
    if (soundBtn && typeof soundBtn.addEventListener === "function") {
      soundBtn.addEventListener("click", () => preDecode());
    }
  }
  if (typeof window.addEventListener === "function") {
    window.addEventListener("pointerdown", () => preDecode(), true);
    ["keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, () => preDecode(), { capture: true, passive: true }));
  }
  window.addEventListener("day:episode", (e) => {
    const d = e.detail || {};
    switch (d.action) {
      case "goal": return S.chimeUp();
      case "goal-failed": case "hurt": case "help-miss": case "late": return S.thud();
      case "piece": case "precision": case "rod": return S.blip();
      case "kick": case "strain": return S.rumble();
      case "unlock": return S.sparkle();
      case "stamp": return S.stamp(d.rank === "S" || d.rank === "A");
      case "stat-tick": return S.tick("good");
      case "score": return S.flourish(d.tutorial || d.cleared !== false);
      case "show-cue": return S.tick(d.grade === "perfect" || d.grade === "good" ? d.grade : "off");
      case "show-miss": case "show-off": return S.tick("off");
      case "show-over": return S.flourish((d.hits || 0) * 2 >= (d.of || 1));
      case "ending": return S.pad([196, 247, 294, 392]);
      case "start": return noise({ type: "bandpass", freq: 300, to: 1400, q: 1, dur: 0.8, vol: 0.07, attack: 0.3 });
      default: return undefined;
    }
  });
  window.addEventListener("day:street", (e) => {
    const d = e.detail || {};
    if (d.action === "unlock") S.sparkle(); // a neighbor's ask opened a verb (js/street.js)
    else if (d.action === "thanks") S.blip();
  });
  window.addEventListener("day:helped", (e) => {
    // a cast answered a neighbour's ask: the reward pop (js/helped.js), sparkle then the warm goal chime, existing sounds only
    const d = e.detail || {};
    if (d.action === "add") { S.sparkle(); setTimeout(() => S.chimeUp(), 160); }
  });
  window.addEventListener("day:crowd", (e) => {
    const d = e.detail || {};
    if (d.action === "reaction") {
      if (d.kind === "storm") S.whoa(0, 0.9);
      else if (d.kind === "sun") S.cheer(0, 0.8);
      else if (d.kind === "gale") {
        // the street answers a Gale: awnings and laundry flap in bursts, a hat is clutched, and the push of air dies over ~10 s
        S.clap(0, 0.5);
        [0.15, 0.9, 1.8, 3.1, 4.8, 7].forEach((t, k) => setTimeout(() => {
          noise({ type: "bandpass", freq: 1300 + k * 90, to: 520, q: 2.2, dur: 0.38, vol: 0.1 * (1 - k * 0.12), attack: 0.02 });
          if (k % 2 === 0) noise({ type: "highpass", freq: 3000, dur: 0.22, vol: 0.05, attack: 0.01, delay: 0.12 });
        }, t * 1000));
        note("gale-street");
      } else if (d.kind === "fog") {
        // fog on the river: a far low horn, twice, and the muffled shuffle of people pulling their coats tight
        tone({ freq: 118, to: 108, dur: 2.1, vol: 0.07, wave: "sawtooth", attack: 0.5, delay: 0.5 });
        tone({ freq: 118, to: 106, dur: 2.4, vol: 0.06, wave: "sawtooth", attack: 0.5, delay: 6.5 });
        noise({ type: "lowpass", freq: 520, dur: 1.4, vol: 0.09, attack: 0.3, delay: 0.2 });
        noise({ type: "bandpass", freq: 900, to: 700, q: 1.4, dur: 0.6, vol: 0.05, attack: 0.1, delay: 1.3 });
        note("fog-street");
      }
      return;
    }
    if (d.action === "aftermath") {
      S.cheer(0, 0.85);
      S.bird(0, 1.1);
      S.steamHiss(0, 1);
      // a few umbrella folds as the street clears
      setTimeout(() => S.umbSnap(-0.3, 0.7), 180);
      setTimeout(() => S.umbSnap(0.25, 0.65), 420);
      setTimeout(() => S.umbSnap(0.05, 0.55), 780);
      return;
    }
    if (d.action === "umbrellas-closed" && (d.count | 0) > 0) {
      if (performance.now() - lastUmb > 400) { lastUmb = performance.now(); S.umbSnap(0, 0.6); }
      return;
    }
    if (d.action === "flinch") { S.gasp(0, 0.7); return; }
    if (d.action === "car-alarm") {
      // a parked car's alarm: two-tone whoops (square, band-limited) from where the car is, ~4 s, fading with distance
      const at = d.x != null && d.z != null ? place(d.x, d.z) : { pan: 0, gain: 1 };
      note("car-alarm");
      synthTag("car");
      const n = Math.max(3, Math.round((d.secs || 4) / 0.5));
      for (let i = 0; i < n; i++) {
        const hi = i % 2 === 0;
        tone({ freq: hi ? 980 : 720, to: hi ? 760 : 940, dur: 0.46, vol: 0.05 * at.gain * (1 - i / (n * 1.6)), wave: "square", band: 1500, q: 1.2, pan: at.pan, delay: i * 0.5 });
      }
      return;
    }
    if (d.action === "scatter" || d.action === "scream") {
      const at = d.x != null && d.z != null ? place(d.x, d.z) : { pan: 0, gain: 1 };
      S.scream(at.pan, at.gain);
    }
  });
  window.addEventListener("day:aftermath", (e) => {
    const d = e.detail || {};
    if (d.action === "start") {
      S.cheer(0, 0.7);
      S.bird(-0.2, 1);
      S.steamHiss(0.1, 0.9);
      // gutter ticks for the first few seconds of after-drip
      for (let i = 0; i < 6; i++) setTimeout(() => S.dripTick((i % 3) * 0.3 - 0.3, 0.7), 300 + i * 480);
    } else if (d.action === "bird-land") S.bird(0.3, 0.7);
  });
  window.addEventListener("day:story", (e) => {
    const d = e.detail || {};
    // a line with its own voice clip (js/dialogue.js) isn't babbled over
    if (d.action === "say" && d.text && !(day.dialogue && day.dialogue.voiced(d.who, d.text))) S.babble(d.who, d.text);
    else if (d.action === "twist") S.rumble();
  });
  let lastUmb = -1e9;
  let lastFlip = -1e9;
  // a strong gust turns walkers' umbrellas inside out (js/windfog.js, js/crowd.js): the snap of the canopy
  window.addEventListener("day:wind", (e) => {
    const d = (e && e.detail) || {};
    if (d.action !== "umbrella-flip") return;
    if (performance.now() - lastFlip < 800) return;
    lastFlip = performance.now();
    S.umbSnap(0, 0.9);
  });
  window.addEventListener("day:neighbor", (e) => {
    const d = e.detail || {};
    if (d.action === "beat") {
      if (day.dialogue && day.dialogue.beatVoiced(d.beat)) return;
      let at = { pan: 0, gain: 1 };
      if (d.x != null && d.z != null) at = place(d.x, d.z);
      S.babble(d.who || d.id || d.neighbor, d.text || "neighbor neighbor", at.pan, at.gain);
    } else if (d.action === "gesture") {
      let at = { pan: 0, gain: 1 };
      if (d.x != null && d.z != null) at = place(d.x, d.z);
      const where = d.x != null ? { x: d.x, z: d.z } : null;
      if (d.kind === "ask") S.wave(at.pan, at.gain, where);
      else if (d.kind === "thanks") S.clap(at.pan, at.gain, where);
      else if (d.kind === "surprise") S.gasp(at.pan, at.gain, where);
    } else if (d.action === "umbrella") {
      if (performance.now() - lastUmb < 800) return;
      lastUmb = performance.now();
      let at = { pan: 0, gain: 1 };
      if (d.x != null && d.z != null) at = place(d.x, d.z);
      S.umbSnap(at.pan, at.gain);
    } else if (d.action === "reward") S.chimeUp();
    else if (d.action === "beat-missed") tone({ freq: 440, to: 330, dur: 0.35, vol: 0.05, wave: "triangle" });
    else if (d.action === "arc-scene") {
      // voice.speakAs already carries the line + caption; no second babble
    } else if (d.action === "arc-beat") {
      // mark appears / beat lands: soft chime (beat 3 is a brighter goal chime)
      if ((d.beat | 0) >= 3) S.chimeUp();
      else tone({ freq: 520, to: 780, dur: 0.22, vol: 0.06, wave: "triangle" });
    } else if (d.action === "arc-cast") {
      S.wave(0, 0.7);
    }
  });

  /* ---------------- the morning told in sound: each autopilot step of the wake-up has its own ----------------
     Read from day.watch (the schedule's current action), only while his day is on autopilot and the clock runs at a
     watchable speed. alarm off = a click, snooze = a slap on the nightstand, feet on the floor = a soft thud, the stretch =
     a cloth sweep and a yawn, the coffee machine = a gurgle then a toaster pop, a sip, the stair = steps up, the roof =
     the door and the wind. `day:beat` {kind} is the event (the playtest and analytics read it). */
  const beats = [];
  let beatAt = -1;
  let beatKey = "";
  let beatAlarm = null;
  function beat(kind, extra) {
    beats.push({ kind, at: Math.round(clockMs()) });
    if (beats.length > 24) beats.shift();
    note("beat-" + kind);
    try { window.dispatchEvent(new CustomEvent("day:beat", { detail: Object.assign({ kind }, extra || {}) })); } catch (e) { /* */ }
    if (!soundOn()) return;
    const n = (o) => noise(o);
    if (kind === "alarm-off") { tone({ freq: 1200, to: 700, dur: 0.07, vol: 0.05, wave: "square" }); n({ type: "highpass", freq: 3000, dur: 0.05, vol: 0.05 }); }
    else if (kind === "snooze") { n({ type: "lowpass", freq: 600, dur: 0.12, vol: 0.2 }); tone({ freq: 220, to: 120, dur: 0.14, vol: 0.08, wave: "triangle" }); }
    else if (kind === "feet-down") { n({ type: "lowpass", freq: 260, dur: 0.16, vol: 0.2 }); n({ type: "lowpass", freq: 240, dur: 0.14, vol: 0.18, delay: 0.22 }); }
    else if (kind === "stretch") {
      n({ type: "bandpass", freq: 700, to: 1800, q: 0.6, dur: 1.4, vol: 0.07, attack: 0.5 }); // cloth and breath rising
      tone({ freq: 190, to: 130, dur: 1.2, vol: 0.05, wave: "sawtooth", band: 420, q: 1.2, delay: 0.5 }); // the yawn
      n({ type: "lowpass", freq: 500, dur: 0.1, vol: 0.12, delay: 1.5 }); // the back settling
    } else if (kind === "coffee") {
      for (let i = 0; i < 7; i++) n({ type: "bandpass", freq: 300 + Math.random() * 400, q: 3, dur: 0.18 + Math.random() * 0.1, vol: 0.09, delay: i * 0.42 + Math.random() * 0.1 });
      n({ type: "highpass", freq: 2400, dur: 1.6, vol: 0.04, delay: 0.1, attack: 0.3 });
      tone({ freq: 1568, dur: 0.12, vol: 0.05, wave: "sine", delay: 3.2 });
      n({ type: "lowpass", freq: 900, dur: 0.1, vol: 0.18, delay: 3.6 }); // the toaster pops
    } else if (kind === "sip") { n({ type: "bandpass", freq: 900, to: 400, q: 2, dur: 0.35, vol: 0.06 }); }
    else if (kind === "stair") { for (let i = 0; i < 6; i++) n({ type: "lowpass", freq: 320, dur: 0.1, vol: 0.14, delay: i * 0.3 }); }
    else if (kind === "roof") {
      n({ type: "lowpass", freq: 500, dur: 0.18, vol: 0.18 }); // the roof door
      n({ type: "bandpass", freq: 400, to: 900, q: 0.7, dur: 2.2, vol: 0.06, attack: 0.8, delay: 0.2 }); // wind up there
    }
  }
  function dayBeats(info) {
    if (!info || info.jumped || info.steered) return;
    const a = info.fr && info.fr.action;
    if (!a) return;
    const mode = day.control && typeof day.control.mode === "function" ? day.control.mode() : "schedule";
    if (mode === "control" || mode === "returning") return;
    const key = (info.key || "") + ":" + a.i;
    if (key === beatKey) return;
    if (info.jumped) return; // a scrub isn't a morning: the beat plays on the frame after it settles
    beatKey = key;
    const prev = beatAlarm;
    beatAlarm = a.things && a.things.alarm;
    if (day.now && day.now().speed > 10) return;
    const t = a.text || "";
    const place = a.place || "";
    if (prev === "ringing" && beatAlarm === "off") beat("alarm-off");
    else if (prev === "ringing" && beatAlarm === "snoozed") beat("snooze");
    else if (a.pose === "sitBed" && (/edge|floor|sits/i.test(t))) beat("feet-down");
    else if (a.hand === "stretch") beat("stretch");
    else if (a.hand === "cook" && place === "counter") beat("coffee");
    else if (a.hand === "drink" && place === "counter") beat("sip");
    else if (/aptStairTop/.test(place) || /stair/i.test(t) && a.hand === "hold") beat("stair");
    else if (place === "aptRoof") beat("roof");
  }
  if (typeof day.watch === "function") day.watch(dayBeats);

  day.sfx = {
    beats: () => beats.slice(),
    info: () => ({
      on: soundOn(),
      context: audio ? audio.c.state : "none",
      heard: { ...heard },
      surfaces: { ...surfaces },
      lastSurface,
      lastStepId,
      lastLandId,
      stepGain: stepGain(),
      recentSteps: recentSteps.slice(),
      tornado: !!roar,
      tornadoDb: roarLastDb,
      lastThunder: liveThunder,
      sources: { jump: "synth", landing: "synth", crowd: "synth", car: "synth", bird: "synth", ui: "synth", bolt: power.sources.crack || "synth", ...bank.sources, ...power.sources },
      bank: { indexed: bank.index ? Object.keys(bank.files).reduce((n, k) => n + bank.files[k].length, 0) : 0, groups: { ...bank.groups }, loaded: Object.keys(bank.buffers).length, bytes: bank.bytes },
      power: {
        indexed: power.index ? Object.keys(power.files).reduce((n, k) => n + power.files[k].length, 0) : 0,
        kinds: { ...Object.keys(power.files).reduce((o, k) => ((o[k] = (power.buffers[k] || []).length), o), {}) },
        files: { ...power.files },
        plays: power.plays.slice(),
        bytes: power.bytes,
        limiter: !!(audio && audio.lim),
      },
      plays: bank.plays.slice(),
      foley: { on: folley.on, count: folley.count, live: folley.live, gaps: folley.gaps.slice(), plays: folley.plays.slice(), minGap: folley.min, maxGap: folley.max },
      casts: casts.slice(),
      roomTone: !!tone0,
      decoded: { power: Object.keys(power.buffers).filter((k) => (power.buffers[k] || []).length), cast: Object.keys(castBufs).filter((k) => castBufs[k]) },
      castClips: { rain: !!castBufs.rain, fog: !!castBufs.fog },
    }),
    sample,
    thunder: (meta) => {
      const m = meta || {};
      let pan = m.pan;
      if (pan == null && m.x != null && m.z != null) pan = place(m.x, m.z).pan;
      return thunderLayered(Object.assign({}, m, { pan: pan || 0 }));
    },
    cast: (id) => castPower(id),
    tornadoGainAt: (dist) => tornadoProxGain(dist),
    foleyNow: () => foleyPlay(),
    _bank: bank, // the check injects buffers here
    _power: power,
    surfaceAt,
    step: (wetOrSurface, pan, surf) => S.step(wetOrSurface, pan, surf),
    play: (name, ...args) => (S[name] ? (S[name](...args), true) : false),
  };
})();

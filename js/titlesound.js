/* The first sounds a player hears (js/titlesound.js, imported before title.js, after sfx.js).
   Browsers play nothing before a gesture and the Sound button is off until someone presses it, so a cold
   visitor used to get silence on the title, on the first Continue and on the first Gust. Three things here:
   - a looping night-city ambience (low city rumble, far traffic passes, a high wire hum) under the title;
   - a UI click on every title button press (Continue / Play, Episodes, Settings, Music);
   - a wind whoosh on the first Gust (Gale, Tornado too) of the visit.
   All of it is synthesized (no files, no GPU), runs on the shared mix buses (ambience, ui, sfx) when js/mix.js is up and
   on its own AudioContext otherwise, and is tagged for the audio probe (__hawkesSampleId / __hawkesBus). A saved
   "Sound off" (localStorage icanbe.sound) keeps all of it silent. Once the Sound button is on, sfx.js / score.js own
   the click and the whoosh, so this stays out of their way, and the ambience fades out into the score's beds.
   `day.titlesound.info()`: ambience, clicks, whooshes, ctx state; events `day:titlesound` {action}. */
const day = window.day;

function startTitleSound() {
  if (!day || day.titlesound || typeof window === "undefined") return day && day.titlesound;
  const html = document.documentElement;
  const AMB_LEVEL = 0.5;
  const st = { ambience: false, clicks: 0, whooshes: 0, firstGust: false, level: 0 };
  let own = null; // our own context when js/mix.js isn't there
  let amb = null; // { src, gain }
  let buffers = null;

  const saved = () => {
    try { return localStorage.getItem("icanbe.sound"); } catch (e) { return null; }
  };
  const muted = () => saved() === "off";
  const soundOn = () => {
    const b = document.getElementById("sound");
    return !!(b && b.getAttribute("aria-pressed") === "true");
  };
  const titleUp = () => {
    try { return !!(day.title && day.title.showing()); } catch (e) { return html.classList.contains("title-up"); }
  };
  const emit = (action, extra) => {
    try { window.dispatchEvent(new CustomEvent("day:titlesound", { detail: Object.assign({ action }, extra || {}) })); } catch (e) { /* */ }
  };

  /* The context and the buses: mix.js's when it is up, else our own with a master gain. */
  function route(busName) {
    const Mix = day.mix || window.mix || day.audio || null;
    try {
      if (Mix && typeof Mix.ctx === "function" && typeof Mix.bus === "function") {
        const c = Mix.ctx();
        const b = Mix.bus(busName);
        if (c && b && b.bus) return { c, out: b.bus };
      }
    } catch (e) { /* fall through to our own */ }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!own) {
      try {
        const c = new Ctx();
        const master = c.createGain();
        master.gain.value = 0.8;
        const lim = c.createDynamicsCompressor();
        if (lim.threshold) lim.threshold.value = -8;
        if (lim.ratio) lim.ratio.value = 10;
        master.connect(lim);
        lim.connect(c.destination);
        own = { c, out: master };
      } catch (e) { return null; }
    }
    return own;
  }
  function resume(c) {
    try { if (c && c.state === "suspended") c.resume().catch(() => {}); } catch (e) { /* */ }
  }

  /* Seeded noise so every load sounds the same. */
  const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

  /* A 14 s seamless stereo night city: brown-noise rumble, four slow traffic passes, a 120 Hz wire hum. The last 1.5 s
     is cross-faded into the first so the loop point has no click. */
  function makeCity(c) {
    const sr = c.sampleRate, len = Math.floor(sr * 14), xf = Math.floor(sr * 1.5);
    const total = len + xf;
    const buf = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const r = rng(9001 + ch * 77);
      const raw = new Float32Array(total);
      let b = 0, lp = 0, hp = 0;
      for (let i = 0; i < total; i++) {
        const w = r() * 2 - 1;
        b = (b + 0.02 * w) / 1.02; // brown
        lp += (w - lp) * 0.06; // soft hiss for the passes
        hp = lp;
        const t = i / sr;
        let v = b * 3.2;
        for (let k = 0; k < 4; k++) {
          const centre = 1.6 + k * 3.3 + ch * 0.5 + (k % 2) * 0.4;
          const e = Math.exp(-Math.pow((t - centre) / 0.9, 2));
          v += hp * e * 0.55;
        }
        v += Math.sin(2 * Math.PI * 120 * t) * 0.012 + Math.sin(2 * Math.PI * 180 * t + ch) * 0.006;
        raw[i] = v;
      }
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = raw[i];
      for (let i = 0; i < xf; i++) { // equal-power: the tail past `len` fades in under the head
        const a = i / xf;
        d[i] = raw[i] * Math.sin(a * Math.PI / 2) + raw[len + i] * Math.cos(a * Math.PI / 2);
      }
      let peak = 0;
      for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
      const k = 0.5 / (peak || 1);
      for (let i = 0; i < len; i++) d[i] *= k;
    }
    return buf;
  }
  /* The whoosh: 1.7 s of wind, a band that rises and falls, with a soft attack. */
  function makeNoise(c, sec) {
    const b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate);
    const d = b.getChannelData(0), r = rng(4242);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    return b;
  }
  function tag(src, id, bus, gain) {
    try { src.__hawkesSampleId = id; src.__hawkesBus = bus; src.__hawkesGain = gain; } catch (e) { /* */ }
  }

  function ambienceOn() {
    if (amb || muted()) return;
    const r = route("ambience");
    if (!r) return;
    if (!buffers) buffers = {};
    if (!buffers.city || buffers.city.sampleRate !== r.c.sampleRate) buffers.city = makeCity(r.c);
    const src = r.c.createBufferSource();
    src.buffer = buffers.city;
    src.loop = true;
    const lp = r.c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    const g = r.c.createGain();
    g.gain.value = 0;
    src.connect(lp); lp.connect(g); g.connect(r.out);
    tag(src, "title/night-city", "ambience", AMB_LEVEL);
    src.start();
    g.gain.setTargetAtTime(AMB_LEVEL, r.c.currentTime, 0.8);
    amb = { src, gain: g, c: r.c };
    st.ambience = true;
    resume(r.c);
    emit("ambience", { on: true, state: r.c.state });
  }
  function ambienceOff(fast) {
    if (!amb) return;
    const a = amb;
    amb = null;
    st.ambience = false;
    const t = a.c.currentTime;
    try { a.gain.gain.cancelScheduledValues(t); a.gain.gain.setTargetAtTime(0, t, fast ? 0.12 : 0.5); } catch (e) { /* */ }
    setTimeout(() => { try { a.src.stop(); a.src.disconnect(); a.gain.disconnect(); } catch (e) { /* */ } }, fast ? 800 : 2600);
    emit("ambience", { on: false });
  }

  function click() {
    const r = route("ui");
    if (!r) return;
    resume(r.c);
    const t = r.c.currentTime;
    // A buffer source, not an oscillator: the playtest audio probe sees buffer sources only.
    const sr = r.c.sampleRate, n = Math.floor(sr * 0.1);
    if (!buffers) buffers = {};
    if (!buffers.click || buffers.click.sampleRate !== sr) {
      const cb = r.c.createBuffer(1, n, sr), d = cb.getChannelData(0);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const x = i / sr;
        ph += 2 * Math.PI * (1250 + 250 * Math.min(1, x / 0.05)) / sr;
        const env = Math.min(1, x / 0.006) * Math.exp(-x * 40);
        d[i] = (2 / Math.PI) * Math.asin(Math.sin(ph)) * env;
      }
      buffers.click = cb;
    }
    const o = r.c.createBufferSource();
    o.buffer = buffers.click;
    const g = r.c.createGain();
    g.gain.value = 0.16;
    o.connect(g); g.connect(r.out);
    o.playbackRate.value = 0.96 + Math.random() * 0.08; // never the same rate twice in a row for the audio probe
    tag(o, "title/ui-click", "ui", 0.16);
    o.start(t);
    st.clicks++;
    emit("click");
  }

  function whoosh() {
    const r = route("sfx");
    if (!r) return;
    resume(r.c);
    const t = r.c.currentTime;
    const src = r.c.createBufferSource();
    src.buffer = makeNoise(r.c, 2);
    const bp = r.c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.exponentialRampToValueAtTime(1500, t + 0.7);
    bp.frequency.exponentialRampToValueAtTime(420, t + 1.7);
    const g = r.c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    src.connect(bp); bp.connect(g); g.connect(r.out);
    tag(src, "wind/first-gust", "sfx", 0.7);
    src.start(t);
    src.stop(t + 2);
    st.whooshes++;
    emit("whoosh");
  }

  /* wiring: no polling, only events */
  const arm = () => {
    if (own) resume(own.c);
    if (amb) resume(amb.c);
  };
  ["pointerdown", "keydown", "touchstart"].forEach((e) => window.addEventListener(e, arm, true));

  window.addEventListener("day:title", (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "show") ambienceOn();
    else if (d.action === "play" || d.action === "episodes") {
      // Sound is on by now (the title turns it on): the score's beds take over, so this fades out; muted: gone at once.
      ambienceOff(false);
    }
  });
  // The ambience also stops if Sound goes on while the title is up and the score has its own bed running.
  window.addEventListener("day:control", (e) => { if (e && e.detail && e.detail.action === "take") ambienceOff(false); });

  // A click on a title button: sfx.js plays its own press only once Sound is on, so the title's first press is ours.
  document.addEventListener("pointerdown", (e) => {
    const el = e.target && e.target.closest && e.target.closest("#title button, #title [role=button]");
    if (!el || muted()) return;
    if (soundOn() && el.id !== "title-music") return; // sfx.js has it
    if (el.id === "title-music" && el.getAttribute("aria-pressed") === "true") return; // pressing it turns music off
    click();
  }, true);

  // The first Gust of the visit: sfx.js's whoosh needs Sound on, and a cold visit has it off until Play.
  window.addEventListener("day:power", (e) => {
    const d = (e && e.detail) || {};
    const id = d.power || d.action;
    if (st.firstGust || !["gust", "gale", "tornado"].includes(id) || d.action === "denied") return;
    st.firstGust = true;
    if (muted() || soundOn()) return;
    whoosh();
  });

  const api = {
    info: () => ({ ...st, ctx: (amb && amb.c.state) || (own && own.c.state) || "none", muted: muted() }),
    click,
    whoosh,
    ambienceOn,
    ambienceOff,
  };
  day.titlesound = api;
  window.titlesound = api;
  if (titleUp()) ambienceOn();
  return api;
}

startTitleSound();

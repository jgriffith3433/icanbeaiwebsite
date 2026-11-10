/* ==========================================================================
   Sound for what the player does and what the world does around him: no files, all WebAudio synthesis
   (one shared AudioContext, gated on the Sound button like the rest of the page).

   - Moving him: footsteps timed to his stride (wetter in rain), a jump whoosh, a landing thump that grows
     with the fall, a puff of dust where he lands, a falling sweep when the player lets go.
   - Powers: an instant crack where the bolt lands (the thunder follows from powers.js), a travelling
     tornado roar panned to where it is, a soft blip when a call is refused.
   - Episodes and the finale: goal, fail, hurt, piece, kick, unlock, score (major when cleared, minor when
     not), show cues graded perfect / good / off, the ending.
   - Story: every line in the episode dialogue and every neighbor bubble gets a short babble, a voice of
     its own per speaker (pitch from the name), so the story is heard as well as read.
   - The city: birds by day in fair weather, cars passing (more in rush hour, from the crowd), a far siren
     now and then at night.

   Hooks are window events (day:control, day:power, day:episode, day:story, day:neighbor) and one
   onBeforeRender observer that reads day.control.state(): nothing here changes the day or polls the network.
   day.sfx.info() says what played (the playtest and the console).
   ========================================================================== */
(function () {
  const day = window.day;
  const world = day && day.world && day.world();
  if (!world || !world.scene || typeof window.addEventListener !== "function") return;
  const B = window.BABYLON;
  const scene = world.scene;

  const heard = {}; // name -> count, for info()
  const note = (name) => (heard[name] = (heard[name] || 0) + 1);

  /* ---------------- the audio graph ---------------- */
  let audio = null;
  function soundOn() {
    const btn = document.getElementById && document.getElementById("sound");
    return !!(btn && btn.getAttribute("aria-pressed") === "true");
  }
  function ctx() {
    if (!soundOn()) return null;
    if (!audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        const c = new Ctx();
        const master = c.createGain();
        master.gain.value = 0.7;
        const comp = c.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(c.destination);
        const len = c.sampleRate * 2;
        const white = c.createBuffer(1, len, c.sampleRate);
        const d = white.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        audio = { c, master, white };
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

  /* Where a point in the world sits for the ear: pan by the camera's right vector, quieter with distance. */
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
  function out(a, pan) {
    if (!pan || !a.c.createStereoPanner) return a.master;
    const p = a.c.createStereoPanner();
    p.pan.value = pan;
    p.connect(a.master);
    return p;
  }

  /** Filtered noise: a hit, a thump, a whoosh (sweep with `to`). */
  function noise(o) {
    const a = ctx();
    if (!a) return;
    const t = a.c.currentTime + (o.delay || 0);
    const src = a.c.createBufferSource();
    src.buffer = a.white;
    src.playbackRate.value = o.rate || 1;
    const f = a.c.createBiquadFilter();
    f.type = o.type || "lowpass";
    f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const g = a.c.createGain();
    const vol = Math.max(0.0002, o.vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(out(a, o.pan));
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.dur + 0.05);
  }
  /** One oscillator note, optionally gliding. */
  function tone(o) {
    const a = ctx();
    if (!a) return;
    const t = a.c.currentTime + (o.delay || 0);
    const osc = a.c.createOscillator();
    osc.type = o.wave || "sine";
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const g = a.c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
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
    g.connect(out(a, o.pan));
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }
  const notes = (freqs, gap, vol, wave, dur) => freqs.forEach((f, i) => tone({ freq: f, dur: dur || 0.5, vol, wave: wave || "triangle", delay: i * gap }));

  /* ---------------- surface detection (rooftop gravel, metal, tar, puddle + street) ---------------- */
  const SURFACES = ["gravel", "metal", "tar", "puddle", "pavement", "grass", "wood"];
  const surfaces = { gravel: 0, metal: 0, tar: 0, puddle: 0, pavement: 0, grass: 0, wood: 0 };
  let lastSurface = "pavement";
  const recentSteps = [];

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
      recentSteps.push({ surface: surf, wet: isWet || surf === "puddle", t: typeof performance !== "undefined" ? Math.round(performance.now()) : Date.now() });
      if (recentSteps.length > 20) recentSteps.shift();
      try {
        window.dispatchEvent(new CustomEvent("day:footstep", { detail: { surface: surf, wet: isWet || surf === "puddle", pan: pan || 0 } }));
      } catch (e) { /* ignore */ }

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
      return surf;
    },
    jump(air) {
      note("jump");
      noise({ type: "bandpass", freq: air ? 600 : 400, to: air ? 2400 : 1600, q: 1.2, dur: 0.28, vol: 0.09, attack: 0.03 });
    },
    land(h) {
      note("land");
      const k = Math.max(0.2, Math.min(1, h / 6));
      noise({ type: "lowpass", freq: 260 + 300 * k, dur: 0.18 + 0.3 * k, vol: 0.1 + 0.25 * k });
      tone({ freq: 90, to: 45, dur: 0.15 + 0.25 * k, vol: 0.08 + 0.22 * k });
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
    crack(pan, gain) {
      note("bolt-crack");
      noise({ type: "highpass", freq: 2600, dur: 0.16, vol: 0.5 * gain, attack: 0.002, pan });
      noise({ type: "bandpass", freq: 900, q: 0.7, dur: 0.35, vol: 0.25 * gain, attack: 0.004, pan, delay: 0.01 });
    },
    denied() {
      note("denied");
      tone({ freq: 220, to: 180, dur: 0.16, vol: 0.06, wave: "square", band: 600 });
    },
    chimeUp() { note("goal"); notes([660, 990], 0.1, 0.09); },
    /* neighbour body gestures (peoplekit ask / thanks / surprise) */
    wave(pan, gain) {
      const g = gain == null ? 1 : gain;
      note("gesture-ask");
      noise({ type: "bandpass", freq: 900, to: 1600, q: 1.2, dur: 0.22, vol: 0.05 * g, attack: 0.01, pan });
      tone({ freq: 520, to: 780, dur: 0.18, vol: 0.04 * g, wave: "triangle", pan });
    },
    clap(pan, gain) {
      const g = gain == null ? 1 : gain;
      note("gesture-thanks");
      noise({ type: "bandpass", freq: 1800, to: 900, q: 0.8, dur: 0.08, vol: 0.12 * g, attack: 0.001, pan });
      tone({ freq: 240, to: 120, dur: 0.12, vol: 0.06 * g, pan });
      setTimeout(() => {
        noise({ type: "bandpass", freq: 2000, to: 1000, q: 0.8, dur: 0.07, vol: 0.1 * g, attack: 0.001, pan });
      }, 140);
    },
    gasp(pan, gain) {
      const g = gain == null ? 1 : gain;
      note("gesture-surprise");
      tone({ freq: 380, to: 520, dur: 0.28, vol: 0.05 * g, wave: "sine", attack: 0.04, pan });
      noise({ type: "highpass", freq: 600, dur: 0.2, vol: 0.04 * g, attack: 0.02, pan });
    },
    umbSnap(pan, gain) {
      const g = gain == null ? 1 : gain;
      note("umbrella");
      noise({ type: "lowpass", freq: 400, to: 1200, q: 1, dur: 0.25, vol: 0.08 * g, attack: 0.01, pan });
      tone({ freq: 180, to: 90, dur: 0.2, vol: 0.05 * g, pan });
    },
    thud() { note("fail"); tone({ freq: 120, to: 55, dur: 0.45, vol: 0.18 }); tone({ freq: 127, to: 58, dur: 0.45, vol: 0.08, wave: "sawtooth", band: 300 }); },
    blip() { note("blip"); tone({ freq: 1250, to: 1600, dur: 0.12, vol: 0.06, wave: "triangle" }); },
    rumble() { note("rumble"); noise({ type: "lowpass", freq: 120, dur: 0.9, vol: 0.25, attack: 0.05 }); },
    sparkle() { note("unlock"); notes([784, 988, 1175, 1568], 0.07, 0.07, "triangle", 0.7); },
    flourish(major) { note(major ? "fanfare" : "fanfare-minor"); notes(major ? [523, 659, 784, 1047] : [523, 622, 784, 932], 0.13, 0.1, "triangle", 1.1); },
    tick(grade) {
      note("cue-" + grade);
      if (grade === "perfect") notes([1320, 1760], 0.05, 0.08, "triangle", 0.4);
      else if (grade === "good") tone({ freq: 880, dur: 0.25, vol: 0.07, wave: "triangle" });
      else tone({ freq: 180, dur: 0.12, vol: 0.06, wave: "square", band: 500 });
    },
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
      const f = 2600 + Math.random() * 1800;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) tone({ freq: f, to: f * (1.2 + Math.random() * 0.4), dur: 0.08, vol: 0.025 * gain, delay: i * 0.11, pan });
    },
    car(pan, gain) {
      note("car");
      const a = ctx();
      if (!a) return;
      const t = a.c.currentTime;
      const src = a.c.createBufferSource();
      src.buffer = a.white;
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
      src.stop(t + 2.5);
    },
    siren() {
      note("siren");
      for (let i = 0; i < 4; i++) tone({ freq: 700, to: 950, dur: 0.55, vol: 0.012, wave: "triangle", delay: i * 0.6, pan: -0.5 });
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
      note("dust");
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
        S.land(h);
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

  /* ---------------- the tornado's roar ---------------- */
  let roar = null;
  let roarCheck = 0;
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
      const src = a.c.createBufferSource();
      src.buffer = a.white;
      src.loop = true;
      const f = a.c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 340;
      f.Q.value = 2.5;
      const g = a.c.createGain();
      g.gain.value = 0.0001;
      const p = a.c.createStereoPanner ? a.c.createStereoPanner() : null;
      src.connect(f);
      f.connect(g);
      if (p) { g.connect(p); p.connect(a.master); } else g.connect(a.master);
      src.start();
      roar = { src, f, g, p };
      note("tornado");
    }
    if (!roar) return;
    if (t) {
      const at = place(t.x, t.z);
      const life = Math.max(0, Math.min(1, t.life == null ? 1 : t.life));
      roar.g.gain.setTargetAtTime(0.28 * at.gain * Math.min(1, life * 3), now, 0.2);
      roar.f.frequency.setTargetAtTime(260 + 260 * Math.random(), now, 0.3);
      if (roar.p) roar.p.pan.setTargetAtTime(at.pan, now, 0.2);
    } else {
      const r = roar;
      roar = null;
      r.g.gain.setTargetAtTime(0.0001, now, 0.25);
      try { r.src.stop(now + 1.5); } catch (err) { /* already stopped */ }
    }
  }

  /* ---------------- the city ---------------- */
  const amb = { bird: 4, car: 3, siren: 60 };
  function hour() {
    try { return (day.now().minutes || 0) / 60; } catch (err) { return 12; }
  }
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
    amb.siren -= dt;
    if (amb.siren <= 0) {
      amb.siren = 90 + Math.random() * 120;
      if (h > 21 || h < 5) S.siren();
    }
  }

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    try {
      watchHim(dt);
      watchTornado(dt);
      watchCity(dt);
    } catch (err) {
      if (!watchHim.warned) { watchHim.warned = true; console.warn("[sfx]", err); }
    }
  });

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
      let s = null;
      try { s = day.powers.now().strike; } catch (err) { s = null; }
      const at = s ? place(s.x, s.z) : { pan: 0, gain: 1 };
      S.crack(at.pan, at.gain);
    }
  });
  window.addEventListener("day:episode", (e) => {
    const d = e.detail || {};
    switch (d.action) {
      case "goal": return S.chimeUp();
      case "goal-failed": case "hurt": case "help-miss": case "late": return S.thud();
      case "piece": case "precision": case "rod": return S.blip();
      case "kick": case "strain": return S.rumble();
      case "unlock": return S.sparkle();
      case "score": return S.flourish(d.tutorial || d.cleared !== false);
      case "show-cue": return S.tick(d.grade === "perfect" || d.grade === "good" ? d.grade : "off");
      case "show-miss": case "show-off": return S.tick("off");
      case "show-over": return S.flourish((d.hits || 0) * 2 >= (d.of || 1));
      case "ending": return S.pad([196, 247, 294, 392]);
      case "start": return noise({ type: "bandpass", freq: 300, to: 1400, q: 1, dur: 0.8, vol: 0.07, attack: 0.3 });
      default: return undefined;
    }
  });
  window.addEventListener("day:story", (e) => {
    const d = e.detail || {};
    // a line with its own voice clip (js/dialogue.js) isn't babbled over
    if (d.action === "say" && d.text && !(day.dialogue && day.dialogue.voiced(d.who, d.text))) S.babble(d.who, d.text);
    else if (d.action === "twist") S.rumble();
  });
  let lastUmb = -1e9;
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
      if (d.kind === "ask") S.wave(at.pan, at.gain);
      else if (d.kind === "thanks") S.clap(at.pan, at.gain);
      else if (d.kind === "surprise") S.gasp(at.pan, at.gain);
    } else if (d.action === "umbrella") {
      if (performance.now() - lastUmb < 800) return;
      lastUmb = performance.now();
      let at = { pan: 0, gain: 1 };
      if (d.x != null && d.z != null) at = place(d.x, d.z);
      S.umbSnap(at.pan, at.gain);
    } else if (d.action === "reward") S.chimeUp();
    else if (d.action === "beat-missed") tone({ freq: 440, to: 330, dur: 0.35, vol: 0.05, wave: "triangle" });
  });

  day.sfx = {
    info: () => ({
      on: soundOn(),
      context: audio ? audio.c.state : "none",
      heard: { ...heard },
      surfaces: { ...surfaces },
      lastSurface,
      recentSteps: recentSteps.slice(),
      tornado: !!roar,
    }),
    surfaceAt,
    step: (wetOrSurface, pan, surf) => S.step(wetOrSurface, pan, surf),
    play: (name, ...args) => (S[name] ? (S[name](...args), true) : false),
  };
})();

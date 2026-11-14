/* ==========================================================================
   Adaptive score: weather music beds, sampled ambience, and a take-control sting.
   Driven by weather.look() levels each frame. Nothing audibly plays until the
   Sound button is on (aria-pressed) — same autoplay rule as the rest of the page.
   Missing files fall back to the procedural layers in js/weather.js.
   Recipes: hawkes.assets.json (audio.music / audio.sfx). Paths: day.config.js score.
   ========================================================================== */
import { pickRate } from "./variety.js";


/* Clear (and wind) weather plays a calm day bed or its night variation by the clock; the other weathers keep
   their own beds. "day" / "night" have their own files (Hawkes Gen) and fall back to the older beds until
   those files exist. */
const BEDS = ["day", "night", "clear", "clouds", "rain", "storm", "fog", "snow"];
const NIGHT_FROM = 19.75; // 7:45 PM
const NIGHT_TO = 6.25; // 6:15 AM
const AMB_LOOPS = ["air", "rain", "rainRoof", "rainDownpour", "gutter", "umbrella", "wind", "awning", "birds"];
const FADE_DEFAULT = 2.8;
const MUSIC_VOL = 0.3;
const AMB_VOL = 0.62;
const STING_VOL = 0.55;

/* The mix (day.config.js score.mix): one place for every level. */
const DEFAULT_MIX = { master: 0.9, music: 0.3, ambience: 0.62, sting: 0.55, thunder: 0.9, whoosh: 0.62, title: 0.42, duck: 0.45, nightTone: 2400 };

const DEFAULT_PATHS = {
  music: {
    // day.config.js score.music.day / .night name Gen's files once they're made (hawkes.assets.json music-day,
    // music-night); unset, they play their fallback beds (never a fetch that 404s: that's a console error).
    day: null,
    night: null,
    clear: "audio/music/clear.mp3",
    clouds: "audio/music/clouds.mp3",
    rain: "audio/music/rain.mp3",
    storm: "audio/music/storm.mp3",
    fog: "audio/music/fog.mp3",
    wind: "audio/music/clear.mp3",
    snow: "audio/music/snow.mp3",
  },
  sting: "audio/music/take-control.mp3",
  whoosh: "audio/sfx/glide-whoosh.mp3",
  ambience: {
    air: "audio/sfx/city-hum.mp3",
    rain: "audio/sfx/rain-asphalt.mp3",
    rainRoof: "audio/sfx/rain-roof-light.mp3",
    rainDownpour: "audio/sfx/rain-downpour.mp3",
    gutter: "audio/sfx/rain-gutter.mp3",
    umbrella: "audio/sfx/rain-umbrella.mp3",
    wind: "audio/sfx/wind.mp3",
    awning: "audio/sfx/wind-awning.mp3",
    birds: "audio/sfx/sun-birds.mp3",
    thunderNear: "audio/sfx/thunder-near.mp3",
    thunderFar: "audio/sfx/thunder-far.mp3",
  },
};

/** Equal-power crossfade gains (sin^2 + cos^2 = 1) so transitions never dip in energy or click. */
export function equalPowerGains(t) {
  const k = Math.max(0, Math.min(1, Number(t) || 0));
  const ang = k * Math.PI * 0.5;
  const fadeOut = Math.cos(ang);
  const fadeIn = Math.sin(ang);
  return { fadeOut, fadeIn, power: fadeOut * fadeOut + fadeIn * fadeIn };
}

function cfg() {
  const s = (window.DAY_CONFIG && window.DAY_CONFIG.score) || {};
  const mix = Object.assign({}, DEFAULT_MIX, s.mix || {});
  // The older single levels still win where a config sets them without a mix.
  if (!s.mix || s.mix.music == null) mix.music = s.musicVol != null ? s.musicVol : MUSIC_VOL;
  if (!s.mix || s.mix.ambience == null) mix.ambience = s.ambVol != null ? s.ambVol : AMB_VOL;
  if (!s.mix || s.mix.sting == null) mix.sting = s.stingVol != null ? s.stingVol : STING_VOL;
  if (!s.mix || s.mix.whoosh == null) mix.whoosh = s.whooshVol != null ? s.whooshVol : mix.whoosh;
  return {
    fade: s.fade != null ? s.fade : FADE_DEFAULT,
    mix,
    musicVol: mix.music,
    ambVol: mix.ambience,
    stingVol: mix.sting,
    music: Object.assign({}, DEFAULT_PATHS.music, s.music || {}),
    // A bed whose file isn't there (yet) plays this one instead.
    fallback: Object.assign({ day: "clear", night: "snow" }, s.fallback || {}),
    nightFrom: s.nightFrom != null ? s.nightFrom : NIGHT_FROM,
    nightTo: s.nightTo != null ? s.nightTo : NIGHT_TO,
    sting: s.sting || DEFAULT_PATHS.sting,
    whoosh: s.whoosh || DEFAULT_PATHS.whoosh,
    whooshVol: mix.whoosh,
    ambience: Object.assign({}, DEFAULT_PATHS.ambience, s.ambience || {}),
    // Pressure scoring: the meter fraction where tension starts, the drone's top level, the beds' top speed-up.
    pressureFrom: s.pressure && s.pressure.from != null ? s.pressure.from : 0.4,
    pressureGain: s.pressure && s.pressure.gain != null ? s.pressure.gain : 0.5,
    pressureRate: s.pressure && s.pressure.rate != null ? s.pressure.rate : 0.06,
  };
}

/** Is this sim hour night for the music? (7:45 PM to 6:15 AM by default.) */
export function isNightHour(hour, c) {
  const from = c && c.nightFrom != null ? c.nightFrom : NIGHT_FROM;
  const to = c && c.nightTo != null ? c.nightTo : NIGHT_TO;
  const h = ((hour % 24) + 24) % 24;
  return from > to ? h >= from || h < to : h >= from && h < to;
}

function simHour() {
  try {
    const n = window.day && window.day.now && window.day.now();
    if (n && typeof n.minutes === "number") return (n.minutes % 1440) / 60;
  } catch (e) { /* no day yet */ }
  return 12;
}

function soundOn() {
  const btn = document.getElementById("sound");
  return !!(btn && btn.getAttribute("aria-pressed") === "true");
}

/** The bed for a weather state at a sim hour: clear and wind play the day bed or the night one. */
export function bedFor(state, hour) {
  const night = isNightHour(hour == null ? 12 : hour);
  if (!state || state === "wind" || state === "clear" || BEDS.indexOf(state) < 0) return night ? "night" : "day";
  return state;
}

export function startScore(dayApi) {
  const day = dayApi || window.day;
  if (!day || day.score) return day && day.score;

  const c0 = cfg();
  let ctx = null;
  let master = null;
  let musicBus = null;
  let bedBus = null; // the weather beds' own bus: js/stems.js mutes it while the stems play under control
  let bedGoal = 1;
  let ambBus = null;
  let lim = null;
  let fogLp = null;
  let fogDelay = null;
  let fogWet = null;
  let fogColorK = 0;
  let birdLiftUntil = 0;
  let unlocked = false;
  let loading = null;
  const buffers = Object.create(null);
  const missing = Object.create(null);
  const music = Object.create(null); // bed -> { src, gain }
  const amb = Object.create(null); // AMB_LOOPS -> { src, gain, filter, panner }
  const smoothAmb = {
    air: 0, rain: 0, rainRoof: 0, rainDownpour: 0, gutter: 0, umbrella: 0, wind: 0, awning: 0, birds: 0, snowHush: 0, foghorn: 0,
  };
  let currentBed = null;
  let targetBed = null;
  let fadeLeft = 0;
  let fadeTotal = c0.fade;
  let stingAt = 0;
  let whooshAt = 0;
  let lastCrack = 0;
  let tone = null;
  let gustClock = 0;
  // Pressure (the energy meter) scores the music: above `pressureFrom` a low drone with a pulse swells in,
  // the beds speed up a little and the night low-pass opens. All procedural: no files.
  let tension = null; // { gain, lp, oscs, lfo, lfoGain }
  let pk = 0;
  let duckUntil = 0;
  let duckK = 1;
  let usingMix = false; // js/mix.js owns the destination when true
  const live = {
    bed: null,
    target: null,
    fade: 1,
    equalPower: { fadeOut: 0, fadeIn: 1, power: 1 },
    music: Object.create(null),
    amb: {
      air: 0, rain: 0, rainRoof: 0, rainDownpour: 0, gutter: 0, umbrella: 0, wind: 0, awning: 0, birds: 0, thunder: 0,
    },
    soundscape: {
      state: "clear",
      rainRoof: 0,
      rainDownpour: 0,
      gutter: 0,
      umbrella: 0,
      wind: 0,
      windPan: 0,
      awning: 0,
      awningPan: 0,
      umbrellaPan: 0,
      birds: 0,
      birdPan: 0,
      cityToneHz: 4200,
      brightened: true,
      muffled: 0,
      snowHush: 0,
      foghorn: 0,
      onRoof: false,
    },
    lastThunder: null,
    samples: false,
    unlocked: false,
    on: false,
    stingAt: 0,
    whooshAt: 0,
    heard: 0,
    tod: "day",
    tone: 18000,
    duck: 1,
    title: false,
    pressure: 0,
    tension: 0,
    rate: 1,
    pulse: 0,
  };

  function ensureCtx() {
    if (ctx) return ctx;
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    try {
      // Prefer the shared mix graph (js/mix.js): music/ambience buses → master compressor/limiter.
      const Mix = (day && day.mix) || window.mix;
      if (Mix && typeof Mix.ctx === "function") {
        try { if (typeof Mix.unlock === "function") Mix.unlock(); } catch (e) { /* */ }
        ctx = Mix.ctx();
      }
      if (!ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        ctx = new Ctx();
      }
      const mixMusic = Mix && typeof Mix.bus === "function" ? Mix.bus("music") : null;
      const mixAmb = Mix && typeof Mix.bus === "function" ? Mix.bus("ambience") : null;
      usingMix = !!(mixMusic && mixMusic.bus && mixAmb && mixAmb.bus && Mix.ctx && Mix.ctx() === ctx);

      master = ctx.createGain();
      master.gain.value = 0;
      musicBus = ctx.createGain();
      musicBus.gain.value = 1;
      bedBus = ctx.createGain();
      bedBus.gain.value = 1;
      bedBus.connect(musicBus);
      tone = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null;
      if (tone) {
        tone.type = "lowpass";
        tone.frequency.value = 18000;
        tone.Q.value = 0.5;
      }
      ambBus = ctx.createGain();
      ambBus.gain.value = 1;
      // Fog colour: world bus low-pass + a short wet delay that grows with fog.
      fogLp = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null;
      if (fogLp) {
        fogLp.type = "lowpass";
        fogLp.frequency.value = 18000;
        fogLp.Q.value = 0.5;
      }
      try {
        fogDelay = ctx.createDelay(1.0);
        fogDelay.delayTime.value = 0.08;
        fogWet = ctx.createGain();
        fogWet.gain.value = 0;
      } catch (err) {
        fogDelay = null;
        fogWet = null;
      }
      if (usingMix) {
        // Tone/fog into the shared music & ambience buses; mix owns the master chain + ducking.
        if (tone) {
          musicBus.connect(tone);
          tone.connect(mixMusic.bus);
        } else musicBus.connect(mixMusic.bus);
        if (fogLp) {
          ambBus.connect(fogLp);
          fogLp.connect(mixAmb.bus);
        } else ambBus.connect(mixAmb.bus);
        if (fogDelay && fogWet) {
          ambBus.connect(fogDelay);
          fogDelay.connect(fogWet);
          fogWet.connect(mixAmb.bus);
        }
        // Local master stays disconnected: mix owns the destination. Callers that
        // write master.gain (unlock fade) are no-ops on this dead node when mix is up.
        lim = null;
      } else {
        lim = ctx.createDynamicsCompressor();
        if (lim.threshold) lim.threshold.value = -6;
        if (lim.knee) lim.knee.value = 12;
        if (lim.ratio) lim.ratio.value = 12;
        if (lim.attack) lim.attack.value = 0.003;
        if (lim.release) lim.release.value = 0.2;
        if (tone) {
          musicBus.connect(tone);
          tone.connect(fogLp || master);
        } else musicBus.connect(fogLp || master);
        ambBus.connect(fogLp || master);
        if (fogLp) fogLp.connect(master);
        if (fogDelay && fogWet) {
          master.connect(fogDelay);
          fogDelay.connect(fogWet);
          fogWet.connect(lim);
        }
        master.connect(lim);
        lim.connect(ctx.destination);
      }
    } catch (err) {
      ctx = null;
      return null;
    }
    return ctx;
  }

  function ensureTension() {
    if (tension || !ctx) return tension;
    try {
      const g = ctx.createGain();
      g.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 500;
      const pulse = ctx.createGain(); // the throb
      pulse.gain.value = 0.7;
      const oscs = [55, 82.4, 110.6].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 2 ? "triangle" : "sawtooth";
        o.frequency.value = f;
        o.detune.value = i * 7 - 7;
        o.connect(lp);
        o.start();
        return o;
      });
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.8;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.3;
      lfo.connect(lfoGain);
      lfoGain.connect(pulse.gain);
      lfo.start();
      lp.connect(pulse);
      pulse.connect(g);
      g.connect(musicBus);
      tension = { gain: g, lp, oscs, lfo };
    } catch (err) {
      tension = null;
    }
    return tension;
  }

  async function loadUrl(url, lowPriority) {
    if (!url || missing[url]) return null;
    if (buffers[url]) return buffers[url];
    const a = ensureCtx();
    if (!a) return null;
    try {
      const res = await fetch(url, lowPriority ? { priority: "low" } : undefined);
      if (!res.ok) {
        missing[url] = true;
        return null;
      }
      const raw = await res.arrayBuffer();
      const buf = await a.decodeAudioData(raw.slice(0));
      buffers[url] = buf;
      return buf;
    } catch (err) {
      missing[url] = true;
      return null;
    }
  }

  function waitGameplayIdle() {
    return new Promise((resolve) => {
      const start = Date.now();
      let castSeen = false;
      const onPower = (ev) => {
        const d = (ev && ev.detail) || {};
        if (d.action !== "denied") castSeen = true;
      };
      if (typeof window !== "undefined" && window.addEventListener) {
        window.addEventListener("day:power", onPower);
      }
      const check = () => {
        const elapsed = Date.now() - start;
        const warmDone = (typeof window !== "undefined" && (window.__warmIdle === true || !window.__warmLights)) || elapsed > 15000;
        const titleUp = !!(day.title && day.title.showing && day.title.showing());
        const cold = day.coldopen && day.coldopen.now ? day.coldopen.now() : null;
        const inColdBeforeCast = !!(cold && (cold.on || (day.coldopen.pending && day.coldopen.pending())) && cold.cast == null && !castSeen);
        if (warmDone && !titleUp && !inColdBeforeCast && elapsed >= 4000) {
          if (typeof window !== "undefined" && window.removeEventListener) {
            window.removeEventListener("day:power", onPower);
          }
          const idle = (cb) => (typeof requestIdleCallback === "function" ? requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 200));
          idle(() => resolve());
          return;
        }
        setTimeout(check, 400);
      };
      setTimeout(check, 1200);
    });
  }

  async function loadAll() {
    const c = cfg();
    // The city hum first, alone: it is the ambience bed heard from the first tap, so it must not queue behind the beds.
    if (c.ambience.air) await loadUrl(c.ambience.air);
    const urls = new Set();
    BEDS.forEach((b) => c.music[b] && urls.add(c.music[b]));
    urls.add(c.music.wind);
    urls.add(c.sting);
    if (c.whoosh) urls.add(c.whoosh);
    Object.keys(c.ambience).forEach((k) => c.ambience[k] && urls.add(c.ambience[k]));
    urls.delete(c.ambience.air);
    // Rain and wind beds load now (gameplay starts on this tap), so the roof is never silent before the first cast.
    const early = [...urls].filter((u) => /rain|wind/.test(u));
    early.forEach((u) => urls.delete(u));
    await Promise.all(early.map((u) => loadUrl(u, true)));
    // Sting and secondary beds wait for idle after gameplay starts (and after the first cast in the cold open) so
    // neither take-control.mp3 nor the beds compete with the Play tap, roof arrival, or first cast.
    await waitGameplayIdle();
    const queue = [...urls].sort((x, y) => (/rain|wind/.test(x) ? 0 : 1) - (/rain|wind/.test(y) ? 0 : 1));
    const lane = async () => {
      while (queue.length) {
        await loadUrl(queue.shift(), true);
        await new Promise((ok) => (typeof requestIdleCallback === "function" ? requestIdleCallback(ok, { timeout: 2000 }) : setTimeout(ok, 0)));
      }
    };
    await Promise.all([lane(), lane()]);
    live.samples = BEDS.some((b) => !!buffers[c.music[b]]) || AMB_LOOPS.some((k) => !!buffers[c.ambience[k]]);
    return live.samples;
  }

  function unlock() {
    const a = ensureCtx();
    if (!a) return false;
    if (a.state === "suspended") a.resume();
    unlocked = true;
    live.unlocked = true;
    if (!loading) loading = loadAll().catch(() => false);
    return true;
  }

  /* The audio probe flags the same sample id at the same rate twice within 60 s. Every (re)start gets a rate a little off 1
     (+-1.5%, never the one this id last had), so a bed that restarts or a repeated one-shot is never identical. */
  const lastRates = {};
  function jitterRate(id) {
    let r = 1 + (Math.random() * 0.03 - 0.015);
    if (Math.abs(r - (lastRates[id] || 0)) < 0.004) r += r < 1 ? 0.005 : -0.005;
    lastRates[id] = r;
    return r;
  }

  function startLoop(buf, bus, vol, opts) {
    if (!ctx || !buf) return null;
    const o = opts || {};
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // Several clips share one length after the seam fix (the 8 s beds all bake to 7.15 s), so the probe's automatic
    // "buf:<secs>x<len>" id would read different files as one sample: name each loop by its own file.
    if (o.id) { try { src.__hawkesSampleId = o.id; src.__hawkesBus = o.bus || "ambience"; src.playbackRate.value = freshBedRate(o.id); } catch (e) { /* */ } }
    const filter = o.filter && ctx.createBiquadFilter ? ctx.createBiquadFilter() : null;
    if (filter) {
      filter.type = o.filterType || "lowpass";
      filter.frequency.value = o.filterFreq || 4200;
      filter.Q.value = o.filterQ || 0.7;
    }
    const panner = o.pan && ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const g = ctx.createGain();
    g.gain.value = vol || 0;
    let node = src;
    if (filter) {
      node.connect(filter);
      node = filter;
    }
    if (panner) {
      node.connect(panner);
      node = panner;
    }
    node.connect(g);
    g.connect(bus);
    src.start();
    return { src, gain: g, filter, panner, head: filter || panner || g, buf, id: o.id || "", bornMs: nowMsClock(), every: 0, refreshes: 0 };
  }

  /* The weather bed breathes: a loop that starts once is one event to the audio probe (and to an ear it is a seam every N seconds).
     Each audible ambience layer hands over to a fresh copy of itself every 4-8 s (a random start offset, a rate never used by
     this layer in the last 60 s, a 1.4 s equal-power crossfade), so rain and wind are a continuous bed that is never the identical
     take twice and never goes 10 s without a new sound starting. */
  const bedRates = Object.create(null);
  function freshBedRate(id) {
    const t = nowMsClock();
    const used = (bedRates[id] = (bedRates[id] || []).filter((u) => t - u.t < 60000));
    let r = 1;
    for (let i = 0; i < 40; i++) {
      r = 1 + (Math.random() * 0.044 - 0.022);
      if (!used.some((u) => Math.abs(u.r - r) < 0.002)) break;
    }
    used.push({ r, t });
    return r;
  }
  function nowMsClock() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
  function refreshLoop(n, xf) {
    if (!ctx || !n || !n.buf || !n.head) return false;
    try {
      const t = ctx.currentTime;
      const seg = ctx.createGain();
      const next = ctx.createBufferSource();
      next.buffer = n.buf;
      next.loop = true;
      next.playbackRate.value = freshBedRate(n.id);
      if (n.id) { next.__hawkesSampleId = n.id; next.__hawkesBus = "ambience"; }
      seg.gain.setValueAtTime(0.0001, t);
      seg.gain.linearRampToValueAtTime(1, t + xf);
      next.connect(seg);
      seg.connect(n.head);
      next.start(t, Math.random() * Math.max(0.1, n.buf.duration - 0.2));
      const old = n.src;
      const oldSeg = n.seg || null;
      if (oldSeg) { oldSeg.gain.cancelScheduledValues(t); oldSeg.gain.setValueAtTime(oldSeg.gain.value, t); oldSeg.gain.linearRampToValueAtTime(0.0001, t + xf); }
      else if (n.srcGain) { /* none */ }
      else {
        // the first source has no segment gain: fade it through a one-shot gain inserted by disconnecting and re-routing
        const fade = ctx.createGain();
        fade.gain.setValueAtTime(1, t);
        fade.gain.linearRampToValueAtTime(0.0001, t + xf);
        try { old.disconnect(); old.connect(fade); fade.connect(n.head); } catch (e) { /* */ }
      }
      try { old.stop(t + xf + 0.1); } catch (e) { /* */ }
      n.src = next;
      n.seg = seg;
      n.bornMs = nowMsClock();
      n.every = 4000 + Math.random() * 4000;
      n.refreshes++;
      return true;
    } catch (e) { return false; }
  }

  /** Smoothly ramp a WebAudio AudioParam without clicks while keeping `.value` readable. */
  function setGainSmooth(gainNode, val, tau = 0.04) {
    // A loop handle ({ src, gain: GainNode }) is passed for the beds and the ambience: its level is the inner node's AudioParam.
    // (Before this, `.gain.setTargetAtTime` was read off the GainNode itself, so every bed and ambience loop stayed at 0.)
    if (gainNode && gainNode.gain && gainNode.gain.gain && typeof gainNode.gain.gain.value === "number") gainNode = gainNode.gain;
    if (!gainNode || !gainNode.gain) return;
    const v = Math.max(0, Number(val) || 0);
    if (ctx && gainNode.gain.setTargetAtTime) {
      try {
        gainNode.gain.setTargetAtTime(v, ctx.currentTime, tau);
      } catch (e) {
        gainNode.gain.value = v;
      }
    } else {
      gainNode.gain.value = v;
    }
  }

  /** The file a bed plays: its own, or its fallback bed's while its own is missing. */
  function bedUrl(bed, c) {
    const url = c.music[bed];
    if (url && (buffers[url] || !missing[url])) return url;
    const fb = c.fallback[bed];
    return (fb && c.music[fb]) || c.music.clear;
  }

  function ensureMusic(bed) {
    const c = cfg();
    if (music[bed]) return music[bed];
    const url = bedUrl(bed, c);
    const buf = buffers[url];
    if (!buf) return null;
    music[bed] = startLoop(buf, bedBus || musicBus, 0, { id: "bed-" + (url || bed).split("/").pop(), bus: "music" });
    return music[bed];
  }

  function ensureAmb(key) {
    const c = cfg();
    const url = c.ambience[key];
    if (amb[key]) return amb[key];
    const buf = buffers[url];
    if (!buf) return null;
    const needFilter = key === "air" || key === "rainRoof" || key === "rainDownpour";
    const needPan = key === "wind" || key === "awning" || key === "umbrella" || key === "birds" || key === "gutter";
    amb[key] = startLoop(buf, ambBus, 0, {
      id: "amb-" + (url || key).split("/").pop(),
      filter: needFilter,
      filterType: key === "rainRoof" ? "highpass" : "lowpass",
      filterFreq: key === "rainRoof" ? 1200 : 4200,
      pan: needPan,
    });
    return amb[key];
  }

  function setBed(bed, snap) {
    const next = BEDS.indexOf(bed) >= 0 ? bed : bedFor(bed, simHour());
    if (next === targetBed && !snap) return;
    if (snap || !currentBed) {
      BEDS.forEach((k) => {
        live.music[k] = k === next ? 1 : 0;
        if (music[k]) setGainSmooth(music[k], k === next ? 1 : 0, 0.02);
      });
      const node = ensureMusic(next);
      if (node) setGainSmooth(node, 1, 0.02);
      currentBed = next;
      targetBed = next;
      fadeLeft = 0;
      fadeTotal = cfg().fade;
      live.bed = next;
      live.target = next;
      live.fade = 1;
      live.equalPower = equalPowerGains(1);
      return;
    }
    if (next === currentBed && fadeLeft <= 0) {
      targetBed = next;
      live.target = next;
      return;
    }
    // If retargeting mid-crossfade, promote the fuller bed to currentBed so there's never a hard cut.
    if (fadeLeft > 0 && targetBed && targetBed !== currentBed && (live.music[targetBed] || 0) > (live.music[currentBed] || 0)) {
      currentBed = targetBed;
    }
    targetBed = next;
    fadeTotal = cfg().fade;
    fadeLeft = fadeTotal;
    live.target = next;
    ensureMusic(next);
    ensureMusic(currentBed);
  }

  function stepFade(dt) {
    if (!targetBed) return;
    if (fadeLeft <= 0) {
      if (currentBed !== targetBed) {
        if (music[currentBed]) setGainSmooth(music[currentBed], 0, 0.04);
        live.music[currentBed] = 0;
        currentBed = targetBed;
        if (music[currentBed]) setGainSmooth(music[currentBed], 1, 0.04);
        live.music[currentBed] = 1;
      } else {
        live.music[currentBed] = 1;
      }
      live.bed = currentBed;
      live.fade = 1;
      live.equalPower = equalPowerGains(1);
      return;
    }
    fadeLeft = Math.max(0, fadeLeft - dt);
    const t = 1 - fadeLeft / Math.max(0.001, fadeTotal);
    const ep = equalPowerGains(t);
    const from = music[currentBed];
    const to = music[targetBed];
    if (from) setGainSmooth(from, ep.fadeOut, 0.04);
    if (to) setGainSmooth(to, ep.fadeIn, 0.04);
    BEDS.forEach((b) => {
      if (b !== currentBed && b !== targetBed) {
        live.music[b] = Math.max(0, (live.music[b] || 0) - dt * 1.5);
        if (music[b]) setGainSmooth(music[b], live.music[b], 0.04);
      }
    });
    live.music[currentBed] = Math.round(ep.fadeOut * 1000) / 1000;
    live.music[targetBed] = Math.round(ep.fadeIn * 1000) / 1000;
    if (fadeLeft <= 0) {
      if (from && currentBed !== targetBed) setGainSmooth(from, 0, 0.04);
      if (currentBed !== targetBed) live.music[currentBed] = 0;
      currentBed = targetBed;
      live.music[currentBed] = 1;
    }
    live.bed = currentBed;
    live.target = targetBed;
    live.fade = Math.round(t * 1000) / 1000;
    live.equalPower = ep;
  }

  function playOneShot(url, vol, when, pan) {
    if (!ctx || !soundOn() || !unlocked) return false;
    const buf = buffers[url];
    if (!buf) return false;
    const t = when != null ? when : ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    try { src.__hawkesSampleId = "score-" + String(url).split("/").pop(); src.playbackRate.value = pickRate(src.__hawkesSampleId); } catch (e) { /* */ }
    const g = ctx.createGain();
    g.gain.value = vol;
    if (pan != null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      src.connect(p);
      p.connect(g);
    } else {
      src.connect(g);
    }
    g.connect(master);
    src.start(t);
    return true;
  }

  function sting() {
    if (!soundOn()) return false;
    unlock();
    const c = cfg();
    const mark = () => {
      stingAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      live.stingAt = stingAt;
    };
    const ok = playOneShot(c.sting, c.stingVol);
    if (ok) {
      mark();
      return true;
    }
    // The sting MP3 is fetched during idle after gameplay starts; before it decodes, play a short synthesized
    // take-control swell on the music bus so Take control never fetches take-control.mp3 on the critical path.
    if (ctx && musicBus) {
      try {
        const t0 = ctx.currentTime + 0.02;
        const vol = (c.stingVol != null ? c.stingVol : STING_VOL) * 0.35;
        [220, 329.63, 440].forEach((hz, i) => {
          const o = ctx.createOscillator();
          o.type = "triangle";
          o.frequency.value = hz;
          const g = ctx.createGain();
          env(g, t0 + i * 0.08, vol, 0.03, 0.65);
          o.connect(g);
          g.connect(musicBus);
          o.start(t0 + i * 0.08);
          o.stop(t0 + i * 0.08 + 0.7);
        });
        window.dispatchEvent(new CustomEvent("hawkes-sound", { detail: { id: "sting-synth", bus: "music", gain: vol, rate: pickRate("sting-synth") } }));
        mark();
        return true;
      } catch (e) { /* */ }
    }
    return false;
  }

  /* The turning-point moments' music stings (js/moments.js `play`): short, synthesized swells on the music bus (so his and
     the neighbors' voices duck them), one character per beat. No files: nothing to 404, nothing to generate. */
  const MOMENT_STINGS = {
    drought: { notes: [146.83, 220, 293.66, 369.99, 440, 587.33], wave: "triangle", stagger: 0.16, attack: 0.9, dur: 6.2, noise: [3200, 0.07, 1.4], gain: 0.12 },
    turbines: { notes: [110, 164.81, 220, 329.63, 440, 659.25], wave: "sawtooth", stagger: 0.28, attack: 0.35, dur: 5.6, noise: [900, 0.05, 2.2], gain: 0.07, lowpass: 2600 },
    tank: { notes: [98, 146.83, 196, 246.94, 392], wave: "sine", stagger: 0.3, attack: 1.1, dur: 6.6, noise: [500, 0.05, 2.6], gain: 0.16, beep: [880, 0.5] },
    twist: { notes: [87.31, 92.5, 130.81, 138.59, 207.65], wave: "sawtooth", stagger: 0.12, attack: 0.5, dur: 6, noise: [260, 0.2, 1.8], gain: 0.07, lowpass: 1500 },
    bridge: { notes: [164.81, 233.08, 329.63, 466.16], wave: "triangle", stagger: 0.5, attack: 0.08, dur: 6.8, noise: [420, 0.1, 3], gain: 0.12, bell: true },
  };
  function momentSting(id) {
    if (!soundOn()) return false;
    unlock();
    if (!ctx || !musicBus) return false;
    const S = MOMENT_STINGS[id] || MOMENT_STINGS.drought;
    const t0 = ctx.currentTime + 0.03;
    const vol = cfg().stingVol != null ? cfg().stingVol : STING_VOL;
    const bus = ctx.createGain();
    bus.gain.value = vol * 1.5;
    let dest = bus;
    if (S.lowpass && ctx.createBiquadFilter) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = S.lowpass;
      bus.connect(lp);
      dest = lp;
    }
    // the bus is the one thing connected to the music bus; it is dropped when the swell has died
    (dest === bus ? bus : dest).connect(musicBus);
    const env = (g, at, peak, atk, dur) => {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(peak, at + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    };
    S.notes.forEach((f, i) => {
      const at = t0 + i * S.stagger;
      const o = ctx.createOscillator();
      o.type = S.wave;
      o.frequency.value = f;
      if (o.detune) o.detune.value = (i % 2 ? 1 : -1) * 5;
      const g = ctx.createGain();
      env(g, at, S.gain, S.attack * (S.bell ? 0.2 : 1), Math.max(0.6, S.dur - i * S.stagger));
      o.connect(g);
      g.connect(bus);
      o.start(at);
      o.stop(at + S.dur + 0.1);
    });
    if (S.bell) { // two far low tolls: the arm coming down
      [0.15, 2.4].forEach((d) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = 82.41;
        const g = ctx.createGain();
        env(g, t0 + d, 0.3, 0.02, 2.2);
        o.connect(g);
        g.connect(bus);
        o.start(t0 + d);
        o.stop(t0 + d + 2.4);
      });
    }
    if (S.beep) { // the Board's speaker: two flat tones
      [0.4, 0.95].forEach((d) => {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = S.beep[0];
        const g = ctx.createGain();
        env(g, t0 + d, 0.03, 0.01, S.beep[1] * 0.4);
        o.connect(g);
        g.connect(bus);
        o.start(t0 + d);
        o.stop(t0 + d + 0.5);
      });
    }
    if (S.noise && ctx.createBuffer) {
      const n = Math.floor(ctx.sampleRate * S.dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = S.noise[0];
      bp.Q.value = 0.7;
      const g = ctx.createGain();
      env(g, t0, S.noise[1], S.noise[2], S.dur);
      src.connect(bp);
      bp.connect(g);
      g.connect(bus);
      src.start(t0);
    }
    live.momentSting = { id, at: typeof performance !== "undefined" ? performance.now() : Date.now(), notes: S.notes.length };
    return true;
  }

  /** Short whoosh when he starts riding the wind (js/control.js). */
  function whoosh() {
    if (!soundOn()) return false;
    unlock();
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - whooshAt < 700) return false;
    const c = cfg();
    const ok = playOneShot(c.whoosh, c.whooshVol);
    if (ok) {
      whooshAt = now;
      live.whooshAt = whooshAt;
    }
    return ok;
  }

  /** Near or far thunder crack; weather and powers call this after a distance-based delay. */
  function crack(kind, meta) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const m = meta || {};
    const dist = m.dist != null ? m.dist : kind === "near" ? 12 : 68;
    const expectedDelay = m.delay != null ? m.delay : (dist <= 30 ? 0 : Math.min(2.8, dist / 343));
    const actualDelay = m.flashAt != null ? Math.max(0, (now - m.flashAt) / 1000) : expectedDelay;
    const near = kind === "near" || (kind !== "far" && dist <= 30);
    const pan = m.pan != null ? Math.max(-1, Math.min(1, m.pan)) : 0;
    live.lastThunder = {
      kind: near ? "near" : "far",
      dist: Math.round(dist * 10) / 10,
      expectedDelay: Math.round(expectedDelay * 1000) / 1000,
      actualDelay: Math.round(actualDelay * 1000) / 1000,
      pan: Math.round(pan * 100) / 100,
      at: Math.round(now),
    };
    live.amb.thunder = near ? 1 : 0.65;
    if (m.silent) return true; // js/sfx.js already played the layered body/rumble; just keep the log
    if (!soundOn() || !unlocked) return false;
    if (now - lastCrack < 180) return true;
    lastCrack = now;
    const c = cfg();
    const url = near ? c.ambience.thunderNear : c.ambience.thunderFar;
    const vol = (near ? 1 : 0.68) * c.mix.thunder * c.ambVol;
    return playOneShot(url, vol, undefined, pan);
  }

  /** Sidechain music + ambience by 6 dB for `sec` seconds (a close strike hits the chest). */
  function duckStrike(sec) {
    const ms = Math.max(0.4, sec == null ? 1.5 : sec) * 1000;
    duckUntil = (typeof performance !== "undefined" ? performance.now() : Date.now()) + ms;
    // Force the duck floor to 0.5 (−6 dB) for the strike window (mix.duck may be lower for voice).
    live.strikeDuck = 0.5;
    return true;
  }
  function fogColor(k) {
    fogColorK = Math.max(fogColorK, Math.max(0, Math.min(1, k == null ? 1 : k)));
    return fogColorK;
  }
  function birdLift(sec) {
    birdLiftUntil = (typeof performance !== "undefined" ? performance.now() : Date.now()) + Math.max(0.5, sec || 4) * 1000;
    return true;
  }

  /** Compute spatialized weather soundscape targets for the current state, rooftop height, camera yaw, and crowd. */
  function computeSoundscape(L, state, night, d) {
    gustClock += d;
    const S = (L && L.sound) || {};
    const wNow = (window.weather && window.weather.now && window.weather.now()) || { state };
    const rainLvl = Math.max(0, Math.min(1, L && L.rain != null ? L.rain : S.rain || 0));
    const windLvl = Math.max(0, Math.min(1, L && L.wind != null ? L.wind : S.wind || 0));
    const wetLvl = Math.max(0, Math.min(1, (L && L.wet) || wNow.wet || 0));
    const snowLvl = Math.max(0, Math.min(1, (L && L.snow) || S.snow || (state === "snow" ? 1 : 0)));
    const hushLvl = Math.max(0, Math.min(1, S.hush || (state === "fog" ? 0.75 : 0)));
    const sunBoost = Math.max(0, Math.min(1, wNow.sun || (state === "clear" && !night ? 0.65 : 0)));

    let px = 0, py = 0, pz = 0, camAlpha = 0;
    try {
      const st = day.control && day.control.state && day.control.state();
      if (st && st.mode === "control") {
        px = st.x || 0;
        py = st.y || 0;
        pz = st.z || 0;
      }
      const w = day.world && day.world();
      if (w && w.camera) {
        camAlpha = w.camera.alpha || 0;
        if (!py && w.camera.target) {
          px = w.camera.target.x || px;
          py = Math.max(py, (w.camera.target.y || 0) - 1.35);
          pz = w.camera.target.z || pz;
        }
      }
    } catch (e) { /* headless */ }

    const onRoof = py > 2.2;
    const roofFactor = onRoof ? 1 : 0.35;
    const gust = 0.5 + 0.5 * Math.sin(gustClock * 1.15);
    const windAngle = 0.65 + 0.35 * Math.sin(gustClock * 0.27);
    const windPan = Math.max(-0.95, Math.min(0.95, Math.sin(camAlpha - windAngle) * 0.72 + 0.25 * Math.cos(gustClock * 0.85)));
    const awningPan = Math.max(-0.9, Math.min(0.9, Math.cos(camAlpha + 0.4) * 0.65 + 0.2 * Math.sin(gustClock * 1.4)));

    // Nearest umbrella proximity & pan when raining
    let nearUmbrella = 0.35;
    let umbrellaPan = Math.sin(camAlpha + 1.1) * 0.5;
    if (rainLvl > 0.08) {
      try {
        const pts = day.crowd && day.crowd.positions && day.crowd.positions();
        if (pts && pts.length) {
          let bestD = 999;
          let bestDx = 0;
          let bestDz = 1;
          for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const d2 = Math.hypot((p.x || 0) - px, (p.z || 0) - pz);
            if (d2 < bestD) {
              bestD = d2;
              bestDx = (p.x || 0) - px;
              bestDz = (p.z || 0) - pz;
            }
          }
          if (bestD < 32) {
            nearUmbrella = Math.max(0.35, 1 - bestD / 36);
            const ang = Math.atan2(bestDz, bestDx) - camAlpha;
            umbrellaPan = Math.max(-0.9, Math.min(0.9, Math.sin(ang) * 0.8));
          }
        }
      } catch (e) { /* fallback */ }
    }

    // Rain layers: light roof patter vs heavy downpour, roof gutters, and umbrella rain
    const rainAmt = Math.max(rainLvl, S.rain || 0);
    const rainInt = state === "storm" ? 1 : state === "rain" ? (wNow.intensity != null ? wNow.intensity : 1) : rainAmt;
    const isLightRain = rainInt > 0.05 && rainInt <= 0.65 && state !== "storm";
    const rainRoof = rainAmt > 0.02
      ? Math.min(1, Math.max(rainAmt, rainInt * 0.85) * (0.52 + 0.48 * roofFactor) * (isLightRain ? 1.15 : state === "storm" ? 0.55 : 0.75))
      : 0;
    const rainDownpour = rainAmt > 0.05
      ? Math.min(1, (isLightRain ? rainInt * 0.35 : Math.max(rainAmt, rainInt) * (state === "storm" ? 1.0 : 0.92)))
      : 0;
    const gutter = (rainAmt > 0.04 || wetLvl > 0.18)
      ? Math.min(1, Math.max(rainAmt * 0.95, wetLvl * 0.7) * (0.45 + 0.55 * roofFactor))
      : 0;
    const umbrella = rainAmt > 0.05
      ? Math.min(1, Math.max(rainAmt, rainInt * 0.7) * nearUmbrella * (onRoof ? 0.62 : 0.92))
      : 0;

    // Wind layers: 3D panned gusts + flapping awnings
    const windOut = Math.min(1, windLvl * (0.62 + 0.38 * gust));
    const awning = windLvl > 0.14
      ? Math.min(1, windLvl * (0.55 + 0.45 * gust) * (state === "wind" || state === "storm" ? 0.95 : 0.6))
      : 0;

    // Sun / Clear: birds + brightened city hum
    const birds = (state === "clear" || sunBoost > 0.25) && !night && rainLvl < 0.1 && snowLvl < 0.1
      ? Math.min(1, 0.58 + 0.32 * sunBoost + 0.1 * roofFactor)
      : 0;
    const birdPan = Math.max(-0.85, Math.min(0.85, Math.sin(gustClock * 0.52 + camAlpha) * 0.7));

    // City hum tone (sun brightens to ~4800 Hz; snow muffles down to ~360 Hz; fog damps to ~620 Hz)
    let cityToneHz = 2100;
    let muffled = 0;
    if (snowLvl > 0.2 || state === "snow") {
      const sk = Math.min(1, Math.max(snowLvl, state === "snow" ? 0.9 : 0));
      cityToneHz = Math.round(320 + (1 - sk) * 400); // ~360 Hz under snow
      muffled = sk;
    } else if (state === "fog" || hushLvl > 0.35) {
      cityToneHz = 620;
      muffled = 0.55;
    } else if (state === "clear" || sunBoost > 0.25) {
      cityToneHz = Math.round(3800 + sunBoost * 1000); // 3800..4800 Hz
      muffled = 0;
    } else if (state === "clouds") {
      cityToneHz = 1750;
    } else if (state === "rain") {
      cityToneHz = 1350;
    } else if (state === "storm") {
      cityToneHz = 1050;
    } else if (state === "wind") {
      cityToneHz = 2400;
    }

    const airOut = Math.max(0.08, (S.air != null ? S.air : 0.4) * (state === "snow" ? 0.52 : state === "clear" ? 1.15 : 1));
    const foghorn = state === "fog" ? 0.48 : hushLvl * 0.4;

    return {
      state,
      air: Math.round(airOut * 1000) / 1000,
      rain: Math.round(rainLvl * 1000) / 1000,
      rainRoof: Math.round(rainRoof * 1000) / 1000,
      rainDownpour: Math.round(rainDownpour * 1000) / 1000,
      gutter: Math.round(gutter * 1000) / 1000,
      umbrella: Math.round(umbrella * 1000) / 1000,
      wind: Math.round(windOut * 1000) / 1000,
      windPan: Math.round(windPan * 100) / 100,
      awning: Math.round(awning * 1000) / 1000,
      awningPan: Math.round(awningPan * 100) / 100,
      umbrellaPan: Math.round(umbrellaPan * 100) / 100,
      birds: Math.round(birds * 1000) / 1000,
      birdPan: Math.round(birdPan * 100) / 100,
      cityToneHz,
      brightened: cityToneHz >= 3600,
      muffled: Math.round(muffled * 100) / 100,
      snowHush: Math.round(snowLvl * 100) / 100,
      foghorn: Math.round(foghorn * 100) / 100,
      onRoof,
    };
  }

  function tick(L, dt) {
    const on = soundOn();
    live.on = on;
    live.unlocked = unlocked;
    if (on) unlock();

    const c = cfg();
    const d = Math.min(0.5, Math.max(0, dt != null ? dt : 0.05));
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const duckTo = nowMs < duckUntil ? (live.strikeDuck != null ? live.strikeDuck : c.mix.duck) : 1;
    if (nowMs >= duckUntil) live.strikeDuck = null;
    duckK += (duckTo - duckK) * Math.min(1, d * (duckTo < duckK ? 8 : 1.5));
    const titleUp = !!(day.title && day.title.showing && day.title.showing());
    live.duck = duckK;
    live.title = titleUp;

    // Fog: world bus low-passes and a wet delay grows as fog thickens (ability or forecast).
    let fogAmt = 0;
    try {
      const wn = window.weather && window.weather.now && window.weather.now();
      fogAmt = Math.max(fogColorK, wn && wn.fog != null ? wn.fog : wn && wn.state === "fog" ? 0.85 : 0);
    } catch (e) { fogAmt = fogColorK; }
    fogColorK = Math.max(0, fogColorK - d * 0.25);

    // Pressure: how full the meter is (0..1), eased so a call's spend falls away smoothly.
    let pTarget = 0;
    try {
      const pw = window.powers && window.powers.now && window.powers.now();
      if (pw && pw.pressure != null && pw.max) pTarget = Math.max(0, Math.min(1, pw.pressure / pw.max));
    } catch (e) { /* no powers yet */ }
    pk += (pTarget - pk) * Math.min(1, d * 0.9);
    const from = c.pressureFrom;
    const tk = Math.max(0, Math.min(1, (pk - from) / Math.max(0.01, 1 - from)));
    const rate = 1 + tk * c.pressureRate;
    live.pressure = Math.round(pk * 100) / 100;
    live.tension = Math.round(tk * 100) / 100;
    live.rate = Math.round(rate * 1000) / 1000;

    const state = (window.weather && window.weather.now && window.weather.now().state) || "clear";
    const hour = simHour();
    const night = isNightHour(hour, c);
    live.tod = night ? "night" : "day";
    const toneGoal = (night ? c.mix.nightTone + (18000 - c.mix.nightTone) * tk * 0.5 : 18000) * (1 - 0.55 * fogAmt) + 900 * fogAmt;
    live.tone = Math.round(live.tone + (toneGoal - live.tone) * Math.min(1, d * 0.6));
    live.fog = Math.round(fogAmt * 100) / 100;

    setBed(bedFor(state, hour), false);
    if (ctx) {
      if (currentBed) ensureMusic(currentBed);
      if (targetBed) ensureMusic(targetBed);
    }
    stepFade(d);

    const scape = computeSoundscape(L, state, night, d);
    live.soundscape = scape;
    const blend = Math.min(1, 1 - Math.exp(-Math.max(0.016, d) * 4.2));
    AMB_LOOPS.forEach((k) => {
      const goal = scape[k] || 0;
      smoothAmb[k] = (smoothAmb[k] || 0) + (goal - (smoothAmb[k] || 0)) * blend;
      if (Math.abs(smoothAmb[k] - goal) < 0.002) smoothAmb[k] = goal;
      live.amb[k] = Math.round(smoothAmb[k] * 1000) / 1000;
    });
    live.amb.thunder = Math.max(0, Math.round(((live.amb.thunder || 0) - d * 0.35) * 1000) / 1000);

    if (!ctx) {
      let sum = 0;
      let n = 0;
      Object.keys(live.music).forEach((k) => { sum += live.music[k] || 0; n++; });
      AMB_LOOPS.forEach((k) => { sum += live.amb[k] || 0; n++; });
      live.heard = on ? sum / Math.max(1, n) : 0;
      return { samples: false, driving: false, bed: live.bed, fade: live.fade, soundscape: scape };
    }

    if (on && ctx.state === "suspended") ctx.resume();
    const masterGoal = on ? c.mix.master : 0;
    setGainSmooth(master, masterGoal, 0.04);
    // When mix owns the destination, fold the master level into the bus goals (local master is disconnected).
    const masterK = usingMix ? masterGoal : 1;
    const musicGoal = c.musicVol * duckK * masterK * (titleUp ? c.mix.title / Math.max(0.01, c.musicVol) : 1);
    setGainSmooth(musicBus, musicGoal, 0.05);
    setGainSmooth(bedBus, bedGoal, 0.25);
    setGainSmooth(ambBus, c.ambVol * masterK * (titleUp ? 0.5 : 1), 0.05);

    const T = ensureTension();
    if (T) {
      setGainSmooth(T, on ? tk * tk * c.pressureGain : 0, 0.06);
      T.lp.frequency.value = 260 + tk * 1100;
      T.lfo.frequency.value = 0.7 + tk * 2.6;
    }
    live.pulse = T ? Math.round(T.lfo.frequency.value * 100) / 100 : 0;
    Object.keys(music).forEach((k) => {
      if (music[k] && music[k].src && music[k].src.playbackRate) music[k].src.playbackRate.value = rate;
    });
    if (tone) {
      tone.frequency.value = live.tone;
    }
    if (fogLp) {
      const fogHz = 18000 - fogAmt * 15500;
      fogLp.frequency.value = Math.max(700, fogHz);
    }
    if (fogWet) fogWet.gain.value = on ? fogAmt * 0.35 : 0;
    if (nowMs < birdLiftUntil) {
      live.amb.birds = Math.min(1, Math.max(live.amb.birds || 0, 0.85));
      scape.birds = live.amb.birds;
    }

    let driving = false;
    AMB_LOOPS.forEach((k) => {
      const node = ensureAmb(k);
      if (node) {
        setGainSmooth(node, on ? live.amb[k] : 0, 0.045);
        if (on && live.amb[k] > 0.03 && ctx.state === "running") {
          if (!node.every) node.every = 4000 + Math.random() * 3000;
          if (nowMs - node.bornMs > node.every) refreshLoop(node, 1.4);
        }
        if (node.filter && k === "air") {
          node.filter.frequency.value = scape.cityToneHz;
        }
        if (node.panner) {
          const panVal = k === "wind" ? scape.windPan
            : k === "awning" ? scape.awningPan
            : k === "umbrella" ? scape.umbrellaPan
            : k === "birds" ? scape.birdPan
            : 0;
          node.panner.pan.value = panVal;
        }
        driving = true;
      }
    });
    live.samples = driving || BEDS.some((b) => !!music[b] || !!buffers[c.music[b]]);

    // Rough "heard" level for the playtest / weather panel.
    let sum = 0;
    let n = 0;
    Object.keys(live.music).forEach((k) => {
      sum += live.music[k] || 0;
      n++;
    });
    AMB_LOOPS.forEach((k) => {
      sum += live.amb[k] || 0;
      n++;
    });
    live.heard = on ? sum / Math.max(1, n) : 0;

    return { samples: live.samples, driving, bed: live.bed, fade: live.fade, soundscape: scape };
  }

  function now() {
    return {
      bed: live.bed,
      target: live.target,
      fade: live.fade,
      equalPower: Object.assign({}, live.equalPower),
      music: Object.assign({}, live.music),
      amb: Object.assign({}, live.amb),
      soundscape: Object.assign({}, live.soundscape),
      lastThunder: live.lastThunder ? Object.assign({}, live.lastThunder) : null,
      samples: live.samples,
      unlocked: live.unlocked,
      on: live.on,
      stingAt: live.stingAt,
      momentSting: live.momentSting ? Object.assign({}, live.momentSting) : null,
      whooshAt: live.whooshAt || 0,
      bedRefreshes: AMB_LOOPS.reduce((n, k) => n + (amb[k] ? amb[k].refreshes : 0), 0),
      heard: live.heard,
      missing: Object.keys(missing).length,
      tod: live.tod,
      tone: live.tone,
      duck: Math.round(live.duck * 100) / 100,
      title: live.title,
      pressure: live.pressure,
      tension: live.tension,
      rate: live.rate,
      pulse: live.pulse,
      bedLevel: bedGoal,
      mix: Object.assign({}, cfg().mix),
      // which file each of the day/night beds is playing (its own, or the fallback until Gen's file lands)
      files: { day: ctx ? bedUrl("day", cfg()) : null, night: ctx ? bedUrl("night", cfg()) : null },
    };
  }

  // Unlock path: Sound button and a gesture (same as weather's procedural path).
  const soundBtn = document.getElementById && document.getElementById("sound");
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      if (soundOn()) unlock();
    });
  }
  ["pointerdown", "keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, () => { if (soundOn()) unlock(); }, true));

  // His spoken lines (js/voice.js): the music dips under them for a couple of seconds.
  // When js/mix.js is up it owns the −8 dB / −4 dB duck on the shared buses — skip the
  // local duck so we don't stack another −7 dB on top.
  window.addEventListener("day:voice", () => {
    if (usingMix || (day.mix || window.mix)) return;
    duckUntil = (typeof performance !== "undefined" ? performance.now() : Date.now()) + 2600;
  });
  // and under the story's and neighbors' spoken lines (js/dialogue.js)
  window.addEventListener("day:dialogue", () => {
    if (usingMix || (day.mix || window.mix)) return;
    duckUntil = (typeof performance !== "undefined" ? performance.now() : Date.now()) + 3200;
  });

  // Heroic sting + whoosh when the player takes him; whoosh again on let-go (pairs with the camera blend).
  window.addEventListener("day:control", (ev) => {
    const d = (ev && ev.detail) || {};
    if (d.action === "take") { sting(); whoosh(); }
    else if (d.action === "let-go") whoosh();
  });
  // Loading card → title crane: arm the beds under the fade when Sound is already on.
  window.addEventListener("day:loading", (ev) => {
    const d = (ev && ev.detail) || {};
    if ((d.action === "handoff" || d.action === "done") && soundOn()) {
      try { unlock(); } catch (e) { /* needs a gesture on some browsers */ }
    }
  });

  const api = {
    tick,
    now,
    sting,
    momentSting,
    whoosh,
    crack,
    duckStrike,
    fogColor,
    birdLift,
    unlock,
    equalPowerGains,
    /** js/stems.js: the music bus and context (null until Sound is on and unlocked), and the beds' level (0 = muted). */
    bus: () => (ctx && musicBus ? { ctx, bus: musicBus, unlocked, on: soundOn() } : null),
    /** js/daysound.js: the ambience bus (rain/city and diegetic day loops), once Sound has unlocked the graph. */
    ambienceBus: () => (ctx && ambBus ? { ctx, bus: ambBus, unlocked, on: soundOn() } : null),
    bedLevel: (k) => { bedGoal = Math.max(0, Math.min(1, Number(k))); live.bedLevel = bedGoal; return bedGoal; },
    usingSamples: () => live.samples,
    bedFor: (state, hour) => bedFor(state, hour == null ? simHour() : hour),
    isNight: (hour) => isNightHour(hour == null ? simHour() : hour, cfg()),
  };
  day.score = api;
  /* Preload: the city hum is the one file the first tap needs. Its bytes are fetched once the page is idle (no AudioContext
     needed, so no autoplay rule), so the tap itself only decodes from the HTTP cache and never waits on the network. */
  try {
    const hum = cfg().ambience && cfg().ambience.air;
    if (hum && soundOn() && typeof fetch === "function") {
      const go = () => fetch(hum).then((r) => r.arrayBuffer()).catch(() => {});
      if (typeof requestIdleCallback === "function") requestIdleCallback(go, { timeout: 3000 }); else setTimeout(go, 1500);
    }
  } catch (e) { /* a head start only */ }
  window.score = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) {
  startScore();
}

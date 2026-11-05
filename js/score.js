/* ==========================================================================
   Adaptive score: weather music beds, sampled ambience, and a take-control sting.
   Driven by weather.look() levels each frame. Nothing audibly plays until the
   Sound button is on (aria-pressed) — same autoplay rule as the rest of the page.
   Missing files fall back to the procedural layers in js/weather.js.
   Recipes: hawkes.assets.json (audio.music / audio.sfx). Paths: day.config.js score.
   ========================================================================== */

/* Clear (and wind) weather plays a calm day bed or its night variation by the clock; the other weathers keep
   their own beds. "day" / "night" have their own files (Hawkes Gen) and fall back to the older beds until
   those files exist. */
const BEDS = ["day", "night", "clear", "clouds", "rain", "storm", "fog", "snow"];
const NIGHT_FROM = 19.75; // 7:45 PM
const NIGHT_TO = 6.25; // 6:15 AM
const AMB_LOOPS = ["air", "rain", "wind"];
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
    wind: "audio/sfx/wind.mp3",
    thunderNear: "audio/sfx/thunder-near.mp3",
    thunderFar: "audio/sfx/thunder-far.mp3",
  },
};

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
  let ambBus = null;
  let unlocked = false;
  let loading = null;
  const buffers = Object.create(null);
  const missing = Object.create(null);
  const music = Object.create(null); // bed -> { src, gain }
  const amb = Object.create(null); // air|rain|wind -> { src, gain }
  let currentBed = null;
  let targetBed = null;
  let fadeLeft = 0;
  let fadeTotal = c0.fade;
  let stingAt = 0;
  let whooshAt = 0;
  let lastCrack = 0;
  let tone = null;
  let duckUntil = 0;
  let duckK = 1;
  const live = {
    bed: null,
    target: null,
    fade: 1,
    music: Object.create(null),
    amb: { air: 0, rain: 0, wind: 0, thunder: 0 },
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
  };

  function ensureCtx() {
    if (ctx) return ctx;
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0;
      musicBus = ctx.createGain();
      musicBus.gain.value = 1;
      tone = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null;
      if (tone) {
        tone.type = "lowpass";
        tone.frequency.value = 18000;
        tone.Q.value = 0.5;
      }
      ambBus = ctx.createGain();
      ambBus.gain.value = 1;
      if (tone) {
        musicBus.connect(tone);
        tone.connect(master);
      } else musicBus.connect(master);
      ambBus.connect(master);
      master.connect(ctx.destination);
    } catch (err) {
      ctx = null;
      return null;
    }
    return ctx;
  }

  async function loadUrl(url) {
    if (!url || missing[url]) return null;
    if (buffers[url]) return buffers[url];
    const a = ensureCtx();
    if (!a) return null;
    try {
      const res = await fetch(url);
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

  async function loadAll() {
    const c = cfg();
    const urls = new Set();
    BEDS.forEach((b) => c.music[b] && urls.add(c.music[b]));
    urls.add(c.music.wind);
    urls.add(c.sting);
    if (c.whoosh) urls.add(c.whoosh);
    Object.keys(c.ambience).forEach((k) => urls.add(c.ambience[k]));
    await Promise.all([...urls].map(loadUrl));
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

  function startLoop(buf, bus, vol) {
    if (!ctx || !buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = vol || 0;
    src.connect(g);
    g.connect(bus);
    src.start();
    return { src, gain: g };
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
    music[bed] = startLoop(buf, musicBus, 0);
    return music[bed];
  }

  function ensureAmb(key) {
    const c = cfg();
    const url = c.ambience[key];
    if (amb[key]) return amb[key];
    const buf = buffers[url];
    if (!buf) return null;
    amb[key] = startLoop(buf, ambBus, 0);
    return amb[key];
  }

  function setBed(bed, snap) {
    const next = BEDS.indexOf(bed) >= 0 ? bed : bedFor(bed, simHour());
    if (next === targetBed && !snap) return;
    if (snap || !currentBed) {
      Object.keys(music).forEach((k) => {
        if (music[k]) music[k].gain.gain.value = 0;
      });
      const node = ensureMusic(next);
      if (node) node.gain.gain.value = 1;
      currentBed = next;
      targetBed = next;
      fadeLeft = 0;
      fadeTotal = cfg().fade;
      live.bed = next;
      live.target = next;
      live.fade = 1;
      return;
    }
    if (next === currentBed && fadeLeft <= 0) {
      targetBed = next;
      live.target = next;
      return;
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
        if (music[currentBed]) music[currentBed].gain.gain.value = 0;
        currentBed = targetBed;
        if (music[currentBed]) music[currentBed].gain.gain.value = 1;
      }
      live.bed = currentBed;
      live.fade = 1;
      return;
    }
    fadeLeft = Math.max(0, fadeLeft - dt);
    const t = 1 - fadeLeft / Math.max(0.001, fadeTotal);
    const from = music[currentBed];
    const to = music[targetBed];
    if (from) from.gain.gain.value = 1 - t;
    if (to) to.gain.gain.value = t;
    if (fadeLeft <= 0) {
      if (from && currentBed !== targetBed) from.gain.gain.value = 0;
      currentBed = targetBed;
    }
    live.bed = currentBed;
    live.target = targetBed;
    live.fade = t;
  }

  function playOneShot(url, vol, when) {
    if (!ctx || !soundOn() || !unlocked) return false;
    const buf = buffers[url];
    if (!buf) return false;
    const t = when != null ? when : ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(master);
    src.start(t);
    return true;
  }

  function sting() {
    if (!soundOn()) return false;
    unlock();
    const c = cfg();
    const ok = playOneShot(c.sting, c.stingVol);
    if (ok) {
      stingAt = (typeof performance !== "undefined" ? performance.now() : Date.now());
      live.stingAt = stingAt;
    }
    return ok;
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

  /** Near or far thunder crack; weather calls this on a lightning flash. */
  function crack(kind) {
    if (!soundOn() || !unlocked) return false;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastCrack < 400) return false;
    lastCrack = now;
    const c = cfg();
    const near = kind === "near" || (kind !== "far" && Math.random() < 0.45);
    const url = near ? c.ambience.thunderNear : c.ambience.thunderFar;
    const vol = (near ? 1 : 0.6) * c.mix.thunder * c.ambVol;
    const ok = playOneShot(url, vol);
    if (ok) live.amb.thunder = near ? 1 : 0.55;
    return ok;
  }

  function tick(L, dt) {
    const on = soundOn();
    live.on = on;
    live.unlocked = unlocked;
    if (on) unlock();
    if (!ctx) return { samples: false, driving: false };

    if (on && ctx.state === "suspended") ctx.resume();
    const c = cfg();
    const d = Math.min(0.5, Math.max(0, dt || 0));
    master.gain.value = on ? c.mix.master : 0;
    // Under a spoken line the music dips (duck), and on the title it sits a little lower.
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const duckTo = nowMs < duckUntil ? c.mix.duck : 1;
    duckK += (duckTo - duckK) * Math.min(1, d * (duckTo < duckK ? 8 : 1.5));
    const titleUp = !!(day.title && day.title.showing && day.title.showing());
    const musicGoal = c.musicVol * duckK * (titleUp ? c.mix.title / Math.max(0.01, c.musicVol) : 1);
    musicBus.gain.value = musicGoal;
    ambBus.gain.value = c.ambVol * (titleUp ? 0.5 : 1);
    live.duck = duckK;
    live.title = titleUp;

    const state = (window.weather && window.weather.now && window.weather.now().state) || "clear";
    const hour = simHour();
    const night = isNightHour(hour, c);
    live.tod = night ? "night" : "day";
    // Night softens the top end of every bed a little (a low-pass), the night bed most of all.
    if (tone) {
      const goal = night ? c.mix.nightTone : 18000;
      tone.frequency.value += (goal - tone.frequency.value) * Math.min(1, d * 0.6);
      live.tone = Math.round(tone.frequency.value);
    }
    setBed(bedFor(state, hour), false);
    // Buffers may land mid-session (Gen files after first unlock); attach loops once they exist.
    if (currentBed) ensureMusic(currentBed);
    if (targetBed) ensureMusic(targetBed);
    stepFade(d);

    const S = (L && L.sound) || {};
    const gust = 0.45 + 0.55 * Math.abs(Math.sin((typeof performance !== "undefined" ? performance.now() : 0) * 0.00045));
    const levels = {
      air: S.air || 0,
      rain: S.rain || 0,
      wind: (S.wind || 0) * gust,
    };
    let driving = false;
    AMB_LOOPS.forEach((k) => {
      const node = ensureAmb(k);
      if (node) {
        node.gain.gain.value = on ? levels[k] : 0;
        driving = true;
      }
      live.amb[k] = levels[k];
    });
    live.amb.thunder = Math.max(0, (live.amb.thunder || 0) - (dt || 0) * 0.35);
    live.samples = driving || BEDS.some((b) => !!music[b] || !!buffers[c.music[b]]);
    BEDS.forEach((b) => {
      live.music[b] = music[b] ? music[b].gain.gain.value : 0;
    });

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

    return { samples: live.samples, driving, bed: live.bed, fade: live.fade };
  }

  function now() {
    return {
      bed: live.bed,
      target: live.target,
      fade: live.fade,
      music: Object.assign({}, live.music),
      amb: Object.assign({}, live.amb),
      samples: live.samples,
      unlocked: live.unlocked,
      on: live.on,
      stingAt: live.stingAt,
      whooshAt: live.whooshAt || 0,
      heard: live.heard,
      missing: Object.keys(missing).length,
      tod: live.tod,
      tone: live.tone,
      duck: Math.round(live.duck * 100) / 100,
      title: live.title,
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
  window.addEventListener(
    "pointerdown",
    () => {
      if (soundOn()) unlock();
    },
    true
  );

  // His spoken lines (js/voice.js): the music dips under them for a couple of seconds.
  window.addEventListener("day:voice", () => {
    duckUntil = (typeof performance !== "undefined" ? performance.now() : Date.now()) + 2600;
  });

  // Heroic sting when the player takes him.
  window.addEventListener("day:control", (ev) => {
    const d = (ev && ev.detail) || {};
    if (d.action === "take") sting();
  });

  const api = {
    tick,
    now,
    sting,
    whoosh,
    crack,
    unlock,
    usingSamples: () => live.samples,
    bedFor: (state, hour) => bedFor(state, hour == null ? simHour() : hour),
    isNight: (hour) => isNightHour(hour == null ? simHour() : hour, cfg()),
  };
  day.score = api;
  window.score = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) {
  startScore();
}

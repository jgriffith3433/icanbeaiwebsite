/* ==========================================================================
   Adaptive audio for the weather: music beds that crossfade with the sky,
   Gen-made ambience (rain, wind, city hum) and thunder one-shots, plus a
   sting when the player takes control. Respects the Sound button and the
   browser's autoplay rules (AudioContext stays silent until a gesture).
   Files live under audio/ (day.config.js weather.audio); until they load,
   the procedural noise beds from before keep the weather sounding.
   ========================================================================== */

const MUSIC_STATES = ["clear", "clouds", "rain", "storm", "fog", "snow"];
const STATES_SKY = ["clear", "clouds", "rain", "storm", "fog", "wind", "snow"];
/** Wind borrows the clear bed; its drama is the wind SFX. */
const MUSIC_FOR = {
  clear: "clear",
  clouds: "clouds",
  rain: "rain",
  storm: "storm",
  fog: "fog",
  wind: "clear",
  snow: "snow",
};

const DEFAULT_AUDIO = {
  fade: 1.8,
  musicVol: 0.28,
  ambienceVol: 0.55,
  stingVol: 0.55,
  music: {
    clear: "audio/music/clear.mp3",
    clouds: "audio/music/clouds.mp3",
    rain: "audio/music/rain.mp3",
    storm: "audio/music/storm.mp3",
    fog: "audio/music/fog.mp3",
    snow: "audio/music/snow.mp3",
  },
  sting: "audio/music/control-sting.mp3",
  sfx: {
    rain: "audio/sfx/rain-asphalt.mp3",
    wind: "audio/sfx/wind.mp3",
    city: "audio/sfx/city-hum.mp3",
    thunderNear: "audio/sfx/thunder-near.mp3",
    thunderFar: "audio/sfx/thunder-far.mp3",
  },
};

function noiseBuffer(ctx) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.98 * b0 + 0.08 * w;
    d[i] = Math.max(-1, Math.min(1, b0 * 3.2));
  }
  return buf;
}

function soundPressed() {
  const btn = typeof document !== "undefined" && document.getElementById && document.getElementById("sound");
  return !!(btn && btn.getAttribute("aria-pressed") === "true");
}

/**
 * Install adaptive weather audio on the page. Returns a small API the weather
 * module ticks each frame and calls on lightning / take-control.
 */
export function createWeatherAudio(cfgIn) {
  const cfg = Object.assign({}, DEFAULT_AUDIO, cfgIn || {});
  cfg.music = Object.assign({}, DEFAULT_AUDIO.music, (cfgIn && cfgIn.music) || {});
  cfg.sfx = Object.assign({}, DEFAULT_AUDIO.sfx, (cfgIn && cfgIn.sfx) || {});

  let audio = null;
  let loading = null;
  let allowed = false; // set on Sound click or a real pointer; keeps autoplay rules
  const beds = {}; // state -> { gain, ready }
  const loops = {}; // rain|wind|city -> { gain, ready }
  let stingBuf = null;
  let thunderNearBuf = null;
  let thunderFarBuf = null;
  let stingAt = 0;
  let musicBlend = 1;
  const live = {
    ready: false,
    music: "clear",
    beds: {},
    ambience: { rain: 0, wind: 0, city: 0, hush: 0, snow: 0, air: 0, thunder: 0 },
    heard: 0,
    sting: false,
    files: { music: 0, sfx: 0 },
  };

  function ensure() {
    if (!allowed) return audio;
    if (audio || (typeof window === "undefined" && typeof AudioContext === "undefined")) return audio;
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      master.connect(analyser);
      analyser.connect(ctx.destination);

      const musicBus = ctx.createGain();
      musicBus.gain.value = cfg.musicVol;
      musicBus.connect(master);
      const ambBus = ctx.createGain();
      ambBus.gain.value = cfg.ambienceVol;
      ambBus.connect(master);

      const buffer = noiseBuffer(ctx);
      function noiseLayer(type, freq) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ambBus);
        src.start();
        return gain;
      }

      audio = {
        ctx,
        master,
        analyser,
        musicBus,
        ambBus,
        buffer,
        data: new Uint8Array(analyser.fftSize),
        air: noiseLayer("highpass", 1600),
        rainNoise: noiseLayer("bandpass", 1500),
        windNoise: noiseLayer("lowpass", 480),
        hush: noiseLayer("lowpass", 240),
        snow: noiseLayer("bandpass", 620),
        rumble: noiseLayer("lowpass", 110),
      };
      MUSIC_STATES.forEach((s) => {
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(musicBus);
        beds[s] = { gain: g, ready: false, src: null };
      });
      ["rain", "wind", "city"].forEach((k) => {
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(ambBus);
        loops[k] = { gain: g, ready: false, src: null };
      });
      if (!loading) loading = loadFiles();
    } catch (err) {
      audio = null;
    }
    return audio;
  }

  async function decodeUrl(url) {
    if (!audio || !url) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const raw = await res.arrayBuffer();
      return await audio.ctx.decodeAudioData(raw.slice(0));
    } catch (err) {
      return null;
    }
  }

  function startLoop(slot, buf) {
    if (!audio || !buf || !slot || slot.src) return;
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(slot.gain);
    src.start();
    slot.src = src;
    slot.ready = true;
  }

  async function loadFiles() {
    if (!audio) return;
    const musicUrls = cfg.music || {};
    let musicN = 0;
    let sfxN = 0;
    await Promise.all(
      MUSIC_STATES.map(async (s) => {
        const buf = await decodeUrl(musicUrls[s]);
        if (buf) {
          startLoop(beds[s], buf);
          musicN++;
        }
      })
    );
    const sfx = cfg.sfx || {};
    const rainBuf = await decodeUrl(sfx.rain);
    if (rainBuf) {
      startLoop(loops.rain, rainBuf);
      sfxN++;
    }
    const windBuf = await decodeUrl(sfx.wind);
    if (windBuf) {
      startLoop(loops.wind, windBuf);
      sfxN++;
    }
    const cityBuf = await decodeUrl(sfx.city);
    if (cityBuf) {
      startLoop(loops.city, cityBuf);
      sfxN++;
    }
    thunderNearBuf = await decodeUrl(sfx.thunderNear);
    if (thunderNearBuf) sfxN++;
    thunderFarBuf = await decodeUrl(sfx.thunderFar);
    if (thunderFarBuf) sfxN++;
    stingBuf = await decodeUrl(cfg.sting);
    if (stingBuf) musicN++;
    live.files = { music: musicN, sfx: sfxN };
    live.ready = musicN + sfxN > 0;
  }

  function playBuf(buf, vol, bus) {
    if (!audio || !buf || !soundPressed()) return;
    const t = audio.ctx.currentTime;
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    const g = audio.ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(bus || audio.master);
    src.start(t);
    return src;
  }

  function proceduralThunder() {
    if (!audio || !soundPressed()) return;
    const t = audio.ctx.currentTime;
    const src = audio.ctx.createBufferSource();
    src.buffer = audio.buffer;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(220, t);
    filter.frequency.exponentialRampToValueAtTime(50, t + 1.5);
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.85, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    src.connect(filter);
    filter.connect(g);
    g.connect(audio.ambBus);
    src.start(t);
    src.stop(t + 1.8);
  }

  function thunder(intensity) {
    ensure();
    if (!audio || !soundPressed()) return;
    const near = intensity == null ? Math.random() > 0.45 : intensity > 0.55;
    const buf = near ? thunderNearBuf : thunderFarBuf;
    if (buf) playBuf(buf, near ? 0.7 : 0.45, audio.ambBus);
    else proceduralThunder();
  }

  function playSting() {
    ensure();
    if (!audio || !soundPressed()) return;
    if (stingBuf) {
      playBuf(stingBuf, cfg.stingVol, audio.musicBus);
      stingAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      live.sting = true;
    }
  }

  function musicWeights(weatherNow) {
    const now = weatherNow || {};
    const w = now.weights || {};
    const want = {};
    MUSIC_STATES.forEach((s) => (want[s] = 0));
    // Fold the seven sky states onto the six beds (wind → clear).
    STATES_SKY.forEach((sky) => {
      const bed = MUSIC_FOR[sky] || "clear";
      want[bed] = (want[bed] || 0) + (w[sky] || 0);
    });
    // If weights aren't on the snapshot yet, fall back to the target state.
    const sum = MUSIC_STATES.reduce((a, s) => a + want[s], 0);
    if (sum < 0.01) {
      const bed = MUSIC_FOR[now.state || now.shown || "clear"] || "clear";
      want[bed] = 1;
    } else {
      MUSIC_STATES.forEach((s) => (want[s] /= sum));
    }
    return want;
  }

  function tick(look, weatherNow, gust) {
    // Report target ambience even before unlock, so playtests can read levels with Sound off.
    const S = (look && look.sound) || {};
    const g = gust == null ? 1 : gust;
    live.ambience = {
      rain: Math.round(((S.rain || 0) * 0.55) * 100) / 100,
      wind: Math.round(((S.wind || 0) * 0.4 * g) * 100) / 100,
      city: Math.round(((S.air || 0) * 0.22) * 100) / 100,
      hush: Math.round(((S.hush || 0) * 0.3) * 100) / 100,
      snow: Math.round(((S.snow || 0) * 0.35) * 100) / 100,
      air: Math.round(((S.air || 0) * 0.22) * 100) / 100,
      thunder: Math.round(((S.thunder || 0) * 0.28) * 100) / 100,
    };
    const wantPreview = musicWeights(weatherNow);
    let topPreview = "clear";
    let topV = -1;
    MUSIC_STATES.forEach((s) => {
      if (wantPreview[s] > topV) {
        topV = wantPreview[s];
        topPreview = s;
      }
    });
    live.music = topPreview;
    live.beds = Object.assign({}, wantPreview);

    if (!allowed) {
      live.heard = 0;
      return live;
    }
    ensure();
    if (!audio) return live;
    const on = soundPressed();
    if (on && audio.ctx.state === "suspended") audio.ctx.resume();
    audio.master.gain.value = on ? 0.34 : 0;

    const want = wantPreview;
    musicBlend = weatherNow && weatherNow.blend != null ? weatherNow.blend : 1;

    // Follow the weather's own blend weights (smooth over a few seconds already).
    MUSIC_STATES.forEach((s) => {
      const slot = beds[s];
      if (!slot) return;
      const cur = slot.gain.gain.value;
      const target = want[s] || 0;
      const k = 0.18;
      slot.gain.gain.value = cur + (target - cur) * k;
      live.beds[s] = Math.round(slot.gain.gain.value * 100) / 100;
    });

    // Sample loops when ready; otherwise the procedural noise keeps the same levels.
    const rainSample = loops.rain.ready ? 1 : 0;
    const windSample = loops.wind.ready ? 1 : 0;
    const citySample = loops.city.ready ? 1 : 0;

    loops.rain.gain.gain.value = (S.rain || 0) * 0.7 * rainSample;
    loops.wind.gain.gain.value = (S.wind || 0) * 0.55 * g * windSample;
    loops.city.gain.gain.value = (S.air || 0) * 0.5 * citySample;

    audio.rainNoise.gain.value = (S.rain || 0) * 0.55 * (1 - rainSample * 0.85);
    audio.windNoise.gain.value = (S.wind || 0) * 0.4 * g * (1 - windSample * 0.85);
    audio.air.gain.value = (S.air || 0) * 0.22 * (1 - citySample * 0.7);
    audio.hush.gain.value = (S.hush || 0) * 0.3;
    audio.snow.gain.value = (S.snow || 0) * 0.35;
    audio.rumble.gain.value = (S.thunder || 0) * 0.28;

    live.ambience = {
      rain: Math.round(((S.rain || 0) * (rainSample ? 0.7 : 0.55)) * 100) / 100,
      wind: Math.round(((S.wind || 0) * (windSample ? 0.55 : 0.4) * g) * 100) / 100,
      city: Math.round(((S.air || 0) * (citySample ? 0.5 : 0.22)) * 100) / 100,
      hush: Math.round(((S.hush || 0) * 0.3) * 100) / 100,
      snow: Math.round(((S.snow || 0) * 0.35) * 100) / 100,
      air: Math.round(((S.air || 0) * 0.22) * 100) / 100,
      thunder: Math.round(((S.thunder || 0) * 0.28) * 100) / 100,
    };

    audio.analyser.getByteTimeDomainData(audio.data);
    let s = 0;
    for (let i = 0; i < audio.data.length; i++) {
      const x = (audio.data[i] - 128) / 128;
      s += x * x;
    }
    live.heard = Math.sqrt(s / audio.data.length);
    if (live.sting && typeof performance !== "undefined" && performance.now() - stingAt > 4000) live.sting = false;
    return live;
  }

  function onControl(detail) {
    if (detail && detail.action === "take") playSting();
  }

  function unlock() {
    allowed = true;
    const a = ensure();
    if (a && a.ctx.state === "suspended") a.ctx.resume();
    return a;
  }

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("day:control", (e) => onControl(e.detail || {}));
    // A real pointer unlocks (and may resume) the context; Sound on alone also does.
    window.addEventListener("pointerdown", () => unlock(), true);
    const soundBtn = typeof document !== "undefined" && document.getElementById && document.getElementById("sound");
    if (soundBtn) soundBtn.addEventListener("click", () => unlock());
  }

  return {
    ensure,
    tick,
    thunder,
    playSting,
    now: () => Object.assign({}, live, { beds: Object.assign({}, live.beds), ambience: Object.assign({}, live.ambience) }),
    ready: () => live.ready,
  };
}

export { MUSIC_STATES, MUSIC_FOR, DEFAULT_AUDIO };

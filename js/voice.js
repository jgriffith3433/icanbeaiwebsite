/* ==========================================================================
   Small Weather's spoken lines (DoD Eric voice). Data: day.config.js `voice`.
   Files: audio/voice/*.mp3 from Hawkes Gen audio.voice. Listens to day:power,
   day:weather, day:control; polls float for glide; mutters on his autopilot day.
   Nothing plays until Sound is on. Cooldown keeps him from chattering.
   ========================================================================== */

const POWER_GROUPS = new Set(["storm", "bolt", "gust", "tornado"]);

function cfg() {
  const v = (window.DAY_CONFIG && window.DAY_CONFIG.voice) || {};
  return {
    voiceId: v.voiceId || "cjVigY5qzO86Huf0OWal",
    cooldown: v.cooldown != null ? v.cooldown : 2.6,
    powerChance: v.powerChance != null ? v.powerChance : 0.48,
    volume: v.volume != null ? v.volume : 0.88,
    dayEvery: v.dayEvery != null ? v.dayEvery : 90,
    dayChance: v.dayChance != null ? v.dayChance : 0.55,
    lines: Array.isArray(v.lines) ? v.lines : [],
  };
}

function soundOn() {
  const btn = document.getElementById("sound");
  return !!(btn && btn.getAttribute("aria-pressed") === "true");
}

function byGroup(lines) {
  const m = Object.create(null);
  lines.forEach((L) => {
    if (!L || !L.group || !L.id) return;
    (m[L.group] || (m[L.group] = [])).push(L);
  });
  return m;
}

export function startVoice(dayApi) {
  const day = dayApi || window.day;
  if (!day || day.voice) return day && day.voice;

  const c0 = cfg();
  const groups = byGroup(c0.lines);
  const byId = Object.create(null);
  c0.lines.forEach((L) => {
    if (L && L.id) byId[L.id] = L;
  });

  let lastAt = -1e9;
  let lastLine = null;
  let lastSkip = null;
  let floating = false;
  let dayRollAt = 0;
  let heard = 0;
  const audioEls = Object.create(null);
  const missing = Object.create(null);
  const live = {
    last: null,
    skipped: null,
    heard: 0,
    cooldown: 0,
    on: false,
    voiceId: c0.voiceId,
  };

  function ready() {
    return soundOn() && performance.now() / 1000 - lastAt >= c0.cooldown;
  }

  function pick(group) {
    const pool = groups[group];
    if (!pool || !pool.length) return null;
    if (pool.length === 1) return pool[0];
    let choice = pool[Math.floor(Math.random() * pool.length)];
    if (lastLine && pool.length > 1 && choice.id === lastLine.id) {
      choice = pool[(pool.indexOf(choice) + 1) % pool.length];
    }
    return choice;
  }

  function elFor(line) {
    if (!line || !line.file) return null;
    if (missing[line.file]) return null;
    let a = audioEls[line.file];
    if (!a) {
      a = new Audio(line.file);
      a.preload = "auto";
      a.addEventListener("error", () => {
        missing[line.file] = true;
      });
      audioEls[line.file] = a;
    }
    a.volume = c0.volume;
    return a;
  }

  function emit(detail) {
    if (typeof window.CustomEvent !== "function" || !window.dispatchEvent) return;
    try {
      window.dispatchEvent(new window.CustomEvent("day:voice", { detail }));
    } catch (err) {
      /* tests */
    }
  }

  /**
   * Speak a group (or a specific id). Returns the line, or null if skipped.
   * opts.force ignores chance and (optionally) cooldown when opts.ignoreCooldown.
   * opts.chance overrides the roll for this call (powers use voice.powerChance).
   */
  function say(groupOrId, opts) {
    opts = opts || {};
    const c = cfg();
    const asId = byId[groupOrId];
    const group = asId ? asId.group : groupOrId;
    const line = asId || pick(group);
    if (!line) {
      lastSkip = { reason: "empty", group, at: performance.now() / 1000 };
      live.skipped = lastSkip;
      return null;
    }
    if (!soundOn() && !opts.force) {
      lastSkip = { reason: "sound-off", group, id: line.id, at: performance.now() / 1000 };
      live.skipped = lastSkip;
      emit({ action: "skip", reason: "sound-off", group, id: line.id });
      return null;
    }
    const chance = opts.chance != null ? opts.chance : 1;
    if (!opts.force && chance < 1 && Math.random() > chance) {
      lastSkip = { reason: "chance", group, id: line.id, at: performance.now() / 1000 };
      live.skipped = lastSkip;
      emit({ action: "skip", reason: "chance", group, id: line.id });
      return null;
    }
    const now = performance.now() / 1000;
    if (!opts.ignoreCooldown && now - lastAt < c.cooldown) {
      lastSkip = { reason: "cooldown", group, id: line.id, at: now };
      live.skipped = lastSkip;
      emit({ action: "skip", reason: "cooldown", group, id: line.id });
      return null;
    }
    lastAt = now;
    lastLine = { id: line.id, group: line.group, text: line.text, file: line.file, via: opts.via || "say", at: now };
    live.last = lastLine;
    live.skipped = null;
    heard++;
    live.heard = heard;
    live.on = soundOn();
    live.cooldown = c.cooldown;

    const a = elFor(line);
    if (a && soundOn()) {
      try {
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
      } catch (err) {
        /* autoplay */
      }
    }
    emit({
      action: "play",
      id: line.id,
      group: line.group,
      text: line.text,
      file: line.file,
      via: opts.via || "say",
      voiceId: c.voiceId,
    });
    return line;
  }

  function onPower(e) {
    const d = (e && e.detail) || {};
    const power = d.power || d.action;
    if (!POWER_GROUPS.has(power)) return;
    if (d.action === "denied") return;
    say(power, { chance: cfg().powerChance, via: d.via || "power" });
  }

  function onWeather(e) {
    const d = (e && e.detail) || {};
    if (!d.state) return;
    // Power summons already bark their own line; don't double up on weather-storm.
    if (d.via === "power") return;
    say(`weather-${d.state}`, { via: d.via || "weather" });
  }

  function onControl(e) {
    const d = (e && e.detail) || {};
    if (d.action === "take") say("episode-open", { via: d.via || "control" });
    // Score-card close when he lets go (not again on "back" when he arrives).
    else if (d.action === "let-go") say("episode-close", { via: d.via || "control" });
  }

  function tick() {
    live.on = soundOn();
    live.cooldown = Math.max(0, cfg().cooldown - (performance.now() / 1000 - lastAt));
    const C = day.control;
    if (C && C.mode && C.mode() === "control" && C.state) {
      const st = C.state();
      const isFloat = !!(st.floating || st.anim === "float");
      if (isFloat && !floating) {
        floating = true;
        say("glide", { via: "float" });
      } else if (!isFloat) {
        floating = false;
      }
    } else {
      floating = false;
    }
    // Autopilot mutters while his day has him (not while the player steers).
    if (C && C.mode && C.mode() === "schedule") {
      const now = performance.now() / 1000;
      const every = cfg().dayEvery;
      if (now - dayRollAt >= every) {
        dayRollAt = now;
        if (ready()) say("day", { chance: cfg().dayChance, via: "day" });
      }
    }
  }

  window.addEventListener("day:power", onPower);
  window.addEventListener("day:weather", onWeather);
  window.addEventListener("day:control", onControl);

  let raf = 0;
  function loop() {
    tick();
    raf = requestAnimationFrame(loop);
  }
  if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(loop);

  const soundBtn = document.getElementById("sound");
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      // Warm a short line's element so the first bark isn't cold.
      const sample = c0.lines[0];
      if (sample) elFor(sample);
    });
  }

  const api = {
    now: () => ({
      last: live.last,
      skipped: live.skipped,
      heard: live.heard,
      cooldown: live.cooldown,
      on: soundOn(),
      voiceId: cfg().voiceId,
      lines: cfg().lines.length,
    }),
    say,
    play: (id, opts) => say(id, Object.assign({ force: true, ignoreCooldown: true }, opts || {})),
    groups: () => Object.keys(groups),
    lines: () => cfg().lines.slice(),
  };
  day.voice = api;
  window.voice = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) {
  startVoice(window.day);
}

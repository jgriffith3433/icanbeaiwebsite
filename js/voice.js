/* ==========================================================================
   Small Weather's voice director (DoD Eric). Data: day.config.js `voice`.
   Spoken barks (`voice.spoken`) prefer audio/dialogue/dlg-he-*.mp3 (dialogue
   table reads); older beds stay in audio/voice/*.mp3 as fallbacks.
   Rules: priority, no overlap, ~5 min per-line cooldown, slight pitch variance,
   one short caption clear of the ability bar, quiet log line. Voices mute
   (icanbe.voices) is separate from music and effects. Nothing plays until
   Sound is on and Voices is on.
   ========================================================================== */

import { lineId } from "./dialogue.js";

const POWER_GROUPS = new Set(["storm", "bolt", "gust", "tornado"]);
const CALL_GROUPS = { rain: "rain", gale: "gale", fog: "fog", sunbreak: "sunbreak" };
const ALIAS = { "episode-open": "take", "episode-close": "letgo" };
const VOICES_KEY = "icanbe.voices";

function cfg() {
  const v = (window.DAY_CONFIG && window.DAY_CONFIG.voice) || {};
  return {
    voiceId: v.voiceId || "cjVigY5qzO86Huf0OWal",
    cooldown: v.cooldown != null ? v.cooldown : 2.6,
    lineCooldown: v.lineCooldown != null ? v.lineCooldown : 300,
    pitch: v.pitch != null ? v.pitch : 0.04,
    powerChance: v.powerChance != null ? v.powerChance : 0.48,
    volume: v.volume != null ? v.volume : 0.88,
    dayEvery: v.dayEvery != null ? v.dayEvery : 90,
    dayChance: v.dayChance != null ? v.dayChance : 0.55,
    captionSecs: v.captionSecs != null ? v.captionSecs : 2.8,
    priorities: v.priorities || {},
    spoken: v.spoken && typeof v.spoken === "object" ? v.spoken : {},
    lines: Array.isArray(v.lines) ? v.lines : [],
  };
}

function soundOn() {
  const btn = document.getElementById("sound");
  return !!(btn && btn.getAttribute("aria-pressed") === "true");
}

function voicesOn() {
  try {
    const saved = localStorage.getItem(VOICES_KEY);
    if (saved === "off") return false;
  } catch (err) {
    /* private */
  }
  const btn = document.getElementById("voices");
  if (btn) return btn.getAttribute("aria-pressed") === "true";
  return true;
}

function byGroup(lines) {
  const m = Object.create(null);
  lines.forEach((L) => {
    if (!L || !L.group || !L.id) return;
    (m[L.group] || (m[L.group] = [])).push(L);
  });
  return m;
}

function priorityOf(c, group) {
  const p = c.priorities || {};
  if (p[group] != null) return p[group];
  const head = String(group).split("-")[0]; // deed-birdie, recap-flood: the group's family
  if (head !== group && p[head] != null) return p[head];
  return 10;
}

export function startVoice(dayApi) {
  const day = dayApi || window.day;
  if (!day || day.voice) return day && day.voice;

  const c0 = cfg();
  const groups = byGroup(c0.lines);
  const byId = Object.create(null);
  const byText = Object.create(null);
  c0.lines.forEach((L) => {
    if (L && L.id) byId[L.id] = L;
    if (L && L.text) byText[L.text] = L;
  });

  let lastAt = -1e9;
  let lastLine = null;
  let lastSkip = null;
  let floating = false;
  let dayRollAt = 0;
  let heard = 0;
  let playing = null;
  let playPri = 0;
  let captionTimer = 0;
  const lineAt = Object.create(null);
  const firstPower = Object.create(null);
  const audioEls = Object.create(null);
  const missing = Object.create(null);
  let dialogueFiles = new Set();
  const live = {
    last: null,
    skipped: null,
    heard: 0,
    cooldown: 0,
    on: false,
    voices: true,
    playing: false,
    caption: null,
    voiceId: c0.voiceId,
  };

  // Caption: look in the module; placement only in css/hud.css.
  const style = document.createElement("style");
  style.textContent = `
.voice-caption{z-index:36;display:flex;align-items:center;justify-content:center;gap:10px;max-width:min(88vw,28em);padding:8px 16px;border-radius:999px;background:rgba(10,13,22,.7);border:1px solid rgba(126,200,255,.32);backdrop-filter:blur(8px);color:#f6f1e8;font:600 clamp(.95rem,2.2vw,1.15rem)/1.25 Fraunces,Georgia,serif;text-shadow:0 2px 12px rgba(0,0,0,.55);pointer-events:none;opacity:1;transition:opacity .35s ease}
.voice-caption[hidden]{display:none}
.voice-caption.leaving{opacity:0}
.voice-caption span{min-width:0}
@media (max-width:700px){.voice-caption b{display:none}.voice-caption{max-width:92vw;padding:8px 14px;font-size:.92rem}.voice-caption span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
html.touch-ui .voice-caption b{display:none}
html.touch-ui .voice-caption{max-width:92vw;padding:8px 14px;font-size:.92rem}
html.touch-ui .voice-caption span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.voice-caption b{font:600 .65rem/1 Outfit,system-ui,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#7ec8ff}
.voice-caption .bust{flex:0 0 28px;width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid rgba(126,200,255,.4)}
`;
  document.head.appendChild(style);
  const caption = document.createElement("div");
  caption.id = "voice-caption";
  caption.className = "voice-caption";
  caption.hidden = true;
  caption.setAttribute("role", "status");
  caption.innerHTML = `<img class="bust" alt="" hidden/><b>Small Weather</b><span id="voice-caption-text"></span>`;
  document.body.appendChild(caption);
  const captionText = caption.querySelector("#voice-caption-text");
  const captionBust = caption.querySelector(".bust");

  const captionWho = caption.querySelector("b");
  function showCaption(text, who, secs, lead) {
    // A new player's first minute carries at most 40 words on screen (teach by doing): the cold open's one call is captioned,
    // every other voiced line in it plays without a caption until js/coldopen.js drops `first-min`.
    if (!lead && document.documentElement.classList.contains("first-min")) { live.caption = null; return; }
    if (captionTimer) clearTimeout(captionTimer);
    const name = who || "Small Weather";
    captionWho.textContent = name;
    captionText.textContent = text || "";
    const art = window.uiArt || (window.day && window.day.uiArt);
    if (art && art.bust && captionBust) {
      const src = art.bust(name);
      if (src && /pilot|birdie|dex|ines/i.test(name)) {
        captionBust.src = src;
        captionBust.hidden = false;
      } else captionBust.hidden = true;
    } else if (captionBust) captionBust.hidden = true;
    caption.hidden = false;
    caption.classList.remove("leaving");
    live.caption = text || null;
    const hold = secs != null ? secs : cfg().captionSecs;
    captionTimer = setTimeout(() => hideCaption(), Math.max(1.2, hold) * 1000);
  }
  function hideCaption() {
    if (captionTimer) clearTimeout(captionTimer);
    captionTimer = 0;
    caption.classList.add("leaving");
    setTimeout(() => {
      caption.hidden = true;
      caption.classList.remove("leaving");
    }, 360);
    live.caption = null;
  }

  function mountVoicesBtn() {
    if (document.getElementById("voices")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "voices";
    btn.className = "voices-btn";
    let on = true;
    try {
      on = localStorage.getItem(VOICES_KEY) !== "off";
    } catch (err) {
      /* private */
    }
    const paint = () => {
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.textContent = on ? "Voices on" : "Voices off";
      live.voices = on;
    };
    paint();
    btn.addEventListener("click", () => {
      on = !on;
      try {
        localStorage.setItem(VOICES_KEY, on ? "on" : "off");
      } catch (err) {
        /* private */
      }
      paint();
      if (!on) stopCurrent();
      try {
        window.dispatchEvent(new window.CustomEvent("day:voices", { detail: { value: on ? "on" : "off" } }));
      } catch (err) {
        /* tests */
      }
      btn.blur();
    });
    const pop = document.getElementById("settings-pop");
    const host = pop || document.body;
    if (host && host.appendChild) host.appendChild(btn);
  }
  if (document.body && document.body.appendChild) mountVoicesBtn();

  if (typeof fetch === "function") {
    fetch("audio/dialogue/index.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((j) => {
        dialogueFiles = new Set((j && j.files) || []);
      })
      .catch(() => {});
  }

  function resolveGroup(name) {
    return ALIAS[name] || name;
  }

  function spokenPool(group) {
    const g = resolveGroup(group);
    const pool = cfg().spoken[g];
    return Array.isArray(pool) ? pool : null;
  }

  function buildLine(group, text) {
    const g = resolveGroup(group);
    const id = lineId("He", text);
    const dlg = `audio/dialogue/${id}.mp3`;
    const fallback = byText[text];
    let file = null;
    if (dialogueFiles.has(dlg)) file = dlg;
    else if (fallback && fallback.file && !missing[fallback.file]) file = fallback.file;
    return {
      id,
      group: g,
      text,
      file,
      who: "He",
    };
  }

  function pick(group) {
    const g = resolveGroup(group);
    const spoken = spokenPool(g);
    if (spoken && spoken.length) {
      const all = spoken.map((text) => buildLine(g, text));
      const cooled = all.filter((L) => performance.now() / 1000 - (lineAt[L.id] || 0) >= cfg().lineCooldown);
      // Prefer variants that have a clip so he is heard, not only captioned.
      const withFile = (cooled.length ? cooled : all).filter((L) => L.file);
      const pool = withFile.length ? withFile : cooled.length ? cooled : all;
      if (pool.length === 1) return pool[0];
      let choice = pool[Math.floor(Math.random() * pool.length)];
      if (lastLine && pool.length > 1 && choice.id === lastLine.id) {
        choice = pool[(pool.indexOf(choice) + 1) % pool.length];
      }
      return choice;
    }
    const legacy = groups[g] || groups[group];
    if (!legacy || !legacy.length) return null;
    const ready = legacy.filter((L) => performance.now() / 1000 - (lineAt[L.id] || 0) >= cfg().lineCooldown);
    const pool = ready.length ? ready : legacy;
    let choice = pool[Math.floor(Math.random() * pool.length)];
    if (lastLine && pool.length > 1 && choice.id === lastLine.id) {
      choice = pool[(pool.indexOf(choice) + 1) % pool.length];
    }
    return { id: choice.id, group: choice.group, text: choice.text, file: choice.file, who: "He" };
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
      a.addEventListener("ended", () => {
        if (playing && playing.file === line.file) {
          playing = null;
          playPri = 0;
          live.playing = false;
          emit({ action: "end", id: line.id, group: line.group });
          drainPilot();
        }
      });
      // Route Small Weather's clips into the shared voice bus when the mix is up.
      try {
        const Mix = mixApi();
        if (Mix && typeof Mix.ctx === "function" && !a.__voiceBus) {
          if (typeof Mix.unlock === "function") Mix.unlock();
          audioCtx = Mix.ctx() || audioCtx;
          if (audioCtx) {
            const src = audioCtx.createMediaElementSource(a);
            const voiceBus = Mix.bus && Mix.bus("voice");
            src.connect((voiceBus && voiceBus.bus) || audioCtx.destination);
            a.__voiceBus = true;
          }
        }
      } catch (err) { /* plain element playback */ }
      audioEls[line.file] = a;
    }
    a.volume = cfg().volume;
    const p = cfg().pitch;
    a.playbackRate = Math.max(0.92, Math.min(1.08, 1 + (Math.random() * 2 - 1) * p));
    return a;
  }

  function stopCurrent() {
    const was = playing;
    if (playing && playing.el) {
      try {
        playing.el.pause();
      } catch (err) {
        /* already gone */
      }
    }
    playing = null;
    playPri = 0;
    live.playing = false;
    if (was) emit({ action: "end", id: was.id, group: was.group });
    if (day.pilot && day.pilot.pulse) day.pilot.pulse(false);
  }

  function emit(detail) {
    if (typeof window.CustomEvent !== "function" || !window.dispatchEvent) return;
    try {
      window.dispatchEvent(new window.CustomEvent("day:voice", { detail }));
    } catch (err) {
      /* tests */
    }
  }

  function quietNote(text) {
    if (text && day.note) day.note(text);
  }

  /**
   * Speak a group (or a specific id / spoken text). Returns the line, or null.
   * opts.force ignores chance; opts.ignoreCooldown skips the between-line gap
   * (not the per-line 5 min). Higher priority can cut in; same/lower is refused
   * while a line is playing.
   */
  function say(groupOrId, opts) {
    opts = opts || {};
    const c = cfg();
    const asId = byId[groupOrId];
    let group = asId ? asId.group : groupOrId;
    group = resolveGroup(group);
    let line = null;
    if (opts.text) line = buildLine(group, opts.text);
    else if (asId) line = { id: asId.id, group: resolveGroup(asId.group), text: asId.text, file: asId.file, who: "He" };
    else line = pick(group);
    if (!line && asId) line = pick(group);
    if (!line) {
      lastSkip = { reason: "empty", group, at: performance.now() / 1000 };
      live.skipped = lastSkip;
      return null;
    }
    if (!soundOn() && !opts.ignoreMute) {
      lastSkip = { reason: "sound-off", group, id: line.id, at: performance.now() / 1000 };
      live.skipped = lastSkip;
      emit({ action: "skip", reason: "sound-off", group, id: line.id });
      return null;
    }
    if (!voicesOn() && !opts.ignoreMute) {
      lastSkip = { reason: "voices-off", group, id: line.id, at: performance.now() / 1000 };
      live.skipped = lastSkip;
      emit({ action: "skip", reason: "voices-off", group, id: line.id });
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
    if (!opts.ignoreLineCooldown && now - (lineAt[line.id] || 0) < c.lineCooldown && lineAt[line.id]) {
      lastSkip = { reason: "line-cooldown", group, id: line.id, at: now };
      live.skipped = lastSkip;
      emit({ action: "skip", reason: "line-cooldown", group, id: line.id });
      return null;
    }
    const pri = priorityOf(c, line.group);
    // No overlap: refuse same/lower priority while something plays; a higher-priority
    // (or forced) line stops the current one first so two Audios never stack.
    if (playing && pri <= playPri && !opts.force) {
      lastSkip = { reason: "overlap", group, id: line.id, at: now };
      live.skipped = lastSkip;
      emit({ action: "skip", reason: "overlap", group, id: line.id });
      return null;
    }
    if (playing) stopCurrent();

    lastAt = now;
    lineAt[line.id] = now;
    lastLine = { id: line.id, group: line.group, text: line.text, file: line.file, via: opts.via || "say", at: now };
    live.last = lastLine;
    live.skipped = null;
    heard++;
    live.heard = heard;
    live.on = soundOn();
    live.voices = voicesOn();
    live.cooldown = c.cooldown;

    showCaption(line.text);
    quietNote(line.text);

    const a = elFor(line);
    if (a && soundOn() && voicesOn()) {
      try {
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
        playing = { ...line, el: a };
        playPri = pri;
        live.playing = true;
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
      pitch: a ? a.playbackRate : 1,
      caption: true,
    });
    return line;
  }

  /**
   * A neighbor speaks (their own Gen voice, a clip from audio/dialogue): one speaker-tagged caption, no overlap with
   * Small Weather or another neighbor (a neighbor's line takes the voice, whatever was playing), and positional:
   * quieter with distance from the camera and panned to the side they are on. opts: { x, z } (their place in the
   * world), onend (called when the clip ends, or after the caption's time when it can't play), via.
   * Returns { id, file, secs } (file null when no clip is in the build or Sound is off: the caption still shows).
   */
  let audioCtx = null;
  function mixApi() {
    return day.mix || window.mix || day.audio || null;
  }
  function placeVoice(el, opts) {
    const w = day.world && day.world();
    const cam = w && w.scene && w.scene.activeCamera;
    let gain = 1;
    let pan = 0;
    if (cam && cam.position && opts.x != null) {
      const dx = opts.x - cam.position.x;
      const dz = opts.z - cam.position.z;
      const d = Math.hypot(dx, dz);
      gain = Math.max(0.35, Math.min(1, 1.15 - d / 140));
      const fwd = cam.getForwardRay ? cam.getForwardRay(1).direction : null;
      if (fwd && d > 1) pan = Math.max(-0.85, Math.min(0.85, (dx * fwd.z - dz * fwd.x) / d)); // right of the view = +
    }
    el.volume = Math.min(1, cfg().volume * gain);
    try {
      const Mix = mixApi();
      if (Mix && typeof Mix.ctx === "function" && !el.__pan) {
        try { if (typeof Mix.unlock === "function") Mix.unlock(); } catch (e) { /* */ }
        audioCtx = Mix.ctx() || audioCtx;
        if (audioCtx) {
          const src = audioCtx.createMediaElementSource(el);
          const sp = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
          const voiceBus = Mix.bus && Mix.bus("voice");
          const dest = (voiceBus && voiceBus.bus) || audioCtx.destination;
          if (sp) { src.connect(sp); sp.connect(dest); } else src.connect(dest);
          el.__pan = sp || true;
          // Positional neighbor lines also get HRTF/occlusion when mix.place is there.
          if (opts.x != null && Mix.place) {
            try {
              const world = Mix.place(opts.x, 1.5, opts.z, { bus: "voice" });
              if (world && world.input) {
                if (sp) { try { sp.disconnect(); sp.connect(world.input); } catch (e) { /* */ } }
                else { try { src.disconnect(); src.connect(world.input); } catch (e) { /* */ } }
                el.__world = world;
              }
            } catch (e) { /* */ }
          }
        }
      } else if (!el.__pan) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          audioCtx = audioCtx || new AC();
          const src = audioCtx.createMediaElementSource(el);
          const sp = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
          if (sp) { src.connect(sp); sp.connect(audioCtx.destination); } else src.connect(audioCtx.destination);
          el.__pan = sp || true;
        }
      }
      if (el.__pan && el.__pan.pan) el.__pan.pan.value = pan;
    } catch (err) {
      /* no web audio: the volume alone carries the distance */
    }
    return { gain, pan };
  }
  function speakAs(who, text, opts) {
    opts = opts || {};
    const id = lineId(who, text);
    const file = `audio/dialogue/${id}.mp3`;
    const have = dialogueFiles.has(file) && !missing[file];
    const canPlay = have && soundOn() && voicesOn();
    if (playing) stopCurrent();
    live.last = { id, group: "neighbor-" + String(who).toLowerCase(), text, file: have ? file : null, via: opts.via || "neighbor", at: performance.now() / 1000 };
    lastAt = performance.now() / 1000;
    heard++;
    live.heard = heard;
    let secs = Math.max(2.6, Math.min(7, 1.2 + text.length * 0.055));
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (playing && playing.id === id) { playing = null; playPri = 0; live.playing = false; }
      emit({ action: "end", id, group: "neighbor", positional: true }); // js/mix.js lets the duck go
      if (opts.onend) opts.onend();
      drainPilot();
    };
    let a = null;
    if (canPlay) {
      a = audioEls[file];
      if (!a) {
        a = new Audio(file);
        a.preload = "auto";
        a.addEventListener("error", () => { missing[file] = true; });
        audioEls[file] = a;
      }
      a.onended = finish;
      a.playbackRate = 1;
    }
    const where = placeVoice(a || { volume: 1 }, opts);
    if (a) {
      try {
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(() => finish());
        playing = { id, group: live.last.group, text, file, who, el: a };
        playPri = 9;
        live.playing = true;
        if (isFinite(a.duration) && a.duration > 0) secs = a.duration + 0.4;
        else a.addEventListener("loadedmetadata", () => { if (!done && isFinite(a.duration)) showCaption(text, who, a.duration + 0.4, opts.via === "coldopen"); }, { once: true });
      } catch (err) {
        a = null;
      }
    }
    showCaption(text, who, secs, opts.via === "coldopen");
    quietNote(`${who}: ${text}`);
    if (!a) setTimeout(finish, secs * 1000);
    emit({ action: "play", id, group: live.last.group, text, file: a ? file : null, who, via: opts.via || "neighbor", positional: true, gain: +where.gain.toFixed(2), pan: +where.pan.toFixed(2), caption: true });
    return { id, file: a ? file : null, secs };
  }

  function onPower(e) {
    const d = (e && e.detail) || {};
    const power = d.power || d.action;
    if (d.action === "denied") return;
    const group = POWER_GROUPS.has(power) ? power : CALL_GROUPS[power];
    if (!group) return;
    const first = !firstPower[group];
    if (first) {
      firstPower[group] = true;
      say(group, { force: true, via: d.via || "power-first" });
      return;
    }
    say(group, { chance: cfg().powerChance, via: d.via || "power" });
  }

  function onWeather(e) {
    const d = (e && e.detail) || {};
    if (!d.state) return;
    if (d.via === "power" || d.via === "cell") return; // "cell" = the opening's storm nobody called
    say(`weather-${d.state}`, { via: d.via || "weather" });
  }

  function onControl(e) {
    const d = (e && e.detail) || {};
    if (d.action === "take" && day.coldopen && day.coldopen.active && day.coldopen.active()) return; // the opening has its own line
    if (d.action === "take") say("take", { force: true, via: d.via || "control" });
    else if (d.action === "let-go") {
      // One line naming the deed he just did (day.memory.justDid(), most telling first); the plain line when he did none.
      const deeds = (day.memory && day.memory.justDid && day.memory.justDid()) || [];
      const named = deeds.length ? say("deed-" + deeds[0], { force: true, ignoreLineCooldown: true, via: d.via || "control", deed: deeds[0] }) : null;
      if (!named) say("letgo", { force: true, via: d.via || "control" });
    }
  }

  function onNeighbor(e) {
    const d = (e && e.detail) || {};
    // One thanks bark per finished thanks beat (reward fires once with the score).
    if (d.action === "reward" && d.kind === "thanks") say("neighbor", { force: true, via: "neighbor" });
  }

  function onStory(e) {
    const d = (e && e.detail) || {};
    // Rooftop storm: the shop-roof rescue (piece "rescue" / Hollis).
    if (d.action === "help" && (d.piece === "rescue" || d.person === "hollis")) {
      say("rooftop", { force: true, via: "rooftop" });
    }
  }

  function onMoment(e) {
    const d = (e && e.detail) || {};
    // a day end with deeds speaks them itself (js/moments.js, `recap-` lines); the plain line is for the quiet day
    if ((d.moment === "day-end" || d.moment === "dayend") && (d.action === "start" || d.action === "show") && !d.deeds) {
      say("dayend", { force: true, via: "dayend" });
    }
  }

  /* The autopilot's memory steps carry a `say` (day.config.js, a step with `remembers`): he says it as the step starts,
     at a pace a person could hear (not while the clock races or is paused, nor after a jump into the middle of it). */
  let sayKey = "";
  function memoryStep() {
    const n = day.now && day.now();
    const a = n && n.frame && n.frame.action;
    if (!a || !a.say) return;
    const k = n.key + ":" + a.i;
    if (k === sayKey) return;
    sayKey = k;
    if (n.mode === "pause" || n.speed > 60 || n.minutes - a.start > 0.6) return;
    say("memory", { text: a.say, ignoreCooldown: true, via: "memory" });
  }

  function tick() {
    live.on = soundOn();
    live.voices = voicesOn();
    live.cooldown = Math.max(0, cfg().cooldown - (performance.now() / 1000 - lastAt));
    live.playing = !!playing;
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
    if (C && C.mode && C.mode() === "schedule") {
      memoryStep();
      const now = performance.now() / 1000;
      const every = cfg().dayEvery;
      if (now - dayRollAt >= every) {
        dayRollAt = now;
        if (soundOn() && voicesOn() && now - lastAt >= cfg().cooldown) {
          say("idle", { chance: cfg().dayChance, via: "idle" }) || say("day", { chance: cfg().dayChance, via: "day" });
        }
      }
    }
  }

  window.addEventListener("day:power", onPower);
  window.addEventListener("day:weather", onWeather);
  window.addEventListener("day:control", onControl);
  window.addEventListener("day:neighbor", onNeighbor);
  window.addEventListener("day:story", onStory);
  window.addEventListener("day:moment", onMoment);

  let raf = 0;
  function loop() {
    tick();
    raf = requestAnimationFrame(loop);
  }
  if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(loop);

  const soundBtn = document.getElementById("sound");
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      const sample = c0.lines[0];
      if (sample) elFor(sample);
      if (!soundOn()) stopCurrent();
    });
  }

  /* Pilot (day.config.js `pilot`): calm AI lines, radio-filtered, caption labelled Pilot.
     Never talks over Small Weather or a neighbor: waits until the channel is free, then holds it. */
  let audioCtxPilot = null;
  const pilotQueue = [];
  function drainPilot() {
    if (playing || !pilotQueue.length) return;
    const next = pilotQueue.shift();
    if (next) next();
  }
  function wireRadio(el, radio) {
    try {
      if (el.__radio) return;
      const Mix = mixApi();
      if (Mix && typeof Mix.ctx === "function") {
        try { if (typeof Mix.unlock === "function") Mix.unlock(); } catch (e) { /* */ }
        audioCtxPilot = Mix.ctx() || audioCtxPilot;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxPilot && AC) audioCtxPilot = new AC();
      if (!audioCtxPilot) return;
      const src = audioCtxPilot.createMediaElementSource(el);
      const hp = audioCtxPilot.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = (radio && radio.highpass) || 520;
      const lp = audioCtxPilot.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = (radio && radio.lowpass) || 2900;
      const g = audioCtxPilot.createGain();
      g.gain.value = 1;
      src.connect(hp);
      hp.connect(lp);
      lp.connect(g);
      const voiceBus = Mix && Mix.bus && Mix.bus("voice");
      g.connect((voiceBus && voiceBus.bus) || audioCtxPilot.destination);
      el.__radio = { hp, lp, g };
    } catch (err) {
      /* no web audio: plain playback */
    }
  }
  /**
   * Speak a Pilot line. opts: { via, force, queue (default true), onend, radio }.
   * Returns the line once playback starts, or null if refused / Voices off.
   */
  function speakPilot(line, opts) {
    opts = opts || {};
    if (!line || !line.text) return null;
    if (!voicesOn()) return null;
    const run = () => {
      if (playing) {
        if (opts.queue !== false) pilotQueue.push(run);
        return;
      }
      const radio = opts.radio || ((window.DAY_CONFIG && window.DAY_CONFIG.pilot && window.DAY_CONFIG.pilot.radio) || {});
      const file = line.file;
      const have = file && !missing[file];
      const canPlay = have && soundOn() && voicesOn();
      let secs = Math.max(2.2, Math.min(6.5, 1.1 + line.text.length * 0.05));
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (playing && playing.id === line.id) {
          playing = null;
          playPri = 0;
          live.playing = false;
        }
        if (day.pilot && day.pilot.pulse) day.pilot.pulse(false);
        emit({ action: "end", id: line.id, group: "pilot" }); // js/mix.js lets the duck go
        if (opts.onend) opts.onend();
        drainPilot();
      };
      live.last = {
        id: line.id,
        group: "pilot-" + (line.group || "line"),
        text: line.text,
        file: have ? file : null,
        who: "Pilot",
        via: opts.via || "pilot",
        at: performance.now() / 1000,
      };
      lastAt = performance.now() / 1000;
      heard++;
      live.heard = heard;
      let a = null;
      if (canPlay) {
        a = audioEls[file];
        if (!a) {
          a = new Audio(file);
          a.preload = "auto";
          a.addEventListener("error", () => {
            missing[file] = true;
          });
          audioEls[file] = a;
        }
        a.onended = finish;
        a.playbackRate = 1;
        a.volume = Math.min(1, (window.DAY_CONFIG && window.DAY_CONFIG.pilot && window.DAY_CONFIG.pilot.volume) || 0.8);
        wireRadio(a, radio);
      }
      showCaption(line.text, "Pilot", secs);
      quietNote(`Pilot: ${line.text}`);
      if (day.pilot && day.pilot.pulse) day.pilot.pulse(true);
      if (a) {
        try {
          a.currentTime = 0;
          const p = a.play();
          if (p && p.catch) p.catch(() => finish());
          playing = { id: line.id, group: live.last.group, text: line.text, file, who: "Pilot", el: a };
          playPri = 85;
          live.playing = true;
          if (isFinite(a.duration) && a.duration > 0) secs = a.duration + 0.35;
        } catch (err) {
          a = null;
        }
      }
      if (!a) setTimeout(finish, secs * 1000);
      emit({
        action: "play",
        id: line.id,
        group: live.last.group,
        text: line.text,
        file: a ? file : null,
        who: "Pilot",
        via: opts.via || "pilot",
        radio: true,
        caption: true,
      });
    };
    if (playing && opts.queue !== false) {
      pilotQueue.push(run);
      return line;
    }
    run();
    return line;
  }

  const api = {
    now: () => ({
      last: live.last,
      skipped: live.skipped,
      heard: live.heard,
      cooldown: live.cooldown,
      on: soundOn(),
      voices: voicesOn(),
      playing: !!playing,
      caption: live.caption,
      voiceId: cfg().voiceId,
      lines: cfg().lines.length,
      spoken: Object.keys(cfg().spoken).length,
      who: playing && playing.who ? playing.who : live.last && live.last.who ? live.last.who : null,
    }),
    say,
    speakAs,
    speakPilot,
    play: (id, opts) => say(id, Object.assign({ force: true, ignoreCooldown: true, ignoreLineCooldown: true }, opts || {})),
    groups: () => Object.keys(Object.assign({}, groups, cfg().spoken)),
    lines: () => cfg().lines.slice(),
    spoken: () => cfg().spoken,
    voices(on) {
      const btn = document.getElementById("voices");
      if (typeof on === "boolean" && btn) {
        const cur = btn.getAttribute("aria-pressed") === "true";
        if (cur !== on) btn.click();
      }
      return voicesOn();
    },
    stop: stopCurrent,
  };
  day.voice = api;
  window.voice = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) {
  startVoice(window.day);
}

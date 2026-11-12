/* ==========================================================================
   Pilot — the calm, dry AI that runs Small Weather's day (the "AI" in I Can Be).
   Data: day.config.js `pilot`. Speaks through js/voice.js `speakPilot` (never over
   him). Diegetic: a soft holographic ring on his left wrist that pulses with voice.
   Triggers: schedule block changes, take-over, let-go (names a deed), chaos, night.
   ========================================================================== */

function cfg() {
  const p = (window.DAY_CONFIG && window.DAY_CONFIG.pilot) || {};
  return {
    voiceId: p.voiceId || null,
    volume: p.volume != null ? p.volume : 0.8,
    captionSecs: p.captionSecs != null ? p.captionSecs : 2.6,
    cooldown: p.cooldown != null ? p.cooldown : 1.4,
    lineCooldown: p.lineCooldown != null ? p.lineCooldown : 120,
    radio: p.radio || { highpass: 520, lowpass: 2900 },
    ring: p.ring || { radius: 0.03, tube: 0.007, emissive: [0.35, 0.9, 1.25], idle: 0.35, talk: 1.15 },
    schedule: p.schedule && typeof p.schedule === "object" ? p.schedule : {},
    take: Array.isArray(p.take) ? p.take : [],
    letgo: p.letgo && typeof p.letgo === "object" ? p.letgo : {},
    worried: Array.isArray(p.worried) ? p.worried : [],
    night: Array.isArray(p.night) ? p.night : [],
    lines: Array.isArray(p.lines) ? p.lines : [],
  };
}

export function startPilot(dayApi) {
  const day = dayApi || window.day;
  if (!day || day.pilot) return day && day.pilot;

  const byText = Object.create(null);
  const byId = Object.create(null);
  const byGroup = Object.create(null);
  cfg().lines.forEach((L) => {
    if (!L || !L.id) return;
    byId[L.id] = L;
    if (L.text) byText[L.text] = L;
    const g = L.group || "line";
    (byGroup[g] || (byGroup[g] = [])).push(L);
  });

  let lastAt = -1e9;
  let lastBlock = "";
  let lastLineId = null;
  let talking = false;
  let pulseWant = 0;
  let pulseLevel = 0;
  let ring = null;
  let ringMat = null;
  let ringHand = null;
  let heard = 0;
  let distinct = [];
  let overlaps = 0;
  let lastNightAt = -1e9;
  let chaosAt = -1e9;
  let powersInSession = 0;
  const lineAt = Object.create(null);
  const live = {
    last: null,
    heard: 0,
    talking: false,
    ring: false,
    voiceId: cfg().voiceId,
    distinct: 0,
    overlaps: 0,
  };

  function emit(detail) {
    if (typeof window.CustomEvent !== "function" || !window.dispatchEvent) return;
    try {
      window.dispatchEvent(new window.CustomEvent("day:pilot", { detail }));
    } catch (err) {
      /* tests */
    }
  }

  function lineForText(text, group) {
    if (!text) return null;
    if (byText[text]) return byText[text];
    return {
      id: "pilot-ad-hoc-" + String(text).slice(0, 24).replace(/\W+/g, "-"),
      group: group || "line",
      text,
      file: null,
    };
  }

  function pickGroup(group) {
    const pool = byGroup[group] || [];
    if (!pool.length) return null;
    const now = performance.now() / 1000;
    const cooled = pool.filter((L) => now - (lineAt[L.id] || 0) >= cfg().lineCooldown);
    const use = cooled.length ? cooled : pool;
    let choice = use[Math.floor(Math.random() * use.length)];
    if (lastLineId && use.length > 1 && choice.id === lastLineId) {
      choice = use[(use.indexOf(choice) + 1) % use.length];
    }
    return choice;
  }

  /* Soft radio click so the channel opens even before Gen clips land (synth, no file). */
  function radioChirp() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const sb = document.getElementById("sound");
      if (!sb || sb.getAttribute("aria-pressed") !== "true") return; // respects the Sound setting
      const Mx = window.mix;
      let mixBus = null;
      if (!audioChirpCtx && Mx && Mx.ctx && Mx.bus) { try { audioChirpCtx = Mx.ctx(); mixBus = Mx.bus("voice"); } catch (e) { audioChirpCtx = null; } }
      const ctx = audioChirpCtx || (audioChirpCtx = new AC());
      if (!mixBus && Mx && Mx.ctx && Mx.ctx() === ctx) mixBus = Mx.bus("voice");
      if (ctx.state === "suspended" && ctx.resume) ctx.resume();
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1400;
      f.Q.value = 2.2;
      o.type = "triangle";
      o.frequency.setValueAtTime(1800 * (1 + (Math.random() - 0.5) * 0.06), t0);
      o.frequency.exponentialRampToValueAtTime(700, t0 + 0.05);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.045, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
      o.connect(f);
      f.connect(g);
      g.connect(mixBus && mixBus.bus ? mixBus.bus : ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.08);
    } catch (err) {
      /* silent */
    }
  }
  let audioChirpCtx = null;

  function speak(line, opts) {
    opts = opts || {};
    if (!line) return null;
    const V = day.voice;
    if (!V || !V.speakPilot) return null;
    const now = performance.now() / 1000;
    if (!opts.force && now - lastAt < cfg().cooldown) return null;
    // Never stack with him: speakPilot queues; we still refuse if he is mid-bark and we asked not to wait.
    if (V.now().playing && V.now().who && V.now().who !== "Pilot" && opts.skipIfBusy) {
      overlaps += 1;
      live.overlaps = overlaps;
      emit({ action: "skip", reason: "busy", id: line.id, text: line.text });
      return null;
    }
    ensureRing();
    radioChirp();
    const played = V.speakPilot(line, {
      via: opts.via || "pilot",
      radio: cfg().radio,
      queue: opts.queue !== false,
      onend: () => {
        talking = false;
        live.talking = false;
        pulseWant = 0;
      },
    });
    if (!played) return null;
    lastAt = now;
    lineAt[line.id] = now;
    lastLineId = line.id;
    talking = true;
    live.talking = true;
    live.last = { id: line.id, group: line.group, text: line.text, via: opts.via || "pilot", at: now };
    heard += 1;
    live.heard = heard;
    if (!distinct.includes(line.id)) distinct.push(line.id);
    live.distinct = distinct.length;
    pulseWant = 1;
    emit({
      action: "play",
      id: line.id,
      group: line.group,
      text: line.text,
      via: opts.via || "pilot",
      deed: opts.deed || null,
      block: opts.block || null,
    });
    return line;
  }

  function saySchedule(blockTitle) {
    const text = cfg().schedule[blockTitle];
    if (!text) return null;
    return speak(lineForText(text, "schedule"), { via: "schedule", force: true, block: blockTitle });
  }

  function sayTake(via) {
    const line = pickGroup("take") || lineForText(cfg().take[0], "take");
    return speak(line, { via: via || "take", force: true, queue: true });
  }

  function sayLetGo(via) {
    const deeds = (day.memory && day.memory.justDid && day.memory.justDid()) || [];
    const deed = deeds[0] || null;
    const map = cfg().letgo;
    const text = (deed && map[deed]) || map.default || "Back on schedule. I'll catch him up.";
    const line = byText[text] || lineForText(text, "letgo");
    const played = speak(line, { via: via || "let-go", force: true, queue: true, deed: deed || "default" });
    // World-agency beat: a bright ring flash + log cue toward the next spine block.
    pulseWant = 1.4;
    const fr = day.now && day.now().frame;
    const next = day.today && day.today().blocks && fr
      ? day.today().blocks.find((b) => b.start > (day.now().minutes || 0) + 1e-6)
      : null;
    if (next && day.note) day.note(`Pilot: next — ${next.title}`);
    emit({ action: "handoff", deed: deed || "default", next: next ? next.title : null });
    return played;
  }

  function sayWorried(via) {
    const now = performance.now() / 1000;
    if (now - chaosAt < 18) return null;
    chaosAt = now;
    const line = pickGroup("worried");
    return speak(line, { via: via || "worried", force: true, queue: true });
  }

  function sayNight() {
    const now = performance.now() / 1000;
    if (now - lastNightAt < 90) return null;
    lastNightAt = now;
    const line = pickGroup("night");
    return speak(line, { via: "night", force: true, queue: true });
  }

  /* -------- wrist ring (emissive torus on LeftHand) -------- */
  function findHand(scene) {
    if (!scene || !scene.transformNodes) return null;
    const nodes = scene.transformNodes;
    const prefer = [/LeftHand$/i, /:LeftHand$/i, /Hand_L$/i, /hand_l$/i, /Left_Hand$/i];
    for (let i = 0; i < prefer.length; i++) {
      const n = nodes.find((t) => prefer[i].test(t.name || ""));
      if (n) return n;
    }
    return nodes.find((t) => /Left.*Hand/i.test(t.name || "")) || null;
  }

  function figureWrist(w) {
    // Invisible figure frame: a TransformNode near the left hand height so the ring shows before the GLB attaches.
    if (!w || !w.person) return null;
    const B = window.BABYLON;
    const scene = w.scene;
    if (!B || !scene) return null;
    let n = scene.getTransformNodeByName && scene.getTransformNodeByName("pilot-wrist-fallback");
    if (n) return n;
    n = new B.TransformNode("pilot-wrist-fallback", scene);
    n.parent = w.person;
    n.position = new B.Vector3(-0.22, 1.05, 0.05);
    return n;
  }

  function ensureRing() {
    if (ring && !ring.isDisposed()) {
      // Reparent onto the real hand once the model loads.
      const w = day.world && day.world();
      const scene = w && w.scene;
      const hand = scene && findHand(scene);
      if (hand && ringHand !== hand) {
        ring.parent = hand;
        ringHand = hand;
        ring.position.set(0, -0.012, 0.01);
      }
      return ring;
    }
    const w = day.world && day.world();
    const scene = w && w.scene;
    const B = window.BABYLON;
    if (!scene || !B) return null;
    const hand = findHand(scene) || figureWrist(w);
    if (!hand) return null;
    ringHand = hand;
    const r = cfg().ring;
    ring = B.MeshBuilder.CreateTorus(
      "pilot-ring",
      { diameter: (r.radius || 0.03) * 2, thickness: r.tube || 0.007, tessellation: 24 },
      scene
    );
    ring.isPickable = false;
    ring.parent = hand;
    ring.rotation.x = Math.PI / 2;
    ring.position = new B.Vector3(0, -0.012, 0.01);
    ringMat = new B.StandardMaterial("pilot-ring-mat", scene);
    ringMat.disableLighting = true;
    const em = r.emissive || [0.35, 0.9, 1.25];
    ringMat.emissiveColor = new B.Color3(em[0], em[1], em[2]);
    ringMat.alpha = 0.85;
    ring.material = ringMat;
    ring.scaling.setAll(1);
    try {
      const glow = scene.getGlowLayerByName && scene.getGlowLayerByName("glow");
      if (glow && glow.addIncludedOnlyMesh) glow.addIncludedOnlyMesh(ring);
    } catch (err) {
      /* no glow layer */
    }
    live.ring = true;
    return ring;
  }

  function pulse(on) {
    pulseWant = on ? 1 : 0;
    talking = !!on;
    live.talking = talking;
  }

  function stepRing(dt) {
    ensureRing();
    if (!ring || !ringMat) return;
    const r = cfg().ring;
    const target = pulseWant > 0.5 ? r.talk != null ? r.talk : 1.15 : r.idle != null ? r.idle : 0.35;
    pulseLevel += (target - pulseLevel) * (1 - Math.exp(-10 * Math.max(0.001, dt)));
    const flicker = talking ? 0.08 * Math.sin(performance.now() / 70) : 0.02 * Math.sin(performance.now() / 400);
    const k = Math.max(0.15, pulseLevel + flicker);
    const em = r.emissive || [0.35, 0.9, 1.25];
    ringMat.emissiveColor.set(em[0] * k, em[1] * k, em[2] * k);
    ring.scaling.setAll(0.92 + 0.12 * k);
    ring.setEnabled(true);
  }

  /* -------- triggers -------- */
  function onControl(e) {
    const d = (e && e.detail) || {};
    if (d.action === "take") {
      if (day.coldopen && day.coldopen.active && day.coldopen.active()) return;
      powersInSession = 0;
      sayTake(d.via || "control");
    } else if (d.action === "let-go") {
      sayLetGo(d.via || "control");
    }
  }

  function onPower(e) {
    const d = (e && e.detail) || {};
    if (d.action === "denied") return;
    const power = d.power || d.action;
    if (!power) return;
    powersInSession += 1;
    if (power === "tornado" || power === "storm" || powersInSession >= 6) {
      sayWorried(d.via || "power");
    }
  }

  function tick() {
    const fr = day.now && day.now().frame;
    const a = fr && fr.action;
    const block = a && a.block;
    const C = day.control;
    const mode = C && C.mode ? C.mode() : "schedule";
    if (block && block !== lastBlock) {
      lastBlock = block;
      if (mode === "schedule") saySchedule(block);
    }
    const minutes = day.now && day.now().minutes;
    if (mode === "schedule" && minutes != null) {
      const hour = (minutes / 60) % 24;
      if ((hour >= 22 || hour < 5) && cfg().night.length) sayNight();
    }
    /* Overlap sensor: if both Pilot and he claim the channel at once, count it. */
    const V = day.voice;
    if (V && V.now && talking && V.now().playing && V.now().who && V.now().who !== "Pilot") {
      overlaps += 1;
      live.overlaps = overlaps;
      emit({ action: "overlap", who: V.now().who, pilot: live.last && live.last.id });
    }
  }

  let lastMs = performance.now();
  let raf = 0;
  function loop() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastMs) / 1000);
    lastMs = now;
    tick();
    stepRing(dt);
    raf = requestAnimationFrame(loop);
  }
  if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(loop);

  window.addEventListener("day:control", onControl);
  window.addEventListener("day:power", onPower);

  const api = {
    now: () => ({
      last: live.last,
      heard: live.heard,
      talking: live.talking,
      ring: !!(ring && !ring.isDisposed()),
      pulse: +pulseLevel.toFixed(2),
      voiceId: cfg().voiceId,
      lines: cfg().lines.length,
      distinct: live.distinct,
      overlaps: live.overlaps,
      block: lastBlock || null,
    }),
    say: (group, opts) => {
      if (group === "take") return sayTake(opts && opts.via);
      if (group === "letgo" || group === "let-go") return sayLetGo(opts && opts.via);
      if (group === "worried") return sayWorried(opts && opts.via);
      if (group === "night") return sayNight();
      if (group === "schedule" && opts && opts.block) return saySchedule(opts.block);
      const line = pickGroup(group);
      return speak(line, opts);
    },
    speak,
    pulse,
    lines: () => cfg().lines.slice(),
    schedule: () => Object.assign({}, cfg().schedule),
  };
  day.pilot = api;
  window.pilot = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) {
  startPilot(window.day);
}

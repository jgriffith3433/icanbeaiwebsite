import { buildFigure, detectAnimProblems, FOOT_SLIDE_LIMIT } from "./peoplekit.js";
/* ==========================================================================
   Neighbors — three people on his avenue with their own look, home and day
   (day.config.js `neighbors`). Each has an ask (answer it with an ability, close by),
   a thank-you and a surprise, shown as speech bubbles. Beats trigger by the clock and by
   how close he is; a finished beat pays score and Pressure and shows it (toast, stars on
   the name tag, a floating +score, the tally). Figures come from js/peoplekit.js (docs/characters.md);
   their limbs are driven procedurally (stride from route speed, beat gestures, weather posture).
   Pure helpers are exported for scripts/check-neighbors.mjs.
   ========================================================================== */

/** Is hour `h` in [from, to]? from > to wraps past midnight. No window = always. */
export function inWindow(h, from, to) {
  if (from == null || to == null) return true;
  return from <= to ? h >= from && h <= to : h >= from || h <= to;
}

/** Hour of day (0..24) of a day-minute (the day runs 7:30 to 7:30). */
export function hourOf(minutes) {
  return (((minutes % 1440) + 1440) % 1440) / 60;
}

const WALK_M_PER_MIN = 80; // sim metres per sim minute for the walks between stops
const PERSONALITY = { birdie: "plants", dex: "phone", quill: "scope" };

/** Where a neighbor is at hour h: { x, z, moving, inside, sit, yaw }. `stops` are [hour, x, z, "inside"|"sit"?]. */
export function placeAt(stops, h) {
  let i = 0;
  for (let k = 0; k < stops.length; k++) if (stops[k][0] <= h) i = k;
  const a = stops[i];
  const b = stops[(i + 1) % stops.length];
  const bh = b[0] > a[0] ? b[0] : b[0] + 24;
  const dist = Math.hypot(b[1] - a[1], b[2] - a[2]);
  const dur = Math.min(Math.max(0.3, dist / WALK_M_PER_MIN) / 60, (bh - a[0]) * 0.8); // hours
  const leave = bh - dur;
  const hh = h < a[0] ? h + 24 : h;
  if (dist < 0.01 || hh < leave) {
    return {
      x: a[1],
      z: a[2],
      moving: false,
      inside: a[3] === "inside",
      sit: a[3] === "sit",
      yaw: null,
    };
  }
  const f = Math.min(1, Math.max(0, (hh - leave) / dur));
  return {
    x: a[1] + (b[1] - a[1]) * f,
    z: a[2] + (b[2] - a[2]) * f,
    moving: f < 1,
    inside: false,
    sit: false,
    yaw: Math.atan2(b[1] - a[1], b[2] - a[2]),
  };
}

function install() {
  const day = window.day;
  const cfg = window.DAY_CONFIG && window.DAY_CONFIG.neighbors;
  const world = day && day.world && day.world();
  const B = window.BABYLON;
  if (!day || !cfg || !world || !world.scene || !B) return null;
  const L = cfg.lines || {};
  const scene = world.scene;
  const people = cfg.list || [];
  const key = cfg.storageKey || "icanbe.neighbors";

  /* ---- state: beats are per day; the score is for good ---- */
  let total = 0;
  try { total = (JSON.parse(localStorage.getItem(key)) || {}).score | 0; } catch (e) { /* private mode */ }
  let dayKey = null;
  const st = {}; // id -> { stage, askOpen, askAt, shown: [{beat, until}], missed }
  const fresh = () => people.forEach((p) => (st[p.id] = { stage: 0, doneBeats: [], bubble: null, bubbleUntil: 0, thanksAt: 0, askOpen: false, remembered: false }));
  fresh();
  let dayScore = 0;
  const events = [];
  function emit(action, detail) {
    events.push(Object.assign({ action, t: performance.now() }, detail));
    if (events.length > 60) events.shift();
    try { window.dispatchEvent(new window.CustomEvent("day:neighbor", { detail: Object.assign({ action }, detail) })); } catch (e) { /* node */ }
  }

  /* ---- figures + animation detectors ---- */
  const animStats = { footSlide: 0, mismatch: 0, samples: 0, dayKey: null };
  people.forEach((p) => {
    const fig = buildFigure(B, scene, p.id, p.look, p.scale || 1);
    p.__fig = fig;
    p.__root = fig.root;
    p.__meshes = fig.meshes;
    p.__legLen = fig.legLen;
    p.__pos = { x: p.stops[0][1], z: p.stops[0][2], inside: false, moving: false, sit: false };
    p.__yaw = 0;
    p.__sample = null;
    p.__gestureWant = null;
  });

  /* ---- DOM: tags, bubbles, toast, tally, the finder panel ---- */
  const style = document.createElement("style");
  style.textContent = `
.nb-layer{z-index:9;pointer-events:none;overflow:hidden;font-family:Outfit,system-ui,sans-serif}
.nb-tag{position:absolute;transform:translate(-50%,-100%);text-align:center;white-space:nowrap;transition:opacity .2s}
.nb-name{display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(10,14,22,.78);border:2px solid var(--nb,#f0c27a);color:#f6f1e8;font:700 0.74rem Outfit,system-ui,sans-serif}
.nb-name b{color:var(--nb,#f0c27a);margin-left:6px;letter-spacing:1px}
.nb-bubble{position:relative;display:block;margin:0 auto 8px;max-width:250px;width:max-content;padding:9px 13px;border-radius:14px;background:#f6f1e8;color:#1a1c22;font:600 0.82rem/1.3 Outfit,system-ui,sans-serif;white-space:normal;text-align:left;box-shadow:0 8px 22px rgba(0,0,0,.4)}
.nb-bubble:after{content:"";position:absolute;left:50%;bottom:-7px;margin-left:-7px;border:7px solid transparent;border-bottom:0;border-top-color:#f6f1e8}
.nb-bubble[hidden]{display:none}
.nb-bubble.ask{border:2px solid var(--nb,#f0c27a)}
.nb-bubble small{display:block;margin-top:4px;color:#6a5a2a;font-weight:700}
.nb-plus{position:absolute;transform:translate(-50%,-100%);color:#f0c27a;font:800 1.15rem Outfit,system-ui,sans-serif;text-shadow:0 2px 6px #000;animation:nbPlus 2.2s ease-out forwards}
@keyframes nbPlus{from{opacity:1;margin-top:0}to{opacity:0;margin-top:-70px}}
.nb-btn{z-index:7;appearance:none;border:1px solid rgba(246,241,232,.22);background:rgba(14,16,22,.62);color:#f6f1e8;border-radius:14px;padding:10px 16px;font:600 0.84rem Outfit,system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(12px)}
.nb-btn:hover{background:rgba(240,194,122,.16)}
.preview-public .nb-btn,html.touch-ui .nb-btn{display:none}
.nb-panel{z-index:7;width:min(300px,calc(100vw - 36px));background:rgba(10,14,22,.82);border:1px solid rgba(240,194,122,.4);border-radius:16px;padding:12px 14px;color:#e7eef8;font:600 0.78rem/1.35 Outfit,system-ui,sans-serif;backdrop-filter:blur(14px)}
.nb-panel[hidden]{display:none}
.nb-panel h3{margin:0 0 8px;font-size:0.95rem}
.nb-panel .row{display:flex;gap:8px;align-items:center;margin:6px 0}
.nb-panel .dot{flex:0 0 12px;height:12px;border-radius:50%}
.nb-panel .row small{display:block;color:rgba(231,238,248,.62);font-weight:500}
.nb-panel .stars{margin-left:auto;color:#f0c27a;letter-spacing:1px}
.nb-panel .tally{margin-top:8px;color:#f0c27a}
.nb-toast{z-index:9;transform:translate(-50%,-8px);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;padding:10px 18px;border-radius:999px;background:rgba(14,16,22,.92);border:1px solid #f0c27a;color:#f6f1e8;font:600 0.95rem Outfit,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4);white-space:nowrap;max-width:calc(100vw - 24px)}
.nb-toast.on{opacity:1;transform:translate(-50%,0)}
`;
  document.head.appendChild(style);
  const layer = document.createElement("div");
  layer.id = "neighbors";
  layer.className = "nb-layer";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "neighbors-btn";
  btn.className = "nb-btn";
  btn.textContent = L.open || "Neighbors";
  const panel = document.createElement("div");
  panel.id = "neighbors-panel";
  panel.className = "nb-panel";
  panel.hidden = true;
  const toast = document.createElement("div");
  toast.id = "neighbor-toast";
  toast.className = "nb-toast";
  toast.setAttribute("role", "status");
  (document.getElementById("hud-left") || document.body).append(btn);
  document.body.append(layer, panel, toast);
  btn.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
  });
  people.forEach((p) => {
    const tag = document.createElement("div");
    tag.className = "nb-tag";
    tag.id = "nb-" + p.id;
    tag.style.setProperty("--nb", p.color);
    tag.innerHTML = `<span class="nb-bubble" hidden></span><span class="nb-name">${p.name}<b></b></span>`;
    layer.appendChild(tag);
    p.__tag = tag;
    p.__bubble = tag.querySelector(".nb-bubble");
    p.__stars = tag.querySelector("b");
  });

  let toastTimer = 0;
  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("on"), 4200);
  }

  const FADE_NEAR = 0.6; // m from the camera: fully faded
  const FADE_FAR = 1.4; // m from the camera: fully drawn
  const PERSONAL = 1.1; // m between the player's centre and a neighbor's drawn centre

  /* ---- who is where ---- */
  const hero = () => {
    const C = day.control;
    if (C && C.mode && C.mode() !== "schedule") {
      // control and the walk back are both drawn from the controller's own position
      const s = C.state();
      return { x: s.x, z: s.z, y: s.y };
    }
    const fr = day.now && day.now().frame;
    return fr && fr.person ? { x: fr.person.x, z: fr.person.z, y: 0 } : null;
  };
  const distTo = (p, h) => (h ? Math.hypot(p.__pos.x - h.x, p.__pos.z - h.z) : 1e9);
  const stars = (p) => {
    const n = (p.beats || []).length;
    const d = st[p.id].doneBeats.length;
    return "★".repeat(d) + "☆".repeat(Math.max(0, n - d));
  };

  /* ---- beats ---- */
  function grant(p, beat) {
    const r = beat.reward;
    if (!r) return;
    total += r.score | 0;
    dayScore += r.score | 0;
    try { localStorage.setItem(key, JSON.stringify({ score: total })); } catch (e) { /* private mode */ }
    const A = (window.powers || day.powers || {}).abilities;
    if (A && A.reset && r.pressure) {
      const cur = (A.now && A.now().energy) || 0;
      const max = (A.now && A.now().max) || 100;
      A.reset(Math.min(max, cur + r.pressure));
    }
    const text = String(L.reward || "{name}: +{score} {label}")
      .replace("{name}", p.name.split(" ")[0])
      .replace("{score}", String(r.score))
      .replace("{label}", r.label || "");
    showToast(text);
    if (day.note) day.note(`${p.name}: ${beat.text}`);
    if (day.note) day.note(text);
    // a floating +score over them
    const plus = document.createElement("div");
    plus.className = "nb-plus";
    plus.textContent = "+" + r.score;
    plus.style.left = (p.__sx || window.innerWidth / 2) + "px";
    plus.style.top = (p.__sy || window.innerHeight / 2) + "px";
    layer.appendChild(plus);
    setTimeout(() => plus.remove(), 2400);
    emit("reward", { id: p.id, beat: beat.id, kind: beat.kind, score: r.score, pressure: r.pressure, total, dayScore });
    renderPanel();
  }
  function finish(p, beat, inChain) {
    const s = st[p.id];
    s.doneBeats.push(beat.id);
    if (inChain) s.stage++;
    s.askOpen = false;
    emit("beat-done", { id: p.id, beat: beat.id, kind: beat.kind });
    grant(p, beat);
  }
  function say(p, beat, secs) {
    const s = st[p.id];
    // Spoken through js/voice.js (their own voice, from where they stand, one caption tagged with their name; never over
    // Small Weather): the bubble then keeps only the verb chip of an ask, not the words.
    const V = day.voice;
    const spoken = !!(V && V.speakAs);
    if (spoken) V.speakAs(p.name.split(" ")[0], beat.text, { x: p.__pos.x, z: p.__pos.z, via: "neighbor-" + beat.kind });
    s.bubble = Object.assign({}, beat, { spoken });
    s.bubbleUntil = beat.kind === "ask" ? Infinity : performance.now() + secs * 1000;
    // ask / thanks / surprise each play their own gesture on the figure
    if (beat.kind === "ask" || beat.kind === "thanks" || beat.kind === "surprise") {
      p.__gestureWant = beat.kind;
      emit("gesture", { id: p.id, kind: beat.kind, beat: beat.id, x: p.__pos.x, z: p.__pos.z });
    }
    emit("beat", { id: p.id, beat: beat.id, kind: beat.kind, text: beat.text, x: p.__pos.x, z: p.__pos.z, positional: spoken });
  }

  function stepBeats(p, h, here, nowMs) {
    const s = st[p.id];
    if (s.bubble && s.bubble.kind !== "ask" && nowMs > s.bubbleUntil) s.bubble = null;
    if (p.__pos.inside) return;
    const near = distTo(p, here) < (cfg.near || 9);
    const beats = p.beats || [];
    // what he remembers (day.memory facts, today and yesterday): a voiced greeting the first time he walks up each day,
    // `helped` after he answered their ask, `botched` after he left it; not while an ask of theirs is open or answered today
    const rem = p.remember;
    if (rem && near && !s.remembered && !s.askOpen && !s.thanksAt && !s.bubble && !s.doneBeats.includes(`${p.id}-ask`)) {
      const f = (day.memory && day.memory.facts && day.memory.facts()) || {};
      const tone = f[`answered.${p.id}`] ? "helped" : f[`botched.${p.id}`] ? "botched" : null;
      if (tone && rem[tone]) {
        s.remembered = true;
        say(p, { id: `${p.id}-remember-${tone}`, kind: "remember", text: rem[tone] }, 7);
        p.__gestureWant = tone === "helped" ? "thanks" : null; // a wave for the ones he helped
        emit("remember", { id: p.id, tone });
        return;
      }
    }
    // the surprise has its own window and needs only the clock and him being close
    const sur = beats.find((b) => b.kind === "surprise");
    if (sur && !s.doneBeats.includes(sur.id) && near && inWindow(h, sur.from, sur.to) && !s.askOpen && !s.thanksAt) {
      say(p, sur, 8);
      finish(p, sur, false);
      return;
    }
    const beat = beats[s.stage];
    if (!beat || beat.kind === "surprise") return;
    if (beat.kind === "ask") {
      // today's request (js/daily.js) is theirs: their usual ask gives way to it
      if (day.daily && day.daily.owns && day.daily.owns(p.id)) return;
      if (!inWindow(h, beat.from, beat.to)) {
        if (s.askOpen) {
          // the window closed unanswered: the ask and its thanks are missed for today
          s.askOpen = false;
          s.bubble = null;
          s.stage = 2;
          emit("beat-missed", { id: p.id, beat: beat.id });
        }
        return;
      }
      if (near) {
        if (!s.askOpen) {
          s.askOpen = true;
          say(p, beat, 0);
        }
      } else if (s.askOpen && distTo(p, here) > (cfg.range || 16) * 2.5) {
        s.askOpen = false; // walked off: it asks again when he's back
        s.bubble = null;
      }
    } else if (beat.kind === "thanks") {
      if (!s.thanksAt) s.thanksAt = nowMs + 1100;
      else if (nowMs >= s.thanksAt) {
        s.thanksAt = 0;
        say(p, beat, 6);
        finish(p, beat, true);
      }
    }
  }

  /* answering an ask: he calls its ability close to them */
  window.addEventListener("day:power", (e) => {
    const d = (e && e.detail) || {};
    if (!d.power || d.action === "denied") return;
    const here = hero();
    people.forEach((p) => {
      const s = st[p.id];
      const beat = (p.beats || [])[s.stage];
      if (!beat || beat.kind !== "ask" || !s.askOpen || p.__pos.inside) return;
      if (d.power !== beat.ability && d.action !== beat.ability) return;
      if (distTo(p, here) > (cfg.range || 16)) return;
      s.askOpen = false;
      s.bubble = null;
      s.stage++;
      s.doneBeats.push(beat.id);
      emit("beat-done", { id: p.id, beat: beat.id, kind: "ask", ability: beat.ability });
      renderPanel();
    });
  });

  /* ---- the finder panel ---- */
  const compass = (dx, dz) => {
    const a = Math.atan2(dx, dz) * (180 / Math.PI);
    return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(((a + 360) % 360) / 45) % 8];
  };
  function renderPanel() {
    const here = hero();
    panel.innerHTML = `<h3>${L.title || "Your neighbors"}</h3>` + people.map((p) => {
      const d = distTo(p, here);
      const where = p.__pos.inside ? `${L.inside || "at home"}: ${p.home}` : here ? `${Math.round(d)} m ${compass(p.__pos.x - here.x, p.__pos.z - here.z)}` : p.home;
      return `<div class="row"><span class="dot" style="background:${p.color}"></span><div>${p.name}<small>${p.role} · ${where}</small></div><span class="stars">${stars(p)}</span></div>`;
    }).join("") + `<div class="tally">${L.score || "Good neighbor"}: ${total}</div>`;
  }

  /* ---- per frame ---- */
  const v = new B.Vector3();
  let lastPanel = 0;
  scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    const eng = scene.getEngine();
    const nowMs = performance.now();
    const fr = day.now && day.now();
    if (!fr || fr.minutes == null) return;
    if (fr.key !== dayKey) {
      if (dayKey != null) {
        fresh();
        dayScore = 0;
      }
      dayKey = fr.key;
    }
    const h = hourOf(fr.minutes);
    const here = hero();
    const w = eng.getRenderWidth();
    const hh = eng.getRenderHeight();
    const canvas = eng.getRenderingCanvas();
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: w, height: hh };
    const dt = Math.min(0.1, eng.getDeltaTime() / 1000 || 0.016);
    if (animStats.dayKey !== dayKey) {
      animStats.dayKey = dayKey;
      animStats.footSlide = 0;
      animStats.mismatch = 0;
      animStats.samples = 0;
    }
    const sky = (window.weather && window.weather.now && window.weather.now())
      || (day.weather && day.weather.now && day.weather.now())
      || {};
    const weatherState = sky.state || "clear";
    const sunK = typeof sky.sun === "number" ? sky.sun : 0;
    people.forEach((p) => {
      const pl = placeAt(p.stops, h);
      const prevX = p.__pos.x;
      const prevZ = p.__pos.z;
      p.__pos = pl;
      const root = p.__root;
      root.setEnabled(!pl.inside);
      // feet on whatever is under them (the sidewalk is 6 cm up, the lawn 3 cm)
      if (p.__gx == null || Math.abs(pl.x - p.__gx) > 0.05 || Math.abs(pl.z - p.__gz) > 0.05) {
        p.__gx = pl.x;
        p.__gz = pl.z;
        p.__gy = world.surfaceAt ? world.surfaceAt(pl.x, pl.z) : 0;
      }
      /* the player walks the same sidewalks: step the drawn figure aside (not its route or its distances) rather
         than let the two bodies overlap */
      let dx = pl.x;
      let dz = pl.z;
      if (here && !pl.inside && day.control && day.control.mode && day.control.mode() !== "schedule") {
        const ox = pl.x - here.x;
        const oz = pl.z - here.z;
        const od = Math.hypot(ox, oz);
        if (od < PERSONAL) {
          const k = od > 0.01 ? PERSONAL / od : 0;
          dx = here.x + (k ? ox * k : PERSONAL);
          dz = here.z + oz * k;
        }
      }
      const jump = Math.hypot(pl.x - prevX, pl.z - prevZ) > 0.55;
      const speed = jump || dt <= 0 ? 0 : Math.hypot(pl.x - prevX, pl.z - prevZ) / dt;
      // turn-before-walk: face the route first; during a beat gesture, face him
      let yawErr = 0;
      const facingHim = !!(p.__gestureWant || (p.__fig.anim && p.__fig.anim.gesture)) && here;
      if (pl.moving && !facingHim) {
        const yaw = pl.yaw != null ? pl.yaw : Math.atan2(pl.x - prevX, pl.z - prevZ);
        yawErr = Math.atan2(Math.sin(yaw - p.__yaw), Math.cos(yaw - p.__yaw));
        const turnRate = Math.abs(yawErr) > 0.55 ? 10 : 8;
        p.__yaw += yawErr * Math.min(1, dt * turnRate);
        yawErr = Math.atan2(Math.sin(yaw - p.__yaw), Math.cos(yaw - p.__yaw));
      } else if (here && (facingHim || Math.hypot(here.x - pl.x, here.z - pl.z) < 18)) {
        const yaw = Math.atan2(here.x - pl.x, here.z - pl.z);
        p.__yaw += Math.atan2(Math.sin(yaw - p.__yaw), Math.cos(yaw - p.__yaw)) * Math.min(1, dt * (facingHim ? 7 : 4));
      }
      root.position.set(dx, p.__gy, dz);
      root.rotation.y = p.__yaw;

      const gest = p.__gestureWant;
      if (gest && p.__fig.anim.gesture === gest) p.__gestureWant = null;
      const react = !!(sky.manual && (weatherState === "storm" || weatherState === "rain" || weatherState === "wind")
        && here && Math.hypot(here.x - pl.x, here.z - pl.z) < 22 && !gest && !pl.moving);
      const sample = p.__fig.step({
        dt,
        speed: pl.moving && !jump ? Math.max(speed, 0.15) : 0,
        moving: !!pl.moving,
        yawErr,
        sit: !!pl.sit,
        weather: weatherState,
        sunShield: sunK,
        gesture: gest || (p.__fig.anim.gesture && p.__fig.anim.gesture !== "react" ? p.__fig.anim.gesture : null),
        react,
        personality: PERSONALITY[p.id] || null,
        jump,
      });
      // hip drop already applied inside step; keep feet on the surface
      root.position.y = p.__gy;
      if (!pl.inside && !jump) {
        const prev = p.__sample;
        const hit = detectAnimProblems(sample, prev, { limit: FOOT_SLIDE_LIMIT });
        animStats.samples++;
        if (hit.footSlide) {
          animStats.footSlide++;
          if (animStats.footSlide <= 3) emit("anim-fail", { id: p.id, kind: "foot-slide", m: +hit.slideM.toFixed(3), state: sample.state });
        }
        if (hit.mismatch) {
          animStats.mismatch++;
          if (animStats.mismatch <= 3) emit("anim-fail", { id: p.id, kind: "mismatch", state: sample.state, speed: sample.speed });
        }
      }
      if ((sample.weather === "rain" || sample.weather === "storm") && sample.weatherK > 0.5 && !(p.__umbOn)) {
        p.__umbOn = true;
        emit("umbrella", { id: p.id, weather: sample.weather, x: pl.x, z: pl.z });
      } else if (sample.weatherK < 0.2) p.__umbOn = false;
      p.__sample = Object.assign({ jump }, sample);

      /* the orbit camera can end up beside them: up close one box fills the screen as a big slab, so they fade out
         (as he does below 1 m) between FADE_NEAR and FADE_FAR from the camera */
      if (cam.position) {
        const cdist = Math.hypot(cam.position.x - dx, cam.position.y - (p.__gy + 0.9 * (p.scale || 1)), cam.position.z - dz);
        const vis = Math.max(0, Math.min(1, (cdist - FADE_NEAR) / (FADE_FAR - FADE_NEAR)));
        if (vis !== p.__vis) {
          p.__vis = vis;
          p.__meshes.forEach((m) => {
            m.visibility = vis;
            m.setEnabled(vis > 0.02);
          });
        }
      }
      stepBeats(p, h, here, nowMs);

      // the name tag and bubble above their head
      const tag = p.__tag;
      const top = 2.05 * (p.scale || 1);
      v.set(pl.x, top, pl.z);
      const pr = B.Vector3.Project(v, B.Matrix.IdentityReadOnly, scene.getTransformMatrix(), cam.viewport.toGlobal(w, hh));
      const cd = cam.position ? B.Vector3.Distance(cam.position, v) : 0;
      const s = st[p.id];
      const showBubble = !!s.bubble && !pl.inside;
      const on = !pl.inside && pr.z > 0 && pr.z < 1 && cd < (cfg.tagRange || 90);
      tag.style.display = on ? "" : "none";
      if (on) {
        p.__sx = rect.left + (pr.x * rect.width) / w;
        p.__sy = rect.top + (pr.y * rect.height) / hh;
        tag.style.left = p.__sx.toFixed(1) + "px";
        tag.style.top = p.__sy.toFixed(1) + "px";
        tag.style.opacity = cd > 60 ? String(Math.max(0.35, 1 - (cd - 60) / 60)) : "1";
        tag.style.zIndex = String(Math.round(1000 - cd));
        const b = p.__bubble;
        b.hidden = !(showBubble && cd < 40 && !(s.bubble.spoken && s.bubble.kind !== "ask"));
        if (showBubble) {
          const txt = (s.bubble.spoken ? "" : s.bubble.text) + (s.bubble.kind === "ask" ? `<small>${(window.powers && window.powers.abilities && window.powers.abilities.get && (window.powers.abilities.get(s.bubble.ability) || {}).name) || s.bubble.ability}</small>` : "");
          if (b.dataset.id !== s.bubble.id) {
            b.dataset.id = s.bubble.id;
            b.innerHTML = txt;
            b.className = "nb-bubble " + s.bubble.kind;
          }
        } else delete b.dataset.id;
        const sr = stars(p);
        if (p.__stars.textContent !== sr) p.__stars.textContent = sr;
      }
    });
    if (!panel.hidden && nowMs - lastPanel > 500) {
      lastPanel = nowMs;
      renderPanel();
    }
  });

  const api = {
    now: () => ({
      score: total,
      dayScore,
      footSlideFails: animStats.footSlide,
      mismatchFails: animStats.mismatch,
      animSamples: animStats.samples,
      people: people.map((p) => {
        const s = p.__sample || {};
        return {
          id: p.id,
          name: p.name,
          x: p.__pos.x,
          z: p.__pos.z,
          inside: p.__pos.inside,
          moving: p.__pos.moving,
          sit: !!p.__pos.sit,
          stage: st[p.id].stage,
          done: st[p.id].doneBeats.slice(),
          asking: st[p.id].askOpen,
          bubble: st[p.id].bubble ? st[p.id].bubble.text : "",
          stars: stars(p),
          parts: p.__meshes.length,
          look: p.color,
          anim: s.state || "idle",
          gesture: s.gesture || null,
          weatherPose: s.weatherK > 0.4 ? s.weather : null,
          speed: s.speed || 0,
          phase: s.phase || 0,
          plantedL: !!s.plantedL,
          plantedR: !!s.plantedR,
        };
      }),
    }),
    /** Per-frame animation detectors for the playtest (foot-slide and state/motion mismatch). */
    anim: () => ({
      footSlideFails: animStats.footSlide,
      mismatchFails: animStats.mismatch,
      samples: animStats.samples,
      limit: FOOT_SLIDE_LIMIT,
      people: people.map((p) => {
        const s = p.__sample || {};
        return {
          id: p.id,
          state: s.state || "idle",
          speed: s.speed || 0,
          gesture: s.gesture || null,
          weather: s.weather || "clear",
          weatherK: s.weatherK || 0,
          sit: s.sit || 0,
          plantedL: !!s.plantedL,
          plantedR: !!s.plantedR,
          footL: s.footL || null,
          footR: s.footR || null,
        };
      }),
    }),
    /** Reset detector counters (a new day also clears them). */
    resetAnim: () => {
      animStats.footSlide = 0;
      animStats.mismatch = 0;
      animStats.samples = 0;
    },
    events: () => events.slice(),
    /** Have them play a gesture (ask, thanks, surprise) toward him: js/daily.js's request and thanks. */
    gesture: (id, kind) => {
      const p = people.find((q) => q.id === id);
      if (p) p.__gestureWant = kind;
      return !!p;
    },
  };
  window.neighbors = api;
  day.neighbors = api;
  renderPanel();
  return api;
}

if (typeof window !== "undefined" && window.day) install();

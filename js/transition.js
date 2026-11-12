/* ==========================================================================
   Seamless scene changes: a rolling storm-cloud wipe hides episode jumps and
   asset swaps; shaders warm behind it; props fade in by visibility; frame
   times around every transition are recorded for the playtest. God-of-War
   continuous-shot feel — no black cuts between moments. Numbers in
   day.config.js `transition`.
   ========================================================================== */

const DEFAULTS = {
  wipeSec: 1.2,
  coverIn: 0.28, // seconds to reach full opaque cover
  coverOut: 0.35, // seconds to reveal after work
  fadeInSec: 0.3,
  warmMs: 500,
  holdCapMs: 900, // never hold the cover longer than this waiting on warm
  whooshOnControl: true,
};

function cfg() {
  const c = (window.DAY_CONFIG && window.DAY_CONFIG.transition) || {};
  return Object.assign({}, DEFAULTS, c);
}

/** Tiny prebaked cloud field (64²) — drawn scaled each frame; never per-pixel on the full screen. */
function makeCloudField() {
  const N = 64;
  const c = (typeof document !== "undefined" && document.createElement) ? document.createElement("canvas") : null;
  if (!c) return null;
  c.width = N;
  c.height = N;
  const g = c.getContext("2d");
  const img = g.createImageData(N, N);
  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let a = 0;
      let f = 1;
      let amp = 0.55;
      for (let o = 0; o < 3; o++) {
        const xi = Math.floor((x / N) * 5 * f);
        const yi = Math.floor((y / N) * 4 * f);
        a += amp * hash(xi, yi);
        f *= 2.1;
        amp *= 0.5;
      }
      const dens = Math.max(0, Math.min(1, a));
      const i = (y * N + x) * 4;
      img.data[i] = (14 + dens * 32) | 0;
      img.data[i + 1] = (18 + dens * 40) | 0;
      img.data[i + 2] = (36 + dens * 80) | 0;
      img.data[i + 3] = (dens * 230) | 0;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
const CLOUD_FIELD = makeCloudField();

export function startTransition() {
  const day = window.day;
  if (!day || day.transition || typeof document === "undefined") return day && day.transition;

  const style = document.createElement("style");
  style.id = "transition-css";
  style.textContent = `
#storm-wipe{position:fixed;inset:0;z-index:95;pointer-events:none;opacity:0;width:100%;height:100%;display:block}
#storm-wipe.on{opacity:1}
html.wipe-up #loading{visibility:hidden}
@media (prefers-reduced-motion:reduce){#storm-wipe{opacity:0 !important}}
`;
  document.head.appendChild(style);

  const canvas = document.createElement("canvas");
  canvas.id = "storm-wipe";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx2 = canvas.getContext("2d", { alpha: true });

  let wiping = false;
  let phase = "in"; // in | hold | out
  let phaseT = 0;
  let wipeWork = null;
  let wipeWorked = false;
  let workDone = false;
  let wipeKind = "";
  let wipeId = "";
  let coverAmt = 0;
  let lastFrameMs = 0;
  let raf = 0;
  let holdStarted = 0;
  let sampleRgb = [10, 14, 28];
  const fades = [];
  const log = [];
  const stats = {
    wipes: 0,
    lastKind: "",
    lastId: "",
    lastSec: 0,
    lastWorstMs: 0,
    lastAvgMs: 0,
    lastCover: 0,
    lastBlack: false,
    lastLum: 0,
    frames: [],
    fades: 0,
    warmMs: 0,
  };

  function resize() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(innerWidth * dpr * 0.5));
    const h = Math.max(1, Math.floor(innerHeight * dpr * 0.5));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function emit(action, extra) {
    const d = Object.assign({ action, kind: wipeKind, id: wipeId }, extra || {});
    log.push(Object.assign({ t: performance.now() }, d));
    if (log.length > 40) log.shift();
    try { window.dispatchEvent(new CustomEvent("day:transition", { detail: d })); } catch (e) { /* none */ }
  }

  /** Sample centre pixel: storm navy is fine; flat near-black fails. */
  function sampleCover() {
    if (!ctx2 || !canvas.width) return { lum: 0, a: 0, rgb: [0, 0, 0] };
    try {
      const x = (canvas.width / 2) | 0;
      const y = (canvas.height / 2) | 0;
      const px = ctx2.getImageData(x, y, 1, 1).data;
      const lum = (px[0] + px[1] + px[2]) / 3;
      return { lum, a: px[3], rgb: [px[0], px[1], px[2]] };
    } catch (e) {
      return { lum: 20, a: 255, rgb: [10, 14, 28] };
    }
  }

  /**
   * Draw the storm wipe. `cover` 0..1 is the opacity of a FULL-SCREEN navy base
   * (the scene must never show through at cover=1). A rolling cloud front sits on top.
   */
  function paint(cover, rollU) {
    if (!ctx2) return;
    resize();
    const w = canvas.width;
    const h = canvas.height;
    cover = Math.max(0, Math.min(1, cover));
    coverAmt = cover;
    ctx2.clearRect(0, 0, w, h);
    if (cover < 0.01) return;

    // Full-screen opaque storm navy at cover=1 — never a black cut, never a see-through swap.
    ctx2.globalAlpha = 1;
    ctx2.fillStyle = `rgba(12,18,34,${cover})`;
    ctx2.fillRect(0, 0, w, h);

    if (CLOUD_FIELD && cover > 0.15) {
      ctx2.save();
      ctx2.globalAlpha = cover * 0.85;
      ctx2.imageSmoothingEnabled = true;
      const drift = (performance.now() * 0.02) % w;
      const roll = (rollU * 1.1 - 0.05) * w;
      ctx2.drawImage(CLOUD_FIELD, -drift * 0.12, 0, w * 1.25, h);
      ctx2.drawImage(CLOUD_FIELD, roll - w * 0.35, -h * 0.08, w * 1.05, h * 1.15);
      // lightning-lit leading edge
      const grad = ctx2.createLinearGradient(roll - w * 0.15, 0, roll + w * 0.2, 0);
      grad.addColorStop(0, "rgba(12,18,34,0)");
      grad.addColorStop(0.5, "rgba(90,140,210,0.4)");
      grad.addColorStop(1, "rgba(12,18,34,0)");
      ctx2.fillStyle = grad;
      ctx2.fillRect(roll - w * 0.15, 0, w * 0.35, h);
      ctx2.restore();
    }
  }

  async function runWork() {
    if (wipeWorked) return;
    wipeWorked = true;
    const t0 = performance.now();
    const samp = sampleCover();
    sampleRgb = samp.rgb;
    const black = samp.a > 200 && samp.lum < 6;
    stats.lastBlack = black;
    stats.lastLum = Math.round(samp.lum);
    emit("cover", { u: coverAmt, lum: stats.lastLum, black });
    // Diegetic cue: a soft whoosh + optional flash as the storm covers the jump.
    try {
      const S = day.score || window.score;
      if (S && S.whoosh) S.whoosh();
      const W = window.weather;
      if (W && W.triggerFlash) W.triggerFlash(90, 0);
    } catch (e) { /* none */ }
    try {
      await Promise.resolve(wipeWork && wipeWork());
    } catch (e) {
      console.warn("[transition] wipe work failed:", e);
    }
    const warmMs = await warmScene(cfg().warmMs);
    stats.warmMs = warmMs;
    workDone = true;
    emit("warmed", { ms: Math.round(warmMs) });
    emit("work-done", { ms: Math.round(performance.now() - t0) });
  }

  async function warmScene(budgetMs) {
    const w = day.world && day.world();
    const scene = w && w.scene;
    if (!scene) return 0;
    const t0 = performance.now();
    const budget = budgetMs || 500;
    const within = (p, ms) => new Promise((res) => {
      const timer = setTimeout(() => res(false), Math.max(0, ms));
      Promise.resolve(p).then(() => { clearTimeout(timer); res(true); }, () => { clearTimeout(timer); res(true); });
    });
    try {
      const seen = new Set();
      let n = 0;
      for (const m of scene.meshes) {
        if (performance.now() - t0 > budget) break;
        const mat = m.material;
        if (!mat || seen.has(mat) || !m.isEnabled || !m.isEnabled()) continue;
        if (!m.getTotalVertices || !m.getTotalVertices()) continue;
        // Prefer meshes near the camera (episode props land here).
        seen.add(mat);
        if (mat.forceCompilationAsync) {
          await within(mat.forceCompilationAsync(m), budget - (performance.now() - t0));
          n++;
          if (n >= 24) break; // enough for the first frames after the wipe
        }
      }
      if (scene.whenReadyAsync && performance.now() - t0 < budget) {
        await within(scene.whenReadyAsync(), Math.min(200, budget - (performance.now() - t0)));
      }
      emit("lod-warm", { mats: n });
    } catch (e) { /* warm is a head start */ }
    return performance.now() - t0;
  }

  function finishWipe() {
    wiping = false;
    phase = "in";
    canvas.classList.remove("on");
    document.documentElement.classList.remove("wipe-up");
    ctx2 && ctx2.clearRect(0, 0, canvas.width, canvas.height);
    const worst = stats.frames.length ? Math.max(...stats.frames) : 0;
    const avg = stats.frames.length ? stats.frames.reduce((a, b) => a + b, 0) / stats.frames.length : 0;
    stats.lastWorstMs = Math.round(worst);
    stats.lastAvgMs = Math.round(avg * 10) / 10;
    stats.lastSec = Math.round((cfg().coverIn + cfg().coverOut + (holdStarted ? (performance.now() - holdStarted) / 1000 : 0)) * 100) / 100;
    stats.lastCover = Math.round(coverAmt * 100) / 100;
    emit("end", {
      worstMs: stats.lastWorstMs,
      avgMs: stats.lastAvgMs,
      cover: stats.lastCover,
      black: stats.lastBlack,
      lum: stats.lastLum,
    });
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function tickWipe(now) {
    if (!wiping) return;
    const dt = lastFrameMs ? Math.min(250, now - lastFrameMs) : 16;
    lastFrameMs = now;
    stats.frames.push(dt);
    if (stats.frames.length > 180) stats.frames.shift();

    const C = cfg();
    phaseT += dt / 1000;

    if (phase === "in") {
      const u = Math.min(1, phaseT / Math.max(0.05, C.coverIn));
      paint(u, u);
      if (u >= 1) {
        phase = "hold";
        phaseT = 0;
        holdStarted = now;
        paint(1, 1);
        runWork();
      }
    } else if (phase === "hold") {
      paint(1, 1);
      const held = now - holdStarted;
      if (workDone || held >= C.holdCapMs) {
        phase = "out";
        phaseT = 0;
      }
    } else {
      const u = Math.min(1, phaseT / Math.max(0.05, C.coverOut));
      paint(1 - u, 1 + u * 0.3);
      if (u >= 1) {
        finishWipe();
        return;
      }
    }
    raf = requestAnimationFrame(tickWipe);
  }

  /**
   * Run `work` behind a storm-cloud wipe. Full opaque cover before work;
   * hold until work+warm finish (cap holdCapMs); then reveal.
   */
  function wipe(work, opts) {
    const o = opts || {};
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return Promise.resolve()
        .then(() => work && work())
        .then(() => warmScene(cfg().warmMs))
        .then(() => {
          stats.wipes++;
          stats.lastKind = o.kind || "wipe";
          stats.lastId = o.id || "";
          emit("end", { reduced: true });
        });
    }
    if (wiping) return Promise.resolve().then(() => work && work());
    wipeKind = o.kind || "wipe";
    wipeId = o.id || "";
    wipeWork = work;
    wipeWorked = false;
    workDone = false;
    coverAmt = 0;
    phase = "in";
    phaseT = 0;
    holdStarted = 0;
    stats.frames = [];
    stats.wipes++;
    stats.lastKind = wipeKind;
    stats.lastId = wipeId;
    stats.lastBlack = false;
    wiping = true;
    lastFrameMs = 0;
    resize();
    canvas.classList.add("on");
    document.documentElement.classList.add("wipe-up");
    emit("start", { secs: cfg().wipeSec });
    try { window.hawkesPlaytest && window.hawkesPlaytest.cut && window.hawkesPlaytest.cut("storm-wipe"); } catch (e) { /* none */ }
    return new Promise((resolve) => {
      const done = () => {
        window.removeEventListener("day:transition", onEnd);
        resolve(api.stats());
      };
      const onEnd = (ev) => {
        const d = (ev && ev.detail) || {};
        if (d.action === "end" && d.kind === wipeKind) done();
      };
      window.addEventListener("day:transition", onEnd);
      raf = requestAnimationFrame(tickWipe);
      setTimeout(() => {
        if (wiping) {
          workDone = true;
          phase = "out";
          phaseT = cfg().coverOut;
          tickWipe(performance.now());
        }
      }, (cfg().coverIn + cfg().coverOut + cfg().holdCapMs / 1000 + 1.2) * 1000);
    });
  }

  /** Fade meshes in by visibility only (never touch shared materials). */
  function fadeIn(target, secs) {
    const list = Array.isArray(target) ? target : target ? [target] : [];
    const dur = secs != null ? secs : cfg().fadeInSec;
    list.forEach((mesh) => {
      if (!mesh) return;
      const nodes = [];
      const gather = (m) => {
        if (!m) return;
        nodes.push(m);
        (m.getChildMeshes ? m.getChildMeshes(false) : []).forEach(gather);
      };
      gather(mesh);
      nodes.forEach((m) => {
        m.visibility = 0;
        fades.push({ mesh: m, from: 0, to: 1, t: 0, dur });
        stats.fades++;
      });
    });
  }

  function tickFades(dt) {
    for (let i = fades.length - 1; i >= 0; i--) {
      const f = fades[i];
      f.t += dt;
      const k = Math.min(1, f.t / Math.max(0.001, f.dur));
      const ease = k * k * (3 - 2 * k);
      if (f.mesh) f.mesh.visibility = f.from + (f.to - f.from) * ease;
      if (k >= 1) fades.splice(i, 1);
    }
  }

  const hook = () => {
    const w = day.world && day.world();
    const scene = w && w.scene;
    if (!scene) { requestAnimationFrame(hook); return; }
    scene.onBeforeRenderObservable.add(() => {
      const eng = scene.getEngine && scene.getEngine();
      const dt = Math.min(0.1, ((eng && eng.getDeltaTime ? eng.getDeltaTime() : 16) / 1000));
      tickFades(dt);
    });
  };
  hook();

  const api = {
    wipe,
    fadeIn,
    warm: warmScene,
    active: () => wiping,
    cover: () => coverAmt,
    stats: () => ({
      wipes: stats.wipes,
      lastKind: stats.lastKind,
      lastId: stats.lastId,
      lastSec: stats.lastSec,
      lastWorstMs: stats.lastWorstMs,
      lastAvgMs: stats.lastAvgMs,
      lastCover: stats.lastCover,
      lastBlack: stats.lastBlack,
      lastLum: stats.lastLum,
      fades: stats.fades,
      warmMs: Math.round(stats.warmMs),
      frames: stats.frames.slice(),
      sampleRgb: sampleRgb.slice(),
    }),
    now: () => ({
      wiping,
      phase,
      cover: coverAmt,
      kind: wipeKind,
      id: wipeId,
      fades: fades.length,
      log: log.slice(),
    }),
  };
  day.transition = api;
  window.transition = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) {
  startTransition();
}

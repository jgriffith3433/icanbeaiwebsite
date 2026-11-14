/* ==========================================================================
   Asks in the world (neighbors.askMarks in day.config.js). What a neighbor wants is seen, not read, the way a Sim's
   plumbob and thought bubble say it: a plumbob marker floats over the one who asks (a 48 px tap target), and the verb's
   icon (the UI kit's, the one on the ability bar) hangs over the PLACE it is for on a stem and a ground ring, a rain icon
   over the dry park lawn. Both go when the ask is answered or missed. No card, no list.
   Sources: the street's lesson (`day.street.open()`, the cold open's Birdie) and the day's own asks
   (`day.neighbors.asks()`: in their window, not answered). A tap on the marker takes control when he's on his day and
   swings the camera to the ask (`day.control.frame`). Everything stands on `world.surfaceAt` (ring and stem foot 2 cm and
   the stem's base on the surface; the icon billboard is camera-facing, never mirrored).
   `day.asks`: now(), tap(id), places(). Events `day:ask` (show / hide / tap / frame). Playtest: `ask-markers`.
   ========================================================================== */

export const VERB_TINT = { rain: [0.45, 0.7, 1], sunbreak: [1, 0.8, 0.35], fog: [0.78, 0.7, 1], wind: [0.55, 1, 0.8], bolt: [1, 0.9, 0.4] };
const norm = (v) => (v === "lightning" ? "bolt" : v === "sun" ? "sunbreak" : v === "gale" || v === "gust" ? "wind" : v);

/** Where an ask is for: the config's place for (who, verb), else a ring round the asker. Pure. */
export function placeFor(marks, who, verb, at) {
  const p = marks && marks.places && marks.places[who] && marks.places[who][verb];
  return p ? Object.assign({}, p) : { x: at.x, z: at.z, r: 4, name: "here" };
}

export function startAsks() {
  const day = window.day;
  const cfg = window.DAY_CONFIG && window.DAY_CONFIG.neighbors && window.DAY_CONFIG.neighbors.askMarks;
  const world = day && day.world && day.world();
  const B = window.BABYLON;
  if (!day || !cfg || !world || !world.scene || !B || day.asks || typeof document === "undefined") return day && day.asks;
  const scene = world.scene;
  const html = document.documentElement;
  const art = () => window.uiArt || day.uiArt;
  const iconUrl = (v) => (art() && art().verbIcon ? art().verbIcon(v, true) : `textures/ui/verb-${v}-lit.svg`);

  const style = document.createElement("style");
  style.textContent = `
.ask-mark{position:fixed;z-index:16;width:48px;height:48px;margin:-24px 0 0 -24px;padding:0;border:0;background:none;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:opacity .25s;filter:drop-shadow(0 3px 6px rgba(0,0,0,.55))}
.ask-mark[hidden]{display:none}
.ask-mark .gem{position:absolute;left:7px;top:7px;width:34px;height:34px;transform:rotate(45deg);border-radius:6px;background:linear-gradient(135deg,var(--ask,#f0c27a),rgba(255,255,255,.85) 55%,var(--ask,#f0c27a));border:2px solid rgba(255,255,255,.9);box-shadow:0 0 14px 3px var(--ask,#f0c27a);animation:askBob 1.6s ease-in-out infinite}
.ask-mark img{position:absolute;left:11px;top:11px;width:26px;height:26px;pointer-events:none}
.ask-mark:active .gem{filter:brightness(1.4)}
@keyframes askBob{0%,100%{transform:rotate(45deg) translate(0,0)}50%{transform:rotate(45deg) translate(-3px,-3px)}}
@media (prefers-reduced-motion:reduce){.ask-mark .gem{animation:none}}
html.title-up .ask-mark,html.cold-open .ask-mark,html.cine-up .ask-mark,html.ep-menu-up .ask-mark{display:none}
`;
  document.head.appendChild(style);

  /* ---- the world part: icon billboard, stem and ground ring, built once per (who, verb), shown while that ask is up ---- */
  const glowMat = (name, c, a) => {
    const m = new B.StandardMaterial(name, scene);
    m.disableLighting = true;
    m.emissiveColor = new B.Color3(c[0], c[1], c[2]);
    m.alpha = a;
    m.fogEnabled = false;
    m.backFaceCulling = false;
    return m;
  };
  const ringTexture = () => {
    const dt = new B.DynamicTexture("ask-ring-tex", { width: 256, height: 256 }, scene, true);
    const g = dt.getContext();
    g.clearRect(0, 0, 256, 256);
    g.lineWidth = 9;
    g.strokeStyle = "#fff";
    g.setLineDash([26, 16]);
    g.beginPath();
    g.arc(128, 128, 118, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 0.18;
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(128, 128, 112, 0, Math.PI * 2);
    g.fill();
    dt.hasAlpha = true;
    dt.update();
    return dt;
  };
  let ringTex = null;
  const worlds = new Map(); // key -> { icon, stem, ring, mats }
  function build(verb, color) {
    if (!ringTex) ringTex = ringTexture();
    const tint = new B.Color3(color[0], color[1], color[2]);
    const icon = B.MeshBuilder.CreatePlane("ask-icon", { size: 2.4 }, scene);
    icon.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    const im = new B.StandardMaterial("ask-icon-m", scene);
    im.disableLighting = true;
    im.emissiveColor = new B.Color3(1, 1, 1);
    im.backFaceCulling = false;
    im.fogEnabled = false;
    const tex = new B.Texture(iconUrl(verb), scene, false, true, B.Texture.TRILINEAR_SAMPLINGMODE);
    tex.hasAlpha = true;
    im.diffuseTexture = tex;
    im.opacityTexture = tex;
    icon.material = im;
    const stemM = glowMat("ask-stem-m", color, 0.45);
    const stem = B.MeshBuilder.CreateCylinder("ask-stem", { diameter: 0.07, height: 1, tessellation: 8 }, scene);
    stem.material = stemM;
    const ringM = new B.StandardMaterial("ask-ring-m", scene);
    ringM.disableLighting = true;
    ringM.emissiveColor = tint;
    ringM.opacityTexture = ringTex;
    ringM.diffuseTexture = ringTex;
    ringM.backFaceCulling = false;
    ringM.zOffset = -4;
    ringM.disableDepthWrite = true;
    ringM.fogEnabled = false;
    const ring = B.MeshBuilder.CreateGround("ask-ring", { width: 2, height: 2 }, scene);
    ring.material = ringM;
    const set = [icon, stem, ring];
    set.forEach((m) => { m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.setEnabled(false); });
    return { icon, stem, ring, ringM, stemM, tex };
  }

  /* ---- the DOM marker over the asker ---- */
  const marks = new Map(); // key -> { el, ask, place, gy, shown }
  function markEl(key, verb, color) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "ask-mark";
    el.id = "ask-" + key;
    el.dataset.hawkesUi = "1";
    el.dataset.verb = verb;
    el.setAttribute("aria-label", "Neighbor's ask: " + verb + ". Tap to look.");
    el.style.setProperty("--ask", `rgb(${color.map((c) => Math.round(c * 255)).join(",")})`);
    el.innerHTML = `<span class="gem"></span><img alt="" draggable="false" src="${iconUrl(verb)}"/>`;
    const act = (e) => {
      e.preventDefault();
      e.stopPropagation();
      tap(key);
    };
    // a touch acts on pointerup (the click that follows the same tap is swallowed, as the Take control button does)
    let swallow = 0;
    el.addEventListener("pointerup", (e) => { swallow = performance.now(); act(e); });
    el.addEventListener("click", (e) => { if (performance.now() - swallow < 800) { e.preventDefault(); e.stopPropagation(); return; } act(e); });
    document.body.appendChild(el);
    return el;
  }

  const log = [];
  const emit = (action, extra) => {
    const d = Object.assign({ action }, extra || {});
    log.push(Object.assign({ t: Math.round(performance.now()) }, d));
    if (log.length > 40) log.shift();
    try { window.dispatchEvent(new window.CustomEvent("day:ask", { detail: d })); } catch (e) { /* node */ }
  };
  const inControl = () => !!(day.control && day.control.mode && day.control.mode() === "control");

  /** Every ask that is up now: the street's open one, else the day's. */
  function current() {
    const out = [];
    const S = day.street && day.street.open && day.street.open();
    if (S) {
      const verb = norm(S.verb);
      out.push({ key: S.id, who: S.who, verb, x: S.x, z: S.z, inside: S.inside, scale: S.who === "birdie" ? 0.88 : S.who === "quill" ? 1.1 : 1 });
    } else if (!(day.street && day.street.now && (day.street.now().phase === "gap" || day.street.now().phase === "thanks"))) {
      ((day.neighbors && day.neighbors.asks && day.neighbors.asks()) || []).forEach((a) => {
        out.push({ key: a.id, who: a.who, verb: norm(a.verb), x: a.x, z: a.z, inside: a.inside, scale: a.scale });
      });
    }
    return out;
  }
  const surf = (x, z) => (world.surfaceAt ? world.surfaceAt(x, z) : 0);
  /** The lawn is overlaid 6 mm over the ground at 0.057..0.069: markers on the park stand on that. */
  const groundAt = (x, z) => Math.max(surf(x, z), x > -33 && x < 29 && z > 21 && z < 67 ? 0.069 : 0);

  function tap(key) {
    const m = marks.get(key);
    if (!m) return false;
    emit("tap", { key, who: m.ask.who, verb: m.ask.verb });
    const go = () => {
      const p = m.place;
      const ok = day.control && day.control.frame ? day.control.frame(p.x, p.z, groundAt(p.x, p.z) + 2) : false;
      emit("frame", { key, ok, x: p.x, z: p.z });
    };
    if (!inControl()) {
      try { if (day.control && day.control.take) day.control.take("ask"); } catch (e) { /* no control */ }
      setTimeout(go, 700);
    } else go();
    return true;
  }

  const v = new B.Vector3();
  let t0 = performance.now();
  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const T = (now - t0) / 1000;
    const hide = html.classList.contains("title-up") || html.classList.contains("cold-open") || html.classList.contains("cine-up") || html.classList.contains("ep-menu-up");
    const asks = hide ? [] : current();
    const want = new Set(asks.map((a) => a.key));
    // gone: answered, missed, window closed
    marks.forEach((m, key) => {
      if (want.has(key)) return;
      m.el.remove();
      const w = worlds.get(m.ask.verb + ":" + key);
      if (w) [w.icon, w.stem, w.ring].forEach((x) => x.setEnabled(false));
      marks.delete(key);
      emit("hide", { key, who: m.ask.who, verb: m.ask.verb });
    });
    const cam = scene.activeCamera;
    if (!cam) return;
    const eng = scene.getEngine();
    const rect = eng.getRenderingCanvas().getBoundingClientRect();
    const w = eng.getRenderWidth();
    const h = eng.getRenderHeight();
    asks.forEach((a) => {
      let m = marks.get(a.key);
      if (!m) {
        const color = VERB_TINT[a.verb] || [1, 0.8, 0.4];
        const place = placeFor(cfg, a.who, a.verb, a);
        m = { el: markEl(a.key, a.verb, color), ask: a, place, color, gy: 0 };
        marks.set(a.key, m);
        const wk = a.verb + ":" + a.key;
        if (!worlds.has(wk)) worlds.set(wk, build(a.verb, color));
        emit("show", { key: a.key, who: a.who, verb: a.verb, place: place.name });
      }
      m.ask = a;
      // over the place: icon on a stem, a ring on the ground
      const W = worlds.get(a.verb + ":" + a.key);
      const p = m.place;
      const gy = groundAt(p.x, p.z);
      const H = cfg.iconHeight || 6.5;
      const bob = Math.sin(T * 1.8) * 0.18;
      W.ring.setEnabled(true);
      W.ring.position.set(p.x, gy + 0.02, p.z);
      W.ring.scaling.set(p.r, 1, p.r);
      W.ringM.alpha = 0.55 + 0.2 * Math.sin(T * 2.4);
      W.stem.setEnabled(true);
      const sh = H - 1.3;
      W.stem.scaling.y = sh;
      W.stem.position.set(p.x, gy + 0.02 + sh / 2, p.z);
      W.icon.setEnabled(true);
      W.icon.position.set(p.x, gy + H + bob, p.z);
      m.iconPos = { x: p.x, y: gy + H, z: p.z };
      // over the asker: the plumbob (DOM, so it's a real tap target)
      const ay = a.inside ? 3 : 2.05 * (a.scale || 1) + (cfg.markHeight || 0.85) + groundAt(a.x, a.z);
      v.set(a.x, ay + Math.sin(T * 1.6) * 0.08, a.z);
      const pr = B.Vector3.Project(v, B.Matrix.IdentityReadOnly, scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
      const on = pr.z > 0 && pr.z < 1;
      const sx = rect.left + (pr.x * rect.width) / w;
      const sy = rect.top + (pr.y * rect.height) / h;
      // inside the screen with room for the 48 px target, else not drawn (a marker never sits on an edge, never half off)
      const fits = on && sx > 28 && sx < innerWidth - 28 && sy > 28 && sy < innerHeight - 28;
      m.el.hidden = !fits;
      m.screen = fits ? { x: Math.round(sx), y: Math.round(sy) } : null;
      if (fits) {
        m.el.style.left = sx.toFixed(1) + "px";
        m.el.style.top = sy.toFixed(1) + "px";
      }
    });
  });

  const api = {
    now: () => ({
      asks: [...marks.values()].map((m) => {
        const r = m.el.getBoundingClientRect();
        return { key: m.ask.key, who: m.ask.who, verb: m.ask.verb, place: m.place, visible: !m.el.hidden, screen: m.screen, w: Math.round(r.width), h: Math.round(r.height), icon: m.iconPos || null, gy: m.iconPos ? groundAt(m.place.x, m.place.z) : null };
      }),
      log: log.slice(),
    }),
    tap,
    places: () => JSON.parse(JSON.stringify(cfg.places)),
  };
  day.asks = api;
  window.asks = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startAsks();

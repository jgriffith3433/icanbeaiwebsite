/* ==========================================================================
   Abilities: the registry Small Weather's powers are called through.

   Each ability is { id, name, key, cost, cooldown, duration }: what it costs
   in Charge (the Pressure pool, same number; Body's "Energy" is a different
   meter), how long before it can be called again, and how long it lasts.
   Charge regenerates. use(id) is the one gate: it refuses a call that is on
   cooldown or costs more than he has, and says which. createAbilities() has
   no scene, so npm test can run it dry. startAbilityBar() is the on-screen
   row: five verbs (Lightning, Rain, Wind, Fog, Sun), a cooldown sweep and
   the Charge bar (on a phone, a ring around the verb arc). js/powers.js
   registers the verbs and the hidden storm/gust/gale/tornado spends.
   ========================================================================== */

/** The five verbs on the bar (desktop and phone). Storm / Gust / Gale / Tornado are hold depths of Lightning and Wind. */
export const VERB_IDS = ["bolt", "rain", "wind", "fog", "sunbreak"];
export const TOUCH_ABILITIES = VERB_IDS;

export function createAbilities(opt) {
  opt = opt || {};
  const max = opt.max > 0 ? opt.max : 100;
  let energy = Math.max(0, Math.min(max, opt.start || 0));
  let clock = 0;
  const list = [];
  const byId = {};
  const locked = new Set(); // ids the player hasn't unlocked yet (the tutorial episode); empty = everything open

  function register(def) {
    if (!def || !def.id) throw new Error("an ability needs an id");
    const a = {
      id: def.id,
      name: def.name || def.id,
      key: def.key || "",
      cost: Math.max(0, def.cost || 0),
      cooldown: Math.max(0, def.cooldown || 0),
      duration: Math.max(0, def.duration || 0),
      readyAt: 0,
      activeUntil: 0,
      uses: 0,
      verb: !!def.verb || VERB_IDS.includes(def.id),
    };
    if (byId[a.id]) list.splice(list.indexOf(byId[a.id]), 1, a);
    else list.push(a);
    byId[a.id] = a;
    return a;
  }

  function step(dt, rate) {
    dt = Math.max(0, dt || 0);
    clock += dt;
    energy = Math.min(max, energy + (rate || 0) * dt);
  }

  /** Why `id` can't be used right now: "unknown", "locked", "cooldown" or "energy" (Charge); null when it can. */
  function why(id) {
    const a = byId[id];
    if (!a) return "unknown";
    if (locked.has(id)) return "locked";
    if (clock < a.readyAt - 1e-6) return "cooldown";
    if (energy < a.cost - 1e-4) return "energy"; // Charge too low (API reason stays "energy")
    return null;
  }

  /** The gate. Spends the cost and starts the cooldown, or changes nothing and says why. */
  function use(id) {
    const reason = why(id);
    if (reason) return { ok: false, reason, id };
    const a = byId[id];
    energy -= a.cost;
    a.readyAt = clock + Math.max(a.cooldown, 0);
    a.activeUntil = clock + a.duration;
    a.uses++;
    return { ok: true, id };
  }

  function view(a) {
    const left = Math.max(0, a.readyAt - clock);
    return {
      id: a.id,
      name: a.name,
      key: a.key,
      cost: a.cost,
      cooldown: a.cooldown,
      duration: a.duration,
      remaining: left, // seconds of cooldown left
      fraction: a.cooldown > 0 ? Math.min(1, left / a.cooldown) : 0, // 1 just used, 0 ready
      active: clock < a.activeUntil,
      affordable: energy >= a.cost - 1e-4,
      locked: locked.has(a.id),
      ready: !why(a.id),
      uses: a.uses,
      verb: a.verb,
    };
  }

  function now() {
    return { energy, max, abilities: list.map(view) };
  }

  /** Back to empty and ready (a new episode of control). Charge is kept unless asked. */
  function reset(toEnergy) {
    list.forEach((a) => {
      a.readyAt = 0;
      a.activeUntil = 0;
    });
    if (toEnergy != null) energy = Math.max(0, Math.min(max, toEnergy));
  }

  /** Lock these ids (all of them when none are given), or open one / all. */
  function lock(ids) {
    (ids || list.map((a) => a.id)).forEach((id) => locked.add(id));
  }
  function unlock(id) {
    if (id == null) locked.clear();
    else locked.delete(id);
  }

  return { lock, unlock, isLocked: (id) => locked.has(id), register, step, use, why, now, reset, get: (id) => byId[id] && view(byId[id]), ids: () => list.map((a) => a.id), verbs: () => VERB_IDS.slice() };
}

/** The on-screen row. Returns { paint(visible), el }. No DOM in the tests: it returns a no-op. */
export function startAbilityBar(abilities, onPress, opt) {
  const canDom = typeof document !== "undefined" && document.body && typeof document.body.append === "function" && document.head;
  if (!canDom) return { paint() {}, refuse() {}, el: null, hold: null };
  const verbs = (opt && opt.verbs) || VERB_IDS;
  const onHold = opt && opt.onHold; // (id, down) for Lightning / Wind hold depths
  const style = document.createElement("style");
  style.textContent = `
.abilitybar{z-index:6;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;font:600 0.74rem/1.15 system-ui,sans-serif;color:#e7eef8}
.abilitybar[hidden]{display:none}
.abilitybar .row{display:flex;gap:8px}
.abilitybar .ab{position:relative;width:64px;height:64px;box-sizing:border-box;border-radius:14px;border:1px solid rgba(126,200,255,.55);background:rgba(10,14,22,.72);overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;pointer-events:auto;cursor:pointer;touch-action:none}
.abilitybar .ab .face{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transition:transform 80ms ease}
.abilitybar .ab:active .face,.abilitybar .ab.pressed .face{transform:scale(.9)}
.abilitybar .ab .ico{width:70%;height:70%;object-fit:contain;pointer-events:none;filter:drop-shadow(0 0 6px rgba(126,200,255,.25))}
.abilitybar .ab .k,.abilitybar .ab .n{display:none}
.abilitybar .ab .c{position:absolute;top:3px;right:5px;z-index:2;font-size:.62rem;color:#7ec8ff;text-shadow:0 1px 3px rgba(0,0,0,.85)}
.abilitybar .ab .wipe{position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;background:conic-gradient(from -90deg,rgba(3,6,12,.78) calc(var(--cd,0)*360deg),transparent 0)}
.abilitybar .ab.cooling .wipe{opacity:1}
.abilitybar .ab .cd{position:absolute;left:0;right:0;bottom:0;z-index:2;display:none;align-items:center;justify-content:center;padding:1px 0;font-size:.7rem;line-height:1;color:#fff;background:transparent;text-shadow:0 1px 4px rgba(0,0,0,.9)}
.abilitybar .ab.cooling .cd{display:flex}
.abilitybar .ab.ready:not(.cooling):not(.locked):not(.poor){border-color:#9fd4ff;box-shadow:0 0 0 1px rgba(159,212,255,.35),0 0 18px rgba(126,200,255,.75)}
.abilitybar .ab.ready:not(.cooling):not(.locked):not(.poor) .ico{filter:drop-shadow(0 0 10px rgba(126,200,255,.85)) brightness(1.12)}
.abilitybar .ab.locked .ico{filter:grayscale(1) brightness(.7);opacity:.55}
.abilitybar .ab.cooling .ico{opacity:.55;filter:grayscale(.35) brightness(.85)}
.abilitybar .ab.poor{border-color:rgba(196,85,74,.7)}
.abilitybar .ab.poor .k{color:#e08a80}
.abilitybar .ab.locked{opacity:.38;border-style:dashed;filter:grayscale(1)}
.abilitybar .ab.unlocked-now{border-color:#f0c27a;box-shadow:0 0 14px rgba(240,194,122,.9)}
.abilitybar .ab.pulse{animation:abpulse .32s ease-out}
@keyframes abpulse{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,255,255,.95)}35%{transform:scale(1.18);box-shadow:0 0 18px 6px rgba(126,200,255,.95)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(126,200,255,0)}}
.abilitybar .ab.cooling{border-color:rgba(255,255,255,.2);outline:2px solid rgba(240,168,74,.7);outline-offset:-2px}
.abilitybar .ab.active{border-color:#fff;box-shadow:0 0 12px rgba(126,200,255,.9)}
.abilitybar .ab.held{border-color:#ffe29a;box-shadow:0 0 14px rgba(240,168,74,.85)}
/* Charge (ability spend) — amber bolt look, not Body's Energy */
.abilitybar .charge{width:100%;min-width:230px;color:#f3e0b0}
.abilitybar .charge .et{display:inline-flex;align-items:center;gap:5px;letter-spacing:.04em}
.abilitybar .charge .et .bolt{display:inline-block;width:11px;height:14px;flex:0 0 auto;background:linear-gradient(165deg,#ffe29a,#f0a84a);clip-path:polygon(55% 0%,18% 55%,46% 55%,30% 100%,82% 42%,54% 42%)}
.abilitybar .charge .bar{margin-top:3px;height:8px;border-radius:99px;background:rgba(20,12,4,.55);border:1px solid rgba(240,168,74,.55);overflow:hidden;box-shadow:0 0 10px rgba(240,168,74,.18)}
.abilitybar .charge .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#7a3e12,#f0a84a 55%,#ffe29a);border-radius:99px}
.abilitybar .refuse{display:none;color:#f0c27a}
.abilitybar .charge.refused .refuse{display:block}
.abilitybar .charge.refused .et{display:none}
/* phone: five verbs in an arc on the right edge above the thumb; Charge is a ring around the arc */
html.touch-ui .abilitybar{align-items:center;justify-content:center;gap:0;width:240px;height:240px;font-size:.8rem;pointer-events:none}
html.touch-ui .abilitybar .row{position:relative;width:240px;height:240px;gap:0;pointer-events:none}
html.touch-ui .abilitybar .charge{position:absolute;inset:0;width:auto;min-width:0;pointer-events:none;z-index:0}
html.touch-ui .abilitybar .charge .et{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:.8rem;font-weight:700;white-space:nowrap}
html.touch-ui .abilitybar .charge .bar{display:none}
html.touch-ui .abilitybar .charge .ring{position:absolute;left:50%;top:50%;width:116px;height:116px;margin:-58px 0 0 -58px;border-radius:50%;border:3px solid rgba(240,168,74,.28);box-sizing:border-box;background:conic-gradient(#f0a84a var(--charge-deg,0deg),rgba(20,12,4,.45) 0)}
html.touch-ui .abilitybar .charge .ring::after{content:"";position:absolute;inset:5px;border-radius:50%;background:rgba(8,12,20,.55)}
html.touch-ui .abilitybar .ab{position:absolute;width:56px;height:56px;min-width:44px;min-height:44px;border-radius:50%;gap:0;justify-content:center;padding:0;z-index:1;left:50%;top:50%;margin:-28px 0 0 -28px;pointer-events:auto}
/* the verbs sit on an 86 px radius round the Charge ring (54 px): 8 px clear of the ring, 10 px between icons, and the
   whole arc inside the 220 px box, so the right-most icon is 9 px from the screen edge, never cut off */
html.touch-ui .abilitybar .ab[data-verb="0"]{transform:translate(0,-100px)}
html.touch-ui .abilitybar .ab[data-verb="1"]{transform:translate(64px,-77px)}
html.touch-ui .abilitybar .ab[data-verb="2"]{transform:translate(99px,-17px)}
html.touch-ui .abilitybar .ab[data-verb="3"]{transform:translate(86px,50px)}
html.touch-ui .abilitybar .ab[data-verb="4"]{transform:translate(34px,94px)}
html.touch-ui .abilitybar .ab .ico{width:78%;height:78%}
html.touch-ui .abilitybar .ab .c{top:0;right:0;min-width:20px;height:20px;line-height:20px;text-align:center;border-radius:10px;background:rgba(8,12,20,.9);border:1px solid rgba(240,168,74,.8);color:#ffe2b0;font-size:.8rem;font-weight:700;padding:0 3px;box-sizing:border-box;z-index:3}
html.touch-ui .abilitybar .ab .cd{top:0;bottom:auto;height:100%;padding:0;font-size:1.1rem;background:transparent;border-radius:50%}
html.touch-ui .abilitybar .ab .wipe{border-radius:50%}
@media (orientation:landscape) and (max-height:520px){
  /* centre near the box's foot: the arc fans across the top */
  html.touch-ui .abilitybar{width:260px;height:160px}
  html.touch-ui .abilitybar .row{width:260px;height:160px}
  html.touch-ui .abilitybar .charge .ring{top:130px}
  html.touch-ui .abilitybar .charge .et{top:130px}
  html.touch-ui .abilitybar .ab{top:130px}
  html.touch-ui .abilitybar .ab[data-verb="0"]{transform:translate(-99px,-17px)}
  html.touch-ui .abilitybar .ab[data-verb="1"]{transform:translate(-64px,-77px)}
  html.touch-ui .abilitybar .ab[data-verb="2"]{transform:translate(0,-100px)}
  html.touch-ui .abilitybar .ab[data-verb="3"]{transform:translate(64px,-77px)}
  html.touch-ui .abilitybar .ab[data-verb="4"]{transform:translate(99px,-17px)}
}
html.in-control:not(.preview-public):not(.touch-ui) .side .log{max-height:22vh}
html:not(.touch-ui) body:has(.mo-line:not([hidden])) .control-hint,html:not(.touch-ui):not(.in-control) body:has(.tutorial:not([hidden])) .control-hint{visibility:hidden}
`;
  document.head.appendChild(style);
  const el = document.createElement("div");
  el.className = "abilitybar";
  el.id = "abilitybar";
  el.hidden = true;
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", "Abilities");
  const row = document.createElement("div");
  row.className = "row";
  const en = document.createElement("div");
  en.className = "charge";
  en.id = "charge";
  en.setAttribute("role", "meter");
  en.setAttribute("aria-label", "Charge");
  en.setAttribute("aria-valuemin", "0");
  en.innerHTML = `<span class="ring" aria-hidden="true"></span><span class="et"><span class="bolt" aria-hidden="true"></span>Charge</span><span class="refuse" id="ability-refuse" role="status" aria-live="polite"></span><div class="bar"><i></i></div>`;
  const fill = en.querySelector("i");
  const et = en.querySelector(".et");
  const ring = en.querySelector(".ring");
  el.append(row, en);
  document.body.appendChild(el);
  const slots = {};
  const HOLD_VERBS = new Set(["bolt", "wind"]);

  function iconUrl(id, lit) {
    const art = window.uiArt || (window.day && window.day.uiArt);
    if (art && art.verbIcon) return art.verbIcon(id, lit);
    return `textures/ui/verb-${id}-${lit ? "lit" : "unlit"}.svg`;
  }
  function slot(a, verbIndex) {
    const b = document.createElement("div");
    b.className = "ab";
    b.id = "ability-" + a.id;
    b.dataset.ability = a.id;
    b.dataset.hawkesUi = "1";
    b.dataset.touch = verbs.includes(a.id) ? "1" : "0";
    if (verbIndex >= 0) b.dataset.verb = String(verbIndex);
    b.setAttribute("role", "button");
    b.setAttribute("aria-label", `${a.name}, costs ${a.cost} Charge`);
    b.innerHTML = `<span class="face"><img class="ico" alt="" draggable="false"/><span class="wipe" aria-hidden="true"></span></span><span class="c">${a.cost}</span><span class="cd"></span>`;
    const ico = b.querySelector(".ico");
    ico.src = iconUrl(a.id, true);
    const down = (e) => {
      b.classList.add("pressed");
      if (HOLD_VERBS.has(a.id) && onHold) {
        onHold(a.id, true);
        b.classList.add("held");
      } else if (onPress) onPress(a.id);
      e.preventDefault();
    };
    const up = (e) => {
      b.classList.remove("pressed");
      if (HOLD_VERBS.has(a.id) && onHold) {
        onHold(a.id, false);
        b.classList.remove("held");
      }
      if (e) e.preventDefault();
    };
    b.addEventListener("pointerdown", down);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("pointerleave", (e) => { if (e.buttons) up(e); });
    row.appendChild(b);
    slots[a.id] = { b, wipe: b.querySelector(".wipe"), cd: b.querySelector(".cd"), ico };
  }

  window.addEventListener("day:power", (e) => {
    const d = e.detail || {};
    let id = d.power;
    if (id === "storm") id = "bolt";
    if (id === "gust" || id === "gale" || id === "tornado") id = "wind";
    const sl = slots[id];
    if (!sl || d.action === "denied") return;
    sl.b.classList.remove("pulse");
    void sl.b.offsetWidth;
    sl.b.classList.add("pulse");
    setTimeout(() => sl.b.classList.remove("pulse"), 340);
  });
  let refuseTimer = 0;
  /** A line in the Charge row for a moment (a locked or too-costly tap); it is a timeout, not a poll. */
  function refuse(text) {
    const r = en.querySelector(".refuse");
    r.textContent = text || "";
    en.classList.toggle("refused", !!text);
    clearTimeout(refuseTimer);
    if (text) refuseTimer = setTimeout(() => en.classList.remove("refused"), 1800);
  }

  function paint(visible) {
    el.hidden = !visible;
    if (!visible) return;
    const s = abilities.now();
    verbs.forEach((id, i) => {
      const a = s.abilities.find((x) => x.id === id);
      if (!a) return;
      if (!slots[id]) slot(a, i);
      const sl = slots[id];
      // Wind's cooldown is the longest of its depths still cooling.
      let remaining = a.remaining;
      let fraction = a.fraction;
      let locked = a.locked;
      let affordable = a.affordable;
      let active = a.active;
      if (id === "wind") {
        ["gust", "gale", "tornado"].forEach((hid) => {
          const h = s.abilities.find((x) => x.id === hid);
          if (!h) return;
          if (h.remaining > remaining) { remaining = h.remaining; fraction = h.fraction; }
          if (h.active) active = true;
        });
      }
      if (id === "bolt") {
        const h = s.abilities.find((x) => x.id === "storm");
        if (h && h.remaining > remaining) { remaining = h.remaining; fraction = h.fraction; }
        if (h && h.active) active = true;
      }
      const cooling = remaining > 0.05;
      const ready = !locked && !cooling && affordable;
      sl.b.classList.toggle("cooling", cooling);
      sl.b.classList.toggle("locked", locked);
      sl.b.classList.toggle("poor", !affordable && !locked);
      sl.b.classList.toggle("active", active);
      sl.b.classList.toggle("ready", ready);
      if (sl.wipe) sl.wipe.style.setProperty("--cd", String(Math.max(0, Math.min(1, fraction))));
      sl.cd.textContent = cooling ? remaining.toFixed(remaining < 10 ? 1 : 0) : "";
      if (sl.ico) {
        const next = iconUrl(id, ready || active);
        if (sl.ico.dataset.src !== next) {
          sl.ico.dataset.src = next;
          sl.ico.src = next;
        }
      }
      sl.b.dataset.state = locked ? "locked" : cooling ? "cooldown" : affordable ? "ready" : "energy";
    });
    // Hide any non-verb slots left over from an older paint (storm etc. never get slots now).
    Object.keys(slots).forEach((id) => {
      if (!verbs.includes(id)) slots[id].b.hidden = true;
    });
    en.setAttribute("aria-valuemax", String(s.max));
    en.setAttribute("aria-valuenow", String(Math.round(s.energy)));
    et.innerHTML = `<span class="bolt" aria-hidden="true"></span>Charge ${Math.round(s.energy)}`;
    fill.style.width = Math.max(0, Math.min(100, (s.energy / s.max) * 100)) + "%";
    if (ring) ring.style.setProperty("--charge-deg", `${Math.max(0, Math.min(360, (s.energy / s.max) * 360))}deg`);
  }
  return { paint, refuse, el };
}

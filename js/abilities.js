/* ==========================================================================
   Abilities: the registry Small Weather's powers are called through.

   Each ability is { id, name, key, cost, cooldown, duration }: what it costs
   in Charge (the Pressure meter, same number; Body's "Energy" is a different
   meter), how long before it can be called again, and how long it lasts.
   Charge regenerates. use(id) is the one gate: it refuses a call that is on
   cooldown or costs more than he has, and says which. createAbilities() has
   no scene, so npm test can run it dry. startAbilityBar() is the on-screen
   row: key, name, cost, a cooldown sweep and the Charge bar, shown while
   he's the player's. js/powers.js registers the four (storm, bolt, gust,
   tornado) from day.config.js `powers`, and runs what each one does.
   ========================================================================== */

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

  return { lock, unlock, isLocked: (id) => locked.has(id), register, step, use, why, now, reset, get: (id) => byId[id] && view(byId[id]), ids: () => list.map((a) => a.id) };
}

/** The on-screen row. Returns { paint(visible), el }. No DOM in the tests: it returns a no-op. */
export const TOUCH_ABILITIES = ["bolt", "rain", "gale", "fog", "sunbreak"]; // the five on a phone; Storm, Gust and Tornado stay on the power pad
export function startAbilityBar(abilities, onPress) {
  const canDom = typeof document !== "undefined" && document.body && typeof document.body.append === "function" && document.head;
  if (!canDom) return { paint() {}, refuse() {}, el: null };
  const style = document.createElement("style");
  style.textContent = `
.abilitybar{z-index:6;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;font:600 0.74rem/1.15 system-ui,sans-serif;color:#e7eef8}
.abilitybar[hidden]{display:none}
.abilitybar .row{display:flex;gap:8px}
.abilitybar .ab{position:relative;width:64px;height:64px;box-sizing:border-box;border-radius:12px;border:1px solid rgba(126,200,255,.55);background:rgba(10,14,22,.62);overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;pointer-events:auto;cursor:pointer;touch-action:none}
.abilitybar .ab .k{font-size:1.05rem;color:#9fd4ff;letter-spacing:.04em}
.abilitybar .ab .n{font-size:.66rem;opacity:.85}
.abilitybar .ab .c{position:absolute;top:3px;right:5px;font-size:.62rem;color:#7ec8ff}
.abilitybar .ab .sweep{position:absolute;left:0;right:0;bottom:0;height:0;background:rgba(3,6,12,.72)}
.abilitybar .ab .cd{position:absolute;left:0;right:0;bottom:0;display:none;align-items:center;justify-content:center;padding:1px 0;font-size:.7rem;line-height:1;color:#fff;background:rgba(3,6,12,.8)}
.abilitybar .ab.cooling .cd{display:flex}
.abilitybar .ab.cooling .k,.abilitybar .ab.cooling .n{opacity:.5}
.abilitybar .ab.poor{border-color:rgba(196,85,74,.7)}
.abilitybar .ab.poor .k{color:#e08a80}
.abilitybar .ab.locked{opacity:.38;border-style:dashed;filter:grayscale(1)}
.abilitybar .ab.unlocked-now{border-color:#f0c27a;box-shadow:0 0 14px rgba(240,194,122,.9)}
.abilitybar .ab.pulse{animation:abpulse .32s ease-out}
@keyframes abpulse{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,255,255,.95)}35%{transform:scale(1.18);box-shadow:0 0 18px 6px rgba(126,200,255,.95)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(126,200,255,0)}}
.abilitybar .ab.cooling{border-color:rgba(255,255,255,.2);outline:2px solid rgba(240,168,74,.7);outline-offset:-2px}
.abilitybar .ab.active{border-color:#fff;box-shadow:0 0 12px rgba(126,200,255,.9)}
/* Charge (ability spend) — amber bolt look, not Body's Energy and not the blue Pressure chip */
.abilitybar .charge{width:100%;min-width:230px;color:#f3e0b0}
.abilitybar .charge .et{display:inline-flex;align-items:center;gap:5px;letter-spacing:.04em}
.abilitybar .charge .et .bolt{display:inline-block;width:11px;height:14px;flex:0 0 auto;background:linear-gradient(165deg,#ffe29a,#f0a84a);clip-path:polygon(55% 0%,18% 55%,46% 55%,30% 100%,82% 42%,54% 42%)}
.abilitybar .charge .bar{margin-top:3px;height:8px;border-radius:99px;background:rgba(20,12,4,.55);border:1px solid rgba(240,168,74,.55);overflow:hidden;box-shadow:0 0 10px rgba(240,168,74,.18)}
.abilitybar .charge .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#7a3e12,#f0a84a 55%,#ffe29a);border-radius:99px}
.abilitybar .refuse{display:none;color:#f0c27a}
.abilitybar .charge.refused .refuse{display:block}
.abilitybar .charge.refused .et{display:none}
/* phone: five tap buttons above the power pad, right-aligned; the stick, jump and pad are untouched */
html.touch-ui .abilitybar{align-items:stretch;gap:4px;width:calc(5 * var(--abw) + 4 * 5px);--abw:min(54px,calc((100vw - 44px) / 5));font-size:.62rem}
html.touch-ui .abilitybar .row{gap:5px}
html.touch-ui .abilitybar .ab{width:var(--abw);height:54px;min-width:44px;min-height:44px;border-radius:10px;gap:0;justify-content:flex-end;padding-bottom:6px}
html.touch-ui .abilitybar .ab[data-touch="0"]{display:none}
html.touch-ui .abilitybar .ab .k{display:none}
html.touch-ui .abilitybar .ab .n{font-size:.6rem;opacity:1;color:#d5e8ff;white-space:nowrap}
html.touch-ui .abilitybar .ab .c{top:4px;right:5px;font-size:.66rem}
html.touch-ui .abilitybar .ab .cd{top:0;bottom:auto;height:100%;padding:0;font-size:.95rem;background:rgba(3,6,12,.55)}
html.touch-ui .abilitybar .charge{min-width:0}
html.touch-ui .abilitybar .charge .et{font-size:.62rem}
@media (orientation:landscape) and (max-height:520px){
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
  en.innerHTML = `<span class="et"><span class="bolt" aria-hidden="true"></span>Charge</span><span class="refuse" id="ability-refuse" role="status" aria-live="polite"></span><div class="bar"><i></i></div>`;
  const fill = en.querySelector("i");
  const et = en.querySelector(".et");
  el.append(row, en);
  document.body.appendChild(el);
  const slots = {};

  function slot(a) {
    const b = document.createElement("div");
    b.className = "ab";
    b.id = "ability-" + a.id;
    b.dataset.ability = a.id;
    b.dataset.touch = TOUCH_ABILITIES.includes(a.id) ? "1" : "0";
    b.setAttribute("role", "button");
    b.setAttribute("aria-label", `${a.name}, key ${String(a.key).toUpperCase()}, costs ${a.cost} Charge`);
    b.innerHTML = `<span class="c">${a.cost}</span><span class="k">${String(a.key).toUpperCase()}</span><span class="n">${a.name}</span><span class="sweep"></span><span class="cd"></span>`;
    b.addEventListener("pointerdown", (e) => {
      if (onPress) onPress(a.id);
      e.preventDefault();
    });
    row.appendChild(b);
    slots[a.id] = { b, sweep: b.querySelector(".sweep"), cd: b.querySelector(".cd") };
  }

  window.addEventListener("day:power", (e) => {
    const d = e.detail || {};
    const sl = slots[d.power];
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
    abilities.ids().forEach((id) => {
      const a = s.abilities.find((x) => x.id === id);
      if (!slots[id]) slot(a);
      const sl = slots[id];
      sl.b.classList.toggle("cooling", a.remaining > 0.05);
      sl.b.classList.toggle("locked", a.locked);
      sl.b.classList.toggle("poor", !a.affordable && !a.locked);
      sl.b.classList.toggle("active", a.active);
      sl.sweep.style.height = Math.round(a.fraction * 100) + "%";
      sl.cd.textContent = a.remaining > 0.05 ? a.remaining.toFixed(a.remaining < 10 ? 1 : 0) : "";
      sl.b.dataset.state = a.locked ? "locked" : a.remaining > 0.05 ? "cooldown" : a.affordable ? "ready" : "energy";
    });
    en.setAttribute("aria-valuemax", String(s.max));
    en.setAttribute("aria-valuenow", String(Math.round(s.energy)));
    et.innerHTML = `<span class="bolt" aria-hidden="true"></span>Charge ${Math.round(s.energy)}`;
    fill.style.width = Math.max(0, Math.min(100, (s.energy / s.max) * 100)) + "%";
  }
  return { paint, refuse, el };
}

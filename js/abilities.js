/* ==========================================================================
   Abilities: the registry Small Weather's powers are called through.

   Each ability is { id, name, key, cost, cooldown, duration }: what it costs
   in Energy (the Pressure meter, same number), how long before it can be
   called again, and how long it lasts. Energy regenerates. use(id) is the one
   gate: it refuses a call that is on cooldown or costs more than he has, and
   says which. createAbilities() has no scene, so npm test can run it dry.
   startAbilityBar() is the on-screen row: key, name, cost, a cooldown sweep
   and the Energy bar, shown while he's the player's.
   js/powers.js registers the four (storm, bolt, gust, tornado) from
   day.config.js `powers`, and runs what each one does.
   ========================================================================== */

export function createAbilities(opt) {
  opt = opt || {};
  const max = opt.max > 0 ? opt.max : 100;
  let energy = Math.max(0, Math.min(max, opt.start || 0));
  let clock = 0;
  const list = [];
  const byId = {};

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

  /** Why `id` can't be used right now: "unknown", "cooldown" or "energy"; null when it can. */
  function why(id) {
    const a = byId[id];
    if (!a) return "unknown";
    if (clock < a.readyAt - 1e-6) return "cooldown";
    if (energy < a.cost - 1e-4) return "energy";
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
      ready: !why(a.id),
      uses: a.uses,
    };
  }

  function now() {
    return { energy, max, abilities: list.map(view) };
  }

  /** Back to empty and ready (a new episode of control). Energy is kept unless asked. */
  function reset(toEnergy) {
    list.forEach((a) => {
      a.readyAt = 0;
      a.activeUntil = 0;
    });
    if (toEnergy != null) energy = Math.max(0, Math.min(max, toEnergy));
  }

  return { register, step, use, why, now, reset, get: (id) => byId[id] && view(byId[id]), ids: () => list.map((a) => a.id) };
}

/** The on-screen row. Returns { paint(visible), el }. No DOM in the tests: it returns a no-op. */
export function startAbilityBar(abilities, onPress) {
  const canDom = typeof document !== "undefined" && document.body && typeof document.body.append === "function" && document.head;
  if (!canDom) return { paint() {}, el: null };
  const style = document.createElement("style");
  style.textContent = `
.abilitybar{position:fixed;z-index:6;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;font:600 0.74rem/1.15 system-ui,sans-serif;color:#e7eef8}
.abilitybar[hidden]{display:none}
.abilitybar .row{display:flex;gap:8px}
.abilitybar .ab{position:relative;width:64px;height:64px;box-sizing:border-box;border-radius:12px;border:1px solid rgba(126,200,255,.55);background:rgba(10,14,22,.62);overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;pointer-events:auto;cursor:pointer;touch-action:none}
.abilitybar .ab .k{font-size:1.05rem;color:#9fd4ff;letter-spacing:.04em}
.abilitybar .ab .n{font-size:.66rem;opacity:.85}
.abilitybar .ab .c{position:absolute;top:3px;right:5px;font-size:.62rem;color:#7ec8ff}
.abilitybar .ab .sweep{position:absolute;left:0;right:0;bottom:0;height:0;background:rgba(3,6,12,.72)}
.abilitybar .ab .cd{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:.95rem;color:#fff}
.abilitybar .ab.cooling .cd{display:flex}
.abilitybar .ab.poor{border-color:rgba(196,85,74,.7)}
.abilitybar .ab.poor .k{color:#e08a80}
.abilitybar .ab.active{border-color:#fff;box-shadow:0 0 12px rgba(126,200,255,.9)}
.abilitybar .energy{width:100%;min-width:230px}
.abilitybar .energy .bar{margin-top:3px;height:8px;border-radius:99px;background:rgba(8,12,20,.55);border:1px solid rgba(126,200,255,.45);overflow:hidden}
.abilitybar .energy .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#1a4c7a,#7ec8ff);border-radius:99px}
html.touch-ui .abilitybar{display:none}
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
  en.className = "energy";
  en.id = "energy";
  en.setAttribute("role", "meter");
  en.setAttribute("aria-label", "Energy");
  en.setAttribute("aria-valuemin", "0");
  en.innerHTML = `<span class="et">Energy</span><div class="bar"><i></i></div>`;
  const fill = en.querySelector("i");
  el.append(row, en);
  document.body.appendChild(el);
  const slots = {};

  function slot(a) {
    const b = document.createElement("div");
    b.className = "ab";
    b.id = "ability-" + a.id;
    b.dataset.ability = a.id;
    b.setAttribute("role", "button");
    b.setAttribute("aria-label", `${a.name}, key ${String(a.key).toUpperCase()}, costs ${a.cost}`);
    b.innerHTML = `<span class="c">${a.cost}</span><span class="k">${String(a.key).toUpperCase()}</span><span class="n">${a.name}</span><span class="sweep"></span><span class="cd"></span>`;
    b.addEventListener("pointerdown", (e) => {
      if (onPress) onPress(a.id);
      e.preventDefault();
    });
    row.appendChild(b);
    slots[a.id] = { b, sweep: b.querySelector(".sweep"), cd: b.querySelector(".cd") };
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
      sl.b.classList.toggle("poor", !a.affordable);
      sl.b.classList.toggle("active", a.active);
      sl.sweep.style.height = Math.round(a.fraction * 100) + "%";
      sl.cd.textContent = a.remaining > 0.05 ? a.remaining.toFixed(a.remaining < 10 ? 1 : 0) : "";
      sl.b.dataset.state = a.remaining > 0.05 ? "cooldown" : a.affordable ? "ready" : "energy";
    });
    en.setAttribute("aria-valuemax", String(s.max));
    en.setAttribute("aria-valuenow", String(Math.round(s.energy)));
    en.querySelector(".et").textContent = `Energy ${Math.round(s.energy)}`;
    fill.style.width = Math.max(0, Math.min(100, (s.energy / s.max) * 100)) + "%";
  }
  return { paint, el };
}

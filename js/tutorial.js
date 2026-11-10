/* ==========================================================================
   First visit. One short card, once per save: one sentence, "Take it" /
   "Just walk". The sentence and its count come from the real ability list
   (window.powers); the day is held still behind the card until it is
   answered. "Take it" takes control and teaches the first two powers by doing
   (the button is highlighted, a short bark when it is used); the others get a
   one-time tooltip on first hover or tap. Other playtest scenarios leave it
   quiet.
   ========================================================================== */

const DEFAULTS = {
  storageKey: "icanbe.tutorial",
  tipKey: "icanbe.tips",
  sentence: "He can call {n} kinds of weather. Learn two?",
  take: "Take it",
  skip: "Just walk",
  teach: ["bolt", "rain"],
  prompts: {
    bolt: { key: "Press {key}: lightning.", touch: "Tap Lightning." },
    rain: { key: "Now {key}: rain.", touch: "Now tap Rain." },
  },
  barks: { bolt: "That woke the roof up.", rain: "Smells like the street after." },
  tip: "{key}: {name}. Costs {cost} Charge.",
};

export function startTutorial() {
  const day = window.day;
  const cfg = Object.assign({}, DEFAULTS, (window.DAY_CONFIG && window.DAY_CONFIG.tutorial) || {});
  const key = cfg.storageKey;
  const canDom = !!(document.body && document.body.append && document.head);
  let quiet = false;
  let card = null;
  let sentenceEl = null;
  let rowEl = null;
  let phase = "idle"; // idle | ask | teach | done
  let step = 0;
  let shownAt = 0;
  let used = null;
  let tipEl = null;
  let tipTimer = 0;

  try {
    const id = new URLSearchParams(location.search).get("playtest");
    if (id && id !== "first-visit" && id !== "newcomer" && id !== "smoke") quiet = true;
    else if (!id && navigator.webdriver) quiet = true;
  } catch (e) { /* no location */ }

  const store = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const seen = () => quiet || !!store(key);
  const emit = (action, extra) => {
    if (typeof window.CustomEvent !== "function") return;
    window.dispatchEvent(new CustomEvent("day:tutorial", { detail: Object.assign({ action }, extra || {}) }));
  };
  const abilities = () => {
    const p = window.powers;
    return p && p.now ? p.now().abilities || [] : [];
  };
  const touchy = () => {
    if (document.documentElement.classList.contains("touch-ui")) return true;
    try { return window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 700; } catch (e) { return false; }
  };
  const blocking = () => phase === "ask" && !!card && !card.hidden;
  const hold = (on) => { if (day && day.hold) day.hold(on); };
  const slot = (id) => document.getElementById("ability-" + id);

  function mark(id) {
    document.querySelectorAll(".abilitybar .ab.tut-now").forEach((b) => b.classList.remove("tut-now"));
    const b = id && slot(id);
    if (b) b.classList.add("tut-now");
  }
  function prompt() {
    const id = cfg.teach[step];
    const a = abilities().find((x) => x.id === id);
    const p = cfg.prompts[id] || {};
    const text = touchy() ? p.touch || "" : (p.key || "").replace("{key}", a ? String(a.key).toUpperCase() : "");
    sentenceEl.textContent = text;
    mark(id);
    emit("step", { step: id });
  }
  function finish(how) {
    if (phase === "done" || phase === "idle") return;
    const was = phase;
    phase = "done";
    save(key, how);
    hold(false);
    mark(null);
    if (card) card.hidden = true;
    emit(how, { seconds: shownAt ? Math.round((performance.now() - shownAt) / 100) / 10 : 0, from: was });
  }
  function take() {
    if (phase !== "ask") return;
    save(key, "take");
    hold(false);
    const p = window.powers;
    if (p && p.abilities && p.abilities.reset) p.abilities.reset(p.now().max);
    const btn = document.getElementById("control");
    if (btn && !btn.disabled) btn.click();
    else if (day && day.control) day.control.take();
    phase = "teach";
    step = 0;
    rowEl.hidden = true;
    emit("take");
    prompt();
  }
  function used1(id) {
    if (phase !== "teach" || id !== cfg.teach[step]) return;
    const bark = cfg.barks[id];
    if (bark && day && day.note) day.note(bark);
    if (bark) emit("bark", { id, text: bark });
    step += 1;
    if (step >= cfg.teach.length) finish("done");
    else prompt();
  }
  function show() {
    if (!canDom || seen() || phase === "ask") return false;
    if (!card) build();
    const n = abilities().length;
    sentenceEl.textContent = cfg.sentence.replace("{n}", String(n));
    rowEl.hidden = false;
    phase = "ask";
    shownAt = performance.now();
    card.hidden = false;
    hold(true);
    emit("show", { abilities: n });
    return true;
  }

  function tip(id) {
    const seenTips = (store(cfg.tipKey) || "").split(",");
    if (seenTips.includes(id) || phase === "ask") return;
    const a = abilities().find((x) => x.id === id);
    const b = slot(id);
    if (!a || !b || (document.documentElement.classList.contains("touch-ui") && b.dataset.touch === "0")) return;
    save(cfg.tipKey, seenTips.concat(id).filter(Boolean).join(","));
    tipEl.textContent = cfg.tip.replace("{key}", String(a.key).toUpperCase()).replace("{name}", a.name).replace("{cost}", a.cost);
    tipEl.hidden = false;
    const r = b.getBoundingClientRect();
    const w = tipEl.offsetWidth;
    tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    tipEl.style.top = Math.max(8, r.top - tipEl.offsetHeight - 8) + "px";
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tipEl.hidden = true; }, 3200);
    emit("tip", { id });
  }

  function build() {
    const style = document.createElement("style");
    style.textContent = `
.tutorial{z-index:8;width:min(300px,calc(100vw - 32px));padding:12px 14px 10px;border-radius:16px;background:rgba(14,16,22,.9);border:1px solid rgba(240,194,122,.45);color:#f6f1e8;font:600 1rem/1.3 Fraunces,Georgia,serif;box-shadow:0 16px 40px rgba(0,0,0,.4);pointer-events:auto}
.tutorial[hidden]{display:none}
.tutorial p{margin:0}
.tutorial .row{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
.tutorial .row[hidden]{display:none}
.tutorial button{appearance:none;min-height:44px;padding:8px 16px;border-radius:999px;border:1px solid rgba(246,241,232,.28);background:transparent;color:#f0c27a;font:600 0.85rem Outfit,system-ui,sans-serif;cursor:pointer}
.tutorial button.take{background:#f0c27a;border-color:#f0c27a;color:#141210}
.abilitybar .ab.tut-now{border-color:#f0c27a;box-shadow:0 0 16px rgba(240,194,122,.95);animation:tutnow 1s ease-in-out infinite}
@keyframes tutnow{50%{box-shadow:0 0 26px rgba(240,194,122,.5)}}
.ab-tip{position:fixed;z-index:9;max-width:220px;padding:6px 10px;border-radius:10px;background:rgba(14,16,22,.92);border:1px solid rgba(126,200,255,.55);color:#e7eef8;font:600 .78rem/1.3 system-ui,sans-serif;pointer-events:none}
.ab-tip[hidden]{display:none}
`;
    document.head.appendChild(style);
    card = document.createElement("div");
    card.id = "tutorial";
    card.className = "tutorial";
    card.hidden = true;
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "First visit");
    card.innerHTML = `<p class="do" id="tutorial-text"></p><div class="row"><button type="button" class="take" id="tutorial-take"></button><button type="button" id="tutorial-skip"></button></div>`;
    sentenceEl = card.querySelector(".do");
    rowEl = card.querySelector(".row");
    const takeBtn = card.querySelector("#tutorial-take");
    const skipBtn = card.querySelector("#tutorial-skip");
    takeBtn.textContent = cfg.take;
    skipBtn.textContent = cfg.skip;
    takeBtn.addEventListener("click", take);
    skipBtn.addEventListener("click", () => finish("skip"));
    document.body.appendChild(card);
    tipEl = document.createElement("div");
    tipEl.className = "ab-tip";
    tipEl.hidden = true;
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
    const onTip = (e) => {
      const b = e.target && e.target.closest && e.target.closest(".abilitybar .ab");
      if (b && b.dataset.ability && !cfg.teach.includes(b.dataset.ability)) tip(b.dataset.ability);
    };
    document.addEventListener("pointerover", onTip);
    document.addEventListener("pointerdown", onTip, true);
  }

  if (canDom) {
    window.addEventListener("day:power", (e) => {
      const d = (e && e.detail) || {};
      if (d.action && d.action !== "denied") used1(d.power);
    });
    // Enter takes it too, as it takes control anywhere else.
    window.addEventListener("keydown", (e) => {
      if (blocking() && e.key === "Enter") { e.preventDefault(); e.stopPropagation(); take(); }
    }, true);
  }

  const api = {
    blocking,
    active: () => phase === "ask" || phase === "teach",
    take,
    reset() {
      quiet = false;
      try { localStorage.removeItem(key); localStorage.removeItem(cfg.tipKey); } catch (e) { /* private mode */ }
      phase = "idle";
      if (card) card.hidden = true;
      return show();
    },
    skip() { finish("skip"); },
    quiet() {
      quiet = true;
      if (phase === "ask") hold(false);
      phase = "idle";
      mark(null);
      if (card) card.hidden = true;
    },
    now() {
      return {
        showing: blocking(),
        phase,
        step: phase === "teach" ? cfg.teach[step] : null,
        seen: seen(),
        sentence: sentenceEl ? sentenceEl.textContent : "",
        abilities: abilities().length,
        seconds: shownAt && phase !== "done" ? (performance.now() - shownAt) / 1000 : 0,
        used,
      };
    },
  };
  if (day) day.tutorial = api;
  window.tutorial = api;
  if (canDom && !seen()) setTimeout(show, 0);
  return api;
}

if (window.day) startTutorial();

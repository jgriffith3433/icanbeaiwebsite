/* ==========================================================================
   First visit. A short card (day.config.js `tutorial`) walks a new player
   through take control, a few steps, a jump, one lightning strike, and let
   go. Skip or finish and it is not shown again. Other playtest scenarios
   leave it quiet so they are not covered by the card.
   ========================================================================== */

const DEFAULTS = {
  storageKey: "icanbe.tutorial",
  skip: "Skip",
  done: "That's enough. His day is still running.",
  // The first step also says what this is, for someone who has never seen the page.
  intro: {
    title: "This is Small Weather's day, live.",
    line: "He lives it on his own, in real time. Take him over: walk the city, jump the roofs, call down the storm.",
    take: "Take control",
    hint: "Or press Enter.",
  },
  steps: [
    { id: "take", do: "Take control.", hint: "Enter, or the button.", touch: "Tap Take control." },
    { id: "move", do: "Walk him.", hint: "WASD or the arrows. Shift runs.", touch: "Drag the stick. Push it to the edge to run." },
    { id: "jump", do: "Jump.", hint: "Space. Twice more in the air. Hold it to float down.", touch: "Jump. Twice more in the air. Hold it to float down." },
    { id: "bolt", do: "Throw one lightning strike.", hint: "E, at the reticle. It spends Pressure.", touch: "Tap Bolt. It spends Pressure." },
    { id: "letgo", do: "Let go.", hint: "Esc. He walks back to where his day is.", touch: "Tap Let go. He walks back to where his day is." },
  ],
};

export function startTutorial() {
  const day = window.day;
  const cfg = Object.assign({}, DEFAULTS, (window.DAY_CONFIG && window.DAY_CONFIG.tutorial) || {});
  cfg.steps = (cfg.steps && cfg.steps.length ? cfg.steps : DEFAULTS.steps).map((s) => Object.assign({}, s));
  const key = cfg.storageKey || DEFAULTS.storageKey;
  const canDom = !!(document.body && document.body.append && document.head);
  let index = 0;
  let shownAt = 0;
  let moveFrom = null;
  let jumpFrom = null;
  let boltLanded = false;
  let watching = false;
  let quietForPlaytest = false;

  try {
    // A bot (any scenario but first-visit and smoke) starts with empty storage: keep the card out of its way.
    const id = new URLSearchParams(location.search).get("playtest");
    if (id && id !== "first-visit" && id !== "smoke") quietForPlaytest = true;
  } catch (e) { /* no location */ }

  function seen() {
    if (quietForPlaytest) return true;
    try { return !!localStorage.getItem(key); } catch (e) { return false; }
  }
  function remember(how) {
    try { localStorage.setItem(key, how); } catch (e) { /* private mode: it may show next time */ }
  }
  function emit(action, extra) {
    if (!window.dispatchEvent || typeof window.CustomEvent !== "function") return;
    window.dispatchEvent(new CustomEvent("day:tutorial", { detail: Object.assign({ action, step: cfg.steps[index] && cfg.steps[index].id }, extra || {}) }));
  }

  function touchy() {
    const html = document.documentElement;
    if (html && html.classList.contains("touch-ui")) return true;
    try { return window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 700; } catch (e) { return false; }
  }

  let card = null;
  let titleEl = null;
  let hintEl = null;
  let introEl = null;
  let takeBtn = null;
  let doneTimer = 0;
  function blocking() {
    return !!(card && !card.hidden && index < cfg.steps.length);
  }
  function paint() {
    if (!card) return;
    const step = cfg.steps[index];
    const intro = step && step.id === "take" && cfg.intro;
    card.classList.toggle("intro", !!intro);
    introEl.hidden = takeBtn.hidden = !intro;
    if (!step) {
      titleEl.textContent = cfg.done;
      hintEl.textContent = "";
      return;
    }
    if (intro) {
      introEl.querySelector(".title").textContent = intro.title;
      introEl.querySelector(".line").textContent = intro.line;
      takeBtn.textContent = intro.take || step.do;
      titleEl.textContent = "";
      hintEl.textContent = touchy() ? "" : intro.hint || "";
    } else {
      titleEl.textContent = step.do;
      hintEl.textContent = (touchy() && step.touch) || step.hint || "";
    }
    card.setAttribute("data-step", step.id);
  }
  function armStep() {
    const step = cfg.steps[index];
    const st = day && day.control && day.control.state ? day.control.state() : null;
    if (step && step.id === "move" && st) moveFrom = { x: st.x, z: st.z };
    if (step && step.id === "jump" && st) jumpFrom = { y: st.y, flights: st.flights || 0 };
    if (step && step.id === "bolt") boltLanded = false;
    paint();
    emit("step");
  }
  function finish(how) {
    if (!blocking() && how !== "reset") return;
    const elapsed = shownAt ? (performance.now() - shownAt) / 1000 : 0;
    remember(how);
    emit(how, { seconds: Math.round(elapsed * 10) / 10 });
    index = cfg.steps.length;
    clearTimeout(doneTimer);
    if (!card) return;
    if (how === "done") {
      // The last line stays a moment; nothing waits on it.
      paint();
      card.classList.add("finished");
      doneTimer = setTimeout(() => { card.hidden = true; }, 2600);
    } else card.hidden = true;
  }
  function advance() {
    index += 1;
    if (index >= cfg.steps.length) finish("done");
    else armStep();
  }
  function stepDone() {
    const step = cfg.steps[index];
    if (!step || !day || !day.control) return false;
    const st = day.control.state();
    const mode = day.control.mode();
    if (step.id === "take") return mode === "control";
    if (step.id === "move") {
      if (!st || !moveFrom) return false;
      return Math.hypot(st.x - moveFrom.x, st.z - moveFrom.z) > 0.55;
    }
    if (step.id === "jump") {
      if (!st) return false;
      const base = jumpFrom || { y: st.y, flights: st.flights || 0 };
      return st.jumps > 0 || st.flights > base.flights || (!st.grounded && st.y > base.y + 0.35);
    }
    if (step.id === "bolt") return boltLanded;
    if (step.id === "letgo") return mode === "returning" || mode === "schedule";
    return false;
  }
  function tick() {
    watching = false;
    if (!blocking()) return;
    if (stepDone()) advance();
    if (blocking()) {
      watching = true;
      requestAnimationFrame(tick);
    }
  }
  function watch() {
    if (watching || !blocking()) return;
    watching = true;
    requestAnimationFrame(tick);
  }
  function show() {
    if (!canDom || seen() || blocking()) return false;
    if (!card) build();
    clearTimeout(doneTimer);
    card.classList.remove("finished");
    index = 0;
    shownAt = performance.now();
    moveFrom = null;
    jumpFrom = null;
    boltLanded = false;
    card.hidden = false;
    emit("show");
    armStep();
    watch();
    return true;
  }

  function build() {
    const style = document.createElement("style");
    style.textContent = `
.tutorial{position:fixed;z-index:8;left:50%;bottom:202px;top:auto;transform:translateX(-50%);width:min(300px,calc(100vw - 32px));padding:12px 14px 10px;border-radius:16px;background:rgba(14,16,22,.88);border:1px solid rgba(240,194,122,.45);color:#f6f1e8;font:500 0.95rem/1.35 Outfit,system-ui,sans-serif;box-shadow:0 16px 40px rgba(0,0,0,.4);pointer-events:auto}
.tutorial[hidden]{display:none}
.tutorial.finished .row{display:none}
.tutorial p{margin:0}
.tutorial .do{font:600 1.05rem/1.3 Fraunces,Georgia,serif}
.tutorial .hint{margin-top:4px;color:rgba(246,241,232,.68);font-size:0.82rem}
.tutorial .row{display:flex;justify-content:flex-end;margin-top:8px}
.tutorial button{appearance:none;min-height:44px;padding:8px 16px;border-radius:999px;border:1px solid rgba(246,241,232,.28);background:transparent;color:#f0c27a;font:600 0.85rem Outfit,system-ui,sans-serif;cursor:pointer}
.tutorial button:hover{background:rgba(240,194,122,.14)}
html.in-control .tutorial{bottom:232px}
.preview-public .tutorial{bottom:max(72px,calc(env(safe-area-inset-bottom) + 62px))}
.preview-public.in-control .tutorial{bottom:116px}
html.touch-ui .tutorial{width:min(280px,calc(100vw - 32px))}
html.touch-ui.in-control .tutorial{bottom:max(256px,calc(env(safe-area-inset-bottom) + 244px))}
.tutorial.intro{width:min(360px,calc(100vw - 32px));padding:16px 18px 12px}
.tutorial .intro-copy .title{font:600 1.3rem/1.25 Fraunces,Georgia,serif}
.tutorial .intro-copy .line{margin-top:6px;color:rgba(246,241,232,.82)}
.tutorial .do:empty{display:none}
.tutorial .row{gap:8px}
.tutorial button.take{background:#f0c27a;border-color:#f0c27a;color:#141210}
.tutorial button.take:hover{background:#f6d39b}
`;
    document.head.appendChild(style);
    card = document.createElement("div");
    card.id = "tutorial";
    card.className = "tutorial";
    card.hidden = true;
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "First visit");
    card.innerHTML = `<div class="intro-copy" hidden><p class="title"></p><p class="line"></p></div><p class="do"></p><p class="hint"></p><div class="row"><button type="button" class="take" id="tutorial-take" hidden></button><button type="button" id="tutorial-skip"></button></div>`;
    titleEl = card.querySelector(".do");
    hintEl = card.querySelector(".hint");
    introEl = card.querySelector(".intro-copy");
    takeBtn = card.querySelector(".take");
    takeBtn.addEventListener("click", () => {
      // The page's own Take control button, so it counts as a button press; the API if it isn't there.
      const btn = document.getElementById("control");
      if (btn && !btn.disabled) btn.click();
      else if (day && day.control) day.control.take();
    });
    const skip = card.querySelector("button");
    skip.textContent = cfg.skip || "Skip";
    skip.addEventListener("click", () => finish("skip"));
    document.body.appendChild(card);
  }

  if (canDom) {
    window.addEventListener("day:power", (e) => {
      const d = (e && e.detail) || {};
      if (d.power === "bolt" && d.action === "bolt") boltLanded = true;
      else if (blocking() && cfg.steps[index] && cfg.steps[index].id === "bolt" && d.action === "denied" && d.power === "bolt" && hintEl) {
        hintEl.textContent = touchy() ? "Pressure is still filling. Then tap Bolt." : "Pressure is still filling. Then E.";
      }
    });
    window.addEventListener("day:control", () => { paint(); watch(); });
  }

  const api = {
    blocking,
    active: blocking,
    reset() {
      quietForPlaytest = false;
      try { localStorage.removeItem(key); } catch (e) { /* private mode */ }
      if (card) card.hidden = true;
      index = 0;
      return show();
    },
    skip() { finish("skip"); },
    quiet() {
      quietForPlaytest = true;
      clearTimeout(doneTimer);
      if (card) card.hidden = true;
    },
    now() {
      const step = cfg.steps[index];
      return {
        showing: blocking(),
        step: blocking() && step ? step.id : null,
        index,
        seen: seen(),
        seconds: shownAt && blocking() ? (performance.now() - shownAt) / 1000 : 0,
      };
    },
  };
  if (day) day.tutorial = api;
  window.tutorial = api;
  if (canDom && !seen()) show();
  return api;
}

if (window.day) startTutorial();

/* ==========================================================================
   The opening: a short, skippable intro for a player's first Play. The day's
   own camera is on Small Weather (his model, never a stand-in) while a few
   plain lines say who he is and what the sky is. Then he is the player's.
   Candidate canon only (docs/story-spec.md): the game opens without a story;
   nothing here is needed to play. Words in day.config.js `opening`.
   Shown once (localStorage `opening.storageKey`), never in a bot's tab
   (?playtest= other than `opening`). Skip: the button, Esc, Enter or a tap
   on the card. `day.opening`: pending(), start(via), skip(via), now(), reset().
   ========================================================================== */

const DEFAULTS = {
  storageKey: "icanbe.opening",
  skip: "Skip",
  hint: "Esc to skip",
  beats: [
    { text: "This is Small Weather.", secs: 3.2 },
    { text: "He lives a developer's day. Alarm, coffee, a long drive, a desk.", secs: 4.2 },
    { text: "The sky over the district has been calm and clear for a long while.", secs: 4.2 },
    { text: "He can change that. A little rain. A little sun. Lightning, if he must.", secs: 4.4 },
    { text: "Your turn.", secs: 2.4 },
  ],
};

export function startOpening() {
  const day = window.day;
  if (!day || day.opening || !document.body) return day && day.opening;
  const cfg = Object.assign({}, DEFAULTS, (window.DAY_CONFIG && window.DAY_CONFIG.opening) || {});
  const html = document.documentElement;
  let param = null;
  try { param = new URLSearchParams(location.search).get("playtest"); } catch (e) { /* no location */ }
  const botElsewhere = !!param && param !== "opening";

  const style = document.createElement("style");
  style.textContent = `
.opening{position:fixed;inset:0;z-index:39;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding:0 24px max(120px,calc(env(safe-area-inset-bottom) + 100px));background:linear-gradient(180deg,rgba(6,9,16,.5) 0%,rgba(6,9,16,0) 22%,rgba(6,9,16,0) 55%,rgba(6,9,16,.72) 100%);color:#f6f1e8;font:500 1rem/1.4 Outfit,system-ui,sans-serif;opacity:1;transition:opacity .5s ease;cursor:pointer}
.opening[hidden]{display:none}
.opening.leaving{opacity:0;pointer-events:none}
.opening .who{margin:0 0 10px;font:600 .8rem/1 Outfit,system-ui,sans-serif;letter-spacing:.32em;text-transform:uppercase;color:#7ec8ff;text-shadow:0 0 18px rgba(126,200,255,.55)}
.opening .say{margin:0;max-width:26em;min-height:3.2em;text-align:center;font:600 clamp(1.3rem,3.4vw,2.1rem)/1.25 Fraunces,Georgia,serif;text-shadow:0 3px 22px rgba(0,0,0,.7);transition:opacity .35s ease}
.opening .say.swap{opacity:0}
.opening .dots{display:flex;gap:8px;margin-top:18px}
.opening .dots i{width:7px;height:7px;border-radius:50%;background:rgba(246,241,232,.28)}
.opening .dots i.on{background:#f0c27a}
.opening button{appearance:none;position:absolute;top:max(22px,env(safe-area-inset-top));right:max(24px,env(safe-area-inset-right));min-height:44px;min-width:44px;padding:10px 24px;border-radius:999px;border:1px solid rgba(246,241,232,.32);background:rgba(14,16,22,.55);color:#f6f1e8;font:600 .95rem Outfit,system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(10px)}
.opening button:hover{background:rgba(126,200,255,.16);border-color:rgba(126,200,255,.6)}
.opening button:focus-visible{outline:2px solid #7ec8ff;outline-offset:3px}
.opening .hint{margin-top:10px;font-size:.78rem;color:rgba(246,241,232,.55)}
html.opening-up .hud,html.opening-up .side,html.opening-up #control,html.opening-up .control-hint,html.opening-up #episodes,html.opening-up #neighbors-btn,html.opening-up .tutorial,html.opening-up #episode-offer,html.opening-up .public-toggle,html.opening-up .version-tag{visibility:hidden}
`;
  document.head.appendChild(style);

  const el = document.createElement("div");
  el.id = "opening";
  el.className = "opening";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Opening");
  el.innerHTML = `<button type="button" id="opening-skip"></button><p class="who">Small Weather</p><p class="say" id="opening-say" aria-live="polite"></p><div class="dots"></div><p class="hint"></p>`;
  const skipBtn = el.querySelector("#opening-skip");
  const sayEl = el.querySelector("#opening-say");
  const dotsEl = el.querySelector(".dots");
  skipBtn.textContent = cfg.skip;
  el.querySelector(".hint").textContent = cfg.hint;
  dotsEl.innerHTML = cfg.beats.map(() => "<i></i>").join("");
  document.body.appendChild(el);

  let up = false;
  let beat = -1;
  let timer = 0;
  let startedAt = 0;
  const log = [];
  const seen = () => { try { return !!localStorage.getItem(cfg.storageKey); } catch (e) { return true; } };
  const mark = (v) => { try { localStorage.setItem(cfg.storageKey, v); } catch (e) { /* private mode */ } };
  function emit(action, extra) {
    const detail = Object.assign({ action }, extra || {});
    log.push(Object.assign({ t: performance.now() }, detail));
    if (log.length > 30) log.shift();
    window.dispatchEvent(new CustomEvent("day:opening", { detail }));
  }
  function modelNow() {
    try { return (day.engineInfo && day.engineInfo().model) || ""; } catch (e) { return ""; }
  }
  function show(i) {
    beat = i;
    sayEl.classList.add("swap");
    setTimeout(() => {
      if (!up || beat !== i) return;
      sayEl.textContent = cfg.beats[i].text;
      sayEl.classList.remove("swap");
    }, i ? 300 : 0);
    [...dotsEl.children].forEach((d, k) => d.classList.toggle("on", k <= i));
    emit("beat", { i, text: cfg.beats[i].text, model: modelNow() });
    timer = setTimeout(() => (i + 1 < cfg.beats.length ? show(i + 1) : finish("end", "auto")), cfg.beats[i].secs * 1000);
  }
  function close(action, via) {
    if (!up) return false;
    up = false;
    clearTimeout(timer);
    html.classList.remove("opening-up");
    el.classList.add("leaving");
    setTimeout(() => { if (!up) el.hidden = true; }, 520);
    if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
    mark(action);
    emit(action, { via: via || "click", beat, seconds: Math.round((performance.now() - startedAt) / 100) / 10 });
    return true;
  }
  function takeControl() {
    const c = day.control;
    const btn = document.getElementById("control");
    if (c && c.mode && c.mode() === "schedule") {
      if (btn && !btn.disabled) btn.click();
      else if (!btn) c.take && c.take();
    }
  }
  function finish(action, via) {
    if (!close(action, via)) return false;
    takeControl();
    return true;
  }

  const api = {
    pending: () => !botElsewhere && !up && !seen(),
    showing: () => up,
    start(via) {
      if (up || cfg.beats.length === 0) return false;
      up = true;
      startedAt = performance.now();
      el.classList.remove("leaving");
      el.hidden = false;
      html.classList.add("opening-up");
      emit("start", { via: via || "play", model: modelNow() });
      show(0);
      try { skipBtn.focus({ preventScroll: true }); } catch (e) { /* old browser */ }
      return true;
    },
    skip: (via) => finish("skip", via || "api"),
    reset() { try { localStorage.removeItem(cfg.storageKey); } catch (e) { /* ignore */ } },
    now: () => ({ showing: up, beat, beats: cfg.beats.length, seen: seen(), model: modelNow(), log: log.slice() }),
  };
  skipBtn.addEventListener("click", (e) => { e.stopPropagation(); api.skip("click"); });
  el.addEventListener("click", () => api.skip("tap"));
  // Esc and Enter skip it (Enter is Take control, which the opening hands over to anyway).
  window.addEventListener("keydown", (e) => {
    if (!up || (e.key !== "Escape" && e.key !== "Enter")) return;
    e.preventDefault();
    e.stopPropagation();
    api.skip(e.key === "Escape" ? "key" : "enter");
  }, true);
  window.addEventListener("day:control", (e) => {
    if (up && e && e.detail && e.detail.action === "take") close("skip", "control");
  });

  day.opening = api;
  window.opening = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startOpening();

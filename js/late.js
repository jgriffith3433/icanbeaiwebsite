/* ==========================================================================
   Late chunk (js/late.js): what the roof and the first Rain don't need loads behind them.
   `loadLate()` returns ONE shared promise for episodes.js (with finale.js), windfog.js, moments.js and tornado.js (through
   powers.loadTornado). It starts right after the first cast that wasn't denied (`day:power`) or, whichever is first, on
   requestIdleCallback once he is the player's (`day:control` take). No polling timers. app.js loads it before the page is up
   on a bot's tab (?playtest=) other than cold-start, so every other scenario sees what it always did; cold-start reports
   `day.late.now()` before gameplay (episodes and tornado must still be false).
   The Episodes button exists from the first frame (`#episodes`, a placeholder episodes.js takes over): a tap while the chunk is
   in shows "Loading..." and opens the menu when it lands. A Tornado cast waits the same way (powers.js). Never a silent tap.
   `day.late`: load(), now() { started, loaded, modules }. Events `day:late` { feature, state: loading | ready }.
   Not here: neighbors.js (+ neighbor-arcs.js): the cold open's Birdie call and the street's asks need it on the roof.
   ========================================================================== */
const state = { started: false, loaded: false, modules: {} };
let promise = null;

export function loadLate() {
  if (promise) return promise;
  state.started = true;
  const day = window.day;
  const note = (name) => () => { state.modules[name] = true; };
  promise = Promise.all([
    import("./episodes.js").then(note("episodes")),
    import("./windfog.js").then(note("windfog")),
    import("./moments.js").then(note("moments")),
    day && day.powers && day.powers.loadTornado ? day.powers.loadTornado().then((ok) => { if (!ok) throw new Error("tornado"); note("tornado")(); }) : Promise.resolve(),
  ]).then(() => {
    state.loaded = true;
    window.dispatchEvent(new CustomEvent("day:late", { detail: { feature: "all", state: "ready" } }));
    return true;
  }).catch((err) => { promise = null; state.started = false; console.error("[late] the late chunk didn't load:", err); return false; });
  return promise;
}

(function install() {
  if (typeof document === "undefined") return;
  const day = (window.day = window.day || {});
  day.late = { load: loadLate, now: () => ({ started: state.started, loaded: state.loaded, modules: { ...state.modules } }) };

  // the Episodes button, there from the first frame: a tap before the chunk is in says so, then opens the menu
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "episodes";
  btn.className = "ep-btn";
  const label = "Episodes";
  btn.textContent = label;
  (document.getElementById("hud-left") || document.body).append(btn);
  let waiting = false;
  btn.addEventListener("click", () => {
    if (day.episodes || waiting) return; // episodes.js has taken the button over: its own handler runs
    waiting = true;
    btn.setAttribute("aria-busy", "true");
    btn.textContent = "Loading…";
    window.dispatchEvent(new CustomEvent("day:late", { detail: { feature: "episodes", state: "loading" } }));
    loadLate().then((ok) => {
      waiting = false;
      btn.removeAttribute("aria-busy");
      if (ok && day.episodes) btn.click(); // the real handler is on it now
      else btn.textContent = label;
    });
  });

  /* The chunk's parse and the shader compiles windfog/tornado start must not land inside a cast: the first Rain used to start it
     the instant it fired (a 1155 ms frame). It waits for QUIET_MS without a cast (each cast pushes it back), then for an idle
     callback; a take with no cast starts it after QUIET_MS + a cap. One timer at a time, no polling. */
  const QUIET_MS = 4000;
  let timer = 0;
  let armed = false;
  const later = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (window.requestIdleCallback) requestIdleCallback(() => loadLate(), { timeout: 6000 });
      else loadLate();
    }, ms);
  };
  const onPower = (e) => {
    const d = e.detail || {};
    if (d.action === "denied" || d.denied) return;
    armed = true;
    later(QUIET_MS); // every real cast pushes the load back
  };
  const onControl = (e) => {
    if (((e.detail || {}).action) !== "take") return;
    window.removeEventListener("day:control", onControl);
    if (!armed) later(QUIET_MS + 2000);
  };
  window.addEventListener("day:power", onPower);
  window.addEventListener("day:control", onControl);
})();

/* ==========================================================================
   The first cast pays off at once (critic: fun 4/10, "no people reacting"). The first Rain, Storm or Lightning he calls on a
   page load answers within 2 s, wherever he stands: the lawn greens (js/slice.js `firstCast`, 1.4 s instead of 5), every pond
   basin throws a ring, Birdie turns to look up at the sky (neighbors `wait`, the head-lift) and 0.4 s later cheers (her
   `thanks` gesture), the music of it is the existing sparkle. The street's own voiced ask/thanks still follows (street.js).
   `day.firstcast`: now(); event `day:firstcast` { action: "react" | "cheer" | "done" }.
   ========================================================================== */
export function startFirstCast() {
  const day = window.day;
  if (!day || day.firstcast || typeof document === "undefined") return day && day.firstcast;
  const log = [];
  let done = false;
  let t0 = 0;
  function emit(action, extra) {
    const detail = Object.assign({ action, t: Math.round(performance.now()) }, extra || {});
    log.push(detail);
    try { window.dispatchEvent(new CustomEvent("day:firstcast", { detail })); } catch (e) { /* no events */ }
  }
  const FIRST = ["rain", "storm", "bolt", "lightning"];
  window.addEventListener("day:power", (e) => {
    const d = (e && e.detail) || {};
    if (done || d.action === "denied") return;
    const p = d.power || d.action || d.id || d.name;
    if (!FIRST.includes(p)) return;
    done = true;
    t0 = performance.now();
    const N = day.neighbors;
    const alreadyWaiting = !!(N && N.waiting && N.waiting("birdie"));
    try { day.slice && day.slice.firstCast && day.slice.firstCast(1.4); } catch (err) { /* no slice */ }
    try { if (N && N.wait && !alreadyWaiting) N.wait("birdie", true, "first-cast"); } catch (err) { /* no neighbors */ }
    emit("react", { power: p, lawnSecs: 1.4, birdieLooking: !!(N && N.waiting && N.waiting("birdie")) });
    setTimeout(() => {
      try { if (N && N.gesture) N.gesture("birdie", "thanks"); } catch (err) { /* */ }
      emit("cheer", { ms: Math.round(performance.now() - t0) });
    }, 400);
    setTimeout(() => {
      try { if (!alreadyWaiting && N && N.waiting && N.waiting("birdie")) N.wait("birdie", false); } catch (err) { /* */ }
      emit("done", { ms: Math.round(performance.now() - t0) });
    }, 3200);
  });
  const api = {
    now: () => ({ done, ms: t0 ? Math.round(performance.now() - t0) : null, log: log.slice() }),
    reset: () => { done = false; },
  };
  day.firstcast = api;
  window.firstcast = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startFirstCast();

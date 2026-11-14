/* Lightning's answer on the street (J, 2026-11-14): a bolt near people sets off the nearest parked or stopped
   car's alarm (~4 s of two-tone whoops, hazard-style head lamps are the crowd's own), on top of the lamp and window
   flicker (js/cityscape.js) and the flinch and look-up (js/crowd.js, js/lightning.js). Reuses the crowd's cars; no assets.
   `day.streetreact.info()`: alarms, active, last { x, z, d }. Event `day:crowd` { action: "car-alarm", x, z, secs }. */

const RANGE = 60; // a bolt this near (m, from him / the camera) wakes a car
const SECS = 4.2;

function emit(detail) {
  try { window.dispatchEvent(new CustomEvent("day:crowd", { detail })); } catch (e) { /* node */ }
}

export function startStreetReact() {
  if (typeof window === "undefined" || window.streetreact) return window && window.streetreact;
  const st = { alarms: 0, until: 0, last: null };
  window.addEventListener("day:strike", (e) => {
    const d = (e && e.detail) || {};
    if (d.action !== "strike") return;
    const now = performance.now();
    if (now < st.until) return; // one alarm at a time
    let cars = [];
    try { cars = (window.day.crowd.positions().cars) || []; } catch (err) { /* */ }
    const sx = d.x != null ? d.x : 0, sz = d.z != null ? d.z : 0;
    let best = null, bd = 1e9;
    for (const c of cars) {
      const dd = Math.hypot(c.x - sx, c.z - sz);
      if (dd < bd) { bd = dd; best = c; }
    }
    // no car close to the bolt: a car anywhere in range of the camera still answers; else the bolt's own spot
    const at = best && bd < RANGE ? { x: best.x, z: best.z } : { x: sx, z: sz };
    st.alarms++;
    st.until = now + SECS * 1000;
    st.last = { x: at.x, z: at.z, d: Math.round(bd) };
    // it starts a beat after the crack, as the thunder rolls
    setTimeout(() => emit({ action: "car-alarm", x: at.x, z: at.z, secs: SECS }), 350);
  });
  window.streetreact = {
    info: () => ({ alarms: st.alarms, active: performance.now() < st.until, last: st.last, secs: SECS }),
  };
  if (window.day) window.day.streetreact = window.streetreact;
  return window.streetreact;
}
startStreetReact();

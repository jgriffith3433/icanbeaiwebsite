/* ==========================================================================
   Barks: Small Weather's small reactions in the log. Data: day.config.js `barks`;
   voice rules: docs/voice-style.md. A need that gets loud (hunger, thirst, tired,
   bladder, stress, boredom) or a sky that changes under him gets one short line,
   through day.note(). Each line is used once per in-game day: `fresh(text)` is
   how weather.js keeps its own lines from repeating too. Text only (no audio).
   ========================================================================== */

export function startBarks() {
  const day = window.day;
  if (!day || day.barks || !day.note) return day && day.barks;
  const cfg = () => (window.DAY_CONFIG && window.DAY_CONFIG.barks) || {};

  const used = new Map(); // day key -> Set of texts
  const log = [];
  let lastNeedAt = -1e9; // sim minutes (since the start of the day key)
  const needAt = Object.create(null);
  const was = Object.create(null); // need -> was it over its line last tick
  let prevMin = null;
  let prevKey = null;
  // The sky starts calm and clear and the forecast fires no "day:weather" event, so the first event a page
  // sees (Rain, key 3) is a real change from clear, not the page's first state.
  let prevWeather = "clear";
  let queued = null; // { state, at }
  const weatherAt = Object.create(null);

  function usedToday() {
    const k = day.now().key;
    if (!used.has(k)) {
      used.set(k, new Set());
      if (used.size > 3) used.delete(used.keys().next().value);
    }
    return used.get(k);
  }

  /** True the first time `text` is asked in this day, and then marks it. */
  function fresh(text) {
    const u = usedToday();
    if (u.has(text)) return false;
    u.add(text);
    return true;
  }

  function take(pool) {
    const u = usedToday();
    const open = (pool || []).filter((t) => !u.has(t));
    if (!open.length) return null;
    const text = open[Math.floor(Math.random() * open.length)];
    u.add(text);
    return text;
  }

  function say(kind, key, text) {
    day.note(text);
    const n = day.now();
    const d = { kind, key, text, minutes: n.minutes };
    log.push(d);
    if (log.length > 200) log.shift();
    if (window.dispatchEvent && typeof window.CustomEvent === "function") {
      window.dispatchEvent(new window.CustomEvent("day:bark", { detail: d }));
    }
    return text;
  }

  function raining() {
    const w = window.weather && window.weather.now && window.weather.now();
    return !!w && w.state === "rain" && w.blend > 0.5;
  }

  function over(spec, v) {
    return spec.above != null ? v > spec.above : spec.below != null ? v < spec.below : false;
  }

  function checkNeeds(body, min) {
    const C = cfg();
    const needs = C.needs || {};
    Object.keys(needs).forEach((k) => {
      if (k.includes("@")) return;
      const spec = needs[k];
      const hot = over(spec, body[k] != null ? body[k] : 0.5);
      const edge = hot && !was[k];
      was[k] = hot;
      if (!hot) return;
      const since = min - (needAt[k] != null ? needAt[k] : -1e9);
      if (!edge && since < (C.again || 150)) return;
      if (min - lastNeedAt < (C.gap || 25) || since < (C.again || 150)) return;
      const combo = raining() && needs[k + "@rain"];
      let text = combo ? take(combo.lines) : null;
      if (!text) text = take(spec.lines);
      if (!text) return;
      needAt[k] = min;
      lastNeedAt = min;
      say("need", k, text);
    });
  }

  function onWeather(e) {
    const d = (e && e.detail) || {};
    if (!d.state || d.state === prevWeather) return;
    const before = prevWeather;
    prevWeather = d.state;
    // The first state of the page, and the calm default, are not events.
    if (before == null) return;
    if (d.state === "clear" && !/^(rain|storm|fog|wind|snow)$/.test(before)) return;
    queued = { state: d.state, at: performance.now() / 1000 + (cfg().delay != null ? cfg().delay : 1.6) };
  }

  function flushWeather() {
    if (!queued || performance.now() / 1000 < queued.at) return;
    const q = queued;
    queued = null;
    const w = window.weather && window.weather.now && window.weather.now();
    if (w && w.state !== q.state) return; // already moved on
    const C = cfg();
    const min = day.now().minutes;
    if (min - (weatherAt[q.state] != null ? weatherAt[q.state] : -1e9) < (C.weatherGap || 12)) return;
    const text = take(C.weather && C.weather[q.state]);
    if (!text) return;
    weatherAt[q.state] = min;
    say("weather", q.state, text);
  }

  function tick() {
    const n = day.now();
    const fr = n.frame;
    if (fr && fr.body) {
      // A jump of the clock (day bar, new day) restarts the gaps: no barks for the time that was skipped.
      const jumped = prevKey !== n.key || prevMin == null || Math.abs(n.minutes - prevMin) > 45;
      if (jumped) {
        Object.keys(needAt).forEach((k) => delete needAt[k]);
        Object.keys(weatherAt).forEach((k) => delete weatherAt[k]);
        lastNeedAt = -1e9;
        Object.keys(cfg().needs || {}).forEach((k) => {
          const spec = cfg().needs[k];
          was[k] = over(spec, fr.body[k.split("@")[0]] != null ? fr.body[k.split("@")[0]] : 0.5);
        });
      } else {
        checkNeeds(fr.body, n.minutes);
      }
      prevKey = n.key;
      prevMin = n.minutes;
    }
    flushWeather();
  }

  window.addEventListener("day:weather", onWeather);
  if (typeof requestAnimationFrame === "function") {
    const loop = () => {
      try { tick(); } catch (err) { /* never stops the page */ }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  day.barks = {
    now: () => ({ lines: log.length, last: log[log.length - 1] || null, used: usedToday().size }),
    log: () => log.slice(),
    fresh,
    take,
    tick,
  };
  return day.barks;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) {
  startBarks();
}

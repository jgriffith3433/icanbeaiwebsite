/* ==========================================================================
   The hour's hint (neighbors.askMarks.hours in day.config.js). Taking control at any hour of the day shows ONE thing to try:
   morning rain for the gardens, midday wind for the laundry, afternoon fog to cool the hot street, evening lightning over the
   plaza, night fog over the quiet city. It is drawn by the ask markers (js/asks.js `current()` asks `day.hourhint.open()`):
   the verb's icon and a ground ring over the place, a plumbob over it as the tap target; plus one short line in the toast lane
   (`#hour-hint`, the storm-toast style). Doing it (that verb's cast with him within `range` of the place) clears the marker,
   pops sparkles over the place and says one thanks line; the weather itself (lawn, laundry, fog, bolt) is the world's result.
   Not shown: the cold open, an episode, the street's lesson or while the verb is still locked. `day.hourhint`: now(), open(),
   forHour(h), clear(). Events `day:hint` (show / done / hide). Playtest: `hour-hints`.
   ========================================================================== */
const POWERS = { rain: ["rain"], wind: ["wind", "gust", "gale", "tornado"], fog: ["fog"], bolt: ["bolt", "lightning", "storm"], sunbreak: ["sunbreak", "sun"] };

/** Pure: the hint for an hour of the day (0..24): the first entry whose [from, to) holds it (from > to wraps midnight). */
export function hintForHour(list, h) {
  const x = ((h % 24) + 24) % 24;
  return (list || []).find((e) => (e.from <= e.to ? x >= e.from && x < e.to : x >= e.from || x < e.to)) || null;
}
/** Pure: does a power name answer this verb? */
export function answers(verb, power) {
  return (POWERS[verb] || [verb]).includes(String(power || "").toLowerCase());
}

export function startHourHint() {
  const day = window.day;
  const cfg = window.DAY_CONFIG && window.DAY_CONFIG.neighbors && window.DAY_CONFIG.neighbors.askMarks;
  if (!day || !cfg || !cfg.hours || day.hourhint || typeof document === "undefined" || !document.body) return day && day.hourhint;
  const html = document.documentElement;
  const range = cfg.hourRange || 30;
  const showSecs = cfg.hourSecs || 90;
  let open = null; // { key, entry, since }
  let doneAt = 0;
  const log = [];
  const emit = (action, extra) => {
    const d = Object.assign({ action }, extra || {});
    log.push(Object.assign({ t: Math.round(performance.now()) }, d));
    if (log.length > 20) log.shift();
    try { window.dispatchEvent(new window.CustomEvent("day:hint", { detail: d })); } catch (e) { /* node */ }
  };
  const el = document.createElement("div");
  el.className = "storm-toast hour-hint";
  el.id = "hour-hint";
  el.setAttribute("role", "status");
  document.body.appendChild(el);
  let hideT = 0;
  const say = (text, secs) => {
    clearTimeout(hideT);
    el.textContent = text;
    el.classList.add("on");
    hideT = setTimeout(() => el.classList.remove("on"), (secs || 6) * 1000);
  };
  const hourNow = () => {
    const fr = day.now && day.now().frame;
    return fr && fr.minutes != null ? (((fr.minutes % 1440) + 1440) % 1440) / 60 : 12;
  };
  const busy = () => {
    if (day.coldopen && day.coldopen.active && day.coldopen.active()) return true;
    if (day.episodes && day.episodes.now && day.episodes.now()) return true;
    if (day.street && day.street.open && day.street.open()) return true;
    if (html.classList.contains("title-up") || html.classList.contains("cine-up")) return true;
    return false;
  };
  const locked = (verb) => {
    const ab = window.powers && window.powers.abilities;
    const id = verb === "bolt" ? "lightning" : verb === "sunbreak" ? "sun" : verb;
    return !!(ab && ab.isLocked && (ab.isLocked(id) || ab.isLocked(verb)));
  };

  function show(via) {
    if (busy()) return null;
    const h = hourNow();
    const entry = hintForHour(cfg.hours, h);
    if (!entry || locked(entry.verb)) return null;
    open = { key: "hour-" + entry.id, entry, since: performance.now() };
    say(entry.line, 7);
    emit("show", { id: entry.id, verb: entry.verb, place: entry.place.name, hour: +h.toFixed(2), via });
    if (day.note) day.note(entry.line);
    return open;
  }
  function clear(why) {
    if (!open) return;
    emit("hide", { id: open.entry.id, why });
    open = null;
  }

  window.addEventListener("day:control", (e) => {
    const d = e.detail || {};
    if (d.action === "take") setTimeout(() => show(d.via), 900); // after the take-over blend
    else if (d.action === "let-go" || d.action === "letgo") { clear("let-go"); el.classList.remove("on"); }
  });
  window.addEventListener("day:power", (e) => {
    const d = e.detail || {};
    if (!open || d.action === "denied" || !answers(open.entry.verb, d.power || d.action)) return;
    const s = day.control && day.control.state ? day.control.state() : null;
    const p = open.entry.place;
    const dist = s ? Math.hypot(s.x - p.x, s.z - p.z) : 0;
    if (dist > range) return;
    const entry = open.entry;
    clear("done");
    doneAt = performance.now();
    emit("done", { id: entry.id, verb: entry.verb, dist: Math.round(dist) });
    setTimeout(() => {
      if (day.helped && day.helped.pop) day.helped.pop({ x: p.x, z: p.z });
      say(entry.thanks, 5);
    }, 1100);
  });
  // the hint goes quietly when it has waited too long (a check on a slow tick, no network)
  const timer = setInterval(() => { if (open && (performance.now() - open.since) / 1000 > showSecs) clear("timeout"); }, 2000);
  if (timer.unref) timer.unref();

  const api = {
    now: () => ({ open: open ? { id: open.entry.id, verb: open.entry.verb, place: open.entry.place } : null, doneAt, text: el.textContent, visible: el.classList.contains("on"), log: log.slice() }),
    /** For asks.js: the open hint as an ask source (no asker: the plumbob hangs over the place). */
    open: () => (open ? { key: open.key, who: "hour", verb: open.entry.verb, place: open.entry.place } : null),
    forHour: (h) => hintForHour(cfg.hours, h),
    show,
    clear,
  };
  day.hourhint = api;
  window.hourhint = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startHourHint();

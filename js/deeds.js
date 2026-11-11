/* The deeds he remembers, as pure functions (js/memory.js stores them; js/moments.js and the autopilot read them). */
/* ------------------- what he remembers (the autopilot's `remembers`, the Let go line, the day-end card) -------------------
   Facts are the deeds of the last FACT_DAYS real days (today and yesterday), flattened to names a config step can ask
   for: `birdieRain`, `roofRide`, `askBotched`, `park.rain` (zone.power), `any.storm` ...; plus a few aliases (below). */
export const FACT_DAYS = 2;
export function factsFrom(sum) {
  const f = {};
  Object.keys(sum.deeds).forEach((k) => (f[k] = sum.deeds[k]));
  Object.keys(sum.zones).forEach((z) => Object.keys(sum.zones[z]).forEach((p) => {
    const n = sum.zones[z][p];
    f[`${z}.${p}`] = (f[`${z}.${p}`] || 0) + n;
    if (z !== "answered" && z !== "botched") f[`any.${p}`] = (f[`any.${p}`] || 0) + n;
  }));
  f.parkFlood = f["park.rain"] || 0; // rain over the park (Birdie's rain counts)
  f.storm = (f["any.storm"] || 0) + (f["any.bolt"] || 0);
  f.wind = (f["any.gale"] || 0) + (f["any.tornado"] || 0);
  f.botched = f.askBotched || 0;
  f.answered = f.askAnswered || 0;
  Object.keys(f).forEach((k) => { if (!f[k]) delete f[k]; });
  return f;
}
/* The deed names the Let go line and the day-end card speak, most telling first. Each has a `deed-<name>` line (Let go)
   and a `recap-<name>` line (day end) in day.config.js `voice.spoken`. */
export const DEED_ORDER = ["birdie", "botched", "flood", "roofs", "storm", "wind", "fog", "sun", "rain", "rescue", "answered"];
/** Which of DEED_ORDER a set of facts (or one session's counts) holds, in order. */
export function deedsFrom(f) {
  const has = {
    birdie: f.birdieRain, botched: f.askBotched, flood: f["park.rain"], roofs: f.roofRide, storm: (f["any.storm"] || 0) + (f["any.bolt"] || 0),
    wind: (f["any.gale"] || 0) + (f["any.tornado"] || 0), fog: f["any.fog"], sun: f["any.sunbreak"], rain: f["any.rain"], rescue: f.rescue, answered: f.askAnswered,
  };
  return DEED_ORDER.filter((k) => has[k] > 0);
}


/* Pure helpers for the autopilot day's diegetic soundscapes (js/daysound.js). */

/** Six named soundscapes the schedule maps onto. */
export const SCAPES = ["home", "commute", "office", "park", "tv", "night"];

/** Chapter (or block title hint) → soundscape id. */
export const CHAPTER_SCAPE = {
  wake: "home",
  ready: "home",
  commute: "commute",
  work: "office",
  lunch: "park", // lunch-break atmosphere: plaza/park life (kids, fountain, ducks)
  home: "home",
  tv: "tv",
  dinner: "home",
  computer: "night",
  bedtime: "night",
  sleep: "night",
};

/** Weather the radio can name, ordered by how loud the district remembers them. */
export const RADIO_WEATHER_ORDER = ["storm", "rain", "fog", "wind", "sun", "bolt", "clear"];

/**
 * Pick the soundscape for a schedule frame.
 * @param {{ chapter?: string, block?: string, title?: string }} ctx
 */
export function scapeOf(ctx) {
  const chapter = (ctx && (ctx.chapter || ctx.blockChapter)) || "";
  if (CHAPTER_SCAPE[chapter]) return CHAPTER_SCAPE[chapter];
  const title = ((ctx && (ctx.block || ctx.title || ctx.blockTitle)) || "").toLowerCase();
  if (/drive|red light|lot|car/.test(title)) return "commute";
  if (/desk|email|meeting|work|call at the desk|wrap/.test(title)) return "office";
  if (/microwave|eat|lunch|short walk/.test(title)) return "park";
  if (/television|tv|couch/.test(title)) return "tv";
  if (/bed|sleep|teeth|alarm set|computer|night/.test(title)) return "night";
  if (/alarm|bath|shower|coffee|home/.test(title)) return "home";
  return "home";
}

/**
 * Which weather the car radio should name from today's district memory / deeds.
 * Prefers powers the player called (zones.any.* and deed aliases).
 * @param {Record<string, number>|null|undefined} facts from day.memory.facts()
 * @returns {"storm"|"rain"|"fog"|"wind"|"sun"|"bolt"|"clear"}
 */
export function radioWeatherOf(facts) {
  const f = facts || {};
  const score = {
    storm: (f["any.storm"] || 0) + (f.storm || 0),
    rain: (f["any.rain"] || 0) + (f.birdieRain || 0) + (f.rain || 0),
    fog: (f["any.fog"] || 0) + (f.fog || 0),
    wind: (f["any.gale"] || 0) + (f["any.gust"] || 0) + (f["any.tornado"] || 0) + (f.wind || 0),
    sun: (f["any.sunbreak"] || 0) + (f.sun || 0),
    bolt: (f["any.bolt"] || 0),
    clear: 0,
  };
  for (const k of RADIO_WEATHER_ORDER) {
    if (k === "clear") return "clear";
    if (score[k] > 0) return k;
  }
  return "clear";
}

/**
 * Cap how many loops may play at once (phones on low quality: 3).
 * @param {string[]} wanted loop ids in priority order
 * @param {number} max
 */
export function pickLoops(wanted, max) {
  const n = Math.max(0, max | 0);
  const out = [];
  const seen = Object.create(null);
  for (const id of wanted || []) {
    if (!id || seen[id]) continue;
    seen[id] = 1;
    out.push(id);
    if (out.length >= n) break;
  }
  return out;
}

/** Default max simultaneous loops. */
export function loopCap(quality, touch) {
  if (quality === "low" || touch) return 3;
  return 6;
}

/**
 * Which loops of a scape are active for the current things/place.
 * Keyboard only while at the desk; shower only while on; rain-window while raining.
 */
export function activeLoops(scape, layers, ctx) {
  const things = (ctx && ctx.things) || {};
  const place = (ctx && ctx.place) || "";
  const pose = (ctx && ctx.pose) || "";
  const hand = (ctx && ctx.hand) || "";
  const wet = !!(ctx && ctx.wet);
  const inCar = !!(ctx && ctx.inCar);
  const list = [];
  for (const L of layers || []) {
    if (!L || !L.id) continue;
    const when = L.when || null;
    if (when === "desk") {
      // Only at the desk / typing — not every sitChair (bathroom chairs, couch, etc.).
      if (place !== "desk" && place !== "deskStand" && hand !== "type") continue;
    } else if (when === "shower") {
      if (things.shower !== "on") continue;
    } else if (when === "rain") {
      if (!wet) continue;
    } else if (when === "car") {
      if (!inCar) continue;
    } else if (when === "meeting") {
      if (place !== "meetSeat" && place !== "meetOther" && !/meeting/i.test((ctx && ctx.block) || "")) continue;
    }
    list.push(L.id);
  }
  return list;
}

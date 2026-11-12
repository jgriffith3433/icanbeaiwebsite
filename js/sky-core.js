/* The sky's pure parts (no Babylon, no DOM): which painted panorama is on at an hour, and the cloud deck's lightning envelope.
   js/sky.js draws with them; scripts/check-sky.mjs runs them in Node. */

export const PANOS = ["dawn", "noon", "golden", "dusk", "night", "storm"];

/** Key hours of the four painted skies, from the day's sunrise and sunset (hours). Night wraps round midnight. */
export function panoKeys(sunrise, sunset) {
  return [
    { id: "night", at: sunrise - 2.4 },   // 4:40: still night
    { id: "dawn", at: sunrise - 0.55 },   // 6:30: the glow
    { id: "noon", at: sunrise + 2.6 },    // 9:40: full day from here
    { id: "noon", at: sunset - 3.6 },     // 14:50
    { id: "golden", at: sunset - 1.0 },   // 17:25: low warm sun
    { id: "dusk", at: sunset + 0.6 },     // 19:00: amber and navy
    { id: "night", at: sunset + 2.2 },    // 20:40: stars and moon
  ];
}

/** Weights (sum 1) of dawn, noon, golden, dusk, night for the hour: linear between key hours, eased. */
export function timeWeights(hour, sunrise, sunset) {
  const keys = panoKeys(sunrise, sunset);
  const w = { dawn: 0, noon: 0, golden: 0, dusk: 0, night: 0 };
  const h = ((hour % 24) + 24) % 24;
  // find the pair of keys h sits between (wrapping the last one to the first the next day)
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i];
    const b = keys[(i + 1) % keys.length];
    const bAt = i === keys.length - 1 ? b.at + 24 : b.at;
    const hh = h < a.at && i === keys.length - 1 ? h + 24 : h;
    if (hh >= a.at && hh <= bAt) {
      const t = bAt === a.at ? 0 : (hh - a.at) / (bAt - a.at);
      const e = t * t * (3 - 2 * t);
      w[a.id] += 1 - e;
      w[b.id] += e;
      return w;
    }
  }
  w.night = 1;
  return w;
}

/** The six panorama weights: the storm shelf cloud takes over as the sky's cover passes `from`, and the time-of-day four share the rest. */
export function panoWeights(hour, sunrise, sunset, cover, from = 0.5, full = 0.86) {
  const t = timeWeights(hour, sunrise, sunset);
  const x = Math.max(0, Math.min(1, (cover - from) / Math.max(0.001, full - from)));
  const storm = x * x * (3 - 2 * x);
  return {
    dawn: t.dawn * (1 - storm), noon: t.noon * (1 - storm), golden: t.golden * (1 - storm),
    dusk: t.dusk * (1 - storm), night: t.night * (1 - storm), storm,
  };
}

/** The cloud deck's inner light after a strike: held at full for `HOLD_FRAMES` frames (so a 30 fps phone still sees 3), then it decays. */
export const DECK_HOLD_FRAMES = 4;
export const DECK_DECAY_SEC = 0.28;
export function deckFlashStep(state, dt) {
  if (state.hold > 0) { state.hold--; state.v = 1; }
  else state.v = Math.max(0, state.v * Math.exp(-dt / DECK_DECAY_SEC) - 0.002);
  return state.v;
}
export function deckStrike(state) { state.hold = DECK_HOLD_FRAMES; state.v = 1; }

/** Sun break gap: how open it is (0..1) from the weather's `sun` (0..1), with a fast open and a slower close. */
export function gapOpen(prev, sun, dt) {
  const rate = sun > prev ? 2.4 : 0.7;
  return prev + (Math.min(1, sun * 1.25) - prev) * (1 - Math.exp(-dt * rate));
}

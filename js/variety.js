/* One-shot variety: a playback rate for a sample id that is 5-10% off its base pitch and never within MIN_GAP of any rate
   that id played at in the last 60 s (the audio probe, js/hawkes-audio.js, flags the same id at the same rate twice in
   60 s). Pure: pass `now` and `rng` to test it. `baseRate` is the caller's own pitch (a shaped clip's 0.8, say). */
export const WINDOW_S = 60;
export const MIN_GAP = 0.002; // the probe compares to 0.001; stay clear of it (two 5-10% bands hold ~50 plays a minute)
export const JITTER_MIN = 0.05;
export const JITTER_MAX = 0.10;

const used = new Map(); // id -> [{ r, t }]

export function pickRate(id, baseRate = 1, opts = {}) {
  const rng = opts.rng || Math.random;
  const t = opts.now != null ? opts.now : (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  const lo = opts.min != null ? opts.min : JITTER_MIN;
  const hi = opts.max != null ? opts.max : JITTER_MAX;
  const list = (used.get(id) || []).filter((u) => t - u.t <= WINDOW_S);
  const clash = (r) => list.some((u) => Math.abs(u.r - r) < MIN_GAP);
  const draw = () => {
    const mag = lo + rng() * (hi - lo);
    return Math.round(baseRate * (1 + (rng() < 0.5 ? -mag : mag)) * 10000) / 10000;
  };
  let r = draw();
  for (let i = 0; i < 24 && clash(r); i++) r = draw();
  // a crowded id: take the free rate farthest from every recent one (the band holds ~50 plays a minute; past that the
  // farthest is as good as it gets, and the rate stays inside the 10% cap)
  if (clash(r)) {
    let best = r, bestD = -1;
    for (let k = 0; k <= 200; k++) {
      const m = lo + (hi - lo) * (k / 200);
      for (const sgn of [-1, 1]) {
        const c = Math.round(baseRate * (1 + sgn * m) * 10000) / 10000;
        const d = list.reduce((mn, u) => Math.min(mn, Math.abs(u.r - c)), 9);
        if (d > bestD) { bestD = d; best = c; }
      }
    }
    r = best;
  }
  list.push({ r, t });
  try { if (typeof window !== "undefined") (window.__varietyLog = window.__varietyLog || []).push({ id, r, t: Math.round(t * 100) / 100 }); } catch (e) { /* the probe's view only */ }
  if (typeof window !== "undefined" && window.__varietyLog && window.__varietyLog.length > 400) window.__varietyLog.splice(0, 200);
  used.set(id, list);
  return r;
}

export function resetVariety() { used.clear(); }

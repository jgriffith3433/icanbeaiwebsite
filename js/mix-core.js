/* ==========================================================================
   Pure mix helpers (no AudioContext, no DOM): reverb zone from a place in the
   city, duck gains, and synthesised impulse-response shapes for each zone.
   js/mix.js owns the WebAudio graph; scripts/check-mix.mjs drives this file.
   ========================================================================== */

/** The six places the ear knows. Names match day.audio.info().zone. */
export const ZONES = Object.freeze(["rooftop", "street", "plaza", "apartment", "car", "office"]);

/** Voice duck targets (linear gain). Music −8 dB, ambience −6 dB. */
export const DUCK = Object.freeze({
  musicDb: -8,
  ambienceDb: -6,
  attackMs: 150,
  releaseMs: 600,
});

export function dbToGain(db) {
  return Math.pow(10, (Number(db) || 0) / 20);
}

export function duckGains(active) {
  if (!active) return { music: 1, ambience: 1 };
  return { music: dbToGain(DUCK.musicDb), ambience: dbToGain(DUCK.ambienceDb) };
}

/** Default plaza rect (day.config.js episodes / city). */
export const PLAZA = Object.freeze({ x0: 106, z0: 16.8, x1: 130, z1: 36 });

/**
 * Classify where the listener is standing.
 * @param {{ x:number, y?:number, z:number, inCar?:boolean, room?:string, building?:string }} p
 * @param {{ plaza?: {x0,z0,x1,z1}, home?: {x0,z0,x1,z1}, office?: {x0,z0,x1,z1}, roofY?: number }} [bounds]
 */
export function zoneAt(p, bounds) {
  if (!p) return "street";
  if (p.inCar) return "car";
  const b = bounds || {};
  const home = b.home || { x0: -7, z0: -3.6, x1: 11, z1: 4.6 };
  const office = b.office || { x0: 128, z0: -3.6, x1: 146, z1: 4.6 };
  const plaza = b.plaza || PLAZA;
  const roofY = b.roofY != null ? b.roofY : 4.2;
  const x = Number(p.x) || 0;
  const z = Number(p.z) || 0;
  const y = p.y != null ? Number(p.y) : 0;
  const room = String(p.room || "");
  const building = String(p.building || "");

  // Cutaway interiors: low feet, inside the building footprint (or a room/building tag).
  const inHome = building === "home" || /^bed|bath|living|kitchen|entry|hall/.test(room)
    || (y < roofY && x >= home.x0 && x <= home.x1 && z >= home.z0 && z <= home.z1);
  const inOffice = building === "office" || /^(desk|office|elevator|lobby|meet|lunch|bathOffice)/.test(room)
    || (y < roofY && x >= office.x0 && x <= office.x1 && z >= office.z0 && z <= office.z1);

  if (inOffice && y < roofY) return "office";
  if (inHome && y < roofY) return "apartment";
  if (y >= roofY) return "rooftop";
  // Known roof landings (stair tops) before the capsule has fully settled its Y.
  const roofs = b.roofs || [
    { x: -19.5, z: 3.2 }, // aptRoof
    { x: 50, z: -4 }, // shop-ish
    { x: 157, z: 9.8 }, // annex
  ];
  for (let i = 0; i < roofs.length; i++) {
    const r = roofs[i];
    if (Math.hypot(x - r.x, z - r.z) < 8 && y >= 2.4) return "rooftop";
  }
  if (x >= plaza.x0 && x <= plaza.x1 && z >= plaza.z0 && z <= plaza.z1) return "plaza";
  return "street";
}

/**
 * Impulse-response shape per zone (no AudioBuffer yet). Longer = more ring.
 * decaySec / wet / bright (0..1 high-shelf weight) / earlyMs.
 */
export const IR_SHAPE = Object.freeze({
  rooftop: { decaySec: 0.55, wet: 0.18, bright: 0.85, earlyMs: 12, label: "open rooftop" },
  street: { decaySec: 1.35, wet: 0.42, bright: 0.55, earlyMs: 28, label: "street canyon" },
  plaza: { decaySec: 1.1, wet: 0.32, bright: 0.7, earlyMs: 22, label: "plaza" },
  apartment: { decaySec: 0.28, wet: 0.12, bright: 0.35, earlyMs: 6, label: "apartment interior" },
  car: { decaySec: 0.16, wet: 0.08, bright: 0.2, earlyMs: 3, label: "car cabin" },
  office: { decaySec: 0.45, wet: 0.22, bright: 0.4, earlyMs: 10, label: "office" },
});

/**
 * Fill a mono Float32Array with a synthesised IR (noise + exponential decay +
 * a couple of early reflections). Pure: no AudioContext.
 */
export function fillImpulse(out, sampleRate, zone) {
  const shape = IR_SHAPE[zone] || IR_SHAPE.street;
  const n = out.length;
  const sr = sampleRate || 44100;
  const decay = Math.max(0.05, shape.decaySec);
  let seed = 1;
  for (let i = 0; i < String(zone).length; i++) seed = (seed * 33 + String(zone).charCodeAt(i)) & 0xffff;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff) * 2 - 1;
  };
  const early = Math.min(n - 1, Math.floor((shape.earlyMs / 1000) * sr));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t / decay) * (1 - i / (n + 1));
    let s = rnd() * env;
    if (i === early) s += 0.55 * env;
    if (i === Math.floor(early * 1.7)) s += 0.28 * env * (shape.bright);
    // Soft high roll-off for dry interiors (apartment / car).
    if (shape.bright < 0.5 && i > 0) s = s * 0.65 + out[i - 1] * 0.35;
    out[i] = s;
  }
  // Normalise peak so wet sends stay predictable.
  let peak = 0.0001;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const inv = 1 / peak;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return { zone, decaySec: decay, wet: shape.wet, samples: n };
}

/** Occlusion: when a building sits between camera and source. */
export function occludeGainDb(blocked) {
  return blocked ? -6 : 0;
}

export function occludeCutoffHz(blocked, openHz) {
  return blocked ? 1100 : (openHz != null ? openHz : 18000);
}

/**
 * Axis-aligned box occlusion: does the segment camera→source cross a solid
 * box that neither endpoint is inside? Boxes: {x0,z0,x1,z1} (y ignored for street-level).
 */
export function segmentHitsBox(ax, az, bx, bz, box) {
  if (!box) return false;
  const x0 = Math.min(box.x0, box.x1);
  const x1 = Math.max(box.x0, box.x1);
  const z0 = Math.min(box.z0, box.z1);
  const z1 = Math.max(box.z0, box.z1);
  const inside = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  if (inside(ax, az) || inside(bx, bz)) return false; // source or listener inside: not "behind"
  // Liang–Barsky / parametric crossings on the XZ segment.
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-dx, ax - x0)) return false;
  if (!clip(dx, x1 - ax)) return false;
  if (!clip(-dz, az - z0)) return false;
  if (!clip(dz, z1 - az)) return false;
  return t0 < t1 && t0 < 1 && t1 > 0;
}

export function anyBoxBlocks(ax, az, bx, bz, boxes) {
  if (!boxes || !boxes.length) return false;
  for (let i = 0; i < boxes.length; i++) {
    if (segmentHitsBox(ax, az, bx, bz, boxes[i])) return true;
  }
  return false;
}

/* Pure Sun-break aftermath math: wet-window gate, rainbow geometry (42°), drip/steam budgets.
   No Babylon. Checked by scripts/check-aftermath.mjs. */

export const RAINBOW_DEG = 42;
export const RAINBOW_RAD = (RAINBOW_DEG * Math.PI) / 180;

/** Defaults (seconds are real-time; rainWindowMin is game-clock minutes). */
export const AFTERMATH = {
  rainWindowMin: 2,
  steamSec: 20,
  dripSec: 30,
  rainbowSec: 28,
  sparkleSec: 22,
  birdSec: 15,
  shopOut: 3,
};

/** True when a Sun break lands within `windowMin` game minutes of the last rain/storm. */
export function wetWindowOk(lastWetMin, nowMin, windowMin = AFTERMATH.rainWindowMin) {
  if (lastWetMin == null || !Number.isFinite(lastWetMin) || !Number.isFinite(nowMin)) return false;
  const d = nowMin - lastWetMin;
  return d >= -0.05 && d <= windowMin + 1e-6;
}

/** Anti-solar direction (unit): rainbow centre sits along this from the camera. */
export function antiSolar(sx, sy, sz) {
  const L = Math.hypot(sx, sy, sz) || 1;
  return { x: -sx / L, y: -sy / L, z: -sz / L };
}

/**
 * Anti-solar axis biased so the 42° cone still clears the horizon (BotW-readable arc
 * even when the sun is high — a pure anti-solar under a noon sun sits below the ground).
 */
export function rainbowAnti(sx, sy, sz) {
  let a = antiSolar(sx, sy, sz);
  // top of the cone ≈ elev_anti + 42°; keep that top at least ~12° above the horizon
  const minAntiY = -Math.sin(((RAINBOW_DEG - 12) * Math.PI) / 180);
  if (a.y < minAntiY) {
    const xz = Math.hypot(a.x, a.z) || 1;
    const h = Math.sqrt(Math.max(0, 1 - minAntiY * minAntiY));
    a = { x: (a.x / xz) * h, y: minAntiY, z: (a.z / xz) * h };
  }
  const L = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / L, y: a.y / L, z: a.z / L };
}

/**
 * Point on the primary rainbow cone: angle = RAINBOW_DEG from the anti-solar axis,
 * azimuth around that axis. Returns a unit offset from the cone tip (camera).
 */
export function rainbowDir(anti, azimuth) {
  // build an orthonormal frame around `anti`
  const ax = anti.x, ay = anti.y, az = anti.z;
  let ux, uy, uz;
  if (Math.abs(ay) < 0.9) {
    const L = Math.hypot(az, -ax) || 1;
    ux = az / L; uy = 0; uz = -ax / L;
  } else {
    const L = Math.hypot(ay, -ax) || 1;
    ux = ay / L; uy = -ax / L; uz = 0;
  }
  const vx = ay * uz - az * uy;
  const vy = az * ux - ax * uz;
  const vz = ax * uy - ay * ux;
  const c = Math.cos(RAINBOW_RAD), s = Math.sin(RAINBOW_RAD);
  const ca = Math.cos(azimuth), sa = Math.sin(azimuth);
  const ox = ux * ca + vx * sa;
  const oy = uy * ca + vy * sa;
  const oz = uz * ca + vz * sa;
  return {
    x: ax * c + ox * s,
    y: ay * c + oy * s,
    z: az * c + oz * s,
  };
}

/** Arc samples above the horizon (y > 0.05) for a half-circle ribbon. */
export function rainbowArc(anti, samples = 48) {
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const a = (i / samples) * Math.PI * 2 - Math.PI;
    const d = rainbowDir(anti, a);
    if (d.y > 0.04) pts.push(d);
  }
  return pts;
}

/** Spectral colour along the arc (0..1 → violet→red, facing outward). */
export function rainbowRgb(t) {
  const u = Math.max(0, Math.min(1, t));
  // rough ROYGBIV
  const stops = [
    [0.55, 0.1, 0.85],
    [0.15, 0.35, 0.95],
    [0.1, 0.75, 0.7],
    [0.2, 0.85, 0.25],
    [0.95, 0.85, 0.15],
    [1.0, 0.45, 0.08],
    [0.9, 0.12, 0.12],
  ];
  const x = u * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i], b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Soft envelope: 1 for most of the hold, then fades over the last `fade` seconds. */
export function envelope(left, total, fade = 4) {
  if (left <= 0 || total <= 0) return 0;
  const age = total - left;
  const rise = Math.min(1, age / 0.6);
  const fall = left < fade ? left / fade : 1;
  return Math.max(0, Math.min(1, rise * fall));
}

/** Phone budgets are half the desktop steam/drip counts; rainbow always on. */
export function budgets(quality) {
  const low = quality === "low";
  return {
    steam: low ? 40 : 90,
    drips: low ? 10 : 22,
    sparkles: low ? 18 : 42,
    birds: low ? 4 : 8,
    rainbow: true,
  };
}

export function dripSpawnRate(left, total, quality) {
  const k = envelope(left, total, 6);
  const b = budgets(quality).drips;
  return k * b * 0.55;
}

export function steamEmitRate(left, total, quality) {
  const k = envelope(left, total, 5);
  return k * budgets(quality).steam;
}

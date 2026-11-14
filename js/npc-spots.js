/* NPC spots: where every talkable NPC stands, and whether that is open ground. Pure (no Babylon), shared by
   scripts/check-npc-spots.mjs and the `npc-spots` playtest. A solid is { x, z, w, d, yaw?, roll? } like world.solids. */

export const BODY_R = 0.4; // the player's capsule is 0.28 m radius; keep a margin
export const RING_R = 1.6; // where the player stands to talk
export const MIN_OPEN = 3; // of 8 ring points

/** Every place an NPC stands: [{ who, kind, x, z, y? }]. */
export function collectNpcSpots(cfg) {
  const out = [];
  const nb = cfg.neighbors || {};
  for (const p of nb.list || []) {
    for (const s of p.stops || []) if (s[3] !== "inside") out.push({ who: p.id, kind: "neighbor", x: s[1], z: s[2] });
  }
  for (const [id, c] of Object.entries(nb.citizens || {})) out.push({ who: id, kind: "citizen", x: c.x, z: c.z });
  const eps = (cfg.episodes && cfg.episodes.list) || [];
  for (const ep of eps) {
    const pieces = (ep.rescue && ep.rescue.pieces) || ep.pieces || [];
    for (const pc of pieces) for (const pe of pc.people || []) if (!pe.y) out.push({ who: pe.id, kind: `ep:${ep.id}`, x: pe.x, z: pe.z });
  }
  return out;
}

function hit(s, x, z, r) {
  if (s.h !== undefined && s.y !== undefined && s.y + s.h / 2 < 0.4) return false; // a kerb or slab he steps over
  if (s.roll || s.pitch) return false; // ramps and stair slopes are walked on
  const c = Math.cos(-(s.yaw || 0));
  const sn = Math.sin(-(s.yaw || 0));
  const dx = x - s.x;
  const dz = z - s.z;
  const lx = dx * c - dz * sn;
  const lz = dx * sn + dz * c;
  return Math.abs(lx) < s.w / 2 + r && Math.abs(lz) < s.d / 2 + r;
}
export const inSolid = (solids, x, z, r = BODY_R) => solids.find((s) => hit(s, x, z, r)) || null;

export function auditNpcSpots(spots, solids) {
  const failures = [];
  const rows = [];
  const seen = new Set();
  for (const sp of spots) {
    const key = `${sp.who}@${sp.x},${sp.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const s = inSolid(solids, sp.x, sp.z);
    let open = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (!inSolid(solids, sp.x + Math.cos(a) * RING_R, sp.z + Math.sin(a) * RING_R)) open++;
    }
    rows.push({ ...sp, inside: s ? { x: s.x, z: s.z, w: s.w, d: s.d, h: s.h } : null, open });
    if (s) failures.push(`${sp.who} (${sp.kind}) at ${sp.x},${sp.z} is inside a solid at ${s.x.toFixed(1)},${s.z.toFixed(1)} (${s.w.toFixed(1)}x${s.d.toFixed(1)})`);
    else if (open < MIN_OPEN) failures.push(`${sp.who} (${sp.kind}) at ${sp.x},${sp.z}: only ${open}/8 approach points are open`);
  }
  return { failures, rows };
}

/* ==========================================================================
   The city audit: pure geometry checks on the built scene (no DOM, no GPU). Used by scripts/check-city.mjs under the
   NullEngine and by the playtest's `city-audit` scenario in the page (`window.cityAudit()`).

   runCityAudit(scene, B, cfg, { solids, debug }) -> { failures: [string], counts, details }
     props     every prop in the props-* meshes is a cluster of touching boxes; its lowest point is compared with a ray
               down onto the roof or ground below. More than 2 cm either way fails (wall-mounted ones are exempt).
     faces     axis-aligned faces in the plane of another one facing the same way (within 3 mm) and overlapping: z-fighting
               and duplicate faces (roof tops vs parapets, markings, plazas, facade panels).
     normals   zero-length or against-the-winding normals on the prop meshes.
     units     the walkable roofs' AC colliders: 1.5 x 0.9 x 1.1, a unit under each, and nothing else standing in them.
   ========================================================================== */
const PROP_MESHES = /^props-(solid|roof|glow|flat)$/;
const TOL = 0.02; // floating / sunk
const COPLANAR = 0.003;

export function runCityAudit(scene, B, cfg, opts = {}) {
  const failures = [];
  const details = [];
  const fail = (msg) => failures.push(msg);
  const V = new B.Vector3();
  const f2 = (n) => n.toFixed(2);
  // everything the city builders make (props.js, cityscape.js) plus the street, walks and the park/plaza ground they stand on
  const IN_SCOPE = /^(props-|city-|road|ave|cross|walk|park|plaza|lawn|block|dash|zebra|stop|lane|edge|cs-)/i;
  const OUT = /^(home|office|e?wall|hub|wheel|hood|cabin|pillar|boot|dframe|etop|skyDome)/;
  const live = scene.meshes.filter((m) => m.getTotalVertices && m.getTotalVertices() > 0 && m.isEnabled() && IN_SCOPE.test(m.name) && !OUT.test(m.name));

  /* ---- axis-aligned faces of every mesh (triangles merged per quad by their plane), in world space ---- */
  const faces = []; // { a: axis 0|1|2, v: value, s: +1|-1, u0,u1,w0,w1 (the other two axes), m: mesh name, mat }
  for (const m of live) {
    const mat = m.material;
    if (mat && (mat.zOffset || mat.disableDepthWrite || mat.alpha < 1)) continue; // decals and see-through layers
    const pos = m.getVerticesData(B.VertexBuffer.PositionKind);
    const idx = m.getIndices();
    if (!pos || !idx) continue;
    const wm = m.computeWorldMatrix(true);
    const mats = m.hasThinInstances ? m.thinInstanceGetWorldMatrices().map((M) => M.multiply(wm)) : [wm];
    const cache = new Map();
    for (const M of mats) {
      cache.clear();
      const p = (i) => {
        let q = cache.get(i);
        if (!q) cache.set(i, (q = B.Vector3.TransformCoordinatesFromFloatsToRef(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2], M, V).asArray()));
        return q;
      };
      for (let i = 0; i < idx.length; i += 3) {
        const a = p(idx[i]);
        const b = p(idx[i + 1]);
        const c = p(idx[i + 2]);
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        for (let ax = 0; ax < 3; ax++) {
          if (Math.abs(a[ax] - b[ax]) > 1e-4 || Math.abs(a[ax] - c[ax]) > 1e-4) continue;
          if (Math.abs(n[ax]) / 2 < 0.0025) continue; // degenerate or tiny
          const o = [(ax + 1) % 3, (ax + 2) % 3];
          const nf = {
            a: ax, v: a[ax], s: n[ax] > 0 ? 1 : -1,
            u0: Math.min(a[o[0]], b[o[0]], c[o[0]]), u1: Math.max(a[o[0]], b[o[0]], c[o[0]]),
            w0: Math.min(a[o[1]], b[o[1]], c[o[1]]), w1: Math.max(a[o[1]], b[o[1]], c[o[1]]),
            m: m.name, area: Math.abs(n[ax]) / 2,
          };
          // two triangles of one quad are one face: merge when the union box is as big as the two together
          const last = faces[faces.length - 1];
          if (last && last.tri === i - 3 && last.m === nf.m && last.a === nf.a && last.s === nf.s && Math.abs(last.v - nf.v) < 1e-5) {
            const u = Math.max(last.u1, nf.u1) - Math.min(last.u0, nf.u0);
            const w = Math.max(last.w1, nf.w1) - Math.min(last.w0, nf.w0);
            if (Math.abs(u * w - (last.area + nf.area)) < 0.02 * u * w) {
              last.u0 = Math.min(last.u0, nf.u0); last.u1 = Math.max(last.u1, nf.u1);
              last.w0 = Math.min(last.w0, nf.w0); last.w1 = Math.max(last.w1, nf.w1);
              last.area += nf.area; last.tri = i; last.rect = true;
              break;
            }
          }
          nf.tri = i;
          nf.rect = false;
          faces.push(nf);
          break;
        }
      }
    }
  }

  /* ---- coplanar: same axis, same facing, same plane (3 mm), rectangles overlapping ---- */
  {
    const seen = new Map();
    const byAxis = [[], [], []];
    faces.forEach((f) => byAxis[f.a].push(f));
    for (const list of byAxis) {
      for (let i = list.length - 1; i >= 0; i--) if (!list[i].rect) list.splice(i, 1); // a lone triangle (a cylinder's cap fan) isn't a rectangle
      list.sort((x, y) => x.v - y.v);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length && list[j].v - list[i].v <= COPLANAR; j++) {
          const A = list[i];
          const C = list[j];
          if (A.s !== C.s) continue; // back to back: one of them is hidden
          const ou = Math.min(A.u1, C.u1) - Math.max(A.u0, C.u0);
          const ow = Math.min(A.w1, C.w1) - Math.max(A.w0, C.w0);
          if (ou > 0.04 && ow > 0.04) {
            const k = [A.m, C.m].sort().join(' ~ ') + ' ' + 'xyz'[A.a];
            const hit = seen.get(k) || { n: 0, at: `${'xyz'[A.a]}=${f2(A.v)} over ${f2(Math.max(A.u0, C.u0))},${f2(Math.max(A.w0, C.w0))}`, dup: A.m === C.m && Math.abs(A.v - C.v) < 1e-6, A: `[${f2(A.u0)}..${f2(A.u1)} x ${f2(A.w0)}..${f2(A.w1)} @${A.v.toFixed(4)}] [${f2(C.u0)}..${f2(C.u1)} x ${f2(C.w0)}..${f2(C.w1)} @${C.v.toFixed(4)}]` };
            hit.n++;
            seen.set(k, hit);
          }
        }
      }
    }
    seen.forEach((h, k) => fail(`coplanar faces ${k} (${h.n}, first at ${h.at}${h.dup ? ', exact duplicates' : ''})${opts.debug ? ' ' + h.A : ''}`));
  }

  /* ---- props: clusters of touching faces in the prop meshes; the lowest point against the ray down ---- */
  const propMeshes = live.filter((m) => PROP_MESHES.test(m.name));
  const surfaces = live.filter((m) => !PROP_MESHES.test(m.name));
  let props = 0;
  const clusters = [];
  const allPrims = [];
  for (const m of propMeshes) {
    const pos = m.getVerticesData(B.VertexBuffer.PositionKind);
    const nrm = m.getVerticesData(B.VertexBuffer.NormalKind);
    const idx = m.getIndices();
    const wm = m.computeWorldMatrix(true);
    // normals: none zero, none against the winding
    const cn = [];
    B.VertexData.ComputeNormals(pos, idx, cn);
    let zero = 0;
    let opposed = 0;
    for (let i = 0; i < nrm.length; i += 3) {
      if (Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) < 0.5) zero++;
      else if (cn[i] * nrm[i] + cn[i + 1] * nrm[i + 1] + cn[i + 2] * nrm[i + 2] < -0.05) opposed++;
    }
    if (zero) fail(`${m.name}: ${zero} vertices have a zero normal`);
    if (opposed) fail(`${m.name}: ${opposed} vertices are wound against their normals (inside out)`);
    ((m.metadata && m.metadata.prims) || []).forEach((q) => allPrims.push({ x0: q[0], y0: q[1], z0: q[2], x1: q[3], y1: q[4], z1: q[5], mesh: m.name }));
  }
  // clusters: the builders' own boxes (Part.prims) joined where they touch (1 cm), across the solid, roof and glow meshes
  // (a lamp is a pole in one and a globe in another); the flat ones (lawn, paving) are ground for them, clustered apart
  for (const flatPass of [false, true]) {
    const quads = allPrims.filter((q) => (q.mesh === 'props-flat') === flatPass);
    const par = quads.map((_, i) => i);
    const find = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
    const order = quads.map((_, i) => i).sort((a, b) => quads[a].x0 - quads[b].x0);
    const E = 0.01;
    for (let a = 0; a < order.length; a++) {
      const A = quads[order[a]];
      for (let b = a + 1; b < order.length; b++) {
        const C = quads[order[b]];
        if (C.x0 > A.x1 + E) break;
        if (C.y0 <= A.y1 + E && A.y0 <= C.y1 + E && C.z0 <= A.z1 + E && A.z0 <= C.z1 + E) par[find(order[b])] = find(order[a]);
      }
    }
    const groups = new Map();
    quads.forEach((q, i) => { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)).push(q); });
    groups.forEach((qs) => {
      const c = { mesh: flatPass ? 'props-flat' : qs[0].mesh, meshes: new Set(qs.map((q) => q.mesh)), qs, x0: 1e9, y0: 1e9, z0: 1e9, x1: -1e9, y1: -1e9, z1: -1e9 };
      qs.forEach((q) => { c.x0 = Math.min(c.x0, q.x0); c.y0 = Math.min(c.y0, q.y0); c.z0 = Math.min(c.z0, q.z0); c.x1 = Math.max(c.x1, q.x1); c.y1 = Math.max(c.y1, q.y1); c.z1 = Math.max(c.z1, q.z1); });
      clusters.push(c);
    });
  }
  const pick = (ox, oy, oz, dx, dy, dz, len, skip) => {
    const hits = scene.multiPickWithRay(new B.Ray(new B.Vector3(ox, oy, oz), new B.Vector3(dx, dy, dz), len), (m) => skip(m) && m.isEnabled() && m.isVisible && !/sky|shadow/i.test(m.name)) || [];
    hits.sort((a, b) => a.distance - b.distance);
    return hits[0];
  };
  scene.meshes.forEach((m) => { m.__pick = m.isPickable; m.isPickable = true; });
  const isSurface = (m) => !PROP_MESHES.test(m.name) && !m.parent;
  const isSurfaceOrFlat = (m) => !/^props-(solid|roof|glow)$/.test(m.name) && !m.parent;
  for (const c of clusters) {
    props++;
    const sz = Math.max(c.x1 - c.x0, c.z1 - c.z0);
    if (c.mesh === 'props-flat') continue; // the ground's own decals (lawn, paving, pools) are checked as faces above
    const cx = (c.x0 + c.x1) / 2;
    const cz = (c.z0 + c.z1) / 2;
    if (c.y1 - c.y0 < 0.02) continue; // a flat decal
    // footprint samples: the centres of the quads that touch the bottom
    const pts = [];
    c.qs.filter((q) => q.y0 < c.y0 + 0.03).forEach((q) => {
      const cx2 = (q.x0 + q.x1) / 2;
      const cz2 = (q.z0 + q.z1) / 2;
      pts.push([cx2, cz2]);
      if (q.x1 - q.x0 > 0.3 && q.z1 - q.z0 > 0.3) pts.push([cx2 + (q.x1 - q.x0) * 0.3, cz2 + (q.z1 - q.z0) * 0.3], [cx2 - (q.x1 - q.x0) * 0.3, cz2 - (q.z1 - q.z0) * 0.3]);
    });
    if (!pts.length) pts.push([cx, cz]);
    // wall-mounted (signs, lamps on facades): something solid beside it at mid height
    const my = (c.y0 + c.y1) / 2;
    let mounted = false;
    if (c.y0 > 0.4) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of dirs) {
        const h = pick(cx, my, cz, dx, 0, dz, sz / 2 + 0.3, (mm) => !c.meshes.has(mm.name) && !mm.parent);
        if (h && h.distance < sz / 2 + 0.16) mounted = true;
      }
    }
    if (mounted) continue;
    const lows = [];
    for (const [px, pz] of pts.slice(0, 40)) {
      const h = pick(px, c.y0 + 0.3, pz, 0, -1, 0, 20, isSurfaceOrFlat);
      lows.push(h ? h.pickedPoint.y : null); if (h) c.on = h.pickedMesh.name;
    }
    const got = lows.filter((v) => v != null);
    if (!got.length) {
      fail(`${c.mesh} prop at ${f2(cx)},${f2(cz)} (bottom ${f2(c.y0)}) has nothing under it (${f2(c.x1 - c.x0)} x ${f2(c.z1 - c.z0)}, top ${f2(c.y1)})`);
      continue;
    }
    const surf = Math.max(...got);
    const gap = c.y0 - surf;
    if (Math.abs(gap) > TOL && opts.debug) details.push(JSON.stringify(c.qs.map((q) => [q.x0, q.y0, q.z0, q.x1, q.y1, q.z1].map((v) => +v.toFixed(2)))));
    if (Math.abs(gap) > TOL) fail(`${c.mesh} prop at ${f2(cx)},${f2(c.y0)},${f2(cz)} ${gap > 0 ? 'floats' : 'is sunk'} ${f2(Math.abs(gap) * 100)} cm ${gap > 0 ? 'above' : 'into'} the surface at y ${f2(surf)} (${c.on})`);
  }

  /* ---- the street lamps' poles (thin instances in cityscape.js): their feet against the ground below ---- */
  let poles = 0;
  for (const m of live.filter((mm) => mm.name === 'cs-pole' && mm.hasThinInstances)) {
    m.refreshBoundingInfo && m.refreshBoundingInfo();
    const base = m.getBoundingInfo().boundingBox.minimum.y; // the pole's own bottom (a unit mesh)
    const bad = [];
    m.thinInstanceGetWorldMatrices().forEach((M) => {
      const t = M.getTranslation();
      poles++;
      const h = pick(t.x, t.y + base + 0.3, t.z, 0, -1, 0, 5, isSurfaceOrFlat);
      const gap = h ? t.y + base - h.pickedPoint.y : null;
      if (gap == null || Math.abs(gap) > TOL) bad.push(`${f2(t.x)},${f2(t.z)} ${gap == null ? 'nothing below' : (gap > 0 ? '+' : '-') + f2(Math.abs(gap) * 100) + ' cm'}`);
    });
    if (bad.length) fail(`${bad.length} of ${m.thinInstanceCount} street lamp poles are off the ground (${bad.slice(0, 3).join('; ')})`);
  }

  /* ---- walkable roofs: the AC colliders ---- */
  let units = 0;
  const solids = opts.solids || [];
  for (const b of (cfg.city && cfg.city.blocks) || []) {
    if (!b.stair) continue;
    const acs = solids.filter((s) => Math.abs(s.w - 1.5) < 1e-6 && Math.abs(s.h - 0.9) < 1e-6 && Math.abs(s.d - 1.1) < 1e-6 && Math.abs(s.y - (b.h + 0.45)) < 1e-6 && Math.abs(s.x - b.x) < b.w / 2 && Math.abs(s.z - b.z) < b.d / 2);
    if (acs.length !== 2) fail(`block ${b.id}: ${acs.length} AC colliders of 1.5 x 0.9 x 1.1 on the walkable roof, wanted 2`);
    for (const s of acs) {
      units++;
      // the unit's own cluster: its footprint is the collider's, 0.9 tall
      const mine = clusters.filter((c) => c.mesh === 'props-roof' && Math.abs(c.x0 - (s.x - 0.75)) < 0.03 && c.x1 > s.x + 0.74 && c.x1 < s.x + 0.9 && Math.abs(c.z0 - (s.z - 0.56)) < 0.03 && Math.abs(c.z1 - (s.z + 0.56)) < 0.03);
      if (!mine.length) fail(`block ${b.id}: no AC unit stands in its collider at ${f2(s.x)},${f2(s.z)}`);
      else if (mine.length > 1) fail(`block ${b.id}: ${mine.length} props share the AC collider at ${f2(s.x)},${f2(s.z)}`);
      // other props (and walkable-roof surface pads that rise above the roof) inside the collider's box
      for (const c of clusters) {
        if (mine.includes(c) || c.mesh === 'props-flat') continue;
        if (c.x1 > s.x - 0.75 + 0.01 && c.x0 < s.x + 0.75 - 0.01 && c.z1 > s.z - 0.55 + 0.01 && c.z0 < s.z + 0.55 - 0.01 && c.y1 > b.h + 0.04 && c.y0 < b.h + 0.9) {
          fail(`block ${b.id}: a ${c.mesh} prop at ${f2((c.x0 + c.x1) / 2)},${f2((c.z0 + c.z1) / 2)} stands in the AC collider at ${f2(s.x)},${f2(s.z)}`);
        }
      }
    }
  }
  scene.meshes.forEach((m) => { m.isPickable = m.__pick; });
  return { failures, details, counts: { props, surfaces: surfaces.length, faces: faces.length, units, poles } };
}

/* ==========================================================================
   Gen-made PBR material sets (recipes mat-* in hawkes.assets.json).
   textures/city/surfaces.json lists the sets that exist in the repo; only those
   are fetched (never a file that isn't there). Each set: albedo, normal and
   roughness webp, 1024 (high) or -512 (low quality). A set replaces the
   procedural maps of its look.js material once loaded; until then, or if a
   fetch fails, the procedural ones stay. Rooms in metres: look.js's dress()
   already gives every box world-space UVs scaled in metres (tileBox).
   Low quality: 512 maps and normal maps only on the near-ground materials
   (asphalt, brick, pavers); the others drop them.
   ========================================================================== */
const B = window.BABYLON;

/* set name -> look.js material key */
const TARGET = { brick: "brick", glass: "glass", asphalt: "asphalt", tar: "roof", pavers: "concrete", concrete: "rampLit" };
const NEAR_NORMALS = new Set(["asphalt", "brick", "pavers"]);

/* Phone-only ground albedos (scripts/make-low-textures.mjs, no GPU): the Gen asphalt albedo is near-black navy and no Gen
   set covers the lawn, and the tar roof he stands on at dusk is near-black too, so on low quality the world read as a flat dark plane. material key -> [file, metres per repeat]. */
const LOW_ALBEDO = { asphalt: "textures/city/low/asphalt-albedo.webp", ground: "textures/city/low/grass-albedo.webp", roof: "textures/city/low/tar-albedo.webp" };

export function installSurfaces(look, scene) {
  const state = { sets: [], loaded: [], failed: [], quality: look.quality(), bytes: 0 };
  const apply = (name, mat, files, low) => {
    const tex = (url, srgb) => new B.Texture(url, scene, false, true, B.Texture.TRILINEAR_SAMPLINGMODE);
    const albedo = tex(files.albedo);
    albedo.wrapU = albedo.wrapV = B.Texture.WRAP_ADDRESSMODE;
    mat.albedoTexture = albedo;
    if (files.roughness) {
      const r = tex(files.roughness);
      r.wrapU = r.wrapV = B.Texture.WRAP_ADDRESSMODE;
      mat.metallicTexture = r; // green = roughness (look.js sets useRoughnessFromMetallicTextureGreen)
    }
    if (files.normal && !(low && !NEAR_NORMALS.has(name))) {
      const keep = mat.bumpTexture ? mat.bumpTexture.level : 0.45;
      const n = tex(files.normal);
      n.wrapU = n.wrapV = B.Texture.WRAP_ADDRESSMODE;
      mat.bumpTexture = n;
      n.level = keep;
    } else if (files.normal) {
      mat.bumpTexture = null; // far/LOD materials on a phone: no normal map
    }
    state.loaded.push(name);
  };
  const lowDone = new Set();
  const applyLow = () => {
    if (look.quality() !== "low") return;
    for (const key of Object.keys(LOW_ALBEDO)) {
      const mat = look.mats[key];
      if (!mat || lowDone.has(key)) continue;
      lowDone.add(key);
      const t = new B.Texture(LOW_ALBEDO[key], scene, false, true, B.Texture.TRILINEAR_SAMPLINGMODE);
      t.wrapU = t.wrapV = B.Texture.WRAP_ADDRESSMODE;
      mat.albedoTexture = t;
      state.low = (state.low || []).concat(key);
    }
  };
  const run = async () => {
    let list;
    try {
      const r = await fetch("textures/city/surfaces.json");
      if (!r.ok) return;
      list = (await r.json()).sets || {};
    } catch (e) { return; }
    const low = look.quality() === "low";
    state.quality = low ? "low" : "high";
    lowDone.clear(); // the Gen set below replaces the albedo; the lighter low one goes back on top after it
    for (const name of Object.keys(list)) {
      const mat = look.mats[TARGET[name]];
      if (!mat) continue;
      state.sets.push(name);
      const f = list[name];
      const pick = (k) => (low && f[k + "512"]) || f[k];
      try {
        apply(name, mat, { albedo: pick("albedo"), normal: pick("normal"), roughness: pick("roughness") }, low);
      } catch (e) { state.failed.push(name); }
    }
    applyLow();
  };
  /* After the first frames: the page is playing before any map downloads. */
  setTimeout(run, 1500);
  applyLow(); // a phone gets the lighter ground at once, before any Gen map has downloaded
  window.addEventListener("day:quality", () => { state.quality = look.quality(); lowDone.clear(); applyLow(); });
  return { info: () => ({ ...state }) };
}

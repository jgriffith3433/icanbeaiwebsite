/* ==========================================================================
   Who the player moves. Today: the box-built stand-in in js/world.js
   (world.avatar). Later: Small Weather's rigged model, a GLB with clips named
   idle, walk, run, jump, fall, float and cast. Both have the same shape:

     { kind, clips, root, place(x, feetY, z, yaw), play(clip, speed, dt), show(on) }

   js/control.js only ever calls place() and play(), so the model drops in with:

     import "@babylonjs/loaders/glTF";          // add the package first
     const res = await BABYLON.SceneLoader.ImportMeshAsync("", "models/", "small-weather.glb", world.scene);
     control.setAvatar(clipAvatar(res.meshes[0], res.animationGroups));

   (day.config.js `control.model` is where its path goes.) The GLB's origin must be
   at his feet, facing +z, 1 unit = 1 metre.
   ========================================================================== */

export const CLIPS = ["idle", "walk", "run", "jump", "fall", "float", "cast"];

/* Clip names in a GLB vary ("Idle", "Armature|run", "SW_Jump"): match by the word. Missing clips fall back. */
const FALLBACK = { run: "walk", walk: "idle", fall: "jump", jump: "fall", float: "fall", cast: "idle" };
const LOOPS = new Set(["idle", "walk", "run", "fall", "float"]);

export function clipAvatar(root, animationGroups, opts = {}) {
  const names = opts.clips || CLIPS; // js/small-weather.js adds the day's clips (sit, type, lie...)
  const loops = opts.loops ? new Set(opts.loops) : LOOPS;
  const groups = {};
  names.forEach((c) => {
    const g = animationGroups.find((a) => new RegExp(`(^|[^a-z])${c}([^a-z]|$)`, "i").test(a.name));
    if (g) groups[c] = g;
  });
  const pick = (c) => {
    for (let k = c, n = 0; k && n < 4; k = FALLBACK[k], n++) if (groups[k]) return groups[k];
    return null;
  };
  const weights = new Map();
  animationGroups.forEach((g) => {
    g.stop();
    weights.set(g, 0);
  });
  const blend = opts.blend || 8; // how fast clips cross-fade, per second
  const strideOf = { walk: opts.walkStride || 1.4, run: opts.runStride || 2.6 }; // metres per loop
  let current = null;
  root.rotationQuaternion = null;
  return {
    kind: "clips",
    clips: names.filter((c) => groups[c]),
    root,
    place(x, feetY, z, yaw) {
      root.position.set(x, feetY, z);
      root.rotation.y = yaw;
    },
    play(clip, speed, dt) {
      const g = pick(clip);
      if (g && g !== current) {
        current = g;
        if (!g.isPlaying) g.start(loops.has(clip), 1, g.from, g.to);
        if (!loops.has(clip)) g.goToFrame(g.from);
      }
      if (g && strideOf[clip] && g.to > g.from) {
        const loopSeconds = (g.to - g.from) / (g.targetedAnimations[0]?.animation.framePerSecond || 30);
        g.speedRatio = Math.max(0.3, Math.min(3, (speed * loopSeconds) / strideOf[clip]));
      }
      const k = 1 - Math.exp(-blend * dt);
      weights.forEach((w, grp) => {
        const next = w + ((grp === current ? 1 : 0) - w) * k;
        weights.set(grp, next);
        grp.weight = next;
        if (next < 0.01 && grp !== current && grp.isPlaying) grp.stop();
      });
    },
    show(on) {
      root.setEnabled(on);
    },
  };
}

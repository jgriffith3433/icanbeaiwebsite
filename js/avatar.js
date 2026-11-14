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
const FALLBACK = {
  run: "walk", walk: "idle", fall: "jump", jump: "fall", float: "fall", cast: "idle",
  windbolt: "cast", windrain: "cast", lookup: "idle", triumph: "cast", shelter: "idle", window: "sit",
};
const LOOPS = new Set(["idle", "walk", "run", "fall", "float", "shelter", "window"]);

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
  let currentClip = "";
  let heldFor = 0; // seconds the current one-shot has sat on its last frame
  root.rotationQuaternion = null;
  return {
    kind: "clips",
    clips: names.filter((c) => groups[c]),
    root,
    place(x, feetY, z, yaw) {
      root.position.set(x, feetY, z);
      root.rotation.y = yaw;
    },
    /* a one-shot (cast, lookup, triumph...) has reached its last frame and is being held there */
    ended: (clip) => !loops.has(clip) && !!groups[clip] && groups[clip] === current && heldFor > 0,
    heldSeconds: () => heldFor,
    play(clip, speed, dt) {
      const g = pick(clip);
      if (g && g !== current) {
        /* The very first clip (or one after everything faded out) starts at full weight: a weight ramping up from 0
           shows the bind pose underneath for ~0.3 s (his arms out, boots splayed), which is the odd default pose. */
        let total = 0;
        weights.forEach((w) => (total += w));
        if (total < 0.5) {
          weights.forEach((w, grp) => weights.set(grp, grp === g ? 1 : 0));
          g.weight = 1;
        }
        current = g;
        currentClip = clip;
        heldFor = 0;
        g.speedRatio = 1;
        if (!g.isPlaying) g.start(loops.has(clip), 1, g.from, g.to);
        if (!loops.has(clip)) g.goToFrame(g.from);
      }
      /* A one-shot that has played out stops its animatables, and a stopped group no longer writes the bones: whatever
         is on them (the last frame, then the foot IK's pitch and the plant nudge added on top of it every frame) just
         piles up, which left the boots drifting and the arms wherever the clip ended. So a finished one-shot is kept
         running on its last frame (speed 0): the bones are rewritten from the clip every frame, and the cross-fade
         back to idle starts from a clean pose. */
      if (g && g === current && !loops.has(clip) && !g.isPlaying && g.to > g.from) {
        g.start(true, 1, g.from, g.to);
        g.goToFrame(g.to);
        g.speedRatio = 0;
        heldFor = 1e-3;
      } else if (heldFor > 0) heldFor += dt;
      if (g && strideOf[clip] && g.to > g.from) {
        const loopSeconds = (g.to - g.from) / (g.targetedAnimations[0]?.animation.framePerSecond || 30);
        g.speedRatio = Math.max(0.3, Math.min(3.6, (speed * loopSeconds) / strideOf[clip]));
      }
      const k = 1 - Math.exp(-blend * dt);
      weights.forEach((w, grp) => {
        const next = w + ((grp === current ? 1 : 0) - w) * k;
        weights.set(grp, next);
      });
      /* The weights always add up to 1: the share that is missing would be filled by the node's stale "original"
         value (a half-faded pose, or the bind pose), and an idle at 0.97 lets that leak into the hands and boots. */
      let sum = 0;
      weights.forEach((w) => (sum += w));
      weights.forEach((w, grp) => {
        const next = sum > 1e-4 ? w / sum : grp === current ? 1 : 0;
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

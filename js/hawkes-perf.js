/* ==========================================================================
   Hawkes Babylon.js Performance & Leak Root-Cause Monitor (hawkes-perf.js)
   --------------------------------------------------------------------------
   Standalone, zero-dependency diagnostic module for Babylon.js games and
   simulations (I Can Be, PH Origins, Dose Of Destruction, Hawkes Studio).
   Attaches to any Babylon.js scene (or auto-discovers the active scene) and
   exposes `window.hawkesPerf = createHawkesPerf(scene, opts)`.

   Tracks:
   1. Frame & Timing Instrumentation (180-frame ring buffer + Babylon counters)
   2. Draw Calls, Geometry, Skinned Meshes, Thin Instances & Render Passes Audit
   3. Batching, World-Matrix Freezing, Active Lights & Material-Dirtying Detector
   4. Resource Leak Detector (mark(label) / diff(label) / 60s rolling baseline)
   5. Plain-English Root-Cause Suspects (`suspects: string[]`)
   ========================================================================== */

const RING_SIZE = 180;
const DIRTY_WINDOW_FRAMES = 30;
const ROLLING_INTERVAL_MS = 5000;
const ROLLING_HISTORY_MAX = 13; // ~60s of 5s samples

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function discoverScene(explicitScene) {
  if (explicitScene && explicitScene.meshes) return explicitScene;
  const g = typeof window !== "undefined" ? window : globalThis;
  try {
    const w = g.day && typeof g.day.world === "function" ? g.day.world() : null;
    if (w && w.scene && w.scene.meshes) return w.scene;
  } catch (e) { /* ignore */ }
  try {
    const B = g.BABYLON;
    const inst = B && B.Engine && B.Engine.Instances && B.Engine.Instances[0];
    if (inst && inst.scenes && inst.scenes[0]) return inst.scenes[0];
    if (B && B.EngineStore && B.EngineStore.LastCreatedScene) return B.EngineStore.LastCreatedScene;
  } catch (e) { /* ignore */ }
  return null;
}

export function createHawkesPerf(initialScene, opts) {
  opts = opts || {};
  let scene = null;
  let sceneInst = null;
  let engineInst = null;
  let beforeObs = null;
  let afterObs = null;
  let ipcObs = null;
  let worldWrapped = false;

  const ring = [];
  let renderStartMs = 0;
  let lastAfterRenderMs = 0;
  let lastUpdateDurationMs = null;
  let frameDirtyCalls = 0;
  let ipcUpdateCalls = 0;
  let totalDirtyCalls = 0;
  let framesRendered = 0;

  const marks = new Map();
  let baselineMark = null;
  const rollingSamples = [];
  let lastRollingAt = 0;
  let overlayEl = null;
  let overlayTimer = null;

  function hookMaterialDirty(B) {
    if (!B || !B.Material || !B.Material.prototype) return;
    const proto = B.Material.prototype;
    if (proto.__hawkesPerfHooked) return;
    const orig = proto._markAllSubMeshesAsDirty;
    if (typeof orig !== "function") return;
    proto.__hawkesPerfHooked = true;
    proto.__hawkesPerfListeners = new Set();
    proto._markAllSubMeshesAsDirty = function (func) {
      if (!this._blockDirtyMechanism) {
        const sc = this.getScene && this.getScene();
        if (sc && !sc.blockMaterialDirtyMechanism) {
          proto.__hawkesPerfListeners.forEach((fn) => {
            try { fn(sc, this); } catch (e) { /* ignore */ }
          });
        }
      }
      return orig.call(this, func);
    };
  }

  function onMaterialDirty(sc) {
    if (!scene || sc !== scene) return;
    // Ignore initial scene setup before the first 2 frames have rendered
    if (framesRendered >= 2) {
      frameDirtyCalls++;
      totalDirtyCalls++;
    }
  }

  function tryWrapWorldUpdate() {
    if (worldWrapped) return;
    const g = typeof window !== "undefined" ? window : globalThis;
    const w = g.day && typeof g.day.world === "function" ? g.day.world() : null;
    if (!w || typeof w.update !== "function" || w.__hawkesPerfWrapped) return;
    const origUpdate = w.update;
    w.update = function (fr, dt, uOpts) {
      const t0 = nowMs();
      try {
        return origUpdate.call(this, fr, dt, uOpts);
      } finally {
        lastUpdateDurationMs = (lastUpdateDurationMs || 0) + (nowMs() - t0);
      }
    };
    w.__hawkesPerfWrapped = true;
    worldWrapped = true;
  }

  function attach(targetScene) {
    const next = targetScene || discoverScene();
    if (!next || next === scene) return !!scene;
    detach();
    scene = next;
    const g = typeof window !== "undefined" ? window : globalThis;
    const B = g.BABYLON;
    if (B) {
      hookMaterialDirty(B);
      if (B.Material && B.Material.prototype && B.Material.prototype.__hawkesPerfListeners) {
        B.Material.prototype.__hawkesPerfListeners.add(onMaterialDirty);
      }
      try {
        if (B.SceneInstrumentation) {
          sceneInst = new B.SceneInstrumentation(scene);
          sceneInst.captureActiveMeshesEvaluationTime = true;
          sceneInst.captureRenderTargetsRenderTime = true;
          sceneInst.captureParticlesRenderTime = true;
          sceneInst.captureAnimationsTime = true;
          sceneInst.capturePhysicsTime = true;
          sceneInst.captureFrameTime = true;
          sceneInst.captureRenderTime = true;
        }
      } catch (e) {
        sceneInst = null;
      }
      try {
        const eng = scene.getEngine && scene.getEngine();
        if (B.EngineInstrumentation && eng) {
          engineInst = new B.EngineInstrumentation(eng);
          engineInst.captureGPUFrameTime = true;
          engineInst.captureShaderCompilationTime = true;
        }
      } catch (e) {
        engineInst = null;
      }
    }

    if (scene.imageProcessingConfiguration && scene.imageProcessingConfiguration.onUpdateParameters) {
      ipcObs = scene.imageProcessingConfiguration.onUpdateParameters.add(() => {
        if (framesRendered >= 2) ipcUpdateCalls++;
      });
    }

    const beforeObservable = scene.onBeforeAnimationsObservable || scene.onBeforeRenderObservable;
    if (beforeObservable) {
      beforeObs = beforeObservable.add(() => {
        tryWrapWorldUpdate();
        renderStartMs = nowMs();
      });
    }

    if (scene.onAfterRenderObservable) {
      afterObs = scene.onAfterRenderObservable.add(() => {
        const afterMs = nowMs();
        const rMs = renderStartMs > 0 ? Math.max(0, afterMs - renderStartMs) : (sceneInst ? sceneInst.renderTimeCounter.current : 0);
        const wallDelta = lastAfterRenderMs > 0 ? Math.max(0.1, afterMs - lastAfterRenderMs) : 16.67;
        let uMs = lastUpdateDurationMs;
        if (uMs == null) {
          const gap = lastAfterRenderMs > 0 && renderStartMs > lastAfterRenderMs ? renderStartMs - lastAfterRenderMs : 0;
          if (gap > 0 && gap < 100) uMs = gap;
          else if (sceneInst && sceneInst.frameTimeCounter.current > rMs) uMs = sceneInst.frameTimeCounter.current - rMs;
          else uMs = 0;
        }
        const fMs = uMs + rMs;
        framesRendered++;
        ring.push({
          frameMs: fMs,
          updateMs: uMs,
          renderMs: rMs,
          wallDeltaMs: wallDelta,
          dirtyCalls: frameDirtyCalls,
          activeEvalMs: sceneInst ? sceneInst.activeMeshesEvaluationTimeCounter.current : 0,
          rttMs: sceneInst ? sceneInst.renderTargetsRenderTimeCounter.current : 0,
          animMs: sceneInst ? sceneInst.animationsTimeCounter.current : 0,
          partMs: sceneInst ? sceneInst.particlesRenderTimeCounter.current : 0,
          physMs: sceneInst ? sceneInst.physicsTimeCounter.current : 0,
          gpuMs: engineInst && engineInst.gpuFrameTimeCounter ? engineInst.gpuFrameTimeCounter.current * 1e-6 : 0,
          drawCalls: sceneInst ? sceneInst.drawCallsCounter.current : 0,
        });
        if (ring.length > RING_SIZE) ring.shift();
        frameDirtyCalls = 0;
        lastUpdateDurationMs = null;
        lastAfterRenderMs = afterMs;

        if (!baselineMark && framesRendered === 3) {
          baselineMark = captureResources("auto-baseline");
          marks.set("baseline", baselineMark);
        }
        if (afterMs - lastRollingAt >= ROLLING_INTERVAL_MS && framesRendered >= 3) {
          lastRollingAt = afterMs;
          rollingSamples.push(captureResources("rolling"));
          if (rollingSamples.length > ROLLING_HISTORY_MAX) rollingSamples.shift();
        }
      });
    }
    tryWrapWorldUpdate();
    return true;
  }

  function detach() {
    const g = typeof window !== "undefined" ? window : globalThis;
    const B = g.BABYLON;
    if (B && B.Material && B.Material.prototype && B.Material.prototype.__hawkesPerfListeners) {
      B.Material.prototype.__hawkesPerfListeners.delete(onMaterialDirty);
    }
    if (scene) {
      const beforeObservable = scene.onBeforeAnimationsObservable || scene.onBeforeRenderObservable;
      if (beforeObs && beforeObservable) beforeObservable.remove(beforeObs);
      if (afterObs && scene.onAfterRenderObservable) scene.onAfterRenderObservable.remove(afterObs);
      if (ipcObs && scene.imageProcessingConfiguration && scene.imageProcessingConfiguration.onUpdateParameters) {
        scene.imageProcessingConfiguration.onUpdateParameters.remove(ipcObs);
      }
    }
    if (sceneInst && sceneInst.dispose) {
      try { sceneInst.dispose(); } catch (e) { /* ignore */ }
    }
    if (engineInst && engineInst.dispose) {
      try { engineInst.dispose(); } catch (e) { /* ignore */ }
    }
    beforeObs = null;
    afterObs = null;
    ipcObs = null;
    sceneInst = null;
    engineInst = null;
    scene = null;
  }

  function ensureAttached() {
    if (!scene || scene.isDisposed) attach(discoverScene());
    tryWrapWorldUpdate();
    return scene;
  }

  function captureResources(label) {
    const sc = ensureAttached();
    if (!sc) {
      return {
        label: label || "empty",
        at: nowMs(),
        meshes: 0,
        geometries: 0,
        materials: 0,
        textures: 0,
        estimatedTextureMB: 0,
        animationGroups: 0,
        skeletons: 0,
        particleSystems: 0,
        lights: 0,
        transformNodes: 0,
        renderTargets: 0,
        beforeRenderObservers: 0,
        afterRenderObservers: 0,
        audioElements: 0,
      };
    }
    let texBytes = 0;
    (sc.textures || []).forEach((t) => {
      if (!t || !t.getSize) return;
      const sz = t.getSize();
      const w = (sz && sz.width) || 0;
      const h = (sz && sz.height) || 0;
      if (w > 0 && h > 0) {
        const mipFactor = t.noMipmap ? 1 : 1.333;
        texBytes += w * h * 4 * mipFactor;
      }
    });
    const rtts = (sc.customRenderTargets ? sc.customRenderTargets.length : 0) + (sc.effectLayers ? sc.effectLayers.length : 0);
    const domAudio = typeof document !== "undefined" && typeof document.querySelectorAll === "function"
      ? document.querySelectorAll("audio").length
      : 0;
    return {
      label: label || "snapshot",
      at: nowMs(),
      meshes: (sc.meshes || []).length,
      geometries: (sc.geometries || []).length,
      materials: (sc.materials || []).length,
      textures: (sc.textures || []).length,
      estimatedTextureMB: round2(texBytes / (1024 * 1024)),
      animationGroups: (sc.animationGroups || []).length,
      skeletons: (sc.skeletons || []).length,
      particleSystems: (sc.particleSystems || []).length,
      lights: (sc.lights || []).length,
      transformNodes: (sc.transformNodes || []).length,
      renderTargets: rtts,
      beforeRenderObservers: (sc.onBeforeRenderObservable && sc.onBeforeRenderObservable.observers) ? sc.onBeforeRenderObservable.observers.length : 0,
      afterRenderObservers: (sc.onAfterRenderObservable && sc.onAfterRenderObservable.observers) ? sc.onAfterRenderObservable.observers.length : 0,
      audioElements: domAudio,
    };
  }

  function mark(label = "mark") {
    const snap = captureResources(label);
    marks.set(label, snap);
    if (!baselineMark) baselineMark = snap;
    return snap;
  }

  function checkLeaks(fromLabel) {
    const current = captureResources("current");
    const base = (fromLabel && marks.get(fromLabel)) || baselineMark || rollingSamples[0] || current;
    const keys = [
      "meshes",
      "geometries",
      "materials",
      "textures",
      "estimatedTextureMB",
      "animationGroups",
      "skeletons",
      "particleSystems",
      "lights",
      "transformNodes",
      "renderTargets",
      "beforeRenderObservers",
      "afterRenderObservers",
      "audioElements",
    ];
    const deltas = {};
    keys.forEach((k) => {
      deltas[k] = round2((current[k] || 0) - (base[k] || 0));
    });

    // Check monotonic growth across rolling samples if at least 4 samples exist
    const growing = [];
    if (rollingSamples.length >= 4) {
      ["meshes", "geometries", "materials", "textures", "particleSystems", "beforeRenderObservers"].forEach((k) => {
        let inc = 0;
        for (let i = 1; i < rollingSamples.length; i++) {
          if (rollingSamples[i][k] > rollingSamples[i - 1][k]) inc++;
          else if (rollingSamples[i][k] < rollingSamples[i - 1][k]) inc = 0;
        }
        const net = rollingSamples[rollingSamples.length - 1][k] - rollingSamples[0][k];
        if (inc >= Math.min(4, rollingSamples.length - 1) && net >= 5) {
          growing.push({ resource: k, delta: net, samples: rollingSamples.length });
        }
      });
    }

    const hasLeaks =
      growing.length > 0 ||
      deltas.meshes > 40 ||
      deltas.materials > 20 ||
      deltas.textures > 15 ||
      deltas.beforeRenderObservers > 10;

    return {
      baselineLabel: base.label || "baseline",
      elapsedSec: round1(Math.max(0, (current.at - base.at) / 1000)),
      current,
      baseline: base,
      deltas,
      growing,
      hasLeaks,
    };
  }

  function resetCounters() {
    ring.length = 0;
    frameDirtyCalls = 0;
    ipcUpdateCalls = 0;
    totalDirtyCalls = 0;
    lastUpdateDurationMs = null;
  }

  function snapshot() {
    const sc = ensureAttached();
    const eng = sc && sc.getEngine ? sc.getEngine() : null;

    // 1. Frame & timing stats from ring buffer
    const n = ring.length;
    const avg = (fn) => (n ? ring.reduce((s, r) => s + fn(r), 0) / n : 0);
    const frameMs = round2(avg((r) => r.frameMs));
    const updateMs = round2(avg((r) => r.updateMs));
    const renderMs = round2(avg((r) => r.renderMs));
    const activeMeshesEvalMs = round2(avg((r) => r.activeEvalMs));
    const renderTargetsMs = round2(avg((r) => r.rttMs));
    const animationsMs = round2(avg((r) => r.animMs));
    const particlesMs = round2(avg((r) => r.partMs));
    const physicsMs = round2(avg((r) => r.physMs));
    const gpuFrameMs = round2(avg((r) => r.gpuMs));

    const engFps = eng && typeof eng.getFps === "function" ? eng.getFps() : 0;
    const fpsSamples = ring.map((r) => {
      const d = r.wallDeltaMs > 1 ? r.wallDeltaMs : Math.max(1, r.frameMs);
      return Math.min(240, 1000 / d);
    });
    const fps = Math.round(Number.isFinite(engFps) && engFps > 0 ? engFps : (fpsSamples.length ? fpsSamples[fpsSamples.length - 1] : 60));
    const fpsAvg = fpsSamples.length ? Math.round(fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length) : fps;
    const fpsWorst = fpsSamples.length ? Math.round(Math.min(...fpsSamples)) : fps;
    const jankFrames = ring.filter((r) => r.frameMs > 33.3 || r.wallDeltaMs > 50).length;
    const shaderCompiles = engineInst && engineInst.shaderCompilationTimeCounter ? engineInst.shaderCompilationTimeCounter.count : 0;

    // Steady-state dirty calls over the last DIRTY_WINDOW_FRAMES frames
    const recentRing = ring.slice(-DIRTY_WINDOW_FRAMES);
    const avgDirtyPerFrame = recentRing.length
      ? recentRing.reduce((s, r) => s + (r.dirtyCalls || 0), 0) / recentRing.length
      : frameDirtyCalls;
    const materialDirtyCallsPerFrame = round2(avgDirtyPerFrame);
    const materialDirtyCallsPerSec = round1(avgDirtyPerFrame * 60);

    // 2. Geometry, Draw Calls & Render Passes Audit
    const meshes = sc ? sc.meshes || [] : [];
    const activeMeshList = sc && sc.getActiveMeshes ? (sc.getActiveMeshes().data || sc.getActiveMeshes()).slice(0, (sc.getActiveMeshes().length || 0)) : [];
    const activeSet = new Set(activeMeshList);

    const shadowCasterSet = new Set();
    const activeRenderTargets = [];
    let shadowTris = 0;
    let shadowCasters = 0;

    if (sc) {
      // Shadow generators on lights
      (sc.lights || []).forEach((light) => {
        const sg = light && light.getShadowGenerator && light.getShadowGenerator();
        if (!sg) return;
        const sm = sg.getShadowMap && sg.getShadowMap();
        const rl = (sm && sm.renderList) || [];
        const enabledOnLight = light.isEnabled() && light.shadowEnabled !== false;
        let sgTris = 0;
        let sgActiveCasters = 0;
        rl.forEach((m) => {
          if (!m) return;
          shadowCasterSet.add(m);
          if (m.isEnabled()) {
            sgActiveCasters++;
            const t = (m.getTotalIndices ? m.getTotalIndices() / 3 : 0) * Math.max(1, m.thinInstanceCount || 0);
            sgTris += t;
          }
        });
        if (enabledOnLight) {
          shadowTris += sgTris;
          shadowCasters += sgActiveCasters;
          const sz = sm && sm.getSize ? sm.getSize() : { width: 0, height: 0 };
          activeRenderTargets.push({
            name: (light.name || "light") + ":shadowMap",
            kind: "ShadowGenerator",
            size: `${sz.width || 0}x${sz.height || 0}`,
            renderListCount: sgActiveCasters,
            fullScene: false,
            tris: Math.round(sgTris),
          });
        }
      });

      // Effect layers (GlowLayer, HighlightLayer)
      (sc.effectLayers || []).forEach((layer) => {
        if (!layer) return;
        const tex = layer._mainTexture;
        const sz = tex && tex.getSize ? tex.getSize() : { width: 0, height: 0 };
        const rl = tex ? tex.renderList : null;
        activeRenderTargets.push({
          name: layer.name || layer.getClassName?.() || "effectLayer",
          kind: (layer.getClassName && layer.getClassName()) || "EffectLayer",
          size: `${sz.width || 0}x${sz.height || 0}`,
          renderListCount: Array.isArray(rl) ? rl.length : meshes.length,
          fullScene: rl === null,
          tris: 0,
        });
      });

      // Custom render targets / MirrorTextures
      (sc.customRenderTargets || []).forEach((rtt) => {
        if (!rtt) return;
        const sz = rtt.getSize ? rtt.getSize() : { width: 0, height: 0 };
        const rl = rtt.renderList;
        activeRenderTargets.push({
          name: rtt.name || "rtt",
          kind: (rtt.getClassName && rtt.getClassName()) || "RenderTargetTexture",
          size: `${sz.width || 0}x${sz.height || 0}`,
          renderListCount: Array.isArray(rl) ? rl.length : meshes.length,
          fullScene: rl === null,
          tris: 0,
        });
      });
    }

    let totalTris = 0;
    let activeTris = 0;
    let activeBones = 0;
    let skinnedMeshes = 0;
    let thinInstanceMeshes = 0;
    let thinInstancesTotal = 0;
    let unfrozenMeshes = 0;
    let frozenMeshes = 0;
    const matGroups = new Map();
    const heavyCandidates = [];
    const countedSkeletons = new Set();

    meshes.forEach((m) => {
      if (!m) return;
      const verts = m.getTotalVertices ? m.getTotalVertices() : 0;
      const baseTris = m.getTotalIndices ? m.getTotalIndices() / 3 : 0;
      const thinCount = m.thinInstanceCount || 0;
      const instMultiplier = Math.max(1, thinCount);
      const tris = Math.round(baseTris * instMultiplier);
      totalTris += tris;

      const isActive = activeSet.has(m) || (activeSet.size === 0 && m.isEnabled() && verts > 0);
      if (isActive) activeTris += tris;

      if (thinCount > 0) {
        thinInstanceMeshes++;
        thinInstancesTotal += thinCount;
      }

      const skel = m.skeleton;
      const bones = skel && skel.bones ? skel.bones.length : 0;
      if (skel) {
        skinnedMeshes++;
        if (isActive && !countedSkeletons.has(skel)) {
          countedSkeletons.add(skel);
          activeBones += bones;
        }
      }

      if (verts > 0) {
        if (m.isWorldMatrixFrozen) frozenMeshes++;
        else unfrozenMeshes++;
      }

      if (verts > 0 && thinCount === 0 && !skel && m.material) {
        const mName = m.material.name || "unnamed";
        const g = matGroups.get(mName) || { material: mName, count: 0, tris: 0 };
        g.count++;
        g.tris += tris;
        matGroups.set(mName, g);
      }

      if (tris > 0 && m.isEnabled()) {
        heavyCandidates.push({
          name: m.name || "mesh",
          tris,
          verts,
          skinned: !!skel,
          bones,
          thinInstances: thinCount,
          castsShadow: shadowCasterSet.has(m),
        });
      }
    });

    heavyCandidates.sort((a, b) => b.tris - a.tris);
    const topHeavyMeshes = heavyCandidates.slice(0, 5);

    const unmergedMaterialGroups = [...matGroups.values()]
      .filter((g) => g.count >= 10)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const materials = sc ? sc.materials || [] : [];
    const unfrozenMaterials = materials.filter((m) => m && !m.isFrozen).length;

    const lights = sc ? sc.lights || [] : [];
    const enabledLights = lights.filter((l) => l && l.isEnabled()).length;
    const zeroIntensityEnabledLights = lights.filter((l) => l && l.isEnabled() && (l.intensity || 0) <= 0.01).length;

    const drawCalls = sceneInst && sceneInst.drawCallsCounter
      ? (sceneInst.drawCallsCounter.current || Math.round(avg((r) => r.drawCalls)))
      : activeMeshList.length;

    const leaks = checkLeaks();

    // 5. Plain-English Root-Cause Suspects
    const suspects = [];
    if (materialDirtyCallsPerSec > 5) {
      suspects.push(
        `Per-frame material dirtying (${materialDirtyCallsPerSec}/sec, ${materialDirtyCallsPerFrame}/frame): check pipeline.imageProcessing.exposure or PBR clearCoat/light toggles marking all submeshes dirty.`
      );
    }
    if (topHeavyMeshes[0] && topHeavyMeshes[0].tris > 25000 && topHeavyMeshes[0].castsShadow) {
      suspects.push(
        `High-poly mesh "${topHeavyMeshes[0].name}" (${topHeavyMeshes[0].tris} tris) is casting shadows directly; use a low-poly shadow proxy.`
      );
    }
    if (shadowTris > 25000) {
      suspects.push(
        `Shadow map triangle bloat (${Math.round(shadowTris)} tris across ${shadowCasters} casters > 25,000 threshold).`
      );
    }
    activeRenderTargets.forEach((rt) => {
      if (rt.fullScene || rt.kind === "GlowLayer" || rt.kind === "MirrorTexture") {
        suspects.push(
          `Extra scene render pass "${rt.name}" (${rt.kind}, ${rt.size}, renderList=${rt.renderListCount}) re-renders active meshes.`
        );
      }
    });
    const meshWithVerts = frozenMeshes + unfrozenMeshes;
    if (meshWithVerts > 100 && unfrozenMeshes / meshWithVerts > 0.7) {
      suspects.push(
        `${unfrozenMeshes} of ${meshWithVerts} meshes (${Math.round((unfrozenMeshes / meshWithVerts) * 100)}%) have unfrozen world matrices; call freezeWorldMatrix() on static geometry.`
      );
    }
    if (enabledLights > 6) {
      suspects.push(
        `${enabledLights} lights enabled simultaneously (${zeroIntensityEnabledLights} with <=0.01 intensity); disable off-screen or 0-intensity lights.`
      );
    } else if (zeroIntensityEnabledLights > 0) {
      suspects.push(
        `${zeroIntensityEnabledLights} enabled light(s) have intensity <= 0.01; call light.setEnabled(false) when off.`
      );
    }
    if (leaks.hasLeaks) {
      suspects.push(
        `Potential resource leak detected since ${leaks.baselineLabel}: deltas=${JSON.stringify(leaks.deltas)}.`
      );
    }

    return {
      fps,
      fpsAvg,
      fpsWorst,
      jankFrames,
      frameMs,
      updateMs,
      renderMs,
      activeMeshesEvalMs,
      renderTargetsMs,
      animationsMs,
      particlesMs,
      physicsMs,
      gpuFrameMs,
      shaderCompiles,
      drawCalls,
      activeMeshes: activeMeshList.length,
      totalMeshes: meshes.length,
      activeTris: Math.round(activeTris),
      totalTris: Math.round(totalTris),
      shadowTris: Math.round(shadowTris),
      shadowCasters,
      activeBones,
      skinnedMeshes,
      thinInstanceMeshes,
      thinInstancesTotal,
      activeRenderTargets,
      topHeavyMeshes,
      frozenMeshes,
      unfrozenMeshes,
      unfrozenMaterials,
      enabledLights,
      zeroIntensityEnabledLights,
      unmergedMaterialGroups,
      materialDirtyCallsPerFrame,
      materialDirtyCallsPerSec,
      ipcUpdateCalls,
      totalDirtyCalls,
      timing: {
        fps,
        fpsAvg,
        fpsWorst,
        jankFrames,
        frameMs,
        updateMs,
        renderMs,
        activeMeshesEvalMs,
        renderTargetsMs,
        animationsMs,
        particlesMs,
        physicsMs,
        gpuFrameMs,
        shaderCompiles,
        samples: n,
      },
      geometry: {
        drawCalls,
        activeMeshes: activeMeshList.length,
        totalMeshes: meshes.length,
        activeTris: Math.round(activeTris),
        totalTris: Math.round(totalTris),
        shadowTris: Math.round(shadowTris),
        shadowCasters,
        activeBones,
        skinnedMeshes,
        thinInstanceMeshes,
        thinInstancesTotal,
        activeRenderTargets,
        topHeavyMeshes,
      },
      batching: {
        frozenMeshes,
        unfrozenMeshes,
        unfrozenMaterials,
        enabledLights,
        zeroIntensityEnabledLights,
        unmergedMaterialGroups,
        materialDirtyCallsPerFrame,
        materialDirtyCallsPerSec,
      },
      resources: leaks.current,
      leaks,
      suspects,
    };
  }

  function summary() {
    const s = snapshot();
    const lines = [
      `FPS: ${s.fps} (avg ${s.fpsAvg}, worst ${s.fpsWorst}, jank ${s.jankFrames}/${s.timing.samples}) | Frame: ${s.frameMs}ms (update ${s.updateMs}ms + render ${s.renderMs}ms, eval ${s.activeMeshesEvalMs}ms, RTT ${s.renderTargetsMs}ms)`,
      `Geometry: ${s.drawCalls} draw calls | ${s.activeMeshes}/${s.totalMeshes} active meshes | ${s.activeTris}/${s.totalTris} tris | Shadow: ${s.shadowTris} tris (${s.shadowCasters} casters) | Bones: ${s.activeBones}`,
      `Batching & Lights: ${s.frozenMeshes} frozen / ${s.unfrozenMeshes} unfrozen meshes | ${s.enabledLights} enabled lights (${s.zeroIntensityEnabledLights} zero-intensity) | Dirty calls/sec: ${s.materialDirtyCallsPerSec}`,
      `Resources: ${s.resources.meshes} meshes, ${s.resources.materials} mats, ${s.resources.textures} tex (${s.resources.estimatedTextureMB} MB), ${s.resources.particleSystems} particles`,
    ];
    if (s.suspects.length) {
      lines.push(`Suspects (${s.suspects.length}):`);
      s.suspects.forEach((msg) => lines.push(`  - ${msg}`));
    } else {
      lines.push(`Suspects: none`);
    }
    return lines.join("\n");
  }

  function toggleOverlay(force) {
    if (typeof document === "undefined" || !document.body || typeof document.createElement !== "function") return false;
    const want = force != null ? !!force : !overlayEl;
    if (!want) {
      if (overlayTimer) clearInterval(overlayTimer);
      overlayTimer = null;
      if (overlayEl && overlayEl.remove) overlayEl.remove();
      overlayEl = null;
      return false;
    }
    if (!overlayEl) {
      overlayEl = document.createElement("pre");
      overlayEl.id = "hawkes-perf-hud";
      overlayEl.style.cssText =
        "position:fixed;z-index:9999;left:10px;top:10px;margin:0;padding:8px 10px;background:rgba(8,12,20,0.86);color:#bfe3ff;border:1px solid rgba(126,200,255,0.4);border-radius:8px;font:11px/1.35 ui-monospace,monospace;pointer-events:none;white-space:pre-wrap;max-width:460px";
      document.body.appendChild(overlayEl);
      overlayTimer = setInterval(() => {
        if (overlayEl) overlayEl.textContent = summary();
      }, 500);
    }
    overlayEl.textContent = summary();
    return true;
  }

  if (initialScene) attach(initialScene);
  else attach(discoverScene());

  return {
    attach,
    detach,
    snapshot,
    summary,
    mark,
    diff: checkLeaks,
    checkLeaks,
    resetCounters,
    toggleOverlay,
  };
}

export function installHawkesPerf(scene, opts) {
  const g = typeof window !== "undefined" ? window : globalThis;
  if (g.hawkesPerf && scene) {
    g.hawkesPerf.attach(scene);
    return g.hawkesPerf;
  }
  const inst = createHawkesPerf(scene, opts);
  g.hawkesPerf = inst;
  g.createHawkesPerf = createHawkesPerf;
  if (g.day) g.day.perf = inst;
  return inst;
}

if (typeof window !== "undefined") {
  installHawkesPerf();
}

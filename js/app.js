/* ==========================================================================
   The page's entry (Vite bundles it). The files keep their old roles and order:
   Babylon, the day, the engine, the world, the page, analytics, then taking control
   (js/control.js, a real module). Each of the others sets its
   globals on window (DAY_CONFIG, DayEngine, DayWorld, day), as before.
   Havok physics loads after the first frame is possible: the day never waits for
   it, and if it can't load the day still plays (without colliders).
   ========================================================================== */
import "./babylon.js";
import "../day.config.js";
import "./schedule.js";
import "./world.js";
import "./main.js";
import "./analytics.js";
import "./look.js"; // the city: PBR, neon, skies, quality
import "./control.js"; // the player can take control of him
import "./weather.js"; // the day's forecast, and the weather he commands while he's the player's
import "./score.js"; // weather music beds, sampled ambience, take-control sting (after weather)
import "./powers.js"; // Pressure, and the storm, lightning, gust and tornado he spends it on
import "./voice.js"; // Small Weather's spoken lines (DoD Eric); listens to power / weather / control
import "./episodes.js"; // chapter episodes: offer on take, goals, forecast score card
import "./tutorial.js"; // first visit: take control, move, jump, one bolt, let go; skippable
import { installHawkesPerf } from "./hawkes-perf.js"; // Babylon 9 root-cause perf & leak monitor (window.hawkesPerf)
import HavokPhysics from "@babylonjs/havok";
import havokWasm from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

const control = (window.DAY_CONFIG && window.DAY_CONFIG.control) || {};
const status = { babylon: window.BABYLON.Engine.Version, physics: "loading", model: control.model ? "loading" : "figure" };
window.day && (window.day.engineInfo = () => ({ ...status }));
const perfWorld = window.day && window.day.world && window.day.world();
if (perfWorld && perfWorld.scene) installHawkesPerf(perfWorld.scene, { product: "icanbe" });

/* Small Weather's 3D model (day.config.js control.model): kick off fetching the GLB and loader chunk early
   in parallel so the model is ready right after the first frame. */
const skinWorld = control.model && window.day && window.day.world();
if (skinWorld) {
  const w = skinWorld;
  const swModuleP = import("./small-weather.js");
  const glbBytesP = typeof fetch === "function"
    ? fetch(control.model).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
    : Promise.resolve(null);
  Promise.all([swModuleP, glbBytesP])
    .then(([{ loadSmallWeather }, buf]) => loadSmallWeather(w, control.model, buf))
    .then((skin) => {
      w.setSkin(skin);
      Object.assign(status, { model: "small-weather", clips: skin.clips });
      console.info(`[world] Small Weather's model: ${skin.clips.length} clips (${skin.clips.join(" ")})`);
    })
    .catch((err) => {
      Object.assign(status, { model: "figure", modelError: String((err && err.message) || err) });
      console.error("[world] Small Weather's model didn't load:", err);
    })
    .finally(() => window.dispatchEvent(new CustomEvent("day:model", { detail: { ...status } })));
}

HavokPhysics({ locateFile: () => havokWasm })
  .then((havok) => {
    const w = window.day && window.day.world();
    if (!w) throw new Error("no world");
    const p = w.enablePhysics(havok);
    Object.assign(status, { physics: "havok", bodies: p.bodies, colliders: p.colliders });
    console.info(`[world] Babylon ${status.babylon}, Havok physics: ${p.colliders} colliders in ${p.bodies} bodies`);
  })
  .catch((err) => {
    status.physics = "off";
    status.error = String((err && err.message) || err);
    console.error("[world] Havok physics didn't load:", err);
  })
  .finally(() => {
    // The side panel's foot says what's running.
    const foot = document.querySelector(".foot");
    if (foot) {
      const s = document.createElement("span");
      s.className = "engine";
      s.textContent = ` Babylon ${status.babylon} · physics ${status.physics === "havok" ? "on (Havok)" : status.physics}.`;
      foot.appendChild(s);
    }
    window.dispatchEvent(new CustomEvent("day:engine", { detail: { ...status } }));
  });

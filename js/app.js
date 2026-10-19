/* ==========================================================================
   The page's entry (Vite bundles it). The files keep their old roles and order:
   Babylon, the day, the engine, the world, the page, analytics. Each one sets its
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
import HavokPhysics from "@babylonjs/havok";
import havokWasm from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

const status = { babylon: window.BABYLON.Engine.Version, physics: "loading" };
window.day && (window.day.engineInfo = () => ({ ...status }));

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
  .finally(() => window.dispatchEvent(new CustomEvent("day:engine", { detail: { ...status } })));

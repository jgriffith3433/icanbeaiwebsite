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
import "./cityscape.js"; // the city's density: facades, lit windows, fillers, skyline, crosswalks, lamps
import "./crowd.js"; // the district's people and cars, on the day's clock (thin instances)
import "./control.js"; // the player can take control of him
import "./weather.js"; // the day's forecast, and the weather he commands while he's the player's
import "./mix.js"; // shared buses, reverb zones, HRTF/occlusion, voice duck, Settings sliders (before score/sfx/voice)
import "./score.js"; // weather music beds, sampled ambience, take-control sting (after weather)
import "./stems.js"; // the stem score under control: one 4-note motif, three synced layers, stings (after score.js)
import "./daysound.js"; // autopilot diegetic soundscapes by schedule block (after score: uses ambience bus)
import "./render-pipeline.js"; // the picture: ACES, a grade LUT per hour and weather, emissive bloom, SSAO2, cascaded shadows (after weather: it follows weather.now())
import "./sky.js"; // the sky: painted panoramas by the clock, a cloud deck, Sun break god rays, sky reflections (after look, weather and the pipeline)
import "./rain.js"; // heavy rain: splashes and ripples from a height map, skyline curtains, window runnels, drips, lens drops, height fog (after weather)
import "./aftermath.js"; // Sun break after rain: steam, rainbow at 42°, dripping gutters, pigeons home, umbrellas fold (after rain + sky)
import "./ui-art.js"; // UI art kit: verb icons, frames, ranks, busts, fonts (before powers paints the bar)
import "./powers.js"; // Pressure, and the storm, lightning, gust and tornado he spends it on
import "./barks.js"; // Small Weather's needs and weather reactions in the log, once each per day (docs/voice-style.md)
import "./voice.js"; // Small Weather's spoken lines (DoD Eric); listens to power / weather / control
import "./pilot.js"; // Pilot: the AI that runs his day — schedule nudges, take/let-go, wrist ring (after voice.js)
import { loadLate } from "./late.js"; // the Episodes button now; episodes.js (+finale), windfog.js, moments.js and tornado.js load after the first cast or on idle
import "./neighbors.js"; // three neighbors: look, home, day, speech-bubble beats, rewards
import "./phonemenu.js"; // phone: Neighbors and Episodes behind one Menu button (after both)
import "./tutorial.js"; // first visit: take control, move, jump, one bolt, let go; skippable
import "./street.js"; // the street teaches: Rain, Sun, Fog and Wind each arrive on a neighbor's voiced ask (starts on the cold open)
import "./coldopen.js"; // a new player's first Play: the roof at dusk, one prompt, the first bolt (before title.js calls it)
import "./firstrain.js"; // clarity: one glowing Rain icon and a "Tap the street" arrow until the first Rain; the other four verbs wait
import "./heroprompt.js"; // one in-world prompt over him until the first cast: "Hold V to call wind"
import "./opening.js"; // the first Play: a short skippable intro on Small Weather
import "./dialogue.js"; // the story's and neighbors' lines, spoken in each speaker's voice when their clip is in the build
import "./slice.js"; // vertical slice: apt crown, day-keyed lawn, pond ripples, pigeons, coin toss
import "./garden.js"; // Birdie's wilting pots and dry lawn tufts that the first Rain revives (after slice.js)
import "./memory.js"; // the city remembers: deeds by real date in localStorage, and the lawn, scorch, bins, puddles and tomatoes they leave (after slice.js)
import "./asks.js"; // asks in the world: a plumbob over the neighbor who asks, the verb icon over the place it is for (after street, neighbors, memory)
import "./sfx.js"; // synthesized sound for steps, jumps, landings, bolts, the tornado, episodes, story babble and city life
import "./titlesound.js"; // night-city ambience under the title, a click on its buttons, a whoosh on the first Gust (before title.js)
import "./daily.js"; // today's request: one neighbour asks for one bit of weather, by the real date (before title.js shows it)
import "./transition.js"; // storm-cloud wipe, prop fade-in, frame timing around every scene change (before title handoff)
import "./title.js"; // the title screen: the skyline, Play and Episodes (opens first)
import { installHawkesPerf } from "./hawkes-perf.js"; // Babylon 9 root-cause perf & leak monitor (window.hawkesPerf)
import HavokPhysics from "@babylonjs/havok";
import havokWasm from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

/* The late chunk (js/late.js) normally starts after the first cast. A bot's tab for any scenario but cold-start loads it here, before the
   page is up, so those scenarios see episodes, wind and fog, moments and the tornado as they always did (cold-start measures the real order). */
{
  let botParam = null;
  try { botParam = new URLSearchParams(location.search).get("playtest"); } catch (e) { /* no location */ }
  if (botParam && botParam !== "cold-start") await loadLate();
}

/* The loading card (index.html, window.__loading): the card goes when scripts, his model, the first frame and the title are all in. */
const loading = window.__loading || { set() {}, done() {}, fail() {} };
const ready = { model: false, frame: false, title: false, lights: false };
/* The card does NOT wait for his 3 MB model: on a phone over Slow 4G that download alone kept it up past 20 s. He is hidden
   until the model is on (world.js), the card goes once the scripts, first frame, title and shader warm-up are in, and the
   model streams in behind the title (ready.model is kept for the record). */
/* The bar now covers the shader warm-up (city, his skin, the five weather effects, the light sets) so the first frame of play and
   the first use of each power never compile. It is still bounded: LIGHTS_CAP_MS ends the gate whatever the GPU does (a slow or
   software GL, a compile that never settles), and the warm-up carries on behind the title. One timeout, no polling. */
const LIGHTS_CAP_MS = (typeof window !== "undefined" && (window.innerWidth <= 700 || (window.matchMedia && matchMedia("(pointer: coarse)").matches))) ? 3500 : 6000;
const maybeDone = () => { if (ready.frame && ready.title && ready.lights) loading.done(); };
loading.set("scripts", 1); // this module has run: every import above is in
(function waitFrame() {
  const d = window.day;
  if (d && d.now && d.now().frame) { loading.set("frame", 1); ready.frame = true; maybeDone(); return; }
  requestAnimationFrame(waitFrame); // per frame until the first one, then it stops: no timers, no fetches
})();
// title.js has already run (it is the last import): the title is built and, for a player, showing.
if (window.day && window.day.title) { ready.title = true; loading.set("title", 1); }

const control = (window.DAY_CONFIG && window.DAY_CONFIG.control) || {};
const status = { babylon: window.BABYLON.Engine.Version, physics: "loading", model: control.model ? "loading" : "figure" };
if (!control.model) { ready.model = true; loading.set("model", 1); }
window.day && (window.day.engineInfo = () => ({ ...status }));
const perfWorld = window.day && window.day.world && window.day.world();
if (perfWorld && perfWorld.scene) installHawkesPerf(perfWorld.scene, { product: "icanbe" });

/* Small Weather's 3D model (day.config.js control.model): kick off fetching the GLB and loader chunk early
   in parallel so the model is ready right after the first frame. He is drawn only once it is on (js/world.js
   keeps the box figure hidden): a failed load tries twice more, then he stays hidden, never a stand-in. */
/* Shader warm-up for the light sets the day switches between, behind the loading card (js/world.js warmLights):
   the first jump to night or to the office would otherwise freeze the page while they compile. */
(function warmUp() {
  const w = window.day && window.day.world && window.day.world();
  if (!w || !w.warmLights) { ready.lights = true; return; }
  /* Runs once his model is on (or has failed): his skinned PBR shader is one of the ones that recompiles per light set,
     so warming before he joins the scene left that compile for the first night or office jump. */
  /* The warm-up is a head start, never a reason to keep the card up: world.warmLights keeps its own 8 s budget and carries on
     behind the title once the card is gone; this cap (2.5 s) is the gate's own, so whatever that promise does (a compile that never settles on a slow or software GL), the
     card goes once the model, the frame and the title are in. */
  /* Two runs are asked for (first frame, then once his model is on). They never overlap (two warmLights fighting over the forced light
     groups switch the lights under a player), and `window.__warmIdle` / the `day:warm` event say when the last one is over:
     js/title.js holds a phone's auto-started cold open until then, so the warm-up's light-set switches and compiles never land on frames
     the player is already playing (the cold-start phone's 1.5 s hitch: the cold open began behind the loading card at +0.3 s). */
  let running = false;
  let again = false;
  const idle = () => {
    window.__warmIdle = true;
    try { window.dispatchEvent(new CustomEvent("day:warm", { detail: { idle: true } })); } catch (e) { /* old browser */ }
  };
  const go = () => {
    if (running) { again = true; return; }
    running = true;
    window.__warmIdle = false;
    const t0 = Date.now();
    setTimeout(() => { if (!ready.lights) { ready.lights = true; console.info(`[app] loading card: warm-up gate capped at ${LIGHTS_CAP_MS} ms`); maybeDone(); } }, LIGHTS_CAP_MS);
    const lightsDone = (how) => {
      running = false;
      if (again) { again = false; go(); } else if (window.__warmModelSettled || !control.model) idle();
      if (ready.lights) return; ready.lights = true; console.info(`[app] loading card: warm-up gate ended by ${how} after ${Date.now() - t0} ms`); maybeDone(); };
    /* then rain, fog, a sun break and wind drawn for a few frames each (weather.warmCasts): the first cast of each used to pay
       its compile and allocation as a 400-1000 ms frame */
    w.warmLights(8000).catch(() => {})
      .then(() => (window.weather && window.weather.warmCasts ? window.weather.warmCasts() : null)).catch(() => {})
      .finally(() => lightsDone("the warm-up")); // the card waits for it, up to LIGHTS_CAP_MS
  };
  window.__warmLights = () => (function afterFrame() {
    if (window.day.now && window.day.now().frame) go(); else requestAnimationFrame(afterFrame);
  })();
  window.__warmLights(); // now, not after the model: the model's own skinned shader is warmed again when it arrives (wear().then)
})();

const skinWorld = control.model && window.day && window.day.world();
if (skinWorld) {
  const w = skinWorld;
  // Streams the GLB so the loading card's bar follows the bytes (Content-Length), not a guess.
  const readBody = async (r) => {
    const total = Number(r.headers.get("content-length")) || 0;
    if (!r.body || !r.body.getReader) return r.arrayBuffer();
    const reader = r.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      if (total) loading.set("model", Math.min(0.9, (got / total) * 0.9)); // the last 10% is turning it into a skin
    }
    const out = new Uint8Array(got);
    let at = 0;
    chunks.forEach((c) => { out.set(c, at); at += c.length; });
    return out.buffer;
  };
  const fetchBytes = () => (typeof fetch === "function"
    ? fetch(control.model, { cache: "no-cache" }).then((r) => (r.ok ? readBody(r) : null)).catch(() => null)
    : Promise.resolve(null));
  const firstBytesP = fetchBytes();
  const firstModuleP = import("./small-weather.js");
  const RETRY_MS = [0, 2000, 6000];
  const wear = async () => {
    let lastErr = null;
    for (let i = 0; i < RETRY_MS.length; i++) {
      if (RETRY_MS[i]) await new Promise((r) => setTimeout(r, RETRY_MS[i]));
      try {
        const [{ loadSmallWeather }, buf] = await Promise.all([i ? import("./small-weather.js") : firstModuleP, i ? fetchBytes() : firstBytesP]);
        return await loadSmallWeather(w, control.model, buf);
      } catch (err) {
        lastErr = err;
        console.warn(`[world] Small Weather's model, try ${i + 1} of ${RETRY_MS.length}, didn't load:`, err);
      }
    }
    throw lastErr;
  };
  wear()
    .then((skin) => {
      w.setSkin(skin);
      Object.assign(status, { model: "small-weather", clips: skin.clips });
      ready.model = true;
      window.__warmModelSettled = true;
      loading.set("model", 1);
      maybeDone();
      if (window.__warmLights) window.__warmLights();
      console.info(`[world] Small Weather's model: ${skin.clips.length} clips (${skin.clips.join(" ")})`);
    })
    .catch((err) => {
      window.__warmModelSettled = true;
      if (window.__warmLights) window.__warmLights();
      w.setSkin(null); // he stays hidden: Small Weather or nothing, never the box figure
      Object.assign(status, { model: "none", modelError: String((err && err.message) || err) });
      console.error("[world] Small Weather's model didn't load:", err);
      loading.fail(String((err && err.message) || err), "Small Weather");
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

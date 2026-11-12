// Sun-break aftermath (js/aftermath-core.js + wiring). Run by npm test.
import {
  AFTERMATH, RAINBOW_DEG, wetWindowOk, antiSolar, rainbowAnti, rainbowDir, rainbowArc, rainbowRgb,
  envelope, budgets, dripSpawnRate, steamEmitRate,
} from "../js/aftermath-core.js";
import fs from "node:fs";

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.error("FAIL", m); } };

ok(AFTERMATH.rainWindowMin === 2, "wet window is 2 game minutes");
ok(AFTERMATH.steamSec === 20 && AFTERMATH.dripSec === 30, "steam 20 s and drips 30 s");
ok(RAINBOW_DEG === 42, "rainbow is 42 degrees");

ok(wetWindowOk(100, 101.5, 2) && wetWindowOk(100, 102, 2), "inside the wet window");
ok(!wetWindowOk(100, 103, 2) && !wetWindowOk(null, 100, 2), "outside the wet window / missing wet");

const anti = antiSolar(0.3, 0.8, 0.2);
ok(Math.abs(anti.x + 0.3 / Math.hypot(0.3, 0.8, 0.2)) < 1e-9, "anti-solar flips the sun");
const axis = rainbowAnti(0.3, 0.8, 0.2);
const d = rainbowDir(axis, 0);
const dot = d.x * axis.x + d.y * axis.y + d.z * axis.z;
ok(Math.abs(dot - Math.cos((42 * Math.PI) / 180)) < 1e-6, "rainbow cone is 42° from anti-solar: " + dot);
const arc = rainbowArc(axis, 36);
ok(arc.length >= 8 && arc.every((p) => p.y > 0), "arc samples stay above the horizon (" + arc.length + ")");
ok(axis.y > anti.y, "noon sun still lifts the axis so the arc clears the ground");
const rgb = rainbowRgb(0.5);
ok(rgb.length === 3 && rgb.every((c) => c >= 0 && c <= 1), "spectral colour in range");

ok(envelope(19, 20) > 0.9 && envelope(0, 20) === 0 && envelope(1, 20, 4) < 0.3, "envelope rises and fades");
ok(budgets("low").steam === 40 && budgets("high").steam === 90, "steam budgets 40/90 (phone half)");
ok(budgets("low").drips === 10 && budgets("high").drips === 22, "drip budgets half on phone");
ok(budgets("low").rainbow === true, "rainbow always on");
ok(steamEmitRate(18, 20, "high") > steamEmitRate(2, 20, "high"), "steam fades near the end");
ok(dripSpawnRate(28, 30, "low") < dripSpawnRate(28, 30, "high"), "phone drips slower");

const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
ok(/import "\.\/aftermath\.js"/.test(app), "js/app.js imports aftermath.js");
const rain = fs.readFileSync(new URL("../js/rain.js", import.meta.url), "utf8");
ok(/afterDrip/.test(rain) && /afterLeft/.test(rain), "rain.js exposes afterDrip");
const weather = fs.readFileSync(new URL("../js/weather.js", import.meta.url), "utf8");
ok(/boostSteam/.test(weather) && /steamHold/.test(weather), "weather.js exposes boostSteam");
const crowd = fs.readFileSync(new URL("../js/crowd.js", import.meta.url), "utf8");
ok(/action === "aftermath"/.test(crowd) && /umbrellasClosed/.test(crowd), "crowd answers day:crowd aftermath");
const play = fs.readFileSync(new URL("../js/playtest.js", import.meta.url), "utf8");
ok(/id: "sun-aftermath"/.test(play) && /async function sunAftermath/.test(play), "playtest sun-aftermath exists");
ok(/closedAt/.test(play) && /birdsAt/.test(play) && /15/.test(play), "playtest asserts umbrellas and birds within 15 s");
const af = fs.readFileSync(new URL("../js/aftermath.js", import.meta.url), "utf8");
ok(/wetWindowOk\(st\.lastWetMin/.test(af) && !/roofWet \|\| 0\) > 0\.12/.test(af), "aftermath gates on the 2 min wet window only");
const crowdSrc = fs.readFileSync(new URL("../js/crowd.js", import.meta.url), "utf8");
ok(/umbForceClose/.test(crowdSrc) && /prevUmbs - umbs/.test(crowdSrc), "crowd counts open→closed, not the open peak");
const cfg = fs.readFileSync(new URL("../day.config.js", import.meta.url), "utf8");
ok(/aftermath:\s*\{/.test(cfg) && /rainWindowMin:\s*2/.test(cfg), "day.config.js has aftermath");

if (bad) { console.error(bad + " aftermath check(s) failed"); process.exit(1); }
console.log("aftermath ok: 42° rainbow, 2 min wet window, phone half steam/drips, wiring in");

/* The score's day/night beds, layered weather soundscape, equal-power crossfades, and loop seam fixer (js/score.js). Run by npm test. */
import { bedFor, isNightHour, equalPowerGains, startScore } from "../js/score.js";
import { fixLoopSeam } from "./loop-seam.mjs";
import fs from "node:fs";

let bad = 0;
const ok = (cond, msg) => {
  if (!cond) {
    bad++;
    console.error("FAIL", msg);
  }
};
ok(bedFor("clear", 12) === "day", "clear at noon is the day bed");
ok(bedFor("clear", 21.7) === "night", "clear at 9:40 PM is the night bed");
ok(bedFor("clear", 3) === "night", "clear at 3 AM is the night bed");
ok(bedFor("clear", 7) === "day", "clear at 7 AM is the day bed");
ok(bedFor("wind", 22) === "night", "wind at night plays the night bed");
ok(bedFor("rain", 22) === "rain" && bedFor("storm", 12) === "storm", "rain and storm keep their beds");
ok(isNightHour(19.75) && !isNightHour(19.7) && isNightHour(6.2) && !isNightHour(6.25), "night is 7:45 PM to 6:15 AM");

// Equal-power crossfade check
for (const t of [0, 0.25, 0.5, 0.75, 1]) {
  const ep = equalPowerGains(t);
  ok(Math.abs(ep.power - 1) < 1e-6, `equalPowerGains(${t}) maintains constant power 1.0 (got ${ep.power})`);
}

// Loop seam fixer check (m_7da611816a0b: strip 1s silent hole at end + equal-power fold)
{
  const sr = 8000;
  const len = sr * 4; // 4 seconds
  const data = new Float32Array(len);
  for (let i = 0; i < sr * 3; i++) {
    data[i] = Math.sin((i / sr) * Math.PI * 2 * 220) * 0.5;
  }
  // Last second is a silent hole (0) followed by a sharp jump at the end
  data[len - 1] = 0.8;
  const rawBuf = {
    sampleRate: sr,
    length: len,
    numberOfChannels: 1,
    getChannelData: () => data,
  };
  const fixed = fixLoopSeam(rawBuf, 0.5);
  ok(fixed.trimmedSamples >= sr * 0.8, `fixLoopSeam trimmed silent tail hole (${fixed.trimmedSamples} samples)`);
  ok(fixed.fadeSamples >= sr * 0.25, `fixLoopSeam applied equal-power crossfade overlap (${fixed.fadeSamples} samples)`);
  ok(fixed.jumpAfter < 0.09 && fixed.jumpAfter < fixed.jumpBefore * 0.15, `fixLoopSeam eliminated wrap jump (before ${fixed.jumpBefore}, after ${fixed.jumpAfter})`);
}

const src = fs.readFileSync(new URL("../day.config.js", import.meta.url), "utf8");
globalThis.window = {
  addEventListener() {},
  dispatchEvent() {},
};
globalThis.document = {
  getElementById: () => ({ getAttribute: () => "true", addEventListener() {} }),
};
new Function("window", src)(globalThis.window);
const C = globalThis.window.DAY_CONFIG;
ok(C && C.title && C.title.play && C.title.episodes, "day.config.js has the title (Play, Episodes)");
const mix = C && C.score && C.score.mix;
ok(mix && ["master", "music", "ambience", "sting", "thunder", "title", "duck"].every((k) => typeof mix[k] === "number" && mix[k] >= 0 && mix[k] <= 1), "score.mix levels are 0..1");
ok(C && C.score && C.score.fallback && C.score.fallback.day !== C.score.fallback.night, "day and night fall back to different beds");
ok(!C.score.music.day || fs.existsSync(new URL("../" + C.score.music.day, import.meta.url)), "score.music.day names a file that exists (a missing file is a 404 in the console)");
ok(!C.score.music.night || fs.existsSync(new URL("../" + C.score.music.night, import.meta.url)), "score.music.night names a file that exists");

// Verify all configured ambience files exist on disk (no 404s)
for (const [k, rel] of Object.entries(C.score.ambience || {})) {
  ok(rel && fs.existsSync(new URL("../" + rel, import.meta.url)), `score.ambience.${k} (${rel}) exists on disk`);
}

// Verify layered weather soundscape & state crossfades across all states on a rooftop
let curWeather = { state: "clear", wet: 0, sun: 0.8 };
globalThis.window.weather = { now: () => curWeather };
const dayMock = {
  now: () => ({ minutes: 12 * 60 }),
  control: { state: () => ({ mode: "control", x: -24, y: 6.16, z: 0.5 }) },
  world: () => ({ camera: { alpha: 0.6, target: { x: -24, y: 7.5, z: 0.5 } } }),
  crowd: { positions: () => [{ x: -22, z: 8.5 }] },
};
globalThis.window.day = dayMock;
const score = startScore(dayMock);

// 1. Clear / Sun
score.tick({ rain: 0, wind: 0.08, wet: 0, sound: { air: 0.5, rain: 0, wind: 0.08 } }, 0.5);
const sunScape = score.now().soundscape;
ok(sunScape.onRoof && sunScape.birds > 0.5 && sunScape.brightened && sunScape.cityToneHz >= 3800, "clear/sun state on rooftop has birds and brightened city hum");

// 2. Rain (light patter vs heavy downpour, gutters, umbrella patter)
curWeather = { state: "rain", wet: 0.6, intensity: 0.45 };
score.tick({ rain: 0.45, wind: 0.2, wet: 0.6, sound: { air: 0.3, rain: 0.45, wind: 0.2 } }, 0.4);
const lightRain = score.now().soundscape;
curWeather = { state: "rain", wet: 0.95, intensity: 1.0 };
score.tick({ rain: 1.0, wind: 0.35, wet: 0.95, sound: { air: 0.25, rain: 1.0, wind: 0.35 } }, 0.4);
const heavyRain = score.now().soundscape;
ok(lightRain.rainRoof > lightRain.rainDownpour, "light rain emphasizes rooftop patter over heavy downpour");
ok(heavyRain.rainDownpour > lightRain.rainDownpour && heavyRain.gutter > 0.5 && heavyRain.umbrella > 0.2, "heavy rain brings in downpour, roof gutters, and umbrella rain");
ok(score.now().fade > 0 && score.now().fade < 1 && Math.abs(score.now().equalPower.power - 1) < 1e-4, "crossfade between beds is smooth and equal-power");

// 3. Wind (3D panned gusts + flapping awnings)
curWeather = { state: "wind", wet: 0 };
score.tick({ rain: 0, wind: 0.92, wet: 0, sound: { air: 0.35, rain: 0, wind: 0.92 } }, 0.5);
const windScape = score.now().soundscape;
ok(windScape.wind > 0.5 && windScape.awning > 0.4 && typeof windScape.windPan === "number", "wind state has 3D-panned gusts and flapping awnings");

// 4. Storm (distance-delayed thunder: near crack vs far rolling thunder)
curWeather = { state: "storm", wet: 1 };
score.tick({ rain: 0.95, wind: 0.85, wet: 1, sound: { air: 0.2, rain: 0.95, wind: 0.85, thunder: 0.9 } }, 0.5);
score.crack("near", { dist: 12, delay: 0.2, pan: -0.35 });
const nearTh = score.now().lastThunder;
score.crack("far", { dist: 95, delay: 1.18, pan: 0.55 });
const farTh = score.now().lastThunder;
ok(nearTh && nearTh.kind === "near" && farTh && farTh.kind === "far" && farTh.expectedDelay > nearTh.expectedDelay + 0.5, "thunder records distance-based delay for close cracks and rolling distant thunder");

// 5. Snow (muffled city)
curWeather = { state: "snow", wet: 0.2 };
score.tick({ rain: 0, wind: 0.15, snow: 0.9, wet: 0.2, sound: { air: 0.25, snow: 0.9 } }, 0.5);
const snowScape = score.now().soundscape;
ok(snowScape.muffled >= 0.8 && snowScape.cityToneHz <= 450 && snowScape.snowHush >= 0.8, "snow state muffles city hum and raises snow hush");

const pr = C.score.pressure;
ok(!pr || (pr.from >= 0 && pr.from < 1 && pr.gain >= 0 && pr.gain <= 1 && pr.rate >= 0 && pr.rate <= 0.2), "score.pressure is sane");
if (bad) {
  console.error(`check-score: ${bad} failed`);
  process.exit(1);
}
// No buffer rewrite in the browser: the seams are baked into the files (scripts/bake-loop-seams.mjs).
for (const f of ["../js/score.js", "../js/daysound.js"]) {
  ok(!/fixLoopSeam/.test(fs.readFileSync(new URL(f, import.meta.url), "utf8")), `${f} has no runtime fixLoopSeam`);
}
{
  const r = (await import("node:child_process")).spawnSync(process.execPath, [new URL("./bake-loop-seams.mjs", import.meta.url).pathname, "--check"], { encoding: "utf8" });
  ok(r.status === 0, `loop beds are baked and unchanged (${(r.stdout || r.stderr).trim()})`);
}
console.log("check-score: day/night beds, layered weather soundscape, equal-power crossfades and loop seams ok");

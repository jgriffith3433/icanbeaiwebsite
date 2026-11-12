/* Autopilot day soundscapes: pure mapping, radio weather from memory facts, phone loop cap, config ↔ recipes. */
import fs from "node:fs";
import {
  SCAPES, CHAPTER_SCAPE, scapeOf, radioWeatherOf, pickLoops, loopCap, activeLoops,
} from "../js/daysound-core.js";

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.error("FAIL", m); } };

ok(SCAPES.length === 6, "six soundscapes");
ok(scapeOf({ chapter: "wake" }) === "home" && scapeOf({ chapter: "ready" }) === "home", "morning home");
ok(scapeOf({ chapter: "commute" }) === "commute", "commute");
ok(scapeOf({ chapter: "work" }) === "office", "office");
ok(scapeOf({ chapter: "lunch" }) === "park", "park lunch");
ok(scapeOf({ chapter: "tv" }) === "tv", "evening tv");
ok(scapeOf({ chapter: "bedtime" }) === "night" && scapeOf({ chapter: "sleep" }) === "night", "night");
ok(Object.keys(CHAPTER_SCAPE).length >= 10, "chapter map covers the day");

ok(radioWeatherOf({ "any.rain": 1 }) === "rain", "radio names rain");
ok(radioWeatherOf({ "any.storm": 2, "any.rain": 9 }) === "storm", "storm beats rain");
ok(radioWeatherOf({ "any.sunbreak": 1 }) === "sun", "radio names sun break");
ok(radioWeatherOf({ "any.bolt": 1 }) === "bolt", "radio names lightning");
ok(radioWeatherOf({}) === "clear", "quiet sky default");

ok(pickLoops(["a", "b", "c", "d"], 3).join(",") === "a,b,c", "phone caps at 3");
ok(pickLoops(["a", "a", "b"], 3).join(",") === "a,b", "dedupes");
ok(loopCap("low", true) === 3 && loopCap("high", false) === 6, "loop caps by quality");

const officeLayers = [
  { id: "hvac" },
  { id: "keyboard", when: "desk" },
  { id: "meeting", when: "meeting" },
];
ok(activeLoops("office", officeLayers, { place: "desk" }).includes("keyboard"), "keyboard at desk");
ok(!activeLoops("office", officeLayers, { place: "hallMid" }).includes("keyboard"), "keyboard off when he leaves");
ok(activeLoops("home", [{ id: "shower", when: "shower" }], { things: { shower: "on" } }).includes("shower"), "shower when on");

const cfgSrc = fs.readFileSync(new URL("../day.config.js", import.meta.url), "utf8");
ok(/daysound:\s*\{/.test(cfgSrc), "day.config.js has daysound");
for (const id of SCAPES) ok(new RegExp(`${id}:\\s*\\{`).test(cfgSrc), `scape ${id} in config`);
ok(/jingle:/.test(cfgSrc) && /reports:\s*\{/.test(cfgSrc), "radio jingle + reports block");
for (const w of ["storm", "rain", "fog", "wind", "sun", "bolt", "clear"]) {
  ok(new RegExp(`${w}:\\s*\\{\\s*text:`).test(cfgSrc), `radio report ${w}`);
}
ok(/audio\/daysound\//.test(cfgSrc) || /sfx-day-/.test(fs.readFileSync(new URL("../hawkes.assets.json", import.meta.url), "utf8")), "daysound audio paths or recipes");

const assets = JSON.parse(fs.readFileSync(new URL("../hawkes.assets.json", import.meta.url), "utf8"));
const ids = (assets.assets || []).map((a) => a.id);
ok(ids.includes("sfx-day-soundscapes"), "recipe sfx-day-soundscapes");
ok(ids.includes("sfx-day-radio-jingle"), "recipe sfx-day-radio-jingle");
ok(ids.includes("voice-day-radio-weather"), "recipe voice-day-radio-weather");

// Named files in config must either exist or be allowed to fall back (synth). Presence is optional until Gen lands.
const dir = new URL("../audio/daysound/", import.meta.url);
ok(fs.existsSync(dir), "audio/daysound/ folder");

if (bad) process.exit(1);
console.log("daysound ok");

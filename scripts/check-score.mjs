/* The score's day/night beds (js/score.js): clear and wind play the day bed by day and the night bed at
   night; other weathers keep their own beds. Also: day.config.js has the title and the mix. Run by npm test. */
import { bedFor, isNightHour } from "../js/score.js";
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

const src = fs.readFileSync(new URL("../day.config.js", import.meta.url), "utf8");
globalThis.window = {};
new Function("window", src)(globalThis.window);
const C = globalThis.window.DAY_CONFIG;
ok(C && C.title && C.title.play && C.title.episodes, "day.config.js has the title (Play, Episodes)");
const mix = C && C.score && C.score.mix;
ok(mix && ["master", "music", "ambience", "sting", "thunder", "title", "duck"].every((k) => typeof mix[k] === "number" && mix[k] >= 0 && mix[k] <= 1), "score.mix levels are 0..1");
ok(C && C.score && C.score.fallback && C.score.fallback.day !== C.score.fallback.night, "day and night fall back to different beds");
ok(!C.score.music.day || fs.existsSync(new URL("../" + C.score.music.day, import.meta.url)), "score.music.day names a file that exists (a missing file is a 404 in the console)");
ok(!C.score.music.night || fs.existsSync(new URL("../" + C.score.music.night, import.meta.url)), "score.music.night names a file that exists");

if (bad) {
  console.error(`check-score: ${bad} failed`);
  process.exit(1);
}
console.log("check-score: day/night beds, title and mix ok");

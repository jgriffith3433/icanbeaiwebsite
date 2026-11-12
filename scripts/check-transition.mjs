/* Seamless scene changes (js/transition.js + day.config.js transition): wipe timing, fade-in, wiring.
   node scripts/check-transition.mjs */
import fs from "node:fs";

const root = new URL("../", import.meta.url);
Object.assign(globalThis, { window: globalThis, document: undefined });
await import(new URL("day.config.js", root).href);
const cfg = globalThis.DAY_CONFIG.transition || {};
const src = fs.readFileSync(new URL("js/transition.js", root), "utf8");
const ep = fs.readFileSync(new URL("js/episodes.js", root), "utf8");
const app = fs.readFileSync(new URL("js/app.js", root), "utf8");
const score = fs.readFileSync(new URL("js/score.js", root), "utf8");
const index = fs.readFileSync(new URL("index.html", root), "utf8");
const play = fs.readFileSync(new URL("js/playtest.js", root), "utf8");

let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.error("FAIL", m); } };

ok(cfg.wipeSec === 1.2, `wipeSec is ${cfg.wipeSec}, want 1.2`);
ok(cfg.fadeInSec === 0.3, `fadeInSec is ${cfg.fadeInSec}, want 0.3`);
ok(cfg.coverIn > 0 && cfg.coverOut > 0, "cover in/out are set");
ok(/export function startTransition/.test(src), "transition.js exports startTransition");
ok(/storm-wipe/.test(src) && /day:transition/.test(src), "storm wipe canvas and day:transition events");
ok(/fillRect\(0, 0, w, h\)/.test(src), "full-screen opaque cover before the swap");
ok(/phase === "hold"/.test(src) && /workDone/.test(src), "hold cover until work finishes");
ok(/forceCompilationAsync/.test(src) && /whenReadyAsync/.test(src), "wipe warms shaders");
ok(/visibility/.test(src) && /fadeIn/.test(src), "prop fade-in uses visibility, not shared materials");
ok(/sampleCover/.test(src) && /lastBlack/.test(src), "black-frame sampled from the wipe canvas");
ok(/import "\.\/transition\.js"/.test(app), "app.js imports transition.js before title");
ok(/T\.wipe|transition.*wipe|wantWipe/.test(ep), "episodes.start uses the storm wipe");
ok(/fadeNewProps|fadeIn\(nodes\)/.test(ep), "episode props fade in");
ok(/kind: "chapter"/.test(ep), "chapter-opener clock jump is wiped");
ok(/whoosh\(\)/.test(score) && /let-go/.test(score), "take/let-go pair a whoosh");
ok(/handoff/.test(index) && /opacity \.9s/.test(index), "loading card fades 0.9 s into the title");
ok(/episode-jump/.test(play) && /episodeJump/.test(play), "playtest scenario episode-jump");
ok(/jumpWorstMs/.test(play) && /wipe-start/.test(play), "playtest records jump frame times and wipe events");

if (failed) {
  console.error(`check-transition: ${failed} fail(s)`);
  process.exit(1);
}
console.log("check-transition: wipe 1.2 s, fade-in 0.3 s, episodes/app/score/loading/playtest wired ok");

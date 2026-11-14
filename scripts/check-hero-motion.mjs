#!/usr/bin/env node
/* Hero motion: extra clips on disk, SKIN_CLIPS names, stride constants, and the playtest scenario id. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failed = 0;
const ok = (cond, msg) => {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else console.log("ok:", msg);
};

const clips = ["lookup", "windbolt", "windrain", "triumph", "shelter", "window"];
for (const c of clips) {
  const f = path.join(root, "models", "clips", `${c}.glb`);
  ok(fs.existsSync(f) && fs.statSync(f).size > 1000, `models/clips/${c}.glb present`);
}

const sw = fs.readFileSync(path.join(root, "js/small-weather.js"), "utf8");
for (const c of clips) ok(new RegExp(`"${c}"`).test(sw), `SKIN_CLIPS lists ${c}`);
ok(/WALK_STRIDE = 0\.86/.test(sw) && /RUN_STRIDE = 1\.25/.test(sw), "stride constants 0.86 / 1.25");
ok(/makeFootIk|two-bone foot IK/i.test(sw), "foot IK present");
ok(/small-weather-rim/.test(sw), "rim light present");

const play = fs.readFileSync(path.join(root, "js/playtest.js"), "utf8");
ok(/id:\s*"hero-move"/.test(play) && /async function heroMove/.test(play), "playtest scenario hero-move registered");

ok(/id:\s*"clip-poses"/.test(play) && /async function clipPoses/.test(play) && /pose: \(\) => bodyPose/.test(sw), "playtest scenario clip-poses registered and skin.pose() exists");

ok(/id:\s*"idle-pose"/.test(play) && /async function idlePose/.test(play) && /handFwdL/.test(sw), "playtest scenario idle-pose registered and skin.pose() reads hands and boots");

const metrics = JSON.parse(fs.readFileSync(path.join(root, "docs/metrics.json"), "utf8"));
ok(metrics.feel?.coyoteMs >= 80 && metrics.feel?.jumpBufferMs >= 80, "docs/metrics.json feel floors");
ok(metrics.motion?.footSlideLimitM === 0.05, "foot slide limit 5 cm");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nhero-motion: all checks passed");

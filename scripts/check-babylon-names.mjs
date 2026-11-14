// Every BABYLON.<Name> the game reads must be in js/babylon.js's named imports (the global is built from them,
// not from `import * as`). Fails on a name that would be undefined in the page.
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync("js/babylon.js", "utf8");
const block = src.slice(src.indexOf("const BABYLON = {"), src.indexOf("};", src.indexOf("const BABYLON = {")));
const have = new Set(block.match(/\b[A-Z][A-Za-z0-9_]*\b/g));
const used = new Map();
const files = [...fs.readdirSync("js").filter((n) => n.endsWith(".js")).map((n) => path.join("js", n)), "day.config.js"];
for (const f of files) {
  if (f === "js/babylon.js") continue;
  for (const m of fs.readFileSync(f, "utf8").matchAll(/\b(?:BABYLON|B)\.([A-Z][A-Za-z0-9_]*)/g)) {
    if (!used.has(m[1])) used.set(m[1], f);
  }
}
const missing = [...used].filter(([n]) => !have.has(n));
if (missing.length) {
  console.error("BABYLON names used but not in js/babylon.js: " + missing.map(([n, f]) => `${n} (${f})`).join(", "));
  process.exit(1);
}
console.log(`ok: ${used.size} Babylon names, all in js/babylon.js`);

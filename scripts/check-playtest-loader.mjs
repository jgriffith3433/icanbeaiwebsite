// The playtest loader: a bot tab awaits playtest.js at top level (the contract is real before DOMContentLoaded);
// a player's page keeps the stub and never imports it statically.
import { readFileSync } from "node:fs";
const loader = readFileSync("js/playtest-loader.js", "utf8");
const html = readFileSync("index.html", "utf8");
const app = readFileSync("js/app.js", "utf8");
const bad = [];
if (!/^if \(window\.__playtestBot\) await import\("\.\/playtest\.js"\)\.catch\(/m.test(loader)) bad.push("loader must top-level await import(playtest.js) on the bot path, with a .catch");
if (!/navigator\.webdriver/.test(loader) || !/get\("playtest"\)/.test(loader)) bad.push("bot path must test navigator.webdriver and ?playtest=");
if (!/if \(!bot\) \{\s*[^}]*window\.hawkesPlaytest = stub/.test(loader)) bad.push("the stub must stay for players");
if (/requestAnimationFrame|addEventListener\("load"/.test(loader)) bad.push("no deferred load on the bot path");
for (const [n, t] of [["index.html", html], ["js/app.js", app]]) {
  if (/import[^;\n]*playtest\.js/.test(t.replace(/playtest-loader\.js/g, ""))) bad.push(n + " statically imports playtest.js");
  if (/<script[^>]*src="[^"]*\/playtest\.js/.test(t)) bad.push(n + " loads playtest.js by script tag");
}
if (bad.length) { console.error("check-playtest-loader FAILED:\n- " + bad.join("\n- ")); process.exit(1); }
console.log("check-playtest-loader ok");

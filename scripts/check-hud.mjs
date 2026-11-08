// The HUD's placement lives in css/hud.css only (J: no hand-tuned pixel offsets spread across the modules).
// This checks: hud.css exists and index.html links it; no module's own <style> (or site.css) places a HUD root
// (position / top / right / bottom / left) -- look only; the status card has no lone "-" placeholder in the HTML.
import { readFileSync, existsSync } from "node:fs";

const fail = [];
const roots = [".abilitybar", ".pressure", ".powerpad", ".tutorial", ".nb-btn", ".nb-panel", ".nb-toast", ".nb-layer", ".mo-line",
  ".ep-btn", ".ep-hud", ".ep-say", ".ep-toast", ".control-btn", ".quality-btn", ".control-hint", ".touchpad", ".weather-btn", "#weather-chip", ".side"];
const placement = /(^|;)\s*(position|top|right|bottom|left|inset)\s*:/;

function scan(file, text) {
  for (const m of text.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const sels = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    for (const sel of sels) {
      const tokens = sel.split(/\s+/).filter((t) => !/^(html|body)\b/.test(t));
      if (tokens.length !== 1) continue;
      const hit = roots.find((r) => tokens[0].startsWith(r) && !/^[\w-]/.test(tokens[0].slice(r.length)));
      if (hit && placement.test(";" + m[2])) fail.push(`${file}: "${sel}" sets placement (${m[2].match(placement)[2]}); put it in css/hud.css`);
    }
  }
}

if (!existsSync("css/hud.css")) fail.push("css/hud.css is missing");
if (!/css\/hud\.css/.test(readFileSync("index.html", "utf8"))) fail.push("index.html doesn't link css/hud.css");
for (const f of ["abilities", "powers", "tutorial", "neighbors", "moments", "episodes"]) scan(`js/${f}.js`, readFileSync(`js/${f}.js`, "utf8"));
scan("css/site.css", readFileSync("css/site.css", "utf8"));
const html = readFileSync("index.html", "utf8");
if (/id="(chapter|where|time)"[^>]*>\s*[–—-]\s*</.test(html)) fail.push('index.html shows a lone dash in the status card');

if (fail.length) { console.error("check-hud FAILED:\n  " + fail.join("\n  ")); process.exit(1); }
console.log("check-hud ok: HUD placement is only in css/hud.css");

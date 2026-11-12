// Layered power cast clips for js/sfx.js (audio/sfx/power/<kind>-<n>.mp3).
// Recipes → hawkes.assets.json; index rewritten at build from disk (vite.config.js).
//   node scripts/sync-power-sfx.mjs [--check]
import fs from "node:fs";

export const MAX_BYTES = 120 * 1024;

/** [kind, variants, seconds, loop, prompt] */
export const KINDS = [
  ["crack", 4, 0.7, false, "Close lightning crack transient over a city rooftop, sharp electric snap only, dry, no rain bed, no music, no voice"],
  ["body", 4, 1.2, false, "Lightning body boom mid punch right after a strike, short chest thud over a city street, dry, no rain bed, no music"],
  ["rumble", 4, 3.2, false, "Rolling thunder rumble tail after a lightning strike, low distant roll across a city, no rain bed, no music"],
  ["whoosh", 3, 1.1, false, "Short wind gust whoosh past the ears on a city rooftop, dry airy pass, no music"],
  ["gale-loop", 1, 4.0, true, "Sustained gale wind loop for a city street, strong continuous rush, seamless loop, no music"],
  ["tornado-roar", 1, 4.0, true, "Seamless looping tornado roar, thick swirling wind funnel over city streets, no music"],
  ["tornado-debris", 1, 4.0, true, "Tornado debris rattle loop, wood and metal scrap clatter in wind, seamless, no music"],
  ["tornado-pressure", 1, 4.0, true, "Deep pressure drone under a tornado, low humming air pressure, seamless loop, no music"],
  ["sun-shimmer", 1, 2.5, false, "Warm sun break shimmer swell, soft bright air opening after rain, hint of distant birds, no music"],
];

export function expected() {
  const recipes = KINDS.flatMap(([k, n, sec, loop, prompt]) =>
    Array.from({ length: n }, (_, i) => ({
      id: `power-${k}-${i + 1}`,
      note: `Power SFX for js/sfx.js: ${k} variant ${i + 1}/${n}. Mono, under ${MAX_BYTES / 1024} KB.`,
      steps: [
        {
          tool: "audio.sfx",
          params: {
            text: i ? `${prompt} (variation ${i + 1}, a different take)` : prompt,
            duration: sec,
            loop: !!loop,
            sampleRate: 22050,
            provider: "open",
            normalize: true,
            targetLufs: -18,
            seed: 4200 + i * 11 + k.length * 3,
          },
          save: "sfx",
        },
      ],
      files: { sfx: `audio/sfx/power/${k}-${i + 1}.mp3` },
    }))
  );
  const dir = new URL("../audio/sfx/power/", import.meta.url);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /\.mp3$/.test(f)).sort().map((f) => "audio/sfx/power/" + f)
    : [];
  return { recipes, index: { files } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const aUrl = new URL("../hawkes.assets.json", import.meta.url);
  const iUrl = new URL("../audio/sfx/power/index.json", import.meta.url);
  const want = expected();
  const j = JSON.parse(fs.readFileSync(aUrl, "utf8"));
  if (process.argv.includes("--check")) {
    const have = j.assets.filter((a) => /^power-/.test(a.id));
    const idx = fs.existsSync(iUrl) ? JSON.parse(fs.readFileSync(iUrl, "utf8")) : null;
    if (JSON.stringify(have) !== JSON.stringify(want.recipes) || JSON.stringify(idx) !== JSON.stringify(want.index)) {
      console.error("sync-power-sfx: out of date; run node scripts/sync-power-sfx.mjs");
      process.exit(1);
    }
    for (const f of want.index.files) {
      if (fs.statSync(new URL("../" + f, import.meta.url)).size > MAX_BYTES) {
        console.error("sync-power-sfx: " + f + " is over 120 KB");
        process.exit(1);
      }
    }
    console.log("sync-power-sfx: up to date");
    process.exit(0);
  }
  j.assets = j.assets.filter((a) => !/^power-/.test(a.id)).concat(want.recipes);
  fs.writeFileSync(aUrl, JSON.stringify(j, null, 1) + "\n");
  fs.mkdirSync(new URL("../audio/sfx/power/", import.meta.url), { recursive: true });
  fs.writeFileSync(iUrl, JSON.stringify(want.index) + "\n");
  console.log(`sync-power-sfx: ${want.recipes.length} recipes, ${want.index.files.length} clips on disk`);
}

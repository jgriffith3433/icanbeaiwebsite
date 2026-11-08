// Keeps hawkes.assets.json's dialogue recipes (ids dlg-*) in step with the lines in day.config.js, and
// audio/dialogue/index.json with the clips on disk. Studio's asset pipeline makes and fetches the clips from the
// recipes (Hawkes Gen audio.voice, ElevenLabs); nothing here calls the network.
//   node scripts/sync-dialogue.mjs          rewrite both
//   node scripts/sync-dialogue.mjs --check  exit 1 if either is out of date (npm test runs check-dialogue.mjs)
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
globalThis.window = globalThis;
await import(new URL('day.config.js', root).href);
const { dialogueLines } = await import(new URL('js/dialogue.js', root).href);

export function expected() {
  const cfg = globalThis.DAY_CONFIG;
  const model = (cfg.dialogue && cfg.dialogue.model) || 'eleven_v4';
  const recipes = dialogueLines(cfg).map((L) => ({
    id: L.id,
    note: `Spoken line (${L.where}), ${L.who}: "${L.text}", Hawkes Gen audio.voice (ElevenLabs).`,
    steps: [{ tool: 'audio.voice', params: { provider: 'elevenlabs', text: L.text, voice: L.voice, model }, save: 'audio' }],
    files: { audio: L.file },
  }));
  const dir = new URL('audio/dialogue/', root);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /\.mp3$/.test(n)).sort().map((n) => 'audio/dialogue/' + n) : [];
  return { recipes, index: { files } };
}

const assetsUrl = new URL('hawkes.assets.json', root);
const indexUrl = new URL('audio/dialogue/index.json', root);

export function current() {
  const j = JSON.parse(fs.readFileSync(assetsUrl, 'utf8'));
  const recipes = j.assets.filter((a) => /^dlg-/.test(a.id));
  const index = fs.existsSync(indexUrl) ? JSON.parse(fs.readFileSync(indexUrl, 'utf8')) : null;
  return { j, recipes, index };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const want = expected();
  const { j, recipes, index } = current();
  if (process.argv.includes('--check')) {
    const same = JSON.stringify(recipes) === JSON.stringify(want.recipes) && JSON.stringify(index) === JSON.stringify(want.index);
    if (!same) {
      console.error('sync-dialogue: hawkes.assets.json or audio/dialogue/index.json is out of date; run node scripts/sync-dialogue.mjs');
      process.exit(1);
    }
    console.log('sync-dialogue: up to date');
    process.exit(0);
  }
  j.assets = j.assets.filter((a) => !/^dlg-/.test(a.id)).concat(want.recipes);
  fs.writeFileSync(assetsUrl, JSON.stringify(j, null, 1) + '\n');
  fs.mkdirSync(new URL('audio/dialogue/', root), { recursive: true });
  fs.writeFileSync(indexUrl, JSON.stringify(want.index) + '\n');
  console.log(`sync-dialogue: ${want.recipes.length} recipes, ${want.index.files.length} clips on disk`);
}

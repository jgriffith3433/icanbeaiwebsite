// The foley library: one table (KINDS) -> hawkes.assets.json recipes (ids sfx-*, Hawkes Gen audio.sfx, mono, short) and
// audio/foley/index.json (the clips on disk; vite.config.js rewrites it at build). js/sfx.js plays a clip only if it is
// listed, so a clip that isn't made yet never 404s and the synthesis stays as the fallback.
//   node scripts/sync-sfx.mjs [--check]
import fs from 'node:fs';

// name prefix, group (lazy-loaded together), variants, seconds, prompt
export const KINDS = [
  ['jump', 'move', 3, 0.5, 'Cartoon-realistic foley: a short sneaker push-off and cloth rustle of a person jumping on a rooftop, dry, close, no music'],
  ['land-gravel-soft', 'move', 2, 0.5, 'Foley: soft landing of sneakers on rooftop gravel ballast, a few crunching pebbles, dry close recording'],
  ['land-gravel-hard', 'move', 2, 0.7, 'Foley: hard heavy landing on rooftop gravel, deep thud and scattering pebbles, dry close recording'],
  ['land-grating-soft', 'move', 2, 0.5, 'Foley: soft sneaker landing on a metal grating catwalk, light hollow clank, dry close recording'],
  ['land-grating-hard', 'move', 2, 0.8, 'Foley: hard landing on metal grating, loud hollow clang with a short ring, dry close recording'],
  ['land-tar-soft', 'move', 2, 0.5, 'Foley: soft landing on a tar roof membrane, muted sticky thump, dry close recording'],
  ['land-tar-hard', 'move', 2, 0.7, 'Foley: hard landing on a tar roof, deep dull thud with a boot scuff, dry close recording'],
  ['land-pavement-soft', 'move', 2, 0.5, 'Foley: soft sneaker landing on city pavement, short slap and scuff, dry close recording'],
  ['land-pavement-hard', 'move', 2, 0.7, 'Foley: hard landing on concrete pavement, heavy thud and grit scrape, dry close recording'],
  ['crowd-gasp', 'crowd', 2, 1.2, 'A small street crowd gasping together in surprise, outdoors, no words, no music'],
  ['crowd-cheer', 'crowd', 2, 2.0, 'A small street crowd cheering and whooping, outdoors, short, no music'],
  ['crowd-laugh', 'crowd', 2, 1.8, 'A few people laughing together on a street, warm and short, no words'],
  ['crowd-scream', 'crowd', 2, 1.8, 'A small crowd screaming in panic and scattering, outdoors, short, no music'],
  ['crowd-whoa', 'crowd', 2, 1.4, 'A few people saying a long surprised "whoa" together, outdoors'],
  ['umbrella-pop', 'crowd', 2, 0.7, 'Foley: an umbrella snapping open, canopy fabric snap and ribs clicking, close recording'],
  ['car-pass', 'city', 2, 3.0, 'A single car driving past on a wet city street, tyres on asphalt, approaching and receding, no music'],
  ['car-horn', 'city', 2, 1.2, 'A short car horn, two quick beeps, city street, a bit distant'],
  ['siren-far', 'city', 2, 3.2, 'A distant city siren wailing far away between buildings at night, soft'],
  ['pigeon', 'city', 2, 2.0, 'Pigeons cooing and wing flaps on a rooftop, close, no music'],
  ['bird', 'city', 2, 2.0, 'Small songbirds chirping in a city park in the morning, short, no music'],
  ['ui-press', 'ui', 2, 0.5, 'A soft clean UI button press click, tactile, short, no music'],
  ['ui-toast', 'ui', 1, 0.6, 'A gentle UI notification pop, two soft notes, short'],
  ['ui-unlock', 'ui', 1, 0.9, 'A bright UI unlock sparkle, rising soft chime, short'],
  ['ui-goal', 'ui', 1, 0.9, 'A satisfying goal-complete chime, two rising notes, short, clean'],
  ['ui-fail', 'ui', 1, 0.8, 'A low soft UI fail thud with a descending tone, short'],
  ['ui-rank', 'ui', 1, 0.8, 'A rank stamp: heavy rubber stamp thump on paper with a small shimmer'],
  ['ui-open', 'ui', 1, 0.5, 'A soft UI menu opening swish, short'],
  ['ui-close', 'ui', 1, 0.5, 'A soft UI menu closing swish, short, descending'],
  ['door', 'city', 2, 1.4, 'A wooden apartment door closing with a latch click on a quiet city street, a little distant, no music'],
  ['dog', 'city', 2, 1.6, 'A dog barking twice somewhere down a city street, distant, outdoors, no music'],
  ['chatter', 'crowd', 2, 2.5, 'Two or three people chatting casually on a street, indistinct words, outdoors, no music'],
  ['awning-rain', 'city', 2, 3.0, 'Steady rain pattering on a fabric shop awning with a few drips, outdoors, close, no music'],
];
export const MAX_BYTES = 60 * 1024;
export const names = () => KINDS.flatMap(([k, , n]) => Array.from({ length: n }, (_, i) => `${k}-${i + 1}`));

export function expected() {
  const recipes = KINDS.flatMap(([k, group, n, sec, prompt]) => Array.from({ length: n }, (_, i) => ({
    id: `foley-${k}-${i + 1}`,
    note: `Foley (${group}) for js/sfx.js: ${k}, variant ${i + 1} of ${n}. Mono, under ${MAX_BYTES / 1024} KB.`,
    steps: [{ tool: 'audio.sfx', params: { text: i ? `${prompt} (variation ${i + 1}, a different take)` : prompt, duration: sec, sampleRate: 22050, seed: 1000 + i * 7 }, save: 'audio' }],
    files: { audio: `audio/foley/${k}-${i + 1}.mp3` },
  })));
  const dir = new URL('../audio/foley/', import.meta.url);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.mp3$/.test(f)).sort().map((f) => 'audio/foley/' + f) : [];
  return { recipes, index: { files } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const aUrl = new URL('../hawkes.assets.json', import.meta.url);
  const iUrl = new URL('../audio/foley/index.json', import.meta.url);
  const want = expected();
  const j = JSON.parse(fs.readFileSync(aUrl, 'utf8'));
  if (process.argv.includes('--check')) {
    const have = j.assets.filter((a) => /^foley-/.test(a.id));
    const idx = fs.existsSync(iUrl) ? JSON.parse(fs.readFileSync(iUrl, 'utf8')) : null;
    if (JSON.stringify(have) !== JSON.stringify(want.recipes) || JSON.stringify(idx) !== JSON.stringify(want.index)) {
      console.error('sync-sfx: out of date; run node scripts/sync-sfx.mjs');
      process.exit(1);
    }
    for (const f of want.index.files) if (fs.statSync(new URL('../' + f, import.meta.url)).size > MAX_BYTES) { console.error('sync-sfx: ' + f + ' is over 60 KB'); process.exit(1); }
    console.log('sync-sfx: up to date');
    process.exit(0);
  }
  j.assets = j.assets.filter((a) => !/^foley-/.test(a.id)).concat(want.recipes);
  fs.writeFileSync(aUrl, JSON.stringify(j, null, 1) + '\n');
  fs.mkdirSync(new URL('../audio/foley/', import.meta.url), { recursive: true });
  fs.writeFileSync(iUrl, JSON.stringify(want.index) + '\n');
  console.log(`sync-sfx: ${want.recipes.length} recipes, ${want.index.files.length} clips on disk`);
}

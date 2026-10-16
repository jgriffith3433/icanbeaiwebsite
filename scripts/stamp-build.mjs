// Stamps the build on every local file link in index.html: ?v=<hash of the files' contents>, and the same hash in
// <meta name="build">. Browsers then fetch fresh CSS and JS the moment a change is published, and an open tab on the
// live site reloads when the build changes (js/main.js). The stamp only changes when a file did.
//
//   node scripts/stamp-build.mjs
//
// Hawkes Studio runs it on beta before every go live (products.json deploy.prebuild). This is not the product's
// version: that is releases.json (written by Hawkes Studio at each go live, shown on whatsnew.html).
import fs from 'node:fs';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
const htmlPath = new URL('index.html', root);
let html = fs.readFileSync(htmlPath, 'utf8');

const local = /\b(src|href)="(?!https?:|\/\/|data:|#)([^"?]+)(\?v=[^"]*)?"/g;
const files = [...new Set([...html.matchAll(local)].map((m) => m[2]).filter((f) => /\.(js|css|json|png|jpe?g|svg|webp|mp3|glb|gltf)$/i.test(f)))].sort();
const hash = crypto.createHash('sha1');
for (const f of files) {
  hash.update(f);
  try {
    hash.update(fs.readFileSync(new URL(f, root)));
  } catch {
    // A missing file still gets its link stamped.
  }
}
const build = hash.digest('hex').slice(0, 10);

let count = 0;
html = html.replace(local, (m, attr, file) => {
  if (!/\.(js|css|json|png|jpe?g|svg|webp|mp3|glb|gltf)$/i.test(file)) return m;
  count++;
  return `${attr}="${file}?v=${build}"`;
});
html = html.replace(/<meta name="(version|build)" content="[^"]*"\s*\/?>/, `<meta name="build" content="${build}" />`);
fs.writeFileSync(htmlPath, html);
console.log(`Build ${build} (${count} links stamped in index.html)`);

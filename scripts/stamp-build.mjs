// Stamps the build on every local file link in index.html: ?v=<hash of the files' contents>, and the same hash in
// <meta name="build">. Browsers then fetch fresh CSS and JS the moment a change is published, and an open tab on the
// live site reloads when the build changes (js/main.js). The stamp only changes when a file did.
//
//   node scripts/stamp-build.mjs
//
// Hawkes Studio runs it on beta before every go live (products.json deploy.prebuild). This is not the product's
// version: that is releases.json (written by Hawkes Studio at each go live, shown on whatsnew.html).
//
// It also writes window.HAWKES_BUILD = { version, commit, date } into every page that has one (Hawkes Analytics tags
// each event with it): version = releases.json's current + the build stamp, commit = the HEAD it was built from, date
// = when. When the version is unchanged the commit and date stay, so a second run changes nothing.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

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

// The build for Hawkes Analytics.
const BUILD_RE = /window\.HAWKES_BUILD = (\{[^\n]*?\});/;
let current = 'dev';
try {
  current = JSON.parse(fs.readFileSync(new URL('releases.json', root), 'utf8')).current || current;
} catch {
  // No releases yet.
}
const version = `${current}+${build}`;
let info = null;
try {
  const old = JSON.parse(BUILD_RE.exec(html)?.[1] ?? 'null');
  if (old && old.version === version && old.commit) info = old;
} catch {
  // An old or hand-edited line: write a new one.
}
if (!info) {
  info = { version, date: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
  try {
    info.commit = execFileSync('git', ['rev-parse', '--short=10', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    // Not a git checkout: version and date only.
  }
  info = { version: info.version, commit: info.commit, date: info.date };
}
const line = `window.HAWKES_BUILD = ${JSON.stringify(info)};`;
html = html.replace(BUILD_RE, line);
fs.writeFileSync(htmlPath, html);
for (const page of ['whatsnew.html', 'privacy.html']) {
  const p = new URL(page, root);
  if (!fs.existsSync(p)) continue;
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(BUILD_RE, line);
  if (after !== before) fs.writeFileSync(p, after);
}
console.log(`Build ${build} (${count} links stamped in index.html), ${line}`);

// Bumps the site version and stamps it on every local file link in index.html,
// so browsers fetch the new css/js the moment a new version is published.
//
//   node scripts/bump-version.mjs          -> 1.0.0 -> 1.0.1
//   node scripts/bump-version.mjs minor    -> 1.0.1 -> 1.1.0
//   node scripts/bump-version.mjs major    -> 1.1.0 -> 2.0.0
//   node scripts/bump-version.mjs 1.4.2    -> exactly 1.4.2
import fs from 'node:fs';

const pkgPath = new URL('../package.json', import.meta.url);
const htmlPath = new URL('../index.html', import.meta.url);

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const arg = (process.argv[2] || 'patch').trim();
const [maj, min, pat] = String(pkg.version || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);

let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else if (arg === 'major') next = `${maj + 1}.0.0`;
else if (arg === 'minor') next = `${maj}.${min + 1}.0`;
else if (arg === 'patch') next = `${maj}.${min}.${pat + 1}`;
else {
  console.error(`Unknown bump "${arg}". Use patch, minor, major, or a version like 1.2.3.`);
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');
let count = 0;
// Local src/href only (skip http(s), //cdn, data: links), then set ?v=<next>.
html = html.replace(/\b(src|href)="(?!https?:|\/\/|data:|#)([^"?]+)(\?v=[^"]*)?"/g, (m, attr, file) => {
  if (!/\.(js|css|json|png|jpe?g|svg|webp|mp3|glb|gltf)$/i.test(file)) return m;
  count++;
  return `${attr}="${file}?v=${next}"`;
});
html = html.replace(/<meta name="version" content="[^"]*"\s*\/?>/, `<meta name="version" content="${next}" />`);

pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(htmlPath, html);
console.log(`Version ${maj}.${min}.${pat} -> ${next} (${count} links stamped in index.html)`);

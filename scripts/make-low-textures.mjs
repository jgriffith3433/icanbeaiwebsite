/* Phone (low quality) ground textures, no GPU: lighter, smaller versions so asphalt and lawn read on a small screen.
   asphalt: the Gen 512 albedo stretched out of near-black navy (mean 26,28,41 -> about 60,65,74), 256 px.
   grass: a tileable 128 px lawn painted here (value noise + blade speckle), because no Gen set covers the lawn.
   Needs ffmpeg. Run: node scripts/make-low-textures.mjs */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("textures/city/low", { recursive: true });
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", "textures/city/asphalt-albedo-512.webp", "-vf",
  "scale=256:256:flags=lanczos,format=rgb24,lutrgb=r='clip((val-26)*3.5+68,0,255)':g='clip((val-28)*3.5+71,0,255)':b='clip((val-41)*3.5+80,0,255)'",
  "-c:v", "libwebp", "-quality", "80", "textures/city/low/asphalt-albedo.webp"]);

/* tar roof: the Gen 512 tar albedo (mean 49,56,73) stretched the same way (about 79,88,99), the roof he stands on at dusk */
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", "textures/city/tar-albedo-512.webp", "-vf",
  "scale=256:256:flags=lanczos,format=rgb24,lutrgb=r='clip((val-49)*3.5+88,0,255)':g='clip((val-56)*3.5+92,0,255)':b='clip((val-73)*3.5+104,0,255)'",
  "-c:v", "libwebp", "-quality", "80", "textures/city/low/tar-albedo.webp"]);

const N = 128;
const hash = (x, y) => { let n = Math.imul(x ^ 0x27d4eb2d, 0x85ebca6b) ^ Math.imul(y ^ 0x165667b1, 0xc2b2ae35); n = Math.imul(n ^ (n >>> 15), n | 1); return ((n ^ (n >>> 13)) >>> 0) / 4294967296; };
const mod = (a, m) => ((a % m) + m) % m;
function noise(u, v, p) {
  const x = u * p, y = v * p, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (i, j) => hash(mod(i, p), mod(j, p));
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const buf = Buffer.alloc(N * N * 3);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const u = x / N, v = y / N;
  const n = noise(u, v, 4) * 0.5 + noise(u, v, 8) * 0.3 + noise(u, v, 16) * 0.2;
  const blade = noise(u, v, 64);
  const k = Math.min(1, n * 0.7 + blade * 0.5);
  const i = (y * N + x) * 3;
  buf[i] = 44 + k * 38; buf[i + 1] = 92 + k * 52; buf[i + 2] = 44 + k * 28;
}
writeFileSync("/tmp/grass.rgb", buf);
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${N}x${N}`, "-i", "/tmp/grass.rgb", "-c:v", "libwebp", "-quality", "80", "textures/city/low/grass-albedo.webp"]);

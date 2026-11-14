/* Phone / low-quality copy of Small Weather, no GPU: models/small-weather.glb -> models/small-weather.phone.glb
   (meshopt geometry and animation, quantized, textures resized to <= 1024 and WebP), plus models/meshopt_decoder.js,
   the decoder as a classic script served from this site (Babylon's default is a CDN; this site has none).
   Run: npm run model:phone   (needs the devDependencies: @gltf-transform/*, meshoptimizer, sharp). The outputs are committed;
   scripts/check-phone-model.mjs (npm test) checks they exist, are small and match the full model's shape. */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, prune, quantize, meshopt, textureCompress, resample } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";

const SRC = "models/small-weather.glb";
const OUT = "models/small-weather.phone.glb";
const MAX_TEX = 1024; // the phone copy uses the cap; the albedo sheets are 512 already, only Image_0 is 1024

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(SRC);
await doc.transform(
  dedup(),
  prune(),
  resample(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [MAX_TEX, MAX_TEX], quality: 80, slots: /^(?!emissive)/ }),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [MAX_TEX, MAX_TEX], quality: 90, slots: /emissive/ }),
  // joints/weights keep their types; positions 14 bit, normals 8, uv 12: skinned meshes need the bind pose to stay exact enough
  quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8, quantizeGeneric: 12 }),
  meshopt({ encoder: MeshoptEncoder, level: "high" }),
);
await io.write(OUT, doc);
console.log(`${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KB (full ${(statSync(SRC).size / 1024).toFixed(0)} KB)`);

// The decoder as a classic script that defines window.MeshoptDecoder (what Babylon's MeshoptCompression waits for).
const cjs = readFileSync("node_modules/meshoptimizer/meshopt_decoder.cjs", "utf8");
writeFileSync("models/meshopt_decoder.js", `/* meshoptimizer ${JSON.parse(readFileSync("node_modules/meshoptimizer/package.json", "utf8")).version} decoder (MIT), as a classic script. Made by scripts/make-phone-model.mjs */\nvar MeshoptDecoder = (function () { var module = { exports: {} }; var exports = module.exports;\n${cjs}\nvar d = module.exports.MeshoptDecoder; (typeof globalThis !== "undefined" ? globalThis : self).MeshoptDecoder = d; return d; })();\n`);
console.log(`models/meshopt_decoder.js: ${(statSync("models/meshopt_decoder.js").size / 1024).toFixed(0)} KB`);

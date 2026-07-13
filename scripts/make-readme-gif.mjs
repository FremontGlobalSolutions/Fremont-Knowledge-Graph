import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import gifenc from "gifenc";
import { PNG } from "pngjs";

const { GIFEncoder, quantize, applyPalette } = gifenc;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, "..", "docs", "assets");
const outPath = path.join(assetsDir, "graph-demo.gif");

function loadPng(filePath) {
  const buffer = fs.readFileSync(filePath);
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: png.data };
}

const frameFiles = fs
  .readdirSync(assetsDir)
  .filter((name) => /^gif-frame-\d+\.png$/.test(name))
  .sort();

if (frameFiles.length === 0) {
  console.error("No gif-frame-*.png files found in docs/assets");
  process.exit(1);
}

const frames = frameFiles.map((name) => loadPng(path.join(assetsDir, name)));
const { width, height } = frames[0];
const gif = GIFEncoder();

for (const frame of frames) {
  const palette = quantize(frame.data, 256);
  const index = applyPalette(frame.data, palette);
  gif.writeFrame(index, width, height, {
    palette,
    delay: 900,
    repeat: 0,
  });
}

gif.finish();
fs.writeFileSync(outPath, Buffer.from(gif.bytes()));
console.log(`Wrote ${outPath} (${frameFiles.length} frames)`);

for (const name of frameFiles) {
  fs.unlinkSync(path.join(assetsDir, name));
}

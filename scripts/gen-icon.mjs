// 生成应用源图标（1024x1024 PNG），随后用 `pnpm tauri icon` 派生全平台图标。
// 无外部依赖：手写 PNG 编码（RGBA + deflate）。
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const SIZE = 1024;
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));

function putPixel(x, y, r, g, b, a) {
  const rowStart = y * (SIZE * 4 + 1);
  raw[rowStart] = 0; // filter: none
  const offset = rowStart + 1 + x * 4;
  raw[offset] = r;
  raw[offset + 1] = g;
  raw[offset + 2] = b;
  raw[offset + 3] = a;
}

function inRoundedRect(x, y, m, radius) {
  if (x < m || x >= SIZE - m || y < m || y >= SIZE - m) return false;
  const cx = Math.max(m + radius - x, x - (SIZE - m - radius), 0);
  const cy = Math.max(m + radius - y, y - (SIZE - m - radius), 0);
  return cx * cx + cy * cy <= radius * radius;
}

// 渐变底 + 白色「对话气泡」造型（对应 dsh 的 agent 会话属性）
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inRoundedRect(x, y, 48, 220)) {
      putPixel(x, y, 0, 0, 0, 0);
      continue;
    }
    const t = (x + y) / (2 * SIZE);
    const r = Math.round(77 + (123 - 77) * t);
    const g = Math.round(107 + (92 - 107) * t);
    const b = 254;
    // 气泡：圆角矩形 + 左下小尾巴
    const bubbleM = 300;
    const bubbleR = 120;
    const inBubble =
      inRoundedRect(x, y - 60, bubbleM, bubbleR) ||
      (x > bubbleM + 40 && x < bubbleM + 190 && y > SIZE - bubbleM + 60 && y < SIZE - bubbleM + 170);
    if (inBubble) {
      putPixel(x, y, 255, 255, 255, 235);
    } else {
      putPixel(x, y, r, g, b, 255);
    }
  }
}

// PNG 组装
const table = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = path.resolve("scripts/assets");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "app-icon.png"), png);
console.log(`icon written: ${path.join(outDir, "app-icon.png")} (${png.length} bytes)`);

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Renders the toolbar icons without any image dependency: a lime rounded
 * square with a dark trophy cup. `node scripts/make-icons.mjs` rewrites
 * icons/icon-{16,48,128}.png.
 */

const LIME = [163, 230, 53];
const INK = [9, 9, 11];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 1 inside the trophy, 0 outside; coordinates normalized to 0..1. */
function trophy(u, v) {
  // Cup: a bowl from y 0.22 to 0.58 narrowing toward the bottom.
  if (v >= 0.22 && v <= 0.58) {
    const t = (v - 0.22) / 0.36;
    const half = 0.27 - 0.13 * t * t;
    if (Math.abs(u - 0.5) <= half) return 1;
    // Handles: two arcs beside the cup.
    const hv = (v - 0.24) / 0.22;
    if (hv >= 0 && hv <= 1) {
      const r = 0.36 + 0.02 * Math.sin(hv * Math.PI);
      const ring = Math.abs(Math.abs(u - 0.5) - r) <= 0.05 && hv < 0.95;
      if (ring) return 1;
    }
  }
  // Stem.
  if (v > 0.58 && v <= 0.7 && Math.abs(u - 0.5) <= 0.06) return 1;
  // Base.
  if (v > 0.7 && v <= 0.8 && Math.abs(u - 0.5) <= 0.2) return 1;
  return 0;
}

function pixel(size) {
  const radius = size * 0.22;
  return (x, y) => {
    // Rounded-square mask with 4x4 supersampling for smooth edges.
    let cover = 0;
    let ink = 0;
    for (let sy = 0; sy < 4; sy++) {
      for (let sx = 0; sx < 4; sx++) {
        const px = x + (sx + 0.5) / 4;
        const py = y + (sy + 0.5) / 4;
        const dx = Math.max(radius - px, px - (size - radius), 0);
        const dy = Math.max(radius - py, py - (size - radius), 0);
        if (dx * dx + dy * dy <= radius * radius) {
          cover++;
          ink += trophy(px / size, py / size);
        }
      }
    }
    if (cover === 0) return [0, 0, 0, 0];
    const k = ink / cover;
    const mix = (i) => Math.round(LIME[i] * (1 - k) + INK[i] * k);
    return [mix(0), mix(1), mix(2), Math.round((cover / 16) * 255)];
  };
}

mkdirSync(new URL("../icons", import.meta.url), { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(new URL(`../icons/icon-${size}.png`, import.meta.url), png(size, pixel(size)));
}
console.log("icons written");

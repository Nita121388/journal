/* 生成 Journal 扩展图标（16/48/128 PNG），纯 Node 无依赖。
   画：sage 圆角方块底 + 三道白色日志线 + 右上 amber 小圆点（今日标记）。 */
'use strict';
const { deflateSync } = require('node:zlib');
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(size) {
  const S = size;
  const px = new Uint8Array(S * S * 4);   // RGBA

  const sage = [90, 122, 98];
  const amber = [200, 113, 58];
  const white = [255, 253, 248];

  const radius = S * 0.22;
  const margin = S * 0.08;
  const dotR = Math.max(1.5, S * 0.075);

  function inRoundRect(x, y, r) {
    if (x < margin || x > S - margin || y < margin || y > S - margin) return false;
    const dx = Math.max(margin + r - x, x - (S - margin - r), 0);
    const dy = Math.max(margin + r - y, y - (S - margin - r), 0);
    return dx * dx + dy * dy <= r * r;
  }

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (!inRoundRect(x + 0.5, y + 0.5, radius)) { px[i + 3] = 0; continue; }
      px[i] = sage[0]; px[i + 1] = sage[1]; px[i + 2] = sage[2]; px[i + 3] = 255;
    }
  }

  // 三道日志线（白色圆头短线）
  const lineX = S * 0.30, lineW = S * 0.40, lineH = Math.max(1, S * 0.055);
  const ys = [S * 0.34, S * 0.50, S * 0.66];
  for (const ly of ys) {
    for (let y = Math.floor(ly - lineH / 2); y <= ly + lineH / 2; y++) {
      for (let x = Math.floor(lineX); x <= lineX + lineW; x++) {
        if (x < 0 || x >= S || y < 0 || y >= S) continue;
        const i = (y * S + x) * 4;
        px[i] = white[0]; px[i + 1] = white[1]; px[i + 2] = white[2]; px[i + 3] = 255;
      }
    }
  }

  // 右上 amber 圆点（今日标记）
  const cx = S - margin - dotR - S * 0.06, cy = margin + dotR + S * 0.06;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= dotR * dotR) {
        const i = (y * S + x) * 4;
        px[i] = amber[0]; px[i + 1] = amber[1]; px[i + 2] = amber[2]; px[i + 3] = 255;
      }
    }
  }

  // 编码 PNG
  const raw = Buffer.alloc((S * 4 + 1) * S);
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;   // filter none
    for (let x = 0; x < S * 4; x++) {
      raw[y * (S * 4 + 1) + 1 + x] = px[y * S * 4 + x];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

const outDir = join(__dirname, '..', 'icons');
mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(join(outDir, `icon${size}.png`), makePng(size));
  console.log(`icon${size}.png 生成`);
}

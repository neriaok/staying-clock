// One-off script to generate PWA icon PNGs without external deps (uses only Node's zlib).
// Draws a dark rounded-square background with a minimal clock face (ring + hands) in the
// app's accent color, matching the in-app dark theme.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [10, 10, 12, 255];       // near-black app background
const ACCENT = [255, 176, 59, 255]; // warm amber accent used in the app

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function drawIcon(size) {
  const px = new Array(size * size);
  const cx = size / 2, cy = size / 2;
  const cornerR = size * 0.22;
  const ringR = size * 0.34;
  const ringW = size * 0.045;

  const inRoundedSquare = (x, y) => {
    const dx = Math.max(0, Math.abs(x - cx) - (cx - cornerR));
    const dy = Math.max(0, Math.abs(y - cy) - (cy - cornerR));
    return dx * dx + dy * dy <= cornerR * cornerR;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = null;
      if (inRoundedSquare(x + 0.5, y + 0.5)) {
        color = BG;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(dist - ringR) <= ringW / 2) {
          color = ACCENT;
        }
        // hour hand (pointing up)
        if (x + 0.5 >= cx - size * 0.012 && x + 0.5 <= cx + size * 0.012 &&
            y + 0.5 <= cy && y + 0.5 >= cy - size * 0.20) {
          color = ACCENT;
        }
        // minute hand (pointing right)
        if (y + 0.5 >= cy - size * 0.012 && y + 0.5 <= cy + size * 0.012 &&
            x + 0.5 >= cx && x + 0.5 <= cx + size * 0.27) {
          color = ACCENT;
        }
        // center dot
        if (dist <= size * 0.02) color = ACCENT;
      }
      px[y * size + x] = color;
    }
  }

  const raw = Buffer.alloc(size * (1 + size * 4));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const c = px[y * size + x] || [0, 0, 0, 0];
      raw[offset++] = c[0];
      raw[offset++] = c[1];
      raw[offset++] = c[2];
      raw[offset++] = c[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

const outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512, 180]) {
  const png = drawIcon(size);
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(`wrote ${name} (${png.length} bytes)`);
}

// Generates the three demo albums in albums/ (synthesized audio + drawn covers).
// Usage: node scripts/make-demo.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { mulberry32, hashSeed } from '../js/palette.js';

const RATE = 22050;

export function encodeWav(samples, sampleRate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    b.writeInt16LE(s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), 44 + i * 2);
  }
  return b;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- audio ----

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

function synthTrack({ root, scale, bpm, seconds, bright, seed }) {
  const out = new Float32Array(Math.round(seconds * RATE));
  const rand = mulberry32(seed);
  const beat = 60 / bpm;
  const step = beat / 2;
  const chords = [0, 3, 4, 2].map((d) => d + Math.floor(rand() * 2));
  const note = (start, dur, hz, amp, shape) => {
    const s0 = Math.floor(start * RATE);
    const n = Math.floor(dur * RATE);
    for (let i = 0; i < n && s0 + i < out.length; i++) {
      const t = i / RATE;
      const env = Math.min(1, t / 0.012) * Math.exp(-t * (shape === 'bass' ? 2.2 : 4.5));
      const ph = 2 * Math.PI * hz * t;
      const sine = Math.sin(ph);
      const tri = (2 / Math.PI) * Math.asin(Math.sin(ph));
      const v = shape === 'bass' ? sine : sine * (1 - bright) + tri * bright + 0.15 * Math.sin(2 * ph);
      out[s0 + i] += v * env * amp;
    }
  };
  const deg = (d) => root + 12 * Math.floor(d / scale.length) + scale[((d % scale.length) + scale.length) % scale.length];
  for (let t = 0, i = 0; t < seconds - 1; t += step, i++) {
    const bar = Math.floor(t / (beat * 4)) % chords.length;
    const c = chords[bar];
    if (i % 8 === 0) note(t, beat * 4, midiHz(deg(c) - 12), 0.32, 'bass');
    const pattern = [0, 2, 4, 7, 4, 2, 4 + Math.floor(rand() * 3), 2];
    note(t, step * 3, midiHz(deg(c + pattern[i % 8])), 0.16, 'lead');
    if (rand() < 0.18) note(t + step / 2, step * 2, midiHz(deg(c + 9 + Math.floor(rand() * 3))), 0.07, 'lead');
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const fade = RATE * 1.2;
  for (let i = 0; i < out.length; i++) {
    out[i] = (out[i] / (peak || 1)) * 0.8;
    if (i > out.length - fade) out[i] *= (out.length - i) / fade;
    if (i < RATE * 0.05) out[i] *= i / (RATE * 0.05);
  }
  return out;
}

// ---- covers ----

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function paintCover(size, painter) {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = painter(x / size, y / size);
      px.set([r, g, b, 255].map((v) => Math.max(0, Math.min(255, Math.round(v)))), (y * size + x) * 4);
    }
  }
  return encodePng(size, size, px);
}

const PAINTERS = {
  sunset(x, y) {
    let c = mix([255, 170, 70], [110, 40, 120], y);
    const d = Math.hypot(x - 0.5, y - 0.62);
    if (d < 0.22 && !(y > 0.55 && Math.floor(y * 40) % 3 === 0)) c = mix([255, 230, 120], [255, 120, 80], (y - 0.4) / 0.4);
    if (y > 0.78) c = mix([40, 20, 60], [20, 10, 30], (y - 0.78) / 0.22);
    if (y > 0.78 && Math.abs(x - 0.5) < 0.02 + (y - 0.78) * 1.4 && Math.floor(y * 60) % 4 < 2) c = [255, 200, 90];
    return c;
  },
  forest(x, y) {
    let c = mix([150, 180, 120], [20, 50, 35], y);
    for (let k = 0; k < 7; k++) {
      const cx = 0.07 + k * 0.145, top = 0.25 + ((k * 37) % 5) * 0.06;
      if (y > top && Math.abs(x - cx) < (y - top) * 0.32) c = mix([30, 80, 50], [10, 35, 25], (k % 3) / 3 + y * 0.3);
    }
    if (y > 0.85) c = [60, 75, 40];
    return c;
  },
  blue(x, y) {
    let c = mix([20, 30, 80], [120, 180, 230], y * 0.9);
    if (Math.hypot(x - 0.72, y - 0.24) < 0.09) c = [240, 240, 220];
    if (y > 0.55) {
      const bx = Math.floor(x * 7), h = 0.55 + ((bx * 53) % 4) * 0.06;
      if (y > h) {
        c = [18, 24, 55];
        const wx = (x * 7) % 1, wy = (y * 30) % 1;
        if (wx > 0.3 && wx < 0.7 && wy > 0.35 && wy < 0.7 && ((bx * 7 + Math.floor(y * 30)) * 13) % 5 === 0) c = [255, 210, 120];
      }
    }
    return c;
  },
};

const DEMOS = [
  {
    id: 'demo-sunset-drive', title: 'Sunset Drive', painter: 'sunset',
    sound: { root: 57, scale: [0, 2, 4, 7, 9], bpm: 104, bright: 0.7 },
    tracks: [['01 Coastline', 26], ['02 Neon Mile', 24], ['03 Last Exit', 28]],
  },
  {
    id: 'demo-deep-forest', title: 'Deep Forest', painter: 'forest',
    sound: { root: 50, scale: [0, 3, 5, 7, 10], bpm: 76, bright: 0.25 },
    tracks: [['01 Moss', 27], ['02 Canopy', 25]],
  },
  {
    id: 'demo-blue-hour', title: 'Blue Hour', painter: 'blue',
    sound: { root: 62, scale: [0, 2, 3, 7, 9], bpm: 90, bright: 0.45 },
    vinyl: { style: 'translucent', color: '#3a7bd5' },
    tracks: [['01 Dusk', 22], ['02 Streetlight', 25], ['03 Morning', 24]],
  },
];

async function main() {
  for (const demo of DEMOS) {
    const dir = resolve('albums', demo.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'cover.png'), paintCover(256, PAINTERS[demo.painter]));
    const meta = { title: demo.title, artist: 'Demo Band', year: 2026 };
    if (demo.vinyl) meta.vinyl = demo.vinyl;
    await writeFile(join(dir, 'album.json'), JSON.stringify(meta, null, 2) + '\n');
    for (const [name, seconds] of demo.tracks) {
      const samples = synthTrack({ ...demo.sound, seconds, seed: hashSeed(demo.id + name) });
      await writeFile(join(dir, `${name}.wav`), encodeWav(samples, RATE));
    }
    console.log(`made ${demo.id}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

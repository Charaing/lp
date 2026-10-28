// Pure color + seeded-randomness helpers. No DOM access, so Node tests can import this.

export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (n) => Math.round(n).toString(16).padStart(2, '0');
export const toHex = (r, g, b) => `#${hex(r)}${hex(g)}${hex(b)}`;

export function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

// Bucket pixels by the top 4 bits of each channel, then rank buckets by
// frequency weighted toward saturated colors so the LP picks up the cover's accent.
export function extractPalette(rgba, count = 5) {
  const buckets = new Map();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { r: 0, g: 0, b: 0, n: 0 }));
    b.r += rgba[i]; b.g += rgba[i + 1]; b.b += rgba[i + 2]; b.n++;
  }
  return [...buckets.values()]
    .map((b) => {
      const r = b.r / b.n, g = b.g / b.n, bl = b.b / b.n;
      const [, s] = rgbToHsl(r, g, bl);
      return { hex: toHex(r, g, bl), w: b.n * (0.35 + s) };
    })
    .sort((a, b) => b.w - a.w)
    .slice(0, count)
    .map((c) => c.hex);
}

// Hue spread of the saturated colors (0 = gray or a single hue, ~1 = rainbow).
export function colorfulness(palette) {
  const hues = palette
    .map((h) => rgbToHsl(...hexToRgb(h)))
    .filter(([, s]) => s >= 0.15)
    .map(([h]) => (h * Math.PI) / 180);
  if (hues.length < 2) return 0;
  const x = hues.reduce((a, h) => a + Math.cos(h), 0) / hues.length;
  const y = hues.reduce((a, h) => a + Math.sin(h), 0) / hues.length;
  return (1 - Math.hypot(x, y)) * (hues.length / palette.length);
}

const BASIC_STYLES = ['solid', 'translucent', 'marble', 'splatter'];

export function pickStyle(seed, palette) {
  const rand = mulberry32(seed);
  const r = rand();
  const r2 = rand();
  if (colorfulness(palette) >= 0.5 && r < 0.3) return 'picture';
  return BASIC_STYLES[Math.floor(r2 * BASIC_STYLES.length)];
}

export function hslToHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))));
  return toHex(f(0), f(8), f(4));
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function luminance(hex) {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = hexToRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// The turntable takes its colour from the cover, in the dark theme: greys become graphite
// or deep black, anything colourful becomes a deep, rich version of that colour.
export function deckColors(palette) {
  const first = palette[0];
  if (!first) return { body: '#1f1e1d', bg: '#0b0a09', ink: '#ede7dc' };
  const [h, s, l] = rgbToHsl(...hexToRgb(first));
  const grey = s < 0.15;
  const body = grey ? (l > 0.5 ? '#2a2927' : '#1a1a1a') : hslToHex(h, clamp(s, 0.3, 0.6), clamp(l * 0.5, 0.18, 0.28));
  const bg = hslToHex(h, grey ? 0.04 : Math.min(0.35, s * 0.4), 0.055);
  const bodyL = rgbToHsl(...hexToRgb(body))[2];
  const ink = luminance(body) > 0.3 || bodyL >= 0.52 ? '#1c1a18' : '#ede7dc';
  return { body, bg, ink };
}

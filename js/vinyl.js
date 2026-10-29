// Draws a record onto a canvas from its look (look.js): pressing, colours, shape, size,
// label and finish. The canvas covers a full 12-inch record; smaller ones sit in the middle.
// Same album id → same marbling, splatter and glitter.
import { hashSeed, mulberry32, extractPalette, hexToRgb, rgbToHsl, toHex } from './palette.js';
import { gapRadii } from './timeline.js';
import { noise3, fbm3 } from './noise.js';
import { defaultLook, grooveFor, SIZE_FACTOR } from './look.js';

export function loadCover(src) {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function coverPalette(cover) {
  if (!cover) return [];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(cover, 0, 0, 64, 64);
  return extractPalette(ctx.getImageData(0, 0, 64, 64).data, 5);
}

const hsl = (h, s, l) => `hsl(${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%)`;

function shade(hex, dl) {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  return hsl(h, s, Math.min(0.92, Math.max(0.06, l + dl)));
}

function readableOn(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1b1410' : '#f6ecd6';
}

function distance(a, b) {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

function hexFromHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))));
  return toHex(f(0), f(8), f(4));
}

// Turns a look into the concrete colours to paint with. Without a look, the album's default one.
export function designFor(album, cover, look, palette = coverPalette(cover)) {
  const lk = look ?? defaultLook(album, palette, !!cover);
  const seed = hashSeed(album.id);
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const hue = rand() * 360;
  let style = lk.vinyl.style;
  if (style === 'picture' && !cover) style = 'black';
  const base = style === 'black' ? '#111010' : lk.vinyl.color ?? palette[0] ?? hexFromHsl(hue, 0.55, 0.32);
  const accent = lk.vinyl.accent ?? palette.find((p, i) => i > 0 && distance(p, base) > 90) ?? hexFromHsl((hue + 140) % 360, 0.6, 0.62);
  const labelColor = lk.label.color ?? palette[2] ?? accent;
  const labelText = lk.label.text ?? readableOn(labelColor);
  const labelMode = lk.label.mode === 'cover' && !cover ? 'text' : lk.label.mode;
  return { look: lk, style, base, accent, labelColor, labelText, labelMode, seed, palette };
}

// ---- shapes (r = record radius) ----

function shapePath(ctx, shape, r) {
  ctx.beginPath();
  if (shape === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  } else if (shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (Math.PI / 5) * i, rr = i % 2 ? r * 0.6 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
  } else if (shape === 'flower') {
    for (let i = 0; i <= 360; i++) {
      const a = (i * Math.PI) / 180, rr = r * (0.9 + 0.1 * Math.cos(8 * a));
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
  } else if (shape === 'heart') {
    // two lobes and a point, drawn inside the record's circle with the spindle near its middle
    ctx.moveTo(0, r * 0.98);
    ctx.bezierCurveTo(-r * 0.25, r * 0.7, -r * 1.0, r * 0.25, -r * 0.92, -r * 0.3);
    ctx.bezierCurveTo(-r * 0.85, -r * 0.82, -r * 0.18, -r * 0.92, 0, -r * 0.55);
    ctx.bezierCurveTo(r * 0.18, -r * 0.92, r * 0.85, -r * 0.82, r * 0.92, -r * 0.3);
    ctx.bezierCurveTo(r * 1.0, r * 0.25, r * 0.25, r * 0.7, 0, r * 0.98);
  } else {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
  ctx.closePath();
}

function drawCoverCircle(ctx, cover, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  const s = Math.max((r * 2) / cover.width, (r * 2) / cover.height);
  ctx.drawImage(cover, (-cover.width * s) / 2, (-cover.height * s) / 2, cover.width * s, cover.height * s);
  ctx.restore();
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- pressings ----

// Marbled vinyl: two pigments folded into each other and dragged around by the press,
// so the colour pockets stretch along the circumference instead of looking sprayed on.
const marbleCache = new Map();

function marble(ctx, d, R) {
  const size = Math.max(64, Math.min(512, Math.round(R * 2)));
  const key = `${d.seed}:${size}:${d.base}:${d.accent}`;
  let off = marbleCache.get(key);
  if (!off) {
    off = marbleLayer(d, size);
    marbleCache.clear(); // only the record on the platter is ever redrawn
    marbleCache.set(key, off);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, -R, -R, R * 2, R * 2);
}

function marbleLayer(d, size) {
  const off = document.createElement('canvas');
  off.width = off.height = size;
  const octx = off.getContext('2d');
  const img = octx.createImageData(size, size);
  const field = fbm3(noise3(d.seed), 4);
  const warp = fbm3(noise3(d.seed ^ 0x5bd1e995), 3);
  const base = hexToRgb(d.base);
  const accent = hexToRgb(d.accent).map((c, k) => c + (base[k] - c) * 0.2); // pigments bleed into each other
  const light = base.map((c) => c + (255 - c) * 0.35);
  const h = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - h) / h, dy = (y + 0.5 - h) / h;
      const r = Math.hypot(dx, dy);
      if (r > 1) continue;
      const a = Math.atan2(dy, dx) + 1.6 * r + 2.4 * (warp(dx * 1.4, dy * 1.4, 3.7) - 0.5);
      const v = field(Math.cos(a) * 1.1, Math.sin(a) * 1.1, r * 3.2);
      const tAccent = smooth(0.53, 0.6, v);
      const tLight = (1 - smooth(0.38, 0.45, v)) * 0.55;
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        const mid = base[c] + (light[c] - base[c]) * tLight;
        img.data[i + c] = mid + (accent[c] - mid) * tAccent;
      }
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return off;
}

// Splatter vinyl: small, crisp flecks of pigment pressed flat into the record.
function splatter(ctx, d, R, rand) {
  const n = 70 + Math.floor(rand() * 50);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, r = R * (0.3 + 0.68 * Math.sqrt(rand()));
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    const size = R * (rand() < 0.85 ? 0.004 + rand() * 0.012 : 0.016 + rand() * 0.02);
    ctx.fillStyle = rand() < 0.7 ? d.accent : shade(d.accent, 0.18);
    ctx.beginPath();
    const pts = 7 + Math.floor(rand() * 5), rot = rand() * Math.PI * 2;
    for (let k = 0; k < pts; k++) {
      const t = rot + (k / pts) * Math.PI * 2, rr = size * (0.7 + rand() * 0.45);
      if (k === 0) ctx.moveTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
      else ctx.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
}

// Glitter vinyl: hundreds of tiny flakes that catch the light at different strengths.
function glitter(ctx, d, R, rand) {
  for (let i = 0; i < 420; i++) {
    const a = rand() * Math.PI * 2, r = R * Math.sqrt(rand());
    const s = (0.4 + rand() * 1.2) * Math.max(1, R / 300);
    ctx.globalAlpha = 0.35 + rand() * 0.65;
    ctx.fillStyle = rand() < 0.25 ? '#ffffff' : rand() < 0.5 ? shade(d.accent, 0.25) : d.accent;
    ctx.fillRect(Math.cos(a) * r - s / 2, Math.sin(a) * r - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

function pressing(ctx, d, R, cover, rand) {
  const { style } = d;
  if (style === 'black') {
    // pressed vinyl isn't flat black: the groove bands catch a little more light than the land between them
    const g = ctx.createRadialGradient(0, 0, 0.36 * R, 0, 0, R);
    g.addColorStop(0, '#1b1a1a'); g.addColorStop(0.18, '#0c0b0b'); g.addColorStop(0.55, '#141313');
    g.addColorStop(0.92, '#0d0c0c'); g.addColorStop(1, '#1a1919');
    ctx.fillStyle = g;
  } else if (style === 'gradient') {
    const g = ctx.createConicGradient(-Math.PI / 2, 0, 0);
    g.addColorStop(0, d.base); g.addColorStop(0.5, d.accent); g.addColorStop(1, d.base);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = d.base;
  }
  // clear vinyl: a light tint of the colour that lets what's under it show through
  if (style === 'translucent') { ctx.globalAlpha = 0.6; ctx.fillStyle = shade(d.base, 0.18); }
  ctx.fillRect(-R * 1.1, -R * 1.1, R * 2.2, R * 2.2);
  if (style === 'translucent') {
    const g = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
    g.addColorStop(0, shade(d.base, 0.12));
    g.addColorStop(1, shade(d.base, -0.08));
    ctx.fillStyle = g;
    ctx.fillRect(-R * 1.1, -R * 1.1, R * 2.2, R * 2.2);
  }
  ctx.globalAlpha = 1;
  if (style === 'half') {
    ctx.save();
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = d.accent;
    ctx.fillRect(-R * 1.1, 0, R * 2.2, R * 1.1);
    ctx.restore();
  }
  if (style === 'picture' && cover) drawCoverCircle(ctx, cover, R);
  if (style === 'marble') marble(ctx, d, R);
  if (style === 'splatter') splatter(ctx, d, R, rand);
  if (style === 'glitter') glitter(ctx, d, R, rand);
}

function grooves(ctx, D, rand, durations, groove, strength) {
  const inner = groove.inner * D, outer = groove.outer * D;
  const k = 0.3 + 1.3 * strength;
  // Roughly one groove line per device pixel; fainter lines read as a fine sheen, not stripes.
  const step = Math.max(1, D / 420);
  ctx.lineWidth = step * 0.6;
  for (let r = inner; r < outer; r += step) {
    ctx.strokeStyle = rand() < 0.55 ? `rgba(0,0,0,${(0.05 + rand() * 0.06) * k})` : `rgba(255,255,255,${(0.012 + rand() * 0.025) * k})`;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Silent bands between tracks are wider and smoother, so they catch the light.
  const gaps = durations.length > 1 && durations.every((d) => d > 0) ? gapRadii(durations, groove)
    : Array.from({ length: Math.max(0, durations.length - 1) }, (_, i) => groove.outer - ((i + 1) / durations.length) * (groove.outer - groove.inner));
  for (const g of gaps) {
    ctx.lineWidth = D * 0.008;
    ctx.strokeStyle = `rgba(0,0,0,${0.22 * k})`;
    ctx.beginPath(); ctx.arc(0, 0, g * D, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = D * 0.0025;
    ctx.strokeStyle = `rgba(255,255,255,${0.1 * k})`;
    ctx.beginPath(); ctx.arc(0, 0, g * D + D * 0.0045, 0, Math.PI * 2); ctx.stroke();
  }
  // the smooth lead-in at the edge is glossier than the grooved part
  const lead = ctx.createRadialGradient(0, 0, outer, 0, 0, outer + D * 0.04);
  lead.addColorStop(0, 'rgba(255,255,255,0)');
  lead.addColorStop(0.3, 'rgba(255,255,255,0.05)');
  lead.addColorStop(1, 'rgba(255,255,255,0.015)');
  ctx.fillStyle = lead;
  ctx.beginPath(); ctx.arc(0, 0, outer + D * 0.05, 0, Math.PI * 2); ctx.arc(0, 0, outer, 0, Math.PI * 2, true); ctx.fill();
  // lead-in and smooth run-out bands
  ctx.lineWidth = D * 0.002;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (const r of [outer + D * 0.012, inner - D * 0.015, inner - D * 0.03]) {
    if (r > 0) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
  }
}

function fitText(ctx, text, x, y, max) {
  let t = text;
  while (ctx.measureText(t).width > max && t.length > 1) t = t.slice(0, -2) + '…';
  ctx.fillText(t, x, y);
}

function label(ctx, album, d, cover, R) {
  const r = d.look.label.size * R;
  if (d.style === 'picture') {
    ctx.lineWidth = R * 0.006;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.stroke();
    return;
  }
  const font = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
  if (d.labelMode === 'cover') {
    drawCoverCircle(ctx, cover, r);
    if (d.look.label.showTitle) {
      // a small printed title along the bottom of the label
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(-r, r * 0.5, r * 2, r * 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${r * 0.13}px ${font}`;
      fitText(ctx, album.title, 0, r * 0.66, r * 1.3);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = d.labelColor;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    if (d.labelMode === 'text' || d.look.label.showTitle) {
      ctx.fillStyle = d.labelText;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${r * 0.17}px ${font}`;
      fitText(ctx, album.title, 0, -r * 0.42, r * 1.5);
      ctx.font = `500 ${r * 0.1}px ${font}`;
      if (album.artist) fitText(ctx, album.artist, 0, r * 0.42, r * 1.3);
      ctx.font = `600 ${r * 0.075}px ${font}`;
      ctx.fillText(`${album.rpm ?? 33} RPM`, 0, r * 0.66);
    }
  }
  // paper catches the light a little, unevenly
  const sheen = ctx.createLinearGradient(-r, -r, r, r);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = sheen;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  // the label's edge sits a hair below the vinyl, with a raised ring pressed just outside it
  ctx.lineWidth = R * 0.006;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.arc(0, 0, r + R * 0.003, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = R * 0.004;
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.beginPath(); ctx.arc(0, 0, r + R * 0.028, 0, Math.PI * 2); ctx.stroke();
  if (d.look.label.ring) {
    ctx.lineWidth = R * 0.004;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  }
}

// The matrix number scratched into the smooth run-out, as on every pressed record.
function runoutEtching(ctx, album, d, R, groove, D) {
  const r = (groove.inner - 0.025) * D;
  if (r <= d.look.label.size * R + R * 0.03) return;
  const code = `${(album.id || 'LP').replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || 'LP'}-${(d.seed % 9000) + 1000} A`;
  ctx.save();
  ctx.font = `500 ${R * 0.018}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.rotate(-Math.PI / 2 - 0.5);
  for (const ch of code) {
    ctx.save();
    ctx.translate(0, -r);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    ctx.rotate((ctx.measureText(ch).width + R * 0.004) / r);
  }
  ctx.restore();
}

export function renderVinyl(canvas, album, design, cover, durations) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width, D = size / 2; // D = a 12-inch record's radius
  const lk = design.look;
  const R = D * SIZE_FACTOR[lk.vinyl.size];
  const groove = grooveFor(lk);
  const rand = mulberry32(design.seed);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(D, D);
  shapePath(ctx, lk.vinyl.shape, R);
  ctx.save();
  ctx.clip();
  pressing(ctx, design, R, cover, rand);
  grooves(ctx, D, rand, durations, groove, lk.finish.grooves);
  if (design.style !== 'picture') runoutEtching(ctx, album, design, R, groove, D);
  label(ctx, album, design, cover, R);
  ctx.restore();
  // the rolled lip along the edge: dark rim, and a bright line where its top catches the light
  ctx.lineWidth = Math.max(1, D * 0.006);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  shapePath(ctx, lk.vinyl.shape, R - ctx.lineWidth / 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, D * 0.003);
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  shapePath(ctx, lk.vinyl.shape, R - D * 0.011);
  ctx.stroke();
  // spindle hole
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(0, 0, D * 0.022, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// A small round preview of a pressing for the customizer.
export function renderSwatch(canvas, style, base, accent, seed = 7) {
  const ctx = canvas.getContext('2d');
  const R = canvas.width / 2;
  const d = { style, base: style === 'black' ? '#111010' : base, accent, seed };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(R, R);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.clip();
  if (style === 'picture') {
    const g = ctx.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0, base); g.addColorStop(1, accent);
    ctx.fillStyle = g; ctx.fillRect(-R, -R, R * 2, R * 2);
  } else {
    pressing(ctx, d, R, null, mulberry32(seed));
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(0, 0, R * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Outline of a shape for the customizer's buttons.
export function renderShapeIcon(canvas, shape, color) {
  const ctx = canvas.getContext('2d');
  const R = canvas.width / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(R, R);
  shapePath(ctx, shape, R * 0.9);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

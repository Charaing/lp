// Draws each album's record onto a canvas. Same album id → same record.
import { hashSeed, mulberry32, extractPalette, pickStyle, hexToRgb, rgbToHsl, toHex } from './palette.js';
import { GROOVE, gapRadii } from './timeline.js';

const LABEL = 0.33;
const BASIC = ['solid', 'translucent', 'marble', 'splatter'];

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

function coverPalette(cover) {
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

function readableOn(color) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = color;
  const [r, g, b] = hexToRgb(c.fillStyle.startsWith('#') ? c.fillStyle : '#808080');
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1b1410' : '#f6ecd6';
}

export function designFor(album, cover) {
  const seed = hashSeed(album.id);
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const palette = cover ? coverPalette(cover) : [];
  let style = album.vinyl?.style ?? (cover ? pickStyle(seed, palette) : BASIC[Math.floor(rand() * BASIC.length)]);
  if (style === 'picture' && !cover) style = 'solid';

  const hue = rand() * 360;
  const base = album.vinyl?.color ?? palette[0] ?? toHexFromHsl(hue, 0.55, 0.32);
  const accent = album.vinyl?.accent ?? palette.find((p, i) => i > 0 && distance(p, base) > 90) ?? toHexFromHsl((hue + 140) % 360, 0.6, 0.62);
  const labelColor = album.label?.color ?? palette[2] ?? accent;
  const labelText = album.label?.text ?? readableOn(labelColor);
  return { style, base, accent, labelColor, labelText, seed };
}

function distance(a, b) {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

function toHexFromHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))));
  return toHex(f(0), f(8), f(4));
}

function drawCoverCircle(ctx, cover, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const s = Math.max((r * 2) / cover.width, (r * 2) / cover.height);
  ctx.drawImage(cover, cx - (cover.width * s) / 2, cy - (cover.height * s) / 2, cover.width * s, cover.height * s);
  ctx.restore();
}

function texture(ctx, d, R, rand) {
  if (d.style === 'marble') {
    ctx.save();
    ctx.filter = `blur(${R * 0.012}px)`;
    // Wavy partial rings, like pigment dragged around by the press.
    for (let i = 0; i < 22; i++) {
      ctx.beginPath();
      const r0 = R * (0.3 + rand() * 0.65), amp = R * (0.02 + rand() * 0.08);
      const k = 2 + Math.floor(rand() * 4), phase = rand() * Math.PI * 2;
      const start = rand() * Math.PI * 2, span = Math.PI * (0.6 + rand() * 1.4);
      for (let s = 0; s <= 64; s++) {
        const a = start + (span * s) / 64;
        const r = r0 + amp * Math.sin(k * a + phase);
        if (s === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.strokeStyle = i % 3 === 0 ? shade(d.base, 0.25) : d.accent;
      ctx.globalAlpha = 0.25 + rand() * 0.45;
      ctx.lineWidth = R * (0.015 + rand() * 0.07);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
  } else if (d.style === 'splatter') {
    const n = 40 + Math.floor(rand() * 41);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, r = R * Math.sqrt(rand());
      const x = Math.cos(a) * r, y = Math.sin(a) * r, size = R * (0.008 + rand() ** 3 * 0.06);
      ctx.fillStyle = rand() < 0.75 ? d.accent : shade(d.accent, 0.25);
      ctx.globalAlpha = 0.75 + rand() * 0.25;
      ctx.beginPath();
      ctx.ellipse(x, y, size, size * (0.6 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 3; k++) { // satellite droplets
        ctx.beginPath();
        ctx.arc(x + (rand() - 0.5) * size * 5, y + (rand() - 0.5) * size * 5, size * rand() * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

function grooves(ctx, R, rand, durations) {
  const inner = GROOVE.inner * R, outer = GROOVE.outer * R;
  const step = Math.max(1.2, R / 260);
  ctx.lineWidth = step * 0.5;
  for (let r = inner; r < outer; r += step) {
    ctx.strokeStyle = rand() < 0.5 ? `rgba(0,0,0,${0.10 + rand() * 0.10})` : `rgba(255,255,255,${0.02 + rand() * 0.04})`;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Silent bands between tracks are wider and smoother, so they catch the light.
  const gaps = durations.length > 1 && durations.every((d) => d > 0) ? gapRadii(durations)
    : Array.from({ length: Math.max(0, durations.length - 1) }, (_, i) => GROOVE.outer - ((i + 1) / durations.length) * (GROOVE.outer - GROOVE.inner));
  for (const g of gaps) {
    ctx.lineWidth = R * 0.012;
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.arc(0, 0, g * R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = R * 0.003;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(0, 0, g * R + R * 0.006, 0, Math.PI * 2); ctx.stroke();
  }
  // lead-in edge and smooth run-out
  ctx.lineWidth = R * 0.03;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(0, 0, R * 0.985, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = R * 0.002;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (const r of [LABEL + 0.02, LABEL + 0.045]) { ctx.beginPath(); ctx.arc(0, 0, r * R, 0, Math.PI * 2); ctx.stroke(); }
}

function label(ctx, album, d, cover, R) {
  const r = LABEL * R;
  if (d.style === 'picture') {
    ctx.lineWidth = R * 0.006;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.stroke();
    return;
  }
  if (cover) {
    drawCoverCircle(ctx, cover, 0, 0, r);
  } else {
    ctx.fillStyle = d.labelColor;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = d.labelText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${R * 0.055}px "Instrument Serif", Georgia, serif`;
    fitText(ctx, album.title, 0, -r * 0.42, r * 1.5);
    ctx.font = `${R * 0.028}px Michroma, sans-serif`;
    if (album.artist) fitText(ctx, album.artist, 0, r * 0.45, r * 1.3);
    ctx.font = `${R * 0.022}px Michroma, sans-serif`;
    ctx.fillText(`${album.rpm ?? 33} rpm`, 0, r * 0.68);
  }
  // pressing ring around the label
  ctx.lineWidth = R * 0.004;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
}

function fitText(ctx, text, x, y, max) {
  let t = text;
  while (ctx.measureText(t).width > max && t.length > 1) t = t.slice(0, -2) + '…';
  ctx.fillText(t, x, y);
}

export function renderVinyl(canvas, album, design, cover, durations) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width, R = size / 2;
  const rand = mulberry32(design.seed);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(R, R);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.clip();

  if (design.style === 'translucent') ctx.globalAlpha = 0.72;
  ctx.fillStyle = design.base;
  ctx.fillRect(-R, -R, size, size);
  if (design.style === 'translucent') {
    const g = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
    g.addColorStop(0, shade(design.base, 0.12));
    g.addColorStop(1, shade(design.base, -0.08));
    ctx.fillStyle = g;
    ctx.fillRect(-R, -R, size, size);
  }
  ctx.globalAlpha = 1;
  if (design.style === 'picture' && cover) drawCoverCircle(ctx, cover, 0, 0, R);
  texture(ctx, design, R, rand);
  grooves(ctx, R, rand, durations);
  label(ctx, album, design, cover, R);

  // spindle hole
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(0, 0, R * 0.022, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

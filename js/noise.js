// Seeded 3D value noise, used for marbled vinyl. Pure, so Node tests can import it.
import { mulberry32 } from './palette.js';

export function noise3(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const values = Float32Array.from({ length: 256 }, () => rand());

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const at = (x, y, z) => values[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];

  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    return lerp(
      lerp(lerp(at(xi, yi, zi), at(xi + 1, yi, zi), u), lerp(at(xi, yi + 1, zi), at(xi + 1, yi + 1, zi), u), v),
      lerp(lerp(at(xi, yi, zi + 1), at(xi + 1, yi, zi + 1), u), lerp(at(xi, yi + 1, zi + 1), at(xi + 1, yi + 1, zi + 1), u), v),
      w,
    );
  };
}

export function fbm3(noise, octaves = 4) {
  return (x, y, z) => {
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * f, y * f, z * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  };
}

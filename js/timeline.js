// Maps the needle's distance from the spindle to a position in the album.
// Radii are fractions of the disc radius; the label covers 0..0.33.

export const GROOVE = { outer: 0.96, inner: 0.40 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function radiusToTime(r, total, groove = GROOVE) {
  if (!(total > 0)) return 0;
  const f = (groove.outer - clamp(r, groove.inner, groove.outer)) / (groove.outer - groove.inner);
  return f * total;
}

export function timeToRadius(t, total, groove = GROOVE) {
  if (!(total > 0)) return groove.outer;
  return groove.outer - (clamp(t, 0, total) / total) * (groove.outer - groove.inner);
}

export function locate(durations, t) {
  let acc = 0;
  const time = Math.max(0, t);
  for (let i = 0; i < durations.length; i++) {
    const d = durations[i];
    if (d > 0 && time < acc + d) return { index: i, offset: time - acc };
    acc += d;
  }
  if (acc === 0) return { index: 0, offset: 0 }; // nothing measured yet
  const last = durations.length - 1;
  return { index: last, offset: durations[last] };
}

export function startOf(durations, index) {
  return durations.slice(0, index).reduce((a, d) => a + d, 0);
}

export function gapRadii(durations, groove = GROOVE) {
  const total = durations.reduce((a, d) => a + d, 0);
  return durations.slice(1).map((_, i) => timeToRadius(startOf(durations, i + 1), total, groove));
}

// Where a needle dropped at time t starts playing: the beginning of that track.
// Past the last track (the run-out) stays at the end, so the record runs out.
export function trackStartAt(durations, t) {
  const total = durations.reduce((a, d) => a + d, 0);
  if (total > 0 && t >= total) return total;
  return startOf(durations, locate(durations, t).index);
}

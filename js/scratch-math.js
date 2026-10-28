// The maths behind spinning a record by hand. Pure, so Node tests can import it.
const DEG_PER_SEC = { 33: 200, 45: 270 };

// Change in angle between two pointer samples, the short way round (clockwise = positive).
export function unwrapDelta(prevDeg, nextDeg) {
  let d = (nextDeg - prevDeg) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

// Spinning at the platter's own speed plays at 1×; backwards plays in reverse.
export function rateFromVelocity(degPerSec, rpm) {
  const r = degPerSec / (DEG_PER_SEC[rpm] ?? DEG_PER_SEC[33]);
  return Math.max(-4, Math.min(4, r)) + 0;
}

export function smoothVelocity(prev, sample, dtSec, tau = 0.04) {
  return prev + (sample - prev) * (1 - Math.exp(-dtSec / tau));
}

// The stretch of a track kept decoded around the needle (seconds).
export function windowAround(positionSec, durationSec, span = 60) {
  return { start: Math.max(0, positionSec - span), end: Math.min(durationSec, positionSec + span) };
}

export function readLinear(samples, pos) {
  if (!(pos >= 0) || pos > samples.length - 1) return 0;
  const i = Math.floor(pos), t = pos - i;
  const a = samples[i], b = i + 1 < samples.length ? samples[i + 1] : a;
  return a + (b - a) * t;
}

// New read position (in samples) after `frames` output samples at `rate`.
export function advance(pos, rate, sampleRate, frames) {
  return pos + rate * frames;
}

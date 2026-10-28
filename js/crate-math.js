// Flipping through the record crate. Pure, so Node tests can import it.

export function clampIndex(i, count) {
  return Math.max(0, Math.min(Math.max(0, count - 1), i));
}

export function stepFromWheel(deltaY) {
  if (Math.abs(deltaY) < 4) return 0;
  return deltaY > 0 ? 1 : -1;
}

// Left or up flips to the next sleeve; right or down goes back.
export function stepFromSwipe(dx, dy, threshold = 40) {
  const d = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
  if (Math.abs(d) < threshold || Math.abs(dx) === Math.abs(dy)) return 0;
  return d < 0 ? 1 : -1;
}

// Cover flow: offset 0 faces you; the others turn 58° toward the centre and
// stack outward, closer together the further they are. Far ones fade out.
export function coverflowTransform(offset, size) {
  if (!Number.isFinite(offset)) return { x: 0, z: -0.35 * size, rotY: 0, opacity: 0, zIndex: 0 };
  // while a finger drags the row, offsets are fractional: blend the two neighbouring poses
  if (!Number.isInteger(offset)) {
    const lo = Math.floor(offset), t = offset - lo;
    const a = coverflowTransform(lo, size), b = coverflowTransform(lo + 1, size);
    const mix = (k) => a[k] + (b[k] - a[k]) * t;
    return { x: mix('x'), z: mix('z'), rotY: mix('rotY'), opacity: mix('opacity'), zIndex: 100 - Math.round(Math.abs(offset)) };
  }
  if (offset === 0) return { x: 0, z: 0, rotY: 0, opacity: 1, zIndex: 100 };
  const sign = Math.sign(offset), n = Math.abs(offset);
  return {
    x: sign * (0.62 + 0.18 * (n - 1)) * size,
    z: -0.35 * size,
    rotY: -sign * 58,
    opacity: n > 5 ? 0 : 1,
    zIndex: 100 - n,
  };
}

// A wheel gesture (a trackpad fling keeps firing for a second) counts once: an event
// only flips a sleeve if the wheel had been still for gapMs before it.
export function createWheelGate(gapMs) {
  let last = -Infinity;
  return (t) => {
    const fresh = t - last >= gapMs;
    last = t;
    return fresh;
  };
}

// A dragged position may go a little past the first or last sleeve, then resists.
export function clampFloat(f, count) {
  const max = Math.max(0, count - 1);
  if (f < 0) return f * 0.25;
  if (f > max) return max + (f - max) * 0.25;
  return f;
}

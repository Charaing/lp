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

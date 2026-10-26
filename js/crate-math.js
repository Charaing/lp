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

// offset 0 is the sleeve at the front; 1..4 stand behind it, leaning back;
// negative offsets have been flipped forward out of view.
export function sleeveTransform(offset) {
  if (offset < 0) return { y: 60, z: 80, rotX: 70, opacity: 0 };
  return { y: -22 * offset + 0, z: -60 * offset + 0, rotX: -4 - 9 * offset, opacity: offset > 4 ? 0 : 1 };
}

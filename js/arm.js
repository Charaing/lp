// Tonearm geometry in the deck's SVG coordinates (viewBox 0 0 1000 1300, portrait).
// Angles are degrees, measured from the pivot; 90° points straight down.

export const PLINTH = { w: 1000, h: 1300 };
export const DISC = { x: 380, y: 520, r: 430 };
export const PIVOT = { x: 870, y: 160 };
export const ARM_LENGTH = 600;

const D = Math.hypot(DISC.x - PIVOT.x, DISC.y - PIVOT.y);
const PHI = (Math.atan2(DISC.y - PIVOT.y, DISC.x - PIVOT.x) * 180) / Math.PI;
const toRad = (d) => (d * Math.PI) / 180;

export function angleForRadius(r) {
  const rr = r * DISC.r;
  const cos = (ARM_LENGTH ** 2 + D ** 2 - rr ** 2) / (2 * ARM_LENGTH * D);
  return PHI - (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

export function radiusForAngle(deg) {
  const nx = PIVOT.x + ARM_LENGTH * Math.cos(toRad(deg));
  const ny = PIVOT.y + ARM_LENGTH * Math.sin(toRad(deg));
  return Math.hypot(nx - DISC.x, ny - DISC.y) / DISC.r;
}

export function needlePoint(deg) {
  return { x: PIVOT.x + ARM_LENGTH * Math.cos(toRad(deg)), y: PIVOT.y + ARM_LENGTH * Math.sin(toRad(deg)) };
}

export const ARM = { rest: 90, max: angleForRadius(0.36) };

export function clampAngle(deg, max = ARM.max) {
  const a = ((deg % 360) + 360) % 360;
  if (a > 270 || a < ARM.rest) return ARM.rest;
  return Math.min(max, a);
}

// Maps the flat plinth layout (arm.js, 1200×780) onto the 3D scene. Pure, so Node tests can import it.
// One world unit is 100 plinth units; the plinth's centre is the world origin, +z points toward the viewer.
import { PLINTH } from './arm.js';

export function plinthToWorld(x, y) {
  return { x: (x - PLINTH.w / 2) / 100 + 0, z: (y - PLINTH.h / 2) / 100 + 0 };
}

export function worldToPlinth(x, z) {
  return { x: x * 100 + PLINTH.w / 2, y: z * 100 + PLINTH.h / 2 };
}

// Camera distance at which a width × depth rectangle (as seen by the camera) fills the view with a margin.
export function fitDistance(fovDeg, aspect, width, depth, margin = 0.06) {
  const half = Math.tan((fovDeg * Math.PI) / 360);
  const byHeight = (depth * (1 + 2 * margin)) / 2 / half;
  const byWidth = (width * (1 + 2 * margin)) / 2 / (half * aspect);
  return Math.max(byHeight, byWidth);
}

// Tonearm height while it settles: 1 = lifted, 0 = resting, dipping just below 0 as it bounces.
export function armLift(t) {
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  const c1 = 1.70158, c3 = c1 + 1;
  return -(c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2);
}

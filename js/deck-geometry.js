// Motion curves for the deck. Pure, so Node tests can import it.

// Tonearm height while it settles: 1 = lifted, 0 = resting, dipping just below 0 as it bounces.
export function armLift(t) {
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  const c1 = 1.70158, c3 = c1 + 1;
  return -(c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2);
}

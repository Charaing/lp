import test from 'node:test';
import assert from 'node:assert/strict';
import { armLift } from '../js/deck-geometry.js';

test('armLift starts lifted, ends exactly down, and dips below zero on the way (the bounce)', () => {
  assert.equal(armLift(0), 1);
  assert.equal(armLift(1), 0);
  assert.equal(armLift(-1), 1);
  assert.equal(armLift(2), 0);
  const samples = Array.from({ length: 50 }, (_, i) => armLift(i / 49));
  assert.ok(Math.min(...samples) < 0, 'bounce');
});

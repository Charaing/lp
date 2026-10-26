import test from 'node:test';
import assert from 'node:assert/strict';
import { plinthToWorld, worldToPlinth, fitDistance, armLift } from '../js/deck-geometry.js';
import { DISC } from '../js/arm.js';

test('plinth and world coordinates round-trip, plinth centre is the origin', () => {
  assert.deepEqual(plinthToWorld(600, 390), { x: 0, z: 0 });
  assert.deepEqual(plinthToWorld(DISC.x, DISC.y), { x: -2.2, z: 0 });
  const p = worldToPlinth(1.23, -0.5);
  const back = plinthToWorld(p.x, p.y);
  assert.ok(Math.abs(back.x - 1.23) < 1e-9 && Math.abs(back.z + 0.5) < 1e-9);
});

test('fitDistance grows as the screen gets narrower', () => {
  const wide = fitDistance(30, 16 / 9, 12, 7.8);
  const tall = fitDistance(30, 9 / 19.5, 12, 7.8);
  assert.ok(tall > wide && wide > 0);
});

test('armLift starts lifted, ends exactly down, and dips below zero on the way (the bounce)', () => {
  assert.equal(armLift(0), 1);
  assert.equal(armLift(1), 0);
  assert.equal(armLift(-1), 1);
  assert.equal(armLift(2), 0);
  const samples = Array.from({ length: 50 }, (_, i) => armLift(i / 49));
  assert.ok(Math.min(...samples) < 0, 'bounce');
});

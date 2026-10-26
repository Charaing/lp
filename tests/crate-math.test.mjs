import test from 'node:test';
import assert from 'node:assert/strict';
import { clampIndex, stepFromWheel, stepFromSwipe, sleeveTransform } from '../js/crate-math.js';

test('clampIndex keeps the index in range', () => {
  assert.equal(clampIndex(-1, 5), 0);
  assert.equal(clampIndex(7, 5), 4);
  assert.equal(clampIndex(2, 5), 2);
  assert.equal(clampIndex(0, 0), 0);
});

test('stepFromWheel ignores tiny deltas', () => {
  assert.equal(stepFromWheel(2), 0);
  assert.equal(stepFromWheel(40), 1);
  assert.equal(stepFromWheel(-40), -1);
});

test('stepFromSwipe uses the larger axis; left/up = next, right/down = previous', () => {
  assert.equal(stepFromSwipe(-60, 10), 1);
  assert.equal(stepFromSwipe(60, 5), -1);
  assert.equal(stepFromSwipe(5, -70), 1);
  assert.equal(stepFromSwipe(3, 70), -1);
  assert.equal(stepFromSwipe(20, 20), 0);
});

test('sleeveTransform: front upright, back sleeves lean back, far ones hidden, flipped ones fall forward', () => {
  assert.deepEqual(sleeveTransform(0), { y: 0, z: 0, rotX: -4, opacity: 1 });
  assert.deepEqual(sleeveTransform(2), { y: -44, z: -120, rotX: -22, opacity: 1 });
  assert.equal(sleeveTransform(5).opacity, 0);
  assert.deepEqual(sleeveTransform(-1), { y: 60, z: 80, rotX: 70, opacity: 0 });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { clampIndex, stepFromWheel, stepFromSwipe, coverflowTransform } from '../js/crate-math.js';

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

test('coverflowTransform: the centre sleeve faces you', () => {
  assert.deepEqual(coverflowTransform(0, 300), { x: 0, z: 0, rotY: 0, opacity: 1, zIndex: 100 });
});

test('coverflowTransform: side sleeves turn toward the centre and stack outward', () => {
  assert.deepEqual(coverflowTransform(1, 300), { x: 186, z: -105, rotY: -58, opacity: 1, zIndex: 99 });
  assert.deepEqual(coverflowTransform(-1, 300), { x: -186, z: -105, rotY: 58, opacity: 1, zIndex: 99 });
  const three = coverflowTransform(3, 300);
  assert.ok(Math.abs(three.x - 294) < 1e-9);
  assert.equal(three.zIndex, 97);
});

test('coverflowTransform: far sleeves fade out', () => {
  assert.equal(coverflowTransform(5, 300).opacity, 1);
  assert.equal(coverflowTransform(6, 300).opacity, 0);
  assert.equal(coverflowTransform(-6, 300).opacity, 0);
});

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

import { createWheelGate, clampFloat } from '../js/crate-math.js';

test('one trackpad fling (a continuous burst of wheel events) flips one sleeve', () => {
  const gate = createWheelGate(250);
  let steps = 0;
  for (let t = 0; t <= 1000; t += 16) if (gate(t)) steps++;
  assert.equal(steps, 1);
});

test('separate wheel gestures each flip a sleeve', () => {
  const gate = createWheelGate(250);
  assert.equal(gate(0), true);
  assert.equal(gate(300), true);
  assert.equal(gate(310), false);
  assert.equal(gate(700), true);
});

test('coverflowTransform interpolates fractional offsets', () => {
  const a = coverflowTransform(0, 300), b = coverflowTransform(1, 300), m = coverflowTransform(0.5, 300);
  assert.ok(Math.abs(m.x - (a.x + b.x) / 2) < 1e-9);
  assert.ok(Math.abs(m.rotY - (a.rotY + b.rotY) / 2) < 1e-9);
  assert.ok(Math.abs(m.z - (a.z + b.z) / 2) < 1e-9);
});

test('pulling past either end only stretches a little', () => {
  assert.equal(clampFloat(-2, 5), -0.5);
  assert.equal(clampFloat(6, 5), 4.5);
  assert.equal(clampFloat(2.4, 5), 2.4);
});

test('coverflowTransform: a non-number offset hides the sleeve instead of recursing', () => {
  for (const o of [NaN, Infinity, -Infinity]) assert.equal(coverflowTransform(o, 300).opacity, 0);
});

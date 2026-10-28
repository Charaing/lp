import test from 'node:test';
import assert from 'node:assert/strict';
import { unwrapDelta, rateFromVelocity, smoothVelocity, windowAround, readLinear, advance } from '../js/scratch-math.js';

test('unwrapDelta takes the short way round', () => {
  assert.equal(unwrapDelta(179, -179), 2);
  assert.equal(unwrapDelta(-179, 179), -2);
  assert.equal(unwrapDelta(10, 40), 30);
});

test('rateFromVelocity: normal spin plays at 1, clamps to ±4', () => {
  assert.equal(rateFromVelocity(200, 33), 1);
  assert.equal(rateFromVelocity(270, 45), 1);
  assert.equal(rateFromVelocity(-400, 33), -2);
  assert.equal(rateFromVelocity(5000, 33), 4);
  assert.equal(rateFromVelocity(-5000, 33), -4);
});

test('smoothVelocity moves toward the sample, faster with a longer step', () => {
  const a = smoothVelocity(0, 100, 0.01), b = smoothVelocity(0, 100, 0.08);
  assert.ok(a > 0 && a < b && b < 100);
});

test('windowAround stays inside the track', () => {
  assert.deepEqual(windowAround(100, 300), { start: 40, end: 160 });
  assert.deepEqual(windowAround(10, 300), { start: 0, end: 70 });
  assert.deepEqual(windowAround(290, 300), { start: 230, end: 300 });
});

test('readLinear interpolates and is silent outside', () => {
  const s = Float32Array.from([0, 1, 0]);
  assert.equal(readLinear(s, 0.5), 0.5);
  assert.equal(readLinear(s, -1), 0);
  assert.equal(readLinear(s, 5), 0);
});

test('advance moves forward and backward by rate', () => {
  assert.equal(advance(100, 2, 44100, 128), 356);
  assert.equal(advance(100, -0.5, 44100, 128), 36);
});

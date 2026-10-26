import test from 'node:test';
import assert from 'node:assert/strict';
import { GROOVE, radiusToTime, timeToRadius, locate, startOf, gapRadii } from '../js/timeline.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('radiusToTime maps outer→0 and inner→total, clamps outside', () => {
  assert.equal(GROOVE.outer, 0.96); assert.equal(GROOVE.inner, 0.40);
  close(radiusToTime(0.96, 100), 0);
  close(radiusToTime(0.40, 100), 100);
  assert.equal(radiusToTime(1.5, 100), 0);
  assert.equal(radiusToTime(0.1, 100), 100);
  close(radiusToTime(0.68, 100), 50);
});

test('timeToRadius is inverse of radiusToTime', () => {
  for (const t of [0, 12.5, 77, 100]) close(radiusToTime(timeToRadius(t, 100), 100), t);
});

test('locate finds track and offset', () => {
  assert.deepEqual(locate([30, 20, 50], 0), { index: 0, offset: 0 });
  assert.deepEqual(locate([30, 20, 50], 35), { index: 1, offset: 5 });
  assert.deepEqual(locate([30, 20, 50], 999), { index: 2, offset: 50 });
  assert.deepEqual(locate([30, 20, 50], -5), { index: 0, offset: 0 });
});

test('locate skips zero-length (failed) tracks', () => {
  assert.deepEqual(locate([30, 0, 50], 30), { index: 2, offset: 0 });
});

test('startOf sums previous durations', () => { assert.equal(startOf([30, 20, 50], 2), 50); });

test('gapRadii has one boundary per track after the first', () => {
  const g = gapRadii([50, 50]);
  assert.equal(g.length, 1); close(g[0], 0.68);
});

test('zero total does not divide by zero', () => {
  assert.equal(radiusToTime(0.7, 0), 0);
  assert.equal(timeToRadius(0, 0), 0.96);
  assert.deepEqual(locate([], 3), { index: 0, offset: 0 });
});

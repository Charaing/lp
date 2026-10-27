import test from 'node:test';
import assert from 'node:assert/strict';
import { GROOVE, radiusToTime, timeToRadius, locate, startOf, gapRadii, trackStartAt } from '../js/timeline.js';

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

test('locate with all-unknown durations starts at the first track', () => {
  assert.deepEqual(locate([0, 0, 0], 0), { index: 0, offset: 0 });
  assert.deepEqual(locate([0, 0, 0], 12), { index: 0, offset: 0 });
});

test('trackStartAt snaps a time to the start of the track it falls in', () => {
  assert.equal(trackStartAt([30, 20, 50], 0), 0);
  assert.equal(trackStartAt([30, 20, 50], 29.9), 0);
  assert.equal(trackStartAt([30, 20, 50], 35), 30);
  assert.equal(trackStartAt([30, 20, 50], 77), 50);
});

test('trackStartAt keeps the run-out (end of album) as the end', () => {
  assert.equal(trackStartAt([30, 20, 50], 100), 100);
  assert.equal(trackStartAt([30, 20, 50], 999), 100);
});

test('trackStartAt skips failed tracks and handles unknown lengths', () => {
  assert.equal(trackStartAt([30, 0, 50], 30), 30);
  assert.equal(trackStartAt([0, 0, 0], 5), 0);
});

test('radiusToTime and timeToRadius use a given groove', () => {
  const g = { outer: 0.5, inner: 0.2 };
  assert.ok(Math.abs(radiusToTime(0.35, 100, g) - 50) < 1e-9);
  assert.ok(Math.abs(timeToRadius(100, 100, g) - 0.2) < 1e-9);
  assert.equal(gapRadii([50, 50], g).length, 1);
  assert.ok(Math.abs(gapRadii([50, 50], g)[0] - 0.35) < 1e-9);
});

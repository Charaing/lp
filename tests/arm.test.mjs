import test from 'node:test';
import assert from 'node:assert/strict';
import { ARM, angleForRadius, radiusForAngle, clampAngle } from '../js/arm.js';
import { GROOVE } from '../js/timeline.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('radiusForAngle inverts angleForRadius across the groove', () => {
  for (const r of [GROOVE.outer, 0.8, 0.6, GROOVE.inner]) close(radiusForAngle(angleForRadius(r)), r);
});

test('the rest position is off the record', () => {
  assert.ok(radiusForAngle(ARM.rest) > 1);
});

test('moving the arm inward reduces the radius', () => {
  assert.ok(angleForRadius(GROOVE.outer) < angleForRadius(GROOVE.inner));
  assert.ok(angleForRadius(GROOVE.outer) > ARM.rest);
});

test('clampAngle keeps the arm between rest and just past the run-out', () => {
  assert.equal(clampAngle(10), ARM.rest);
  assert.equal(clampAngle(300), ARM.rest);
  assert.equal(clampAngle(179), ARM.max);
  close(clampAngle(120), 120);
  assert.ok(radiusForAngle(ARM.max) > 0.33, 'needle never lands on the label');
});

test('clampAngle honours a custom maximum', () => {
  assert.equal(clampAngle(179, 110), 110);
  assert.equal(clampAngle(100, 110), 100);
});

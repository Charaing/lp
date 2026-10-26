import test from 'node:test';
import assert from 'node:assert/strict';
import { noise3, fbm3 } from '../js/noise.js';

test('noise3 is deterministic per seed and stays in [0,1]', () => {
  const a = noise3(7), b = noise3(7), c = noise3(8);
  let differs = false;
  for (let i = 0; i < 200; i++) {
    const x = i * 0.37, y = i * 0.11, z = i * 0.53;
    const v = a(x, y, z);
    assert.equal(v, b(x, y, z));
    assert.ok(v >= 0 && v <= 1, `out of range: ${v}`);
    if (Math.abs(v - c(x, y, z)) > 1e-6) differs = true;
  }
  assert.ok(differs, 'different seeds give different noise');
});

test('noise3 is smooth: nearby points have nearby values', () => {
  const n = noise3(3);
  for (let i = 0; i < 100; i++) {
    const x = i * 0.29, y = 1.7, z = -0.4;
    assert.ok(Math.abs(n(x, y, z) - n(x + 0.001, y, z)) < 0.02);
  }
});

test('fbm3 adds octaves and stays in [0,1]', () => {
  const f = fbm3(noise3(5), 4);
  const vals = Array.from({ length: 300 }, (_, i) => f(i * 0.21, i * 0.07, 0.5));
  assert.ok(vals.every((v) => v >= 0 && v <= 1));
  assert.ok(Math.max(...vals) - Math.min(...vals) > 0.3, 'has real variation');
});

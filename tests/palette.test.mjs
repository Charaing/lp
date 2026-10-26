import test from 'node:test';
import assert from 'node:assert/strict';
import { hashSeed, mulberry32, extractPalette, colorfulness, pickStyle } from '../js/palette.js';

test('hashSeed is deterministic and differs by input', () => {
  assert.equal(hashSeed('abc'), hashSeed('abc'));
  assert.notEqual(hashSeed('abc'), hashSeed('abd'));
  assert.ok(hashSeed('') >= 0 && hashSeed('x') <= 0xffffffff);
});

test('mulberry32 yields same sequence for same seed, in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});

test('extractPalette returns dominant color first', () => {
  const px = new Uint8ClampedArray(100 * 4);
  for (let i = 0; i < 100; i++) px.set(i < 90 ? [220, 30, 30, 255] : [20, 40, 210, 255], i * 4);
  const p = extractPalette(px, 2);
  assert.equal(p.length, 2);
  assert.match(p[0], /^#[d-f][0-9a-f][0-3][0-9a-f][0-3][0-9a-f]$/);
});

test('extractPalette ignores fully transparent pixels and handles empty input', () => {
  assert.deepEqual(extractPalette(new Uint8ClampedArray(0)), []);
  assert.deepEqual(extractPalette(new Uint8ClampedArray([255, 0, 0, 0])), []);
});

test('colorfulness is 0 for grays and high for a rainbow', () => {
  assert.equal(colorfulness(['#808080', '#7a7a7a']), 0);
  assert.ok(colorfulness(['#ff0000', '#00ff00', '#0000ff', '#ffff00']) >= 0.5);
});

test('pickStyle is deterministic and never picture for monochrome', () => {
  assert.equal(pickStyle(7, ['#ff0000']), pickStyle(7, ['#ff0000']));
  for (let s = 0; s < 50; s++) assert.notEqual(pickStyle(s, ['#808080', '#7a7a7a']), 'picture');
});

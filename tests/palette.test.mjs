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

import { deckColors, rgbToHsl as hsl, hexToRgb as rgb } from '../js/palette.js';
const L = (hex) => hsl(...rgb(hex))[2];
const H = (hex) => hsl(...rgb(hex))[0];

test('deckColors: a dark grey cover gets a deep black deck', () => {
  assert.equal(deckColors(['#121212', '#333333']).body, '#1a1a1a');
});

test('deckColors: a light grey cover gets a graphite deck', () => {
  assert.equal(deckColors(['#e9e9e9', '#cfcfcf']).body, '#2a2927');
});

test('deckColors: an orange cover gets a deep orange deck', () => {
  const c = deckColors(['#ef7a2e', '#ffffff']);
  assert.ok(H(c.body) >= 15 && H(c.body) <= 45, `hue ${H(c.body)}`);
  assert.ok(L(c.body) >= 0.18 - 1e-2 && L(c.body) <= 0.28 + 1e-2, `lightness ${L(c.body)}`);
});

test('deckColors: the background is near black and the ink contrasts with the deck', () => {
  for (const p of [['#121212'], ['#e9e9e9'], ['#ef7a2e'], ['#1d3b8a'], []]) {
    const c = deckColors(p);
    assert.ok(L(c.bg) <= 0.08, `bg ${c.bg}`);
    assert.ok(Math.abs(L(c.ink) - L(c.body)) > 0.4, `ink ${c.ink} on ${c.body}`);
  }
});

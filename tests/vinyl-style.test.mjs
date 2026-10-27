import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultStyle } from '../js/vinyl-style.js';

test('records are black unless album.json asks for something else', () => {
  assert.equal(defaultStyle({ vinyl: {} }), 'black');
  assert.equal(defaultStyle({}), 'black');
  assert.equal(defaultStyle({ vinyl: { style: 'marble' } }), 'marble');
  assert.equal(defaultStyle({ vinyl: { color: '#3a7bd5' } }), 'solid');
  assert.equal(defaultStyle({ vinyl: { style: 'translucent', color: '#3a7bd5' } }), 'translucent');
});

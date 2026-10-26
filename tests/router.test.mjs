import test from 'node:test';
import assert from 'node:assert/strict';
import { albumIdFromHash, hashForAlbum } from '../js/router.js';

test('hashForAlbum and albumIdFromHash round-trip Korean, spaces and #', () => {
  for (const id of ['illmatic', '밤 산책', 'zz broken #1', 'a/b?c']) assert.equal(albumIdFromHash(hashForAlbum(id)), id);
});

test('hashForAlbum starts with #', () => {
  assert.equal(hashForAlbum('x'), '#x');
});

test('empty or bare hash means the crate', () => {
  assert.equal(albumIdFromHash(''), null);
  assert.equal(albumIdFromHash('#'), null);
});

test('a malformed escape is treated as no album', () => {
  assert.equal(albumIdFromHash('#%E0%A4%A'), null);
});

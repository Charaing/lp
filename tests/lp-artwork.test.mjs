import test from 'node:test';
import assert from 'node:assert/strict';
import { makeArtworkSlot } from '../js/lp-artwork.js';

function fakeUrls() {
  let n = 0;
  const revoked = [];
  return { revoked, createObjectURL: () => `blob:${++n}`, revokeObjectURL: (u) => revoked.push(u) };
}

test('a new picture frees the previous one', () => {
  const api = fakeUrls();
  const slot = makeArtworkSlot(api);
  assert.equal(slot.set({}), 'blob:1');
  assert.equal(slot.set({}), 'blob:2');
  assert.deepEqual(api.revoked, ['blob:1']);
  assert.equal(slot.current(), 'blob:2');
});

test('clear frees the last picture', () => {
  const api = fakeUrls();
  const slot = makeArtworkSlot(api);
  slot.set({});
  slot.clear();
  assert.deepEqual(api.revoked, ['blob:1']);
  assert.equal(slot.current(), null);
});

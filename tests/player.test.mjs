import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPlayableIndex } from '../js/player.js';

test('nextPlayableIndex skips failed tracks', () => {
  assert.equal(nextPlayableIndex(new Set([1]), 0, 3), 2);
});

test('nextPlayableIndex returns -1 when every later track failed', () => {
  assert.equal(nextPlayableIndex(new Set([1, 2]), 0, 3), -1);
});

test('nextPlayableIndex returns -1 after the last track', () => {
  assert.equal(nextPlayableIndex(new Set(), 2, 3), -1);
});

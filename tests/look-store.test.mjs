import test from 'node:test';
import assert from 'node:assert/strict';
import { createLookStore } from '../js/look-store.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    has: (k) => m.has(k),
  };
}

test('save then load returns the same tweaks', () => {
  const s = createLookStore(memoryStorage());
  s.save('a', { vinyl: { shape: 'heart' } });
  assert.deepEqual(s.load('a'), { vinyl: { shape: 'heart' } });
  assert.deepEqual(s.load('b'), {});
});

test('a broken saved value is ignored and removed', () => {
  const mem = memoryStorage();
  mem.setItem('lp:look:a', '{oops');
  const s = createLookStore(mem);
  assert.deepEqual(s.load('a'), {});
  assert.equal(mem.has('lp:look:a'), false);
});

test('clear forgets an album', () => {
  const s = createLookStore(memoryStorage());
  s.save('a', { vinyl: { size: 7 } });
  s.clear('a');
  assert.deepEqual(s.load('a'), {});
});

test('a storage that throws makes the store unavailable but never throws', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const s = createLookStore(bad);
  assert.equal(s.available, false);
  assert.deepEqual(s.load('a'), {});
  s.save('a', {});
  s.clear('a');
});

test('missing storage (Node) is unavailable', () => {
  assert.equal(createLookStore(undefined).available, false);
});

test('a browser where even reading localStorage throws still gets a working store', () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    const s = createLookStore();
    assert.equal(s.available, false);
    assert.deepEqual(s.load('a'), {});
  } finally {
    if (desc) Object.defineProperty(globalThis, 'localStorage', desc);
    else delete globalThis.localStorage;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, encodePng } from '../scripts/make-demo.mjs';

test('encodeWav writes a valid RIFF/WAVE header', () => {
  const b = encodeWav(new Float32Array(100), 22050);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.toString('ascii', 8, 12), 'WAVE');
  assert.equal(b.readUInt32LE(24), 22050);
  assert.equal(b.readUInt16LE(34), 16);
  assert.equal(b.length, 44 + 200);
});

test('encodeWav clamps samples to int16 range', () => {
  const b = encodeWav(Float32Array.from([2, -2]), 8000);
  assert.equal(b.readInt16LE(44), 32767);
  assert.equal(b.readInt16LE(46), -32768);
});

test('encodePng writes signature and IHDR dimensions', () => {
  const b = encodePng(3, 2, new Uint8Array(3 * 2 * 4));
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(b.toString('ascii', 12, 16), 'IHDR');
  assert.equal(b.readUInt32BE(16), 3);
  assert.equal(b.readUInt32BE(20), 2);
});

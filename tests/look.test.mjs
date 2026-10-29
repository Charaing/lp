import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLook, defaultLook, mergeLook, lookDiff, albumJsonSnippet, grooveFor } from '../js/look.js';

test('normalizeLook drops unknown values and clamps numbers', () => {
  const l = normalizeLook({ vinyl: { style: 'glitter', shape: 'moon', size: 9, color: 'red' }, label: { size: 2 }, finish: { grooves: -1, gloss: 3 }, deck: { arm: 'pink', body: '#ABCDEF' } });
  assert.equal(l.vinyl.style, 'glitter');
  assert.equal(l.vinyl.shape, 'round');
  assert.equal(l.vinyl.size, 12);
  assert.equal(l.vinyl.color, null);
  assert.equal(l.label.size, 0.45);
  assert.equal(l.finish.grooves, 0);
  assert.equal(l.finish.gloss, 1);
  assert.equal(l.deck.arm, 'silver');
  assert.equal(l.deck.body, '#ABCDEF');
});

test('label size is capped by the shape, then by the groove band', () => {
  // star cap is 0.55 × 0.7 = 0.385, but that leaves less than 0.12 of grooves, so it shrinks to 0.368
  const size = normalizeLook({ vinyl: { shape: 'star' }, label: { size: 0.45 } }).label.size;
  assert.ok(size <= 0.385);
  assert.ok(Math.abs(size - 0.368) < 1e-9, String(size));
});

test('the groove band never gets narrower than 0.12', () => {
  const l = normalizeLook({ vinyl: { shape: 'star', size: 7 }, label: { size: 0.36 } });
  const g = grooveFor(l);
  assert.ok(g.outer - g.inner >= 0.12 - 1e-9, `${g.outer} - ${g.inner}`);
  assert.ok(l.label.size >= 0.25);
});

test('grooveFor: a 12-inch round record keeps the old groove', () => {
  const g = grooveFor(normalizeLook({}));
  assert.ok(Math.abs(g.outer - 0.96) < 1e-9 && Math.abs(g.inner - 0.40) < 1e-9);
});

test('defaultLook: clear coloured vinyl unless a colour is given; cover label only with a cover', () => {
  assert.equal(defaultLook({}, ['#ff0000'], true).vinyl.style, 'translucent');
  assert.equal(defaultLook({ vinyl: { color: '#3a7bd5' } }, [], false).vinyl.style, 'solid');
  assert.equal(defaultLook({}, [], false).label.mode, 'text');
  assert.equal(defaultLook({}, ['#ff0000', '#00ff00'], true).vinyl.accent, '#00ff00');
});

test('defaultLook keeps an old album.json style and colours', () => {
  const l = defaultLook({ vinyl: { style: 'translucent', color: '#f28c28' }, label: { color: '#111111', text: '#ffffff' } }, [], true);
  assert.equal(l.vinyl.style, 'translucent');
  assert.equal(l.vinyl.color, '#f28c28');
  assert.equal(l.label.color, '#111111');
});

test('mergeLook: later layers win, unknown values in later layers are ignored', () => {
  const m = mergeLook({ vinyl: { style: 'black', size: 12 } }, { vinyl: { style: 'marble' } }, { vinyl: { size: 7, shape: 'moon' } });
  assert.equal(m.vinyl.style, 'marble');
  assert.equal(m.vinyl.size, 7);
  assert.equal(m.vinyl.shape, 'round');
});

test('lookDiff keeps only what differs, and survives garbage', () => {
  const base = normalizeLook({});
  assert.deepEqual(lookDiff(normalizeLook({ vinyl: { shape: 'heart' } }), base), { vinyl: { shape: 'heart' } });
  assert.deepEqual(lookDiff(normalizeLook('nonsense'), base), {});
});

test('albumJsonSnippet gives album.json with title, artist, year and the changes', () => {
  const album = { title: 'Blonde', artist: 'Frank Ocean', year: 2016 };
  const base = normalizeLook({});
  const json = JSON.parse(albumJsonSnippet(album, normalizeLook({ vinyl: { style: 'glitter', color: '#112233' } }), base));
  assert.deepEqual(json, { title: 'Blonde', artist: 'Frank Ocean', year: 2016, vinyl: { style: 'glitter', color: '#112233' } });
});

test('numbers are kept to three decimals so copied code stays readable', () => {
  const l = normalizeLook({ vinyl: { shape: 'heart', size: 10 }, finish: { gloss: 0.123456 } });
  assert.equal(l.label.size, Math.round(l.label.size * 1000) / 1000);
  assert.equal(l.finish.gloss, 0.123);
});

test('albumJsonSnippet keeps a 45 rpm album at 45', () => {
  const base = normalizeLook({});
  assert.equal(JSON.parse(albumJsonSnippet({ title: 'S', rpm: 45 }, base, base)).rpm, 45);
  assert.equal(JSON.parse(albumJsonSnippet({ title: 'S', rpm: 33 }, base, base)).rpm, undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeAudio } from './helpers/fake-audio.mjs';
installFakeAudio();
const { Player } = await import('../js/player.js');
const { createDeckCore } = await import('../js/deck-core.js');
const { angleForRadius } = await import('../js/arm.js');
const { timeToRadius } = await import('../js/timeline.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const album = { id: 'a', title: 'A', artist: 'X', rpm: 33, tracks: [{ title: 'one', src: 'ok-1' }, { title: 'two', src: 'ok-2' }] };

function setup() {
  const player = new Player();
  const draws = [];
  const view = {
    setHint() {},
    loadArt: async () => ({ cover: null, design: {} }),
    drawVinyl: (...args) => draws.push(args),
  };
  return { player, core: createDeckCore(player, view), draws };
}

async function mounted() {
  const t = setup();
  await t.core.mount(album);
  await sleep(10);
  return t;
}

function drop(core, r) {
  core.startDrag();
  core.dragTo(angleForRadius(r));
  core.endDrag();
}

test('dropping the needle mid-album starts the track under it from the top', async () => {
  const { player, core } = await mounted();
  core.setMotor(true);
  drop(core, 0.68); // halfway through 20s → inside track 2
  await sleep(450);
  assert.equal(core.state.needleDown, true);
  assert.equal(player.time, 10);
});

test('the run-out stops the record', async () => {
  const { player, core } = await mounted();
  core.setMotor(true);
  drop(core, 0.38);
  await sleep(450);
  assert.equal(core.state.ended, true);
  assert.equal(player.audio.paused, true);
});

test('after a long hidden gap, tick puts the arm at the current playback position', async () => {
  const { player, core } = await mounted();
  core.remotePlay();
  player.seek(15);
  await sleep(10);
  player.audio.currentTime = 7; // played on while the page was hidden
  core.tick(30, 1e6);
  assert.ok(Math.abs(core.state.angle - angleForRadius(timeToRadius(17, 20))) < 1e-9);
});

test('remotePlay with the needle up drops it at the start and plays', async () => {
  const { player, core } = await mounted();
  core.remotePlay();
  await sleep(10);
  assert.equal(core.state.needleDown, true);
  assert.equal(core.state.motorOn, true);
  assert.equal(player.audio.paused, false);
  assert.equal(player.time, 0);
});

test('idle() is true when stopped and settled, false while spinning', async () => {
  const { core } = setup();
  core.tick(1, 1e6);
  assert.equal(core.idle(), true);
  core.setMotor(true);
  core.tick(0.1, 1e6 + 100);
  assert.equal(core.idle(), false);
});

test('mount draws the record twice: before and after durations are known', async () => {
  const { draws } = await mounted();
  assert.equal(draws.length, 2);
  assert.deepEqual(draws[1][3], [10, 10]);
});

test('info() describes the album and the track under the needle', async () => {
  const { core } = await mounted();
  assert.deepEqual([core.info().title, core.info().artist, core.info().line], ['A', 'X', '2곡  0:20']);
});

test('lifting the needle after the run-out clears the "listened to the end" state', async () => {
  const { core } = await mounted();
  core.setMotor(true);
  drop(core, 0.38);
  await sleep(450);
  assert.equal(core.state.ended, true);
  core.startDrag();
  core.dragTo(90);
  core.endDrag();
  assert.equal(core.state.ended, false);
  assert.equal(core.info().line, '2곡  0:20');
});

test('a mount that was overtaken does not apply its colours', async () => {
  const player = new Player();
  const applied = [];
  let releaseA;
  const view = {
    setHint() {},
    loadArt: (album) => album.id === 'slow'
      ? new Promise((r) => { releaseA = () => r({ cover: null, design: {}, apply: () => applied.push('slow') }); })
      : Promise.resolve({ cover: null, design: {}, apply: () => applied.push(album.id) }),
    drawVinyl() {},
  };
  const core = createDeckCore(player, view);
  const first = core.mount({ ...album, id: 'slow' });
  await sleep(10);
  core.eject();
  await core.mount({ ...album, id: 'fast' });
  releaseA();
  await first;
  assert.deepEqual(applied, ['fast']);
});

test('eject lets go of the album so the lock screen can clear', async () => {
  const { player, core } = await mounted();
  let unloaded = false;
  player.addEventListener('unload', () => { unloaded = true; });
  core.eject();
  assert.equal(player.album, null);
  assert.equal(unloaded, true);
});

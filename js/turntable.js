// The deck: spinning platter, draggable tonearm, start/stop and 33/45.
import { GROOVE, radiusToTime, timeToRadius, startOf, locate, trackStartAt } from './timeline.js';
import { ARM, PLINTH, DISC, PIVOT, ARM_LENGTH, angleForRadius, radiusForAngle, clampAngle } from './arm.js';
import { loadCover, designFor, renderVinyl } from './vinyl.js';

const DEG_PER_SEC = { 33: 200, 45: 270 };
const NEEDLE_DROP_MS = 350;
const SVG_NS = 'http://www.w3.org/2000/svg';
const RUNOUT = 0.37;

const fmt = (s) => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const pct = (v, of) => `${(v / of) * 100}%`;

function svg(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function buildArm() {
  const root = svg('svg', { class: 'arm-layer', viewBox: `0 0 ${PLINTH.w} ${PLINTH.h}`, 'aria-hidden': 'true' });
  const defs = svg('defs');
  defs.innerHTML = `
    <linearGradient id="alu" x1="0" x2="1">
      <stop offset="0" stop-color="#8d918f"/><stop offset=".45" stop-color="#eef0ee"/><stop offset="1" stop-color="#9a9e9c"/>
    </linearGradient>
    <radialGradient id="aluDisc" cx=".4" cy=".35" r=".7">
      <stop offset="0" stop-color="#f4f5f3"/><stop offset=".7" stop-color="#b8bcba"/><stop offset="1" stop-color="#7d817f"/>
    </radialGradient>
    <filter id="armShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow id="armShadowOffset" dx="10" dy="14" stdDeviation="6" flood-color="#000" flood-opacity=".45"/>
    </filter>`;
  root.append(defs);

  // arm rest post
  root.append(svg('rect', { x: PIVOT.x - 16, y: PIVOT.y + 440, width: 32, height: 22, rx: 6, fill: '#1b1513', stroke: '#6f6a66' }));
  root.append(svg('circle', { cx: PIVOT.x, cy: PIVOT.y, r: 62, fill: 'url(#aluDisc)', stroke: '#5b5f5d', 'stroke-width': 2 }));
  root.append(svg('circle', { cx: PIVOT.x, cy: PIVOT.y, r: 44, fill: 'none', stroke: '#6e7270', 'stroke-width': 1.5 }));

  // The arm is drawn pointing straight down (90°) and rotated around the pivot.
  const arm = svg('g', { class: 'arm', filter: 'url(#armShadow)' });
  const tipY = PIVOT.y + ARM_LENGTH;
  arm.append(
    svg('rect', { x: PIVOT.x - 20, y: PIVOT.y - 92, width: 40, height: 58, rx: 8, fill: 'url(#alu)', stroke: '#585c5a' }),
    svg('rect', { x: PIVOT.x - 7, y: PIVOT.y - 40, width: 14, height: 40, fill: '#3a3d3c' }),
    svg('path', {
      d: `M${PIVOT.x} ${PIVOT.y} L${PIVOT.x} ${tipY - 150} Q${PIVOT.x} ${tipY - 95} ${PIVOT.x - 26} ${tipY - 62}`,
      fill: 'none', stroke: 'url(#alu)', 'stroke-width': 14, 'stroke-linecap': 'round',
    }),
    svg('circle', { cx: PIVOT.x, cy: PIVOT.y, r: 24, fill: 'url(#aluDisc)', stroke: '#585c5a', 'stroke-width': 2 }),
  );
  // headshell: needle sits exactly at (PIVOT.x, tipY)
  const head = svg('g', { transform: `rotate(18 ${PIVOT.x} ${tipY})` });
  head.append(
    svg('rect', { x: PIVOT.x - 22, y: tipY - 66, width: 44, height: 78, rx: 7, fill: '#1d1a19', stroke: '#9a9e9c', 'stroke-width': 2 }),
    svg('rect', { x: PIVOT.x + 22, y: tipY - 56, width: 22, height: 8, rx: 4, fill: 'url(#alu)' }),
    svg('circle', { cx: PIVOT.x, cy: tipY, r: 4, fill: '#ffb04a' }),
  );
  arm.append(head);
  const grab = svg('circle', { class: 'arm-grab', cx: PIVOT.x, cy: tipY - 30, r: 70, fill: 'transparent' });
  arm.append(grab);
  root.append(arm);
  return { root, arm, grab };
}

export function createTurntable(root, player) {
  root.replaceChildren();
  const plinth = document.createElement('div');
  plinth.className = 'plinth';
  plinth.innerHTML = `
    <div class="platter" style="left:${pct(DISC.x - DISC.r * 1.06, PLINTH.w)};top:${pct(DISC.y - DISC.r * 1.06, PLINTH.h)};width:${pct(DISC.r * 2.12, PLINTH.w)};height:${pct(DISC.r * 2.12, PLINTH.h)}">
      <div class="platter-rim"></div>
      <div class="mat"></div>
      <div class="disc-slot"><div class="disc"><canvas width="1024" height="1024"></canvas></div></div>
      <div class="sheen"></div>
      <div class="spindle"></div>
    </div>
    <div class="controls">
      <div class="speed" role="group" aria-label="회전 속도">
        <button type="button" data-rpm="33" aria-pressed="true">33</button>
        <button type="button" data-rpm="45" aria-pressed="false">45</button>
      </div>
      <div class="power">
        <span class="pilot" aria-hidden="true"></span>
        <button type="button" class="startstop" aria-pressed="false">시작</button>
      </div>
    </div>`;
  const { root: armLayer, arm, grab } = buildArm();
  plinth.append(armLayer);
  // Title and hint live beside the plinth so phones can stack them under the turntable.
  const info = document.createElement('div');
  info.className = 'nowplaying';
  info.setAttribute('aria-live', 'off');
  info.innerHTML = '<p class="np-title"></p><p class="np-artist"></p><p class="np-track"></p>';
  const hintEl = document.createElement('p');
  hintEl.className = 'deck-hint';
  root.append(plinth, info, hintEl);

  const q = (s) => plinth.querySelector(s);
  const platter = q('.platter'), disc = q('.disc'), canvas = q('canvas');
  const hint = hintEl, startBtn = q('.startstop');
  const npTitle = info.querySelector('.np-title'), npArtist = info.querySelector('.np-artist'), npTrack = info.querySelector('.np-track');
  const shadow = armLayer.querySelector('#armShadowOffset');

  // the focusable handle for keyboard and screen readers
  arm.setAttribute('tabindex', '0');
  arm.setAttribute('role', 'slider');
  arm.setAttribute('aria-label', '톤암');
  arm.setAttribute('aria-valuemin', '0');
  arm.removeAttribute('aria-hidden');
  armLayer.removeAttribute('aria-hidden');

  const s = {
    album: null, motorOn: false, rpm: 33, speed: 0, rotation: 0,
    angle: ARM.rest, needleDown: false, dragging: false, ended: false,
    audible: false, tween: null, dropTimer: 0, mountToken: 0, pendingR: null,
  };

  const setHint = (text) => { hint.textContent = text; hint.hidden = !text; };
  setHint('레코드를 골라 플래터에 올리세요');

  function setMotor(on) {
    s.motorOn = on;
    startBtn.textContent = on ? '정지' : '시작';
    startBtn.setAttribute('aria-pressed', String(on));
    plinth.classList.toggle('motor-on', on);
  }

  function setRpm(rpm) {
    s.rpm = rpm;
    for (const b of plinth.querySelectorAll('.speed button')) b.setAttribute('aria-pressed', String(Number(b.dataset.rpm) === rpm));
  }

  function setNeedle(down) {
    s.needleDown = down;
    shadow.setAttribute('dx', down ? 4 : 10);
    shadow.setAttribute('dy', down ? 5 : 14);
  }

  function tweenTo(target, ms = 600) {
    return new Promise((resolve) => {
      s.tween = { from: s.angle, to: target, start: performance.now(), ms, resolve };
    });
  }

  // The needle always starts the track it lands on from the top.
  function seekToTrackUnder(r) {
    player.seek(trackStartAt(player.durations, radiusToTime(r, player.total)));
  }

  function dropNeedleAt(r) {
    clearTimeout(s.dropTimer);
    s.dropTimer = setTimeout(() => {
      setNeedle(true);
      s.ended = false;
      // Track lengths may still be loading; seek again by position once they arrive.
      s.pendingR = player.total > 0 ? null : r;
      seekToTrackUnder(r);
      setHint('');
    }, NEEDLE_DROP_MS);
  }

  function liftNeedle() {
    clearTimeout(s.dropTimer);
    s.pendingR = null;
    setNeedle(false);
  }

  async function returnToRest() {
    liftNeedle();
    await tweenTo(ARM.rest);
  }

  // ---- pointer dragging ----
  function pointerAngle(e) {
    const m = armLayer.getScreenCTM();
    if (!m) return s.angle;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return clampAngle((Math.atan2(p.y - PIVOT.y, p.x - PIVOT.x) * 180) / Math.PI);
  }

  grab.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { grab.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
    s.dragging = true;
    s.tween = null;
    liftNeedle();
    plinth.classList.add('dragging');
  });
  grab.addEventListener('pointermove', (e) => {
    if (s.dragging) s.angle = pointerAngle(e);
  });
  const endDrag = () => {
    if (!s.dragging) return;
    s.dragging = false;
    plinth.classList.remove('dragging');
    const r = radiusForAngle(s.angle);
    if (s.album && r <= 1) dropNeedleAt(r);
    else returnToRest();
  };
  grab.addEventListener('pointerup', endDrag);
  grab.addEventListener('pointercancel', endDrag);

  // ---- buttons and keys ----
  startBtn.addEventListener('click', () => setMotor(!s.motorOn));
  for (const b of plinth.querySelectorAll('.speed button')) b.addEventListener('click', () => setRpm(Number(b.dataset.rpm)));

  async function togglePlay() {
    if (!s.album) return;
    if (!s.needleDown) {
      setMotor(true);
      await tweenTo(angleForRadius(GROOVE.outer));
      dropNeedleAt(GROOVE.outer);
      return;
    }
    setMotor(!s.motorOn);
  }

  function skip(delta) {
    if (!s.album || !s.needleDown) return;
    const durations = player.durations;
    const { index, offset } = locate(durations, player.time);
    let target = index + delta;
    if (delta < 0 && offset > 3) target = index; // restart the current track first
    target = Math.max(0, Math.min(durations.length - 1, target));
    s.ended = false;
    player.seek(startOf(durations, target));
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('button, input, textarea, select, a')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); skip(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-1); }
  });

  player.addEventListener('durations', () => {
    if (s.pendingR != null && s.needleDown) seekToTrackUnder(s.pendingR);
    s.pendingR = null;
  });

  player.addEventListener('ended', () => {
    if (!s.needleDown) return;
    s.ended = true;
    s.audible = false;
    s.angle = angleForRadius(RUNOUT);
  });

  // ---- frame loop ----
  let last = performance.now();
  let lastText = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const target = s.motorOn ? DEG_PER_SEC[s.rpm] : 0;
    s.speed += (target - s.speed) * (1 - Math.exp(-dt / 0.25));
    if (Math.abs(s.speed) < 0.05 && !s.motorOn) s.speed = 0;
    s.rotation = (s.rotation + s.speed * dt) % 360;
    disc.style.transform = `rotate(${s.rotation}deg)`;
    platter.style.setProperty('--spin', `${s.rotation}deg`);

    if (s.tween) {
      const k = Math.min(1, (now - s.tween.start) / s.tween.ms);
      const e = 1 - (1 - k) ** 3;
      s.angle = s.tween.from + (s.tween.to - s.tween.from) * e;
      if (k === 1) { const done = s.tween.resolve; s.tween = null; done(); }
    } else if (s.needleDown && !s.dragging && !s.ended && player.total > 0) {
      s.angle = angleForRadius(timeToRadius(player.time, player.total));
    }
    arm.setAttribute('transform', `rotate(${s.angle - 90} ${PIVOT.x} ${PIVOT.y})`);

    const shouldPlay = s.album && s.needleDown && s.motorOn && !s.dragging && !s.ended && s.speed > target * 0.6;
    if (shouldPlay && !s.audible) { s.audible = true; player.play(); }
    else if (!shouldPlay && s.audible) { s.audible = false; player.pause(); }

    if (now - lastText > 250) { lastText = now; updateText(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function updateText() {
    if (!s.album) return;
    const total = player.total;
    const { index, offset } = locate(player.durations, player.time);
    const track = s.album.tracks[index];
    const where = `${index + 1}/${s.album.tracks.length}  ${track?.title ?? ''}`;
    if (s.ended) { npTrack.textContent = `끝까지 들었어요  ${fmt(total)}`; return; }
    npTrack.textContent = s.needleDown ? `${where}   ${fmt(offset)} / ${fmt(player.durations[index])}` : `${s.album.tracks.length}곡  ${fmt(total)}`;
    arm.setAttribute('aria-valuemax', String(Math.round(total)));
    arm.setAttribute('aria-valuenow', String(Math.round(s.needleDown ? player.time : 0)));
    arm.setAttribute('aria-valuetext', s.needleDown ? `${track?.title ?? ''} ${fmt(offset)}` : '거치대에 있음');
  }

  // Draw the record at the size it is shown, so grooves don't alias into stripes on phones.
  let lastDraw = null;
  function draw(album, cover, design, durations) {
    lastDraw = [album, cover, design, durations];
    const shown = disc.offsetWidth * (window.devicePixelRatio || 1);
    const px = shown > 0 ? Math.min(1024, Math.max(256, Math.round(shown))) : 1024;
    if (canvas.width !== px) canvas.width = canvas.height = px;
    renderVinyl(canvas, album, design, cover, durations);
  }
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (lastDraw && s.album === lastDraw[0]) draw(...lastDraw); }, 200);
  });

  return {
    async mount(album) {
      const token = ++s.mountToken;
      s.ended = false;
      s.audible = false;
      player.pause();
      if (s.album) {
        returnToRest();
        plinth.classList.add('swapping');
        await new Promise((r) => setTimeout(r, 380));
      } else {
        liftNeedle();
      }
      if (token !== s.mountToken) return;
      s.album = album;
      // Start loading audio before the cover so an early needle drop seeks this album.
      const loading = player.load(album);
      s.audible = false; // load() paused the player
      if (s.needleDown) returnToRest(); // dropped on the outgoing record during the swap
      const [cover] = await Promise.all([loadCover(album.cover), document.fonts.ready]);
      if (token !== s.mountToken) return;
      const design = designFor(album, cover);
      setRpm(album.rpm === 45 ? 45 : 33);
      draw(album, cover, design, album.tracks.map(() => 0));
      plinth.classList.remove('swapping');
      plinth.classList.add('loaded');
      npTitle.textContent = album.title;
      npArtist.textContent = album.artist || '';
      setHint('톤암을 레코드 위로 끌어다 놓으세요');
      const durations = await loading;
      if (token !== s.mountToken) return;
      draw(album, cover, design, durations);
      updateText();
    },
    // Lock screen and Dynamic Island buttons. They can arrive while the page is hidden and
    // animation frames are paused, so they set the deck's state and drive the player directly.
    remotePlay() {
      if (!s.album) return;
      if (!s.needleDown || s.ended) {
        s.tween = null;
        s.angle = angleForRadius(GROOVE.outer);
        setNeedle(true);
        s.ended = false;
        player.seek(0);
        setHint('');
      }
      setMotor(true);
      s.speed = DEG_PER_SEC[s.rpm];
      s.audible = true;
      player.play();
    },
    remotePause() {
      setMotor(false);
      s.audible = false;
      player.pause();
    },
    skip,
    eject() {
      s.mountToken++;
      s.album = null;
      player.pause();
      returnToRest();
      plinth.classList.remove('loaded');
    },
  };
}

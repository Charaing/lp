// The 2D deck: spinning platter, draggable tonearm, start/stop and 33/45, drawn with SVG and a canvas.
// It is also the fallback when the 3D deck can't run. Behaviour lives in deck-core.js.
import { PLINTH, DISC, PIVOT, ARM_LENGTH, clampAngle } from './arm.js';
import { loadCover, designFor, renderVinyl } from './vinyl.js';
import { createDeckCore, bindDeckKeys } from './deck-core.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

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

  const core = createDeckCore(player, {
    setHint(text) { hint.textContent = text; hint.hidden = !text; },
    async loadArt(album) {
      const [cover] = await Promise.all([loadCover(album.cover), document.fonts.ready]);
      return { cover, design: designFor(album, cover) };
    },
    drawVinyl: (...args) => draw(...args),
  });
  const s = core.state;

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
    core.startDrag();
  });
  grab.addEventListener('pointermove', (e) => core.dragTo(pointerAngle(e)));
  grab.addEventListener('pointerup', () => core.endDrag());
  grab.addEventListener('pointercancel', () => core.endDrag());

  // ---- buttons and keys ----
  startBtn.addEventListener('click', () => core.toggleMotor());
  for (const b of plinth.querySelectorAll('.speed button')) b.addEventListener('click', () => core.setRpm(Number(b.dataset.rpm)));
  let active = true;
  bindDeckKeys(core, () => active);

  // ---- frame loop ----
  let last = performance.now();
  let lastText = 0;
  function frame(now) {
    core.tick((now - last) / 1000, now);
    last = now;
    disc.style.transform = `rotate(${s.rotation}deg)`;
    platter.style.setProperty('--spin', `${s.rotation}deg`);
    arm.setAttribute('transform', `rotate(${s.angle - 90} ${PIVOT.x} ${PIVOT.y})`);
    shadow.setAttribute('dx', 4 + 6 * Math.max(0, s.lift));
    shadow.setAttribute('dy', 5 + 9 * Math.max(0, s.lift));
    plinth.classList.toggle('dragging', s.dragging);
    if (now - lastText > 250) { lastText = now; updateText(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function updateText() {
    startBtn.textContent = s.motorOn ? '정지' : '시작';
    startBtn.setAttribute('aria-pressed', String(s.motorOn));
    plinth.classList.toggle('motor-on', s.motorOn);
    for (const b of plinth.querySelectorAll('.speed button')) b.setAttribute('aria-pressed', String(Number(b.dataset.rpm) === s.rpm));
    plinth.classList.toggle('loaded', s.phase !== 'empty');
    plinth.classList.toggle('swapping', s.phase === 'swapping');
    const i = core.info();
    npTitle.textContent = i.title;
    npArtist.textContent = i.artist;
    npTrack.textContent = i.line;
    arm.setAttribute('aria-valuemax', String(i.ariaMax));
    arm.setAttribute('aria-valuenow', String(i.ariaNow));
    arm.setAttribute('aria-valuetext', i.ariaText);
  }
  core.onChange(updateText);

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
    mount: core.mount,
    eject: core.eject,
    remotePlay: core.remotePlay,
    remotePause: core.remotePause,
    skip: core.skip,
    setVisible(on) { active = on; },
  };
}

// The turntable seen from straight above: a solid-colour body taking its colour from the
// album, a black record with the cover as its label, a silver tonearm and three round keys.
// Behaviour lives in deck-core.js; this file draws it and turns input into calls on the core.
import { PLINTH, PIVOT, ARM_LENGTH, clampAngle } from './arm.js';
import { loadCover, designFor, renderVinyl } from './vinyl.js';
import { deckColors } from './palette.js';
import { createDeckCore, bindDeckKeys } from './deck-core.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// The arm is drawn pointing straight down (90°) from the pivot and rotated into place.
function buildArm() {
  const root = svg('svg', { class: 'tt-arm', viewBox: `0 0 ${PLINTH.w} ${PLINTH.h}` });
  const P = PIVOT, tip = P.y + ARM_LENGTH;
  root.innerHTML = `
    <defs>
      <linearGradient id="tt-tube" x1="0" x2="1">
        <stop offset="0" stop-color="#8d9190"/><stop offset=".35" stop-color="#ffffff"/><stop offset=".6" stop-color="#c9cccb"/><stop offset="1" stop-color="#7c807f"/>
      </linearGradient>
      <radialGradient id="tt-dome" cx=".38" cy=".32" r=".75">
        <stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#c3c6c5"/><stop offset="1" stop-color="#6f7372"/>
      </radialGradient>
      <linearGradient id="tt-shell" x1="0" x2="1">
        <stop offset="0" stop-color="#0d0d0d"/><stop offset=".5" stop-color="#2a2a2a"/><stop offset="1" stop-color="#0d0d0d"/>
      </linearGradient>
      <filter id="tt-arm-shadow" x="-30%" y="-10%" width="160%" height="130%">
        <feDropShadow id="tt-arm-shadow-offset" dx="14" dy="16" stdDeviation="7" flood-color="#000" flood-opacity=".32"/>
      </filter>
    </defs>`;

  // the base the arm turns on, set into the body
  root.append(
    svg('circle', { cx: P.x, cy: P.y, r: 92, fill: 'rgba(0,0,0,.12)' }),
    svg('circle', { cx: P.x, cy: P.y, r: 86, fill: 'url(#tt-dome)', stroke: 'rgba(0,0,0,.25)', 'stroke-width': 2 }),
    svg('circle', { cx: P.x, cy: P.y, r: 58, fill: 'none', stroke: 'rgba(0,0,0,.18)', 'stroke-width': 2 }),
  );
  // the rest the arm parks on
  root.append(svg('rect', { x: P.x - 20, y: P.y + 452, width: 40, height: 30, rx: 10, fill: '#1a1a1a', opacity: '.85' }));

  const arm = svg('g', { class: 'arm', filter: 'url(#tt-arm-shadow)' });
  arm.append(
    // counterweight behind the pivot
    svg('rect', { x: P.x - 30, y: P.y - 122, width: 60, height: 84, rx: 12, fill: 'url(#tt-tube)', stroke: 'rgba(0,0,0,.25)', 'stroke-width': 2 }),
    svg('rect', { x: P.x - 30, y: P.y - 66, width: 60, height: 8, fill: '#151515' }),
    // the tube
    svg('rect', { x: P.x - 9, y: P.y - 40, width: 18, height: ARM_LENGTH - 70, rx: 9, fill: 'url(#tt-tube)' }),
    svg('circle', { cx: P.x, cy: P.y, r: 30, fill: 'url(#tt-dome)', stroke: 'rgba(0,0,0,.3)', 'stroke-width': 2 }),
  );
  // headshell and cartridge, angled like a real offset headshell; the stylus is exactly at the tip
  const head = svg('g', { transform: `rotate(22 ${P.x} ${tip})` });
  head.append(
    svg('rect', { x: P.x - 26, y: tip - 96, width: 52, height: 112, rx: 10, fill: 'url(#tt-shell)' }),
    svg('rect', { x: P.x + 26, y: tip - 86, width: 34, height: 10, rx: 5, fill: 'url(#tt-tube)' }),
    svg('rect', { x: P.x - 16, y: tip - 44, width: 32, height: 50, rx: 4, fill: '#3a3a3a' }),
    svg('circle', { cx: P.x, cy: tip, r: 4, fill: '#ff8a1f' }),
  );
  arm.append(head);
  const grab = svg('circle', { class: 'arm-grab', cx: P.x, cy: tip - 60, r: 95, fill: 'transparent' });
  arm.append(grab);
  root.append(arm);
  return { root, arm, grab, shadow: root.querySelector('#tt-arm-shadow-offset') };
}

const icon = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6v12M18 6l-9 6 9 6z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 6v12M6 6l9 6-9 6z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};

export function createTurntable(root, player) {
  root.replaceChildren();
  const tt = document.createElement('div');
  tt.className = 'tt';
  tt.innerHTML = `
    <div class="tt-record empty">
      <div class="tt-mat"></div>
      <div class="tt-slot">
        <div class="tt-record-shadow"></div>
        <div class="tt-spin"><canvas width="1024" height="1024"></canvas></div>
        <div class="tt-sheen"></div>
      </div>
      <div class="tt-spindle"></div>
    </div>
    <span class="tt-pilot" aria-hidden="true"></span>
    <div class="tt-speed" role="group" aria-label="회전 속도">
      <button type="button" data-rpm="33" aria-pressed="true">33</button>
      <button type="button" data-rpm="45" aria-pressed="false">45</button>
    </div>
    <div class="tt-controls">
      <button type="button" class="tt-btn play" aria-pressed="false"><span class="key"></span><span class="cap">PLAY</span></button>
      <div class="group">
        <button type="button" class="tt-btn prev" aria-label="이전 곡"><span class="key"></span><span class="cap">${icon.prev}</span></button>
        <button type="button" class="tt-btn next" aria-label="다음 곡"><span class="key"></span><span class="cap">${icon.next}</span></button>
      </div>
    </div>`;
  const { root: armLayer, arm, grab, shadow } = buildArm();
  tt.querySelector('.tt-record').after(armLayer);

  const side = document.createElement('div');
  side.className = 'deck-side';
  side.innerHTML = '<div class="nowplaying" aria-live="off"><p class="np-title"></p><p class="np-artist"></p><p class="np-track"></p></div><p class="deck-hint"></p>';
  root.append(tt, side);

  const q = (sel) => tt.querySelector(sel);
  const record = q('.tt-record'), spin = q('.tt-spin'), canvas = q('canvas');
  const playBtn = q('.tt-btn.play'), playCap = playBtn.querySelector('.cap');
  const hint = side.querySelector('.deck-hint');
  const npTitle = side.querySelector('.np-title'), npArtist = side.querySelector('.np-artist'), npTrack = side.querySelector('.np-track');

  arm.setAttribute('tabindex', '0');
  arm.setAttribute('role', 'slider');
  arm.setAttribute('aria-label', '톤암');
  arm.setAttribute('aria-valuemin', '0');

  const screen = root.closest('.deck-screen');
  const core = createDeckCore(player, {
    setHint(text) { hint.textContent = text; hint.hidden = !text; },
    async loadArt(album) {
      const cover = await loadCover(album.cover);
      const design = designFor(album, cover);
      const colors = deckColors(design.palette);
      const apply = () => {
        for (const [k, v] of Object.entries({ '--deck-body': colors.body, '--deck-bg': colors.bg, '--deck-ink': colors.ink })) {
          (screen ?? root).style.setProperty(k, v);
        }
      };
      return { cover, design, apply };
    },
    drawVinyl: (...args) => draw(...args),
  });
  const s = core.state;

  // ---- tonearm dragging ----
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

  // ---- keys ----
  playBtn.addEventListener('click', () => core.togglePlay());
  q('.tt-btn.prev').addEventListener('click', () => core.skip(-1));
  q('.tt-btn.next').addEventListener('click', () => core.skip(1));
  for (const b of tt.querySelectorAll('.tt-speed button')) b.addEventListener('click', () => core.setRpm(Number(b.dataset.rpm)));
  let active = true;
  bindDeckKeys(core, () => active);

  // ---- frame loop ----
  let last = performance.now();
  let lastText = 0;
  function frame(now) {
    if (active) {
      core.tick((now - last) / 1000, now);
      spin.style.transform = `rotate(${s.rotation}deg)`;
      arm.setAttribute('transform', `rotate(${s.angle - 90} ${PIVOT.x} ${PIVOT.y})`);
      const lift = Math.max(0, s.lift);
      shadow.setAttribute('dx', 6 + 14 * lift);
      shadow.setAttribute('dy', 7 + 16 * lift);
      shadow.setAttribute('stdDeviation', 4 + 6 * lift);
      tt.classList.toggle('dragging', s.dragging);
      if (now - lastText > 250) { lastText = now; updateText(); }
    }
    last = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function updateText() {
    const playing = s.motorOn && s.needleDown;
    playCap.textContent = playing ? 'STOP' : 'PLAY';
    playBtn.setAttribute('aria-pressed', String(playing));
    playBtn.setAttribute('aria-label', playing ? '정지' : '재생');
    tt.classList.toggle('motor-on', s.motorOn);
    for (const b of tt.querySelectorAll('.tt-speed button')) b.setAttribute('aria-pressed', String(Number(b.dataset.rpm) === s.rpm));
    record.classList.toggle('empty', s.phase !== 'loaded');
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
    const shown = record.offsetWidth * (window.devicePixelRatio || 1);
    const px = shown > 0 ? Math.min(1400, Math.max(256, Math.round(shown))) : 1024;
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

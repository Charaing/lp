// The turntable seen from straight above: a solid-colour body taking its colour from the
// album, a black record with the cover as its label, a silver tonearm and three round keys.
// Behaviour lives in deck-core.js; this file draws it and turns input into calls on the core.
import { PLINTH, PIVOT, ARM_LENGTH, clampAngle } from './arm.js';
import { loadCover, designFor, renderVinyl, coverPalette } from './vinyl.js';
import { deckColors, rgbToHsl, hexToRgb } from './palette.js';
import { createDeckCore, bindDeckKeys, fmt } from './deck-core.js';
import { defaultLook, mergeLook, normalizeLook, lookDiff, albumJsonSnippet, grooveFor, SIZE_FACTOR, INSCRIBED } from './look.js';
import { createLookStore } from './look-store.js';
import { createCustomizer } from './customizer.js';
import { createScratchEngine } from './scratch.js';
import { unwrapDelta, rateFromVelocity, smoothVelocity } from './scratch-math.js';
import { locate, startOf } from './timeline.js';

// tonearm metal: tube gradient stops and pivot dome stops
const ARM_METAL = {
  silver: { tube: ['#8d9190', '#ffffff', '#c9cccb', '#7c807f'], dome: ['#ffffff', '#c3c6c5', '#6f7372'] },
  gold: { tube: ['#7d5f26', '#fff2c8', '#d9b566', '#6e5220'], dome: ['#fff6d8', '#d4b062', '#6e5220'] },
  black: { tube: ['#0b0b0b', '#5a5a5a', '#262626', '#0a0a0a'], dome: ['#6a6a6a', '#262626', '#050505'] },
};

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
      <radialGradient id="tt-base" cx=".42" cy=".38" r=".7">
        <stop offset="0" stop-color="#3a3a3a"/><stop offset=".7" stop-color="#1e1e1e"/><stop offset="1" stop-color="#141414"/>
      </radialGradient>
      <linearGradient id="tt-cyl" x1="0" x2="1">
        <stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".22" stop-color="#000" stop-opacity="0"/>
        <stop offset=".32" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>
        <stop offset=".8" stop-color="#000" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".55"/>
      </linearGradient>
      <linearGradient id="tt-cyl-v" href="#tt-cyl" x1="0" y1="0" x2="0" y2="1"/>
      <linearGradient id="tt-cart" x1="0" x2="1">
        <stop offset="0" stop-color="#050505"/><stop offset=".3" stop-color="#3a3a3a"/><stop offset=".45" stop-color="#151515"/><stop offset="1" stop-color="#050505"/>
      </linearGradient>
      <filter id="tt-arm-shadow" x="-30%" y="-10%" width="160%" height="130%">
        <feDropShadow id="tt-arm-shadow-offset" dx="14" dy="16" stdDeviation="7" flood-color="#000" flood-opacity=".32"/>
      </filter>
    </defs>`;

  // the base the arm turns on, set into the body
  root.append(
    svg('circle', { cx: P.x, cy: P.y, r: 92, fill: 'rgba(0,0,0,.4)' }),
    svg('circle', { cx: P.x, cy: P.y, r: 86, fill: 'url(#tt-base)', stroke: 'rgba(255,255,255,.1)', 'stroke-width': 1.5 }),
    svg('circle', { cx: P.x, cy: P.y, r: 60, fill: 'none', stroke: 'rgba(0,0,0,.55)', 'stroke-width': 3 }),
    svg('circle', { cx: P.x, cy: P.y, r: 57.5, fill: 'none', stroke: 'rgba(255,255,255,.07)', 'stroke-width': 1.5 }),
    ...[200, 320, 80].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return svg('circle', { cx: P.x + Math.cos(a) * 73, cy: P.y + Math.sin(a) * 73, r: 3.5, fill: '#4a4a4a', stroke: 'rgba(0,0,0,.6)', 'stroke-width': 1 });
    }),
  );
  // anti-skate dial with its scale, and the cue lever
  const dial = svg('g', { transform: `translate(${P.x + 80} ${P.y + 150})` });
  dial.append(
    svg('circle', { r: 30, fill: 'rgba(0,0,0,.28)' }),
    svg('circle', { r: 24, fill: 'url(#tt-dome)', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 2 }),
    svg('rect', { x: -2, y: -22, width: 4, height: 12, rx: 2, fill: '#2a2a2a' }),
  );
  for (let i = -4; i <= 4; i++) {
    dial.append(svg('rect', { x: -1, y: -38, width: 2, height: i % 2 ? 5 : 8, fill: 'rgba(255,255,255,.35)', transform: `rotate(${i * 18})` }));
  }
  const cue = svg('g', { transform: `translate(${P.x + 80} ${P.y + 320})` });
  cue.append(
    svg('rect', { x: -16, y: -40, width: 32, height: 80, rx: 16, fill: 'rgba(0,0,0,.32)' }),
    svg('rect', { x: -6, y: -32, width: 12, height: 64, rx: 6, fill: '#121212' }),
    svg('rect', { x: -14, y: -38, width: 28, height: 22, rx: 8, fill: 'url(#tt-tube)', stroke: 'rgba(0,0,0,.3)', 'stroke-width': 1.5 }),
  );
  root.append(dial, cue);
  // the rest the arm parks on, with its clip
  root.append(
    svg('rect', { x: P.x - 24, y: P.y + 448, width: 48, height: 38, rx: 12, fill: 'rgba(0,0,0,.3)' }),
    svg('rect', { x: P.x - 20, y: P.y + 452, width: 40, height: 30, rx: 10, fill: '#1a1a1a' }),
    svg('path', { d: `M${P.x - 15} ${P.y + 462} q15 -12 30 0`, fill: 'none', stroke: 'url(#tt-tube)', 'stroke-width': 4, 'stroke-linecap': 'round' }),
  );

  const arm = svg('g', { class: 'arm', filter: 'url(#tt-arm-shadow)' });
  arm.append(
    // the stub the counterweight screws onto
    svg('rect', { x: P.x - 7, y: P.y - 70, width: 14, height: 70, fill: 'url(#tt-tube)' }),
    svg('rect', { x: P.x - 7, y: P.y - 70, width: 14, height: 70, fill: 'url(#tt-cyl)' }),
    // counterweight body
    svg('rect', { x: P.x - 28, y: P.y - 142, width: 56, height: 66, rx: 4, fill: 'url(#tt-tube)' }),
    // knurled grip at the back: many fine grooves
    ...Array.from({ length: 9 }, (_, i) => svg('rect', { x: P.x - 28, y: P.y - 140 + i * 2.6, width: 56, height: 1.1, fill: 'rgba(0,0,0,.32)' })),
    svg('rect', { x: P.x - 28, y: P.y - 142, width: 56, height: 66, rx: 4, fill: 'url(#tt-cyl)', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1 }),
    // black gauge ring with its scale
    svg('rect', { x: P.x - 29, y: P.y - 98, width: 58, height: 13, rx: 2, fill: '#141414' }),
    ...Array.from({ length: 9 }, (_, i) => svg('rect', { x: P.x - 20 + i * 5, y: P.y - 98, width: 1, height: i % 4 ? 4 : 7, fill: 'rgba(255,255,255,.6)' })),
    svg('rect', { x: P.x - 29, y: P.y - 98, width: 58, height: 13, rx: 2, fill: 'url(#tt-cyl)' }),
    // the tube
    svg('rect', { x: P.x - 9, y: P.y - 40, width: 18, height: ARM_LENGTH - 125, rx: 9, fill: 'url(#tt-tube)' }),
    svg('rect', { x: P.x - 9, y: P.y - 40, width: 18, height: ARM_LENGTH - 125, rx: 9, fill: 'url(#tt-cyl)', opacity: '.6' }),
    // the bend that gives the headshell its offset angle
    svg('path', { d: `M${P.x} ${tip - 176} Q${P.x + 3} ${tip - 132} ${P.x + 44} ${tip - 110}`, fill: 'none', stroke: 'url(#tt-tube)', 'stroke-width': 18, 'stroke-linecap': 'round' }),
    svg('path', { d: `M${P.x - 3} ${tip - 176} Q${P.x} ${tip - 136} ${P.x + 40} ${tip - 115}`, fill: 'none', stroke: 'rgba(255,255,255,.45)', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    svg('rect', { x: P.x - 10, y: tip - 186, width: 20, height: 6, rx: 2, fill: 'rgba(0,0,0,.35)' }),
    svg('circle', { cx: P.x, cy: P.y, r: 34, fill: '#161616', stroke: 'rgba(255,255,255,.08)', 'stroke-width': 1.5 }),
    svg('rect', { x: P.x - 46, y: P.y - 11, width: 92, height: 22, rx: 5, fill: 'url(#tt-tube)', stroke: 'rgba(0,0,0,.4)', 'stroke-width': 1.5 }),
    svg('rect', { x: P.x - 46, y: P.y - 11, width: 92, height: 22, rx: 5, fill: 'url(#tt-cyl-v)' }),
    svg('circle', { cx: P.x - 46, cy: P.y, r: 8, fill: 'url(#tt-dome)', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 1.5 }),
    svg('circle', { cx: P.x + 46, cy: P.y, r: 8, fill: 'url(#tt-dome)', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 1.5 }),
    svg('circle', { cx: P.x, cy: P.y, r: 17, fill: 'url(#tt-dome)', stroke: 'rgba(0,0,0,.4)', 'stroke-width': 1.5 }),
    svg('circle', { cx: P.x, cy: P.y, r: 5, fill: 'rgba(0,0,0,.35)' }),
  );
  // headshell and cartridge, angled like a real offset headshell; the stylus is exactly at the tip
  const head = svg('g', { transform: `rotate(22 ${P.x} ${tip})` });
  head.append(
    // collar where the headshell plugs into the arm
    svg('rect', { x: P.x - 12, y: tip - 134, width: 24, height: 28, rx: 5, fill: 'url(#tt-tube)', stroke: 'rgba(0,0,0,.3)', 'stroke-width': 1.5 }),
    svg('rect', { x: P.x - 12, y: tip - 124, width: 24, height: 2.5, fill: 'rgba(0,0,0,.35)' }),
    // finger lift, curving out to the side
    svg('path', { d: `M${P.x + 22} ${tip - 22} C${P.x + 48} ${tip - 26} ${P.x + 62} ${tip - 44} ${P.x + 70} ${tip - 70}`, fill: 'none', stroke: 'url(#tt-tube)', 'stroke-width': 7, 'stroke-linecap': 'round' }),
    svg('circle', { cx: P.x + 70, cy: tip - 72, r: 5.5, fill: 'url(#tt-dome)' }),
    // the headshell plate, tapering toward the front, with a bright chamfer
    svg('path', { d: `M${P.x - 18} ${tip - 108} L${P.x + 18} ${tip - 108} L${P.x + 27} ${tip + 6} Q${P.x + 27} ${tip + 18} ${P.x + 15} ${tip + 18} L${P.x - 15} ${tip + 18} Q${P.x - 27} ${tip + 18} ${P.x - 27} ${tip + 6} Z`,
      fill: 'url(#tt-shell)', stroke: 'url(#tt-tube)', 'stroke-width': 2 }),
    svg('rect', { x: P.x - 13, y: tip - 98, width: 4, height: 28, rx: 2, fill: 'rgba(0,0,0,.6)' }),
    svg('rect', { x: P.x + 9, y: tip - 98, width: 4, height: 28, rx: 2, fill: 'rgba(0,0,0,.6)' }),
    // cartridge: glossy body, gold stripe, two mounting screws
    svg('rect', { x: P.x - 17, y: tip - 66, width: 34, height: 60, rx: 5, fill: 'url(#tt-cart)', stroke: 'rgba(255,255,255,.12)', 'stroke-width': 1 }),
    svg('rect', { x: P.x - 17, y: tip - 18, width: 34, height: 7, fill: '#c9a35a' }),
    svg('circle', { cx: P.x - 10, cy: tip - 55, r: 3.4, fill: 'url(#tt-dome)' }),
    svg('circle', { cx: P.x + 10, cy: tip - 55, r: 3.4, fill: 'url(#tt-dome)' }),
    svg('path', { d: `M${P.x - 12} ${tip - 55} h4 M${P.x + 8} ${tip - 55} h4`, stroke: 'rgba(0,0,0,.6)', 'stroke-width': 1 }),
    // cantilever and the diamond at its tip — exactly where the needle meets the groove
    svg('rect', { x: P.x - 4, y: tip - 8, width: 8, height: 4, rx: 1.5, fill: '#1a1a1a' }),
    svg('path', { d: `M${P.x} ${tip - 5} L${P.x} ${tip}`, stroke: '#d9b66c', 'stroke-width': 1.6, 'stroke-linecap': 'round' }),
    svg('circle', { cx: P.x, cy: tip, r: 2.2, fill: '#ffffff', opacity: '.9' }),
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

export function createTurntable(root, player, { notify = () => {} } = {}) {
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
    <span class="tt-mark" aria-hidden="true"><b>lp</b></span>
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
  side.innerHTML = '<div class="nowplaying" aria-live="off"><p class="np-title"></p><p class="np-artist"></p><p class="np-track"></p></div><div class="volume"><button type="button" class="vol-btn" aria-label="음소거"></button><input class="vol-range" type="range" min="0" max="1" step="0.01" aria-label="음량"></div><p class="deck-hint"></p><ol class="tracklist" aria-label="수록곡"></ol>';
  root.append(tt, side);

  const q = (sel) => tt.querySelector(sel);
  const record = q('.tt-record'), spin = q('.tt-spin'), canvas = q('canvas');
  const playBtn = q('.tt-btn.play'), playCap = playBtn.querySelector('.cap');
  const hint = side.querySelector('.deck-hint');
  const npTitle = side.querySelector('.np-title'), npArtist = side.querySelector('.np-artist'), npTrack = side.querySelector('.np-track');
  const trackList = side.querySelector('.tracklist');
  let listIndex = -1;

  // The album's songs, numbered with their lengths; tapping one cues the needle there.
  function renderTracks(album, durations) {
    trackList.replaceChildren(...album.tracks.map((t, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tl-row';
      b.innerHTML = '<span class="tl-no"></span><span class="tl-title"></span><span class="tl-len"></span>';
      b.children[0].textContent = String(i + 1).padStart(2, '0');
      b.children[1].textContent = t.title;
      b.children[2].textContent = durations[i] > 0 ? fmt(durations[i]) : '';
      b.addEventListener('click', () => { engine.wake(); core.playTrack(i); });
      li.append(b);
      return li;
    }));
    listIndex = -1;
  }

  function markTrack(index, playing) {
    trackList.classList.toggle('spinning', playing);
    if (index === listIndex) return;
    trackList.children[listIndex]?.removeAttribute('aria-current');
    listIndex = index;
    const li = trackList.children[index];
    if (!li) return;
    li.setAttribute('aria-current', 'true');
    // keep the playing song in view inside the list (never scroll the page)
    const top = li.offsetTop, h = trackList.clientHeight;
    if (top < trackList.scrollTop || top + li.offsetHeight > trackList.scrollTop + h) {
      trackList.scrollTo({ top: Math.max(0, top - h / 3), behavior: 'smooth' });
    }
  }

  arm.setAttribute('tabindex', '0');
  arm.setAttribute('role', 'slider');
  arm.setAttribute('aria-label', '톤암');
  arm.setAttribute('aria-valuemin', '0');

  const screen = root.closest('.deck-screen');
  const store = createLookStore();
  const sheen = q('.tt-sheen');
  const tubeStops = armLayer.querySelectorAll('#tt-tube stop'), domeStops = armLayer.querySelectorAll('#tt-dome stop');
  let current = null; // { album, cover, palette, base, look }

  // Everything a look changes besides the record drawing itself.
  function applyLook(c) {
    const { look, palette } = c;
    let colors = deckColors(palette);
    if (look.deck.body !== 'auto') {
      const l = rgbToHsl(...hexToRgb(look.deck.body))[2];
      colors = { body: look.deck.body, bg: deckColors([look.deck.body]).bg, ink: l >= 0.52 ? '#1c1a18' : '#ede7dc' };
    }
    for (const [k, v] of Object.entries({ '--deck-body': colors.body, '--deck-bg': colors.bg, '--deck-ink': colors.ink })) {
      (screen ?? root).style.setProperty(k, v);
    }
    core.setGroove(grooveFor(look));
    // the reflection sits over the grooved part of this record only
    record.classList.toggle('shaped', look.vinyl.shape !== 'round');
    record.style.setProperty('--rec', `${SIZE_FACTOR[look.vinyl.size] * 100}%`);
    const span = SIZE_FACTOR[look.vinyl.size] * INSCRIBED[look.vinyl.shape];
    sheen.style.setProperty('--span', `${span * 100}%`);
    sheen.style.setProperty('--hole', `${(look.label.size / INSCRIBED[look.vinyl.shape]) * 100}%`);
    // gloss 0–0.6 fades the reflection in, 0.6–1 makes it brighter
    sheen.style.opacity = String(Math.min(1, look.finish.gloss / 0.6));
    sheen.style.filter = `brightness(${1 + Math.max(0, look.finish.gloss - 0.6) * 2.5})`;
    const metal = ARM_METAL[look.deck.arm];
    tubeStops.forEach((st, i) => st.setAttribute('stop-color', metal.tube[i]));
    domeStops.forEach((st, i) => st.setAttribute('stop-color', metal.dome[i]));
  }

  let saveTimer = 0, drawQueued = false;
  function lookChanged(look) {
    current.look = look;
    current.design = designFor(current.album, current.cover, look, current.palette);
    applyLook(current);
    if (!drawQueued) {
      drawQueued = true;
      requestAnimationFrame(() => {
        drawQueued = false;
        if (current && lastDraw) draw(current.album, current.cover, current.design, lastDraw[3]);
      });
    }
    clearTimeout(saveTimer);
    const { album, base } = current;
    saveTimer = setTimeout(() => store.save(album.id, lookDiff(look, base)), 200);
  }

  const customizer = createCustomizer(screen ?? root, {
    change: lookChanged,
    reset() {
      if (!current) return;
      store.clear(current.album.id);
      lookChanged(current.base);
      clearTimeout(saveTimer);
      store.clear(current.album.id);
      customizer.refresh(current.base);
    },
    copy: () => albumJsonSnippet(current.album, current.look, normalizeLook({})),
    notify,
  });

  const core = createDeckCore(player, {
    setHint(text) { hint.textContent = text; hint.hidden = !text; },
    async loadArt(album) {
      const cover = await loadCover(album.cover);
      const palette = coverPalette(cover);
      const base = defaultLook(album, palette, !!cover);
      const look = mergeLook(base, store.load(album.id));
      const design = designFor(album, cover, look, palette);
      const apply = () => {
        current = { album, cover, palette, base, look, design };
        applyLook(current);
        customizer.attach({ album, look, palette, available: store.available });
      };
      return { cover, design, apply };
    },
    // once tweaked, draw the current look even when deck-core redraws with the one it loaded
    drawVinyl: (album, cover, design, durations) => draw(album, cover, current?.album === album ? current.design : design, durations),
  });
  const s = core.state;

  // ---- tonearm dragging ----
  function pointerAngle(e) {
    const m = armLayer.getScreenCTM();
    if (!m) return s.angle;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return clampAngle((Math.atan2(p.y - PIVOT.y, p.x - PIVOT.x) * 180) / Math.PI, core.maxAngle());
  }
  grab.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { grab.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
    core.startDrag();
  });
  grab.addEventListener('pointermove', (e) => core.dragTo(pointerAngle(e)));
  grab.addEventListener('pointerup', () => core.endDrag());
  grab.addEventListener('pointercancel', () => core.endDrag());

  // ---- spinning the record by hand (scratching) ----
  const engine = createScratchEngine();

  // ---- volume: the music and the scratch sound together, remembered on this device ----
  const volBox = side.querySelector('.volume'), volBtn = side.querySelector('.vol-btn'), volRange = side.querySelector('.vol-range');
  const speaker = (waves) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/>${waves}</svg>`;
  const ICON_ON = speaker('<path d="M15.5 9a4.2 4.2 0 010 6M18 6.5a7.8 7.8 0 010 11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>');
  const ICON_OFF = speaker('<path d="M16 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>');
  let volume = 1, beforeMute = 1;
  try { const v = Number(localStorage.getItem('lp:volume')); if (localStorage.getItem('lp:volume') != null && v >= 0 && v <= 1) volume = v; } catch { /* storage blocked */ }
  function setVolume(v, save = true) {
    volume = Math.min(1, Math.max(0, v));
    player.audio.volume = volume;
    engine.setVolume(volume);
    volRange.value = String(volume);
    volRange.style.setProperty('--v', `${volume * 100}%`);
    volBtn.innerHTML = volume === 0 ? ICON_OFF : ICON_ON;
    volBtn.setAttribute('aria-label', volume === 0 ? '소리 켜기' : '음소거');
    if (save) try { localStorage.setItem('lp:volume', String(volume)); } catch { /* storage blocked */ }
  }
  volRange.addEventListener('input', () => setVolume(Number(volRange.value)));
  volBtn.addEventListener('click', () => {
    if (volume > 0) { beforeMute = volume; setVolume(0); } else setVolume(beforeMute || 1);
  });
  setVolume(volume, false);
  // iPhone and iPad only take volume from the side buttons: a page can't set it there
  const probe = new Audio();
  probe.volume = 0.5;
  volBox.hidden = probe.volume !== 0.5;
  const GRAB_DEG = 3; // a tap is not a scratch: the record must actually move first
  let touch = null;   // finger on the record, not yet turning it
  let sc = null;      // { lastAngle, rotation, vel, lastT, trackStart, pos, dur, ready, idle, index }
  let releasing = null; // the last scratch while its sound fades out, so a quick re-grab carries on
  const angleAt = (e) => {
    const r = record.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  const clampPos = (p, dur) => Math.max(0, Math.min(dur, p));

  record.addEventListener('pointerdown', (e) => {
    if (!s.album || s.phase !== 'loaded' || sc || touch) return;
    const r = record.getBoundingClientRect();
    const half = r.width / 2;
    const dist = Math.hypot(e.clientX - (r.left + half), e.clientY - (r.top + half));
    if (dist > half * SIZE_FACTOR[current?.look.vinyl.size ?? 12]) return; // the mat, not the record
    if (dist < half * 0.12) return; // at the spindle a tiny move is a huge angle
    e.preventDefault();
    try { record.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    engine.wake();
    touch = { angle: angleAt(e), moved: 0 };
  });

  function beginScratch() {
    const t = touch;
    touch = null;
    // carry on from a scratch whose sound is still fading out, else from where the music is
    const from = releasing;
    releasing = null;
    let index, trackStart, pos, dur;
    if (from) {
      ({ index, trackStart, dur } = from);
      pos = from.pos;
    } else {
      const loc = locate(player.durations, player.time);
      index = loc.index;
      trackStart = startOf(player.durations, index);
      pos = loc.offset;
      dur = player.durations[index] || 0;
    }
    const mine = { lastAngle: t.angle, rotation: s.rotation, vel: 0, lastT: performance.now(), trackStart, pos, dur, index, ready: false, idle: 0 };
    sc = mine;
    if (!from) core.startScratch();
    core.scratchTo(mine.rotation, trackStart + pos);
    record.classList.add('scratching');
    if (s.needleDown && engine.supported && dur > 0) {
      // decoding takes a moment the first time; the record turns meanwhile and sound joins in
      engine.prepare(s.album.tracks[index].src, pos, dur).then((ok) => {
        if (!ok || sc !== mine) return;
        mine.ready = true;
        engine.start(mine.pos);
        engine.setRate(rateFromVelocity(mine.vel, s.rpm));
      });
    }
  }

  record.addEventListener('pointermove', (e) => {
    if (touch) {
      touch.moved += Math.abs(unwrapDelta(touch.angle, angleAt(e)));
      if (touch.moved < GRAB_DEG) return;
      beginScratch();
    }
    if (!sc) return;
    const now = performance.now();
    const a = angleAt(e);
    const d = unwrapDelta(sc.lastAngle, a);
    const dt = Math.max(0.001, (now - sc.lastT) / 1000);
    sc.lastAngle = a;
    sc.lastT = now;
    sc.rotation += d;
    sc.vel = smoothVelocity(sc.vel, d / dt, dt);
    const rate = s.needleDown ? rateFromVelocity(sc.vel, s.rpm) : 0;
    if (sc.ready) engine.setRate(rate);
    else sc.pos = clampPos(sc.pos + rate * dt, sc.dur);
    core.scratchTo(sc.rotation, sc.trackStart + sc.pos);
    // a hand that stops moving stops the sound
    clearTimeout(sc.idle);
    const held = sc;
    sc.idle = setTimeout(() => { if (sc === held) { held.vel = 0; if (held.ready) engine.setRate(0); } }, 80);
  });

  engine.onPosition((sec) => {
    if (!sc?.ready) return;
    sc.pos = clampPos(sec, sc.dur);
    core.scratchTo(sc.rotation, sc.trackStart + sc.pos);
  });

  async function releaseRecord() {
    engine.wake(); // iOS unlocks audio when a touch ends
    if (touch) { touch = null; return; } // just a tap: the music never stopped
    if (!sc) return;
    const done = sc;
    sc = null;
    clearTimeout(done.idle);
    record.classList.remove('scratching');
    releasing = done;
    const pos = done.ready ? await engine.stop() : done.pos;
    if (releasing !== done) return; // grabbed again while fading out: that scratch carries on
    releasing = null;
    core.endScratch(done.trackStart + clampPos(pos, done.dur));
  }
  record.addEventListener('pointerup', releaseRecord);
  record.addEventListener('pointercancel', releaseRecord);

  // leaving the record mid-scratch (eject, another album): drop the grab and its sound
  function dropGrab() {
    if (sc) clearTimeout(sc.idle);
    touch = null;
    sc = null;
    releasing = null;
    record.classList.remove('scratching');
    engine.stop();
  }

  // ---- keys ----
  playBtn.addEventListener('click', () => { engine.wake(); core.togglePlay(); });
  q('.tt-btn.prev').addEventListener('click', () => core.skip(-1));
  q('.tt-btn.next').addEventListener('click', () => core.skip(1));
  for (const b of tt.querySelectorAll('.tt-speed button')) b.addEventListener('click', () => core.setRpm(Number(b.dataset.rpm)));
  let active = true;
  bindDeckKeys(core, () => active);

  // ---- frame loop ----
  let last = performance.now();
  let lastText = 0;
  let lastPlaying = null;
  const playingListeners = new Set();
  function frame(now) {
    // the core keeps running on the crate screen so the record plays on
    core.tick((now - last) / 1000, now);
    const playing = s.album && s.motorOn && s.needleDown && !s.ended ? s.album : null;
    if (playing !== lastPlaying) { lastPlaying = playing; for (const fn of playingListeners) fn(playing); }
    if (active) {
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
    markTrack(i.index, s.motorOn && i.index >= 0);
    arm.setAttribute('aria-valuemax', String(i.ariaMax));
    arm.setAttribute('aria-valuenow', String(i.ariaNow));
    arm.setAttribute('aria-valuetext', i.ariaText);
  }
  core.onChange(updateText);

  // Draw the record at the size it is shown, so grooves don't alias into stripes on phones.
  let lastDraw = null;
  function draw(album, cover, design, durations) {
    if (!lastDraw || lastDraw[0] !== album || lastDraw[3] !== durations) renderTracks(album, durations);
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
    mount(album) {
      dropGrab();
      return core.mount(album);
    },
    eject() {
      dropGrab();
      current = null;
      customizer.detach();
      trackList.replaceChildren();
      lastDraw = null;
      core.eject();
    },
    remotePlay: core.remotePlay,
    remotePause: core.remotePause,
    skip: (delta) => core.skip(delta, false), // lock screen: no animation frames to move the arm
    setVisible(on) { active = on; },
    onPlaying(fn) { playingListeners.add(fn); },
  };
}

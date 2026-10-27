// The first screen: record sleeves in a cover flow. Flip through them and pull one out.
import { clampIndex, stepFromWheel, stepFromSwipe, coverflowTransform, createWheelGate } from './crate-math.js';

const PICK_MS = 420;
const WHEEL_GAP_MS = 250;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const chevron = (d) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function createCrate(root, albums, { onPick }) {
  root.replaceChildren();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (albums.length === 0) {
    const empty = el('div', 'crate-empty');
    empty.append(
      el('p', null, 'albums/ 폴더에 앨범을 넣어주세요.'),
      el('p', 'crate-empty-hint', '앨범마다 폴더 하나에 cover.jpg와 노래 파일을 넣고 푸시하면 여기에 꽂혀요.'),
    );
    root.append(empty);
    return { show() {}, hide() {}, focusAlbum() {}, setTint() {}, element: empty };
  }

  const stage = el('div', 'crate-stage');
  const prev = el('button', 'crate-nav prev');
  prev.type = 'button';
  prev.setAttribute('aria-label', '이전 레코드');
  prev.innerHTML = chevron('M15 5l-7 7 7 7');
  const next = el('button', 'crate-nav next');
  next.type = 'button';
  next.setAttribute('aria-label', '다음 레코드');
  next.innerHTML = chevron('M9 5l7 7-7 7');

  const box = el('div', 'coverflow');
  box.setAttribute('role', 'listbox');
  box.setAttribute('aria-label', '레코드');
  box.tabIndex = 0;
  const list = box;

  const caption = el('div', 'crate-caption');
  caption.setAttribute('aria-live', 'polite');
  const capTitle = el('h2', 'crate-album');
  const capMeta = el('p', 'crate-meta');
  caption.append(capTitle, capMeta);

  stage.append(box, prev, next);
  root.append(stage, caption);

  const cards = albums.map((album, i) => {
    const card = el('div', 'sleeve-card');
    card.setAttribute('role', 'option');
    card.id = `sleeve-${i}`;
    card.setAttribute('aria-label', `${album.title}${album.artist ? `, ${album.artist}` : ''}`);
    const disc = el('span', 'sleeve-disc');
    const jacket = el('span', 'jacket');
    if (album.cover) {
      const img = el('img');
      img.src = album.cover;
      img.alt = '';
      img.decoding = 'async';
      img.onerror = () => { img.remove(); jacket.append(el('span', 'jacket-plain', album.title)); };
      jacket.append(img);
    } else {
      jacket.append(el('span', 'jacket-plain', album.title));
    }
    card.append(disc, jacket);
    card.addEventListener('click', () => {
      if (moved) return;
      if (i === index) pick();
      else go(i);
    });
    list.append(card);
    return card;
  });

  let index = 0;
  let picking = false;

  function layout() {
    const size = cards[0].offsetWidth || 300;
    cards.forEach((card, i) => {
      const t = coverflowTransform(i - index, size);
      card.style.transform = `translate3d(${t.x}px, 0, ${t.z}px) rotateY(${t.rotY}deg)`;
      card.style.opacity = t.opacity;
      card.style.zIndex = String(t.zIndex);
      card.style.pointerEvents = t.opacity ? '' : 'none';
      const on = i === index;
      card.classList.toggle('is-front', on);
      card.setAttribute('aria-selected', String(on));
    });
    list.setAttribute('aria-activedescendant', cards[index].id);
    const a = albums[index];
    capTitle.textContent = a.title;
    capMeta.textContent = [a.artist, `${a.tracks.length}곡`].filter(Boolean).join(' · ');
    prev.disabled = index === 0;
    next.disabled = index === albums.length - 1;
  }

  function bump(dir) {
    if (reduced) return;
    box.classList.remove('bump-start', 'bump-end');
    void box.offsetWidth; // restart the animation
    box.classList.add(dir < 0 ? 'bump-start' : 'bump-end');
  }

  function step(delta) {
    if (!delta || picking) return;
    const to = clampIndex(index + delta, albums.length);
    if (to === index) return bump(delta);
    index = to;
    layout();
  }

  function go(i) {
    if (picking) return;
    index = clampIndex(i, albums.length);
    layout();
  }

  function pick() {
    if (picking) return;
    picking = true;
    const card = cards[index];
    card.classList.add('picking');
    setTimeout(() => {
      onPick(albums[index], card);
      picking = false;
    }, reduced ? 0 : PICK_MS);
  }

  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));

  // one sleeve per wheel gesture, however many events a trackpad fires
  const wheelGate = createWheelGate(WHEEL_GAP_MS);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const d = stepFromWheel(Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
    if (wheelGate(performance.now()) && d) step(d);
  }, { passive: false });

  let start = null;
  let moved = false;
  stage.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY }; moved = false; });
  stage.addEventListener('pointermove', (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) moved = true;
  });
  stage.addEventListener('pointerup', (e) => {
    if (!start) return;
    const d = stepFromSwipe(e.clientX - start.x, e.clientY - start.y);
    start = null;
    if (d) step(d);
    setTimeout(() => { moved = false; }, 0); // let the click that follows a swipe be ignored
  });
  stage.addEventListener('pointercancel', () => { start = null; });

  let active = true;
  document.addEventListener('keydown', (e) => {
    if (!active || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if ((e.key === 'Enter' || e.code === 'Space') && !e.target.closest?.('button, a')) { e.preventDefault(); pick(); }
  });

  layout();
  addEventListener('resize', layout);

  return {
    element: stage,
    show() {
      active = true;
      for (const c of cards) c.classList.remove('picking');
      layout();
    },
    hide() { active = false; },
    focusAlbum(id) {
      const i = albums.findIndex((a) => a.id === id);
      if (i >= 0) go(i);
    },
    setTint(id, color) {
      const i = albums.findIndex((a) => a.id === id);
      if (i >= 0) cards[i].style.setProperty('--vinyl-label', color);
    },
  };
}

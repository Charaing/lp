// The "꾸미기" panel: change how the record on the platter looks, live.
// It only edits a look object; the deck draws it, saves it and copies the album.json code.
import { STYLES, SHAPES, ARMS, mergeLook } from './look.js';
import { renderSwatch, renderShapeIcon } from './vinyl.js';

const PRESETS = ['#111111', '#f5f1e8', '#d63a2f', '#f28c28', '#f4c531', '#2f9e6e', '#2f6bd6', '#7b4bd6'];
const STYLE_NAMES = { black: '검정', solid: '단색', translucent: '반투명', marble: '마블', splatter: '스플래터', gradient: '그라데이션', half: '반반', glitter: '글리터', picture: '픽처 디스크' };
const SHAPE_NAMES = { round: '원', heart: '하트', star: '별', hexagon: '육각형', flower: '꽃' };
const ARM_NAMES = { silver: '은색', gold: '금색', black: '검정' };
const ARM_SWATCH = { silver: '#c9cccb', gold: '#d7b46a', black: '#222222' };
const TABS = [['pressing', '색·무늬'], ['shape', '모양·크기'], ['label', '라벨'], ['finish', '질감·턴테이블']];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const brush = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M14.5 4.5l5 5-8.2 8.2a3 3 0 01-2.1.9H5.5v-3.7a3 3 0 01.9-2.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 7l5 5" stroke="currentColor" stroke-width="1.8"/></svg>';

// ctx: { album, look, palette, available }; on: { change(look), reset(), copy() }
export function createCustomizer(root, on) {
  const button = el('button', 'customize-btn');
  button.type = 'button';
  button.innerHTML = `${brush}<span>꾸미기</span>`;
  button.setAttribute('aria-expanded', 'false');
  button.hidden = true;

  const panel = el('section', 'customizer');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', 'LP 꾸미기');
  panel.hidden = true;
  panel.innerHTML = `
    <header class="cz-head">
      <h2>LP 꾸미기</h2>
      <button type="button" class="cz-close" aria-label="닫기">✕</button>
    </header>
    <nav class="cz-tabs" role="tablist"></nav>
    <div class="cz-body"></div>
    <p class="cz-note" hidden>이 브라우저에서는 저장되지 않아요</p>
    <textarea class="cz-code" readonly hidden aria-label="album.json에 붙여넣을 코드"></textarea>
    <footer class="cz-foot">
      <button type="button" class="cz-reset">되돌리기</button>
      <button type="button" class="cz-copy">모두에게 적용</button>
    </footer>`;
  root.append(button, panel);

  const tabs = panel.querySelector('.cz-tabs');
  const body = panel.querySelector('.cz-body');
  const code = panel.querySelector('.cz-code');
  let ctx = null;
  let tab = 'pressing';

  for (const [id, name] of TABS) {
    const t = el('button', 'cz-tab', name);
    t.type = 'button';
    t.setAttribute('role', 'tab');
    t.dataset.tab = id;
    t.addEventListener('click', () => { tab = id; render(); });
    tabs.append(t);
  }

  function update(patch, rerender = true) {
    ctx.look = mergeLook(ctx.look, patch);
    on.change(ctx.look);
    if (rerender) render();
  }

  // ---- control builders ----
  function section(title) {
    const s = el('div', 'cz-section');
    s.append(el('h3', null, title));
    body.append(s);
    return s;
  }

  function choice(parent, items, current, pick, cls = '') {
    const row = el('div', `cz-row ${cls}`);
    for (const it of items) {
      const b = el('button', 'cz-choice');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(it.value === current));
      b.setAttribute('aria-label', it.name);
      if (it.draw) {
        const c = el('canvas');
        c.width = c.height = 96;
        it.draw(c);
        b.append(c);
      }
      if (it.dot) {
        const d = el('span', 'cz-dot');
        d.style.background = it.dot;
        b.append(d);
      }
      b.append(el('span', 'cz-cap', it.name));
      b.addEventListener('click', () => pick(it.value));
      row.append(b);
    }
    parent.append(row);
  }

  function colors(parent, current, pick, extra = []) {
    const row = el('div', 'cz-row cz-colors');
    const list = [...extra, ...ctx.palette.slice(0, 5), ...PRESETS].filter((c, i, a) => c && a.indexOf(c) === i);
    for (const c of list) {
      const b = el('button', 'cz-swatch');
      b.type = 'button';
      b.style.background = c;
      b.setAttribute('aria-label', c);
      b.setAttribute('aria-pressed', String(c?.toLowerCase() === current?.toLowerCase()));
      b.addEventListener('click', () => pick(c));
      row.append(b);
    }
    const pickWrap = el('label', 'cz-swatch cz-picker');
    pickWrap.title = '직접 고르기';
    const input = el('input');
    input.type = 'color';
    input.value = /^#[0-9a-f]{6}$/i.test(current ?? '') ? current : '#888888';
    input.setAttribute('aria-label', '직접 고르기');
    input.addEventListener('change', () => pick(input.value));
    pickWrap.append(input);
    row.append(pickWrap);
    parent.append(row);
  }

  function slider(parent, name, value, min, max, step, set) {
    const wrap = el('label', 'cz-slider');
    wrap.append(el('span', null, name));
    const input = el('input');
    input.type = 'range';
    input.min = min; input.max = max; input.step = step; input.value = value;
    input.addEventListener('input', () => set(Number(input.value)));
    wrap.append(input);
    parent.append(wrap);
  }

  function toggle(parent, name, value, set) {
    const wrap = el('label', 'cz-toggle');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => set(input.checked));
    wrap.append(input, el('span', null, name));
    parent.append(wrap);
  }

  // ---- tabs ----
  function render() {
    for (const t of tabs.children) {
      const on = t.dataset.tab === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    body.replaceChildren();
    const lk = ctx.look, v = lk.vinyl;
    const base = v.color ?? ctx.palette[0] ?? '#c0392b';
    const accent = v.accent ?? ctx.palette[1] ?? '#f5d76e';

    if (tab === 'pressing') {
      choice(section('무늬'), STYLES.map((s) => ({ value: s, name: STYLE_NAMES[s], draw: (c) => renderSwatch(c, s, base, accent) })), v.style,
        (style) => update({ vinyl: { style, color: style === 'black' ? v.color : base } }), 'cz-styles');
      colors(section('바이닐 색'), v.color, (color) => update({ vinyl: { color, style: v.style === 'black' ? 'solid' : v.style } }));
      colors(section('무늬 보조색'), v.accent, (a) => update({ vinyl: { accent: a } }));
    } else if (tab === 'shape') {
      choice(section('모양'), SHAPES.map((s) => ({ value: s, name: SHAPE_NAMES[s], draw: (c) => renderShapeIcon(c, s, '#e8e1d4') })), v.shape,
        (shape) => update({ vinyl: { shape } }), 'cz-shapes');
      choice(section('크기'), [7, 10, 12].map((n) => ({ value: n, name: `${n}인치` })), v.size, (size) => update({ vinyl: { size } }), 'cz-seg');
    } else if (tab === 'label') {
      const l = lk.label;
      choice(section('라벨'), [['cover', '앨범 표지'], ['color', '단색'], ['text', '글자']].map(([value, name]) => ({ value, name })), l.mode,
        (mode) => update({ label: { mode } }), 'cz-seg');
      // the largest label this shape and size allow, so the slider never moves without effect
      const maxLabel = mergeLook(lk, { label: { size: 0.45 } }).label.size;
      slider(section('라벨 크기'), '작게 ↔ 크게', l.size, 0.25, maxLabel, 0.005, (size) => update({ label: { size } }, false));
      colors(section('라벨 색'), l.color, (color) => update({ label: { color } }));
      colors(section('라벨 글자색'), l.text, (text) => update({ label: { text } }), ['#ffffff', '#111111']);
      const opts = section('표시');
      toggle(opts, '제목·아티스트 표시', l.showTitle, (showTitle) => update({ label: { showTitle } }));
      toggle(opts, '라벨 테두리', l.ring, (ring) => update({ label: { ring } }));
    } else {
      const s = section('질감');
      slider(s, '홈 선명도', lk.finish.grooves, 0, 1, 0.05, (grooves) => update({ finish: { grooves } }, false));
      slider(s, '광택', lk.finish.gloss, 0, 1, 0.05, (gloss) => update({ finish: { gloss } }, false));
      const body2 = section('턴테이블 색');
      const auto = el('button', 'cz-choice cz-auto', '자동 (표지 색)');
      auto.type = 'button';
      auto.setAttribute('aria-pressed', String(lk.deck.body === 'auto'));
      auto.addEventListener('click', () => update({ deck: { body: 'auto' } }));
      body2.append(auto);
      colors(body2, lk.deck.body === 'auto' ? null : lk.deck.body, (body) => update({ deck: { body } }));
      choice(section('톤암'), ARMS.map((a) => ({ value: a, name: ARM_NAMES[a], dot: ARM_SWATCH[a] })), lk.deck.arm,
        (arm) => update({ deck: { arm } }), 'cz-seg');
    }
  }

  function open() {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.body.classList.add('customizing');
    render();
    tabs.querySelector('[aria-selected="true"]')?.focus();
  }

  function close() {
    const wasOpen = !panel.hidden;
    panel.hidden = true;
    if (wasOpen && panel.contains(document.activeElement)) button.focus();
    code.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('customizing');
  }

  button.addEventListener('click', () => (panel.hidden ? open() : close()));
  panel.querySelector('.cz-close').addEventListener('click', close);
  panel.querySelector('.cz-reset').addEventListener('click', () => { on.reset(); });
  panel.querySelector('.cz-copy').addEventListener('click', async () => {
    const text = on.copy();
    try {
      await navigator.clipboard.writeText(text);
      on.notify('album.json에 붙여넣을 코드를 복사했어요');
    } catch {
      code.value = text;
      code.hidden = false;
      code.focus();
      code.select();
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target) && !e.target.closest?.('.tt')) close();
  });

  return {
    // show the button for the record now on the platter
    attach(next) {
      ctx = next;
      button.hidden = false;
      panel.querySelector('.cz-note').hidden = next.available;
      if (!panel.hidden) render();
    },
    detach() {
      ctx = null;
      button.hidden = true;
      close();
    },
    refresh(look) {
      if (!ctx) return;
      ctx.look = look;
      if (!panel.hidden) render();
    },
    isOpen: () => !panel.hidden,
    close,
  };
}

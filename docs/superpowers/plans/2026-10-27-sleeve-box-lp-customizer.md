# 입체 앨범 재킷 + LP 꾸미기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 커버플로우 재킷을 두께·비닐 래핑이 있는 입체 상자로 만들고, 턴테이블 화면에 LP 꾸미기(무늬 9·모양 5·크기 3·라벨·질감·턴테이블 색)를 넣는다.

**Architecture:** 꾸미기 값(look)은 순수 모듈 `look.js`가 검증·병합·차이·코드화를 맡고, 브라우저 저장은 `look-store.js`, 패널 UI는 `customizer.js`. 홈 위치 계산은 `grooveFor(look)` 결과를 `timeline`/`arm`/`deck-core`에 인자로 넘겨 크기·모양을 반영한다. 재킷은 CSS 3D 면 조합, 끌기 따라가기는 `coverflowTransform`의 소수 offset 보간.

**Tech Stack:** 바닐라 JS ES 모듈, Canvas 2D, CSS 3D, `localStorage`, Clipboard API, Node 22 `node:test`, 헤드리스 Edge(CDP).

**Spec:** `docs/superpowers/specs/2026-10-27-sleeve-box-lp-customizer-design.md`

## Global Constraints

- npm 의존성 0개. 빌드 도구 없음.
- 허용 값: style `black solid translucent marble splatter gradient half glitter picture`; shape `round heart star hexagon flower`; size `7 10 12`; label.mode `cover color text`; arm `silver gold black`; 색은 `#rrggbb`.
- 기본값: shape `round`, size `12`, label.size `0.36`, ring `true`, showTitle `false`, grooves `0.5`, gloss `0.6`, deck.body `auto`, arm `silver`. style 기본 = color 있으면 `solid` 아니면 `black`. label.mode 기본 = 표지 있으면 `cover` 아니면 `text`.
- 범위: label.size 0.25–0.45 그리고 ≤ 내접비율 × 0.7; grooves·gloss 0–1.
- 크기 비율 {12: 1, 10: 0.83, 7: 0.58}; 내접 비율 {round 1, hexagon 0.866, flower 0.8, heart 0.7, star 0.55}.
- `grooveFor`: `outer = 0.96 × size × inscribed`, `inner = (label.size + 0.04) × size`; `outer − inner < 0.12`이면 normalize에서 label.size를 줄여 맞춤(하한 0.25).
- 합치기 순서: 기본값 ← album.json ← 이 기기 저장값.
- 저장 키 `lp:look:<album.id>`, 값 = `lookDiff` JSON, 200ms 디바운스, try/catch.
- 기존 `album.json`의 `vinyl.style/color/accent`, `label.color/text`, `rpm` 하위 호환.
- CRLF 파일(`js/turntable.js`는 LF로 새로 씀, `js/player.js`, `README.md` 등)은 기존 줄바꿈 유지.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 7인치·별 모양에서 바늘을 놓으면 그 자리 곡이 처음부터, 레코드 밖(매트 위)에 놓으면 거치대로 — Task 2 테스트.
2. 저장값이 깨졌거나 예전 형식(옛 `label.text` 색 등)이어도 화면이 깨지지 않고 기본값으로 — Task 1·4 테스트.
3. 사생활 보호 모드처럼 `localStorage`가 예외를 던질 때 꾸미기가 계속 동작 — Task 4 테스트.
4. 코드 복사로 나온 JSON을 `album.json`에 넣고 빌드하면 같은 look이 나와야 함(왕복) — Task 3 테스트.
5. 끌기 중 화면 끝(첫/마지막 재킷 너머)으로 당겨도 재킷이 사라지거나 순서가 꼬이지 않음 — Task 6 테스트(소수 offset clamp).

---

## File Map

| 파일 | 책임 |
|---|---|
| `js/look.js` (신규) | look 검증·기본값·병합·차이·코드·`grooveFor`·상수 |
| `js/look-store.js` (신규) | 앨범별 브라우저 저장 |
| `js/timeline.js`, `js/arm.js`, `js/deck-core.js` | groove 인자 반영 |
| `scripts/build-manifest.mjs` | album.json 꾸미기 값 검증 |
| `js/vinyl.js` | 크기·모양·새 무늬·라벨 모드·홈 진하기 |
| `js/customizer.js` (신규) | 꾸미기 패널 |
| `js/turntable.js` | look 적용(그리기·광택·톤암·몸체 색), 패널 연결 |
| `js/crate-math.js`, `js/crate.js`, `css/style.css` | 입체 재킷, 끌기 따라가기 |

---

### Task 1: look 모듈

**Files:** Create `js/look.js`; Test `tests/look.test.mjs`

**Interfaces:**
- Produces: `STYLES, SHAPES, SIZES, ARMS, SIZE_FACTOR, INSCRIBED`; `normalizeLook(raw) → Look`; `defaultLook(album, palette: string[], hasCover: boolean) → Look`; `mergeLook(...layers) → Look`; `lookDiff(look, base) → object`; `albumJsonSnippet(album, look, base) → string`; `grooveFor(look) → { outer, inner }`.
- `Look = { vinyl: { style, color, accent, shape, size }, label: { mode, size, color, text, showTitle, ring }, finish: { grooves, gloss }, deck: { body, arm } }` (색이 없으면 `null`).

- [ ] **Step 1: 실패 테스트**

```js
test('normalizeLook drops unknown values and clamps numbers', () => {
  const l = normalizeLook({ vinyl: { style: 'glitter', shape: 'moon', size: 9, color: 'red' }, label: { size: 2 }, finish: { grooves: -1, gloss: 3 }, deck: { arm: 'pink', body: '#ABCDEF' } });
  assert.equal(l.vinyl.style, 'glitter'); assert.equal(l.vinyl.shape, 'round'); assert.equal(l.vinyl.size, 12);
  assert.equal(l.vinyl.color, null); assert.equal(l.label.size, 0.45);
  assert.equal(l.finish.grooves, 0); assert.equal(l.finish.gloss, 1);
  assert.equal(l.deck.arm, 'silver'); assert.equal(l.deck.body, '#ABCDEF');
});
test('label size is capped by the shape', () => {
  assert.ok(Math.abs(normalizeLook({ vinyl: { shape: 'star' }, label: { size: 0.45 } }).label.size - 0.385) < 1e-9);
});
test('the groove band never gets narrower than 0.12', () => {
  const l = normalizeLook({ vinyl: { shape: 'star', size: 7 }, label: { size: 0.36 } });
  const g = grooveFor(l);
  assert.ok(g.outer - g.inner >= 0.12 - 1e-9); assert.ok(l.label.size >= 0.25);
});
test('grooveFor: a 12-inch round record keeps the old groove', () => {
  const g = grooveFor(normalizeLook({}));
  assert.ok(Math.abs(g.outer - 0.96) < 1e-9 && Math.abs(g.inner - 0.40) < 1e-9);
});
test('defaultLook: black unless a colour is given; cover label only with a cover', () => {
  assert.equal(defaultLook({}, ['#ff0000'], true).vinyl.style, 'black');
  assert.equal(defaultLook({ vinyl: { color: '#3a7bd5' } }, [], false).vinyl.style, 'solid');
  assert.equal(defaultLook({}, [], false).label.mode, 'text');
  assert.equal(defaultLook({}, ['#ff0000', '#00ff00'], true).vinyl.accent, '#00ff00');
});
test('mergeLook: later layers win, unknown keys in later layers are ignored', () => {
  const m = mergeLook({ vinyl: { style: 'black', size: 12 } }, { vinyl: { style: 'marble' } }, { vinyl: { size: 7, shape: 'moon' } });
  assert.equal(m.vinyl.style, 'marble'); assert.equal(m.vinyl.size, 7); assert.equal(m.vinyl.shape, 'round');
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
```

- [ ] **Step 2:** `npm test` → FAIL (module not found)
- [ ] **Step 3:** `js/look.js` 구현 (팔레트 색은 `deckColors`와 무관; `text` 기본 = `null`, 그릴 때 대비 자동)
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `feat: LP 꾸미기 값 검증·병합(look.js)`

---

### Task 2: 크기·모양에 맞춘 홈 위치

**Files:** Modify `js/timeline.js`, `js/arm.js`, `js/deck-core.js`; Test `tests/timeline.test.mjs`, `tests/arm.test.mjs`, `tests/deck-core.test.mjs`

**Interfaces:**
- Consumes: `grooveFor` (Task 1)
- Produces: `radiusToTime(r, total, groove = GROOVE)`, `timeToRadius(t, total, groove = GROOVE)`, `gapRadii(durations, groove = GROOVE)`; `clampAngle(deg, max = ARM.max)`; `core.setGroove({ outer, inner })`, `core.state.groove`, `core.maxAngle()` (= `angleForRadius(groove.inner − 0.04)`).

- [ ] **Step 1: 실패 테스트**

```js
// timeline
test('radiusToTime and timeToRadius use a given groove', () => {
  const g = { outer: 0.5, inner: 0.2 };
  assert.ok(Math.abs(radiusToTime(0.35, 100, g) - 50) < 1e-9);
  assert.ok(Math.abs(timeToRadius(100, 100, g) - 0.2) < 1e-9);
  assert.equal(gapRadii([50, 50], g).length, 1);
});
// arm
test('clampAngle honours a custom maximum', () => {
  assert.equal(clampAngle(179, 110), 110);
});
// deck-core
test('on a 7-inch record the needle still starts the track under it', async () => {
  const { player, core } = await mounted();
  core.setGroove({ outer: 0.5568, inner: 0.232 });
  core.setMotor(true);
  drop(core, (0.5568 + 0.232) / 2 - 0.01); // a bit past halfway → track 2
  await sleep(450);
  assert.equal(player.time, 10);
});
test('dropping on the mat around a small record sends the arm back to rest', async () => {
  const { core } = await mounted();
  core.setGroove({ outer: 0.5568, inner: 0.232 });
  drop(core, 0.8);
  await sleep(450);
  assert.equal(core.state.needleDown, false);
});
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현(`deck-core`는 `s.groove`를 모든 반경↔시간 계산과 `endDrag`의 레코드 판정 `r <= groove.outer + 0.02`, 바늘 자동 이동 `GROOVE.outer` 자리에 사용) → **Step 4:** PASS
- [ ] **Step 5:** Commit `feat: 크기·모양에 맞춘 홈 위치와 톤암 범위`

---

### Task 3: album.json 꾸미기 값 검증

**Files:** Modify `scripts/build-manifest.mjs`; Test `tests/build-manifest.test.mjs`

**Interfaces:**
- Consumes: `normalizeLook`, `lookDiff` (Task 1)
- Produces: 매니페스트 앨범에 `look: Partial<Look>` (album.json에 적힌 유효한 꾸미기 값만). 기존 `vinyl`, `label` 필드는 유지(하위 호환).

- [ ] **Step 1: 실패 테스트**

```js
test('album.json look values pass through, invalid ones are dropped with a warning', async () => {
  // fixture album.json: { vinyl: { style: 'glitter', shape: 'heart', size: 7, color: '#112233' }, label: { mode: 'text', size: 0.3 }, deck: { arm: 'gold' }, finish: { gloss: 9 } }
  const { albums } = await buildManifest(dir);
  assert.deepEqual(albums[0].look, { vinyl: { style: 'glitter', color: '#112233', shape: 'heart', size: 7 }, label: { mode: 'text', size: 0.3 }, finish: { gloss: 1 }, deck: { arm: 'gold' } });
});
test('a copied snippet round-trips through the build', async () => {
  // write albumJsonSnippet(album, look, normalizeLook({})) as album.json, build, then
  // mergeLook(normalizeLook({}), albums[0].look) deep-equals look
});
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS → **Step 5:** Commit `feat: album.json 꾸미기 값 검증`

---

### Task 4: 브라우저 저장

**Files:** Create `js/look-store.js`; Test `tests/look-store.test.mjs`

**Interfaces:**
- Produces: `createLookStore(storage = globalThis.localStorage) → { load(id): object, save(id, diff), clear(id), available: boolean }` (save는 즉시 저장; 디바운스는 호출 쪽).

- [ ] **Step 1: 실패 테스트** — 가짜 storage(Map 기반) 사용

```js
test('save then load returns the same diff', () => { /* save('a', {vinyl:{shape:'heart'}}) → load('a') deep-equals */ });
test('a broken saved value is ignored and removed', () => { /* storage['lp:look:a'] = '{oops' → load('a') = {} and key gone */ });
test('a storage that throws makes the store unavailable but never throws', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const s = createLookStore(bad);
  assert.equal(s.available, false); assert.deepEqual(s.load('a'), {}); s.save('a', {}); s.clear('a');
});
test('missing storage (Node) is unavailable', () => { assert.equal(createLookStore(undefined).available, false); });
```

- [ ] **Step 2–4:** FAIL → 구현(`available`은 생성 시 `setItem/removeItem` 시험) → PASS
- [ ] **Step 5:** Commit `feat: 앨범별 꾸미기 브라우저 저장`

---

### Task 5: LP 그리기 확장 + 꾸미기 패널 + 덱 연결

**Files:** Modify `js/vinyl.js`, `js/turntable.js`, `css/style.css`; Create `js/customizer.js`

**Interfaces:**
- Consumes: Task 1–4.
- Produces:
  - `designFor(album, cover, look)` → 기존 design + `{ look }`; `renderVinyl(canvas, album, design, cover, durations)`가 `design.look`으로 크기·모양·무늬·라벨·홈 진하기를 그림. `renderSwatch(canvas, style, color, accent)`(48px 무늬 미리보기).
  - `createCustomizer(root, { getLook, getBase, getPalette, onChange(look), onReset(), onCopy() }) → { open(), close(), isOpen(), refresh() }`.
  - 덱: 앨범 mount 시 `look = mergeLook(defaultLook(...), album.look, store.load(id))` → `core.setGroove(grooveFor(look))`, `--gloss`(sheen opacity = gloss × 1.4), 톤암 색 묶음(silver/gold/black 그라데이션 stop 교체), 몸체 색(`deck.body` 또는 `deckColors`). 패널 변경 → 60ms 안에 다시 그림, 200ms 디바운스로 `store.save(id, lookDiff(look, base))`. 되돌리기 → `store.clear` 후 base로. 모두에게 적용 → `navigator.clipboard.writeText(albumJsonSnippet(...))`, 실패 시 선택된 `<textarea>`.
- 모양 경로: heart(두 원호 + 아래 꼭짓점), star(5꼭지, 안쪽 반지름 0.55), hexagon, flower(꽃잎 8개, 안쪽 0.8) — 모두 레코드 반지름 기준. 새 무늬: gradient(conic, color→accent→color), half(45° 직선으로 반반), glitter(seed 점 400개, 반지름 0.4–1.6px·밝기 무작위, accent 색).
- `store.available`이 false면 패널 아래에 "이 브라우저에서는 저장되지 않아요" 한 줄.
- 패널 레이아웃·문구는 스펙 6절 그대로. 휴대폰 시트 높이 60vh, 데스크톱 오른쪽 360px. 버튼 위치: 덱 화면 오른쪽 아래(`right: 16px; bottom: max(16px, safe-area)`), "꾸미기".

- [ ] **Step 1:** vinyl 확장 후 `dev/vinyl.html`로 9무늬 × 5모양 × 3크기 대표 조합 스크린숏 — 각 모양이 맞게 잘리고 홈이 내접원 안에만 있는지, 라벨 모드 3가지 확인
- [ ] **Step 2:** 패널·덱 연결 구현
- [ ] **Step 3:** 실시간 CDP: 꾸미기 열기 → 무늬 glitter·모양 heart·크기 7·라벨 text·톤암 gold 선택 → 새로고침 → 유지 확인 → 7인치 하트에서 바늘 놓아 곡 처음부터 재생 → 되돌리기 → 원래대로 → 코드 복사 내용이 `albumJsonSnippet`과 같음. 콘솔 오류 0.
- [ ] **Step 4:** 스크린숏: 휴대폰 시트·데스크톱 패널 열린 상태
- [ ] **Step 5:** `npm test` PASS, Commit `feat: LP 꾸미기 패널과 모양·크기·새 무늬`

---

### Task 6: 입체 재킷과 끌기 따라가기

**Files:** Modify `js/crate-math.js`, `js/crate.js`, `css/style.css`; Test `tests/crate-math.test.mjs`

**Interfaces:**
- Produces: `coverflowTransform(offset, size)`가 소수 offset을 `floor`/`ceil` 결과의 선형 보간으로(zIndex는 반올림 offset 기준); `clampFloat(f, count)` = 0–count−1 사이로 자름(끝 너머로 당기면 0.25까지만 늘어남: `f < 0 → f * 0.25`, 끝 너머도 같은 비율).

- [ ] **Step 1: 실패 테스트**

```js
test('coverflowTransform interpolates fractional offsets', () => {
  const a = coverflowTransform(0, 300), b = coverflowTransform(1, 300), m = coverflowTransform(0.5, 300);
  assert.ok(Math.abs(m.x - (a.x + b.x) / 2) < 1e-9 && Math.abs(m.rotY - (a.rotY + b.rotY) / 2) < 1e-9);
});
test('pulling past either end only stretches a little', () => {
  assert.equal(clampFloat(-2, 5), -0.5); assert.equal(clampFloat(6, 5), 4.5); assert.equal(clampFloat(2.4, 5), 2.4);
});
```

- [ ] **Step 2–4:** FAIL → 구현 → PASS
- [ ] **Step 5:** `crate.js`·CSS: 재킷을 면 4개(앞·왼·오른·위)의 3D 상자로, 옆면 세로 글자, 비닐 광택(`--tilt` = rotY/58), 주름 결, 입구 절개선, 스티커(연도 또는 "NEW" + "LP"). 포인터 끌기 동안 소수 index로 연속 배치(전환 없음), 놓으면 반올림 index로 스냅(곡선 `cubic-bezier(.2, 1.25, .35, 1)` 0.55s; reduced-motion이면 0.2s 넘침 없음). 탭(10px 미만 이동)은 고르기 유지.
- [ ] **Step 6:** 스크린숏 휴대폰·데스크톱 + CDP 흐름(끌기·스냅·고르기) 확인
- [ ] **Step 7:** Commit `feat: 입체 LP 재킷과 끌기 따라가는 커버플로우`

---

### Task 7: 마무리

- [ ] README에 꾸미기 사용법·album.json 새 항목 표
- [ ] 최종 리뷰(새 리뷰어, Review Focus 포함) → 지적 수정(각각 실패 테스트 먼저)
- [ ] `git pull` → push → Pages 배포 확인 → 실제 사이트 CDP 흐름

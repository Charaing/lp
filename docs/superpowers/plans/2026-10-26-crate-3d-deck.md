# 레코드 크레이트 + 3D 턴테이블 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 화면을 레코드 크레이트(재킷 고르기)로, 메인을 three.js 3D 턴테이블로 바꾸고, 기존 재생·잠금 화면 기능은 그대로 유지한다.

**Architecture:** 턴테이블의 상태 로직(모터·바늘·톤암 각도·재생 동기화)을 렌더러와 분리한 `deck-core.js`로 뽑아 2D(`turntable.js`)와 3D(`deck3d.js`)가 함께 쓴다. 순수 계산(라우팅, 크레이트 넘기기, 3D↔플린스 좌표)은 별도 모듈로 `node --test`에서 검증한다. 크레이트는 CSS 3D, 덱은 three.js 0.170.0을 import map으로 불러온다.

**Tech Stack:** 바닐라 JS ES 모듈, three.js 0.170.0 (jsDelivr), CSS 3D transforms, Node 22 `node:test`, 헤드리스 Edge(CDP) 실시간 확인.

**Spec:** `docs/superpowers/specs/2026-10-26-crate-3d-deck-design.md`

## Global Constraints

- npm 의존성 0개 유지. three.js는 import map으로만: `three` → `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`, `three/addons/` → `https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/`.
- 플린스 좌표계는 `arm.js` 그대로(1200×780, DISC {380,390,330}, PIVOT {850,150}, ARM_LENGTH 560). 월드 단위 1 = 플린스 100, 플린스 중심 = 월드 원점.
- 회전 33⅓ = 200°/s, 45 = 270°/s, 관성 시정수 0.25초. 바늘 내림 지연 350ms. 톤암 들림 0.35(월드), 보간 0.35초.
- 해시 `#<encodeURIComponent(id)>` = 덱 화면, 해시 없음 = 크레이트. 크레이트로 돌아가면 정지.
- 픽셀 비율 `min(devicePixelRatio, 2)`, 그림자 맵 1024, LP 텍스처 1024px.
- 768px 이하 = 휴대폰 배치. `prefers-reduced-motion`이면 전환은 페이드만.
- 기존 동작 유지: 바늘 → 그 곡 처음부터, 런아웃 → 정지, 잠금 화면·다이내믹 아일랜드, 홈 화면 아이콘, 실패 트랙 토스트.
- 파일이 CRLF인 곳(`js/turntable.js`, `js/player.js`, `css/style.css`)은 줄바꿈을 유지한다.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 잠금 화면에서 곡이 넘어간 뒤 앱으로 돌아오면(루프가 멈춰 있던 동안) 3D 톤암이 실제 재생 위치로 바로 가야 함 — Task 4 테스트(`tick`이 숨김 후 큰 dt에도 현재 시간으로 각도 계산).
2. 한글·공백·`#`이 든 앨범 id로 해시 왕복 — Task 1 테스트.
3. 크레이트에서 빠르게 연속 휠/스와이프 → 한 장씩만, 끝에서 멈춤 — Task 2 테스트.
4. 휴대폰 세로·가로 전환 시 3D 화면이 늘어나거나 잘리지 않음 — Task 3 `fitDistance` 테스트 + Task 7 스크린숏.
5. three.js CDN 실패/WebGL 없음 → 2D로 동작 — Task 7 브라우저 확인(`--disable-webgl`).

---

## File Map

| 파일 | 책임 |
|---|---|
| `js/router.js` (신규) | 해시 ↔ 앨범 id |
| `js/crate-math.js` (신규) | 넘기기 인덱스·입력 판정·재킷 변환값 |
| `js/deck-geometry.js` (신규) | 플린스 ↔ 월드 좌표, 카메라 거리, 톤암 들림 곡선 |
| `js/deck-core.js` (신규) | 덱 상태 로직(렌더러 독립) |
| `js/turntable.js` | 2D 렌더러 — `deck-core` 사용으로 정리 |
| `js/crate.js` (신규) | 크레이트 화면 DOM·입력 |
| `js/deck3d.js` (신규) | three.js 씬·재질·루프·조작 |
| `js/main.js` | 앨범 로드, 라우팅, 화면 전환, 3D/2D 선택 |
| `index.html`, `css/style.css` | 두 화면 구조·스타일, import map |
| `js/shelf.js` | 삭제 |

---

### Task 1: 라우터

**Files:** Create `js/router.js`; Test `tests/router.test.mjs`

**Interfaces:**
- Produces: `albumIdFromHash(hash: string): string | null`, `hashForAlbum(id: string): string`

- [ ] **Step 1: 실패 테스트**

```js
test('hashForAlbum and albumIdFromHash round-trip Korean, spaces and #', () => {
  for (const id of ['illmatic', '밤 산책', 'zz broken #1', 'a/b?c']) assert.equal(albumIdFromHash(hashForAlbum(id)), id);
});
test('hashForAlbum starts with #', () => { assert.equal(hashForAlbum('x'), '#x'); });
test('empty or bare hash means the crate', () => {
  assert.equal(albumIdFromHash(''), null); assert.equal(albumIdFromHash('#'), null);
});
test('a malformed escape is treated as no album', () => { assert.equal(albumIdFromHash('#%E0%A4%A'), null); });
```

- [ ] **Step 2:** `npm test` → FAIL (module not found)
- [ ] **Step 3:** 구현 (`decodeURIComponent` try/catch)
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `feat: 해시 라우터`

---

### Task 2: 크레이트 계산

**Files:** Create `js/crate-math.js`; Test `tests/crate-math.test.mjs`

**Interfaces:**
- Produces: `clampIndex(i, count): number`, `stepFromWheel(deltaY): -1|0|1`, `stepFromSwipe(dx, dy, threshold = 40): -1|0|1`, `sleeveTransform(offset): { y, z, rotX, opacity }` (단위: y·z는 px, rotX는 deg)

값: offset 0 → `{ y: 0, z: 0, rotX: -4, opacity: 1 }`; offset k(1..4) → `y = -22k`, `z = -60k`, `rotX = -4 - 9k`, `opacity = 1`; offset > 4 → opacity 0; offset < 0 → `y = 60`, `z = 80`, `rotX = 70`, `opacity = 0` (앞으로 넘어감).

- [ ] **Step 1: 실패 테스트**

```js
test('clampIndex keeps the index in range', () => {
  assert.equal(clampIndex(-1, 5), 0); assert.equal(clampIndex(7, 5), 4); assert.equal(clampIndex(2, 5), 2); assert.equal(clampIndex(0, 0), 0);
});
test('stepFromWheel ignores tiny deltas', () => {
  assert.equal(stepFromWheel(2), 0); assert.equal(stepFromWheel(40), 1); assert.equal(stepFromWheel(-40), -1);
});
test('stepFromSwipe uses the larger axis; left/up = next, right/down = previous', () => {
  assert.equal(stepFromSwipe(-60, 10), 1); assert.equal(stepFromSwipe(60, 5), -1);
  assert.equal(stepFromSwipe(5, -70), 1); assert.equal(stepFromSwipe(3, 70), -1); assert.equal(stepFromSwipe(20, 20), 0);
});
test('sleeveTransform: front sleeve upright, back sleeves lean back, far ones hidden, flipped ones fall forward', () => {
  assert.deepEqual(sleeveTransform(0), { y: 0, z: 0, rotX: -4, opacity: 1 });
  assert.deepEqual(sleeveTransform(2), { y: -44, z: -120, rotX: -22, opacity: 1 });
  assert.equal(sleeveTransform(5).opacity, 0);
  assert.deepEqual(sleeveTransform(-1), { y: 60, z: 80, rotX: 70, opacity: 0 });
});
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS
- [ ] **Step 5:** Commit `feat: 크레이트 넘기기 계산`

---

### Task 3: 3D 좌표 계산

**Files:** Create `js/deck-geometry.js`; Test `tests/deck-geometry.test.mjs`

**Interfaces:**
- Consumes: `PLINTH`, `DISC` from `arm.js`
- Produces: `plinthToWorld(x, y): { x, z }`, `worldToPlinth(x, z): { x, y }`, `fitDistance(fovDeg, aspect, width, depth, margin = 0.06): number`, `armLift(t): number`

`plinthToWorld(x, y) = { x: (x - 600) / 100, z: (y - 390) / 100 }`. `fitDistance`: 세로 시야 `fov`에서 가로 `width*(1+2m)`와 세로 `depth*(1+2m)`가 모두 들어오는 최소 거리. `armLift(t)`: t∈[0,1] → 1 - easeOutBack(t) (1에서 시작해 0으로 끝남, 중간에 음수로 살짝 내려갔다 0 — 즉 내려앉으며 튐), t≤0 → 1, t≥1 → 0.

- [ ] **Step 1: 실패 테스트**

```js
test('plinth and world coordinates round-trip, plinth centre is the origin', () => {
  assert.deepEqual(plinthToWorld(600, 390), { x: 0, z: 0 });
  const w = plinthToWorld(DISC.x, DISC.y); assert.deepEqual(w, { x: -2.2, z: 0 });
  const p = worldToPlinth(1.23, -0.5); const back = plinthToWorld(p.x, p.y);
  assert.ok(Math.abs(back.x - 1.23) < 1e-9 && Math.abs(back.z + 0.5) < 1e-9);
});
test('fitDistance grows as the screen gets narrower', () => {
  const wide = fitDistance(30, 16 / 9, 12, 7.8), tall = fitDistance(30, 9 / 19.5, 12, 7.8);
  assert.ok(tall > wide && wide > 0);
});
test('armLift starts lifted, ends exactly down, and dips below zero on the way (the bounce)', () => {
  assert.equal(armLift(0), 1); assert.equal(armLift(1), 0); assert.equal(armLift(-1), 1); assert.equal(armLift(2), 0);
  const samples = Array.from({ length: 50 }, (_, i) => armLift(i / 49));
  assert.ok(Math.min(...samples) < 0, 'bounce');
});
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS
- [ ] **Step 5:** Commit `feat: 3D 좌표 계산`

---

### Task 4: 덱 상태 로직 분리 (`deck-core.js`)

현재 `turntable.js`의 상태·로직을 렌더러와 분리한다. 동작은 바뀌지 않는다.

**Files:** Create `js/deck-core.js`; Modify `js/turntable.js` (core 사용, 그리기·DOM만 남김); Test `tests/deck-core.test.mjs` (Player + 테스트용 FakeAudio — `tests/player.test.mjs`의 FakeAudio를 `tests/helpers/fake-audio.mjs`로 옮겨 공유)

**Interfaces:**
- Consumes: `Player`; `timeline.js` (`radiusToTime`, `timeToRadius`, `trackStartAt`, `startOf`, `locate`, `GROOVE`); `arm.js` (`ARM`, `angleForRadius`, `radiusForAngle`, `clampAngle`)
- Produces:

```js
createDeckCore(player, view) => core
// view: { setHint(text: string): void, loadArt(album): Promise<{ cover, design }>, drawVinyl(album, cover, design, durations): void }
core.state            // { album, motorOn, rpm, speed, rotation, angle, lift, needleDown, dragging, ended, audible }
core.tick(dt, now)    // returns true if anything visible changed; advances speed/rotation/tween/arm-follow/lift, syncs audio
core.idle()           // true when tick would change nothing (speed 0, no tween, lift settled, not dragging)
core.startDrag(), core.dragTo(angleDeg), core.endDrag()
core.setMotor(on), core.toggleMotor(), core.setRpm(33|45), core.togglePlay(), core.skip(delta)
core.remotePlay(), core.remotePause()
core.mount(album): Promise<void>, core.eject()
core.info()           // { title, artist, line, ariaNow, ariaMax, ariaText }
core.onChange(fn)     // fn() after any state change from outside tick (buttons, player events) — renderers restart their loop
```

`lift`: 0 = 바늘 내려감, 1 = 들림. `needleDown` 전환 시 0.35초 동안 `armLift`로 보간(2D는 그림자 오프셋에, 3D는 높이에 사용).

- [ ] **Step 1: FakeAudio를 `tests/helpers/fake-audio.mjs`로 옮기고 `npm test` → 48 PASS 유지**
- [ ] **Step 2: 실패 테스트 (`tests/deck-core.test.mjs`)** — view는 기록용 가짜(`loadArt` → `{ cover: null, design: {} }`, `drawVinyl` 호출 횟수 기록)

```js
test('dropping the needle mid-track starts that track from the top', async () => {
  // album with two 10s tracks; mount; setMotor(true); dragTo(angleForRadius(0.68)) ; endDrag(); wait 400ms
  // then player.time === 10 (start of track 2)
});
test('the run-out stops the record', async () => { /* drop at radius 0.38 → state.ended === true, audio paused */ });
test('after a long hidden gap, tick puts the arm at the current playback position', async () => {
  // play, set player.audio.currentTime = 7 on track 2 (FakeAudio), core.tick(30, now) once
  // expect state.angle === angleForRadius(timeToRadius(17, 20))
});
test('remotePlay with the needle up drops it at the start and plays', async () => { /* needleDown, motorOn, !audio.paused, player.time === 0 */ });
test('idle() is true when stopped and settled, false while spinning', () => { /* … */ });
test('mount draws the record twice: before and after durations are known', async () => { /* drawVinyl calls === 2 */ });
```

- [ ] **Step 3:** `npm test` → FAIL (module not found)
- [ ] **Step 4:** `deck-core.js` 구현 — `turntable.js`의 `s`, `setMotor/setRpm/setNeedle/tweenTo/seekToTrackUnder/dropNeedleAt/liftNeedle/returnToRest/togglePlay/skip/frame 로직/mount/eject/remote*`를 옮긴다(DOM 접근 제거, 텍스트는 `info()`로).
- [ ] **Step 5:** `turntable.js`를 core 사용으로 줄이기: DOM 생성, 포인터→`dragTo`, 버튼→core, rAF에서 `core.tick` 후 `rotate`/톤암 transform/그림자(`lift`)/텍스트 갱신. 반환 객체는 기존과 동일.
- [ ] **Step 6:** `npm test` → 전부 PASS
- [ ] **Step 7:** 회귀 확인 — 실시간 CDP로 `dev/drive.html` 시나리오(중간 드롭→곡 처음, 정지, 다음 곡, 런아웃, 거치대, 앨범 교체, Space)와 `dev/ms.html`(잠금 화면 버튼) 결과가 이전과 같음
- [ ] **Step 8:** Commit `refactor: 덱 상태 로직을 deck-core로 분리`

---

### Task 5: 크레이트 화면 + 두 화면 흐름 (2D 덱으로 먼저)

**Files:** Create `js/crate.js`; Modify `index.html`, `css/style.css`, `js/main.js`; Delete `js/shelf.js`

**Interfaces:**
- Consumes: `router.js`, `crate-math.js`, `createTurntable`
- Produces: `createCrate(root, albums, { onPick(album, sleeveEl) }) => { show(index?), hide(), focusAlbum(id), element }`; `main.js`의 `showCrate()`, `showDeck(album)`

구조: `<main class="screens"><section class="screen crate-screen">…</section><section class="screen deck-screen" hidden>← 레코드 고르기 버튼 + #deck + 곡 정보</section></main>`.
크레이트 스타일: 어두운 배경에 위쪽 따뜻한 스포트라이트, 호두나무 크레이트 앞판(앞 가장자리 높이 30%), `perspective: 1200px`, 재킷 `transform: translate3d(0, y, z) rotateX(rotX)`, 재킷 크기 `min(70vw, 52vh, 420px)`. 앞 재킷 아래 앨범명(Instrument Serif 32px)·아티스트·곡 수. 양옆 화살표 버튼(44px 터치 영역).
전환: 고르기 → 재킷 `translateY(-30%)` + 재킷 뒤 LP 원판이 오른쪽으로 40% 나옴(0.35초) → 크레이트 페이드아웃·덱 페이드인(0.25초). 돌아가기는 역순.

- [ ] **Step 1:** 구조·스타일·`crate.js` 작성(Task 2 함수로 transform 적용, 입력은 `stepFromWheel/Swipe`, 키보드, 화살표). 앨범 0개면 "albums/ 폴더에 앨범을 넣어주세요". `role="listbox"`, 맨 앞 재킷 `role="option" aria-selected="true"`, 넘길 때 `aria-live="polite"`로 "앨범명, 아티스트". "← 레코드 고르기"는 `env(safe-area-inset-top)` 아래.
- [ ] **Step 2:** `main.js` 라우팅: 시작 시 `albumIdFromHash(location.hash)` → 덱 또는 크레이트, 고르기 → `history.pushState(null, '', hashForAlbum(id))` + `showDeck`, `popstate` → 해시 따라 전환, 크레이트 복귀 시 `deck.eject()`
- [ ] **Step 3:** 브라우저 확인(실시간 CDP + 앱 브라우저 창 모바일 크기): 넘기기(휠·키·스와이프 이벤트), 끝에서 멈춤, 고르기 → 해시 `#illmatic`, 톤암 끌어 재생, `history.back()` → 크레이트·정지, `#channel-orange`로 직접 열기, 없는 해시 → 크레이트. 콘솔 오류 0.
- [ ] **Step 4:** 스크린숏 데스크톱 1400×820·휴대폰 375×812(크레이트)
- [ ] **Step 5:** Commit `feat: 레코드 크레이트 첫 화면과 화면 전환`

---

### Task 6: 3D 턴테이블 — 장면

**Files:** Create `js/deck3d.js`; Modify `index.html` (import map)

**Interfaces:**
- Consumes: `three`, `three/addons/environments/RoomEnvironment.js`, `three/addons/geometries/RoundedBoxGeometry.js`; `deck-geometry.js`; `arm.js` 상수; `vinyl.js` (`loadCover`, `designFor`, `renderVinyl`)
- Produces (이 Task에서는 정적 장면): `createDeck3d(root, player)`의 장면 구성 함수 `buildScene(THREE, opts) => { scene, camera, renderer, parts: { platterGroup, vinylMesh, vinylTexture, armPivot, armLiftJoint, buttons: { start, rpm33, rpm45 }, pilot } }`

스펙 5.2 표의 치수·재질 그대로. 나무결 텍스처는 512×512 캔버스: 세로로 긴 `fbm3` 노이즈 줄무늬(호두나무 #4a2e1d~#2f1c12), roughness 맵은 같은 노이즈 밝기. 스트로보 점은 플래터 옆면 텍스처(256×32, 점 72개). 톤암은 `armPivot`(Y축 회전 = 2D 각도-90°) 안에 `armLiftJoint`(X축 회전으로 들림)를 둔다.

- [ ] **Step 1:** import map 추가, `deck3d.js`에 `buildScene` + 임시 정적 렌더(`dev/deck3d.html`)
- [ ] **Step 2:** 헤드리스 스크린숏(WebGL은 `--use-angle=swiftshader`)으로 확인: 부품 배치가 2D와 같은 위치(LP 중심 = DISC, 톤암 거치 위치), 금속 반사, 나무결, 그림자. 레퍼런스 사진처럼 보이는지 스스로 비평 후 조명·재질 조정 1회 이상
- [ ] **Step 3:** 데스크톱·휴대폰 비율 카메라(35°/55°) 스크린숏
- [ ] **Step 4:** Commit `feat: 3D 턴테이블 장면`

---

### Task 7: 3D 턴테이블 — 움직임·조작·연결

**Files:** Modify `js/deck3d.js`, `js/main.js`, `css/style.css`, `README.md`

**Interfaces:**
- Consumes: `createDeckCore` (Task 4), `buildScene` (Task 6), `plinthToWorld/worldToPlinth/fitDistance` (Task 3)
- Produces: `createDeck3d(root, player)` → 덱 인터페이스(`mount, eject, remotePlay, remotePause, skip, setVisible, dispose`)

- 루프: `core.tick` → `platterGroup.rotation.y = -rotation`, `armPivot.rotation.y`, `armLiftJoint.rotation.x = lift * 0.06`, 버튼 눌림, 파일럿 발광 → `renderer.render`. `core.idle()`이고 상호작용 없으면 루프 정지, `core.onChange`/포인터로 재개. `visibilitychange` 숨김 → 정지, 보임 → 한 번 `tick`(큰 dt) 후 재개.
- 포인터: `Raycaster`로 톤암 판정 원기둥(반경 0.5)·버튼 3개. 끌기 중 광선 × 평면 `y = 플래터 윗면` 교점 → `worldToPlinth` → `clampAngle(atan2)` → `core.dragTo`.
- LP 텍스처: `view.drawVinyl` = `renderVinyl(1024 캔버스)` 후 `vinylTexture.needsUpdate = true`; 반투명 스타일이면 `transmission 0.6`.
- mount/eject 연출: LP y를 2 → 0(0.5초) / 반대.
- 리사이즈: `ResizeObserver` → 렌더러 크기, 카메라 각도(가로/세로), `fitDistance`.
- 접근성: `.sr-only` 버튼(시작/정지, 33, 45)과 `role="slider"` 톤암 요소를 캔버스 앞에 두고 core에 연결. `Space/←/→`.
- 컨텍스트 손실 처리, 3D 실패 시 `main.js`가 `createTurntable`로 대체.

- [ ] **Step 1:** 구현
- [ ] **Step 2:** 실시간 CDP 시나리오(크레이트 → 고르기 → 3D 톤암 끌기(광선 좌표로 포인터 이벤트) → 곡 처음부터 → 정지/다음 곡/런아웃 → 뒤로 가기 → 정지 → 해시 직접 열기) 결과 확인
- [ ] **Step 3:** 잠금 화면 버튼 시나리오(`dev/ms.html` 방식)와 Review Focus 1(숨김 후 복귀 시 톤암 위치) 확인
- [ ] **Step 4:** `--disable-webgl`로 열어 2D 대체 동작 확인
- [ ] **Step 5:** 성능: 재생 중 프레임 간격 평균 ≤ 20ms(데스크톱), 정지 상태에서 2초간 렌더 호출 0
- [ ] **Step 6:** 스크린숏 데스크톱·휴대폰(세로) — 크레이트, 덱 정지, 덱 재생 중
- [ ] **Step 7:** README "조작" 갱신, `npm test` PASS
- [ ] **Step 8:** Commit `feat: 3D 턴테이블 조작과 연결`

---

### Task 8: 마무리·배포

- [ ] **Step 1:** 최종 리뷰(새 리뷰어, Review Focus 포함), 지적 사항 수정(각각 실패 테스트 먼저)
- [ ] **Step 2:** `git push`, Pages 배포 성공 확인
- [ ] **Step 3:** 실제 사이트에서 크레이트 → 3D 덱 → 재생 확인(새 브라우저 프로필)

---

## 개정 (2026-10-27): MD Vinyl 스타일 — Task 6·7을 아래로 대체

스펙 "개정" 절 참고. Task 1~5 완료분은 유지.

### Task 6R: 커버플로우 계산
- `js/crate-math.js`: `sleeveTransform` → `coverflowTransform(offset, size): { x, z, rotY, opacity, zIndex }` (zIndex = 100 − |offset|). 테스트: offset 0, ±1, ±3, 6 값.

### Task 7R: 덱 색·검은 바이닐
- `js/palette.js`: `deckColors(palette): { body, bg, ink }` (hex). 테스트: 회색 어두움 → `#3a3a3c`, 회색 밝음 → `#ece6da`, 주황 팔레트 → 몸체 색상 15–45°·명도 0.50–0.66, bg 명도 ≥ 0.9, ink는 몸체와 대비.
- `js/vinyl.js`: `defaultStyle(album) = album.vinyl?.style ?? (album.vinyl?.color ? 'solid' : 'black')` (순수, 테스트), `black` 스타일 그리기, 라벨 0.36R에 표지.

### Task 8R: 세로형 레이아웃 좌표
- `js/arm.js` 상수: PLINTH 1000×1300, DISC {380,520,430}, PIVOT {870,160}, ARM_LENGTH 600. 기존 `tests/arm.test.mjs`가 그대로 통과해야 함. `deck-geometry.js`는 `armLift`만 남기고 테스트 정리.

### Task 9R: 커버플로우 첫 화면 (밝은 테마)
- `crate.js`·CSS를 커버플로우로, 바닥 반사, 고를 때 LP 빠져나오기. 브라우저로 넘기기·고르기 흐름 재확인.

### Task 10R: 위에서 본 사실적인 턴테이블
- `turntable.js`를 새 디자인으로 다시 그림(deck-core 사용, 같은 반환 객체). 몸체·LP·고정 반사·톤암(SVG 금속, 들림 그림자)·버튼 3개+33/45·곡 정보. 덱 화면 배경 = `deckColors().bg`.
- 확인: CDP 시나리오(고르기→바늘 끌기→곡 처음부터→정지/다음/런아웃→뒤로), 잠금 화면 버튼, 휴대폰 390×844·데스크톱 1400×900 스크린숏.

### Task 11R: 마무리
- 최종 리뷰 → 수정 → README → push → 실제 사이트 확인.

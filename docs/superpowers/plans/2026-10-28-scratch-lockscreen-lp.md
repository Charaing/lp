# LP 스크래치 + 잠금 화면 LP 그림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 레코드를 손으로 돌리면 곡 소리가 손 속도·방향대로(뒤로는 거꾸로) 나오고, 잠금 화면 그림은 꾸민 LP 정지 이미지가 된다.

**Architecture:** 손 각도→속도·구간·보간 계산은 순수 모듈 `scratch-math.js`. 소리는 Web Audio `AudioWorklet`(`scratch-worklet.js`)이 디코딩한 ±60초 모노 구간을 가변 속도로 읽고, `scratch.js`가 준비·연결·위치 보고를 맡는다. `deck-core`에 스크래치 상태(`startScratch/scratchTo/endScratch`)를 더하고 `turntable.js`가 레코드 포인터 입력을 연결한다. 잠금 화면은 `renderVinyl`로 만든 PNG blob URL을 `nowPlayingInfo`의 첫 artwork로 넣는다.

**Tech Stack:** Web Audio API(AudioContext, AudioWorklet, decodeAudioData), Canvas 2D, Media Session, Node 22 `node:test`, 헤드리스 Edge(CDP).

**Spec:** `docs/superpowers/specs/2026-10-28-scratch-lockscreen-lp-design.md`

## Global Constraints

- npm 의존성 0개, 빌드 도구 없음. 워크릿 파일 경로는 상대(`js/scratch-worklet.js`, GitHub Pages 하위 경로).
- `rate = 각속도 / DEG_PER_SEC[rpm]`(33: 200, 45: 270), −4..4로 자름. 시계 방향 = 양수.
- 각속도 평활 시정수 0.04s, 80ms 무움직임 → 0. 워크릿 rate 보간 16ms, 페이드 인/아웃 15ms, 위치 보고 50ms.
- 디코딩 구간 = 현재 위치 ±60s(곡 안으로 자름), 모노, 캐시 1개(같은 src·구간 재사용).
- 소리는 바늘이 내려가 있을 때만. 스크래치는 현재 곡 안에서만.
- 잠금 화면 LP 그림: 512×512 PNG, blob URL, 레코드 올릴 때·꾸미기 변경 500ms 디바운스로 다시 만들고 이전 URL revoke. LP가 artwork 첫 항목, 표지가 둘째.
- 실패(AudioWorklet 없음, 디코딩 실패) 시 무음으로 LP·위치만 이동, 오류 토스트 없음.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 360°를 넘나드는 손 각도(179°→−179°)에서 회전이 튀지 않음 — Task 1 `unwrapDelta` 테스트.
2. 곡 처음(0초)에서 뒤로, 끝에서 앞으로 돌릴 때 범위 밖을 읽지 않고 무음 — Task 1 `readLinear`/`advance` 경계 테스트 + Task 2 워크릿 클램프.
3. 바늘이 들린 상태에서 레코드를 돌리면 소리도 재생 재개도 없음 — Task 3 테스트.
4. 스크래치 중 다른 앨범으로 이동하거나 덱을 떠나면 엔진이 멈추고 재생이 꼬이지 않음 — Task 3 테스트(eject 중 스크래치 종료).
5. 잠금 화면 그림 blob URL이 계속 쌓이지 않음(revoke) — Task 4 테스트.

---

## File Map

| 파일 | 책임 |
|---|---|
| `js/scratch-math.js` (신규) | 각도 펼치기, 속도·평활, 구간, 보간 읽기, 위치 이동 |
| `js/scratch-worklet.js` (신규) | AudioWorkletProcessor: 가변 속도 읽기, 페이드, 위치 보고 |
| `js/scratch.js` (신규) | AudioContext·워크릿 준비, 트랙 디코딩·구간·캐시, start/rate/stop |
| `js/deck-core.js` | 스크래치 상태와 재생 동기화 |
| `js/turntable.js` | 레코드 포인터 입력 → 각도·속도 → core + 엔진 |
| `js/now-playing.js`, `js/main.js` | LP 그림 artwork |

---

### Task 1: 스크래치 계산

**Files:** Create `js/scratch-math.js`; Test `tests/scratch-math.test.mjs`

**Interfaces:**
- Produces: `unwrapDelta(prevDeg, nextDeg) → number(−180..180]`; `rateFromVelocity(degPerSec, rpm) → number`; `smoothVelocity(prev, sample, dtSec, tau = 0.04) → number`; `windowAround(positionSec, durationSec, span = 60) → { start, end }`; `readLinear(samples: Float32Array, pos: number) → number`; `advance(pos, rate, sampleRate, frames) → number`(초 단위 아님: 샘플 위치, `pos + rate * frames`).

- [ ] **Step 1: 실패 테스트**

```js
test('unwrapDelta takes the short way round', () => {
  assert.equal(unwrapDelta(179, -179), 2);
  assert.equal(unwrapDelta(-179, 179), -2);
  assert.equal(unwrapDelta(10, 40), 30);
});
test('rateFromVelocity: normal spin plays at 1, clamps to ±4', () => {
  assert.equal(rateFromVelocity(200, 33), 1);
  assert.equal(rateFromVelocity(270, 45), 1);
  assert.equal(rateFromVelocity(-400, 33), -2);
  assert.equal(rateFromVelocity(5000, 33), 4);
  assert.equal(rateFromVelocity(-5000, 33), -4);
});
test('smoothVelocity moves toward the sample, faster with a longer step', () => {
  const a = smoothVelocity(0, 100, 0.01), b = smoothVelocity(0, 100, 0.08);
  assert.ok(a > 0 && a < b && b < 100);
});
test('windowAround stays inside the track', () => {
  assert.deepEqual(windowAround(100, 300), { start: 40, end: 160 });
  assert.deepEqual(windowAround(10, 300), { start: 0, end: 70 });
  assert.deepEqual(windowAround(290, 300), { start: 230, end: 300 });
});
test('readLinear interpolates and is silent outside', () => {
  const s = Float32Array.from([0, 1, 0]);
  assert.equal(readLinear(s, 0.5), 0.5);
  assert.equal(readLinear(s, -1), 0);
  assert.equal(readLinear(s, 5), 0);
});
test('advance moves forward and backward by rate', () => {
  assert.equal(advance(100, 2, 44100, 128), 356);
  assert.equal(advance(100, -0.5, 44100, 128), 36);
});
```

- [ ] **Step 2:** `npm test` → FAIL (module not found)
- [ ] **Step 3:** 구현(`smoothVelocity`: `prev + (sample − prev) × (1 − e^(−dt/τ))`)
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `feat: 스크래치 계산`

---

### Task 2: 소리 엔진

**Files:** Create `js/scratch-worklet.js`, `js/scratch.js`

**Interfaces:**
- Consumes: `readLinear`, `windowAround` (Task 1) — 워크릿은 모듈 import가 안 되는 환경을 고려해 `readLinear`를 자체 포함(같은 공식).
- Produces: `createScratchEngine() → { supported: boolean, prepare(src, positionSec, durationSec) → Promise<boolean>, start(positionSec), setRate(rate), stop() → Promise<number /* 최종 위치(초) */>, onPosition(fn(sec)), dispose() }`.
- 워크릿 프로세서 이름 `'lp-scratch'`, 메시지: `{ type: 'load', samples, sampleRate, startSec }`, `{ type: 'start', positionSec }`, `{ type: 'rate', rate }`, `{ type: 'stop' }`; 보냄: `{ type: 'position', sec }`(50ms), `{ type: 'stopped', sec }`(페이드아웃 후).
- `prepare`: 같은 src·구간이면 바로 true. 아니면 `fetch → arrayBuffer → decodeAudioData`, 채널 평균으로 모노, `windowAround`로 잘라 워크릿에 `load`. 실패 시 false. `AudioContext`는 `start` 직전 `resume()`.

- [ ] **Step 1:** 구현
- [ ] **Step 2:** 브라우저 확인(실시간 CDP, 로컬 서버): 데모 앨범 트랙으로 `prepare` → `start(10)` → `setRate(2)` 500ms → `setRate(-1)` 500ms → `stop()`가 대략 `10 + 1 − 0.5 = 10.5`(±0.15) 반환, 그사이 `onPosition` 값이 증가 후 감소. 곡 처음에서 `setRate(-4)` 2초 → 위치 0에 머묾. 콘솔 오류 0.
- [ ] **Step 3:** Commit `feat: 스크래치 소리 엔진(AudioWorklet)`

---

### Task 3: 덱 스크래치 상태 + 레코드 잡기

**Files:** Modify `js/deck-core.js`, `js/turntable.js`, `css/style.css`; Test `tests/deck-core.test.mjs`

**Interfaces:**
- Consumes: Task 1·2.
- Produces: `core.startScratch()`, `core.scratchTo(rotationDeg, albumTimeSec)`, `core.endScratch(albumTimeSec)`, `core.state.scratching`.
- `startScratch`: `scratching = true`, `audible = false`, `player.pause()`. `tick`은 스크래치 중 `rotation`·`angle`을 덮어쓰지 않고 재생 동기화도 하지 않는다.
- `scratchTo`: `rotation = rotationDeg`, 바늘이 내려가 있으면 `angle = angleForRadius(timeToRadius(albumTimeSec, total, groove))`.
- `endScratch(t)`: `scratching = false`, 바늘이 내려가 있으면 `player.seek(t)`(런아웃 규칙 그대로), 이후 기존 `audible` 규칙으로 재개.
- eject/mount 중이면 스크래치 종료.
- 덱: `.tt-record` `pointerdown`(`.arm-grab` 제외) → 캡처, `core.startScratch()`, 엔진 `prepare(현재 트랙, 위치)` 시작(바늘이 내려가 있을 때만), 준비되면 `start`. `pointermove`마다 레코드 중심 기준 각도 → `unwrapDelta` 누적 → `smoothVelocity` → `rateFromVelocity` → 엔진 `setRate`(준비 전엔 위치를 직접 적분). `onPosition`으로 `core.scratchTo`. `pointerup/cancel` → 엔진 `stop()` 위치(또는 적분 위치)로 `core.endScratch`. 80ms 무움직임이면 rate 0. 레코드 커서 `grab`/`grabbing`, `touch-action: none`.

- [ ] **Step 1: 실패 테스트**

```js
test('scratching pauses the player and stops tick from driving the record', async () => {
  const { player, core } = await mounted();
  core.remotePlay(); await sleep(10);
  core.startScratch();
  assert.equal(player.audio.paused, true);
  core.scratchTo(123, 4);
  core.tick(0.1, 1e6);
  assert.equal(core.state.rotation, 123);
  assert.ok(Math.abs(core.state.angle - angleForRadius(timeToRadius(4, 20))) < 1e-9);
});
test('letting go resumes playback from where the hand left it', async () => {
  const { player, core } = await mounted();
  core.remotePlay(); await sleep(10);
  core.startScratch(); core.endScratch(13); await sleep(20);
  core.tick(0.1, 1e6 + 100);
  assert.equal(player.time, 13);
  assert.equal(player.audio.paused, false);
});
test('with the needle up, spinning the record by hand never plays', async () => {
  const { player, core } = await mounted();
  core.startScratch(); core.scratchTo(90, 5); core.endScratch(5); await sleep(20);
  core.setMotor(true); core.tick(0.1, 1e6);
  assert.equal(player.audio.paused, true);
  assert.equal(core.state.needleDown, false);
});
test('ejecting mid-scratch ends the scratch', async () => {
  const { core } = await mounted();
  core.startScratch(); core.eject();
  assert.equal(core.state.scratching, false);
});
```

- [ ] **Step 2–4:** FAIL → 구현 → PASS
- [ ] **Step 5:** 브라우저(실시간 CDP): 재생 중 레코드에 포인터 이벤트(중심 둘레 원호)로 앞으로 빠르게 → 뒤로 → 놓기 → 놓은 위치에서 재생·톤암 일치, 톤암 잡기는 그대로. 콘솔 오류 0.
- [ ] **Step 6:** Commit `feat: 레코드를 손으로 돌리는 스크래치`

---

### Task 4: 잠금 화면 LP 그림

**Files:** Modify `js/now-playing.js`, `js/turntable.js`, `js/main.js`; Test `tests/now-playing.test.mjs`

**Interfaces:**
- Produces: `nowPlayingInfo(album, index, baseHref, lpArtwork = null)` — `lpArtwork`(`{ src, sizes: '512x512', type: 'image/png' }`)가 있으면 artwork 첫 항목. `connectMediaSession(player, deck)`는 `deck.lpArtwork()`(없으면 null)를 읽고, `deck`이 보내는 `'artwork'` 이벤트(`deck.onArtwork(fn)`)에 메타데이터를 다시 씀.
- 덱: 레코드 올린 뒤와 꾸미기 변경 500ms 디바운스로 512 캔버스(배경 = 덱 배경색, 레코드 + 부드러운 그림자)에 `renderVinyl` → `toBlob` → `URL.createObjectURL`, 이전 URL `revokeObjectURL`, `onArtwork` 콜백 호출. eject 시 revoke하고 null.

- [ ] **Step 1: 실패 테스트**

```js
test('the LP picture comes first, the cover stays as a fallback', () => {
  const lp = { src: 'blob:x', sizes: '512x512', type: 'image/png' };
  const art = nowPlayingInfo(album, 0, base, lp).artwork;
  assert.deepEqual(art[0], lp);
  assert.equal(art[1].src, 'https://charaing.github.io/lp/albums/channel-orange/cover.jpg');
});
test('without an LP picture the cover is used', () => {
  assert.equal(nowPlayingInfo(album, 0, base).artwork.length, 1);
});
```
- 덱 쪽 revoke 확인: `createArtworkMaker({ createObjectURL, revokeObjectURL })` 같은 주입 가능한 작은 함수(`js/lp-artwork.js`: `makeArtworkSlot(urlApi) → { set(blob) → url, clear() }`)로 분리해 테스트: `set` 두 번 → 첫 URL revoke 1회, `clear` → 마지막 URL revoke.

- [ ] **Step 2–4:** FAIL → 구현 → PASS
- [ ] **Step 5:** 브라우저: 재생 중 `navigator.mediaSession.metadata.artwork[0].src`가 `blob:`로 시작, 그 URL을 `fetch`하면 PNG(시그니처 확인), 꾸미기에서 무늬 바꾸면 500ms 뒤 URL 바뀜.
- [ ] **Step 6:** Commit `feat: 잠금 화면에 꾸민 LP 그림`

---

### Task 5: 마무리

- [ ] README "조작"에 레코드 잡고 돌리기 한 줄
- [ ] 최종 리뷰(새 리뷰어, Review Focus 포함) → 지적 수정(각각 실패 테스트 먼저)
- [ ] `git pull` → push → Pages 배포 → 실제 사이트에서 스크래치·잠금 화면 메타데이터 CDP 확인
- [ ] 사용자에게 아이폰 잠금 화면 확인 요청(실기기에서만 확인 가능)

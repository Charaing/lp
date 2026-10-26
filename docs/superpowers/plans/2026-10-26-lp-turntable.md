# LP 턴테이블 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `albums/` 폴더의 앨범을 앨범마다 다른 LP로 보여주고, 톤암을 조작해 들을 수 있는 정적 웹사이트를 만들어 `Charaing/lp` GitHub Pages로 게시한다.

**Architecture:** 빌드 도구 없는 정적 HTML + ES 모듈. 순수 로직(색·시드·타임라인·목록 생성)은 DOM과 분리해 `node --test`로 검증하고, DOM/캔버스/오디오 모듈은 브라우저에서 확인한다. GitHub Actions가 푸시마다 `albums.json`을 만들어 Pages에 배포한다.

**Tech Stack:** HTML/CSS/바닐라 JS(ES modules), Canvas 2D, HTMLAudioElement, Node 20 내장 모듈(`node:test`, `node:fs`, `node:zlib`), GitHub Actions, GitHub Pages, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-10-26-lp-turntable-design.md`

## Global Constraints

- 런타임/개발 npm 의존성 0개. Node 20 내장 기능만.
- 오디오 확장자: `mp3, m4a, ogg, wav, flac` (대소문자 무시). 표지: `cover.jpg|cover.png|cover.webp` (대소문자 무시).
- 트랙 순서: 파일명 자연 정렬. 제목 = 파일명에서 앞 번호·구분자(`.`, `-`, `_`, 공백)·확장자 제거.
- `style` 값: `solid | translucent | marble | splatter | picture`. `rpm` 기본 33, 허용 33/45.
- `albums.json`은 `.gitignore`에 넣고 Actions에서 생성. 경로는 세그먼트별 `encodeURIComponent`.
- 같은 앨범 `id`는 항상 같은 LP(시드 = `id` 해시 → mulberry32).
- 재생은 사용자 조작(톤암 놓기/Space)에서만 시작.
- 모바일 브레이크포인트 768px. 저장소: `Charaing/lp`, 공개, Pages 소스 = GitHub Actions.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 한글·공백·`#`·`?`가 들어간 파일/폴더명 → URL이 깨지지 않고 재생돼야 함 (Task 2 테스트).
2. `.MP3`, `Cover.JPG` 같은 대문자 확장자/이름 → 인식돼야 함 (Task 2 테스트).
3. `.DS_Store`, `desktop.ini`, `album.json`, 하위 폴더 등 오디오 아닌 파일 → 트랙에서 제외 (Task 2 테스트).
4. 바늘을 홈 영역 바깥(라벨 위, 레코드 밖)에 놓기 → 시간 0 또는 끝으로 고정, 예외 없음 (Task 3 테스트).
5. 한 트랙이 로드 실패 → 토스트 후 다음 트랙, 마지막 트랙이면 런아웃 정지 (Task 6 테스트용 `nextPlayableIndex`).

---

## File Map

| 파일 | 책임 |
|---|---|
| `package.json`, `.gitignore` | `npm test` / `npm run build` / `npm run demo` 스크립트 |
| `js/palette.js` | `hashSeed`, `mulberry32`, `extractPalette`, `pickStyle` (순수) |
| `js/timeline.js` | 반경 ↔ 시간 ↔ (트랙, 오프셋) 매핑 (순수) |
| `scripts/build-manifest.mjs` | `albums/` 스캔 → `albums.json` |
| `scripts/make-demo.mjs` | 데모 WAV/PNG 생성 |
| `js/vinyl.js` | 캔버스 LP 렌더 |
| `js/player.js` | 트랙 순차 재생·탐색·실패 건너뛰기 |
| `js/shelf.js`, `js/turntable.js`, `js/main.js`, `index.html`, `css/style.css` | UI |
| `.github/workflows/pages.yml`, `README.md` | 배포·문서 |

---

### Task 1: 스캐폴드 + 팔레트/시드 유틸

**Files:**
- Create: `package.json`, `.gitignore`, `js/palette.js`
- Test: `tests/palette.test.mjs`

**Interfaces:**
- Produces:
  - `hashSeed(str: string): number` — 32비트 unsigned (FNV-1a)
  - `mulberry32(seed: number): () => number` — [0,1) 난수
  - `extractPalette(rgba: Uint8ClampedArray, count = 5): string[]` — `#rrggbb` 목록, 가중치 내림차순
  - `colorfulness(palette: string[]): number` — 0..1, 팔레트 색상환 분산
  - `pickStyle(seed: number, palette: string[]): 'solid'|'translucent'|'marble'|'splatter'|'picture'`

- [ ] **Step 1: `package.json`** — `"type": "module"`, scripts `test: node --test tests/`, `build: node scripts/build-manifest.mjs`, `demo: node scripts/make-demo.mjs`, `serve: npx --yes http-server -c-1 -p 8080 .` (serve는 개발 편의, 의존성 아님). `.gitignore`: `albums.json`, `node_modules/`.

- [ ] **Step 2: 실패 테스트 작성** (`tests/palette.test.mjs`)

```js
test('hashSeed is deterministic and differs by input', () => {
  assert.equal(hashSeed('abc'), hashSeed('abc'));
  assert.notEqual(hashSeed('abc'), hashSeed('abd'));
  assert.ok(hashSeed('') >= 0 && hashSeed('x') <= 0xffffffff);
});
test('mulberry32 yields same sequence for same seed, in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});
test('extractPalette returns dominant color first', () => {
  // 90 red pixels, 10 blue pixels
  const px = new Uint8ClampedArray(100 * 4);
  for (let i = 0; i < 100; i++) px.set(i < 90 ? [220, 30, 30, 255] : [20, 40, 210, 255], i * 4);
  const p = extractPalette(px, 2);
  assert.equal(p.length, 2);
  assert.match(p[0], /^#[d-f][0-9a-f][0-3][0-9a-f][0-3][0-9a-f]$/); // reddish
});
test('extractPalette ignores fully transparent pixels and handles empty input', () => {
  assert.deepEqual(extractPalette(new Uint8ClampedArray(0)), []);
  assert.deepEqual(extractPalette(new Uint8ClampedArray([255, 0, 0, 0])), []);
});
test('pickStyle is deterministic and never picture for monochrome', () => {
  assert.equal(pickStyle(7, ['#ff0000']), pickStyle(7, ['#ff0000']));
  for (let s = 0; s < 50; s++) assert.notEqual(pickStyle(s, ['#808080', '#7a7a7a']), 'picture');
});
```

- [ ] **Step 3: 실행 → FAIL** — `npm test` → `Cannot find module .../js/palette.js`

- [ ] **Step 4: `js/palette.js` 구현** — 양자화: 채널당 상위 4비트로 버킷(4096개), 버킷 평균색 사용. 가중치 = `count * (0.35 + saturation)`. 알파 < 128 무시. `pickStyle`: `r = mulberry32(seed)()`; `colorfulness >= 0.5` 이고 `r < 0.3`이면 `picture`; 그 외 `['solid','translucent','marble','splatter'][floor(r2*4)]` (r2는 같은 RNG의 두 번째 값). 회색 계열(채도 < 0.15)은 colorfulness 0으로 계산.

- [ ] **Step 5: 실행 → PASS** — `npm test` → 5 passing

- [ ] **Step 6: Commit** — `git add package.json .gitignore js/palette.js tests/palette.test.mjs && git commit -m "feat: 팔레트·시드 유틸"`

---

### Task 2: 목록 생성 스크립트

**Files:**
- Create: `scripts/build-manifest.mjs`
- Test: `tests/build-manifest.test.mjs`

**Interfaces:**
- Produces:
  - `trackTitle(filename: string): string`
  - `naturalCompare(a: string, b: string): number`
  - `encodePath(...segments: string[]): string` — 각 세그먼트 `encodeURIComponent` 후 `/`로 결합
  - `buildManifest(albumsDir: string, publicPrefix = 'albums'): Promise<{ albums: Album[], warnings: string[] }>`
  - `Album = { id, title, artist, year, cover: string|null, tracks: {title, src}[], vinyl: {color?, style?, accent?}, label: {color?, text?}, rpm: 33|45 }`
  - CLI(`import.meta.url`가 진입점일 때): `./albums` → `./albums.json` 쓰고 경고는 stderr, 앨범 수 stdout.

- [ ] **Step 1: 실패 테스트 작성** — 각 테스트는 `fs.mkdtemp`로 임시 `albums/` 픽스처를 만든다.

```js
test('trackTitle strips leading number, separators and extension', () => {
  assert.equal(trackTitle('01 첫곡.mp3'), '첫곡');
  assert.equal(trackTitle('2-Side B.MP3'), 'Side B');
  assert.equal(trackTitle('10_Intro.flac'), 'Intro');
  assert.equal(trackTitle('Song.ogg'), 'Song');
});
test('naturalCompare orders 2 before 10', () => {
  assert.deepEqual(['10 a.mp3', '2 b.mp3', '1 c.mp3'].sort(naturalCompare), ['1 c.mp3', '2 b.mp3', '10 a.mp3']);
});
test('encodePath encodes Korean, spaces, # and ?', () => {
  assert.equal(encodePath('albums', '내 앨범', '01 #1?.mp3'),
    'albums/' + encodeURIComponent('내 앨범') + '/' + encodeURIComponent('01 #1?.mp3'));
});
test('buildManifest reads tracks, cover (case-insensitive), album.json', async () => {
  // fixture: albums/밤 산책/{Cover.JPG, 02 둘.MP3, 01 하나.mp3, .DS_Store, desktop.ini, notes.txt, sub/03.mp3,
  //   album.json = {"title":"Night","artist":"A","vinyl":{"style":"marble"},"rpm":45}}
  const { albums, warnings } = await buildManifest(dir);
  assert.equal(albums.length, 1);
  const a = albums[0];
  assert.equal(a.id, '밤 산책'); assert.equal(a.title, 'Night'); assert.equal(a.rpm, 45);
  assert.equal(a.vinyl.style, 'marble');
  assert.equal(a.cover, encodePath('albums', '밤 산책', 'Cover.JPG'));
  assert.deepEqual(a.tracks.map(t => t.title), ['하나', '둘']);
  assert.deepEqual(warnings, []);
});
test('buildManifest skips folders without audio and warns', async () => {
  // fixture: albums/empty/cover.png only
  const { albums, warnings } = await buildManifest(dir);
  assert.equal(albums.length, 0); assert.match(warnings[0], /empty/);
});
test('invalid album.json falls back to defaults with a warning', async () => {
  // fixture: albums/x/{1.mp3, album.json = "{not json"}
  const { albums, warnings } = await buildManifest(dir);
  assert.equal(albums[0].title, 'x'); assert.equal(albums[0].rpm, 33); assert.equal(albums[0].cover, null);
  assert.match(warnings[0], /album\.json/);
});
test('invalid style and rpm are ignored', async () => {
  // fixture: album.json = {"vinyl":{"style":"glitter"},"rpm":78}
  assert.equal(albums[0].vinyl.style, undefined); assert.equal(albums[0].rpm, 33);
});
test('missing albums dir returns empty list', async () => {
  assert.deepEqual((await buildManifest(join(tmp, 'nope'))).albums, []);
});
```

- [ ] **Step 2: 실행 → FAIL** — `npm test` → module not found

- [ ] **Step 3: 구현** — 앨범은 폴더명 `naturalCompare` 순. 하위 폴더·점으로 시작하는 파일 무시. 색 값은 `/^#[0-9a-f]{6}$/i`만 통과.

- [ ] **Step 4: 실행 → PASS** — `npm test` → 전부 passing

- [ ] **Step 5: Commit** — `git commit -m "feat: albums.json 목록 생성 스크립트"`

---

### Task 3: 타임라인 매핑

**Files:**
- Create: `js/timeline.js`
- Test: `tests/timeline.test.mjs`

**Interfaces:**
- Produces:
  - `GROOVE = { outer: 0.96, inner: 0.40 }` — 디스크 반지름 대비 비율 (라벨 반경 0.33)
  - `radiusToTime(r: number, total: number): number` — r ∈ 비율, 범위 밖은 clamp
  - `timeToRadius(t: number, total: number): number`
  - `locate(durations: number[], t: number): { index: number, offset: number }` — t ≥ total이면 `{index: durations.length - 1, offset: last}`
  - `startOf(durations: number[], index: number): number`
  - `gapRadii(durations: number[]): number[]` — 트랙 경계(첫 트랙 시작 제외)의 반경 비율

- [ ] **Step 1: 실패 테스트 작성**

```js
test('radiusToTime maps outer→0 and inner→total, clamps outside', () => {
  assert.equal(radiusToTime(0.96, 100), 0);
  assert.equal(radiusToTime(0.40, 100), 100);
  assert.equal(radiusToTime(1.5, 100), 0);
  assert.equal(radiusToTime(0.1, 100), 100);
  assert.ok(Math.abs(radiusToTime(0.68, 100) - 50) < 1e-9);
});
test('timeToRadius is inverse of radiusToTime', () => {
  for (const t of [0, 12.5, 77, 100]) assert.ok(Math.abs(radiusToTime(timeToRadius(t, 100), 100) - t) < 1e-9);
});
test('locate finds track and offset', () => {
  assert.deepEqual(locate([30, 20, 50], 0), { index: 0, offset: 0 });
  assert.deepEqual(locate([30, 20, 50], 35), { index: 1, offset: 5 });
  assert.deepEqual(locate([30, 20, 50], 999), { index: 2, offset: 50 });
  assert.deepEqual(locate([30, 20, 50], -5), { index: 0, offset: 0 });
});
test('startOf sums previous durations', () => { assert.equal(startOf([30, 20, 50], 2), 50); });
test('gapRadii has one boundary per track after the first', () => {
  const g = gapRadii([50, 50]);
  assert.equal(g.length, 1); assert.ok(Math.abs(g[0] - 0.68) < 1e-9);
});
test('zero total does not divide by zero', () => {
  assert.equal(radiusToTime(0.7, 0), 0); assert.equal(timeToRadius(0, 0), 0.96);
});
```

- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현** (선형 보간 + clamp)
- [ ] **Step 4: 실행 → PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat: 바늘 반경↔재생 시간 매핑"`

---

### Task 4: 데모 앨범 생성

**Files:**
- Create: `scripts/make-demo.mjs`, `albums/` 아래 데모 3개(생성물 커밋)
- Test: `tests/make-demo.test.mjs`

**Interfaces:**
- Produces:
  - `encodeWav(samples: Float32Array, sampleRate: number): Buffer` — 16비트 PCM 모노
  - `encodePng(width: number, height: number, rgba: Uint8Array): Buffer` — zlib deflate + CRC32
  - CLI: `albums/`에 아래 앨범 생성(이미 있으면 덮어씀)

| 폴더 | 제목 / 아티스트 | 표지 주조색 | 트랙 (각 22~28초, 22050Hz) |
|---|---|---|---|
| `demo-sunset-drive` | Sunset Drive / Demo Band | 주황·자주 그라데이션 | `01 Coastline`, `02 Neon Mile`, `03 Last Exit` |
| `demo-deep-forest` | Deep Forest / Demo Band | 짙은 초록·이끼 | `01 Moss`, `02 Canopy` |
| `demo-blue-hour` | Blue Hour / Demo Band | 남색·하늘색, `album.json`에 `"vinyl":{"style":"translucent","color":"#3a7bd5"}` | `01 Dusk`, `02 Streetlight`, `03 Morning` |

  각 트랙: 앨범별 음계·템포가 다른 사인파+삼각파 아르페지오, 음 단위 ADSR, 마지막 1초 페이드아웃. `album.json`에 title/artist/year 2026.

- [ ] **Step 1: 실패 테스트 작성**

```js
test('encodeWav writes a valid RIFF/WAVE header', () => {
  const b = encodeWav(new Float32Array(100), 22050);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.toString('ascii', 8, 12), 'WAVE');
  assert.equal(b.readUInt32LE(24), 22050); assert.equal(b.readUInt16LE(34), 16);
  assert.equal(b.length, 44 + 200);
});
test('encodeWav clamps samples to int16 range', () => {
  const b = encodeWav(Float32Array.from([2, -2]), 8000);
  assert.equal(b.readInt16LE(44), 32767); assert.equal(b.readInt16LE(46), -32768);
});
test('encodePng writes signature and IHDR dimensions', () => {
  const b = encodePng(3, 2, new Uint8Array(3 * 2 * 4));
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(b.toString('ascii', 12, 16), 'IHDR');
  assert.equal(b.readUInt32BE(16), 3); assert.equal(b.readUInt32BE(20), 2);
});
```

- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현** — 표지 256×256 PNG(그라데이션 + 시드 원/줄무늬 도형).
- [ ] **Step 4: 실행 → PASS**, 그리고 `npm run demo && npm run build` → stdout `3 albums`, 앨범당 WAV 합계 < 4MB.
- [ ] **Step 5: Commit** — `git add scripts/make-demo.mjs tests/make-demo.test.mjs albums && git commit -m "feat: 합성 데모 앨범"`

---

### Task 5: 플레이어

**Files:**
- Create: `js/player.js`
- Test: `tests/player.test.mjs` (순수 헬퍼만)

**Interfaces:**
- Consumes: `locate`, `startOf` (Task 3)
- Produces:
  - `nextPlayableIndex(failed: Set<number>, from: number, count: number): number` — `from` 이후 첫 실패 아닌 인덱스, 없으면 `-1` (순수, export)
  - `class Player extends EventTarget`
    - `load(album: Album): Promise<number[]>` — 모든 트랙 `preload='metadata'`로 길이 측정(실패 트랙은 길이 0 + `failed`에 추가), durations 반환, `'durations'` 이벤트
    - `seek(t: number): void` — 앨범 전체 시간 기준
    - `play(): Promise<void>`, `pause(): void`
    - `get time(): number`, `get total(): number`, `get index(): number`, `get playing(): boolean`
    - 이벤트: `'track'`(detail `{index}`), `'ended'`(앨범 끝), `'error'`(detail `{index, title}`)
  - 트랙 끝 → `nextPlayableIndex`로 이어 재생, `-1`이면 `'ended'`.

- [ ] **Step 1: 실패 테스트** — `nextPlayableIndex(new Set([1]), 0, 3) === 2`; `nextPlayableIndex(new Set([1,2]), 0, 3) === -1`; `nextPlayableIndex(new Set(), 2, 3) === -1`.
- [ ] **Step 2: FAIL 확인** → **Step 3: 구현** (Audio 요소 1개 재사용, `src` 교체 후 `currentTime` 설정은 `loadedmetadata` 이후) → **Step 4: PASS 확인**
- [ ] **Step 5: Commit** — `git commit -m "feat: 앨범 단위 오디오 플레이어"`

---

### Task 6: LP 렌더러

**Files:**
- Create: `js/vinyl.js`

**Interfaces:**
- Consumes: `hashSeed`, `mulberry32`, `extractPalette`, `colorfulness`, `pickStyle` (Task 1), `GROOVE`, `gapRadii` (Task 3)
- Produces:
  - `loadCover(src: string|null): Promise<HTMLImageElement|null>` — 실패 시 `null`
  - `designFor(album: Album, cover: HTMLImageElement|null): { style, base, accent, labelColor, labelText }` — `album.json` 값 우선, 없으면 팔레트/시드. 표지 없으면 `picture` 금지, 색은 시드 HSL.
  - `renderVinyl(canvas: HTMLCanvasElement, album: Album, design, cover, durations: number[]): void` — 스펙 8절 레이어 순서(기본 → 텍스처 → 미세 홈 → 트랙 간 넓은 홈 → 라벨 → 스핀들). 광택은 그리지 않음(턴테이블 고정 레이어가 담당).
  - `renderSleeveEdge`는 만들지 않음(CSS로 처리).
- 스타일: `translucent` = base 알파 0.75 + 뒤 비침, `marble` = 시드 곡선 소용돌이 2색, `splatter` = 시드 점 40~80개 accent, `picture` = 표지를 디스크 전체에 원형 클립(라벨은 작은 링만).

- [ ] **Step 1: 임시 확인 페이지** `dev/vinyl.html`(커밋 안 함, `.gitignore`에 `dev/`)에서 데모 3개 + 표지 없는 가짜 앨범 + 5가지 스타일 강제 렌더.
- [ ] **Step 2: 브라우저 확인** — 로컬 서버에서 `dev/vinyl.html` 스크린샷: 앨범끼리 색·스타일이 확연히 다르고, 트랙 경계 홈이 트랙 수-1개 보이며, 새로고침해도 동일.
- [ ] **Step 3: Commit** — `git add js/vinyl.js .gitignore && git commit -m "feat: 앨범별 LP 캔버스 렌더러"`

---

### Task 7: UI — 선반, 턴테이블, 진입점

**Files:**
- Create: `index.html`, `css/style.css`, `js/shelf.js`, `js/turntable.js`, `js/main.js`

**Interfaces:**
- Consumes: `Player` (Task 5), `loadCover`, `designFor`, `renderVinyl` (Task 6), `radiusToTime`, `timeToRadius`, `GROOVE` (Task 3)
- Produces:
  - `createShelf(root: HTMLElement, albums: Album[], onPick: (album) => void): { setActive(id: string): void }`
  - `createTurntable(root: HTMLElement, player: Player): { mount(album, vinylCanvas): Promise<void>, eject(): void }`
  - `main.js`: `fetch('albums.json')` → 선반/턴테이블 연결, 빈 목록/실패 시 스펙 9절 안내 문구 "albums/ 폴더에 앨범을 넣어주세요".
- 동작 값: 플래터 가속/감속 0.8초 ease, 33⅓ = 200°/s 시각 회전, 45 = 270°/s. 바늘 내림 지연 350ms. 톤암 각도: 거치대 0°, 바깥 홈 18°, 안쪽 홈 38° 근처(반경 비율과 피벗 기하로 계산). 톤암 드래그는 Pointer Events(`setPointerCapture`)로 마우스·터치 공통.
- 톤암: `role="slider"`, `aria-label="톤암"`, `aria-valuetext` = 현재 트랙·시간. 키보드 `Space` 재생/일시정지(바늘이 거치대면 바깥 홈으로 자동 이동), `←/→` 이전/다음 트랙.
- `mount`: 먼저 균등 분할 durations로 렌더 → `player`의 `'durations'` 이벤트에서 실제 길이로 다시 렌더. 컨트롤: 시작/정지, 33/45 (초기값 `album.rpm`). 정보 패널: 앨범명·아티스트·현재 트랙·경과/전체 시간. `'ended'` → 바늘은 런아웃(`GROOVE.inner` 안쪽)에 머물고 재생 정지.
- 토스트: `player`의 `'error'` → "재생할 수 없는 트랙: {title}" 3초.
- 디자인: frontend-design 스킬로 월넛·알루미늄·크림 방향 확정, Google Fonts 디스플레이 1 + 본문 1.

- [ ] **Step 1: frontend-design 스킬 로드 후 `index.html`/`css/style.css` 작성** (데스크톱 2열, ≤768px 세로 배치·가로 스크롤 선반)
- [ ] **Step 2: `shelf.js`, `turntable.js`, `main.js` 구현**
- [ ] **Step 3: 브라우저 확인 (데스크톱)** — `npm run build` 후 로컬 서버: 앨범 클릭 → LP 이동 → 시작 → 톤암 드래그로 재생 → 바늘 위치 바꿔 다른 트랙 → 재생 중 톤암 안쪽 이동 → 정지 시 일시정지. 콘솔 에러 0개.
- [ ] **Step 4: 브라우저 확인 (모바일 375px)** — 가로 스크롤 없음, 터치 드래그(포인터)로 톤암 조작.
- [ ] **Step 5: 빈 목록 확인** — `albums.json`을 `{"albums":[]}`로 바꿔 안내 문구 표시 후 원복.
- [ ] **Step 6: Commit** — `git commit -m "feat: 레코드 선반과 턴테이블 UI"`

---

### Task 8: 배포 + README + 게시

**Files:**
- Create: `.github/workflows/pages.yml`, `README.md`

**Interfaces:**
- Consumes: `npm test`, `npm run build` (Task 1, 2)

- [ ] **Step 1: 워크플로 작성** — 트리거 `push: main` + `workflow_dispatch`; 권한 `pages: write, id-token: write, contents: read`; 잡: checkout → `actions/setup-node@v4`(20) → `npm test` → `npm run build` → `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3`(path `.`) → `actions/deploy-pages@v4`. `concurrency: pages`.
- [ ] **Step 2: README** — 폴더 규칙, `album.json` 예시(스펙 4절), 로컬 실행(`npm run build` → `npm run serve`), 데모 삭제법(`albums/demo-*` 삭제 후 푸시).
- [ ] **Step 3: 전체 테스트** — `npm test` → 전부 passing.
- [ ] **Step 4: Commit**
- [ ] **Step 5: 저장소 생성·푸시** — `gh repo create Charaing/lp --public --source . --push --description "앨범마다 다른 LP를 돌려 듣는 턴테이블"`
- [ ] **Step 6: Pages 활성화** — `gh api -X POST repos/Charaing/lp/pages -f build_type=workflow` (이미 있으면 `PUT`), 이후 `gh workflow run pages.yml` 필요 시.
- [ ] **Step 7: 배포 확인** — `gh run watch`로 성공 확인 후 `https://charaing.github.io/lp/` 를 브라우저에서 열어 앨범 3개 표시·재생 확인.

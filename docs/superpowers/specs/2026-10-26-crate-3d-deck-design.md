# 레코드 크레이트 + 3D 턴테이블 — 디자인 스펙

- 날짜: 2026-10-26
- 상태: 사용자 검토 대기
- 이전 스펙: `2026-10-26-lp-turntable-design.md` (앨범 폴더 규칙·플레이어·LP 생성은 그 문서를 따름)

## 1. 목적

지금 한 화면에 있는 "선반 + 2D 턴테이블"을 두 화면으로 나눈다.

1. **크레이트 화면(첫 화면):** 나무 크레이트에 꽂힌 LP 재킷을 넘겨 보며 하나를 고른다.
2. **턴테이블 화면(메인):** 고른 LP가 **실물 같은 3D 턴테이블** 위에서 돈다.

### 사용자가 말한 것 vs 가정

| 구분 | 내용 |
|---|---|
| 요청 | 첫 화면은 LP 재킷 중 하나 고르기, 고르면 LP 돌리는 화면이 메인, 그 화면을 지금보다 퀄리티 좋게 |
| 선택 | 퀄리티 = 실물 같은 질감 / 첫 화면 = 레코드 크레이트 / 방식 = three.js 진짜 3D / 디자인 승인 |
| 가정 | `albums/` 규칙, 바늘→곡 처음부터 재생, 잠금 화면·다이내믹 아일랜드, 홈 화면 아이콘은 모두 유지. 시점은 고정(돌려 보기 없음). 크레이트로 돌아가면 재생 정지. |

### 성공 기준

1. 사이트를 열면 크레이트가 보이고, 스와이프/휠/←→로 재킷을 넘기고 맨 앞 재킷을 눌러 고를 수 있다.
2. 고르면 3D 턴테이블 화면으로 넘어가고, 톤암을 끌어 놓으면 지금과 똑같이 재생된다(곡 처음부터, 런아웃은 정지).
3. 턴테이블이 사진처럼 보인다: 금속 반사, 나무결, 부드러운 그림자, 돌 때 LP 위에서 움직이는 빛.
4. "← 레코드 고르기", 브라우저 뒤로 가기, 아이폰 뒤로 스와이프로 크레이트에 돌아간다.
5. `#앨범id` 주소로 바로 열면 그 앨범의 턴테이블이 열린다.
6. iPhone(Safari, 홈 화면 앱)과 데스크톱에서 끊김 없이 돈다(목표 60fps, 최소 30fps).
7. WebGL을 못 쓰는 환경에서는 기존 2D 턴테이블로 동작한다.

### 범위 밖 (YAGNI)

카메라 회전/줌, 스크래치·지지직 효과음, 재킷 뒷면/수록곡 보기, 여러 장 연속 재생, 크레이트 정렬/검색.

## 2. 구조

```
index.html          두 화면의 뼈대 + three.js import map
css/style.css       크레이트·턴테이블 화면, 전환
js/main.js          앨범 로드, 라우팅(#id), 화면 전환, 3D/2D 선택
js/router.js        (신규·순수) 주소 해시 ↔ 앨범 id
js/crate.js         (신규) 크레이트 화면: CSS 3D 재킷 넘기기
js/crate-math.js    (신규·순수) 넘기기 인덱스·위치 계산
js/deck3d.js        (신규) three.js 턴테이블: 씬, 재질, 렌더 루프, 조작
js/deck-geometry.js (신규·순수) 3D 좌표 ↔ 플린스(1200×780) 좌표 변환
js/turntable.js     기존 2D 턴테이블 — WebGL 불가 시 대체
js/shelf.js         삭제 (crate.js가 대체)
그대로: player.js, timeline.js, arm.js, vinyl.js, palette.js, noise.js, now-playing.js, scripts/*
```

### 덱 인터페이스 (3D·2D 공통)

`main.js`와 `now-playing.js`는 아래만 사용한다. 기존 `turntable.js`의 `createTurntable(root, player)`는 이미 이 모양이고, `deck3d.js`는 같은 모양을 돌려주는 `createDeck3d(root, player)`를 내보낸다.

```js
// createTurntable(root, player) 또는 createDeck3d(root, player)가 돌려주는 객체
{
  mount(album): Promise<void>,   // LP를 올리고 오디오 로드
  eject(): void,                 // 바늘 들고 정지, LP 내림
  remotePlay(): void, remotePause(): void, skip(delta: number): void,
  dispose?(): void,              // 3D: 렌더 루프·GPU 자원 해제
  setVisible?(on: boolean): void,// 3D: 크레이트로 갈 때 루프 정지/재개
}
```

## 3. 라우팅과 화면 전환

- 해시 `#<encodeURIComponent(album.id)>` = 턴테이블 화면, 해시 없음 = 크레이트.
- 재킷을 고르면 `history.pushState`로 해시를 추가한다. 뒤로 가기(`popstate`)는 크레이트로 돌아간다.
- 처음 열 때 해시가 있으면 그 앨범으로 바로 턴테이블 화면을 연다. 없는 id면 해시를 지우고 크레이트를 연다.
- `router.js`: `albumIdFromHash(hash: string): string | null`, `hashForAlbum(id: string): string`.
- 전환 연출(0.6초): 크레이트 → 덱은 맨 앞 재킷이 위로 들리고 LP가 오른쪽으로 빠져나온 뒤 화면이 덱으로 넘어간다. 덱 → 크레이트는 반대 순서다. `prefers-reduced-motion`이면 페이드만 한다.
- 크레이트로 돌아갈 때 `deck.eject()`를 호출한다(정지). 미디어 세션 상태도 `paused`가 된다.

## 4. 크레이트 화면

**보이는 모습:** 어두운 레코드 가게 조명 아래 호두나무 크레이트가 있다. 재킷들이 앞에서 뒤로 촘촘히 꽂혀 있고 뒤로 갈수록 살짝 뒤로 기울어 있다(CSS `perspective`, `rotateX`). 맨 앞 재킷은 거의 세워져 크게 보이고, 그 아래에 앨범명(Instrument Serif)과 아티스트, 곡 수가 나온다. 재킷 위쪽 가장자리로 다음 재킷 2~4장의 윗부분이 보인다.

**넘기기:**
- 터치 스와이프(가로·세로 모두, 40px 이상), 마우스 휠(1틱 = 1장, 250ms 디바운스), `←` `→` `↑` `↓` 키, 화면 양옆 화살표 버튼.
- 넘길 때 맨 앞 재킷이 앞으로 넘어가며 눕는 회전(0.35초)을 한다. 앞쪽으로 넘긴 재킷은 크레이트 앞쪽에 쌓이듯 사라진다.
- 처음과 끝에서는 더 넘어가지 않고 살짝 튕긴다.

**고르기:** 맨 앞 재킷 클릭/탭 또는 `Enter`/`Space`.

**`crate-math.js` (순수):**
- `clampIndex(i, count): number`
- `stepFromWheel(deltaY: number): -1 | 0 | 1` (|delta| < 4 이면 0)
- `stepFromSwipe(dx: number, dy: number, threshold = 40): -1 | 0 | 1` (더 큰 축 기준, 오른쪽/아래 = 이전)
- `sleeveTransform(offset: number): { y: number, z: number, rotX: number, opacity: number }` — offset 0 = 맨 앞, 1..4 = 뒤쪽, 음수 = 넘겨진 재킷. offset > 4 이면 opacity 0.

**빈 상태:** 앨범이 0개면 크레이트 안에 "albums/ 폴더에 앨범을 넣어주세요"와 README 안내 한 줄.

**접근성:** 크레이트는 `role="listbox"`, 맨 앞 재킷은 `aria-selected="true"`인 `role="option"`. 넘길 때 `aria-live="polite"`로 "앨범명, 아티스트" 안내.

## 5. 3D 턴테이블 (`deck3d.js`)

### 5.1 엔진

- three.js **0.170.0** 을 import map으로 고정한다:
  `"three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"`,
  `"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"`.
- 사용 애드온: `RoomEnvironment`(반사용 환경광), `RoundedBoxGeometry`(몸체).
- `WebGLRenderer({ antialias: true, alpha: false })`, `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping`, `toneMappingExposure = 1.0`.
- 픽셀 비율: `min(devicePixelRatio, 2)`.

### 5.2 장면 구성 (단위: 1 = 플린스 좌표 100)

플린스 2D 좌표계(`arm.js`의 1200×780, DISC·PIVOT·ARM_LENGTH)를 그대로 바닥 평면(XZ)에 놓는다. 그래서 톤암·LP 반경 계산이 2D와 같다.

| 부품 | 형태 | 재질 |
|---|---|---|
| 플린스 | RoundedBox 12×1.1×7.8, 모서리 반경 0.25 | 호두나무: 캔버스로 만든 나무결 텍스처(색+거칠기), `MeshStandardMaterial` roughness 0.55, 윗면 살짝 광택 |
| 상판 | 플린스 위 얇은 판 | 무광 검정 아노다이즈, roughness 0.45 |
| 플래터 | 원기둥 반경 3.5, 두께 0.18 | 알루미늄 `MeshStandardMaterial` metalness 1, roughness 0.25, 옆면 스트로보 점 텍스처 |
| 매트 | 원기둥 반경 3.4, 두께 0.02 | 고무, roughness 0.9 |
| LP | 원기둥 반경 3.3, 두께 0.02, 윗면에 `renderVinyl` 캔버스 텍스처 | `MeshPhysicalMaterial` roughness 0.35, clearcoat 1, clearcoatRoughness 0.15. 반투명 스타일은 transmission 0.6 |
| 스핀들 | 작은 원기둥 | 크롬 |
| 톤암 | 피벗 받침(원기둥), 수평 관절, 직선 관(반경 0.07), 무게추(원기둥), 헤드셸(박스+카트리지), 큐 레버, 암 거치대 | 크롬/알루미늄, 헤드셸 검정, 카트리지 바늘 끝 주황 |
| 버튼 | 시작/정지(사각 0.9×0.5), 33/45(작은 사각) | 알루미늄, 눌리면 0.04 내려감 |
| 파일럿 램프 | 작은 구 | 모터 켜지면 주황 발광(emissive) |
| 바닥 그림자 | 플린스 아래 평면 | `ShadowMaterial` opacity 0.35 |

### 5.3 조명과 시점

- 환경광: `RoomEnvironment`를 PMREM으로 구워 `scene.environment`로 쓴다(금속·광택 반사).
- 주 조명: `DirectionalLight` 강도 2.2, 왼쪽 위 뒤에서, 그림자 맵 1024, `PCFSoftShadowMap`. 그림자는 플린스·플래터·톤암이 만든다.
- 보조: `HemisphereLight` 따뜻한 위/어두운 아래, 강도 0.4.
- 카메라: `PerspectiveCamera` fov 30, 플린스 중심을 35° 각도로 내려다봄. 화면 비율에 맞춰 플린스 전체가 여백 6%로 들어오게 거리를 계산한다(`fitDistance`, 아래 순수 함수).
- 휴대폰 세로 화면: 카메라를 더 위에서(55°) 보아 턴테이블이 화면 폭에 맞게 크게 보이게 한다.

### 5.4 움직임

- 플래터+매트+LP는 하나의 그룹으로 Y축 회전. 속도·관성은 기존 2D와 같다(33⅓=200°/s, 45=270°/s, 시정수 0.25초).
- 회전 중 LP 위 빛: LP는 돌고 조명은 고정이라 클리어코트 반사가 자연히 그 자리에 머문다(별도 연출 없음).
- 톤암: 수평 각도는 2D `s.angle` 그대로, 수직(들림)은 들림 0.35 / 내려앉음 0을 0.35초에 보간한다. 내려앉을 때 마지막에 살짝 튀었다가 안착(ease-out-back).
- 버튼 눌림, 파일럿 램프 켜짐/꺼짐.
- LP 올리기(mount): 스핀들 위 2 높이에서 내려와 안착(0.5초). 꺼내기(eject): 반대.

### 5.5 조작

- 포인터는 `Raycaster`로 판정한다. 톤암(헤드셸·관에 보이지 않는 넓은 판정 원기둥), 버튼 3개.
- 톤암 끌기: 포인터 광선과 바닥 평면(y = 플래터 윗면)의 교점을 플린스 좌표로 바꿔 → `arm.js`의 `clampAngle(atan2(...))`. 놓으면 기존 `dropNeedleAt(radiusForAngle(angle))` 흐름을 그대로 쓴다.
- 커서: 톤암 위 `grab`, 끄는 중 `grabbing`, 버튼 위 `pointer`.
- 키보드·화면 낭독기: 캔버스 위에 보이지 않는(`.sr-only`) HTML 버튼 시작/정지·33·45와 톤암 슬라이더를 둔다. `Space`/`←`/`→`는 지금과 같다.

### 5.6 `deck-geometry.js` (순수)

- `plinthToWorld(x, y): { x, z }`, `worldToPlinth(x, z): { x, y }` — 1200×780 ↔ 월드(중심 원점, 1 = 100).
- `fitDistance(fovDeg, aspect, width, depth, margin = 0.06): number` — 플린스 크기를 화면에 맞추는 카메라 거리.
- `armLift(t: number): number` — 0..1 진행도 → 들림 높이 비율(ease-out-back, 끝값 정확히 0).

### 5.7 렌더 루프와 성능

- `requestAnimationFrame`으로 그리되, 다음이 모두 참이면 그리지 않는다(쉬기): 회전 속도 0, 톤암 보간 끝, 끌기 아님, 전환 중 아님. 상태가 바뀌면 다시 시작한다.
- 탭이 숨겨지면(`visibilitychange`) 루프를 멈춘다. 오디오는 계속 재생되고, 다시 보이면 재생 위치에 맞춰 톤암을 바로 옮긴다(잠금 화면에서 곡이 넘어간 경우 포함).
- LP 텍스처는 1024px, 표지 라벨 포함. 앨범이 바뀔 때만 다시 그린다.
- 크레이트로 돌아가면 덱 캔버스는 숨기고 루프를 멈춘다. GPU 자원은 유지한다(다시 고를 때 빠르게).

### 5.8 대체(2D)

`main.js`가 시작할 때 WebGL2 컨텍스트를 만들 수 없거나 three.js 로드가 실패하면 기존 `turntable.js`를 덱으로 쓴다. 크레이트·라우팅은 같다.

## 6. 곡 정보·힌트

- 데스크톱(> 768px): 턴테이블 오른쪽에 앨범명·아티스트·트랙/시간. 휴대폰: 턴테이블 아래.
- 힌트 문구는 지금과 같다("톤암을 레코드 위로 끌어다 놓으세요" 등).
- 왼쪽 위 "← 레코드 고르기" 버튼(휴대폰에서는 안전 영역 아래).

## 7. 오류 처리

| 상황 | 동작 |
|---|---|
| three.js CDN 로드 실패 / WebGL 없음 | 2D 턴테이블로 대체, 콘솔 경고 |
| WebGL 컨텍스트 손실(`webglcontextlost`) | 루프 정지, 복구되면(`restored`) 씬 다시 만들고 현재 앨범 다시 올림 |
| `#id`에 해당 앨범 없음 | 해시 제거, 크레이트 표시 |
| 표지 로드 실패 | 재킷은 앨범명 슬리브, LP 라벨은 단색(기존 동작) |

## 8. 테스트

- 단위(`node --test`): `router.js`(한글·공백·`#` 들어간 id 왕복, 빈 해시, 디코딩 실패), `crate-math.js`(clamp, 휠·스와이프 판정, offset별 변환·투명도), `deck-geometry.js`(좌표 왕복, DISC 중심이 월드 원점 기준 올바른 위치, fitDistance가 화면 비율에 따라 단조, armLift 끝값 0과 최대값).
- 실제 브라우저(헤드리스 Edge, 실시간 CDP): 크레이트 넘기기 → 고르기 → 해시 변경 → 톤암 끌어 재생(곡 처음부터) → 뒤로 가기로 크레이트 복귀·정지 → 해시로 바로 열기 → WebGL 비활성 시 2D 대체.
- 스크린숏: 데스크톱 1400×820, 휴대폰 375×812, 크레이트·덱 각각.
- 성능: 데스크톱에서 재생 중 프레임 간격 측정(평균 ≤ 20ms), 정지 상태에서 렌더 루프가 쉬는지 확인.

## 9. 배포

- 새 파일은 `js/`, `css/` 안이라 Pages 워크플로 복사 목록 변경 없음.
- README의 "조작" 절을 크레이트·3D 화면 기준으로 갱신한다.

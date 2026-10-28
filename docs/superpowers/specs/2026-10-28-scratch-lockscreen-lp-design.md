# LP 손으로 돌리기(스크래치) + 잠금 화면 LP 그림 — 디자인 스펙

- 날짜: 2026-10-28
- 상태: 사용자 검토 대기
- 바탕: `deck-core.js`(덱 상태), `turntable.js`(위에서 본 턴테이블), `player.js`, `now-playing.js`

## 1. 목적

1. 레코드 면을 손가락·마우스로 잡고 돌리면 실제 LP처럼 소리가 따라온다. 뒤로 돌리면 거꾸로 재생(DJ 스크래치), 앞으로 돌리면 손 속도대로 빨라지거나 느려진다(음높이도 함께).
2. 잠금 화면·다이내믹 아일랜드 그림을 앨범 표지 대신 꾸민 LP의 정지 이미지로 바꾼다.

### 사용자가 말한 것 vs 가정

| 구분 | 내용 |
|---|---|
| 요청 | LP를 거꾸로 돌리면 디제잉 소리, 앞으로 돌리면 돌리는 속도에 맞춰 빨리/천천히. 잠금 화면에 표지 대신 돌아가는 LP |
| 선택 | 잠금 화면 = LP 그림(정지) / 스크래치 = 진짜 곡 소리를 앞뒤로 / 디자인 승인 |
| 가정 | 움직이는 잠금 화면 그림은 iOS가 지원하지 않아 정지 이미지. 소리는 바늘이 내려가 있을 때만. 놓으면 그 위치부터 원래 속도로 계속. 곡마다 처음 잡을 때 1~2초 준비. |

### 성공 기준

1. 레코드 면을 잡으면 LP가 모터 대신 손을 따라 돌고, 톤암은 잡히지 않는다.
2. 바늘이 내려가 있으면: 앞으로 = 손 속도에 비례한 재생(정상 속도로 돌리면 정상 재생), 뒤로 = 거꾸로 재생, 멈추면 무음.
3. 놓으면 손이 옮겨놓은 위치에서 모터 속도로 이어 재생, 톤암·시간 표시가 그 위치를 가리킨다.
4. 소리 준비 전에도 LP는 돌고, 준비되면 바로 소리가 붙는다. 놓을 때·잡을 때 딸깍 소리가 없다.
5. 잠금 화면 그림이 꾸민 LP(라벨에 표지) 이미지다. 안 되는 기기에서는 표지로 남는다.
6. 기존 동작(바늘 놓기→곡 처음, 런아웃, 잠금 화면 버튼, 꾸미기)은 그대로.

### 범위 밖

곡 경계를 넘는 스크래치(현재 곡 안에서만), 스크래치 효과음 합성, 이퀄라이저·필터, 크로스페이더, 녹음.

## 2. 스크래치 동작

### 2.1 입력

- 레코드 영역(`.tt-record`)에서 `pointerdown` → 포인터 캡처, 스크래치 시작. 톤암 잡기 영역(`.arm-grab`)은 기존대로 톤암.
- 포인터 위치를 레코드 중심 기준 각도로 바꾸고, 직전 각도와의 차이를 −180°..180°로 펼쳐(`unwrapDelta`) 누적한다. 시계 방향(재생 방향) = 양수.
- 각속도(°/s)는 지수 평활(시정수 40ms)로 매끄럽게 하고, 80ms 동안 움직임이 없으면 0으로 본다.
- 레코드는 손 각도를 그대로 따라 회전한다(`state.rotation`).

### 2.2 재생 속도

- `rate = 각속도 / DEG_PER_SEC[rpm]` (33: 200°/s, 45: 270°/s), −4..4로 자름. 정상 속도로 돌리면 1.
- 바늘이 내려가 있지 않으면 소리 없음(`rate` 무시).

### 2.3 소리 엔진 (`js/scratch.js` + `js/scratch-worklet.js`)

- 첫 사용 시 `AudioContext` 생성(사용자 동작 안에서), `audioWorklet.addModule('js/scratch-worklet.js')`.
- 잡는 순간 현재 트랙 `src`를 `fetch` → `decodeAudioData` → 모노로 합치고 **현재 위치 ±60초** 구간만 `Float32Array`로 남김(원본 버퍼는 버림). 같은 트랙·같은 구간이면 재사용(캐시 1개).
- 준비되는 동안: LP는 돌고, 위치는 `rate`를 적분해 계속 추적한다(준비되면 그 위치부터 소리).
- 준비되면: `<audio>`를 일시정지하고, 워크릿에 `{ samples, sampleRate, start, position }`을 넘긴다. 손이 움직이는 동안 `rate`를 메시지로 보내고, 워크릿은 매 샘플 `rate`를 목표값 쪽으로 보간하며(16ms) 위치를 이동, 선형 보간으로 샘플을 읽는다. 구간 끝에 닿으면 그 자리에서 멈춘다(무음).
- 워크릿은 위치를 주기적으로(50ms) 돌려보낸다. 덱은 그 위치를 앨범 시간으로 바꿔 톤암·시간 표시를 갱신한다.
- 놓으면: 워크릿 출력을 15ms 페이드아웃, 마지막 위치로 `player.seek(곡 시작 + 위치)`, 바늘이 내려가 있고 모터가 켜져 있으면 `<audio>` 재생 재개(기존 deck-core 흐름).
- 잡는 순간도 15ms 페이드인. 이득 1, 출력 = `AudioContext.destination`.
- 디코딩 실패·`AudioWorklet` 미지원: 스크래치 소리 없이 LP만 돌고, 놓으면 적분한 위치로 이동(토스트 없음).

### 2.4 덱 상태 (`deck-core.js` 확장)

- `startScratch()`: `state.scratching = true`, 모터 회전 대신 손 회전, 재생 동기화 루프는 `<audio>`를 멈춘 상태로 둔다(오디오는 엔진이 담당).
- `scratchTo(rotationDeg, timeSec)`: 회전과 현재 앨범 시간 갱신(톤암이 시간 따라감).
- `endScratch(timeSec)`: `scratching = false`, `player.seek(timeSec)`, 기존 `audible` 규칙으로 재생 재개.
- 스크래치 중 `tick`은 회전·톤암을 덮어쓰지 않는다.

### 2.5 순수 계산 (`js/scratch-math.js`, Node 테스트)

- `unwrapDelta(prevDeg, nextDeg) → −180..180`
- `rateFromVelocity(degPerSec, rpm) → −4..4`
- `smoothVelocity(prev, sample, dtSec, tau = 0.04) → number`
- `windowAround(positionSec, durationSec, span = 60) → { start, end }` (곡 길이 안으로)
- `readLinear(samples, pos) → number` (범위 밖 0)
- `advance(pos, rate, sampleRate, frames) → number`

## 3. 잠금 화면 LP 그림

- `renderVinyl`로 512×512 캔버스에 현재 look의 LP를 그리고(트랙 경계 포함, 중앙 정렬, 투명 배경 대신 덱 배경색), 아래로 부드러운 그림자.
- `canvas.toBlob('image/png')` → `URL.createObjectURL` → `MediaMetadata.artwork = [{ src: blobUrl, sizes: '512x512', type: 'image/png' }, 표지]`(LP 먼저, 표지는 대체용).
- 레코드를 올릴 때, 꾸미기가 바뀔 때(500ms 디바운스) 다시 만든다. 이전 blob URL은 `revokeObjectURL`.
- 블롭 생성 실패면 표지만.
- `now-playing.js`: `nowPlayingInfo(album, index, baseHref, lpArtwork?)` — `lpArtwork`가 있으면 맨 앞에.

## 4. 오류 처리

| 상황 | 동작 |
|---|---|
| `AudioContext`/`AudioWorklet` 없음 | 스크래치 무음, LP·위치 이동만 |
| 트랙 받기·디코딩 실패 | 같음 |
| 스크래치 중 트랙 끝/처음 도달 | 그 자리에 멈춤(무음), 놓으면 곡 경계로 이동 |
| 스크래치 중 다른 앨범으로 이동 | 엔진 정지, 상태 초기화 |
| 잠금 화면 블롭 실패 | 표지 그림 |

## 5. 테스트

- 단위: `scratch-math.js` 전 함수(360° 경계, ±4 자르기, 평활, 구간이 곡 처음·끝에서 잘림, 보간 경계, 음수 rate 이동), `deck-core` 스크래치(시작 시 `<audio>` 정지, `scratchTo`로 톤암 각도 = 시간, `endScratch` 후 그 위치에서 재생 재개, 바늘이 들려 있으면 재생 안 함), `nowPlayingInfo` LP 그림이 먼저.
- 브라우저(실시간 CDP): 재생 중 레코드를 잡아 앞으로 빠르게/느리게/뒤로 돌리기 → 워크릿 위치가 그 방향으로 움직임 → 놓으면 `<audio>`가 그 위치에서 재생, 톤암 위치 일치, 콘솔 오류 0. 미디어 세션 artwork 첫 항목이 `blob:` PNG.
- 실기기(사용자): 아이폰 잠금 화면에 LP 그림이 뜨는지.

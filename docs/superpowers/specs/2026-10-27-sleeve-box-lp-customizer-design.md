# 입체 앨범 재킷 + LP 꾸미기 — 디자인 스펙

- 날짜: 2026-10-27
- 상태: 사용자 검토 대기
- 바탕: `2026-10-26-crate-3d-deck-design.md`(개정 절 포함)의 커버플로우·위에서 본 턴테이블

## 1. 목적

1. 커버플로우의 재킷을 **두께 있는 진짜 LP 재킷 + 비닐 래핑**으로 입체감 있게 만들고, 넘길 때 움직임을 준다.
2. 턴테이블 화면에 **LP 꾸미기** 기능을 넣는다. 꾸밀 수 있는 항목은 많게.

### 사용자가 말한 것 vs 가정

| 구분 | 내용 |
|---|---|
| 요청 | 앨범마다 가상의 포장 박스를 입체로, LP 모양 커스텀 기능 + 커스텀 항목 많이 |
| 선택 | 저장 = 이 기기 + 코드 복사 / 꾸밀 항목 = 전부(색·무늬, 모양·크기, 라벨, 질감·턴테이블) / 포장 = LP 재킷 + 비닐 래핑 / 디자인 승인 |
| 가정 | 재킷(포장)은 꾸미지 않는다. 모양 디스크는 홈이 안쪽 원에만 있어 바늘 놓을 영역이 좁다. 꾸민 값은 그 브라우저에만 남는다. 기존 기능(바늘→곡 처음, 런아웃, 잠금 화면, 홈 화면 아이콘)은 그대로. |

### 성공 기준

1. 커버플로우 재킷에 두께(옆면·윗면)가 보이고, 옆면에 앨범명·아티스트가 세로로 적혀 있으며, 비닐 광택과 스티커가 있다.
2. 넘기면 재킷이 회전하며 옆면이 드러나고, 손가락을 따라 재킷 줄이 움직이며, 놓으면 살짝 넘쳤다가 자리 잡는다.
3. 턴테이블 화면 오른쪽 아래 **꾸미기** 버튼 → 패널에서 바꾸는 값이 즉시 LP에 보인다.
4. 무늬 9가지, 모양 5가지, 크기 3가지, 라벨 설정, 질감, 턴테이블 몸체 색, 톤암 색을 바꿀 수 있다.
5. 새로고침해도 그 앨범의 꾸민 모양이 유지되고, **되돌리기**로 원래대로 돌아간다.
6. **모두에게 적용**을 누르면 `album.json`에 붙여넣을 JSON이 클립보드에 복사되고, 그걸 넣어 올리면 모두에게 같은 모양으로 보인다.
7. 크기·모양이 달라도 바늘을 놓으면 그 자리의 곡이 처음부터 재생되고, 라벨 쪽 런아웃에서는 멈춘다.

### 범위 밖

재킷 꾸미기, 꾸민 모양을 서버로 공유, 이미지 업로드(픽처 디스크는 앨범 표지만), 꾸미기 기록(실행 취소 단계).

## 2. 꾸미기 값 (look)

한 앨범의 LP 모양을 나타내는 객체. `album.json`과 브라우저 저장소가 같은 모양을 쓴다.

```json
{
  "vinyl":  { "style": "marble", "color": "#c0392b", "accent": "#f5d76e", "shape": "round", "size": 12 },
  "label":  { "mode": "cover", "size": 0.36, "color": "#111111", "text": "#ffffff", "showTitle": false, "ring": true },
  "finish": { "grooves": 0.5, "gloss": 0.6 },
  "deck":   { "body": "auto", "arm": "silver" }
}
```

| 항목 | 허용 값 | 기본값 |
|---|---|---|
| `vinyl.style` | `black` `solid` `translucent` `marble` `splatter` `gradient` `half` `glitter` `picture` | `color`가 있으면 `solid`, 없으면 `black` |
| `vinyl.color`, `vinyl.accent` | `#rrggbb` | 표지 팔레트 1·2번째 색 |
| `vinyl.shape` | `round` `heart` `star` `hexagon` `flower` | `round` |
| `vinyl.size` | `7` `10` `12` (인치) | `12` |
| `label.mode` | `cover` `color` `text` | 표지가 있으면 `cover`, 없으면 `text` |
| `label.size` | 0.25–0.45 (레코드 반지름 대비), 모양별 상한(4절) | 0.36 |
| `label.color`, `label.text` | `#rrggbb` (라벨 바탕색, 글자색) | 팔레트에서 / 대비 자동 |
| `label.showTitle`, `label.ring` | 불리언 | `false`, `true` |
| `finish.grooves`, `finish.gloss` | 0–1 | 0.5, 0.6 |
| `deck.body` | `auto` 또는 `#rrggbb` | `auto`(표지 색) |
| `deck.arm` | `silver` `gold` `black` | `silver` |

- 기존 `album.json`의 `vinyl.style/color/accent`, `label.color/text`, `rpm`은 그대로 유효하다(하위 호환).
- **합치기 순서:** 기본값 ← `album.json` ← 이 기기 저장값. 뒤가 이긴다. 허용되지 않는 값은 버리고 기본값을 쓴다(오류 없음).

### `js/look.js` (순수, Node 테스트)

- `normalizeLook(raw): Look` — 위 표의 허용 값만 남김, 숫자는 범위로 자름, 모양별 라벨 상한 적용.
- `mergeLook(...layers): Look` — 앞에서 뒤로 깊은 병합 후 `normalizeLook`.
- `defaultLook(album, palette, hasCover): Look`
- `lookDiff(look, base): Partial<Look>` — `base`와 다른 항목만(코드 복사·저장용).
- `albumJsonSnippet(album, look, base): string` — `album.json` 전체(제목·아티스트·연도 + `lookDiff`)를 2칸 들여쓰기 JSON으로.
- `grooveFor(look): { outer, inner }` — DISC 반지름 대비 비율(5절).
- `build-manifest.mjs`도 `normalizeLook`으로 `album.json`의 꾸미기 값을 검증한다.

## 3. 저장 (이 기기)

- `localStorage` 키 `lp:look:<album.id>`, 값은 `lookDiff` JSON. 읽기·쓰기는 try/catch(사생활 보호 모드 등에서는 저장 없이 동작).
- 값을 바꿀 때마다 200ms 디바운스 후 저장. **되돌리기** = 키 삭제 + `album.json` 기준으로 다시 그림.

## 4. 그리기 (`js/vinyl.js` 확장)

- **크기:** 레코드 반지름 = DISC.r × {12: 1, 10: 0.83, 7: 0.58}. 작은 레코드면 둘레에 매트가 보인다.
- **모양:** 캔버스를 모양 경로로 잘라 그린다. 홈은 모양 안에 내접하는 원 안에만 그린다. 내접 비율: round 1, hexagon 0.866, flower 0.8, heart 0.7, star 0.55. 라벨 크기 상한 = 내접 비율 × 0.7(별은 0.385).
- **새 무늬:** `gradient`(색→보조색 원뿔 그라데이션), `half`(대각선으로 반반), `glitter`(작은 반짝이 점 수백 개, 밝기 무작위).
- **라벨:** `cover` = 표지 원형, `color` = 단색, `text` = 단색 + 앨범명·아티스트. `showTitle`이면 표지 위에도 아래쪽에 작은 제목. `ring`이면 라벨 테두리.
- **질감:** `grooves`가 홈 선의 진하기(0.3–1.6배), `gloss`가 고정 반사층(`.tt-sheen`)의 불투명도(0–1.4배).
- **턴테이블:** `deck.body`가 `auto`가 아니면 `deckColors` 대신 그 색(배경·글자색은 그 색으로 다시 계산). `deck.arm`에 따라 톤암 그라데이션 색 묶음 교체.

## 5. 홈 위치와 톤암 (크기·모양 반영)

- `grooveFor(look)`: `scale = sizeFactor × inscribed(shape)`, `outer = 0.96 × scale`, `inner = (label.size + 0.04) × sizeFactor`. `outer − inner < 0.12`면 라벨을 줄여 맞춘다(normalize 단계).
- `timeline.js`: `radiusToTime(r, total, groove = GROOVE)`, `timeToRadius(t, total, groove = GROOVE)`, `gapRadii(durations, groove = GROOVE)` — 기존 호출은 그대로 동작.
- `arm.js`: `clampAngle(deg, max = ARM.max)` — 덱이 `angleForRadius(groove.inner − 0.04)`를 최대 각도로 넘긴다.
- `deck-core`: `setGroove(groove)`가 바늘 위치↔시간 계산에 쓰이고, 놓은 자리가 `groove.outer + 0.02`보다 밖이면 레코드 밖으로 보고 거치대로 돌린다.

## 6. 꾸미기 패널 (`js/customizer.js`)

- 턴테이블 화면 오른쪽 아래 떠 있는 **꾸미기** 버튼(붓 아이콘 + 글자). 휴대폰: 아래에서 올라오는 시트(화면 높이 60%, 위에 LP가 보이게), 데스크톱: 오른쪽 패널(폭 360px). `Esc`·바깥 탭·닫기 버튼으로 닫힘.
- 탭 4개: **색·무늬 / 모양·크기 / 라벨 / 질감·턴테이블**.
  - 무늬: 각 무늬의 작은 미리보기 원(48px 캔버스) 9개.
  - 색: 표지 팔레트 5색 + 기본 8색(검정·흰색·빨강·주황·노랑·초록·파랑·보라) 견본 + 직접 고르기(`<input type="color">`). 보조색도 같은 방식.
  - 모양: 모양 아이콘 5개. 크기: 7/10/12 분절 버튼.
  - 라벨: 종류 3개, 크기 슬라이더, 바탕·글자색 견본, 제목 표시·테두리 토글.
  - 질감: 홈 선명도·광택 슬라이더. 턴테이블: 몸체 색(자동 + 견본 + 직접), 톤암 은·금·검정.
- 바닥 고정 줄: **되돌리기** · **모두에게 적용**(코드 복사 → 토스트 "album.json에 붙여넣을 코드를 복사했어요"). 클립보드가 막히면 코드가 든 텍스트 상자를 보여준다.
- 값이 바뀌면 60ms 안에 다시 그림(같은 프레임 내 여러 변경은 한 번만). 재생 중에도 끊김 없이 적용.
- 접근성: 모든 견본·버튼은 `aria-label`/`aria-pressed`, 슬라이더는 `<input type="range">`, 패널은 `role="dialog" aria-modal="false"`, 열면 첫 탭으로 포커스.

## 7. 입체 재킷 (커버플로우)

- 재킷 = CSS 3D 상자(`transform-style: preserve-3d`): 앞면(표지), 왼·오른 옆면(두께 = 재킷 크기의 3.2%), 윗면. 옆면은 종이 색(표지 가장자리 색을 어둡게) + 세로 글자(앨범명 · 아티스트), 윗면은 밝은 종이 결.
- 비닐 래핑: 앞면 위 반사층 — 사선 광택 띠, 아주 옅은 주름 결, 오른쪽 가장자리(입구) 절개선. 광택 띠 위치는 재킷 회전 각도(`--tilt`)에 따라 이동.
- 스티커: 오른쪽 위 지름 17% 원형, 연도(없으면 "NEW") + "LP" 두 줄, 살짝 기울어짐.
- 움직임:
  - 끌기 따라가기: 포인터를 누른 채 가로로 움직이면 재킷 줄이 손가락을 따라 연속으로 움직인다(`coverflowTransform`가 소수 offset을 앞뒤 정수 결과의 선형 보간으로 처리).
  - 놓으면 가장 가까운 재킷으로 스냅, 살짝 넘치는 곡선(`cubic-bezier(.2, 1.25, .35, 1)`, 0.55초).
  - 버튼·휠·키로 넘길 때도 같은 곡선. `prefers-reduced-motion`이면 넘침 없이 0.2초.
- 고를 때: 재킷 입구 쪽으로 LP가 빠져나옴(기존 동작 유지).

## 8. 오류 처리

| 상황 | 동작 |
|---|---|
| 저장소 사용 불가 | 저장 없이 동작, 패널에 "이 브라우저에서는 저장되지 않아요" 한 줄 |
| 저장값이 깨진 JSON | 무시하고 키 삭제 |
| 클립보드 거부 | 코드 텍스트 상자 표시(선택된 상태) |
| `album.json` 꾸미기 값 잘못됨 | 그 항목만 기본값, 빌드 경고 |

## 9. 테스트

- 단위: `look.js`(허용 값·범위·모양별 라벨 상한, 합치기 우선순위, `lookDiff`·`albumJsonSnippet` 왕복, `grooveFor` 값), `timeline.js` groove 인자, `arm.js` `clampAngle` 최대값 인자, `crate-math` 소수 offset 보간, `deck-core`의 `setGroove`(7인치에서 바늘 위치→곡 처음, 레코드 밖 판정), `build-manifest`가 새 항목을 통과/거부.
- 브라우저(실시간 CDP): 꾸미기 열기 → 무늬·모양·크기·라벨 바꾸기 → 새로고침 후 유지 → 되돌리기 → 코드 복사 내용 확인 → 7인치 하트에서 바늘 놓아 재생.
- 스크린숏: 커버플로우 재킷(휴대폰·데스크톱), 꾸미기 패널(휴대폰 시트·데스크톱 패널), 무늬 9가지·모양 5가지 견본.

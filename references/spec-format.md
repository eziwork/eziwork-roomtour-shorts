# spec.json 형식

`scripts/build.mjs`가 읽는 파일이다. 프로젝트 루트(`hyperframes.json` 옆)에 둔다.

```json
{
  "style": "diary",
  "palette": "lilac",
  "src": "assets/source.mp4",
  "duration": 20,
  "volume": 1,
  "captionOffsetY": 0,
  "intro": {
    "start": 0,
    "end": 2.9,
    "top": "korea",
    "lines": ["탁 트인 단지뷰", "아파트", "랜선집구경"],
    "bottom": "roomtour!"
  },
  "captions": [
    { "start": 2.9, "end": 5.3, "lines": ["안녕하세요 오늘은", "단지뷰 아파트 룸투어를 해보려합니다"] },
    { "start": 5.3, "end": 7.7, "kind": "label", "lines": ["거실", "+석재 아트월"], "en": "Living room" }
  ]
}
```

| 필드 | 설명 |
|---|---|
| `style` | `diary` (현재 유일한 스타일) |
| `palette` | 강조 그라데이션: `lilac`(기본) `peach` `mint` `butter` |
| `src` | 프로젝트 기준 영상 경로. `new_project.py`가 `assets/source.mp4`로 복사한다 |
| `duration` | 전체 길이(초). 원본 길이(`analysis/probe.txt`의 duration)를 내림한 값 |
| `volume` | 원본 소리 볼륨 0~1. 기본 1 |
| `captionOffsetY` | 자막을 아래로(+) 또는 위로(-) 옮기는 px. 화면 중앙에 중요한 물체가 있을 때만 쓴다 |
| `intro.top` / `intro.bottom` | 그라데이션 강조 단어. 빈 문자열이면 생략 |
| `intro.lines` | 제목 줄들. 줄당 9자 이하 |
| `captions[].kind` | `"label"`이면 첫 줄이 조금 커진다(방 이름). 생략하면 감상 자막 |
| `captions[].en` | 선택. 라벨 위 영문 그라데이션 줄 (`Living room`) |
| `captions[].offsetY` | 선택. 이 자막만 아래(+)/위(-)로 옮기는 px. 창살·해처럼 복잡한 배경을 피할 때 |
| `captions[].lines` | 1~2줄. 줄당 약 19자 이하(띄어쓰기는 반 글자) |
| `badge` | 선택. `{ "text": "신림동 · 보증금 500 / 월세 35", "start"?: 초, "end"?: 초 }` 화면 위쪽(인스타 상단 UI 아래)에 계속 뜨는 정보 한 줄. 기본은 인트로 끝~영상 끝 |
| `outro` | 선택. `{ "hold": 2.5, "top"?: "roomtour!", "lines": ["신림동 원룸 빌라", "보증금 500 / 월세 35", "문의는 DM 주세요"] }` 영상이 끝난 뒤 마지막 프레임을 `hold`초 멈추고(흐림+어둡게) 그 위에 문구를 띄운다. 전체 길이가 `duration + hold`가 된다. 줄당 15자 이하 |

`outro`를 쓰면 마지막 자막은 마지막 방 라벨로 영상 끝(`duration`)까지 두고, 마무리 문구는 `outro`에 넣는다.

규칙: 자막은 시간순이고 겹치지 않으며, 첫 자막 `start`는 `intro.end`와 같다. 마지막 자막 `end`는 `duration`과 같게 하면 끝까지 남는다(페이드아웃 없음).

`build.mjs`는 겹침, 너무 짧은 자막(1.6초 미만), 너무 긴 줄, 파일 누락을 경고로 알려 준다. 경고가 나오면 고친 뒤 다시 빌드한다.

## vlog · quiz · luxe 추가 필드

| 필드 | 쓰는 버전 | 설명 |
|---|---|---|
| `style` | 전부 | `diary` `vlog` `quiz` `luxe` |
| `*단어*` | vlog quiz luxe | 줄 안에서 포인트 색으로 강조 (diary에서는 그냥 글자) |
| `intro.say` | vlog | 인트로 위 말풍선 + 내레이션. 문자열 또는 줄 배열 |
| `captions[].room` | vlog quiz luxe | 방 이름. 다음 `room`이 나올 때까지 라벨이 남는다. `kind:"label"` 대신 쓴다 |
| `captions[].tags` | quiz | `["단지뷰 통창", "석재 아트월"]` 방 라벨 아래 태그 |
| `captions[].en` | luxe | `Living`, `Kitchen` 같은 영문 방 이름 |
| `captions[].lines` | 전부 | vlog는 말풍선(줄당 15자), quiz는 하단 자막(17자), luxe는 `room`과 함께면 라벨 옆 특징, 아니면 가운데 명조 문장 |
| `captions[].say` | 전부 | 내레이션으로 읽을 문장. 생략하면 `lines`를 읽고, `""`이면 읽지 않는다 |
| `outro.big` | quiz | 가격 카드 큰 줄. `"보증금 1,000"`처럼 앞 단어는 작게 나온다. 줄당 8자 |
| `outro.cta` | quiz | 노란 버튼 문구 |
| `outro.top` | 전부 | vlog 카드 위 주황 글자 / quiz 카드 첫 줄 / luxe 영문 제목(기본 `Private Viewing`) |
| `volume` | 전부 | 원본 소리. `voice.json`이 있으면 기본 0(끔) |

`voice.json`은 `tts.py`가 만든다. 직접 고치지 않는다.

## vlog 전용 필드

| 필드 | 설명 |
|---|---|
| `captions[].tone` | `info` `say`(기본) `explain` `react` `note` `ask` `highlight`. 장식이 정해진다 (style-guide 7절 표) |
| `captions[].pos` | `top` `upper` `mid` `low`. 생략하면 tone별 기본 위치 |
| `captions[].tilt` | 기울기(도). 생략하면 react -4, note -2.5, ask 2 |
| `captions[].sticker` | `sparkle` `heart` `star` `burst` `arrow` `none` |
| `captions[].color` | react 글자색: `hot` `sun` `pink` 또는 색 코드 |
| `captions[].title` | `true`면 이 자막 동안 제목 박스를 위에 작게 다시 띄운다 |
| `intro.lines` | 흰 박스 제목(줄당 11자). `intro.say`는 그 아래 손글씨 한두 줄 |
| `outro.lines` / `outro.say` | 끝 카드의 흰 박스 줄 / 아래 손글씨 한 줄 |
| `vlogPalette` | `{ "hot": "#ff6a3d", "sun": "#ffd447", "pink": "#ff8fb8", "glow": "#8fa8ff", "deep": "#2f5d4f", "tape": "#f1e2bf" }` 중 바꿀 것만 |

vlog에서는 `room`, `badge`를 보통 쓰지 않는다(레퍼런스에 없음). 예시: `examples/04-vlog.spec.json`.

## 배경음 (모든 버전)

| 필드 | 설명 |
|---|---|
| `bgm.src` | 프로젝트 기준 음악 파일 경로 (예: `assets/bgm.mp3`) |
| `bgm.credit` | 곡 출처 메모. `captions.txt`에 남는다 |
| `bgm.offset` | 곡의 몇 초부터 쓸지 (기본 0) |
| `bgm.volume` | 목소리 없는 구간의 크기 (기본 0.85) |
| `bgm.duck` | 목소리 나올 때 크기 (기본 0.22) |
| `bgm.fadeOut` | 끝에서 줄이는 시간 (기본 1.5초) |

빌드가 `assets/bgm-norm.m4a`(음량을 맞추고 자른 파일)를 만들어 쓴다. 원본을 바꾸면 다시 만든다.

## quiz 전용 필드

| 필드 | 설명 |
|---|---|
| `intro.lines` | 위 띠 고정 훅 제목 (영상 내내). 줄당 9자, `*강조*` 한 단어 |
| `intro.bottom` | 제목 아래 작은 줄 |
| `reveal` | `{ "at": 17.7, "lines": ["보증금 500 / 월세 35"] }` 숫자가 `???`로 가려졌다가 `at`초에 공개 |
| `agency` | `{ "name", "owner", "reg", "address", "phone" }` 아래 띠의 중개사무소 표시 (있는 것만) |
| `captions[].room` / `tags` | 영상 왼쪽 위 방 칩 |
| `quizPalette` | `{ "band": "#1d2550", "accent": "#ffd84a" }` 띠·강조 색 |
| `outro.top` / `big` / `lines` / `cta` | 끝 카드 |

## luxe 전용 필드

| 필드 | 설명 |
|---|---|
| `intro.top` | 표지 영문 (기본 `Room Tour`) |
| `brand` / `contact` | 오른쪽 위 작은 워터마크 (영상 내내) |
| `captions[].room` + `en` + `lines` | 방 이름 라벨 (2.8초) |
| `captions[]` (room 없이 `lines`만) | 가운데 명조 문장. 2개 이하 |

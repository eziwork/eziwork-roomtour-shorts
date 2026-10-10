# 외부 자료와 의존성

## 이 저장소에 포함한 것

| 자료 | 위치 | 라이선스 |
|---|---|---|
| Pretendard v1.3.9 (SemiBold·Bold·ExtraBold·Black, 공식 배포 woff2 그대로) | `assets/fonts/` | SIL Open Font License 1.1, 예약 글꼴 이름 Pretendard — `assets/fonts/OFL-Pretendard.txt` |
| Gaegu Bold | `assets/fonts/` | SIL Open Font License 1.1 — `assets/fonts/OFL-Gaegu.txt` |
| Noto Serif KR Regular (KS X 1001 한글만 남긴 woff2) | `assets/fonts/` | SIL Open Font License 1.1 — `assets/fonts/OFL-NotoSerifKR.txt` |
| Cormorant Garamond Italic (라틴 문자만 남긴 woff2) | `assets/fonts/` | SIL Open Font License 1.1 — `assets/fonts/OFL-CormorantGaramond.txt` |
| 예시 이미지 `assets/readme-preview.jpg`, `references/versions.jpg` | | EZIWORK가 직접 촬영한 영상으로 이 스킬이 만든 결과 화면 |

Pretendard는 공식 배포 파일을 수정 없이 넣었습니다. Noto Serif KR과 Cormorant Garamond는 예약 글꼴 이름 조항이 없는 OFL 글꼴로, 굵기 하나를 고르고 필요한 글자만 남겨 용량을 줄였습니다. 글꼴은 단독으로 판매하지 않습니다.

## 실행할 때 받는 것 (포함하지 않음)

| 자료 | 받는 시점 | 조건 |
|---|---|---|
| HyperFrames CLI (`npx hyperframes`) | 처음 렌더링 | HyperFrames 이용 조건 |
| GSAP | 렌더링할 때 CDN에서 | GSAP Standard License |
| Supertonic 3 (Supertone) 패키지·모델 | `doctor.py --install` | 코드 MIT, 모델 OpenRAIL-M — AI 생성 콘텐츠임을 밝힐 의무, 사칭·불법 용도 금지 등 이용 제한 |
| 배경음 (Openverse 검색, 대부분 Jamendo) | `bgm.py` 실행 | 곡마다 CC0 또는 CC BY. CC BY는 출처 표시 필요 (`assets/bgm-credit.txt`) |
| Gemini TTS (선택) | `--engine gemini` | Google Gemini API 이용 약관, 유료 |
| Node.js, Python, ffmpeg, 크롬 | 사용자 설치 | 각 제품의 조건 |

## 레퍼런스

`references/reference-*.md`는 공개된 부동산 쇼츠·릴스의 구성 패턴을 정리한 글입니다. 다른 계정의 영상·이미지·자막 원문은 포함하지 않습니다.

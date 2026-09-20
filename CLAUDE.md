# weather-dashboard

아이폰(+안드로이드)에서 "홈 화면에 추가"해 쓰는 개인용 날씨 대시보드 PWA.
오늘 날씨를 카드로 보여주고, 버튼을 누르면 7일 예보가 펼쳐진다.

## 스택
- 정적 HTML/CSS/JS (빌드 도구 없음, 프레임워크 없음)
- Cloudflare Pages + Pages Functions (`functions/api/weather.js`)로 배포
- 날씨 데이터: OpenWeatherMap One Call API 3.0
  - 참고: 한국 기준 공식 정확도는 기상청(KMA) 단기예보 API가 더 높지만,
    격자좌표 변환과 코드 파싱이 번거로워 스캐폴드는 OpenWeatherMap으로 시작함.
    나중에 KMA로 바꾸려면 `functions/api/weather.js`만 교체하면 됨
    (프런트는 `{current, daily}` 형태만 기대하므로 프록시 내부 구현만 바뀜).

## 파일 구조
```
index.html          진입 페이지
style.css            디자인 토큰 + 스타일 (파일 상단 주석에 팔레트 정리됨)
app.js               위치 확인, API 호출, 버튼 토글
functions/api/weather.js   Cloudflare Pages Function — OpenWeatherMap 프록시, API 키 은닉
manifest.json         PWA manifest
icons/                아이콘 192/512 (지금은 임시 플레이스홀더, 나중에 교체 권장)
wrangler.toml
```

## 로컬 실행
```
wrangler pages dev .
```
로컬에서 `functions/api/weather.js`가 동작하려면 `.dev.vars` 파일에 아래처럼 키를 넣어야 함
(이 파일은 git에 커밋하지 않음, `.gitignore`에 포함됨):
```
OPENWEATHER_API_KEY=여기에_키
```

## 배포
```
wrangler pages deploy . --project-name weather-dashboard
```
배포 후 Cloudflare 대시보드 → Pages → 프로젝트 → Settings → Environment variables 에서
`OPENWEATHER_API_KEY`를 등록해야 실제로 동작함 (production/preview 둘 다).

## 할 일 (TODO)
- [ ] OpenWeatherMap API 키 발급 후 로컬 `.dev.vars` / Cloudflare 대시보드에 등록
- [ ] 아이콘(`icons/icon-192.png`, `icon-512.png`)을 실제 디자인으로 교체 — 지금은 자동 생성된 임시 아이콘
- [ ] 원하면 `functions/api/weather.js`를 기상청(KMA) API로 교체 (정확도 우선 시)
- [ ] 도메인 커스텀 연결 여부 결정

## 디자인 원칙 (style.css 상단 주석 참고)
차분한 중립 팔레트(쿨그레이 배경 + 파란 accent), 시스템 폰트(San Francisco/Roboto 상속),
큰 숫자 하나가 시선을 받는 구조. 카드/버튼 전부 같은 radius로 통일하지 않고
카드(20px)와 버튼(14px)을 구분해 위계를 줌. 다크모드는 `prefers-color-scheme`으로 자동 대응.

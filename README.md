# 게임창고 (Game Warehouse)

웹에서 캐주얼·멀티플레이 게임을 골라 바로 플레이하는 **게임 아케이드**입니다.  
배포: https://sontouf.github.io/game-warehouse/

## 포함 게임

| 게임 | 설명 |
|------|------|
| 테트리스 | 클래식 블록 퍼즐 |
| 팜프렌지 1탄 | 풀·동물·가공·곰·창고·자동차·스테이지 미션 |
| 카트라이더 스타일 | Three.js + PeerJS P2P 레이스 |
| 미니게임 허브 | 아레나·경찰과 도둑·주방장·룰렛·사다리·제비뽑기 (P2P) |
| 스네이크 | 먹이를 먹고 성장 |
| 브레이크아웃 | 벽돌 깨기 |
| 2048 | 숫자 합치기 퍼즐 |

## 로컬 실행

```bash
cd money
python -m http.server 8080
```

브라우저에서 `http://localhost:8080` 접속.

## 광고 (현재 비활성)

AdSense 설정은 `config.js`의 `adsense` 블록을 참고하세요.  
UI·스크립트 광고 호출은 주석 처리되어 있으며, 재활성화 시 `index.html` / `js/core/ads.js` / `js/core/app.js`를 확인하면 됩니다.

## 관리자 모드

- 상단 **관리자** 또는 하단 Admin
- 기본 비밀번호: `admin123` (`config.js`의 `adminPassword`)
- 통계는 브라우저 `localStorage`에 저장됩니다.

## 파일 구조

```
money/
├── index.html              # 엔트리
├── config.js               # 사이트·광고·관리자 설정
├── package.json
├── css/
│   ├── main.css            # 로비·공통 UI
│   └── minihub.css         # 미니게임 허브
├── js/
│   ├── core/               # 앱 셸·광고·분석·랭킹
│   │   ├── app.js
│   │   ├── ads.js
│   │   ├── analytics.js
│   │   └── ranking.js
│   ├── multiplayer/        # PeerJS 버스·호스트 엔진·오디오
│   │   ├── peer-bus.js
│   │   ├── engine.js
│   │   └── audio.js
│   └── games/              # 개별 게임
│       ├── tetris.js
│       ├── farm.js
│       ├── farm-stages.js
│       ├── kart.js
│       ├── snake.js
│       ├── breakout.js
│       ├── puzzle-2048.js
│       ├── minihub.js
│       └── minihub-client.js
├── tools/
│   └── kart-sim.html       # 카트 로드/비주얼 테스트용 페이지
├── scripts/
│   ├── build/              # 빌드·일회성 정리
│   ├── test/               # Playwright·스모크 테스트
│   └── archive/            # 사용한 패치 스크립트 보관
├── archive/
│   └── bracket-program/    # 구 대진표 프로그램 (미사용)
└── test-results/           # 테스트 산출물 (gitignore)
```

### 네이밍

- 폴더·파일: 영어 **kebab-case** (`puzzle-2048.js`, `farm-stages.js`)
- 게임 모듈 ID: 기존 호환 유지 (`puzzle2048`, `FF1_STAGES` 별칭 + `FARM_STAGES`)

## npm 스크립트

```bash
npm run build:minihub        # 미니허브 클라이언트 재생성
npm run test:kart-8p         # 카트 8인 부하
npm run test:kart-mobile-net # 모바일·네트워크 부하
npm run test:kart-peer       # Peer 핸드셰이크
```

## 로비 · 공개방

1. **참가 아이디** 입력  
2. **방 만들기** — 카드라이더 / 아레나 / 경찰과 도둑 중 선택 → 방장이 공개 로비에 등록  
3. **방 참가** — 공개방 목록 또는 코드  
4. **랭킹** — 명예의 전당으로 이동  

공개방 목록은 PeerJS 디렉터리(`GWPublicRooms`)로 서버 없이 공유됩니다.

솔로 게임(테트리스·팜·스네이크 등)은 아래 카드에서 바로 플레이합니다.

## P2P 네트워킹

서버 없이 PeerJS 메시로 동작합니다.

- **카트**: 각 플레이어가 자기 카트 물리를 담당하고, 상태를 메시로 직접 공유합니다. 방장은 봇·카운트다운·결과만 조율합니다.
- **미니게임**: 입력은 메시로 전원에 전달되고, 월드 스냅샷은 unreliable + 릴레이 fan-out으로 방장 업링크 부하를 나눕니다.
- 방장 이탈 시 카트는 남은 피어가 승계를 시도합니다.


Settings → Pages → Branch: `main` / folder: `/ (root)`  
→ `https://<username>.github.io/<repo>/`

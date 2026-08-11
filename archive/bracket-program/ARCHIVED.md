# 대진표 프로그램 (보관 · 미사용)

이 폴더의 **대진표/코스게임 서버** 기능은 게임창고(`money/`)에 통합하지 않습니다.

미니게임(아레나·경찰과 도둑·주방장·룰렛·사다리·제비뽑기)은 아래처럼 **서버 없이 PeerJS P2P**로 `money` 본체에 이식되었습니다.

- `js/multiplayer/engine.js` — 호스트 권위 시뮬
- `js/multiplayer/peer-bus.js` — PeerJS 방
- `js/multiplayer/audio.js` — 미니게임 오디오
- `js/games/minihub.js` + `minihub-client.js` — UI
- `js/core/ranking.js` — 통합 랭킹 (localStorage)

대진표·스탭·SSE·Cloudflare 터널 등 수련회용 기능은 이 폴더에만 남아 있으며, 배포 사이트에서는 사용하지 않습니다.

# 게임창고 (Game Warehouse)

웹에서 캐주얼 게임을 골라 바로 플레이하는 **게임 아케이드**입니다.  
광고로 수익을 낼 수 있고, 관리자 모드에서 이용자·광고·추정 수익을 확인할 수 있습니다.

## 포함 게임

| 게임 | 설명 |
|------|------|
| 테트리스 | 클래식 블록 퍼즐 |
| 팜프렌지 1탄 | 생산·가공·판매 타임매니지먼트 (오리지널) |
| 스네이크 | 먹이를 먹고 성장 |
| 브레이크아웃 | 벽돌 깨기 |
| 2048 | 숫자 합치기 퍼즐 |

## 로컬 실행

```bash
cd money
python -m http.server 8080
```

브라우저에서 `http://localhost:8080` 접속.

## 광고로 수익 내기 (AdSense)

1. [Google AdSense](https://www.google.com/adsense/)에 사이트(도메인)를 등록·승인받습니다.
2. `config.js`를 열어 아래 값을 실제 ID로 바꿉니다.

```js
adsense: {
  enabled: true,
  client: "ca-pub-xxxxxxxxxxxxxxxx",
  slots: {
    bannerTop: "xxxxxxxxxx",
    bannerBottom: "xxxxxxxxxx",
    interstitial: "xxxxxxxxxx"
  }
}
```

3. 관리자 모드에서 **AdSense 실광고 사용**을 켜거나, `enabled: true`로 배포합니다.

승인 전에는 **데모 광고**가 표시되며, 노출·클릭이 통계에 집계됩니다.  
실제 현금 정산은 AdSense 대시보드 기준입니다. 사이트 관리자의 **추정 수익**은 CPM 설정으로 계산한 참고값입니다.

## 관리자 모드

- 상단 **관리자** 메뉴 또는 하단 Admin 링크
- 기본 비밀번호: `admin123` (`config.js`의 `adminPassword`에서 변경)
- 확인 가능 지표: 누적 이용자, 페이지뷰, 게임 시작 수, 광고 노출/클릭, 추정 수익, 게임별 플레이, 일별 추이

> 통계는 브라우저 `localStorage`에 저장됩니다. 같은 브라우저/기기에서 관리자가 확인할 수 있습니다.  
> 전 세계 이용자를 한곳에 모으려면 Firebase 등 백엔드 연동을 추가하면 됩니다.

## 파일 구조

```
money/
├── index.html
├── style.css
├── config.js
├── js/
│   ├── app.js
│   ├── ads.js
│   ├── analytics.js
│   └── games/
│       ├── tetris.js
│       ├── farm.js
│       ├── snake.js
│       ├── breakout.js
│       └── puzzle2048.js
└── README.md
```

## 배포 (GitHub Pages)

이 저장소는 GitHub Pages로 정적 배포됩니다.

1. Settings → Pages → Branch: `main` / folder: `/ (root)`
2. 잠시 후 `https://<username>.github.io/<repo>/` 로 접속

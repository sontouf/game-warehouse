/* Game Warehouse config — AdSense / admin / monetization */
window.GW_CONFIG = {
  siteName: "게임창고",
  siteTagline: "캐주얼 게임을 골라 바로 플레이",

  /* Google AdSense: 승인 후 실제 ID로 교체하세요 */
  adsense: {
    enabled: false,
    client: "ca-pub-XXXXXXXXXXXXXXXX",
    slots: {
      bannerTop: "1234567890",
      bannerBottom: "0987654321",
      interstitial: "1122334455"
    }
  },

  /* 데모 광고 CPM(원) — 실제 수익 추정용. AdSense 대시보드와 별도로 표시됩니다 */
  demoCpmKrw: 1200,

  /* 관리자 비밀번호 (기본: admin123) — 배포 전 반드시 변경하세요 */
  adminPassword: "admin123",

  /* 통계 저장 키 */
  storageKey: "game-warehouse-stats-v1"
};

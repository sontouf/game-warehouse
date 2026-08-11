(function (global) {
  "use strict";

  var KEY = (global.GW_CONFIG && global.GW_CONFIG.storageKey) || "game-warehouse-stats-v1";
  var VISITOR_KEY = "game-warehouse-visitor-id";

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function uid() {
    return "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function defaultStats() {
    return {
      visitors: [],
      pageViews: 0,
      gameStarts: 0,
      gamePlays: {},
      adImpressions: 0,
      adClicks: 0,
      estimatedRevenueKrw: 0,
      daily: {},
      updatedAt: null
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaultStats();
      var data = JSON.parse(raw);
      return Object.assign(defaultStats(), data);
    } catch (e) {
      return defaultStats();
    }
  }

  function save(stats) {
    stats.updatedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(stats));
    return stats;
  }

  function ensureDay(stats, day) {
    if (!stats.daily[day]) {
      stats.daily[day] = {
        visitors: [],
        pageViews: 0,
        gameStarts: 0,
        adImpressions: 0,
        adClicks: 0,
        revenueKrw: 0
      };
    }
    return stats.daily[day];
  }

  function getVisitorId() {
    var id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = uid();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  }

  function getCpm() {
    var override = localStorage.getItem("game-warehouse-cpm");
    if (override !== null && override !== "") return Number(override) || 0;
    return (global.GW_CONFIG && global.GW_CONFIG.demoCpmKrw) || 1200;
  }

  function setCpm(value) {
    localStorage.setItem("game-warehouse-cpm", String(value));
  }

  function revenueForImpression() {
    return getCpm() / 1000;
  }

  var Analytics = {
    trackVisit: function () {
      var stats = load();
      var day = today();
      var d = ensureDay(stats, day);
      var vid = getVisitorId();

      stats.pageViews += 1;
      d.pageViews += 1;

      if (stats.visitors.indexOf(vid) === -1) stats.visitors.push(vid);
      if (d.visitors.indexOf(vid) === -1) d.visitors.push(vid);

      return save(stats);
    },

    trackGameStart: function (gameId) {
      var stats = load();
      var day = today();
      var d = ensureDay(stats, day);
      stats.gameStarts += 1;
      d.gameStarts += 1;
      stats.gamePlays[gameId] = (stats.gamePlays[gameId] || 0) + 1;
      return save(stats);
    },

    trackAdImpression: function () {
      var stats = load();
      var day = today();
      var d = ensureDay(stats, day);
      var rev = revenueForImpression();
      stats.adImpressions += 1;
      d.adImpressions += 1;
      stats.estimatedRevenueKrw += rev;
      d.revenueKrw += rev;
      return save(stats);
    },

    trackAdClick: function () {
      var stats = load();
      var day = today();
      var d = ensureDay(stats, day);
      stats.adClicks += 1;
      d.adClicks += 1;
      return save(stats);
    },

    getStats: function () {
      return load();
    },

    reset: function () {
      localStorage.removeItem(KEY);
      return defaultStats();
    },

    getCpm: getCpm,
    setCpm: setCpm
  };

  global.GWAnalytics = Analytics;
})(window);

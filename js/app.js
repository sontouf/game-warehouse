(function () {
  "use strict";

  var currentGame = null;
  var adminAuthed = sessionStorage.getItem("gw-admin") === "1";

  var els = {};

  function $(id) { return document.getElementById(id); }

  function gameList() {
    var g = window.GWGames || {};
    return ["tetris", "farm", "kart", "snake", "breakout", "puzzle2048"]
      .map(function (id) { return g[id]; })
      .filter(Boolean);
  }

  function init() {
    els.siteName = $("site-name");
    els.siteTagline = $("site-tagline");
    els.gameGrid = $("game-grid");
    els.viewLobby = $("view-lobby");
    els.viewGame = $("view-game");
    els.viewAdmin = $("view-admin");
    els.gameStage = $("game-stage");
    els.gameTitle = $("game-title");
    els.gameScore = $("game-score");
    els.gameHint = $("game-hint");
    els.adminGate = $("admin-gate");
    els.adminDash = $("admin-dash");
    els.adminForm = $("admin-form");
    els.adminPassword = $("admin-password");
    els.adminError = $("admin-error");
    els.statGrid = $("stat-grid");
    els.gameRank = $("game-rank");
    els.dailyChart = $("daily-chart");
    els.cfgCpm = $("cfg-cpm");
    els.cfgAdsense = $("cfg-adsense");

    if (window.GW_CONFIG) {
      els.siteName.textContent = GW_CONFIG.siteName || "게임창고";
      els.siteTagline.textContent = GW_CONFIG.siteTagline || "";
      document.title = (GW_CONFIG.siteName || "게임창고") + " — 캐주얼 게임 아케이드";
    }

    renderLobby();
    bindNav();
    bindAdmin();

    if (window.GWAnalytics) GWAnalytics.trackVisit();
    if (window.GWAds) GWAds.fillSlots();

    var hash = (location.hash || "#lobby").replace("#", "");
    showView(hash === "admin" ? "admin" : hash.indexOf("game-") === 0 ? hash : "lobby");
  }

  function renderLobby() {
    els.gameGrid.innerHTML = "";
    gameList().forEach(function (game, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "game-card";
      btn.style.setProperty("--accent", game.accent || "#2de2c5");
      btn.style.setProperty("--delay", i * 70 + "ms");
      btn.innerHTML =
        '<span class="game-card__emoji">' + game.emoji + "</span>" +
        "<h3>" + game.title + "</h3>" +
        "<p>" + game.desc + "</p>" +
        '<div class="game-card__meta">' +
        (game.tags || []).map(function (t) { return '<span class="pill">' + t + "</span>"; }).join("") +
        "</div>";
      btn.addEventListener("click", function () { launchGame(game.id); });
      els.gameGrid.appendChild(btn);
    });
  }

  function bindNav() {
    document.querySelectorAll("[data-nav]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        showView(el.getAttribute("data-nav"));
      });
    });
    $("btn-back").addEventListener("click", function () { showView("lobby"); });
  }

  function showView(name) {
    if (name === "lobby" || name === "admin") stopGame();

    var map = {
      lobby: els.viewLobby,
      game: els.viewGame,
      admin: els.viewAdmin
    };

    var target = name;
    if (name.indexOf("game-") === 0) {
      target = "game";
      launchGame(name.replace("game-", ""), true);
    }

    Object.keys(map).forEach(function (key) {
      var el = map[key];
      var on = key === target;
      el.hidden = !on;
      el.classList.toggle("is-visible", on);
    });

    document.querySelectorAll(".nav-link").forEach(function (n) {
      n.classList.toggle("is-active", n.getAttribute("data-nav") === (target === "game" ? "lobby" : target));
    });

    if (target === "admin") {
      location.hash = "admin";
      refreshAdminUi();
    } else if (target === "lobby") {
      location.hash = "lobby";
    }

    if (window.GWAds && target !== "game") GWAds.fillSlots();
  }

  function launchGame(id, skipAd) {
    var game = (window.GWGames || {})[id];

    function start() {
      stopGame();
      els.viewLobby.hidden = true;
      els.viewAdmin.hidden = true;
      els.viewGame.hidden = false;
      location.hash = "game-" + id;

      if (!game || typeof game.create !== "function") {
        els.gameTitle.textContent = "게임 로드 실패";
        els.gameHint.textContent = "스크립트를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.";
        els.gameScore.textContent = "0";
        els.gameStage.innerHTML =
          '<p style="padding:24px;color:#ffc857;text-align:center;">게임을 시작할 수 없습니다 (' + id + ").</p>";
        return;
      }

      els.gameTitle.textContent = game.title;
      els.gameHint.textContent = game.hint || "";
      els.gameScore.textContent = "0";
      els.gameStage.innerHTML = "";

      if (window.GWAnalytics) GWAnalytics.trackGameStart(id);

      currentGame = game.create(els.gameStage, {
        setScore: function (n) { els.gameScore.textContent = String(n); }
      });
    }

    if (skipAd) start();
    else if (window.GWAds) GWAds.showInterstitial(start);
    else start();
  }

  function stopGame() {
    if (currentGame && currentGame.destroy) currentGame.destroy();
    currentGame = null;
    els.gameStage.innerHTML = "";
  }

  function bindAdmin() {
    els.adminForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var expected = (window.GW_CONFIG && GW_CONFIG.adminPassword) || "admin123";
      if (els.adminPassword.value === expected) {
        adminAuthed = true;
        sessionStorage.setItem("gw-admin", "1");
        els.adminError.hidden = true;
        refreshAdminUi();
      } else {
        els.adminError.hidden = false;
      }
    });

    $("btn-logout").addEventListener("click", function () {
      adminAuthed = false;
      sessionStorage.removeItem("gw-admin");
      refreshAdminUi();
    });

    $("btn-refresh-stats").addEventListener("click", renderDashboard);
    $("btn-reset-stats").addEventListener("click", function () {
      if (!confirm("모든 통계를 초기화할까요?")) return;
      GWAnalytics.reset();
      GWAnalytics.trackVisit();
      renderDashboard();
    });

    $("btn-save-cfg").addEventListener("click", function () {
      GWAnalytics.setCpm(Number(els.cfgCpm.value) || 0);
      GWAds.setAdsenseEnabled(els.cfgAdsense.checked);
      GWAds.fillSlots();
      alert("설정을 저장했습니다.");
      renderDashboard();
    });
  }

  function refreshAdminUi() {
    els.adminGate.hidden = adminAuthed;
    els.adminDash.hidden = !adminAuthed;
    if (adminAuthed) renderDashboard();
  }

  function formatKrw(n) {
    return Math.round(n).toLocaleString("ko-KR") + "원";
  }

  function renderDashboard() {
    var s = GWAnalytics.getStats();
    var cards = [
      { k: "누적 이용자", v: s.visitors.length, money: false },
      { k: "페이지뷰", v: s.pageViews, money: false },
      { k: "게임 시작", v: s.gameStarts, money: false },
      { k: "광고 노출", v: s.adImpressions, money: false },
      { k: "광고 클릭", v: s.adClicks, money: false },
      { k: "추정 수익", v: formatKrw(s.estimatedRevenueKrw), money: true }
    ];

    els.statGrid.innerHTML = cards.map(function (c) {
      return '<article class="stat-card' + (c.money ? " money" : "") + '">' +
        '<div class="k">' + c.k + "</div>" +
        '<div class="v">' + c.v + "</div></article>";
    }).join("");

    var titles = {};
    gameList().forEach(function (g) { titles[g.id] = g.title; });
    var plays = Object.keys(s.gamePlays).map(function (id) {
      return { id: id, n: s.gamePlays[id] };
    }).sort(function (a, b) { return b.n - a.n; });

    els.gameRank.innerHTML = plays.length
      ? plays.map(function (p) {
          return "<li><span>" + (titles[p.id] || p.id) + "</span><b>" + p.n + "회</b></li>";
        }).join("")
      : "<li><span>아직 플레이 기록이 없습니다</span><b>0</b></li>";

    var days = [];
    for (var i = 13; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    var maxRev = 1;
    days.forEach(function (day) {
      var row = s.daily[day];
      if (row && row.revenueKrw > maxRev) maxRev = row.revenueKrw;
    });
    els.dailyChart.innerHTML = days.map(function (day) {
      var row = s.daily[day] || { revenueKrw: 0 };
      var h = Math.max(4, Math.round((row.revenueKrw / maxRev) * 150));
      return '<div class="chart-bar" style="height:' + h + 'px" data-day="' + day.slice(5) + '" title="' +
        day + " / " + formatKrw(row.revenueKrw) + '"></div>';
    }).join("");

    els.cfgCpm.value = String(GWAnalytics.getCpm());
    els.cfgAdsense.checked = GWAds.useAdsense();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

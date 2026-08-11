(function () {
  "use strict";

  var currentGame = null;
  var adminAuthed = sessionStorage.getItem("gw-admin") === "1";

  var els = {};

  function $(id) { return document.getElementById(id); }

  var SOLO_IDS = ["tetris", "farm", "snake", "breakout", "puzzle2048"];
  var MULTI_IDS = ["kart", "arena", "cops"];

  function gamesByIds(ids) {
    var g = window.GWGames || {};
    return ids.map(function (id) { return g[id]; }).filter(Boolean);
  }

  function gameList() {
    return gamesByIds(SOLO_IDS.concat(MULTI_IDS));
  }

  var MP_GAMES = [
    { id: "kart", title: "카드라이더", emoji: "🏎️" },
    { id: "arena", title: "아레나", emoji: "🕹️" },
    { id: "cops", title: "경찰과 도둑", emoji: "🕵️" }
  ];

  var lobbyPanel = "home";

  var rankTab = "overall";
  var RANK_TABS = [
    { id: "overall", label: "종합" },
    { id: "arena", label: "아레나" },
    { id: "cops", label: "경찰과 도둑" },
    { id: "kart", label: "카드라이더" }
  ];

  var createPick = "arena";
  var unsubRooms = null;

  function renderRankPanel() {
    var panel = $("rank-panel");
    var tabs = $("rank-tabs");
    var wrap = $("rank-table-wrap");
    if (!panel || !tabs || !wrap || !window.GWRanking) return;
    tabs.innerHTML = RANK_TABS.map(function (t) {
      return '<button type="button" class="rk-tab' + (rankTab === t.id ? " on" : "") + '" data-rank="' + t.id + '">' + t.label + "</button>";
    }).join("");
    tabs.querySelectorAll("[data-rank]").forEach(function (btn) {
      btn.onclick = function () {
        rankTab = btn.getAttribute("data-rank");
        renderRankPanel();
      };
    });
    var list = rankTab === "overall" ? GWRanking.overallRanking() : GWRanking.rankingFor(rankTab);
    if (!list.length) {
      wrap.innerHTML = '<p style="color:var(--muted);margin:0">아직 기록이 없습니다. 공개방에서 플레이하면 여기에 쌓입니다.</p>';
      return;
    }
    wrap.innerHTML =
      '<table><thead><tr><th>#</th><th>이름</th><th>점수</th><th>승</th><th>판</th></tr></thead><tbody>' +
      list.slice(0, 10).map(function (r, i) {
        return "<tr><td>" + (i + 1) + "</td><td>" + r.name + "</td><td>" + r.score + "</td><td>" + r.wins + "</td><td>" + r.plays + "</td></tr>";
      }).join("") +
      "</tbody></table>";
  }

  function init() {
    els.siteName = $("site-name");
    els.siteTagline = $("site-tagline");
    els.gameGridSolo = $("game-grid-solo");
    els.gameGridMulti = $("game-grid-multi");
    els.lobbyHome = $("lobby-home");
    els.lobbySolo = $("lobby-solo");
    els.lobbyMulti = $("lobby-multi");
    els.rankPanel = $("rank-panel");
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
    renderRankPanel();
    showLobbyPanel("home");
    bindNav();
    bindAdmin();
    bindLobbyGate();
    bindLobbyHome();

    if (window.GWPublicRooms) GWPublicRooms.start();

    if (!window.toast) {
      window.toast = function (msg, kind) {
        var el = document.createElement("div");
        el.className = "gw-toast " + (kind || "");
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 2800);
      };
    }

    if (window.GWAnalytics) GWAnalytics.trackVisit();
    /* 광고 비활성화
    if (window.GWAds) GWAds.fillSlots();
    */

    var hash = (location.hash || "#lobby").replace("#", "");
    showView(hash === "admin" ? "admin" : hash.indexOf("game-") === 0 ? hash : "lobby");
  }

  function fillGameGrid(container, games, onPick) {
    if (!container) return;
    container.innerHTML = "";
    games.forEach(function (game, i) {
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
      btn.addEventListener("click", function () { onPick(game.id); });
      container.appendChild(btn);
    });
  }

  function renderLobby() {
    fillGameGrid(els.gameGridSolo, gamesByIds(SOLO_IDS), function (id) {
      launchGame(id);
    });
    fillGameGrid(els.gameGridMulti, gamesByIds(MULTI_IDS), function (id) {
      launchMultiGame(id);
    });
  }

  function showLobbyPanel(name) {
    lobbyPanel = name || "home";
    var panels = {
      home: els.lobbyHome,
      solo: els.lobbySolo,
      multi: els.lobbyMulti,
      rank: els.rankPanel
    };
    Object.keys(panels).forEach(function (key) {
      var el = panels[key];
      if (!el) return;
      el.hidden = key !== lobbyPanel;
    });
    if (lobbyPanel === "rank") renderRankPanel();
  }

  function bindLobbyHome() {
    document.querySelectorAll("[data-lobby]").forEach(function (el) {
      el.addEventListener("click", function () {
        showLobbyPanel(el.getAttribute("data-lobby") || "home");
      });
    });
  }

  function launchMultiGame(id) {
    var name = readPlayerId();
    if (!name) return;
    window.GWRoomIntent = {
      action: "create",
      game: id,
      name: name,
      roomName: name + "의 방",
      isPublic: true
    };
    launchGame(id);
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
      showLobbyPanel(lobbyPanel === "home" ? "home" : lobbyPanel);
    }

    /* 광고 비활성화
    if (window.GWAds && target !== "game") GWAds.fillSlots();
    */
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
        setScore: function (n) {
          els.gameScore.textContent = String(n);
          if (window.GWRanking && id && ["tetris", "snake", "breakout", "puzzle2048", "farm", "kart", "arena", "cops"].indexOf(id) >= 0) {
            var prof = GWRanking.getProfile();
            if (prof && prof.name) GWRanking.recordBest(prof.name, id, Number(n) || 0);
          }
        }
      }, window.GWRoomIntent || null);
      window.GWRoomIntent = null;
    }

    /* 광고 비활성화 — 전면광고 없이 바로 시작 */
    start();
    /*
    if (skipAd) start();
    else if (window.GWAds) GWAds.showInterstitial(start);
    else start();
    */
  }

  function stopGame() {
    if (currentGame && currentGame.destroy) currentGame.destroy();
    currentGame = null;
    els.gameStage.innerHTML = "";
  }

  function readPlayerId() {
    var input = $("lobby-player-id");
    var name = (input && input.value || "").trim().slice(0, 12);
    if (!name) {
      alert("참가 아이디(닉네임)를 입력하세요.");
      if (input) input.focus();
      return null;
    }
    if (window.GWRanking) {
      GWRanking.ensureAcc(name);
      GWRanking.setProfile(name, "guest");
    }
    try { localStorage.setItem("gw-player-id", name); } catch (e) {}
    return name;
  }

  function ensureModal() {
    var m = $("lobby-modal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "lobby-modal";
    m.className = "lobby-modal";
    m.hidden = true;
    m.innerHTML = '<div class="lobby-modal__card" id="lobby-modal-card"></div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e) {
      if (e.target === m) closeModal();
    });
    return m;
  }

  function closeModal() {
    var m = $("lobby-modal");
    if (m) m.hidden = true;
    if (unsubRooms) {
      unsubRooms();
      unsubRooms = null;
    }
  }

  function openModal(html) {
    var m = ensureModal();
    $("lobby-modal-card").innerHTML = html;
    m.hidden = false;
  }

  function bindLobbyGate() {
    var idInput = $("lobby-player-id");
    if (idInput) {
      try {
        idInput.value = localStorage.getItem("gw-player-id") ||
          ((GWRanking.getProfile() && GWRanking.getProfile().name) || "");
      } catch (e) {}
    }

    $("btn-room-create").onclick = function () {
      if (!readPlayerId()) return;
      openModal(
        "<h3>공개 방 만들기</h3>" +
        "<p>방장이 되어 공개 로비에 방을 올립니다. 누구나 목록에서 참가할 수 있습니다.</p>" +
        '<div class="lobby-modal__games" id="mg-pick">' +
        MP_GAMES.map(function (g) {
          return '<button type="button" class="lobby-modal__game' + (createPick === g.id ? " is-on" : "") +
            '" data-g="' + g.id + '"><span>' + g.emoji + "</span><strong>" + g.title + "</strong></button>";
        }).join("") +
        "</div>" +
        '<label class="lobby-modal__check"><input type="checkbox" id="mg-public" checked> 공개방으로 등록</label>' +
        '<label class="lobby-modal__field">방 이름<input id="mg-rname" maxlength="24" placeholder="예: 초보 환영"></label>' +
        '<div class="lobby-modal__actions">' +
        '<button type="button" class="btn btn--ghost" id="mg-cancel">취소</button>' +
        '<button type="button" class="btn btn--primary" id="mg-go">방 만들기</button>' +
        "</div>"
      );
      $("mg-pick").onclick = function (e) {
        var btn = e.target.closest("[data-g]");
        if (!btn) return;
        createPick = btn.getAttribute("data-g");
        $("mg-pick").querySelectorAll(".lobby-modal__game").forEach(function (b) {
          b.classList.toggle("is-on", b.getAttribute("data-g") === createPick);
        });
      };
      $("mg-cancel").onclick = closeModal;
      $("mg-go").onclick = function () {
        var name = readPlayerId();
        if (!name) return;
        window.GWRoomIntent = {
          action: "create",
          game: createPick,
          name: name,
          roomName: ($("mg-rname").value || "").trim() || (name + "의 방"),
          isPublic: !!($("mg-public") && $("mg-public").checked)
        };
        closeModal();
        launchGame(createPick);
      };
    };

    $("btn-room-join").onclick = function () {
      if (!readPlayerId()) return;
      openModal(
        "<h3>방 참가</h3>" +
        "<p>공개방 목록에서 고르거나, 방 코드로 참가하세요.</p>" +
        '<div class="lobby-room-list" id="mg-rooms"><p style="color:var(--muted)">목록 불러오는 중…</p></div>' +
        '<label class="lobby-modal__field">게임' +
        '<select id="mg-join-game">' +
        MP_GAMES.map(function (g) {
          return '<option value="' + g.id + '">' + g.emoji + " " + g.title + "</option>";
        }).join("") +
        "</select></label>" +
        '<label class="lobby-modal__field">방 코드<input id="mg-code" maxlength="16" placeholder="예: AB12CD" style="text-transform:uppercase"></label>' +
        '<div class="lobby-modal__actions">' +
        '<button type="button" class="btn btn--ghost" id="mg-cancel">취소</button>' +
        '<button type="button" class="btn btn--primary" id="mg-join-go">코드로 참가</button>' +
        "</div>"
      );
      function renderRooms(list) {
        var el = $("mg-rooms");
        if (!el) return;
        var open = (list || []).filter(function (r) { return !r.started; });
        if (!open.length) {
          el.innerHTML = '<p style="color:var(--muted);margin:0">열린 공개방이 없습니다. 방을 만들어 보세요!</p>';
          return;
        }
        el.innerHTML = open.map(function (r) {
          var meta = MP_GAMES.find(function (g) { return g.id === r.game; }) || { emoji: "🎮", title: r.game };
          return '<button type="button" class="lobby-room-item" data-code="' + r.code + '" data-game="' + r.game + '">' +
            "<div><strong>" + meta.emoji + " " + (r.name || r.code) + "</strong><br><small>" +
            meta.title + " · " + (r.host || "?") + " · " + (r.players || 1) + "/" + (r.max || 8) +
            " · " + r.code + "</small></div></button>";
        }).join("");
        el.querySelectorAll(".lobby-room-item").forEach(function (btn) {
          btn.onclick = function () {
            var name = readPlayerId();
            if (!name) return;
            window.GWRoomIntent = {
              action: "join",
              game: btn.getAttribute("data-game"),
              code: btn.getAttribute("data-code"),
              name: name,
              isPublic: true
            };
            closeModal();
            launchGame(btn.getAttribute("data-game"));
          };
        });
      }
      if (window.GWPublicRooms) {
        unsubRooms = GWPublicRooms.onUpdate(renderRooms);
      } else {
        renderRooms([]);
      }
      $("mg-cancel").onclick = closeModal;
      $("mg-join-go").onclick = function () {
        var name = readPlayerId();
        if (!name) return;
        var code = ($("mg-code").value || "").replace(/\s/g, "").toUpperCase();
        if (!code) { alert("방 코드를 입력하세요."); return; }
        var game = $("mg-join-game").value;
        window.GWRoomIntent = { action: "join", game: game, code: code, name: name };
        closeModal();
        launchGame(game);
      };
    };

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
      /* 광고 비활성화
      GWAds.fillSlots();
      */
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

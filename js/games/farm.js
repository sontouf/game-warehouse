(function (global) {
  "use strict";

  /**
   * 팜프렌지 스타일 타임매니지먼트 미니게임 (오리지널)
   * 동물을 키우고 가공·판매해 목표 금액을 달성하세요.
   */
  function create(stage, api) {
    var root = document.createElement("div");
    root.className = "farm";
    root.innerHTML =
      '<div class="farm-board" id="farm-board"></div>' +
      '<aside class="farm-side">' +
      '  <div class="farm-box"><h4>상태</h4>' +
      '    <div class="farm-inv">' +
      '      <div>목표: <b id="farm-goal">1,500원</b></div>' +
      '      <div>남은 시간: <b id="farm-time">90</b>초</div>' +
      '      <div>보유 금: <b id="farm-money">0</b>원</div>' +
      '    </div></div>' +
      '  <div class="farm-box"><h4>창고</h4><div class="farm-inv" id="farm-inv"></div></div>' +
      '  <div class="farm-box"><h4>액션</h4>' +
      '    <div class="game-ui__bar" style="justify-content:flex-start">' +
      '      <button type="button" class="btn btn--primary" id="farm-sell">전부 판매</button>' +
      '      <button type="button" class="btn btn--ghost" id="farm-restart">다시</button>' +
      '    </div>' +
      '    <p class="note" style="margin-top:10px">타일을 눌러 수확·가공하세요. 판매로 목표 금액을 채우면 클리어!</p>' +
      '  </div>' +
      '</aside>';
    stage.appendChild(root);

    var TILES = [
      { id: "cow", name: "젖소", emoji: "🐄", produce: "milk", time: 4, label: "우유" },
      { id: "hen", name: "닭", emoji: "🐔", produce: "egg", time: 3, label: "달걀" },
      { id: "wheat", name: "밀밭", emoji: "🌾", produce: "wheat", time: 5, label: "밀" },
      { id: "dairy", name: "유제품", emoji: "🧀", produce: "cheese", time: 5, label: "치즈", needs: { milk: 2 } },
      { id: "bakery", name: "빵집", emoji: "🍞", produce: "bread", time: 6, label: "빵", needs: { wheat: 2, egg: 1 } },
      { id: "shop", name: "상점", emoji: "🏪", produce: null, time: 0, label: "판매" }
    ];

    var PRICES = { milk: 40, egg: 30, wheat: 35, cheese: 120, bread: 160 };
    var inv, money, goal, timeLeft, timer, running, tileState;

    var els = {
      board: root.querySelector("#farm-board"),
      inv: root.querySelector("#farm-inv"),
      money: root.querySelector("#farm-money"),
      time: root.querySelector("#farm-time"),
      goal: root.querySelector("#farm-goal")
    };

    function reset() {
      inv = { milk: 0, egg: 0, wheat: 0, cheese: 0, bread: 0 };
      money = 0;
      goal = 1500;
      timeLeft = 90;
      tileState = TILES.map(function (t) {
        return { busy: false, left: 0, ready: false };
      });
      running = true;
      api.setScore(0);
      els.goal.textContent = goal.toLocaleString("ko-KR") + "원";
      renderTiles();
      renderInv();
      updateHud();
      clearInterval(timer);
      timer = setInterval(tick, 1000);
    }

    function updateHud() {
      els.money.textContent = money.toLocaleString("ko-KR");
      els.time.textContent = String(timeLeft);
      api.setScore(money);
    }

    function renderInv() {
      els.inv.innerHTML = Object.keys(PRICES).map(function (k) {
        var labels = { milk: "우유", egg: "달걀", wheat: "밀", cheese: "치즈", bread: "빵" };
        return "<div>" + labels[k] + ": <b>" + inv[k] + "</b> (개당 " + PRICES[k] + "원)</div>";
      }).join("");
    }

    function renderTiles() {
      els.board.innerHTML = "";
      TILES.forEach(function (tile, idx) {
        var st = tileState[idx];
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "farm-tile";
        var status = st.busy ? "생산 중 " + st.left + "s" : st.ready ? "수확!" : "대기";
        if (tile.id === "shop") status = "클릭 판매";
        btn.innerHTML =
          '<span class="emoji">' + tile.emoji + "</span>" +
          '<span class="name">' + tile.name + "</span>" +
          '<span class="timer">' + status + "</span>";
        btn.addEventListener("click", function () { onTile(idx); });
        els.board.appendChild(btn);
      });
    }

    function canAfford(needs) {
      if (!needs) return true;
      return Object.keys(needs).every(function (k) { return inv[k] >= needs[k]; });
    }

    function spend(needs) {
      Object.keys(needs).forEach(function (k) { inv[k] -= needs[k]; });
    }

    function onTile(idx) {
      if (!running) return;
      var tile = TILES[idx];
      var st = tileState[idx];

      if (tile.id === "shop") {
        sellAll();
        return;
      }

      if (st.ready) {
        inv[tile.produce] += 1;
        st.ready = false;
        renderInv();
        renderTiles();
        return;
      }

      if (st.busy) return;

      if (tile.needs && !canAfford(tile.needs)) {
        flash("재료가 부족합니다!");
        return;
      }
      if (tile.needs) spend(tile.needs);

      st.busy = true;
      st.left = tile.time;
      renderInv();
      renderTiles();
    }

    function flash(msg) {
      var n = document.createElement("div");
      n.textContent = msg;
      n.style.cssText = "position:fixed;left:50%;top:20%;transform:translateX(-50%);background:#162033;border:1px solid rgba(255,255,255,.2);padding:10px 16px;border-radius:12px;z-index:60;color:#ffc857;font-weight:700;";
      document.body.appendChild(n);
      setTimeout(function () { n.remove(); }, 1200);
    }

    function sellAll() {
      var gained = 0;
      Object.keys(PRICES).forEach(function (k) {
        gained += inv[k] * PRICES[k];
        inv[k] = 0;
      });
      if (!gained) {
        flash("팔 물건이 없습니다");
        return;
      }
      money += gained;
      renderInv();
      updateHud();
      if (money >= goal) win();
    }

    function tick() {
      if (!running) return;
      timeLeft -= 1;
      tileState.forEach(function (st) {
        if (!st.busy) return;
        st.left -= 1;
        if (st.left <= 0) {
          st.busy = false;
          st.ready = true;
        }
      });
      updateHud();
      renderTiles();
      if (timeLeft <= 0) {
        running = false;
        clearInterval(timer);
        flash(money >= goal ? "클리어!" : "시간 종료!");
      }
    }

    function win() {
      running = false;
      clearInterval(timer);
      flash("목표 달성! 팜 마스터!");
    }

    root.querySelector("#farm-sell").addEventListener("click", sellAll);
    root.querySelector("#farm-restart").addEventListener("click", reset);
    reset();

    return {
      destroy: function () {
        running = false;
        clearInterval(timer);
      }
    };
  }

  global.GWGames = global.GWGames || {};
  global.GWGames.farm = {
    id: "farm",
    title: "팜프렌지 1탄",
    emoji: "🌾",
    desc: "동물을 키우고 가공·판매해 목표 금액을 달성하는 타임매니지먼트!",
    tags: ["시뮬레이션", "1탄"],
    accent: "#3dd68c",
    hint: "타일 클릭으로 생산·수확 · 상점/판매 버튼으로 현금화",
    create: create
  };
})(window);

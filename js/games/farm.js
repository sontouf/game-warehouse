(function (global) {
  "use strict";

  /**
   * 팜프렌지 1탄 스타일 오리지널 타임매니지먼트
   * - 동물 배회 → 풀 섭취 → 산물 드롭
   * - 우물 물 구매 → 클릭으로 풀 설치
   * - 창고 / 시장 자동차 / 가공공장 구매·업그레이드
   * - 곰 연타 포획 후 판매
   * - 스테이지별 미션 클리어
   */

  var SAVE_KEY = "gw-farm-frenzy-stage";
  var FIELD_W = 640;
  var FIELD_H = 420;

  var GOODS = {
    egg: { name: "달걀", emoji: "🥚", sell: 10, space: 1, car: 1, spoil: 18 },
    powder: { name: "계란가루", emoji: "🧂", sell: 20, space: 1, car: 1, spoil: 22 },
    cupcake: { name: "컵케이크", emoji: "🧁", sell: 80, space: 1, car: 1, spoil: 26 },
    wool: { name: "양털", emoji: "🧶", sell: 100, space: 2, car: 1, spoil: 20 },
    thread: { name: "실", emoji: "🧵", sell: 200, space: 2, car: 1, spoil: 24 },
    fabric: { name: "옷감", emoji: "🧣", sell: 800, space: 2, car: 1, spoil: 28 },
    milk: { name: "우유", emoji: "🥛", sell: 400, space: 2, car: 1, spoil: 20 },
    butter: { name: "버터", emoji: "🧈", sell: 800, space: 2, car: 1, spoil: 24 },
    cheese: { name: "치즈", emoji: "🧀", sell: 2000, space: 2, car: 1, spoil: 28 },
    bear: { name: "곰", emoji: "🐻", sell: 100, space: 3, car: 1, spoil: 999 }
  };

  var ANIMALS = {
    goose: {
      name: "거위", emoji: "🪿", cost: 100, sell: 50,
      produce: "egg", hungerMax: 100, eatNeed: 28, produceTime: 7, speed: 38, size: 18
    },
    sheep: {
      name: "양", emoji: "🐑", cost: 1000, sell: 500,
      produce: "wool", hungerMax: 120, eatNeed: 36, produceTime: 10, speed: 30, size: 20
    },
    cow: {
      name: "젖소", emoji: "🐄", cost: 5000, sell: 2500,
      produce: "milk", hungerMax: 140, eatNeed: 48, produceTime: 14, speed: 24, size: 24
    },
    dog: {
      name: "개", emoji: "🐕", cost: 2600, sell: 0,
      special: "dog", hungerMax: 999, eatNeed: 0, produceTime: 0, speed: 55, size: 18
    },
    cat: {
      name: "고양이", emoji: "🐈", cost: 2500, sell: 0,
      special: "cat", hungerMax: 999, eatNeed: 0, produceTime: 0, speed: 60, size: 16
    }
  };

  var FACTORIES = {
    eggPlant: { name: "계란가루 공장", emoji: "🏭", from: "egg", to: "powder", buy: 200, upCost: [300, 400, 500], time: 5 },
    bakery: { name: "제과점", emoji: "🍪", from: "powder", to: "cupcake", buy: 400, upCost: [600, 800, 1000], time: 6 },
    spinnery: { name: "방적소", emoji: "🪡", from: "wool", to: "thread", buy: 2000, upCost: [3000, 4000, 5000], time: 6 },
    weave: { name: "직조공장", emoji: "🧵", from: "thread", to: "fabric", buy: 4000, upCost: [6000, 8000, 10000], time: 7 },
    churn: { name: "버터공방", emoji: "🏺", from: "milk", to: "butter", buy: 8000, upCost: [10000, 12000, 15000], time: 7 },
    dairy: { name: "치즈공장", emoji: "🧀", from: "butter", to: "cheese", buy: 15000, upCost: [18000, 22000, 26000], time: 8 }
  };

  var STAGES = [
    {
      id: 1, title: "첫 농장", money: 200,
      start: { goose: 1 }, unlock: ["goose"],
      factories: [], wellLv: 0, storeLv: 0, carLv: 0, cageClicks: 5,
      bearEvery: 28, goals: [{ type: "money", amount: 150 }, { type: "collect", good: "egg", amount: 5 }]
    },
    {
      id: 2, title: "시장으로", money: 250,
      start: { goose: 2 }, unlock: ["goose"],
      factories: [], wellLv: 0, storeLv: 0, carLv: 0, cageClicks: 5,
      bearEvery: 24, goals: [{ type: "money", amount: 400 }, { type: "collect", good: "egg", amount: 10 }]
    },
    {
      id: 3, title: "가공의 시작", money: 400,
      start: { goose: 2 }, unlock: ["goose"],
      factories: ["eggPlant"], wellLv: 0, storeLv: 1, carLv: 0, cageClicks: 5,
      bearEvery: 22, goals: [{ type: "money", amount: 600 }, { type: "collect", good: "powder", amount: 4 }]
    },
    {
      id: 4, title: "달콤한 케이크", money: 500,
      start: { goose: 3 }, unlock: ["goose"],
      factories: ["eggPlant", "bakery"], wellLv: 0, storeLv: 1, carLv: 1, cageClicks: 4,
      bearEvery: 20, goals: [{ type: "money", amount: 900 }, { type: "collect", good: "cupcake", amount: 3 }]
    },
    {
      id: 5, title: "양털 농장", money: 1200,
      start: { goose: 1, sheep: 1 }, unlock: ["goose", "sheep"],
      factories: ["eggPlant", "bakery", "spinnery"], wellLv: 0, storeLv: 1, carLv: 1, cageClicks: 4,
      bearEvery: 18, goals: [{ type: "money", amount: 2000 }, { type: "collect", good: "wool", amount: 4 }, { type: "animals", kind: "sheep", amount: 2 }]
    },
    {
      id: 6, title: "실과 옷감", money: 2500,
      start: { sheep: 2 }, unlock: ["goose", "sheep", "dog"],
      factories: ["spinnery", "weave"], wellLv: 1, storeLv: 2, carLv: 2, cageClicks: 4,
      bearEvery: 16, goals: [{ type: "money", amount: 4500 }, { type: "collect", good: "fabric", amount: 2 }]
    },
    {
      id: 7, title: "우유가 필요해", money: 6000,
      start: { sheep: 1, cow: 1 }, unlock: ["goose", "sheep", "cow", "dog", "cat"],
      factories: ["spinnery", "churn"], wellLv: 1, storeLv: 2, carLv: 2, cageClicks: 3,
      bearEvery: 15, goals: [{ type: "money", amount: 8000 }, { type: "collect", good: "butter", amount: 2 }, { type: "animals", kind: "cow", amount: 2 }]
    },
    {
      id: 8, title: "치즈 마스터", money: 10000,
      start: { cow: 2, cat: 1 }, unlock: ["goose", "sheep", "cow", "dog", "cat"],
      factories: ["churn", "dairy", "eggPlant", "bakery"], wellLv: 2, storeLv: 2, carLv: 2, cageClicks: 3,
      bearEvery: 13, goals: [{ type: "money", amount: 15000 }, { type: "collect", good: "cheese", amount: 2 }]
    },
    {
      id: 9, title: "풀가동 농장", money: 12000,
      start: { goose: 2, sheep: 2, cow: 1, dog: 1 }, unlock: ["goose", "sheep", "cow", "dog", "cat"],
      factories: ["eggPlant", "bakery", "spinnery", "weave", "churn", "dairy"], wellLv: 2, storeLv: 2, carLv: 2, cageClicks: 3,
      bearEvery: 12, goals: [
        { type: "money", amount: 25000 },
        { type: "collect", good: "cupcake", amount: 5 },
        { type: "collect", good: "fabric", amount: 2 },
        { type: "collect", good: "cheese", amount: 1 }
      ]
    },
    {
      id: 10, title: "전설의 농장주", money: 20000,
      start: { goose: 3, sheep: 2, cow: 2, cat: 1, dog: 1 }, unlock: ["goose", "sheep", "cow", "dog", "cat"],
      factories: ["eggPlant", "bakery", "spinnery", "weave", "churn", "dairy"], wellLv: 3, storeLv: 3, carLv: 3, cageClicks: 3,
      bearEvery: 10, goals: [
        { type: "money", amount: 50000 },
        { type: "collect", good: "cheese", amount: 3 },
        { type: "collect", good: "fabric", amount: 3 },
        { type: "catchBear", amount: 3 }
      ]
    }
  ];

  /*
   * 용량 설계 (전 스테이지 공통)
   * - 창고 Lv0=14: 곰1(3)+달걀11 또는 달걀5+곰3 가능 → 1스테이지 미션 여유
   * - 자동차 Lv0=4: 곰1+달걀3 동시 출하 가능 (곰 car=1)
   * - 업그레이드마다 여유 칸 증가
   */
  function storeCap(lv) { return [14, 22, 32, 44][lv] || 14; }
  function carSlots(lv) { return [4, 5, 7, 9][lv] || 4; }
  function carTime(lv) { return [7, 5.5, 4, 3][lv] || 7; }
  function wellWater(lv) { return [5, 8, 12, 99][lv] || 5; }
  function wellRefillCost(lv) { return [19, 15, 12, 7][lv] || 19; }
  function wellUpCost(lv) { return [300, 600, 1200, 5000][lv]; }
  function storeUpCost(lv) { return [150, 500, 1000, 5000][lv]; }
  function carUpCost(lv) { return [300, 800, 1500, 5000][lv]; }
  function freeStore(state) { return storeCap(state.storeLv) - usedSlotsOf(state); }
  function usedSlotsOf(state) {
    var n = 0;
    Object.keys(state.warehouse || {}).forEach(function (k) {
      n += (state.warehouse[k] || 0) * (GOODS[k] ? GOODS[k].space : 1);
    });
    return n;
  }
  function goodCarSpace(good) {
    return GOODS[good] ? (GOODS[good].car || GOODS[good].space || 1) : 1;
  }

  function uid() { return "e" + Math.random().toString(36).slice(2, 9); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function create(stageEl, api) {
    var maxUnlocked = Number(localStorage.getItem(SAVE_KEY) || 1);
    var stageIndex = Math.min(maxUnlocked, STAGES.length) - 1;
    var running = false;
    var raf = 0;
    var lastTs = 0;
    var state = null;
    var toastTimer = 0;

    var root = document.createElement("div");
    root.className = "ff";
    root.innerHTML =
      '<div class="ff-menu" id="ff-menu"></div>' +
      '<div class="ff-play" id="ff-play" hidden>' +
      '  <div class="ff-top">' +
      '    <div class="ff-missions" id="ff-missions"></div>' +
      '    <div class="ff-hud">' +
      '      <span>💰 <b id="ff-money">0</b></span>' +
      '      <span>⏱ <b id="ff-time">0:00</b></span>' +
      '      <span>창고 <b id="ff-store">0/0</b></span>' +
      '    </div>' +
      '  </div>' +
      '  <div class="ff-main">' +
      '    <aside class="ff-col ff-col--left" id="ff-left"></aside>' +
      '    <div class="ff-field-wrap">' +
      '      <canvas id="ff-canvas" width="' + FIELD_W + '" height="' + FIELD_H + '"></canvas>' +
      '      <div class="ff-hint" id="ff-hint">우물에서 물을 산 뒤, 밭을 클릭해 풀을 심으세요.</div>' +
      '    </div>' +
      '    <aside class="ff-col ff-col--right" id="ff-right"></aside>' +
      '  </div>' +
      '  <div class="ff-bottom" id="ff-bottom"></div>' +
      '  <div class="ff-modal" id="ff-modal" hidden></div>' +
      '</div>';
    stageEl.appendChild(root);

    var els = {
      menu: root.querySelector("#ff-menu"),
      play: root.querySelector("#ff-play"),
      missions: root.querySelector("#ff-missions"),
      money: root.querySelector("#ff-money"),
      time: root.querySelector("#ff-time"),
      store: root.querySelector("#ff-store"),
      left: root.querySelector("#ff-left"),
      right: root.querySelector("#ff-right"),
      bottom: root.querySelector("#ff-bottom"),
      canvas: root.querySelector("#ff-canvas"),
      hint: root.querySelector("#ff-hint"),
      modal: root.querySelector("#ff-modal")
    };
    var ctx = els.canvas.getContext("2d");

    function toast(msg) {
      els.hint.textContent = msg;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        if (state) els.hint.textContent = "풀 심기 · 산물/곰 클릭 · 공장 가공 · 자동차로 판매";
      }, 2200);
    }

    function usedSlots() {
      return usedSlotsOf(state);
    }

    function canStore(good, qty) {
      qty = qty || 1;
      var need = (GOODS[good] ? GOODS[good].space : 1) * qty;
      return usedSlots() + need <= storeCap(state.storeLv);
    }

    function addWarehouse(good, qty) {
      qty = qty || 1;
      var need = (GOODS[good] ? GOODS[good].space : 1) * qty;
      var free = freeStore(state);
      if (!canStore(good, qty)) {
        toast(
          "창고 여유 " + free + "칸 / " + (GOODS[good] ? GOODS[good].name : good) +
            "은(는) " + need + "칸 필요. 자동차로 출하하세요!"
        );
        return false;
      }
      state.warehouse[good] = (state.warehouse[good] || 0) + qty;
      trackCollect(good, qty);
      return true;
    }

    function trackCollect(good, qty) {
      if (!state.collected[good]) state.collected[good] = 0;
      state.collected[good] += qty;
      checkGoals();
    }

    function spend(n) {
      if (state.money < n) {
        toast("돈이 부족합니다!");
        return false;
      }
      state.money -= n;
      return true;
    }

    function earn(n) {
      state.money += n;
      checkGoals();
    }

    function goalProgress(g) {
      if (g.type === "money") return Math.min(state.money, g.amount);
      if (g.type === "collect") return Math.min(state.collected[g.good] || 0, g.amount);
      if (g.type === "animals") {
        var c = state.animals.filter(function (a) { return a.alive && a.kind === g.kind; }).length;
        return Math.min(c, g.amount);
      }
      if (g.type === "catchBear") return Math.min(state.bearsCaught, g.amount);
      return 0;
    }

    function goalDone(g) {
      if (g._done) return true;
      var ok = false;
      if (g.type === "money") ok = state.money >= g.amount;
      else if (g.type === "collect") ok = (state.collected[g.good] || 0) >= g.amount;
      else if (g.type === "animals") {
        ok = state.animals.filter(function (a) { return a.alive && a.kind === g.kind; }).length >= g.amount;
      } else if (g.type === "catchBear") ok = state.bearsCaught >= g.amount;
      if (ok) g._done = true;
      return g._done;
    }

    function checkGoals() {
      var all = state.goals.every(goalDone);
      renderMissions();
      updateHud();
      if (all && !state.cleared) {
        state.cleared = true;
        running = false;
        var next = Math.max(maxUnlocked, state.stageId + 1);
        maxUnlocked = Math.min(next, STAGES.length);
        localStorage.setItem(SAVE_KEY, String(maxUnlocked));
        showResult(true);
      }
    }

    function spawnAnimal(kind, x, y) {
      var def = ANIMALS[kind];
      state.animals.push({
        id: uid(), kind: kind, x: x || rand(60, FIELD_W - 60), y: y || rand(80, FIELD_H - 40),
        vx: rand(-1, 1) * def.speed, vy: rand(-1, 1) * def.speed,
        hunger: def.hungerMax * 0.7, full: 0, produceCd: def.produceTime * 0.4,
        alive: true, special: def.special || null
      });
    }

    function initStage(idx) {
      var conf = STAGES[idx];
      stageIndex = idx;
      state = {
        stageId: conf.id,
        title: conf.title,
        money: conf.money,
        time: 0,
        wellLv: conf.wellLv,
        storeLv: conf.storeLv,
        carLv: conf.carLv,
        cageNeed: conf.cageClicks,
        water: wellWater(conf.wellLv),
        autoWell: conf.wellLv >= 3,
        animals: [],
        drops: [],
        grasses: [],
        bears: [],
        warehouse: {},
        collected: {},
        bearsCaught: 0,
        factories: {},
        car: { busy: false, t: 0, load: {}, revenue: 0 },
        goals: conf.goals.map(function (g) { return Object.assign({ _done: false }, g); }),
        unlock: conf.unlock.slice(),
        bearEvery: conf.bearEvery,
        bearTimer: conf.bearEvery * 0.6,
        cleared: false,
        sellingAnimal: null
      };

      conf.factories.forEach(function (fid) {
        state.factories[fid] = { owned: true, lv: 0, busy: false, t: 0, queue: 0 };
      });
      Object.keys(FACTORIES).forEach(function (fid) {
        if (!state.factories[fid]) state.factories[fid] = { owned: false, lv: 0, busy: false, t: 0, queue: 0 };
      });

      Object.keys(conf.start).forEach(function (k) {
        for (var i = 0; i < conf.start[k]; i++) spawnAnimal(k);
      });

      // starter grass
      for (var g = 0; g < 8; g++) {
        state.grasses.push({ x: rand(40, FIELD_W - 40), y: rand(60, FIELD_H - 30), hp: 3 });
      }

      els.menu.hidden = true;
      els.play.hidden = false;
      els.modal.hidden = true;
      running = true;
      lastTs = 0;
      renderAllUi();
      api.setScore(state.money);
      toast("스테이지 " + conf.id + ": " + conf.title);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    }

    function renderMenu() {
      els.play.hidden = true;
      els.menu.hidden = false;
      running = false;
      cancelAnimationFrame(raf);
      var html = '<div class="ff-menu-card"><h3>🌾 팜프렌지 1탄</h3><p>동물을 키우고, 가공하고, 곰을 잡아 미션을 클리어하세요.</p><div class="ff-stage-list">';
      STAGES.forEach(function (s, i) {
        var locked = s.id > maxUnlocked;
        html += '<button type="button" class="ff-stage-btn' + (locked ? " is-locked" : "") + '" data-stage="' + i + '" ' + (locked ? "disabled" : "") + ">" +
          "<strong>Stage " + s.id + "</strong><span>" + s.title + "</span>" +
          (locked ? "<em>잠김</em>" : "<em>플레이</em>") +
          "</button>";
      });
      html += "</div></div>";
      els.menu.innerHTML = html;
      els.menu.querySelectorAll("[data-stage]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          initStage(Number(btn.getAttribute("data-stage")));
        });
      });
    }

    function goalLabel(g) {
      if (g.type === "money") return "자금 " + g.amount.toLocaleString("ko-KR") + "원";
      if (g.type === "collect") return (GOODS[g.good].emoji + " " + GOODS[g.good].name + " " + g.amount + "개 수집");
      if (g.type === "animals") return (ANIMALS[g.kind].emoji + " " + ANIMALS[g.kind].name + " " + g.amount + "마리");
      if (g.type === "catchBear") return "🐻 곰 " + g.amount + "마리 포획";
      return "";
    }

    function renderMissions() {
      els.missions.innerHTML = state.goals.map(function (g) {
        var cur = goalProgress(g);
        var done = !!g._done;
        return '<div class="ff-mission' + (done ? " is-done" : "") + '">' +
          (done ? "✅ " : "☐ ") + goalLabel(g) +
          " <b>" + cur + "/" + g.amount + "</b></div>";
      }).join("");
    }

    function updateHud() {
      els.money.textContent = Math.floor(state.money).toLocaleString("ko-KR");
      var m = Math.floor(state.time / 60);
      var s = Math.floor(state.time % 60);
      els.time.textContent = m + ":" + String(s).padStart(2, "0");
      els.store.textContent = usedSlots() + "/" + storeCap(state.storeLv) + " (여유 " + freeStore(state) + ")";
      api.setScore(Math.floor(state.money));
    }

    function renderLeft() {
      var html = "";
      html += '<div class="ff-panel"><h4>🛒 동물 구매</h4><div class="ff-btns">';
      state.unlock.forEach(function (kind) {
        var a = ANIMALS[kind];
        html += '<button type="button" class="ff-mini" data-buy-animal="' + kind + '">' +
          a.emoji + " " + a.name + "<small>" + a.cost.toLocaleString("ko-KR") + "원</small></button>";
      });
      html += "</div></div>";

      html += '<div class="ff-panel"><h4>🔧 장비 업그레이드</h4><div class="ff-btns">';
      var wu = wellUpCost(state.wellLv);
      var su = storeUpCost(state.storeLv);
      var cu = carUpCost(state.carLv);
      html += '<button type="button" class="ff-mini" data-up="well" ' + (!wu ? "disabled" : "") + ">우물 Lv" + state.wellLv +
        (wu ? "<small>" + wu + "원</small>" : "<small>MAX</small>") + "</button>";
      html += '<button type="button" class="ff-mini" data-up="store" ' + (!su ? "disabled" : "") + ">창고 Lv" + state.storeLv +
        (su ? "<small>" + su + "원</small>" : "<small>MAX</small>") + "</button>";
      html += '<button type="button" class="ff-mini" data-up="car" ' + (!cu ? "disabled" : "") + ">자동차 Lv" + state.carLv +
        (cu ? "<small>" + cu + "원</small>" : "<small>MAX</small>") + "</button>";
      html += "</div></div>";

      html += '<div class="ff-panel"><h4>🏭 가공 건물</h4><div class="ff-btns">';
      Object.keys(FACTORIES).forEach(function (fid) {
        var f = FACTORIES[fid];
        var st = state.factories[fid];
        if (!st.owned) {
          html += '<button type="button" class="ff-mini" data-buy-factory="' + fid + '">' + f.emoji + " " + f.name +
            " 구매<small>" + f.buy.toLocaleString("ko-KR") + "원</small></button>";
        } else {
          var up = f.upCost[st.lv];
          var busy = st.busy ? " ⏳" : "";
          html += '<button type="button" class="ff-mini" data-run-factory="' + fid + '">' + f.emoji + " " + f.name + " Lv" + st.lv + busy +
            "<small>" + GOODS[f.from].emoji + "→" + GOODS[f.to].emoji + (st.busy ? " " + Math.ceil(st.t) + "s" : "") + "</small></button>";
          if (up) {
            html += '<button type="button" class="ff-mini ff-mini--sub" data-up-factory="' + fid + '">업그레이드<small>' + up.toLocaleString("ko-KR") + "원</small></button>";
          }
        }
      });
      html += "</div></div>";
      els.left.innerHTML = html;
      bindLeft();
    }

    function renderRight() {
      var cost = wellRefillCost(state.wellLv);
      var html = "";
      html += '<div class="ff-panel"><h4>💧 우물</h4>' +
        "<p>물 " + (state.autoWell ? "자동" : state.water) + " / 재충전 " + cost + "원</p>" +
        '<button type="button" class="btn btn--primary" id="ff-refill">물 사기</button>' +
        '<p class="ff-note">밭 클릭 = 풀 심기</p></div>';

      html += '<div class="ff-panel"><h4>📦 창고 <small>' + usedSlots() + '/' + storeCap(state.storeLv) +
        '</small></h4><div class="ff-inv">';
      var keys = Object.keys(state.warehouse).filter(function (k) { return state.warehouse[k] > 0; });
      if (!keys.length) html += '<p class="ff-note">비어 있음 · 곰 3칸 / 달걀 1칸</p>';
      keys.forEach(function (k) {
        var g = GOODS[k];
        var used = state.warehouse[k] * g.space;
        html += '<div>' + g.emoji + ' ' + g.name + ' × <b>' + state.warehouse[k] + '</b>' +
          ' <small>(' + g.sell + '원 · 칸 ' + used + ')</small></div>';
      });
      html += '</div><p class="ff-note">여유 ' + freeStore(state) + '칸 · 자동차 ' + carSlots(state.carLv) + '슬롯</p>' +
        '<button type="button" class="btn btn--primary" id="ff-open-car"' + (state.car.busy ? ' disabled' : '') + '>' +
        (state.car.busy ? '자동차 시장 이동중… ' + Math.ceil(state.car.t) + 's' : '자동차로 시장 가기') +
        '</button></div>';

      html += '<div class="ff-panel"><h4>🐾 가축 판매</h4><div class="ff-btns">';
      ["goose", "sheep", "cow"].forEach(function (kind) {
        if (state.unlock.indexOf(kind) === -1) return;
        html += '<button type="button" class="ff-mini" data-sell-animal="' + kind + '">' +
          ANIMALS[kind].emoji + " 1마리 판매<small>" + ANIMALS[kind].sell + "원</small></button>";
      });
      html += "</div></div>";

      html += '<div class="ff-panel"><button type="button" class="btn btn--ghost" id="ff-quit">스테이지 선택</button></div>';
      els.right.innerHTML = html;

      root.querySelector("#ff-refill").addEventListener("click", function () {
        if (state.autoWell) { toast("최고 우물은 자동으로 물을 씁니다."); return; }
        if (!spend(cost)) return;
        state.water = wellWater(state.wellLv);
        toast("우물에 물을 채웠습니다.");
        renderRight();
        updateHud();
      });
      root.querySelector("#ff-open-car").addEventListener("click", openCarModal);
      root.querySelector("#ff-quit").addEventListener("click", function () {
        running = false;
        renderMenu();
      });
      root.querySelectorAll("[data-sell-animal]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          sellOneAnimal(btn.getAttribute("data-sell-animal"));
        });
      });
    }

    function renderBottom() {
      els.bottom.innerHTML =
        '<div class="ff-legend">' +
        "<span>🪿거위→🥚</span><span>🐑양→🧶</span><span>🐄소→🥛</span>" +
        "<span>🐻연타 포획</span><span>🐈자동수집</span><span>🐕곰견제</span>" +
        "</div>";
    }

    function renderAllUi() {
      renderMissions();
      renderLeft();
      renderRight();
      renderBottom();
      updateHud();
    }

    function bindLeft() {
      root.querySelectorAll("[data-buy-animal]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var kind = btn.getAttribute("data-buy-animal");
          var a = ANIMALS[kind];
          if (!spend(a.cost)) return;
          spawnAnimal(kind);
          toast(a.name + "을(를) 구매했습니다.");
          checkGoals();
          renderLeft();
          updateHud();
        });
      });
      root.querySelectorAll("[data-up]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var t = btn.getAttribute("data-up");
          if (t === "well") {
            var c = wellUpCost(state.wellLv);
            if (!c || !spend(c)) return;
            state.wellLv += 1;
            state.autoWell = state.wellLv >= 3;
            state.water = wellWater(state.wellLv);
            toast("우물 업그레이드!");
          } else if (t === "store") {
            var c2 = storeUpCost(state.storeLv);
            if (!c2 || !spend(c2)) return;
            state.storeLv += 1;
            toast("창고 확장!");
          } else if (t === "car") {
            var c3 = carUpCost(state.carLv);
            if (!c3 || !spend(c3)) return;
            state.carLv += 1;
            toast("자동차 업그레이드!");
          }
          renderAllUi();
        });
      });
      root.querySelectorAll("[data-buy-factory]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var fid = btn.getAttribute("data-buy-factory");
          var f = FACTORIES[fid];
          if (!spend(f.buy)) return;
          state.factories[fid].owned = true;
          toast(f.name + " 부지 구매!");
          renderLeft();
          updateHud();
        });
      });
      root.querySelectorAll("[data-up-factory]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var fid = btn.getAttribute("data-up-factory");
          var f = FACTORIES[fid];
          var st = state.factories[fid];
          var c = f.upCost[st.lv];
          if (!c || !spend(c)) return;
          st.lv += 1;
          toast(f.name + " 업그레이드!");
          renderLeft();
          updateHud();
        });
      });
      root.querySelectorAll("[data-run-factory]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          runFactory(btn.getAttribute("data-run-factory"));
        });
      });
    }

    function runFactory(fid) {
      var f = FACTORIES[fid];
      var st = state.factories[fid];
      if (!st.owned || st.busy) return;
      var need = 1 + st.lv; // higher lv processes more at once conceptually - consume 1 still for balance, produce more
      if ((state.warehouse[f.from] || 0) < 1) {
        toast(GOODS[f.from].name + "이(가) 부족합니다.");
        return;
      }
      state.warehouse[f.from] -= 1;
      st.busy = true;
      st.t = Math.max(2.5, f.time - st.lv * 0.7);
      st.out = 1 + Math.floor(st.lv / 2);
      toast(f.name + " 가동!");
      renderAllUi();
    }

    function sellOneAnimal(kind) {
      var a = state.animals.find(function (x) { return x.alive && x.kind === kind && !x.special; });
      if (!a) { toast("판매할 " + ANIMALS[kind].name + "이(가) 없습니다."); return; }
      a.alive = false;
      earn(ANIMALS[kind].sell);
      toast(ANIMALS[kind].name + "을(를) 판매했습니다.");
      renderRight();
      updateHud();
    }

    function openCarModal() {
      if (state.car.busy) return;
      var load = {};
      var slots = 0;
      var maxSlots = carSlots(state.carLv);
      var revenue = 0;

      function sync() {
        els.modal.hidden = false;
        var html = '<div class="ff-modal-card"><h3>🚗 시장 출하</h3><p>슬롯 ' + slots + '/' + maxSlots +
          ' · 예상 수익 <b>' + revenue.toLocaleString('ko-KR') + '원</b></p><div class="ff-car-grid">';
        Object.keys(GOODS).forEach(function (k) {
          var have = state.warehouse[k] || 0;
          var inLoad = load[k] || 0;
          if (!have && !inLoad) return;
          html += '<div class="ff-car-row">' +
            "<span>" + GOODS[k].emoji + " " + GOODS[k].name + " (창고 " + have + ")</span>" +
            '<div class="ff-car-acts">' +
            '<button type="button" data-car-minus="' + k + '">−</button>' +
            "<b>" + inLoad + "</b>" +
            '<button type="button" data-car-plus="' + k + '">+</button>' +
            "</div></div>";
        });
        html += '</div><div class="ff-modal-actions">' +
          '<button type="button" class="btn btn--ghost" id="ff-car-cancel">취소</button>' +
          '<button type="button" class="btn btn--primary" id="ff-car-go">출하</button>' +
          "</div></div>";
        els.modal.innerHTML = html;
        els.modal.querySelector("#ff-car-cancel").onclick = function () { els.modal.hidden = true; };
        els.modal.querySelector("#ff-car-go").onclick = function () {
          if (slots <= 0) { toast("실을 물건이 없습니다."); return; }
          Object.keys(load).forEach(function (k) {
            state.warehouse[k] -= load[k];
            if (state.warehouse[k] <= 0) delete state.warehouse[k];
          });
          state.car.busy = true;
          state.car.t = carTime(state.carLv);
          state.car.revenue = revenue;
          state.car.load = load;
          els.modal.hidden = true;
          toast("자동차가 시장으로 출발!");
          renderRight();
        };
        els.modal.querySelectorAll("[data-car-plus]").forEach(function (b) {
          b.onclick = function () {
            var k = b.getAttribute("data-car-plus");
            var space = goodCarSpace(k);
            if ((state.warehouse[k] || 0) - (load[k] || 0) <= 0) return;
            if (slots + space > maxSlots) { toast("자동차 슬롯이 부족합니다. (이 물건 " + space + "슬롯)"); return; }
            load[k] = (load[k] || 0) + 1;
            slots += space;
            revenue += GOODS[k].sell;
            sync();
          };
        });
        els.modal.querySelectorAll("[data-car-minus]").forEach(function (b) {
          b.onclick = function () {
            var k = b.getAttribute("data-car-minus");
            if (!load[k]) return;
            load[k] -= 1;
            slots -= goodCarSpace(k);
            revenue -= GOODS[k].sell;
            if (load[k] <= 0) delete load[k];
            sync();
          };
        });
      }
      sync();
    }

    function showResult(win) {
      els.modal.hidden = false;
      els.modal.innerHTML =
        '<div class="ff-modal-card"><h3>' + (win ? "🎉 스테이지 클리어!" : "실패") + "</h3>" +
        "<p>" + state.title + " · 시간 " + els.time.textContent + " · 자금 " + Math.floor(state.money).toLocaleString("ko-KR") + "원</p>" +
        '<div class="ff-modal-actions">' +
        '<button type="button" class="btn btn--ghost" id="ff-res-menu">스테이지 선택</button>' +
        (win && stageIndex < STAGES.length - 1
          ? '<button type="button" class="btn btn--primary" id="ff-res-next">다음 스테이지</button>'
          : '<button type="button" class="btn btn--primary" id="ff-res-retry">다시 하기</button>') +
        "</div></div>";
      els.modal.querySelector("#ff-res-menu").onclick = renderMenu;
      var next = els.modal.querySelector("#ff-res-next");
      if (next) next.onclick = function () { initStage(stageIndex + 1); };
      var retry = els.modal.querySelector("#ff-res-retry");
      if (retry) retry.onclick = function () { initStage(stageIndex); };
    }

    function plantGrass(x, y) {
      if (state.autoWell) {
        if (!spend(wellRefillCost(state.wellLv))) return;
      } else {
        if (state.water <= 0) {
          toast("우물이 비었습니다! 물을 사세요.");
          return;
        }
        state.water -= 1;
      }
      state.grasses.push({ x: x, y: y, hp: 3 });
      renderRight();
      updateHud();
    }

    function hitTest(list, x, y, r) {
      for (var i = list.length - 1; i >= 0; i--) {
        var o = list[i];
        var dx = o.x - x, dy = o.y - y;
        if (dx * dx + dy * dy <= r * r) return i;
      }
      return -1;
    }

    function onCanvasClick(e) {
      if (!running || !state) return;
      var rect = els.canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) * (FIELD_W / rect.width);
      var y = (e.clientY - rect.top) * (FIELD_H / rect.height);

      var bi = hitTest(state.bears, x, y, 28);
      if (bi >= 0) {
        var bear = state.bears[bi];
        if (bear.caged) {
          if (addWarehouse("bear", 1)) {
            state.bearsCaught += 1;
            state.bears.splice(bi, 1);
            toast("곰을 창고에 넣었습니다. (칸 3 사용)");
            checkGoals();
            renderRight();
            updateHud();
          } else {
            bear.cageLife = Math.max(bear.cageLife, 10);
          }
        } else {
          bear.clicks += 1;
          if (bear.clicks >= state.cageNeed) {
            bear.caged = true;
            bear.cageLife = 12;
            toast("곰을 가뒀습니다! 다시 클릭해 창고로 넣으세요.");
          }
        }
        return;
      }

      var di = hitTest(state.drops, x, y, 22);
      if (di >= 0) {
        var drop = state.drops[di];
        if (addWarehouse(drop.good, 1)) {
          state.drops.splice(di, 1);
          renderRight();
          updateHud();
        }
        return;
      }

      plantGrass(x, y);
    }

    els.canvas.addEventListener("click", onCanvasClick);

    function nearestGrass(ax, ay) {
      var best = null, bestD = 1e9;
      state.grasses.forEach(function (g) {
        var d = (g.x - ax) * (g.x - ax) + (g.y - ay) * (g.y - ay);
        if (d < bestD) { bestD = d; best = g; }
      });
      return best;
    }

    function update(dt) {
      state.time += dt;

      // car
      if (state.car.busy) {
        state.car.t -= dt;
        if (state.car.t <= 0) {
          earn(state.car.revenue);
          toast("자동차 귀환! +" + state.car.revenue.toLocaleString("ko-KR") + "원");
          state.car.busy = false;
          state.car.revenue = 0;
          renderRight();
        }
      }

      // factories
      Object.keys(state.factories).forEach(function (fid) {
        var st = state.factories[fid];
        if (!st.busy) return;
        st.t -= dt;
        if (st.t <= 0) {
          var f = FACTORIES[fid];
          st.busy = false;
          // drop processed goods on field near right side
          for (var i = 0; i < st.out; i++) {
            state.drops.push({
              id: uid(), good: f.to,
              x: rand(FIELD_W * 0.55, FIELD_W - 40),
              y: rand(80, FIELD_H - 40),
              life: GOODS[f.to].spoil
            });
          }
          toast(f.name + " 완성! 밭에서 수거하세요.");
          renderLeft();
        }
      });

      // bears spawn
      state.bearTimer -= dt;
      if (state.bearTimer <= 0) {
        state.bearTimer = state.bearEvery + rand(-2, 3);
        var dog = state.animals.find(function (a) { return a.alive && a.special === "dog"; });
        state.bears.push({
          id: uid(),
          x: rand(80, FIELD_W - 80),
          y: rand(50, 120),
          vx: rand(-20, 20),
          vy: rand(10, 35),
          clicks: 0,
          caged: false,
          cageLife: 0,
          heldByDog: !!dog
        });
        toast(dog ? "🐻 곰 출현! 개가 견제 중" : "🐻 곰 출현! 연타로 가두세요!");
      }

      // bears move / attack
      state.bears.forEach(function (b) {
        if (b.caged) {
          b.cageLife -= dt;
          return;
        }
        if (b.heldByDog) {
          b.x += Math.sin(state.time * 3) * 8 * dt;
          return;
        }
        b.x = clamp(b.x + b.vx * dt, 30, FIELD_W - 30);
        b.y = clamp(b.y + b.vy * dt, 40, FIELD_H - 30);
        if (Math.random() < 0.02) { b.vx = rand(-40, 40); b.vy = rand(-30, 40); }

        state.animals.forEach(function (a) {
          if (!a.alive || a.special === "dog") return;
          var dx = a.x - b.x, dy = a.y - b.y;
          if (dx * dx + dy * dy < 26 * 26) {
            a.alive = false;
            toast(ANIMALS[a.kind].name + "이(가) 곰에게 당했습니다!");
          }
        });
        state.drops = state.drops.filter(function (d) {
          var dx = d.x - b.x, dy = d.y - b.y;
          return dx * dx + dy * dy > 22 * 22;
        });
      });
      state.bears = state.bears.filter(function (b) { return !(b.caged && b.cageLife <= 0); });

      // drops spoil
      state.drops.forEach(function (d) { d.life -= dt; });
      state.drops = state.drops.filter(function (d) { return d.life > 0; });

      // cat collects
      var cats = state.animals.filter(function (a) { return a.alive && a.special === "cat"; });
      cats.forEach(function (cat) {
        if (!state.drops.length) {
          cat.x += Math.sin(state.time + cat.id.length) * 20 * dt;
          cat.y += Math.cos(state.time + cat.id.length) * 16 * dt;
          return;
        }
        var target = state.drops[0];
        var ang = Math.atan2(target.y - cat.y, target.x - cat.x);
        cat.x += Math.cos(ang) * ANIMALS.cat.speed * dt;
        cat.y += Math.sin(ang) * ANIMALS.cat.speed * dt;
        var dx = target.x - cat.x, dy = target.y - cat.y;
        if (dx * dx + dy * dy < 18 * 18) {
          if (addWarehouse(target.good, 1)) {
            state.drops.shift();
            renderRight();
          }
        }
      });

      // animals
      state.animals.forEach(function (a) {
        if (!a.alive || a.special) return;
        var def = ANIMALS[a.kind];
        a.hunger -= dt * 6;
        a.produceCd -= dt;

        var g = nearestGrass(a.x, a.y);
        if (a.hunger < def.hungerMax * 0.55 && g) {
          var ang = Math.atan2(g.y - a.y, g.x - a.x);
          a.vx = Math.cos(ang) * def.speed;
          a.vy = Math.sin(ang) * def.speed;
          var dx = g.x - a.x, dy = g.y - a.y;
          if (dx * dx + dy * dy < 20 * 20) {
            a.hunger = Math.min(def.hungerMax, a.hunger + 45);
            a.full += 1;
            g.hp -= 1;
            if (g.hp <= 0) {
              state.grasses = state.grasses.filter(function (x) { return x !== g; });
            }
          }
        } else {
          if (Math.random() < 0.03) {
            a.vx = rand(-1, 1) * def.speed;
            a.vy = rand(-1, 1) * def.speed;
          }
        }

        a.x = clamp(a.x + a.vx * dt, 24, FIELD_W - 24);
        a.y = clamp(a.y + a.vy * dt, 40, FIELD_H - 24);
        if (a.x <= 24 || a.x >= FIELD_W - 24) a.vx *= -1;
        if (a.y <= 40 || a.y >= FIELD_H - 24) a.vy *= -1;

        if (a.hunger <= 0) {
          a.alive = false;
          toast(def.name + "이(가) 굶어 죽었습니다!");
          return;
        }

        if (a.full >= 1 && a.produceCd <= 0 && a.hunger > def.hungerMax * 0.4) {
          a.full = 0;
          a.produceCd = def.produceTime;
          state.drops.push({
            id: uid(), good: def.produce,
            x: clamp(a.x + rand(-10, 10), 30, FIELD_W - 30),
            y: clamp(a.y + rand(-10, 10), 40, FIELD_H - 30),
            life: GOODS[def.produce].spoil
          });
        }
      });

      // grass slowly withers
      if (Math.random() < dt * 0.15 && state.grasses.length) {
        var gi = Math.floor(Math.random() * state.grasses.length);
        state.grasses[gi].hp -= 0.2;
        if (state.grasses[gi].hp <= 0) state.grasses.splice(gi, 1);
      }

      // dog follows nearest uncaged bear
      state.animals.filter(function (a) { return a.alive && a.special === "dog"; }).forEach(function (dog) {
        var bear = state.bears.find(function (b) { return !b.caged; });
        if (!bear) {
          dog.x += Math.sin(state.time) * 15 * dt;
          return;
        }
        bear.heldByDog = true;
        var ang = Math.atan2(bear.y - dog.y, bear.x - dog.x);
        dog.x += Math.cos(ang) * ANIMALS.dog.speed * dt;
        dog.y += Math.sin(ang) * ANIMALS.dog.speed * dt;
      });

      checkGoals();
    }

    function draw() {
      // field
      var grd = ctx.createLinearGradient(0, 0, 0, FIELD_H);
      grd.addColorStop(0, "#2f5d34");
      grd.addColorStop(1, "#1d3f24");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);

      // fence
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, FIELD_W - 16, FIELD_H - 16);

      // grass
      state.grasses.forEach(function (g) {
        ctx.font = "18px serif";
        ctx.globalAlpha = clamp(g.hp / 3, 0.4, 1);
        ctx.fillText("🌿", g.x - 9, g.y + 6);
        ctx.globalAlpha = 1;
      });

      // drops
      state.drops.forEach(function (d) {
        ctx.font = "20px serif";
        ctx.fillText(GOODS[d.good].emoji, d.x - 10, d.y + 6);
        if (d.life < 5) {
          ctx.fillStyle = "rgba(255,93,122,0.8)";
          ctx.fillRect(d.x - 10, d.y + 10, 20 * (d.life / 5), 3);
          ctx.fillStyle = "#fff";
        }
      });

      // animals
      state.animals.forEach(function (a) {
        if (!a.alive) return;
        var def = ANIMALS[a.kind];
        ctx.font = (def.size || 20) + "px serif";
        ctx.fillText(def.emoji, a.x - 12, a.y + 8);
        if (!a.special) {
          var ratio = clamp(a.hunger / def.hungerMax, 0, 1);
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(a.x - 14, a.y + 12, 28, 5);
          ctx.fillStyle = ratio > 0.35 ? "#2de2c5" : "#ff5d7a";
          ctx.fillRect(a.x - 14, a.y + 12, 28 * ratio, 5);
        }
      });

      // bears
      state.bears.forEach(function (b) {
        ctx.font = "28px serif";
        ctx.fillText("🐻", b.x - 14, b.y + 10);
        if (b.caged) {
          ctx.strokeStyle = "#ffc857";
          ctx.lineWidth = 2;
          ctx.strokeRect(b.x - 18, b.y - 22, 36, 36);
          ctx.fillStyle = "#ffc857";
          ctx.font = "11px IBM Plex Sans KR, sans-serif";
          ctx.fillText("수거!", b.x - 14, b.y + 28);
        } else {
          var need = state.cageNeed;
          ctx.fillStyle = "rgba(0,0,0,0.4)";
          ctx.fillRect(b.x - 16, b.y + 14, 32, 5);
          ctx.fillStyle = "#ff6b4a";
          ctx.fillRect(b.x - 16, b.y + 14, 32 * (b.clicks / need), 5);
        }
      });
    }

    function loop(ts) {
      if (!running) return;
      if (!lastTs) lastTs = ts;
      var dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      update(dt);
      draw();
      if (state.car.busy || Object.keys(state.factories).some(function (k) { return state.factories[k].busy; })) {
        // light UI refresh occasionally
        if (Math.floor(state.time * 2) !== Math.floor((state.time - dt) * 2)) {
          renderRight();
          renderLeft();
        }
      }
      updateHud();
      raf = requestAnimationFrame(loop);
    }

    renderMenu();

    return {
      destroy: function () {
        running = false;
        cancelAnimationFrame(raf);
        els.canvas.removeEventListener("click", onCanvasClick);
      }
    };
  }

  global.GWGames = global.GWGames || {};
  global.GWGames.farm = {
    id: "farm",
    title: "팜프렌지 1탄",
    emoji: "🌾",
    desc: "풀·동물·가공·곰·창고·자동차까지! 스테이지 미션 클리어형 타임매니지먼트",
    tags: ["시뮬레이션", "스테이지"],
    accent: "#3dd68c",
    hint: "우물→풀 심기 · 산물/곰 클릭 · 공장 가공 · 자동차 판매 · 스테이지 미션 달성",
    create: create
  };
})(window);

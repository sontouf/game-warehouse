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

  var SAVE_KEY = "gw-farm-frenzy-stage-v48";
  var META_KEY = "gw-farm-frenzy-meta-v1";
  var FIELD_W = 720;
  var FIELD_H = 440;
  var FIELD_PAD = 78; /* left/right building strip */

  /* 별(스타) 상점 — GameFAQs shop star costs */
  var STAR_SHOP = {
    eggPlant: [100, 120, 130, 140, 150],
    bakery: [120, 130, 140, 150, 160],
    spinnery: [1000, 1200, 1300, 1400, 1500],
    weave: [1200, 1300, 1400, 1500, 1600],
    churn: [10000, 12000, 13000, 14000, 15000],
    dairy: [12000, 13000, 14000, 15000, 16000],
    well: [200, 400, 800, 8000],
    store: [150, 300, 2000, 10000],
    car: [100, 500, 2000, 15000],
    cage: [100, 500, 5000]
  };

  var FACTORY_PLOTS = [
    { fid: "eggPlant", side: "left", slot: 0 },
    { fid: "bakery", side: "left", slot: 1 },
    { fid: "spinnery", side: "left", slot: 2 },
    { fid: "weave", side: "right", slot: 0 },
    { fid: "churn", side: "right", slot: 1 },
    { fid: "dairy", side: "right", slot: 2 }
  ];

  /* Farm Frenzy 1 원작 가격표 (Wiki / GameFAQs) */
  var GOODS = {
    egg: { name: "달걀", emoji: "🥚", sell: 10, space: 1, carPack: 5, spoil: 18 },
    powder: { name: "계란가루", emoji: "🧂", sell: 20, space: 1, carPack: 10, spoil: 22 },
    cupcake: { name: "컵케이크", emoji: "🧁", sell: 80, space: 1, carPack: 15, spoil: 26 },
    wool: { name: "양털", emoji: "🧶", sell: 100, space: 2, carPack: 3, spoil: 20 },
    thread: { name: "실타래", emoji: "🧵", sell: 200, space: 2, carPack: 5, spoil: 24 },
    fabric: { name: "옷감", emoji: "🧣", sell: 800, space: 2, carPack: 10, spoil: 28 },
    milk: { name: "우유", emoji: "🥛", sell: 1000, space: 3, carPack: 2, spoil: 20 },
    butter: { name: "버터", emoji: "🧈", sell: 2000, space: 2, carPack: 5, spoil: 24 },
    cheese: { name: "치즈", emoji: "🧀", sell: 8000, space: 2, carPack: 10, spoil: 28 },
    bear: { name: "곰", emoji: "🐻", sell: 100, space: 3, carPack: 1, spoil: 999 }
  };

  /* FF1 동물 전체: 오리(goose)·양·젖소·개·고양이 */
  var ANIMALS = {
    goose: {
      name: "오리", emoji: "🦆", cost: 100, sell: 50,
      produce: "egg", hungerMax: 100, eatNeed: 28, produceTime: 7, speed: 38, size: 18
    },
    sheep: {
      name: "양", emoji: "🐑", cost: 1000, sell: 500,
      produce: "wool", hungerMax: 120, eatNeed: 36, produceTime: 10, speed: 30, size: 20
    },
    cow: {
      name: "젖소", emoji: "🐄", cost: 10000, sell: 5000,
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

  var ALL_ANIMAL_ORDER = ["goose", "sheep", "cow", "dog", "cat"];

  var FACTORIES = {
    eggPlant: { name: "계란가루 공장", emoji: "🏭", from: "egg", to: "powder", buy: 200, upCost: [300, 400, 500, 600], time: 5 },
    bakery: { name: "제과점", emoji: "🍪", from: "powder", to: "cupcake", buy: 400, upCost: [600, 800, 1000, 1200], time: 6 },
    spinnery: { name: "방적소", emoji: "🪡", from: "wool", to: "thread", buy: 2000, upCost: [3000, 4000, 5000, 6000], time: 6 },
    weave: { name: "직조공장", emoji: "🧵", from: "thread", to: "fabric", buy: 4000, upCost: [6000, 8000, 10000, 12000], time: 7 },
    churn: { name: "버터공방", emoji: "🏺", from: "milk", to: "butter", buy: 20000, upCost: [30000, 40000, 50000, 60000], time: 7 },
    dairy: { name: "치즈공장", emoji: "🧀", from: "butter", to: "cheese", buy: 40000, upCost: [60000, 80000, 100000, 120000], time: 8 }
  };

  /* 원작 48레벨: js/games/ff1-stages.js */
  var STAGES = (typeof window !== "undefined" && window.FF1_STAGES) ? window.FF1_STAGES : [];

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
  function wellRefillCost(lv) { return [19, 17, 15, 7][lv] || 19; }
  function wellUpCost(lv) { return [300, 600, 1200, 5000][lv]; }
  function storeUpCost(lv) { return [150, 500, 1000, 2000][lv]; }
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
    var pack = GOODS[good] && GOODS[good].carPack ? GOODS[good].carPack : 1;
    return 1 / pack;
  }

  function defaultMeta() {
    /* cap = 스테이지 내 코인 업그레이드 가능 상한(레벨 수). 별 상점에서 더 올림 */
    return {
      stars: 0,
      factoryCap: { eggPlant: 2, bakery: 2, spinnery: 2, weave: 2, churn: 2, dairy: 2 },
      wellCap: 2,
      storeCap: 2,
      carCap: 2,
      cageLv: 0,
      bestRank: {},
      tutorialDone: false,
      muted: false
    };
  }
  function loadMeta() {
    try {
      var raw = JSON.parse(localStorage.getItem(META_KEY) || "{}");
      var d = defaultMeta();
      var m = Object.assign({}, d, raw);
      m.factoryCap = Object.assign({}, d.factoryCap, raw.factoryCap || {});
      m.bestRank = Object.assign({}, d.bestRank, raw.bestRank || {});
      return m;
    } catch (e) {
      return defaultMeta();
    }
  }
  function saveMeta(meta) {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }
  function plotRect(plot) {
    var y = 56 + plot.slot * 118;
    if (plot.side === "left") {
      return { x: 8, y: y, w: 64, h: 96, dropX: FIELD_PAD + 18, dropY: y + 70 };
    }
    return { x: FIELD_W - 72, y: y, w: 64, h: 96, dropX: FIELD_W - FIELD_PAD - 18, dropY: y + 70 };
  }
  function stageMedalTimes(stageId) {
    var gold = 55 + stageId * 9;
    var silver = gold + 35 + stageId * 5;
    return { gold: gold, silver: silver };
  }
  function starRankFor(stageId, timeSec) {
    var t = stageMedalTimes(stageId);
    if (timeSec <= t.gold) return 3;
    if (timeSec <= t.silver) return 2;
    return 1;
  }
  function starsForClear(stageId, timeSec) {
    var rank = starRankFor(stageId, timeSec);
    var base = [0, 55, 95, 150][rank] + stageId * 8;
    return Math.max(25, Math.floor(base));
  }
  function starRank(timeSec) { return starRankFor(1, timeSec); }
  function fmtTime(sec) {
    var m = Math.floor(sec / 60);
    var s2 = Math.floor(sec % 60);
    return m + ":" + String(s2).padStart(2, "0");
  }
  function fieldX(x) { return clamp(x, FIELD_PAD + 16, FIELD_W - FIELD_PAD - 16); }
  function fieldY(y) { return clamp(y, 48, FIELD_H - 28); }
  function uid() { return "e" + Math.random().toString(36).slice(2, 9); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function create(stageEl, api) {
    var maxUnlocked = Number(localStorage.getItem(SAVE_KEY) || 1);
    var stageIndex = Math.min(maxUnlocked, STAGES.length) - 1;
    var meta = loadMeta();
    var running = false;
    var paused = false;
    var raf = 0;
    var lastTs = 0;
    var state = null;
    var toastTimer = 0;
    var menuMode = "stages"; /* stages | shop */
    var drag = null; /* { kind:'drop'|'bear', index, good? } */
    var audioCtx = null;
    function beep(freq, dur, type, vol) {
      if (loadMeta().muted) return;
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.type = type || "square";
        o.frequency.value = freq;
        g.gain.value = vol || 0.04;
        o.connect(g); g.connect(audioCtx.destination);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (dur || 0.08));
        o.stop(audioCtx.currentTime + (dur || 0.08));
      } catch (e) {}
    }
    function sfx(name) {
      if (name === "ok") beep(660, 0.07, "triangle", 0.05);
      else if (name === "coin") beep(880, 0.09, "square", 0.045);
      else if (name === "warn") beep(220, 0.12, "sawtooth", 0.04);
      else if (name === "bear") beep(140, 0.18, "sawtooth", 0.05);
      else if (name === "win") { beep(523, 0.1); setTimeout(function () { beep(659, 0.1); }, 90); setTimeout(function () { beep(784, 0.16); }, 180); }
      else if (name === "lose") beep(110, 0.35, "triangle", 0.06);
      else if (name === "plant") beep(400, 0.05, "sine", 0.03);
    }

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
      '      <span>🥇 <b id="ff-medal">-</b></span>' +
      '      <span>창고 <b id="ff-store">0/0</b></span>' +
      '      <button type="button" class="ff-icon-btn" id="ff-pause" title="일시정지">⏸</button>' +
      '      <button type="button" class="ff-icon-btn" id="ff-mute" title="소리">🔊</button>' +
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
      medal: root.querySelector("#ff-medal"),
      store: root.querySelector("#ff-store"),
      pauseBtn: root.querySelector("#ff-pause"),
      muteBtn: root.querySelector("#ff-mute"),
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
      /* collect/catchBear는 누적 달성 유지, money/animals는 현재 상태 재검사(원작) */
      if (g.type === "collect") {
        if (g._done) return true;
        if ((state.collected[g.good] || 0) >= g.amount) { g._done = true; return true; }
        return false;
      }
      if (g.type === "catchBear") {
        if (g._done) return true;
        if (state.bearsCaught >= g.amount) { g._done = true; return true; }
        return false;
      }
      if (g.type === "money") return state.money >= g.amount;
      if (g.type === "animals") {
        return state.animals.filter(function (a) { return a.alive && a.kind === g.kind; }).length >= g.amount;
      }
      return false;
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
        meta = loadMeta();
        state.lastStars = starsForClear(state.stageId, state.time);
        state.lastRank = starRankFor(state.stageId, state.time);
        meta.stars += state.lastStars;
        var prev = meta.bestRank[state.stageId] || 0;
        if (state.lastRank > prev) meta.bestRank[state.stageId] = state.lastRank;
        saveMeta(meta);
        sfx("win");
        showResult(true);
      }
    }

    function spawnAnimal(kind, x, y) {
      var def = ANIMALS[kind];
      state.animals.push({
        id: uid(), kind: kind, x: x || rand(FIELD_PAD + 40, FIELD_W - FIELD_PAD - 40), y: y || rand(90, FIELD_H - 50),
        vx: rand(-1, 1) * def.speed, vy: rand(-1, 1) * def.speed,
        hunger: def.hungerMax * 0.7, fed: 0, produceCd: def.produceTime * 0.4,
        alive: true, special: def.special || null
      });
    }

    function initStage(idx) {
      var conf = STAGES[idx];
      stageIndex = idx;
      meta = loadMeta();
      var startWell = Math.min(conf.wellLv, Math.max(0, meta.wellCap - 1));
      var startStore = Math.min(conf.storeLv, Math.max(0, meta.storeCap - 1));
      var startCar = Math.min(conf.carLv, Math.max(0, meta.carCap - 1));
      state = {
        stageId: conf.id,
        title: conf.title,
        money: conf.money,
        time: 0,
        wellLv: startWell,
        storeLv: startStore,
        carLv: startCar,
        cageNeed: Math.max(2, conf.cageClicks - meta.cageLv),
        water: wellWater(startWell),
        waterMax: wellWater(startWell),
        autoWell: startWell >= 3,
        animals: [],
        drops: [],
        grasses: [],
        bears: [],
        bearShadows: [],
        flyFx: [],
        warehouse: {},
        collected: {},
        bearsCaught: 0,
        factories: {},
        car: { busy: false, t: 0, maxT: 0, load: {}, revenue: 0, phase: 0 },
        goals: conf.goals.map(function (g) { return Object.assign({ _done: false }, g); }),
        unlock: conf.unlock.slice(),
        availableFactories: (conf.availableFactories || []).slice(),
        bearEvery: conf.bearEvery,
        bearTimer: conf.bearEvery * 0.6,
        cleared: false,
        failed: false,
        failTimer: 0,
        lastStars: 0,
        medals: stageMedalTimes(conf.id),
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
        state.grasses.push({ x: rand(FIELD_PAD + 30, FIELD_W - FIELD_PAD - 30), y: rand(70, FIELD_H - 40), hp: 3 });
      }

      els.menu.hidden = true;
      els.play.hidden = false;
      els.modal.hidden = true;
      running = false;
      paused = false;
      lastTs = 0;
      drag = null;
      renderAllUi();
      api.setScore(state.money);
      cancelAnimationFrame(raf);
      showBriefing(conf);
    }

    function showBriefing(conf) {
      var med = stageMedalTimes(conf.id);
      els.modal.hidden = false;
      els.modal.innerHTML =
        '<div class="ff-modal-card"><h3>레벨 ' + conf.id + " 목표</h3>" +
        "<ul class=\"ff-brief-goals\">" +
        conf.goals.map(function (g) { return "<li>" + goalLabel(g) + "</li>"; }).join("") +
        "</ul>" +
        "<p>시작 자금 <b>" + conf.money.toLocaleString("ko-KR") + "원</b></p>" +
        "<p class=\"ff-medal-line\">🥇 금 " + fmtTime(med.gold) + " · 🥈 은 " + fmtTime(med.silver) + " · 그 외 동</p>" +
        '<div class="ff-modal-actions">' +
        '<button type="button" class="btn btn--ghost" id="ff-brief-back">뒤로</button>' +
        '<button type="button" class="btn btn--primary" id="ff-brief-go">시작!</button>' +
        "</div></div>";
      els.modal.querySelector("#ff-brief-back").onclick = function () { els.modal.hidden = true; renderMenu(); };
      els.modal.querySelector("#ff-brief-go").onclick = function () {
        els.modal.hidden = true;
        running = true;
        lastTs = 0;
        toast("스테이지 " + conf.id + ": 우물→풀 · 산물 수거 · 곰 연타");
        maybeTutorial();
        raf = requestAnimationFrame(loop);
      };
    }

    function maybeTutorial() {
      meta = loadMeta();
      if (meta.tutorialDone || state.stageId > 2) return;
      els.hint.classList.add("ff-hint--tut");
      var steps = [
        "① 우물을 클릭하거나 [물 사기]로 물을 채우세요",
        "② 밭을 클릭해 풀을 심고, 오리가 먹게 하세요",
        "③ 떨어진 달걀을 클릭해 창고에 넣으세요",
        "④ 곰 그림자가 보이면 연타로 가두고 창고로!",
        "⑤ 자동차로 시장에 팔아 목표를 달성하세요"
      ];
      var i = 0;
      function next() {
        if (i >= steps.length) {
          els.hint.classList.remove("ff-hint--tut");
          meta = loadMeta();
          meta.tutorialDone = true;
          saveMeta(meta);
          toast("튜토리얼 완료! 행운을 빌어요");
          return;
        }
        els.hint.textContent = steps[i++];
        setTimeout(next, 3200);
      }
      next();
    }

    function buyStarUpgrade(key) {
      meta = loadMeta();
      var costs = STAR_SHOP[key];
      if (!costs) return;
      var costIdx;
      if (key === "cage") costIdx = meta.cageLv;
      else if (key === "well") costIdx = meta.wellCap - 1;
      else if (key === "store") costIdx = meta.storeCap - 1;
      else if (key === "car") costIdx = meta.carCap - 1;
      else costIdx = (meta.factoryCap[key] || 1) - 1;
      var cost = costs[costIdx];
      if (cost == null) { toastMenu("이미 최대입니다."); return; }
      if (meta.stars < cost) { toastMenu("별이 부족합니다. (필요 " + cost + ")"); return; }
      meta.stars -= cost;
      if (key === "well") meta.wellCap += 1;
      else if (key === "store") meta.storeCap += 1;
      else if (key === "car") meta.carCap += 1;
      else if (key === "cage") meta.cageLv += 1;
      else meta.factoryCap[key] = (meta.factoryCap[key] || 1) + 1;
      saveMeta(meta);
      renderMenu();
    }
    function toastMenu(msg) {
      var el = els.menu.querySelector("#ff-shop-toast");
      if (el) el.textContent = msg;
    }
    function shopRow(label, key, curLv) {
      var costs = STAR_SHOP[key];
      var cost = costs[curLv];
      var maxed = cost == null;
      return '<button type="button" class="ff-shop-btn" data-star-up="' + key + '"' + (maxed || meta.stars < (cost || 0) ? " disabled" : "") + ">" +
        "<strong>" + label + "</strong>" +
        "<span>현재 최대 Lv" + curLv + (maxed ? " · MAX" : " → Lv" + (curLv + 1)) + "</span>" +
        "<em>" + (maxed ? "완료" : "⭐ " + cost) + "</em></button>";
    }
    function renderMenu() {
      els.play.hidden = true;
      els.menu.hidden = false;
      running = false;
      cancelAnimationFrame(raf);
      meta = loadMeta();
      if (!STAGES.length) {
        els.menu.innerHTML = '<div class="ff-menu-card"><h3>스테이지 로드 실패</h3><p>ff1-stages.js를 확인하세요.</p></div>';
        return;
      }
      var html = '<div class="ff-menu-card"><h3>🌾 팜프렌지 1탄</h3>' +
        '<div class="ff-menu-tabs">' +
        '<button type="button" class="ff-tab' + (menuMode === "stages" ? " is-on" : "") + '" data-menu-tab="stages">스테이지</button>' +
        '<button type="button" class="ff-tab' + (menuMode === "shop" ? " is-on" : "") + '" data-menu-tab="shop">별 상점</button>' +
        '</div>' +
        '<p class="ff-stars-line">보유 별 ⭐ <b id="ff-meta-stars">' + meta.stars.toLocaleString("ko-KR") + "</b> · 해금 " +
        Math.min(maxUnlocked, STAGES.length) + "/" + STAGES.length +
        " · 클리어 보상 별로 건물 최대 레벨을 올립니다</p>";

      if (menuMode === "shop") {
        html += '<p id="ff-shop-toast" class="ff-shop-toast">스테이지 클리어로 별을 모아 업그레이드하세요.</p>';
        html += '<div class="ff-shop-grid">';
        html += shopRow("우물 최대", "well", meta.wellCap - 1);
        html += shopRow("창고 최대", "store", meta.storeCap - 1);
        html += shopRow("자동차 최대", "car", meta.carCap - 1);
        html += shopRow("케이지", "cage", meta.cageLv);
        Object.keys(FACTORIES).forEach(function (fid) {
          html += shopRow(FACTORIES[fid].emoji + " " + FACTORIES[fid].name, fid, (meta.factoryCap[fid] || 1) - 1);
        });
        html += "</div></div>";
        els.menu.innerHTML = html;
        els.menu.querySelectorAll("[data-menu-tab]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            menuMode = btn.getAttribute("data-menu-tab");
            renderMenu();
          });
        });
        els.menu.querySelectorAll("[data-star-up]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            buyStarUpgrade(btn.getAttribute("data-star-up"));
          });
        });
        return;
      }

      html += '<div class="ff-stage-list ff-stage-list--grid">';
      STAGES.forEach(function (stage, i) {
        var locked = stage.id > maxUnlocked;
        var tip = stage.goals.map(goalLabel).join(" / ");
        var br = meta.bestRank[stage.id] || 0;
        var medal = br === 3 ? "🥇" : br === 2 ? "🥈" : br === 1 ? "🥉" : (locked ? "🔒" : "·");
        html += '<button type="button" class="ff-stage-btn ff-stage-btn--num' + (locked ? " is-locked" : "") +
          '" data-stage="' + i + '" title="' + tip.replace(/"/g, "") + '" ' + (locked ? "disabled" : "") + ">" +
          "<strong>" + stage.id + "</strong>" +
          "<em>" + medal + "</em>" +
          "</button>";
      });
      html += "</div>";
      var cur = STAGES[Math.min(maxUnlocked, STAGES.length) - 1] || STAGES[0];
      html += '<div class="ff-stage-preview"><h4>다음/최근: 레벨 ' + cur.id + "</h4><ul>" +
        cur.goals.map(function (g) { return "<li>" + goalLabel(g) + "</li>"; }).join("") +
        "</ul><p>시작 자금 " + cur.money.toLocaleString("ko-KR") + "원</p>" +
        '<button type="button" class="btn btn--primary" id="ff-play-current">이 레벨 플레이</button></div></div>';
      els.menu.innerHTML = html;
      els.menu.querySelectorAll("[data-menu-tab]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          menuMode = btn.getAttribute("data-menu-tab");
          renderMenu();
        });
      });
      els.menu.querySelectorAll("[data-stage]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          initStage(Number(btn.getAttribute("data-stage")));
        });
      });
      var playBtn = els.menu.querySelector("#ff-play-current");
      if (playBtn) {
        playBtn.addEventListener("click", function () {
          initStage(Math.min(maxUnlocked, STAGES.length) - 1);
        });
      }
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
      if (!state) return;
      els.money.textContent = Math.floor(state.money).toLocaleString("ko-KR");
      var m = Math.floor(state.time / 60);
      var s2 = Math.floor(state.time % 60);
      els.time.textContent = m + ":" + String(s2).padStart(2, "0");
      if (els.medal && state.medals) {
        var rank = starRankFor(state.stageId, state.time);
        els.medal.textContent = (rank === 3 ? "금" : rank === 2 ? "은" : "동") +
          " (🥇" + fmtTime(state.medals.gold) + ")";
      }
      els.store.textContent = usedSlots() + "/" + storeCap(state.storeLv) + " (여유 " + freeStore(state) + ")";
      if (els.pauseBtn) els.pauseBtn.textContent = paused ? "▶" : "⏸";
      if (els.muteBtn) els.muteBtn.textContent = loadMeta().muted ? "🔇" : "🔊";
      api.setScore(Math.floor(state.money));
    }

    function renderLeft() {
      var html = "";
      html += '<div class="ff-panel"><h4>🛒 동물 구매 (FF1)</h4><div class="ff-btns">';
      ALL_ANIMAL_ORDER.forEach(function (kind) {
        var a = ANIMALS[kind];
        var unlocked = state.unlock.indexOf(kind) !== -1;
        if (!unlocked) {
          html += '<button type="button" class="ff-mini" disabled>' +
            a.emoji + " " + a.name + "<small>잠김 · " + a.cost.toLocaleString("ko-KR") + "원</small></button>";
          return;
        }
        html += '<button type="button" class="ff-mini" data-buy-animal="' + kind + '">' +
          a.emoji + " " + a.name + "<small>" + a.cost.toLocaleString("ko-KR") + "원" +
          (a.sell ? " / 매각 " + a.sell.toLocaleString("ko-KR") : " / 매각불가") +
          "</small></button>";
      });
      html += "</div></div>";

      html += '<div class="ff-panel"><h4>🔧 장비 업그레이드</h4><div class="ff-btns">';
      meta = loadMeta();
      var wu = wellUpCost(state.wellLv);
      var su = storeUpCost(state.storeLv);
      var cu = carUpCost(state.carLv);
      var wellBlocked = !wu || state.wellLv + 1 >= meta.wellCap;
      var storeBlocked = !su || state.storeLv + 1 >= meta.storeCap;
      var carBlocked = !cu || state.carLv + 1 >= meta.carCap;
      html += '<button type="button" class="ff-mini" data-up="well" ' + (wellBlocked ? "disabled" : "") + ">우물 Lv" + state.wellLv +
        (wellBlocked ? "<small>" + (!wu ? "MAX" : "별상점 상한") + "</small>" : "<small>" + wu + "원</small>") + "</button>";
      html += '<button type="button" class="ff-mini" data-up="store" ' + (storeBlocked ? "disabled" : "") + ">창고 Lv" + state.storeLv +
        (storeBlocked ? "<small>" + (!su ? "MAX" : "별상점 상한") + "</small>" : "<small>" + su + "원</small>") + "</button>";
      html += '<button type="button" class="ff-mini" data-up="car" ' + (carBlocked ? "disabled" : "") + ">자동차 Lv" + state.carLv +
        (carBlocked ? "<small>" + (!cu ? "MAX" : "별상점 상한") + "</small>" : "<small>" + cu + "원</small>") + "</button>";
      html += "</div></div>";

      html += '<div class="ff-panel"><h4>🏭 가공 건물</h4><div class="ff-btns">';
      Object.keys(FACTORIES).forEach(function (fid) {
        var f = FACTORIES[fid];
        var st = state.factories[fid];
        var canBuy = state.availableFactories.indexOf(fid) !== -1;
        if (!st.owned) {
          if (!canBuy) return;
          html += '<button type="button" class="ff-mini" data-buy-factory="' + fid + '">' + f.emoji + " " + f.name +
            " 구매<small>" + f.buy.toLocaleString("ko-KR") + "원</small></button>";
        } else {
          var up = f.upCost[st.lv];
          var fcap = (meta.factoryCap && meta.factoryCap[fid]) || 2;
          var busy = st.busy ? " ⏳" : "";
          html += '<button type="button" class="ff-mini" data-run-factory="' + fid + '">' + f.emoji + " " + f.name + " Lv" + st.lv +
            " ×" + (1 + st.lv) + busy +
            "<small>" + GOODS[f.from].emoji + "→" + GOODS[f.to].emoji + (st.busy ? " " + Math.ceil(st.t) + "s" : "") + "</small></button>";
          if (up && st.lv + 1 < fcap) {
            html += '<button type="button" class="ff-mini ff-mini--sub" data-up-factory="' + fid + '">업그레이드<small>' + up.toLocaleString("ko-KR") + "원</small></button>";
          } else if (up) {
            html += '<button type="button" class="ff-mini ff-mini--sub" disabled>업그레이드<small>별상점 상한</small></button>';
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
        html += '<div class="ff-inv-row">' + g.emoji + ' ' + g.name + ' × <b>' + state.warehouse[k] + '</b>' +
          ' <small>(' + g.sell + '원 · 칸 ' + used + ')</small>' +
          ' <button type="button" class="ff-discard" data-discard="' + k + '" title="버리기">🗑</button></div>';
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

      root.querySelector("#ff-refill").addEventListener("click", function () { refillWell(); });
      root.querySelector("#ff-open-car").addEventListener("click", openCarModal);
      root.querySelector("#ff-quit").addEventListener("click", function () {
        if (!confirm("스테이지를 포기하고 나갈까요?")) return;
        running = false;
        paused = false;
        renderMenu();
      });
      root.querySelectorAll("[data-discard]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var k = btn.getAttribute("data-discard");
          if (!state.warehouse[k]) return;
          state.warehouse[k] -= 1;
          if (state.warehouse[k] <= 0) delete state.warehouse[k];
          toast(GOODS[k].name + "을(를) 버렸습니다.");
          sfx("warn");
          renderRight();
          updateHud();
        });
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
        "<span>🦆오리→🥚</span><span>🐑양→🧶</span><span>🐄젖소→🥛</span>" +
        "<span>🐕개 곰견제</span><span>🐈고양이 수집</span><span>🐻연타 포획</span>" +
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
          meta = loadMeta();
          if (t === "well") {
            var c = wellUpCost(state.wellLv);
            if (!c || state.wellLv + 1 >= meta.wellCap) {
              if (state.wellLv + 1 >= meta.wellCap) toast("별 상점에서 우물 최대 레벨을 올리세요!");
              if (!c || state.wellLv + 1 >= meta.wellCap) return;
            }
            if (!spend(c)) return;
            state.wellLv += 1;
            state.autoWell = state.wellLv >= 3;
            state.water = wellWater(state.wellLv);
            state.waterMax = wellWater(state.wellLv);
            toast("우물 업그레이드!");
          } else if (t === "store") {
            var c2 = storeUpCost(state.storeLv);
            if (!c2 || state.storeLv + 1 >= meta.storeCap) {
              if (state.storeLv + 1 >= meta.storeCap) toast("별 상점에서 창고 최대 레벨을 올리세요!");
              if (!c2 || state.storeLv + 1 >= meta.storeCap) return;
            }
            if (!spend(c2)) return;
            state.storeLv += 1;
            toast("창고 확장!");
          } else if (t === "car") {
            var c3 = carUpCost(state.carLv);
            if (!c3 || state.carLv + 1 >= meta.carCap) {
              if (state.carLv + 1 >= meta.carCap) toast("별 상점에서 자동차 최대 레벨을 올리세요!");
              if (!c3 || state.carLv + 1 >= meta.carCap) return;
            }
            if (!spend(c3)) return;
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
          meta = loadMeta();
          var fcap = meta.factoryCap[fid] || 1;
          if (!c || st.lv + 1 >= fcap) {
            if (st.lv + 1 >= fcap) toast("별 상점에서 " + f.name + " 최대 레벨을 올리세요!");
            if (!c || st.lv + 1 >= fcap) return;
          }
          if (!spend(c)) return;
          st.lv += 1;
          toast(f.name + " 업그레이드! 배치 " + (1 + st.lv) + "개");
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
      var batch = 1 + st.lv;
      if ((state.warehouse[f.from] || 0) < batch) {
        toast(GOODS[f.from].name + " " + batch + "개 필요 (현재 공장 Lv" + st.lv + ")");
        return;
      }
      state.warehouse[f.from] -= batch;
      st.busy = true;
      st.t = Math.max(2.5, f.time - st.lv * 0.5);
      st.maxT = st.t;
      st.out = batch;
      var plot = FACTORY_PLOTS.find(function (p) { return p.fid === fid; });
      var pr = plot ? plotRect(plot) : { x: FIELD_W / 2, y: 80 };
      for (var i = 0; i < batch; i++) {
        state.flyFx.push({
          good: f.from,
          x: FIELD_W / 2 + rand(-20, 20),
          y: FIELD_H - 36,
          tx: pr.x + pr.w / 2,
          ty: pr.y + 40,
          life: 0.55 + i * 0.08,
          max: 0.55 + i * 0.08
        });
      }
      toast(f.name + " 가동! (" + batch + "개 가공)");
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
        var html = '<div class="ff-modal-card"><h3>🚗 시장 출하</h3><p>슬롯 ' +
          (Math.round(slots * 100) / 100) + '/' + maxSlots +
          ' · 예상 수익 <b>' + revenue.toLocaleString('ko-KR') + '원</b></p><div class="ff-car-grid">';
        Object.keys(GOODS).forEach(function (k) {
          var have = state.warehouse[k] || 0;
          var inLoad = load[k] || 0;
          if (!have && !inLoad) return;
          html += '<div class="ff-car-row">' +
            '<span>' + GOODS[k].emoji + ' ' + GOODS[k].name + ' (창고 ' + have +
            ' · 상자당 ' + (GOODS[k].carPack || 1) + ')</span>' +
            '<div class="ff-car-acts">' +
            '<button type="button" data-car-minus="' + k + '">−</button>' +
            '<b>' + inLoad + '</b>' +
            '<button type="button" data-car-plus="' + k + '">+</button>' +
            '</div></div>';
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
          state.car.maxT = state.car.t;
          state.car.revenue = revenue;
          state.car.load = load;
          state.car.phase = 0;
          els.modal.hidden = true;
          toast("자동차가 시장으로 출발!");
          renderRight();
        };
        els.modal.querySelectorAll("[data-car-plus]").forEach(function (b) {
          b.onclick = function () {
            var k = b.getAttribute("data-car-plus");
            var space = goodCarSpace(k);
            if ((state.warehouse[k] || 0) - (load[k] || 0) <= 0) return;
            if (slots + space > maxSlots + 1e-9) { toast("자동차 슬롯이 부족합니다."); return; }
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
      var starLine = "";
      if (win) {
        var rank = state.lastRank || 1;
        var medalName = rank === 3 ? "금메달" : rank === 2 ? "은메달" : "동메달";
        starLine = "<p class=\"ff-star-reward\">" +
          (rank === 3 ? "🥇" : rank === 2 ? "🥈" : "🥉") + " " + medalName +
          " · 별 +" + (state.lastStars || 0).toLocaleString("ko-KR") +
          " (보유 " + loadMeta().stars.toLocaleString("ko-KR") + ")</p>" +
          "<p>목표 시간 🥇 " + fmtTime(state.medals.gold) + " / 🥈 " + fmtTime(state.medals.silver) + "</p>" +
          '<button type="button" class="btn btn--ghost" id="ff-res-shop">별 상점 열기</button>';
      } else {
        sfx("lose");
        starLine = "<p>가축이 없거나 더 이상 진행할 수 없습니다. 다시 도전해 보세요!</p>";
      }
      els.modal.innerHTML =
        '<div class="ff-modal-card"><h3>' + (win ? "🎉 스테이지 클리어!" : "실패") + "</h3>" +
        "<p>" + state.title + " · 시간 " + els.time.textContent + " · 자금 " + Math.floor(state.money).toLocaleString("ko-KR") + "원</p>" +
        starLine +
        '<div class="ff-modal-actions">' +
        '<button type="button" class="btn btn--ghost" id="ff-res-menu">스테이지 선택</button>' +
        (win && stageIndex < STAGES.length - 1
          ? '<button type="button" class="btn btn--primary" id="ff-res-next">다음 스테이지</button>'
          : '<button type="button" class="btn btn--primary" id="ff-res-retry">다시 하기</button>') +
        "</div></div>";
      els.modal.querySelector("#ff-res-menu").onclick = function () { menuMode = "stages"; renderMenu(); };
      var shop = els.modal.querySelector("#ff-res-shop");
      if (shop) shop.onclick = function () { menuMode = "shop"; renderMenu(); };
      var next = els.modal.querySelector("#ff-res-next");
      if (next) next.onclick = function () { initStage(stageIndex + 1); };
      var retry = els.modal.querySelector("#ff-res-retry");
      if (retry) retry.onclick = function () { initStage(stageIndex); };
    }

    function wellHotspot() {
      return { x: FIELD_PAD + 28, y: FIELD_H - 52, r: 28 };
    }
    function storeHotspot() {
      return { x: FIELD_W / 2, y: FIELD_H - 40, r: 42 };
    }
    function refillWell() {
      if (state.autoWell) { toast("최고 우물은 물을 무제한으로 씁니다."); return false; }
      var cost = wellRefillCost(state.wellLv);
      if (!spend(cost)) return false;
      state.water = wellWater(state.wellLv);
      state.waterMax = state.water;
      toast("우물에 물을 채웠습니다.");
      sfx("ok");
      renderRight();
      updateHud();
      return true;
    }
    function plantGrass(x, y) {
      if (x < FIELD_PAD + 10 || x > FIELD_W - FIELD_PAD - 10) return false;
      if (y > FIELD_H - 70) return false; /* 우물/창고/차 영역 보호 */
      if (state.autoWell) {
        /* 원작 최고 우물: 급수 무료·무제한 */
      } else {
        if (state.water <= 0) {
          toast("우물이 비었습니다! 우물을 클릭해 물을 사세요.");
          sfx("warn");
          return false;
        }
        state.water -= 1;
      }
      state.grasses.push({ x: x, y: y, hp: 3 });
      sfx("plant");
      renderRight();
      updateHud();
      return true;
    }

    function hitTest(list, x, y, r) {
      for (var i = list.length - 1; i >= 0; i--) {
        var o = list[i];
        var dx = o.x - x, dy = o.y - y;
        if (dx * dx + dy * dy <= r * r) return i;
      }
      return -1;
    }

    function hitPlot(x, y) {
      for (var i = 0; i < FACTORY_PLOTS.length; i++) {
        var plot = FACTORY_PLOTS[i];
        var r = plotRect(plot);
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return plot;
      }
      return null;
    }
    function canvasXY(e) {
      var rect = els.canvas.getBoundingClientRect();
      var src = e.touches && e.touches[0] ? e.touches[0] : e;
      return {
        x: (src.clientX - rect.left) * (FIELD_W / rect.width),
        y: (src.clientY - rect.top) * (FIELD_H / rect.height)
      };
    }
    function tryFactoryAt(x, y) {
      var plotHit = hitPlot(x, y);
      if (!plotHit) return false;
      var st = state.factories[plotHit.fid];
      var f = FACTORIES[plotHit.fid];
      if (!st.owned) {
        if (state.availableFactories.indexOf(plotHit.fid) === -1) {
          toast("이 스테이지에서는 " + f.name + "을(를) 지을 수 없습니다.");
          return true;
        }
        if (!spend(f.buy)) return true;
        st.owned = true;
        toast(f.name + " 설치!");
        sfx("ok");
        renderLeft();
        updateHud();
        return true;
      }
      runFactory(plotHit.fid);
      return true;
    }
    function hitBearCage(bi) {
      var bear = state.bears[bi];
      if (bear.fleeing) return;
      if (bear.caged) {
        if (addWarehouse("bear", 1)) {
          state.bearsCaught += 1;
          state.bears.splice(bi, 1);
          toast("곰을 창고에 넣었습니다. (칸 3 사용)");
          sfx("coin");
          checkGoals();
          renderRight();
          updateHud();
        } else {
          bear.cageLife = Math.max(bear.cageLife, 10);
          toast("창고가 가득합니다! 출하하거나 물건을 버리세요.");
          sfx("warn");
        }
      } else {
        bear.clicks += 1;
        sfx("ok");
        if (bear.clicks >= state.cageNeed) {
          bear.caged = true;
          bear.cageLife = 12;
          toast("곰을 가뒀습니다! 다시 클릭해 창고로 넣으세요.");
        }
      }
    }
    function onPointerDown(e) {
      if (!running || paused || !state || state.cleared || state.failed) return;
      var p = canvasXY(e);
      var bi = hitTest(state.bears, p.x, p.y, 28);
      if (bi >= 0) {
        drag = { kind: "bear", index: bi, x: p.x, y: p.y, moved: false };
        e.preventDefault();
        return;
      }
      var di = hitTest(state.drops, p.x, p.y, 22);
      if (di >= 0) {
        drag = { kind: "drop", index: di, good: state.drops[di].good, x: p.x, y: p.y, moved: false };
        e.preventDefault();
      }
    }
    function onPointerMove(e) {
      if (!drag) return;
      var p = canvasXY(e);
      if (Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 8) drag.moved = true;
      drag.cx = p.x;
      drag.cy = p.y;
      e.preventDefault();
    }
    function onPointerUp(e) {
      if (!running || paused || !state) { drag = null; return; }
      var p = canvasXY(e.changedTouches ? e.changedTouches[0] : e);
      if (!drag) {
        handleTap(p.x, p.y);
        return;
      }
      var d = drag;
      drag = null;
      if (d.kind === "bear") {
        if (!d.moved) {
          if (state.bears[d.index]) hitBearCage(d.index);
        } else {
          var sh = storeHotspot();
          var b = state.bears[d.index];
          if (b && b.caged && (p.x - sh.x) * (p.x - sh.x) + (p.y - sh.y) * (p.y - sh.y) < sh.r * sh.r) {
            hitBearCage(d.index);
          } else if (state.bears[d.index]) {
            hitBearCage(d.index);
          }
        }
        return;
      }
      if (d.kind === "drop") {
        var drop = state.drops[d.index];
        if (!drop) return;
        var store = storeHotspot();
        var plot = hitPlot(p.x, p.y);
        if (plot && state.factories[plot.fid].owned) {
          var f = FACTORIES[plot.fid];
          if (drop.good === f.from) {
            if (addWarehouse(drop.good, 1)) {
              state.drops.splice(d.index, 1);
              runFactory(plot.fid);
            }
            return;
          }
        }
        if (!d.moved || (p.x - store.x) * (p.x - store.x) + (p.y - store.y) * (p.y - store.y) < store.r * store.r || true) {
          if (addWarehouse(drop.good, 1)) {
            state.drops.splice(d.index, 1);
            sfx("ok");
            renderRight();
            updateHud();
          }
        }
      }
    }
    function handleTap(x, y) {
      var wh = wellHotspot();
      if ((x - wh.x) * (x - wh.x) + (y - wh.y) * (y - wh.y) < wh.r * wh.r) {
        refillWell();
        return;
      }
      if (tryFactoryAt(x, y)) return;
      var bi = hitTest(state.bears, x, y, 28);
      if (bi >= 0) { hitBearCage(bi); return; }
      var di = hitTest(state.drops, x, y, 22);
      if (di >= 0) {
        if (addWarehouse(state.drops[di].good, 1)) {
          state.drops.splice(di, 1);
          sfx("ok");
          renderRight();
          updateHud();
        }
        return;
      }
      plantGrass(x, y);
    }

    els.canvas.addEventListener("mousedown", onPointerDown);
    els.canvas.addEventListener("mousemove", onPointerMove);
    els.canvas.addEventListener("touchstart", onPointerDown, { passive: false });
    els.canvas.addEventListener("touchmove", onPointerMove, { passive: false });
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("mouseup", onPointerUp);
      window.addEventListener("touchend", onPointerUp);
    } else {
      els.canvas.addEventListener("mouseup", onPointerUp);
      els.canvas.addEventListener("touchend", onPointerUp);
    }
    if (els.pauseBtn) {
      els.pauseBtn.addEventListener("click", function () {
        if (!state || state.cleared || state.failed) return;
        paused = !paused;
        if (!paused) {
          lastTs = 0;
          if (running) raf = requestAnimationFrame(loop);
        }
        toast(paused ? "일시정지" : "재개");
        updateHud();
      });
    }
    if (els.muteBtn) {
      els.muteBtn.addEventListener("click", function () {
        meta = loadMeta();
        meta.muted = !meta.muted;
        saveMeta(meta);
        updateHud();
      });
    }

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

      // fly materials warehouse → factory
      state.flyFx.forEach(function (fx) {
        fx.life -= dt;
        var p = 1 - Math.max(0, fx.life) / fx.max;
        fx.cx = fx.x + (fx.tx - fx.x) * p;
        fx.cy = fx.y + (fx.ty - fx.y) * p - Math.sin(p * Math.PI) * 40;
      });
      state.flyFx = state.flyFx.filter(function (fx) { return fx.life > 0; });

      // factories
      Object.keys(state.factories).forEach(function (fid) {
        var st = state.factories[fid];
        if (!st.busy) return;
        st.t -= dt;
        if (st.t <= 0) {
          var f = FACTORIES[fid];
          st.busy = false;
          var plot = FACTORY_PLOTS.find(function (p) { return p.fid === fid; });
          var pr = plot ? plotRect(plot) : { dropX: FIELD_W / 2, dropY: FIELD_H / 2 };
          for (var i = 0; i < st.out; i++) {
            state.drops.push({
              id: uid(), good: f.to,
              x: pr.dropX + rand(-10, 10) + (plot && plot.side === "left" ? i * 10 : -i * 10),
              y: pr.dropY + rand(-6, 6),
              life: GOODS[f.to].spoil,
              pickup: true
            });
          }
          toast(f.name + " 완성! 건물 앞에서 수거하세요.");
          renderLeft();
        }
      });

      // bear foreshadow then spawn
      state.bearShadows.forEach(function (sh) { sh.t -= dt; });
      state.bearShadows.filter(function (sh) { return sh.t <= 0 && !sh.spawned; }).forEach(function (sh) {
        sh.spawned = true;
        state.bears.push({
          id: uid(),
          x: sh.x,
          y: sh.y,
          vx: rand(-20, 20),
          vy: rand(10, 35),
          clicks: 0,
          caged: false,
          cageLife: 0,
          heldByDog: false,
          fleeing: false
        });
        sfx("bear");
        toast("🐻 곰 출현! 연타로 가두세요!");
      });
      state.bearShadows = state.bearShadows.filter(function (sh) { return !sh.spawned; });

      state.bearTimer -= dt;
      if (state.bearTimer <= 0) {
        state.bearTimer = state.bearEvery + rand(-2, 3);
        state.bearShadows.push({
          x: rand(FIELD_PAD + 50, FIELD_W - FIELD_PAD - 50),
          y: rand(70, 140),
          t: 1.4,
          max: 1.4,
          spawned: false
        });
        toast("⚠️ 곰이 곧 내려옵니다…");
      }

      // bears move / attack / flee
      state.bears.forEach(function (b) {
        if (b.fleeing) {
          b.y -= 90 * dt;
          b.x += (b.fleeDir || 0) * dt;
          return;
        }
        if (b.caged) {
          b.cageLife -= dt;
          if (b.cageLife <= 0) {
            /* 원작: 케이지 방치 시 농장을 빠져나감(재공격 없음) */
            b.caged = false;
            b.fleeing = true;
            b.fleeDir = rand(-40, 40);
            toast("곰이 케이지를 부수고 도망갔습니다!");
            sfx("warn");
          }
          return;
        }
        /* heldByDog는 직전 프레임 개 근접 결과 — 근접 시에만 정지·무공격 */
        if (b.heldByDog) {
          b.x += Math.sin(state.time * 3) * 8 * dt;
          return;
        }
        b.x = clamp(b.x + b.vx * dt, FIELD_PAD + 20, FIELD_W - FIELD_PAD - 20);
        b.y = clamp(b.y + b.vy * dt, 48, FIELD_H - 30);
        if (Math.random() < 0.02) { b.vx = rand(-40, 40); b.vy = rand(-30, 40); }

        state.animals.forEach(function (a) {
          if (!a.alive || a.special) return; /* 개·고양이는 곰에게 안 잡힘 */
          var dx = a.x - b.x, dy = a.y - b.y;
          if (dx * dx + dy * dy < 26 * 26) {
            a.alive = false;
            toast(ANIMALS[a.kind].name + "이(가) 곰에게 당했습니다!");
            sfx("warn");
          }
        });
        state.drops = state.drops.filter(function (d) {
          var dx = d.x - b.x, dy = d.y - b.y;
          return dx * dx + dy * dy > 22 * 22;
        });
      });
      state.bears = state.bears.filter(function (b) { return !(b.fleeing && b.y < -40); });

      // dog chases nearest free bear; holds only in proximity (다음 프레임 반영)
      var freeBears = state.bears.filter(function (b) { return !b.caged && !b.fleeing; });
      freeBears.forEach(function (b) { b.heldByDog = false; });
      state.animals.filter(function (a) { return a.alive && a.special === "dog"; }).forEach(function (dog) {
        var bear = null, best = 1e12;
        freeBears.forEach(function (b) {
          if (b.heldByDog) return;
          var dd = (b.x - dog.x) * (b.x - dog.x) + (b.y - dog.y) * (b.y - dog.y);
          if (dd < best) { best = dd; bear = b; }
        });
        if (!bear) {
          dog.x = fieldX(dog.x + Math.sin(state.time) * 15 * dt);
          return;
        }
        var ang = Math.atan2(bear.y - dog.y, bear.x - dog.x);
        dog.x = fieldX(dog.x + Math.cos(ang) * ANIMALS.dog.speed * dt);
        dog.y = fieldY(dog.y + Math.sin(ang) * ANIMALS.dog.speed * dt);
        if (best < 36 * 36) {
          bear.heldByDog = true;
        }
      });

      // drops spoil
      state.drops.forEach(function (d) { d.life -= dt; });
      state.drops = state.drops.filter(function (d) { return d.life > 0; });

      // cat collects nearest drop
      var cats = state.animals.filter(function (a) { return a.alive && a.special === "cat"; });
      cats.forEach(function (cat) {
        if (!state.drops.length) {
          cat.x = fieldX(cat.x + Math.sin(state.time + cat.id.length) * 20 * dt);
          cat.y = fieldY(cat.y + Math.cos(state.time + cat.id.length) * 16 * dt);
          return;
        }
        var target = null, best = 1e12, ti = -1;
        state.drops.forEach(function (d, idx) {
          var dd = (d.x - cat.x) * (d.x - cat.x) + (d.y - cat.y) * (d.y - cat.y);
          if (dd < best) { best = dd; target = d; ti = idx; }
        });
        var ang = Math.atan2(target.y - cat.y, target.x - cat.x);
        cat.x = fieldX(cat.x + Math.cos(ang) * ANIMALS.cat.speed * dt);
        cat.y = fieldY(cat.y + Math.sin(ang) * ANIMALS.cat.speed * dt);
        if (best < 18 * 18) {
          if (addWarehouse(target.good, 1)) {
            state.drops.splice(ti, 1);
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
            a.fed = (a.fed || 0) + 18;
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

        a.x = fieldX(a.x + a.vx * dt);
        a.y = fieldY(a.y + a.vy * dt);
        if (a.x <= FIELD_PAD + 16 || a.x >= FIELD_W - FIELD_PAD - 16) a.vx *= -1;
        if (a.y <= 48 || a.y >= FIELD_H - 28) a.vy *= -1;

        if (a.hunger <= 0) {
          a.alive = false;
          toast(def.name + "이(가) 굶어 죽었습니다!");
          sfx("warn");
          return;
        }

        if ((a.fed || 0) >= def.eatNeed && a.produceCd <= 0 && a.hunger > def.hungerMax * 0.35) {
          a.fed = 0;
          a.produceCd = def.produceTime;
          state.drops.push({
            id: uid(), good: def.produce,
            x: fieldX(a.x + rand(-10, 10)),
            y: fieldY(a.y + rand(-10, 10)),
            life: GOODS[def.produce].spoil
          });
          sfx("ok");
        }
      });

      // grass slowly withers
      if (Math.random() < dt * 0.15 && state.grasses.length) {
        var gi = Math.floor(Math.random() * state.grasses.length);
        state.grasses[gi].hp -= 0.2;
        if (state.grasses[gi].hp <= 0) state.grasses.splice(gi, 1);
      }

      checkFail(dt);
      checkGoals();
    }

    function checkFail(dt) {
      if (!state || state.cleared || state.failed) return;
      var livestock = state.animals.filter(function (a) { return a.alive && !a.special; });
      var canBuy = state.unlock.some(function (k) {
        return !ANIMALS[k].special && state.money >= ANIMALS[k].cost;
      });
      var hasDrops = state.drops.length > 0;
      var factoryBusy = Object.keys(state.factories).some(function (k) { return state.factories[k].busy; });
      var hasGoods = Object.keys(state.warehouse).some(function (k) { return state.warehouse[k] > 0; });
      var stuck = livestock.length === 0 && !canBuy && !hasDrops && !factoryBusy && !hasGoods && !state.car.busy;
      if (stuck) {
        state.failTimer += dt;
        if (state.failTimer > 4 && state.failTimer < 4.2) toast("진행 불가! 가축·자금·물품이 없습니다…");
        if (state.failTimer >= 7) {
          state.failed = true;
          running = false;
          showResult(false);
        }
      } else {
        state.failTimer = 0;
      }
    }

    function drawPlots() {
      FACTORY_PLOTS.forEach(function (plot) {
        var r = plotRect(plot);
        var st = state.factories[plot.fid];
        var f = FACTORIES[plot.fid];
        var canBuild = state.availableFactories.indexOf(plot.fid) !== -1;
        ctx.fillStyle = st.owned ? "rgba(40,28,18,0.75)" : (canBuild ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.25)");
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = st.owned ? "rgba(255,200,100,0.55)" : "rgba(255,255,255,0.2)";
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        if (!st.owned) {
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.font = "11px IBM Plex Sans KR, sans-serif";
          ctx.fillText(canBuild ? "빈 부지" : "잠김", r.x + 12, r.y + 52);
          if (canBuild) {
            ctx.font = "20px serif";
            ctx.fillText(f.emoji, r.x + 20, r.y + 34);
          }
          return;
        }
        ctx.font = "22px serif";
        ctx.fillText(f.emoji, r.x + 18, r.y + 32);
        ctx.fillStyle = "#f0e6d0";
        ctx.font = "10px IBM Plex Sans KR, sans-serif";
        ctx.fillText("Lv" + st.lv + " ×" + (1 + st.lv), r.x + 8, r.y + 48);
        if (st.busy) {
          var prog = 1 - st.t / (st.maxT || st.t || 1);
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(r.x + 8, r.y + 58, r.w - 16, 8);
          ctx.fillStyle = "#ffc857";
          ctx.fillRect(r.x + 8, r.y + 58, (r.w - 16) * clamp(prog, 0, 1), 8);
          ctx.fillStyle = "#fff";
          ctx.fillText("가공중", r.x + 14, r.y + 80);
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.65)";
          ctx.fillText("클릭 가공", r.x + 8, r.y + 72);
        }
      });
    }
    function drawWellStoreCar() {
      // well (bottom-left of field)
      var wx = FIELD_PAD + 28, wy = FIELD_H - 52;
      ctx.fillStyle = "#5a6a78";
      ctx.beginPath();
      ctx.ellipse(wx, wy, 22, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      var wMax = state.waterMax || wellWater(state.wellLv);
      var wr = state.autoWell ? 1 : clamp(state.water / Math.max(1, wMax), 0, 1);
      ctx.fillStyle = "rgba(80,180,255," + (0.35 + wr * 0.5) + ")";
      ctx.beginPath();
      ctx.ellipse(wx, wy + 2 - wr * 4, 16, 7 * wr + 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "16px serif";
      ctx.fillText("🪣", wx - 10, wy - 10);
      ctx.fillStyle = "#dfefff";
      ctx.font = "10px IBM Plex Sans KR, sans-serif";
      ctx.fillText(state.autoWell ? "AUTO" : ("물 " + state.water), wx - 14, wy + 22);

      // warehouse (bottom center)
      var sx = FIELD_W / 2, sy = FIELD_H - 40;
      var fill = usedSlots() / Math.max(1, storeCap(state.storeLv));
      ctx.fillStyle = "#6b4f2e";
      ctx.fillRect(sx - 36, sy - 22, 72, 34);
      ctx.fillStyle = "#8a6840";
      ctx.fillRect(sx - 36, sy - 28, 72, 10);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(sx - 30, sy - 8, 60, 8);
      ctx.fillStyle = fill > 0.85 ? "#ff5d7a" : "#ffc857";
      ctx.fillRect(sx - 30, sy - 8, 60 * clamp(fill, 0, 1), 8);
      ctx.font = "14px serif";
      ctx.fillText("🏚️", sx - 10, sy - 10);
      ctx.fillStyle = "#fff4d8";
      ctx.font = "10px IBM Plex Sans KR, sans-serif";
      ctx.fillText(Math.round(fill * 100) + "%", sx - 10, sy + 18);

      // car path / car
      var cy = FIELD_H - 18;
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(FIELD_PAD + 50, cy);
      ctx.lineTo(FIELD_W - FIELD_PAD - 20, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      var cx;
      if (state.car.busy) {
        var p = 1 - state.car.t / Math.max(0.01, state.car.maxT || state.car.t);
        if (p < 0.5) cx = FIELD_PAD + 60 + (FIELD_W - FIELD_PAD * 2 - 80) * (p / 0.5);
        else cx = FIELD_W - FIELD_PAD - 20 - (FIELD_W - FIELD_PAD * 2 - 80) * ((p - 0.5) / 0.5);
      } else {
        cx = FIELD_PAD + 60;
      }
      ctx.font = "22px serif";
      ctx.fillText("🚗", cx - 12, cy + 2);
      if (state.car.busy) {
        ctx.fillStyle = "#ffc857";
        ctx.font = "10px IBM Plex Sans KR, sans-serif";
        ctx.fillText("시장", cx - 10, cy - 14);
      }
    }
    function draw() {
      var grd = ctx.createLinearGradient(0, 0, 0, FIELD_H);
      grd.addColorStop(0, "#2f5d34");
      grd.addColorStop(1, "#1d3f24");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);

      // side strips
      ctx.fillStyle = "rgba(20,14,8,0.35)";
      ctx.fillRect(0, 0, FIELD_PAD, FIELD_H);
      ctx.fillRect(FIELD_W - FIELD_PAD, 0, FIELD_PAD, FIELD_H);

      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      ctx.strokeRect(FIELD_PAD, 12, FIELD_W - FIELD_PAD * 2, FIELD_H - 24);

      drawPlots();
      drawWellStoreCar();

      state.grasses.forEach(function (g) {
        ctx.font = "18px serif";
        ctx.globalAlpha = clamp(g.hp / 3, 0.4, 1);
        ctx.fillText("🌿", g.x - 9, g.y + 6);
        ctx.globalAlpha = 1;
      });

      state.bearShadows.forEach(function (sh) {
        var a = 0.25 + 0.35 * (1 - sh.t / sh.max);
        ctx.fillStyle = "rgba(0,0,0," + a + ")";
        ctx.beginPath();
        ctx.ellipse(sh.x, sh.y + 8, 22, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,100,80," + (0.4 + a) + ")";
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(sh.x - 20, sh.y - 24, 40, 40);
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,180,120,0.9)";
        ctx.font = "11px IBM Plex Sans KR, sans-serif";
        ctx.fillText("곰!", sh.x - 10, sh.y - 28);
      });

      state.drops.forEach(function (d) {
        ctx.font = d.pickup ? "24px serif" : "20px serif";
        ctx.fillText(GOODS[d.good].emoji, d.x - 10, d.y + 6);
        if (d.pickup) {
          ctx.fillStyle = "rgba(255,200,80,0.25)";
          ctx.beginPath();
          ctx.arc(d.x, d.y, 16, 0, Math.PI * 2);
          ctx.fill();
        }
        if (d.life < 5) {
          ctx.fillStyle = "rgba(255,93,122,0.8)";
          ctx.fillRect(d.x - 10, d.y + 10, 20 * (d.life / 5), 3);
        }
      });

      state.flyFx.forEach(function (fx) {
        ctx.globalAlpha = clamp(fx.life / fx.max, 0.2, 1);
        ctx.font = "16px serif";
        ctx.fillText(GOODS[fx.good].emoji, (fx.cx || fx.x) - 8, (fx.cy || fx.y) + 4);
        ctx.globalAlpha = 1;
      });

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

      state.bears.forEach(function (b) {
        ctx.globalAlpha = b.fleeing ? 0.55 : 1;
        ctx.font = "28px serif";
        ctx.fillText("🐻", b.x - 14, b.y + 10);
        ctx.globalAlpha = 1;
        if (b.fleeing) {
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.font = "11px IBM Plex Sans KR, sans-serif";
          ctx.fillText("도망!", b.x - 12, b.y - 18);
          return;
        }
        if (b.caged) {
          ctx.strokeStyle = "#ffc857";
          ctx.lineWidth = 2;
          ctx.strokeRect(b.x - 18, b.y - 22, 36, 36);
          ctx.fillStyle = "#ffc857";
          ctx.font = "11px IBM Plex Sans KR, sans-serif";
          ctx.fillText("수거! " + Math.ceil(b.cageLife) + "s", b.x - 22, b.y + 28);
        } else {
          var need = state.cageNeed;
          ctx.fillStyle = "rgba(0,0,0,0.4)";
          ctx.fillRect(b.x - 16, b.y + 14, 32, 5);
          ctx.fillStyle = "#ff6b4a";
          ctx.fillRect(b.x - 16, b.y + 14, 32 * (b.clicks / need), 5);
          if (b.heldByDog) {
            ctx.fillStyle = "#7ec8ff";
            ctx.font = "10px IBM Plex Sans KR, sans-serif";
            ctx.fillText("견제중", b.x - 14, b.y - 18);
          }
        }
      });

      if (drag && drag.kind === "drop" && drag.cx != null) {
        ctx.globalAlpha = 0.85;
        ctx.font = "22px serif";
        ctx.fillText(GOODS[drag.good].emoji, drag.cx - 10, drag.cy + 6);
        ctx.globalAlpha = 1;
      }
      if (paused) {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, FIELD_W, FIELD_H);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 28px IBM Plex Sans KR, sans-serif";
        ctx.fillText("일시정지", FIELD_W / 2 - 60, FIELD_H / 2);
      }
    }

    function loop(ts) {
      if (!running && !paused) return;
      if (paused) {
        draw();
        updateHud();
        raf = requestAnimationFrame(loop);
        return;
      }
      if (!running) return;
      if (!lastTs) lastTs = ts;
      var dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      update(dt);
      draw();
      if (state.car.busy || Object.keys(state.factories).some(function (k) { return state.factories[k].busy; })) {
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
        paused = false;
        cancelAnimationFrame(raf);
        els.canvas.removeEventListener("mousedown", onPointerDown);
        els.canvas.removeEventListener("mousemove", onPointerMove);
        els.canvas.removeEventListener("touchstart", onPointerDown);
        els.canvas.removeEventListener("touchmove", onPointerMove);
        if (typeof window !== "undefined" && window.removeEventListener) {
          window.removeEventListener("mouseup", onPointerUp);
          window.removeEventListener("touchend", onPointerUp);
        } else {
          els.canvas.removeEventListener("mouseup", onPointerUp);
          els.canvas.removeEventListener("touchend", onPointerUp);
        }
      }
    };
  }

  global.GWGames = global.GWGames || {};
  global.GWGames.farm = {
    id: "farm",
    title: "팜프렌지 1탄",
    emoji: "🌾",
    desc: "원작 48레벨 · 오리·양·소·개·고양이 · 금/은 시간 · 별 상점",
    tags: ["시뮬레이션", "48레벨"],
    accent: "#3dd68c",
    hint: "우물→풀→산물→공장→자동차 · 곰 연타 · 개 근접 견제 · 일시정지",
    create: create
  };
})(window);

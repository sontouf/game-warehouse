/**
 * FF1 visual + meta shop: stars, plots, car/well/store/bear foreshadow.
 */
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "../js/games/farm.js");
let s = fs.readFileSync(p, "utf8");

function replaceOnce(label, from, to) {
  if (!s.includes(from)) {
    console.error("MISSING:", label);
    process.exit(1);
  }
  s = s.replace(from, to);
}

// --- helpers: stars / caps ---
if (!s.includes("function starsForClear")) {
  replaceOnce(
    "helpers after plotRect",
    `  function plotRect(plot) {
    var y = 56 + plot.slot * 118;
    if (plot.side === "left") {
      return { x: 8, y: y, w: 64, h: 96, dropX: FIELD_PAD + 18, dropY: y + 70 };
    }
    return { x: FIELD_W - 72, y: y, w: 64, h: 96, dropX: FIELD_W - FIELD_PAD - 18, dropY: y + 70 };
  }
  function uid() { return "e" + Math.random().toString(36).slice(2, 9); }`,
    `  function plotRect(plot) {
    var y = 56 + plot.slot * 118;
    if (plot.side === "left") {
      return { x: 8, y: y, w: 64, h: 96, dropX: FIELD_PAD + 18, dropY: y + 70 };
    }
    return { x: FIELD_W - 72, y: y, w: 64, h: 96, dropX: FIELD_W - FIELD_PAD - 18, dropY: y + 70 };
  }
  function starsForClear(stageId, timeSec) {
    var base = 70 + stageId * 12;
    var mult = timeSec < 75 ? 1.5 : timeSec < 140 ? 1.2 : timeSec < 220 ? 1.0 : 0.75;
    return Math.max(20, Math.floor(base * mult));
  }
  function starRank(timeSec) {
    return timeSec < 75 ? 3 : timeSec < 140 ? 2 : 1;
  }
  function fieldX(x) { return clamp(x, FIELD_PAD + 16, FIELD_W - FIELD_PAD - 16); }
  function fieldY(y) { return clamp(y, 48, FIELD_H - 28); }
  function uid() { return "e" + Math.random().toString(36).slice(2, 9); }`
  );
}

// --- initStage: effects + cage from meta + start levels capped ---
replaceOnce(
  "initStage state",
  `      state = {
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
        availableFactories: (conf.availableFactories || []).slice(),
        bearEvery: conf.bearEvery,
        bearTimer: conf.bearEvery * 0.6,
        cleared: false,
        sellingAnimal: null
      };`,
  `      meta = loadMeta();
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
        lastStars: 0,
        sellingAnimal: null
      };`
);

replaceOnce(
  "starter grass bounds",
  `      for (var g = 0; g < 8; g++) {
        state.grasses.push({ x: rand(40, FIELD_W - 40), y: rand(60, FIELD_H - 30), hp: 3 });
      }`,
  `      for (var g = 0; g < 8; g++) {
        state.grasses.push({ x: rand(FIELD_PAD + 30, FIELD_W - FIELD_PAD - 30), y: rand(70, FIELD_H - 40), hp: 3 });
      }`
);

replaceOnce(
  "spawnAnimal bounds",
  `        id: uid(), kind: kind, x: x || rand(60, FIELD_W - 60), y: y || rand(80, FIELD_H - 40),`,
  `        id: uid(), kind: kind, x: x || rand(FIELD_PAD + 40, FIELD_W - FIELD_PAD - 40), y: y || rand(90, FIELD_H - 50),`
);

// --- checkGoals: award stars ---
replaceOnce(
  "checkGoals stars",
  `      if (all && !state.cleared) {
        state.cleared = true;
        running = false;
        var next = Math.max(maxUnlocked, state.stageId + 1);
        maxUnlocked = Math.min(next, STAGES.length);
        localStorage.setItem(SAVE_KEY, String(maxUnlocked));
        showResult(true);
      }`,
  `      if (all && !state.cleared) {
        state.cleared = true;
        running = false;
        var next = Math.max(maxUnlocked, state.stageId + 1);
        maxUnlocked = Math.min(next, STAGES.length);
        localStorage.setItem(SAVE_KEY, String(maxUnlocked));
        meta = loadMeta();
        state.lastStars = starsForClear(state.stageId, state.time);
        state.lastRank = starRank(state.time);
        meta.stars += state.lastStars;
        saveMeta(meta);
        showResult(true);
      }`
);

// --- renderMenu with shop ---
replaceOnce(
  "renderMenu",
  `    function renderMenu() {
      els.play.hidden = true;
      els.menu.hidden = false;
      running = false;
      cancelAnimationFrame(raf);
      if (!STAGES.length) {
        els.menu.innerHTML = '<div class="ff-menu-card"><h3>스테이지 로드 실패</h3><p>ff1-stages.js를 확인하세요.</p></div>';
        return;
      }
      var html = '<div class="ff-menu-card"><h3>🌾 팜프렌지 1탄</h3>' +
        '<p>원작 48레벨 · 해금 ' + Math.min(maxUnlocked, STAGES.length) + '/' + STAGES.length +
        ' · 미션/시작자금/시작동물은 GameFAQs 기준</p>' +
        '<div class="ff-stage-list ff-stage-list--grid">';
      STAGES.forEach(function (stage, i) {
        var locked = stage.id > maxUnlocked;
        var tip = stage.goals.map(goalLabel).join(" / ");
        html += '<button type="button" class="ff-stage-btn ff-stage-btn--num' + (locked ? " is-locked" : "") +
          '" data-stage="' + i + '" title="' + tip.replace(/"/g, "") + '" ' + (locked ? "disabled" : "") + ">" +
          "<strong>" + stage.id + "</strong>" +
          (locked ? "<em>🔒</em>" : "<em>✓</em>") +
          "</button>";
      });
      html += "</div>";
      var cur = STAGES[Math.min(maxUnlocked, STAGES.length) - 1] || STAGES[0];
      html += '<div class="ff-stage-preview"><h4>다음/최근: 레벨 ' + cur.id + "</h4><ul>" +
        cur.goals.map(function (g) { return "<li>" + goalLabel(g) + "</li>"; }).join("") +
        "</ul><p>시작 자금 " + cur.money.toLocaleString("ko-KR") + "원</p>" +
        '<button type="button" class="btn btn--primary" id="ff-play-current">이 레벨 플레이</button></div></div>';
      els.menu.innerHTML = html;
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
    }`,
  `    function buyStarUpgrade(key) {
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
        html += '<button type="button" class="ff-stage-btn ff-stage-btn--num' + (locked ? " is-locked" : "") +
          '" data-stage="' + i + '" title="' + tip.replace(/"/g, "") + '" ' + (locked ? "disabled" : "") + ">" +
          "<strong>" + stage.id + "</strong>" +
          (locked ? "<em>🔒</em>" : "<em>✓</em>") +
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
    }`
);

// --- equipment upgrades respect meta caps ---
replaceOnce(
  "well upgrade cap",
  `          if (t === "well") {
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
          }`,
  `          meta = loadMeta();
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
          }`
);

replaceOnce(
  "factory upgrade cap",
  `          var c = f.upCost[st.lv];
          if (!c || !spend(c)) return;
          st.lv += 1;
          toast(f.name + " 업그레이드!");`,
  `          var c = f.upCost[st.lv];
          meta = loadMeta();
          var fcap = meta.factoryCap[fid] || 1;
          if (!c || st.lv + 1 >= fcap) {
            if (st.lv + 1 >= fcap) toast("별 상점에서 " + f.name + " 최대 레벨을 올리세요!");
            if (!c || st.lv + 1 >= fcap) return;
          }
          if (!spend(c)) return;
          st.lv += 1;
          toast(f.name + " 업그레이드! 배치 " + (1 + st.lv) + "개");`
);

// --- runFactory with fly fx + maxT ---
replaceOnce(
  "runFactory",
  `    function runFactory(fid) {
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
      st.out = batch;
      toast(f.name + " 가동! (" + batch + "개 가공)");
      renderAllUi();
    }`,
  `    function runFactory(fid) {
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
    }`
);

// --- car trip visual phase ---
replaceOnce(
  "car go",
  `          state.car.busy = true;
          state.car.t = carTime(state.carLv);
          state.car.revenue = revenue;
          state.car.load = load;
          els.modal.hidden = true;
          toast("자동차가 시장으로 출발!");
          renderRight();`,
  `          state.car.busy = true;
          state.car.t = carTime(state.carLv);
          state.car.maxT = state.car.t;
          state.car.revenue = revenue;
          state.car.load = load;
          state.car.phase = 0;
          els.modal.hidden = true;
          toast("자동차가 시장으로 출발!");
          renderRight();`
);

// --- showResult with stars ---
replaceOnce(
  "showResult",
  `    function showResult(win) {
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
    }`,
  `    function showResult(win) {
      els.modal.hidden = false;
      var starLine = "";
      if (win) {
        var rank = state.lastRank || 1;
        starLine = "<p class=\\"ff-star-reward\\">" +
          "⭐".repeat(rank) + "☆".repeat(3 - rank) +
          " · 별 +" + (state.lastStars || 0).toLocaleString("ko-KR") +
          " (보유 " + loadMeta().stars.toLocaleString("ko-KR") + ")</p>" +
          '<button type="button" class="btn btn--ghost" id="ff-res-shop">별 상점 열기</button>';
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
    }`
);

// --- plantGrass field pad ---
replaceOnce(
  "plantGrass",
  `    function plantGrass(x, y) {
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
    }`,
  `    function plantGrass(x, y) {
      if (x < FIELD_PAD + 10 || x > FIELD_W - FIELD_PAD - 10) return;
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
    }`
);

// --- onCanvasClick: factory plots first ---
replaceOnce(
  "onCanvasClick",
  `    function onCanvasClick(e) {
      if (!running || !state) return;
      var rect = els.canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) * (FIELD_W / rect.width);
      var y = (e.clientY - rect.top) * (FIELD_H / rect.height);

      var bi = hitTest(state.bears, x, y, 28);`,
  `    function hitPlot(x, y) {
      for (var i = 0; i < FACTORY_PLOTS.length; i++) {
        var plot = FACTORY_PLOTS[i];
        var r = plotRect(plot);
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return plot;
      }
      return null;
    }
    function onCanvasClick(e) {
      if (!running || !state) return;
      var rect = els.canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) * (FIELD_W / rect.width);
      var y = (e.clientY - rect.top) * (FIELD_H / rect.height);

      var plotHit = hitPlot(x, y);
      if (plotHit) {
        var st = state.factories[plotHit.fid];
        var f = FACTORIES[plotHit.fid];
        if (!st.owned) {
          if (state.availableFactories.indexOf(plotHit.fid) === -1) {
            toast("이 스테이지에서는 " + f.name + "을(를) 지을 수 없습니다.");
            return;
          }
          if (!spend(f.buy)) return;
          st.owned = true;
          toast(f.name + " 설치!");
          renderLeft();
          updateHud();
          return;
        }
        runFactory(plotHit.fid);
        return;
      }

      var bi = hitTest(state.bears, x, y, 28);`
);

// --- update: factory drop at plot, bear shadow, fly fx, car phase, bounds ---
replaceOnce(
  "update factories+bears",
  `      // factories
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
      }`,
  `      // fly materials warehouse → factory
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
        var dog = state.animals.find(function (a) { return a.alive && a.special === "dog"; });
        state.bears.push({
          id: uid(),
          x: sh.x,
          y: sh.y,
          vx: rand(-20, 20),
          vy: rand(10, 35),
          clicks: 0,
          caged: false,
          cageLife: 0,
          heldByDog: !!dog
        });
        toast(dog ? "🐻 곰 출현! 개가 견제 중" : "🐻 곰 출현! 연타로 가두세요!");
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
      }`
);

replaceOnce(
  "bear move bounds",
  `        b.x = clamp(b.x + b.vx * dt, 30, FIELD_W - 30);
        b.y = clamp(b.y + b.vy * dt, 40, FIELD_H - 30);`,
  `        b.x = clamp(b.x + b.vx * dt, FIELD_PAD + 20, FIELD_W - FIELD_PAD - 20);
        b.y = clamp(b.y + b.vy * dt, 48, FIELD_H - 30);`
);

replaceOnce(
  "animal move bounds",
  `        a.x = clamp(a.x + a.vx * dt, 24, FIELD_W - 24);
        a.y = clamp(a.y + a.vy * dt, 40, FIELD_H - 24);
        if (a.x <= 24 || a.x >= FIELD_W - 24) a.vx *= -1;
        if (a.y <= 40 || a.y >= FIELD_H - 24) a.vy *= -1;`,
  `        a.x = fieldX(a.x + a.vx * dt);
        a.y = fieldY(a.y + a.vy * dt);
        if (a.x <= FIELD_PAD + 16 || a.x >= FIELD_W - FIELD_PAD - 16) a.vx *= -1;
        if (a.y <= 48 || a.y >= FIELD_H - 28) a.vy *= -1;`
);

replaceOnce(
  "drop produce bounds",
  `          state.drops.push({
            id: uid(), good: def.produce,
            x: clamp(a.x + rand(-10, 10), 30, FIELD_W - 30),
            y: clamp(a.y + rand(-10, 10), 40, FIELD_H - 30),
            life: GOODS[def.produce].spoil
          });`,
  `          state.drops.push({
            id: uid(), good: def.produce,
            x: fieldX(a.x + rand(-10, 10)),
            y: fieldY(a.y + rand(-10, 10)),
            life: GOODS[def.produce].spoil
          });`
);

replaceOnce(
  "water refill max",
  `        state.water = wellWater(state.wellLv);
        toast("우물에 물을 채웠습니다.");`,
  `        state.water = wellWater(state.wellLv);
        state.waterMax = state.water;
        toast("우물에 물을 채웠습니다.");`
);

// --- draw() full replace ---
replaceOnce(
  "draw",
  `    function draw() {
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
    }`,
  `    function drawPlots() {
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
    }`
);

// desc update
s = s.replace(
  'hint: "원작 팜프렌지 1 스테이지/미션 · 우물→풀 · 산물/곰 · 공장 · 자동차 판매"',
  'hint: "별 상점 · 양옆 건물 부지 · 가공 게이지 · 자동차/창고/우물/곰 예고 시각화"'
);

fs.writeFileSync(p, s);
console.log("phase2 written", s.includes("drawPlots"), s.includes("buyStarUpgrade"), s.includes("bearShadows"));

/**
 * FF1 parity pass — critical/important gaps vs original Farm Frenzy 1.
 */
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "../js/games/farm.js");
let s = fs.readFileSync(p, "utf8");

function must(label, from, to) {
  if (!s.includes(from)) {
    console.error("MISSING:", label);
    process.exit(1);
  }
  s = s.replace(from, to);
}

// --- duck naming (FAQ: ducks) ---
must(
  "goose name",
  `goose: {
      name: "거위", emoji: "🪿", cost: 100, sell: 50,`,
  `goose: {
      name: "오리", emoji: "🦆", cost: 100, sell: 50,`
);

// --- medal times + stars ---
must(
  "stars helpers",
  `  function starsForClear(stageId, timeSec) {
    var base = 70 + stageId * 12;
    var mult = timeSec < 75 ? 1.5 : timeSec < 140 ? 1.2 : timeSec < 220 ? 1.0 : 0.75;
    return Math.max(20, Math.floor(base * mult));
  }
  function starRank(timeSec) {
    return timeSec < 75 ? 3 : timeSec < 140 ? 2 : 1;
  }`,
  `  function stageMedalTimes(stageId) {
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
  }`
);

// --- meta: best ranks + tutorial flag ---
must(
  "defaultMeta",
  `  function defaultMeta() {
    /* cap = 스테이지 내 코인 업그레이드 가능 상한(레벨 수). 별 상점에서 더 올림 */
    return {
      stars: 0,
      factoryCap: { eggPlant: 2, bakery: 2, spinnery: 2, weave: 2, churn: 2, dairy: 2 },
      wellCap: 2,
      storeCap: 2,
      carCap: 2,
      cageLv: 0
    };
  }`,
  `  function defaultMeta() {
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
  }`
);

// --- create() locals: pause, audio, drag ---
must(
  "create locals",
  `    var meta = loadMeta();
    var running = false;
    var raf = 0;
    var lastTs = 0;
    var state = null;
    var toastTimer = 0;
    var menuMode = "stages"; /* stages | shop */`,
  `    var meta = loadMeta();
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
    }`
);

// --- HTML: pause + medal HUD ---
must(
  "hud html",
  `      '    <div class="ff-hud">' +
      '      <span>💰 <b id="ff-money">0</b></span>' +
      '      <span>⏱ <b id="ff-time">0:00</b></span>' +
      '      <span>창고 <b id="ff-store">0/0</b></span>' +
      '    </div>' +`,
  `      '    <div class="ff-hud">' +
      '      <span>💰 <b id="ff-money">0</b></span>' +
      '      <span>⏱ <b id="ff-time">0:00</b></span>' +
      '      <span>🥇 <b id="ff-medal">-</b></span>' +
      '      <span>창고 <b id="ff-store">0/0</b></span>' +
      '      <button type="button" class="ff-icon-btn" id="ff-pause" title="일시정지">⏸</button>' +
      '      <button type="button" class="ff-icon-btn" id="ff-mute" title="소리">🔊</button>' +
      '    </div>' +`
);

must(
  "els",
  `      money: root.querySelector("#ff-money"),
      time: root.querySelector("#ff-time"),
      store: root.querySelector("#ff-store"),`,
  `      money: root.querySelector("#ff-money"),
      time: root.querySelector("#ff-time"),
      medal: root.querySelector("#ff-medal"),
      store: root.querySelector("#ff-store"),
      pauseBtn: root.querySelector("#ff-pause"),
      muteBtn: root.querySelector("#ff-mute"),`
);

// --- goalDone: money/animals must stay satisfied ---
must(
  "goalDone",
  `    function goalDone(g) {
      if (g._done) return true;
      var ok = false;
      if (g.type === "money") ok = state.money >= g.amount;
      else if (g.type === "collect") ok = (state.collected[g.good] || 0) >= g.amount;
      else if (g.type === "animals") {
        ok = state.animals.filter(function (a) { return a.alive && a.kind === g.kind; }).length >= g.amount;
      } else if (g.type === "catchBear") ok = state.bearsCaught >= g.amount;
      if (ok) g._done = true;
      return g._done;
    }`,
  `    function goalDone(g) {
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
    }`
);

// --- checkGoals stars + bestRank ---
must(
  "checkGoals award",
  `        meta = loadMeta();
        state.lastStars = starsForClear(state.stageId, state.time);
        state.lastRank = starRank(state.time);
        meta.stars += state.lastStars;
        saveMeta(meta);
        showResult(true);`,
  `        meta = loadMeta();
        state.lastStars = starsForClear(state.stageId, state.time);
        state.lastRank = starRankFor(state.stageId, state.time);
        meta.stars += state.lastStars;
        var prev = meta.bestRank[state.stageId] || 0;
        if (state.lastRank > prev) meta.bestRank[state.stageId] = state.lastRank;
        saveMeta(meta);
        sfx("win");
        showResult(true);`
);

// --- initStage: medals, failTimer, briefing ---
must(
  "init cleared fields",
  `        cleared: false,
        lastStars: 0,
        sellingAnimal: null
      };`,
  `        cleared: false,
        failed: false,
        failTimer: 0,
        lastStars: 0,
        medals: stageMedalTimes(conf.id),
        sellingAnimal: null
      };`
);

must(
  "init start running",
  `      els.menu.hidden = true;
      els.play.hidden = false;
      els.modal.hidden = true;
      running = true;
      lastTs = 0;
      renderAllUi();
      api.setScore(state.money);
      toast("스테이지 " + conf.id + ": " + conf.title);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    }`,
  `      els.menu.hidden = true;
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
        "<ul class=\\"ff-brief-goals\\">" +
        conf.goals.map(function (g) { return "<li>" + goalLabel(g) + "</li>"; }).join("") +
        "</ul>" +
        "<p>시작 자금 <b>" + conf.money.toLocaleString("ko-KR") + "원</b></p>" +
        "<p class=\\"ff-medal-line\\">🥇 금 " + fmtTime(med.gold) + " · 🥈 은 " + fmtTime(med.silver) + " · 그 외 동</p>" +
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
    }`
);

// --- renderMenu stage stars ---
must(
  "stage btn",
  `        html += '<button type="button" class="ff-stage-btn ff-stage-btn--num' + (locked ? " is-locked" : "") +
          '" data-stage="' + i + '" title="' + tip.replace(/"/g, "") + '" ' + (locked ? "disabled" : "") + ">" +
          "<strong>" + stage.id + "</strong>" +
          (locked ? "<em>🔒</em>" : "<em>✓</em>") +
          "</button>";`,
  `        var br = meta.bestRank[stage.id] || 0;
        var medal = br === 3 ? "🥇" : br === 2 ? "🥈" : br === 1 ? "🥉" : (locked ? "🔒" : "·");
        html += '<button type="button" class="ff-stage-btn ff-stage-btn--num' + (locked ? " is-locked" : "") +
          '" data-stage="' + i + '" title="' + tip.replace(/"/g, "") + '" ' + (locked ? "disabled" : "") + ">" +
          "<strong>" + stage.id + "</strong>" +
          "<em>" + medal + "</em>" +
          "</button>";`
);

// --- updateHud medals ---
must(
  "updateHud",
  `    function updateHud() {
      els.money.textContent = Math.floor(state.money).toLocaleString("ko-KR");
      var m = Math.floor(state.time / 60);
      var s = Math.floor(state.time % 60);
      els.time.textContent = m + ":" + String(s).padStart(2, "0");
      els.store.textContent = usedSlots() + "/" + storeCap(state.storeLv) + " (여유 " + freeStore(state) + ")";
      api.setScore(Math.floor(state.money));
    }`,
  `    function updateHud() {
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
    }`
);

// --- legend duck ---
must(
  "legend",
  `"<span>🪿거위→🥚</span><span>🐑양→🧶</span><span>🐄젖소→🥛</span>" +`,
  `"<span>🦆오리→🥚</span><span>🐑양→🧶</span><span>🐄젖소→🥛</span>" +`
);

// --- warehouse discard ---
must(
  "warehouse inv row",
  `        html += '<div>' + g.emoji + ' ' + g.name + ' × <b>' + state.warehouse[k] + '</b>' +
          ' <small>(' + g.sell + '원 · 칸 ' + used + ')</small></div>';`,
  `        html += '<div class="ff-inv-row">' + g.emoji + ' ' + g.name + ' × <b>' + state.warehouse[k] + '</b>' +
          ' <small>(' + g.sell + '원 · 칸 ' + used + ')</small>' +
          ' <button type="button" class="ff-discard" data-discard="' + k + '" title="버리기">🗑</button></div>';`
);

must(
  "quit bind",
  `      root.querySelector("#ff-quit").addEventListener("click", function () {
        running = false;
        renderMenu();
      });`,
  `      root.querySelector("#ff-quit").addEventListener("click", function () {
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
      });`
);

// --- water refill max already; plantGrass free autoWell ---
must(
  "plantGrass",
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
    }`,
  `    function wellHotspot() {
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
    }`
);

// --- pointer input instead of click-only ---
must(
  "onCanvasClick block",
  `    function onCanvasClick(e) {
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

    els.canvas.addEventListener("click", onCanvasClick);`,
  `    function canvasXY(e) {
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
    window.addEventListener("mouseup", onPointerUp);
    els.canvas.addEventListener("touchstart", onPointerDown, { passive: false });
    els.canvas.addEventListener("touchmove", onPointerMove, { passive: false });
    window.addEventListener("touchend", onPointerUp);
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
    els.muteBtn.addEventListener("click", function () {
      meta = loadMeta();
      meta.muted = !meta.muted;
      saveMeta(meta);
      updateHud();
    });
    /* refill button uses shared helper */
    var _oldRefillHook = true;`
);

// Fix refill button to use refillWell - the renderRight still has old handler
must(
  "refill click",
  `      root.querySelector("#ff-refill").addEventListener("click", function () {
        if (state.autoWell) { toast("최고 우물은 자동으로 물을 씁니다."); return; }
        if (!spend(cost)) return;
        state.water = wellWater(state.wellLv);
        state.waterMax = state.water;
        toast("우물에 물을 채웠습니다.");
        renderRight();
        updateHud();
      });`,
  `      root.querySelector("#ff-refill").addEventListener("click", function () { refillWell(); });`
);

// --- showResult fail sfx + medal detail ---
must(
  "showResult starline",
  `      if (win) {
        var rank = state.lastRank || 1;
        starLine = "<p class=\\"ff-star-reward\\">" +
          "⭐".repeat(rank) + "☆".repeat(3 - rank) +
          " · 별 +" + (state.lastStars || 0).toLocaleString("ko-KR") +
          " (보유 " + loadMeta().stars.toLocaleString("ko-KR") + ")</p>" +
          '<button type="button" class="btn btn--ghost" id="ff-res-shop">별 상점 열기</button>';
      }`,
  `      if (win) {
        var rank = state.lastRank || 1;
        var medalName = rank === 3 ? "금메달" : rank === 2 ? "은메달" : "동메달";
        starLine = "<p class=\\"ff-star-reward\\">" +
          (rank === 3 ? "🥇" : rank === 2 ? "🥈" : "🥉") + " " + medalName +
          " · 별 +" + (state.lastStars || 0).toLocaleString("ko-KR") +
          " (보유 " + loadMeta().stars.toLocaleString("ko-KR") + ")</p>" +
          "<p>목표 시간 🥇 " + fmtTime(state.medals.gold) + " / 🥈 " + fmtTime(state.medals.silver) + "</p>" +
          '<button type="button" class="btn btn--ghost" id="ff-res-shop">별 상점 열기</button>';
      } else {
        sfx("lose");
        starLine = "<p>가축이 없거나 더 이상 진행할 수 없습니다. 다시 도전해 보세요!</p>";
      }`
);

// --- bear spawn without instant dog hold ---
must(
  "bear spawn",
  `        var dog = state.animals.find(function (a) { return a.alive && a.special === "dog"; });
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
        toast(dog ? "🐻 곰 출현! 개가 견제 중" : "🐻 곰 출현! 연타로 가두세요!");`,
  `        state.bears.push({
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
        toast("🐻 곰 출현! 연타로 가두세요!");`
);

// --- bears move rewrite: flee, dog proximity, cat immune ---
must(
  "bears move block",
  `      // bears move / attack
      state.bears.forEach(function (b) {
        if (b.caged) {
          b.cageLife -= dt;
          return;
        }
        if (b.heldByDog) {
          b.x += Math.sin(state.time * 3) * 8 * dt;
          return;
        }
        b.x = clamp(b.x + b.vx * dt, FIELD_PAD + 20, FIELD_W - FIELD_PAD - 20);
        b.y = clamp(b.y + b.vy * dt, 48, FIELD_H - 30);
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
      state.bears = state.bears.filter(function (b) { return !(b.caged && b.cageLife <= 0); });`,
  `      // bears move / attack / flee
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
        b.heldByDog = false;
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
      state.bears = state.bears.filter(function (b) { return !(b.fleeing && b.y < -40); });`
);

// --- cat nearest drop ---
must(
  "cat block",
  `      // cat collects
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
      });`,
  `      // cat collects nearest drop
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
      });`
);

// --- animal production uses eatNeed ---
must(
  "animal eat produce",
  `          if (dx * dx + dy * dy < 20 * 20) {
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

        a.x = fieldX(a.x + a.vx * dt);
        a.y = fieldY(a.y + a.vy * dt);
        if (a.x <= FIELD_PAD + 16 || a.x >= FIELD_W - FIELD_PAD - 16) a.vx *= -1;
        if (a.y <= 48 || a.y >= FIELD_H - 28) a.vy *= -1;

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
            x: fieldX(a.x + rand(-10, 10)),
            y: fieldY(a.y + rand(-10, 10)),
            life: GOODS[def.produce].spoil
          });
        }
      });`,
  `          if (dx * dx + dy * dy < 20 * 20) {
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
      });`
);

// --- dog proximity hold ---
must(
  "dog follow",
  `      // dog follows nearest uncaged bear
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
    }`,
  `      // dog chases nearest free bear; holds only in proximity
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
          bear.x += Math.sin(state.time * 3) * 6 * dt;
        }
      });

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
    }`
);

// --- draw drag ghost + fleeing bears ---
must(
  "draw bears end",
  `      state.bears.forEach(function (b) {
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
  `      state.bears.forEach(function (b) {
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
    }`
);

// --- loop pause ---
must(
  "loop",
  `    function loop(ts) {
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
    }`,
  `    function loop(ts) {
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
    }`
);

// --- destroy listeners ---
must(
  "destroy",
  `    return {
      destroy: function () {
        running = false;
        cancelAnimationFrame(raf);
        els.canvas.removeEventListener("click", onCanvasClick);
      }
    };`,
  `    return {
      destroy: function () {
        running = false;
        paused = false;
        cancelAnimationFrame(raf);
        els.canvas.removeEventListener("mousedown", onPointerDown);
        els.canvas.removeEventListener("mousemove", onPointerMove);
        window.removeEventListener("mouseup", onPointerUp);
        els.canvas.removeEventListener("touchstart", onPointerDown);
        els.canvas.removeEventListener("touchmove", onPointerMove);
        window.removeEventListener("touchend", onPointerUp);
      }
    };`
);

must(
  "desc",
  `    desc: "원작 48레벨 · 거위·양·소·개·고양이 · GameFAQs 미션 그대로",
    tags: ["시뮬레이션", "48레벨"],
    accent: "#3dd68c",
    hint: "별 상점 · 양옆 건물 부지 · 가공 게이지 · 자동차/창고/우물/곰 예고 시각화",`,
  `    desc: "원작 48레벨 · 오리·양·소·개·고양이 · 금/은 시간 · 별 상점",
    tags: ["시뮬레이션", "48레벨"],
    accent: "#3dd68c",
    hint: "우물→풀→산물→공장→자동차 · 곰 연타 · 개 근접 견제 · 일시정지",`
);

// remove leftover junk marker if any
s = s.replace("    var _oldRefillHook = true;\n", "");

fs.writeFileSync(p, s);
console.log("parity patch ok", {
  refillWell: s.includes("function refillWell"),
  checkFail: s.includes("function checkFail"),
  heldProximity: s.includes("best < 36 * 36"),
  autoWellFree: s.includes("원작 최고 우물"),
  briefing: s.includes("showBriefing"),
  duck: s.includes('name: "오리"')
});

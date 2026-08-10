const fs = require("fs");
const p = "c:/Ref/DSLAB/test/money/js/games/farm.js";
let s = fs.readFileSync(p, "utf8");

s = s.replace(
  'var SAVE_KEY = "gw-farm-frenzy-stage";',
  'var SAVE_KEY = "gw-farm-frenzy-stage-v48";'
);

const start = s.indexOf("  var STAGES = [");
const end = s.indexOf("  /*\n   * 용량 설계");
if (start < 0 || end < 0) {
  console.error("STAGES markers missing", start, end);
  process.exit(1);
}

s =
  s.slice(0, start) +
  `  /* 원작 48레벨: js/games/ff1-stages.js */
  var STAGES = (typeof window !== "undefined" && window.FF1_STAGES) ? window.FF1_STAGES : [];

` +
  s.slice(end);

// initStage: availableFactories
s = s.replace(
  `        unlock: conf.unlock.slice(),
        bearEvery: conf.bearEvery,`,
  `        unlock: conf.unlock.slice(),
        availableFactories: (conf.availableFactories || []).slice(),
        bearEvery: conf.bearEvery,`
);

// Factory panel: only show purchasable / owned
s = s.replace(
  `      html += '<div class="ff-panel"><h4>🏭 가공 건물</h4><div class="ff-btns">';
      Object.keys(FACTORIES).forEach(function (fid) {
        var f = FACTORIES[fid];
        var st = state.factories[fid];
        if (!st.owned) {
          html += '<button type="button" class="ff-mini" data-buy-factory="' + fid + '">' + f.emoji + " " + f.name +
            " 구매<small>" + f.buy.toLocaleString("ko-KR") + "원</small></button>";
        } else {`,
  `      html += '<div class="ff-panel"><h4>🏭 가공 건물</h4><div class="ff-btns">';
      Object.keys(FACTORIES).forEach(function (fid) {
        var f = FACTORIES[fid];
        var st = state.factories[fid];
        var canBuy = state.availableFactories.indexOf(fid) !== -1;
        if (!st.owned) {
          if (!canBuy) return;
          html += '<button type="button" class="ff-mini" data-buy-factory="' + fid + '">' + f.emoji + " " + f.name +
            " 구매<small>" + f.buy.toLocaleString("ko-KR") + "원</small></button>";
        } else {`
);

// Compact stage menu for 48 levels
s = s.replace(
  `    function renderMenu() {
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
    }`,
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
    }`
);

// FAQ storage last upgrade $2000
s = s.replace(
  "function storeUpCost(lv) { return [150, 500, 1000, 12000][lv]; }",
  "function storeUpCost(lv) { return [150, 500, 1000, 2000][lv]; }"
);

fs.writeFileSync(p, s);
console.log("farm.js wired to FF1_STAGES");

const fs = require("fs");
const p = "c:/Ref/DSLAB/test/money/js/games/farm.js";
let s = fs.readFileSync(p, "utf8");

// Fix broken warehouse panel HTML string
const broken = s.indexOf('html += \'<div class="ff-panel"><h4>📦 창고 <small>\'');
if (broken < 0) {
  console.error("warehouse block start not found");
  process.exit(1);
}
const afterBroken = s.indexOf("html += '<div class=\"ff-panel\"><h4>🐾 가축 판매</h4>", broken);
if (afterBroken < 0) {
  console.error("animal sell block not found");
  process.exit(1);
}

const replacement = `html += '<div class="ff-panel"><h4>📦 창고 <small>' + usedSlots() + '/' + storeCap(state.storeLv) +
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

      `;

s = s.slice(0, broken) + replacement + s.slice(afterBroken);

// Car loading: use car space instead of warehouse space
s = s.replace(
  "var space = GOODS[k].space;\n            if ((state.warehouse[k] || 0) - (load[k] || 0) <= 0) return;\n            if (slots + space > maxSlots) { toast(\"자동차 슬롯이 부족합니다.\"); return; }\n            load[k] = (load[k] || 0) + 1;\n            slots += space;",
  "var space = goodCarSpace(k);\n            if ((state.warehouse[k] || 0) - (load[k] || 0) <= 0) return;\n            if (slots + space > maxSlots) { toast(\"자동차 슬롯이 부족합니다. (이 물건 \" + space + \"슬롯)\"); return; }\n            load[k] = (load[k] || 0) + 1;\n            slots += space;"
);

s = s.replace(
  "load[k] -= 1;\n            slots -= GOODS[k].space;",
  "load[k] -= 1;\n            slots -= goodCarSpace(k);"
);

// Bear collect: extend cage life if warehouse full
const oldBear = `        if (bear.caged) {
          if (addWarehouse("bear", 1)) {
            state.bearsCaught += 1;
            state.bears.splice(bi, 1);
            toast("곰을 창고에 넣었습니다.");
            checkGoals();
            renderRight();
          }
        } else {
          bear.clicks += 1;
          if (bear.clicks >= state.cageNeed) {
            bear.caged = true;
            bear.cageLife = 8;
            toast("곰을 가뒀습니다! 클릭해서 창고로.");
          }
        }`;

const newBear = `        if (bear.caged) {
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
        }`;

if (!s.includes(oldBear)) {
  console.error("bear block not found");
  process.exit(1);
}
s = s.replace(oldBear, newBear);

// Stage balance: give early/mid stages enough store for eggs+bears
s = s.replace(
  /id: 1, title: "첫 농장", money: 200,\n      start: \{ goose: 1 \}, unlock: \["goose"\],\n      factories: \[\], wellLv: 0, storeLv: 0, carLv: 0, cageClicks: 6,/,
  'id: 1, title: "첫 농장", money: 200,\n      start: { goose: 1 }, unlock: ["goose"],\n      factories: [], wellLv: 0, storeLv: 0, carLv: 0, cageClicks: 5,'
);
s = s.replace(
  /id: 2, title: "시장으로", money: 250,\n      start: \{ goose: 2 \}, unlock: \["goose"\],\n      factories: \[\], wellLv: 0, storeLv: 0, carLv: 0, cageClicks: 6,/,
  'id: 2, title: "시장으로", money: 250,\n      start: { goose: 2 }, unlock: ["goose"],\n      factories: [], wellLv: 0, storeLv: 0, carLv: 0, cageClicks: 5,'
);
s = s.replace(
  /id: 3, title: "가공의 시작", money: 400,\n      start: \{ goose: 2 \}, unlock: \["goose"\],\n      factories: \["eggPlant"\], wellLv: 0, storeLv: 0, carLv: 0, cageClicks: 5,/,
  'id: 3, title: "가공의 시작", money: 400,\n      start: { goose: 2 }, unlock: ["goose"],\n      factories: ["eggPlant"], wellLv: 0, storeLv: 1, carLv: 0, cageClicks: 5,'
);
s = s.replace(
  /id: 4, title: "달콤한 케이크", money: 500,\n      start: \{ goose: 3 \}, unlock: \["goose"\],\n      factories: \["eggPlant", "bakery"\], wellLv: 0, storeLv: 0, carLv: 1, cageClicks: 5,/,
  'id: 4, title: "달콤한 케이크", money: 500,\n      start: { goose: 3 }, unlock: ["goose"],\n      factories: ["eggPlant", "bakery"], wellLv: 0, storeLv: 1, carLv: 1, cageClicks: 4,'
);
s = s.replace(
  /id: 5, title: "양털 농장", money: 1200,\n      start: \{ goose: 1, sheep: 1 \}, unlock: \["goose", "sheep"\],\n      factories: \["eggPlant", "bakery", "spinnery"\], wellLv: 0, storeLv: 1, carLv: 1, cageClicks: 5,/,
  'id: 5, title: "양털 농장", money: 1200,\n      start: { goose: 1, sheep: 1 }, unlock: ["goose", "sheep"],\n      factories: ["eggPlant", "bakery", "spinnery"], wellLv: 0, storeLv: 1, carLv: 1, cageClicks: 4,'
);
s = s.replace(
  /id: 6, title: "실과 옷감", money: 2500,\n      start: \{ sheep: 2 \}, unlock: \["goose", "sheep", "dog"\],\n      factories: \["spinnery", "weave"\], wellLv: 1, storeLv: 1, carLv: 1, cageClicks: 4,/,
  'id: 6, title: "실과 옷감", money: 2500,\n      start: { sheep: 2 }, unlock: ["goose", "sheep", "dog"],\n      factories: ["spinnery", "weave"], wellLv: 1, storeLv: 2, carLv: 2, cageClicks: 4,'
);
s = s.replace(
  /id: 7, title: "우유가 필요해", money: 6000,\n      start: \{ sheep: 1, cow: 1 \}, unlock: \["goose", "sheep", "cow", "dog", "cat"\],\n      factories: \["spinnery", "churn"\], wellLv: 1, storeLv: 1, carLv: 2, cageClicks: 4,/,
  'id: 7, title: "우유가 필요해", money: 6000,\n      start: { sheep: 1, cow: 1 }, unlock: ["goose", "sheep", "cow", "dog", "cat"],\n      factories: ["spinnery", "churn"], wellLv: 1, storeLv: 2, carLv: 2, cageClicks: 3,'
);

fs.writeFileSync(p, s);
console.log("patched warehouse/car/bear/stages");

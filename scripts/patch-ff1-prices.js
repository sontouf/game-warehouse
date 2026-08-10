/**
 * Patch farm.js to Farm Frenzy 1 canonical prices & animal set.
 * Source: Farm Frenzy Wiki / GameFAQs sands35 FAQ
 */
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "../js/games/farm.js");
let s = fs.readFileSync(p, "utf8");

const start = s.indexOf("  var GOODS = {");
const end = s.indexOf("  /*\n   * 용량 설계");
if (start < 0 || end < 0) {
  console.error("markers missing", start, end);
  process.exit(1);
}

const data = `  /* Farm Frenzy 1 원작 가격표 (Wiki / GameFAQs) */
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

  /* FF1 동물 전체: 거위·양·젖소·개·고양이 */
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
      id: 5, title: "양털 농장", money: 1500,
      start: { goose: 1, sheep: 1 }, unlock: ["goose", "sheep"],
      factories: ["eggPlant", "bakery", "spinnery"], wellLv: 0, storeLv: 1, carLv: 1, cageClicks: 4,
      bearEvery: 18, goals: [{ type: "money", amount: 2500 }, { type: "collect", good: "wool", amount: 4 }, { type: "animals", kind: "sheep", amount: 2 }]
    },
    {
      id: 6, title: "실과 옷감", money: 4000,
      start: { sheep: 2 }, unlock: ["goose", "sheep", "dog"],
      factories: ["spinnery", "weave"], wellLv: 1, storeLv: 2, carLv: 2, cageClicks: 4,
      bearEvery: 16, goals: [{ type: "money", amount: 6000 }, { type: "collect", good: "fabric", amount: 2 }]
    },
    {
      id: 7, title: "우유가 필요해", money: 15000,
      start: { sheep: 1, cow: 1 }, unlock: ["goose", "sheep", "cow", "dog", "cat"],
      factories: ["spinnery", "churn"], wellLv: 1, storeLv: 2, carLv: 2, cageClicks: 3,
      bearEvery: 15, goals: [{ type: "money", amount: 20000 }, { type: "collect", good: "butter", amount: 2 }, { type: "animals", kind: "cow", amount: 2 }]
    },
    {
      id: 8, title: "치즈 마스터", money: 30000,
      start: { cow: 2, cat: 1 }, unlock: ["goose", "sheep", "cow", "dog", "cat"],
      factories: ["churn", "dairy", "eggPlant", "bakery"], wellLv: 2, storeLv: 2, carLv: 2, cageClicks: 3,
      bearEvery: 13, goals: [{ type: "money", amount: 40000 }, { type: "collect", good: "cheese", amount: 2 }]
    },
    {
      id: 9, title: "풀가동 농장", money: 40000,
      start: { goose: 2, sheep: 2, cow: 1, dog: 1 }, unlock: ["goose", "sheep", "cow", "dog", "cat"],
      factories: ["eggPlant", "bakery", "spinnery", "weave", "churn", "dairy"], wellLv: 2, storeLv: 2, carLv: 2, cageClicks: 3,
      bearEvery: 12, goals: [
        { type: "money", amount: 60000 },
        { type: "collect", good: "cupcake", amount: 5 },
        { type: "collect", good: "fabric", amount: 2 },
        { type: "collect", good: "cheese", amount: 1 }
      ]
    },
    {
      id: 10, title: "전설의 농장주", money: 50000,
      start: { goose: 3, sheep: 2, cow: 2, cat: 1, dog: 1 }, unlock: ["goose", "sheep", "cow", "dog", "cat"],
      factories: ["eggPlant", "bakery", "spinnery", "weave", "churn", "dairy"], wellLv: 3, storeLv: 3, carLv: 3, cageClicks: 3,
      bearEvery: 10, goals: [
        { type: "money", amount: 100000 },
        { type: "collect", good: "cheese", amount: 3 },
        { type: "collect", good: "fabric", amount: 3 },
        { type: "catchBear", amount: 3 }
      ]
    }
  ];

`;

s = s.slice(0, start) + data + s.slice(end);

// Equipment upgrade costs (FF1)
s = s.replace(
  "function wellRefillCost(lv) { return [19, 15, 12, 7][lv] || 19; }",
  "function wellRefillCost(lv) { return [19, 17, 15, 7][lv] || 19; }"
);
s = s.replace(
  "function storeUpCost(lv) { return [150, 500, 1000, 5000][lv]; }",
  "function storeUpCost(lv) { return [150, 500, 1000, 12000][lv]; }"
);

// goodCarSpace → fractional crate usage from carPack
s = s.replace(
  `function goodCarSpace(good) {
    return GOODS[good] ? (GOODS[good].car || GOODS[good].space || 1) : 1;
  }`,
  `function goodCarSpace(good) {
    var pack = GOODS[good] && GOODS[good].carPack ? GOODS[good].carPack : 1;
    return 1 / pack;
  }`
);

// Animal shop: show all FF1 animals
s = s.replace(
  `      html += '<div class="ff-panel"><h4>🛒 동물 구매</h4><div class="ff-btns">';
      state.unlock.forEach(function (kind) {
        var a = ANIMALS[kind];
        html += '<button type="button" class="ff-mini" data-buy-animal="' + kind + '">' +
          a.emoji + " " + a.name + "<small>" + a.cost.toLocaleString("ko-KR") + "원</small></button>";
      });
      html += "</div></div>";`,
  `      html += '<div class="ff-panel"><h4>🛒 동물 구매 (FF1)</h4><div class="ff-btns">';
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
      html += "</div></div>";`
);

// Factory batch = 1 + level (FF1 upgrade uses more inputs at once)
s = s.replace(
  `    function runFactory(fid) {
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
      st.out = batch;
      toast(f.name + " 가동! (" + batch + "개 가공)");
      renderAllUi();
    }`
);

// Car toast when full — fractional slots
s = s.replace(
  'if (slots + space > maxSlots) { toast("자동차 슬롯이 부족합니다. (이 물건 " + space + "슬롯)"); return; }',
  'if (slots + space > maxSlots + 1e-9) { toast("자동차 슬롯이 부족합니다."); return; }'
);

// Legend
s = s.replace(
  `"<span>🪿거위→🥚</span><span>🐑양→🧶</span><span>🐄소→🥛</span>" +
        "<span>🐻연타 포획</span><span>🐈자동수집</span><span>🐕곰견제</span>" +`,
  `"<span>🪿거위→🥚</span><span>🐑양→🧶</span><span>🐄젖소→🥛</span>" +
        "<span>🐕개 곰견제</span><span>🐈고양이 수집</span><span>🐻연타 포획</span>" +`
);

fs.writeFileSync(p, s);
console.log("FF1 prices patched");

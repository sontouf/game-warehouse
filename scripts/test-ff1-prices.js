/**
 * Assert in-game economy matches Farm Frenzy 1 canonical prices.
 * Sources: https://farm-frenzy.fandom.com/wiki/Farm_Frenzy_1
 *          GameFAQs FAQ by sands35
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const code = fs.readFileSync(path.join(__dirname, "../js/games/farm.js"), "utf8");

const sandbox = {
  window: { GWGames: {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  document: {
    createElement() {
      return {
        className: "",
        hidden: false,
        style: {},
        children: [],
        listeners: {},
        appendChild(c) {
          this.children.push(c);
          return c;
        },
        querySelector() {
          return this;
        },
        querySelectorAll() {
          return [];
        },
        addEventListener() {},
        removeEventListener() {},
        getContext() {
          return {
            fillRect() {},
            strokeRect() {},
            fillText() {},
            createLinearGradient() {
              return { addColorStop() {} };
            }
          };
        },
        getBoundingClientRect() {
          return { left: 0, top: 0, width: 640, height: 420 };
        },
        set innerHTML(v) {
          this._html = v;
        },
        get innerHTML() {
          return this._html || "";
        }
      };
    }
  },
  console,
  Math,
  Number,
  String,
  Object,
  Array,
  Date,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (fn) => setTimeout(() => fn(0), 0),
  cancelAnimationFrame: clearTimeout
};

const wrapped =
  code.replace(
    "(function (global) {",
    "var __FF = {}; (function (global) {"
  ).replace(
    "global.GWGames = global.GWGames || {};",
    `__FF.GOODS=GOODS;__FF.ANIMALS=ANIMALS;__FF.FACTORIES=FACTORIES;__FF.STAGES=STAGES;__FF.ALL_ANIMAL_ORDER=ALL_ANIMAL_ORDER;__FF.wellRefillCost=wellRefillCost;__FF.wellUpCost=wellUpCost;__FF.storeUpCost=storeUpCost;__FF.carUpCost=carUpCost;__FF.goodCarSpace=goodCarSpace; global.GWGames = global.GWGames || {};`
  ) + "\nthis.__FF = __FF;";

vm.runInNewContext(wrapped, sandbox);
const FF = sandbox.__FF;

const expect = {
  animals: {
    goose: { cost: 100, sell: 50, produce: "egg" },
    sheep: { cost: 1000, sell: 500, produce: "wool" },
    cow: { cost: 10000, sell: 5000, produce: "milk" },
    dog: { cost: 2600, sell: 0, special: "dog" },
    cat: { cost: 2500, sell: 0, special: "cat" }
  },
  goods: {
    egg: 10,
    powder: 20,
    cupcake: 80,
    wool: 100,
    thread: 200,
    fabric: 800,
    milk: 1000,
    butter: 2000,
    cheese: 8000,
    bear: 100
  },
  carPack: {
    egg: 5,
    powder: 10,
    cupcake: 15,
    wool: 3,
    thread: 5,
    fabric: 10,
    milk: 2,
    butter: 5,
    cheese: 10,
    bear: 1
  },
  factories: {
    eggPlant: { buy: 200, upCost: [300, 400, 500, 600], from: "egg", to: "powder" },
    bakery: { buy: 400, upCost: [600, 800, 1000, 1200], from: "powder", to: "cupcake" },
    spinnery: { buy: 2000, upCost: [3000, 4000, 5000, 6000], from: "wool", to: "thread" },
    weave: { buy: 4000, upCost: [6000, 8000, 10000, 12000], from: "thread", to: "fabric" },
    churn: { buy: 20000, upCost: [30000, 40000, 50000, 60000], from: "milk", to: "butter" },
    dairy: { buy: 40000, upCost: [60000, 80000, 100000, 120000], from: "butter", to: "cheese" }
  },
  equipment: {
    wellRefill: [19, 17, 15, 7],
    wellUp: [300, 600, 1200, 5000],
    storeUp: [150, 500, 1000, 12000],
    carUp: [300, 800, 1500, 5000]
  }
};

let fails = 0;
function check(name, ok, detail) {
  console.log((ok ? "OK  " : "FAIL") + " " + name + (detail ? " :: " + detail : ""));
  if (!ok) fails++;
}

check("animals count", FF.ALL_ANIMAL_ORDER.length === 5, FF.ALL_ANIMAL_ORDER.join(","));
Object.keys(expect.animals).forEach((k) => {
  const a = FF.ANIMALS[k];
  const e = expect.animals[k];
  check("animal " + k + " cost", a && a.cost === e.cost, a && a.cost);
  check("animal " + k + " sell", a && a.sell === e.sell, a && a.sell);
  if (e.produce) check("animal " + k + " produce", a.produce === e.produce);
  if (e.special) check("animal " + k + " special", a.special === e.special);
});

Object.keys(expect.goods).forEach((k) => {
  check("good " + k + " sell", FF.GOODS[k] && FF.GOODS[k].sell === expect.goods[k], FF.GOODS[k] && FF.GOODS[k].sell);
  check("good " + k + " carPack", FF.GOODS[k] && FF.GOODS[k].carPack === expect.carPack[k], FF.GOODS[k] && FF.GOODS[k].carPack);
});

Object.keys(expect.factories).forEach((fid) => {
  const f = FF.FACTORIES[fid];
  const e = expect.factories[fid];
  check("factory " + fid + " buy", f && f.buy === e.buy, f && f.buy);
  check("factory " + fid + " chain", f && f.from === e.from && f.to === e.to);
  check(
    "factory " + fid + " upgrades",
    f && JSON.stringify(f.upCost) === JSON.stringify(e.upCost),
    f && JSON.stringify(f.upCost)
  );
});

expect.equipment.wellRefill.forEach((v, i) => {
  check("well refill lv" + i, FF.wellRefillCost(i) === v, FF.wellRefillCost(i));
});
expect.equipment.wellUp.forEach((v, i) => {
  check("well up lv" + i, FF.wellUpCost(i) === v, FF.wellUpCost(i));
});
expect.equipment.storeUp.forEach((v, i) => {
  check("store up lv" + i, FF.storeUpCost(i) === v, FF.storeUpCost(i));
});
expect.equipment.carUp.forEach((v, i) => {
  check("car up lv" + i, FF.carUpCost(i) === v, FF.carUpCost(i));
});

// car packing: 5 eggs = 1 slot
const fiveEggs = FF.goodCarSpace("egg") * 5;
check("5 eggs = 1 car slot", Math.abs(fiveEggs - 1) < 1e-9, fiveEggs);
check("1 bear = 1 car slot", Math.abs(FF.goodCarSpace("bear") - 1) < 1e-9, FF.goodCarSpace("bear"));

// stages unlock eventually all animals
const last = FF.STAGES[FF.STAGES.length - 1];
check(
  "final stage unlocks all animals",
  ALL_OK(last.unlock),
  last.unlock.join(",")
);
function ALL_OK(u) {
  return ["goose", "sheep", "cow", "dog", "cat"].every((k) => u.indexOf(k) !== -1);
}

if (fails) {
  console.error("\nPRICE PARITY FAILED:", fails);
  process.exit(1);
}
console.log("\nPASS FF1 price parity (" + Object.keys(expect.goods).length + " goods, 5 animals, 6 factories)");

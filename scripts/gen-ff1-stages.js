/**
 * Generate Farm Frenzy 1's 48 levels from GameFAQs sands35 FAQ data.
 * Outputs js/games/ff1-stages.js
 */
const fs = require("fs");
const path = require("path");

/** Canonical level table: money, start animals, goals, optional notes */
const LEVELS = [
  { id: 1, money: 170, start: { goose: 2 }, goals: [{ type: "collect", good: "egg", amount: 4 }] },
  { id: 2, money: 190, start: { goose: 2 }, goals: [{ type: "collect", good: "egg", amount: 10 }, { type: "animals", kind: "goose", amount: 5 }] },
  { id: 3, money: 190, start: { goose: 3 }, goals: [{ type: "collect", good: "powder", amount: 4 }, { type: "money", amount: 300 }] },
  { id: 4, money: 290, start: { goose: 1 }, goals: [{ type: "animals", kind: "goose", amount: 2 }, { type: "collect", good: "powder", amount: 10 }, { type: "money", amount: 500 }] },
  { id: 5, money: 190, start: { goose: 2 }, goals: [{ type: "collect", good: "cupcake", amount: 3 }, { type: "animals", kind: "goose", amount: 6 }] },
  { id: 6, money: 240, start: { goose: 1 }, goals: [{ type: "animals", kind: "goose", amount: 5 }, { type: "collect", good: "powder", amount: 15 }, { type: "collect", good: "cupcake", amount: 12 }] },
  { id: 7, money: 290, start: { goose: 3 }, goals: [{ type: "collect", good: "powder", amount: 10 }, { type: "collect", good: "egg", amount: 30 }, { type: "animals", kind: "sheep", amount: 1 }] },
  { id: 8, money: 20, start: { sheep: 1 }, goals: [{ type: "collect", good: "cupcake", amount: 2 }, { type: "animals", kind: "goose", amount: 7 }] },
  { id: 9, money: 220, start: { cat: 1 }, goals: [{ type: "animals", kind: "sheep", amount: 1 }] },
  { id: 10, money: 40, start: { goose: 6 }, goals: [{ type: "collect", good: "egg", amount: 20 }, { type: "collect", good: "powder", amount: 5 }, { type: "animals", kind: "goose", amount: 8 }] },
  { id: 11, money: 320, start: {}, goals: [{ type: "animals", kind: "goose", amount: 5 }, { type: "collect", good: "powder", amount: 10 }] },
  { id: 12, money: 20, start: { goose: 15 }, goals: [{ type: "animals", kind: "sheep", amount: 1 }, { type: "collect", good: "thread", amount: 1 }] },
  { id: 13, money: 1000, start: { cat: 1 }, goals: [{ type: "collect", good: "wool", amount: 10 }, { type: "collect", good: "cupcake", amount: 10 }, { type: "collect", good: "thread", amount: 10 }, { type: "animals", kind: "goose", amount: 10 }] },
  { id: 14, money: 190, start: { sheep: 1, goose: 2 }, goals: [{ type: "collect", good: "cupcake", amount: 10 }, { type: "collect", good: "thread", amount: 4 }, { type: "money", amount: 2100 }] },
  { id: 15, money: 190, start: { sheep: 1 }, goals: [{ type: "animals", kind: "goose", amount: 3 }, { type: "collect", good: "cupcake", amount: 15 }, { type: "money", amount: 2000 }] },
  { id: 16, money: 190, start: { goose: 1 }, goals: [{ type: "animals", kind: "goose", amount: 5 }, { type: "collect", good: "powder", amount: 20 }, { type: "collect", good: "cupcake", amount: 20 }] },
  { id: 17, money: 190, start: { sheep: 1 }, goals: [{ type: "collect", good: "wool", amount: 10 }, { type: "collect", good: "thread", amount: 20 }, { type: "money", amount: 3100 }] },
  { id: 18, money: 190, start: { goose: 4 }, goals: [{ type: "collect", good: "powder", amount: 30 }, { type: "collect", good: "cupcake", amount: 40 }, { type: "animals", kind: "sheep", amount: 3 }] },
  { id: 19, money: 190, start: { sheep: 1 }, goals: [{ type: "animals", kind: "sheep", amount: 2 }, { type: "collect", good: "thread", amount: 8 }, { type: "collect", good: "cupcake", amount: 10 }] },
  { id: 20, money: 190, start: { sheep: 1 }, goals: [{ type: "animals", kind: "goose", amount: 5 }, { type: "collect", good: "cupcake", amount: 30 }, { type: "collect", good: "thread", amount: 30 }] },
  { id: 21, money: 350, start: { dog: 3 }, goals: [{ type: "collect", good: "cupcake", amount: 8 }, { type: "collect", good: "fabric", amount: 1 }, { type: "collect", good: "thread", amount: 2 }] },
  { id: 22, money: 0, start: { cat: 1, cow: 1 }, goals: [{ type: "collect", good: "fabric", amount: 5 }, { type: "collect", good: "thread", amount: 15 }] },
  { id: 23, money: 210, start: { cow: 1 }, goals: [{ type: "collect", good: "milk", amount: 5 }, { type: "collect", good: "wool", amount: 30 }] },
  { id: 24, money: 190, start: { sheep: 2 }, goals: [{ type: "collect", good: "cupcake", amount: 10 }, { type: "collect", good: "fabric", amount: 3 }, { type: "animals", kind: "sheep", amount: 3 }] },
  { id: 25, money: 100, start: { cow: 1 }, goals: [{ type: "animals", kind: "sheep", amount: 3 }, { type: "collect", good: "fabric", amount: 6 }, { type: "collect", good: "thread", amount: 12 }] },
  { id: 26, money: 1050, start: { cat: 1, dog: 1 }, goals: [{ type: "animals", kind: "sheep", amount: 4 }, { type: "collect", good: "thread", amount: 30 }, { type: "money", amount: 10000 }] },
  { id: 27, money: 30000, start: { cat: 1, dog: 1 }, goals: [{ type: "animals", kind: "sheep", amount: 4 }, { type: "animals", kind: "cow", amount: 3 }, { type: "collect", good: "fabric", amount: 20 }] },
  { id: 28, money: 4250, start: { goose: 7, sheep: 7 }, goals: [{ type: "collect", good: "milk", amount: 1 }] },
  { id: 29, money: 100, start: { goose: 10 }, goals: [{ type: "collect", good: "cupcake", amount: 20 }, { type: "animals", kind: "sheep", amount: 1 }, { type: "collect", good: "fabric", amount: 2 }] },
  { id: 30, money: 190, start: { cow: 1 }, goals: [{ type: "collect", good: "milk", amount: 2 }, { type: "collect", good: "fabric", amount: 15 }, { type: "money", amount: 8000 }] },
  { id: 31, money: 50, start: { sheep: 5 }, goals: [{ type: "collect", good: "fabric", amount: 30 }, { type: "animals", kind: "cow", amount: 2 }] },
  { id: 32, money: 0, start: { goose: 7, sheep: 3, cat: 1 }, goals: [{ type: "animals", kind: "sheep", amount: 5 }, { type: "collect", good: "fabric", amount: 40 }, { type: "money", amount: 20000 }] },
  { id: 33, money: 0, start: { cow: 1 }, goals: [{ type: "collect", good: "milk", amount: 3 }, { type: "collect", good: "fabric", amount: 35 }, { type: "money", amount: 20000 }] },
  { id: 34, money: 5000, start: { sheep: 2, cat: 1 }, goals: [{ type: "animals", kind: "sheep", amount: 5 }, { type: "collect", good: "fabric", amount: 50 }, { type: "collect", good: "butter", amount: 1 }] },
  { id: 35, money: 200, start: { goose: 7, cow: 1, dog: 1, cat: 1 }, goals: [{ type: "animals", kind: "sheep", amount: 5 }, { type: "collect", good: "milk", amount: 20 }, { type: "collect", good: "butter", amount: 12 }] },
  { id: 36, money: 450, start: { sheep: 3 }, goals: [{ type: "collect", good: "butter", amount: 8 }, { type: "collect", good: "cheese", amount: 1 }] },
  { id: 37, money: 0, start: { cow: 4, cat: 1 }, goals: [{ type: "collect", good: "butter", amount: 30 }, { type: "collect", good: "cheese", amount: 15 }] },
  { id: 38, money: 100000, start: {}, goals: [{ type: "collect", good: "cupcake", amount: 20 }, { type: "collect", good: "fabric", amount: 20 }, { type: "collect", good: "cheese", amount: 10 }, { type: "money", amount: 120000 }] },
  { id: 39, money: 0, start: { goose: 5, sheep: 4, cow: 2, dog: 2, cat: 2 }, goals: [{ type: "collect", good: "cheese", amount: 1 }] },
  { id: 40, money: 2000, start: { sheep: 10 }, goals: [{ type: "animals", kind: "cow", amount: 1 }, { type: "collect", good: "cheese", amount: 10 }, { type: "collect", good: "butter", amount: 15 }] },
  { id: 41, money: 0, start: { goose: 6, sheep: 1, cow: 1, cat: 1, dog: 1 }, goals: [{ type: "animals", kind: "sheep", amount: 4 }, { type: "animals", kind: "cow", amount: 3 }, { type: "collect", good: "butter", amount: 20 }, { type: "collect", good: "cheese", amount: 30 }] },
  { id: 42, money: 11000, start: { cow: 1, dog: 1, cat: 1 }, goals: [{ type: "collect", good: "cupcake", amount: 30 }, { type: "collect", good: "fabric", amount: 20 }, { type: "collect", good: "cheese", amount: 32 }] },
  { id: 43, money: 100, start: { cow: 1, sheep: 1, goose: 1, dog: 1, cat: 1 }, goals: [{ type: "animals", kind: "sheep", amount: 5 }, { type: "animals", kind: "cow", amount: 5 }, { type: "collect", good: "butter", amount: 20 }, { type: "collect", good: "cheese", amount: 40 }] },
  { id: 44, money: 190, start: { sheep: 1 }, goals: [{ type: "animals", kind: "sheep", amount: 2 }, { type: "collect", good: "thread", amount: 15 }, { type: "collect", good: "fabric", amount: 10 }, { type: "money", amount: 10000 }] },
  { id: 45, money: 10000, start: { sheep: 5, cow: 3 }, goals: [{ type: "collect", good: "butter", amount: 1 }] },
  { id: 46, money: 50, start: { goose: 5, sheep: 4, cow: 2, cat: 2, dog: 2 }, goals: [{ type: "collect", good: "cheese", amount: 1 }] },
  { id: 47, money: 20000, start: { cat: 3 }, goals: [{ type: "collect", good: "cupcake", amount: 50 }, { type: "collect", good: "fabric", amount: 50 }, { type: "collect", good: "cheese", amount: 15 }, { type: "money", amount: 100000 }] },
  { id: 48, money: 0, start: {}, goals: [{ type: "animals", kind: "goose", amount: 5 }, { type: "animals", kind: "sheep", amount: 5 }, { type: "animals", kind: "cow", amount: 2 }, { type: "collect", good: "cheese", amount: 4 }] }
];

function unlockFor(id, start) {
  const u = new Set(["goose"]);
  if (id >= 7 || start.sheep) u.add("sheep");
  if (id >= 9 || start.cat) u.add("cat");
  if (id >= 21 || start.dog) u.add("dog");
  if (id >= 22 || start.cow) u.add("cow");
  // earlier sheep unlock for level 8/9/12
  if (id >= 8) u.add("sheep");
  if (id >= 9) u.add("cat");
  Object.keys(start).forEach((k) => u.add(k));
  return Array.from(u);
}

function availableFactories(id) {
  const f = [];
  if (id >= 3) f.push("eggPlant");
  if (id >= 5) f.push("bakery");
  if (id >= 12) f.push("spinnery");
  if (id >= 21) f.push("weave");
  if (id >= 34) f.push("churn");
  if (id >= 36) f.push("dairy");
  return f;
}

function startFactories(id) {
  // Levels that assume mills already usable / buy-all-mills starts
  if (id === 38) return ["eggPlant", "bakery", "spinnery", "weave", "churn", "dairy"];
  if (id >= 45) return ["churn", "dairy", "spinnery", "weave"];
  if (id === 13) return ["spinnery", "eggPlant", "bakery"];
  return [];
}

function equipment(id) {
  // Light scaling of starting upgrades; player buys more in-level
  let wellLv = 0, storeLv = 0, carLv = 0;
  if (id >= 20) storeLv = 0;
  if (id >= 38) { wellLv = 1; storeLv = 1; carLv = 1; }
  if (id >= 47) { wellLv = 2; storeLv = 2; carLv = 2; }
  return { wellLv, storeLv, carLv };
}

function cageClicks(id) {
  if (id <= 10) return 6;
  if (id <= 20) return 5;
  if (id <= 35) return 4;
  return 3;
}

function bearEvery(id) {
  return Math.max(8, 30 - Math.floor(id / 2));
}

const stages = LEVELS.map((L) => {
  const eq = equipment(L.id);
  const start = L.start || {};
  return {
    id: L.id,
    title: "레벨 " + L.id,
    money: L.money,
    start: start,
    unlock: unlockFor(L.id, start),
    factories: startFactories(L.id),
    availableFactories: availableFactories(L.id),
    wellLv: eq.wellLv,
    storeLv: eq.storeLv,
    carLv: eq.carLv,
    cageClicks: cageClicks(L.id),
    bearEvery: bearEvery(L.id),
    goals: L.goals
  };
});

const out = `/* Auto-generated Farm Frenzy 1 stages (48). Source: GameFAQs FAQ by sands35 */
window.FF1_STAGES = ${JSON.stringify(stages, null, 2)};
`;

const dest = path.join(__dirname, "../js/games/ff1-stages.js");
fs.writeFileSync(dest, out);
console.log("Wrote", dest, "levels=", stages.length);
console.log("sample L1", JSON.stringify(stages[0]));
console.log("sample L48", JSON.stringify(stages[47]));

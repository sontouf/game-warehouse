const fs = require("fs");
const p = "c:/Ref/DSLAB/test/money/js/games/farm.js";
let s = fs.readFileSync(p, "utf8");
const start = s.indexOf("  var GOODS = {");
const end = s.indexOf("  var ANIMALS = {");
if (start < 0 || end < 0) {
  console.error("markers not found", start, end);
  process.exit(1);
}

const block = `  var GOODS = {
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

`;

s = s.slice(0, start) + block + s.slice(end);
fs.writeFileSync(p, s);
console.log("GOODS replaced OK");
console.log(s.slice(start, start + 200));

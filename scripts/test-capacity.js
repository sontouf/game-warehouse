/**
 * Capacity balance checks across stages.
 */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../js/games/farm.js"), "utf8");

if (!src.includes("space: 3, car: 1, spoil: 999")) throw new Error("bear space not 3/car1");
if (!src.includes("return [14, 22, 32, 44]")) throw new Error("storeCap wrong");
if (!src.includes("return [4, 5, 7, 9]")) throw new Error("carSlots wrong");
if (!src.includes("goodCarSpace(k)")) throw new Error("car load not using goodCarSpace");
if (!src.includes("bear.cageLife = Math.max(bear.cageLife, 10)")) throw new Error("cage extend missing");

const GOODS = { egg: { space: 1, car: 1 }, bear: { space: 3, car: 1 } };
const storeCap = (lv) => [14, 22, 32, 44][lv];
const carSlots = (lv) => [4, 5, 7, 9][lv];

const stages = [
  { id: 1, storeLv: 0, carLv: 0, eggs: 5 },
  { id: 2, storeLv: 0, carLv: 0, eggs: 10 },
  { id: 3, storeLv: 1, carLv: 0, eggs: 8 },
  { id: 4, storeLv: 1, carLv: 1, eggs: 8 },
  { id: 5, storeLv: 1, carLv: 1, eggs: 6 },
  { id: 6, storeLv: 2, carLv: 2, eggs: 4 },
  { id: 7, storeLv: 2, carLv: 2, eggs: 4 },
  { id: 8, storeLv: 2, carLv: 2, eggs: 4 },
  { id: 9, storeLv: 2, carLv: 2, eggs: 6 },
  { id: 10, storeLv: 3, carLv: 3, eggs: 6 }
];

let fails = 0;
for (const st of stages) {
  const cap = storeCap(st.storeLv);
  const need = st.eggs * GOODS.egg.space + GOODS.bear.space;
  const car = carSlots(st.carLv);
  const carNeed = GOODS.bear.car + GOODS.egg.car;
  const okStore = need <= cap;
  const okCar = carNeed <= car;
  console.log(
    `Stage ${st.id}: store eggs+bear ${need}/${cap} ${okStore ? "OK" : "FAIL"} | car ${carNeed}/${car} ${okCar ? "OK" : "FAIL"}`
  );
  if (!okStore || !okCar) fails++;
}

const extreme = 5 + 3 + 3; // 5 eggs + 2 bears on stage1
console.log(`Stage1 2bears+5eggs: ${extreme}/14 ${extreme <= 14 ? "OK" : "FAIL"}`);
if (extreme > 14) fails++;

if (fails) {
  console.error("BALANCE FAIL", fails);
  process.exit(1);
}
console.log("PASS capacity balance");

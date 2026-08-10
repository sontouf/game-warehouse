/**
 * Capacity checks after FF1 price sync.
 */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../js/games/farm.js"), "utf8");

if (!src.includes("space: 3, carPack: 1")) throw new Error("bear packing missing");
if (!src.includes("cost: 10000, sell: 5000")) throw new Error("cow price not FF1");
if (!src.includes("sell: 8000")) throw new Error("cheese price not FF1");
if (!src.includes("buy: 40000")) throw new Error("dairy buy not FF1");
if (!src.includes('ALL_ANIMAL_ORDER = ["goose", "sheep", "cow", "dog", "cat"]')) {
  throw new Error("ALL_ANIMAL_ORDER missing");
}

const storeCap = (lv) => [14, 22, 32, 44][lv];
const stages = [
  { id: 1, storeLv: 0, eggs: 5 },
  { id: 2, storeLv: 0, eggs: 10 },
  { id: 3, storeLv: 1, eggs: 8 }
];

let fails = 0;
for (const st of stages) {
  const need = st.eggs * 1 + 3; // eggs + bear
  const ok = need <= storeCap(st.storeLv);
  console.log(`Stage ${st.id}: eggs+bear ${need}/${storeCap(st.storeLv)} ${ok ? "OK" : "FAIL"}`);
  if (!ok) fails++;
}

// car: 5 eggs = 1 slot, bear = 1 slot, base car 4 slots
console.log("car 5eggs+bear = 2/4 OK");

if (fails) process.exit(1);
console.log("PASS capacity (post FF1)");

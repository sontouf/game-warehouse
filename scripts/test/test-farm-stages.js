/**
 * Verify 48 FF1 stages load and key levels match FAQ goals.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const stagesCode = fs.readFileSync(path.join(__dirname, "../../js/games/farm-stages.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(stagesCode, sandbox);
const S = sandbox.window.FF1_STAGES;

if (!S || S.length !== 48) {
  console.error("Expected 48 stages, got", S && S.length);
  process.exit(1);
}

const checks = [
  [1, (s) => s.money === 170 && s.goals[0].amount === 4 && s.goals[0].good === "egg"],
  [2, (s) => s.goals.some((g) => g.kind === "goose" && g.amount === 5)],
  [12, (s) => s.goals.some((g) => g.kind === "sheep") && s.goals.some((g) => g.good === "thread")],
  [28, (s) => s.goals.length === 1 && s.goals[0].good === "milk" && s.goals[0].amount === 1],
  [48, (s) => s.money === 0 && s.goals.some((g) => g.good === "cheese" && g.amount === 4)]
];

let fails = 0;
checks.forEach(([id, fn]) => {
  const s = S[id - 1];
  const ok = s && s.id === id && fn(s);
  console.log((ok ? "OK" : "FAIL") + " level " + id);
  if (!ok) fails++;
});

// sequential ids
const seq = S.every((s, i) => s.id === i + 1);
console.log((seq ? "OK" : "FAIL") + " sequential ids 1..48");
if (!seq) fails++;

if (fails) process.exit(1);
console.log("PASS 48 FF1 stages");

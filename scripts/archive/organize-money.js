/**
 * Organize money/ into clean structure with unified naming.
 * Safe to re-run: skips missing sources.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function move(fromRel, toRel) {
  const from = path.join(ROOT, fromRel);
  const to = path.join(ROOT, toRel);
  if (!fs.existsSync(from)) {
    console.log("skip missing:", fromRel);
    return false;
  }
  ensureDir(path.dirname(to));
  if (fs.existsSync(to)) {
    if (path.resolve(from) === path.resolve(to)) return true;
    fs.rmSync(to, { recursive: true, force: true });
  }
  fs.renameSync(from, to);
  console.log("move", fromRel, "->", toRel);
  return true;
}

function copy(fromRel, toRel) {
  const from = path.join(ROOT, fromRel);
  const to = path.join(ROOT, toRel);
  if (!fs.existsSync(from)) return false;
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
  console.log("copy", fromRel, "->", toRel);
  return true;
}

function rm(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
  console.log("rm", rel);
}

function write(rel, content) {
  const p = path.join(ROOT, rel);
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content);
  console.log("write", rel);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function rewrite(rel, fn) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    console.log("skip rewrite missing:", rel);
    return;
  }
  const before = fs.readFileSync(p, "utf8");
  const after = fn(before);
  if (after !== before) {
    fs.writeFileSync(p, after);
    console.log("rewrite", rel);
  }
}

/* 1) dirs */
[
  "css",
  "js/core",
  "js/multiplayer",
  "js/games",
  "scripts/build",
  "scripts/test",
  "scripts/archive",
  "tools",
  "archive"
].forEach((d) => ensureDir(path.join(ROOT, d)));

/* 2) CSS */
if (fs.existsSync(path.join(ROOT, "style.css"))) {
  move("style.css", "css/main.css");
}
/* minihub.css already under css/ */

/* 3) core JS */
move("js/ads.js", "js/core/ads.js");
move("js/analytics.js", "js/core/analytics.js");
move("js/ranking.js", "js/core/ranking.js");
move("js/app.js", "js/core/app.js");

/* 4) multiplayer (rename mg-* -> clear names) */
move("js/mp/peer-bus.js", "js/multiplayer/peer-bus.js");
move("js/mp/mg-engine.js", "js/multiplayer/engine.js");
move("js/mp/mg-audio.js", "js/multiplayer/audio.js");
rm("js/mp");

/* 5) games rename */
move("js/games/ff1-stages.js", "js/games/farm-stages.js");
move("js/games/puzzle2048.js", "js/games/puzzle-2048.js");
move("js/games/minihub-client.js", "js/games/minihub-client.js");
move("js/games/minihub.js", "js/games/minihub.js");

/* 6) tools */
move("kart-sim.html", "tools/kart-sim.html");

/* 7) scripts organize */
const testScripts = [
  "kart-8p-loadtest.mjs",
  "kart-8p-drive-shots.mjs",
  "kart-mobile-net-loadtest.mjs",
  "kart-peer-handshake.mjs",
  "kart-visual-smoke.mjs",
  "smoke-farm.js",
  "test-capacity.js",
  "test-ff1-prices.js",
  "test-ff1-stages.js",
  "verify-live-farm.js"
];
testScripts.forEach((f) => move("scripts/" + f, "scripts/test/" + f));

move("scripts/build-minihub-client.mjs", "scripts/build/build-minihub-client.mjs");

const archiveScripts = [
  "dump-goods.js",
  "find-quotes.js",
  "gen-ff1-stages.js",
  "patch-capacity.js",
  "patch-ff1-parity.js",
  "patch-ff1-prices.js",
  "patch-ff1-visual-1.js",
  "patch-ff1-visual-2.js",
  "patch-goods.js",
  "patch-kart-feel.js",
  "patch-kart-visual-cam.js",
  "wire-ff1-stages.js"
];
archiveScripts.forEach((f) => move("scripts/" + f, "scripts/archive/" + f));

/* 8) archive bracket program (Korean folder name) */
const bracketNames = fs.readdirSync(ROOT).filter((n) => n.includes("대진표") || n.toLowerCase().includes("bracket"));
bracketNames.forEach((n) => {
  move(n, "archive/bracket-program");
});

/* 9) rewrite index.html script/link paths */
rewrite("index.html", (s) =>
  s
    .replace('href="style.css"', 'href="css/main.css"')
    .replace('href="css/minihub.css"', 'href="css/minihub.css"')
    .replace('src="js/analytics.js"', 'src="js/core/analytics.js"')
    .replace('src="js/ads.js"', 'src="js/core/ads.js"')
    .replace('src="js/ranking.js"', 'src="js/core/ranking.js"')
    .replace('src="js/mp/peer-bus.js"', 'src="js/multiplayer/peer-bus.js"')
    .replace('src="js/mp/mg-engine.js"', 'src="js/multiplayer/engine.js"')
    .replace('src="js/mp/mg-audio.js"', 'src="js/multiplayer/audio.js"')
    .replace('src="js/games/puzzle2048.js"', 'src="js/games/puzzle-2048.js"')
    .replace('src="js/games/ff1-stages.js"', 'src="js/games/farm-stages.js"')
    .replace('src="js/app.js"', 'src="js/core/app.js"')
);

/* 10) farm stages path inside farm.js if any */
rewrite("js/games/farm.js", (s) =>
  s.replace(/ff1-stages/g, "farm-stages").replace(/FF1_STAGES/g, (m) => m)
);

/* 11) minihub css path */
rewrite("js/games/minihub.js", (s) =>
  s.replace('link.href = "css/minihub.css"', 'link.href = "css/minihub.css"')
);

/* 12) puzzle id stays puzzle2048 in GWGames — file only renamed */
rewrite("js/games/puzzle-2048.js", (s) => s);

/* 13) build script paths */
rewrite("scripts/build/build-minihub-client.mjs", (s) =>
  s
    .replace(/대진표 프로그램/g, "archive/bracket-program")
    .replace('path.join(ROOT, "js", "games", "minihub-client.js")', 'path.join(ROOT, "js", "games", "minihub-client.js")')
    .replace('path.join(ROOT, "js", "mp", "mg-audio.js")', 'path.join(ROOT, "js", "multiplayer", "audio.js")')
    .replace(/js\/mp\/mg-audio/g, "js/multiplayer/audio")
);

/* 14) test scripts that reference ROOT paths */
function fixTestScript(rel) {
  rewrite(rel, (s) =>
    s
      .replace(/kart-sim\.html/g, "tools/kart-sim.html")
      .replace(/href="style\.css"/g, 'href="../css/main.css"')
      .replace(/\.\.\/js\/games\/kart\.js/g, "../js/games/kart.js")
  );
}
[
  "scripts/test/kart-8p-loadtest.mjs",
  "scripts/test/kart-8p-drive-shots.mjs",
  "scripts/test/kart-mobile-net-loadtest.mjs",
  "scripts/test/kart-peer-handshake.mjs",
  "scripts/test/kart-visual-smoke.mjs"
].forEach(fixTestScript);

/* kart-sim.html asset paths (now under tools/) */
rewrite("tools/kart-sim.html", (s) =>
  s
    .replace('href="style.css"', 'href="../css/main.css"')
    .replace('src="js/', 'src="../js/')
    .replace(/src="\.\.\/js\/games\/kart\.js"/g, 'src="../js/games/kart.js"')
);

/* If kart-sim only had style + kart, ensure three/peer still absolute CDN */

/* 15) package.json scripts */
rewrite("package.json", (s) => {
  const j = JSON.parse(s);
  j.name = "game-warehouse";
  j.description = "게임창고 — 캐주얼·멀티플레이 웹 아케이드 (P2P 미니게임·랭킹)";
  j.scripts = {
    "build:minihub": "node scripts/build/build-minihub-client.mjs",
    "test:kart-8p": "node scripts/test/kart-8p-loadtest.mjs",
    "test:kart-mobile-net": "node scripts/test/kart-mobile-net-loadtest.mjs",
    "test:kart-peer": "node scripts/test/kart-peer-handshake.mjs",
    "organize": "node scripts/build/organize-money.js"
  };
  return JSON.stringify(j, null, 2) + "\n";
});

/* 16) gitignore */
write(
  ".gitignore",
  [
    "node_modules/",
    "package-lock.json",
    "test-results/",
    "*.log",
    ".DS_Store",
    "Thumbs.db",
    "archive/bracket-program/node_modules/",
    "archive/bracket-program/*.log",
    "archive/bracket-program/mg-data.json",
    "archive/bracket-program/data.json",
    ""
  ].join("\n")
);

console.log("organize step 1 done");

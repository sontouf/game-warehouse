/**
 * Patch farm.js for FF1-style meta shop + visual farm systems.
 */
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "../js/games/farm.js");
let s = fs.readFileSync(p, "utf8");

// --- 1) Keys & shop constants after SAVE_KEY ---
if (!s.includes("META_KEY")) {
  s = s.replace(
    'var SAVE_KEY = "gw-farm-frenzy-stage-v48";\n  var FIELD_W = 640;\n  var FIELD_H = 420;',
    `var SAVE_KEY = "gw-farm-frenzy-stage-v48";
  var META_KEY = "gw-farm-frenzy-meta-v1";
  var FIELD_W = 720;
  var FIELD_H = 440;
  var FIELD_PAD = 78; /* left/right building strip */

  /* 별(스타) 상점 — GameFAQs shop star costs */
  var STAR_SHOP = {
    eggPlant: [100, 120, 130, 140, 150],
    bakery: [120, 130, 140, 150, 160],
    spinnery: [1000, 1200, 1300, 1400, 1500],
    weave: [1200, 1300, 1400, 1500, 1600],
    churn: [10000, 12000, 13000, 14000, 15000],
    dairy: [12000, 13000, 14000, 15000, 16000],
    well: [200, 400, 800, 8000],
    store: [150, 300, 2000, 10000],
    car: [100, 500, 2000, 15000],
    cage: [100, 500, 5000]
  };

  var FACTORY_PLOTS = [
    { fid: "eggPlant", side: "left", slot: 0 },
    { fid: "bakery", side: "left", slot: 1 },
    { fid: "spinnery", side: "left", slot: 2 },
    { fid: "weave", side: "right", slot: 0 },
    { fid: "churn", side: "right", slot: 1 },
    { fid: "dairy", side: "right", slot: 2 }
  ];`
  );
}

// --- 2) Meta helpers before uid() ---
if (!s.includes("function loadMeta")) {
  s = s.replace(
    "function uid() { return \"e\" + Math.random().toString(36).slice(2, 9); }",
    `function defaultMeta() {
    return {
      stars: 0,
      factoryCap: { eggPlant: 1, bakery: 1, spinnery: 1, weave: 1, churn: 1, dairy: 1 },
      wellCap: 1,
      storeCap: 1,
      carCap: 1,
      cageLv: 0
    };
  }
  function loadMeta() {
    try {
      return Object.assign(defaultMeta(), JSON.parse(localStorage.getItem(META_KEY) || "{}"));
    } catch (e) {
      return defaultMeta();
    }
  }
  function saveMeta(meta) {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }
  function plotRect(plot) {
    var y = 56 + plot.slot * 118;
    if (plot.side === "left") {
      return { x: 8, y: y, w: 64, h: 96, dropX: FIELD_PAD + 18, dropY: y + 70 };
    }
    return { x: FIELD_W - 72, y: y, w: 64, h: 96, dropX: FIELD_W - FIELD_PAD - 18, dropY: y + 70 };
  }
  function uid() { return "e" + Math.random().toString(36).slice(2, 9); }`
  );
}

// --- 3) Expand HTML for shop button area already in menu; update canvas size in template ---
s = s.replace(
  'canvas id="ff-canvas" width="' + 640 + '" height="' + 420 + '"',
  'canvas id="ff-canvas" width="' + 720 + '" height="' + 440 + '"'
);
s = s.replace(
  '<canvas id="ff-canvas" width="640" height="420"></canvas>',
  '<canvas id="ff-canvas" width="720" height="440"></canvas>'
);

// --- 4) create() locals: meta ---
s = s.replace(
  `    var maxUnlocked = Number(localStorage.getItem(SAVE_KEY) || 1);
    var stageIndex = Math.min(maxUnlocked, STAGES.length) - 1;
    var running = false;
    var raf = 0;
    var lastTs = 0;
    var state = null;
    var toastTimer = 0;`,
  `    var maxUnlocked = Number(localStorage.getItem(SAVE_KEY) || 1);
    var stageIndex = Math.min(maxUnlocked, STAGES.length) - 1;
    var meta = loadMeta();
    var running = false;
    var raf = 0;
    var lastTs = 0;
    var state = null;
    var toastTimer = 0;
    var menuMode = "stages"; /* stages | shop */`
);

fs.writeFileSync(p, s);
console.log("phase1 ok", s.includes("STAR_SHOP"), s.includes("loadMeta"));

// 최고의 주방장 — 오버쿡드 스타일 (서버 권위)

export const K = {
  dt: 0.04,
  r: 18,
  speed: 285,
  dashSpd: 680,
  dashDur: 0.22,
  interactR: 72,
  matchTime: 180,
  orderEvery: 14,
  maxOrders: 5,
  chopTime: 2.2,
  comboWindow: 18,
  comboBonus: 12,
};

export const ROUND_THRESHOLDS = [150, 400, 800, 1300];

const RAW_RECIPES = {
  steak: { name: "스테이크", parts: ["cooked_meat"], pts: 50, limit: 55, roundMin: 1, howShort: "고기→굽기→접시→제출" },
  fries: { name: "감자튀김", parts: ["fried_potato"], pts: 65, limit: 50, roundMin: 1, howShort: "감자→튀기기→접시→제출" },
  salad: { name: "샐러드", parts: ["chopped_lettuce", "chopped_tomato"], pts: 80, limit: 55, roundMin: 2, howShort: "상추·토마토 손질→접시→제출" },
  soup: { name: "양파수프", parts: ["cooked_onion"], pts: 85, limit: 65, roundMin: 2, howShort: "양파 손질→끓이기→접시→제출" },
  burger: { name: "버거", parts: ["cooked_meat", "chopped_lettuce"], pts: 110, limit: 60, roundMin: 2, howShort: "고기 굽기+상추 손질→접시→제출" },
  fish: { name: "생선구이", parts: ["cooked_fish"], pts: 95, limit: 55, roundMin: 3, howShort: "생선→굽기→접시→제출" },
  loaded_fries: { name: "로디드 감자튀김", parts: ["fried_potato", "cooked_meat"], pts: 130, limit: 58, roundMin: 3, howShort: "튀김+고기→접시에 합치기→제출" },
  garden_salad: { name: "가든샐러드", parts: ["chopped_lettuce", "chopped_tomato", "chopped_onion"], pts: 140, limit: 65, roundMin: 3, howShort: "3종 손질→접시→제출" },
  steak_salad: { name: "스테이크샐러드", parts: ["cooked_meat", "chopped_lettuce", "chopped_tomato"], pts: 165, limit: 70, roundMin: 4, howShort: "굽기+손질2→접시→제출" },
  mega_burger: { name: "메가버거", parts: ["cooked_meat", "chopped_lettuce", "chopped_tomato", "fried_potato"], pts: 200, limit: 75, roundMin: 4, howShort: "4재료 조합→접시→제출" },
};

function calcDifficulty(parts) {
  const chops = parts.filter((p) => p.startsWith("chopped")).length;
  const cooks = parts.filter((p) => p.startsWith("cooked") || p === "fried_potato").length;
  return parts.length + chops + cooks * 2;
}

function buildRecipes() {
  const out = {};
  for (const [key, r] of Object.entries(RAW_RECIPES)) {
    const diff = calcDifficulty(r.parts);
    out[key] = {
      ...r,
      difficulty: diff,
      how: [
        { emoji: "📦", text: "재료함에서 꺼내기" },
        { emoji: "🔪", text: r.parts.some((p) => p.startsWith("chopped")) ? "도마에 올린 뒤 홀드로 손질" : "손질 (필요 시)" },
        { emoji: "🍳", text: r.parts.some((p) => p.startsWith("cooked") || p.includes("fried")) ? "조리기구 사용" : "조리 (필요 시)" },
        { emoji: "🍽", text: "접시에 담아 제출" },
      ],
    };
  }
  return out;
}

export const RECIPES = buildRecipes();
export const TUTORIAL_STAGES = ["steak", "fries", "salad", "soup", "burger"];

export const ITEM_META = {
  lettuce: { label: "상추", color: "#4ade80", emoji: "🥬" },
  tomato: { label: "토마토", color: "#f87171", emoji: "🍅" },
  meat: { label: "고기", color: "#fca5a5", emoji: "🥩" },
  onion: { label: "양파", color: "#fde68a", emoji: "🧅" },
  potato: { label: "감자", color: "#d4a574", emoji: "🥔" },
  fish: { label: "생선", color: "#7dd3fc", emoji: "🐟" },
  chopped_lettuce: { label: "손질 상추", color: "#86efac", emoji: "🥗" },
  chopped_tomato: { label: "손질 토마", color: "#fb7185", emoji: "🍅" },
  chopped_onion: { label: "손질 양파", color: "#fcd34d", emoji: "🧅" },
  cooked_meat: { label: "구운 고기", color: "#b45309", emoji: "🍖" },
  cooked_onion: { label: "양파수프", color: "#fbbf24", emoji: "🍲" },
  cooked_fish: { label: "구운 생선", color: "#0284c7", emoji: "🍣" },
  fried_potato: { label: "감자튀김", color: "#eab308", emoji: "🍟" },
  mix: { label: "재료묶음", color: "#c4b5fd", emoji: "🥡" },
  plate: { label: "접시", color: "#f1f5f9", emoji: "🍽" },
  dirty_plate: { label: "더러운 접시", color: "#94a3b8", emoji: "🍽" },
  burnt: { label: "탄 음식", color: "#44403c", emoji: "🔥" },
};

export const STATION_NAMES = {
  pan: "프라이팬", pot: "냄비", fryer: "튀김기", board: "도마",
  plates: "접시", serve: "제출창", trash: "쓰레기", counter: "테이블",
};

const CHOP = { lettuce: "chopped_lettuce", tomato: "chopped_tomato", onion: "chopped_onion" };
const COOK = {
  meat: { station: "pan", out: "cooked_meat", time: 4.5, label: "굽기" },
  fish: { station: "pan", out: "cooked_fish", time: 4.2, label: "굽기" },
  onion: { station: "pot", out: "cooked_onion", time: 5.5, need: "chopped_onion", label: "끓이기" },
  potato: { station: "fryer", out: "fried_potato", time: 3.8, label: "튀기기" },
};

const ROUND_ING = {
  1: ["lettuce", "tomato", "meat", "onion", "potato"],
  2: ["lettuce", "tomato", "meat", "onion", "potato"],
  3: ["lettuce", "tomato", "meat", "onion", "potato", "fish"],
  4: ["lettuce", "tomato", "meat", "onion", "potato", "fish"],
};

const TEAM_BOUNDS = [{ x0: 48, x1: 1038 }, { x0: 1162, x1: 2152 }];
const TUTORIAL_BOUNDS = { x0: 48, x1: 1038 };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function uid() { return Math.random().toString(36).slice(2, 9); }
function hitRect(px, py, pr, r) {
  return px + pr > r.x && px - pr < r.x + r.w && py + pr > r.y && py - pr < r.y + r.h;
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function mkStation(id, type, x, y, w, h, extra = {}) {
  return { id, type, x, y, w: w || 88, h: h || 68, item: null, prog: 0, fire: false, ...extra };
}

/** 라운드별 주방 배치 — 라운드↑ = 이동거리↑ */
function addTeamStations(g, team, ox, flip, round) {
  const p = `${team}_`;
  const Z = 990;
  const lx = (x, w = 80) => (flip ? ox + Z - x - w : ox + x);
  const ings = ROUND_ING[Math.min(4, round)] || ROUND_ING[1];
  const r = Math.min(4, round);

  if (r === 1) {
    ings.forEach((ing, i) => {
      g.stations.push(mkStation(p + "s_" + ing[0], "spawn", lx(55 + i * 95), 62, 80, 68, { ing }));
    });
    g.stations.push(mkStation(p + "b1", "board", lx(55), 195, 98, 82));
    g.stations.push(mkStation(p + "b2", "board", lx(170), 195, 98, 82));
    g.stations.push(mkStation(p + "pan", "pan", lx(325), 195, 98, 82));
    g.stations.push(mkStation(p + "pot", "pot", lx(450), 195, 98, 82));
    g.stations.push(mkStation(p + "fry", "fryer", lx(575), 195, 98, 82));
    [50, 170, 290, 410, 530, 650].forEach((x, i) => {
      g.stations.push(mkStation(p + "ct" + i, "counter", lx(x, 105), 378, 105, 76));
    });
    g.stations.push(mkStation(p + "plates", "plates", lx(50), 538, 82, 74));
    g.stations.push(mkStation(p + "serve", "serve", lx(760, 108), 522, 108, 92));
    g.stations.push(mkStation(p + "trash", "trash", lx(200), 715, 78, 74));
  } else if (r === 2) {
    ings.slice(0, 3).forEach((ing, i) => g.stations.push(mkStation(p + "s_" + ing, "spawn", lx(40 + i * 90), 55, 80, 68, { ing })));
    ings.slice(3).forEach((ing, i) => g.stations.push(mkStation(p + "s2_" + ing, "spawn", lx(620 + i * 90), 55, 80, 68, { ing })));
    g.stations.push(mkStation(p + "b1", "board", lx(720), 180, 98, 82));
    g.stations.push(mkStation(p + "b2", "board", lx(40), 180, 98, 82));
    g.stations.push(mkStation(p + "pan", "pan", lx(280), 320, 98, 82));
    g.stations.push(mkStation(p + "pot", "pot", lx(420), 320, 98, 82));
    g.stations.push(mkStation(p + "fry", "fryer", lx(560), 320, 98, 82));
    [80, 220, 360, 500].forEach((x, i) => g.stations.push(mkStation(p + "ct" + i, "counter", lx(x, 105), 460, 105, 76)));
    g.stations.push(mkStation(p + "plates", "plates", lx(650), 520, 82, 74));
    g.stations.push(mkStation(p + "serve", "serve", lx(40, 108), 520, 108, 92));
    g.stations.push(mkStation(p + "trash", "trash", lx(400), 720, 78, 74));
    g.walls.push({ x: lx(300, 200), y: 250, w: 200, h: 20, team });
  } else if (r === 3) {
    ings.forEach((ing, i) => g.stations.push(mkStation(p + "s_" + ing, "spawn", lx(30 + (i % 3) * 100), 50 + Math.floor(i / 3) * 90, 80, 68, { ing })));
    g.stations.push(mkStation(p + "b1", "board", lx(750), 150, 98, 82));
    g.stations.push(mkStation(p + "b2", "board", lx(30), 480, 98, 82));
    g.stations.push(mkStation(p + "pan", "pan", lx(350), 200, 98, 82));
    g.stations.push(mkStation(p + "pot", "pot", lx(500), 350, 98, 82));
    g.stations.push(mkStation(p + "fry", "fryer", lx(650), 200, 98, 82));
    [100, 280, 450, 620].forEach((x, i) => g.stations.push(mkStation(p + "ct" + i, "counter", lx(x, 105), 560, 105, 76)));
    g.stations.push(mkStation(p + "plates", "plates", lx(720), 520, 82, 74));
    g.stations.push(mkStation(p + "serve", "serve", lx(30, 108), 200, 108, 92));
    g.stations.push(mkStation(p + "trash", "trash", lx(550), 720, 78, 74));
    g.walls.push({ x: lx(250, 180), y: 300, w: 180, h: 22, team }, { x: lx(450, 22), y: 400, w: 22, h: 180, team });
  } else {
    ings.forEach((ing, i) => g.stations.push(mkStation(p + "s_" + ing, "spawn", lx(i % 2 === 0 ? 40 : 680), 50 + Math.floor(i / 2) * 85, 80, 68, { ing })));
    g.stations.push(mkStation(p + "b1", "board", lx(400), 120, 98, 82));
    g.stations.push(mkStation(p + "b2", "board", lx(40), 600, 98, 82));
    g.stations.push(mkStation(p + "pan", "pan", lx(720), 350, 98, 82));
    g.stations.push(mkStation(p + "pot", "pot", lx(40), 350, 98, 82));
    g.stations.push(mkStation(p + "fry", "fryer", lx(400), 600, 98, 82));
    [120, 300, 520].forEach((x, i) => g.stations.push(mkStation(p + "ct" + i, "counter", lx(x, 105), 470, 105, 76)));
    g.stations.push(mkStation(p + "plates", "plates", lx(680), 520, 82, 74));
    g.stations.push(mkStation(p + "serve", "serve", lx(720, 108), 150, 108, 92));
    g.stations.push(mkStation(p + "trash", "trash", lx(480), 720, 78, 74));
    g.walls.push(
      { x: lx(200, 160), y: 250, w: 160, h: 22, team },
      { x: lx(500, 22), y: 280, w: 22, h: 200, team },
      { x: lx(350, 200), y: 450, w: 200, h: 22, team },
    );
  }
}

function buildKitchen(g, tutorial = false) {
  g.tutorial = tutorial;
  g.world = { w: tutorial ? 1100 : 2200, h: 920 };
  g.walls = [
    { x: 0, y: 0, w: g.world.w, h: 36 },
    { x: 0, y: 884, w: g.world.w, h: 36 },
    { x: 0, y: 0, w: 36, h: 920 },
    { x: g.world.w - 36, y: 0, w: 36, h: 920 },
  ];
  if (!tutorial) g.walls.push({ x: 1038, y: 36, w: 124, h: 848 });
  g.stations = [];
  g.teamRound = g.teamRound || [1, 1];
  if (tutorial) addTeamStations(g, 0, 48, false, 1);
  else {
    addTeamStations(g, 0, 48, false, g.teamRound[0]);
    addTeamStations(g, 1, 1162, true, g.teamRound[1]);
  }
  if (!g.ground) g.ground = [];
}

function rebuildTeamKitchen(g, team) {
  g.stations = g.stations.filter((s) => !String(s.id).startsWith(team + "_"));
  g.walls = g.walls.filter((w) => w.team !== team);
  const ox = team === 0 ? 48 : 1162;
  addTeamStations(g, team, ox, team === 1, g.teamRound[team]);
  for (const gr of g.ground || []) {
    if (gr.team === team) gr.item = null;
  }
  g.ground = (g.ground || []).filter((gr) => gr.team !== team || gr.item);
}

export function newKitchenGame() {
  return {
    started: false, counting: false, mode: "versus",
    world: { w: 2200, h: 920 },
    walls: [], stations: [], ground: [],
    orders: [[], []], scores: [0, 0], teamRound: [1, 1],
    timeLeft: K.matchTime, orderTimer: 3, result: null, matchMin: 2,
    tutorialStage: 0, tutorialComplete: false,
  };
}

export function newKitchenTutorialGame() {
  return { ...newKitchenGame(), mode: "tutorial", matchMin: 1, timeLeft: 9999, tutorialStage: 0, tutorialComplete: false };
}

export function kitchenClientState(g) {
  return {
    started: g.started, counting: !!g.counting, mode: g.mode || "versus",
    world: g.world, walls: g.walls,
    timeLeft: g.timeLeft, scores: g.scores, result: g.result,
    teamRound: g.teamRound || [1, 1],
    matchMin: g.matchMin || (g.mode === "tutorial" ? 1 : 2),
    tutorialStage: g.tutorialStage || 0,
    tutorialTotal: TUTORIAL_STAGES.length,
    tutorialComplete: !!g.tutorialComplete,
  };
}

function teamStations(g, team) {
  return g.stations.filter((s) => String(s.id).startsWith(team + "_"));
}

function nearestStation(g, p, types) {
  let best = null, bd = K.interactR;
  for (const s of g.stations) {
    if (!String(s.id).startsWith(p.team + "_")) continue;
    if (types && !types.includes(s.type)) continue;
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const d = dist(p, { x: cx, y: cy });
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function clampTeam(g, p) {
  const b = g.tutorial ? TUTORIAL_BOUNDS : TEAM_BOUNDS[p.team];
  if (!b) return;
  p.x = clamp(p.x, b.x0 + K.r, b.x1 - K.r);
}

function moveEntity(g, p, dx, dy, speed, dt) {
  const R = K.r, H = g.world.h;
  const mag = Math.hypot(dx, dy);
  if (mag > 1) { dx /= mag; dy /= mag; }
  if (mag > 0.05) p.face = Math.atan2(dy, dx);
  let nx = p.x + dx * speed * dt;
  let ny = clamp(p.y + dy * speed * dt, R + 40, H - R - 40);
  if (!g.walls.some((w) => hitRect(nx, p.y, R, w))) p.x = nx;
  if (!g.walls.some((w) => hitRect(p.x, ny, R, w))) p.y = ny;
  clampTeam(g, p);
}

function makeItem(type, extra = {}) {
  if (type === "plate") return { id: uid(), type: "plate", parts: [], burnt: false, onFire: false };
  if (type === "mix") return { id: uid(), type: "mix", parts: extra.parts || [], burnt: false, onFire: false };
  return { id: uid(), type, parts: null, burnt: false, onFire: false, prog: 0, ...extra };
}

function isPlate(it) { return it && it.type === "plate"; }
function isMix(it) { return it && it.type === "mix"; }
function isFood(it) { return it && !isPlate(it) && it.type !== "dirty_plate"; }

function itemParts(it) {
  if (isPlate(it) || isMix(it)) return [...(it.parts || [])];
  if (isFood(it)) return [it.type];
  return [];
}

function cookSpec(item) {
  if (CHOP[item.type]) return null;
  if (item.type === "chopped_onion") return COOK.onion;
  for (const k of Object.keys(COOK)) if (item.type === k) return COOK[k];
  return null;
}

function canPlaceOnCook(st, item) {
  const ck = cookSpec(item);
  if (!ck || st.type !== ck.station) return false;
  if (ck.need && item.type !== ck.need) return false;
  if (!ck.need && item.type !== Object.keys(COOK).find((k) => COOK[k] === ck)) return false;
  return true;
}

function plateMatchesRecipe(plate, rec) {
  if (!isPlate(plate) || !rec.parts) return false;
  const have = [...(plate.parts || [])].sort().join(",");
  const need = [...rec.parts].sort().join(",");
  return have === need;
}

function addPartsToPlate(plate, parts) {
  if (!isPlate(plate)) return false;
  for (const pt of parts) {
    if (plate.parts.length >= 5) return false;
    plate.parts.push(pt);
  }
  return true;
}

function mergeIntoMix(a, b) {
  return makeItem("mix", { parts: [...itemParts(a), ...itemParts(b)] });
}

function nearestGround(g, p) {
  let best = null, bd = K.interactR;
  for (const gr of g.ground || []) {
    if (gr.team !== p.team) continue;
    const d = dist(p, { x: gr.x, y: gr.y });
    if (d < bd) { bd = d; best = gr; }
  }
  return best;
}

function dropHeld(g, p) {
  if (!p.held) return;
  g.ground.push({
    id: uid(), x: p.x + Math.cos(p.face || 0) * 30, y: p.y + Math.sin(p.face || 0) * 30,
    item: p.held, team: p.team,
  });
  p.held = null;
}

function hintPlayer(ctx, p, msg) {
  if (!ctx?.send || !p?.ws) return;
  ctx.send(p.ws, { t: "kitchen-hint", msg });
}

function isMergeableFood(it) {
  return (isFood(it) || isMix(it)) && !it.burnt && it.type !== "burnt";
}

/** @returns {"clear_target"|"clear_held"|"new_mix"|null} */
function applyFoodMerge(held, target) {
  if (!held || !target || target.burnt || target.type === "burnt" || held.burnt || held.type === "burnt") return null;
  if (isPlate(held) && (isFood(target) || isMix(target))) {
    return addPartsToPlate(held, itemParts(target)) ? "clear_target" : null;
  }
  if ((isFood(held) || isMix(held)) && isPlate(target)) {
    return addPartsToPlate(target, itemParts(held)) ? "clear_held" : null;
  }
  if (isMergeableFood(held) && isMergeableFood(target)) return "new_mix";
  return null;
}

function tryMergeGround(g, p) {
  const gr = nearestGround(g, p);
  if (!gr || !p.held) return false;
  const m = applyFoodMerge(p.held, gr.item);
  if (m === "clear_target") { g.ground = g.ground.filter((x) => x !== gr); return true; }
  if (m === "clear_held") { p.held = null; return true; }
  if (m === "new_mix") {
    p.held = mergeIntoMix(p.held, gr.item);
    g.ground = g.ground.filter((x) => x !== gr);
    return true;
  }
  return false;
}

function applyStationMerge(p, st) {
  if (!p.held || !st.item) return false;
  const m = applyFoodMerge(p.held, st.item);
  if (m === "clear_target") { st.item = null; st.prog = 0; return true; }
  if (m === "clear_held") { p.held = null; return true; }
  if (m === "new_mix") {
    p.held = mergeIntoMix(p.held, st.item);
    st.item = null; st.prog = 0;
    return true;
  }
  return false;
}

function tryInteractTap(g, p, ctx) {
  const st = nearestStation(g, p);

  if (st?.type === "trash") {
    if (p.held) { p.held = null; return; }
    return;
  }

  if (st?.type === "plates" && !p.held) { p.held = makeItem("plate"); return; }
  if (st?.type === "spawn" && !p.held) { p.held = makeItem(st.ing); return; }

  if (p.held && st?.item && applyStationMerge(p, st)) return;

  if (st?.type === "serve") {
    if (!p.held) { hintPlayer(ctx, p, "🍽 접시를 들고 제출창에 와 주세요."); return; }
    if (!isPlate(p.held)) { hintPlayer(ctx, p, "🍽 접시 위에 음식을 담아 제출해야 합니다!"); return; }
    if (!p.held.parts?.length) { hintPlayer(ctx, p, "🍽 접시가 비어 있습니다."); return; }
    if (submitDish(g, p, p.held, ctx)) p.held = null;
    else hintPlayer(ctx, p, "❌ 주문과 맞지 않습니다.");
    return;
  }

  if (st?.type === "counter") {
    if (p.held && !st.item && !st.fire) { st.item = p.held; p.held = null; st.prog = 0; return; }
    if (!p.held && st.item && !st.fire) { pickupFromStation(p, st); return; }
    if (p.held && st.item) { hintPlayer(ctx, p, "🥡 재료는 합치거나, 테이블을 비운 뒤 올려 주세요."); return; }
  }

  if (!p.held && st?.item && !st.fire) { pickupFromStation(p, st); return; }

  if (p.held && st && !st.item && !st.fire && st.type !== "counter") {
    if (st.type === "board" && CHOP[p.held.type]) {
      st.item = p.held; p.held = null; st.prog = 0;
      return;
    }
    if (canPlaceOnCook(st, p.held)) {
      st.item = p.held; p.held = null; st.prog = 0;
      return;
    }
  }

  if (!p.held) {
    const gr = nearestGround(g, p);
    if (gr) { p.held = gr.item; g.ground = g.ground.filter((x) => x !== gr); return; }
  }

  if (p.held) {
    if (tryMergeGround(g, p)) return;
    dropHeld(g, p);
  }
}

function pickupFromStation(p, st) {
  if (!st.item || st.fire) return false;
  p.held = st.item;
  st.item = null;
  st.prog = 0;
  return true;
}

function tryInteractHold(g, p, dt) {
  const st = nearestStation(g, p);
  if (!st) return;

  if (st.type === "board" && !p.held && st.item && CHOP[st.item.type]) {
    st.prog = (st.prog || 0) + dt;
    if (st.prog >= K.chopTime) {
      st.item = makeItem(CHOP[st.item.type]);
      st.prog = 0;
    }
  }
}

function checkRoundAdvance(g, team, ctx) {
  if (g.tutorial) return;
  const tr = g.teamRound[team] || 1;
  if (tr >= 4) return;
  const need = ROUND_THRESHOLDS[tr - 1];
  if ((g.scores[team] || 0) < need) return;
  g.teamRound[team] = tr + 1;
  rebuildTeamKitchen(g, team);
  if (ctx?.room && ctx?.send) {
    for (const pl of ctx.room.players.values()) {
      if (pl.team !== team) continue;
      ctx.send(pl.ws, { t: "kitchen-hint", msg: `🎉 라운드 ${g.teamRound[team]}! 새 재료·조리기구·레시피가 추가됐습니다!` });
    }
  }
}

function calcSubmitScore(g, p, rec, order) {
  const diffBonus = rec.difficulty * 12;
  let pts = rec.pts + diffBonus;
  let timeBonus = 0;
  if (!g.tutorial) {
    if (order.timeLeft > rec.limit * 0.5) {
      timeBonus = Math.round((order.timeLeft / rec.limit) * 28);
      pts += timeBonus;
    } else if (order.timeLeft <= 0) pts = Math.max(12, Math.round(pts * 0.4));
  }
  g.combo = g.combo || [{ n: 0, t: 0 }, { n: 0, t: 0 }];
  const now = Date.now();
  const c = g.combo[p.team] || { n: 0, t: 0 };
  let comboN = 1, comboBonus = 0;
  if (!g.tutorial && c.t > 0 && (now - c.t) <= K.comboWindow * 1000) {
    comboN = c.n + 1;
    comboBonus = K.comboBonus * comboN + rec.difficulty * 3;
    pts += comboBonus;
  }
  c.n = comboN; c.t = now;
  g.combo[p.team] = c;
  return { pts, diffBonus, timeBonus, comboBonus, comboN, difficulty: rec.difficulty };
}

function submitDish(g, p, plate, ctx) {
  const orders = g.orders[p.team] || [];
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    const rec = RECIPES[o.key];
    if (!rec || !plateMatchesRecipe(plate, rec)) continue;
    const sc = calcSubmitScore(g, p, rec, o);
    g.scores[p.team] = (g.scores[p.team] || 0) + sc.pts;
    orders.splice(i, 1);
    p.deliveries = (p.deliveries || 0) + 1;
    checkRoundAdvance(g, p.team, ctx);
    if (ctx?.send && ctx?.room) {
      for (const pl of ctx.room.players.values()) {
        if (pl.team !== p.team) continue;
        ctx.send(pl.ws, {
          t: "kitchen-score", pts: sc.pts, name: rec.name, combo: sc.comboN,
          diff: sc.difficulty, diffBonus: sc.diffBonus, timeBonus: sc.timeBonus, comboBonus: sc.comboBonus,
        });
      }
    }
    if (g.tutorial) advanceTutorial(g, p, ctx);
    return true;
  }
  return false;
}

function setTutorialOrder(g, stageIdx) {
  const key = TUTORIAL_STAGES[stageIdx];
  const rec = RECIPES[key];
  g.orders[0] = [{
    id: uid(), key, timeLeft: 9999, name: rec.name,
    parts: rec.parts, how: rec.how, howShort: rec.howShort, difficulty: rec.difficulty,
    stage: stageIdx + 1,
  }];
  g.tutorialPrompt = `단계 ${stageIdx + 1}/${TUTORIAL_STAGES.length} · ${rec.name}`;
  g.tutorialStage = stageIdx;
}

function advanceTutorial(g, p, ctx) {
  const next = (g.tutorialStage || 0) + 1;
  if (next >= TUTORIAL_STAGES.length) { g.tutorialComplete = true; hintPlayer(ctx, p, "🎉 튜토리얼 클리어!"); return; }
  setTutorialOrder(g, next);
  hintPlayer(ctx, p, `✨ 다음: ${RECIPES[TUTORIAL_STAGES[next]].name}`);
}

function tickStation(g, st, dt) {
  if (!st.item || st.type === "board") return;
  const ck = cookSpec(st.item);
  if (!ck || st.type !== ck.station) return;
  if (ck.need && st.item.type !== ck.need) return;
  if (!ck.need && st.item.type !== Object.keys(COOK).find((k) => COOK[k] === ck)) return;
  st.prog = (st.prog || 0) + dt;
  st.cookLabel = ck.label;
  if (st.prog >= ck.time && st.item.type !== ck.out) {
    st.item = makeItem(ck.out);
    st.prog = ck.time;
  }
}

function recipesForTeam(g, team) {
  const r = g.teamRound?.[team] || 1;
  return Object.entries(RECIPES).filter(([, rec]) => (rec.roundMin || 1) <= r).map(([k]) => k);
}

function addOrder(g, team) {
  const keys = recipesForTeam(g, team);
  if (!keys.length) return;
  const key = keys[Math.floor(Math.random() * keys.length)];
  const rec = RECIPES[key];
  g.orders[team].push({
    id: uid(), key, timeLeft: rec.limit, name: rec.name,
    parts: rec.parts, how: rec.how, howShort: rec.howShort, difficulty: rec.difficulty,
  });
}

function tickOrders(g, dt) {
  if (g.tutorial) return;
  g.orderTimer = (g.orderTimer || 0) - dt;
  if (g.orderTimer <= 0) {
    for (const t of [0, 1]) {
      if (g.orders[t].length < K.maxOrders) addOrder(g, t);
    }
    g.orderTimer = K.orderEvery + Math.random() * 4;
  }
  for (const t of [0, 1]) {
    for (const o of [...g.orders[t]]) {
      o.timeLeft -= dt;
      if (o.timeLeft <= -12) {
        g.scores[t] = Math.max(0, (g.scores[t] || 0) - 15);
        g.orders[t] = g.orders[t].filter((x) => x !== o);
      }
    }
  }
}

function tryDash(p, now) {
  p.dashUntil = now + K.dashDur * 1000;
  p.dashVx = Math.cos(p.face) * K.dashSpd;
  p.dashVy = Math.sin(p.face) * K.dashSpd;
}

function packItem(it, st) {
  if (!it) return null;
  const base = {
    t: it.type,
    b: !!it.burnt,
    f: !!it.onFire,
    parts: (isPlate(it) || isMix(it)) ? [...(it.parts || [])] : undefined,
  };
  if (st?.type === "board" && CHOP[it.type]) {
    base.p = Math.min(1, (st.prog || 0) / K.chopTime);
    base.phase = "chop";
  } else {
    const ck = cookSpec(it);
    if (ck && st) {
      base.p = Math.min(1, (st.prog || 0) / ck.time);
      base.phase = st.prog >= ck.time ? "done" : ck.label;
    }
  }
  return base;
}

function packPlayer(p) {
  const h = p.held;
  return {
    i: p.id, n: p.name, tm: p.team,
    x: Math.round(p.x), y: Math.round(p.y),
    f: Math.round((p.face || 0) * 100) / 100,
    h: h ? {
      t: h.type,
      parts: (isPlate(h) || isMix(h)) ? [...(h.parts || [])] : undefined,
      b: !!h.burnt, f: !!h.onFire,
    } : null,
    dcd: 0,
  };
}

function tickCombo(g) {
  if (g.tutorial) return;
  const now = Date.now();
  g.combo = g.combo || [{ n: 0, t: 0 }, { n: 0, t: 0 }];
  for (let t = 0; t < 2; t++) {
    const c = g.combo[t];
    if (c.t > 0 && now - c.t > K.comboWindow * 1000) g.combo[t] = { n: 0, t: 0 };
  }
}

function packState(g, ps) {
  return {
    mode: g.mode || "versus",
    walls: g.walls,
    stations: g.stations.map((s) => ({
      id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h,
      ing: s.ing, fire: !!s.fire,
      item: packItem(s.item, s),
    })),
    orders: g.orders,
    scores: g.scores,
    teamRound: g.teamRound || [1, 1],
    combo: (g.combo || [{ n: 0 }, { n: 0 }]).map((c) => c.n || 0),
    tl: Math.max(0, g.timeLeft),
    tutStage: g.tutorialStage || 0,
    tutTotal: TUTORIAL_STAGES.length,
    tutPrompt: g.tutorialPrompt || "",
    tutDone: !!g.tutorialComplete,
    ground: (g.ground || []).map((gr) => ({
      x: Math.round(gr.x), y: Math.round(gr.y),
      t: gr.item.type, parts: gr.item.parts, team: gr.team,
    })),
    ps: ps.map(packPlayer),
  };
}

function initKitchenPlayers(room, g, tutorial = false) {
  const ps = [...room.players.values()];
  ps.forEach((p, i) => {
    p.team = tutorial ? 0 : i % 2;
    p.held = null;
    p.cin = { mvx: 0, mvy: 0, interact: false, dashTap: false };
    p.deliveries = 0;
    const b = tutorial ? TUTORIAL_BOUNDS : TEAM_BOUNDS[p.team];
    p.x = b.x0 + 380 + (i % 3) * 55;
    p.y = 610 + (Math.floor(i / 3) % 2) * 40;
    p.face = tutorial ? 0 : (p.team === 0 ? 0 : Math.PI);
    p.dashUntil = 0;
    p.ready = false;
  });
}

export function startKitchen(room) {
  const g = room.game;
  g.teamRound = [1, 1];
  buildKitchen(g, false);
  g.orders = [[], []];
  g.scores = [0, 0];
  g.timeLeft = K.matchTime;
  g.orderTimer = 2;
  g.result = null;
  g.ground = [];
  g.combo = [{ n: 0, t: 0 }, { n: 0, t: 0 }];
  initKitchenPlayers(room, g, false);
  for (let i = 0; i < 2; i++) while (g.orders[i].length < 2) addOrder(g, i);
  g.started = true;
}

export function startKitchenTutorial(room) {
  const g = room.game;
  buildKitchen(g, true);
  g.orders = [[]]; g.scores = [0]; g.timeLeft = 9999;
  g.ground = []; g.tutorialStage = 0; g.tutorialComplete = false;
  initKitchenPlayers(room, g, true);
  setTutorialOrder(g, 0);
  g.started = true;
}

export function stopKitchen(room) {
  room.game.started = false;
  if (room.loop) { clearInterval(room.loop); room.loop = null; }
}

export function endKitchen(room, ctx, reason) {
  const g = room.game;
  g.started = false;
  if (room.loop) { clearInterval(room.loop); room.loop = null; }
  const s0 = g.scores[0] || 0, s1 = g.scores[1] || 0;
  let winner = "무승부", winTeam = null;
  if (g.tutorial && g.tutorialComplete) winner = "튜토리얼 클리어";
  else if (s0 > s1) { winner = "A팀"; winTeam = 0; }
  else if (s1 > s0) { winner = "B팀"; winTeam = 1; }
  g.result = { winner, scores: g.scores, reason, tutorial: !!g.tutorial };
  if (reason !== "stop") {
    const gameKey = g.tutorial ? "kitchen-tut" : "kitchen";
    for (const p of room.players.values()) {
      if (!p.account) continue;
      ctx.award(p.account, gameKey, 1 + (p.deliveries || 0) * 2 + (winTeam != null && p.team === winTeam ? 5 : 0), winTeam != null && p.team === winTeam, { deliveries: p.deliveries || 0 });
    }
  }
  ctx.broadcast(room, { t: "kitchen-end", winner, scores: g.scores, reason, tutorial: !!g.tutorial });
  ctx.pushState(room);
  ctx.scheduleRoomsBroadcast();
}

export function kitchenTick(room, ctx) {
  const g = room.game;
  if (!g.started) return;
  const dt = K.dt, now = Date.now();
  if (!g.tutorial) g.timeLeft -= dt;
  const ps = [...room.players.values()];
  const actx = { ...ctx, room };

  for (const p of ps) {
    const inp = p.cin || {};
    if ((p.dashUntil || 0) > now) {
      moveEntity(g, p, p.dashVx / K.dashSpd, p.dashVy / K.dashSpd, K.dashSpd, dt);
    } else {
      moveEntity(g, p, inp.mvx, inp.mvy, K.speed, dt);
      if (inp.dashTap) tryDash(p, now);
    }
    if (inp.interactTap) tryInteractTap(g, p, actx);
    if (inp.interact) tryInteractHold(g, p, dt);
    inp.interactTap = false;
    inp.dashTap = false;
  }

  for (const st of g.stations) tickStation(g, st, dt);
  tickOrders(g, dt);
  tickCombo(g);

  if (g.tutorial && g.tutorialComplete) { endKitchen(room, ctx, "tutorial"); return; }
  if (!g.tutorial && g.timeLeft <= 0) { endKitchen(room, ctx, "time"); return; }
  ctx.broadcast(room, { t: "kitchen", ...packState(g, ps) });
}

function handleKitchenStart(room, player, msg, ctx, tutorial) {
  const { isHost, send, pushState, startCountdown } = ctx;
  if (!isHost) return;
  const n = room.players.size;
  const min = tutorial ? 1 : 2, max = tutorial ? 4 : 8;
  if (n < min) { send(player.ws, { t: "error", msg: tutorial ? "튜토리얼 1명~" : "최소 2명 필요" }); return; }
  if (n > max) { send(player.ws, { t: "error", msg: "인원 초과" }); return; }
  pushState(room);
  startCountdown(room, () => {
    if (tutorial) startKitchenTutorial(room);
    else startKitchen(room);
    pushState(room);
    ctx.scheduleRoomsBroadcast();
    if (room.loop) clearInterval(room.loop);
    room.loop = setInterval(() => kitchenTick(room, ctx), K.dt * 1000);
  });
}

export function handleKitchenAction(room, player, msg, ctx) {
  handleKitchenActionCore(room, player, msg, ctx, false);
}

export function handleKitchenTutorialAction(room, player, msg, ctx) {
  handleKitchenActionCore(room, player, msg, ctx, true);
}

function handleKitchenActionCore(room, player, msg, ctx, tutorial) {
  const { isHost, send, pushState, startCountdown } = ctx;
  if (msg.a === "start" && isHost) handleKitchenStart(room, player, msg, ctx, tutorial);
  else if (msg.a === "ready") { player.ready = !!msg.ready; pushState(room); }
  else if (msg.a === "stop" && isHost) { ctx.cancelCountdown(room); stopKitchen(room); endKitchen(room, ctx, "stop"); }
  else if (msg.a === "input") {
    const prev = player.cin || {};
    player.cin = {
      mvx: clamp(Number(msg.mvx) || 0, -1, 1),
      mvy: clamp(Number(msg.mvy) || 0, -1, 1),
      interact: !!msg.interact,
      interactTap: !!msg.interactTap || (!!msg.interact && !prev.interact),
      dashTap: !!msg.dashTap,
    };
  }
}

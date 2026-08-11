/**
 * Mesh-distributed host engine for minigames.
 * World rules remain host-simulated; inputs arrive via mesh poses and
 * tick snapshots go out on unreliable + relay fan-out (see peer-bus / minihub).
 *
 * window.GWMgEngine = { createHostRoom, GAME_TYPES, GAME_LABELS }
 *
 * createHostRoom({ code, hostPlayer, gameType, roomName, password, onSend(peerIdOrNull, msg), onBroadcast(msg) })
 *   -> { handleMessage(fromId, msg), addPlayer(peerId, name, opts), removePlayer(peerId), destroy(), getState() }
 */
(function (global) {
  "use strict";

  // ============================================================================================
  // 공통 유틸
  // ============================================================================================
  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }
  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function rectOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  // 원(circle) vs 사각형 충돌 — 아레나/경찰과 도둑 이동 판정에 사용
  function hitRect(px, py, pr, r) {
    const cx = clamp(px, r.x, r.x + r.w), cy = clamp(py, r.y, r.y + r.h);
    return Math.hypot(px - cx, py - cy) < pr;
  }
  function inAnyRect(px, py, rects) {
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h) return true;
    }
    return false;
  }
  function sanitizeRoomName(raw, fallback) {
    const s = String(raw || "").trim().slice(0, 20);
    return s || fallback;
  }
  // 간단한 문자열 해시(FNV-1a) — 서버의 sha256 대신 사용 (방 비밀번호 등)
  function hashPw(p) {
    const s = String(p || "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8);
  }

  const HOST_KEY = "__host__";
  const COLORS = [
    "#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899",
    "#06b6d4", "#f97316", "#14b8a6", "#8b5cf6", "#84cc16", "#f43f5e",
  ];

  const GAME_TYPES = ["arena", "cops"];
  const GAME_LABELS = {
    arena: "아레나", cops: "경찰과 도둑",
  };

  // ============================================================================================
  // 랭킹 — window.GWRanking(localStorage)에 위임 (원본의 mg-data.json 계정 시스템 대체)
  // ============================================================================================
  function award(accName, game, pts, win, extra) {
    if (!accName || !game) return;
    try {
      if (global.GWRanking && typeof global.GWRanking.award === "function") {
        global.GWRanking.award(accName, game, pts || 0, !!win, extra || null);
      }
    } catch (e) { /* ignore */ }
  }
  function getRankings() {
    try {
      return (global.GWRanking && typeof global.GWRanking.allRankings === "function")
        ? global.GWRanking.allRankings()
        : {};
    } catch (e) { return {}; }
  }

  // ============================================================================================
  // 유물부수기 커스텀 맵 — 세션 메모리 저장(파일 IO 없음). listRelicMaps/loadRelicMap/saveRelicMap만 필요.
  // ============================================================================================
  const relicMapStore = {};
  function listRelicMaps() {
    return Object.keys(relicMapStore).map((id) => ({ id: relicMapStore[id].id, name: relicMapStore[id].name }));
  }
  function loadRelicMap(id) {
    return relicMapStore[id] || null;
  }
  function saveRelicMap(name, data) {
    const id = "m" + uid();
    const rec = {
      id, name: String(name || "맵").slice(0, 20),
      world: { w: data.world.w, h: data.world.h },
      walls: (data.walls || []).slice(0, 400).map((w) => ({ x: Math.round(+w.x), y: Math.round(+w.y), w: Math.round(+w.w), h: Math.round(+w.h) })),
      jail: data.jail ? { x: data.jail.x, y: data.jail.y, w: data.jail.w, h: data.jail.h } : null,
    };
    relicMapStore[id] = rec;
    return rec;
  }
  // mgSettings.js 대체 — 컨트롤 레이아웃 커스터마이징은 이 엔진에서 다루지 않음(요청대로 빈 값 반환)
  function getControlLayouts() {
    return {};
  }

  // ============================================================================================
  // ============================  최고의 주방장 (kitchen.js 이식)  =============================
  // ============================================================================================
  const K = {
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

  const ROUND_THRESHOLDS = [150, 400, 800, 1300];

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
    for (const key of Object.keys(RAW_RECIPES)) {
      const r = RAW_RECIPES[key];
      const diff = calcDifficulty(r.parts);
      out[key] = Object.assign({}, r, {
        difficulty: diff,
        how: [
          { emoji: "📦", text: "재료함에서 꺼내기" },
          { emoji: "🔪", text: r.parts.some((p) => p.startsWith("chopped")) ? "도마에 올린 뒤 홀드로 손질" : "손질 (필요 시)" },
          { emoji: "🍳", text: r.parts.some((p) => p.startsWith("cooked") || p.includes("fried")) ? "조리기구 사용" : "조리 (필요 시)" },
          { emoji: "🍽", text: "접시에 담아 제출" },
        ],
      });
    }
    return out;
  }

  const RECIPES = buildRecipes();
  const TUTORIAL_STAGES = ["steak", "fries", "salad", "soup", "burger"];

  const ITEM_META = {
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

  const STATION_NAMES = {
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

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  // 주방 전용 히트박스(사각형 확장) — 아레나/경찰과 도둑의 원형 hitRect와 다름
  function hitRectBox(px, py, pr, r) {
    return px + pr > r.x && px - pr < r.x + r.w && py + pr > r.y && py - pr < r.y + r.h;
  }

  function mkStation(id, type, x, y, w, h, extra) {
    return Object.assign({ id, type, x, y, w: w || 88, h: h || 68, item: null, prog: 0, fire: false }, extra || {});
  }

  /** 라운드별 주방 배치 — 라운드↑ = 이동거리↑ */
  function addTeamStations(g, team, ox, flip, round) {
    const p = team + "_";
    const Z = 990;
    const lx = (x, w) => (flip ? ox + Z - x - (w || 80) : ox + x);
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

  function buildKitchen(g, tutorial) {
    g.tutorial = !!tutorial;
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

  function newKitchenGame() {
    return {
      started: false, counting: false, mode: "versus",
      world: { w: 2200, h: 920 },
      walls: [], stations: [], ground: [],
      orders: [[], []], scores: [0, 0], teamRound: [1, 1],
      timeLeft: K.matchTime, orderTimer: 3, result: null, matchMin: 2,
      tutorialStage: 0, tutorialComplete: false,
    };
  }

  function newKitchenTutorialGame() {
    return Object.assign(newKitchenGame(), { mode: "tutorial", matchMin: 1, timeLeft: 9999, tutorialStage: 0, tutorialComplete: false });
  }

  function kitchenClientState(g) {
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
    const nx = p.x + dx * speed * dt;
    const ny = clamp(p.y + dy * speed * dt, R + 40, H - R - 40);
    if (!g.walls.some((w) => hitRectBox(nx, p.y, R, w))) p.x = nx;
    if (!g.walls.some((w) => hitRectBox(p.x, ny, R, w))) p.y = ny;
    clampTeam(g, p);
  }

  function makeItem(type, extra) {
    if (type === "plate") return { id: uid(), type: "plate", parts: [], burnt: false, onFire: false };
    if (type === "mix") return { id: uid(), type: "mix", parts: (extra && extra.parts) || [], burnt: false, onFire: false };
    return Object.assign({ id: uid(), type, parts: null, burnt: false, onFire: false, prog: 0 }, extra || {});
  }

  function isPlate(it) { return it && it.type === "plate"; }
  function isMix(it) { return it && it.type === "mix"; }
  function isFood(it) { return it && !isPlate(it) && it.type !== "dirty_plate"; }

  function itemParts(it) {
    if (isPlate(it) || isMix(it)) return (it.parts || []).slice();
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
    const have = (plate.parts || []).slice().sort().join(",");
    const need = rec.parts.slice().sort().join(",");
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
    return makeItem("mix", { parts: itemParts(a).concat(itemParts(b)) });
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
    if (!ctx || !ctx.send || !p) return;
    ctx.send(p, { t: "kitchen-hint", msg });
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

    if (st && st.type === "trash") {
      if (p.held) { p.held = null; return; }
      return;
    }

    if (st && st.type === "plates" && !p.held) { p.held = makeItem("plate"); return; }
    if (st && st.type === "spawn" && !p.held) { p.held = makeItem(st.ing); return; }

    if (p.held && st && st.item && applyStationMerge(p, st)) return;

    if (st && st.type === "serve") {
      if (!p.held) { hintPlayer(ctx, p, "🍽 접시를 들고 제출창에 와 주세요."); return; }
      if (!isPlate(p.held)) { hintPlayer(ctx, p, "🍽 접시 위에 음식을 담아 제출해야 합니다!"); return; }
      if (!p.held.parts || !p.held.parts.length) { hintPlayer(ctx, p, "🍽 접시가 비어 있습니다."); return; }
      if (submitDish(g, p, p.held, ctx)) p.held = null;
      else hintPlayer(ctx, p, "❌ 주문과 맞지 않습니다.");
      return;
    }

    if (st && st.type === "counter") {
      if (p.held && !st.item && !st.fire) { st.item = p.held; p.held = null; st.prog = 0; return; }
      if (!p.held && st.item && !st.fire) { pickupFromStation(p, st); return; }
      if (p.held && st.item) { hintPlayer(ctx, p, "🥡 재료는 합치거나, 테이블을 비운 뒤 올려 주세요."); return; }
    }

    if (!p.held && st && st.item && !st.fire) { pickupFromStation(p, st); return; }

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
    if (ctx && ctx.room && ctx.send) {
      for (const pl of ctx.room.players.values()) {
        if (pl.team !== team) continue;
        ctx.send(pl, { t: "kitchen-hint", msg: "🎉 라운드 " + g.teamRound[team] + "! 새 재료·조리기구·레시피가 추가됐습니다!" });
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
      if (ctx && ctx.send && ctx.room) {
        for (const pl of ctx.room.players.values()) {
          if (pl.team !== p.team) continue;
          ctx.send(pl, {
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
    g.tutorialPrompt = "단계 " + (stageIdx + 1) + "/" + TUTORIAL_STAGES.length + " · " + rec.name;
    g.tutorialStage = stageIdx;
  }

  function advanceTutorial(g, p, ctx) {
    const next = (g.tutorialStage || 0) + 1;
    if (next >= TUTORIAL_STAGES.length) { g.tutorialComplete = true; hintPlayer(ctx, p, "🎉 튜토리얼 클리어!"); return; }
    setTutorialOrder(g, next);
    hintPlayer(ctx, p, "✨ 다음: " + RECIPES[TUTORIAL_STAGES[next]].name);
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
    const r = (g.teamRound && g.teamRound[team]) || 1;
    return Object.keys(RECIPES).filter((k) => (RECIPES[k].roundMin || 1) <= r);
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
      for (const o of g.orders[t].slice()) {
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
      parts: (isPlate(it) || isMix(it)) ? (it.parts || []).slice() : undefined,
    };
    if (st && st.type === "board" && CHOP[it.type]) {
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
        parts: (isPlate(h) || isMix(h)) ? (h.parts || []).slice() : undefined,
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

  function initKitchenPlayers(room, g, tutorial) {
    const ps = Array.from(room.players.values());
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

  function startKitchen(room) {
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

  function startKitchenTutorial(room) {
    const g = room.game;
    buildKitchen(g, true);
    g.orders = [[]]; g.scores = [0]; g.timeLeft = 9999;
    g.ground = []; g.tutorialStage = 0; g.tutorialComplete = false;
    initKitchenPlayers(room, g, true);
    setTutorialOrder(g, 0);
    g.started = true;
  }

  function stopKitchen(room) {
    room.game.started = false;
    if (room.loop) { clearInterval(room.loop); room.loop = null; }
  }

  function endKitchen(room, ctx, reason) {
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
    pushRankings(room);
  }

  function kitchenTick(room, ctx) {
    const g = room.game;
    if (!g.started) return;
    const dt = K.dt, now = Date.now();
    if (!g.tutorial) g.timeLeft -= dt;
    const ps = Array.from(room.players.values());
    const actx = Object.assign({}, ctx, { room });

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
    ctx.broadcast(room, Object.assign({ t: "kitchen" }, packState(g, ps)));
  }

  function handleKitchenStart(room, player, msg, ctx, tutorial) {
    const isHost = ctx.isHost, send = ctx.send, pushState = ctx.pushState, startCountdown = ctx.startCountdown;
    if (!isHost) return;
    const n = room.players.size;
    const min = tutorial ? 1 : 2, max = tutorial ? 4 : 8;
    if (n < min) { send(player, { t: "error", msg: tutorial ? "튜토리얼 1명~" : "최소 2명 필요" }); return; }
    if (n > max) { send(player, { t: "error", msg: "인원 초과" }); return; }
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

  function handleKitchenAction(room, player, msg, ctx) {
    handleKitchenActionCore(room, player, msg, ctx, false);
  }

  function handleKitchenTutorialAction(room, player, msg, ctx) {
    handleKitchenActionCore(room, player, msg, ctx, true);
  }

  function handleKitchenActionCore(room, player, msg, ctx, tutorial) {
    const isHost = ctx.isHost, pushState = ctx.pushState;
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

  // ============================================================================================
  // =====================  아레나 / 경찰과 도둑 / 파티게임 (minigames.js 이식)  =================
  // ============================================================================================

  function playersPublic(room) {
    return Array.from(room.players.values()).map((p) => ({
      id: p.id, name: p.name, isHost: p.id === room.hostId, color: p.color,
      score: p.score || 0, alive: p.alive !== false, role: p.role || null,
      ready: !!p.ready,
      team: p.team != null ? p.team : (p.chosenTeam != null ? p.chosenTeam : null),
    }));
  }

  // player.room 백레퍼런스를 이용해 host/원격 피어에 알맞게 라우팅한다.
  function send(player, obj) {
    if (!player || !player.room) return;
    const pid = player.peerId === HOST_KEY ? null : player.peerId;
    try { player.room._onSend(pid, obj); } catch (e) { /* ignore */ }
  }
  function broadcast(room, obj) {
    try { room._onBroadcast(obj); } catch (e) { /* ignore */ }
  }
  // 원본은 여러 방의 로비 목록을 디바운스 브로드캐스트했지만, 이 엔진은 방 1개만 다룬다.
  function scheduleRoomsBroadcast() { /* no-op: 단일 방 구조 */ }
  function pushRankings(room) {
    broadcast(room, { t: "rankings", rankings: getRankings() });
  }

  function cancelCountdown(room) {
    if (room.countTimer) { clearInterval(room.countTimer); room.countTimer = null; }
    if (room.game) room.game.counting = false;
  }
  function canChangeGameType(room) {
    const g = room.game;
    if (!g || room.countTimer || g.counting) return false;
    if (room.gameType === "roulette" && g.spinning) return false;
    if (room.gameType === "arena" && g.started) return false;
    if (room.gameType === "cops" && g.started) return false;
    if (room.gameType === "kitchen" && g.started) return false;
    if (room.gameType === "kitchen-tut" && g.started) return false;
    return true;
  }
  function resetPlayersForGameSwitch(room) {
    for (const p of room.players.values()) {
      p.ready = false;
      p.alive = true;
      delete p.team; delete p.chosenTeam; delete p.role; delete p.crole;
      delete p.input; delete p.cin; delete p.x; delete p.y; delete p.face;
      delete p.hp; delete p.dcd; delete p.caught;
      p.kills = 0; p.deaths = 0; p.score = 0;
    }
  }
  function changeGameType(room, newType) {
    if (GAME_TYPES.indexOf(newType) < 0) return false;
    if (newType === room.gameType) return true;
    if (!canChangeGameType(room)) return false;
    cancelCountdown(room);
    broadcast(room, { t: "count", n: 0 });
    if (room.loop) { clearInterval(room.loop); room.loop = null; }
    room.gameType = newType;
    room.game = newGame(newType);
    resetPlayersForGameSwitch(room);
    pushState(room);
    scheduleRoomsBroadcast();
    return true;
  }
  function startCountdown(room, run) {
    const g = room.game;
    if (!g || g.started || room.countTimer) return;
    g.counting = true;
    let n = 5;
    broadcast(room, { t: "count", n });
    pushState(room);
    room.countTimer = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(room.countTimer); room.countTimer = null;
        g.counting = false;
        broadcast(room, { t: "count", n: 0 });
        run(room);
      } else {
        broadcast(room, { t: "count", n });
      }
    }, 1000);
  }

  function gameStateForClient(room) {
    const g = room.game;
    if (room.gameType === "roulette") {
      return { options: g.options, spinning: g.spinning, lastResult: g.lastResult };
    }
    if (room.gameType === "ladder") {
      return { names: g.names, prizes: g.prizes, rungs: g.rungs, cols: g.cols, rows: g.rows, ready: g.ready };
    }
    if (room.gameType === "draw") {
      return {
        labels: g.labels,
        total: g.total,
        drawn: g.drawn,
        remaining: g.total - Object.keys(g.drawn).length,
        finished: Object.keys(g.drawn).length >= g.total,
      };
    }
    if (room.gameType === "arena") {
      return {
        mode: "team", teamCount: g.teamCount, started: g.started, counting: !!g.counting, world: g.world,
        walls: g.walls, pushables: g.pushables, timeLeft: g.timeLeft, winner: g.winner,
      };
    }
    if (room.gameType === "cops") {
      return {
        mode: g.mode, started: g.started, counting: !!g.counting, world: g.world, jail: g.jail,
        policeCount: g.policeCount, botCount: g.botCount, safeCount: g.safeCount,
        teamMode: g.teamMode, teamsCount: g.teamsCount, relicTime: g.relicTime,
        thiefVision: g.thiefVision, policeVision: g.policeVision,
        thiefDashCd: g.thiefDashCd, policeDashCd: g.policeDashCd,
        mapId: g.mapId || "random", mapName: g.mapName || "",
        walls: g.walls || [],
        hideouts: (g.hideouts || []).map((h) => ({ id: h.id, outer: h.outer, cavity: h.cavity, entrance: h.entrance, arrow: h.arrow ? 1 : 0 })),
        timeLeft: g.timeLeft, result: g.result,
      };
    }
    if (room.gameType === "kitchen" || room.gameType === "kitchen-tut") return kitchenClientState(g);
    return {};
  }

  function pushState(room) {
    broadcast(room, {
      t: "state", code: room.code, gameType: room.gameType, roomName: room.roomName || "",
      players: playersPublic(room), game: gameStateForClient(room),
    });
  }

  function newGame(gameType) {
    if (gameType === "roulette") return { options: ["1등", "2등", "3등", "꽝"], spinning: false, lastResult: null };
    if (gameType === "ladder") return { names: [], prizes: [], rungs: [], cols: 0, rows: 0, ready: false };
    if (gameType === "draw") return { labels: [], shuffled: [], total: 0, drawn: {} };
    if (gameType === "arena") {
      const g = {
        mode: "team", teamCount: 2, started: false, world: { w: 1760, h: 1180 },
        bullets: [], items: [], effects: [], walls: [], pushables: [], props: [], nexus: [],
        wallsCustom: false, timeLeft: 0, winner: null,
      };
      buildMap(g);
      return g;
    }
    if (gameType === "cops") return {
      mode: "relic", started: false, world: { w: 1800, h: 1200 },
      policeCount: 1, botCount: 10, safeCount: 4, teamMode: "team", teamsCount: 2, relicTime: 5,
      thiefVision: 230, policeVision: 350,
      thiefDashCd: 10, policeDashCd: 6,
      mapId: "random", mapName: "",
      timeLeft: 0, bots: [], safes: [], walls: [], jail: { x: 400, y: 290, w: 100, h: 60 }, result: null,
    };
    if (gameType === "kitchen") return newKitchenGame();
    if (gameType === "kitchen-tut") return newKitchenTutorialGame();
    return {};
  }

  const kitchenCtx = () => ({
    broadcast, pushState, scheduleRoomsBroadcast, award, send, cancelCountdown, startCountdown,
  });

  // ---------------------------------------------------------------- 게임별 액션
  function handleAction(room, player, msg) {
    const isHost = player.id === room.hostId;
    const g = room.game;

    if (msg.a === "setgame" && isHost) {
      const gt = String(msg.gameType || "");
      if (!changeGameType(room, gt)) {
        send(player, { t: "error", msg: "지금은 게임을 변경할 수 없습니다. 진행·카운트다운 중이면 먼저 정지하세요." });
      }
      return;
    }

    // -------- 룰렛
    if (room.gameType === "roulette") {
      if (msg.a === "set" && isHost && Array.isArray(msg.options)) {
        g.options = msg.options.map((s) => String(s).slice(0, 24)).filter((s) => s.trim()).slice(0, 20);
        if (g.options.length < 2) g.options = ["1", "2"];
        g.lastResult = null;
        pushState(room);
      } else if (msg.a === "spin" && isHost && !g.spinning && g.options.length >= 2) {
        const index = Math.floor(Math.random() * g.options.length);
        const seed = Math.floor(Math.random() * 1e9);
        const duration = 4200;
        g.spinning = true;
        g.lastResult = null;
        broadcast(room, { t: "event", name: "spin", index, seed, duration, count: g.options.length });
        setTimeout(() => {
          g.spinning = false;
          g.lastResult = { index, option: g.options[index] };
          pushState(room);
        }, duration + 200);
      }
      return;
    }

    // -------- 사다리타기
    if (room.gameType === "ladder") {
      if (msg.a === "set" && isHost) {
        const names = (msg.names || []).map((s) => String(s).slice(0, 16)).filter((s) => s.trim());
        const prizes = (msg.prizes || []).map((s) => String(s).slice(0, 20)).filter((s) => s.trim());
        const n = Math.min(names.length, prizes.length);
        if (n < 2 || n > 12) { send(player, { t: "error", msg: "참가자와 결과는 2~12개, 개수가 같아야 합니다." }); return; }
        g.names = names.slice(0, n);
        g.prizes = prizes.slice(0, n);
        g.cols = n;
        g.rows = Math.max(7, n + 3);
        g.rungs = genLadder(n, g.rows);
        g.ready = true;
        pushState(room);
      }
      return;
    }

    // -------- 제비뽑기
    if (room.gameType === "draw") {
      if (msg.a === "set" && isHost) {
        const labels = (msg.labels || []).map((s) => String(s).slice(0, 20)).filter((s) => s.trim());
        if (labels.length < 2) { send(player, { t: "error", msg: "제비는 2개 이상이어야 합니다." }); return; }
        g.labels = labels.slice(0, 30);
        g.total = g.labels.length;
        g.shuffled = shuffle(g.labels.map((_, i) => i));
        g.drawn = {};
        pushState(room);
      } else if (msg.a === "draw") {
        if (g.drawn[player.id]) return;
        const taken = Object.keys(g.drawn).length;
        if (taken >= g.total) return;
        const labelIndex = g.shuffled[taken];
        g.drawn[player.id] = { name: player.name, labelIndex };
        broadcast(room, { t: "event", name: "drawn", playerId: player.id, playerName: player.name, label: g.labels[labelIndex] });
        pushState(room);
      } else if (msg.a === "reset" && isHost) {
        g.shuffled = shuffle(g.labels.map((_, i) => i));
        g.drawn = {};
        pushState(room);
      }
      return;
    }

    // -------- 아레나 (팀 슈팅)
    if (room.gameType === "arena") {
      if (msg.a === "start" && isHost) {
        g.mode = "team";
        if (msg.teamCount) g.teamCount = clamp(Math.round(Number(msg.teamCount)), 2, 3);
        pushState(room);
        startCountdown(room, startArena);
      } else if (msg.a === "setmode" && isHost) {
        g.teamCount = clamp(Math.round(Number(msg.teamCount) || 2), 2, 3);
        pushState(room);
      } else if (msg.a === "mapedit" && isHost && !g.started) {
        if (Array.isArray(msg.walls)) {
          g.walls = msg.walls.slice(0, 400).map((w) => ({
            x: Math.round(+w.x), y: Math.round(+w.y), w: Math.round(+w.w), h: Math.round(+w.h)
          }));
          g.wallsCustom = true;
        }
        pushState(room);
      } else if (msg.a === "mapreset" && isHost && !g.started) {
        g.wallsCustom = false;
        buildMap(g);
        pushState(room);
      } else if (msg.a === "ready") {
        player.ready = !!msg.ready; pushState(room);
      } else if (msg.a === "team") {
        const tv = Math.round(Number(msg.team));
        if (g.started) {
          if (tv >= 0 && tv < g.teamCount) {
            player.team = tv;
            player.homeTeam = tv;
            respawnPlayer(g, player);
            pushState(room);
          }
        } else { player.chosenTeam = clamp(tv, 0, g.teamCount - 1); pushState(room); }
      } else if (msg.a === "stop" && isHost) {
        cancelCountdown(room); stopArena(room);
      } else if (msg.a === "input") {
        player.input = {
          mvx: clamp(Number(msg.mvx) || 0, -1, 1),
          mvy: clamp(Number(msg.mvy) || 0, -1, 1),
          angle: Number(msg.angle) || 0,
          shoot: !!msg.shoot,
          dash: !!msg.dash,
          repair: !!msg.repair,
          recall: !!msg.recall,
        };
      }
      return;
    }

    // -------- 경찰과 도둑 (AI인척)
    if (room.gameType === "cops") {
      if (msg.a === "set" && isHost) {
        if (msg.mode) g.mode = ["relic", "mimic"].includes(msg.mode) ? msg.mode : "relic";
        g.policeCount = clamp(Math.round(Number(msg.policeCount) || 1), 1, 5);
        g.botCount = clamp(Math.round(Number(msg.botCount) || 10), 1, 30);
        if (g.mode === "relic") g.safeCount = clamp(Math.round(Number(msg.safeCount) || 4), 1, 12);
        if (msg.relicTime != null) g.relicTime = clamp(Math.round(Number(msg.relicTime) || 5), 1, 30);
        if (msg.thiefVision != null) g.thiefVision = clamp(Math.round(Number(msg.thiefVision) || 230), 80, 600);
        if (msg.policeVision != null) g.policeVision = clamp(Math.round(Number(msg.policeVision) || 350), 80, 700);
        if (g.mode === "relic") {
          if (msg.thiefDashCd != null) g.thiefDashCd = clamp(Math.round(Number(msg.thiefDashCd) || 10), 1, 30);
          if (msg.policeDashCd != null) g.policeDashCd = clamp(Math.round(Number(msg.policeDashCd) || 6), 1, 30);
          if (msg.mapId != null) { g.mapId = String(msg.mapId) === "random" ? "random" : String(msg.mapId); applyRelicMapPreview(g); }
        }
        if (g.mode === "mimic") {
          g.teamMode = msg.teamMode === "solo" ? "solo" : "team";
          g.teamsCount = clamp(Math.round(Number(msg.teamsCount) || 2), 2, 4);
        }
        pushState(room);
      } else if (msg.a === "maps") {
        send(player, { t: "relic-maps", maps: listRelicMaps() });
      } else if (msg.a === "mapgen" && isHost && g.mode === "relic" && !g.started) {
        g.mapId = "random";
        applyRelicMapPreview(g);
        pushState(room);
      } else if (msg.a === "mapsave" && isHost && g.mode === "relic" && !g.started) {
        const saved = saveRelicMap(msg.name, { world: g.world, walls: g.walls, jail: g.jail });
        g.mapId = saved.id;
        g.mapName = saved.name;
        pushState(room);
        send(player, { t: "relic-maps", maps: listRelicMaps() });
      } else if (msg.a === "mapedit" && isHost && g.mode === "relic" && !g.started) {
        if (Array.isArray(msg.walls)) {
          g.walls = msg.walls.slice(0, 400).map((w) => ({ x: Math.round(+w.x), y: Math.round(+w.y), w: Math.round(+w.w), h: Math.round(+w.h) }));
        }
        g.mapId = "custom";
        g.mapName = "편집 중";
        pushState(room);
      } else if (msg.a === "start" && isHost) {
        startCountdown(room, startCops);
      } else if (msg.a === "ready") {
        player.ready = !!msg.ready; pushState(room);
      } else if (msg.a === "stop" && isHost) {
        cancelCountdown(room);
        if (g.mode === "mimic") { g.started = false; if (room.loop) { clearInterval(room.loop); room.loop = null; } broadcast(room, { t: "cops-end", mode: "mimic", winner: "중단" }); pushState(room); scheduleRoomsBroadcast(); }
        else endCops(room, "중단", true);
      } else if (msg.a === "input") {
        player.cin = {
          mvx: clamp(Number(msg.mvx) || 0, -1, 1),
          mvy: clamp(Number(msg.mvy) || 0, -1, 1),
          interact: !!msg.interact,
          stop: !!msg.stop,
          shoot: !!msg.shoot,
          stab: !!msg.stab,
          defend: !!msg.defend,
          dash: !!msg.dash,
          phase: !!msg.phase,
          push: !!msg.push,
          shield: !!msg.shield,
        };
      }
      return;
    }

    // -------- 최고의 주방장 / 튜토리얼
    if (room.gameType === "kitchen") {
      handleKitchenAction(room, player, msg, Object.assign(kitchenCtx(), { isHost, g, send, pushState, startCountdown }));
      return;
    }
    if (room.gameType === "kitchen-tut") {
      handleKitchenTutorialAction(room, player, msg, Object.assign(kitchenCtx(), { isHost, g, send, pushState, startCountdown }));
      return;
    }
  }

  // ---------------------------------------------------------------- 사다리 생성
  function genLadder(cols, rows) {
    const rungs = [];
    for (let r = 0; r < rows; r++) {
      const rowRungs = [];
      let c = 0;
      while (c < cols - 1) {
        if (Math.random() < 0.5) { rowRungs.push(c); c += 2; }
        else c += 1;
      }
      rungs.push(rowRungs);
    }
    return rungs;
  }

  // ---------------------------------------------------------------- 아레나 (팀 슈팅)
  const ARENA = {
    speed: 205, bulletSpeed: 620, bulletTTL: 30, cooldown: 0.22, dmg: 16, hp: 100, pr: 15, br: 4.5,
    dashSpeed: 660, dashTime: 0.16, dashCd: 3.2,
    respawn: 10, nexusHp: 700, nexusR: 32, itemMax: 10, itemEvery: 4.5, dt: 0.04,
    teamTime: 480,
    killHeal: 28,
    repairRate: 55,
    repairR: 52,
    recallCd: 20,
    recallChannel: 1.35,
    streakSpeedNeed: 2,
    streakDmgNeed: 3,
    streakBuffMs: 8000,
  };
  const ITEM_TYPES = [
    { type: "heal", p: 0.34, color: "#22c55e" },
    { type: "speed", p: 0.24, color: "#38bdf8" },
    { type: "damage", p: 0.22, color: "#f97316" },
    { type: "revive", p: 0.20, color: "#e879f9" },
  ];
  const MG_LOG_MS = 5000;

  function buildMap(g) {
    const W = g.world.w, H = g.world.h, cx = W / 2, cy = H / 2;
    const walls = [];
    const add = (x, y, w, h) => walls.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    /* 고정 벽만 유지 (깜빡이던 상자·프롭 제거) */
    add(cx - 160, cy - 160, 110, 22); add(cx + 50, cy - 160, 110, 22);
    add(cx - 160, cy + 138, 110, 22); add(cx + 50, cy + 138, 110, 22);
    add(cx - 160, cy - 160, 22, 110); add(cx - 160, cy + 50, 22, 110);
    add(cx + 138, cy - 160, 22, 110); add(cx + 138, cy + 50, 22, 110);
    add(W * 0.22, 100, 24, 280); add(W * 0.22, H - 380, 24, 280);
    add(W * 0.78 - 24, 100, 24, 280); add(W * 0.78 - 24, H - 380, 24, 280);
    add(110, H * 0.28, 280, 24); add(W - 390, H * 0.28, 280, 24);
    add(110, H * 0.72 - 24, 280, 24); add(W - 390, H * 0.72 - 24, 280, 24);
    const covers = [
      [W * 0.18, H * 0.18], [W * 0.82, H * 0.18], [W * 0.18, H * 0.82], [W * 0.82, H * 0.82],
      [W * 0.5, H * 0.22], [W * 0.5, H * 0.78], [W * 0.28, H * 0.5], [W * 0.72, H * 0.5],
      [W * 0.38, H * 0.35], [W * 0.62, H * 0.35], [W * 0.38, H * 0.65], [W * 0.62, H * 0.65],
    ];
    for (const bp of covers) add(bp[0] - 50, bp[1] - 16, 100, 32);
    add(cx - 40, cy - 260, 80, 18); add(cx - 40, cy + 242, 80, 18);
    add(cx - 260, cy - 40, 18, 80); add(cx + 242, cy - 40, 18, 80);
    if (!g.wallsCustom) g.walls = walls;
    g.pushables = [];
    g.props = [];
    const tc = g.teamCount;
    if (tc === 2) g.bases = [{ x: 130, y: cy }, { x: W - 130, y: cy }];
    else g.bases = [{ x: 150, y: H - 150 }, { x: W - 150, y: H - 150 }, { x: cx, y: 140 }];
  }
  function spawnAtBase(g, teamIdx) {
    const nx = (g.nexus || []).find((n) => n.team === teamIdx && n.alive);
    const b = nx || g.bases[teamIdx] || { x: g.world.w / 2, y: g.world.h / 2 };
    for (let i = 0; i < 30; i++) {
      const x = clamp(b.x + (Math.random() - 0.5) * 120, ARENA.pr, g.world.w - ARENA.pr);
      const y = clamp(b.y + (Math.random() - 0.5) * 120, ARENA.pr, g.world.h - ARENA.pr);
      if (!inAnyRect(x, y, g.walls)) return { x, y };
    }
    return { x: b.x, y: b.y };
  }
  function randFree(g, margin) {
    margin = margin || 40;
    for (let i = 0; i < 40; i++) {
      const x = margin + Math.random() * (g.world.w - margin * 2);
      const y = margin + Math.random() * (g.world.h - margin * 2);
      if (!inAnyRect(x, y, g.walls || [])) return { x, y };
    }
    return { x: g.world.w / 2, y: g.world.h / 2 };
  }
  function smallestTeam(g, players) {
    const cnt = new Array(g.teamCount).fill(0);
    for (const p of players) if (p.team != null) cnt[p.team]++;
    let best = 0; for (let i = 1; i < g.teamCount; i++) if (cnt[i] < cnt[best]) best = i;
    return best;
  }
  function initArenaPlayer(g, p) {
    p.hp = ARENA.hp; p.alive = true; p.respawnAt = 0; p.lastShot = 0;
    p.score = 0; p.kills = 0; p.deaths = 0; p.streak = 0; p.bestStreak = 0;
    p.dashUntil = 0; p.dashCdUntil = 0;
    p.speedUntil = 0; p.dmgUntil = 0; p.reviveCharge = false;
    p.homeTeam = p.team;
    p.recallCdUntil = 0; p.recallUntil = 0; p.repairing = false;
    p.input = { mvx: 0, mvy: 0, angle: 0, shoot: false, repair: false, recall: false };
    const sp = spawnAtBase(g, p.homeTeam != null ? p.homeTeam : p.team);
    p.x = sp.x; p.y = sp.y; p.angle = 0;
  }
  function respawnPlayer(g, p) {
    const baseIdx = p.homeTeam != null ? p.homeTeam : p.team;
    const sp = spawnAtBase(g, baseIdx);
    p.x = sp.x; p.y = sp.y; p.hp = ARENA.hp; p.alive = true;
    p.repairing = false; p.recallUntil = 0;
  }
  function conquerTeam(room, deadTeam, winnerTeam, now) {
    const g = room.game;
    if (deadTeam == null || winnerTeam == null || deadTeam === winnerTeam) return;
    for (const p of room.players.values()) {
      if (p.team === deadTeam) {
        p.team = winnerTeam;
        /* homeTeam 유지 → 파괴된 넥서스 자리에서 리스폰 */
      }
    }
    g.conquestFeed = g.conquestFeed || [];
    g.conquestFeed.push({ id: uid(), from: deadTeam, to: winnerTeam, at: now });
    g.effects.push({ x: g.bases[deadTeam].x, y: g.bases[deadTeam].y, r: 80, ttl: 1.2, k: "boom" });
  }
  function startArena(room) {
    const g = room.game;
    g.mode = "team";
    g.bullets = []; g.items = []; g.effects = []; g.winner = null;
    g.itemTimer = ARENA.itemEvery;
    g.nexusAlert = {};
    g.conquestFeed = [];
    const ps = Array.from(room.players.values());
    buildMap(g);
    ps.forEach((p) => { p.team = (p.chosenTeam != null && p.chosenTeam < g.teamCount) ? p.chosenTeam : null; });
    ps.forEach((p) => { if (p.team == null) p.team = smallestTeam(g, ps); });
    g.nexus = g.bases.slice(0, g.teamCount).map((b, i) => ({
      team: i, x: b.x, y: b.y, hp: ARENA.nexusHp, max: ARENA.nexusHp, alive: true, lastHitAt: 0, lastHitBy: null,
    }));
    g.timeLeft = ARENA.teamTime;
    g.killFeed = [];
    ps.forEach((p) => { p.role = null; p.ready = false; initArenaPlayer(g, p); });
    g.started = true;
    pushState(room);
    scheduleRoomsBroadcast();
    if (room.loop) clearInterval(room.loop);
    room.loop = setInterval(() => arenaTick(room), ARENA.dt * 1000);
  }
  function stopArena(room) {
    const g = room.game;
    g.started = false;
    if (room.loop) { clearInterval(room.loop); room.loop = null; }
    pushState(room);
    scheduleRoomsBroadcast();
  }
  function endArena(room, winner) {
    const g = room.game;
    g.winner = winner;
    g.started = false;
    if (room.loop) { clearInterval(room.loop); room.loop = null; }
    for (const p of room.players.values()) {
      if (!p.account) continue;
      let pts = 1 + (p.score || 0), win = false;
      if (p.team === winner) { pts += 3; win = true; }
      award(p.account, "arena", pts, win, { kills: p.kills || 0, deaths: p.deaths || 0, streak: p.bestStreak || 0 });
    }
    broadcast(room, { t: "arena-end", mode: "team", winner });
    pushState(room);
    scheduleRoomsBroadcast();
    pushRankings(room);
  }
  function moveAxis(g, p, axis, delta) {
    const pr = ARENA.pr;
    const nx = axis === "x" ? p.x + delta : p.x;
    const ny = axis === "y" ? p.y + delta : p.y;
    for (const w of g.walls || []) if (hitRect(nx, ny, pr, w)) return;
    if (axis === "x") p.x = nx; else p.y = ny;
  }
  function applyItem(p, type, now) {
    if (type === "heal") p.hp = Math.min(ARENA.hp, p.hp + 45);
    else if (type === "speed") p.speedUntil = now + 7000;
    else if (type === "damage") p.dmgUntil = now + 9000;
    else if (type === "revive") p.reviveCharge = true;
  }
  function spawnItem(g) {
    const pos = randFree(g, 60);
    const r = Math.random(); let acc = 0, type = "heal";
    for (const it of ITEM_TYPES) { acc += it.p; if (r <= acc) { type = it.type; break; } }
    g.items.push({ id: uid(), x: Math.round(pos.x), y: Math.round(pos.y), type });
  }
  function pushArenaFx(g, x, y, k, r, ttl) {
    g.effects = g.effects || [];
    g.effects.push({ x: Math.round(x), y: Math.round(y), r: r || 22, ttl: ttl || 0.35, k: k || "spark" });
    if (g.effects.length > 40) g.effects.splice(0, g.effects.length - 40);
  }
  function applyKillRewards(killer, now) {
    if (!killer) return;
    killer.hp = Math.min(ARENA.hp, (killer.hp || 0) + ARENA.killHeal);
    if (killer.streak >= ARENA.streakSpeedNeed) {
      killer.speedUntil = Math.max(killer.speedUntil || 0, now + ARENA.streakBuffMs);
      killer.dmgUntil = Math.max(killer.dmgUntil || 0, now + ARENA.streakBuffMs);
    }
  }
  function damagePlayer(g, p, dmg, now, room, ownerId) {
    const wasAlive = p.alive;
    p.hp -= dmg;
    pushArenaFx(g, p.x, p.y, "hit", 18, 0.28);
    if (p.hp <= 0) {
      p.alive = false;
      if (p.reviveCharge) { p.reviveCharge = false; p.respawnAt = now; }
      else p.respawnAt = now + ARENA.respawn * 1000;
      p.deaths = (p.deaths || 0) + 1; p.streak = 0;
      p.repairing = false; p.recallUntil = 0;
      pushArenaFx(g, p.x, p.y, "kill", 36, 0.55);
      const killer = room.players.get(ownerId);
      if (wasAlive && killer && killer !== p && killer.team !== p.team) {
        killer.score = (killer.score || 0) + 1;
        killer.kills = (killer.kills || 0) + 1;
        killer.streak = (killer.streak || 0) + 1;
        killer.bestStreak = Math.max(killer.bestStreak || 0, killer.streak);
        applyKillRewards(killer, now);
        pushArenaFx(g, killer.x, killer.y, "buff", 24, 0.4);
        g.killFeed = g.killFeed || [];
        g.killFeed.push({ id: uid(), kn: killer.name, vn: p.name, ktm: killer.team, vtm: p.team, at: now });
        g.killFeed = g.killFeed.filter((k) => now - k.at < MG_LOG_MS).slice(-8);
      }
    }
  }
  function arenaTick(room) {
    const g = room.game;
    const now = Date.now();
    const dt = ARENA.dt;
    const W = g.world.w, H = g.world.h, pr = ARENA.pr;
    g.timeLeft -= dt;
    const ps = Array.from(room.players.values());

    g.itemTimer -= dt; if (g.itemTimer <= 0 && g.items.length < ARENA.itemMax) { g.itemTimer = ARENA.itemEvery; spawnItem(g); }

    for (const p of ps) {
      if (!p.alive) { if (now >= p.respawnAt) respawnPlayer(g, p); else continue; }
      const inp = p.input || {};
      if (p.speedUntil && now > p.speedUntil) p.speedUntil = 0;
      if (p.dmgUntil && now > p.dmgUntil) p.dmgUntil = 0;

      /* 귀환 채널링 */
      if (now < (p.recallUntil || 0)) {
        p.repairing = false;
        if (Math.hypot(inp.mvx || 0, inp.mvy || 0) > 0.25 || inp.shoot || inp.dash) {
          p.recallUntil = 0; /* 취소 */
        } else if (now >= p.recallUntil - 16) {
          const nx = (g.nexus || []).find((n) => n.team === p.team && n.alive);
          const base = nx || g.bases[p.team] || g.bases[p.homeTeam] || { x: W / 2, y: H / 2 };
          p.x = base.x + (Math.random() - 0.5) * 40;
          p.y = base.y + (Math.random() - 0.5) * 40;
          p.recallUntil = 0;
          p.recallCdUntil = now + ARENA.recallCd * 1000;
          g.effects.push({ x: p.x, y: p.y, r: 36, ttl: 0.45, k: "recall" });
        }
        continue;
      }
      if (inp.recall && now >= (p.recallCdUntil || 0) && !(now < (p.recallUntil || 0))) {
        p.recallUntil = now + ARENA.recallChannel * 1000;
        inp.recall = false;
        continue;
      }

      /* 넥서스 수리 — 수리 중 사격 불가 */
      p.repairing = false;
      const myNexus = (g.nexus || []).find((n) => n.team === p.team && n.alive);
      if (inp.repair && myNexus && Math.hypot(myNexus.x - p.x, myNexus.y - p.y) <= ARENA.repairR) {
        p.repairing = true;
        myNexus.hp = Math.min(myNexus.max, myNexus.hp + ARENA.repairRate * dt);
        if (!p._repairFxAt || now - p._repairFxAt > 280) {
          p._repairFxAt = now;
          pushArenaFx(g, myNexus.x, myNexus.y, "heal", 28, 0.32);
        }
      }

      if (inp.dash && !p.repairing && now >= (p.dashCdUntil || 0)) {
        let dx = inp.mvx || 0, dy = inp.mvy || 0;
        if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(p.angle); dy = Math.sin(p.angle); }
        const m = Math.hypot(dx, dy) || 1; p.dashDx = dx / m; p.dashDy = dy / m;
        p.dashUntil = now + ARENA.dashTime * 1000; p.dashCdUntil = now + ARENA.dashCd * 1000;
        pushArenaFx(g, p.x, p.y, "dash", 26, 0.28);
      }
      inp.dash = false;
      let speed = ARENA.speed * (p.speedUntil ? 1.5 : 1) * (p.repairing ? 0.45 : 1);
      let dx, dy;
      if (now < p.dashUntil) { dx = p.dashDx; dy = p.dashDy; speed = ARENA.dashSpeed; }
      else { dx = inp.mvx || 0; dy = inp.mvy || 0; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } }
      if (inp.angle != null) p.angle = inp.angle;
      moveAxis(g, p, "x", dx * speed * dt);
      moveAxis(g, p, "y", dy * speed * dt);
      p.x = clamp(p.x, pr, W - pr); p.y = clamp(p.y, pr, H - pr);

      if (!p.repairing && inp.shoot && now - (p.lastShot || 0) >= ARENA.cooldown * 1000) {
        p.lastShot = now;
        const dmg = ARENA.dmg * (p.dmgUntil ? 1.7 : 1);
        const muzzle = pr + 10;
        g.bullets.push({
          x: p.x + Math.cos(p.angle) * muzzle,
          y: p.y + Math.sin(p.angle) * muzzle,
          vx: Math.cos(p.angle) * ARENA.bulletSpeed,
          vy: Math.sin(p.angle) * ARENA.bulletSpeed,
          owner: p.id, team: p.team, dmg, ttl: ARENA.bulletTTL,
        });
      }
      for (const it of g.items) {
        if (!it.taken && Math.hypot(it.x - p.x, it.y - p.y) < pr + 12) {
          it.taken = true; applyItem(p, it.type, now);
          pushArenaFx(g, it.x, it.y, "pickup", 20, 0.35);
        }
      }
    }
    g.items = g.items.filter((it) => !it.taken);

    for (const b of g.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.ttl -= dt;
      if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) { b.ttl = 0; continue; }
      let blocked = false; for (const w of g.walls || []) if (hitRect(b.x, b.y, ARENA.br, w)) { blocked = true; break; }
      if (blocked) {
        pushArenaFx(g, b.x, b.y, "spark", 12, 0.18);
        b.ttl = 0; continue;
      }
      for (const p of ps) {
        if (!p.alive || p.team === b.team) continue;
        if (Math.hypot(p.x - b.x, p.y - b.y) < pr + ARENA.br) {
          damagePlayer(g, p, b.dmg, now, room, b.owner);
          b.ttl = 0; break;
        }
      }
      if (b.ttl <= 0) continue;
      for (const nx of g.nexus) {
        if (!nx.alive || nx.team === b.team) continue;
        if (Math.hypot(nx.x - b.x, nx.y - b.y) < ARENA.nexusR) {
          nx.hp -= b.dmg; b.ttl = 0;
          nx.lastHitAt = now; nx.lastHitBy = b.team;
          pushArenaFx(g, b.x, b.y, "nexus", 20, 0.25);
          if (nx.hp <= 0) {
            nx.hp = 0; nx.alive = false;
            g.effects.push({ x: nx.x, y: nx.y, r: 70, ttl: 0.9, k: "boom" });
            conquerTeam(room, nx.team, b.team, now);
          }
          break;
        }
      }
    }
    g.bullets = g.bullets.filter((b) => b.ttl > 0).slice(-260);
    g.effects.forEach((e) => (e.ttl -= dt)); g.effects = g.effects.filter((e) => e.ttl > 0);
    const aliveTeams = Array.from(new Set(g.nexus.filter((n) => n.alive).map((n) => n.team)));
    if (g.nexus.length && aliveTeams.length <= 1) return endArena(room, aliveTeams.length === 1 ? aliveTeams[0] : -1);

    if (g.timeLeft <= 0) return endArena(room, -1);
    broadcastArena(room, now, ps);
  }
  function broadcastArena(room, now, ps) {
    const g = room.game;
    g._tick = (g._tick || 0) + 1;
    const full = (g._tick % 2) === 0;
    const tl = Math.max(0, Math.round(g.timeLeft));
    const feed = (g.killFeed || []).filter((k) => now - k.at < MG_LOG_MS);
    const payload = {
      t: "arena", mode: "team", tl, tc: g.teamCount,
      feed: feed.map((k) => ({ id: k.id, kn: k.kn, vn: k.vn, ktm: k.ktm, vtm: k.vtm, at: k.at })),
      conquest: (g.conquestFeed || []).filter((k) => now - k.at < 6000).map((k) => ({ id: k.id, from: k.from, to: k.to, at: k.at })),
      ps: ps.map((p) => ({
        i: p.id, x: Math.round(p.x), y: Math.round(p.y), a: +(p.angle || 0).toFixed(2),
        h: Math.max(0, Math.round(p.hp)), al: p.alive ? 1 : 0, tm: p.team, ht: p.homeTeam,
        n: p.name, s: p.score || 0, sk: p.streak || 0,
        dash: now < p.dashUntil ? 1 : 0,
        dcd: Math.max(0, +(((p.dashCdUntil || 0) - now) / 1000).toFixed(2)),
        rcd: Math.max(0, +(((p.recallCdUntil || 0) - now) / 1000).toFixed(2)),
        recalling: now < (p.recallUntil || 0) ? 1 : 0,
        rs: (!p.alive && p.respawnAt > now) ? Math.max(0, +((p.respawnAt - now) / 1000).toFixed(1)) : 0,
        rp: p.repairing ? 1 : 0,
        sp: p.speedUntil ? 1 : 0, dm: p.dmgUntil ? 1 : 0, rv: p.reviveCharge ? 1 : 0,
      })),
      b: g.bullets.filter((_, i) => full || (i % 2) === 0).map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), tm: b.team })),
      it: g.items.map((it) => ({ x: it.x, y: it.y, k: it.type })),
      nx: g.nexus.map((n) => ({
        tm: n.team, x: n.x, y: n.y, h: Math.max(0, Math.round(n.hp)), m: n.max, al: n.alive ? 1 : 0,
        hit: (now - (n.lastHitAt || 0) < 1200) ? 1 : 0,
      })),
    };
    /* 이펙트는 매 틱 전송 (히트감 누락 방지) */
    payload.fx = g.effects.map((e) => ({ x: e.x, y: e.y, r: e.r, k: e.k || "spark" }));
    broadcast(room, payload);
  }

  // ---------------------------------------------------------------- 경찰과 도둑 / AI배틀
  const COPS = {
    botSpeed: 108, thiefSpeed: 128, dt: 0.045,
    matchTime: 120, openTime: 3.2, interactR: 42, r: 14,
    policeSpeed: 108, catchR: 32,
    phaseSpeed: 300, phaseTime: 0.48, phaseCd: 6.0,
    thiefDashSpeed: 250, thiefDashTime: 0.34,
    thiefVision: 230, policeVision: 350,
    passage: 72,
    playerSpeed: 120, stabR: 46, stabHalfAngle: 0.95, stabWindup: 0.16, stabActive: 0.16, stabCd: 0.85,
    defendMax: 1.0, defendCd: 2.2, mimicTime: 180,
    mimicColor: "#94a3b8",
    mimicDashSpeed: 280, mimicDashTime: 0.28, mimicDashCd: 4.5,
    aiKillStabDebuff: 2.4,
    playerKillStabBonus: 14,
    hostileAiKills: 3,
    botAttackR: 38, botAttackCd: 1.1, botChaseSpeed: 128,
    /* 유물부수기: 근접 경고 · 도둑 밀치기 · 술래 방어막 */
    alertR: 200,
    pushR: 108,
    pushForce: 220,
    pushCd: 7,
    shieldTime: 2.4,
    shieldCd: 9,
    pullForce: 240,
  };
  function randPos(g, margin) {
    margin = margin || 34;
    return { x: margin + Math.random() * (g.world.w - margin * 2), y: margin + Math.random() * (g.world.h - margin * 2) };
  }
  function freeSpotMimic(g, margin) {
    margin = margin || 46;
    const walls = g.walls || [];
    for (let i = 0; i < 120; i++) {
      const x = margin + Math.random() * (g.world.w - margin * 2);
      const y = margin + Math.random() * (g.world.h - margin * 2);
      if (!walls.some((w) => hitRect(x, y, COPS.r + 8, w))) return { x, y };
    }
    return { x: g.world.w / 2, y: g.world.h / 2 };
  }
  function buildMimicMap(g) {
    const W = g.world.w, H = g.world.h, T = 22;
    const walls = [];
    const add = (x, y, w, h) => walls.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    add(W * 0.22, H * 0.18, 160, T); add(W * 0.58, H * 0.12, T, 180);
    add(W * 0.12, H * 0.48, T, 200); add(W * 0.72, H * 0.42, 200, T);
    add(W * 0.38, H * 0.62, 140, T); add(W * 0.55, H * 0.72, T, 160);
    add(W * 0.28, H * 0.78, 120, T); add(W * 0.08, H * 0.22, 100, T);
    for (let i = 0; i < 10; i++) {
      const horiz = Math.random() < 0.55;
      const len = 70 + Math.random() * 130;
      const x = 80 + Math.random() * (W - len - 160);
      const y = 80 + Math.random() * (H - len - 160);
      if (horiz) add(x, y, len, T); else add(x, y, T, len);
    }
    g.walls = walls;
  }
  function moveMimicEntity(g, p, dx, dy, speed, dt) {
    const W = g.world.w, H = g.world.h, R = COPS.r;
    const walls = g.walls || [];
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    if (mag > 0.05) p.face = Math.atan2(dy, dx);
    const nX = clamp(p.x + dx * speed * dt, R, W - R);
    const nY = clamp(p.y + dy * speed * dt, R, H - R);
    if (!walls.some((w) => hitRect(nX, p.y, R, w))) p.x = nX;
    if (!walls.some((w) => hitRect(p.x, nY, R, w))) p.y = nY;
  }
  function nearbyWallHit(walls, x, y, r) {
    /* 근처 벽만 검사해 봇 이동 비용 절감 */
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (x + r < w.x - 4 || x - r > w.x + w.w + 4 || y + r < w.y - 4 || y - r > w.y + w.h + 4) continue;
      if (hitRect(x, y, r, w)) return true;
    }
    return false;
  }
  function stepBotMimic(g, b, dt, now, players) {
    const R = COPS.r, W = g.world.w, H = g.world.h, walls = g.walls || [];
    const DETECT = 300;
    const FLEE_DIST = 170;
    const CHASE_SPEED = COPS.botChaseSpeed || (COPS.botSpeed * 1.55);
    const WANDER_SPEED = COPS.botSpeed;

    /* 근처 플레이어 탐색 (적대 모드와 무관하게 AI인척에서 반응) */
    let best = null, bestD = 1e9;
    if (players) {
      for (const p of players) {
        if (p.dead) continue;
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d < bestD) { bestD = d; best = p; }
      }
    }

    if (best && bestD < DETECT) {
      /* 모드 미정이거나 만료되면 chase/flee 랜덤 선택 */
      if (!b.aiMode || now > (b.aiModeUntil || 0)) {
        b.aiMode = Math.random() < 0.5 ? "chase" : "flee";
        b.aiModeUntil = now + 3500 + Math.random() * 4500;
      }

      if (b.aiMode === "chase") {
        b.pose = "walk";
        b.dir = Math.atan2(best.y - b.y, best.x - b.x);
        b.face = b.dir;
        let nx = b.x + Math.cos(b.dir) * CHASE_SPEED * dt;
        let ny = b.y + Math.sin(b.dir) * CHASE_SPEED * dt;
        if (nx < R || nx > W - R) { nx = clamp(nx, R, W - R); }
        if (ny < R || ny > H - R) { ny = clamp(ny, R, H - R); }
        if (!nearbyWallHit(walls, nx, ny, R)) { b.x = nx; b.y = ny; }
        else { b.dir += 0.9; }
        if (bestD < (COPS.botAttackR || 28) + R && now >= (b.atkCdUntil || 0)) {
          if (!best.defending) {
            best.dead = true; best.deadAt = now; best.deaths = (best.deaths || 0) + 1; best.streak = 0;
            g.mimicKillFeed = g.mimicKillFeed || [];
            g.mimicKillFeed.push({ id: uid(), kn: "AI", vn: best.name, at: now });
            g.mimicKillFeed = g.mimicKillFeed.filter((k) => now - k.at < MG_LOG_MS).slice(-8);
            b.pose = "stab";
            b.atkCdUntil = now + (COPS.botAttackCd || 1.2) * 1000;
            return { killed: best, kind: "hit" };
          }
          b.atkCdUntil = now + (COPS.botAttackCd || 1.2) * 1000;
          return { blocked: best, kind: "block" };
        }
        return null;
      }

      /* flee: 일정 거리 유지하며 도망 */
      b.pose = "walk";
      let away = Math.atan2(b.y - best.y, b.x - best.x);
      if (bestD > FLEE_DIST + 40) {
        /* 너무 멀면 살짝 배회하듯 옆으로 */
        away += (Math.random() - 0.5) * 0.8;
      } else if (bestD < FLEE_DIST) {
        away += (Math.random() - 0.5) * 0.35;
      } else {
        away += Math.PI / 2 * (b.fleeSide || (b.fleeSide = Math.random() < 0.5 ? 1 : -1));
      }
      b.dir = away;
      b.face = b.dir;
      const spd = CHASE_SPEED * 0.95;
      let nx = b.x + Math.cos(b.dir) * spd * dt;
      let ny = b.y + Math.sin(b.dir) * spd * dt;
      if (nx < R || nx > W - R) { b.dir = Math.PI - b.dir; nx = clamp(nx, R, W - R); }
      if (ny < R || ny > H - R) { b.dir = -b.dir; ny = clamp(ny, R, H - R); }
      if (!nearbyWallHit(walls, nx, ny, R)) { b.x = nx; b.y = ny; }
      else { b.dir += Math.PI * 0.55; b.fleeSide = -(b.fleeSide || 1); }
      return null;
    }

    /* 플레이어 없음 → 배회 (앉기/손흔들기 없음) */
    b.aiMode = null;
    b.wt = (b.wt == null ? 0 : b.wt) - dt;
    if (b.wt <= 0) {
      const r = Math.random();
      if (r < 0.72) { b.pose = "walk"; b.dir += (Math.random() - 0.5) * 2.0; b.wt = 0.9 + Math.random() * 2.2; }
      else { b.pose = "stop"; b.wt = 0.5 + Math.random() * 1.2; }
    }
    if (b.pose !== "walk") return null;
    let nx = b.x + Math.cos(b.dir) * WANDER_SPEED * dt;
    let ny = b.y + Math.sin(b.dir) * WANDER_SPEED * dt;
    if (nx < R || nx > W - R) { b.dir = Math.PI - b.dir; nx = clamp(nx, R, W - R); }
    if (ny < R || ny > H - R) { b.dir = -b.dir; ny = clamp(ny, R, H - R); }
    if (nearbyWallHit(walls, nx, ny, R)) { b.dir += Math.PI * 0.6; b.wt = 0.45; }
    else { b.x = nx; b.y = ny; }
    b.face = b.dir;
    return null;
  }
  function stepBot(g, b, dt) {
    const R = COPS.r, W = g.world.w, H = g.world.h;
    b.wt -= dt;
    if (b.wt <= 0) {
      const r = Math.random();
      if (r < 0.7) { b.pose = "walk"; b.dir += (Math.random() - 0.5) * 2.4; b.wt = 0.7 + Math.random() * 1.8; }
      else { b.pose = "stop"; b.wt = 0.5 + Math.random() * 1.3; }
    }
    const mv = b.pose === "walk" ? 1 : 0;
    let nx = b.x + Math.cos(b.dir) * COPS.botSpeed * mv * dt;
    let ny = b.y + Math.sin(b.dir) * COPS.botSpeed * mv * dt;
    if (nx < R || nx > W - R) { b.dir = Math.PI - b.dir; nx = clamp(nx, R, W - R); }
    if (ny < R || ny > H - R) { b.dir = -b.dir; ny = clamp(ny, R, H - R); }
    b.x = nx; b.y = ny; b.face = b.dir;
  }
  function xOverlapLen(a, b) { return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); }
  function yOverlapLen(a, b) { return Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); }
  function widenDoorways(walls, minPass) {
    const horiz = walls.filter((w) => w.h <= w.w);
    const vert = walls.filter((w) => w.w <= w.h);
    const hRows = new Map();
    for (const w of horiz) {
      const k = Math.round(w.y / 10);
      if (!hRows.has(k)) hRows.set(k, []);
      hRows.get(k).push(w);
    }
    for (const row of hRows.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 0; i < row.length - 1; i++) {
        const a = row[i], b = row[i + 1];
        const gap = b.x - (a.x + a.w);
        if (gap <= 0 || gap >= minPass) continue;
        const need = minPass - gap;
        const half = need / 2;
        const minW = 12;
        if (a.w > minW + 4) a.w = Math.max(minW, a.w - half);
        if (b.w > minW + 4) { b.x += half; b.w = Math.max(minW, b.w - half); }
        if (b.x - (a.x + a.w) < minPass - 2) {
          if (a.w <= b.w && a.w <= 40) { a.w = 0; }
          else if (b.w <= 40) { b.w = 0; b.x = a.x + a.w + minPass; }
        }
      }
    }
    const vCols = new Map();
    for (const w of vert) {
      const k = Math.round(w.x / 10);
      if (!vCols.has(k)) vCols.set(k, []);
      vCols.get(k).push(w);
    }
    for (const col of vCols.values()) {
      col.sort((a, b) => a.y - b.y);
      for (let i = 0; i < col.length - 1; i++) {
        const a = col[i], b = col[i + 1];
        const gap = b.y - (a.y + a.h);
        if (gap <= 0 || gap >= minPass) continue;
        const need = minPass - gap;
        const half = need / 2;
        const minW = 12;
        if (a.h > minW + 4) a.h = Math.max(minW, a.h - half);
        if (b.h > minW + 4) { b.y += half; b.h = Math.max(minW, b.h - half); }
        if (b.y - (a.y + a.h) < minPass - 2) {
          if (a.h <= b.h && a.h <= 40) { a.h = 0; }
          else if (b.h <= 40) { b.h = 0; b.y = a.y + a.h + minPass; }
        }
      }
    }
  }
  function ensureMinCorridors(walls, minPass, T, W, H) {
    const horiz = walls.filter((w) => w.h <= w.w && w.w > 0 && w.h > 0);
    const vert = walls.filter((w) => w.w <= w.h && w.w > 0 && w.h > 0);
    for (let pass = 0; pass < 5; pass++) {
      for (let i = 0; i < horiz.length; i++) {
        for (let j = i + 1; j < horiz.length; j++) {
          const a = horiz[i], b = horiz[j];
          if (xOverlapLen(a, b) < minPass * 0.4) continue;
          const top = a.y <= b.y ? a : b;
          const low = a.y <= b.y ? b : a;
          const gap = low.y - (top.y + top.h);
          if (gap <= 0 || gap >= minPass) continue;
          const need = minPass - gap;
          const lowMax = H - low.h - 8;
          if (low.y + need <= lowMax) low.y += need;
          else top.y = Math.max(8, top.y - need);
        }
      }
      for (let i = 0; i < vert.length; i++) {
        for (let j = i + 1; j < vert.length; j++) {
          const a = vert[i], b = vert[j];
          if (yOverlapLen(a, b) < minPass * 0.4) continue;
          const left = a.x <= b.x ? a : b;
          const right = a.x <= b.x ? b : a;
          const gap = right.x - (left.x + left.w);
          if (gap <= 0 || gap >= minPass) continue;
          const need = minPass - gap;
          const rightMax = W - right.w - 8;
          if (right.x + need <= rightMax) right.x += need;
          else left.x = Math.max(8, left.x - need);
        }
      }
    }
  }
  function wallTooCloseParallel(walls, cand, minPass) {
    const T = 16;
    if (cand.h <= cand.w) {
      for (const w of walls) {
        if (w.h > w.w) continue;
        if (Math.abs(w.y - cand.y) < minPass + T && rectsOverlap(w, { x: cand.x - 8, y: cand.y, w: cand.w + 16, h: cand.h })) {
          const gap = Math.abs(w.y - cand.y) - Math.max(w.h, cand.h);
          if (gap >= 0 && gap < minPass) return true;
        }
      }
    } else {
      for (const w of walls) {
        if (w.w > w.h) continue;
        if (Math.abs(w.x - cand.x) < minPass + T && rectsOverlap(w, { x: cand.x, y: cand.y - 8, w: cand.w, h: cand.h + 16 })) {
          const gap = Math.abs(w.x - cand.x) - Math.max(w.w, cand.w);
          if (gap >= 0 && gap < minPass) return true;
        }
      }
    }
    return false;
  }
  // 재귀 분할 미로 생성 (유물부수기 전용) — 통로 폭 넉넉히 보장
  function copsMaze(g) {
    const T = 16, W = g.world.w, H = g.world.h, GAP = COPS.passage;
    const MIN_CELL = GAP + T + 48;
    const walls = [];
    function divide(x, y, w, h, depth) {
      if (depth > 8 || (w < MIN_CELL + 90 && h < MIN_CELL + 90)) return;
      const canH = h - 2 * T - GAP;
      const canV = w - 2 * T - GAP;
      let horiz;
      if (h > w && canH >= MIN_CELL) horiz = true;
      else if (w >= h && canV >= MIN_CELL) horiz = false;
      else if (canH >= MIN_CELL) horiz = true;
      else if (canV >= MIN_CELL) horiz = false;
      else return;
      const doorExtra = Math.floor(Math.random() * 24);
      const doorW = GAP + doorExtra;
      if (horiz) {
        const wy = Math.round(y + T + Math.random() * canH);
        const doorX = Math.round(x + GAP + Math.random() * Math.max(1, w - doorW - 2 * GAP));
        if (doorX - x > GAP) walls.push({ x: Math.round(x), y: wy, w: doorX - x, h: T });
        if (x + w - (doorX + doorW) > GAP) walls.push({ x: doorX + doorW, y: wy, w: Math.round(x + w - (doorX + doorW)), h: T });
        divide(x, y, w, wy - y, depth + 1);
        divide(x, wy + T, w, y + h - (wy + T), depth + 1);
      } else {
        const wx = Math.round(x + T + Math.random() * canV);
        const doorY = Math.round(y + GAP + Math.random() * Math.max(1, h - doorW - 2 * GAP));
        if (doorY - y > GAP) walls.push({ x: wx, y: Math.round(y), w: T, h: doorY - y });
        if (y + h - (doorY + doorW) > GAP) walls.push({ x: wx, y: doorY + doorW, w: T, h: Math.round(y + h - (doorY + doorW)) });
        divide(x, y, wx - x, h, depth + 1);
        divide(wx + T, y, x + w - (wx + T), h, depth + 1);
      }
    }
    divide(0, 0, W, H, 0);
    for (let i = 0; i < 14; i++) {
      const horiz = Math.random() < 0.5;
      const len = 80 + Math.random() * 140;
      const x = 80 + Math.random() * (W - len - 160);
      const y = 80 + Math.random() * (H - len - 160);
      const cand = horiz
        ? { x: Math.round(x), y: Math.round(y), w: Math.round(len), h: T }
        : { x: Math.round(x), y: Math.round(y), w: T, h: Math.round(len) };
      if (!wallTooCloseParallel(walls, cand, GAP)) walls.push(cand);
    }
    widenDoorways(walls, GAP);
    ensureMinCorridors(walls, GAP, T, W, H);
    widenDoorways(walls, GAP);
    g.walls = walls.filter((w) => w.w > 8 && w.h > 8);
  }
  function defaultRelicJail(g) {
    return { x: Math.round(g.world.w / 2 - 70), y: Math.round(g.world.h / 2 - 48), w: 140, h: 96 };
  }
  function applyRelicMapPreview(g) {
    g.world = g.world || { w: 1800, h: 1200 };
    if (g.mapId === "custom" && g.walls && g.walls.length) {
      g.jail = g.jail || defaultRelicJail(g);
      g.mapName = g.mapName || "편집 중";
      return;
    }
    if (g.mapId && g.mapId !== "random") {
      const m = loadRelicMap(g.mapId);
      if (m) {
        g.world = Object.assign({}, m.world);
        g.walls = m.walls.map((w) => Object.assign({}, w));
        g.jail = m.jail ? Object.assign({}, m.jail) : defaultRelicJail(g);
        g.mapName = m.name;
        return;
      }
      g.mapId = "random";
    }
    copsMaze(g);
    g.jail = defaultRelicJail(g);
    g.mapName = "랜덤 미로";
  }
  function applyRelicMapForStart(g) {
    applyRelicMapPreview(g);
    carveArea(g, { x: g.jail.x - 44, y: g.jail.y - 44, w: g.jail.w + 88, h: g.jail.h + 88 });
  }
  function rectContains(r, px, py) { return px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h; }
  function relicBlocks(g) {
    const blocks = (g.walls || []).slice();
    for (const h of g.hideouts || []) blocks.push.apply(blocks, h.shells);
    return blocks;
  }
  function hideoutAt(g, px, py) {
    for (const h of g.hideouts || []) if (rectContains(h.cavity, px, py)) return h.id;
    return null;
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function buildThickHideout(bx, by, horiz, len, showArrow) {
    const TH = 50, IN = 14, GAP = COPS.passage;
    let outer, cavity, entrance, shells;
    if (horiz) {
      outer = { x: bx, y: by, w: len, h: TH };
      cavity = { x: bx + IN + 8, y: by + IN, w: len - 2 * IN - 16, h: TH - IN - 10 };
      entrance = { x: bx + len / 2 - GAP / 2, y: by + TH - 8, w: GAP, h: 12, dir: "s" };
      shells = [
        { x: bx, y: by, w: len, h: IN },
        { x: bx, y: by + IN, w: IN, h: TH - IN },
        { x: bx + len - IN, y: by + IN, w: IN, h: TH - IN },
        { x: bx, y: by + TH - IN, w: len / 2 - GAP / 2, h: IN },
        { x: bx + len / 2 + GAP / 2, y: by + TH - IN, w: len / 2 - GAP / 2, h: IN },
      ];
    } else {
      outer = { x: bx, y: by, w: TH, h: len };
      cavity = { x: bx + IN, y: by + IN + 8, w: TH - IN - 10, h: len - 2 * IN - 16 };
      entrance = { x: bx + TH - 8, y: by + len / 2 - GAP / 2, w: 12, h: GAP, dir: "e" };
      shells = [
        { x: bx, y: by, w: IN, h: len },
        { x: bx + IN, y: by, w: TH - IN, h: len / 2 - GAP / 2 },
        { x: bx + IN, y: by + len / 2 + GAP / 2, w: TH - IN, h: len / 2 - GAP / 2 },
        { x: bx + TH - IN, y: by, w: IN, h: len },
      ];
    }
    return { outer, cavity, entrance, shells, arrow: !!showArrow };
  }
  // 유물부수기 은신처 생성 — 원본 서버에서도 호출되지 않는 미사용 헬퍼(향후 확장용, 동일하게 이식)
  function copsHideouts(g) {
    g.hideouts = [];
    const W = g.world.w, H = g.world.h;
    const target = 12 + Math.floor(Math.random() * 4);
    for (let attempt = 0; attempt < 100 && g.hideouts.length < target; attempt++) {
      const horiz = Math.random() < 0.55;
      const len = Math.round(120 + Math.random() * 90);
      const bx = Math.round(70 + Math.random() * (W - len - 140));
      const by = Math.round(70 + Math.random() * (H - len - 140));
      const showArrow = Math.random() < 0.55;
      const h = buildThickHideout(bx, by, horiz, len, showArrow);
      if (h.cavity.w < 36 || h.cavity.h < 22) continue;
      let bad = false;
      for (const o of g.hideouts) if (rectsOverlap(h.outer, o.outer)) { bad = true; break; }
      if (bad) continue;
      if (g.jail && rectsOverlap(h.outer, { x: g.jail.x - 30, y: g.jail.y - 30, w: g.jail.w + 60, h: g.jail.h + 60 })) continue;
      for (const s of g.safes || []) if (Math.hypot(s.x - (h.outer.x + h.outer.w / 2), s.y - (h.outer.y + h.outer.h / 2)) < 90) { bad = true; break; }
      if (bad) continue;
      g.hideouts.push(Object.assign({ id: g.hideouts.length }, h));
    }
  }
  function canSeeRelic(g, ox, oy, tx, ty, vr) {
    const oh = hideoutAt(g, ox, oy), th = hideoutAt(g, tx, ty);
    if (th !== null && oh !== th) return false;
    return Math.hypot(tx - ox, ty - oy) <= vr + COPS.r;
  }
  function moveRelicEntity(g, p, dx, dy, speed, dt, phasing) {
    const W = g.world.w, H = g.world.h, R = COPS.r;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    if (mag > 0.05) p.face = Math.atan2(dy, dx);
    const blocks = phasing ? [] : relicBlocks(g);
    const tryX = clamp(p.x + dx * speed * dt, R, W - R);
    if (phasing || !blocks.some((w) => hitRect(tryX, p.y, R, w))) p.x = tryX;
    const tryY = clamp(p.y + dy * speed * dt, R, H - R);
    if (phasing || !blocks.some((w) => hitRect(p.x, tryY, R, w))) p.y = tryY;
    const hideout = (g.hideouts || []).find((h) => hideoutAt(g, p.x, p.y) === h.id);
    const c = hideout ? hideout.cavity : null;
    if (c) {
      p.x = clamp(p.x, c.x + R, c.x + c.w - R);
      p.y = clamp(p.y, c.y + R, c.y + c.h - R);
    }
    p.hideout = hideoutAt(g, p.x, p.y);
    p.pose = mag < 0.05 ? "stop" : (phasing ? "dash" : "walk");
  }
  function moveJailedEntity(g, p, dx, dy, speed, dt) {
    const j = g.jail;
    if (!j) return;
    const R = COPS.r;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    if (mag > 0.05) p.face = Math.atan2(dy, dx);
    const minX = j.x + R + 2, maxX = j.x + j.w - R - 2;
    const minY = j.y + R + 2, maxY = j.y + j.h - R - 2;
    p.x = clamp(p.x + dx * speed * dt, minX, maxX);
    p.y = clamp(p.y + dy * speed * dt, minY, maxY);
    p.pose = mag < 0.05 ? "stop" : "walk";
  }
  function relicSpots(count, W, H) {
    const grid = [
      [0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88],
      [0.5, 0.12], [0.5, 0.88], [0.12, 0.5], [0.88, 0.5],
    ];
    return grid.slice(0, count).map((rr, i) => ({
      id: i,
      x: clamp(Math.round(W * rr[0]), 64, W - 64),
      y: clamp(Math.round(H * rr[1]), 64, H - 64),
    }));
  }
  function carveArea(g, rect) { g.walls = g.walls.filter((w) => !rectOverlap(w, rect)); }
  function freeSpotCops(g, margin) {
    margin = margin || 46;
    const blocks = relicBlocks(g);
    for (let i = 0; i < 100; i++) {
      const x = margin + Math.random() * (g.world.w - margin * 2);
      const y = margin + Math.random() * (g.world.h - margin * 2);
      if (hideoutAt(g, x, y) !== null) continue;
      if (!blocks.some((w) => hitRect(x, y, COPS.r + 6, w))) return { x, y };
    }
    return { x: g.world.w / 2, y: g.world.h / 2 };
  }
  function freeSpotNear(g, cx, cy, rad) {
    rad = rad || 60;
    const blocks = relicBlocks(g);
    const W = g.world.w, H = g.world.h, R = COPS.r;
    for (let i = 0; i < 40; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dd = 18 + Math.random() * rad;
      const x = clamp(cx + Math.cos(ang) * dd, R + 6, W - R - 6);
      const y = clamp(cy + Math.sin(ang) * dd, R + 6, H - R - 6);
      if (hideoutAt(g, x, y) !== null) continue;
      if (!blocks.some((w) => hitRect(x, y, R + 4, w))) return { x, y };
    }
    return { x: clamp(cx, R + 6, W - R - 6), y: clamp(cy, R + 6, H - R - 6) };
  }
  function startCops(room) {
    const g = room.game;
    g.mode = g.mode === "mimic" ? "mimic" : "relic";
    g.world = g.mode === "relic" ? { w: 1800, h: 1200 } : { w: 1600, h: 1100 };
    g.walls = [];
    const ps = shuffle(Array.from(room.players.values()));
    ps.forEach((p) => { p.ready = false; });
    g.bots = [];
    if (g.mode === "mimic") {
      buildMimicMap(g);
      const mc = COPS.mimicColor;
      for (let i = 0; i < g.botCount; i++) {
        const sp = freeSpotMimic(g);
        g.bots.push({ id: "b" + i, x: sp.x, y: sp.y, dir: Math.random() * Math.PI * 2, face: 0, wt: 0, pose: "walk", color: mc, dead: false, atkCdUntil: 0 });
      }
    }

    if (g.mode === "mimic") {
      const solo = g.teamMode === "solo";
      ps.forEach((p, i) => {
        p.crole = "player";
        p.team = solo ? i : (i % g.teamsCount);
        p.cin = { mvx: 0, mvy: 0, stab: false, defend: false, stop: false, dash: false };
        p.dead = false; p.defending = false; p.stabbing = false;
        p.kills = 0; p.deaths = 0; p.streak = 0; p.bestStreak = 0; p.aiKills = 0;
        p.stabUntil = 0; p.stabCdUntil = 0; p.stabHit = false; p.defUntil = 0; p.defCdUntil = 0; p.defAccum = 0;
        p.stabRBonus = 0; p.stabDebuffUntil = 0;
        p.dashUntil = 0; p.dashCdUntil = 0; p.dashDx = 0; p.dashDy = 0;
        p.color = COPS.mimicColor;
        const sp = freeSpotMimic(g); p.x = sp.x; p.y = sp.y; p.face = Math.random() * Math.PI * 2; p.pose = "walk";
      });
      g.safes = []; g.vault = { x: 0, y: 0, w: 0, h: 0 };
      g.mimicKillFeed = [];
      g.mimicNetAcc = 0;
      g.mimicWallsSent = false;
      g.mimicPendingEvents = [];
      g.botsHostile = false;
      g.hostileAnnounced = false;
      g.botTickParity = 0;
      g.timeLeft = COPS.mimicTime;
      g.result = null; g.started = true;
      pushState(room);
      scheduleRoomsBroadcast();
      if (room.loop) clearInterval(room.loop);
      room.loop = setInterval(() => copsTick(room), COPS.dt * 1000);
      return;
    }

    const policeN = Math.min(g.policeCount, Math.max(0, ps.length - 1)) || (ps.length > 1 ? 1 : 0);
    ps.forEach((p, i) => {
      p.crole = i < policeN ? "police" : "thief";
      p.cin = { mvx: 0, mvy: 0, interact: false, stop: false, shoot: false };
      if (p.crole === "police") {
        p.cdUntil = 0; p.catches = 0; p.phaseUntil = 0; p.phaseCdUntil = 0; p.phaseDx = null; p.phaseDy = null;
        p.phaseCharges = 2; p.phaseChargeAcc = 0; /* 돌진 최대 2회 충전 */
        p.face = 0; p.pose = "walk"; p.caught = false;
        p.shieldUntil = 0; p.shieldCdUntil = 0; p.shielding = false; p.kbX = 0; p.kbY = 0;
      } else {
        const sp = randPos(g); p.x = sp.x; p.y = sp.y; p.caught = false; p.face = 0; p.pose = "walk";
        p.steals = 0; p.dashUntil = 0; p.dashCdUntil = 0; p.dashDx = null; p.dashDy = null;
        p.pushCdUntil = 0; p.kbX = 0; p.kbY = 0;
      }
    });
    g.safeCount = clamp(Math.round(g.safeCount || 4), 1, 12);
    applyRelicMapForStart(g);
    g.safes = relicSpots(g.safeCount, g.world.w, g.world.h).map((s) => {
      carveArea(g, { x: s.x - 50, y: s.y - 50, w: 100, h: 100 });
      return Object.assign({}, s, { progress: 0, opened: false });
    });
    g.hideouts = [];
    ps.forEach((p) => { if (p.crole === "thief") { const sp = freeSpotCops(g); p.x = sp.x; p.y = sp.y; } });
    const jc = { x: g.jail.x + g.jail.w / 2, y: g.jail.y + g.jail.h / 2 };
    ps.forEach((p) => {
      if (p.crole !== "police") return;
      let sp = freeSpotCops(g);
      for (let k = 0; k < 12 && Math.hypot(sp.x - jc.x, sp.y - jc.y) < 300; k++) sp = freeSpotCops(g);
      p.x = sp.x; p.y = sp.y;
    });
    g.timeLeft = COPS.matchTime;
    g.result = null;
    g.catchFeed = [];
    g.started = true;
    pushState(room);
    scheduleRoomsBroadcast();
    if (room.loop) clearInterval(room.loop);
    room.loop = setInterval(() => copsTick(room), COPS.dt * 1000);
  }
  function endCops(room, winner, silent) {
    const g = room.game;
    g.started = false;
    g.result = { winner };
    if (room.loop) { clearInterval(room.loop); room.loop = null; }
    const opened = g.safes.filter((s) => s.opened).length;
    const thieves = Array.from(room.players.values()).filter((p) => p.crole === "thief");
    const caught = thieves.filter((p) => p.caught).length;
    if (!silent && winner !== "중단") {
      for (const p of room.players.values()) {
        if (!p.account) continue;
        let pts = 1, win = false;
        let extra = null;
        if (p.crole === "police") { pts += (p.catches || 0); if (winner === "경찰") { pts += 3; win = true; } extra = { catches: p.catches || 0 }; }
        else if (p.crole === "thief") { pts += (p.steals || 0); if (winner === "도둑") { pts += 3; win = true; } extra = { steals: p.steals || 0 }; }
        award(p.account, "cops", pts, win, extra);
      }
    }
    broadcast(room, { t: "cops-end", mode: g.mode, winner, opened, safeCount: g.safeCount, caught, thiefCount: thieves.length });
    pushState(room);
    scheduleRoomsBroadcast();
    pushRankings(room);
  }
  function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  function nameOfTeam(room, t) { const p = Array.from(room.players.values()).find((x) => x.team === t); return p ? p.name : "플레이어"; }
  function endMimic(room, teamsLeft, liveP, timeUp) {
    const g = room.game;
    g.started = false;
    if (room.loop) { clearInterval(room.loop); room.loop = null; }
    const solo = g.teamMode === "solo";
    let winner = "무승부";
    let winTeam = null;
    if (teamsLeft.length === 1) {
      const t = teamsLeft[0];
      winTeam = t;
      winner = solo ? nameOfTeam(room, t) : "팀 " + (t + 1);
    } else if (teamsLeft.length > 1) {
      const cnt = {}; liveP.forEach((p) => (cnt[p.team] = (cnt[p.team] || 0) + 1));
      let best = -1, bestN = -1, tie = false;
      for (const k of Object.keys(cnt)) { if (cnt[k] > bestN) { bestN = cnt[k]; best = +k; tie = false; } else if (cnt[k] === bestN) tie = true; }
      if (!tie) winTeam = best;
      winner = tie ? "무승부" : (solo ? nameOfTeam(room, best) : "팀 " + (best + 1));
    }
    for (const p of room.players.values()) {
      if (!p.account || p.crole !== "player") continue;
      const win = winTeam != null && p.team === winTeam;
      award(p.account, "cops", 1 + (p.kills || 0) + (win ? 3 : 0), win, { kills: p.kills || 0, deaths: p.deaths || 0, streak: p.bestStreak || 0 });
    }
    broadcast(room, { t: "cops-end", mode: "mimic", winner, alive: liveP.length, solo: solo ? 1 : 0 });
    pushState(room);
    scheduleRoomsBroadcast();
    pushRankings(room);
  }
  function mimicTick(room, now, dt, ps) {
    const g = room.game; const W = g.world.w, H = g.world.h, R = COPS.r;
    const events = (g._botKillEvents || []).slice();
    g._botKillEvents = null;
    for (const p of ps) {
      if (p.dead) { p.pose = "stop"; continue; }
      const inp = p.cin || {};
      let defend = false;
      if (inp.defend && now >= (p.defCdUntil || 0)) {
        p.defAccum = (p.defAccum || 0) + dt;
        if (p.defAccum >= COPS.defendMax) { p.defCdUntil = now + COPS.defendCd * 1000; p.defAccum = 0; }
        else defend = true;
      } else {
        if ((p.defAccum || 0) > 0.08) { p.defCdUntil = now + COPS.defendCd * 1000; p.defAccum = 0; }
        else p.defAccum = Math.max(0, (p.defAccum || 0) - dt * 0.7);
      }
      p.defending = defend;
      if (inp.stab && !p.stabbing && !defend && now >= (p.stabCdUntil || 0)) {
        p.stabbing = true; p.stabStart = now; p.stabHit = false;
        p.stabUntil = now + (COPS.stabWindup + COPS.stabActive) * 1000;
        p.stabCdUntil = p.stabUntil + COPS.stabCd * 1000;
      }
      if (p.stabbing && now >= p.stabUntil) p.stabbing = false;
      const stabbing = p.stabbing;
      const locked = inp.stop || defend;
      if (inp.dash && !defend && !locked && now >= (p.dashCdUntil || 0)) {
        let ddx = inp.mvx || 0, ddy = inp.mvy || 0;
        if (Math.hypot(ddx, ddy) < 0.1) { ddx = Math.cos(p.face || 0); ddy = Math.sin(p.face || 0); }
        const dm = Math.hypot(ddx, ddy) || 1;
        p.dashDx = ddx / dm; p.dashDy = ddy / dm;
        p.dashUntil = now + COPS.mimicDashTime * 1000;
        p.dashCdUntil = now + COPS.mimicDashCd * 1000;
      }
      inp.dash = false;
      const dashing = now < (p.dashUntil || 0);
      let dx = locked ? 0 : (inp.mvx || 0), dy = locked ? 0 : (inp.mvy || 0);
      if (dashing) { dx = p.dashDx; dy = p.dashDy; }
      const mag = Math.hypot(dx, dy); if (mag > 1 && !dashing) { dx /= mag; dy /= mag; }
      if (mag > 0.05 && !locked && !dashing) p.face = Math.atan2(dy, dx);
      const spd = dashing ? COPS.mimicDashSpeed : COPS.playerSpeed * (stabbing ? 0.82 : 1);
      if (!locked) moveMimicEntity(g, p, dx, dy, spd, dt);
      p.pose = defend ? "defend" : stabbing ? "stab" : dashing ? "walk" : (inp.stop || mag < 0.05) ? "stop" : "walk";
      const myStabR = COPS.stabR + (p.stabRBonus || 0);
      if (stabbing && !p.stabHit && now - p.stabStart >= COPS.stabWindup * 1000) {
        for (const q of ps) {
          if (q === p || q.dead || q.team === p.team) continue;
          const ddx = q.x - p.x, ddy = q.y - p.y, d = Math.hypot(ddx, ddy);
          if (d >= myStabR + R) continue;
          if (q.defending) {
            p.stabCdUntil = now + (COPS.stabCd + 0.5) * 1000;
            events.push({ x: Math.round(q.x), y: Math.round(q.y), kind: "block" });
            p.stabHit = true; break;
          }
          if (Math.abs(angDiff(Math.atan2(ddy, ddx), p.face)) < COPS.stabHalfAngle) {
            q.dead = true; q.deadAt = now; q.deaths = (q.deaths || 0) + 1; q.streak = 0;
            p.kills = (p.kills || 0) + 1; p.streak = (p.streak || 0) + 1; p.bestStreak = Math.max(p.bestStreak || 0, p.streak);
            p.stabRBonus = (p.stabRBonus || 0) + COPS.playerKillStabBonus;
            g.mimicKillFeed = g.mimicKillFeed || [];
            g.mimicKillFeed.push({ id: uid(), kn: p.name, vn: q.name, at: now });
            g.mimicKillFeed = g.mimicKillFeed.filter((k) => now - k.at < MG_LOG_MS).slice(-8);
            events.push({ x: Math.round(q.x), y: Math.round(q.y), kind: "hit" });
            p.stabHit = true; break;
          }
        }
        if (!p.stabHit) {
          for (const b of g.bots) {
            if (b.dead) continue;
            const ddx = b.x - p.x, ddy = b.y - p.y, d = Math.hypot(ddx, ddy);
            if (d < myStabR + R && Math.abs(angDiff(Math.atan2(ddy, ddx), p.face)) < COPS.stabHalfAngle) {
              b.dead = true;
              p.kills = (p.kills || 0) + 1; p.aiKills = (p.aiKills || 0) + 1;
              p.streak = (p.streak || 0) + 1; p.bestStreak = Math.max(p.bestStreak || 0, p.streak);
              /* AI 킬 디버프: 찌르기 쿨 연장 */
              p.stabCdUntil = Math.max(p.stabCdUntil || 0, now) + COPS.aiKillStabDebuff * 1000;
              p.stabDebuffUntil = now + COPS.aiKillStabDebuff * 1000;
              if (p.aiKills >= COPS.hostileAiKills && !g.botsHostile) {
                g.botsHostile = true;
                g.hostileAnnounced = true;
                events.push({ x: Math.round(p.x), y: Math.round(p.y), kind: "hostile" });
              }
              g.mimicKillFeed = g.mimicKillFeed || [];
              g.mimicKillFeed.push({ id: uid(), kn: p.name, vn: "AI", at: now });
              g.mimicKillFeed = g.mimicKillFeed.filter((k) => now - k.at < MG_LOG_MS).slice(-8);
              events.push({ x: Math.round(b.x), y: Math.round(b.y), kind: "hit" });
              p.stabHit = true; break;
            }
          }
        }
      }
    }
    const liveP = ps.filter((p) => !p.dead);
    const botsAlive = g.bots.filter((b) => !b.dead).length;
    const livingUnits = liveP.length + botsAlive;
    const teamsLeft = Array.from(new Set(liveP.map((p) => p.team)));
    if (ps.length >= 2 && teamsLeft.length <= 1) return endMimic(room, teamsLeft, liveP, false);
    if (g.timeLeft <= 0) return endMimic(room, teamsLeft, liveP, true);

    g.mimicPendingEvents = (g.mimicPendingEvents || []).concat(events);
    g.mimicNetAcc = (g.mimicNetAcc || 0) + dt;
    const entityN = livingUnits;
    /* 봇 많을수록 송신 간격 확대 */
    let netIv = 0.05;
    if (entityN > 6) netIv = 0.07;
    if (entityN > 10) netIv = 0.09;
    if (entityN > 14) netIv = 0.11;
    if (entityN > 20) netIv = 0.13;
    if (g.mimicNetAcc < netIv) return;
    g.mimicNetAcc = 0;
    const flushEvents = g.mimicPendingEvents || [];
    g.mimicPendingEvents = [];
    sendMimicState(room, now, ps, liveP, teamsLeft, flushEvents);
  }

  function sendMimicState(room, now, ps, liveP, teamsLeft, events) {
    const g = room.game;
    const tl = Math.max(0, Math.round(g.timeLeft));
    const solo = g.teamMode === "solo";
    const mc = COPS.mimicColor;
    const idToName = new Map();
    for (const pl of ps) idToName.set(pl.id, pl.name);
    for (const b of g.bots) idToName.set(b.id, "AI-" + String(b.id).replace(/^b/, ""));
    const botsAlive = g.bots.filter((b) => !b.dead).length;
    const botBase = [];
    for (const b of g.bots) {
      if (b.dead) continue;
      botBase.push({
        i: b.id, x: Math.round(b.x), y: Math.round(b.y), c: mc,
        f: +((b.face || 0)).toFixed(1), po: b.pose, h: g.botsHostile ? 1 : 0,
      });
    }
    const plBase = [];
    for (const p of ps) {
      if (p.dead) continue;
      plBase.push({
        i: p.id, x: Math.round(p.x), y: Math.round(p.y), c: mc,
        f: +((p.face || 0)).toFixed(2), po: p.pose, pl: 1, tm: p.team,
      });
    }
    const includeWalls = !g.mimicWallsSent;
    if (includeWalls) g.mimicWallsSent = true;
    const walls = includeWalls ? (g.walls || []).map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h })) : undefined;
    const feed = (g.mimicKillFeed || []).filter((k) => now - k.at < MG_LOG_MS).map((k) => ({ id: k.id, kn: k.kn, vn: k.vn, at: k.at }));
    const zoneMsg = { on: 0 };
    const viewR2 = 580 * 580;
    for (const p of ps) {
      const spectating = !!p.dead;
      let circles;
      if (spectating) {
        circles = botBase.concat(plBase).map((c) => {
          const o = { i: c.i, x: c.x, y: c.y, c: c.c, f: c.f, po: c.po };
          o.n = idToName.get(c.i) || c.i;
          if (c.pl) { o.pl = 1; o.tm = c.tm; }
          if (c.h) o.h = 1;
          return o;
        });
      } else {
        /* 시야 컬링: 먼 AI는 생략해 패킷·드로우 부담 감소 */
        circles = [];
        for (const c of plBase) {
          const o = { i: c.i, x: c.x, y: c.y, c: c.c, f: c.f, po: c.po, pl: 1, tm: c.tm };
          if (c.i === p.id) o.me = 1;
          else if (!solo && c.tm === p.team) o.ally = 1;
          circles.push(o);
        }
        const cull = botBase.length >= 4;
        for (const c of botBase) {
          if (cull) {
            const dx = c.x - p.x, dy = c.y - p.y;
            if (dx * dx + dy * dy > viewR2) continue;
          }
          const o = { i: c.i, x: c.x, y: c.y, c: c.c, f: c.f, po: c.po };
          if (c.h) o.h = 1;
          circles.push(o);
        }
      }
      const myAlive = liveP.filter((q) => q.team === p.team).length;
      const stabR = COPS.stabR + (p.stabRBonus || 0);
      const msg = {
        t: "cops", role: "player", mode: "mimic", tl, world: g.world, circles,
        dead: p.dead ? 1 : 0, vx: Math.round(p.x), vy: Math.round(p.y),
        stabCd: +Math.max(0, ((p.stabCdUntil || 0) - now) / 1000).toFixed(1),
        defCd: +Math.max(0, ((p.defCdUntil || 0) - now) / 1000).toFixed(1),
        dcd: +Math.max(0, ((p.dashCdUntil || 0) - now) / 1000).toFixed(1),
        dashing: now < (p.dashUntil || 0) ? 1 : 0,
        defending: p.defending ? 1 : 0, defReady: now >= (p.defCdUntil || 0) ? 1 : 0,
        stabR: Math.round(stabR), stabHalf: COPS.stabHalfAngle, face: +(p.face || 0).toFixed(2),
        stabDebuff: now < (p.stabDebuffUntil || 0) ? 1 : 0,
        debuffLeft: +Math.max(0, ((p.stabDebuffUntil || 0) - now) / 1000).toFixed(1),
        aiKills: p.aiKills || 0, hostile: g.botsHostile ? 1 : 0,
        zone: zoneMsg,
        alive: liveP.length, botsAlive, teamsLeft: teamsLeft.length,
        myTeam: solo ? -1 : p.team, myAlive, solo: solo ? 1 : 0, feed, events,
      };
      if (walls) msg.walls = walls;
      send(p, msg);
    }
  }
  function applyKnockVel(p, dx, dy, force) {
    const m = Math.hypot(dx, dy) || 1;
    p.kbX = (dx / m) * force;
    p.kbY = (dy / m) * force;
  }
  function tickKnockVel(g, p, dt) {
    const kx = p.kbX || 0, ky = p.kbY || 0;
    const spd = Math.hypot(kx, ky);
    if (spd < 8) { p.kbX = 0; p.kbY = 0; return; }
    moveRelicEntity(g, p, kx / spd, ky / spd, spd, dt, false);
    const damp = Math.max(0, 1 - 5.2 * dt);
    p.kbX = kx * damp;
    p.kbY = ky * damp;
  }

  function copsTick(room) {
    const g = room.game;
    const now = Date.now();
    const dt = COPS.dt;
    g.timeLeft -= dt;
    const W = g.world.w, H = g.world.h, R = COPS.r;
    const ps = Array.from(room.players.values());

    /* mimic: 봇을 격틱 스태거 업데이트해 4명+에서도 프레임 유지 */
    if (g.mode === "mimic") {
      g.botTickParity = (g.botTickParity || 0) ^ 1;
      const parity = g.botTickParity;
      const many = g.bots.length >= 4;
      const aliveEvents = [];
      for (let i = 0; i < g.bots.length; i++) {
        const b = g.bots[i];
        if (b.dead) continue;
        if (many && !g.botsHostile && (i & 1) !== parity) continue;
        const stepDt = (many && !g.botsHostile) ? dt * 2 : dt;
        const res = stepBotMimic(g, b, stepDt, now, ps);
        if (res && res.killed) aliveEvents.push({ x: Math.round(res.killed.x), y: Math.round(res.killed.y), kind: "hit" });
        else if (res && res.blocked) aliveEvents.push({ x: Math.round(res.blocked.x), y: Math.round(res.blocked.y), kind: "block" });
      }
      g._botKillEvents = aliveEvents;
      return mimicTick(room, now, dt, ps);
    }
    for (const b of g.bots) if (!b.dead) stepBot(g, b, dt);

    const thieves = ps.filter((p) => p.crole === "thief");
    const police = ps.filter((p) => p.crole === "police");

    for (const p of thieves) {
      const inp = p.cin || {};
      if (p.caught) {
        if (g.mode === "relic") {
          moveJailedEntity(g, p, inp.mvx || 0, inp.mvy || 0, COPS.thiefSpeed * 0.85, dt);
        } else { p.pose = "stop"; }
        continue;
      }
      tickKnockVel(g, p, dt);
      let dx = inp.mvx || 0, dy = inp.mvy || 0;
      if (g.mode === "relic") {
        const dashCd = g.thiefDashCd || 10;
        const dashTime = COPS.thiefDashTime;
        const dashSpd = COPS.thiefDashSpeed;
        if (inp.dash && now >= (p.dashCdUntil || 0) && !inp.interact) {
          let ddx = dx, ddy = dy;
          if (Math.hypot(ddx, ddy) < 0.1) { ddx = Math.cos(p.face || 0); ddy = Math.sin(p.face || 0); }
          const m = Math.hypot(ddx, ddy) || 1;
          p.dashDx = ddx / m; p.dashDy = ddy / m;
          p.dashUntil = now + dashTime * 1000;
          p.dashCdUntil = now + dashCd * 1000;
        }
        /* 중거리 밀치기 — 캐릭터가 바라보는 방향으로 밀침 */
        if (inp.push && now >= (p.pushCdUntil || 0)) {
          p.pushCdUntil = now + COPS.pushCd * 1000;
          p.pushFlashUntil = now + 180;
          const fx = Math.cos(p.face || 0);
          const fy = Math.sin(p.face || 0);
          for (const pol of police) {
            const ddx = pol.x - p.x, ddy = pol.y - p.y;
            const d = Math.hypot(ddx, ddy);
            if (d > COPS.pushR || d < 1e-3) continue;
            if (now < (pol.shieldUntil || 0)) {
              /* 술래 방어막: 도둑이 시선 반대쪽으로 튕김 */
              applyKnockVel(p, -fx, -fy, COPS.pullForce);
              p.pushCdUntil = now + COPS.pushCd * 1000;
              broadcast(room, { t: "cops-shot", x: Math.round(p.x), y: Math.round(p.y), hit: false, kind: "reflect" });
            } else {
              applyKnockVel(pol, fx, fy, COPS.pushForce);
              broadcast(room, { t: "cops-shot", x: Math.round(pol.x), y: Math.round(pol.y), hit: false, kind: "push" });
            }
          }
        }
        const dashing = now < (p.dashUntil || 0);
        if (Math.hypot(dx, dy) < 0.05 && dashing && p.dashDx != null) { dx = p.dashDx; dy = p.dashDy; }
        moveRelicEntity(g, p, dx, dy, dashing ? dashSpd : COPS.thiefSpeed, dt, dashing);
        p.pose = dashing ? "dash" : (inp.interact ? "stop" : (now < (p.pushFlashUntil || 0) ? "wave" : "walk"));
      } else {
        const emote = !!inp.stop;
        dx = emote ? 0 : dx; dy = emote ? 0 : dy;
        const mag = Math.hypot(dx, dy);
        if (mag > 1) { dx /= mag; dy /= mag; }
        if (mag > 0.05 && !emote) p.face = Math.atan2(dy, dx);
        const walls = g.walls || [];
        const nX = clamp(p.x + dx * COPS.thiefSpeed * dt, R, W - R);
        if (!walls.some((w) => hitRect(nX, p.y, R, w))) p.x = nX;
        const nY = clamp(p.y + dy * COPS.thiefSpeed * dt, R, H - R);
        if (!walls.some((w) => hitRect(p.x, nY, R, w))) p.y = nY;
        p.pose = (emote || mag < 0.05) ? "stop" : "walk";
      }
      if (g.mode === "relic" && inp.interact && !p.caught) {
        const j = g.jail;
        if (p.x > j.x - 34 && p.x < j.x + j.w + 34 && p.y > j.y - 34 && p.y < j.y + j.h + 34) {
          for (const t of thieves) if (t.caught) { t.caught = false; const sp = freeSpotNear(g, p.x, p.y, 55); t.x = sp.x; t.y = sp.y; t.pose = "walk"; }
        }
      }
      if (inp.interact && !p.caught) {
        let target = null, bd = COPS.interactR;
        for (const s of g.safes) {
          if (s.opened) continue;
          const d = Math.hypot(s.x - p.x, s.y - p.y);
          if (d < bd) { bd = d; target = s; }
        }
        if (target) {
          const openT = g.mode === "relic" ? (g.relicTime || 5) : COPS.openTime;
          target.progress += dt / openT;
          if (target.progress >= 1) { target.progress = 1; target.opened = true; p.steals = (p.steals || 0) + 1; }
        }
      }
    }

    if (g.mode === "relic") {
      for (const p of police) {
        const inp = p.cin || {};
        tickKnockVel(g, p, dt);
        if ((inp.shield || inp.defend) && now >= (p.shieldCdUntil || 0) && !(now < (p.shieldUntil || 0)) && now >= (p.phaseUntil || 0)) {
          p.shieldUntil = now + COPS.shieldTime * 1000;
          p.shieldCdUntil = now + COPS.shieldCd * 1000;
        }
        p.shielding = now < (p.shieldUntil || 0);
        const pCd = g.policeDashCd || COPS.phaseCd;
        const maxPhase = 2;
        if ((p.phaseCharges || 0) < maxPhase) {
          p.phaseChargeAcc = (p.phaseChargeAcc || 0) + dt;
          while ((p.phaseCharges || 0) < maxPhase && p.phaseChargeAcc >= pCd) {
            p.phaseChargeAcc -= pCd;
            p.phaseCharges = (p.phaseCharges || 0) + 1;
          }
        } else {
          p.phaseChargeAcc = 0;
        }
        /* 충전 있으면 연속 사용 가능 (최대 2회) */
        if (inp.phase && (p.phaseCharges || 0) >= 1 && !p.shielding && now >= (p.phaseUntil || 0)) {
          let dx = inp.mvx || 0, dy = inp.mvy || 0;
          if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(p.face || 0); dy = Math.sin(p.face || 0); }
          const m = Math.hypot(dx, dy) || 1;
          p.phaseDx = dx / m; p.phaseDy = dy / m;
          p.phaseUntil = now + COPS.phaseTime * 1000;
          p.phaseCharges -= 1;
          broadcast(room, { t: "cops-shot", x: Math.round(p.x), y: Math.round(p.y), hit: false, kind: "phase" });
        }
        const phasing = now < (p.phaseUntil || 0);
        let dx = inp.mvx || 0, dy = inp.mvy || 0;
        if (Math.hypot(dx, dy) < 0.05 && phasing && p.phaseDx != null) { dx = p.phaseDx; dy = p.phaseDy; }
        moveRelicEntity(g, p, dx, dy, phasing ? COPS.phaseSpeed : COPS.policeSpeed, dt, phasing);
        p.pose = p.shielding ? "defend" : (phasing ? "dash" : "walk");
        for (const t of thieves) {
          if (t.caught) continue;
          /* 밀치기/넉백 중에는 즉시 잡히지 않음 */
          if (Math.hypot(t.kbX || 0, t.kbY || 0) > 40 || Math.hypot(p.kbX || 0, p.kbY || 0) > 40) continue;
          if (Math.hypot(t.x - p.x, t.y - p.y) < COPS.catchR + COPS.r) {
            const cx = Math.round(t.x), cy = Math.round(t.y);
            t.caught = true; p.catches = (p.catches || 0) + 1;
            const j = g.jail; t.x = j.x + 15 + Math.random() * (j.w - 30); t.y = j.y + 15 + Math.random() * (j.h - 30);
            t.pose = "stop"; t.kbX = 0; t.kbY = 0;
            g.catchFeed = g.catchFeed || [];
            g.catchFeed.push({ id: uid(), pn: p.name, vn: t.name, at: now });
            g.catchFeed = g.catchFeed.filter((k) => now - k.at < MG_LOG_MS).slice(-8);
            broadcast(room, { t: "cops-shot", x: cx, y: cy, hit: true, kind: "catch" });
          }
        }
      }
    }

    const openedCount = g.safes.filter((s) => s.opened).length;
    const aliveThieves = thieves.filter((p) => !p.caught).length;
    if (thieves.length > 0 && openedCount >= g.safeCount) return endCops(room, "도둑");
    if (thieves.length > 0 && aliveThieves === 0) return endCops(room, "경찰");
    if (g.timeLeft <= 0) return endCops(room, "경찰");

    const tl = Math.max(0, Math.round(g.timeLeft));

    if (g.mode === "relic") {
      const tVis = g.thiefVision || COPS.thiefVision, pVis = g.policeVision || COPS.policeVision;
      const circlesAll = [];
      for (const t of thieves) {
        const base = { i: t.id, n: t.name, x: Math.round(t.x), y: Math.round(t.y), c: t.color, f: +(t.face || 0).toFixed(2), po: t.pose };
        if (!t.caught) circlesAll.push(Object.assign({}, base, { ph: now < (t.dashUntil || 0) ? 1 : 0 }));
        else circlesAll.push(Object.assign({}, base, { j: 1, po: t.pose || "walk" }));
      }
      for (const p of police) {
        circlesAll.push({
          i: p.id, n: p.name, x: Math.round(p.x), y: Math.round(p.y), c: "#dc2626",
          f: +(p.face || 0).toFixed(2), po: p.pose || "walk", pol: 1,
          ph: now < (p.phaseUntil || 0) ? 1 : 0,
          sh: now < (p.shieldUntil || 0) ? 1 : 0,
        });
      }
      const safesAll = g.safes.map((s) => ({ i: s.id, x: s.x, y: s.y, o: s.opened ? 1 : 0, p: +s.progress.toFixed(2) }));
      const hideoutsAll = (g.hideouts || []).map((h) => ({
        id: h.id, outer: h.outer, cavity: h.cavity, entrance: h.entrance, arrow: h.arrow ? 1 : 0,
      }));
      const guides = {
        jail: g.jail ? { x: Math.round(g.jail.x + g.jail.w / 2), y: Math.round(g.jail.y + g.jail.h / 2) } : null,
        relics: g.safes.filter((s) => !s.opened).map((s) => ({ x: s.x, y: s.y })),
      };
      for (const p of ps) {
        const isPolice = p.crole === "police";
        const vx = p.x, vy = p.y;
        const vr = isPolice ? pVis : tVis;
        const myHide = hideoutAt(g, vx, vy);
        const seen = (x, y) => canSeeRelic(g, vx, vy, x, y, vr);
        const circles = circlesAll.filter((c) => c.i === p.id || seen(c.x, c.y));
        const safes = safesAll.filter((s) => seen(s.x, s.y)).map((s) => isPolice ? Object.assign({}, s, { p: s.o ? 1 : Math.floor(s.p * 4) / 4 }) : s);
        let alert = 0, alertDist = 9999;
        if (p.crole === "thief" && !p.caught) {
          for (const pol of police) {
            const d = Math.hypot(pol.x - p.x, pol.y - p.y);
            if (d < alertDist) alertDist = d;
            if (d <= COPS.alertR) alert = 1;
          }
        }
        const msg = {
          t: "cops", role: p.crole, mode: "relic", tl, world: g.world, jail: g.jail,
          circles, safes, hideouts: hideoutsAll, inHideout: myHide,
          vx: Math.round(vx), vy: Math.round(vy), vr,
          opened: g.safes.filter((s) => s.opened).length, total: g.safeCount,
          feed: (g.catchFeed || []).filter((k) => now - k.at < MG_LOG_MS).map((k) => ({ id: k.id, pn: k.pn, vn: k.vn, at: k.at })),
          stats: {
            alive: aliveThieves,
            jailed: thieves.filter((t) => t.caught).length,
            relicsLeft: g.safeCount - openedCount,
          },
          guides,
          alert,
          alertDist: alert ? Math.round(alertDist) : null,
        };
        if (isPolice) {
          msg.catches = p.catches || 0;
          const pCd = g.policeDashCd || COPS.phaseCd;
          const ch = p.phaseCharges || 0;
          msg.phaseCharges = ch;
          msg.pcd = ch >= 2 ? 0 : Math.max(0, pCd - (p.phaseChargeAcc || 0));
          msg.phasing = now < (p.phaseUntil || 0) ? 1 : 0;
          msg.scd = Math.max(0, ((p.shieldCdUntil || 0) - now) / 1000);
          msg.shielding = now < (p.shieldUntil || 0) ? 1 : 0;
        } else if (p.crole === "thief") {
          msg.dcd = Math.max(0, ((p.dashCdUntil || 0) - now) / 1000);
          msg.dashing = now < (p.dashUntil || 0) ? 1 : 0;
          msg.pcd = Math.max(0, ((p.pushCdUntil || 0) - now) / 1000); /* push cd reuse pcd field name? use pushCd */
          msg.pushCd = Math.max(0, ((p.pushCdUntil || 0) - now) / 1000);
        }
        send(p, msg);
      }
      return;
    }
  }

  // ============================================================================================
  // 방(room) 팩토리 — 호스트 권위, PeerJS 기반
  // ============================================================================================
  function roomSummary(room) {
    return {
      code: room.code, gameType: room.gameType,
      name: room.roomName || GAME_LABELS[room.gameType] || room.gameType,
      gameLabel: GAME_LABELS[room.gameType] || room.gameType,
      roomName: room.roomName || "",
      count: room.players.size, hasPw: !!room.passwordHash,
      started: !!(room.game && room.game.started),
    };
  }

  function createHostRoom(opts) {
    opts = opts || {};
    const code = String(opts.code || uid()).toUpperCase();
    const onSend = typeof opts.onSend === "function" ? opts.onSend : function () {};
    const onBroadcast = typeof opts.onBroadcast === "function" ? opts.onBroadcast : function () {};
    const gameType = GAME_TYPES.indexOf(opts.gameType) >= 0 ? opts.gameType : "arena";

    const room = {
      code,
      gameType,
      roomName: "",
      hostId: HOST_KEY,
      players: new Map(),
      game: newGame(gameType),
      loop: null,
      countTimer: null,
      passwordHash: opts.password ? hashPw(opts.password) : null,
      _onSend: onSend,
      _onBroadcast: onBroadcast,
    };

    const hostInfo = opts.hostPlayer || {};
    const hostName = String(hostInfo.name || "방장").slice(0, 12) || "방장";
    room.roomName = sanitizeRoomName(opts.roomName, hostName + "의 " + (GAME_LABELS[gameType] || "방"));

    const hostPlayer = {
      id: HOST_KEY, peerId: HOST_KEY, room,
      name: hostName, color: COLORS[0], score: 0, alive: true,
      account: hostInfo.account || hostName,
    };
    room.players.set(HOST_KEY, hostPlayer);

    function findPlayer(peerId) {
      const pid = peerId == null ? HOST_KEY : peerId;
      return room.players.get(pid) || null;
    }

    function addPlayer(peerId, name, popts) {
      popts = popts || {};
      if (!peerId || peerId === HOST_KEY) return null;
      const existing = room.players.get(peerId);
      if (existing) return existing;
      if (room.players.size >= 16) {
        onSend(peerId, { t: "error", msg: "방 정원이 가득 찼습니다." });
        return null;
      }
      if (room.passwordHash && hashPw(popts.password || "") !== room.passwordHash) {
        onSend(peerId, { t: "error", msg: "방 비밀번호가 틀렸습니다." });
        return null;
      }
      const color = COLORS[room.players.size % COLORS.length];
      const nm = String(name || "익명").slice(0, 12) || "익명";
      const player = {
        id: peerId, peerId, room, name: nm, color,
        score: 0, alive: true, account: nm,
      };
      room.players.set(peerId, player);
      send(player, { t: "joined", code: room.code, id: peerId, isHost: false, gameType: room.gameType, roomName: room.roomName || "" });
      if (room.gameType === "arena" && room.game.started) {
        if (room.game.mode === "team") {
          player.team = smallestTeam(room.game, Array.from(room.players.values()));
          initArenaPlayer(room.game, player);
        }
      }
      pushState(room);
      scheduleRoomsBroadcast();
      return player;
    }

    function removePlayer(peerId) {
      const pid = peerId == null ? HOST_KEY : peerId;
      if (pid === HOST_KEY) return; // 호스트 자신은 이 API로 제거되지 않음 — destroy()로 방을 종료
      if (!room.players.has(pid)) return;
      room.players.delete(pid);
      pushState(room);
      scheduleRoomsBroadcast();
    }

    function handleMessage(fromId, msg) {
      if (!msg || typeof msg !== "object") return;
      const pid = fromId == null ? HOST_KEY : fromId;

      if (msg.t === "join") { addPlayer(pid, msg.name, { password: msg.password }); return; }
      if (msg.t === "leave") { removePlayer(pid); return; }

      const player = findPlayer(pid);
      if (!player) return;

      if (msg.t === "ranking" || msg.t === "rankings") { send(player, { t: "rankings", rankings: getRankings() }); return; }
      if (msg.t === "control-layouts") { send(player, { t: "control-layouts", layouts: getControlLayouts() }); return; }
      if (msg.t === "rooms" || msg.t === "list") { send(player, { t: "rooms", rooms: [roomSummary(room)] }); return; }
      if (msg.t === "state") { pushState(room); return; }
      if (msg.t === "action") {
        try { handleAction(room, player, msg); } catch (e) { console.warn("GWMgEngine: action 처리 오류", e); }
        return;
      }
    }

    function getState() {
      return {
        code: room.code, gameType: room.gameType, roomName: room.roomName,
        players: playersPublic(room), game: gameStateForClient(room), rankings: getRankings(),
      };
    }

    function destroy() {
      if (room.loop) { clearInterval(room.loop); room.loop = null; }
      if (room.countTimer) { clearInterval(room.countTimer); room.countTimer = null; }
      room.players.clear();
    }

    // 최초 상태 통지(호스트 자신에게)
    pushState(room);

    return {
      handleMessage,
      addPlayer,
      removePlayer,
      destroy,
      getState,
      code: room.code,
    };
  }

  global.GWMgEngine = {
    createHostRoom,
    GAME_TYPES,
    GAME_LABELS,
  };
})(window);

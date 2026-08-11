// 미니게임 실시간 서버 (WebSocket)
// 팀과 무관하게 유저들이 방(room)을 만들어 실시간으로 참여하는 미니게임 모음.
//  - roulette : 룰렛 (모두 같은 결과를 실시간으로 봄)
//  - ladder   : 사다리타기
//  - draw     : 제비뽑기
//  - arena    : 실시간 아레나 (shooting=슈팅 / tag=술래잡기) - 모바일 조이스틱

import { WebSocketServer } from "ws";
import fs from "fs";
import crypto from "crypto";
import { listRelicMaps, loadRelicMap, saveRelicMap, updateRelicMap, deleteRelicMap } from "./relicMaps.js";
import { getControlLayouts } from "./mgSettings.js";
import { emptyGridMap } from "./relicGrid.js";
import { newKitchenGame, newKitchenTutorialGame, kitchenClientState, handleKitchenAction, handleKitchenTutorialAction } from "./kitchen.js";

// ---------------------------------------------------------------- 계정 / 랭킹
const MG_FILE = new URL("./mg-data.json", import.meta.url);
const accounts = new Map(); // name -> { name, pw, games: { [gameType]: {score,wins,plays} } }
try {
  const d = JSON.parse(fs.readFileSync(MG_FILE, "utf8"));
  for (const a of d.accounts || []) accounts.set(a.name, a);
} catch (e) {}
let mgSaveTimer = null;
function saveAccounts() {
  if (mgSaveTimer) return;
  mgSaveTimer = setTimeout(() => {
    mgSaveTimer = null;
    try { fs.writeFileSync(MG_FILE, JSON.stringify({ accounts: [...accounts.values()] })); } catch (e) {}
  }, 800);
}
function hashPw(p) { return crypto.createHash("sha256").update(String(p)).digest("hex"); }
function authAccount(name, pw) {
  name = String(name || "").trim().slice(0, 12);
  if (name.length < 1) return { ok: false, err: "이름을 입력하세요." };
  if (String(pw || "").length < 1) return { ok: false, err: "비밀번호를 입력하세요." };
  const h = hashPw(pw);
  let acc = accounts.get(name);
  if (!acc) { acc = { name, pw: h, games: {} }; accounts.set(name, acc); saveAccounts(); return { ok: true, acc, created: true }; }
  if (acc.pw !== h) return { ok: false, err: "비밀번호가 일치하지 않습니다." };
  return { ok: true, acc };
}
const STAT_FIELDS = ["kills", "deaths", "catches", "steals"];
function award(accName, game, pts, win, extra) {
  const acc = accounts.get(accName); if (!acc) return;
  const gs = acc.games[game] || (acc.games[game] = {});
  gs.score = (gs.score || 0) + pts;
  gs.plays = (gs.plays || 0) + 1;
  if (win) gs.wins = (gs.wins || 0) + 1;
  if (extra) {
    for (const k of STAT_FIELDS) if (extra[k]) gs[k] = (gs[k] || 0) + extra[k];
    if (extra.streak) gs.streak = Math.max(gs.streak || 0, extra.streak);
  }
  saveAccounts();
}
const RANK_GAMES = ["arena", "cops", "kitchen"];
function statRow(a, game) {
  const g = a.games[game] || {};
  return {
    name: a.name,
    score: g.score || 0, wins: g.wins || 0, plays: g.plays || 0,
    kills: g.kills || 0, deaths: g.deaths || 0,
    catches: g.catches || 0, steals: g.steals || 0, streak: g.streak || 0,
  };
}
function rankingFor(game, top = 20) {
  return [...accounts.values()]
    .map((a) => statRow(a, game))
    .filter((r) => r.plays > 0)
    .sort((a, b) => b.score - a.score || b.wins - a.wins || b.kills - a.kills)
    .slice(0, top);
}
function overallRanking(top = 20) {
  return [...accounts.values()]
    .map((a) => {
      const o = { name: a.name, score: 0, wins: 0, plays: 0, kills: 0, deaths: 0, catches: 0, steals: 0, streak: 0 };
      for (const g of RANK_GAMES) {
        const s = statRow(a, g);
        o.score += s.score; o.wins += s.wins; o.plays += s.plays;
        o.kills += s.kills; o.deaths += s.deaths; o.catches += s.catches; o.steals += s.steals;
        o.streak = Math.max(o.streak, s.streak);
      }
      return o;
    })
    .filter((r) => r.plays > 0)
    .sort((a, b) => b.score - a.score || b.wins - a.wins || b.kills - a.kills)
    .slice(0, top);
}
function allRankings() {
  const o = { overall: overallRanking() };
  for (const g of RANK_GAMES) o[g] = rankingFor(g);
  return o;
}

const MG_ADMIN_PW = "yes33!";
const CLEARABLE_GAMES = ["arena", "cops", "kitchen", "kitchen-tut"];
const GAME_LABEL = {
  arena: "아레나", cops: "경찰과 도둑", kitchen: "주방장", "kitchen-tut": "주방 튜토리얼",
  roulette: "룰렛", ladder: "사다리타기", draw: "제비뽑기",
};

function saveAccountsNow() {
  if (mgSaveTimer) { clearTimeout(mgSaveTimer); mgSaveTimer = null; }
  try { fs.writeFileSync(MG_FILE, JSON.stringify({ accounts: [...accounts.values()] })); } catch (e) {}
}

function hasAnyGameStats(acc) {
  for (const gs of Object.values(acc.games || {})) {
    if (gs && ((gs.plays || 0) > 0 || (gs.score || 0) > 0 || (gs.wins || 0) > 0)) return true;
  }
  return false;
}

function pruneEmptyAccounts(checkNames = null) {
  let removed = 0;
  const names = checkNames?.length ? checkNames : [...accounts.keys()];
  for (const name of names) {
    const acc = accounts.get(name);
    if (acc && !hasAnyGameStats(acc)) {
      accounts.delete(name);
      removed++;
    }
  }
  return removed;
}

function accountListPublic() {
  return [...accounts.values()]
    .map((a) => {
      const games = {};
      let totalScore = 0, totalPlays = 0;
      for (const [g, gs] of Object.entries(a.games || {})) {
        if (!gs || (!gs.plays && !gs.score)) continue;
        games[g] = {
          score: gs.score || 0, wins: gs.wins || 0, plays: gs.plays || 0,
          label: GAME_LABEL[g] || g,
        };
        totalScore += gs.score || 0;
        totalPlays += gs.plays || 0;
      }
      return { name: a.name, games, totalScore, totalPlays, gameCount: Object.keys(games).length };
    })
    .filter((a) => a.gameCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

const startupPruned = pruneEmptyAccounts();
if (startupPruned > 0) saveAccountsNow();

function clearRankings(gameKeys, userNames = null) {
  const isAll = gameKeys === "all";
  const keys = isAll ? null : gameKeys.filter((k) => CLEARABLE_GAMES.includes(k));
  let cleared = 0;
  const names = userNames?.length ? userNames : null;
  const targets = names
    ? names.map((n) => accounts.get(n)).filter(Boolean)
    : [...accounts.values()];
  const affectedNames = [];
  for (const acc of targets) {
    affectedNames.push(acc.name);
    if (isAll) {
      const n = Object.keys(acc.games || {}).length;
      acc.games = {};
      cleared += n;
    } else {
      for (const k of keys) {
        if (acc.games?.[k]) { delete acc.games[k]; cleared++; }
      }
    }
  }
  const removedAccounts = pruneEmptyAccounts(names || affectedNames);
  saveAccountsNow();
  return { keys: isAll ? ["all"] : keys, cleared, users: names || null, removedAccounts };
}

function broadcastRankings(wss) {
  if (!wss) return;
  const payload = JSON.stringify({ t: "rankings", rankings: allRankings() });
  for (const client of wss.clients) {
    try { client.send(payload); } catch (e) {}
  }
}

const rooms = new Map(); // code -> room
const lobby = new Set(); // 아직 방에 들어가지 않은 (허브에 있는) ws
const MAX_ROOMS = 300;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const GAME_NAMES = { roulette: "룰렛", ladder: "사다리타기", draw: "제비뽑기", arena: "아레나", cops: "경찰과 도둑", kitchen: "최고의 주방장", "kitchen-tut": "주방 튜토리얼" };

function sanitizeRoomName(raw, fallback) {
  const s = String(raw || "").trim().slice(0, 20);
  return s || fallback;
}

function roomsList() {
  return [...rooms.values()].map((r) => ({
    code: r.code, gameType: r.gameType,
    name: r.roomName || GAME_NAMES[r.gameType] || r.gameType,
    gameLabel: GAME_NAMES[r.gameType] || r.gameType,
    roomName: r.roomName || "",
    count: r.players.size, hasPw: !!r.password, started: !!(r.game && r.game.started),
  }));
}
// 로비 브로드캐스트는 디바운스로 묶어 부하를 줄인다.
let roomsDirty = false;
function scheduleRoomsBroadcast() {
  if (roomsDirty) return;
  roomsDirty = true;
  setTimeout(() => {
    roomsDirty = false;
    if (lobby.size === 0) return;
    const s = JSON.stringify({ t: "rooms", rooms: roomsList() });
    for (const ws of lobby) { try { ws.send(s); } catch (e) {} }
  }, 300);
}

let mgWss = null;

function enterLobby(ws) {
  lobby.add(ws);
  send(ws, { t: "rooms", rooms: roomsList() });
  send(ws, { t: "control-layouts", layouts: getControlLayouts() });
}
function broadcastControlLayouts() {
  if (!mgWss) return;
  const msg = JSON.stringify({ t: "control-layouts", layouts: getControlLayouts() });
  for (const client of mgWss.clients) {
    try { client.send(msg); } catch (e) {}
  }
}

const kitchenCtx = () => ({
  broadcast, pushState, scheduleRoomsBroadcast, award, send, cancelCountdown, startCountdown,
});

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899",
  "#06b6d4", "#f97316", "#14b8a6", "#8b5cf6", "#84cc16", "#f43f5e"];

// ---------------------------------------------------------------- 방 유틸
function playersPublic(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id, name: p.name, isHost: p.id === room.hostId, color: p.color,
    score: p.score || 0, alive: p.alive !== false, role: p.role || null,
    ready: !!p.ready,
    team: p.team != null ? p.team : (p.chosenTeam != null ? p.chosenTeam : null),
  }));
}

function send(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch (e) {}
}
function broadcast(room, obj) {
  const s = JSON.stringify(obj);
  for (const p of room.players.values()) {
    try { p.ws.send(s); } catch (e) {}
  }
}

// 대기방 → 방장 Go → 5초 카운트다운 후 실제 시작
function cancelCountdown(room) {
  if (room.countTimer) { clearInterval(room.countTimer); room.countTimer = null; }
  if (room.game) room.game.counting = false;
}
const GAME_TYPES = ["roulette", "ladder", "draw", "arena", "cops", "kitchen", "kitchen-tut"];
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
  if (!GAME_TYPES.includes(newType)) return false;
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
      drawn: g.drawn, // { playerId: {name, labelIndex} }
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
  if (gameType === "arena") return {
    mode: "team", teamCount: 2, started: false, world: { w: 1760, h: 1180 },
    bullets: [], items: [], effects: [], walls: [], pushables: [], nexus: [],
    timeLeft: 0, winner: null,
  };
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

// ---------------------------------------------------------------- 게임별 액션
function handleAction(room, player, msg) {
  const isHost = player.id === room.hostId;
  const g = room.game;

  if (msg.a === "setgame" && isHost) {
    const gt = String(msg.gameType || "");
    if (!changeGameType(room, gt)) {
      send(player.ws, { t: "error", msg: "지금은 게임을 변경할 수 없습니다. 진행·카운트다운 중이면 먼저 정지하세요." });
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
      if (n < 2 || n > 12) { send(player.ws, { t: "error", msg: "참가자와 결과는 2~12개, 개수가 같아야 합니다." }); return; }
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
      if (labels.length < 2) { send(player.ws, { t: "error", msg: "제비는 2개 이상이어야 합니다." }); return; }
      g.labels = labels.slice(0, 30);
      g.total = g.labels.length;
      g.shuffled = shuffle(g.labels.map((_, i) => i));
      g.drawn = {};
      pushState(room);
    } else if (msg.a === "draw") {
      if (g.drawn[player.id]) return; // 이미 뽑음
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
    } else if (msg.a === "ready") {
      player.ready = !!msg.ready; pushState(room);
    } else if (msg.a === "team") {
      const tv = Math.round(Number(msg.team));
      if (g.started) { if (tv >= 0 && tv < g.teamCount) { player.team = tv; respawnPlayer(g, player); pushState(room); } }
      else { player.chosenTeam = clamp(tv, 0, g.teamCount - 1); pushState(room); }
    } else if (msg.a === "stop" && isHost) {
      cancelCountdown(room); stopArena(room);
    } else if (msg.a === "input") {
      player.input = {
        mvx: clamp(Number(msg.mvx) || 0, -1, 1),
        mvy: clamp(Number(msg.mvy) || 0, -1, 1),
        angle: Number(msg.angle) || 0,
        shoot: !!msg.shoot,
        dash: !!msg.dash,
      };
    }
    return;
  }

  // -------- 경찰과 도둑 (AI인척)
  if (room.gameType === "cops") {
    if (msg.a === "set" && isHost) {
      if (msg.mode) g.mode = ["relic", "mimic"].includes(msg.mode) ? msg.mode : "relic";
      g.policeCount = clamp(Math.round(Number(msg.policeCount) || 1), 1, 3);
      g.botCount = clamp(Math.round(Number(msg.botCount) || 10), 4, 24);
      if (g.mode === "relic") g.safeCount = clamp(Math.round(Number(msg.safeCount) || 4), 3, 8);
      if (msg.relicTime != null) g.relicTime = clamp(Math.round(Number(msg.relicTime) || 5), 2, 20);
      if (msg.thiefVision != null) g.thiefVision = clamp(Math.round(Number(msg.thiefVision) || 230), 130, 520);
      if (msg.policeVision != null) g.policeVision = clamp(Math.round(Number(msg.policeVision) || 350), 130, 640);
      if (g.mode === "relic") {
        if (msg.thiefDashCd != null) g.thiefDashCd = clamp(Number(msg.thiefDashCd) || 10, 4, 20);
        if (msg.policeDashCd != null) g.policeDashCd = clamp(Number(msg.policeDashCd) || 6, 3, 15);
        if (msg.mapId != null) { g.mapId = String(msg.mapId) === "random" ? "random" : String(msg.mapId); applyRelicMapPreview(g); }
      }
      if (g.mode === "mimic") {
        g.teamMode = msg.teamMode === "solo" ? "solo" : "team";
        g.teamsCount = clamp(Math.round(Number(msg.teamsCount) || 2), 2, 4);
      }
      pushState(room);
    } else if (msg.a === "maps") {
      send(player.ws, { t: "relic-maps", maps: listRelicMaps() });
    } else if (msg.a === "mapgen" && isHost && g.mode === "relic" && !g.started) {
      g.mapId = "random";
      applyRelicMapPreview(g);
      pushState(room);
    } else if (msg.a === "mapsave" && isHost && g.mode === "relic" && !g.started) {
      const saved = saveRelicMap(msg.name, { world: g.world, walls: g.walls, jail: g.jail });
      g.mapId = saved.id;
      g.mapName = saved.name;
      pushState(room);
      send(player.ws, { t: "relic-maps", maps: listRelicMaps() });
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
        sit: !!msg.sit,
        wave: !!msg.wave,
        shoot: !!msg.shoot,
        stab: !!msg.stab,
        defend: !!msg.defend,
        dash: !!msg.dash,
        phase: !!msg.phase,
      };
    }
    return;
  }

  // -------- 최고의 주방장 / 튜토리얼
  if (room.gameType === "kitchen") {
    handleKitchenAction(room, player, msg, { ...kitchenCtx(), isHost, g, send, pushState, startCountdown });
    return;
  }
  if (room.gameType === "kitchen-tut") {
    handleKitchenTutorialAction(room, player, msg, { ...kitchenCtx(), isHost, g, send, pushState, startCountdown });
    return;
  }
}

// ---------------------------------------------------------------- 사다리 생성
function genLadder(cols, rows) {
  const rungs = []; // rungs[row] = array of left-column indices that have a horizontal bar to col+1
  for (let r = 0; r < rows; r++) {
    const rowRungs = [];
    let c = 0;
    while (c < cols - 1) {
      if (Math.random() < 0.5) { rowRungs.push(c); c += 2; } // 인접 가로줄 겹침 방지
      else c += 1;
    }
    rungs.push(rowRungs);
  }
  return rungs;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// ---------------------------------------------------------------- 아레나 (팀 슈팅 / 숨바꼭질)
const TEAM_COLORS = ["#ef4444", "#3b82f6", "#22c55e"];
const ITEM_TYPES = [
  { type: "heal", p: 0.34, color: "#22c55e" },
  { type: "speed", p: 0.24, color: "#38bdf8" },
  { type: "damage", p: 0.22, color: "#f97316" },
  { type: "revive", p: 0.20, color: "#e879f9" },
];
const MG_LOG_MS = 5000;

const ARENA = {
  speed: 205, bulletSpeed: 560, bulletTTL: 1.1, cooldown: 0.26, dmg: 16, hp: 100, pr: 15, br: 5,
  dashSpeed: 660, dashTime: 0.16, dashCd: 3.2,
  respawn: 10, nexusHp: 600, nexusR: 30, itemMax: 8, itemEvery: 5.0, dt: 0.04,
  teamTime: 420,
};
function rectOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function hitRect(px, py, pr, r) {
  const cx = clamp(px, r.x, r.x + r.w), cy = clamp(py, r.y, r.y + r.h);
  return Math.hypot(px - cx, py - cy) < pr;
}
function inAnyRect(px, py, rects) { for (const r of rects) if (px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h) return true; return false; }

function buildMap(g) {
  const W = g.world.w, H = g.world.h, cx = W / 2, cy = H / 2;
  const walls = [];
  const add = (x, y, w, h) => walls.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  // 중앙 요새 (틈이 뚫린 상자형 챔버)
  add(cx - 150, cy - 150, 100, 24); add(cx + 50, cy - 150, 100, 24);
  add(cx - 150, cy + 126, 100, 24); add(cx + 50, cy + 126, 100, 24);
  add(cx - 150, cy - 150, 24, 100); add(cx - 150, cy + 50, 24, 100);
  add(cx + 126, cy - 150, 24, 100); add(cx + 126, cy + 50, 24, 100);
  // 세로 분할벽 (통로 형성) — 좌우 대칭
  add(W * 0.30, 130, 26, 300); add(W * 0.30, H - 430, 26, 300);
  add(W * 0.70 - 26, 130, 26, 300); add(W * 0.70 - 26, H - 430, 26, 300);
  // 가로 분할벽 — 상하 대칭
  add(150, H * 0.32, 300, 26); add(W - 450, H * 0.32, 300, 26);
  add(150, H * 0.68 - 26, 300, 26); add(W - 450, H * 0.68 - 26, 300, 26);
  // 사방 커버 블록 (대칭 배치)
  const cover = [[W * 0.2, H * 0.2], [W * 0.8, H * 0.2], [W * 0.2, H * 0.8], [W * 0.8, H * 0.8],
    [W * 0.5, H * 0.26], [W * 0.5, H * 0.74], [W * 0.26, H * 0.5], [W * 0.74, H * 0.5]];
  for (const [bx, by] of cover) add(bx - 54, by - 18, 108, 36);
  // 미는 상자
  const pushables = [
    { x: cx - 280, y: cy - 20, w: 42, h: 42 }, { x: cx + 240, y: cy - 20, w: 42, h: 42 },
    { x: cx - 20, y: cy - 280, w: 42, h: 42 }, { x: cx - 20, y: cy + 240, w: 42, h: 42 },
    { x: W * 0.36, y: H * 0.5, w: 42, h: 42 }, { x: W * 0.64 - 42, y: H * 0.5, w: 42, h: 42 },
  ];
  g.walls = walls; g.pushables = pushables;
  // 팀 진영
  const tc = g.teamCount;
  if (tc === 2) g.bases = [{ x: 120, y: cy }, { x: W - 120, y: cy }];
  else g.bases = [{ x: 140, y: H - 140 }, { x: W - 140, y: H - 140 }, { x: cx, y: 130 }];
}
function spawnAtBase(g, team) {
  const b = g.bases[team] || { x: g.world.w / 2, y: g.world.h / 2 };
  for (let i = 0; i < 30; i++) {
    const x = clamp(b.x + (Math.random() - 0.5) * 120, ARENA.pr, g.world.w - ARENA.pr);
    const y = clamp(b.y + (Math.random() - 0.5) * 120, ARENA.pr, g.world.h - ARENA.pr);
    if (!inAnyRect(x, y, g.walls)) return { x, y };
  }
  return { x: b.x, y: b.y };
}
function randFree(g, margin = 40) {
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
  p.input = { mvx: 0, mvy: 0, angle: 0, shoot: false };
  const sp = spawnAtBase(g, p.team);
  p.x = sp.x; p.y = sp.y; p.angle = 0;
}
function respawnPlayer(g, p) {
  const sp = spawnAtBase(g, p.team);
  p.x = sp.x; p.y = sp.y; p.hp = ARENA.hp; p.alive = true;
}
function startArena(room) {
  const g = room.game;
  g.mode = "team";
  g.bullets = []; g.items = []; g.effects = []; g.winner = null;
  g.itemTimer = ARENA.itemEvery;
  const ps = [...room.players.values()];
  buildMap(g);
  // 팀 배정 (선택 존중 + 균형)
  ps.forEach((p) => { p.team = (p.chosenTeam != null && p.chosenTeam < g.teamCount) ? p.chosenTeam : null; });
  ps.forEach((p) => { if (p.team == null) p.team = smallestTeam(g, ps); });
  g.nexus = g.bases.slice(0, g.teamCount).map((b, i) => ({ team: i, x: b.x, y: b.y, hp: ARENA.nexusHp, max: ARENA.nexusHp, alive: true }));
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
}
// 축 분리 이동 + 벽/미는상자 충돌
function moveAxis(g, p, axis, delta) {
  const pr = ARENA.pr;
  const nx = axis === "x" ? p.x + delta : p.x;
  const ny = axis === "y" ? p.y + delta : p.y;
  for (const w of g.walls) if (hitRect(nx, ny, pr, w)) return;
  for (const box of g.pushables) {
    if (hitRect(nx, ny, pr, box)) {
      const moved = axis === "x" ? { ...box, x: box.x + delta } : { ...box, y: box.y + delta };
      if (moved.x < 0 || moved.y < 0 || moved.x + box.w > g.world.w || moved.y + box.h > g.world.h) return;
      for (const w of g.walls) if (rectOverlap(moved, w)) return;
      for (const b2 of g.pushables) if (b2 !== box && rectOverlap(moved, b2)) return;
      box.x = moved.x; box.y = moved.y;
    }
  }
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
function damagePlayer(g, p, dmg, now, room, ownerId) {
  const wasAlive = p.alive;
  p.hp -= dmg;
  if (p.hp <= 0) {
    p.alive = false;
    if (p.reviveCharge) { p.reviveCharge = false; p.respawnAt = now; }
    else p.respawnAt = now + ARENA.respawn * 1000;
    p.deaths = (p.deaths || 0) + 1; p.streak = 0;
    const killer = room.players.get(ownerId);
    if (wasAlive && killer && killer !== p && killer.team !== p.team) {
      killer.score = (killer.score || 0) + 1;
      killer.kills = (killer.kills || 0) + 1;
      killer.streak = (killer.streak || 0) + 1;
      killer.bestStreak = Math.max(killer.bestStreak || 0, killer.streak);
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
  const ps = [...room.players.values()];

  g.itemTimer -= dt; if (g.itemTimer <= 0 && g.items.length < ARENA.itemMax) { g.itemTimer = ARENA.itemEvery; spawnItem(g); }

  for (const p of ps) {
    if (!p.alive) { if (now >= p.respawnAt) respawnPlayer(g, p); else continue; }
    const inp = p.input || {};
    if (p.speedUntil && now > p.speedUntil) p.speedUntil = 0;
    if (p.dmgUntil && now > p.dmgUntil) p.dmgUntil = 0;
    // 대쉬
    if (inp.dash && now >= (p.dashCdUntil || 0)) {
      let dx = inp.mvx || 0, dy = inp.mvy || 0;
      if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(p.angle); dy = Math.sin(p.angle); }
      const m = Math.hypot(dx, dy) || 1; p.dashDx = dx / m; p.dashDy = dy / m;
      p.dashUntil = now + ARENA.dashTime * 1000; p.dashCdUntil = now + ARENA.dashCd * 1000;
    }
    let speed = ARENA.speed * (p.speedUntil ? 1.5 : 1);
    let dx, dy;
    if (now < p.dashUntil) { dx = p.dashDx; dy = p.dashDy; speed = ARENA.dashSpeed; }
    else { dx = inp.mvx || 0; dy = inp.mvy || 0; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } }
    if (inp.angle != null) p.angle = inp.angle;
    moveAxis(g, p, "x", dx * speed * dt);
    moveAxis(g, p, "y", dy * speed * dt);
    p.x = clamp(p.x, pr, W - pr); p.y = clamp(p.y, pr, H - pr);

    if (inp.shoot && now - (p.lastShot || 0) >= ARENA.cooldown * 1000) {
      p.lastShot = now;
      const dmg = ARENA.dmg * (p.dmgUntil ? 1.7 : 1);
      g.bullets.push({ x: p.x + Math.cos(p.angle) * (pr + 4), y: p.y + Math.sin(p.angle) * (pr + 4), vx: Math.cos(p.angle) * ARENA.bulletSpeed, vy: Math.sin(p.angle) * ARENA.bulletSpeed, owner: p.id, team: p.team, dmg, ttl: ARENA.bulletTTL });
    }
    for (const it of g.items) { if (!it.taken && Math.hypot(it.x - p.x, it.y - p.y) < pr + 12) { it.taken = true; applyItem(p, it.type, now); } }
  }
  g.items = g.items.filter((it) => !it.taken);

  for (const b of g.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.ttl -= dt;
    if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) { b.ttl = 0; continue; }
    let blocked = false; for (const w of g.walls) if (hitRect(b.x, b.y, ARENA.br, w)) { blocked = true; break; }
    if (!blocked) for (const bx of g.pushables) if (hitRect(b.x, b.y, ARENA.br, bx)) { blocked = true; break; }
    if (blocked) { b.ttl = 0; continue; }
    for (const p of ps) { if (!p.alive || p.team === b.team) continue; if (Math.hypot(p.x - b.x, p.y - b.y) < pr + ARENA.br) { damagePlayer(g, p, b.dmg, now, room, b.owner); b.ttl = 0; break; } }
    if (b.ttl <= 0) continue;
    for (const nx of g.nexus) { if (!nx.alive || nx.team === b.team) continue; if (Math.hypot(nx.x - b.x, nx.y - b.y) < ARENA.nexusR) { nx.hp -= b.dmg; b.ttl = 0; if (nx.hp <= 0) { nx.hp = 0; nx.alive = false; } break; } }
  }
  g.bullets = g.bullets.filter((b) => b.ttl > 0).slice(-260);
  g.effects.forEach((e) => (e.ttl -= dt)); g.effects = g.effects.filter((e) => e.ttl > 0);
  const aliveTeams = [...new Set(g.nexus.filter((n) => n.alive).map((n) => n.team))];
  if (g.nexus.length && aliveTeams.length <= 1) return endArena(room, aliveTeams.length === 1 ? aliveTeams[0] : -1);

  if (g.timeLeft <= 0) return endArena(room, -1);
  broadcastArena(room, now, ps);
}
function broadcastArena(room, now, ps) {
  const g = room.game;
  const tl = Math.max(0, Math.round(g.timeLeft));
  const feed = (g.killFeed || []).filter((k) => now - k.at < MG_LOG_MS);
  const payload = {
    t: "arena", mode: "team", tl,
    feed: feed.map((k) => ({ id: k.id, kn: k.kn, vn: k.vn, ktm: k.ktm, vtm: k.vtm, at: k.at })),
    ps: ps.map((p) => ({
      i: p.id, x: Math.round(p.x), y: Math.round(p.y), a: +(p.angle || 0).toFixed(2),
      h: Math.max(0, Math.round(p.hp)), al: p.alive ? 1 : 0, tm: p.team, n: p.name,
      s: p.score || 0, dash: now < p.dashUntil ? 1 : 0,
      dcd: Math.max(0, ((p.dashCdUntil || 0) - now) / 1000),
      sp: p.speedUntil ? 1 : 0, dm: p.dmgUntil ? 1 : 0, rv: p.reviveCharge ? 1 : 0,
    })),
    b: g.bullets.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), tm: b.team })),
    it: g.items.map((it) => ({ x: it.x, y: it.y, k: it.type })),
    px: g.pushables.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), w: b.w, h: b.h })),
    nx: g.nexus.map((n) => ({ tm: n.team, x: n.x, y: n.y, h: Math.max(0, Math.round(n.hp)), m: n.max, al: n.alive ? 1 : 0 })),
    fx: g.effects.map((e) => ({ x: e.x, y: e.y, r: e.r })),
  };
  broadcast(room, payload);
}

// ---------------------------------------------------------------- 경찰과 도둑 / AI배틀
const COPS = {
  botSpeed: 108, thiefSpeed: 128, dt: 0.045,
  matchTime: 120, openTime: 3.2, interactR: 42, r: 14,
  // 유물부수기: 술래는 도망자보다 느리지만 벽 돌파(돌진) 스킬
  policeSpeed: 108, catchR: 32,
  phaseSpeed: 300, phaseTime: 0.48, phaseCd: 6.0,
  thiefDashSpeed: 250, thiefDashTime: 0.34,
  // 유물부수기 시야(안개) 기본값
  thiefVision: 230, policeVision: 350,
  // 유물부수기 통로 최소 폭 (캐릭터 r=14×2 + 술래·도망자 동시 통과 여유)
  passage: 72,
  // AI배틀(mimic)
  playerSpeed: 120, stabR: 46, stabHalfAngle: 0.95, stabWindup: 0.16, stabActive: 0.16, stabCd: 0.85,
  defendMax: 1.0, defendCd: 2.2, mimicTime: 180,
  mimicColor: "#94a3b8",
};
const POSES = ["walk", "stop", "sit", "wave"];
function randPos(g, margin = 34) {
  return { x: margin + Math.random() * (g.world.w - margin * 2), y: margin + Math.random() * (g.world.h - margin * 2) };
}
function freeSpotMimic(g, margin = 46) {
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
  if (!walls.some((w) => hitRect(nX, p.y, R, w))) p.x = nX;
  const nY = clamp(p.y + dy * speed * dt, R, H - R);
  if (!walls.some((w) => hitRect(p.x, nY, R, w))) p.y = nY;
}
function stepBotMimic(g, b, dt) {
  const R = COPS.r, W = g.world.w, H = g.world.h, walls = g.walls || [];
  b.wt -= dt;
  if (b.wt <= 0) {
    const r = Math.random();
    if (r < 0.5) { b.pose = "walk"; b.dir += (Math.random() - 0.5) * 2.4; b.wt = 0.7 + Math.random() * 1.8; }
    else if (r < 0.72) { b.pose = "stop"; b.wt = 0.5 + Math.random() * 1.3; }
    else if (r < 0.87) { b.pose = "sit"; b.wt = 1.0 + Math.random() * 2.0; }
    else { b.pose = "wave"; b.wt = 0.8 + Math.random() * 1.4; }
  }
  const mv = b.pose === "walk" ? 1 : 0;
  let nx = b.x + Math.cos(b.dir) * COPS.botSpeed * mv * dt;
  let ny = b.y + Math.sin(b.dir) * COPS.botSpeed * mv * dt;
  if (nx < R || nx > W - R) { b.dir = Math.PI - b.dir; nx = clamp(nx, R, W - R); }
  if (ny < R || ny > H - R) { b.dir = -b.dir; ny = clamp(ny, R, H - R); }
  if (walls.some((w) => hitRect(nx, ny, R, w))) { b.dir += Math.PI * 0.6; b.wt = 0.4; }
  else { b.x = nx; b.y = ny; }
  b.face = b.dir;
}
function stepBot(g, b, dt) {
  const R = COPS.r, W = g.world.w, H = g.world.h;
  b.wt -= dt;
  if (b.wt <= 0) {
    const r = Math.random();
    if (r < 0.5) { b.pose = "walk"; b.dir += (Math.random() - 0.5) * 2.4; b.wt = 0.7 + Math.random() * 1.8; }
    else if (r < 0.72) { b.pose = "stop"; b.wt = 0.5 + Math.random() * 1.3; }
    else if (r < 0.87) { b.pose = "sit"; b.wt = 1.0 + Math.random() * 2.0; }
    else { b.pose = "wave"; b.wt = 0.8 + Math.random() * 1.4; }
  }
  const mv = b.pose === "walk" ? 1 : 0;
  let nx = b.x + Math.cos(b.dir) * COPS.botSpeed * mv * dt;
  let ny = b.y + Math.sin(b.dir) * COPS.botSpeed * mv * dt;
  if (nx < R || nx > W - R) { b.dir = Math.PI - b.dir; nx = clamp(nx, R, W - R); }
  if (ny < R || ny > H - R) { b.dir = -b.dir; ny = clamp(ny, R, H - R); }
  b.x = nx; b.y = ny; b.face = b.dir;
}
// 미로 벽 사이·벽 뚫린 구멍(통로)이 최소 PASSAGE 이상이 되도록 보정
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
      g.world = { ...m.world };
      g.walls = m.walls.map((w) => ({ ...w }));
      g.jail = m.jail ? { ...m.jail } : defaultRelicJail(g);
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
export function generateRelicMazeData() {
  return emptyGridMap();
}
function rectContains(r, px, py) { return px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h; }
function relicBlocks(g) {
  const blocks = [...(g.walls || [])];
  for (const h of g.hideouts || []) blocks.push(...h.shells);
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
    g.hideouts.push({ id: g.hideouts.length, ...h });
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
  const c = g.hideouts?.find((h) => hideoutAt(g, p.x, p.y) === h.id)?.cavity;
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
  return grid.slice(0, count).map(([rx, ry], i) => ({
    id: i,
    x: clamp(Math.round(W * rx), 64, W - 64),
    y: clamp(Math.round(H * ry), 64, H - 64),
  }));
}
function carveArea(g, rect) { g.walls = g.walls.filter((w) => !rectOverlap(w, rect)); }
function freeSpotCops(g, margin = 46) {
  const blocks = relicBlocks(g);
  for (let i = 0; i < 100; i++) {
    const x = margin + Math.random() * (g.world.w - margin * 2);
    const y = margin + Math.random() * (g.world.h - margin * 2);
    if (hideoutAt(g, x, y) !== null) continue;
    if (!blocks.some((w) => hitRect(x, y, COPS.r + 6, w))) return { x, y };
  }
  return { x: g.world.w / 2, y: g.world.h / 2 };
}
function freeSpotNear(g, cx, cy, rad = 60) {
  const blocks = relicBlocks(g);
  const W = g.world.w, H = g.world.h, R = COPS.r;
  for (let i = 0; i < 40; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 18 + Math.random() * rad;
    const x = clamp(cx + Math.cos(ang) * dist, R + 6, W - R - 6);
    const y = clamp(cy + Math.sin(ang) * dist, R + 6, H - R - 6);
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
  const ps = shuffle([...room.players.values()]);
  ps.forEach((p) => { p.ready = false; });
  g.bots = [];
  if (g.mode === "mimic") {
    buildMimicMap(g);
    const mc = COPS.mimicColor;
    for (let i = 0; i < g.botCount; i++) {
      const sp = freeSpotMimic(g);
      g.bots.push({ id: "b" + i, x: sp.x, y: sp.y, dir: Math.random() * Math.PI * 2, face: 0, wt: 0, pose: "walk", color: mc, dead: false });
    }
  }

  // ── AI처럼 행동하기 (mimic): 경찰 없음, 전원 찌르기/방어로 생존 ──
  if (g.mode === "mimic") {
    const solo = g.teamMode === "solo";
    ps.forEach((p, i) => {
      p.crole = "player";
      p.team = solo ? i : (i % g.teamsCount);
      p.cin = { mvx: 0, mvy: 0, stab: false, defend: false, sit: false, wave: false, stop: false };
      p.dead = false; p.defending = false; p.stabbing = false;
      p.kills = 0; p.deaths = 0; p.streak = 0; p.bestStreak = 0;
      p.stabUntil = 0; p.stabCdUntil = 0; p.stabHit = false; p.defUntil = 0; p.defCdUntil = 0; p.defAccum = 0;
      p.color = COPS.mimicColor;
      const sp = freeSpotMimic(g); p.x = sp.x; p.y = sp.y; p.face = Math.random() * Math.PI * 2; p.pose = "walk";
    });
    g.safes = []; g.vault = { x: 0, y: 0, w: 0, h: 0 };
    g.mimicKillFeed = [];
    g.mimicNetAcc = 0;
    g.mimicWallsSent = false;
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
    p.cin = { mvx: 0, mvy: 0, interact: false, stop: false, sit: false, wave: false, shoot: false };
    if (p.crole === "police") {
      p.cdUntil = 0; p.catches = 0; p.phaseUntil = 0; p.phaseCdUntil = 0; p.phaseDx = null; p.phaseDy = null;
      p.face = 0; p.pose = "walk"; p.caught = false;
    } else {
      const sp = randPos(g); p.x = sp.x; p.y = sp.y; p.caught = false; p.face = 0; p.pose = "walk";
      p.steals = 0; p.dashUntil = 0; p.dashCdUntil = 0; p.dashDx = null; p.dashDy = null;
    }
  });
  // 유물부수기
  g.safeCount = clamp(Math.round(g.safeCount || 4), 3, 8);
  applyRelicMapForStart(g);
  g.safes = relicSpots(g.safeCount, g.world.w, g.world.h).map((s) => {
    carveArea(g, { x: s.x - 50, y: s.y - 50, w: 100, h: 100 });
    return { ...s, progress: 0, opened: false };
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
  const thieves = [...room.players.values()].filter((p) => p.crole === "thief");
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
}
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function nameOfTeam(room, t) { const p = [...room.players.values()].find((x) => x.team === t); return p ? p.name : "플레이어"; }
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
}
function mimicTick(room, now, dt, ps) {
  const g = room.game; const W = g.world.w, H = g.world.h, R = COPS.r;
  const events = [];
  for (const p of ps) {
    if (p.dead) { p.pose = "sit"; continue; }
    const inp = p.cin || {};
    // 방어 (지속 제한 + 쿨타임)
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
    // 찌르기 시작
    if (inp.stab && !p.stabbing && !defend && now >= (p.stabCdUntil || 0)) {
      p.stabbing = true; p.stabStart = now; p.stabHit = false;
      p.stabUntil = now + (COPS.stabWindup + COPS.stabActive) * 1000;
      p.stabCdUntil = p.stabUntil + COPS.stabCd * 1000;
    }
    if (p.stabbing && now >= p.stabUntil) p.stabbing = false;
    const stabbing = p.stabbing;
    const emote = inp.sit || inp.wave || inp.stop || defend || stabbing;
    let dx = emote ? 0 : inp.mvx, dy = emote ? 0 : inp.mvy;
    const mag = Math.hypot(dx, dy); if (mag > 1) { dx /= mag; dy /= mag; }
    if (mag > 0.05 && !emote) p.face = Math.atan2(dy, dx);
    if (!emote) moveMimicEntity(g, p, dx, dy, COPS.playerSpeed, dt);
    p.pose = defend ? "defend" : stabbing ? "stab" : inp.sit ? "sit" : inp.wave ? "wave" : (inp.stop || mag < 0.05) ? "stop" : "walk";
    // 찌르기 판정 (액티브 구간) — 플레이어 + AI 봇
    if (stabbing && !p.stabHit && now - p.stabStart >= COPS.stabWindup * 1000) {
      for (const q of ps) {
        if (q === p || q.dead || q.team === p.team) continue;
        const ddx = q.x - p.x, ddy = q.y - p.y, d = Math.hypot(ddx, ddy);
        if (d >= COPS.stabR + R) continue;
        // 방어 중: 전방향 막기 — 거리 안이면 각도 무관하게 무효
        if (q.defending) {
          p.stabCdUntil = now + (COPS.stabCd + 0.5) * 1000;
          p.stabHit = true; break;
        }
        if (Math.abs(angDiff(Math.atan2(ddy, ddx), p.face)) < COPS.stabHalfAngle) {
          q.dead = true; q.deadAt = now; q.deaths = (q.deaths || 0) + 1; q.streak = 0;
          p.kills = (p.kills || 0) + 1; p.streak = (p.streak || 0) + 1; p.bestStreak = Math.max(p.bestStreak || 0, p.streak);
          g.mimicKillFeed = g.mimicKillFeed || [];
          g.mimicKillFeed.push({ id: uid(), kn: p.name, vn: q.name, at: now });
          g.mimicKillFeed = g.mimicKillFeed.filter((k) => now - k.at < MG_LOG_MS).slice(-8);
          events.push({ x: Math.round(q.x), y: Math.round(q.y) });
          p.stabHit = true; break;
        }
      }
      if (!p.stabHit) {
        for (const b of g.bots) {
          if (b.dead) continue;
          const ddx = b.x - p.x, ddy = b.y - p.y, d = Math.hypot(ddx, ddy);
          if (d < COPS.stabR + R && Math.abs(angDiff(Math.atan2(ddy, ddx), p.face)) < COPS.stabHalfAngle) {
            b.dead = true;
            p.kills = (p.kills || 0) + 1; p.streak = (p.streak || 0) + 1; p.bestStreak = Math.max(p.bestStreak || 0, p.streak);
            g.mimicKillFeed = g.mimicKillFeed || [];
            g.mimicKillFeed.push({ id: uid(), kn: p.name, vn: "AI", at: now });
            g.mimicKillFeed = g.mimicKillFeed.filter((k) => now - k.at < MG_LOG_MS).slice(-8);
            events.push({ x: Math.round(b.x), y: Math.round(b.y) });
            p.stabHit = true; break;
          }
        }
      }
    }
  }
  // 승패
  const liveP = ps.filter((p) => !p.dead);
  const teamsLeft = [...new Set(liveP.map((p) => p.team))];
  if (ps.length >= 2 && teamsLeft.length <= 1) return endMimic(room, teamsLeft, liveP, false);
  if (g.timeLeft <= 0) return endMimic(room, teamsLeft, liveP, true);

  g.mimicNetAcc = (g.mimicNetAcc || 0) + dt;
  const entityN = liveP.length + g.bots.filter((b) => !b.dead).length;
  const netIv = entityN <= 18 ? 0.05 : entityN <= 28 ? 0.066 : 0.083;
  if (g.mimicNetAcc < netIv) return;
  g.mimicNetAcc = 0;
  sendMimicState(room, now, ps, liveP, teamsLeft, events);
}

function sendMimicState(room, now, ps, liveP, teamsLeft, events) {
  const g = room.game;
  const tl = Math.max(0, Math.round(g.timeLeft));
  const solo = g.teamMode === "solo";
  const mc = COPS.mimicColor;
  const idToName = new Map();
  for (const pl of ps) idToName.set(pl.id, pl.name);
  for (const b of g.bots) idToName.set(b.id, `AI-${String(b.id).replace(/^b/, "")}`);
  const base = [];
  for (const b of g.bots) if (!b.dead) base.push({ i: b.id, x: Math.round(b.x), y: Math.round(b.y), c: mc, f: +(b.face || 0).toFixed(2), po: b.pose });
  for (const p of ps) if (!p.dead) base.push({ i: p.id, x: Math.round(p.x), y: Math.round(p.y), c: mc, f: +(p.face || 0).toFixed(2), po: p.pose, pl: 1, tm: p.team });
  const includeWalls = !g.mimicWallsSent;
  if (includeWalls) g.mimicWallsSent = true;
  const walls = includeWalls ? (g.walls || []).map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h })) : undefined;
  const botsAlive = g.bots.filter((b) => !b.dead).length;
  const feed = (g.mimicKillFeed || []).filter((k) => now - k.at < MG_LOG_MS).map((k) => ({ id: k.id, kn: k.kn, vn: k.vn, at: k.at }));
  for (const p of ps) {
    const spectating = !!p.dead;
    const circles = base.map((c) => {
      const o = { i: c.i, x: c.x, y: c.y, c: c.c, f: c.f, po: c.po };
      if (spectating) {
        o.n = idToName.get(c.i) || c.i;
        if (c.pl) { o.pl = 1; o.tm = c.tm; }
      } else {
        if (c.i === p.id) o.me = 1;
        else if (c.pl && !solo && c.tm === p.team) o.ally = 1;
      }
      return o;
    });
    const myAlive = liveP.filter((q) => q.team === p.team).length;
    const msg = {
      t: "cops", role: "player", mode: "mimic", tl, world: g.world, circles,
      dead: p.dead ? 1 : 0, vx: Math.round(p.x), vy: Math.round(p.y),
      stabCd: +Math.max(0, ((p.stabCdUntil || 0) - now) / 1000).toFixed(1),
      defCd: +Math.max(0, ((p.defCdUntil || 0) - now) / 1000).toFixed(1),
      defending: p.defending ? 1 : 0, defReady: now >= (p.defCdUntil || 0) ? 1 : 0,
      alive: liveP.length, botsAlive, teamsLeft: teamsLeft.length,
      myTeam: solo ? -1 : p.team, myAlive, solo: solo ? 1 : 0, feed, events,
    };
    if (walls) msg.walls = walls;
    try { p.ws.send(JSON.stringify(msg)); } catch (e) {}
  }
}
function copsTick(room) {
  const g = room.game;
  const now = Date.now();
  const dt = COPS.dt;
  g.timeLeft -= dt;
  const W = g.world.w, H = g.world.h, R = COPS.r;
  const ps = [...room.players.values()];

  // 봇 (포즈 애니메이션)
  for (const b of g.bots) if (!b.dead) (g.mode === "mimic" ? stepBotMimic : stepBot)(g, b, dt);

  if (g.mode === "mimic") return mimicTick(room, now, dt, ps);

  // 도둑 이동 + 유물/감옥 상호작용
  const thieves = ps.filter((p) => p.crole === "thief");
  for (const p of thieves) {
    const inp = p.cin || {};
    if (p.caught) {
      if (g.mode === "relic") {
        moveJailedEntity(g, p, inp.mvx || 0, inp.mvy || 0, COPS.thiefSpeed * 0.85, dt);
      } else { p.pose = "sit"; }
      continue;
    }
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
      const dashing = now < (p.dashUntil || 0);
      if (Math.hypot(dx, dy) < 0.05 && dashing && p.dashDx != null) { dx = p.dashDx; dy = p.dashDy; }
      moveRelicEntity(g, p, dx, dy, dashing ? dashSpd : COPS.thiefSpeed, dt, dashing);
      p.pose = dashing ? "dash" : (inp.interact ? "stop" : "walk");
    } else {
      const emote = inp.stop || inp.sit || inp.wave;
      dx = emote ? 0 : dx; dy = emote ? 0 : dy;
      const mag = Math.hypot(dx, dy);
      if (mag > 1) { dx /= mag; dy /= mag; }
      if (mag > 0.05 && !emote) p.face = Math.atan2(dy, dx);
      const walls = g.walls || [];
      const nX = clamp(p.x + dx * COPS.thiefSpeed * dt, R, W - R);
      if (!walls.some((w) => hitRect(nX, p.y, R, w))) p.x = nX;
      const nY = clamp(p.y + dy * COPS.thiefSpeed * dt, R, H - R);
      if (!walls.some((w) => hitRect(p.x, nY, R, w))) p.y = nY;
      p.pose = inp.sit ? "sit" : inp.wave ? "wave" : (emote || mag < 0.05) ? "stop" : "walk";
    }
    // 유물부수기: 감옥 근처에서 상호작용 → 갇힌 도둑 전원 구출 (감옥 밖 도망자만)
    if (g.mode === "relic" && inp.interact && !p.caught) {
      const j = g.jail;
      if (p.x > j.x - 34 && p.x < j.x + j.w + 34 && p.y > j.y - 34 && p.y < j.y + j.h + 34) {
        // 구출: 갇힌 팀원을 구해준 사람(감옥 앞)의 주변으로 풀어줌
        for (const t of thieves) if (t.caught) { t.caught = false; const sp = freeSpotNear(g, p.x, p.y, 55); t.x = sp.x; t.y = sp.y; t.pose = "walk"; }
      }
    }
    // 상호작용: 가까운 미개봉 금고/유물
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

  const police = ps.filter((p) => p.crole === "police");

  // 유물부수기: 술래 이동 + 벽 돌파(돌진) 스킬 + 근접 검거
  if (g.mode === "relic") {
    for (const p of police) {
      const inp = p.cin || {};
      if (inp.phase && now >= (p.phaseCdUntil || 0)) {
        let dx = inp.mvx || 0, dy = inp.mvy || 0;
        if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(p.face || 0); dy = Math.sin(p.face || 0); }
        const m = Math.hypot(dx, dy) || 1;
        p.phaseDx = dx / m; p.phaseDy = dy / m;
        const pCd = g.policeDashCd || COPS.phaseCd;
        const pTime = COPS.phaseTime;
        p.phaseUntil = now + pTime * 1000;
        p.phaseCdUntil = now + pCd * 1000;
      }
      const phasing = now < (p.phaseUntil || 0);
      let dx = inp.mvx || 0, dy = inp.mvy || 0;
      if (Math.hypot(dx, dy) < 0.05 && phasing && p.phaseDx != null) { dx = p.phaseDx; dy = p.phaseDy; }
      moveRelicEntity(g, p, dx, dy, phasing ? COPS.phaseSpeed : COPS.policeSpeed, dt, phasing);
      p.pose = phasing ? "dash" : "walk";
      for (const t of thieves) {
        if (t.caught) continue;
        if (Math.hypot(t.x - p.x, t.y - p.y) < COPS.catchR + COPS.r) {
          const cx = Math.round(t.x), cy = Math.round(t.y);
          t.caught = true; p.catches = (p.catches || 0) + 1;
          const j = g.jail; t.x = j.x + 15 + Math.random() * (j.w - 30); t.y = j.y + 15 + Math.random() * (j.h - 30);
          t.pose = "stop";
          g.catchFeed = g.catchFeed || [];
          g.catchFeed.push({ id: uid(), pn: p.name, vn: t.name, at: now });
          g.catchFeed = g.catchFeed.filter((k) => now - k.at < MG_LOG_MS).slice(-8);
          broadcast(room, { t: "cops-shot", x: cx, y: cy, hit: true });
        }
      }
    }
  }

  // 승패 판정
  const openedCount = g.safes.filter((s) => s.opened).length;
  const aliveThieves = thieves.filter((p) => !p.caught).length;
  if (thieves.length > 0 && openedCount >= g.safeCount) return endCops(room, "도둑");
  if (thieves.length > 0 && aliveThieves === 0) return endCops(room, "경찰");
  if (g.timeLeft <= 0) return endCops(room, "경찰"); // 시간 종료: 방어 성공

  const tl = Math.max(0, Math.round(g.timeLeft));

  // ── 유물부수기: 봇 없음 + 주변 시야(안개), 경찰(술래)도 캐릭터로 등장·근접 검거 ──
  if (g.mode === "relic") {
    const tVis = g.thiefVision || COPS.thiefVision, pVis = g.policeVision || COPS.policeVision;
    const circlesAll = [];
    for (const t of thieves) {
      const base = { i: t.id, n: t.name, x: Math.round(t.x), y: Math.round(t.y), c: t.color, f: +(t.face || 0).toFixed(2), po: t.pose };
      if (!t.caught) circlesAll.push({ ...base, ph: now < (t.dashUntil || 0) ? 1 : 0 });
      else circlesAll.push({ ...base, j: 1, po: t.pose || "walk" });
    }
    for (const p of police) {
      circlesAll.push({ i: p.id, n: p.name, x: Math.round(p.x), y: Math.round(p.y), c: "#dc2626", f: +(p.face || 0).toFixed(2), po: p.pose || "walk", pol: 1, ph: now < (p.phaseUntil || 0) ? 1 : 0 });
    }
    const safesAll = g.safes.map((s) => ({ i: s.id, x: s.x, y: s.y, o: s.opened ? 1 : 0, p: +s.progress.toFixed(2) }));
    const hideoutsAll = (g.hideouts || []).map((h) => ({
      id: h.id, outer: h.outer, cavity: h.cavity, entrance: h.entrance, arrow: h.arrow ? 1 : 0,
    }));
    for (const p of ps) {
      const isPolice = p.crole === "police";
      const vx = p.x, vy = p.y;
      const vr = isPolice ? pVis : tVis;
      const myHide = hideoutAt(g, vx, vy);
      const seen = (x, y) => canSeeRelic(g, vx, vy, x, y, vr);
      const circles = circlesAll.filter((c) => c.i === p.id || seen(c.x, c.y));
      const safes = safesAll.filter((s) => seen(s.x, s.y)).map((s) => isPolice ? { ...s, p: s.o ? 1 : Math.floor(s.p * 4) / 4 } : s);
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
      };
      if (isPolice) {
        msg.catches = p.catches || 0;
        msg.pcd = Math.max(0, ((p.phaseCdUntil || 0) - now) / 1000);
        msg.phasing = now < (p.phaseUntil || 0) ? 1 : 0;
      } else if (p.crole === "thief") {
        msg.dcd = Math.max(0, ((p.dashCdUntil || 0) - now) / 1000);
        msg.dashing = now < (p.dashUntil || 0) ? 1 : 0;
      }
      try { p.ws.send(JSON.stringify(msg)); } catch (e) {}
    }
    return;
  }
}

// ---------------------------------------------------------------- 연결 처리
function joinRoom(room, ws, name) {
  if (room.players.size >= 16) { send(ws, { t: "error", msg: "방 정원이 가득 찼습니다." }); return null; }
  const id = uid();
  const color = COLORS[room.players.size % COLORS.length];
  const nm = ws.accName || String(name || "익명").slice(0, 12) || "익명";
  const player = { id, name: nm, ws, color, score: 0, alive: true, account: ws.accName || null };
  room.players.set(id, player);
  ws.roomCode = room.code;
  ws.playerId = id;
  lobby.delete(ws);
  send(ws, { t: "joined", code: room.code, id, isHost: id === room.hostId, gameType: room.gameType, roomName: room.roomName || "" });
  // 진행 중인 아레나에 중간 참가 → 즉시 합류
  if (room.gameType === "arena" && room.game.started) {
    if (room.game.mode === "team") { player.team = smallestTeam(room.game, [...room.players.values()]); initArenaPlayer(room.game, player); }
    else { player.team = 0; player.role = "runner"; initArenaPlayer(room.game, player); }
  }
  pushState(room);
  scheduleRoomsBroadcast();
  return player;
}

function leaveRoom(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;
  const wasHost = ws.playerId === room.hostId;
  room.players.delete(ws.playerId);
  if (room.players.size === 0) {
    if (room.loop) clearInterval(room.loop);
    cancelCountdown(room);
    rooms.delete(room.code);
    scheduleRoomsBroadcast();
    return;
  }
  if (wasHost) room.hostId = room.players.keys().next().value; // 호스트 이양
  pushState(room);
  scheduleRoomsBroadcast();
}

export function attachMinigames(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  mgWss = wss;

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));
    enterLobby(ws);

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

      if (msg.t === "login") {
        const r = authAccount(msg.name, msg.password);
        if (!r.ok) { send(ws, { t: "auth", ok: false, err: r.err }); return; }
        ws.accName = r.acc.name;
        send(ws, { t: "auth", ok: true, name: r.acc.name, created: !!r.created, rankings: allRankings() });
        return;
      }
      if (msg.t === "ranking") { send(ws, { t: "rankings", rankings: allRankings() }); return; }

      if (msg.t === "account-list") {
        send(ws, { t: "account-list", accounts: accountListPublic(), total: accounts.size });
        return;
      }

      if (msg.t === "admin-clear-ranks") {
        if (String(msg.password || "") !== MG_ADMIN_PW) {
          send(ws, { t: "admin-clear-result", ok: false, err: "관리자 비밀번호가 올바르지 않습니다." });
          return;
        }
        const games = msg.games === "all" ? "all" : (Array.isArray(msg.games) ? msg.games : []);
        if (games !== "all" && !games.length) {
          send(ws, { t: "admin-clear-result", ok: false, err: "삭제할 게임을 선택하세요." });
          return;
        }
        const rawUsers = Array.isArray(msg.users) ? msg.users : null;
        const users = rawUsers?.length
          ? rawUsers.map((n) => String(n).trim()).filter((n) => accounts.has(n))
          : null;
        if (rawUsers?.length && !users?.length) {
          send(ws, { t: "admin-clear-result", ok: false, err: "선택한 유저를 찾을 수 없습니다." });
          return;
        }
        const result = clearRankings(games, users);
        broadcastRankings(wss);
        send(ws, {
          t: "admin-clear-result", ok: true,
          cleared: result.cleared, keys: result.keys, users: result.users,
          removedAccounts: result.removedAccounts,
          accounts: accountListPublic(),
          rankings: allRankings(),
        });
        return;
      }

      if (msg.t === "control-layouts") {
        send(ws, { t: "control-layouts", layouts: getControlLayouts() });
        return;
      }

      if (msg.t === "list") { send(ws, { t: "rooms", rooms: roomsList() }); return; }

      if (msg.t === "create") {
        if (!ws.accName) { send(ws, { t: "error", msg: "먼저 로그인하세요." }); return; }
        if (rooms.size >= MAX_ROOMS) { send(ws, { t: "error", msg: "서버 방이 가득 찼습니다. 잠시 후 다시 시도하세요." }); return; }
        const gameType = ["roulette", "ladder", "draw", "arena", "cops", "kitchen", "kitchen-tut"].includes(msg.gameType) ? msg.gameType : "roulette";
        const code = makeCode();
        const password = String(msg.password || "").slice(0, 20).trim() || null;
        const hostNm = ws.accName || String(msg.name || "방장").slice(0, 12) || "방장";
        const roomName = sanitizeRoomName(msg.roomName, `${hostNm}의 ${GAME_NAMES[gameType] || "방"}`);
        const room = { code, gameType, roomName, hostId: null, players: new Map(), game: newGame(gameType), loop: null, password, createdAt: Date.now() };
        rooms.set(code, room);
        lobby.delete(ws);
        joinRoomAsHost(room, ws, msg.name);
        scheduleRoomsBroadcast();
        return;
      }
      if (msg.t === "join") {
        if (!ws.accName) { send(ws, { t: "error", msg: "먼저 로그인하세요." }); return; }
        const room = rooms.get(String(msg.code || "").toUpperCase());
        if (!room) { send(ws, { t: "error", msg: "방을 찾을 수 없습니다. 코드를 확인하세요." }); return; }
        if (room.password && String(msg.password || "") !== room.password) {
          send(ws, { t: "error", msg: "방 비밀번호가 틀렸습니다." }); return;
        }
        joinRoom(room, ws, msg.name);
        return;
      }
      if (msg.t === "leave") { leaveRoom(ws); ws.roomCode = null; enterLobby(ws); return; }
      if (msg.t === "action") {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        const player = room.players.get(ws.playerId);
        if (!player) return;
        handleAction(room, player, msg);
        return;
      }
    });

    ws.on("close", () => { leaveRoom(ws); lobby.delete(ws); });
    ws.on("error", () => {});
  });

  // 좀비 연결 정리
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch (e) {}
    });
  }, 30000);
  wss.on("close", () => clearInterval(interval));

  function joinRoomAsHost(room, ws, name) {
    room.hostId = "pending";
    const id = uid();
    const color = COLORS[0];
    const nm = ws.accName || String(name || "방장").slice(0, 12) || "방장";
    const player = { id, name: nm, ws, color, score: 0, alive: true, account: ws.accName || null };
    room.hostId = id;
    room.players.set(id, player);
    ws.roomCode = room.code;
    ws.playerId = id;
    send(ws, { t: "joined", code: room.code, id, isHost: true, gameType: room.gameType, roomName: room.roomName || "" });
    pushState(room);
    return player;
  }

  return wss;
}

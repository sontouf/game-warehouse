import WebSocket from "ws";
import http from "http";
import os from "os";
import { execSync, spawn } from "child_process";

const HOST = "localhost:3000";
const WS_URL = `ws://${HOST}/ws`;
const SERVER_PID = process.env.SERVER_PID ? Number(process.env.SERVER_PID) : null;
const CORES = os.cpus().length;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 150명 분산 계획 (방당 최대 16명)
const PLAN = [
  { game: "arena", mode: "team", teamCount: 3, players: 14, count: 3 }, // 42
  { game: "arena", mode: "hide", players: 14, count: 2 },               // 28
  { game: "cops", mode: "money", players: 12, count: 2 },               // 24
  { game: "cops", mode: "relic", players: 12, count: 2 },               // 24
  { game: "roulette", players: 8, count: 2 },                           // 16
  { game: "ladder", players: 8, count: 1 },                             // 8
  { game: "draw", players: 8, count: 1 },                               // 8
];

const clients = [];
let connectFails = 0, connectTimes = [];
let sampling = false; // steady-state 윈도우에서만 통계 수집
let CID = 0; // 계정 이름 고유화용 (LT 접두사 → 테스트 후 정리 대상)

function mkClient(_name, roomType) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const name = "LT" + (++CID); // 로드테스트 전용 고유 계정명
    const ws = new WebSocket(WS_URL);
    const c = {
      ws, name, roomType, id: null, code: null, isHost: false, gameType: null,
      authed: false, recv: 0, recvWindow: 0, lastState: 0, intervals: [], last: {}, err: 0,
    };
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(c); } };
    const to = setTimeout(() => { if (!c.authed) { connectFails++; c.dead = true; finish(); } }, 8000);
    ws.on("open", () => { connectTimes.push(performance.now() - t0); try { ws.send(JSON.stringify({ t: "login", name, password: "lt" })); } catch (e) { c.err++; } });
    ws.on("error", () => { c.err++; if (!c.authed) { connectFails++; c.dead = true; clearTimeout(to); finish(); } });
    ws.on("message", (d) => {
      c.recv++;
      let m; try { m = JSON.parse(d.toString()); } catch { return; }
      c.last[m.t] = m;
      if (m.t === "auth") { if (m.ok) { c.authed = true; clearTimeout(to); finish(); } else { c.dead = true; connectFails++; clearTimeout(to); finish(); } }
      if (m.t === "joined") { c.id = m.id; c.code = m.code; c.isHost = m.isHost; c.gameType = m.gameType; }
      // 실시간 상태 메시지 간격 측정 (steady 윈도우 한정)
      if ((m.t === "arena" || m.t === "cops") && sampling) {
        c.recvWindow++;
        const now = performance.now();
        if (c.lastState) c.intervals.push(now - c.lastState);
        c.lastState = now;
      } else if (m.t === "arena" || m.t === "cops") {
        c.lastState = performance.now();
      }
    });
    clients.push(c);
  });
}
const send = (c, o) => { try { c.ws.send(JSON.stringify(o)); } catch (e) { c.err++; } };

// HTTP 응답지연 프로브 — 별도 프로세스에서 실행(부하 생성기 이벤트루프와 분리 → 순수 서버 지연 측정)
const httpLat = [];
let probeChild = null;
function startProbe() {
  const code = `const http=require('http');function ping(){const t=process.hrtime.bigint();const r=http.get('http://${HOST}/',res=>{res.on('data',()=>{});res.on('end',()=>{const ms=Number(process.hrtime.bigint()-t)/1e6;process.stdout.write('MS:'+ms.toFixed(2)+'\\n');});});r.on('error',()=>{});r.setTimeout(5000,()=>r.destroy());}setInterval(ping,100);`;
  probeChild = spawn(process.execPath, ["-e", code]);
  let buf = "";
  probeChild.stdout.on("data", (d) => { buf += d.toString(); let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.startsWith("MS:")) httpLat.push(Number(line.slice(3))); } });
}
function stopProbe() { if (probeChild) { try { probeChild.kill(); } catch (e) {} probeChild = null; } }

function sampleServer() {
  if (!SERVER_PID) return null;
  try {
    const out = execSync(`powershell -NoProfile -Command "$p=Get-Process -Id ${SERVER_PID} -ErrorAction Stop; Write-Output ('{0} {1}' -f $p.CPU, $p.WorkingSet64)"`, { encoding: "utf8" }).trim();
    const [cpu, ws] = out.split(/\s+/).map(Number);
    return { cpuSec: cpu, memMB: ws / 1048576 };
  } catch (e) { return null; }
}

function stats(arr) {
  if (!arr.length) return { n: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, mean: +(sum / s.length).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1) };
}

async function build() {
  let total = 0;
  const rooms = [];
  for (const spec of PLAN) {
    for (let r = 0; r < spec.count; r++) rooms.push({ ...spec });
  }
  console.log(`▶ 방 ${rooms.length}개 생성, 총 접속 목표 ${rooms.reduce((a, b) => a + b.players, 0)}명 (코어 ${CORES})`);

  for (const room of rooms) {
    // 방장 접속 + 생성
    const host = await mkClient(`H_${room.game}`, room.game);
    if (!host.dead) send(host, { t: "create", name: host.name, gameType: room.game, password: "" });
    await wait(120);
    room.host = host; room.code = host.code;
    total++;
    // 나머지 참가
    const batch = [];
    for (let i = 1; i < room.players; i++) batch.push(mkClient(`P${i}_${room.game}`, room.game));
    const members = await Promise.all(batch);
    for (const m of members) { if (!m.dead && room.code) send(m, { t: "join", code: room.code, name: m.name, password: "" }); total++; }
    await wait(150);
    room.members = members;
  }
  console.log(`✔ 접속 시도 ${total}명 | 실패 ${connectFails}명 | 접속시간 ${JSON.stringify(stats(connectTimes))}ms`);
  await wait(500);

  // 게임 시작
  for (const room of rooms) {
    const h = room.host; if (!h || h.dead) continue;
    if (room.game === "arena") send(h, { t: "action", a: "start", mode: room.mode, teamCount: room.teamCount || 2 });
    else if (room.game === "cops") { send(h, { t: "action", a: "set", mode: room.mode, policeCount: 1, botCount: 12, safeCount: 6 }); await wait(60); send(h, { t: "action", a: "start" }); }
    else if (room.game === "roulette") send(h, { t: "action", a: "set", options: ["A", "B", "C", "D", "E"] });
    else if (room.game === "ladder") send(h, { t: "action", a: "set", names: ["가", "나", "다", "라"], prizes: ["1", "2", "3", "4"] });
    else if (room.game === "draw") send(h, { t: "action", a: "set", labels: ["꽝", "당첨", "꽝", "당첨"] });
  }
  console.log("✔ 전체 게임 시작 신호 전송");
  return rooms;
}

function startInputs(rooms) {
  const timers = [];
  for (const room of rooms) {
    const all = [room.host, ...(room.members || [])].filter((c) => c && !c.dead);
    if (room.game === "arena") {
      for (const c of all) {
        const t = setInterval(() => {
          const ang = Math.random() * 6.28;
          send(c, { t: "action", a: "input", mvx: Math.cos(ang), mvy: Math.sin(ang), angle: ang, shoot: Math.random() < 0.6, dash: Math.random() < 0.05, grenade: Math.random() < 0.03 });
        }, 50);
        timers.push(t);
      }
    } else if (room.game === "cops") {
      for (const c of all) {
        const t = setInterval(() => {
          send(c, { t: "action", a: "input", mvx: Math.random() * 2 - 1, mvy: Math.random() * 2 - 1, interact: Math.random() < 0.4, shoot: Math.random() < 0.3, stop: false });
        }, 50);
        timers.push(t);
      }
    } else if (room.game === "roulette") {
      const t = setInterval(() => send(room.host, { t: "action", a: "spin" }), 2000); timers.push(t);
    } else if (room.game === "draw") {
      let i = 0; const mem = room.members || [];
      const t = setInterval(() => { const c = mem[i++ % (mem.length || 1)]; if (c && !c.dead) send(c, { t: "action", a: "draw" }); }, 800); timers.push(t);
    }
  }
  return timers;
}

(async () => {
  const rooms = await build();
  const before = sampleServer();

  // 입력 시작
  const timers = startInputs(rooms);
  startProbe();

  // 워밍업 3초 후 20초 steady 윈도우 측정
  await wait(3000);
  console.log("▶ steady-state 측정 시작 (20초)...");
  clients.forEach((c) => { c.recvWindow = 0; c.intervals = []; });
  httpLat.length = 0;
  const winStart = performance.now();
  const cpuStart = sampleServer();
  sampling = true;
  await wait(20000);
  sampling = false;
  const winSec = (performance.now() - winStart) / 1000;
  const cpuEnd = sampleServer();
  stopProbe();
  timers.forEach(clearInterval);

  // 집계
  const live = clients.filter((c) => !c.dead);
  const realtime = live.filter((c) => c.roomType === "arena" || c.roomType === "cops");
  let totalWinMsgs = 0, allIntervals = [];
  for (const c of realtime) { totalWinMsgs += c.recvWindow; allIntervals = allIntervals.concat(c.intervals); }
  const totalRecvAll = live.reduce((a, c) => a + c.recv, 0);

  console.log("\n================= 부하 테스트 결과 (150명 목표) =================");
  console.log(`접속 성공        : ${live.length} / ${clients.length}  (실패 ${connectFails})`);
  console.log(`실시간 클라이언트: ${realtime.length}명 (아레나+경찰도둑)`);
  console.log(`접속 지연(ms)    : ${JSON.stringify(stats(connectTimes))}`);
  console.log(`\n[실시간 브로드캐스트 수신]`);
  console.log(`  창(window)     : ${winSec.toFixed(1)}s`);
  console.log(`  수신 메시지    : ${totalWinMsgs} 건  → ${(totalWinMsgs / winSec).toFixed(0)} msg/s (서버→클라)`);
  console.log(`  프레임 간격(ms): ${JSON.stringify(stats(allIntervals))}  (아레나 목표~40 / 경찰도둑~45)`);
  console.log(`\n[HTTP 응답지연 = 이벤트 루프 지연 프록시]`);
  console.log(`  지연(ms)       : ${JSON.stringify(stats(httpLat))}`);
  if (before && cpuStart && cpuEnd) {
    const cpuPct = ((cpuEnd.cpuSec - cpuStart.cpuSec) / winSec / CORES) * 100;
    console.log(`\n[서버 프로세스 자원] (PID ${SERVER_PID}, ${CORES}코어)`);
    console.log(`  CPU 사용률     : ${cpuPct.toFixed(1)} %  (윈도우 평균)`);
    console.log(`  메모리(작업셋) : ${before.memMB.toFixed(0)}MB → ${cpuEnd.memMB.toFixed(0)}MB`);
  }
  // 총 인바운드 추정
  const inbound = realtime.length * (23 / 1); // 대략 20Hz
  console.log(`\n[추정 인바운드] 실시간 입력 ~${(realtime.length * 20)} msg/s (클라→서버)`);
  console.log(`총 수신(전체 세션): ${totalRecvAll} 건`);

  // 판정
  const iv = stats(allIntervals);
  const hl = stats(httpLat);
  const verdicts = [];
  verdicts.push(["접속 성공률 ≥ 98%", live.length / clients.length >= 0.98]);
  verdicts.push(["프레임 간격 p95 ≤ 90ms", iv.p95 != null && iv.p95 <= 90]);
  verdicts.push(["프레임 간격 max ≤ 250ms", iv.max != null && iv.max <= 250]);
  verdicts.push(["HTTP p95 ≤ 150ms", hl.p95 != null && hl.p95 <= 150]);
  console.log(`\n[판정]`);
  let pass = true;
  for (const [label, ok] of verdicts) { console.log(`  ${ok ? "✅" : "❌"} ${label}`); if (!ok) pass = false; }
  console.log(pass ? "\n🎉 결론: 150명 동시 접속에도 부하 없이 원활히 동작합니다." : "\n⚠ 결론: 일부 지표가 기준을 초과했습니다 (아래 수치 확인).");

  clients.forEach((c) => { try { c.ws.close(); } catch (e) {} });
  await wait(500);
  process.exit(pass ? 0 : 1);
})();

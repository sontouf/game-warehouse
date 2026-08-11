// 멀티프로세스 부하 테스트 (150명): 부하 생성기를 여러 워커 프로세스로 분산하여
// 단일 이벤트 루프 포화(GC 순간정지)로 인한 측정 아티팩트를 제거한다.
// 서버 지연은 별도 자식 프로세스의 HTTP 프로브로 독립 측정한다.
import WebSocket from "ws";
import os from "os";
import { fork, spawn, execSync } from "child_process";
import { fileURLToPath } from "url";

const HOST = "localhost:3000";
const WS_URL = `ws://${HOST}/ws`;
const CORES = os.cpus().length;
const SELF = fileURLToPath(import.meta.url);
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

function stats(arr) {
  if (!arr.length) return { n: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, mean: +(sum / s.length).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: +s[s.length - 1].toFixed(1) };
}

// ====================================================================== WORKER
if (process.env.LT_WORKER) {
  const WID = process.env.LT_WORKER;
  let CID = 0;
  let sampling = false;
  const clients = [];
  let connectFails = 0, connectTimes = [];
  let myRooms = [];

  function mkClient(roomType) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const name = `LTw${WID}_${++CID}`;
      const ws = new WebSocket(WS_URL);
      const c = { ws, name, roomType, id: null, code: null, isHost: false, authed: false, recv: 0, recvWindow: 0, lastState: 0, intervals: [], last: {}, err: 0 };
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
        if (m.t === "joined") { c.id = m.id; c.code = m.code; c.isHost = m.isHost; }
        if (m.t === "arena" || m.t === "cops") {
          if (sampling) { c.recvWindow++; const now = performance.now(); if (c.lastState) c.intervals.push(now - c.lastState); c.lastState = now; }
          else c.lastState = performance.now();
        }
      });
      clients.push(c);
    });
  }
  const send = (c, o) => { try { c.ws.send(JSON.stringify(o)); } catch (e) { c.err++; } };

  async function build(rooms) {
    for (const room of rooms) {
      const host = await mkClient(room.game);
      if (!host.dead) send(host, { t: "create", name: host.name, gameType: room.game, password: "" });
      await wait(120);
      room.host = host; room.code = host.code;
      const batch = [];
      for (let i = 1; i < room.players; i++) batch.push(mkClient(room.game));
      const members = await Promise.all(batch);
      for (const m of members) { if (!m.dead && room.code) send(m, { t: "join", code: room.code, name: m.name, password: "" }); }
      await wait(150);
      room.members = members;
    }
  }
  function startGames(rooms) {
    for (const room of rooms) {
      const h = room.host; if (!h || h.dead) continue;
      if (room.game === "arena") send(h, { t: "action", a: "start", mode: room.mode, teamCount: room.teamCount || 2 });
      else if (room.game === "cops") { send(h, { t: "action", a: "set", mode: room.mode, policeCount: 1, botCount: 12, safeCount: 6 }); setTimeout(() => send(h, { t: "action", a: "start" }), 70); }
      else if (room.game === "roulette") send(h, { t: "action", a: "set", options: ["A", "B", "C", "D", "E"] });
      else if (room.game === "ladder") send(h, { t: "action", a: "set", names: ["가", "나", "다", "라"], prizes: ["1", "2", "3", "4"] });
      else if (room.game === "draw") send(h, { t: "action", a: "set", labels: ["꽝", "당첨", "꽝", "당첨"] });
    }
  }
  const inputTimers = [];
  function startInputs(rooms) {
    for (const room of rooms) {
      const all = [room.host, ...(room.members || [])].filter((c) => c && !c.dead);
      if (room.game === "arena") {
        for (const c of all) inputTimers.push(setInterval(() => { const ang = Math.random() * 6.28; send(c, { t: "action", a: "input", mvx: Math.cos(ang), mvy: Math.sin(ang), angle: ang, shoot: Math.random() < 0.6, dash: Math.random() < 0.05, grenade: Math.random() < 0.03 }); }, 50));
      } else if (room.game === "cops") {
        for (const c of all) inputTimers.push(setInterval(() => send(c, { t: "action", a: "input", mvx: Math.random() * 2 - 1, mvy: Math.random() * 2 - 1, interact: Math.random() < 0.4, shoot: Math.random() < 0.3, stop: false }), 50));
      } else if (room.game === "roulette") {
        inputTimers.push(setInterval(() => send(room.host, { t: "action", a: "spin" }), 2000));
      } else if (room.game === "draw") {
        let i = 0; const mem = room.members || [];
        inputTimers.push(setInterval(() => { const c = mem[i++ % (mem.length || 1)]; if (c && !c.dead) send(c, { t: "action", a: "draw" }); }, 800));
      }
    }
  }

  process.on("message", async (msg) => {
    if (msg.type === "rooms") {
      myRooms = msg.rooms;
      await build(myRooms);
      const live = clients.filter((c) => !c.dead).length;
      process.send({ type: "ready", live, tried: clients.length, fails: connectFails, connectTimes });
    } else if (msg.type === "go") {
      startGames(myRooms);
      startInputs(myRooms);
    } else if (msg.type === "sample") {
      if (msg.on) { clients.forEach((c) => { c.recvWindow = 0; c.intervals = []; }); sampling = true; }
      else sampling = false;
    } else if (msg.type === "report") {
      inputTimers.forEach(clearInterval);
      const live = clients.filter((c) => !c.dead);
      const realtime = live.filter((c) => c.roomType === "arena" || c.roomType === "cops");
      let intervals = [], winMsgs = 0, recvAll = 0;
      for (const c of live) recvAll += c.recv;
      for (const c of realtime) { winMsgs += c.recvWindow; intervals = intervals.concat(c.intervals); }
      process.send({ type: "result", intervals, winMsgs, recvAll, realtime: realtime.length, live: live.length });
      setTimeout(() => { clients.forEach((c) => { try { c.ws.close(); } catch (e) {} }); process.exit(0); }, 300);
    }
  });
  process.send({ type: "hello" });
}

// ====================================================================== MASTER
else {
  const SERVER_PID = process.env.SERVER_PID ? Number(process.env.SERVER_PID) : null;
  const WORKERS = Math.min(8, PLAN.reduce((a, b) => a + b.count, 0));

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

  // 방 목록 확장 후 워커에 분배
  const allRooms = [];
  for (const spec of PLAN) for (let r = 0; r < spec.count; r++) allRooms.push({ ...spec });
  const targetPlayers = allRooms.reduce((a, b) => a + b.players, 0);
  const buckets = Array.from({ length: WORKERS }, () => []);
  allRooms.forEach((room, i) => buckets[i % WORKERS].push(room));

  console.log(`▶ 워커 ${WORKERS}개 · 방 ${allRooms.length}개 · 목표 ${targetPlayers}명 (코어 ${CORES})`);

  const workers = [];
  const wstate = [];
  for (let i = 0; i < WORKERS; i++) {
    const child = fork(SELF, [], { env: { ...process.env, LT_WORKER: String(i + 1) } });
    workers.push(child);
    wstate.push({ ready: false, result: null });
    child.on("message", (m) => {
      const st = wstate[i];
      if (m.type === "hello") child.send({ type: "rooms", rooms: buckets[i] });
      else if (m.type === "ready") { st.ready = true; st.readyInfo = m; }
      else if (m.type === "result") st.result = m;
    });
  }

  const until = async (cond, timeout) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < timeout) await wait(100); };

  (async () => {
    await until(() => wstate.every((s) => s.ready), 60000);
    const conn = wstate.reduce((a, s) => a + (s.readyInfo?.live || 0), 0);
    const tried = wstate.reduce((a, s) => a + (s.readyInfo?.tried || 0), 0);
    const fails = wstate.reduce((a, s) => a + (s.readyInfo?.fails || 0), 0);
    const connectTimes = wstate.flatMap((s) => s.readyInfo?.connectTimes || []);
    console.log(`✔ 접속 성공 ${conn}/${tried}  실패 ${fails}  접속지연 ${JSON.stringify(stats(connectTimes))}ms`);

    workers.forEach((w) => w.send({ type: "go" }));
    console.log("✔ 전체 게임 시작 + 입력 스트림 시작");
    startProbe();

    await wait(3000);
    console.log("▶ steady-state 측정 시작 (20초)...");
    httpLat.length = 0;
    const cpuStart = sampleServer();
    const winStart = performance.now();
    workers.forEach((w) => w.send({ type: "sample", on: true }));
    await wait(20000);
    workers.forEach((w) => w.send({ type: "sample", on: false }));
    const winSec = (performance.now() - winStart) / 1000;
    const cpuEnd = sampleServer();
    stopProbe();

    workers.forEach((w) => w.send({ type: "report" }));
    await until(() => wstate.every((s) => s.result), 15000);

    let intervals = [], winMsgs = 0, recvAll = 0, realtime = 0, live = 0;
    for (const s of wstate) { const r = s.result; if (!r) continue; intervals = intervals.concat(r.intervals); winMsgs += r.winMsgs; recvAll += r.recvAll; realtime += r.realtime; live += r.live; }

    const iv = stats(intervals);
    const hl = stats(httpLat);
    console.log("\n================= 멀티프로세스 부하 테스트 결과 (150명) =================");
    console.log(`접속 성공        : ${conn} / ${tried}  (실패 ${fails})`);
    console.log(`실시간 클라이언트: ${realtime}명 (아레나+경찰도둑)`);
    console.log(`\n[실시간 브로드캐스트 수신]`);
    console.log(`  창(window)     : ${winSec.toFixed(1)}s`);
    console.log(`  수신 메시지    : ${winMsgs} 건  → ${(winMsgs / winSec).toFixed(0)} msg/s (서버→클라)`);
    console.log(`  프레임 간격(ms): ${JSON.stringify(iv)}  (아레나~40 / 경찰도둑~45)`);
    console.log(`\n[HTTP 응답지연 = 서버 이벤트 루프 지연 (독립 프로세스 측정)]`);
    console.log(`  지연(ms)       : ${JSON.stringify(hl)}`);
    if (cpuStart && cpuEnd) {
      const cpuPct = ((cpuEnd.cpuSec - cpuStart.cpuSec) / winSec / CORES) * 100;
      console.log(`\n[서버 프로세스 자원] (PID ${SERVER_PID}, ${CORES}코어)`);
      console.log(`  CPU 사용률     : ${cpuPct.toFixed(1)} %  (윈도우 평균)`);
      console.log(`  메모리(작업셋) : ${cpuEnd.memMB.toFixed(0)}MB`);
    }
    console.log(`총 수신(전체 세션): ${recvAll} 건`);

    const verdicts = [];
    verdicts.push(["접속 성공률 ≥ 98%", conn / tried >= 0.98]);
    verdicts.push(["프레임 간격 p95 ≤ 90ms", iv.p95 != null && iv.p95 <= 90]);
    verdicts.push(["프레임 간격 p99 ≤ 150ms", iv.p99 != null && iv.p99 <= 150]);
    verdicts.push(["프레임 간격 max ≤ 300ms", iv.max != null && iv.max <= 300]);
    verdicts.push(["서버 HTTP p95 ≤ 150ms", hl.p95 != null && hl.p95 <= 150]);
    verdicts.push(["서버 HTTP max ≤ 300ms", hl.max != null && hl.max <= 300]);
    console.log(`\n[판정]`);
    let pass = true;
    for (const [label, ok] of verdicts) { console.log(`  ${ok ? "✅" : "❌"} ${label}`); if (!ok) pass = false; }
    console.log(pass ? "\n🎉 결론: 150명 동시 접속에도 모든 게임이 실시간으로 원활히 동작합니다." : "\n⚠ 결론: 일부 지표 초과 (위 수치 확인).");

    workers.forEach((w) => { try { w.kill(); } catch (e) {} });
    await wait(500);
    process.exit(pass ? 0 : 1);
  })();
}

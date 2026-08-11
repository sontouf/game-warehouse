import express from "express";
import { createServer } from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import os from "os";
import { spawn } from "child_process";
import { generateSchedule } from "./schedule.js";
import { attachMinigames } from "./minigames.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "data.json");
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// ---------------------------------------------------------------------------
// 상태 관리
// ---------------------------------------------------------------------------
let state = null;

function defaultNames(m, prefix, suffix = "") {
  return Array.from({ length: m }, (_, i) => `${prefix}${i + 1}${suffix}`);
}

function createState(teamCount) {
  const schedule = generateSchedule(teamCount);
  const m = schedule.courseCount;
  return {
    teamCount,
    teams: defaultNames(teamCount, "", "팀"),
    courseNames: defaultNames(m, "코스게임 "),
    adminPassword: "yesohyes33!",
    staffPasswords: defaultNames(m, "course", "yes"),
    schedule,
    results: {}, // key: `${course}_${time}` -> { scoreA, scoreB, note, updatedAt }
    version: 1,
  };
}

function loadState() {
  if (existsSync(DATA_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
      if (raw && raw.schedule && raw.teamCount) return raw;
    } catch (e) {
      console.error("데이터 파일 읽기 실패, 새로 생성합니다:", e.message);
    }
  }
  return createState(12);
}

function saveState() {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (e) {
    console.error("저장 실패:", e.message);
  }
}

state = loadState();

// 클라이언트에 내려줄 공개 상태 (비밀번호 제외)
function publicState() {
  return {
    teamCount: state.teamCount,
    teams: state.teams,
    courseNames: state.courseNames,
    courseCount: state.schedule.courseCount,
    timeCount: state.schedule.timeCount,
    matches: state.schedule.matches,
    timeGrid: state.schedule.timeGrid,
    teamGrid: state.schedule.teamGrid,
    teamOrder: state.schedule.teamOrder,
    repeats: state.schedule.repeats,
    stats: state.schedule.stats,
    results: state.results,
    version: state.version,
  };
}

// ---------------------------------------------------------------------------
// 실시간(SSE)
// ---------------------------------------------------------------------------
let clients = [];

function broadcast() {
  const payload = `data: ${JSON.stringify(publicState())}\n\n`;
  clients.forEach((c) => {
    try {
      c.write(payload);
    } catch (e) {
      /* 끊긴 연결 무시 */
    }
  });
}

function commit() {
  state.version++;
  saveState();
  broadcast();
}

app.get("/api/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(publicState())}\n\n`);
  clients.push(res);
  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (e) {}
  }, 25000);
  req.on("close", () => {
    clearInterval(ping);
    clients = clients.filter((c) => c !== res);
  });
});

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
app.get("/api/state", (req, res) => {
  res.json(publicState());
});

app.post("/api/verify-admin", (req, res) => {
  const { password } = req.body || {};
  res.json({ ok: password === state.adminPassword });
});

app.post("/api/verify-staff", (req, res) => {
  const { course, password } = req.body || {};
  const idx = Number(course) - 1; // 1-based -> index
  const ok =
    idx >= 0 &&
    idx < state.staffPasswords.length &&
    password === state.staffPasswords[idx];
  res.json({ ok, course: Number(course) });
});

// 관리자: 현재 비밀번호 조회
app.post("/api/admin/credentials", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({
    ok: true,
    adminPassword: state.adminPassword,
    staffPasswords: [...state.staffPasswords],
  });
});

function requireAdmin(req, res) {
  const { password } = req.body || {};
  if (password !== state.adminPassword) {
    res.status(403).json({ ok: false, error: "관리자 비밀번호가 올바르지 않습니다." });
    return false;
  }
  return true;
}

// 관리자: 팀 수 변경 / 대진표 재생성
app.post("/api/admin/generate", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const teamCount = Number(req.body.teamCount);
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount % 2 !== 0) {
    return res.status(400).json({ ok: false, error: "팀 수는 2 이상의 짝수여야 합니다." });
  }
  if (teamCount > 60) {
    return res.status(400).json({ ok: false, error: "팀 수는 최대 60까지 지원합니다." });
  }

  const schedule = generateSchedule(teamCount);
  const m = schedule.courseCount;
  const prev = state;

  // 이름/비밀번호는 가능한 범위에서 유지
  const teams = defaultNames(teamCount, "", "팀").map((d, i) => prev.teams[i] || d);
  const courseNames = defaultNames(m, "코스게임 ").map((d, i) => prev.courseNames[i] || d);
  const staffPasswords = defaultNames(m, "course", "yes").map(
    (d, i) => prev.staffPasswords[i] || d
  );

  state = {
    teamCount,
    teams,
    courseNames,
    staffPasswords: staffPasswords.slice(0, m),
    schedule,
    results: {},
    adminPassword: prev.adminPassword,
    version: prev.version,
  };
  commit();
  res.json({ ok: true, state: publicState() });
});

// 관리자: 설정 업데이트 (이름, 비밀번호 등)
app.post("/api/admin/settings", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { teams, courseNames, adminPassword, staffPasswords } = req.body;

  if (Array.isArray(teams)) {
    teams.forEach((name, i) => {
      if (i < state.teams.length && typeof name === "string" && name.trim())
        state.teams[i] = name.trim();
    });
  }
  if (Array.isArray(courseNames)) {
    courseNames.forEach((name, i) => {
      if (i < state.courseNames.length && typeof name === "string" && name.trim())
        state.courseNames[i] = name.trim();
    });
  }
  if (typeof adminPassword === "string" && adminPassword.trim()) {
    state.adminPassword = adminPassword.trim();
  }
  if (Array.isArray(staffPasswords)) {
    staffPasswords.forEach((pw, i) => {
      if (i < state.staffPasswords.length && typeof pw === "string" && pw.trim())
        state.staffPasswords[i] = pw.trim();
    });
  }
  commit();
  res.json({ ok: true, state: publicState() });
});

// 결과 입력/수정 (스탭: 담당 코스만 / 관리자: 전체)
app.post("/api/result", (req, res) => {
  const { course, time, scoreA, scoreB, note, password } = req.body || {};
  const c = Number(course);
  const t = Number(time);
  if (
    !Number.isInteger(c) || c < 0 || c >= state.schedule.courseCount ||
    !Number.isInteger(t) || t < 0 || t >= state.schedule.timeCount
  ) {
    return res.status(400).json({ ok: false, error: "잘못된 코스/시간입니다." });
  }

  const isAdmin = password === state.adminPassword;
  const isStaff = password === state.staffPasswords[c];
  if (!isAdmin && !isStaff) {
    return res.status(403).json({
      ok: false,
      error: `권한이 없습니다. ${c + 1}번 코스 담당 비밀번호를 확인하세요.`,
    });
  }

  const key = `${c}_${t}`;
  const sa = scoreA === "" || scoreA === null || scoreA === undefined ? null : Number(scoreA);
  const sb = scoreB === "" || scoreB === null || scoreB === undefined ? null : Number(scoreB);
  state.results[key] = {
    scoreA: Number.isFinite(sa) ? sa : null,
    scoreB: Number.isFinite(sb) ? sb : null,
    note: typeof note === "string" ? note : "",
    updatedAt: Date.now(),
  };
  commit();
  res.json({ ok: true, results: state.results });
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

const httpServer = createServer(app);
attachMinigames(httpServer);

// ---------------------------------------------------------------------------
// 공개 URL 자동 생성 (Cloudflare Quick Tunnel)
// 비활성화하려면 NO_TUNNEL=1 환경변수로 실행
// ---------------------------------------------------------------------------
let tunnelProc = null;
function startTunnel() {
  if (process.env.NO_TUNNEL) return;
  const bins = [
    "cloudflared",
    "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
    "C:\\Program Files\\cloudflared\\cloudflared.exe",
  ];
  let idx = 0, done = false;
  const tryNext = () => {
    if (done) return;
    if (idx >= bins.length) {
      console.log("ℹ 공개 URL 자동 생성 건너뜀: cloudflared 미설치.");
      console.log("   설치: winget install --id Cloudflare.cloudflared  (설치 후 서버 재시작)\n");
      return;
    }
    const bin = bins[idx++];
    let proc;
    try { proc = spawn(bin, ["tunnel", "--url", `http://localhost:${PORT}`], { windowsHide: true }); }
    catch (e) { tryNext(); return; }
    proc.on("error", () => tryNext());
    const onData = (buf) => {
      const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !done) {
        done = true;
        tunnelProc = proc;
        console.log("\n================ 🌐 공개 접속 주소 (와이파이 무관) ================");
        console.log("   공개 URL : " + m[0]);
        console.log("   (이 주소를 참가자들에게 공유하세요. 서버/이 창을 닫으면 종료됩니다)");
        console.log("==================================================================\n");
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
  };
  tryNext();
}
function stopTunnel() { if (tunnelProc) { try { tunnelProc.kill(); } catch (e) {} tunnelProc = null; } }
process.on("SIGINT", () => { stopTunnel(); process.exit(0); });
process.on("SIGTERM", () => { stopTunnel(); process.exit(0); });
process.on("exit", stopTunnel);

httpServer.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const urls = [`http://localhost:${PORT}`];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) urls.push(`http://${net.address}:${PORT}`);
    }
  }
  console.log("\n================ 대진표 프로그램 실행 중 ================");
  console.log("아래 주소로 접속하세요 (같은 와이파이/네트워크의 휴대폰도 가능):\n");
  urls.forEach((u) => console.log("   " + u));
  console.log("\n종료하려면 Ctrl + C");
  console.log("========================================================\n");
  startTunnel();
});

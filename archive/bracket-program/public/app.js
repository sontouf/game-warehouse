"use strict";

// ------------------------------------------------------------------ 전역 상태
let S = null; // 서버 공개 상태
let role = null; // 'admin' | 'staff' | 'participant'
let section = null; // null(처음 두 화면) | 'rec'(레크레이션)
let currentView = null;
let myTeam = null; // 참가자 팀 인덱스
const creds = { adminPw: "", staffCourse: null, staffPw: "", adminCreds: null };
let pendingRender = false;

const $ = (sel) => document.querySelector(sel);
const appEl = $("#app");

// 세션 복원
try {
  const saved = JSON.parse(sessionStorage.getItem("bracket_session") || "{}");
  if (saved.role) {
    role = saved.role;
    currentView = saved.view || null;
    myTeam = saved.myTeam ?? null;
    Object.assign(creds, saved.creds || {});
  }
  section = saved.section || null;
} catch (e) {}

function saveSession() {
  sessionStorage.setItem(
    "bracket_session",
    JSON.stringify({ role, view: currentView, myTeam, creds, section })
  );
}

// ------------------------------------------------------------------ 유틸
function pairKey(a, b) {
  return a < b ? a * 100000 + b : b * 100000 + a;
}
function repeatSet() {
  const s = new Set();
  (S.repeats || []).forEach((r) => s.add(pairKey(r.a, r.b)));
  return s;
}
function teamName(i) {
  return (S.teams && S.teams[i]) || `${i + 1}팀`;
}
function courseName(c) {
  return (S.courseNames && S.courseNames[c]) || `코스게임 ${c + 1}`;
}
function resultOf(c, t) {
  return (S.results && S.results[`${c}_${t}`]) || null;
}
function isResultDone(c, t) {
  const r = resultOf(c, t);
  return !!(r && r.scoreA != null && r.scoreB != null);
}
function isLastTimeSlot(t) {
  return S && t === S.timeCount - 1;
}
/** 마지막 타임 경기 결과가 입력된 팀 (참가자: 대진표·시간표 전체 비공개) */
function teamsWithFinalResultEntered() {
  const set = new Set();
  if (!S) return set;
  const lastT = S.timeCount - 1;
  for (let c = 0; c < S.courseCount; c++) {
    if (!isResultDone(c, lastT)) continue;
    const cell = S.timeGrid?.[lastT]?.[c];
    if (cell) {
      set.add(cell.teamA);
      set.add(cell.teamB);
    }
  }
  return set;
}
function shouldMaskTeamScores(team) {
  return role === "participant" && teamsWithFinalResultEntered().has(team);
}
function teamHasFinalResultEntered(team) {
  return teamsWithFinalResultEntered().has(team);
}
/** 참가자 순위: 마지막 타임 점수는 합산 제외 */
function shouldExcludeFromRanking(t) {
  return role === "participant" && isLastTimeSlot(t);
}
function shouldMaskBracketCell(team, course, time) {
  if (role !== "participant") return false;
  if (!isResultDone(course, time)) return false;
  return shouldMaskTeamScores(team);
}
function shouldMaskTimegridCell(course, time) {
  if (role !== "participant") return false;
  if (!isResultDone(course, time)) return false;
  const cell = S.timeGrid?.[time]?.[course];
  if (!cell) return false;
  return shouldMaskTeamScores(cell.teamA) || shouldMaskTeamScores(cell.teamB);
}
function isResultPublic(c, t, team) {
  if (!isResultDone(c, t)) return false;
  if (team != null) return !shouldMaskBracketCell(team, c, t);
  return !shouldMaskTimegridCell(c, t);
}
function hasStoredResults() {
  if (!S?.results) return false;
  return Object.values(S.results).some(
    (r) => r && (r.scoreA != null || r.scoreB != null || (r.note && r.note.trim()))
  );
}
async function fetchAdminCredentials() {
  if (!creds.adminPw) return;
  const { data } = await api("/api/admin/credentials", { password: creds.adminPw });
  if (data.ok) creds.adminCreds = { adminPassword: data.adminPassword, staffPasswords: data.staffPasswords };
}

let toastTimer;
function toast(msg, kind = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast show " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast " + kind), 2600);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, data, status: res.status };
}

// 팀별 점수/전적 계산
function computeStats() {
  const n = S.teamCount;
  const stat = Array.from({ length: n }, () => ({ points: 0, w: 0, d: 0, l: 0, played: 0 }));
  for (const m of S.matches) {
    if (shouldExcludeFromRanking(m.time)) continue;
    const r = resultOf(m.course, m.time);
    if (!r || r.scoreA == null || r.scoreB == null) continue;
    const A = m.teamA, B = m.teamB;
    stat[A].points += r.scoreA; stat[B].points += r.scoreB;
    stat[A].played++; stat[B].played++;
    if (r.scoreA > r.scoreB) { stat[A].w++; stat[B].l++; }
    else if (r.scoreA < r.scoreB) { stat[B].w++; stat[A].l++; }
    else { stat[A].d++; stat[B].d++; }
  }
  return stat;
}

// ------------------------------------------------------------------ SSE 연결
function connectSSE() {
  const es = new EventSource("/api/events");
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onState(data);
      $("#connDot").classList.add("on");
    } catch (err) {}
  };
  es.onerror = () => {
    $("#connDot").classList.remove("on");
  };
}

function scheduleStructChanged(prev, next) {
  if (!prev || !next) return true;
  return prev.teamCount !== next.teamCount
    || prev.courseCount !== next.courseCount
    || (prev.matches?.length || 0) !== (next.matches?.length || 0);
}

const LIVE_VIEWS = ["bracket", "timegrid", "score", "myteam"];
const DEFER_INPUT_VIEWS = ["editor", "settings"];

function isTypingInApp() {
  const ae = document.activeElement;
  if (!ae || !ae.closest("#app")) return false;
  const tag = ae.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}

function applyState(newS, forceRender = false) {
  const structChanged = scheduleStructChanged(S, newS);
  const versionChanged = !!(S && newS && S.version !== newS.version);
  S = newS;
  if (forceRender || structChanged) {
    pendingRender = false;
    render();
    return;
  }
  // 결과·점수 반영 화면은 입력 중이어도 즉시 갱신
  if (versionChanged && LIVE_VIEWS.includes(currentView)) {
    pendingRender = false;
    render();
    return;
  }
  // 결과입력·설정 화면에서만 입력 중 갱신 보류
  if (DEFER_INPUT_VIEWS.includes(currentView) && isTypingInApp()) {
    pendingRender = true;
    return;
  }
  pendingRender = false;
  render();
}

function onState(newS) {
  applyState(newS, false);
}

document.addEventListener("focusout", (e) => {
  if (!pendingRender || !e.target.closest?.("#app")) return;
  setTimeout(() => {
    if (pendingRender && !isTypingInApp()) {
      pendingRender = false;
      render();
    }
  }, 80);
});

// ------------------------------------------------------------------ 탭 구성
function tabsFor(r) {
  if (r === "admin")
    return [
      ["settings", "설정"],
      ["bracket", "대진표"],
      ["timegrid", "시간표"],
      ["editor", "결과입력"],
      ["score", "점수"],
    ];
  if (r === "staff")
    return [
      ["editor", "결과입력"],
      ["bracket", "대진표"],
      ["timegrid", "시간표"],
      ["score", "점수"],
    ];
  return [
    ["myteam", "내 팀"],
    ["bracket", "대진표"],
    ["timegrid", "시간표"],
    ["score", "점수"],
  ];
}

// ------------------------------------------------------------------ 렌더 진입
function render() {
  if (!S) return;
  if (!role) return section === "rec" ? renderLanding() : renderHome();

  if (role === "staff" && (!creds.staffPw || !creds.staffCourse)) {
    role = null;
    currentView = null;
    toast("스탭 세션이 만료되었습니다. 다시 로그인하세요.", "err");
    return section === "rec" ? renderLanding() : renderHome();
  }

  $("#floatAdmin").classList.add("hidden");
  $("#topbar").classList.remove("hidden");
  $("#tabs").classList.remove("hidden");

  const badge = { admin: "관리자", staff: "스탭", participant: "참가자" }[role];
  $("#roleBadge").textContent = badge;
  let sub = "";
  if (role === "staff") sub = `${courseName(creds.staffCourse - 1)} 담당`;
  if (role === "participant" && myTeam != null) sub = `${teamName(myTeam)}`;
  $("#topbarSub").textContent = sub;

  const tabs = tabsFor(role);
  if (!tabs.find((t) => t[0] === currentView)) currentView = tabs[0][0];
  $("#tabs").innerHTML = tabs
    .map(
      (t) =>
        `<button class="tab ${t[0] === currentView ? "active" : ""}" data-tab="${t[0]}">${t[1]}</button>`
    )
    .join("");

  saveSession();

  if (role === "admin" && currentView === "settings" && !creds.adminCreds) {
    fetchAdminCredentials().then(() => { if (creds.adminCreds) render(); });
  }

  const views = {
    settings: renderSettings,
    bracket: renderBracket,
    timegrid: renderTimegrid,
    editor: renderEditor,
    score: renderScore,
    myteam: renderMyTeam,
  };
  appEl.innerHTML = (views[currentView] || (() => ""))();
}

// ------------------------------------------------------------------ 처음 화면 (두 선택지)
function renderHome() {
  $("#topbar").classList.add("hidden");
  $("#tabs").classList.add("hidden");
  $("#floatAdmin").classList.add("hidden");
  appEl.innerHTML = `
    <div class="landing">
      <div class="logo">🎉</div>
      <h1>26 부서 수련회</h1>
      <p class="sub">원하는 화면을 선택하세요</p>
      <div class="home-grid">
        <button class="home-card" data-act="go-rec">
          <div class="ico">🏆</div>
          <div class="t">수련회 레크레이션</div>
          <div class="d">코스게임 대진표 · 결과 · 순위</div>
        </button>
        <button class="home-card" data-act="open-minigames">
          <div class="ico">🎮</div>
          <div class="t">미니게임</div>
          <div class="d">실시간 놀이 · 룰렛 · 아레나 · 랭킹</div>
        </button>
      </div>
    </div>`;
}

// ------------------------------------------------------------------ 레크레이션 (모드 선택)
function renderLanding() {
  $("#topbar").classList.add("hidden");
  $("#tabs").classList.add("hidden");
  $("#floatAdmin").classList.remove("hidden");
  appEl.innerHTML = `
    <div class="landing">
      <button class="btn gray" data-act="go-home" style="position:absolute;left:16px;top:16px;width:auto;padding:8px 14px">← 처음으로</button>
      <div class="logo">🏆</div>
      <h1>수련회 대진표</h1>
      <p class="sub">코스게임 대진표 · 결과 · 순위를 실시간으로 확인하세요</p>
      <div class="mode-grid">
        <div class="mode-card" data-mode="admin">
          <div class="ico">🛠️</div>
          <div><div class="t">관리자 모드</div><div class="d">팀 수 설정 · 대진표 생성 · 비밀번호 · 결과 관리</div></div>
        </div>
        <div class="mode-card" data-mode="staff">
          <div class="ico">📋</div>
          <div><div class="t">스탭 모드</div><div class="d">담당 코스게임 결과를 실시간 입력 · 수정</div></div>
        </div>
        <div class="mode-card" data-mode="participant">
          <div class="ico">🙋</div>
          <div><div class="t">참가자 모드</div><div class="d">내 팀의 대진 순서 · 상대 · 점수 확인</div></div>
        </div>
      </div>
      <p class="section-desc" style="text-align:center;margin-top:22px">대진표 팀 수 설정과 생성은 <b>관리자 모드</b>에서 할 수 있습니다.</p>
    </div>`;
}

// ------------------------------------------------------------------ 모달
function openModal(html) {
  $("#modal").innerHTML = html;
  $("#modalWrap").classList.remove("hidden");
}
function closeModal() {
  $("#modalWrap").classList.add("hidden");
  $("#modal").innerHTML = "";
}

function adminLoginModal() {
  openModal(`
    <h2>관리자 로그인</h2>
    <p>관리자 비밀번호를 입력하세요.</p>
    <input id="mAdminPw" type="password" placeholder="관리자 비밀번호" autocomplete="off" />
    <div class="row">
      <button class="btn gray" data-modal="close">취소</button>
      <button class="btn" data-modal="admin-login">입장</button>
    </div>`);
  setTimeout(() => $("#mAdminPw")?.focus(), 50);
}

function staffLoginModal() {
  const opts = S.courseNames
    .map((nm, i) => `<option value="${i + 1}">${i + 1}번 · ${nm}</option>`)
    .join("");
  openModal(`
    <h2>스탭 로그인</h2>
    <p>담당하는 코스게임 번호와 비밀번호를 입력하세요.</p>
    <label class="fld"><span class="lbl">담당 코스게임</span>
      <select id="mStaffCourse">${opts}</select></label>
    <label class="fld"><span class="lbl">코스 담당 비밀번호</span>
      <input id="mStaffPw" type="password" placeholder="프로그램팀 팀장에게 확인" autocomplete="off" /></label>
    <div class="row">
      <button class="btn gray" data-modal="close">취소</button>
      <button class="btn" data-modal="staff-login">입장</button>
    </div>`);
}

function participantModal() {
  const opts = S.teams.map((nm, i) => `<option value="${i}">${nm}</option>`).join("");
  openModal(`
    <h2>참가자 입장</h2>
    <p>본인의 팀을 선택하세요.</p>
    <label class="fld"><span class="lbl">내 팀</span>
      <select id="mTeam">${opts}</select></label>
    <div class="row">
      <button class="btn gray" data-modal="close">취소</button>
      <button class="btn" data-modal="participant-go">입장</button>
    </div>`);
}

// ------------------------------------------------------------------ 뷰: 설정(관리자)
function renderSettings() {
  const m = S.courseCount;
  const st = S.stats;
  const courseInputs = S.courseNames
    .map(
      (nm, i) =>
        `<label class="fld"><span class="lbl">코스게임 ${i + 1} 이름</span>
          <input data-course-name="${i}" value="${escapeAttr(nm)}" /></label>`
    )
    .join("");
  const staffPwInputs = S.courseNames
    .map(
      (nm, i) =>
        `<label class="fld"><span class="lbl">${i + 1}번 (${escapeHtml(nm)}) 스탭 비밀번호</span>
          <div class="pw-current">현재: <code>${escapeHtml((creds.adminCreds?.staffPasswords || [])[i] || "…")}</code></div>
          <input data-staff-pw="${i}" placeholder="변경 시에만 입력" autocomplete="off" /></label>`
    )
    .join("");

  return `
  <div class="card">
    <h2>팀 수 설정</h2>
    <p class="section-desc">팀 수는 <b>짝수</b>여야 합니다. 코스게임 수 = 팀 수 ÷ 2 = <b>${m}개</b>.
      생성 시 기존 결과·성적이 있으면 확인 후 삭제됩니다.</p>
    <div class="stepper">
      <button data-team-step="-2">−</button>
      <input id="teamCount" type="number" min="2" max="60" step="2" value="${S.teamCount}" />
      <button data-team-step="2">+</button>
    </div>
    <div class="stepper" style="margin-top:6px"><span class="hint">2 ~ 60 (짝수). 예: 12팀 → 코스게임 6개, 6타임</span></div>
    <div style="margin-top:16px"><button class="btn block" data-act="generate">🔀 대진표 생성 / 다시 짜기</button></div>
    <div class="stat-row">
      <div class="stat">현재 <b>${S.teamCount}</b>팀</div>
      <div class="stat">코스 <b>${m}</b>개</div>
      <div class="stat">서로 다른 대결 <b>${st.distinctPairs}</b></div>
      <div class="stat ${st.repeatedPairs ? "warn" : ""}">2번+ 만남 <b>${st.repeatedPairs}</b>쌍</div>
    </div>
  </div>

  <div class="card">
    <h2>코스게임 이름</h2>
    <p class="section-desc">각 코스게임의 이름을 자유롭게 수정하세요.</p>
    ${courseInputs}
    <button class="btn block" data-act="save-names">💾 이름 저장</button>
  </div>

  <div class="card">
    <h2>비밀번호 설정</h2>
    <p class="section-desc">관리자 비밀번호와 코스게임별 스탭 비밀번호를 설정합니다.
      빈 칸은 변경하지 않습니다.</p>
    <div class="pw-current admin-pw-box">현재 관리자 비밀번호: <code>${escapeHtml(creds.adminCreds?.adminPassword || "…")}</code></div>
    <label class="fld"><span class="lbl">관리자 비밀번호 변경</span>
      <input id="newAdminPw" placeholder="변경 시에만 입력" autocomplete="off" /></label>
    <hr style="border:none;border-top:1px solid var(--line);margin:14px 0" />
    ${staffPwInputs}
    <button class="btn block" data-act="save-pw">🔐 비밀번호 저장</button>
  </div>`;
}

// ------------------------------------------------------------------ 뷰: 대진표(팀 × 코스)
function renderBracket() {
  const n = S.teamCount, m = S.courseCount;
  const reps = repeatSet();
  let head = `<tr><th class="corner">팀 \\ 코스</th>`;
  for (let c = 0; c < m; c++) head += `<th>${escapeHtml(courseName(c))}</th>`;
  head += `</tr>`;

  let body = "";
  for (let p = 0; p < n; p++) {
    body += `<tr><th>${escapeHtml(teamName(p))}</th>`;
    for (let c = 0; c < m; c++) {
      const g = S.teamGrid[p][c];
      const opp = g.opponent;
      const isRep = reps.has(pairKey(p, opp));
      const r = resultOf(c, g.time);
      const done = isResultPublic(c, g.time, p);
      const masked = isResultDone(c, g.time) && shouldMaskBracketCell(p, c, g.time);
      let score = "";
      if (done) {
        const mine = p === Math.min(p, opp) ? r.scoreA : r.scoreB;
        const other = p === Math.min(p, opp) ? r.scoreB : r.scoreA;
        const cls = mine > other ? "win" : mine < other ? "lose" : "";
        score = `<span class="cell-score ${cls}">${mine} : ${other}</span>`;
      } else if (masked) {
        score = `<span class="cell-score cell-masked">🔒 공개 대기</span>`;
      }
      body += `<td class="${isRep ? "cell-rep" : ""}${done ? " cell-done" : ""}${masked ? " cell-masked" : ""}">
        <div class="cell-vs">${escapeHtml(teamName(opp))} ${isRep ? '<span class="rep-mark">⚠</span>' : ""}</div>
        <span class="cell-time">타임 ${g.time + 1}</span>${score}
        ${done ? '<span class="done-mark">✓ 완료</span>' : masked ? '<span class="done-mark masked">🔒</span>' : ""}</td>`;
    }
    body += `</tr>`;
  }

  const repInfo = (S.repeats || []).length
    ? `<div class="card"><h3>⚠ 2번 이상 만나는 팀 (${S.repeats.length}쌍)</h3>
        <div class="stat-row">${S.repeats
          .map(
            (r) => `<div class="stat warn">${escapeHtml(teamName(r.a))} ↔ ${escapeHtml(teamName(r.b))} <b>${r.count}</b>회</div>`
          )
          .join("")}</div></div>`
    : `<div class="card"><h3>✅ 모든 팀이 서로 최대 1번씩만 만납니다</h3></div>`;

  return `
  <div class="card">
    <h2>전체 대진표</h2>
    <p class="section-desc">가로 = 코스게임, 세로 = 팀. 칸은 <b>상대 팀</b>과 진행 <b>타임</b>을 표시합니다.
      (좌우로 넘겨서 보세요) ⚠ = 2번 이상 만나는 상대.</p>
    <div class="table-wrap">
      <table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table>
    </div>
  </div>
  ${repInfo}`;
}

// ------------------------------------------------------------------ 뷰: 시간표(시간 × 코스)
function renderTimegrid() {
  const m = S.courseCount, tc = S.timeCount;
  let head = `<tr><th class="corner">타임 \\ 코스</th>`;
  for (let c = 0; c < m; c++) head += `<th>${escapeHtml(courseName(c))}</th>`;
  head += `</tr>`;

  let body = "";
  for (let t = 0; t < tc; t++) {
    body += `<tr><th>타임 ${t + 1}</th>`;
    for (let c = 0; c < m; c++) {
      const cell = S.timeGrid[t][c];
      const r = resultOf(c, t);
      const done = isResultPublic(c, t);
      const masked = shouldMaskTimegridCell(c, t);
      let sc = "";
      if (done) {
        const aWin = r.scoreA > r.scoreB, bWin = r.scoreB > r.scoreA;
        sc = `<span class="cell-score"><span class="${aWin ? "win" : ""}">${r.scoreA}</span> : <span class="${bWin ? "win" : ""}">${r.scoreB}</span></span>`;
      } else if (masked) {
        sc = `<span class="cell-score cell-masked">🔒 공개 대기</span>`;
      }
      body += `<td class="${done ? "cell-done" : ""}${masked ? " cell-masked" : ""}"><div class="cell-vs">${escapeHtml(teamName(cell.teamA))}<br>vs<br>${escapeHtml(teamName(cell.teamB))}</div>${sc}${done ? '<span class="done-mark">✓ 완료</span>' : masked ? '<span class="done-mark masked">🔒</span>' : ""}</td>`;
    }
    body += `</tr>`;
  }

  return `
  <div class="card">
    <h2>시간표 · 결과</h2>
    <p class="section-desc">가로 = 코스게임, 세로 = 타임(진행 순서). 각 칸은 그 시간에 맞붙는 두 팀과 결과입니다.</p>
    <div class="table-wrap">
      <table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ 뷰: 결과입력
function renderEditor() {
  let courseSel;
  if (role === "staff") {
    courseSel = creds.staffCourse - 1;
  } else {
    // 관리자: 드롭다운
    courseSel = editorCourse ?? 0;
  }

  const selectBox =
    role === "admin"
      ? `<label class="fld"><span class="lbl">코스게임 선택</span>
          <select id="editorCourse">${S.courseNames
            .map((nm, i) => `<option value="${i}" ${i === courseSel ? "selected" : ""}>${i + 1}번 · ${escapeHtml(nm)}</option>`)
            .join("")}</select></label>`
      : "";

  const tc = S.timeCount;
  let rows = "";
  for (let t = 0; t < tc; t++) {
    const cell = S.timeGrid[t][courseSel];
    const r = resultOf(courseSel, t);
    const a = r && r.scoreA != null ? r.scoreA : "";
    const b = r && r.scoreB != null ? r.scoreB : "";
    rows += `
    <div class="match-row">
      <div class="match-time">타임<br>${t + 1}</div>
      <div class="match-teams">
        <div class="names">${escapeHtml(teamName(cell.teamA))} <span style="color:var(--muted)">vs</span> ${escapeHtml(teamName(cell.teamB))}</div>
      </div>
      <div class="score-inputs">
        <input type="number" inputmode="numeric" data-score="A" data-time="${t}" value="${a}" placeholder="0" />
        <span class="x">:</span>
        <input type="number" inputmode="numeric" data-score="B" data-time="${t}" value="${b}" placeholder="0" />
        <button class="btn sm" data-act="save-result" data-time="${t}" data-course="${courseSel}">저장</button>
      </div>
    </div>`;
  }

  const title = role === "staff" ? `${courseName(courseSel)} 결과 입력` : "결과 입력 / 수정";
  return `
  <div class="card">
    <h2>${escapeHtml(title)}</h2>
    <p class="section-desc">점수를 입력하고 <b>저장</b>을 누르면 즉시 모든 화면에 반영됩니다. 언제든 수정 가능합니다.</p>
    ${selectBox}
    <div>${rows}</div>
    <div style="margin-top:14px"><button class="btn ghost block" data-act="save-all" data-course="${courseSel}">💾 이 코스 전체 저장</button></div>
  </div>`;
}
let editorCourse = null;

// ------------------------------------------------------------------ 뷰: 점수(순위)
function renderScore() {
  const stat = computeStats();
  const order = stat
    .map((s, i) => ({ ...s, team: i }))
    .sort((a, b) => b.points - a.points || b.w - a.w || a.team - b.team);
  const medals = ["🥇", "🥈", "🥉"];
  let rows = "";
  order.forEach((o, rank) => {
    const me = role === "participant" && o.team === myTeam;
    rows += `<tr class="${me ? "me" : ""}">
      <td>${rank < 3 ? `<span class="medal">${medals[rank]}</span>` : rank + 1}</td>
      <td class="name">${escapeHtml(teamName(o.team))}${me ? ' <span class="pill blue">나</span>' : ""}${role === "participant" && teamHasFinalResultEntered(o.team) ? ' <span class="cell-masked" title="최종전 결과 입력됨">🔒</span>' : ""}</td>
      <td><b>${o.points}</b></td>
      <td>${o.w}</td><td>${o.d}</td><td>${o.l}</td>
      <td>${o.played}/${S.courseCount}</td>
    </tr>`;
  });
  return `
  <div class="card">
    <h2>점수 순위</h2>
    <p class="section-desc">획득 점수 합계 기준 순위입니다. (승/무/패, 진행 경기 수 포함)
      ${role === "participant" ? `<br><span class="hint">마지막 타임(타임 ${S.timeCount}) 점수는 순위에 반영되지 않습니다. 해당 팀의 최종전 결과가 입력되면 대진표·시간표에서 그 팀의 전체 기록이 🔒 비공개로 표시됩니다.</span>` : ""}</p>
    <table class="rank">
      <thead><tr><th>순위</th><th style="text-align:left">팀</th><th>점수</th><th>승</th><th>무</th><th>패</th><th>진행</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ------------------------------------------------------------------ 뷰: 내 팀(참가자)
function renderMyTeam() {
  if (myTeam == null) {
    return `<div class="card"><h2>팀을 선택하세요</h2>
      <p class="section-desc">본인 팀을 선택하면 대진 순서와 점수를 볼 수 있습니다.</p>
      <button class="btn block" data-act="pick-team">내 팀 선택</button></div>`;
  }
  const reps = repeatSet();
  const order = S.teamOrder[myTeam];
  const stat = computeStats()[myTeam];

  // 순위
  const all = computeStats().map((s, i) => ({ ...s, team: i }))
    .sort((a, b) => b.points - a.points || b.w - a.w || a.team - b.team);
  const myRank = all.findIndex((o) => o.team === myTeam) + 1;

  let items = "";
  order.forEach((o) => {
    const isRep = reps.has(pairKey(myTeam, o.opponent));
    const r = resultOf(o.course, o.time);
    let res = "<span style='color:var(--muted)'>예정</span>";
    if (r && r.scoreA != null && r.scoreB != null) {
      if (shouldMaskBracketCell(myTeam, o.course, o.time)) {
        res = `<span class="cell-masked">🔒 공개 대기</span>`;
      } else {
        const iAmA = myTeam === Math.min(myTeam, o.opponent);
        const mine = iAmA ? r.scoreA : r.scoreB;
        const other = iAmA ? r.scoreB : r.scoreA;
        const tag = mine > other ? '<span class="pill cyan">승</span>' : mine < other ? '<span class="pill red">패</span>' : '<span class="pill blue">무</span>';
        res = `${mine} : ${other} ${tag}`;
      }
    }
    items += `
    <div class="tl-item ${isRep ? "rep" : ""}">
      <div class="num">${o.time + 1}</div>
      <div class="info">
        <div class="course">${escapeHtml(courseName(o.course))}</div>
        <div class="opp">vs ${escapeHtml(teamName(o.opponent))} ${isRep ? '<span class="rep-mark">⚠ 재대결</span>' : ""}</div>
      </div>
      <div class="res">${res}</div>
    </div>`;
  });

  return `
  <div class="card">
    <h2>${escapeHtml(teamName(myTeam))}</h2>
    <div class="stat-row">
      <div class="stat">순위 <b>${myRank}</b> / ${S.teamCount}</div>
      <div class="stat">획득 점수 <b>${stat.points}</b></div>
      <div class="stat">${stat.w}승 ${stat.d}무 ${stat.l}패</div>
    </div>
    <div style="margin-top:12px"><button class="btn gray sm" data-act="pick-team">팀 변경</button></div>
  </div>
  <div class="card">
    <h2>내 대진 순서</h2>
    <p class="section-desc">타임(진행 순서)대로 어떤 코스게임에서 누구와 대결하는지 보여줍니다.</p>
    <div class="timeline">${items}</div>
  </div>`;
}

// ------------------------------------------------------------------ HTML 이스케이프
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

// ------------------------------------------------------------------ 이벤트 처리
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-mode],[data-modal],[data-tab],[data-act],[data-team-step],#homeBtn,#floatAdmin");
  if (!t) return;

  // 모드 선택
  if (t.dataset.mode) {
    if (t.dataset.mode === "admin") adminLoginModal();
    else if (t.dataset.mode === "staff") staffLoginModal();
    else participantModal();
    return;
  }

  // 우하단 관리자
  if (t.id === "floatAdmin") { adminLoginModal(); return; }

  // 처음으로
  if (t.id === "homeBtn") {
    role = null; currentView = null; myTeam = null; section = null;
    creds.adminPw = ""; creds.staffCourse = null; creds.staffPw = ""; creds.adminCreds = null;
    saveSession();
    render();
    return;
  }

  // 모달 액션
  if (t.dataset.modal) {
    if (t.dataset.modal === "close") return closeModal();
    if (t.dataset.modal === "admin-login") {
      const pw = $("#mAdminPw").value;
      const { data } = await api("/api/verify-admin", { password: pw });
      if (data.ok) {
        role = "admin"; creds.adminPw = pw; creds.adminCreds = null;
        await fetchAdminCredentials();
        currentView = "settings"; saveSession(); closeModal(); render();
      }
      else toast("관리자 비밀번호가 올바르지 않습니다.", "err");
      return;
    }
    if (t.dataset.modal === "staff-login") {
      const course = Number($("#mStaffCourse").value);
      const pw = $("#mStaffPw").value;
      const { data } = await api("/api/verify-staff", { course, password: pw });
      if (data.ok) { role = "staff"; creds.staffCourse = course; creds.staffPw = pw; currentView = "editor"; saveSession(); closeModal(); render(); }
      else toast("코스 번호 또는 비밀번호가 올바르지 않습니다.", "err");
      return;
    }
    if (t.dataset.modal === "participant-go") {
      myTeam = Number($("#mTeam").value);
      role = "participant"; currentView = "myteam"; saveSession(); closeModal(); render();
      return;
    }
  }

  // 탭
  if (t.dataset.tab) { pendingRender = false; currentView = t.dataset.tab; render(); return; }

  // 팀 수 스테퍼 (첫 화면 / 관리자 설정 공용)
  if (t.dataset.teamStep) {
    const inp = t.closest(".stepper")?.querySelector("input");
    if (!inp) return;
    let v = Number(inp.value) + Number(t.dataset.teamStep);
    if (v < 2) v = 2; if (v > 60) v = 60;
    if (v % 2 !== 0) v += 1;
    inp.value = v;
    return;
  }

  // 액션
  if (t.dataset.act) return handleAction(t.dataset.act, t);
});

// select 변경 (관리자 결과입력 코스 선택)
document.addEventListener("change", (e) => {
  if (e.target.id === "editorCourse") {
    editorCourse = Number(e.target.value);
    render();
  }
});

async function handleAction(act, t) {
  if (act === "generate") {
    let v = Number($("#teamCount").value);
    if (v % 2 !== 0 || v < 2) return toast("팀 수는 2 이상의 짝수여야 합니다.", "err");
    if (hasStoredResults()) {
      const ok = confirm(
        "기록된 결과·성적이 모두 삭제되고, 팀 수에 맞는 새로운 대진표·시간표가 만들어집니다.\n\n계속하시겠습니까?"
      );
      if (!ok) return;
    }
    toast("대진표 생성 중...");
    const { ok, data } = await api("/api/admin/generate", { password: creds.adminPw, teamCount: v });
    if (ok && data.state) {
      applyState(data.state, true);
      toast("대진표가 생성되었습니다.", "ok");
    } else if (ok) {
      toast("대진표가 생성되었습니다.", "ok");
    } else {
      toast(data.error || "생성 실패", "err");
    }
    return;
  }

  if (act === "save-names") {
    const teams = undefined;
    const courseNames = [];
    document.querySelectorAll("[data-course-name]").forEach((el) => {
      courseNames[Number(el.dataset.courseName)] = el.value;
    });
    const { data } = await api("/api/admin/settings", { password: creds.adminPw, courseNames });
    toast(data.ok ? "이름을 저장했습니다." : data.error || "저장 실패", data.ok ? "ok" : "err");
    return;
  }

  if (act === "save-pw") {
    const body = { password: creds.adminPw };
    const newAdmin = $("#newAdminPw").value.trim();
    if (newAdmin) body.adminPassword = newAdmin;
    const staffPasswords = [];
    let any = false;
    document.querySelectorAll("[data-staff-pw]").forEach((el) => {
      if (el.value.trim()) { staffPasswords[Number(el.dataset.staffPw)] = el.value.trim(); any = true; }
    });
    if (any) body.staffPasswords = staffPasswords;
    if (!newAdmin && !any) return toast("변경할 비밀번호를 입력하세요.", "err");
    const { data } = await api("/api/admin/settings", body);
    if (data.ok && newAdmin) creds.adminPw = newAdmin;
    if (data.ok) await fetchAdminCredentials();
    toast(data.ok ? "비밀번호를 저장했습니다." : data.error || "저장 실패", data.ok ? "ok" : "err");
    return;
  }

  if (act === "save-result" || act === "save-all") {
    const course = role === "staff" ? creds.staffCourse - 1 : Number(t.dataset.course);
    if (role === "staff") {
      if (!creds.staffPw || !creds.staffCourse) {
        toast("스탭 세션이 만료되었습니다. 다시 로그인하세요.", "err");
        role = null; currentView = null; render();
        return;
      }
      if (!Number.isInteger(course) || course < 0) {
        toast("담당 코스 정보가 올바르지 않습니다. 다시 로그인하세요.", "err");
        return;
      }
    }
    const pw = role === "admin" ? creds.adminPw : creds.staffPw;
    const times = act === "save-all"
      ? Array.from({ length: S.timeCount }, (_, i) => i)
      : [Number(t.dataset.time)];

    let okCount = 0, failMsg = "", latestResults = S.results;
    for (const time of times) {
      const aEl = document.querySelector(`[data-score="A"][data-time="${time}"]`);
      const bEl = document.querySelector(`[data-score="B"][data-time="${time}"]`);
      if (!aEl || !bEl) continue;
      if (act === "save-all" && aEl.value === "" && bEl.value === "") continue;
      const { ok, data } = await api("/api/result", {
        course, time, scoreA: aEl.value, scoreB: bEl.value, password: pw,
      });
      if (ok && data.ok !== false) {
        okCount++;
        if (data.results) latestResults = data.results;
      } else {
        failMsg = data.error || "저장 실패";
      }
    }
    if (okCount > 0) {
      pendingRender = false;
      applyState({ ...S, results: latestResults }, true);
    }
    if (failMsg) toast(failMsg, "err");
    else if (okCount === 0) toast("저장할 점수를 입력하세요.", "err");
    else toast(`${okCount}개 경기 결과를 저장했습니다.`, "ok");
    return;
  }

  if (act === "pick-team") { participantModal(); return; }

  if (act === "open-minigames") { if (window.MG) window.MG.open(); return; }

  if (act === "go-rec") { section = "rec"; saveSession(); render(); return; }
  if (act === "go-home") { section = null; saveSession(); render(); return; }
}

// 모달 배경 클릭 닫기
$("#modalWrap").addEventListener("click", (e) => {
  if (e.target.id === "modalWrap") closeModal();
});

// ------------------------------------------------------------------ 시작
fetch("/api/state").then((r) => r.json()).then((data) => {
  S = data;
  render();
  connectSSE();
});

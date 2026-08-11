"use strict";
// 아레나 / 경찰과 도둑 클라이언트 (P2P 브릿지)
window.MGFactory = (function () {
  function createMG(root, bridge, opts) {
  if (!root) throw new Error("mg root missing");
  opts = opts || {};
  const arcadeMode = !!opts.arcadeMode;
  let ws = null;
  let me = { id: null, isHost: false };
  let room = null; // {code, gameType, players, game}
  let shellType = null;
  let nickname = localStorage.getItem("mg_name") || localStorage.getItem("gw-player-id") || "";
  // 계정 / 랭킹
  const account = { name: localStorage.getItem("gw-player-id") || localStorage.getItem("mg_name") || "", pw: localStorage.getItem("mg_pw") || "guest" };
  let loggedIn = false;
  let rankings = null;
  const MG_LOG_MS = 5000;
  let feedPruneTimer = null;

  // 게임별 로컬 상태
  let wheelRot = 0, wheelOptions = [], spinAnim = null;
  let ladderTrace = null;
  let inputTimer = null;
  const joy = { active: false, cx: 0, cy: 0, dx: 0, dy: 0, id: null };
  const aimJoy = { active: false, cx: 0, cy: 0, dx: 0, dy: 0, id: null };
  let facing = 0, shooting = false, repairing = false, lastArena = null;
  let dashPending = false, recallPending = false, arenaCtlMode = null, myTeam = null;
  let arenaCam = { x: 0, y: 0 };
  const ARENA_ZOOM = 0.72; // 조준·엄폐 시야용 (약간 더 넓게)
  let arenaCamSnap = true;
  let arenaRaf = null;
  let copsRaf = null;
  let copsMimicWalls = null;
  let mimicBgKey = "";
  let mimicBgCanvas = null;
  let arenaKillFeed = [];
  let arenaConquestFeed = [];
  let nexusAlertUntil = 0;
  let touchGuardAdded = false;
  const TCOL = ["#ef4444", "#3b82f6", "#22c55e"];

  // 로비 / 방목록
  let hubView = "menu"; // menu | create | join | rank | accounts | rank-admin
  let rankTab = "overall"; // overall | arena | cops
  let accountListCache = null;
  let mgRankAdminAuthed = false;
  let mgRankAdminPw = "";
  let rankAdminSelected = new Set(["arena", "cops"]);
  let rankAdminSelectedUsers = new Set();
  let roomListCache = [];
  let createGame = opts.defaultGame === "cops" ? "cops" : "arena";
  let pendingGameType = null;
  // 경찰과 도둑
  let copsRole = null, lastCops = null, copsCtlRole = null, copsSpecMode = false, copsInputTimer = null;
  let copsMimicKillFeed = [], mimicCam = { x: null, y: null };
  let copsShots = [], copsSlashes = [], combatFx = [];
  let interactHeld = false, stopHeld = false, shootHeldC = false;
  let defendHeld = false, stabPending = false;
  let copsMode = "relic", seenEventIds = 0, copsCatchFeed = [];
  let phasePending = false, copsDashPending = false, copsPushPending = false, copsShieldHeld = false, inGameView = false;
  let relicMaps = [], mapEditMode = false, mapEditDrag = null;
  let controlLayouts = {};
  // 최고의 주방장
  let lastKitchen = null, kitchenInputTimer = null, kitchenCtlReady = false;
  let kitchenDashPending = false, kitchenHintTimer = null;
  // 오디오
  const MA = window.MGA || { resume() {}, sfx() {}, bgm() {}, stopBgm() {}, toggle() { return false; }, isMuted() { return false; } };
  let prevHp = null, prevFx = 0, prevBuff = "", prevOpened = 0, lastShootSfx = 0, startPlayed = false;

  function T(msg, kind) { if (window.toast) window.toast(msg, kind || ""); }
  function spawnCombatFx(x, y, kind, ttl) {
    combatFx.push({ x, y, k: kind || "spark", ttl: ttl || 0.4, life: ttl || 0.4 });
    if (combatFx.length > 48) combatFx.splice(0, combatFx.length - 48);
  }
  function tickCombatFx(dt) {
    combatFx.forEach((e) => (e.ttl -= dt));
    combatFx = combatFx.filter((e) => e.ttl > 0);
  }
  function drawCombatFx(ctx, list) {
    for (const e of list) {
      const t = 1 - e.ttl / (e.max || 0.4);
      const a = Math.max(0, e.ttl / (e.max || 0.4));
      const k = e.k || "spark";
      ctx.save();
      ctx.globalAlpha = Math.min(1, a * 1.15);
      if (k === "hit" || k === "kill") {
        const col = k === "kill" ? "#fb7185" : "#f97316";
        const s = 10 + t * 28;
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(e.x - s, e.y - s); ctx.lineTo(e.x + s, e.y + s);
        ctx.moveTo(e.x + s, e.y - s); ctx.lineTo(e.x - s, e.y + s);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(e.x, e.y, 8 + t * 18, 0, 6.28); ctx.stroke();
        if (k === "kill") {
          ctx.fillStyle = "rgba(251,113,133,0.25)";
          ctx.beginPath(); ctx.arc(e.x, e.y, 14 + t * 30, 0, 6.28); ctx.fill();
        }
      } else if (k === "block" || k === "reflect") {
        ctx.strokeStyle = k === "reflect" ? "#a78bfa" : "#38bdf8";
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, 14 + t * 22, 0, 6.28); ctx.stroke();
        ctx.beginPath(); ctx.arc(e.x, e.y, 8 + t * 10, Math.PI * 0.15, Math.PI * 1.1); ctx.stroke();
      } else if (k === "push" || k === "dash" || k === "phase") {
        ctx.strokeStyle = k === "push" ? "#fbbf24" : "#38bdf8";
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.arc(e.x, e.y, 10 + t * 20 + i * 8, 0, 6.28); ctx.stroke();
        }
      } else if (k === "heal" || k === "buff" || k === "pickup") {
        ctx.fillStyle = k === "heal" || k === "pickup" ? "rgba(34,197,94,0.45)" : "rgba(249,115,22,0.4)";
        ctx.beginPath(); ctx.arc(e.x, e.y, 10 + t * 16, 0, 6.28); ctx.fill();
        ctx.strokeStyle = k === "buff" ? "#f97316" : "#4ade80";
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 12 + t * 14, 0, 6.28); ctx.stroke();
      } else if (k === "boom" || k === "nexus") {
        ctx.fillStyle = "rgba(249,115,22,0.3)";
        ctx.beginPath(); ctx.arc(e.x, e.y, (e.r || 24) * (0.5 + t), 0, 6.28); ctx.fill();
        ctx.strokeStyle = "#f97316"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, (e.r || 24) * (0.4 + t * 0.8), 0, 6.28); ctx.stroke();
      } else if (k === "recall") {
        ctx.strokeStyle = "#a78bfa"; ctx.lineWidth = 3; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.arc(e.x, e.y, 12 + t * 26, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
      } else if (k === "catch") {
        ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, 10 + t * 34, 0, 6.28); ctx.stroke();
        ctx.fillStyle = "rgba(34,197,94,0.2)";
        ctx.beginPath(); ctx.arc(e.x, e.y, 8 + t * 20, 0, 6.28); ctx.fill();
      } else {
        ctx.fillStyle = `rgba(253,224,71,${0.55 * a})`;
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 + t * 4;
          const rr = 6 + t * 16;
          ctx.beginPath(); ctx.arc(e.x + Math.cos(ang) * rr, e.y + Math.sin(ang) * rr, 2.5, 0, 6.28); ctx.fill();
        }
      }
      ctx.restore();
    }
  }
  function muteIco() { return MA.isMuted() ? "🔇" : "🔊"; }

  // ----------------------------------------------------------------- 연결 (P2P bridge — no game server)
  function connect(onOpen) {
    if (bridge && bridge.ensure) {
      bridge.ensure(function () { onOpen && onOpen(); });
      return;
    }
    onOpen && onOpen();
  }
  function send(obj) {
    try { if (bridge && bridge.send) bridge.send(obj); } catch (e) {}
  }
  function pushIncoming(m) {
    try { handle(m); } catch (e) { console.warn(e); }
  }

  function handle(m) {
    if (m.t === "joined") {
      me.id = m.id; me.isHost = m.isHost;
      room = { code: m.code, gameType: m.gameType, roomName: m.roomName || "", players: [], game: {} };
      shellType = null;
      renderRoom();
    } else if (m.t === "state") {
      if (!room) return;
      const prevType = room.gameType;
      room.players = m.players; room.game = m.game; room.gameType = m.gameType;
      if (m.roomName != null) room.roomName = m.roomName;
      me.isHost = (m.players.find((p) => p.id === me.id) || {}).isHost || false;
      if (pendingGameType && room.gameType === pendingGameType) {
        T(gmeta(pendingGameType).name + "으로 변경했습니다.", "ok");
        pendingGameType = null;
      } else if (pendingGameType && prevType !== room.gameType) {
        pendingGameType = null;
      }
      renderRoom();
    } else if (m.t === "pose") {
      /* 메시 조기 포즈 — 권위 스냅샷 전 부드러운 보간 */
      if (lastArena && lastArena.ps && m.i != null) {
        const row = lastArena.ps.find((p) => p.i === m.i || p.id === m.i);
        if (row && (m.angle != null || m.mvx != null)) {
          if (m.angle != null) row.a = m.angle;
          if (typeof m.mvx === "number" && typeof m.mvy === "number") {
            const sp = 3.2;
            row.x = Math.round((row.x || 0) + m.mvx * sp);
            row.y = Math.round((row.y || 0) + m.mvy * sp);
          }
          drawArena();
        }
      }
      if (lastCops && lastCops.ps && m.i != null) {
        const row = (lastCops.ps || []).find((p) => p.i === m.i || p.id === m.i);
        if (row && typeof m.mvx === "number") {
          row.x = Math.round((row.x || 0) + m.mvx * 4);
          row.y = Math.round((row.y || 0) + m.mvy * 4);
          onCopsMsg();
        }
      }
    } else if (m.t === "arena") {
      if (!startPlayed) { MA.sfx("start"); startPlayed = true; arenaCamSnap = true; arenaKillFeed = []; arenaConquestFeed = []; combatFx = []; root._arenaFxSeen = new Map(); }
      if (m.ps) m.ps = m.ps.map((p) => ({ ...p, id: p.i }));
      let feedChanged = false;
      if (m.feed) {
        for (const k of m.feed) {
          if (!arenaKillFeed.some((x) => x.id === k.id)) { arenaKillFeed.unshift({ ...k, at: k.at || Date.now() }); feedChanged = true; }
        }
        const prevLen = arenaKillFeed.length;
        arenaKillFeed = pruneFeedEntries(arenaKillFeed);
        if (arenaKillFeed.length !== prevLen) feedChanged = true;
        if (m.feed.length) scheduleFeedPrune();
      }
      if (m.conquest) {
        for (const k of m.conquest) {
          if (!arenaConquestFeed.some((x) => x.id === k.id)) {
            arenaConquestFeed.unshift({ ...k, at: k.at || Date.now() });
            T(`팀${k.from + 1} 점령 → 팀${k.to + 1} 소속`, "ok");
            MA.sfx("explode");
          }
        }
        arenaConquestFeed = pruneFeedEntries(arenaConquestFeed);
      }
      lastArena = m;
      if (m.fx && m.fx.length) {
        const nowFx = Date.now();
        if (!root._arenaFxSeen) root._arenaFxSeen = new Map();
        for (const f of m.fx) {
          const key = `${f.k || "spark"}|${f.x}|${f.y}`;
          const prev = root._arenaFxSeen.get(key) || 0;
          if (nowFx - prev < 90) continue;
          root._arenaFxSeen.set(key, nowFx);
          spawnCombatFx(f.x, f.y, f.k || "spark", f.k === "boom" || f.k === "kill" ? 0.55 : 0.35);
        }
        if (root._arenaFxSeen.size > 60) {
          for (const [k, t] of root._arenaFxSeen) if (nowFx - t > 800) root._arenaFxSeen.delete(k);
        }
      }
      drawArena(); updateArenaHud();
      if (feedChanged) updateArenaKillFeedDom();
    } else if (m.t === "arena-end") {
      onArenaEnd(m);
    } else if (m.t === "rooms") {
      roomListCache = m.rooms; updateRoomList();
    } else if (m.t === "cops") {
      if (!startPlayed) { MA.sfx("start"); startPlayed = true; copsCatchFeed = []; copsMimicKillFeed = []; mimicCam = { x: null, y: null }; copsMimicWalls = null; mimicBgKey = ""; root._mimicHostileToast = false; root._mimicZoneToast = false; combatFx = []; copsShots = []; copsSlashes = []; }
      if (m.walls) copsMimicWalls = m.walls;
      else if (copsMimicWalls && m.mode === "mimic") m.walls = copsMimicWalls;
      copsRole = m.role; lastCops = m; onCopsMsg();
      if (room?.game?.started) startCopsRender();
    } else if (m.t === "cops-shot") {
      copsShots.push({ x: m.x, y: m.y, hit: m.hit, kind: m.kind || (m.hit ? "catch" : "spark"), ttl: 0.4, max: 0.4 });
      spawnCombatFx(m.x, m.y, m.kind || (m.hit ? "catch" : "spark"), 0.4);
      MA.sfx(m.hit || m.kind === "catch" ? "catch" : (m.kind === "block" || m.kind === "reflect" ? "item" : "laser"));
    } else if (m.t === "cops-end") {
      onCopsEnd(m);
    } else if (m.t === "kitchen-hint") {
      showKitchenHint(m.msg);
    } else if (m.t === "kitchen-score") {
      showKitchenScore(m);
    } else if (m.t === "kitchen") {
      if (!startPlayed) { MA.sfx("start"); startPlayed = true; }
      if (m.ps) m.ps = m.ps.map((p) => ({ ...p, id: p.i }));
      lastKitchen = m;
      fitKitchenCanvas(root.querySelector("#kcanvas"), root.querySelector(".kitchen-stage")?.getBoundingClientRect() || { width: 0, height: 0 });
      drawKitchen();
      updateKitchenHud();
    } else if (m.t === "kitchen-end") {
      onKitchenEnd(m);
    } else if (m.t === "relic-maps") {
      relicMaps = m.maps || [];
      refreshMapSelect();
    } else if (m.t === "control-layouts") {
      controlLayouts = m.layouts || {};
    } else if (m.t === "count") {
      showCountdown(m.n);
    } else if (m.t === "event") {
      handleEvent(m);
    } else if (m.t === "auth") {
      if (m.ok) {
        loggedIn = true;
        account.name = m.name; nickname = m.name;
        localStorage.setItem("mg_name", account.name);
        localStorage.setItem("mg_pw", account.pw);
        rankings = m.rankings || null;
        if (arcadeMode) {
          /* 로비에서 방만들기/참가·게임카드로 진입 — 허브(방만들기/참가/랭킹)는 띄우지 않음 */
          if (!room) renderRoomPending();
        } else {
          hubView = "menu"; renderHub();
        }
        if (m.created) T("새 계정을 만들었습니다: " + m.name, "ok");
      } else {
        loggedIn = false; account.pw = ""; localStorage.removeItem("mg_pw");
        renderLogin(m.err || "로그인 실패");
      }
    } else if (m.t === "rankings") {
      rankings = m.rankings;
      if (!room && ["rank", "menu", "create", "join", "rank-admin"].includes(hubView)) renderRankInPlace();
    } else if (m.t === "account-list") {
      accountListCache = m.accounts || [];
      if (hubView === "accounts" || hubView === "rank-admin") renderHubInner();
    } else if (m.t === "admin-clear-result") {
      if (m.ok) {
        rankings = m.rankings || rankings;
        if (m.accounts) accountListCache = m.accounts;
        rankAdminSelectedUsers.clear();
        const who = m.users?.length ? m.users.join(", ") : "전체 유저";
        const what = (m.keys || []).map((k) => RANK_META[k]?.name || CLEAR_GAME_LABEL[k] || k).join(", ");
        let msg = `${who} · ${what || "전체"} 기록을 삭제했습니다.`;
        if (m.removedAccounts > 0) msg += ` (계정 ${m.removedAccounts}개 제거)`;
        T(msg, "ok");
        renderHubInner();
        renderRankInPlace();
      } else {
        T(m.err || "삭제 실패", "err");
      }
    } else if (m.t === "error") {
      if (pendingGameType) pendingGameType = null;
      T(m.msg, "err");
    }
  }

  function handleEvent(m) {
    if (m.name === "spin") { animateSpin(m.index, m.count, m.duration); MA.sfx("spin"); }
    else if (m.name === "drawn") { MA.sfx("draw"); }
  }

  // 게임 시작 5초 카운트다운 오버레이
  let countTimer = null;
  function enterGameView() {
    if (inGameView) return;
    inGameView = true;
    goFullscreen();
    root.classList.add("mg-gameplay");
    document.body.classList.add("mg-gameplay-body");
    fitGameStage();
  }
  function leaveGameView() {
    if (!inGameView) return;
    inGameView = false;
    root.classList.remove("mg-gameplay");
    document.body.classList.remove("mg-gameplay-body");
  }
  function fitGameStage() {
    const stage = root.querySelector(".arena-stage"); if (!stage) return;
    const cv = stage.querySelector("canvas"); if (!cv) return;
    const r = stage.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    if (isKitchenGame() && cv.id === "kcanvas") {
      fitKitchenCanvas(cv, r);
    } else {
      cv.style.width = "100%";
      cv.style.height = "100%";
    }
    const scale = computeCtlScale(r.width, r.height);
    stage.style.setProperty("--ctl-scale", String(scale));
    document.documentElement.style.setProperty("--vw-short", Math.min(r.width, r.height) + "px");
    if (room?.gameType === "arena") applyControlLayout("arena");
    else if (room?.gameType === "cops" && copsRole) {
      const mode = lastCops?.mode || room?.game?.mode;
      const spec = !!(lastCops && lastCops.mode === "mimic" && lastCops.dead && copsRole === "player");
      applyControlLayout(copsLayoutProfile(copsRole, spec, mode));
    } else if (isKitchenGame()) applyControlLayout(kitchenLayoutProfile());
  }
  function fitKitchenCanvas(cv, rect) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cssW = Math.floor(rect.width);
    const cssH = Math.floor(rect.height);
    const pw = Math.max(1, Math.floor(cssW * dpr));
    const ph = Math.max(1, Math.floor(cssH * dpr));
    if (cv.width !== pw || cv.height !== ph) {
      cv.width = pw;
      cv.height = ph;
    }
    cv.style.width = cssW + "px";
    cv.style.height = cssH + "px";
  }
  function kitchenViewScale(cv, tut) {
    const wW = tut ? 1100 : 2200;
    const wH = 920;
    const mobile = window.innerWidth < 640;
    const zoom = mobile ? 0.88 : 0.72;
    return Math.min(cv.width / (wW * zoom), cv.height / (wH * zoom));
  }
  function showCountdown(n) {
    if (n > 0) enterGameView();
    let ov = root.querySelector("#countOverlay");
    if (n <= 0) { if (ov) ov.remove(); if (countTimer) { clearTimeout(countTimer); countTimer = null; } return; }
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "countOverlay"; ov.className = "count-overlay";
      root.appendChild(ov);
    }
    ov.innerHTML = `<div class="count-inner"><div class="count-num">${n}</div><div class="count-lb">게임 시작!</div></div>`;
    MA.sfx("nav");
    if (countTimer) clearTimeout(countTimer);
    countTimer = setTimeout(() => { const o = root.querySelector("#countOverlay"); if (o) o.remove(); }, 1400);
  }

  // 대기방(Ready 목록 + Go/준비 버튼) HTML — 아레나·경찰과도둑 공용
  function waitRoomHtml() {
    if (!room) return "";
    const ps = room.players || [];
    const ready = ps.filter((p) => p.ready);
    const notReady = ps.filter((p) => !p.ready);
    const meP = ps.find((p) => p.id === me.id);
    const iAmReady = meP && meP.ready;
    const chip = (p) => `<span class="wr-chip" style="border-color:${p.color}"><b style="color:${p.color}">●</b> ${escHtml(p.name)}${p.isHost ? " 👑" : ""}${p.id === me.id ? " (나)" : ""}</span>`;
    return `
    <div class="wait-room">
      <div class="wr-head">🎮 대기방 — 방장이 <b>Go</b>를 누르면 5초 후 시작합니다</div>
      <div class="wr-cols">
        <div class="wr-col ready">
          <div class="wr-col-t">✅ 준비 완료 (${ready.length})</div>
          <div class="wr-list">${ready.map(chip).join("") || '<span class="wr-empty">아직 없음</span>'}</div>
        </div>
        <div class="wr-col wait">
          <div class="wr-col-t">⏳ 대기 중 (${notReady.length})</div>
          <div class="wr-list">${notReady.map(chip).join("") || '<span class="wr-empty">모두 준비됨!</span>'}</div>
        </div>
      </div>
      <div class="wr-actions">
        <button class="btn gray block" data-mg="ctl-edit">🎛 조작 배치 미리보기 · 조정</button>
        <p class="muted center" style="font-size:12px;margin:6px 0 0">미리보기에서 ← 대기실로 누르면 이 화면으로 돌아옵니다</p>
        <button class="btn ${iAmReady ? "gray" : ""} block" data-mg="toggle-ready">${iAmReady ? "준비 취소" : "✋ 준비 완료"}</button>
        ${me.isHost ? `<button class="btn go block" data-mg="go-start">🚀 Go! 게임 시작 (${ready.length}/${ps.length} 준비)</button>` : ""}
      </div>
    </div>`;
  }

  // ----------------------------------------------------------------- 진입/종료
  function open() {
    root._mgClosed = false;
    root.classList.remove("hidden");
    /* 대기/설정은 내부 스크롤, 인게임만 페이지 스크롤 잠금 */
    document.body.style.overflow = "";
    MA.resume();
    // 모바일: 게임 조작 영역에서 터치하면 화면이 스크롤/이동되지 않도록 방지
    if (!touchGuardAdded) {
      touchGuardAdded = true;
      document.addEventListener("touchmove", (e) => {
        if (e.target && e.target.closest && e.target.closest(".arena-stage")) e.preventDefault();
      }, { passive: false });
    }
    loggedIn = false;
    if (arcadeMode) {
      if (!account.pw) account.pw = "guest";
      if (!account.name) account.name = nickname || "플레이어";
      connect(() => send({ t: "login", name: account.name, password: account.pw || "guest" }));
      renderLoggingIn();
    } else if (account.name && account.pw) {
      connect(() => send({ t: "login", name: account.name, password: account.pw }));
      renderLoggingIn();
    } else {
      connect();
      renderLogin();
    }
  }
  function doLogin() {
    const name = (root.querySelector("#mgLoginName")?.value || "").trim();
    const pw = root.querySelector("#mgLoginPw")?.value || "";
    if (!name) return T("이름을 입력하세요.", "err");
    if (!pw) return T("비밀번호를 입력하세요.", "err");
    account.name = name; account.pw = pw;
    renderLoggingIn();
    connect(() => send({ t: "login", name, password: pw }));
  }
  function doLogout() {
    loggedIn = false; account.pw = ""; localStorage.removeItem("mg_pw");
    leave();
    renderLogin();
  }
  function requestRanking() { if (ws && ws.readyState === 1) send({ t: "ranking" }); else connect(() => send({ t: "ranking" })); }
  function requestAccountList() {
    if (ws && ws.readyState === 1) send({ t: "account-list" });
    else connect(() => send({ t: "account-list" }));
  }
  // 모바일: 게임 실행 시 전체화면으로 전환해 브라우저 UI/스크롤 방지
  function goFullscreen() {
    try {
      const el = root;
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      if (el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) {}
  }
  function exitFullscreen() {
    try {
      if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen && document.webkitFullscreenElement) document.webkitExitFullscreen();
    } catch (e) {}
  }
  function exitGameView() {
    leaveGameView();
    exitFullscreen();
  }
  function close() {
    if (root._mgClosed) return;
    root._mgClosed = true;
    const navLobby = arcadeMode && !document.getElementById("view-lobby")?.classList.contains("is-visible");
    leave();
    try { if (bridge && bridge.destroy) bridge.destroy(); } catch (e) {}
    try { ws && ws.close(); } catch (e) {}
    ws = null; room = null; shellType = null;
    stopInputLoop();
    MA.stopBgm();
    leaveGameView();
    exitFullscreen();
    root.classList.add("hidden");
    document.body.style.overflow = "";
    if (navLobby) {
      try {
        const back = document.getElementById("btn-back");
        if (back) setTimeout(() => back.click(), 0);
      } catch (e) {}
    }
  }
  function leave() {
    if (ws && room) send({ t: "leave" });
    room = null; shellType = null; stopInputLoop();
  }

  // ----------------------------------------------------------------- 허브
  const GAMES = [
    { key: "arena", ico: "🕹️", name: "아레나", desc: "팀 슈팅 · 넥서스 파괴전 · 공개방 P2P" },
    { key: "cops", ico: "🕵️", name: "경찰과 도둑", desc: "유물부수기 · AI처럼 행동하기 · 공개방 P2P" },
  ];
  const gmeta = (k) => GAMES.find((g) => g.key === k) || { ico: "🎮", name: k };

  function canSwitchGame() {
    if (!room || !me.isHost) return false;
    const g = room.game || {};
    if (g.counting) return false;
    if (room.gameType === "arena" && g.started) return false;
    if (room.gameType === "cops" && g.started) return false;
    return true;
  }
  function updateGameSwitch() {
    let el = root.querySelector("#mgGameSwitch");
    if (!canSwitchGame()) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div");
      el.id = "mgGameSwitch";
      el.className = "mg-game-switch";
      const players = root.querySelector("#mgPlayers");
      if (players) players.after(el);
      else root.querySelector(".mg-top")?.after(el);
    }
    el.innerHTML = `
      <div class="gsw-label">게임 변경 (방장)</div>
      <div class="gsw-row">${GAMES.map((g) =>
        `<button type="button" class="gsw-btn ${room.gameType === g.key ? "sel" : ""}" data-mg="switch-game" data-game="${g.key}">
          <span class="gsw-ico">${g.ico}</span><span class="gsw-name">${g.name}</span>
        </button>`).join("")}</div>`;
  }

  function getNick() { return account.name || nickname || "익명"; }
  function requestList() { if (ws && ws.readyState === 1) send({ t: "list" }); else connect(() => send({ t: "list" })); }
  function doCreate() {
    const n = getNick();
    const roomName = (root.querySelector("#mgCreateRoomName")?.value || "").trim();
    connect(() => send({ t: "create", name: n, gameType: createGame, password: "", roomName, isPublic: true }));
  }
  function doJoin(code, password) {
    const n = getNick();
    connect(() => send({ t: "join", name: n, code: String(code).toUpperCase(), password: password || "" }));
  }

  function renderLogin(err) {
    root.innerHTML = `
    <div class="mg-top">
      <button class="mg-back" data-mg="close">✕</button>
      <div class="mg-title">🎮 미니게임</div>
      <div style="width:40px"></div>
    </div>
    <div class="mg-body">
      <div class="mg-card mg-login">
        <h3 class="mg-h">로그인 / 회원가입</h3>
        <p class="muted">이름과 비밀번호로 접속하세요. 처음 쓰는 이름은 자동으로 계정이 만들어지고,
          다음에 같은 이름·비밀번호로 접속하면 점수·랭킹이 이어집니다.</p>
        <label class="fld"><span class="lbl">이름</span>
          <input id="mgLoginName" maxlength="12" placeholder="예: 홍길동" value="${escAttr(account.name)}" /></label>
        <label class="fld"><span class="lbl">비밀번호</span>
          <input id="mgLoginPw" type="password" maxlength="30" placeholder="비밀번호" autocomplete="off" /></label>
        ${err ? `<div class="mg-err">${escHtml(err)}</div>` : ""}
        <button class="btn block" data-mg="login-go">입장</button>
      </div>
    </div>`;
    setTimeout(() => root.querySelector(account.name ? "#mgLoginPw" : "#mgLoginName")?.focus(), 60);
  }

  function renderLoggingIn() {
    root.innerHTML = `
    <div class="mg-top">
      <button class="mg-back" data-mg="close">✕</button>
      <div class="mg-title">🎮 미니게임</div>
      <div style="width:40px"></div>
    </div>
    <div class="mg-body"><div class="mg-card center"><div class="muted" style="padding:30px">로그인 중...</div></div></div>`;
  }
  function renderRoomPending() {
    root.innerHTML = `
    <div class="mg-top">
      <button class="mg-back" data-mg="close">← 로비</button>
      <div class="mg-title">🎮 미니게임</div>
      <div style="width:40px"></div>
    </div>
    <div class="mg-body"><div class="mg-card center"><div class="muted" style="padding:30px">방 준비 중…</div></div></div>`;
  }

  function renderHub() {
    shellType = null; copsRole = null; lastCops = null;
    MA.bgm("lobby");
    if (arcadeMode) {
      renderRoomPending();
      return;
    }
    root.innerHTML = `
    <div class="mg-top">
      <button class="mg-back" data-mg="close">✕</button>
      <div class="mg-title">🎮 미니게임</div>
      <button class="mg-back" data-mg="mute" title="소리 켜기/끄기">${muteIco()}</button>
    </div>
    <div class="mg-body">
      <div class="mg-userbar">
        <span class="mg-userchip">👤 <b>${escHtml(account.name)}</b></span>
        <button class="btn gray sm" data-mg="hub-rank-view">🏆 랭킹</button>
        <button class="btn gray sm" data-mg="logout">로그아웃</button>
      </div>
      <div id="mgHub"></div>
    </div>`;
    renderHubInner();
  }

  const RANK_META = {
    overall: { ico: "🏆", name: "종합", accent: "#fbbf24" },
    arena: { ico: "🕹️", name: "아레나", accent: "#a78bfa" },
    cops: { ico: "🕵️", name: "경찰과 도둑", accent: "#38bdf8" },
    kart: { ico: "🏎️", name: "카드라이더", accent: "#2de2c5" },
  };
  const CLEAR_GAME_LABEL = {
    arena: "아레나", cops: "경찰과 도둑", kart: "카드라이더",
  };
  const CLEAR_GAME_OPTIONS = [
    { key: "arena", ico: "🕹️" },
    { key: "cops", ico: "🕵️" },
    { key: "kart", ico: "🏎️" },
  ];
  function winRate(r) { return r.plays ? Math.round((r.wins / r.plays) * 100) : 0; }
  function kda(r) { return ((r.kills || 0) / Math.max(1, r.deaths || 0)).toFixed(2); }
  function avg(v, r) { return r.plays ? ((v || 0) / r.plays).toFixed(1) : "0.0"; }

  // 상위 3인 포디움
  function podiumHtml(list) {
    if (!list.length) return "";
    const order = [1, 0, 2]; // 2등, 1등, 3등 배치
    const medals = ["🥇", "🥈", "🥉"];
    const cells = order.map((idx) => {
      const r = list[idx];
      if (!r) return `<div class="pod-cell pod-empty"></div>`;
      return `<div class="pod-cell pod-${idx + 1}">
        <div class="pod-medal">${medals[idx]}</div>
        <div class="pod-name">${escHtml(r.name)}</div>
        <div class="pod-score">${r.score}점</div>
        <div class="pod-sub">${winRate(r)}% · ${r.plays}판</div>
      </div>`;
    }).join("");
    return `<div class="rk-podium">${cells}</div>`;
  }

  function rankTableHtml(list, tab) {
    if (!list.length) return `<div class="muted center" style="padding:26px 12px">아직 기록이 없습니다.<br><small>게임을 플레이하면 랭킹에 등록됩니다!</small></div>`;
    let head, cols;
    if (tab === "cops") {
      head = `<th>#</th><th>이름</th><th>점수</th><th>승률</th><th>검거</th><th>훔침</th><th>KDA</th><th>판</th>`;
      cols = (r) => `<td class="rk-sc">${r.score}</td><td>${winRate(r)}%</td><td>${r.catches || 0}</td><td>${r.steals || 0}</td><td>${kda(r)}</td><td>${r.plays}</td>`;
    } else if (tab === "kitchen") {
      head = `<th>#</th><th>이름</th><th>점수</th><th>승률</th><th>판</th>`;
      cols = (r) => `<td class="rk-sc">${r.score}</td><td>${winRate(r)}%</td><td>${r.plays}</td>`;
    } else if (tab === "arena") {
      head = `<th>#</th><th>이름</th><th>점수</th><th>승률</th><th>KDA</th><th>평균킬</th><th>연속킬</th><th>판</th>`;
      cols = (r) => `<td class="rk-sc">${r.score}</td><td>${winRate(r)}%</td><td>${kda(r)}</td><td>${avg(r.kills, r)}</td><td class="rk-streak">${r.streak || 0}</td><td>${r.plays}</td>`;
    } else {
      head = `<th>#</th><th>이름</th><th>점수</th><th>승률</th><th>KDA</th><th>최고연속</th><th>판</th>`;
      cols = (r) => `<td class="rk-sc">${r.score}</td><td>${winRate(r)}%</td><td>${kda(r)}</td><td class="rk-streak">${r.streak || 0}</td><td>${r.plays}</td>`;
    }
    const rows = list.map((r, i) => {
      const classes = [];
      if (i < 3) classes.push("rk-top", "rk-top" + (i + 1));
      if (r.name === account.name) classes.push("rk-me");
      const cls = classes.length ? ` class="${classes.join(" ")}"` : "";
      const pos = i < 3 ? ["🥇", "🥈", "🥉"][i] : (i + 1);
      return `<tr${cls}><td class="rk-pos">${pos}</td><td>${escHtml(r.name)}</td>${cols(r)}</tr>`;
    }).join("");
    return `<table class="rk-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  // 랭킹 갱신 시 화면 반영 (입력값 보존을 위해 티저만 교체)
  function renderRankInPlace() {
    if (hubView === "rank") { renderHubInner(); return; }
    const tz = root.querySelector(".rk-teaser");
    if (tz) tz.outerHTML = rankTeaserHtml();
  }

  function renderAccountsView() {
    const list = accountListCache || [];
    const rows = list.length
      ? list.map((a) => {
          const gtxt = Object.entries(a.games || {}).map(([k, g]) =>
            `${CLEAR_GAME_LABEL[k] || k} ${g.score}점·${g.plays}판`
          ).join(" · ");
          return `<tr><td class="acc-name">${escHtml(a.name)}</td><td>${a.totalScore || 0}</td><td>${a.totalPlays || 0}</td><td class="acc-games">${escHtml(gtxt)}</td></tr>`;
        }).join("")
      : `<tr><td colspan="4" class="muted center" style="padding:24px">기록이 있는 계정이 없습니다.</td></tr>`;
    return `<div class="mg-crumb"><button class="mg-back sm" data-mg="hub-back">←</button>
      <h3 class="mg-h" style="margin:0">👥 계정 목록</h3>
      <button class="btn gray sm" data-mg="accounts-refresh" style="margin-left:auto">↻ 새로고침</button></div>
      <div class="mg-card">
        <p class="muted" style="margin:0 0 12px">기록 있는 계정 <b>${list.length}</b>개 · 비밀번호는 표시되지 않습니다.</p>
        <div class="table-wrap"><table class="rk-table acc-table">
          <thead><tr><th style="text-align:left">이름</th><th>총점</th><th>총판</th><th style="text-align:left">게임별 기록</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }

  function renderRankAdminView() {
    if (!mgRankAdminAuthed) {
      return `<div class="mg-crumb"><button class="mg-back sm" data-mg="hub-back">←</button>
        <h3 class="mg-h" style="margin:0">🛠 랭킹 관리</h3></div>
        <div class="mg-card mg-admin-gate">
          <p class="muted">랭킹 기록을 삭제하려면 관리자 비밀번호를 입력하세요.</p>
          <label class="fld"><span class="lbl">관리자 비밀번호</span>
            <input id="mgRankAdminPw" type="password" placeholder="비밀번호" autocomplete="off" /></label>
          <button class="btn block" data-mg="rank-admin-login">확인</button>
        </div>`;
    }
    const picks = CLEAR_GAME_OPTIONS.map((g) => {
      const on = rankAdminSelected.has(g.key);
      return `<button type="button" class="rank-clear-chip ${on ? "on" : ""}" data-mg="rank-clear-toggle" data-game="${g.key}">${g.ico} ${CLEAR_GAME_LABEL[g.key]}</button>`;
    }).join("");
    const selTxt = rankAdminSelected.size
      ? [...rankAdminSelected].map((k) => CLEAR_GAME_LABEL[k]).join(", ")
      : "없음";
    const userSelTxt = rankAdminSelectedUsers.size
      ? [...rankAdminSelectedUsers].map((n) => escHtml(n)).join(", ")
      : "전체 유저";
    const list = accountListCache || [];
    const userRows = list.length ? list.map((a) => {
      const on = rankAdminSelectedUsers.has(a.name);
      const gtxt = Object.entries(a.games || {}).map(([k, g]) =>
        `${CLEAR_GAME_LABEL[k] || k} ${g.score}점`
      ).join(" · ");
      return `<div class="rank-user-row">
        <button type="button" class="rank-clear-chip user ${on ? "on" : ""}" data-mg="rank-user-toggle" data-user="${escAttr(a.name)}">${escHtml(a.name)}</button>
        <span class="rank-user-meta">${escHtml(gtxt)} · ${a.totalPlays || 0}판</span>
      </div>`;
    }).join("") : `<div class="muted center" style="padding:16px">기록이 있는 계정이 없습니다.</div>`;
    return `<div class="mg-crumb"><button class="mg-back sm" data-mg="hub-back">←</button>
      <h3 class="mg-h" style="margin:0">🛠 랭킹 관리</h3>
      <button class="btn gray sm" data-mg="rank-admin-refresh" style="margin-left:auto">↻</button>
      <button class="btn gray sm" data-mg="rank-admin-logout">잠금</button></div>
      <div class="mg-card">
        <h4 class="mg-h" style="margin:0 0 8px">1. 게임 선택</h4>
        <p class="muted" style="margin:0 0 8px">삭제할 게임 (${escHtml(selTxt)})</p>
        <div class="rank-clear-chips">${picks}</div>
      </div>
      <div class="mg-card">
        <h4 class="mg-h" style="margin:0 0 8px">2. 유저 선택 (선택)</h4>
        <p class="muted" style="margin:0 0 8px">유저를 고르면 해당 유저만 삭제합니다. 선택 없으면 <b>전체 유저</b>입니다.<br>
          기록이 모두 없어진 계정은 목록에서 자동 제거됩니다.</p>
        <p class="hint" style="margin:0 0 10px">대상: ${userSelTxt}</p>
        <div class="rank-user-list">${userRows}</div>
        <div class="mg-row" style="gap:8px;flex-wrap:wrap;margin-top:14px">
          <button class="btn" data-mg="rank-clear-selected">🗑 선택 삭제</button>
          <button class="btn red" data-mg="rank-clear-all">⚠ 전체 삭제</button>
        </div>
      </div>`;
  }

  function renderRankView() {
    const R = rankings || {};
    const list = R[rankTab] || [];
    const tabs = ["overall", "arena", "cops", "kart"].map((k) =>
      `<button class="rk-tab ${rankTab === k ? "on" : ""}" data-mg="rank-tab" data-tab="${k}">${RANK_META[k].ico} ${RANK_META[k].name}</button>`
    ).join("");
    return `<div class="mg-crumb"><button class="mg-back sm" data-mg="hub-back">←</button>
      <h3 class="mg-h" style="margin:0">🏆 명예의 전당</h3>
      <button class="btn gray sm" data-mg="rank-refresh" style="margin-left:auto">↻ 새로고침</button></div>
      <div class="rk-tabs">${tabs}</div>
      <div class="mg-card rk-card">
        ${podiumHtml(list)}
        ${rankTableHtml(list, rankTab)}
      </div>`;
  }

  // 방 만들기/참가 화면용 랭킹 티저 (종합 TOP5)
  function rankTeaserHtml() {
    const list = (rankings && rankings.overall) || [];
    const medals = ["🥇", "🥈", "🥉", "4", "5"];
    const rows = list.slice(0, 5).map((r, i) =>
      `<div class="tz-row${r.name === account.name ? " tz-me" : ""}">
        <span class="tz-rank">${medals[i]}</span>
        <span class="tz-name">${escHtml(r.name)}</span>
        <span class="tz-score">${r.score}점</span>
      </div>`).join("");
    const body = list.length ? rows : `<div class="muted center" style="padding:14px">첫 우승의 주인공이 되어보세요! 🔥</div>`;
    return `<div class="mg-card rk-teaser">
      <div class="tz-head">🏆 명예의 전당 TOP 5 <button class="btn gray sm" data-mg="hub-rank-view" style="margin-left:auto">전체보기</button></div>
      ${body}</div>`;
  }

  function renderHubInner() {
    const el = root.querySelector("#mgHub"); if (!el) return;
    if (hubView === "rank") {
      el.innerHTML = renderRankView();
    } else if (hubView === "accounts") {
      el.innerHTML = renderAccountsView();
    } else if (hubView === "rank-admin") {
      el.innerHTML = renderRankAdminView();
      if (mgRankAdminAuthed) requestAccountList();
    } else if (hubView === "menu") {
      el.innerHTML = `
      <div class="hub-menu">
        <button class="hub-big" data-mg="hub-create-view"><span class="hb-ico">➕</span><b>방 만들기</b><small>공개방 방장이 되어 사람 모으기</small></button>
        <button class="hub-big" data-mg="hub-join-view"><span class="hb-ico">🚪</span><b>방 참가</b><small>공개방 목록 · 코드 참가</small></button>
        <button class="hub-big" data-mg="hub-rank-view"><span class="hb-ico">🏆</span><b>랭킹</b><small>명예의 전당</small></button>
      </div>
      ${rankTeaserHtml()}`;
      requestRanking();
    } else if (hubView === "create") {
      el.innerHTML = `
      <div class="mg-card">
        <div class="mg-crumb"><button class="mg-back sm" data-mg="hub-back">←</button><h3 class="mg-h" style="margin:0">공개 방 만들기</h3></div>
        <div class="mg-games">
          ${GAMES.map((g) => `
            <button class="mg-game ${createGame === g.key ? "sel" : ""}" data-mg="pickgame" data-game="${g.key}">
              <span class="gico">${g.ico}</span><span class="gname">${g.name}</span><span class="gdesc">${g.desc}</span>
            </button>`).join("")}
        </div>
        <label class="fld" style="margin-top:14px"><span class="lbl">방 이름</span>
          <input id="mgCreateRoomName" maxlength="20" placeholder="예: 초보 환영" autocomplete="off" /></label>
        <p class="muted" style="margin:8px 0 12px">방 만들기한 사람이 공개방 주인이 됩니다. 로비 목록에 자동 등록됩니다.</p>
        <button class="btn block" data-mg="create-go">➕ ${gmeta(createGame).name} 공개방 만들기</button>
      </div>
      ${rankTeaserHtml()}`;
      requestRanking();
    } else if (hubView === "join") {
      el.innerHTML = `
      <div class="mg-card">
        <div class="mg-crumb"><button class="mg-back sm" data-mg="hub-back">←</button><h3 class="mg-h" style="margin:0">열린 방 목록</h3>
          <button class="btn gray sm" data-mg="refresh" style="margin-left:auto">↻ 새로고침</button></div>
        <div id="mgRoomList" class="room-list"></div>
      </div>
      <div class="mg-card">
        <h3 class="mg-h">코드로 직접 참가</h3>
        <div class="mg-join">
          <input id="mgCode" maxlength="4" placeholder="방 코드" style="text-transform:uppercase" />
          <input id="mgJoinPw" placeholder="비번(있으면)" autocomplete="off" style="max-width:120px" />
          <button class="btn" data-mg="join-code">참가</button>
        </div>
      </div>
      ${rankTeaserHtml()}`;
      requestList();
      requestRanking();
      updateRoomList();
    }
  }

  function updateRoomList() {
    const el = root.querySelector("#mgRoomList"); if (!el) return;
    if (!roomListCache.length) { el.innerHTML = `<div class="muted center" style="padding:20px">열린 방이 없습니다. "방 만들기"로 새 방을 여세요.</div>`; return; }
    el.innerHTML = roomListCache.map((r) => {
      const gt = r.gameType || r.game || "arena";
      const cnt = r.count != null ? r.count : (r.players || 1);
      return `
      <button class="room-item" data-mg="joinroom" data-code="${r.code}" data-pw="${r.hasPw ? 1 : 0}" data-game="${gt}">
        <span class="ri-ico">${gmeta(gt).ico}</span>
        <span class="ri-main"><b>${escHtml(r.roomName || r.name)}</b><small>${escHtml(r.gameLabel || gmeta(gt).name)} · ${r.code}${r.started ? " · 진행중" : ""}</small></span>
        <span class="ri-count">👥 ${cnt}/${r.max || 8}</span>
        <span class="ri-lock">${r.hasPw ? "🔒" : ""}</span>
      </button>`;
    }).join("");
  }

  // ----------------------------------------------------------------- 조작 레이아웃 적용
  function copsLayoutProfile(role, spectating, mode) {
    if (mode === "relic" && role === "thief") return "cops_relic_thief";
    if (mode === "relic" && role === "police") return "cops_relic_police";
    if (mode === "mimic" && role === "player" && spectating) return "cops_mimic_spec";
    if (mode === "mimic" && role === "player") return "cops_mimic_player";
    if (mode === "relic" && role === "player") return "cops_mimic_player";
    return null;
  }
  /* 서버 커스텀 레이아웃이 없을 때 쓰는 모바일 친화 기본 배치 (% of stage) */
  const DEFAULT_CONTROL_LAYOUTS = {
    arena: {
      joy: { left: 3, bottom: 3, w: 104, h: 104 },
      dash: { right: 3, bottom: 6, w: 72, h: 72 },
    },
    cops_mimic_player: {
      joy: { left: 3, bottom: 3, w: 100, h: 100 },
      stab: { right: 3, bottom: 3, w: 86, h: 86 },
      dash: { right: 26, bottom: 4, w: 64, h: 64 },
      defend: { right: 3, bottom: 22, w: 64, h: 64 },
    },
    cops_mimic_spec: {
      joy: { left: 3, bottom: 3, w: 100, h: 100 },
    },
    cops_relic_thief: {
      joy: { left: 3, bottom: 3, w: 100, h: 100 },
      interact: { right: 3, bottom: 3, w: 86, h: 86 },
      dash: { right: 26, bottom: 4, w: 64, h: 64 },
      push: { right: 3, bottom: 22, w: 64, h: 64 },
    },
    cops_relic_police: {
      joy: { left: 3, bottom: 3, w: 100, h: 100 },
      phase: { right: 3, bottom: 3, w: 86, h: 86 },
      shield: { right: 26, bottom: 4, w: 64, h: 64 },
    },
    kitchen: {
      joy: { left: 3, bottom: 3, w: 100, h: 100 },
      interact: { right: 3, bottom: 3, w: 86, h: 86 },
      dash: { right: 26, bottom: 4, w: 64, h: 64 },
    },
    "kitchen-tut": {
      joy: { left: 3, bottom: 3, w: 100, h: 100 },
      interact: { right: 3, bottom: 3, w: 86, h: 86 },
      dash: { right: 26, bottom: 4, w: 64, h: 64 },
    },
  };
  function resolveControlLayout(profile) {
    if (!profile) return null;
    const user = loadUserCtlLayouts()[profile];
    if (user && Object.keys(user).length) {
      const cleaned = cloneLayout(user);
      delete cleaned.sit; delete cleaned.wave; delete cleaned.shoot;
      if (profile === "arena") delete cleaned.shoot;
      return cleaned;
    }
    const custom = controlLayouts[profile];
    if (custom && Object.keys(custom).length) {
      const cleaned = cloneLayout(custom);
      delete cleaned.sit; delete cleaned.wave;
      if (profile === "arena") delete cleaned.shoot;
      return cleaned;
    }
    return cloneLayout(DEFAULT_CONTROL_LAYOUTS[profile] || null);
  }
  const CTL_LS_KEY = "gw-ctl-layout-v1";
  const CTL_META = {
    joy: { ico: "🕹️", name: "이동", kind: "joy" },
    dash: { ico: "⚡", name: "대쉬", kind: "btn" },
    stab: { ico: "🗡️", name: "찌르기", kind: "big" },
    defend: { ico: "🛡️", name: "방어", kind: "btn" },
    interact: { ico: "🔓", name: "상호작용", kind: "big" },
    push: { ico: "💨", name: "밀치기", kind: "btn" },
    phase: { ico: "🌀", name: "돌진", kind: "big" },
    shield: { ico: "🛡️", name: "방어막", kind: "btn" },
    repair: { ico: "🔧", name: "수리", kind: "btn" },
    recall: { ico: "🏠", name: "귀환", kind: "btn" },
  };
  function cloneLayout(L) {
    if (!L) return null;
    const out = {};
    Object.keys(L).forEach((k) => { out[k] = Object.assign({}, L[k]); });
    return out;
  }
  function loadUserCtlLayouts() {
    try { return JSON.parse(localStorage.getItem(CTL_LS_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function saveUserCtlLayout(profile, layout) {
    const all = loadUserCtlLayouts();
    all[profile] = layout;
    localStorage.setItem(CTL_LS_KEY, JSON.stringify(all));
  }
  function clearUserCtlLayout(profile) {
    const all = loadUserCtlLayouts();
    delete all[profile];
    localStorage.setItem(CTL_LS_KEY, JSON.stringify(all));
  }
  function currentCtlEditProfile() {
    if (!room) return "arena";
    if (room.gameType === "arena") return "arena";
    if (room.gameType === "kitchen" || room.gameType === "kitchen-tut") return kitchenLayoutProfile();
    if (room.gameType === "cops") {
      const mode = room.game?.mode || "mimic";
      if (mode === "relic") return "cops_relic_thief"; /* 미리보기 기본: 도둑 조작 */
      return "cops_mimic_player";
    }
    return "arena";
  }
  function ctlProfilesForRoom() {
    if (!room) return [{ id: "arena", label: "아레나" }];
    if (room.gameType === "arena") return [{ id: "arena", label: "아레나 (조이스틱·대쉬 · 터치로 사격)" }];
    if (room.gameType === "kitchen" || room.gameType === "kitchen-tut") {
      return [
        { id: "kitchen", label: "주방" },
        { id: "kitchen-tut", label: "주방 튜토리얼" },
      ];
    }
    if (room.gameType === "cops") {
      return [
        { id: "cops_mimic_player", label: "AI인척 플레이어" },
        { id: "cops_relic_thief", label: "유물 · 도둑" },
        { id: "cops_relic_police", label: "유물 · 술래" },
        { id: "cops_mimic_spec", label: "관전 조이스틱" },
      ];
    }
    return [{ id: "arena", label: "기본" }];
  }
  function openControlLayoutEditor(initialProfile) {
    closeControlLayoutEditor();
    let profile = initialProfile || currentCtlEditProfile();
    let draft = resolveControlLayout(profile) || cloneLayout(DEFAULT_CONTROL_LAYOUTS[profile]) || {};
    let selected = Object.keys(draft)[0] || "joy";

    const ov = document.createElement("div");
    ov.className = "ctl-editor";
    ov.id = "ctlEditor";
    const profiles = ctlProfilesForRoom();
    ov.innerHTML = `
      <div class="ctl-editor__panel">
        <div class="ctl-editor__top">
          <div>
            <h3>조작 배치 미리보기</h3>
            <p class="ctl-editor__hint">버튼을 드래그해 위치를 바꾸고, 크기를 조절한 뒤 저장하세요. 이 기기에만 저장됩니다.</p>
          </div>
          <button type="button" class="btn gray sm" data-ctl-ed="close">← 대기실로</button>
        </div>
        <div class="ctl-editor__toolbar">
          <label class="ctl-editor__fld">레이아웃
            <select id="ctlProfileSel">${profiles.map((p) =>
              `<option value="${p.id}" ${p.id === profile ? "selected" : ""}>${p.label}</option>`
            ).join("")}</select>
          </label>
          <label class="ctl-editor__fld">미리보기 비율
            <select id="ctlAspectSel">
              <option value="device">지금 화면</option>
              <option value="390x844">iPhone 14 (9:19.5)</option>
              <option value="375x667">iPhone SE (9:16)</option>
              <option value="412x915">Pixel 7</option>
              <option value="360x800">일반 안드로이드</option>
              <option value="344x882">좁은 폴드</option>
              <option value="844x390">가로 iPhone</option>
              <option value="740x360">가로 짧은 화면</option>
            </select>
          </label>
          <button type="button" class="btn gray sm" data-ctl-ed="reset">기본값</button>
          <button type="button" class="btn sm" data-ctl-ed="save">저장</button>
        </div>
        <div class="ctl-editor__body">
          <div class="lay-phone" id="ctlPhone">
            <div class="ctl-editor__stage-label" id="ctlStageLabel"></div>
            <div class="ctl-editor__ghosts" id="ctlGhosts"></div>
          </div>
          <div class="ctl-editor__side">
            <div class="ctl-editor__sel" id="ctlSelInfo">선택: —</div>
            <label class="ctl-editor__fld">크기 <input type="range" id="ctlSize" min="40" max="130" value="80" /> <span id="ctlSizeLb">80</span></label>
            <p class="muted" style="font-size:12px;line-height:1.45;margin:8px 0 0">왼쪽에 두면 왼쪽 기준, 오른쪽에 두면 오른쪽 기준으로 저장됩니다. 짧은 화면에서도 버튼이 화면 밖으로 나가지 않게 맞춰 주세요.</p>
          </div>
        </div>
      </div>`;
    root.appendChild(ov);

    const phone = ov.querySelector("#ctlPhone");
    const ghostsEl = ov.querySelector("#ctlGhosts");
    const sizeInp = ov.querySelector("#ctlSize");
    const sizeLb = ov.querySelector("#ctlSizeLb");
    const selInfo = ov.querySelector("#ctlSelInfo");
    const stageLabel = ov.querySelector("#ctlStageLabel");

    function applyPhoneAspect() {
      const mode = ov.querySelector("#ctlAspectSel").value;
      let w = window.innerWidth, h = window.innerHeight;
      if (mode !== "device") {
        const [aw, ah] = mode.split("x").map(Number);
        w = aw; h = ah;
      }
      const maxW = Math.min(420, window.innerWidth - 32);
      const maxH = Math.min(window.innerHeight * 0.58, 640);
      const ar = w / h;
      let pw = maxW, ph = pw / ar;
      if (ph > maxH) { ph = maxH; pw = ph * ar; }
      phone.style.width = Math.round(pw) + "px";
      phone.style.height = Math.round(ph) + "px";
      phone.style.aspectRatio = "auto";
      phone.style.maxWidth = "none";
      stageLabel.textContent = `${Math.round(w)}×${Math.round(h)} · 미리보기 ${Math.round(pw)}×${Math.round(ph)}`;
      renderGhosts();
    }

    function renderGhosts() {
      const sw = phone.clientWidth || 300;
      const sh = phone.clientHeight || 560;
      const scale = computeCtlScale(sw, sh);
      phone.style.setProperty("--ctl-scale", String(scale));
      ghostsEl.innerHTML = "";
      Object.keys(draft).forEach((key) => {
        const pos = draft[key];
        const meta = CTL_META[key] || { ico: "●", name: key, kind: "btn" };
        const g = document.createElement("button");
        g.type = "button";
        g.className = "lay-ghost lay-" + (meta.kind || "btn") + (key === selected ? " is-sel" : "");
        g.dataset.key = key;
        const bw = Math.round((pos.w || 72) * scale);
        const bh = Math.round((pos.h || 72) * scale);
        g.style.width = bw + "px";
        g.style.height = bh + "px";
        g.style.bottom = ((pos.bottom || 0) / 100 * sh) + "px";
        if (pos.left != null) { g.style.left = (pos.left / 100 * sw) + "px"; g.style.right = "auto"; }
        else { g.style.right = ((pos.right || 0) / 100 * sw) + "px"; g.style.left = "auto"; }
        g.innerHTML = `<span class="lay-ghost__ico">${meta.ico}</span><span class="lay-ghost__lb">${meta.name}</span>`;
        g.addEventListener("pointerdown", (ev) => startDrag(ev, key, g));
        ghostsEl.appendChild(g);
      });
      syncSelUi();
    }

    function syncSelUi() {
      const meta = CTL_META[selected] || { name: selected };
      const pos = draft[selected];
      selInfo.textContent = pos ? `선택: ${meta.name} (${selected})` : "선택: —";
      if (pos) {
        sizeInp.value = String(pos.w || 72);
        sizeLb.textContent = String(pos.w || 72);
      }
    }

    function startDrag(ev, key, el) {
      ev.preventDefault();
      selected = key;
      syncSelUi();
      renderGhosts();
      const ghost = ghostsEl.querySelector(`[data-key="${key}"]`) || el;
      const sw = phone.clientWidth, sh = phone.clientHeight;
      const rect = phone.getBoundingClientRect();
      const scale = computeCtlScale(sw, sh);
      const bw = Math.round((draft[key].w || 72) * scale);
      const bh = Math.round((draft[key].h || 72) * scale);
      const move = (e) => {
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        let left = cx - bw / 2;
        let top = cy - bh / 2;
        left = Math.max(0, Math.min(sw - bw, left));
        top = Math.max(0, Math.min(sh - bh, top));
        const bottomPct = ((sh - top - bh) / sh) * 100;
        const midX = left + bw / 2;
        const next = { bottom: +bottomPct.toFixed(2), w: draft[key].w || 72, h: draft[key].h || draft[key].w || 72 };
        if (midX < sw / 2) next.left = +((left / sw) * 100).toFixed(2);
        else next.right = +(((sw - left - bw) / sw) * 100).toFixed(2);
        draft[key] = next;
        ghost.style.left = left + "px";
        ghost.style.right = "auto";
        ghost.style.bottom = (sh - top - bh) + "px";
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        renderGhosts();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      move(ev);
    }

    ov.querySelector("#ctlProfileSel").addEventListener("change", (e) => {
      profile = e.target.value;
      draft = resolveControlLayout(profile) || cloneLayout(DEFAULT_CONTROL_LAYOUTS[profile]) || {};
      selected = Object.keys(draft)[0] || "joy";
      renderGhosts();
    });
    ov.querySelector("#ctlAspectSel").addEventListener("change", applyPhoneAspect);
    sizeInp.addEventListener("input", () => {
      const v = +sizeInp.value;
      sizeLb.textContent = String(v);
      if (!draft[selected]) return;
      draft[selected].w = v;
      draft[selected].h = v;
      renderGhosts();
    });
    ov.addEventListener("click", (e) => {
      const a = e.target.closest("[data-ctl-ed]")?.getAttribute("data-ctl-ed");
      if (!a) return;
      if (a === "close") { closeControlLayoutEditor(); return; }
      if (a === "reset") {
        clearUserCtlLayout(profile);
        draft = cloneLayout(DEFAULT_CONTROL_LAYOUTS[profile]) || {};
        selected = Object.keys(draft)[0] || "joy";
        renderGhosts();
        T("기본 배치로 되돌렸습니다.", "ok");
        return;
      }
      if (a === "save") {
        saveUserCtlLayout(profile, cloneLayout(draft));
        T("조작 배치를 저장했습니다. 게임 시작 시 적용됩니다.", "ok");
        if (inGameView) fitGameStage();
        return;
      }
    });
    applyPhoneAspect();
    window.addEventListener("resize", applyPhoneAspect);
    ov._onResize = applyPhoneAspect;
  }
  function closeControlLayoutEditor() {
    const ov = root.querySelector("#ctlEditor");
    if (ov) {
      if (ov._onResize) window.removeEventListener("resize", ov._onResize);
      ov.remove();
    }
  }

  function computeCtlScale(sw, sh) {
    const short = Math.min(sw, sh);
    const aspect = sw / Math.max(1, sh);
    let scale = short / 520;
    /* 가로로 긴 폰(랜드스케이프) / 짧은 높이에서는 더 줄임 */
    if (sh < 420) scale *= 0.86;
    if (aspect > 1.7) scale *= 0.92;
    if (aspect < 0.6) scale *= 0.9; /* 세로로 매우 긴 기기 */
    return Math.max(0.62, Math.min(1.18, scale));
  }
  function applyControlLayout(profile) {
    if (!profile) return;
    const L = resolveControlLayout(profile);
    if (!L) return;
    const stage = root.querySelector(".arena-stage");
    if (!stage) return;
    const sw = stage.clientWidth || 900;
    const sh = stage.clientHeight || 640;
    const scale = computeCtlScale(sw, sh);
    stage.style.setProperty("--ctl-scale", String(scale));
    stage.style.setProperty("--ctl-pad-x", Math.max(6, Math.round(8 * scale)) + "px");
    stage.style.setProperty("--ctl-pad-y", Math.max(6, Math.round(10 * scale)) + "px");
    const padX = Math.max(6, Math.round(sw * 0.01));
    const padY = Math.max(6, Math.round(sh * 0.012));
    const safeBottom = Math.min(28, Math.round(sh * 0.02));
    stage.querySelectorAll("[data-ctl]").forEach((el) => {
      const pos = L[el.dataset.ctl];
      if (!pos) return;
      const bw = Math.round((pos.w || 72) * scale);
      const bh = Math.round((pos.h || 72) * scale);
      el.style.position = "absolute";
      el.style.top = "auto";
      el.style.width = bw + "px";
      el.style.height = bh + "px";
      if (pos.left != null) {
        el.style.left = Math.round(pos.left / 100 * sw) + padX + "px";
        el.style.right = "auto";
      }
      if (pos.right != null) {
        el.style.right = Math.round(pos.right / 100 * sw) + padX + "px";
        el.style.left = "auto";
      }
      if (pos.bottom != null) {
        el.style.bottom = Math.round(pos.bottom / 100 * sh) + padY + safeBottom + "px";
      }
    });
  }
  function mgPromptPw(code) {
    const d = document.createElement("div");
    d.className = "mg-prompt";
    d.innerHTML = `<div class="mg-prompt-card"><h3>🔒 방 비밀번호</h3>
      <input id="mgPwIn" type="password" placeholder="비밀번호" autocomplete="off" />
      <div class="mg-row"><button class="btn gray" data-mg="pw-cancel">취소</button>
      <button class="btn" data-mg="pw-ok" data-code="${code}">참가</button></div></div>`;
    root.appendChild(d);
    setTimeout(() => d.querySelector("#mgPwIn")?.focus(), 50);
  }
  function closePrompt() { root.querySelector(".mg-prompt")?.remove(); }

  // ----------------------------------------------------------------- 방(공통 셸)
  function renderRoom() {
    if (!room) return;
    const typeChanged = shellType !== room.gameType;
    if (typeChanged) {
      leaveGameView();
      lastArena = null; lastCops = null; copsRole = null; copsCtlRole = null; copsSpecMode = false;
      buildShell(); shellType = room.gameType;
    }
    updatePlayers();
    updateGameSwitch();
    if (room.gameType === "arena") updateArena();
    else if (room.gameType === "cops") updateCops();
  }

  function buildShell() {
    stopInputLoop();
    stopArenaRender();
    stopKitchenInput();
    MA.bgm(room.gameType);
    prevHp = null; prevFx = 0; prevBuff = ""; prevOpened = 0; startPlayed = false; arenaCamSnap = true; arenaKillFeed = []; arenaConquestFeed = []; nexusAlertUntil = 0; copsCatchFeed = []; copsMimicKillFeed = [];
    lastKitchen = null; kitchenCtlReady = false;
    const gname = (GAMES.find((g) => g.key === room.gameType) || {}).name || "";
    const rtitle = room.roomName ? escHtml(room.roomName) : gname;
    root.innerHTML = `
    <div class="mg-top">
      <button class="mg-back" data-mg="leaveHub">←</button>
      <div class="mg-title">${rtitle} <span class="mg-code">${gname} · ${room.code}</span></div>
      <button class="mg-back mg-fs-btn" data-mg="fs-exit" title="기본 화면">⊟</button>
      <button class="mg-back" data-mg="mute" title="소리">${muteIco()}</button>
      <button class="mg-back" data-mg="close">✕</button>
    </div>
    <div class="mg-players" id="mgPlayers"></div>
    <div class="mg-body" id="mgGame"></div>`;
    const gEl = root.querySelector("#mgGame");
    if (room.gameType === "arena") { gEl.innerHTML = shellArena(); initArenaControls(); }
    else if (room.gameType === "cops") { gEl.innerHTML = shellCops(); copsCtlRole = null; copsSpecMode = false; }
    else gEl.innerHTML = '<div class="mg-card muted center">지원하지 않는 게임입니다.</div>';
    if (!root._fsResize) {
      root._fsResize = true;
      window.addEventListener("resize", () => { if (inGameView) fitGameStage(); });
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", () => { if (inGameView) fitGameStage(); });
      }
    }
  }

  function updatePlayers() {
    const el = root.querySelector("#mgPlayers");
    if (!el) return;
    el.innerHTML = room.players.map((p) =>
      `<span class="mg-chip" style="border-color:${p.color}">
        <b style="color:${p.color}">●</b> ${escHtml(p.name)}${p.isHost ? " 👑" : ""}${p.id === me.id ? " (나)" : ""}
      </span>`).join("") + `<span class="mg-chip ghost">${room.players.length}명 접속</span>`;
  }

  // ----------------------------------------------------------------- 룰렛
  function shellRoulette() {
    return `
    <div class="mg-card center">
      <div class="wheel-wrap">
        <canvas id="rwheel" width="320" height="320"></canvas>
        <div class="wheel-pointer">▼</div>
      </div>
      <div id="rresult" class="rresult"></div>
    </div>
    ${me.isHost ? `
    <div class="mg-card">
      <h3 class="mg-h">항목 편집 (방장)</h3>
      <textarea id="ropts" rows="5" placeholder="한 줄에 하나씩 입력">${escHtml((room.game.options || []).join("\n"))}</textarea>
      <div class="mg-row">
        <button class="btn gray" data-mg="r-apply">적용</button>
        <button class="btn" data-mg="r-spin">🎡 돌리기!</button>
      </div>
    </div>` : `<div class="mg-card muted center">방장이 룰렛을 돌리면 함께 결과를 봅니다.</div>`}`;
  }
  function updateRoulette() {
    wheelOptions = room.game.options || [];
    if (!spinAnim) drawWheel();
    const rr = root.querySelector("#rresult");
    if (rr) {
      if (room.game.spinning) rr.innerHTML = `<span class="spinning">돌리는 중...</span>`;
      else if (room.game.lastResult) rr.innerHTML = `🎉 결과: <b>${escHtml(room.game.lastResult.option)}</b>`;
      else rr.innerHTML = "";
    }
  }
  function drawWheel() {
    const cv = root.querySelector("#rwheel"); if (!cv) return;
    const ctx = cv.getContext("2d");
    const n = wheelOptions.length || 1;
    const seg = (Math.PI * 2) / n;
    const cx = 160, cy = 160, R = 150;
    const palette = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899", "#06b6d4", "#f97316"];
    ctx.clearRect(0, 0, 320, 320);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(wheelRot);
    for (let i = 0; i < n; i++) {
      const a0 = i * seg, a1 = a0 + seg;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath();
      ctx.fillStyle = palette[i % palette.length]; ctx.fill();
      ctx.save(); ctx.rotate(a0 + seg / 2);
      ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      const label = String(wheelOptions[i] ?? "").slice(0, 8);
      ctx.fillText(label, R - 12, 0);
      ctx.restore();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fillStyle = "#0f172a"; ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🎡", cx, cy);
  }
  function animateSpin(index, count, duration) {
    const seg = (Math.PI * 2) / count;
    const target = -Math.PI / 2 - (index * seg + seg / 2);
    let final = target;
    while (final < wheelRot + Math.PI * 2 * 8) final += Math.PI * 2;
    const start = wheelRot, delta = final - start, t0 = performance.now();
    cancelAnimationFrame(spinAnim);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      wheelRot = start + delta * e;
      drawWheel();
      if (p < 1) spinAnim = requestAnimationFrame(step);
      else { spinAnim = null; wheelRot = ((final % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); drawWheel(); MA.sfx("win"); }
    };
    spinAnim = requestAnimationFrame(step);
  }

  // ----------------------------------------------------------------- 사다리타기
  function shellLadder() {
    return `
    ${me.isHost ? `
    <div class="mg-card">
      <h3 class="mg-h">사다리 설정 (방장)</h3>
      <div class="mg-2col">
        <label class="fld"><span class="lbl">참가자 (한 줄에 하나)</span>
          <textarea id="lnames" rows="5" placeholder="철수\n영희\n민수">${escHtml((room.game.names || []).join("\n"))}</textarea></label>
        <label class="fld"><span class="lbl">결과 (한 줄에 하나, 같은 개수)</span>
          <textarea id="lprizes" rows="5" placeholder="당첨\n꽝\n청소">${escHtml((room.game.prizes || []).join("\n"))}</textarea></label>
      </div>
      <button class="btn block" data-mg="l-make">🪜 사다리 생성 / 다시 섞기</button>
    </div>` : ""}
    <div class="mg-card center">
      <canvas id="lcanvas" width="600" height="420"></canvas>
      <div class="muted" style="margin-top:8px">위쪽 이름을 탭하면 결과까지 경로가 그려집니다.</div>
    </div>`;
  }
  function updateLadder() {
    drawLadder();
  }
  function drawLadder() {
    const cv = root.querySelector("#lcanvas"); if (!cv) return;
    const g = room.game;
    const ctx = cv.getContext("2d");
    const W = 600, H = 420;
    ctx.clearRect(0, 0, W, H);
    if (!g.ready || !g.cols) {
      ctx.fillStyle = "#94a3b8"; ctx.font = "16px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("방장이 사다리를 생성하면 표시됩니다.", W / 2, H / 2);
      return;
    }
    const n = g.cols, rows = g.rows;
    const padX = 50, topY = 46, botY = H - 46;
    const colX = (c) => padX + (c * (W - padX * 2)) / (n - 1 || 1);
    const rowY = (r) => topY + (r * (botY - topY)) / rows;
    // 세로줄
    ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 3;
    for (let c = 0; c < n; c++) { ctx.beginPath(); ctx.moveTo(colX(c), topY); ctx.lineTo(colX(c), botY); ctx.stroke(); }
    // 가로줄
    for (let r = 0; r < rows; r++) for (const c of g.rungs[r]) {
      ctx.beginPath(); ctx.moveTo(colX(c), rowY(r + 0.5)); ctx.lineTo(colX(c + 1), rowY(r + 0.5)); ctx.stroke();
    }
    // 이름/결과
    ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
    for (let c = 0; c < n; c++) {
      ctx.fillStyle = "#0f172a"; ctx.fillText(String(g.names[c] || "").slice(0, 6), colX(c), topY - 12);
      ctx.fillStyle = "#4f46e5"; ctx.fillText(String(g.prizes[c] || "").slice(0, 6), colX(c), botY + 22);
    }
    // 추적 경로
    if (ladderTrace) {
      ctx.strokeStyle = ladderTrace.color; ctx.lineWidth = 5; ctx.lineJoin = "round";
      ctx.beginPath();
      const pts = ladderTrace.pts; ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < ladderTrace.n; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  }
  function traceLadder(startCol) {
    const g = room.game; if (!g.ready) return;
    const n = g.cols, rows = g.rows;
    const W = 600, H = 420, padX = 50, topY = 46, botY = H - 46;
    const colX = (c) => padX + (c * (W - padX * 2)) / (n - 1 || 1);
    const rowY = (r) => topY + (r * (botY - topY)) / rows;
    let pos = startCol; const pts = [{ x: colX(pos), y: topY }];
    for (let r = 0; r < rows; r++) {
      if (g.rungs[r].includes(pos)) { pts.push({ x: colX(pos), y: rowY(r + 0.5) }); pos += 1; pts.push({ x: colX(pos), y: rowY(r + 0.5) }); }
      else if (g.rungs[r].includes(pos - 1)) { pts.push({ x: colX(pos), y: rowY(r + 0.5) }); pos -= 1; pts.push({ x: colX(pos), y: rowY(r + 0.5) }); }
    }
    pts.push({ x: colX(pos), y: botY });
    const colors = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899", "#06b6d4", "#f97316"];
    ladderTrace = { pts, n: 0, color: colors[startCol % colors.length], endCol: pos };
    const total = pts.length; let i = 1;
    const anim = () => { ladderTrace.n = i; drawLadder(); if (i < total) { i++; setTimeout(anim, 90); }
      else T(`${g.names[startCol]} → ${g.prizes[pos]}`, "ok"); };
    anim();
  }

  // ----------------------------------------------------------------- 제비뽑기
  function shellDraw() {
    return `
    ${me.isHost ? `
    <div class="mg-card">
      <h3 class="mg-h">제비 설정 (방장)</h3>
      <textarea id="dlabels" rows="4" placeholder="당첨\n꽝\n꽝\n청소당번">${escHtml((room.game.labels || []).join("\n"))}</textarea>
      <div class="mg-row">
        <button class="btn gray" data-mg="d-make">제비 만들기</button>
        <button class="btn gray" data-mg="d-reset">다시 섞기</button>
      </div>
    </div>` : ""}
    <div class="mg-card">
      <div id="dmine" class="dmine"></div>
      <div id="dgrid" class="draw-grid"></div>
      <div id="dinfo" class="muted center" style="margin-top:10px"></div>
    </div>`;
  }
  function updateDraw() {
    const g = room.game;
    const grid = root.querySelector("#dgrid");
    const info = root.querySelector("#dinfo");
    const mine = root.querySelector("#dmine");
    if (!grid) return;
    const myDraw = g.drawn && g.drawn[me.id];
    const drawnList = Object.values(g.drawn || {});
    mine.innerHTML = myDraw
      ? `<div class="dmine-card">내 제비: <b>${escHtml(g.labels[myDraw.labelIndex])}</b></div>`
      : (g.total ? `<button class="btn block" data-mg="d-draw" ${g.remaining <= 0 ? "disabled" : ""}>🎟️ 제비 뽑기 (${g.remaining} 남음)</button>` : `<div class="muted center">방장이 제비를 만들면 뽑을 수 있어요.</div>`);
    // 카드 그리드
    let cells = "";
    for (let i = 0; i < (g.total || 0); i++) {
      const opened = i < drawnList.length ? drawnList[i] : null;
      cells += `<div class="draw-cell ${opened ? "open" : ""}">
        ${opened ? `<div class="dc-label">${escHtml(g.labels[opened.labelIndex])}</div><div class="dc-name">${escHtml(opened.name)}</div>` : `<div class="dc-back">?</div>`}
      </div>`;
    }
    grid.innerHTML = cells;
    info.textContent = g.total ? (g.finished ? "모두 뽑았습니다!" : `${drawnList.length} / ${g.total} 뽑음`) : "";
  }

  // ----------------------------------------------------------------- 아레나 (팀 슈팅 / 숨바꼭질)
  function shellArena() {
    return `
    <div class="arena-hud arena-hud-game">
      <span id="ahudTime" class="pill blue">⏱ --</span>
      <span id="ahudGoal" class="pill goal">🎯 상대방 넥서스를 부셔라</span>
      <span id="ahudStatus" class="pill cyan"></span>
      <span id="ahudBuff" class="pill"></span>
      <span id="ahudState" class="pill"></span>
      <button class="pill info-btn" data-mg="a-iteminfo">ℹ️ 아이템</button>
    </div>
    <div id="aInfo" class="arena-info hidden">
      <div class="ai-title">아이템 안내</div>
      <ul>
        <li><b style="color:#22c55e">＋ 회복</b> — 체력을 회복합니다.</li>
        <li><b style="color:#38bdf8">» 이동속도</b> — 잠시 이동 속도가 빨라집니다.</li>
        <li><b style="color:#f97316">⚔ 강공격</b> — 잠시 공격력이 강해집니다.</li>
        <li><b style="color:#e879f9">✚ 즉시부활</b> — 다음 사망 시 즉시 부활합니다.</li>
      </ul>
      <div class="ai-title" style="margin-top:8px">전투 · 조작</div>
      <ul>
        <li><b>이동</b> — 왼쪽 조이스틱. 이동 방향으로 조준됩니다.</li>
        <li><b>🔫 발사</b> — 오른쪽 하단 발사 버튼 (홀드).</li>
        <li><b>⚡ 대쉬</b> — 발사 버튼 왼쪽 대쉬 버튼.</li>
        <li><b>연속 킬</b> — 2킬부터 이속·공격력 버프, 처치 시 체력 회복.</li>
        <li><b>삼파전 점령</b> — 넥서스 파괴 시 해당 팀 인원이 승자 팀으로 합류. 부활은 원래 기지.</li>
      </ul>
    </div>
    ${me.isHost ? `
    <div class="mg-card">
      <div class="mg-row" style="flex-wrap:wrap;gap:8px;align-items:center">
        <select id="ateams">
          <option value="2">2파전</option>
          <option value="3">3파전</option>
        </select>
        <button class="btn gray" data-mg="a-stop">■ 정지</button>
      </div>
    </div>` : ""}
    <div id="aWait"></div>
    <div id="ateamPick" class="team-pick"></div>
    <div class="arena-stage">
      <canvas id="acanvas" width="1440" height="900"></canvas>
      <div id="aKillFeed" class="kill-feed"></div>
      <div id="aNexusAlert" class="arena-nexus-alert hidden">⚠ 아군 넥서스 위기!</div>
      <div id="aRespawn" class="arena-respawn hidden"></div>
      <div class="joystick" id="joyBase" data-ctl="joy"><div class="joystick-knob" id="joyKnob"></div></div>
      <div class="skill-btns arena-skills" id="askills"></div>
    </div>
    <div id="ascore" class="arena-score"></div>`;
  }
  function updateArena() {
    const g = room.game;
    const st = root.querySelector("#ahudState");
    if (st) { st.textContent = g.started ? "진행중" : (g.counting ? "시작 중" : "대기중"); st.className = "pill " + (g.started ? "cyan" : ""); }
    const goal = root.querySelector("#ahudGoal");
    if (goal) goal.style.display = g.started ? "" : "none";
    const tsel = root.querySelector("#ateams");
    if (tsel && !tsel._init) {
      tsel.value = String(g.teamCount);
      tsel._init = true;
      tsel.addEventListener("change", () => {
        if (!me.isHost) return;
        send({ t: "action", a: "setmode", teamCount: +tsel.value });
      });
    }
    // 컨트롤(스킬 버튼)
    if (arenaCtlMode !== "team") { buildArenaControls(); arenaCtlMode = "team"; }
    // 대기방 (시작 전)
    const wait = root.querySelector("#aWait");
    if (wait) wait.innerHTML = g.started ? "" : waitRoomHtml();
    // 팀 선택 UI
    renderTeamPick();
    if (g.started) { startInputLoop(); startArenaRender(); } else { stopInputLoop(); stopArenaRender(); }
    if (g.started && inGameView) fitGameStage();
    drawArena();
    const sc = root.querySelector("#ascore");
    if (sc) {
      const byTeam = {};
      room.players.forEach((p) => { const t = p.team != null ? p.team : "?"; (byTeam[t] = byTeam[t] || []).push(p); });
      sc.innerHTML = Object.keys(byTeam).sort().map((t) => {
        const col = TCOL[t] || "#94a3b8";
        return `<span class="sc-item"><b style="color:${col}">팀${+t + 1}</b> ${byTeam[t].map((p) => escHtml(p.name)).join(", ")}</span>`;
      }).join("");
    }
  }
  function renderTeamPick() {
    const el = root.querySelector("#ateamPick"); if (!el) return;
    const g = room.game;
    const meP = room.players.find((p) => p.id === me.id);
    const cur = meP ? meP.team : null;
    let btns = "";
    for (let i = 0; i < g.teamCount; i++) {
      btns += `<button class="tbtn ${cur === i ? "sel" : ""}" data-mg="a-team" data-team="${i}" style="--tc:${TCOL[i]}">팀 ${i + 1}</button>`;
    }
    el.innerHTML = `<span class="tp-label">팀 선택:</span>${btns}`;
  }
  function buildArenaControls() {
    const el = root.querySelector("#askills"); if (!el) return;
    el.innerHTML = `
      <button class="skill dash" id="dashBtn" data-ctl="dash"><span class="sk-ico">⚡</span><span class="sk-lb" id="dashLb">대쉬</span></button>`;
    repairing = false; recallPending = false; shooting = false;
    bindTap(root.querySelector("#dashBtn"), () => { dashPending = true; MA.sfx("dash"); });
    applyControlLayout("arena");
  }
  function pruneFeedEntries(list) {
    const now = Date.now();
    return list.filter((k) => now - (k.at || 0) < MG_LOG_MS).slice(0, 8);
  }
  function patchKillFeed(el, items, getId, renderItem) {
    if (!el) return;
    const ids = new Set(items.map((it) => String(getId(it))));
    for (const child of [...el.children]) {
      if (!ids.has(child.dataset.kfId)) child.remove();
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const id = String(getId(items[i]));
      if (el.querySelector(`[data-kf-id="${CSS.escape(id)}"]`)) continue;
      const node = document.createElement("div");
      node.className = "kf-item";
      node.dataset.kfId = id;
      node.innerHTML = renderItem(items[i]);
      el.insertBefore(node, el.firstChild);
    }
  }
  function scheduleFeedPrune() {
    if (feedPruneTimer) return;
    feedPruneTimer = setInterval(() => {
      if (!room?.game?.started) { stopFeedPrune(); return; }
      const aLen = arenaKillFeed.length;
      const cLen = copsCatchFeed.length + copsMimicKillFeed.length;
      arenaKillFeed = pruneFeedEntries(arenaKillFeed);
      copsCatchFeed = pruneFeedEntries(copsCatchFeed);
      copsMimicKillFeed = pruneFeedEntries(copsMimicKillFeed);
      if (room.gameType === "arena" && lastArena && arenaKillFeed.length !== aLen) updateArenaKillFeedDom();
      if (room.gameType === "cops" && lastCops && copsCatchFeed.length + copsMimicKillFeed.length !== cLen) refreshCopsFeedUi();
      if (!arenaKillFeed.length && !copsCatchFeed.length && !copsMimicKillFeed.length) stopFeedPrune();
    }, 400);
  }
  function stopFeedPrune() {
    if (feedPruneTimer) { clearInterval(feedPruneTimer); feedPruneTimer = null; }
  }
  function updateArenaKillFeedDom() {
    const kf = root.querySelector("#aKillFeed");
    patchKillFeed(kf, arenaKillFeed, (k) => k.id, (k) =>
      `<span style="color:${TCOL[k.ktm] || "#fde047"}">${escHtml(k.kn)}</span> → <span style="color:${TCOL[k.vtm] || "#e2e8f0"}">${escHtml(k.vn)}</span>`
    );
  }
  function updateArenaHud() {
    const status = root.querySelector("#ahudStatus");
    const kf = root.querySelector("#aKillFeed");
    if (!lastArena || !room?.game?.started) {
      if (status) status.textContent = "";
      if (kf) kf.replaceChildren();
      return;
    }
    const tc = room.game.teamCount || 2;
    const parts = [];
    for (let i = 0; i < tc; i++) {
      const alive = lastArena.ps.filter((p) => p.tm === i && p.al).length;
      const nx = (lastArena.nx || []).find((n) => n.tm === i);
      const nhp = nx && nx.al ? `${nx.h}/${nx.m}` : "파괴";
      parts.push(`<span style="color:${TCOL[i]}">팀${i + 1} ${alive}명 · ◆${nhp}</span>`);
    }
    if (status) status.innerHTML = parts.join('<span class="hud-sep">|</span>');
  }
  function canvasPos(cv, clientX, clientY) {
    const r = cv.getBoundingClientRect();
    return { x: (clientX - r.left) * (cv.width / r.width), y: (clientY - r.top) * (cv.height / r.height) };
  }
  // 공용 조이스틱/버튼 바인딩
  function bindJoystick(base, knob, state, opts) {
    if (!base || !knob) return;
    state = state || joy;
    opts = opts || {};
    const faceFromMove = opts.onAim ? false : (opts.faceFromMove !== false && state === joy);
    const rectC = () => base.getBoundingClientRect();
    const start = (x, y, id) => { state.active = true; state.id = id; const r = rectC(); state.cx = r.left + r.width / 2; state.cy = r.top + r.height / 2; move(x, y); };
    const move = (x, y) => {
      let dx = x - state.cx, dy = y - state.cy; const max = 46; const d = Math.hypot(dx, dy);
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      state.dx = dx / max; state.dy = dy / max;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      if (opts.onAim && Math.hypot(state.dx, state.dy) > 0.12) facing = Math.atan2(state.dy, state.dx);
      else if (faceFromMove && Math.hypot(state.dx, state.dy) > 0.15) facing = Math.atan2(state.dy, state.dx);
    };
    const end = () => { state.active = false; state.id = null; state.dx = 0; state.dy = 0; knob.style.transform = "translate(0,0)"; };
    base.addEventListener("touchstart", (e) => { const t = e.changedTouches[0]; start(t.clientX, t.clientY, t.identifier); e.preventDefault(); }, { passive: false });
    base.addEventListener("touchmove", (e) => { for (const t of e.changedTouches) if (t.identifier === state.id) move(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
    base.addEventListener("touchend", (e) => { for (const t of e.changedTouches) if (t.identifier === state.id) end(); }, { passive: false });
    base.addEventListener("mousedown", (e) => start(e.clientX, e.clientY, "m"));
    window.addEventListener("mousemove", (e) => { if (state.active && state.id === "m") move(e.clientX, e.clientY); });
    window.addEventListener("mouseup", () => { if (state.active && state.id === "m") end(); });
  }
  function bindHold(el, setter) {
    if (!el) return;
    const on = (e) => { setter(true); e.preventDefault(); };
    const off = (e) => { setter(false); e.preventDefault(); };
    el.addEventListener("touchstart", on, { passive: false });
    el.addEventListener("touchend", off, { passive: false });
    el.addEventListener("mousedown", on);
    el.addEventListener("mouseup", off);
    el.addEventListener("mouseleave", off);
  }
  function bindTap(el, fn) {
    if (!el) return;
    el.addEventListener("touchstart", (e) => { fn(); e.preventDefault(); }, { passive: false });
    el.addEventListener("mousedown", (e) => { fn(); e.preventDefault(); });
  }
  function bindArenaAimCanvas() {
    const cv = root.querySelector("#acanvas");
    if (!cv || cv._aimBound) return;
    cv._aimBound = true;
    const aimAt = (clientX, clientY) => {
      if (!lastArena || !room?.game?.started) return false;
      const meP = lastArena.ps && lastArena.ps.find((p) => p.id === me.id);
      if (!meP || !meP.al) return false;
      const g = room.game;
      const worldW = (g.world && g.world.w) || cv.width, worldH = (g.world && g.world.h) || cv.height;
      const viewW = cv.width * ARENA_ZOOM, viewH = cv.height * ARENA_ZOOM;
      const pos = canvasPos(cv, clientX, clientY);
      const wx = arenaCam.x + pos.x * ARENA_ZOOM;
      const wy = arenaCam.y + pos.y * ARENA_ZOOM;
      facing = Math.atan2(wy - meP.y, wx - meP.x);
      return true;
    };
    const onDown = (e) => {
      if (e.target !== cv) return;
      if (e.pointerType === "touch" && joy.active) return;
      if (aimAt(e.clientX, e.clientY)) shooting = true;
    };
    const onMove = (e) => {
      if (!shooting && e.buttons === 0 && e.pointerType !== "touch") return;
      if (e.pointerType === "touch" && joy.active) return;
      if (shooting || e.buttons > 0 || e.pointerType === "pen" || e.pointerType === "touch") {
        aimAt(e.clientX, e.clientY);
      }
    };
    const onUp = () => { shooting = false; };
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "touch") shooting = false;
    });
  }
  function initArenaControls() {
    arenaCtlMode = null;
    bindJoystick(root.querySelector("#joyBase"), root.querySelector("#joyKnob"), joy, { faceFromMove: true });
    bindArenaAimCanvas();
  }

  // ----------------------------------------------------------------- 경찰과 도둑
  function shellCops() {
    const g = room.game;
    const step = (id, cur, min, max) =>
      `<div class="stepper" data-step-for="${id}" data-min="${min}" data-max="${max}">` +
      `<button type="button" class="stepper-btn" data-dir="-1" aria-label="감소">−</button>` +
      `<input type="number" id="${id}" value="${cur}" min="${min}" max="${max}" step="1" readonly>` +
      `<button type="button" class="stepper-btn" data-dir="1" aria-label="증가">+</button></div>`;
    return `
    <div class="arena-hud arena-hud-game">
      <span id="chudTime" class="pill blue">⏱ --</span>
      <span id="chudRole" class="pill">대기중</span>
      <span id="chudStatus" class="pill cyan"></span>
    </div>
    ${me.isHost ? `
    <div class="mg-card">
      <h3 class="mg-h">설정 (방장) · ±1 단위 조정</h3>
      <div class="cops-set">
        <label class="fld"><span class="lbl">모드</span>        <select id="cMode">
          <option value="relic" ${g.mode === "relic" ? "selected" : ""}>유물부수기</option>
          <option value="mimic" ${g.mode === "mimic" ? "selected" : ""}>AI처럼 행동하기</option>
        </select></label>
        <label class="fld" id="cPoliceFld" style="${g.mode === "mimic" ? "display:none" : ""}"><span class="lbl">경찰(술래) 수</span>${step("cPolice", g.policeCount || 1, 1, 5)}</label>
        <label class="fld" id="cBotsFld" style="${g.mode === "relic" ? "display:none" : ""}"><span class="lbl">AI 봇 수</span>${step("cBots", g.botCount || 10, 1, 30)}</label>
        <label class="fld" id="cRelicCountFld" style="${g.mode === "relic" ? "" : "display:none"}"><span class="lbl">유물 수</span>${step("cRelicCount", g.safeCount || 4, 1, 12)}</label>
        <label class="fld" id="cRelicTimeFld" style="${g.mode === "relic" ? "" : "display:none"}"><span class="lbl">유물 부수기 시간(초)</span>${step("cRelicTime", g.relicTime || 5, 1, 30)}</label>
        <label class="fld" id="cThiefVisFld" style="${g.mode === "relic" ? "" : "display:none"}"><span class="lbl">도둑 시야</span>${step("cThiefVis", g.thiefVision || 230, 80, 600)}</label>
        <label class="fld" id="cPoliceVisFld" style="${g.mode === "relic" ? "" : "display:none"}"><span class="lbl">경찰(술래) 시야</span>${step("cPoliceVis", g.policeVision || 350, 80, 700)}</label>
        <label class="fld" id="cThiefDashFld" style="${g.mode === "relic" ? "" : "display:none"}"><span class="lbl">도망자 대쉬 CD(초)</span>${step("cThiefDash", g.thiefDashCd || 10, 1, 30)}</label>
        <label class="fld" id="cPoliceDashFld" style="${g.mode === "relic" ? "" : "display:none"}"><span class="lbl">술래 대쉬 CD(초)</span>${step("cPoliceDash", g.policeDashCd || 6, 1, 30)}</label>
        <label class="fld" id="cMapFld" style="${g.mode === "relic" ? "" : "display:none"}"><span class="lbl">맵</span><select id="cMapSelect"><option value="random">랜덤 미로</option></select></label>
        <p class="muted" id="cMapHint" style="${g.mode === "relic" ? "" : "display:none"};font-size:12px;margin:4px 0 0">맵은 랜덤 미로 또는 저장된 맵에서 선택할 수 있습니다.</p>
        <label class="fld" id="cTeamModeFld" style="${g.mode === "mimic" ? "" : "display:none"}"><span class="lbl">대전</span><select id="cTeamMode">
          <option value="solo" ${g.teamMode === "solo" ? "selected" : ""}>개인전</option>
          <option value="team" ${g.teamMode !== "solo" ? "selected" : ""}>팀전</option>
        </select></label>
        <label class="fld" id="cTeamsFld" style="${g.mode === "mimic" && g.teamMode !== "solo" ? "" : "display:none"}"><span class="lbl">팀 수</span>${step("cTeams", g.teamsCount || 2, 2, 4)}</label>
      </div>
      <div class="mg-row"><button class="btn gray" data-mg="c-stop">■ 정지</button></div>
      <p class="muted" style="margin-top:8px"><b>유물부수기</b>: 도둑 <b>밀치기</b> · 술래 <b>방어막</b>(맞으면 도둑이 끌려옴) · 방향 화살표 · 근접 경고</p>
    </div>` : ""}
    <div id="cWait"></div>
    <div class="arena-stage">
      <canvas id="ccanvas" width="900" height="640"></canvas>
      <div id="cCatchFeed" class="kill-feed"></div>
      <div id="copsCtl"></div>
    </div>
    <div id="cbanner" class="cops-banner"></div>`;
  }
  function refreshMapSelect() {
    const sel = root.querySelector("#cMapSelect");
    if (!sel || !room) return;
    const cur = room.game.mapId || "random";
    sel.innerHTML = `<option value="random">🎲 랜덤 미로</option>` + relicMaps.map((m) =>
      `<option value="${escHtml(m.id)}" ${cur === m.id ? "selected" : ""}>${escHtml(m.name)}</option>`
    ).join("");
  }
  function requestRelicMaps() {
    if (me.isHost) send({ t: "action", a: "maps" });
  }
  function syncMapPreviewIfNeeded() {
    const g = room && room.game;
    if (!g || g.mode !== "relic" || g.started || !me.isHost) return;
    if (!g.walls || !g.walls.length) send({ t: "action", a: "mapgen" });
    else requestRelicMaps();
  }
  function updateCops() {
    const g = room.game;
    const role = root.querySelector("#chudRole");
    const status = root.querySelector("#chudStatus");
    const cWait = root.querySelector("#cWait");
    if (cWait) cWait.innerHTML = g.started ? "" : waitRoomHtml();
    if (!g.started) {
      copsRole = null; stopCopsInput(); stopCopsRender();
      const ctl = root.querySelector("#copsCtl"); if (ctl) ctl.innerHTML = ""; copsCtlRole = null;
      if (role) { role.textContent = g.counting ? "시작 중" : "대기중"; role.className = "pill"; }
      if (status) {
        if (g.mode === "mimic") status.textContent = `AI처럼 행동 · ${g.teamMode === "solo" ? "개인전" : g.teamsCount + "파전"} · 봇 ${g.botCount}`;
        else if (g.mode === "relic") status.textContent = `유물부수기 · ${g.mapName || "맵"} · 술래 ${g.policeCount} · 유물 ${g.safeCount || 4}개`;
        else status.textContent = "";
      }
      const t = root.querySelector("#chudTime"); if (t) t.textContent = "⏱ --";
      drawCops();
      syncMapPreviewIfNeeded();
      refreshMapSelect();
    } else {
      startCopsInput();
      startCopsRender();
      if (inGameView) fitGameStage();
    }
  }
  function refreshCopsFeedUi() {
    const cf = root.querySelector("#cCatchFeed");
    if (!cf) return;
    if (lastCops && lastCops.mode === "relic") {
      patchKillFeed(cf, copsCatchFeed, (k) => k.id, (k) =>
        `<span style="color:#dc2626">🚔 ${escHtml(k.pn)}</span> → <span style="color:#94a3b8">${escHtml(k.vn)}</span>`
      );
    } else if (lastCops && lastCops.mode === "mimic") {
      patchKillFeed(cf, copsMimicKillFeed, (k) => k.id, (k) =>
        `<span style="color:#f43f5e">🗡️ ${escHtml(k.kn)}</span> → <span style="color:#94a3b8">${escHtml(k.vn)}</span>`
      );
    } else cf.replaceChildren();
  }
  function onCopsMsg() {
    copsMode = lastCops ? lastCops.mode : copsMode;
    // 찌르기 명중 이펙트
    if (lastCops && lastCops.events && lastCops.events.length) {
      let stabbed = false;
      for (const e of lastCops.events) {
        if (e.kind === "hostile" || e.kind === "zone") continue;
        const kind = e.kind || "hit";
        copsSlashes.push({ x: e.x, y: e.y, ttl: 0.45, max: 0.45, k: kind });
        spawnCombatFx(e.x, e.y, kind, kind === "block" ? 0.4 : 0.45);
        if (kind === "hit" || kind === "kill") stabbed = true;
        else if (kind === "block") MA.sfx("item");
      }
      if (stabbed) MA.sfx("stab");
    }
    // 금고/유물 개봉 효과음
    if (lastCops) {
      const opened = lastCops.mode === "relic" ? (lastCops.opened || 0) : (lastCops.safes ? lastCops.safes.filter((s) => s.o).length : 0);
      if (opened > prevOpened) MA.sfx("safe");
      prevOpened = opened;
    }
    const banner = root.querySelector("#cbanner");
    if (banner) {
      if (lastCops && lastCops.alert && copsRole === "thief") {
        banner.textContent = "⚠ 술래가 다가옵니다! 도망가세요!" + (lastCops.alertDist != null ? ` (${lastCops.alertDist}m)` : "");
        banner.className = "cops-banner show alert-seek";
      } else {
        banner.textContent = "";
        banner.className = "cops-banner";
      }
    }
    const role = root.querySelector("#chudRole");
    if (role) {
      if (copsRole === "police") { role.textContent = copsMode === "relic" ? "🚔 술래(경찰)" : "🎯 경찰"; role.className = "pill cyan"; }
      else if (copsRole === "player") { role.textContent = lastCops && lastCops.dead ? "💀 탈락(관전)" : "🥸 참가자 (AI인척)"; role.className = "pill " + (lastCops && lastCops.dead ? "" : "blue"); }
      else {
        const meC = lastCops && lastCops.circles && lastCops.circles.find((c) => c.i === me.id);
        if (meC && meC.j) { role.textContent = "🔒 감옥"; role.className = "pill"; }
        else { role.textContent = "🕵️ 도둑"; role.className = "pill blue"; }
      }
    }
    if (copsCtlRole !== copsRole || copsSpecMode !== !!(lastCops && lastCops.mode === "mimic" && lastCops.dead && copsRole === "player")) {
      const spec = !!(lastCops && lastCops.mode === "mimic" && lastCops.dead && copsRole === "player");
      buildCopsControls(copsRole, spec);
      copsCtlRole = copsRole;
      copsSpecMode = spec;
      if (spec && lastCops) mimicCam = { x: lastCops.vx, y: lastCops.vy };
    }
    const t = root.querySelector("#chudTime"); if (t && lastCops) t.textContent = "⏱ " + lastCops.tl + "s";
    const status = root.querySelector("#chudStatus");
    if (status && lastCops) {
      if (lastCops.mode === "relic" && lastCops.stats) {
        const s = lastCops.stats;
        status.textContent = `🏃 도망 ${s.alive} · 🚔 감옥 ${s.jailed} · 🏺 유물 ${s.relicsLeft}개 남음`;
      } else if (lastCops.mode === "mimic") {
        const tm = lastCops.solo ? "개인전" : `팀${lastCops.myTeam + 1}`;
        const bits = [`생존 ${lastCops.alive}명`, `AI ${lastCops.botsAlive ?? "?"}`, lastCops.solo ? tm : `${lastCops.teamsLeft}팀 · ${tm}`];
        if (lastCops.defending) bits.push("방어중");
        if (lastCops.stabDebuff) bits.push(`⏱쿨디버프 ${lastCops.debuffLeft}s`);
        if (lastCops.hostile) bits.push("⚠AI적대");
        status.textContent = bits.join(" · ");
      }
    }
    if (copsRole === "police" && lastCops && lastCops.mode === "relic") {
      const phLb = root.querySelector("#cPhaseLb"); const phBtn = root.querySelector("#cPhase");
      if (phLb) {
        const ch = lastCops.phaseCharges != null ? lastCops.phaseCharges : (lastCops.pcd > 0 ? 0 : 1);
        if (ch <= 0) phLb.textContent = lastCops.pcd > 0 ? lastCops.pcd.toFixed(1) + "s" : "돌진";
        else if (ch >= 2) phLb.textContent = "돌진×2";
        else phLb.textContent = lastCops.pcd > 0 ? `돌진×1 (${lastCops.pcd.toFixed(1)}s)` : "돌진×1";
      }
      if (phBtn) {
        const ch = lastCops.phaseCharges != null ? lastCops.phaseCharges : 1;
        phBtn.classList.toggle("cooling", ch <= 0);
        phBtn.classList.toggle("armed", !!lastCops.phasing || ch >= 2);
      }
      const shLb = root.querySelector("#cShieldLb"); const shBtn = root.querySelector("#cShield");
      if (shLb) shLb.textContent = lastCops.shielding ? "방어중" : (lastCops.scd > 0 ? lastCops.scd.toFixed(1) + "s" : "방어막");
      if (shBtn) { shBtn.classList.toggle("cooling", lastCops.scd > 0 && !lastCops.shielding); shBtn.classList.toggle("armed", !!lastCops.shielding); }
    }
    if (copsRole === "thief" && lastCops && lastCops.mode === "relic") {
      const dLb = root.querySelector("#cDashLb"); const dBtn = root.querySelector("#cDash");
      if (dLb) dLb.textContent = lastCops.dcd > 0 ? lastCops.dcd.toFixed(1) + "s" : "대쉬";
      if (dBtn) { dBtn.classList.toggle("cooling", lastCops.dcd > 0); dBtn.classList.toggle("armed", !!lastCops.dashing); }
      const pLb = root.querySelector("#cPushLb"); const pBtn = root.querySelector("#cPush");
      if (pLb) pLb.textContent = (lastCops.pushCd > 0) ? lastCops.pushCd.toFixed(1) + "s" : "밀치기";
      if (pBtn) { pBtn.classList.toggle("cooling", lastCops.pushCd > 0); }
    }
    if (copsRole === "player" && lastCops && lastCops.mode === "mimic" && !lastCops.dead) {
      const stabLb = root.querySelector("#cStabLb"); const stabBtn = root.querySelector("#cStab");
      const defLb = root.querySelector("#cDefendLb"); const defBtn = root.querySelector("#cDefend");
      const dLb = root.querySelector("#cDashLb"); const dBtn = root.querySelector("#cDash");
      if (stabLb) {
        if (lastCops.stabDebuff) stabLb.textContent = `디버프 ${lastCops.debuffLeft}s`;
        else stabLb.textContent = lastCops.stabCd > 0 ? lastCops.stabCd.toFixed(1) + "s" : "찌르기";
      }
      if (stabBtn) {
        stabBtn.classList.toggle("cooling", lastCops.stabCd > 0);
        stabBtn.classList.toggle("debuff", !!lastCops.stabDebuff);
      }
      if (defLb) defLb.textContent = lastCops.defCd > 0 ? lastCops.defCd.toFixed(1) + "s" : "방어";
      if (defBtn) { defBtn.classList.toggle("cooling", lastCops.defCd > 0); defBtn.classList.toggle("armed", !!lastCops.defending); }
      if (dLb) dLb.textContent = lastCops.dcd > 0 ? lastCops.dcd.toFixed(1) + "s" : "대쉬";
      if (dBtn) { dBtn.classList.toggle("cooling", lastCops.dcd > 0); dBtn.classList.toggle("armed", !!lastCops.dashing); }
    }
    if (lastCops && lastCops.mode === "mimic" && lastCops.events) {
      for (const e of lastCops.events) {
        if (e.kind === "hostile" && !root._mimicHostileToast) { root._mimicHostileToast = true; T("AI가 적대적으로 변했습니다! 근처 플레이어를 공격합니다.", "err"); }
      }
    }
    if (lastCops && (lastCops.mode === "relic" || lastCops.mode === "mimic") && lastCops.feed) {
      let added = false;
      if (lastCops.mode === "relic") {
        for (const k of lastCops.feed) {
          if (!copsCatchFeed.some((x) => x.id === k.id)) { copsCatchFeed.unshift(k); added = true; }
        }
        copsCatchFeed = pruneFeedEntries(copsCatchFeed);
      }
      if (lastCops.mode === "mimic") {
        for (const k of lastCops.feed) {
          if (!copsMimicKillFeed.some((x) => x.id === k.id)) { copsMimicKillFeed.unshift(k); added = true; }
        }
        copsMimicKillFeed = pruneFeedEntries(copsMimicKillFeed);
      }
      if (added) { scheduleFeedPrune(); refreshCopsFeedUi(); }
    }
    if (!room?.game?.started || !lastCops) drawCops();
  }
  function onCopsEnd(m) {
    let msg, cls;
    if (m.mode === "mimic") {
      if (m.winner === "중단") { msg = "게임 중단"; cls = ""; }
      else if (m.winner === "무승부") { msg = "무승부!"; cls = ""; }
      else { msg = `🏆 ${m.winner} 승리! (최종 생존 ${m.alive}명)`; cls = "win-thief"; }
    } else {
      const label = "유물";
      if (m.winner === "도둑") { msg = `🕵️ 도둑 승리! ${label} ${m.opened}/${m.safeCount} 성공`; cls = "win-thief"; }
      else if (m.winner === "경찰") { msg = `🎯 경찰 승리! 도둑 ${m.caught}/${m.thiefCount} 검거`; cls = "win-police"; }
      else { msg = "게임 종료"; cls = ""; }
    }
    T(msg, cls === "win-thief" ? "ok" : "");
    let win = false;
    if (m.mode === "mimic") win = !(lastCops && lastCops.dead) && m.winner !== "중단" && m.winner !== "무승부";
    else if (copsRole === "thief") win = m.winner === "도둑";
    else if (copsRole === "police") win = m.winner === "경찰";
    MA.sfx(win ? "win" : "lose");
    const banner = root.querySelector("#cbanner"); if (banner) { banner.textContent = msg; banner.className = "cops-banner show " + cls; }
    copsRole = null; stopCopsInput(); stopCopsRender(); stopFeedPrune(); copsCatchFeed = []; copsMimicKillFeed = []; mimicCam = { x: null, y: null }; copsMimicWalls = null; mimicBgKey = ""; root._mimicHostileToast = false; root._mimicZoneToast = false; leaveGameView();
  }

  // ----------------------------------------------------------------- 최고의 주방장
  function isKitchenGame() {
    return room && (room.gameType === "kitchen" || room.gameType === "kitchen-tut");
  }
  function kitchenLayoutProfile() {
    return room?.gameType === "kitchen-tut" ? "kitchen-tut" : "kitchen";
  }
  function isKitchenTutorial() {
    return room?.gameType === "kitchen-tut" || lastKitchen?.mode === "tutorial";
  }
  function showKitchenScore(m) {
    let msg = `+${m.pts}점 ${m.name || ""}`;
    if (m.combo > 1) msg += ` · 🔥${m.combo}연속!`;
    if (m.comboBonus > 0) msg += ` (+${m.comboBonus})`;
    showKitchenHint(msg);
    MA.sfx("win");
  }
  function recipeBarHtml(orders, tut) {
    const list = Array.isArray(orders) ? orders : (orders ? [orders] : []);
    if (!list.length) return `<span class="kr-empty">주문 대기...</span>`;
    return list.map((o) => {
      const diff = "★".repeat(o.difficulty || 1);
      const parts = (o.parts || []).map((pt) => kItemMeta(pt).emoji).join("");
      const urg = !tut && o.timeLeft <= 10 ? " urg" : "";
      return `<div class="kr-line${urg}">
        <span class="kr-name">${escHtml(o.name)}</span>
        <span class="kr-diff">${diff}</span>
        <span class="kr-parts">${parts}</span>
        <span class="kr-hint">${escHtml(o.howShort || "")}</span>
        ${tut ? "" : `<span class="kr-time">${Math.max(0, Math.ceil(o.timeLeft))}s</span>`}
      </div>`;
    }).join("");
  }
  function showKitchenHint(msg) {
    const el = root.querySelector("#kHintToast");
    if (el) {
      el.textContent = msg;
      el.classList.add("show");
      if (kitchenHintTimer) clearTimeout(kitchenHintTimer);
      kitchenHintTimer = setTimeout(() => el.classList.remove("show"), MG_LOG_MS);
    }
    T(msg, "warn");
    MA.sfx("nav");
  }
  const K_META = {
    lettuce: { label: "상추", color: "#4ade80", emoji: "🥬" },
    tomato: { label: "토마토", color: "#f87171", emoji: "🍅" },
    meat: { label: "고기", color: "#fca5a5", emoji: "🥩" },
    onion: { label: "양파", color: "#fde68a", emoji: "🧅" },
    potato: { label: "감자", color: "#d4a574", emoji: "🥔" },
    chopped_lettuce: { label: "손질 상추", color: "#86efac", emoji: "🥗" },
    chopped_tomato: { label: "손질 토마", color: "#fb7185", emoji: "🍅" },
    chopped_onion: { label: "손질 양파", color: "#fcd34d", emoji: "🧅" },
    cooked_meat: { label: "구운 고기", color: "#b45309", emoji: "🍖" },
    cooked_onion: { label: "양파수프", color: "#fbbf24", emoji: "🍲" },
    fried_potato: { label: "감자튀김", color: "#eab308", emoji: "🍟" },
    fish: { label: "생선", color: "#7dd3fc", emoji: "🐟" },
    cooked_fish: { label: "구운 생선", color: "#0284c7", emoji: "🍣" },
    mix: { label: "재료묶음", color: "#c4b5fd", emoji: "🥡" },
    plate: { label: "접시", color: "#f1f5f9", emoji: "🍽" },
    dirty_plate: { label: "더러운 접시", color: "#94a3b8", emoji: "🍽" },
    burnt: { label: "탄 음식", color: "#44403c", emoji: "🔥" },
  };
  const STATION_LABEL = {
    spawn: "재료함", board: "도마", pan: "프라이팬", pot: "냄비", fryer: "튀김기",
    counter: "테이블", plates: "접시", serve: "제출창", trash: "쓰레기",
  };
  const STATION_COLOR = {
    spawn: "#78716c", board: "#fcd34d", pan: "#57534e", pot: "#44403c", fryer: "#292524",
    counter: "#b45309", plates: "#cbd5e1", serve: "#15803d", trash: "#a16207",
  };
  function kItemMeta(t) { return K_META[t] || { label: t || "?", color: "#94a3b8", emoji: "❓" }; }
  function drawKItem(ctx, x, y, item, sz) {
    if (!item) return;
    const s = sz || 1;
    const w = 52 * s, h = 42 * s;
    if (item.t === "plate" || item.t === "mix") {
      const isMix = item.t === "mix";
      ctx.fillStyle = isMix ? "#ede9fe" : "#f8fafc";
      ctx.strokeStyle = isMix ? "#a78bfa" : "#cbd5e1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.55, h * 0.35, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      const parts = item.parts || [];
      parts.forEach((pt, i) => {
        const m = kItemMeta(pt);
        ctx.font = `${Math.round(14 * s)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(m.emoji, x + (i - (parts.length - 1) / 2) * 14 * s, y - 4 * s);
      });
      if (parts.length === 0) {
        ctx.fillStyle = "#64748b"; ctx.font = `${Math.round(9 * s)}px sans-serif`;
        ctx.fillText(isMix ? "재료묶음" : "접시", x, y + 4 * s);
      } else if (parts.length >= 2 && !isMix) {
        ctx.fillStyle = "#334155"; ctx.font = `bold ${Math.round(8 * s)}px sans-serif`;
        ctx.fillText("요리", x, y + 14 * s);
      } else if (isMix && parts.length >= 2) {
        ctx.fillStyle = "#6d28d9"; ctx.font = `bold ${Math.round(8 * s)}px sans-serif`;
        ctx.fillText("묶음", x, y + 14 * s);
      }
      return;
    }
    const m = kItemMeta(item.t);
    ctx.fillStyle = m.color;
    ctx.strokeStyle = "#1c1917";
    ctx.lineWidth = 1.5;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 6 * s);
    ctx.fill(); ctx.stroke();
    ctx.font = `${Math.round(16 * s)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(m.emoji, x, y - 2 * s);
    ctx.fillStyle = "#1e293b";
    ctx.font = `bold ${Math.round(8 * s)}px sans-serif`;
    ctx.fillText(m.label, x, y + h / 2 - 4 * s);
    if (item.b || item.t === "burnt") {
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = "#fca5a5"; ctx.font = `${Math.round(10 * s)}px sans-serif`;
      ctx.fillText("🔥", x, y);
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  /** 주방 라벨 — 어두운 배지 + 흰 글씨 + 검은 외곽선 */
  function drawKLabel(ctx, x, y, text, opts = {}) {
    if (!text) return;
    const size = opts.size || 11;
    ctx.save();
    ctx.font = `800 ${size}px 'Segoe UI', 'Malgun Gothic', sans-serif`;
    ctx.textAlign = opts.align || "center";
    ctx.textBaseline = "middle";
    const metrics = ctx.measureText(text);
    const padX = opts.padX ?? 8;
    const padY = opts.padY ?? 4;
    const tw = metrics.width + padX * 2;
    const th = size + padY * 2;
    let bx = x - tw / 2;
    if (opts.align === "left") bx = x;
    else if (opts.align === "right") bx = x - tw;
    const by = y - th / 2;
    if (opts.bg !== false) {
      ctx.fillStyle = opts.bg || "rgba(15, 23, 42, 0.94)";
      roundRect(ctx, bx, by, tw, th, opts.radius ?? 6);
      ctx.fill();
      ctx.strokeStyle = opts.border || "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.lineJoin = "round";
    ctx.lineWidth = opts.outline ?? 3;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = opts.color || "#ffffff";
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function drawKProgress(ctx, st) {
    const it = st.item;
    if (!it || !it.p || it.p <= 0) return;
    const barY = st.y + st.h - 10;
    const p = Math.min(1, it.p);
    ctx.fillStyle = "rgba(15,23,42,0.55)";
    ctx.fillRect(st.x + 4, barY, st.w - 8, 8);
    const col = it.phase === "done" || p >= 1 ? "#22c55e" : "#eab308";
    ctx.fillStyle = col;
    ctx.fillRect(st.x + 4, barY, (st.w - 8) * p, 8);
    const lbl = it.phase === "chop" ? "손질" : (it.phase === "done" ? "완료!" : (it.phase || "조리"));
    drawKLabel(ctx, st.x + st.w / 2, barY - 8, `${lbl} ${Math.round(p * 100)}%`, { size: 9, padX: 6, padY: 3 });
  }
  function drawKitchenFloor(ctx, wW, wH, tut) {
    const tile = 48;
    for (let tx = 48; tx < wW - 48; tx += tile) {
      for (let ty = 48; ty < wH - 48; ty += tile) {
        const teamA = tx < 1038;
        const alt = (Math.floor(tx / tile) + Math.floor(ty / tile)) % 2;
        if (tut) ctx.fillStyle = alt ? "#fde68a" : "#fef9c3";
        else if (teamA) ctx.fillStyle = alt ? "#fecdd3" : "#ffe4e6";
        else ctx.fillStyle = alt ? "#bae6fd" : "#e0f2fe";
        ctx.fillRect(tx, ty, tile, tile);
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.lineWidth = 1;
        ctx.strokeRect(tx + 0.5, ty + 0.5, tile - 1, tile - 1);
      }
    }
    ctx.fillStyle = tut ? "#f97316" : "#fb7185";
    ctx.fillRect(48, 36, wW - 96, 14);
    ctx.fillStyle = tut ? "#fdba74" : "#fda4af";
    ctx.fillRect(48, 50, wW - 96, 8);
    if (!tut) {
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(1162, 36, 990, 14);
      ctx.fillStyle = "#7dd3fc";
      ctx.fillRect(1162, 50, 990, 8);
    }
    for (let lx = 180; lx < wW - 48; lx += tut ? 220 : 440) {
      if (!tut && lx > 1038 && lx < 1162) continue;
      ctx.fillStyle = "rgba(253,224,71,0.35)";
      ctx.beginPath();
      ctx.ellipse(lx, 72, 90, 36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(lx, 58, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ca8a04";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, 66);
      ctx.lineTo(lx, 78);
      ctx.stroke();
    }
  }
  function drawKitchenWalls(ctx, walls, wW, wH, tut) {
    for (const w of walls || []) {
      ctx.fillStyle = w.x >= 1038 && w.x < 1162 ? "#475569" : "#78716c";
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = "#44403c";
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
    }
    ctx.strokeStyle = "#292524";
    ctx.lineWidth = 4;
    ctx.strokeRect(48, 36, wW - 96, wH - 72);
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 2;
    ctx.strokeRect(52, 40, wW - 104, wH - 80);
  }
  function drawChef(ctx, p, isMe) {
    const x = p.x, y = p.y, f = p.f || 0;
    const apron = p.tm === 0 ? "#e11d48" : "#2563eb";
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath(); ctx.ellipse(0, 14, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(f);
    ctx.fillStyle = "#f8fafc";
    roundRect(ctx, -13, -4, 26, 24, 5); ctx.fill();
    ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = apron;
    roundRect(ctx, -9, 4, 18, 14, 3); ctx.fill();
    ctx.fillStyle = "#fde68a";
    ctx.beginPath(); ctx.arc(0, -16, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#d97706"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillRect(-12, -30, 24, 11);
    ctx.beginPath(); ctx.arc(0, -30, 12, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = "#e2e8f0"; ctx.stroke();
    ctx.fillStyle = "#475569";
    ctx.fillRect(-1, -34, 2, 5);
    ctx.restore();
    if (isMe) {
      ctx.strokeStyle = "#fde047"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.stroke();
    }
    if (p.h) drawKItem(ctx, x + 22, y - 28, p.h, 0.72);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "bold 10px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(p.n || "").slice(0, isSpectating() ? 12 : 6), x, y + 32);
    if (p.dcd > 0 && isMe) {
      ctx.fillStyle = "rgba(15,23,42,0.55)"; ctx.fillRect(x - 18, y + 36, 36, 4);
      ctx.fillStyle = "#fbbf24"; ctx.fillRect(x - 18, y + 36, 36 * (1 - Math.min(1, p.dcd / 2.4)), 4);
    }
  }
  function drawStationSprite(ctx, st) {
    const x = st.x, y = st.y, w = st.w, h = st.h;
    const cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(cx, y + h + 4, w * 0.42, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (st.type === "spawn") {
      const m = kItemMeta(st.ing);
      ctx.fillStyle = m.color;
      roundRect(ctx, x, y, w, h, 10); ctx.fill();
      ctx.strokeStyle = "#1c1917"; ctx.lineWidth = 3; roundRect(ctx, x, y, w, h, 10); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      roundRect(ctx, x + 5, y + 5, w - 10, 14, 4); ctx.fill();
      ctx.font = "30px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#1c1917"; ctx.fillText(m.emoji, cx, cy + 8);
      drawKLabel(ctx, cx, y - 6, "재료함", { size: 10 });
      drawKLabel(ctx, cx, y + h + 10, m.label, { size: 10, color: "#fef08a", border: "rgba(253,224,71,0.6)" });
    } else if (st.type === "board") {
      ctx.fillStyle = "#fcd34d"; roundRect(ctx, x, y + 10, w, h - 10, 8); ctx.fill();
      ctx.strokeStyle = "#92400e"; ctx.lineWidth = 2.5; roundRect(ctx, x, y + 10, w, h - 10, 8); ctx.stroke();
      ctx.fillStyle = "#b45309"; ctx.fillRect(x + 8, y + h - 6, w - 16, 6);
      ctx.font = "24px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText("🔪", cx - 14, cy + 4);
      ctx.fillStyle = "#fef3c7"; roundRect(ctx, cx - 4, cy - 8, 28, 18, 3); ctx.fill();
      drawKLabel(ctx, cx, y - 6, "도마", { size: 11 });
    } else if (st.type === "pan") {
      ctx.fillStyle = "#44403c"; ctx.beginPath(); ctx.ellipse(cx, cy + 4, w * 0.42, h * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#1c1917"; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = "#78716c"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx + w * 0.35, cy); ctx.lineTo(cx + w * 0.5, cy - 4); ctx.stroke();
      ctx.font = "20px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText("🍳", cx, cy + 2);
      drawKLabel(ctx, cx, y - 6, "프라이팬", { size: 11 });
    } else if (st.type === "pot") {
      ctx.fillStyle = "#374151"; roundRect(ctx, x + 10, y + 14, w - 20, h - 18, 6); ctx.fill();
      ctx.fillStyle = "#6b7280"; ctx.fillRect(x + 16, y + 8, w - 32, 10);
      ctx.font = "22px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText("🫕", cx, cy + 6);
      drawKLabel(ctx, cx, y - 6, "냄비", { size: 11 });
    } else if (st.type === "fryer") {
      ctx.fillStyle = "#292524"; roundRect(ctx, x + 8, y + 12, w - 16, h - 14, 5); ctx.fill();
      ctx.fillStyle = "#eab308"; ctx.fillRect(x + 14, y + h - 18, w - 28, 8);
      ctx.font = "20px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText("🛢️", cx, cy + 2);
      drawKLabel(ctx, cx, y - 6, "튀김기", { size: 11 });
    } else if (st.type === "plates") {
      ctx.fillStyle = "#cbd5e1"; roundRect(ctx, x, y, w, h, 10); ctx.fill();
      ctx.strokeStyle = "#64748b"; ctx.lineWidth = 2.5; roundRect(ctx, x, y, w, h, 10); ctx.stroke();
      ctx.font = "28px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText("🍽", cx, cy + 8);
      drawKLabel(ctx, cx, y - 6, "접시", { size: 11 });
    } else if (st.type === "serve") {
      ctx.fillStyle = "#15803d"; roundRect(ctx, x, y, w, h, 12); ctx.fill();
      ctx.strokeStyle = "#86efac"; ctx.lineWidth = 4; roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 10); ctx.stroke();
      ctx.font = "30px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText("🪟", cx, cy + 6);
      drawKLabel(ctx, cx, y - 6, "제출창", { size: 11, color: "#dcfce7", border: "rgba(134,239,172,0.7)" });
    } else if (st.type === "trash") {
      ctx.fillStyle = "#a16207"; roundRect(ctx, x + 6, y + 10, w - 12, h - 12, 8); ctx.fill();
      ctx.strokeStyle = "#713f12"; ctx.lineWidth = 2; roundRect(ctx, x + 6, y + 10, w - 12, h - 12, 8); ctx.stroke();
      ctx.font = "26px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText("🗑️", cx, cy + 6);
      drawKLabel(ctx, cx, y - 6, "쓰레기", { size: 11 });
    } else if (st.type === "counter") {
      ctx.fillStyle = "#b45309"; roundRect(ctx, x, y, w, h, 8); ctx.fill();
      ctx.strokeStyle = "#78350f"; ctx.lineWidth = 2.5; roundRect(ctx, x, y, w, h, 8); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 8 + i * 18, y + 8, 10, h - 16);
      drawKLabel(ctx, cx, y - 6, "테이블", { size: 10 });
    } else {
      ctx.fillStyle = STATION_COLOR[st.type] || "#57534e";
      roundRect(ctx, x, y, w, h, 8); ctx.fill();
    }
    if (st.item) drawKItem(ctx, cx, cy + 4, st.item, 1.05);
    drawKProgress(ctx, st);
    ctx.restore();
  }
  function shellKitchen() {
    const tut = room?.gameType === "kitchen-tut";
    return `
    <div class="arena-hud arena-hud-game kitchen-hud">
      <span id="khudTime" class="pill blue">⏱ --</span>
      <span id="khudScore" class="pill cyan">${tut ? "📖 튜토리얼" : "A 0 : 0 B"}</span>
      <span id="khudHint" class="pill">${tut ? "단계별 레시피를 따라해 보세요" : "접시에 담아 제출하세요"}</span>
    </div>
    ${me.isHost ? `<div class="mg-card kitchen-host-bar"><div class="mg-row"><button class="btn gray" data-mg="k-stop">■ 정지</button></div>
      <p class="muted" style="margin:8px 0 0;font-size:12px">${tut ? "1~4인 · 조이스틱·상호작용·대쉬 · 손에 든 재료는 상호작용으로 내려놓기" : "2~8명 · 1대1~4대4 · 조이스틱·상호작용·대쉬"}</p></div>` : ""}
    <div id="kWait"></div>
    <div id="kTutorial" class="kitchen-tutorial"></div>
    <div id="kOrders" class="kitchen-orders"></div>
    <div id="kHintToast" class="kitchen-hint-toast"></div>
    <div class="arena-stage kitchen-stage">
      <div id="kRecipeBar" class="k-recipe-bar"></div>
      <canvas id="kcanvas"></canvas>
      <div id="kitchenCtl"></div>
    </div>
    <div id="kbanner" class="cops-banner"></div>`;
  }
  function updateKitchen() {
    const g = room.game;
    const w = root.querySelector("#kWait");
    if (w) w.innerHTML = g.started ? "" : waitRoomHtml() + `<p class="muted center" style="font-size:13px;margin-top:8px">${isKitchenTutorial() ? "1명부터 시작 · 쉬운 레시피부터 순서대로" : "최소 2명(1대1) · 최대 8명(4대4)"}</p>`;
    if (g.started) {
      startKitchenInput();
      if (inGameView) fitGameStage();
      applyControlLayout(kitchenLayoutProfile());
    } else {
      stopKitchenInput();
      const ctl = root.querySelector("#kitchenCtl"); if (ctl) ctl.innerHTML = "";
      kitchenCtlReady = false;
      drawKitchen();
    }
  }
  function buildKitchenControls() {
    const el = root.querySelector("#kitchenCtl"); if (!el) return;
    el.innerHTML = `
      <div class="joystick" id="kjoyBase" data-ctl="joy"><div class="joystick-knob" id="kjoyKnob"></div></div>
      <button class="cbtn interact" id="kInteract" data-ctl="interact">🤲<br>상호작용</button>
      <button class="cbtn dash" id="kDash" data-ctl="dash"><span class="sk-ico">⚡</span><span id="kDashLb">대쉬</span></button>`;
    bindJoystick(root.querySelector("#kjoyBase"), root.querySelector("#kjoyKnob"));
    bindHold(root.querySelector("#kInteract"), (v) => (interactHeld = v));
    bindTap(root.querySelector("#kDash"), () => { kitchenDashPending = true; MA.sfx("dash"); });
    applyControlLayout(kitchenLayoutProfile());
    kitchenCtlReady = true;
  }
  function startKitchenInput() {
    if (kitchenInputTimer) return;
    if (!kitchenCtlReady) buildKitchenControls();
    kitchenInputTimer = setInterval(() => {
      if (!isKitchenGame() || !room.game.started) return;
      send({ t: "action", a: "input", mvx: joy.dx, mvy: joy.dy, interact: interactHeld, dashTap: kitchenDashPending });
      kitchenDashPending = false;
    }, 50);
  }
  function stopKitchenInput() {
    if (kitchenInputTimer) { clearInterval(kitchenInputTimer); kitchenInputTimer = null; }
  }
  function updateKitchenHud() {
    if (!lastKitchen) return;
    const tut = isKitchenTutorial();
    const meP = lastKitchen.ps && lastKitchen.ps.find((p) => p.id === me.id);
    const team = meP ? meP.tm : 0;
    const t = root.querySelector("#khudTime");
    if (t) t.textContent = tut ? `📖 ${(lastKitchen.tutStage || 0) + 1}/${lastKitchen.tutTotal || 5}` : `⏱ ${Math.ceil(lastKitchen.tl || 0)}s · R${lastKitchen.teamRound?.[team] || 1}`;
    const sc = root.querySelector("#khudScore");
    if (sc && lastKitchen.scores) {
      const combo = lastKitchen.combo && lastKitchen.combo[team];
      const comboTxt = combo > 1 ? ` · 🔥${combo}연속` : "";
      sc.textContent = tut
        ? `점수 ${lastKitchen.scores[0] || 0}`
        : `A ${lastKitchen.scores[0] || 0} : ${lastKitchen.scores[1] || 0} B${comboTxt}`;
    }
    const bar = root.querySelector("#kRecipeBar");
    if (bar && lastKitchen.orders) {
      const teamOrders = (lastKitchen.orders[team] || []).slice(0, 5);
      bar.innerHTML = recipeBarHtml(teamOrders, tut);
      bar.style.display = teamOrders.length || tut ? "" : "none";
    }
    const tutEl = root.querySelector("#kTutorial");
    if (tutEl && tut && lastKitchen.tutPrompt) {
      tutEl.innerHTML = `<div class="kt-banner">${escHtml(lastKitchen.tutPrompt)}</div>`;
    } else if (tutEl) tutEl.innerHTML = "";
    const ord = root.querySelector("#kOrders");
    if (ord && lastKitchen.orders && !inGameView) {
      const list = (lastKitchen.orders[team] || []).slice(0, 5);
      ord.innerHTML = list.map((o) => {
        const urg = !tut && o.timeLeft <= 10 ? "urg" : "";
        const parts = (o.parts || []).map((pt) => {
          const m = kItemMeta(pt);
          return `<span class="ko-part" title="${escHtml(m.label)}">${m.emoji}</span>`;
        }).join("");
        const diff = "★".repeat(o.difficulty || 1);
        return `<div class="ko-card ${urg}"><div class="ko-head"><b>${escHtml(o.name)}</b><span class="kr-diff">${diff}</span><div class="ko-parts">${parts}</div>${tut ? "" : `<small>${Math.max(0, Math.ceil(o.timeLeft))}s</small>`}</div><p class="ko-short">${escHtml(o.howShort || "")}</p></div>`;
      }).join("") || `<span class="muted">${tut ? "튜토리얼 준비 중..." : "주문 대기 중..."}</span>`;
    } else if (ord && inGameView) ord.innerHTML = "";
    const dLb = root.querySelector("#kDashLb"); const dBtn = root.querySelector("#kDash");
    if (dLb) dLb.textContent = "대쉬";
    if (dBtn) dBtn.classList.remove("cooling");
  }
  function drawKitchen() {
    const cv = root.querySelector("#kcanvas"); if (!cv) return;
    const stage = cv.closest(".kitchen-stage");
    if (stage) fitKitchenCanvas(cv, stage.getBoundingClientRect());
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const W = cv.width, H = cv.height;
    const g = lastKitchen;
    const tut = g?.mode === "tutorial";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#2a1810"); grad.addColorStop(1, "#1a100c");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    if (!g || !g.ps) {
      ctx.fillStyle = "#94a3b8"; ctx.font = `${Math.round(Math.min(W, H) * 0.028)}px 'Segoe UI',sans-serif`; ctx.textAlign = "center";
      ctx.fillText(isKitchenTutorial() ? "방장이 Go!를 누르면 튜토리얼이 시작됩니다" : "방장이 Go!를 누르면 A팀·B팀 요리 대결이 시작됩니다", W / 2, H / 2);
      return;
    }
    const wW = tut ? 1100 : 2200, wH = 920;
    const meP = g.ps.find((p) => p.id === me.id) || g.ps[0];
    const vScale = kitchenViewScale(cv, tut);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(vScale, vScale);
    ctx.translate(-meP.x, -meP.y);

    drawKitchenFloor(ctx, wW, wH, tut);

    // 카운터 상판 (긴 테이블)
    const counters = (g.stations || []).filter((s) => s.type === "counter");
    if (counters.length) {
      const team = meP.tm;
      const tc = counters.filter((s) => String(s.id).startsWith(team + "_"));
      if (tc.length) {
        const minX = Math.min(...tc.map((s) => s.x)) - 12;
        const maxX = Math.max(...tc.map((s) => s.x + s.w)) + 12;
        ctx.fillStyle = "#92400e";
        roundRect(ctx, minX, 358, maxX - minX, 108, 12); ctx.fill();
        ctx.strokeStyle = "#451a03"; ctx.lineWidth = 3;
        roundRect(ctx, minX, 358, maxX - minX, 108, 12); ctx.stroke();
        ctx.fillStyle = "#d97706";
        roundRect(ctx, minX + 4, 362, maxX - minX - 8, 14, 4); ctx.fill();
        drawKLabel(ctx, (minX + maxX) / 2, 348, "🪑 플레이팅 테이블", { size: 12, color: "#fef08a", border: "rgba(251,191,36,0.55)" });
      }
    }

    for (const st of g.stations || []) drawStationSprite(ctx, st);

    drawKitchenWalls(ctx, g.walls, wW, wH, tut);

    if (!tut) {
      ctx.fillStyle = "#334155";
      ctx.fillRect(1038, 36, 124, wH - 72);
      ctx.strokeStyle = "#64748b"; ctx.lineWidth = 3;
      ctx.strokeRect(1038, 36, 124, wH - 72);
      drawKLabel(ctx, 1100, wH / 2, "VS", { size: 20, color: "#fde68a", border: "rgba(253,224,71,0.5)" });
      drawKLabel(ctx, 530, 52, "A팀 주방", { size: 16, color: "#fecdd3", border: "rgba(251,113,133,0.65)" });
      drawKLabel(ctx, 1670, 52, "B팀 주방", { size: 16, color: "#bae6fd", border: "rgba(56,189,248,0.65)" });
    } else {
      drawKLabel(ctx, wW / 2, 52, "📖 연습 주방", { size: 18, color: "#fde68a", border: "rgba(251,191,36,0.55)" });
    }

    for (const gr of g.ground || []) {
      drawKItem(ctx, gr.x, gr.y, { t: gr.t, parts: gr.parts }, 1.0);
    }
    for (const p of g.ps) {
      drawChef(ctx, p, p.id === me.id);
    }
    ctx.restore();
    updateKitchenHud();
  }
  function onKitchenEnd(m) {
    const msg = m.tutorial && m.winner === "튜토리얼 클리어"
      ? "🎉 튜토리얼 클리어! 모든 레시피를 마스터했습니다!"
      : m.winner === "무승부"
        ? `무승부! (${m.scores[0]} : ${m.scores[1] || 0})`
        : `🏆 ${m.winner} 승리! (${m.scores[0]} : ${m.scores[1] || 0})`;
    T(msg, "ok");
    const meK = lastKitchen?.ps?.find((p) => p.id === me.id);
    const win = m.tutorial ? m.winner === "튜토리얼 클리어" : ((m.winner === "A팀" && meK?.tm === 0) || (m.winner === "B팀" && meK?.tm === 1));
    MA.sfx(win ? "win" : "lose");
    const banner = root.querySelector("#kbanner");
    if (banner) { banner.textContent = msg; banner.className = "cops-banner show"; }
    stopKitchenInput(); lastKitchen = null; leaveGameView();
  }

  function buildCopsControls(role, spectating) {
    const el = root.querySelector("#copsCtl"); if (!el) return;
    interactHeld = stopHeld = shootHeldC = defendHeld = copsShieldHeld = false; stabPending = false;
    const mode = lastCops?.mode || room?.game?.mode || "relic";
    if (role === "thief") {
      el.innerHTML = `
        <div class="joystick" id="cjoyBase" data-ctl="joy"><div class="joystick-knob" id="cjoyKnob"></div></div>
        <button class="cbtn interact" id="cInteract" data-ctl="interact">🔓<br>상호작용</button>
        <button class="cbtn dash" id="cDash" data-ctl="dash"><span class="sk-ico">🦘</span><span id="cDashLb">대쉬</span></button>
        <button class="cbtn push" id="cPush" data-ctl="push"><span class="sk-ico">💨</span><span id="cPushLb">밀치기</span></button>`;
      bindJoystick(root.querySelector("#cjoyBase"), root.querySelector("#cjoyKnob"));
      bindHold(root.querySelector("#cInteract"), (v) => (interactHeld = v));
      bindTap(root.querySelector("#cDash"), () => { copsDashPending = true; MA.sfx("dash"); });
      bindTap(root.querySelector("#cPush"), () => { copsPushPending = true; MA.sfx("dash"); });
    } else if (role === "police") {
      el.innerHTML = `
        <div class="joystick" id="cjoyBase" data-ctl="joy"><div class="joystick-knob" id="cjoyKnob"></div></div>
        <button class="cbtn phase" id="cPhase" data-ctl="phase"><span class="sk-ico">🌀</span><span id="cPhaseLb">돌진</span></button>
        <button class="cbtn defend" id="cShield" data-ctl="shield"><span class="sk-ico">🛡️</span><span id="cShieldLb">방어막</span></button>`;
      bindJoystick(root.querySelector("#cjoyBase"), root.querySelector("#cjoyKnob"));
      bindTap(root.querySelector("#cPhase"), () => { phasePending = true; MA.sfx("dash"); });
      bindHold(root.querySelector("#cShield"), (v) => (copsShieldHeld = v));
    } else if (role === "player") {
      if (spectating) {
        el.innerHTML = `<div class="joystick" id="cjoyBase" data-ctl="joy"><div class="joystick-knob" id="cjoyKnob"></div></div>`;
        bindJoystick(root.querySelector("#cjoyBase"), root.querySelector("#cjoyKnob"));
      } else {
      el.innerHTML = `
        <div class="joystick" id="cjoyBase" data-ctl="joy"><div class="joystick-knob" id="cjoyKnob"></div></div>
        <button class="cbtn stab" id="cStab" data-ctl="stab"><span class="sk-ico">🗡️</span><span id="cStabLb">찌르기</span></button>
        <button class="cbtn dash" id="cDash" data-ctl="dash"><span class="sk-ico">⚡</span><span id="cDashLb">대쉬</span></button>
        <button class="cbtn defend" id="cDefend" data-ctl="defend"><span class="sk-ico">🛡️</span><span id="cDefendLb">방어</span></button>`;
      bindJoystick(root.querySelector("#cjoyBase"), root.querySelector("#cjoyKnob"));
      bindTap(root.querySelector("#cStab"), () => { stabPending = true; });
      bindTap(root.querySelector("#cDash"), () => { copsDashPending = true; MA.sfx("dash"); });
      bindHold(root.querySelector("#cDefend"), (v) => (defendHeld = v));
      }
    } else {
      el.innerHTML = "";
    }
    applyControlLayout(copsLayoutProfile(role, spectating, mode));
  }
  function panMimicCam() {
    if (!lastCops || !lastCops.dead) return;
    const cv = root.querySelector("#ccanvas");
    const viewW = cv ? cv.width : 900, viewH = cv ? cv.height : 640;
    const wW = lastCops.world ? lastCops.world.w : 1600, wH = lastCops.world ? lastCops.world.h : 1100;
    if (mimicCam.x == null) { mimicCam.x = lastCops.vx ?? wW / 2; mimicCam.y = lastCops.vy ?? wH / 2; }
    const spd = 26;
    mimicCam.x += joy.dx * spd;
    mimicCam.y += joy.dy * spd;
    mimicCam.x = Math.max(viewW / 2, Math.min(wW - viewW / 2, mimicCam.x));
    mimicCam.y = Math.max(viewH / 2, Math.min(wH - viewH / 2, mimicCam.y));
  }
  function startCopsInput() {
    if (copsInputTimer) return;
    copsInputTimer = setInterval(() => {
      if ((!bridge || !bridge.send) && !(ws && ws.readyState === 1)) return;
      if (!copsRole) return;
      if (copsRole === "thief") {
        if (copsMode === "relic") send({ t: "action", a: "input", mvx: joy.dx, mvy: joy.dy, interact: interactHeld, dash: copsDashPending, push: copsPushPending });
        else send({ t: "action", a: "input", mvx: joy.dx, mvy: joy.dy, interact: interactHeld, stop: stopHeld });
      }
      else if (copsRole === "player") {
        if (lastCops && lastCops.mode === "mimic" && lastCops.dead) panMimicCam();
        else send({ t: "action", a: "input", mvx: joy.dx, mvy: joy.dy, stab: stabPending, defend: defendHeld, dash: copsDashPending });
        stabPending = false;
      }
      else if (copsRole === "police") send({ t: "action", a: "input", mvx: joy.dx, mvy: joy.dy, phase: phasePending, shield: copsShieldHeld, defend: copsShieldHeld });
      phasePending = false; copsDashPending = false; copsPushPending = false;
    }, 50);
  }
  function stopCopsInput() { if (copsInputTimer) { clearInterval(copsInputTimer); copsInputTimer = null; } }
  function isSpectating() {
    if (lastCops && lastCops.mode === "mimic" && lastCops.dead) return true;
    if (lastArena && room?.gameType === "arena") {
      const meP = lastArena.ps?.find((p) => p.id === me.id);
      if (meP && !meP.al) return true;
    }
    return false;
  }
  // 포즈가 있는 아바타(형체) 렌더링 — 팔 뻗기/앉기/손흔들기/찌르기/방어
  function drawAvatarSimple(ctx, c, mine, ally, spectating) {
    const r = 14, x = c.x, y = c.y, f = c.f || 0, pose = c.po || "walk";
    const fx = Math.cos(f), fy = Math.sin(f);
    const bodyR = pose === "sit" ? r - 2 : r;
    if (pose === "defend") {
      ctx.fillStyle = "rgba(56,189,248,0.18)"; ctx.beginPath(); ctx.arc(x, y, r + 11, 0, 6.28); ctx.fill();
      ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 11, 0, 6.28); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, bodyR, 0, 6.28);
    ctx.fillStyle = c.c || "#64748b"; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.32)"; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2.5; ctx.beginPath();
    ctx.moveTo(x + fx * 3, y + fy * 3); ctx.lineTo(x + fx * (bodyR - 1), y + fy * (bodyR - 1)); ctx.stroke();
    if (pose === "stab") {
      ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 4; ctx.beginPath();
      ctx.moveTo(x + fx * r * 0.5, y + fy * r * 0.5); ctx.lineTo(x + fx * (r + 28), y + fy * (r + 28)); ctx.stroke();
    }
    if (ally) { ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, bodyR + 4, 0, 6.28); ctx.stroke(); }
    if (mine) { ctx.strokeStyle = "#fde047"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, bodyR + 5, 0, 6.28); ctx.stroke(); }
    if (spectating && (c.n || c.i)) {
      ctx.fillStyle = c.pl ? "#fde047" : "#cbd5e1";
      ctx.font = `bold ${c.pl ? 11 : 10}px sans-serif`; ctx.textAlign = "center";
      ctx.fillText(String(c.n || c.i).slice(0, 12), x, y + bodyR + 20);
      if (c.pl && c.tm != null && !lastCops?.solo) {
        ctx.fillStyle = "#94a3b8"; ctx.font = "10px sans-serif"; ctx.fillText(`팀${c.tm + 1}`, x, y + bodyR + 32);
      }
    }
  }
  function getMimicBgCanvas(wW, wH, walls) {
    const key = wW + "x" + wH + ":" + (walls || []).map((w) => `${w.x},${w.y},${w.w},${w.h}`).join("|");
    if (mimicBgKey === key && mimicBgCanvas) return mimicBgCanvas;
    mimicBgKey = key;
    const cv = document.createElement("canvas");
    cv.width = wW; cv.height = wH;
    const bctx = cv.getContext("2d");
    bctx.fillStyle = "#0b1220"; bctx.fillRect(0, 0, wW, wH);
    bctx.strokeStyle = "rgba(255,255,255,0.05)"; bctx.lineWidth = 1;
    for (let x = 0; x < wW; x += 45) { bctx.beginPath(); bctx.moveTo(x, 0); bctx.lineTo(x, wH); bctx.stroke(); }
    for (let y = 0; y < wH; y += 45) { bctx.beginPath(); bctx.moveTo(0, y); bctx.lineTo(wW, y); bctx.stroke(); }
    bctx.strokeStyle = "#475569"; bctx.lineWidth = 6; bctx.strokeRect(3, 3, wW - 6, wH - 6);
    bctx.fillStyle = "#1e293b"; bctx.strokeStyle = "#334155"; bctx.lineWidth = 2;
    for (const w of walls || []) { bctx.fillRect(w.x, w.y, w.w, w.h); bctx.strokeRect(w.x, w.y, w.w, w.h); }
    mimicBgCanvas = cv;
    return cv;
  }
  let copsDrawPrev = 0;
  function drawAvatar(ctx, c, mine, ally, tsec, spectating) {
    const r = 14, x = c.x, y = c.y, f = c.f || 0, pose = c.po || "walk", jailed = c.j;
    const fx = Math.cos(f), fy = Math.sin(f), rx = -fy, ry = fx;
    const bodyR = pose === "sit" ? r - 2 : r;
    // 찌르기 칼날 (몸 앞으로 뻗음)
    if (pose === "stab") {
      const len = r + 30;
      ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 4; ctx.beginPath();
      ctx.moveTo(x + fx * r * 0.5, y + fy * r * 0.5); ctx.lineTo(x + fx * len, y + fy * len); ctx.stroke();
      ctx.fillStyle = "#cbd5e1"; ctx.beginPath(); ctx.arc(x + fx * len, y + fy * len, 4, 0, 6.28); ctx.fill();
    }
    // 방어 — 전방향 방어막
    if (pose === "defend") {
      ctx.fillStyle = "rgba(56,189,248,0.18)"; ctx.beginPath(); ctx.arc(x, y, r + 11, 0, 6.28); ctx.fill();
      ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, r + 11, 0, 6.28); ctx.stroke();
    }
    // 앉기 다리
    if (pose === "sit") { ctx.strokeStyle = "rgba(0,0,0,0.32)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + fx * 12 + rx * 4, y + fy * 12 + ry * 4); ctx.moveTo(x, y); ctx.lineTo(x + fx * 12 - rx * 4, y + fy * 12 - ry * 4); ctx.stroke(); }
    // 몸통
    ctx.beginPath(); ctx.arc(x, y, bodyR, 0, 6.28);
    ctx.fillStyle = jailed ? "rgba(148,163,184,0.55)" : c.c; ctx.fill();
    ctx.strokeStyle = jailed ? "#e2e8f0" : "rgba(0,0,0,0.32)"; ctx.lineWidth = jailed ? 2 : 1.4; ctx.stroke();
    // 방향 표시
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x + fx * 3, y + fy * 3); ctx.lineTo(x + fx * (bodyR - 1), y + fy * (bodyR - 1)); ctx.stroke();
    // 팔/손
    const shL = { x: x + rx * bodyR * 0.7, y: y + ry * bodyR * 0.7 };
    const shR = { x: x - rx * bodyR * 0.7, y: y - ry * bodyR * 0.7 };
    let hL = { x: shL.x + fx * 3, y: shL.y + fy * 3 }, hR = { x: shR.x + fx * 3, y: shR.y + fy * 3 };
    if (pose === "walk") { const ph = Math.sin(tsec * 9 + x * 0.05) * 4; hL = { x: shL.x + fx * ph, y: shL.y + fy * ph }; hR = { x: shR.x - fx * ph, y: shR.y - fy * ph }; }
    else if (pose === "wave") {
      const w = Math.sin(tsec * 10) * 12;
      hL = { x: shL.x + fx * 5, y: shL.y + fy * 5 };
      hR = { x: shR.x - rx * 24 + fx * w, y: shR.y - ry * 24 + fy * w - 6 };
    }
    else if (pose === "sit" || pose === "stop") { hL = { x: x + rx * 6, y: y + ry * 6 }; hR = { x: x - rx * 6, y: y - ry * 6 }; }
    else if (pose === "stab") { hL = { x: x + fx * 14, y: y + fy * 14 }; hR = { x: x + fx * 10 - rx * 3, y: y + fy * 10 - ry * 3 }; }
    ctx.strokeStyle = jailed ? "rgba(148,163,184,0.7)" : "rgba(0,0,0,0.3)"; ctx.lineWidth = pose === "wave" ? 4 : 3;
    ctx.beginPath(); ctx.moveTo(shL.x, shL.y); ctx.lineTo(hL.x, hL.y); ctx.moveTo(shR.x, shR.y); ctx.lineTo(hR.x, hR.y); ctx.stroke();
    const drawHand = (hx, hy, big) => {
      const hr = big ? 6.2 : 3.4;
      if (big) {
        ctx.fillStyle = "#fde68a"; ctx.strokeStyle = "#ca8a04"; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(hx, hy, hr, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#92400e"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("✋", hx, hy + 1); ctx.textBaseline = "alphabetic";
      } else {
        ctx.fillStyle = jailed ? "rgba(148,163,184,0.85)" : c.c;
        ctx.beginPath(); ctx.arc(hx, hy, hr, 0, 6.28); ctx.fill();
      }
    };
    drawHand(hL.x, hL.y, false);
    drawHand(hR.x, hR.y, pose === "wave");
    // 표시(아군/본인)
    if (ally) { ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, bodyR + 4, 0, 6.28); ctx.stroke(); }
    if (mine) { ctx.strokeStyle = "#fde047"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, bodyR + 5, 0, 6.28); ctx.stroke(); }
    // 감옥: 살려달라 말풍선 (주기적)
    if (jailed) {
      const seed = [...String(c.i || "x")].reduce((a, ch) => a + ch.charCodeAt(0), 0);
      const pulse = Math.sin(tsec * 1.35 + seed * 0.09);
      if (pulse > -0.2) {
        const texts = ["살려줘!", "살려달라!", "구해줘!"];
        const txt = texts[seed % 3];
        const alpha = Math.min(1, (pulse + 0.2) / 1.05);
        const by = y - bodyR - 28;
        ctx.save();
        ctx.globalAlpha = 0.5 + alpha * 0.5;
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        const tw = ctx.measureText(txt).width + 16;
        ctx.fillStyle = "#fef2f2";
        ctx.fillRect(x - tw / 2, by - 15, tw, 22);
        ctx.strokeStyle = "#f87171"; ctx.lineWidth = 1.5;
        ctx.strokeRect(x - tw / 2, by - 15, tw, 22);
        ctx.beginPath();
        ctx.moveTo(x - 5, by + 7); ctx.lineTo(x, by + 14); ctx.lineTo(x + 5, by + 7);
        ctx.closePath(); ctx.fillStyle = "#fef2f2"; ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#dc2626";
        ctx.fillText(txt, x, by);
        ctx.restore();
      }
    }
    // 이름 표시 (관전 시 전원 · 유물부수기 등)
    const showName = c.n || (spectating && c.i);
    if (showName) {
      const label = String(c.n || c.i).slice(0, 12) + (mine && !spectating ? "(나)" : "");
      if (spectating) {
        ctx.fillStyle = c.pl ? "#fde047" : "#cbd5e1";
        ctx.font = `bold ${c.pl ? 12 : 11}px sans-serif`;
      } else {
        ctx.fillStyle = mine ? "#fde047" : (jailed ? "#94a3b8" : "#e2e8f0");
        ctx.font = `bold ${mine ? 11 : 10}px sans-serif`;
      }
      ctx.textAlign = "center";
      ctx.fillText(label, x, y + bodyR + (spectating ? 24 : (mine ? 22 : 18)));
      if (spectating && c.pl && c.tm != null && !lastCops?.solo) {
        ctx.fillStyle = "#94a3b8"; ctx.font = "10px sans-serif";
        ctx.fillText(`팀${c.tm + 1}`, x, y + bodyR + 36);
      }
    } else if (mine) {
      ctx.fillStyle = "#fde047"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText(jailed ? "나(감옥)" : "나", x, y - bodyR - 10);
    }
    // 돌진(벽 돌파) 이펙트
    if (c.ph || pose === "dash") {
      ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(x, y, bodyR + 8, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function drawCops() {
    const cv = root.querySelector("#ccanvas"); if (!cv) return;
    const ctx = cv.getContext("2d"); const W = cv.width, H = cv.height;
    const nowMs = performance.now();
    const dt = copsDrawPrev ? Math.min(0.05, (nowMs - copsDrawPrev) / 1000) : 0.016;
    copsDrawPrev = nowMs;
    const tsec = nowMs / 1000;
    ctx.fillStyle = "#111827"; ctx.fillRect(0, 0, W, H);
    if (!lastCops) {
      const pg = room && room.game;
      const preview = pg && pg.mode === "relic" && pg.walls && pg.walls.length;
      if (preview) {
        const wW = pg.world ? pg.world.w : W, wH = pg.world ? pg.world.h : H;
        const camX = Math.round(W / 2 - wW / 2), camY = Math.round(H / 2 - wH / 2);
        ctx.save(); ctx.translate(camX, camY);
        ctx.fillStyle = "#0b1220"; ctx.fillRect(0, 0, wW, wH);
        ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
        for (let x = 0; x < wW; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, wH); ctx.stroke(); }
        for (let y = 0; y < wH; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(wW, y); ctx.stroke(); }
        ctx.strokeStyle = "#475569"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, wW - 6, wH - 6);
        ctx.fillStyle = "#334155"; ctx.strokeStyle = "#475569"; ctx.lineWidth = 2;
        for (const w of pg.walls) { ctx.fillRect(w.x, w.y, w.w, w.h); ctx.strokeRect(w.x, w.y, w.w, w.h); }
        if (pg.jail) {
          const j = pg.jail;
          ctx.fillStyle = "rgba(148,163,184,0.14)"; ctx.fillRect(j.x, j.y, j.w, j.h);
          ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 2; ctx.strokeRect(j.x, j.y, j.w, j.h);
        }
        ctx.restore();
        ctx.fillStyle = mapEditMode ? "#fde047" : "#64748b";
        ctx.font = mapEditMode ? "bold 14px sans-serif" : "20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(mapEditMode ? "✏️ 벽 편집: 드래그=벽 추가 · 우클릭=삭제" : (pg.mapName || "맵 미리보기"), W / 2, H / 2);
        return;
      }
      ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.strokeStyle = "#475569"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.fillStyle = "#64748b"; ctx.font = "20px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("방장이 시작하면 게임이 시작됩니다", W / 2, H / 2);
      return;
    }
    // 시간 감쇠 이펙트
    copsShots.forEach((e) => (e.ttl -= dt)); copsShots = copsShots.filter((e) => e.ttl > 0);
    copsSlashes.forEach((e) => (e.ttl -= dt)); copsSlashes = copsSlashes.filter((e) => e.ttl > 0);
    tickCombatFx(dt);
    const g = lastCops, relic = g.mode === "relic", mimic = g.mode === "mimic";

    // ── AI처럼 행동하기(mimic) 렌더링 ──
    if (mimic) {
      const wW = g.world ? g.world.w : W, wH = g.world ? g.world.h : H;
      const meC = g.circles && g.circles.find((c) => c.me);
      let cx, cy;
      if (g.dead && mimicCam.x != null) { cx = mimicCam.x; cy = mimicCam.y; }
      else { cx = meC ? meC.x : (g.vx != null ? g.vx : wW / 2); cy = meC ? meC.y : (g.vy != null ? g.vy : wH / 2); }
      const camX = Math.round(W / 2 - cx), camY = Math.round(H / 2 - cy);
      ctx.save(); ctx.translate(camX, camY);
      ctx.drawImage(getMimicBgCanvas(wW, wH, g.walls), 0, 0);
      const nEnt = (g.circles || []).length;
      const lite = nEnt >= 8;
      for (const c of g.circles) {
        if (c.h) {
          ctx.strokeStyle = "rgba(239,68,68,0.55)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(c.x, c.y, 18, 0, 6.28); ctx.stroke();
        }
        if (lite && !c.me && !c.ally) drawAvatarSimple(ctx, c, c.me, c.ally, g.dead);
        else drawAvatar(ctx, c, c.me, c.ally, tsec, g.dead);
      }
      /* 찌르기 사거리 항상 표시 */
      if (!g.dead && meC) {
        const sr = (g.stabR != null ? g.stabR : 46) + 14;
        const half = g.stabHalf != null ? g.stabHalf : 0.95;
        const face = g.face != null ? g.face : (meC.f || 0);
        ctx.save();
        ctx.translate(meC.x, meC.y);
        ctx.fillStyle = g.stabDebuff ? "rgba(239,68,68,0.18)" : "rgba(250,204,21,0.14)";
        ctx.strokeStyle = g.stabDebuff ? "rgba(239,68,68,0.85)" : "rgba(250,204,21,0.75)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, sr, face - half, face + half);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      if (g.stabDebuff && !g.dead) {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "rgba(127,29,29,0.82)";
        ctx.fillRect(W / 2 - 110, 48, 220, 28);
        ctx.fillStyle = "#fecaca"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(`찌르기 쿨 디버프 ${g.debuffLeft}s`, W / 2, 67);
        ctx.restore();
      }
      drawCombatFx(ctx, combatFx);
      drawCombatFx(ctx, copsSlashes.map((e) => ({ x: e.x, y: e.y, k: e.k || "hit", ttl: e.ttl, max: e.max || 0.45 })));
      ctx.restore();
      if (g.dead) {
        ctx.fillStyle = "rgba(2,6,23,0.55)"; ctx.fillRect(0, 0, W, 40);
        ctx.fillStyle = "#e2e8f0"; ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("💀 관전 중 · 전원 이름 표시 · 조이스틱으로 화면 이동", W / 2, 26);
      }
      return;
    }
    // 카메라(유물부수기: 플레이어 주변만) + 필드/격자/경계 + 미로 벽
    const cam = relic && g.vx != null;
    const camX = cam ? Math.round(W / 2 - g.vx) : 0, camY = cam ? Math.round(H / 2 - g.vy) : 0;
    const wW = g.world ? g.world.w : W, wH = g.world ? g.world.h : H;
    ctx.save(); ctx.translate(camX, camY);
    ctx.fillStyle = "#0b1220"; ctx.fillRect(0, 0, wW, wH);
    ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
    for (let x = 0; x < wW; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, wH); ctx.stroke(); }
    for (let y = 0; y < wH; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(wW, y); ctx.stroke(); }
    ctx.strokeStyle = "#475569"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, wW - 6, wH - 6);
    const myHide = relic ? (g.inHideout != null ? g.inHideout : null) : null;
    const hideouts = relic ? (g.hideouts || room.game?.hideouts || []) : [];
    // 굵은 벽 + 숨은 공간
    if (relic && hideouts.length) {
      for (const h of hideouts) {
        const inside = myHide === h.id;
        if (!inside) {
          ctx.fillStyle = "#1a2332"; ctx.fillRect(h.outer.x, h.outer.y, h.outer.w, h.outer.h);
          ctx.strokeStyle = "#334155"; ctx.lineWidth = 2; ctx.strokeRect(h.outer.x, h.outer.y, h.outer.w, h.outer.h);
        } else {
          ctx.fillStyle = "#1a2332"; ctx.fillRect(h.outer.x, h.outer.y, h.outer.w, h.outer.h);
          ctx.fillStyle = "#243044"; ctx.fillRect(h.cavity.x, h.cavity.y, h.cavity.w, h.cavity.h);
          ctx.strokeStyle = "#64748b"; ctx.lineWidth = 2; ctx.strokeRect(h.outer.x, h.outer.y, h.outer.w, h.outer.h);
        }
        if (h.arrow && h.entrance) {
          const e = h.entrance, cx = e.x + e.w / 2, cy = e.y + e.h / 2;
          ctx.fillStyle = "rgba(250,204,21,0.85)"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          const arrow = e.dir === "s" ? "▼" : e.dir === "n" ? "▲" : e.dir === "e" ? "▶" : "◀";
          ctx.fillText(arrow, cx, cy);
          ctx.textBaseline = "alphabetic";
        }
      }
    }
    if (relic && room.game && room.game.walls) {
      ctx.fillStyle = "#334155"; ctx.strokeStyle = "#475569"; ctx.lineWidth = 2;
      for (const w of room.game.walls) { ctx.fillRect(w.x, w.y, w.w, w.h); ctx.strokeRect(w.x, w.y, w.w, w.h); }
    } else if (relic && g.walls) {
      ctx.fillStyle = "#334155"; ctx.strokeStyle = "#475569"; ctx.lineWidth = 2;
      for (const w of g.walls) { ctx.fillRect(w.x, w.y, w.w, w.h); ctx.strokeRect(w.x, w.y, w.w, w.h); }
    }
    // 감옥 (유물부수기)
    if (relic && g.jail) {
      const j = g.jail;
      ctx.fillStyle = "rgba(148,163,184,0.14)"; ctx.fillRect(j.x, j.y, j.w, j.h);
      ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 3; ctx.strokeRect(j.x, j.y, j.w, j.h);
      ctx.strokeStyle = "rgba(148,163,184,0.6)"; ctx.lineWidth = 1;
      for (let x = j.x + 10; x < j.x + j.w; x += 12) { ctx.beginPath(); ctx.moveTo(x, j.y); ctx.lineTo(x, j.y + j.h); ctx.stroke(); }
      ctx.fillStyle = "#cbd5e1"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("🚔 감옥", j.x + j.w / 2, j.y - 6);
    }
    // 금고 / 유물
    for (const s of g.safes) {
      if (relic) {
        ctx.fillStyle = s.o ? "#475569" : "#7c3aed";
        ctx.beginPath(); ctx.moveTo(s.x, s.y - 14); ctx.lineTo(s.x + 13, s.y); ctx.lineTo(s.x, s.y + 14); ctx.lineTo(s.x - 13, s.y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#c4b5fd"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s.o ? "✖" : "🏺", s.x, s.y + 1);
      } else {
        ctx.fillStyle = s.o ? "#475569" : "#a16207"; ctx.fillRect(s.x - 11, s.y - 11, 22, 22);
        ctx.strokeStyle = "#fde047"; ctx.lineWidth = 2; ctx.strokeRect(s.x - 11, s.y - 11, 22, 22);
        ctx.fillStyle = "#fff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s.o ? "✓" : "?", s.x, s.y);
      }
      if (!s.o && s.p > 0) { ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.p); ctx.stroke(); }
    }
    ctx.textBaseline = "alphabetic";
    // 원(도둑+봇, 구분 불가) / 감옥 죄수(j) — 형체(포즈) 아바타
    for (const c of g.circles) {
      drawAvatar(ctx, c, c.i === me.id, false, tsec, isSpectating());
      // 유물부수기 경찰(술래): 무섭게 강조 (붉은 링 + 💀)
      if (c.pol) {
        ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c.x, c.y, 21, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#fecaca"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("💀", c.x, c.y - 24); ctx.textBaseline = "alphabetic";
      }
      if (c.sh) {
        ctx.strokeStyle = "rgba(56,189,248,0.95)"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(c.x, c.y, 26, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "rgba(125,211,252,0.45)"; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(c.x, c.y, 30, 0, Math.PI * 2); ctx.stroke();
      }
      if (c.ph) {
        ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.arc(c.x, c.y, 21, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // 저격·상호작용 이펙트
    drawCombatFx(ctx, combatFx);
    drawCombatFx(ctx, copsShots.map((e) => ({
      x: e.x, y: e.y, k: e.kind || (e.hit ? "catch" : "spark"), ttl: e.ttl, max: e.max || 0.4,
    })));
    // 도둑 상호작용 힌트
    if (copsRole === "thief") {
      const meC = g.circles.find((c) => c.i === me.id);
      if (meC && meC.j) {
        ctx.fillStyle = "#fca5a5"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("🔒 감옥 안 — 조이스틱으로 이동 · 동료 구출을 기다리세요!", meC.x, meC.y + 46);
      } else if (meC && !meC.j) {
        let near = null, bd = 42;
        for (const s of g.safes) { if (s.o) continue; const d = Math.hypot(s.x - meC.x, s.y - meC.y); if (d < bd) { bd = d; near = s; } }
        if (near) { ctx.fillStyle = "#fde047"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("🏺 부수기!", meC.x, meC.y + 30); }
        // 감옥 근처 구출 힌트
        if (relic && g.jail) { const j = g.jail; const near2 = meC.x > j.x - 34 && meC.x < j.x + j.w + 34 && meC.y > j.y - 34 && meC.y < j.y + j.h + 34; if (near2 && g.circles.some((c) => c.j)) { ctx.fillStyle = "#38bdf8"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("🔑 상호작용으로 동료 구출!", meC.x, meC.y + 46); } }
      }
    }
    ctx.restore();
    // 안개: 유물부수기는 주변 시야만 보임 (경찰이 도둑보다 넓음)
    if (cam) {
      const vr = g.vr || 230;
      const grd = ctx.createRadialGradient(W / 2, H / 2, vr * 0.5, W / 2, H / 2, vr);
      grd.addColorStop(0, "rgba(3,6,14,0)");
      grd.addColorStop(0.8, "rgba(3,6,14,0.08)");
      grd.addColorStop(1, "rgba(3,6,14,0.97)");
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(148,163,184,0.22)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, vr, 0, Math.PI * 2); ctx.stroke();
    }
    /* 유물·감옥 방향 화살표 (화면 가장자리) */
    if (relic && g.guides && g.vx != null) {
      const fromX = g.vx, fromY = g.vy;
      const drawEdgeArrow = (tx, ty, color, label) => {
        if (tx == null || ty == null) return;
        const dx = tx - fromX, dy = ty - fromY;
        const dist = Math.hypot(dx, dy);
        if (dist < 70) return;
        const ang = Math.atan2(dy, dx);
        const reach = Math.min(W, H) * 0.38;
        const ax = W / 2 + Math.cos(ang) * reach;
        const ay = H / 2 + Math.sin(ang) * reach;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(16, 0); ctx.lineTo(-10, 9); ctx.lineTo(-6, 0); ctx.lineTo(-10, -9);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.fillStyle = color;
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, ax - Math.cos(ang) * 22, ay - Math.sin(ang) * 22 - 2);
      };
      if (g.guides.jail) drawEdgeArrow(g.guides.jail.x, g.guides.jail.y, "#94a3b8", "감옥");
      (g.guides.relics || []).forEach((r, i) => drawEdgeArrow(r.x, r.y, "#c4b5fd", "유물" + (i + 1)));
    }
  }
  function startArenaRender() {
    if (arenaRaf) return;
    let prev = performance.now();
    const tick = () => {
      arenaRaf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      tickCombatFx(dt);
      if (room && room.gameType === "arena" && room.game && room.game.started && lastArena) drawArena();
    };
    arenaRaf = requestAnimationFrame(tick);
  }
  function stopArenaRender() {
    if (arenaRaf) { cancelAnimationFrame(arenaRaf); arenaRaf = null; }
  }
  function startCopsRender() {
    if (copsRaf) return;
    copsDrawPrev = 0;
    const tick = () => {
      copsRaf = requestAnimationFrame(tick);
      if (room && room.gameType === "cops" && room.game && room.game.started && lastCops) drawCops();
    };
    copsRaf = requestAnimationFrame(tick);
  }
  function stopCopsRender() {
    if (copsRaf) { cancelAnimationFrame(copsRaf); copsRaf = null; }
    copsDrawPrev = 0;
  }
  function startInputLoop() {
    if (inputTimer) return;
    inputTimer = setInterval(() => {
      if (!(bridge && bridge.send) && !(ws && ws.readyState === 1)) return;
      if (room?.gameType === "arena" && Math.hypot(joy.dx, joy.dy) > 0.15) {
        facing = Math.atan2(joy.dy, joy.dx);
      }
      send({
        t: "action", a: "input",
        mvx: joy.dx, mvy: joy.dy, angle: facing,
        shoot: shooting, dash: dashPending,
        repair: false, recall: false,
      });
      if (shooting) { const now = Date.now(); if (now - lastShootSfx > 220) { MA.sfx("shoot"); lastShootSfx = now; } }
      dashPending = false;
      recallPending = false;
    }, 50);
  }
  function stopInputLoop() { if (inputTimer) { clearInterval(inputTimer); inputTimer = null; } }
  function onArenaEnd(m) {
    let msg;
    if (m.winner >= 0) msg = `🏆 팀 ${m.winner + 1} 승리! 넥서스 파괴`;
    else msg = "무승부 / 종료";
    T(msg, "ok");
    const meP = lastArena && lastArena.ps && lastArena.ps.find((p) => p.id === me.id);
    const win = meP ? (m.winner === meP.tm) : false;
    MA.sfx(win ? "win" : "lose");
    const sc = root.querySelector("#ascore"); if (sc) sc.innerHTML = `<div class="arena-end">${msg}</div>`;
    leaveGameView();
    stopArenaRender();
    stopFeedPrune();
  }
  function drawArena() {
    const cv = root.querySelector("#acanvas"); if (!cv) return;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const g = room.game;
    const worldW = (g.world && g.world.w) || W, worldH = (g.world && g.world.h) || H;
    const viewW = W * ARENA_ZOOM, viewH = H * ARENA_ZOOM;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#070b16"; ctx.fillRect(0, 0, W, H);
    // 카메라: 내 캐릭터 중심 추적 (맵 전체가 아닌 주변만 표시)
    const meP = lastArena && lastArena.ps && lastArena.ps.find((p) => p.id === me.id);
    const focusX = meP ? meP.x : worldW / 2, focusY = meP ? meP.y : worldH / 2;
    const targetCamX = Math.max(0, Math.min(worldW - viewW, focusX - viewW / 2));
    const targetCamY = Math.max(0, Math.min(worldH - viewH, focusY - viewH / 2));
    if (arenaCamSnap || !lastArena) {
      arenaCam.x = targetCamX; arenaCam.y = targetCamY; arenaCamSnap = false;
    } else {
      arenaCam.x += (targetCamX - arenaCam.x) * 0.14;
      arenaCam.y += (targetCamY - arenaCam.y) * 0.14;
    }
    ctx.save();
    ctx.scale(1 / ARENA_ZOOM, 1 / ARENA_ZOOM);
    ctx.translate(-arenaCam.x, -arenaCam.y);
    // 월드 바닥 + 그리드 + 외곽
    ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, worldW, worldH);
    ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
    for (let x = 0; x <= worldW; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, worldH); ctx.stroke(); }
    for (let y = 0; y <= worldH; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(worldW, y); ctx.stroke(); }
    ctx.strokeStyle = "#334155"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, worldW - 6, worldH - 6);
    // 벽
    if (g.walls) { ctx.fillStyle = "#334155"; ctx.strokeStyle = "#475569"; ctx.lineWidth = 2; for (const w of g.walls) { ctx.fillRect(w.x, w.y, w.w, w.h); ctx.strokeRect(w.x, w.y, w.w, w.h); } }
    if (!lastArena) {
      ctx.restore();
      ctx.fillStyle = "#64748b"; ctx.font = "22px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("방장이 시작을 누르면 게임이 시작됩니다", W / 2, H / 2);
      return;
    }
    const tl = root.querySelector("#ahudTime"); if (tl) tl.textContent = "⏱ " + lastArena.tl + "s";
    drawArenaTeam(ctx);
    ctx.restore();
    // HUD/효과음 (뷰포트 좌표계)
    arenaHudSfx();
  }
  function drawArenaTeam(ctx) {
    const a = lastArena;
    const viewW = (root.querySelector("#acanvas")?.width || 1440) * ARENA_ZOOM;
    const viewH = (root.querySelector("#acanvas")?.height || 900) * ARENA_ZOOM;
    const g = room.game;
    const worldW = (g.world && g.world.w) || 1760, worldH = (g.world && g.world.h) || 1180;
    // 장식·엄폐 프롭
    if (a.pr) {
      for (const b of a.pr) {
        if (b.k === "barrel") { ctx.fillStyle = "#64748b"; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 1; ctx.strokeRect(b.x, b.y, b.w, b.h); }
        else if (b.k === "mark") { ctx.fillStyle = "rgba(148,163,184,0.35)"; ctx.fillRect(b.x, b.y, b.w, b.h); }
        else { ctx.fillStyle = "#475569"; ctx.fillRect(b.x, b.y, b.w, b.h); }
      }
    }
    // 미는 상자
    if (a.px) { ctx.fillStyle = "#7c5e3b"; ctx.strokeStyle = "#b08a53"; ctx.lineWidth = 2; for (const b of a.px) { ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h); } }
    // 아이템
    const IC = { heal: ["#22c55e", "＋"], speed: ["#38bdf8", "»"], damage: ["#f97316", "⚔"], revive: ["#e879f9", "✚"] };
    for (const it of a.it || []) {
      const [col, sym] = IC[it.k] || ["#fff", "?"];
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(it.x, it.y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#0f172a"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(sym, it.x, it.y + 1);
    }
    ctx.textBaseline = "alphabetic";
    // 넥서스
    for (const n of a.nx || []) {
      const col = TCOL[n.tm] || "#94a3b8";
      const hitPulse = n.hit ? 0.25 + 0.15 * Math.sin(Date.now() / 80) : 0;
      ctx.beginPath(); ctx.arc(n.x, n.y, 32, 0, Math.PI * 2);
      ctx.fillStyle = n.al ? `rgba(255,255,255,${0.08 + hitPulse})` : "rgba(120,120,120,0.15)"; ctx.fill();
      ctx.lineWidth = n.hit ? 6 : 4; ctx.strokeStyle = n.al ? (n.hit ? "#fde047" : col) : "#475569"; ctx.stroke();
      ctx.fillStyle = n.al ? col : "#475569"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(n.al ? "◆" : "✖", n.x, n.y + 1); ctx.textBaseline = "alphabetic";
      if (n.al) { ctx.fillStyle = "#1e293b"; ctx.fillRect(n.x - 28, n.y - 44, 56, 6); ctx.fillStyle = col; ctx.fillRect(n.x - 28, n.y - 44, 56 * (n.h / n.m), 6); }
      ctx.fillStyle = col; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("팀" + (n.tm + 1) + " 넥서스", n.x, n.y + 48);
    }
    // 전투 이펙트 (서버 fx는 수신 시 combatFx로 스폰)
    drawCombatFx(ctx, combatFx);
    // 총알
    for (const b of a.b || []) { ctx.fillStyle = TCOL[b.tm] || "#fde047"; ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); }
    const meP = a.ps.find((p) => p.id === me.id);
    // 플레이어
    for (const p of a.ps) {
      const col = TCOL[p.tm] || "#94a3b8";
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = p.al ? col : "#334155"; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
      if (p.al) {
        /* 총구·조준 보조선 (본인은 길게) */
        ctx.strokeStyle = p.id === me.id ? "rgba(253,224,71,0.85)" : "rgba(255,255,255,0.35)";
        ctx.lineWidth = p.id === me.id ? 2.5 : 1.5;
        ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(p.id === me.id ? 78 : 28, 0); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(7, -6); ctx.lineTo(7, 6); ctx.closePath(); ctx.fill();
        if (p.id === me.id) {
          ctx.strokeStyle = "rgba(253,224,71,0.95)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(90, 0, 7, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(90 - 11, 0); ctx.lineTo(90 + 11, 0); ctx.moveTo(90, -11); ctx.lineTo(90, 11); ctx.stroke();
        }
      }
      ctx.restore();
      if (p.dash) { ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.stroke(); }
      if (p.rp) { ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, Math.PI * 2); ctx.stroke(); }
      if (p.recalling) { ctx.strokeStyle = "#a78bfa"; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      if (p.sp) { ctx.fillStyle = "#38bdf8"; ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.fillText("»", p.x + 18, p.y - 12); }
      if (p.dm) { ctx.fillStyle = "#f97316"; ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.fillText("⚔", p.x - 18, p.y - 12); }
      if (p.sk >= 2) { ctx.fillStyle = "#fde047"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText(p.sk + "연킬", p.x, p.y - 34); }
      if (p.id === me.id) { ctx.strokeStyle = "#fde047"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 19, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = p.id === me.id ? "#fde047" : (isSpectating() ? "#e2e8f0" : "#e2e8f0");
      ctx.font = `bold ${isSpectating() ? 13 : 12}px sans-serif`; ctx.textAlign = "center";
      const homeTag = (p.ht != null && p.ht !== p.tm) ? `·원${p.ht + 1}` : "";
      ctx.fillText(String(p.n || p.i).slice(0, 12) + (p.id === me.id ? "(나)" : "") + homeTag + (p.rv ? " ✚" : ""), p.x, p.y + 30);
      if (p.al) { ctx.fillStyle = "#1e293b"; ctx.fillRect(p.x - 17, p.y - 26, 34, 5); ctx.fillStyle = "#22c55e"; ctx.fillRect(p.x - 17, p.y - 26, 34 * (p.h / 100), 5); }
      else {
        ctx.fillStyle = "#fde047"; ctx.font = "bold 14px sans-serif";
        ctx.fillText(p.rs > 0 ? `부활 ${p.rs.toFixed(1)}초` : "부활 대기", p.x, p.y - 22);
      }
    }
    // 적 방향 화살표 (화면 밖)
    if (meP && meP.al) {
      const cx = arenaCam.x + viewW / 2, cy = arenaCam.y + viewH / 2;
      const margin = 36;
      for (const p of a.ps) {
        if (!p.al || p.tm === meP.tm || p.id === me.id) continue;
        const onScreen = p.x >= arenaCam.x + 20 && p.x <= arenaCam.x + viewW - 20 && p.y >= arenaCam.y + 20 && p.y <= arenaCam.y + viewH - 20;
        if (onScreen) continue;
        const ang = Math.atan2(p.y - cy, p.x - cx);
        const ax = clamp(p.x, arenaCam.x + margin, arenaCam.x + viewW - margin);
        const ay = clamp(p.y, arenaCam.y + margin, arenaCam.y + viewH - margin);
        const col = TCOL[p.tm] || "#f87171";
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -10); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function arenaHudSfx() {
    const a = lastArena; if (!a) return;
    const meP = a.ps.find((p) => p.id === me.id);
    const fxN = (a.fx || []).length;
    if (fxN > prevFx) MA.sfx("explode");
    prevFx = fxN;
    if (meP) {
      if (meP.al && prevHp != null && meP.h < prevHp - 0.5) MA.sfx("hit");
      const newBuff = (meP.sp && prevBuff.indexOf("s") < 0) || (meP.dm && prevBuff.indexOf("d") < 0) || (meP.rv && prevBuff.indexOf("r") < 0);
      if (prevBuff && newBuff) MA.sfx("item");
      prevBuff = (meP.sp ? "s" : "") + (meP.dm ? "d" : "") + (meP.rv ? "r" : "");
      prevHp = meP.al ? meP.h : null;
    }
    if (meP) {
      const dashLb = root.querySelector("#dashLb"); const dashBtn = root.querySelector("#dashBtn");
      if (dashLb) dashLb.textContent = meP.dcd > 0 ? meP.dcd.toFixed(1) + "s" : "대쉬";
      if (dashBtn) dashBtn.classList.toggle("cooling", meP.dcd > 0);
      const buff = root.querySelector("#ahudBuff");
      if (buff) {
        const bits = [];
        if (meP.sk >= 2) bits.push(`${meP.sk}연킬`);
        if (meP.sp) bits.push("이속");
        if (meP.dm) bits.push("공격↑");
        if (meP.rv) bits.push("즉시부활");
        buff.textContent = bits.length ? bits.join(" · ") : "";
        buff.style.display = bits.length ? "" : "none";
      }
      const rsEl = root.querySelector("#aRespawn");
      if (rsEl) {
        if (!meP.al && meP.rs > 0) { rsEl.classList.remove("hidden"); rsEl.textContent = `부활 ${meP.rs.toFixed(1)}초`; }
        else rsEl.classList.add("hidden");
      }
      const alert = root.querySelector("#aNexusAlert");
      const myNx = (a.nx || []).find((n) => n.tm === meP.tm);
      if (myNx && myNx.al && myNx.hit) nexusAlertUntil = Date.now() + 1400;
      if (alert) {
        const show = Date.now() < nexusAlertUntil;
        alert.classList.toggle("hidden", !show);
        if (show) alert.classList.toggle("pulse", true);
      }
    }
    updateArenaHud();
  }

  // ----------------------------------------------------------------- 이벤트 위임
  function mgClickTarget(e) {
    const el = e.target && e.target.nodeType === 1 ? e.target : e.target?.parentElement;
    return el && el.closest ? el.closest("[data-mg]") : null;
  }
  function mgUiOpen() {
    return root && !root.classList.contains("hidden");
  }
  document.addEventListener("click", (e) => {
    if (!mgUiOpen()) return;
    const t = mgClickTarget(e); if (!t) return;
    if (!root.contains(t)) return;
    const a = t.dataset.mg;
    if (a === "mute") { const m = MA.toggle(); t.textContent = m ? "🔇" : "🔊"; if (!m) MA.sfx("nav"); return; }
    if (["hub-create-view", "hub-join-view", "hub-rank-view", "hub-accounts-view", "hub-rank-admin-view", "hub-back", "create-go", "join-code", "joinroom", "pw-ok", "login-go", "pickgame", "switch-game"].includes(a)) MA.sfx("nav");
    if (a === "close") return close();
    if (a === "login-go") { doLogin(); return; }
    if (a === "logout") { doLogout(); return; }
    if (a === "hub-rank-view") { hubView = "rank"; renderHubInner(); requestRanking(); return; }
    if (a === "hub-accounts-view") { hubView = "accounts"; renderHubInner(); requestAccountList(); return; }
    if (a === "hub-rank-admin-view") { hubView = "rank-admin"; renderHubInner(); return; }
    if (a === "accounts-refresh") { requestAccountList(); return; }
    if (a === "rank-admin-login") {
      const pw = root.querySelector("#mgRankAdminPw")?.value || "";
      if (pw !== "yes33!") { T("관리자 비밀번호가 올바르지 않습니다.", "err"); return; }
      mgRankAdminAuthed = true;
      mgRankAdminPw = pw;
      requestAccountList();
      renderHubInner();
      return;
    }
    if (a === "rank-admin-logout") { mgRankAdminAuthed = false; mgRankAdminPw = ""; rankAdminSelectedUsers.clear(); renderHubInner(); return; }
    if (a === "rank-admin-refresh") { requestAccountList(); requestRanking(); return; }
    if (a === "rank-user-toggle") {
      const u = t.dataset.user;
      if (!u) return;
      if (rankAdminSelectedUsers.has(u)) rankAdminSelectedUsers.delete(u);
      else rankAdminSelectedUsers.add(u);
      renderHubInner();
      return;
    }
    if (a === "rank-clear-toggle") {
      const g = t.dataset.game;
      if (rankAdminSelected.has(g)) rankAdminSelected.delete(g);
      else rankAdminSelected.add(g);
      renderHubInner();
      return;
    }
    if (a === "rank-clear-selected") {
      if (!mgRankAdminAuthed || !mgRankAdminPw) return T("먼저 관리자 로그인을 하세요.", "err");
      if (!rankAdminSelected.size) return T("삭제할 게임을 선택하세요.", "err");
      const who = rankAdminSelectedUsers.size ? `${rankAdminSelectedUsers.size}명` : "전체 유저";
      if (!confirm(`선택한 ${rankAdminSelected.size}개 게임 기록을 ${who}에서 삭제할까요?`)) return;
      const payload = { t: "admin-clear-ranks", password: mgRankAdminPw, games: [...rankAdminSelected] };
      if (rankAdminSelectedUsers.size) payload.users = [...rankAdminSelectedUsers];
      send(payload);
      return;
    }
    if (a === "rank-clear-all") {
      if (!mgRankAdminAuthed || !mgRankAdminPw) return T("먼저 관리자 로그인을 하세요.", "err");
      if (!confirm("모든 미니게임 기록을 전부 삭제할까요?\n(기록이 없어진 계정은 목록에서 자동 제거됩니다)")) return;
      send({ t: "admin-clear-ranks", password: mgRankAdminPw, games: "all" });
      return;
    }
    if (a === "rank-tab") { rankTab = t.dataset.tab || "overall"; renderHubInner(); return; }
    if (a === "rank-refresh") { requestRanking(); return; }
    if (a === "leaveHub") {
      if (arcadeMode) { close(); return; }
      leave(); hubView = "menu"; renderHub(); return;
    }
    // 허브 네비게이션
    if (a === "hub-create-view") { hubView = "create"; renderHubInner(); return; }
    if (a === "hub-join-view") { hubView = "join"; renderHubInner(); return; }
    if (a === "hub-back") {
      if (hubView === "rank-admin") { mgRankAdminAuthed = false; mgRankAdminPw = ""; rankAdminSelectedUsers.clear(); }
      hubView = "menu"; renderHubInner(); return;
    }
    if (a === "pickgame") { createGame = t.dataset.game; renderHubInner(); return; }
    if (a === "switch-game") {
      if (!room || !me.isHost) return;
      const gt = t.dataset.game;
      if (!gt || gt === room.gameType) return;
      if (!ws || ws.readyState !== 1) { T("서버 연결이 끊어졌습니다.", "err"); return; }
      pendingGameType = gt;
      send({ t: "action", a: "setgame", gameType: gt });
      return;
    }
    if (a === "create-go") { doCreate(); return; }
    if (a === "refresh") { requestList(); return; }
    if (a === "joinroom") {
      const code = t.dataset.code;
      if (t.dataset.pw === "1") mgPromptPw(code); else { doJoin(code, ""); }
      return;
    }
    if (a === "join-code") {
      const code = (root.querySelector("#mgCode")?.value || "").trim().toUpperCase();
      if (code.length !== 4) return T("4자리 방 코드를 입력하세요.", "err");
      doJoin(code, (root.querySelector("#mgJoinPw")?.value || "").trim());
      return;
    }
    if (a === "pw-ok") { doJoin(t.dataset.code, root.querySelector("#mgPwIn")?.value || ""); closePrompt(); return; }
    if (a === "pw-cancel") { closePrompt(); return; }
    // 룰렛
    if (a === "r-apply") { const v = root.querySelector("#ropts").value.split("\n").map((s) => s.trim()).filter(Boolean); send({ t: "action", a: "set", options: v }); return; }
    if (a === "r-spin") { send({ t: "action", a: "spin" }); return; }
    // 사다리
    if (a === "l-make") {
      const names = root.querySelector("#lnames").value.split("\n").map((s) => s.trim()).filter(Boolean);
      const prizes = root.querySelector("#lprizes").value.split("\n").map((s) => s.trim()).filter(Boolean);
      ladderTrace = null; send({ t: "action", a: "set", names, prizes }); return;
    }
    // 제비
    if (a === "d-make") { const labels = root.querySelector("#dlabels").value.split("\n").map((s) => s.trim()).filter(Boolean); send({ t: "action", a: "set", labels }); return; }
    if (a === "d-reset") { send({ t: "action", a: "reset" }); return; }
    if (a === "d-draw") { send({ t: "action", a: "draw" }); return; }
    // 대기방 공용 (아레나·경찰과 도둑)
    if (a === "fs-exit") { exitGameView(); return; }
    if (a === "toggle-ready") { const meP = room.players.find((p) => p.id === me.id); MA.sfx("nav"); send({ t: "action", a: "ready", ready: !(meP && meP.ready) }); return; }
    if (a === "ctl-edit") { MA.sfx("nav"); openControlLayoutEditor(); return; }
    if (a === "go-start") {
      const tc = +(root.querySelector("#ateams")?.value || 2);
      send({ t: "action", a: "start", teamCount: tc });
      return;
    }
    // 아레나
    if (a === "a-stop") { send({ t: "action", a: "stop" }); leaveGameView(); return; }
    if (a === "a-team") { send({ t: "action", a: "team", team: +t.dataset.team }); return; }
    if (a === "a-iteminfo") { const el = root.querySelector("#aInfo"); if (el) el.classList.toggle("hidden"); return; }
    // 경찰과 도둑
    if (a === "c-stop") { send({ t: "action", a: "stop" }); leaveGameView(); return; }
    if (a === "k-stop") { send({ t: "action", a: "stop" }); leaveGameView(); return; }
  });

  // cops 설정 변경 (방장)
  function sendCopsSettings() {
    const mode = root.querySelector("#cMode")?.value || "relic";
    const teamMode = root.querySelector("#cTeamMode")?.value || "team";
    const show = (id, on) => { const el = root.querySelector(id); if (el) el.style.display = on ? "" : "none"; };
    show("#cBotsFld", mode !== "relic");
    show("#cPoliceFld", mode !== "mimic");
    show("#cRelicCountFld", mode === "relic");
    show("#cTeamModeFld", mode === "mimic");
    show("#cTeamsFld", mode === "mimic" && teamMode !== "solo");
    show("#cRelicTimeFld", mode === "relic");
    show("#cThiefVisFld", mode === "relic");
    show("#cPoliceVisFld", mode === "relic");
    show("#cThiefDashFld", mode === "relic");
    show("#cPoliceDashFld", mode === "relic");
    show("#cMapFld", mode === "relic");
    show("#cMapHint", mode === "relic");
    send({ t: "action", a: "set", mode,
      policeCount: +(root.querySelector("#cPolice")?.value || 1),
      botCount: +(root.querySelector("#cBots")?.value || 10),
      safeCount: +(root.querySelector("#cRelicCount")?.value || 4),
      relicTime: +(root.querySelector("#cRelicTime")?.value || 5),
      thiefVision: +(root.querySelector("#cThiefVis")?.value || 230),
      policeVision: +(root.querySelector("#cPoliceVis")?.value || 350),
      thiefDashCd: +(root.querySelector("#cThiefDash")?.value || 10),
      policeDashCd: +(root.querySelector("#cPoliceDash")?.value || 6),
      mapId: root.querySelector("#cMapSelect")?.value || "random",
      teamMode, teamsCount: +(root.querySelector("#cTeams")?.value || 2) });
  }
  root.addEventListener("change", (e) => {
    if (["cMode", "cPolice", "cBots", "cTeamMode", "cTeams", "cRelicTime", "cRelicCount", "cThiefVis", "cPoliceVis", "cThiefDash", "cPoliceDash", "cMapSelect"].includes(e.target.id)) {
      sendCopsSettings();
    }
  });
  root.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".stepper-btn");
    if (!btn || !me.isHost) return;
    const wrap = btn.closest(".stepper");
    if (!wrap) return;
    const input = wrap.querySelector("input");
    if (!input) return;
    const min = +(wrap.dataset.min || input.min || 0);
    const max = +(wrap.dataset.max || input.max || 999);
    const dir = +(btn.dataset.dir || 0);
    const next = Math.max(min, Math.min(max, (+input.value || 0) + dir));
    if (next === +input.value) return;
    input.value = String(next);
    sendCopsSettings();
  });

  function mapCanvasToWorld(cv, clientX, clientY) {
    const pg = room && room.game;
    const W = cv.width, H = cv.height;
    const wW = pg && pg.world ? pg.world.w : W, wH = pg && pg.world ? pg.world.h : H;
    const r = cv.getBoundingClientRect();
    const cx = (clientX - r.left) * (W / r.width);
    const cy = (clientY - r.top) * (H / r.height);
    const camX = W / 2 - wW / 2, camY = H / 2 - wH / 2;
    return { x: cx - camX, y: cy - camY };
  }
  function pushMapEdit(walls) {
    send({ t: "action", a: "mapedit", walls });
  }
  if (!root._mapEditBound) {
    root._mapEditBound = true;
    root.addEventListener("mousedown", (e) => {
      if (!mapEditMode || !room || room.game.started || room.game.mode !== "relic" || !me.isHost) return;
      const cv = e.target.closest && e.target.id === "ccanvas" ? e.target : null;
      if (!cv) return;
      if (e.button === 2) return;
      const p = mapCanvasToWorld(cv, e.clientX, e.clientY);
      mapEditDrag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      e.preventDefault();
    });
    root.addEventListener("mousemove", (e) => {
      if (!mapEditDrag) return;
      const cv = root.querySelector("#ccanvas"); if (!cv) return;
      const p = mapCanvasToWorld(cv, e.clientX, e.clientY);
      mapEditDrag.x1 = p.x; mapEditDrag.y1 = p.y;
      drawCops();
    });
    root.addEventListener("mouseup", (e) => {
      if (!mapEditDrag || !room) return;
      const d = mapEditDrag; mapEditDrag = null;
      const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
      let w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      if (w < 12 && h < 12) { w = 80; h = 16; }
      else if (w >= h) h = 16; else { h = 80; w = 16; }
      const walls = [...(room.game.walls || []), { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }];
      pushMapEdit(walls);
      drawCops();
    });
    root.addEventListener("contextmenu", (e) => {
      if (!mapEditMode || !room || room.game.started || !me.isHost) return;
      const cv = e.target.id === "ccanvas" ? e.target : null;
      if (!cv) return;
      e.preventDefault();
      const p = mapCanvasToWorld(cv, e.clientX, e.clientY);
      const walls = (room.game.walls || []).filter((w) => !(p.x >= w.x && p.x <= w.x + w.w && p.y >= w.y && p.y <= w.y + w.h));
      pushMapEdit(walls);
    });
  }

  // 사다리 canvas 탭 → 경로 추적
  root.addEventListener("click", (e) => {
    if (e.target.id !== "lcanvas" || !room || room.gameType !== "ladder" || !room.game.ready) return;
    const cv = e.target; const rect = cv.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (cv.width / rect.width);
    const n = room.game.cols, padX = 50, W = 600;
    const colX = (c) => padX + (c * (W - padX * 2)) / (n - 1 || 1);
    let best = 0, bd = 1e9;
    for (let c = 0; c < n; c++) { const d = Math.abs(colX(c) - x); if (d < bd) { bd = d; best = c; } }
    traceLadder(best);
  });

  // 로그인 입력에서 Enter → 입장
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.target && (e.target.id === "mgLoginName" || e.target.id === "mgLoginPw")) { e.preventDefault(); doLogin(); }
  });

  function escHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function escAttr(s) { return escHtml(s); }

  return { open, close, pushIncoming, send, getRoot: function () { return root; } };
  }
  return { create: createMG };
})();

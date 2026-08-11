(function (global) {
  "use strict";

  /**
   * 카드라이더 — 메시 P2P 분산 권위 레이스
   * 각 피어가 자기 카트 물리 담당 · 방장은 봇·페이즈·결과만 · 상태 fan-out은 전원 분산
   * 최대 8인 · 맵 3종 · 개인/팀전 · 레디→Go · 1등 후 10초
   */

  var MAX_PLAYERS = 8;
  var LAPS = 2;
  var FINISH_WINDOW = 10;
  var TICK_HZ = 20;
  var PHASE_HZ = 10;
  var COLORS = ["#ff4d6d", "#4dabf7", "#69db7c", "#ffd43b", "#da77f2", "#ff922b", "#22b8cf", "#f783ac"];

  /* 귀여운 오리지널 라이더 (선택 → 카트에 탑승) */
  var CHARACTERS = [
    { id: "kong", name: "콩이", emoji: "🟡", skin: 0xffe0b2, hair: 0xffd54f, hat: 0xffeb3b, suit: 0xffca28, accent: 0xff9800 },
    { id: "bbung", name: "뿡이", emoji: "🟠", skin: 0xffccbc, hair: 0xff7043, hat: 0xff5722, suit: 0xff8a65, accent: 0xe64a19 },
    { id: "titi", name: "띠띠", emoji: "🌸", skin: 0xffe0e8, hair: 0xf48fb1, hat: 0xf06292, suit: 0xf8bbd0, accent: 0xe91e63 },
    { id: "mung", name: "뭉치", emoji: "🔵", skin: 0xffe0b2, hair: 0x64b5f6, hat: 0x2196f3, suit: 0x90caf9, accent: 0x1565c0 },
    { id: "capi", name: "캡이", emoji: "🟢", skin: 0xffe0b2, hair: 0x81c784, hat: 0x43a047, suit: 0xa5d6a7, accent: 0x2e7d32 },
    { id: "byul", name: "별이", emoji: "💜", skin: 0xf3e5f5, hair: 0xce93d8, hat: 0xab47bc, suit: 0xe1bee7, accent: 0x8e24aa },
    { id: "toto", name: "토토", emoji: "🟤", skin: 0xffe0b2, hair: 0xa1887f, hat: 0x8d6e63, suit: 0xbcaaa4, accent: 0x5d4037 },
    { id: "snow", name: "뭉실", emoji: "❄️", skin: 0xfff8e1, hair: 0xb3e5fc, hat: 0x4fc3f7, suit: 0xe1f5fe, accent: 0x0288d1 }
  ];

  function getChar(id) {
    return CHARACTERS.find(function (c) { return c.id === id; }) || CHARACTERS[0];
  }

  var MAPS = [
    {
      id: "village",
      name: "빌리지 손가락",
      theme: {
        ground: 0x5cb85c, road: 0x5a6270, sky: 0x7ec8f0, curb: 0xff5a5a,
        accent: 0xffc857, rail: 0xffffff, fogFar: 200, style: "village"
      },
      laps: 2,
      pts: ptsVillage()
    },
    {
      id: "forest",
      name: "포레스트 목걸이",
      theme: {
        ground: 0x2d6a4f, road: 0x4a3728, sky: 0x8fd6a8, curb: 0xffd166,
        accent: 0x95d5b2, rail: 0xd8f3dc, fogFar: 190, style: "forest"
      },
      laps: 2,
      pts: ptsForest()
    },
    {
      id: "mine",
      name: "마인 지그재그",
      theme: {
        ground: 0x6c757d, road: 0x343a40, sky: 0xb8a9c9, curb: 0xff6b6b,
        accent: 0xffd60a, rail: 0xadb5bd, fogFar: 180, style: "mine"
      },
      laps: 3,
      pts: ptsMine()
    }
  ];

  function scalePts(arr, s) {
    return arr.map(function (p) { return { x: p.x * s, z: p.z * s }; });
  }

  function ptsVillage() {
    /* 빌리지: 넓은 타원 + 핑거 — 카메라 여유를 위해 스케일 업 */
    var a = [];
    var i, t;
    for (i = 0; i <= 48; i++) {
      t = (i / 48) * Math.PI * 2;
      a.push({
        x: Math.cos(t) * (58 + Math.sin(t * 2) * 5),
        z: Math.sin(t) * (42 + Math.cos(t * 3) * 4)
      });
    }
    for (i = 1; i < 14; i++) {
      t = i / 14;
      a.push({ x: 62 + t * 42, z: Math.sin(t * Math.PI) * 16 + Math.sin(t * 4) * 2 });
    }
    for (i = 1; i < 14; i++) {
      t = i / 14;
      a.push({ x: 104 - t * 42, z: -Math.sin(t * Math.PI) * 16 - Math.sin(t * 3) * 2 });
    }
    return scalePts(a, 1.25);
  }

  function ptsForest() {
    /* 포레스트: 넓은 물결 루프 */
    var a = [];
    var i, t;
    for (i = 0; i <= 72; i++) {
      t = (i / 72) * Math.PI * 2;
      a.push({
        x: Math.cos(t) * (56 + Math.sin(t * 3) * 11 + Math.sin(t * 5) * 3),
        z: Math.sin(t) * (52 + Math.cos(t * 2) * 10 + Math.cos(t * 4) * 2)
      });
    }
    return scalePts(a, 1.25);
  }

  function ptsMine() {
    /* 마인: 넓은 지그재그 오픈 코스 (터널 느낌 제거) */
    var a = [];
    var corners = [
      [-60, -48], [48, -50], [62, -30], [24, -18], [-22, -12], [-26, 4],
      [54, 10], [62, 32], [22, 48], [-56, 46], [-62, 20], [-46, -6], [-60, -48]
    ];
    for (var c = 0; c < corners.length - 1; c++) {
      var a0 = corners[c], a1 = corners[c + 1];
      var steps = 10;
      for (var s = 0; s < steps; s++) {
        var u = s / steps;
        var ease = u * u * (3 - 2 * u);
        a.push({
          x: a0[0] + (a1[0] - a0[0]) * ease,
          z: a0[1] + (a1[1] - a0[1]) * ease
        });
      }
    }
    return scalePts(a, 1.3);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(a, b) {
    var dx = a.x - b.x, dz = a.z - b.z;
    return dx * dx + dz * dz;
  }
  function uid() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function trackMeta(pts) {
    var segLen = [];
    var total = 0;
    var i;
    for (i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var len = Math.sqrt(dist2(a, b));
      segLen.push(len);
      total += len;
    }
    return { segLen: segLen, total: total, halfW: 11 };
  }

  function nearestOnTrack(pts, meta, x, z) {
    var best = { d: 1e12, seg: 0, t: 0, px: x, pz: z, prog: 0 };
    var acc = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var abx = b.x - a.x, abz = b.z - a.z;
      var apx = x - a.x, apz = z - a.z;
      var ab2 = abx * abx + abz * abz || 1;
      var t = clamp((apx * abx + apz * abz) / ab2, 0, 1);
      var px = a.x + abx * t, pz = a.z + abz * t;
      var d = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d < best.d) {
        best.d = d;
        best.seg = i;
        best.t = t;
        best.px = px;
        best.pz = pz;
        best.prog = acc + meta.segLen[i] * t;
      }
      acc += meta.segLen[i];
    }
    best.dist = Math.sqrt(best.d);
    return best;
  }

  function create(stageEl, api, intent) {
    if (!global.THREE) {
      stageEl.innerHTML = '<div class="kart-error">Three.js를 불러오지 못했습니다. 새로고침 해주세요.</div>';
      return { destroy: function () {} };
    }

    var THREE = global.THREE;
    var destroyed = false;
    var mode = "lobby"; /* lobby | room | race | result */
    var savedName = "";
    try { savedName = localStorage.getItem("gw-player-id") || ""; } catch (e) {}
    var me = {
      id: uid(),
      name: (intent && intent.name) || savedName || ("레이서" + Math.floor(Math.random() * 90 + 10)),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      charId: CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id,
      team: "A",
      ready: false
    };
    var room = {
      code: "",
      hostId: "",
      mapId: "village",
      mode: "solo", /* solo | team */
      players: [],
      isHost: false,
      isPublic: true,
      roomName: ""
    };
    var publicCode = null;
    var peer = null;
    var conns = {}; /* peerId -> reliable DataConnection */
    var fastConns = {}; /* peerId -> unreliable */
    var meshBusy = {};
    var netAcc = 0;
    var phaseAcc = 0;
    var remoteKartAt = {}; /* id -> last seq/time */
    var race = null;
    var raf = 0;
    var lastTs = 0;

    var root = document.createElement("div");
    root.className = "kart";
    root.innerHTML =
      '<div class="kart-lobby" id="kart-lobby"></div>' +
      '<div class="kart-room" id="kart-room" hidden></div>' +
      '<div class="kart-race" id="kart-race" hidden>' +
      '  <canvas id="kart-canvas"></canvas>' +
      '  <canvas id="kart-minimap" width="160" height="160"></canvas>' +
      '  <div class="kart-hud">' +
      '    <div class="kart-rank" id="kart-rank"></div>' +
      '    <div class="kart-center" id="kart-center"></div>' +
      '    <div class="kart-meters">' +
      '      <div class="kart-boost"><span>부스터</span><i id="kart-boostbar"></i></div>' +
      '      <div class="kart-lap" id="kart-lap">LAP 1/' + LAPS + "</div>" +
      '      <div class="kart-timer" id="kart-timer"></div>' +
      '      <button type="button" class="kart-cam-btn" id="kart-cam" title="시점 전환 (V)">3인칭</button>' +
      '    </div>' +
      '    <div class="kart-speedo" id="kart-speedo">' +
      '      <canvas id="kart-speedo-canvas" width="220" height="140"></canvas>' +
      '      <div class="kart-speedo__readout"><b id="kart-kmh">0</b><small>km/h</small></div>' +
      '      <div class="kart-speedo__drift"><i id="kart-driftbar"></i></div>' +
      "    </div>" +
      "  </div>" +
      '  <div class="kart-touch" id="kart-touch">' +
      '    <div class="kart-wheel" id="kart-wheel" aria-label="핸들">' +
      '      <div class="kart-wheel__rim" id="kart-wheel-rim">' +
      '        <span class="kart-wheel__spoke kart-wheel__spoke--h"></span>' +
      '        <span class="kart-wheel__spoke kart-wheel__spoke--v"></span>' +
      '        <span class="kart-wheel__hub"></span>' +
      '        <span class="kart-wheel__grip kart-wheel__grip--l">◀</span>' +
      '        <span class="kart-wheel__grip kart-wheel__grip--r">▶</span>' +
      '      </div>' +
      '    </div>' +
      '    <div class="kart-skills">' +
      '      <button type="button" class="kart-btn kart-btn--drift" id="kart-drift">드리프트</button>' +
      '      <button type="button" class="kart-btn kart-btn--boost" id="kart-boost">부스터</button>' +
      '    </div>' +
      "  </div>" +
      "</div>" +
      '<div class="kart-result" id="kart-result" hidden></div>';
    stageEl.appendChild(root);

    var els = {
      lobby: root.querySelector("#kart-lobby"),
      room: root.querySelector("#kart-room"),
      race: root.querySelector("#kart-race"),
      result: root.querySelector("#kart-result"),
      canvas: root.querySelector("#kart-canvas"),
      minimap: root.querySelector("#kart-minimap"),
      rank: root.querySelector("#kart-rank"),
      center: root.querySelector("#kart-center"),
      boostbar: root.querySelector("#kart-boostbar"),
      lap: root.querySelector("#kart-lap"),
      timer: root.querySelector("#kart-timer"),
      speedo: root.querySelector("#kart-speedo-canvas"),
      kmh: root.querySelector("#kart-kmh"),
      driftbar: root.querySelector("#kart-driftbar"),
      camBtn: root.querySelector("#kart-cam"),
      touch: root.querySelector("#kart-touch"),
      wheel: root.querySelector("#kart-wheel"),
      wheelRim: root.querySelector("#kart-wheel-rim"),
      driftBtn: root.querySelector("#kart-drift"),
      boostBtn: root.querySelector("#kart-boost"),
      skills: root.querySelector(".kart-skills")
    };

    var input = { steer: 0, throttle: 1, drift: false, boost: false };
    var keys = {};
    var camMode = "tp"; /* tp | fp */
    var sharedGeo = {};
    var sharedMat = {};
    var hudTick = 0;
    var physAcc = 0;
    var FX_POOL = [];
    var isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent || "");
    function geo(key, factory) {
      if (!sharedGeo[key]) sharedGeo[key] = factory();
      return sharedGeo[key];
    }
    function mat(key, factory) {
      if (!sharedMat[key]) sharedMat[key] = factory();
      return sharedMat[key];
    }
    function disposeShared() {
      Object.keys(sharedGeo).forEach(function (k) { sharedGeo[k].dispose && sharedGeo[k].dispose(); });
      Object.keys(sharedMat).forEach(function (k) { sharedMat[k].dispose && sharedMat[k].dispose(); });
      sharedGeo = {};
      sharedMat = {};
      FX_POOL = [];
    }

    function show(view) {
      mode = view;
      els.lobby.hidden = view !== "lobby";
      els.room.hidden = view !== "room";
      els.race.hidden = view !== "race";
      els.result.hidden = view !== "result";
    }

    function readLobbyForm() {
      var nameEl = els.lobby.querySelector("#kart-name");
      if (nameEl) me.name = nameEl.value.trim() || me.name;
      var picked = els.lobby.querySelector(".kart-char.is-on");
      if (picked) me.charId = picked.getAttribute("data-char") || me.charId;
      var ch = getChar(me.charId);
      me.color = COLORS[CHARACTERS.indexOf(ch) % COLORS.length] || me.color;
    }

    function renderLobby() {
      show("lobby");
      var charHtml = CHARACTERS.map(function (c) {
        return '<button type="button" class="kart-char' + (c.id === me.charId ? " is-on" : "") +
          '" data-char="' + c.id + '" title="' + c.name + '">' +
          '<span class="kart-char__face" style="--skin:#' + ("000000" + c.skin.toString(16)).slice(-6) +
          ";--hat:#" + ("000000" + c.hat.toString(16)).slice(-6) +
          ";--suit:#" + ("000000" + c.suit.toString(16)).slice(-6) + '">' + c.emoji + "</span>" +
          "<strong>" + c.name + "</strong></button>";
      }).join("");
      els.lobby.innerHTML =
        '<div class="kart-card kart-card--wide">' +
        "<h3>🏎️ 카드라이더</h3>" +
        "<p>귀여운 캐릭터를 고르고 카트에 타세요 · 최대 8인</p>" +
        '<label class="kart-field">닉네임<input id="kart-name" maxlength="12" value="' + me.name.replace(/"/g, "") + '"></label>' +
        '<p class="kart-char-label">캐릭터 선택</p>' +
        '<div class="kart-char-grid" id="kart-chars">' + charHtml + "</div>" +
        '<div class="kart-actions">' +
        '<button type="button" class="btn btn--primary" id="kart-create">방 만들기</button>' +
        '<button type="button" class="btn btn--ghost" id="kart-join-open">코드로 참가</button>' +
        '<button type="button" class="btn btn--ghost" id="kart-solo">혼자 연습</button>' +
        "</div>" +
        '<div class="kart-joinbox" id="kart-joinbox" hidden>' +
        '<label class="kart-field">방 코드<input id="kart-code" maxlength="16" placeholder="예: AB12CD"></label>' +
        '<button type="button" class="btn btn--primary" id="kart-join-go">참가</button>' +
        "</div>" +
        '<p class="kart-note">선택한 캐릭터가 레이스 중 카트에 탑승합니다.</p>' +
        "</div>";
      els.lobby.querySelectorAll(".kart-char").forEach(function (btn) {
        btn.onclick = function () {
          els.lobby.querySelectorAll(".kart-char").forEach(function (b) { b.classList.remove("is-on"); });
          btn.classList.add("is-on");
          me.charId = btn.getAttribute("data-char");
          var ch = getChar(me.charId);
          me.color = COLORS[CHARACTERS.indexOf(ch) % COLORS.length];
        };
      });
      els.lobby.querySelector("#kart-create").onclick = function () {
        readLobbyForm();
        createRoom(false);
      };
      els.lobby.querySelector("#kart-solo").onclick = function () {
        readLobbyForm();
        createRoom(true);
      };
      els.lobby.querySelector("#kart-join-open").onclick = function () {
        els.lobby.querySelector("#kart-joinbox").hidden = false;
      };
      els.lobby.querySelector("#kart-join-go").onclick = function () {
        readLobbyForm();
        joinRoom((els.lobby.querySelector("#kart-code").value || "").trim().toUpperCase());
      };
    }

    function renderRoom() {
      show("room");
      var mapOpts = MAPS.map(function (m) {
        return '<option value="' + m.id + '"' + (room.mapId === m.id ? " selected" : "") + ">" + m.name + "</option>";
      }).join("");
      var list = room.players.map(function (p) {
        var ch = getChar(p.charId);
        return '<li class="kart-plist__item" style="--c:' + p.color + '">' +
          '<span class="kart-char-mini">' + ch.emoji + "</span>" +
          "<b>" + esc(p.name) + "</b> <small>" + ch.name + "</small>" +
          (p.id === room.hostId ? " <em>방장</em>" : "") +
          (room.mode === "team" ? " <small>팀" + p.team + "</small>" : "") +
          (p.ready ? ' <span class="kart-ready">READY</span>' : ' <span class="kart-wait">…</span>') +
          "</li>";
      }).join("");
      var allReady = room.players.length > 0 && room.players.every(function (p) { return p.ready; });
      els.room.innerHTML =
        '<div class="kart-card kart-card--wide">' +
        "<h3>방 " + room.code + "</h3>" +
        "<p>" + room.players.length + "/" + MAX_PLAYERS + "명 · " + (room.mode === "team" ? "팀전" : "개인전") + "</p>" +
        (room.isHost
          ? '<div class="kart-settings">' +
            '<label>맵<select id="kart-map">' + mapOpts + "</select></label>" +
            '<label>모드<select id="kart-mode"><option value="solo"' + (room.mode === "solo" ? " selected" : "") +
            ">개인전</option><option value=\"team\"" + (room.mode === "team" ? " selected" : "") + ">팀전</option></select></label>" +
            "</div>"
          : "<p>맵: <b>" + mapName(room.mapId) + "</b></p>") +
        '<ul class="kart-plist">' + list + "</ul>" +
        (room.mode === "team"
          ? '<div class="kart-team-pick"><button type="button" data-team="A" class="btn btn--ghost">팀 A</button>' +
            '<button type="button" data-team="B" class="btn btn--ghost">팀 B</button></div>'
          : "") +
        '<div class="kart-actions">' +
        '<button type="button" class="btn btn--ghost" id="kart-ctl-edit">조작 배치</button>' +
        '<button type="button" class="btn btn--ghost" id="kart-ready">' + (me.ready ? "레디 취소" : "레디") + "</button>" +
        (room.isHost
          ? '<button type="button" class="btn btn--primary" id="kart-go"' + (!allReady ? " disabled" : "") + ">GO!</button>"
          : "<p class=\"kart-note\">방장이 GO를 누를 때까지 대기</p>") +
        '<button type="button" class="btn btn--ghost" id="kart-leave">나가기</button>' +
        "</div></div>";

      if (room.isHost) {
        var mapEl = els.room.querySelector("#kart-map");
        var modeEl = els.room.querySelector("#kart-mode");
        if (mapEl) mapEl.onchange = function () {
          room.mapId = mapEl.value;
          broadcast({ type: "room", room: publicRoom() });
          renderRoom();
        };
        if (modeEl) modeEl.onchange = function () {
          room.mode = modeEl.value;
          broadcast({ type: "room", room: publicRoom() });
          renderRoom();
        };
        var go = els.room.querySelector("#kart-go");
        if (go) go.onclick = hostStartRace;
      }
      els.room.querySelector("#kart-ready").onclick = function () {
        me.ready = !me.ready;
        upsertMe();
        syncPlayer();
        renderRoom();
      };
      var ctlEditBtn = els.room.querySelector("#kart-ctl-edit");
      if (ctlEditBtn) ctlEditBtn.onclick = openKartControlEditor;
      els.room.querySelectorAll("[data-team]").forEach(function (btn) {
        btn.onclick = function () {
          me.team = btn.getAttribute("data-team");
          upsertMe();
          syncPlayer();
          renderRoom();
        };
      });
      els.room.querySelector("#kart-leave").onclick = leaveRoom;
    }

    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
      });
    }
    function mapName(id) {
      var m = MAPS.find(function (x) { return x.id === id; });
      return m ? m.name : id;
    }
    function publicRoom() {
      return {
        code: room.code,
        hostId: room.hostId,
        mapId: room.mapId,
        mode: room.mode,
        players: room.players
      };
    }
    function upsertMe() {
      var p = room.players.find(function (x) { return x.id === me.id; });
      if (!p) {
        room.players.push({
          id: me.id, name: me.name, color: me.color, charId: me.charId,
          team: me.team, ready: me.ready, peerId: me.peerId || ""
        });
      } else {
        p.name = me.name;
        p.color = me.color;
        p.charId = me.charId;
        p.team = me.team;
        p.ready = me.ready;
        p.peerId = me.peerId || p.peerId;
      }
    }
    function syncPlayer() {
      if (room.isHost) broadcast({ type: "room", room: publicRoom() });
      else sendToHost({ type: "player", player: {
        id: me.id, name: me.name, color: me.color, charId: me.charId,
        team: me.team, ready: me.ready, peerId: me.peerId
      }});
    }

    function ensurePeer(cb) {
      if (!global.Peer) {
        alert("PeerJS를 불러오지 못했습니다. 온라인 상태를 확인하세요.\n혼자 연습은 가능합니다.");
        cb(new Error("no peerjs"));
        return;
      }
      if (peer && !peer.destroyed) { cb(null, peer); return; }
      peer = new global.Peer(undefined, { debug: 0 });
      peer.on("open", function (id) {
        me.peerId = id;
        cb(null, peer);
      });
      peer.on("error", function (err) {
        console.warn("Peer error", err);
        cb(err);
      });
      peer.on("connection", function (conn) {
        acceptConn(conn);
      });
    }

    function safeSend(conn, msg) {
      if (!conn || !conn.open) return;
      try { conn.send(msg); } catch (e) {}
    }

    function acceptConn(conn) {
      conn.on("open", function () {
        var label = conn.label || "";
        if (label === "fast" || conn.reliable === false) {
          fastConns[conn.peer] = conn;
          conn.on("data", function (msg) { onNet(msg, conn); });
          conn.on("close", function () { delete fastConns[conn.peer]; onPeerGone(conn.peer); });
        } else {
          wireConn(conn);
          openFastLink(conn.peer);
        }
      });
    }

    function openFastLink(pid) {
      if (!peer || !pid || pid === me.peerId || fastConns[pid] || meshBusy[pid + ":f"]) return;
      meshBusy[pid + ":f"] = true;
      var c = peer.connect(pid, { reliable: false, label: "fast", serialization: "json" });
      c.on("open", function () {
        delete meshBusy[pid + ":f"];
        fastConns[pid] = c;
        c.on("data", function (msg) { onNet(msg, c); });
        c.on("close", function () { delete fastConns[pid]; });
      });
      c.on("error", function () { delete meshBusy[pid + ":f"]; });
    }

    function openMeshLink(pid) {
      if (!peer || !pid || pid === me.peerId || conns[pid] || meshBusy[pid + ":r"]) return;
      meshBusy[pid + ":r"] = true;
      var c = peer.connect(pid, { reliable: true, label: "ctrl", serialization: "json" });
      c.on("open", function () {
        delete meshBusy[pid + ":r"];
        wireConn(c);
        openFastLink(pid);
      });
      c.on("error", function () { delete meshBusy[pid + ":r"]; });
    }

    function ensureMeshFromRoom() {
      (room.players || []).forEach(function (p) {
        if (p.peerId && p.peerId !== me.peerId && p.peerId !== "local") {
          openMeshLink(p.peerId);
          openFastLink(p.peerId);
        }
      });
    }

    function wireConn(conn) {
      conns[conn.peer] = conn;
      conn.on("data", function (msg) { onNet(msg, conn); });
      conn.on("close", function () {
        delete conns[conn.peer];
        onPeerGone(conn.peer);
      });
    }

    function onPeerGone(peerId) {
      if (room.isHost) {
        room.players = room.players.filter(function (p) { return p.peerId !== peerId; });
        broadcastReliable({ type: "room", room: publicRoom() });
        if (mode === "room") renderRoom();
        return;
      }
      /* 방장 연결이 끊기면 남은 피어 중 peerId 정렬 1위가 승계 */
      var hostPl = room.players.find(function (p) { return p.id === room.hostId; });
      if (hostPl && hostPl.peerId === peerId) {
        tryPromoteHost();
      }
    }

    function tryPromoteHost() {
      var candidates = (room.players || [])
        .filter(function (p) { return p.peerId && p.peerId !== "local"; })
        .slice()
        .sort(function (a, b) { return String(a.peerId).localeCompare(String(b.peerId)); });
      if (!candidates.length) return;
      var next = candidates[0];
      if (next.id !== me.id) return;
      room.isHost = true;
      room.hostId = me.id;
      broadcastReliable({ type: "host", hostId: me.id, room: publicRoom() });
      if (mode === "room") renderRoom();
    }

    function announcePublic() {
      if (!room.isPublic || !room.isHost || !room.code || room.code === "SOLO") return;
      if (!global.GWPublicRooms) return;
      publicCode = room.code;
      GWPublicRooms.announce({
        code: room.code,
        game: "kart",
        name: room.roomName || (me.name + "의 레이스"),
        host: me.name,
        players: room.players.length,
        max: MAX_PLAYERS,
        started: mode === "race"
      });
    }
    function clearPublic() {
      if (publicCode && global.GWPublicRooms) {
        try { GWPublicRooms.unannounce(publicCode); } catch (e) {}
      }
      publicCode = null;
    }
    function refreshPublic() {
      if (!publicCode || !global.GWPublicRooms) return;
      GWPublicRooms.update(publicCode, {
        players: room.players.length,
        started: mode === "race"
      });
    }

    function peerIds() {
      var set = {};
      Object.keys(conns).forEach(function (k) { set[k] = true; });
      Object.keys(fastConns).forEach(function (k) { set[k] = true; });
      return Object.keys(set);
    }

    function sendToPeer(pid, msg, useFast) {
      if (useFast && fastConns[pid] && fastConns[pid].open) {
        safeSend(fastConns[pid], msg);
        return;
      }
      if (conns[pid] && conns[pid].open) safeSend(conns[pid], msg);
      else if (fastConns[pid] && fastConns[pid].open) safeSend(fastConns[pid], msg);
    }

    function broadcastReliable(msg) {
      peerIds().forEach(function (k) { sendToPeer(k, msg, false); });
    }

    function broadcastFast(msg) {
      var ids = peerIds();
      if (room.isHost && ids.length > 2) {
        var relayN = Math.min(ids.length, Math.max(2, Math.ceil(Math.sqrt(ids.length))));
        var relays = ids.slice(0, relayN);
        var rest = ids.slice(relayN);
        var chunk = Math.ceil(rest.length / Math.max(1, relays.length));
        relays.forEach(function (rid, i) {
          var slice = rest.slice(i * chunk, (i + 1) * chunk);
          sendToPeer(rid, msg, true);
          if (slice.length) {
            sendToPeer(rid, { type: "_fwd", to: slice, payload: msg }, true);
          }
        });
        return;
      }
      ids.forEach(function (k) { sendToPeer(k, msg, true); });
    }

    function broadcast(msg) { broadcastReliable(msg); }

    function sendToHost(msg) {
      var hostPl = room.players.find(function (p) { return p.id === room.hostId; });
      var hostPid = (hostPl && hostPl.peerId) || Object.keys(conns)[0];
      if (hostPid) sendToPeer(hostPid, msg, false);
    }

    function sendAll(msg) {
      broadcastMeshKart(msg);
    }

    function broadcastMeshKart(msg) {
      peerIds().forEach(function (k) { sendToPeer(k, msg, true); });
    }

    function onNet(msg, conn) {
      if (!msg || !msg.type) return;
      if (msg.type === "_fwd" && msg.payload) {
        (msg.to || []).forEach(function (tid) { sendToPeer(tid, msg.payload, true); });
        onNet(msg.payload, conn);
        return;
      }
      if (msg.type === "hello" && room.isHost) {
        if (room.players.length >= MAX_PLAYERS) {
          safeSend(conn, { type: "full" });
          return;
        }
        var pl = msg.player;
        pl.peerId = conn.peer;
        pl.ready = false;
        if (!room.players.some(function (p) { return p.id === pl.id; })) room.players.push(pl);
        safeSend(conn, { type: "welcome", youId: pl.id, room: publicRoom() });
        broadcastReliable({ type: "room", room: publicRoom() });
        ensureMeshFromRoom();
        refreshPublic();
        renderRoom();
      } else if (msg.type === "welcome") {
        me.id = msg.youId || me.id;
        applyRoom(msg.room);
        ensureMeshFromRoom();
        renderRoom();
      } else if (msg.type === "room") {
        applyRoom(msg.room);
        ensureMeshFromRoom();
        if (mode === "room") renderRoom();
      } else if (msg.type === "host") {
        applyRoom(msg.room || room);
        room.hostId = msg.hostId;
        room.isHost = room.hostId === me.id;
        if (mode === "room") renderRoom();
      } else if (msg.type === "player" && room.isHost) {
        var idx = room.players.findIndex(function (p) { return p.id === msg.player.id; });
        if (idx >= 0) room.players[idx] = Object.assign(room.players[idx], msg.player, { peerId: conn.peer });
        broadcastReliable({ type: "room", room: publicRoom() });
        renderRoom();
      } else if (msg.type === "start") {
        beginRace(msg.seed, msg.mapId, msg.mode, msg.players);
      } else if (msg.type === "kart" && race) {
        applyPeerKart(msg);
      } else if (msg.type === "phase" && race && !room.isHost) {
        applyPhase(msg);
      } else if (msg.type === "finish") {
        if (!room.isHost || msg.fromHost) showResults(msg.results, msg.teamScore);
      } else if (msg.type === "finished-claim" && room.isHost && race) {
        applyFinishClaim(msg);
      } else if (msg.type === "full") {
        alert("방이 가득 찼습니다.");
        leaveRoom();
      }
    }

    function applyRoom(r) {
      if (!r) return;
      room.code = r.code || room.code;
      room.hostId = r.hostId || room.hostId;
      room.mapId = r.mapId || room.mapId;
      room.mode = r.mode || room.mode;
      room.players = r.players || room.players || [];
      room.isHost = room.hostId === me.id;
      var self = room.players.find(function (p) { return p.id === me.id; });
      if (self) {
        me.ready = !!self.ready;
        me.team = self.team || me.team;
        me.color = self.color || me.color;
        me.charId = self.charId || me.charId;
      }
    }

    function joinRoom(code) {
      if (!code) { alert("방 코드를 입력하세요."); return; }
      room.isHost = false;
      room.code = code.replace(/^KR/i, "").toUpperCase();
      ensurePeer(function (err) {
        if (err) { alert("연결에 실패했습니다."); return; }
        var hostPeerId = "KR" + room.code;
        var conn = peer.connect(hostPeerId, { reliable: true, label: "ctrl", serialization: "json" });
        conn.on("open", function () {
          wireConn(conn);
          openFastLink(hostPeerId);
          safeSend(conn, { type: "hello", player: {
            id: me.id, name: me.name, color: me.color, charId: me.charId, team: me.team, ready: false
          }});
        });
        conn.on("error", function () {
          alert("방을 찾을 수 없습니다. 코드/방장 접속을 확인하세요.");
        });
        show("room");
        els.room.innerHTML = '<div class="kart-card"><p>방 ' + room.code + " 접속 중…</p></div>";
      });
    }

    function createRoom(soloPractice) {
      room.isHost = true;
      room.hostId = me.id;
      room.players = [];
      me.ready = !!soloPractice;
      upsertMe();
      if (soloPractice) {
        room.code = "SOLO";
        me.peerId = "local";
        renderRoom();
        return;
      }
      if (peer) { try { peer.destroy(); } catch (e) {} peer = null; conns = {}; fastConns = {}; }
      if (!global.Peer) {
        room.code = uid();
        me.peerId = "local";
        alert("PeerJS 없음 — 로컬 방만 가능합니다. 혼자 플레이하거나 CDN을 확인하세요.");
        renderRoom();
        return;
      }
      room.code = uid();
      var hostPeerId = "KR" + room.code;
      peer = new global.Peer(hostPeerId, { debug: 0 });
      peer.on("open", function (id) {
        me.peerId = id;
        room.players[0].peerId = id;
        announcePublic();
        renderRoom();
      });
      peer.on("error", function (err) {
        console.warn(err);
        if (String(err && err.type) === "unavailable-id") {
          room.code = uid();
          createRoom(false);
          return;
        }
        alert("방 생성 실패: " + (err.message || err.type || err));
        renderLobby();
      });
      peer.on("connection", function (conn) { acceptConn(conn); });
    }

    function leaveRoom() {
      clearPublic();
      Object.keys(conns).forEach(function (k) { try { conns[k].close(); } catch (e) {} });
      Object.keys(fastConns).forEach(function (k) { try { fastConns[k].close(); } catch (e) {} });
      conns = {};
      fastConns = {};
      if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
      me.ready = false;
      room.players = [];
      destroyRace();
      if (!destroyed) renderLobby();
    }

    function hostStartRace() {
      if (!room.isHost) return;
      if (!room.players.every(function (p) { return p.ready; })) return;
      var seed = Date.now() % 100000;
      var payload = {
        type: "start",
        seed: seed,
        mapId: room.mapId,
        mode: room.mode,
        players: room.players
      };
      broadcastReliable(payload);
      beginRace(seed, room.mapId, room.mode, room.players);
    }

    /* ========== RACE ========== */
    function beginRace(seed, mapId, raceMode, players) {
      destroyRace();
      mode = "race";
      refreshPublic();
      var map = MAPS.find(function (m) { return m.id === mapId; }) || MAPS[0];
      var meta = trackMeta(map.pts);
      var karts = {};
      players.forEach(function (p, i) {
        var start = map.pts[0];
        var n = map.pts[1];
        var ang = Math.atan2(n.z - start.z, n.x - start.x);
        var lateral = (i - (players.length - 1) / 2) * 2.2;
        karts[p.id] = {
          id: p.id,
          name: p.name,
          color: p.color,
          charId: p.charId || CHARACTERS[i % CHARACTERS.length].id,
          team: p.team,
          x: start.x + Math.cos(ang + Math.PI / 2) * lateral,
          z: start.z + Math.sin(ang + Math.PI / 2) * lateral,
          y: 0.4,
          yaw: ang,
          vx: 0,
          vz: 0,
          speed: 0,
          displayKmh: 0,
          boost: 0.45,
          driftGauge: 0,
          drifting: false,
          stun: 0,
          slip: 0,
          wheelSpin: 0,
          bounceY: 0,
          progress: 0,
          lap: 1,
          laps: map.laps || LAPS,
          finished: false,
          finishTime: 0,
          place: 0,
          input: p.id === me.id ? input : { steer: 0, throttle: 1, drift: false, boost: false },
          isBot: !!p.isBot,
          mesh: null
        };
      });

      race = {
        map: map,
        meta: meta,
        mode: raceMode,
        karts: karts,
        t: 0,
        phase: "countdown", /* countdown | running | finishing | done */
        countdown: 3.2,
        finishTimer: FINISH_WINDOW,
        firstFinished: false,
        results: [],
        scene: null,
        camera: null,
        renderer: null,
        trackLine: map.pts.slice(),
        sim: null,
        obstacles: [],
        fx: []
      };

      show("race");
      setupRenderer();
      buildTrack();
      bindInput();
      fitKartControls();
      if (!root._kartCtlResize) {
        root._kartCtlResize = true;
        window.addEventListener("resize", fitKartControls);
        if (global.visualViewport) global.visualViewport.addEventListener("resize", fitKartControls);
      }
      /* 카메라·메시를 즉시 정렬해 캐릭터 탑승이 첫 프레임부터 보이게 */
      Object.keys(race.karts).forEach(function (id) {
        syncKartMesh(race.karts[id], race.karts[id].input || input, 0.016);
      });
      var myKart = race.karts[me.id];
      if (myKart && race.camera) updateCamera(myKart, 1);
      lastTs = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
      api.setScore(0);
    }

    function setupRenderer() {
      var w = els.race.clientWidth || 800;
      var h = Math.max(360, els.race.clientHeight || 480);
      var dpr = Math.min(isMobile ? 1.35 : 1.85, global.devicePixelRatio || 1);
      var renderer = new THREE.WebGLRenderer({
        canvas: els.canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        stencil: false,
        depth: true
      });
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      renderer.setClearColor(race.map.theme.sky, 1);
      var scene = new THREE.Scene();
      scene.fog = new THREE.Fog(race.map.theme.sky, 70, race.map.theme.fogFar || 200);
      var camera = new THREE.PerspectiveCamera(58, w / h, 0.4, 420);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7c6b, 1.05));
      var dir = new THREE.DirectionalLight(0xfff4e0, 0.95);
      dir.position.set(45, 70, 30);
      scene.add(dir);
      var fill = new THREE.DirectionalLight(0xa0c4ff, 0.28);
      fill.position.set(-30, 20, -40);
      scene.add(fill);
      race.renderer = renderer;
      race.scene = scene;
      race.camera = camera;
      race._viewW = w;
      race._viewH = h;
      if (els.camBtn) {
        els.camBtn.textContent = camMode === "fp" ? "1인칭" : "3인칭";
        els.camBtn.onclick = toggleCamMode;
      }
    }

    function toggleCamMode() {
      camMode = camMode === "tp" ? "fp" : "tp";
      if (els.camBtn) els.camBtn.textContent = camMode === "fp" ? "1인칭" : "3인칭";
      var my = race && race.karts[me.id];
      if (my) applyCamVisibility(my);
    }

    function applyCamVisibility(k) {
      if (!k || !k.mesh) return;
      var fpSelf = camMode === "fp" && k.id === me.id;
      k.mesh.visible = true;
      if (k.mesh.userData.rider) k.mesh.userData.rider.visible = !fpSelf;
    }

    function canvasTex(draw, repeatU, repeatV, key) {
      if (sharedMat[key]) return sharedMat[key];
      var c = document.createElement("canvas");
      c.width = 128;
      c.height = 128;
      draw(c.getContext("2d"), c);
      var tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatU || 1, repeatV || 1);
      var maxA = 1;
      try {
        maxA = Math.min(4, (race.renderer && race.renderer.capabilities.getMaxAnisotropy()) || 1);
      } catch (e) {}
      tex.anisotropy = maxA;
      var m = new THREE.MeshLambertMaterial({ map: tex });
      sharedMat[key] = m;
      return m;
    }

    function roadTexture(theme) {
      return canvasTex(function (g) {
        g.fillStyle = "#" + ("000000" + theme.road.toString(16)).slice(-6);
        g.fillRect(0, 0, 128, 128);
        g.fillStyle = "rgba(255,255,255,0.22)";
        g.fillRect(58, 0, 12, 128);
        g.fillStyle = "rgba(255,220,80,0.85)";
        g.fillRect(8, 0, 6, 128);
        g.fillRect(114, 0, 6, 128);
        g.fillStyle = "rgba(0,0,0,0.12)";
        for (var y = 0; y < 128; y += 10) g.fillRect(0, y, 128, 3);
      }, 1.2, 36, "road-" + theme.road);
    }

    function groundTexture(theme) {
      return canvasTex(function (g) {
        g.fillStyle = "#" + ("000000" + theme.ground.toString(16)).slice(-6);
        g.fillRect(0, 0, 128, 128);
        for (var i = 0; i < 90; i++) {
          g.fillStyle = "rgba(255,255,255," + (0.03 + Math.random() * 0.07) + ")";
          g.beginPath();
          g.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2.2, 0, Math.PI * 2);
          g.fill();
        }
        if (theme.style === "village") {
          g.fillStyle = "rgba(120,200,80,0.28)";
          for (var j = 0; j < 50; j++) g.fillRect(Math.random() * 128, Math.random() * 128, 3, 6);
        } else if (theme.style === "forest") {
          g.fillStyle = "rgba(20,60,30,0.35)";
          for (var k = 0; k < 40; k++) g.fillRect(Math.random() * 128, Math.random() * 128, 4, 4);
        } else {
          g.fillStyle = "rgba(40,40,50,0.3)";
          for (var m = 0; m < 35; m++) g.fillRect(Math.random() * 128, Math.random() * 128, 5, 2);
        }
      }, 24, 24, "ground-" + theme.ground);
    }

    function makeRibbonGeo(curve, halfW, y, segs, closed) {
      var pos = [];
      var uvs = [];
      var idx = [];
      var n = segs;
      for (var i = 0; i <= n; i++) {
        var u = i / n;
        var p = curve.getPointAt(closed ? (u % 1) : u);
        var t = curve.getTangentAt(closed ? (u % 1) : Math.min(0.999, u));
        var nx = -t.z, nz = t.x;
        var len = Math.sqrt(nx * nx + nz * nz) || 1;
        nx /= len;
        nz /= len;
        pos.push(p.x + nx * halfW, y, p.z + nz * halfW);
        pos.push(p.x - nx * halfW, y, p.z - nz * halfW);
        uvs.push(0, u * 20);
        uvs.push(1, u * 20);
      }
      for (var s = 0; s < n; s++) {
        var a = s * 2, b = a + 1, c = a + 2, d = a + 3;
        /* CCW from above so normals face +Y */
        idx.push(a, c, b, b, c, d);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }

    function buildTrack() {
      var pts = race.map.pts;
      var theme = race.map.theme;
      var segs = isMobile ? Math.max(80, pts.length * 3) : Math.max(140, pts.length * 5);
      var halfW = race.meta.halfW;

      var skyMat = canvasTex(function (g, c) {
        var grd = g.createLinearGradient(0, 0, 0, c.height);
        var top = "#" + ("000000" + theme.sky.toString(16)).slice(-6);
        grd.addColorStop(0, top);
        grd.addColorStop(0.55, top);
        grd.addColorStop(1, "#ffffff");
        g.fillStyle = grd;
        g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = "rgba(255,255,255,0.55)";
        for (var i = 0; i < 10; i++) {
          var cx = (i * 37) % 120 + 4;
          var cy = 20 + (i % 4) * 12;
          g.beginPath();
          g.ellipse(cx, cy, 16 + (i % 3) * 4, 7, 0, 0, Math.PI * 2);
          g.fill();
        }
      }, 1, 1, "skygrad-" + theme.sky);
      skyMat.side = THREE.BackSide;
      skyMat.fog = false;
      var sky = new THREE.Mesh(geo("sky", function () { return new THREE.SphereGeometry(320, 28, 18); }), skyMat);
      race.scene.add(sky);

      var ground = new THREE.Mesh(
        geo("ground", function () { return new THREE.CircleGeometry(300, 64); }),
        groundTexture(theme)
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.2;
      race.scene.add(ground);

      var shape = [];
      for (var i = 0; i < pts.length; i++) shape.push(new THREE.Vector3(pts[i].x, 0, pts[i].z));
      shape.push(shape[0].clone());
      var curve = new THREE.CatmullRomCurve3(shape, true, "catmullrom", 0.08);
      race._curve = curve;

      /* flat asphalt — raised slightly so kart never sinks into ground */
      var roadY = 0.02;
      var roadGeo = makeRibbonGeo(curve, halfW, roadY, segs, true);
      sharedGeo.road = roadGeo;
      var roadMat = canvasTex(function (g) {
        g.fillStyle = "#" + ("000000" + theme.road.toString(16)).slice(-6);
        g.fillRect(0, 0, 128, 128);
        g.fillStyle = "rgba(255,255,255,0.28)";
        g.fillRect(56, 0, 16, 128);
        g.fillStyle = "rgba(255,220,80,0.9)";
        g.fillRect(4, 0, 8, 128);
        g.fillRect(116, 0, 8, 128);
        g.fillStyle = "rgba(0,0,0,0.14)";
        for (var y = 0; y < 128; y += 12) g.fillRect(0, y, 128, 3);
      }, 1, 1, "roadflat-" + theme.road);
      roadMat.polygonOffset = true;
      roadMat.polygonOffsetFactor = -1;
      roadMat.polygonOffsetUnits = -1;
      race.scene.add(new THREE.Mesh(roadGeo, roadMat));

      /* low candy curbs only — no tall corridor walls that hide the chase cam */
      var curbMat = canvasTex(function (g) {
        for (var x = 0; x < 128; x += 16) {
          g.fillStyle = x % 32 === 0 ? "#ff4d4f" : "#ffffff";
          g.fillRect(x, 0, 16, 128);
        }
      }, 10, 1, "curbstripe");
      var edgeStep = isMobile ? 5 : 4;
      var postMat = mat("post-" + theme.accent, function () {
        return new THREE.MeshLambertMaterial({ color: theme.accent });
      });
      var stripeGeo = geo("edgestripe", function () { return new THREE.BoxGeometry(0.65, 0.14, 1.6); });
      var postGeo = geo("edgepost", function () { return new THREE.CylinderGeometry(0.12, 0.14, 0.55, 6); });
      for (var e = 0; e < segs; e += edgeStep) {
        var u = e / segs;
        var p = curve.getPointAt(u);
        var t = curve.getTangentAt(u);
        var nx = -t.z, nz = t.x;
        var len = Math.sqrt(nx * nx + nz * nz) || 1;
        nx /= len;
        nz /= len;
        var yaw = Math.atan2(t.x, t.z);
        for (var side = -1; side <= 1; side += 2) {
          var ex = p.x + nx * side * (halfW + 0.45);
          var ez = p.z + nz * side * (halfW + 0.45);
          var stripe = new THREE.Mesh(stripeGeo, curbMat);
          stripe.position.set(ex, roadY + 0.14, ez);
          stripe.rotation.y = yaw;
          race.scene.add(stripe);
          if (e % (edgeStep * 3) === 0) {
            var post = new THREE.Mesh(postGeo, postMat);
            post.position.set(p.x + nx * side * (halfW + 1.4), roadY + 0.35, p.z + nz * side * (halfW + 1.4));
            race.scene.add(post);
          }
        }
      }

      var s0 = pts[0], s1 = pts[1];
      var ang = Math.atan2(s1.z - s0.z, s1.x - s0.x);
      var checkMat = canvasTex(function (g) {
        for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
          g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
          g.fillRect(x * 16, y * 16, 16, 16);
        }
      }, 2, 1, "checker");
      var start = new THREE.Mesh(
        geo("start", function () { return new THREE.BoxGeometry(halfW * 2.1, 0.08, 1.7); }),
        checkMat
      );
      start.position.set(s0.x, 0.1, s0.z);
      start.rotation.y = -ang;
      race.scene.add(start);

      var archMat = mat("arch-" + theme.accent, function () {
        return new THREE.MeshLambertMaterial({ color: theme.accent });
      });
      var bannerMat = mat("banner", function () {
        return new THREE.MeshLambertMaterial({ color: 0xff6b6b });
      });
      var postL = new THREE.Mesh(geo("archp", function () { return new THREE.BoxGeometry(0.4, 3.6, 0.4); }), archMat);
      var postR = postL.clone();
      var beam = new THREE.Mesh(geo("archb", function () { return new THREE.BoxGeometry(halfW * 2.5, 0.4, 0.4); }), archMat);
      var banner = new THREE.Mesh(geo("banner", function () { return new THREE.BoxGeometry(halfW * 2.2, 0.7, 0.08); }), bannerMat);
      var gate = new THREE.Group();
      postL.position.set(-halfW - 0.25, 1.8, 0);
      postR.position.set(halfW + 0.25, 1.8, 0);
      beam.position.set(0, 3.45, 0);
      banner.position.set(0, 2.9, 0.05);
      gate.add(postL);
      gate.add(postR);
      gate.add(beam);
      gate.add(banner);
      gate.position.set(s0.x, 0, s0.z);
      gate.rotation.y = -ang;
      race.scene.add(gate);

      placeTrackProps(curve, theme);
      placeScenery(curve, theme);

      Object.keys(race.karts).forEach(function (id) {
        var k = race.karts[id];
        k.mesh = makeKartMesh(k.color, k.charId);
        race.scene.add(k.mesh);
        applyCamVisibility(k);
      });
    }

    function placeTrackProps(curve, theme) {
      race.obstacles = [];
      var barrelGeo = geo("barrel", function () { return new THREE.CylinderGeometry(0.5, 0.58, 1.05, 10); });
      var boxGeo = geo("obox", function () { return new THREE.BoxGeometry(1.05, 1.05, 1.05); });
      var coneGeo = geo("cone", function () { return new THREE.ConeGeometry(0.42, 1.05, 10); });
      var crystalGeo = geo("crystal", function () { return new THREE.OctahedronGeometry(0.55, 0); });
      var barrelMat = mat("barrel", function () { return new THREE.MeshLambertMaterial({ color: 0xd97706 }); });
      var boxMat = mat("obox", function () { return new THREE.MeshLambertMaterial({ color: 0xa16207 }); });
      var coneMat = mat("cone", function () { return new THREE.MeshLambertMaterial({ color: 0xff6b35 }); });
      var crystalMat = mat("crystal", function () { return new THREE.MeshLambertMaterial({ color: 0x7dd3fc }); });
      var hoopMat = mat("hoop", function () { return new THREE.MeshLambertMaterial({ color: theme.accent }); });
      var count = isMobile ? 12 : 18;
      for (var i = 0; i < count; i++) {
        var u = (i + 0.5) / count;
        var p = curve.getPointAt(u);
        var t = curve.getTangentAt(u);
        var side = i % 2 ? 1 : -1;
        var nx = -t.z, nz = t.x;
        var len = Math.sqrt(nx * nx + nz * nz) || 1;
        nx /= len;
        nz /= len;
        var onTrack = i % 7 === 0;
        var dist = onTrack ? race.meta.halfW * 0.28 : race.meta.halfW + 4.5 + (i % 3) * 1.2;
        var x = p.x + nx * side * dist;
        var z = p.z + nz * side * dist;
        var kind;
        if (theme.style === "mine" && onTrack) kind = "crystal";
        else if (onTrack) kind = i % 2 ? "cone" : "barrel";
        else kind = i % 3 === 0 ? "box" : "barrel";
        var mesh;
        if (kind === "barrel") mesh = new THREE.Mesh(barrelGeo, barrelMat);
        else if (kind === "cone") mesh = new THREE.Mesh(coneGeo, coneMat);
        else if (kind === "crystal") mesh = new THREE.Mesh(crystalGeo, crystalMat);
        else mesh = new THREE.Mesh(boxGeo, boxMat);
        mesh.position.set(x, kind === "cone" ? 0.52 : kind === "crystal" ? 0.7 : 0.55, z);
        if (kind === "crystal") mesh.rotation.y = i * 0.7;
        race.scene.add(mesh);
        race.obstacles.push({ x: x, z: z, r: kind === "cone" ? 0.5 : 0.72, mesh: mesh, kind: kind });

        if (!onTrack && i % 5 === 0) {
          var hoop = new THREE.Mesh(geo("hoop", function () { return new THREE.TorusGeometry(0.7, 0.08, 6, 16); }), hoopMat);
          hoop.position.set(x + nx * side * 1.2, 1.4, z + nz * side * 1.2);
          hoop.rotation.y = Math.atan2(t.x, t.z);
          race.scene.add(hoop);
        }
      }
    }

    function placeScenery(curve, theme) {
      var style = theme.style || "village";
      var n = isMobile ? 28 : 44;
      for (var i = 0; i < n; i++) {
        var u = (i + 0.17) / n;
        var p = curve.getPointAt(u);
        var t = curve.getTangentAt(u);
        var side = i % 2 ? 1 : -1;
        var nx = -t.z, nz = t.x;
        var len = Math.sqrt(nx * nx + nz * nz) || 1;
        nx /= len;
        nz /= len;
        var dist = race.meta.halfW + 16 + (i % 5) * 3.5;
        var x = p.x + nx * side * dist;
        var z = p.z + nz * side * dist;
        var g = new THREE.Group();

        if (style === "village") {
          var wall = mat("vh-" + (i % 4), function () {
            var cols = [0xffb4a2, 0xfec89a, 0xb5e48c, 0xa0c4ff];
            return new THREE.MeshLambertMaterial({ color: cols[i % 4] });
          });
          var roofM = mat("vroof", function () { return new THREE.MeshLambertMaterial({ color: 0xe63946 }); });
          var body = new THREE.Mesh(geo("vhouse", function () { return new THREE.BoxGeometry(2.4, 1.8, 2.2); }), wall);
          body.position.y = 0.9;
          g.add(body);
          var roof = new THREE.Mesh(geo("vroof", function () { return new THREE.ConeGeometry(1.9, 1.2, 4); }), roofM);
          roof.position.y = 2.3;
          roof.rotation.y = Math.PI / 4;
          g.add(roof);
          if (i % 3 === 0) {
            var tree = makeTree(1 + (i % 3) * 0.15);
            tree.position.set(2.2, 0, 0.5);
            g.add(tree);
          }
        } else if (style === "forest") {
          g.add(makeTree(1.1 + (i % 4) * 0.25));
          if (i % 2 === 0) {
            var rock = new THREE.Mesh(
              geo("rock", function () { return new THREE.DodecahedronGeometry(0.7, 0); }),
              mat("rock", function () { return new THREE.MeshLambertMaterial({ color: 0x6c757d }); })
            );
            rock.position.set(1.4, 0.35, -0.6);
            rock.scale.set(1, 0.7, 1.1);
            g.add(rock);
          }
          if (i % 4 === 0) {
            var mush = new THREE.Mesh(
              geo("mush", function () { return new THREE.SphereGeometry(0.35, 8, 6); }),
              mat("mush", function () { return new THREE.MeshLambertMaterial({ color: 0xff6b6b }); })
            );
            mush.position.set(-1.1, 0.35, 0.8);
            mush.scale.y = 0.55;
            g.add(mush);
          }
        } else {
          var pillar = new THREE.Mesh(
            geo("mpil", function () { return new THREE.CylinderGeometry(0.45, 0.55, 3.2, 8); }),
            mat("mpil", function () { return new THREE.MeshLambertMaterial({ color: 0x495057 }); })
          );
          pillar.position.y = 1.6;
          g.add(pillar);
          var lamp = new THREE.Mesh(
            geo("mlamp", function () { return new THREE.SphereGeometry(0.35, 8, 8); }),
            mat("mlamp", function () { return new THREE.MeshLambertMaterial({ color: 0xffe066, emissive: 0xaa7700 }); })
          );
          lamp.position.y = 3.4;
          g.add(lamp);
          if (i % 3 === 0) {
            var crate = new THREE.Mesh(
              geo("mcrate", function () { return new THREE.BoxGeometry(1.2, 1.0, 1.2); }),
              mat("mcrate", function () { return new THREE.MeshLambertMaterial({ color: 0x8b5e34 }); })
            );
            crate.position.set(1.5, 0.5, 0.4);
            g.add(crate);
          }
        }
        g.position.set(x, 0, z);
        g.rotation.y = Math.atan2(t.x, t.z) + (i % 3) * 0.4;
        race.scene.add(g);
      }

      /* distant hills — keep far from track so chase cam stays open */
      var hillN = isMobile ? 6 : 10;
      for (var h = 0; h < hillN; h++) {
        var ang = (h / hillN) * Math.PI * 2;
        var hx = Math.cos(ang) * 210;
        var hz = Math.sin(ang) * 210;
        var hill = new THREE.Mesh(
          geo("hill", function () { return new THREE.SphereGeometry(22, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5); }),
          mat("hill-" + theme.ground, function () {
            return new THREE.MeshLambertMaterial({ color: theme.ground });
          })
        );
        hill.position.set(hx, -6, hz);
        hill.scale.set(1.2 + (h % 3) * 0.35, 0.35 + (h % 2) * 0.15, 1.2 + (h % 4) * 0.25);
        race.scene.add(hill);
      }
    }

    function makeTree(scale) {
      var g = new THREE.Group();
      var trunk = new THREE.Mesh(
        geo("trunk", function () { return new THREE.CylinderGeometry(0.18, 0.24, 1.2, 6); }),
        mat("trunk", function () { return new THREE.MeshLambertMaterial({ color: 0x8b5a2b }); })
      );
      trunk.position.y = 0.6;
      g.add(trunk);
      var leafM = mat("leaf", function () { return new THREE.MeshLambertMaterial({ color: 0x2d6a4f }); });
      var leaf = new THREE.Mesh(geo("leaf", function () { return new THREE.ConeGeometry(1.1, 2.2, 8); }), leafM);
      leaf.position.y = 2.1;
      g.add(leaf);
      var leaf2 = new THREE.Mesh(geo("leaf2", function () { return new THREE.ConeGeometry(0.85, 1.6, 8); }), leafM);
      leaf2.position.y = 3.1;
      g.add(leaf2);
      g.scale.setScalar(scale || 1);
      return g;
    }

    function makeRiderMesh(charId) {
      var ch = getChar(charId);
      var rider = new THREE.Group();
      var skinM = new THREE.MeshLambertMaterial({ color: ch.skin });
      var hatM = new THREE.MeshLambertMaterial({ color: ch.hat });
      var suitM = new THREE.MeshLambertMaterial({ color: ch.suit });
      var hairM = new THREE.MeshLambertMaterial({ color: ch.hair });
      var eyeM = mat("eye", function () { return new THREE.MeshLambertMaterial({ color: 0x222222 }); });
      var cheekM = mat("cheek", function () { return new THREE.MeshLambertMaterial({ color: 0xff8a80 }); });
      var whiteM = mat("eyeW", function () { return new THREE.MeshLambertMaterial({ color: 0xffffff }); });

      var torso = new THREE.Mesh(geo("rtorso", function () { return new THREE.BoxGeometry(0.56, 0.48, 0.42); }), suitM);
      torso.position.set(0, 0.38, 0);
      rider.add(torso);

      var legL = new THREE.Mesh(geo("rleg", function () { return new THREE.BoxGeometry(0.17, 0.26, 0.34); }), suitM);
      legL.position.set(-0.14, 0.12, 0.2);
      rider.add(legL);
      var legR = legL.clone();
      legR.position.x = 0.14;
      rider.add(legR);

      var head = new THREE.Mesh(geo("rhead", function () { return new THREE.SphereGeometry(0.4, 14, 12); }), skinM);
      head.position.set(0, 0.9, 0.02);
      head.scale.set(1, 0.95, 1);
      rider.add(head);

      var hat = new THREE.Mesh(geo("rhat", function () { return new THREE.SphereGeometry(0.44, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55); }), hatM);
      hat.position.set(0, 1.04, 0);
      rider.add(hat);
      var pom = new THREE.Mesh(geo("rpom", function () { return new THREE.SphereGeometry(0.13, 8, 6); }), hairM);
      pom.position.set(0, 1.34, 0);
      rider.add(pom);

      var eyeWL = new THREE.Mesh(geo("reyeW", function () { return new THREE.SphereGeometry(0.1, 8, 6); }), whiteM);
      eyeWL.position.set(-0.14, 0.93, 0.34);
      eyeWL.scale.set(1, 1.2, 0.55);
      rider.add(eyeWL);
      var eyeWR = eyeWL.clone();
      eyeWR.position.x = 0.14;
      rider.add(eyeWR);

      var eyeL = new THREE.Mesh(geo("reye", function () { return new THREE.SphereGeometry(0.055, 8, 6); }), eyeM);
      eyeL.position.set(-0.14, 0.93, 0.39);
      rider.add(eyeL);
      var eyeR = eyeL.clone();
      eyeR.position.x = 0.14;
      rider.add(eyeR);

      var cheekL = new THREE.Mesh(geo("rcheek", function () { return new THREE.SphereGeometry(0.06, 6, 6); }), cheekM);
      cheekL.position.set(-0.24, 0.8, 0.28);
      cheekL.scale.set(1, 0.7, 0.5);
      rider.add(cheekL);
      var cheekR = cheekL.clone();
      cheekR.position.x = 0.24;
      rider.add(cheekR);

      var armL = new THREE.Mesh(geo("rarm", function () { return new THREE.BoxGeometry(0.13, 0.13, 0.3); }), skinM);
      armL.position.set(-0.4, 0.44, 0.14);
      armL.rotation.y = 0.4;
      rider.add(armL);
      var armR = armL.clone();
      armR.position.x = 0.4;
      armR.rotation.y = -0.4;
      rider.add(armR);

      rider.position.set(0, 0.48, -0.05);
      rider.userData.head = head;
      rider.userData.hat = hat;
      rider.userData._mats = [skinM, hatM, suitM, hairM];
      return rider;
    }

    function makeKartMesh(colorHex, charId) {
      var g = new THREE.Group();
      var color = new THREE.Color(colorHex);
      var bodyMat = new THREE.MeshLambertMaterial({ color: color });
      var dark = mat("kdark", function () { return new THREE.MeshLambertMaterial({ color: 0x1a1f2a }); });
      var tire = mat("ktire", function () { return new THREE.MeshLambertMaterial({ color: 0x111111 }); });
      var chrome = mat("kchrome", function () { return new THREE.MeshLambertMaterial({ color: 0xd0d7e2 }); });
      var glass = mat("kglass", function () {
        return new THREE.MeshLambertMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.55 });
      });
      var lightM = mat("klight", function () { return new THREE.MeshLambertMaterial({ color: 0xfff3bf, emissive: 0xccaa44 }); });

      var body = new THREE.Mesh(geo("kbody", function () { return new THREE.BoxGeometry(1.4, 0.38, 2.1); }), bodyMat);
      body.position.y = 0.4;
      g.add(body);
      var belly = new THREE.Mesh(geo("kbelly", function () { return new THREE.BoxGeometry(1.2, 0.22, 1.5); }), dark);
      belly.position.set(0, 0.22, 0.05);
      g.add(belly);
      var nose = new THREE.Mesh(geo("knose", function () { return new THREE.BoxGeometry(1.05, 0.26, 0.55); }), bodyMat);
      nose.position.set(0, 0.36, 1.18);
      g.add(nose);
      var bumper = new THREE.Mesh(geo("kbump", function () { return new THREE.BoxGeometry(1.25, 0.14, 0.22); }), chrome);
      bumper.position.set(0, 0.22, 1.42);
      g.add(bumper);

      var wind = new THREE.Mesh(geo("kwind", function () { return new THREE.BoxGeometry(1.05, 0.42, 0.08); }), glass);
      wind.position.set(0, 0.78, 0.55);
      wind.rotation.x = -0.35;
      g.add(wind);

      var seat = new THREE.Mesh(geo("kseat", function () { return new THREE.BoxGeometry(0.72, 0.16, 0.55); }), dark);
      seat.position.set(0, 0.58, -0.02);
      g.add(seat);
      var back = new THREE.Mesh(geo("kback", function () { return new THREE.BoxGeometry(0.7, 0.45, 0.12); }), dark);
      back.position.set(0, 0.78, -0.35);
      g.add(back);

      var spoiler = new THREE.Mesh(geo("kspoiler", function () { return new THREE.BoxGeometry(1.55, 0.08, 0.32); }), bodyMat);
      spoiler.position.set(0, 0.95, -1.0);
      g.add(spoiler);
      var wingL = new THREE.Mesh(geo("kwing", function () { return new THREE.BoxGeometry(0.08, 0.35, 0.25); }), bodyMat);
      wingL.position.set(-0.7, 0.78, -0.95);
      g.add(wingL);
      var wingR = wingL.clone();
      wingR.position.x = 0.7;
      g.add(wingR);

      var hl = new THREE.Mesh(geo("khl", function () { return new THREE.SphereGeometry(0.12, 8, 6); }), lightM);
      hl.position.set(-0.4, 0.38, 1.4);
      g.add(hl);
      var hr = hl.clone();
      hr.position.x = 0.4;
      g.add(hr);

      g.userData.wheels = [];
      g.userData.frontPivots = [];
      for (var i = 0; i < 4; i++) {
        var isFront = i < 2;
        var pivot = new THREE.Group();
        pivot.position.set(i % 2 ? 0.8 : -0.8, 0.32, isFront ? 0.75 : -0.75);
        var w = new THREE.Mesh(geo("kwheel", function () { return new THREE.CylinderGeometry(0.32, 0.32, 0.3, 12); }), tire);
        w.rotation.z = Math.PI / 2;
        pivot.add(w);
        var rim = new THREE.Mesh(geo("krim", function () { return new THREE.CylinderGeometry(0.16, 0.16, 0.32, 8); }), chrome);
        rim.rotation.z = Math.PI / 2;
        pivot.add(rim);
        g.add(pivot);
        g.userData.wheels.push(w);
        if (isFront) g.userData.frontPivots.push(pivot);
      }

      /* 운전대 (핸들) — 조향 시 좌우로 회전 */
      var steerPivot = new THREE.Group();
      steerPivot.position.set(0, 0.72, 0.42);
      steerPivot.rotation.x = -0.55;
      var steerRing = new THREE.Mesh(
        geo("ksteer", function () { return new THREE.TorusGeometry(0.22, 0.035, 8, 20); }),
        dark
      );
      steerPivot.add(steerRing);
      var steerHub = new THREE.Mesh(geo("ksteerhub", function () { return new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8); }), chrome);
      steerHub.rotation.x = Math.PI / 2;
      steerPivot.add(steerHub);
      var spoke = new THREE.Mesh(geo("ksteerspoke", function () { return new THREE.BoxGeometry(0.38, 0.03, 0.04); }), chrome);
      steerPivot.add(spoke);
      g.add(steerPivot);
      g.userData.steerPivot = steerPivot;

      var rider = makeRiderMesh(charId);
      g.add(rider);
      g.userData.rider = rider;
      g.userData.bodyMat = bodyMat;
      return g;
    }

    function spawnSparks(x, z, yaw) {
      if (race.fx.length > 40) return;
      for (var i = 0; i < 3; i++) {
        race.fx.push({
          x: x + (Math.random() - 0.5),
          z: z + (Math.random() - 0.5),
          life: 0.25 + Math.random() * 0.2,
          vx: -Math.cos(yaw) * 2 + (Math.random() - 0.5) * 3,
          vz: -Math.sin(yaw) * 2 + (Math.random() - 0.5) * 3
        });
      }
    }

    function bindInput() {
      function kd(e) {
        keys[e.code] = true;
        if (e.code === "KeyV" && !e.repeat) toggleCamMode();
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) >= 0) e.preventDefault();
      }
      function ku(e) { keys[e.code] = false; }
      race._kd = kd; race._ku = ku;
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);

      /* touch steering wheel — 좌우 드래그 + 핸들 회전 표시 */
      var steering = 0;
      function setSteerVisual(v) {
        steering = clamp(v, -1, 1);
        if (els.wheelRim) els.wheelRim.style.transform = "rotate(" + (steering * 95) + "deg)";
        if (els.wheel) els.wheel.classList.toggle("is-steer", Math.abs(steering) > 0.08);
      }
      function wheelPos(ev) {
        var t = ev.touches ? ev.touches[0] : ev;
        var r = els.wheel.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        var dx = t.clientX - cx;
        var dy = t.clientY - cy;
        /* 원형 핸들: 각도 + 수평 성분을 섞어 직관적인 좌우 조향 */
        var ang = Math.atan2(dx, -dy); /* 위쪽 0, 시계방향 + */
        var fromAngle = clamp(ang / (Math.PI * 0.55), -1, 1);
        var fromX = clamp(dx / (r.width * 0.42), -1, 1);
        setSteerVisual(Math.abs(dx) + Math.abs(dy) < 10 ? fromX : fromAngle * 0.65 + fromX * 0.35);
      }
      function clearWheel() { setSteerVisual(0); }
      race._steerGet = function () { return steering; };
      els.wheel.addEventListener("touchstart", wheelPos, { passive: true });
      els.wheel.addEventListener("touchmove", wheelPos, { passive: true });
      els.wheel.addEventListener("touchend", clearWheel);
      els.wheel.addEventListener("mousedown", function (e) {
        wheelPos(e);
        function mv(ev) { wheelPos(ev); }
        function up() {
          clearWheel();
          window.removeEventListener("mousemove", mv);
          window.removeEventListener("mouseup", up);
        }
        window.addEventListener("mousemove", mv);
        window.addEventListener("mouseup", up);
      });
      function hold(btn, prop) {
        btn.addEventListener("touchstart", function (e) { e.preventDefault(); input[prop] = true; }, { passive: false });
        btn.addEventListener("touchend", function () { input[prop] = false; });
        btn.addEventListener("mousedown", function () { input[prop] = true; });
        btn.addEventListener("mouseup", function () { input[prop] = false; });
        btn.addEventListener("mouseleave", function () { input[prop] = false; });
      }
      hold(els.driftBtn, "drift");
      hold(els.boostBtn, "boost");
    }

    function readLocalInput() {
      var steer = 0;
      if (keys.ArrowLeft || keys.KeyA) steer -= 1;
      if (keys.ArrowRight || keys.KeyD) steer += 1;
      if (race._steerGet) {
        var ts = race._steerGet();
        if (Math.abs(ts) > 0.05) steer = ts;
      }
      var throttle = 1;
      if (keys.ArrowDown || keys.KeyS) throttle = -0.35;
      var drift = !!(keys.Space || keys.ShiftLeft || keys.ShiftRight || input.drift);
      var boost = !!(keys.ControlLeft || keys.ControlRight || keys.KeyZ || keys.KeyX || input.boost);
      input.steer = clamp(steer, -1, 1);
      input.throttle = throttle;
      var my = race.karts[me.id];
      if (my) my.input = { steer: input.steer, throttle: throttle, drift: drift, boost: boost };
    }

    function pointAtProgress(prog) {
      var pts = race.map.pts;
      var meta = race.meta;
      var remain = ((prog % meta.total) + meta.total) % meta.total;
      for (var i = 0; i < pts.length; i++) {
        var len = meta.segLen[i];
        if (remain <= len) {
          var t = len ? remain / len : 0;
          var a = pts[i], b = pts[(i + 1) % pts.length];
          return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        }
        remain -= len;
      }
      return pts[0];
    }
    function normAngle(a) {
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    }
    function aiDrive(k) {
      if (k.finished || k.stun > 0) return;
      /* dodge nearby obstacles */
      for (var oi = 0; oi < race.obstacles.length; oi++) {
        var ob = race.obstacles[oi];
        var odx = ob.x - k.x, odz = ob.z - k.z;
        if (odx * odx + odz * odz < 36) {
          var lookAvoid = pointAtProgress(k.progress + 20);
          var angA = Math.atan2(lookAvoid.z - k.z, lookAvoid.x - k.x);
          var side = odx * Math.sin(k.yaw) - odz * Math.cos(k.yaw);
          k.input = {
            steer: clamp((side > 0 ? -1 : 1) * 0.9 + normAngle(angA - k.yaw), -1, 1),
            throttle: 1,
            drift: Math.abs(side) > 0.2 && k.speed > 10,
            boost: false
          };
          return;
        }
      }
      var look = pointAtProgress(k.progress + 16 + (k.id.charCodeAt(k.id.length - 1) % 5));
      var desired = Math.atan2(look.z - k.z, look.x - k.x);
      var diff = normAngle(desired - k.yaw);
      var skill = 0.85 + (k.id.charCodeAt(1) % 10) * 0.02;
      k.input = {
        steer: clamp(diff * 2.1 * skill, -1, 1),
        throttle: 1,
        drift: Math.abs(diff) > 0.5 && k.speed > 9,
        boost: k.boost > 0.4 && Math.abs(diff) < 0.35
      };
    }

    function applyStunBounce(k, nx, nz, strength, stunTime) {
      var len = Math.sqrt(nx * nx + nz * nz) || 1;
      nx /= len; nz /= len;
      /* reflect velocity */
      var dot = k.vx * nx + k.vz * nz;
      if (dot < 0) {
        k.vx -= (1.55) * dot * nx;
        k.vz -= (1.55) * dot * nz;
      }
      k.vx += nx * strength;
      k.vz += nz * strength;
      k.speed *= 0.25;
      k.stun = Math.max(k.stun, stunTime);
      k.bounceY = 0.35;
      k.drifting = false;
      spawnSparks(k.x, k.z, k.yaw);
    }

    function resolveObstacles(k) {
      for (var i = 0; i < race.obstacles.length; i++) {
        var o = race.obstacles[i];
        var dx = k.x - o.x, dz = k.z - o.z;
        var rr = o.r + 0.85;
        var d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          var d = Math.sqrt(d2);
          applyStunBounce(k, dx / d, dz / d, 10 + k.speed * 0.15, 0.55);
          k.x = o.x + (dx / d) * (rr + 0.05);
          k.z = o.z + (dz / d) * (rr + 0.05);
          return;
        }
      }
    }

    function resolveKartKart(k) {
      /* 분산 권위: 자기/봇만 밀고, 원격 카트 위치는 건드리지 않음 */
      var ids = Object.keys(race.karts);
      var own = k.id === me.id || (k.isBot && room.isHost);
      if (!own) return;
      for (var i = 0; i < ids.length; i++) {
        var o = race.karts[ids[i]];
        if (o === k || o.finished) continue;
        var dx = k.x - o.x, dz = k.z - o.z;
        var d2 = dx * dx + dz * dz;
        if (d2 < 2.6 * 2.6 && d2 > 1e-4) {
          var d = Math.sqrt(d2);
          var nx = dx / d, nz = dz / d;
          var push = (2.6 - d) * 0.5;
          k.x += nx * push; k.z += nz * push;
          if (k.speed > 14 && d < 2.1) applyStunBounce(k, nx, nz, 6, 0.28);
        }
      }
    }

    function stepKart(k, dt) {
      if (k.finished) return;
      var inp = k.input || { steer: 0, throttle: 1, drift: false, boost: false };
      if (k.stun > 0) {
        k.stun -= dt;
        k.vx *= 1 - 3.2 * dt;
        k.vz *= 1 - 3.2 * dt;
        k.x += k.vx * dt;
        k.z += k.vz * dt;
        k.speed = Math.sqrt(k.vx * k.vx + k.vz * k.vz);
        k.bounceY = Math.max(0, k.bounceY - dt * 1.2);
        syncKartMesh(k, inp, dt);
        var hitStun = nearestOnTrack(race.map.pts, race.meta, k.x, k.z);
        k.progress = hitStun.prog;
        return;
      }

      var fwdX = Math.cos(k.yaw), fwdZ = Math.sin(k.yaw);
      var rightX = -fwdZ, rightZ = fwdX;
      var speedFwd = k.vx * fwdX + k.vz * fwdZ;
      var speedLat = k.vx * rightX + k.vz * rightZ;

      var wantDrift = inp.drift && Math.abs(speedFwd) > 7;
      if (wantDrift) {
        k.drifting = true;
        k.slip = lerp(k.slip, clamp(inp.steer, -1, 1), 1 - Math.pow(0.001, dt));
        k.yaw += inp.steer * (2.6 + Math.abs(speedFwd) * 0.03) * dt;
        /* low lateral grip while drifting */
        speedLat *= 1 - 1.8 * dt;
        speedFwd = Math.max(5, speedFwd - 2.2 * dt);
        k.driftGauge = clamp(k.driftGauge + dt * (0.45 + Math.abs(inp.steer) * 0.35), 0, 1);
        if (k.driftGauge >= 1) {
          k.boost = clamp(k.boost + 0.42, 0, 1);
          k.driftGauge = 0;
        }
        if (Math.random() < dt * 8) spawnSparks(k.x - fwdX, k.z - fwdZ, k.yaw);
      } else {
        if (k.drifting && k.driftGauge > 0.2) {
          k.boost = clamp(k.boost + k.driftGauge * 0.5, 0, 1);
          speedFwd += 6 * k.driftGauge;
        }
        k.drifting = false;
        k.slip = lerp(k.slip, 0, 1 - Math.pow(0.0001, dt));
        k.driftGauge = Math.max(0, k.driftGauge - dt * 0.9);
        var steerRate = (1.35 + Math.abs(speedFwd) * 0.045) * (1 - clamp(Math.abs(speedFwd) / 50, 0, 0.35));
        k.yaw += inp.steer * steerRate * dt;
        /* tire grip kills lateral slip */
        speedLat *= 1 - 10 * dt;
      }

      var maxSpeed = 30;
      var accel = 22 * inp.throttle;
      if (inp.throttle < 0) accel = -28;
      speedFwd += accel * dt;
      /* drag */
      speedFwd *= 1 - (0.28 + Math.abs(speedFwd) * 0.004) * dt;

      if (inp.boost && k.boost > 0.02) {
        speedFwd += 48 * dt;
        k.boost = Math.max(0, k.boost - 0.5 * dt);
        maxSpeed = 46;
      }
      speedFwd = clamp(speedFwd, -10, maxSpeed);

      k.vx = fwdX * speedFwd + rightX * speedLat;
      k.vz = fwdZ * speedFwd + rightZ * speedLat;
      k.x += k.vx * dt;
      k.z += k.vz * dt;
      k.speed = Math.sqrt(k.vx * k.vx + k.vz * k.vz);
      k.displayKmh = lerp(k.displayKmh || 0, k.speed * 9.2, 1 - Math.pow(0.0008, dt));
      k.wheelSpin += k.speed * dt * 3.5;
      k.bounceY = Math.max(0, (k.bounceY || 0) - dt * 1.4);

      var hit = nearestOnTrack(race.map.pts, race.meta, k.x, k.z);
      if (hit.dist > race.meta.halfW) {
        var nx = (k.x - hit.px) / (hit.dist || 1);
        var nz = (k.z - hit.pz) / (hit.dist || 1);
        var over = hit.dist - race.meta.halfW;
        k.x -= nx * (over + 0.05);
        k.z -= nz * (over + 0.05);
        if (k.speed > 6) applyStunBounce(k, -nx, -nz, 8 + over * 2, 0.4);
        else {
          k.vx *= 0.5; k.vz *= 0.5; k.speed *= 0.5;
        }
      }

      resolveObstacles(k);
      resolveKartKart(k);

      var prev = k.progress;
      var prog = hit.prog;
      hit = nearestOnTrack(race.map.pts, race.meta, k.x, k.z);
      prog = hit.prog;
      if (prev > race.meta.total * 0.75 && prog < race.meta.total * 0.25) {
        k.lap += 1;
        if (k.lap > k.laps) {
          k.finished = true;
          k.finishTime = race.t;
          if (room.isHost || peerIds().length === 0) {
            k.place = race.results.length + 1;
            race.results.push({ id: k.id, name: k.name, team: k.team, time: k.finishTime, place: k.place });
            if (!race.firstFinished) {
              race.firstFinished = true;
              race.phase = "finishing";
              race.finishTimer = FINISH_WINDOW;
            }
          } else {
            sendToHost({
              type: "finished-claim",
              id: k.id,
              name: k.name,
              team: k.team,
              time: k.finishTime
            });
          }
        }
      }
      k.progress = prog;
      syncKartMesh(k, inp, dt);
    }

    function syncKartMesh(k, inp, dt) {
      if (!k.mesh) return;
      var steerAmt = (inp && inp.steer) ? inp.steer : 0;
      var lean = steerAmt * -0.18 + (k.slip || 0) * -0.12;
      /* sit clearly above road/ground so wheels aren't buried */
      k.mesh.position.set(k.x, 0.42 + (k.bounceY || 0), k.z);
      k.mesh.rotation.y = -k.yaw + Math.PI / 2;
      k.mesh.rotation.z = lean;
      k.mesh.rotation.x = k.drifting ? -0.06 : 0;
      if (k.mesh.userData.wheels) {
        k.mesh.userData.wheels.forEach(function (w) {
          w.rotation.x = k.wheelSpin || 0;
        });
      }
      /* 앞바퀴·핸들 조향 각도 */
      var turnY = -steerAmt * 0.55;
      if (k.mesh.userData.frontPivots) {
        k.mesh.userData.frontPivots.forEach(function (p) { p.rotation.y = turnY; });
      }
      if (k.mesh.userData.steerPivot) {
        k.mesh.userData.steerPivot.rotation.z = -steerAmt * 0.85;
      }
      var rider = k.mesh.userData.rider;
      if (rider && rider.userData.head) {
        var bob = Math.sin((race ? race.t : 0) * 10 + k.id.length) * (k.drifting ? 0.04 : 0.015);
        rider.userData.head.position.y = 0.85 + bob;
        if (rider.userData.hat) rider.userData.hat.position.y = 0.98 + bob;
        rider.rotation.z = lean * 0.6;
      }
      /* 키보드 조향 시에도 터치 핸들 표시 동기화 (로컬만) */
      if (k.id === me.id && els.wheelRim && !(race._steerGet && Math.abs(race._steerGet()) > 0.05)) {
        els.wheelRim.style.transform = "rotate(" + (steerAmt * 95) + "deg)";
        if (els.wheel) els.wheel.classList.toggle("is-steer", Math.abs(steerAmt) > 0.08);
      }
    }

    function rankingList() {
      return Object.keys(race.karts).map(function (id) { return race.karts[id]; }).sort(function (a, b) {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        var sa = (a.lap - 1) * race.meta.total + a.progress;
        var sb = (b.lap - 1) * race.meta.total + b.progress;
        return sb - sa;
      });
    }

    function update(dt) {
      if (!race) return;
      var frameDt = dt;
      if (race.sim && race.sim.metrics) {
        var m = race.sim.metrics;
        m.frames += 1;
        m.sumDt += frameDt;
        m.maxDt = Math.max(m.maxDt, frameDt);
        m.minDt = Math.min(m.minDt, frameDt);
        if (m.frames % 20 === 0) {
          m.samples.push({
            t: Math.round(race.t * 100) / 100,
            fps: Math.round(1 / Math.max(frameDt, 0.0001)),
            phase: race.phase,
            meshes: race.scene ? race.scene.children.length : 0,
            karts: Object.keys(race.karts).length
          });
        }
        dt = Math.min(0.05, frameDt * (race.sim.timeScale || 1));
      }
      race.t += dt;
      readLocalInput();

      var solo = peerIds().length === 0;
      var phaseAuth = room.isHost || solo;

      if (race.phase === "countdown") {
        if (phaseAuth) {
          race.countdown -= dt;
          if (race.countdown <= 0) {
            race.phase = "running";
            els.center.textContent = "";
          }
        }
        if (race.phase === "countdown") {
          var n = Math.ceil(race.countdown);
          els.center.textContent = race.countdown <= 0 ? "GO!" : String(Math.max(1, n));
        }
        syncMeshesIdle();
        return;
      }

      if (race.phase === "done") return;

      /* 각 피어가 자기 카트(+호스트의 봇)만 시뮬 → CPU/네트워크 분산 */
      Object.keys(race.karts).forEach(function (id) {
        var k = race.karts[id];
        if (id === me.id) {
          k.input = input;
          stepKart(k, dt);
        } else if (k.isBot && room.isHost) {
          aiDrive(k);
          stepKart(k, dt);
        } else {
          /* 원격: 마지막 스냅샷 보간 */
          if (k._tx != null) {
            k.x = lerp(k.x, k._tx, 1 - Math.pow(0.0002, dt));
            k.z = lerp(k.z, k._tz, 1 - Math.pow(0.0002, dt));
            k.yaw = k._tyaw != null ? k._tyaw : k.yaw;
            k.speed = k._tspeed != null ? k._tspeed : k.speed;
            syncKartMesh(k, k.input || { steer: 0, throttle: 1, drift: false, boost: false }, dt);
          }
        }
      });

      if (race.phase === "finishing") {
        if (phaseAuth) {
          race.finishTimer -= dt;
          if (race.finishTimer <= 0) endRace();
        }
        els.center.textContent = "피니시 " + Math.ceil(Math.max(0, race.finishTimer)) + "s";
      }

      if (phaseAuth) {
        var alive = Object.keys(race.karts).filter(function (id) { return !race.karts[id].finished; });
        if (race.firstFinished && alive.length === 0) endRace();
        if (race.sim && race.t > 140 && race.phase !== "done") endRace();
      }

      /* lightweight spark FX (no meshes — drawn on minimap layer skip; visual via speedo shake) */
      if (race.fx && race.fx.length) {
        for (var fi = race.fx.length - 1; fi >= 0; fi--) {
          var fx = race.fx[fi];
          fx.life -= dt;
          fx.x += fx.vx * dt;
          fx.z += fx.vz * dt;
          if (fx.life <= 0) race.fx.splice(fi, 1);
        }
      }

      var ranks = rankingList();
      var my = race.karts[me.id];
      if (my) {
        updateCamera(my, frameDt);
        if (my.stun > 0) {
          race.camera.position.x += (Math.random() - 0.5) * 0.15;
          race.camera.position.y += (Math.random() - 0.5) * 0.08;
        }
      }
      hudTick += 1;
      if (hudTick % 2 === 0) {
        if (my) {
          els.lap.textContent = "LAP " + Math.min(my.lap, my.laps) + "/" + my.laps;
          els.boostbar.style.width = Math.round(my.boost * 100) + "%";
          if (els.driftbar) els.driftbar.style.width = Math.round(my.driftGauge * 100) + "%";
          api.setScore(ranks.findIndex(function (k) { return k.id === me.id; }) + 1);
          drawSpeedo(my);
        }
        els.rank.innerHTML = ranks.map(function (k, i) {
          return '<div class="kart-rank__row' + (k.id === me.id ? " is-me" : "") + (k.stun > 0 ? " is-stun" : "") + '">' +
            "<b>" + (k.finished ? k.place : i + 1) + "</b> " +
            '<i style="background:' + k.color + '"></i>' + esc(k.name) +
            (race.mode === "team" ? " <small>팀" + k.team + "</small>" : "") +
            (k.finished ? " ✓" : "") +
            "</div>";
        }).join("");
        els.timer.textContent = fmt(race.t);
        drawMinimap(ranks);
      }
    }

    function drawSpeedo(k) {
      if (!els.speedo || !els.kmh) return;
      var ctx = els.speedo.getContext("2d");
      var W = els.speedo.width, H = els.speedo.height;
      ctx.clearRect(0, 0, W, H);
      var cx = W / 2, cy = H - 18, R = 78;
      var kmh = Math.round(k.displayKmh || k.speed * 9.2);
      els.kmh.textContent = String(kmh);

      /* dial */
      ctx.beginPath();
      ctx.arc(cx, cy, R, Math.PI, 0, false);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 14;
      ctx.stroke();

      var maxK = 300;
      var t = clamp(kmh / maxK, 0, 1);
      var a0 = Math.PI;
      var a1 = Math.PI + Math.PI * t;
      var grad = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
      grad.addColorStop(0, "#4dabf7");
      grad.addColorStop(0.55, "#ffd43b");
      grad.addColorStop(1, "#ff4d6d");
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1, false);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 14;
      ctx.lineCap = "round";
      ctx.stroke();

      /* ticks */
      ctx.lineWidth = 2;
      for (var i = 0; i <= 10; i++) {
        var a = Math.PI + (Math.PI * i) / 10;
        var r0 = R - 18, r1 = R - 8;
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }

      /* needle */
      var na = Math.PI + Math.PI * t;
      ctx.strokeStyle = k.stun > 0 ? "#ff6b6b" : "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(na) * (R - 22), cy + Math.sin(na) * (R - 22));
      ctx.stroke();
      ctx.fillStyle = k.drifting ? "#ffd43b" : "#fff";
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();

      /* boost arc inner */
      ctx.beginPath();
      ctx.arc(cx, cy, R - 26, Math.PI, Math.PI + Math.PI * clamp(k.boost, 0, 1), false);
      ctx.strokeStyle = "rgba(77,171,247,0.85)";
      ctx.lineWidth = 5;
      ctx.stroke();

      if (k.stun > 0) {
        ctx.fillStyle = "rgba(255,80,80,0.85)";
        ctx.font = "bold 13px IBM Plex Sans KR,sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("충돌!", cx, cy - 36);
      } else if (k.drifting) {
        ctx.fillStyle = "#ffd43b";
        ctx.font = "bold 12px IBM Plex Sans KR,sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("DRIFT", cx, cy - 36);
      }
    }

    function syncMeshesIdle() {
      Object.keys(race.karts).forEach(function (id) {
        syncKartMesh(race.karts[id], race.karts[id].input || input, 0.016);
      });
      var my = race.karts[me.id];
      if (my) updateCamera(my, 0.016);
      if (my) drawSpeedo(my);
    }

    function updateCamera(k, dt) {
      var spd = k.speed || 0;
      var cam = race.camera;
      var smooth = 1 - Math.pow(0.0004, dt);
      applyCamVisibility(k);
      if (camMode === "fp") {
        /* hood cam: just above kart nose */
        var fx = k.x + Math.cos(k.yaw) * 0.55;
        var fz = k.z + Math.sin(k.yaw) * 0.55;
        var fy = 1.15 + (k.bounceY || 0) * 0.35;
        cam.position.x = lerp(cam.position.x || fx, fx, Math.min(1, smooth * 1.8));
        cam.position.y = lerp(cam.position.y || fy, fy, 0.25);
        cam.position.z = lerp(cam.position.z || fz, fz, Math.min(1, smooth * 1.8));
        cam.fov = lerp(cam.fov || 72, 70 + clamp(spd * 0.2, 0, 12) + (k.input && k.input.boost ? 4 : 0), 0.1);
        cam.updateProjectionMatrix();
        cam.lookAt(
          k.x + Math.cos(k.yaw) * 14,
          0.85 + (k.bounceY || 0) * 0.15,
          k.z + Math.sin(k.yaw) * 14
        );
        return;
      }
      /* high chase cam — look down onto open track, avoid ground/wall occlusion */
      var back = 9.2 + clamp(spd * 0.05, 0, 3);
      var up = 5.4 + clamp(spd * 0.025, 0, 1.6);
      var tx = k.x - Math.cos(k.yaw) * back;
      var tz = k.z - Math.sin(k.yaw) * back;
      cam.position.x = lerp(cam.position.x || tx, tx, smooth);
      cam.position.y = lerp(cam.position.y || up, up, 0.16);
      cam.position.z = lerp(cam.position.z || tz, tz, smooth);
      cam.fov = lerp(cam.fov || 58, 54 + clamp(spd * 0.12, 0, 7) + (k.input && k.input.boost ? 3 : 0), 0.08);
      cam.updateProjectionMatrix();
      cam.lookAt(k.x + Math.cos(k.yaw) * 6, 1.1 + (k.bounceY || 0), k.z + Math.sin(k.yaw) * 6);
    }

    function drawMinimap(ranks) {
      var ctx = els.minimap.getContext("2d");
      var W = els.minimap.width, H = els.minimap.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      var pts = race.map.pts;
      var minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      pts.forEach(function (p) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      });
      function sx(x, z) {
        var u = (x - minX) / (maxX - minX || 1);
        var v = (z - minZ) / (maxZ - minZ || 1);
        return { x: 18 + u * (W - 36), y: 18 + v * (H - 36) };
      }
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      pts.forEach(function (p, i) {
        var s = sx(p.x, p.z);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.stroke();
      ranks.forEach(function (k) {
        var s = sx(k.x, k.z);
        ctx.fillStyle = k.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, k.id === me.id ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
        if (k.id === me.id) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
    }

    function fmt(t) {
      var m = Math.floor(t / 60);
      var s = Math.floor(t % 60);
      var ms = Math.floor((t % 1) * 100);
      return m + ":" + String(s).padStart(2, "0") + "." + String(ms).padStart(2, "0");
    }

    function endRace() {
      if (!race || race.phase === "done") return;
      race.phase = "done";
      /* DNF others by progress order */
      rankingList().forEach(function (k) {
        if (!k.finished) {
          k.finished = true;
          k.finishTime = race.t + 1000;
          k.place = race.results.length + 1;
          race.results.push({ id: k.id, name: k.name, team: k.team, time: null, place: k.place, dnf: true });
        }
      });
      var teamScore = { A: 0, B: 0 };
      if (race.mode === "team") {
        race.results.forEach(function (r) {
          var pts = Math.max(0, 10 - r.place);
          teamScore[r.team] = (teamScore[r.team] || 0) + pts;
        });
      }
      if (room.isHost) broadcastReliable({ type: "finish", fromHost: true, results: race.results, teamScore: teamScore });
      showResults(race.results, teamScore);
    }

    function showResults(results, teamScore) {
      show("result");
      var rows = results.map(function (r) {
        return "<tr><td>" + r.place + "</td><td>" + esc(r.name) + "</td><td>" +
          (race && race.mode === "team" ? "팀" + r.team : "-") + "</td><td>" +
          (r.dnf ? "TIME OUT" : fmt(r.time)) + "</td></tr>";
      }).join("");
      var teamLine = "";
      if (teamScore && (room.mode === "team" || (race && race.mode === "team"))) {
        var win = (teamScore.A || 0) === (teamScore.B || 0) ? "무승부" :
          (teamScore.A || 0) > (teamScore.B || 0) ? "팀 A 승리!" : "팀 B 승리!";
        teamLine = "<p class=\"kart-team-result\">팀 A " + (teamScore.A || 0) + "점 · 팀 B " +
          (teamScore.B || 0) + "점 — <b>" + win + "</b></p>";
      }
      els.result.innerHTML =
        '<div class="kart-card kart-card--wide"><h3>🏁 결과</h3>' + teamLine +
        '<table class="kart-table"><thead><tr><th>#</th><th>이름</th><th>팀</th><th>기록</th></tr></thead><tbody>' +
        rows + "</tbody></table>" +
        '<div class="kart-actions">' +
        '<button type="button" class="btn btn--primary" id="kart-again">방으로</button>' +
        '<button type="button" class="btn btn--ghost" id="kart-home">로비</button>' +
        "</div></div>";
      els.result.querySelector("#kart-again").onclick = function () {
        destroyRace();
        me.ready = false;
        upsertMe();
        if (room.isHost) broadcast({ type: "room", room: publicRoom() });
        renderRoom();
      };
      els.result.querySelector("#kart-home").onclick = leaveRoom;
    }

    function applyPeerKart(msg) {
      if (!race || !msg.id || msg.id === me.id) return;
      var k = race.karts[msg.id];
      if (!k) return;
      var seq = msg.seq || 0;
      if (remoteKartAt[msg.id] != null && seq < remoteKartAt[msg.id]) return;
      remoteKartAt[msg.id] = seq;
      k._tx = msg.x;
      k._tz = msg.z;
      k._tyaw = msg.yaw;
      k._tspeed = msg.speed;
      k.boost = msg.boost;
      k.lap = msg.lap;
      k.progress = msg.progress;
      k.finished = !!msg.finished;
      k.place = msg.place || k.place;
      k.stun = msg.stun || 0;
      k.drifting = !!msg.drifting;
    }

    function applyPhase(msg) {
      if (!race) return;
      if (msg.t != null) race.t = msg.t;
      if (msg.phase) race.phase = msg.phase;
      if (msg.countdown != null) race.countdown = msg.countdown;
      if (msg.finishTimer != null) race.finishTimer = msg.finishTimer;
      if (msg.firstFinished != null) race.firstFinished = msg.firstFinished;
      if (msg.phase === "countdown") {
        els.center.textContent = msg.countdown > 0 ? String(Math.ceil(msg.countdown)) : "GO!";
      } else if (msg.phase === "finishing") {
        els.center.textContent = "피니시 " + Math.ceil(msg.finishTimer) + "s";
      } else if (msg.phase === "running") {
        els.center.textContent = "";
      }
    }

    function applyFinishClaim(msg) {
      if (!race || !msg.id) return;
      var k = race.karts[msg.id];
      if (!k || k.finished) return;
      k.finished = true;
      k.finishTime = msg.time != null ? msg.time : race.t;
      k.place = race.results.length + 1;
      race.results.push({ id: k.id, name: msg.name || k.name, team: msg.team || k.team, time: k.finishTime, place: k.place });
      if (!race.firstFinished) {
        race.firstFinished = true;
        race.phase = "finishing";
        race.finishTimer = FINISH_WINDOW;
      }
    }

    function packKartState(k, seq) {
      return {
        type: "kart",
        seq: seq,
        id: k.id,
        x: Math.round(k.x * 100) / 100,
        z: Math.round(k.z * 100) / 100,
        yaw: Math.round(k.yaw * 1000) / 1000,
        speed: Math.round(k.speed * 100) / 100,
        boost: Math.round((k.boost || 0) * 100) / 100,
        lap: k.lap,
        progress: Math.round(k.progress * 10) / 10,
        finished: !!k.finished,
        place: k.place || 0,
        stun: k.stun > 0 ? Math.round(k.stun * 100) / 100 : 0,
        drifting: !!k.drifting
      };
    }

    function netSync(dt) {
      netAcc += dt;
      phaseAcc += dt;
      if (!race) return;

      if (netAcc >= 1 / TICK_HZ) {
        netAcc = 0;
        if (race.phase === "running" || race.phase === "finishing" || race.phase === "countdown") {
          var mine = race.karts[me.id];
          if (mine) {
            race._kartSeq = (race._kartSeq || 0) + 1;
            broadcastMeshKart(packKartState(mine, race._kartSeq));
          }
          if (room.isHost) {
            Object.keys(race.karts).forEach(function (id) {
              var k = race.karts[id];
              if (k.isBot) {
                race._botSeq = (race._botSeq || 0) + 1;
                broadcastMeshKart(packKartState(k, race._botSeq));
              }
            });
          }
        }
      }

      if (room.isHost && phaseAcc >= 1 / PHASE_HZ) {
        phaseAcc = 0;
        broadcastFast({
          type: "phase",
          t: Math.round(race.t * 100) / 100,
          phase: race.phase,
          countdown: race.countdown,
          finishTimer: race.finishTimer,
          firstFinished: !!race.firstFinished
        });
      }
    }

    function loop(ts) {
      if (destroyed || !race) return;
      if (!lastTs) lastTs = ts;
      var frameDt = Math.min(0.033, (ts - lastTs) / 1000);
      lastTs = ts;
      update(frameDt);
      netSync(frameDt);
      if (race.renderer && race.scene && race.camera) {
        race.renderer.render(race.scene, race.camera);
      }
      raf = requestAnimationFrame(loop);
    }

    var KART_CTL_KEY = "gw-kart-ctl-v1";
    function defaultKartCtl() {
      return {
        wheel: { left: 3, bottom: 2, size: 132 },
        drift: { right: 3, bottom: 14, size: 78 },
        boost: { right: 3, bottom: 2, size: 78 }
      };
    }
    function loadKartCtl() {
      try {
        var v = JSON.parse(localStorage.getItem(KART_CTL_KEY) || "null");
        if (v && v.wheel && v.drift && v.boost) return v;
      } catch (e) {}
      return null;
    }
    function saveKartCtl(layout) {
      localStorage.setItem(KART_CTL_KEY, JSON.stringify(layout));
    }
    function applyKartCtlLayout(layout) {
      if (!els.touch) return;
      if (!layout) {
        els.touch.classList.remove("kart-touch--custom");
        [els.wheel, els.driftBtn, els.boostBtn].forEach(function (el) {
          if (!el) return;
          el.style.position = "";
          el.style.width = "";
          el.style.height = "";
          el.style.left = "";
          el.style.right = "";
          el.style.bottom = "";
        });
        if (els.skills) {
          els.skills.style.position = "";
          els.skills.style.display = "";
        }
        return;
      }
      var scale = parseFloat(els.touch.style.getPropertyValue("--kart-ctl") || els.race.style.getPropertyValue("--ctl-scale") || "1") || 1;
      var tw = els.touch.clientWidth || els.race.clientWidth || 360;
      var th = els.touch.clientHeight || 160;
      /* touch bar is bottom strip — position children absolute within it */
      els.touch.classList.add("kart-touch--custom");
      function place(el, pos, isLeft) {
        if (!el || !pos) return;
        var sz = Math.round((pos.size || 78) * scale);
        el.style.position = "absolute";
        el.style.width = sz + "px";
        el.style.height = sz + "px";
        el.style.bottom = Math.round((pos.bottom || 0) / 100 * th) + "px";
        if (isLeft || pos.left != null) {
          el.style.left = Math.round((pos.left != null ? pos.left : 3) / 100 * tw) + "px";
          el.style.right = "auto";
        } else {
          el.style.right = Math.round((pos.right != null ? pos.right : 3) / 100 * tw) + "px";
          el.style.left = "auto";
        }
      }
      place(els.wheel, layout.wheel, true);
      if (els.skills) {
        els.skills.style.position = "static";
        els.skills.style.display = "contents";
      }
      place(els.driftBtn, layout.drift, false);
      place(els.boostBtn, layout.boost, false);
    }
    function openKartControlEditor() {
      var existing = root.querySelector("#kartCtlEditor");
      if (existing) existing.remove();
      var draft = loadKartCtl() || defaultKartCtl();
      var selected = "wheel";
      var ov = document.createElement("div");
      ov.id = "kartCtlEditor";
      ov.className = "kart-ctl-editor";
      ov.innerHTML =
        '<div class="kart-ctl-editor__panel">' +
        '<div class="kart-ctl-editor__top"><div><h3>카트 조작 배치</h3>' +
        '<p>핸들·드리프트·부스터를 드래그해 위치를 조정하세요. 이 기기에만 저장됩니다.</p></div>' +
        '<button type="button" class="btn btn--ghost" data-kctl="close">닫기</button></div>' +
        '<div class="kart-ctl-editor__tools">' +
        '<label>미리보기<select id="kartCtlAspect">' +
        '<option value="device">지금 화면</option>' +
        '<option value="390x844">iPhone 14</option>' +
        '<option value="375x667">iPhone SE</option>' +
        '<option value="412x915">Pixel 7</option>' +
        '<option value="844x390">가로</option>' +
        '<option value="740x360">가로 짧은</option>' +
        "</select></label>" +
        '<label>크기<input type="range" id="kartCtlSize" min="48" max="150" value="100" /><span id="kartCtlSizeLb">100</span></label>' +
        '<button type="button" class="btn btn--ghost" data-kctl="reset">기본값</button>' +
        '<button type="button" class="btn btn--primary" data-kctl="save">저장</button>' +
        "</div>" +
        '<div class="kart-ctl-phone" id="kartCtlPhone"><div class="kart-ctl-ghosts" id="kartCtlGhosts"></div>' +
        '<div class="kart-ctl-phone__lb" id="kartCtlLb"></div></div>' +
        "</div>";
      root.appendChild(ov);
      var phone = ov.querySelector("#kartCtlPhone");
      var ghosts = ov.querySelector("#kartCtlGhosts");
      var sizeInp = ov.querySelector("#kartCtlSize");
      var sizeLb = ov.querySelector("#kartCtlSizeLb");
      function setAspect() {
        var mode = ov.querySelector("#kartCtlAspect").value;
        var w = global.innerWidth, h = global.innerHeight;
        if (mode !== "device") { var p = mode.split("x"); w = +p[0]; h = +p[1]; }
        var maxW = Math.min(440, global.innerWidth - 24);
        var maxH = Math.min(global.innerHeight * 0.55, 560);
        var ar = w / h;
        var pw = maxW, ph = pw / ar;
        if (ph > maxH) { ph = maxH; pw = ph * ar; }
        phone.style.width = Math.round(pw) + "px";
        phone.style.height = Math.round(ph) + "px";
        ov.querySelector("#kartCtlLb").textContent = Math.round(w) + "×" + Math.round(h);
        render();
      }
      function render() {
        var sw = phone.clientWidth, sh = phone.clientHeight;
        var short = Math.min(sw, sh);
        var scale = Math.max(0.58, Math.min(1.15, short / 520));
        ghosts.innerHTML = "";
        [["wheel", "핸들", draft.wheel, true], ["drift", "드리프트", draft.drift, false], ["boost", "부스터", draft.boost, false]].forEach(function (row) {
          var key = row[0], name = row[1], pos = row[2], leftSide = row[3];
          var g = document.createElement("button");
          g.type = "button";
          g.className = "kart-ctl-ghost" + (key === selected ? " is-sel" : "") + (key === "wheel" ? " is-wheel" : key === "drift" ? " is-drift" : " is-boost");
          g.dataset.key = key;
          var sz = Math.round((pos.size || 78) * scale);
          g.style.width = sz + "px";
          g.style.height = sz + "px";
          g.style.bottom = ((pos.bottom || 0) / 100 * sh) + "px";
          if (leftSide || pos.left != null) {
            g.style.left = ((pos.left != null ? pos.left : 3) / 100 * sw) + "px";
            g.style.right = "auto";
          } else {
            g.style.right = ((pos.right != null ? pos.right : 3) / 100 * sw) + "px";
            g.style.left = "auto";
          }
          g.textContent = name;
          g.onpointerdown = function (ev) { startDrag(ev, key); };
          ghosts.appendChild(g);
        });
        sizeInp.value = String((draft[selected] && draft[selected].size) || 78);
        sizeLb.textContent = sizeInp.value;
      }
      function startDrag(ev, key) {
        ev.preventDefault();
        selected = key;
        render();
        var ghost = ghosts.querySelector('[data-key="' + key + '"]');
        var sw = phone.clientWidth, sh = phone.clientHeight;
        var rect = phone.getBoundingClientRect();
        var short = Math.min(sw, sh);
        var scale = Math.max(0.58, Math.min(1.15, short / 520));
        var bw = Math.round((draft[key].size || 78) * scale);
        function move(e) {
          var cx = e.clientX - rect.left, cy = e.clientY - rect.top;
          var left = Math.max(0, Math.min(sw - bw, cx - bw / 2));
          var top = Math.max(0, Math.min(sh - bw, cy - bw / 2));
          var bottomPct = ((sh - top - bw) / sh) * 100;
          var next = { bottom: +bottomPct.toFixed(2), size: draft[key].size || 78 };
          if (left + bw / 2 < sw / 2) next.left = +((left / sw) * 100).toFixed(2);
          else next.right = +(((sw - left - bw) / sw) * 100).toFixed(2);
          draft[key] = next;
          ghost.style.left = left + "px";
          ghost.style.right = "auto";
          ghost.style.bottom = (sh - top - bw) + "px";
        }
        function up() {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          render();
        }
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        move(ev);
      }
      sizeInp.oninput = function () {
        var v = +sizeInp.value;
        sizeLb.textContent = String(v);
        if (draft[selected]) draft[selected].size = v;
        render();
      };
      ov.querySelector("#kartCtlAspect").onchange = setAspect;
      ov.onclick = function (e) {
        var a = e.target.getAttribute("data-kctl");
        if (a === "close") ov.remove();
        if (a === "reset") {
          localStorage.removeItem(KART_CTL_KEY);
          draft = defaultKartCtl();
          render();
        }
        if (a === "save") { saveKartCtl(draft); ov.remove(); fitKartControls(); }
      };
      setAspect();
    }

    function fitKartControls() {
      if (!els.race) return;
      var w = els.race.clientWidth || global.innerWidth || 800;
      var h = els.race.clientHeight || Math.max(360, global.innerHeight * 0.7);
      var short = Math.min(w, h);
      var aspect = w / Math.max(1, h);
      var scale = short / 520;
      if (h < 420) scale *= 0.82;
      if (h < 360) scale *= 0.9;
      if (aspect > 1.7) scale *= 0.9;
      if (aspect < 0.6) scale *= 0.9;
      scale = Math.max(0.58, Math.min(1.18, scale));
      els.race.style.setProperty("--ctl-scale", String(scale));
      if (els.touch) els.touch.style.setProperty("--kart-ctl", String(scale));
      applyKartCtlLayout(loadKartCtl());
    }

    function destroyRace() {
      cancelAnimationFrame(raf);
      raf = 0;
      physAcc = 0;
      if (race) {
        if (race._kd) window.removeEventListener("keydown", race._kd);
        if (race._ku) window.removeEventListener("keyup", race._ku);
        if (race.scene) {
          Object.keys(race.karts || {}).forEach(function (id) {
            var mesh = race.karts[id].mesh;
            if (mesh && mesh.userData.rider && mesh.userData.rider.userData._mats) {
              mesh.userData.rider.userData._mats.forEach(function (m) { if (m && m.dispose) m.dispose(); });
            }
            if (mesh && mesh.userData.bodyMat && mesh.userData.bodyMat.dispose) mesh.userData.bodyMat.dispose();
          });
          race.scene.traverse(function (obj) {
            if (!obj.isMesh || !obj.material || !obj.material.dispose) return;
            var sharedM = false;
            Object.keys(sharedMat).forEach(function (k) { if (sharedMat[k] === obj.material) sharedM = true; });
            if (!sharedM && obj.material.userData && obj.material.userData._disposed) return;
          });
          while (race.scene.children.length) race.scene.remove(race.scene.children[0]);
        }
        if (race.renderer) race.renderer.dispose();
        disposeShared();
      }
      race = null;
    }

    function getMetrics() {
      if (!race || !race.sim || !race.sim.metrics) return null;
      var m = race.sim.metrics;
      var avgDt = m.frames ? m.sumDt / m.frames : 0;
      return {
        frames: m.frames,
        avgFps: avgDt ? Math.round(1 / avgDt) : 0,
        minFps: m.maxDt ? Math.round(1 / m.maxDt) : 0,
        maxFps: m.minDt < 1e8 ? Math.round(1 / m.minDt) : 0,
        maxFrameMs: Math.round(m.maxDt * 1000),
        avgFrameMs: Math.round(avgDt * 1000 * 10) / 10,
        samples: m.samples.slice(),
        phase: race.phase,
        playerCount: Object.keys(race.karts).length,
        results: race.results.slice(),
        sceneChildren: race.scene ? race.scene.children.length : 0,
        mapId: race.map.id,
        mode: race.mode
      };
    }

    function getUiState() {
      return {
        mode: mode,
        roomPlayers: room.players.length,
        racePhase: race ? race.phase : null,
        countdown: race ? race.countdown : null,
        finishTimer: race ? race.finishTimer : null,
        rankText: els.rank ? els.rank.innerText : "",
        resultVisible: !els.result.hidden,
        raceVisible: !els.race.hidden,
        roomVisible: !els.room.hidden,
        centerText: els.center ? els.center.textContent : "",
        minimapOk: !!(els.minimap && els.minimap.getContext),
        canvasOk: !!(els.canvas && els.canvas.width > 0)
      };
    }

    function getRaceProgress() {
      if (!race) return null;
      var ranks = rankingList();
      var leader = ranks[0];
      var my = race.karts[me.id] || leader;
      if (!leader) return null;
      var totalNeed = Math.max(1, leader.laps * race.meta.total);
      function pctOf(k) {
        if (!k) return 0;
        if (k.finished) return 100;
        var d = (k.lap - 1) * race.meta.total + k.progress;
        return Math.max(0, Math.min(100, (d / totalNeed) * 100));
      }
      return {
        phase: race.phase,
        mapId: race.map.id,
        leaderPct: pctOf(leader),
        mePct: pctOf(my),
        leaderName: leader.name,
        meKmh: Math.round(my.displayKmh || my.speed * 9.2),
        lap: my.lap,
        laps: my.laps,
        finishedCount: ranks.filter(function (k) { return k.finished; }).length
      };
    }

    function startEightPlayerSim(opts) {
      opts = opts || {};
      room.isHost = true;
      room.mapId = opts.mapId || "village";
      room.mode = opts.mode || "solo";
      room.code = "LOAD8";
      room.hostId = me.id;
      me.name = opts.playerName || "Player1";
      me.charId = me.charId || CHARACTERS[0].id;
      me.color = COLORS[0];
      me.team = "A";
      me.ready = true;
      me.peerId = "local";
      room.players = [{
        id: me.id, name: me.name, color: me.color, charId: me.charId,
        team: "A", ready: true, peerId: "local", isBot: false
      }];
      for (var i = 1; i < MAX_PLAYERS; i++) {
        room.players.push({
          id: "BOT" + i,
          name: "Bot" + i,
          color: COLORS[i % COLORS.length],
          charId: CHARACTERS[i % CHARACTERS.length].id,
          team: i % 2 === 0 ? "A" : "B",
          ready: true,
          peerId: "bot",
          isBot: true
        });
      }
      if (opts.stopAtRoom) {
        renderRoom();
        return getUiState();
      }
      beginRace(42, room.mapId, room.mode, room.players);
      var forceLaps = opts.forceLaps != null ? opts.forceLaps : 1;
      Object.keys(race.karts).forEach(function (id) {
        race.karts[id].laps = forceLaps;
        if (id !== me.id) race.karts[id].isBot = true;
      });
      race.sim = {
        active: true,
        timeScale: opts.timeScale != null ? opts.timeScale : 2.5,
        metrics: { frames: 0, sumDt: 0, maxDt: 0, minDt: 1e9, samples: [] }
      };
      /* human also AI-driven in loadtest for fair full-field stress */
      if (opts.driveSelf !== false) {
        race.karts[me.id].isBot = true;
      }
      return getUiState();
    }

    renderLobby();

    if (intent && intent.action === "create") {
      room.isPublic = intent.isPublic !== false;
      room.roomName = intent.roomName || (me.name + "의 레이스");
      me.name = intent.name || me.name;
      createRoom(false);
    } else if (intent && intent.action === "join" && intent.code) {
      me.name = intent.name || me.name;
      joinRoom(intent.code);
    }

    var apiHandle = {
      destroy: function () {
        destroyed = true;
        clearPublic();
        destroyRace();
        Object.keys(conns).forEach(function (k) { try { conns[k].close(); } catch (e) {} });
        Object.keys(fastConns).forEach(function (k) { try { fastConns[k].close(); } catch (e) {} });
        conns = {};
        fastConns = {};
        if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      startEightPlayerSim: startEightPlayerSim,
      getMetrics: getMetrics,
      getUiState: getUiState,
      getRaceProgress: getRaceProgress,
      renderLobby: renderLobby,
      root: root
    };
    global.__KART_TEST__ = apiHandle;
    return apiHandle;
  }

  global.GWGames = global.GWGames || {};
  global.GWGames.kart = {
    id: "kart",
    title: "카드라이더",
    emoji: "🏎️",
    desc: "공개방 P2P 3D 레이스 · 최대 8인 · 맵 3종",
    tags: ["레이싱", "멀티", "P2P", "공개방"],
    accent: "#ff6b4a",
    hint: "로비에서 방 만들기/참가 · V로 카메라 · 드리프트·부스터",
    create: create
  };
})(window);

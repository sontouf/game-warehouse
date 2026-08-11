(function (global) {
  "use strict";

  /**
   * 카드라이더 — 서버 없는 P2P(PeerJS) 3D 레이스
   * 최대 8인 · 맵 3종 · 개인/팀전 · 레디→Go · 1등 후 10초
   */

  var MAX_PLAYERS = 8;
  var LAPS = 2;
  var FINISH_WINDOW = 10;
  var TICK_HZ = 20;
  var COLORS = ["#ff4d6d", "#4dabf7", "#69db7c", "#ffd43b", "#da77f2", "#ff922b", "#22b8cf", "#f783ac"];

  var MAPS = [
    {
      id: "village",
      name: "빌리지 손가락",
      theme: { ground: 0x3d8b4f, road: 0x555b66, sky: 0x87ceeb, curb: 0xff6b6b },
      laps: 2,
      pts: ptsVillage()
    },
    {
      id: "forest",
      name: "포레스트 목걸이",
      theme: { ground: 0x1b4332, road: 0x3d2b1f, sky: 0x74c69d, curb: 0xffd60a },
      laps: 2,
      pts: ptsForest()
    },
    {
      id: "mine",
      name: "마인 지그재그",
      theme: { ground: 0x4a4e69, road: 0x2b2d42, sky: 0x9a8c98, curb: 0xe63946 },
      laps: 3,
      pts: ptsMine()
    }
  ];

  function ptsVillage() {
    /* 손가락형 루프 */
    var a = [];
    var i, t;
    for (i = 0; i <= 40; i++) {
      t = (i / 40) * Math.PI * 2;
      a.push({ x: Math.cos(t) * 55, z: Math.sin(t) * 38 });
    }
    for (i = 1; i < 12; i++) {
      t = i / 12;
      a.push({ x: 55 + t * 35, z: Math.sin(t * Math.PI) * 12 });
    }
    for (i = 1; i < 12; i++) {
      t = i / 12;
      a.push({ x: 90 - t * 35, z: -Math.sin(t * Math.PI) * 12 });
    }
    return a;
  }

  function ptsForest() {
    var a = [];
    for (var i = 0; i <= 64; i++) {
      var t = (i / 64) * Math.PI * 2;
      a.push({
        x: Math.cos(t) * (48 + Math.sin(t * 3) * 10),
        z: Math.sin(t) * (48 + Math.cos(t * 2) * 8)
      });
    }
    return a;
  }

  function ptsMine() {
    var a = [];
    var corners = [
      [-50, -40], [50, -40], [50, -10], [-20, -10], [-20, 10], [50, 10], [50, 40], [-50, 40], [-50, -40]
    ];
    for (var c = 0; c < corners.length - 1; c++) {
      var a0 = corners[c], a1 = corners[c + 1];
      var steps = 8;
      for (var s = 0; s < steps; s++) {
        var u = s / steps;
        a.push({ x: a0[0] + (a1[0] - a0[0]) * u, z: a0[1] + (a1[1] - a0[1]) * u });
      }
    }
    return a;
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
    return { segLen: segLen, total: total, halfW: 7.5 };
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

  function create(stageEl, api) {
    if (!global.THREE) {
      stageEl.innerHTML = '<div class="kart-error">Three.js를 불러오지 못했습니다. 새로고침 해주세요.</div>';
      return { destroy: function () {} };
    }

    var THREE = global.THREE;
    var destroyed = false;
    var mode = "lobby"; /* lobby | room | race | result */
    var me = {
      id: uid(),
      name: "레이서" + Math.floor(Math.random() * 90 + 10),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      team: "A",
      ready: false
    };
    var room = {
      code: "",
      hostId: "",
      mapId: "village",
      mode: "solo", /* solo | team */
      players: [],
      isHost: false
    };
    var peer = null;
    var conns = {}; /* peerId -> DataConnection */
    var race = null;
    var raf = 0;
    var lastTs = 0;
    var netAcc = 0;

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
      '    </div>' +
      '    <div class="kart-speedo" id="kart-speedo">' +
      '      <canvas id="kart-speedo-canvas" width="220" height="140"></canvas>' +
      '      <div class="kart-speedo__readout"><b id="kart-kmh">0</b><small>km/h</small></div>' +
      '      <div class="kart-speedo__drift"><i id="kart-driftbar"></i></div>' +
      "    </div>" +
      "  </div>" +
      '  <div class="kart-touch" id="kart-touch">' +
      '    <div class="kart-wheel" id="kart-wheel"><div class="kart-wheel__knob" id="kart-knob"></div></div>' +
      '    <button type="button" class="kart-btn kart-btn--drift" id="kart-drift">드리프트</button>' +
      '    <button type="button" class="kart-btn kart-btn--boost" id="kart-boost">부스터</button>' +
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
      touch: root.querySelector("#kart-touch"),
      wheel: root.querySelector("#kart-wheel"),
      knob: root.querySelector("#kart-knob"),
      driftBtn: root.querySelector("#kart-drift"),
      boostBtn: root.querySelector("#kart-boost")
    };

    var input = { steer: 0, throttle: 1, drift: false, boost: false };
    var keys = {};
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

    function renderLobby() {
      show("lobby");
      els.lobby.innerHTML =
        '<div class="kart-card">' +
        "<h3>🏎️ 카드라이더</h3>" +
        "<p>최대 8인 · 서버 없이 P2P · 3D 레이스</p>" +
        '<label class="kart-field">닉네임<input id="kart-name" maxlength="12" value="' + me.name.replace(/"/g, "") + '"></label>' +
        '<div class="kart-actions">' +
        '<button type="button" class="btn btn--primary" id="kart-create">방 만들기</button>' +
        '<button type="button" class="btn btn--ghost" id="kart-join-open">코드로 참가</button>' +
        '<button type="button" class="btn btn--ghost" id="kart-solo">혼자 연습</button>' +
        "</div>" +
        '<div class="kart-joinbox" id="kart-joinbox" hidden>' +
        '<label class="kart-field">방 코드<input id="kart-code" maxlength="16" placeholder="예: AB12CD"></label>' +
        '<button type="button" class="btn btn--primary" id="kart-join-go">참가</button>' +
        "</div>" +
        '<p class="kart-note">같은 Wi‑Fi/인터넷에서 방 코드를 공유하세요. (PeerJS 중계, 별도 서버 불필요)</p>' +
        "</div>";
      els.lobby.querySelector("#kart-create").onclick = function () {
        me.name = els.lobby.querySelector("#kart-name").value.trim() || me.name;
        createRoom(false);
      };
      els.lobby.querySelector("#kart-solo").onclick = function () {
        me.name = els.lobby.querySelector("#kart-name").value.trim() || me.name;
        createRoom(true);
      };
      els.lobby.querySelector("#kart-join-open").onclick = function () {
        els.lobby.querySelector("#kart-joinbox").hidden = false;
      };
      els.lobby.querySelector("#kart-join-go").onclick = function () {
        me.name = els.lobby.querySelector("#kart-name").value.trim() || me.name;
        joinRoom((els.lobby.querySelector("#kart-code").value || "").trim().toUpperCase());
      };
    }

    function renderRoom() {
      show("room");
      var mapOpts = MAPS.map(function (m) {
        return '<option value="' + m.id + '"' + (room.mapId === m.id ? " selected" : "") + ">" + m.name + "</option>";
      }).join("");
      var list = room.players.map(function (p) {
        return '<li class="kart-plist__item" style="--c:' + p.color + '">' +
          '<span class="kart-dot"></span><b>' + esc(p.name) + "</b>" +
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
          id: me.id, name: me.name, color: me.color, team: me.team, ready: me.ready, peerId: me.peerId || ""
        });
      } else {
        p.name = me.name;
        p.color = me.color;
        p.team = me.team;
        p.ready = me.ready;
        p.peerId = me.peerId || p.peerId;
      }
    }
    function syncPlayer() {
      if (room.isHost) broadcast({ type: "room", room: publicRoom() });
      else sendToHost({ type: "player", player: {
        id: me.id, name: me.name, color: me.color, team: me.team, ready: me.ready, peerId: me.peerId
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
        wireConn(conn);
      });
    }

    function wireConn(conn) {
      conns[conn.peer] = conn;
      conn.on("data", function (msg) { onNet(msg, conn); });
      conn.on("close", function () {
        delete conns[conn.peer];
        if (room.isHost) {
          room.players = room.players.filter(function (p) { return p.peerId !== conn.peer; });
          broadcast({ type: "room", room: publicRoom() });
          if (mode === "room") renderRoom();
        }
      });
    }

    function broadcast(msg) {
      Object.keys(conns).forEach(function (k) {
        try { if (conns[k].open) conns[k].send(msg); } catch (e) {}
      });
    }
    function sendToHost(msg) {
      var hostConn = Object.keys(conns).map(function (k) { return conns[k]; })[0];
      if (hostConn && hostConn.open) hostConn.send(msg);
    }
    function sendAll(msg) {
      if (room.isHost) broadcast(msg);
      else sendToHost(msg);
    }

    function onNet(msg, conn) {
      if (!msg || !msg.type) return;
      if (msg.type === "hello" && room.isHost) {
        if (room.players.length >= MAX_PLAYERS) {
          conn.send({ type: "full" });
          return;
        }
        var pl = msg.player;
        pl.peerId = conn.peer;
        pl.ready = false;
        if (!room.players.some(function (p) { return p.id === pl.id; })) room.players.push(pl);
        conn.send({ type: "welcome", youId: pl.id, room: publicRoom() });
        broadcast({ type: "room", room: publicRoom() });
        renderRoom();
      } else if (msg.type === "welcome") {
        me.id = msg.youId || me.id;
        applyRoom(msg.room);
        renderRoom();
      } else if (msg.type === "room") {
        applyRoom(msg.room);
        if (mode === "room") renderRoom();
      } else if (msg.type === "player" && room.isHost) {
        var idx = room.players.findIndex(function (p) { return p.id === msg.player.id; });
        if (idx >= 0) room.players[idx] = Object.assign(room.players[idx], msg.player, { peerId: conn.peer });
        broadcast({ type: "room", room: publicRoom() });
        renderRoom();
      } else if (msg.type === "start") {
        beginRace(msg.seed, msg.mapId, msg.mode, msg.players);
      } else if (msg.type === "input" && room.isHost && race) {
        var kart = race.karts[msg.id];
        if (kart && !kart.finished) kart.input = msg.input;
      } else if (msg.type === "state" && !room.isHost && race) {
        applyRemoteState(msg);
      } else if (msg.type === "finish" && !room.isHost) {
        showResults(msg.results, msg.teamScore);
      } else if (msg.type === "full") {
        alert("방이 가득 찼습니다.");
        leaveRoom();
      }
    }

    function applyRoom(r) {
      room.code = r.code;
      room.hostId = r.hostId;
      room.mapId = r.mapId;
      room.mode = r.mode;
      room.players = r.players || [];
      var self = room.players.find(function (p) { return p.id === me.id; });
      if (self) {
        me.ready = !!self.ready;
        me.team = self.team || me.team;
        me.color = self.color || me.color;
      }
    }

    function joinRoom(code) {
      if (!code) { alert("방 코드를 입력하세요."); return; }
      room.isHost = false;
      room.code = code.replace(/^KR/i, "").toUpperCase();
      ensurePeer(function (err) {
        if (err) { alert("연결에 실패했습니다."); return; }
        var hostPeerId = "KR" + room.code;
        var conn = peer.connect(hostPeerId, { reliable: true });
        conn.on("open", function () {
          wireConn(conn);
          conn.send({ type: "hello", player: {
            id: me.id, name: me.name, color: me.color, team: me.team, ready: false
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
      if (peer) { try { peer.destroy(); } catch (e) {} peer = null; conns = {}; }
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
      peer.on("connection", function (conn) { wireConn(conn); });
    }

    function leaveRoom() {
      Object.keys(conns).forEach(function (k) { try { conns[k].close(); } catch (e) {} });
      conns = {};
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
      broadcast(payload);
      beginRace(seed, room.mapId, room.mode, room.players);
    }

    /* ========== RACE ========== */
    function beginRace(seed, mapId, raceMode, players) {
      destroyRace();
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
      lastTs = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
      api.setScore(0);
    }

    function setupRenderer() {
      var w = els.race.clientWidth || 800;
      var h = Math.max(360, els.race.clientHeight || 480);
      var dpr = Math.min(isMobile ? 1.25 : 1.75, global.devicePixelRatio || 1);
      var renderer = new THREE.WebGLRenderer({
        canvas: els.canvas,
        antialias: !isMobile,
        alpha: false,
        powerPreference: "high-performance",
        stencil: false,
        depth: true
      });
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      renderer.setClearColor(race.map.theme.sky, 1);
      renderer.sortObjects = true;
      var scene = new THREE.Scene();
      scene.fog = new THREE.Fog(race.map.theme.sky, 55, 140);
      var camera = new THREE.PerspectiveCamera(58, w / h, 0.2, 220);
      scene.add(new THREE.HemisphereLight(0xf0f6ff, 0x3a4a3a, 0.95));
      var dir = new THREE.DirectionalLight(0xfff1d6, 0.85);
      dir.position.set(40, 60, 25);
      scene.add(dir);
      race.renderer = renderer;
      race.scene = scene;
      race.camera = camera;
      race._viewW = w;
      race._viewH = h;
    }

    function roadTexture(theme) {
      var key = "roadtex-" + theme.road;
      if (sharedMat[key]) return sharedMat[key];
      var c = document.createElement("canvas");
      c.width = 64; c.height = 64;
      var g = c.getContext("2d");
      g.fillStyle = "#" + ("000000" + theme.road.toString(16)).slice(-6);
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "rgba(255,255,255,0.18)";
      g.fillRect(28, 0, 8, 64);
      g.fillStyle = "rgba(0,0,0,0.15)";
      for (var y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 2);
      var tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 40);
      tex.anisotropy = 1;
      var m = new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff });
      sharedMat[key] = m;
      return m;
    }

    function buildTrack() {
      var pts = race.map.pts;
      var theme = race.map.theme;
      var segs = isMobile ? Math.max(48, pts.length * 2) : Math.max(72, pts.length * 3);

      var ground = new THREE.Mesh(
        geo("ground", function () { return new THREE.PlaneGeometry(320, 320, 1, 1); }),
        mat("ground-" + theme.ground, function () {
          return new THREE.MeshLambertMaterial({ color: theme.ground });
        })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.04;
      ground.receiveShadow = false;
      race.scene.add(ground);

      var shape = [];
      for (var i = 0; i < pts.length; i++) shape.push(new THREE.Vector3(pts[i].x, 0.03, pts[i].z));
      shape.push(shape[0].clone());
      var curve = new THREE.CatmullRomCurve3(shape, true, "catmullrom", 0.08);
      var roadGeo = new THREE.TubeGeometry(curve, segs, race.meta.halfW, isMobile ? 5 : 7, true);
      sharedGeo.road = roadGeo;
      var road = new THREE.Mesh(roadGeo, roadTexture(theme));
      race.scene.add(road);

      var curbGeo = new THREE.TubeGeometry(curve, segs, race.meta.halfW + 0.4, 3, true);
      sharedGeo.curb = curbGeo;
      var curb = new THREE.Mesh(
        curbGeo,
        mat("curb-" + theme.curb, function () { return new THREE.MeshLambertMaterial({ color: theme.curb }); })
      );
      curb.scale.y = 0.18;
      race.scene.add(curb);

      var s0 = pts[0], s1 = pts[1];
      var ang = Math.atan2(s1.z - s0.z, s1.x - s0.x);
      var start = new THREE.Mesh(
        geo("start", function () { return new THREE.BoxGeometry(race.meta.halfW * 2, 0.06, 1.4); }),
        mat("start", function () { return new THREE.MeshLambertMaterial({ color: 0xf8f8f8 }); })
      );
      start.position.set(s0.x, 0.1, s0.z);
      start.rotation.y = -ang;
      race.scene.add(start);

      /* decorative side props + collidable obstacles */
      placeTrackProps(curve, theme);

      Object.keys(race.karts).forEach(function (id) {
        race.karts[id].mesh = makeKartMesh(race.karts[id].color);
        race.scene.add(race.karts[id].mesh);
      });
    }

    function placeTrackProps(curve, theme) {
      race.obstacles = [];
      var barrelGeo = geo("barrel", function () { return new THREE.CylinderGeometry(0.55, 0.6, 1.1, 8); });
      var boxGeo = geo("obox", function () { return new THREE.BoxGeometry(1.1, 1.1, 1.1); });
      var coneGeo = geo("cone", function () { return new THREE.ConeGeometry(0.45, 1.0, 8); });
      var barrelMat = mat("barrel", function () { return new THREE.MeshLambertMaterial({ color: 0xc45c26 }); });
      var boxMat = mat("obox", function () { return new THREE.MeshLambertMaterial({ color: 0x8d6e63 }); });
      var coneMat = mat("cone", function () { return new THREE.MeshLambertMaterial({ color: 0xff7043 }); });
      var count = isMobile ? 18 : 28;
      for (var i = 0; i < count; i++) {
        var u = (i + 0.5) / count;
        var p = curve.getPointAt(u);
        var t = curve.getTangentAt(u);
        var side = (i % 2 ? 1 : -1);
        var nx = -t.z, nz = t.x;
        var len = Math.sqrt(nx * nx + nz * nz) || 1;
        nx /= len; nz /= len;
        var onTrack = i % 7 === 0;
        var dist = onTrack ? race.meta.halfW * 0.35 : race.meta.halfW + 2.2 + (i % 3) * 0.7;
        var x = p.x + nx * side * dist;
        var z = p.z + nz * side * dist;
        var kind = onTrack ? (i % 2 ? "cone" : "barrel") : (i % 3 === 0 ? "box" : "barrel");
        var mesh;
        if (kind === "barrel") mesh = new THREE.Mesh(barrelGeo, barrelMat);
        else if (kind === "cone") mesh = new THREE.Mesh(coneGeo, coneMat);
        else mesh = new THREE.Mesh(boxGeo, boxMat);
        mesh.position.set(x, kind === "cone" ? 0.5 : 0.55, z);
        mesh.matrixAutoUpdate = true;
        race.scene.add(mesh);
        race.obstacles.push({ x: x, z: z, r: kind === "cone" ? 0.55 : 0.75, mesh: mesh, kind: kind });
      }
    }

    function makeKartMesh(colorHex) {
      var g = new THREE.Group();
      var color = new THREE.Color(colorHex);
      var bodyMat = new THREE.MeshLambertMaterial({ color: color });
      var dark = mat("kdark", function () { return new THREE.MeshLambertMaterial({ color: 0x1a1f2a }); });
      var tire = mat("ktire", function () { return new THREE.MeshLambertMaterial({ color: 0x111111 }); });
      var body = new THREE.Mesh(geo("kbody", function () { return new THREE.BoxGeometry(1.35, 0.42, 2.05); }), bodyMat);
      body.position.y = 0.38;
      g.add(body);
      var nose = new THREE.Mesh(geo("knose", function () { return new THREE.BoxGeometry(1.05, 0.28, 0.55); }), bodyMat);
      nose.position.set(0, 0.34, 1.15);
      g.add(nose);
      var cabin = new THREE.Mesh(geo("kcabin", function () { return new THREE.BoxGeometry(0.95, 0.32, 0.85); }), dark);
      cabin.position.set(0, 0.68, -0.05);
      g.add(cabin);
      var spoiler = new THREE.Mesh(geo("kspoiler", function () { return new THREE.BoxGeometry(1.5, 0.08, 0.35); }), bodyMat);
      spoiler.position.set(0, 0.72, -0.95);
      g.add(spoiler);
      g.userData.wheels = [];
      for (var i = 0; i < 4; i++) {
        var w = new THREE.Mesh(geo("kwheel", function () { return new THREE.CylinderGeometry(0.3, 0.3, 0.28, 10); }), tire);
        w.rotation.z = Math.PI / 2;
        w.position.set(i % 2 ? 0.78 : -0.78, 0.3, i < 2 ? 0.72 : -0.72);
        g.add(w);
        g.userData.wheels.push(w);
      }
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
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) >= 0) e.preventDefault();
      }
      function ku(e) { keys[e.code] = false; }
      race._kd = kd; race._ku = ku;
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);

      /* touch wheel */
      var steering = 0;
      function wheelPos(ev) {
        var t = ev.touches ? ev.touches[0] : ev;
        var r = els.wheel.getBoundingClientRect();
        var x = (t.clientX - r.left) / r.width * 2 - 1;
        steering = clamp(x, -1, 1);
        els.knob.style.transform = "translate(" + (steering * 36) + "px, -50%)";
      }
      function clearWheel() {
        steering = 0;
        els.knob.style.transform = "translate(0, -50%)";
      }
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
      var ids = Object.keys(race.karts);
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
          o.x -= nx * push; o.z -= nz * push;
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
          k.place = race.results.length + 1;
          race.results.push({ id: k.id, name: k.name, team: k.team, time: k.finishTime, place: k.place });
          if (!race.firstFinished) {
            race.firstFinished = true;
            race.phase = "finishing";
            race.finishTimer = FINISH_WINDOW;
          }
        }
      }
      k.progress = prog;
      syncKartMesh(k, inp, dt);
    }

    function syncKartMesh(k, inp, dt) {
      if (!k.mesh) return;
      var lean = (inp && inp.steer ? inp.steer : 0) * -0.18 + (k.slip || 0) * -0.12;
      k.mesh.position.set(k.x, 0.18 + (k.bounceY || 0), k.z);
      k.mesh.rotation.y = -k.yaw + Math.PI / 2;
      k.mesh.rotation.z = lean;
      k.mesh.rotation.x = k.drifting ? -0.06 : 0;
      if (k.mesh.userData.wheels) {
        k.mesh.userData.wheels.forEach(function (w) {
          w.rotation.x = k.wheelSpin || 0;
        });
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

      var authority = room.isHost || Object.keys(conns).length === 0;

      if (race.phase === "countdown") {
        if (authority) {
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

      if (authority) {
        Object.keys(race.karts).forEach(function (id) {
          var k = race.karts[id];
          if (k.isBot) aiDrive(k);
          stepKart(k, dt);
        });
      }

      if (race.phase === "finishing") {
        if (authority) {
          race.finishTimer -= dt;
          if (race.finishTimer <= 0) endRace();
        }
        els.center.textContent = "피니시 " + Math.ceil(Math.max(0, race.finishTimer)) + "s";
      }

      if (authority) {
        var alive = Object.keys(race.karts).filter(function (id) { return !race.karts[id].finished; });
        if (race.firstFinished && alive.length === 0) endRace();
        /* load-test safety: prevent infinite races if AI stalls */
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
      var back = 7.8 + clamp(spd * 0.04, 0, 2.5);
      var up = 3.6 + clamp(spd * 0.02, 0, 1.2);
      var tx = k.x - Math.cos(k.yaw) * back;
      var tz = k.z - Math.sin(k.yaw) * back;
      var cam = race.camera;
      var smooth = 1 - Math.pow(0.0004, dt);
      cam.position.x = lerp(cam.position.x || tx, tx, smooth);
      cam.position.y = lerp(cam.position.y || up, up, 0.12);
      cam.position.z = lerp(cam.position.z || tz, tz, smooth);
      cam.fov = lerp(cam.fov || 58, 56 + clamp(spd * 0.15, 0, 8) + (k.input && k.input.boost ? 3 : 0), 0.08);
      cam.updateProjectionMatrix();
      cam.lookAt(k.x + Math.cos(k.yaw) * 7, 0.55 + (k.bounceY || 0), k.z + Math.sin(k.yaw) * 7);
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
      if (room.isHost) broadcast({ type: "finish", results: race.results, teamScore: teamScore });
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

    function applyRemoteState(msg) {
      if (!race) return;
      race.t = msg.t;
      race.phase = msg.phase;
      race.countdown = msg.countdown;
      race.finishTimer = msg.finishTimer;
      race.firstFinished = msg.firstFinished;
      (msg.karts || []).forEach(function (s) {
        var k = race.karts[s.id];
        if (!k) return;
        if (s.id === me.id) {
          /* soft snap */
          k.x = lerp(k.x, s.x, 0.35);
          k.z = lerp(k.z, s.z, 0.35);
          k.yaw = s.yaw;
          k.speed = s.speed;
        } else {
          k.x = s.x; k.z = s.z; k.yaw = s.yaw; k.speed = s.speed;
        }
        k.boost = s.boost;
        k.lap = s.lap;
        k.progress = s.progress;
        k.finished = s.finished;
        k.place = s.place;
        if (k.mesh) {
          k.mesh.position.set(k.x, 0.2, k.z);
          k.mesh.rotation.y = -k.yaw + Math.PI / 2;
        }
      });
      if (msg.phase === "countdown") {
        els.center.textContent = msg.countdown > 0 ? String(Math.ceil(msg.countdown)) : "GO!";
      } else if (msg.phase === "finishing") {
        els.center.textContent = "피니시 " + Math.ceil(msg.finishTimer) + "s";
      } else if (msg.phase !== "countdown") {
        els.center.textContent = "";
      }
    }

    function netSync(dt) {
      netAcc += dt;
      if (netAcc < 1 / TICK_HZ) return;
      netAcc = 0;
      if (!race) return;
      if (room.isHost) {
        broadcast({
          type: "state",
          t: race.t,
          phase: race.phase,
          countdown: race.countdown,
          finishTimer: race.finishTimer,
          firstFinished: race.firstFinished,
          karts: Object.keys(race.karts).map(function (id) {
            var k = race.karts[id];
            return {
              id: k.id, x: k.x, z: k.z, yaw: k.yaw, speed: k.speed, boost: k.boost,
              lap: k.lap, progress: k.progress, finished: k.finished, place: k.place
            };
          })
        });
      } else {
        sendToHost({ type: "input", id: me.id, input: (race.karts[me.id] && race.karts[me.id].input) || input });
        /* client also predicts self */
        if (race.phase === "running" || race.phase === "finishing") {
          var k = race.karts[me.id];
          if (k) stepKart(k, 1 / TICK_HZ);
        }
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

    function destroyRace() {
      cancelAnimationFrame(raf);
      raf = 0;
      physAcc = 0;
      if (race) {
        if (race._kd) window.removeEventListener("keydown", race._kd);
        if (race._ku) window.removeEventListener("keyup", race._ku);
        if (race.scene) {
          race.scene.traverse(function (obj) {
            if (!obj.isMesh) return;
            var sharedG = false, sharedM = false;
            Object.keys(sharedGeo).forEach(function (k) { if (sharedGeo[k] === obj.geometry) sharedG = true; });
            Object.keys(sharedMat).forEach(function (k) { if (sharedMat[k] === obj.material) sharedM = true; });
            if (obj.material && obj.material.dispose && !sharedM) obj.material.dispose();
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

    function startEightPlayerSim(opts) {
      opts = opts || {};
      room.isHost = true;
      room.mapId = opts.mapId || "village";
      room.mode = opts.mode || "solo";
      room.code = "LOAD8";
      room.hostId = me.id;
      me.name = opts.playerName || "Player1";
      me.color = COLORS[0];
      me.team = "A";
      me.ready = true;
      me.peerId = "local";
      room.players = [{
        id: me.id, name: me.name, color: me.color, team: "A", ready: true, peerId: "local", isBot: false
      }];
      for (var i = 1; i < MAX_PLAYERS; i++) {
        room.players.push({
          id: "BOT" + i,
          name: "Bot" + i,
          color: COLORS[i % COLORS.length],
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

    var apiHandle = {
      destroy: function () {
        destroyed = true;
        destroyRace();
        Object.keys(conns).forEach(function (k) { try { conns[k].close(); } catch (e) {} });
        conns = {};
        if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      startEightPlayerSim: startEightPlayerSim,
      getMetrics: getMetrics,
      getUiState: getUiState,
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
    desc: "최대 8인 P2P 3D 레이스 · 맵 3종 · 팀/개인전 · 드리프트·부스터",
    tags: ["레이싱", "멀티", "3D", "모바일"],
    accent: "#ff6b4a",
    hint: "조향·드리프트(Space)·부스터(Ctrl/Z) · 중앙 속도계 · 충돌 시 반동 후 재가속",
    create: create
  };
})(window);

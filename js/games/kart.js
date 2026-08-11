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
      touch: root.querySelector("#kart-touch"),
      wheel: root.querySelector("#kart-wheel"),
      knob: root.querySelector("#kart-knob"),
      driftBtn: root.querySelector("#kart-drift"),
      boostBtn: root.querySelector("#kart-boost")
    };

    var input = { steer: 0, throttle: 1, drift: false, boost: false };
    var keys = {};

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
          speed: 0,
          boost: 0.35,
          driftGauge: 0,
          drifting: false,
          progress: 0,
          lap: 1,
          laps: map.laps || LAPS,
          finished: false,
          finishTime: 0,
          place: 0,
          input: p.id === me.id ? input : { steer: 0, throttle: 1, drift: false, boost: false },
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
        trackLine: map.pts.slice()
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
      els.canvas.width = w * (global.devicePixelRatio || 1);
      els.canvas.height = h * (global.devicePixelRatio || 1);
      els.canvas.style.width = w + "px";
      els.canvas.style.height = h + "px";
      var renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
      renderer.setSize(w, h, false);
      renderer.setClearColor(race.map.theme.sky, 1);
      var scene = new THREE.Scene();
      scene.fog = new THREE.Fog(race.map.theme.sky, 40, 160);
      var camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 300);
      var hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.85);
      scene.add(hemi);
      var dir = new THREE.DirectionalLight(0xfff2d8, 0.75);
      dir.position.set(30, 50, 20);
      scene.add(dir);
      race.renderer = renderer;
      race.scene = scene;
      race.camera = camera;
    }

    function buildTrack() {
      var pts = race.map.pts;
      var theme = race.map.theme;
      var ground = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400),
        new THREE.MeshLambertMaterial({ color: theme.ground })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.05;
      race.scene.add(ground);

      var shape = [];
      var i;
      for (i = 0; i < pts.length; i++) shape.push(new THREE.Vector3(pts[i].x, 0.02, pts[i].z));
      shape.push(shape[0].clone());
      var curve = new THREE.CatmullRomCurve3(shape, true, "catmullrom", 0.1);
      var geo = new THREE.TubeGeometry(curve, Math.max(80, pts.length * 4), race.meta.halfW, 6, true);
      var road = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: theme.road }));
      race.scene.add(road);

      var curbGeo = new THREE.TubeGeometry(curve, Math.max(80, pts.length * 4), race.meta.halfW + 0.35, 4, true);
      var curb = new THREE.Mesh(curbGeo, new THREE.MeshLambertMaterial({ color: theme.curb }));
      curb.scale.set(1, 0.15, 1);
      race.scene.add(curb);

      /* start line */
      var s0 = pts[0], s1 = pts[1];
      var ang = Math.atan2(s1.z - s0.z, s1.x - s0.x);
      var start = new THREE.Mesh(
        new THREE.BoxGeometry(race.meta.halfW * 2, 0.05, 1.2),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      start.position.set(s0.x, 0.08, s0.z);
      start.rotation.y = -ang;
      race.scene.add(start);

      Object.keys(race.karts).forEach(function (id) {
        race.karts[id].mesh = makeKartMesh(race.karts[id].color);
        race.scene.add(race.karts[id].mesh);
      });
    }

    function makeKartMesh(color) {
      var g = new THREE.Group();
      var body = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.45, 2.1),
        new THREE.MeshLambertMaterial({ color: color })
      );
      body.position.y = 0.35;
      g.add(body);
      var cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.35, 0.9),
        new THREE.MeshLambertMaterial({ color: 0x222833 })
      );
      cabin.position.set(0, 0.65, -0.1);
      g.add(cabin);
      for (var i = 0; i < 4; i++) {
        var w = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.28, 0.25, 10),
          new THREE.MeshLambertMaterial({ color: 0x111111 })
        );
        w.rotation.z = Math.PI / 2;
        w.position.set(i % 2 ? 0.75 : -0.75, 0.28, i < 2 ? 0.7 : -0.7);
        g.add(w);
      }
      return g;
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

    function stepKart(k, dt) {
      if (k.finished) return;
      var inp = k.input || { steer: 0, throttle: 1, drift: false, boost: false };
      var maxSpeed = 28;
      var accel = 18;
      if (inp.drift && k.speed > 8) {
        k.drifting = true;
        k.yaw += inp.steer * 2.4 * dt;
        k.speed = Math.max(6, k.speed - 4 * dt);
        k.driftGauge = clamp(k.driftGauge + dt * 0.55, 0, 1);
        if (k.driftGauge >= 1) {
          k.boost = clamp(k.boost + 0.35, 0, 1);
          k.driftGauge = 0;
        }
      } else {
        if (k.drifting && k.driftGauge > 0.25) {
          k.boost = clamp(k.boost + k.driftGauge * 0.4, 0, 1);
        }
        k.drifting = false;
        k.driftGauge = Math.max(0, k.driftGauge - dt * 0.8);
        k.yaw += inp.steer * (1.5 + k.speed * 0.04) * dt;
      }
      var thr = inp.throttle;
      k.speed += thr * accel * dt;
      k.speed *= 1 - 0.35 * dt;
      if (inp.boost && k.boost > 0) {
        k.speed += 40 * dt;
        k.boost = Math.max(0, k.boost - 0.45 * dt);
        maxSpeed = 42;
      }
      k.speed = clamp(k.speed, -8, maxSpeed);
      k.x += Math.cos(k.yaw) * k.speed * dt;
      k.z += Math.sin(k.yaw) * k.speed * dt;

      var hit = nearestOnTrack(race.map.pts, race.meta, k.x, k.z);
      if (hit.dist > race.meta.halfW) {
        var push = (hit.dist - race.meta.halfW) * 0.6;
        var nx = (k.x - hit.px) / (hit.dist || 1);
        var nz = (k.z - hit.pz) / (hit.dist || 1);
        k.x -= nx * push;
        k.z -= nz * push;
        k.speed *= 0.85;
      }

      /* progress / laps — detect forward wrap */
      var prev = k.progress;
      var prog = hit.prog;
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
      if (k.mesh) {
        k.mesh.position.set(k.x, 0.2, k.z);
        k.mesh.rotation.y = -k.yaw + Math.PI / 2;
        k.mesh.rotation.z = inp.steer * -0.15;
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
        Object.keys(race.karts).forEach(function (id) { stepKart(race.karts[id], dt); });
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
      }

      var ranks = rankingList();
      var my = race.karts[me.id];
      if (my) {
        els.lap.textContent = "LAP " + Math.min(my.lap, my.laps) + "/" + my.laps;
        els.boostbar.style.width = Math.round(my.boost * 100) + "%";
        api.setScore(ranks.findIndex(function (k) { return k.id === me.id; }) + 1);
        updateCamera(my, dt);
      }
      els.rank.innerHTML = ranks.map(function (k, i) {
        return '<div class="kart-rank__row' + (k.id === me.id ? " is-me" : "") + '">' +
          "<b>" + (k.finished ? k.place : i + 1) + "</b> " +
          '<i style="background:' + k.color + '"></i>' + esc(k.name) +
          (race.mode === "team" ? " <small>팀" + k.team + "</small>" : "") +
          (k.finished ? " ✓" : "") +
          "</div>";
      }).join("");
      els.timer.textContent = fmt(race.t);
      drawMinimap(ranks);
    }

    function syncMeshesIdle() {
      Object.keys(race.karts).forEach(function (id) {
        var k = race.karts[id];
        if (k.mesh) {
          k.mesh.position.set(k.x, 0.2, k.z);
          k.mesh.rotation.y = -k.yaw + Math.PI / 2;
        }
      });
      var my = race.karts[me.id];
      if (my) updateCamera(my, 0.016);
    }

    function updateCamera(k, dt) {
      var back = 8.5, up = 4.2;
      var tx = k.x - Math.cos(k.yaw) * back;
      var tz = k.z - Math.sin(k.yaw) * back;
      var cam = race.camera;
      cam.position.x = lerp(cam.position.x, tx, 1 - Math.pow(0.001, dt));
      cam.position.y = lerp(cam.position.y, up, 0.1);
      cam.position.z = lerp(cam.position.z, tz, 1 - Math.pow(0.001, dt));
      cam.lookAt(k.x + Math.cos(k.yaw) * 6, 0.6, k.z + Math.sin(k.yaw) * 6);
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
      var dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      update(dt);
      netSync(dt);
      if (race.renderer && race.scene && race.camera) {
        race.renderer.render(race.scene, race.camera);
      }
      raf = requestAnimationFrame(loop);
    }

    function destroyRace() {
      cancelAnimationFrame(raf);
      raf = 0;
      if (race) {
        if (race._kd) window.removeEventListener("keydown", race._kd);
        if (race._ku) window.removeEventListener("keyup", race._ku);
        if (race.renderer) {
          race.renderer.dispose();
        }
      }
      race = null;
    }

    /* fix duplicate createRoom — call the second definition path via assign */
    renderLobby();

    return {
      destroy: function () {
        destroyed = true;
        destroyRace();
        Object.keys(conns).forEach(function (k) { try { conns[k].close(); } catch (e) {} });
        conns = {};
        if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  global.GWGames = global.GWGames || {};
  global.GWGames.kart = {
    id: "kart",
    title: "카드라이더",
    emoji: "🏎️",
    desc: "최대 8인 P2P 3D 레이스 · 맵 3종 · 팀/개인전 · 드리프트·부스터",
    tags: ["레이싱", "멀티", "3D", "모바일"],
    accent: "#ff6b4a",
    hint: "핸들·드리프트(Space)·부스터(Ctrl/Z) · 방 코드로 친구 초대 · 1등 후 10초",
    create: create
  };
})(window);

/**
 * 아레나 / 경찰과 도둑 — 아케이드 동등 멀티플레이
 * 공개방 방장이 Peer 호스트 · 메시 P2P · GWRoomIntent로 로비에서 바로 생성/참가
 */
(function (global) {
  "use strict";

  function ensureCss() {
    if (document.getElementById("minihub-css")) return;
    var link = document.createElement("link");
    link.id = "minihub-css";
    link.rel = "stylesheet";
    link.href = "css/minihub.css";
    document.head.appendChild(link);
  }

  function isFastMsg(m) {
    if (!m || !m.t) return false;
    return m.t === "arena" || m.t === "cops" || m.t === "count" || m.t === "pose";
  }

  function createForGame(defaultGame, stage, api, intent) {
    ensureCss();
    stage.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "minihub-stage";
    wrap.style.cssText = "position:relative;width:100%;min-height:520px;height:min(78vh,820px);";
    var root = document.createElement("div");
    root.id = "mgRoot";
    root.className = "mg-root";
    root.style.position = "absolute";
    root.style.inset = "0";
    root.style.zIndex = "1";
    wrap.appendChild(root);
    stage.appendChild(wrap);

    var bus = null;
    var engine = null;
    var mg = null;
    var mode = null;
    var hostPeerId = null;
    var publicCode = null;
    var gameType = defaultGame === "cops" ? "cops" : "arena";

    function deliver(msg) {
      if (mg && mg.pushIncoming) mg.pushIncoming(msg);
    }

    function clearPublic() {
      if (publicCode && global.GWPublicRooms) {
        try { GWPublicRooms.unannounce(publicCode); } catch (e) {}
      }
      publicCode = null;
    }

    function destroyNet() {
      clearPublic();
      try { if (engine) engine.destroy(); } catch (e) {}
      engine = null;
      try { if (bus) bus.destroy(); } catch (e) {}
      bus = null;
      mode = null;
      hostPeerId = null;
    }

    function emitNet(m) {
      if (!bus) return;
      if (isFastMsg(m) && bus.broadcastFast) bus.broadcastFast(m);
      else bus.broadcast(m);
    }

    function announcePublic(opts) {
      if (!opts || !opts.isPublic || !bus || !global.GWPublicRooms) return;
      publicCode = bus.code;
      GWPublicRooms.announce({
        code: bus.code,
        game: gameType,
        name: opts.roomName || (opts.name + "의 방"),
        host: opts.name,
        players: 1,
        max: 8,
        started: false
      });
    }

    function refreshPublicCount() {
      if (!publicCode || !engine || !global.GWPublicRooms) return;
      var st = engine.getState();
      GWPublicRooms.update(publicCode, {
        players: (st.players || []).length,
        started: !!(st.game && st.game.started)
      });
    }

    function startHost(msg) {
      destroyNet();
      mode = "host";
      gameType = msg.gameType === "cops" ? "cops" : "arena";
      var code = (global.GWPeerBus && GWPeerBus.uid(6)) || Math.random().toString(36).slice(2, 8).toUpperCase();
      bus = GWPeerBus.createHost(code);
      hostPeerId = "MG" + code;
      bus.onMessage(function (m, from) {
        if (m && m.t === "_peer_close") {
          if (engine) engine.removePlayer(m.peerId || from);
          refreshPublicCount();
          return;
        }
        if (m && m.t === "pose") {
          if (engine) {
            engine.handleMessage(from, {
              t: "action", a: "input",
              mvx: m.mvx, mvy: m.mvy, angle: m.angle,
              shoot: m.shoot, dash: m.dash, interact: m.interact,
              repair: m.repair, recall: m.recall,
              phase: m.phase, stab: m.stab, defend: m.defend,
              stop: m.stop, sit: m.sit, wave: m.wave,
              push: m.push, shield: m.shield
            });
          }
          var hid = hostPeerId || (bus && bus.hostId);
          var pid = (from === hid || from == null) ? "__host__" : from;
          deliver(Object.assign({ i: pid, id: pid }, m));
          return;
        }
        if (engine) {
          engine.handleMessage(from, m);
          refreshPublicCount();
        }
      });

      function wireEngine() {
        engine = GWMgEngine.createHostRoom({
          code: bus.code,
          gameType: gameType,
          roomName: msg.roomName || "",
          password: "",
          hostPlayer: { name: msg.name || "방장" },
          onSend: function (peerId, m) {
            if (peerId == null) deliver(m);
            else if (bus) bus.sendTo(peerId, m, isFastMsg(m));
          },
          onBroadcast: function (m) {
            deliver(m);
            emitNet(m);
            if (m && (m.t === "state" || m.t === "arena-end" || m.t === "cops-end")) refreshPublicCount();
          }
        });
        deliver({
          t: "joined",
          code: bus.code,
          id: "__host__",
          isHost: true,
          gameType: gameType,
          roomName: (engine.getState() && engine.getState().roomName) || ""
        });
        var st = engine.getState();
        deliver({
          t: "state",
          code: st.code,
          gameType: st.gameType,
          roomName: st.roomName,
          players: st.players,
          game: st.game
        });
        deliver({ t: "rankings", rankings: (GWRanking && GWRanking.allRankings()) || {} });
        if (api && api.setScore) api.setScore(0);
        if (bus.announceRoster) bus.announceRoster();
        announcePublic(msg);
      }

      bus.start(function (err) {
        if (err) {
          deliver({ t: "error", msg: "P2P 방 생성 실패: " + (err.message || err.type || err) });
          destroyNet();
          return;
        }
        hostPeerId = bus.hostId || ("MG" + bus.code);
        wireEngine();
      });
    }

    function startClient(msg) {
      destroyNet();
      mode = "client";
      gameType = msg.gameType === "cops" ? "cops" : (msg.gameType || gameType);
      var code = String(msg.code || "").replace(/^MG/i, "").toUpperCase();
      bus = GWPeerBus.joinHost(code);
      hostPeerId = "MG" + code;
      bus.onMessage(function (m, from) {
        if (m && m.t === "_peer_close") {
          if (from === hostPeerId || m.peerId === hostPeerId) {
            deliver({ t: "error", msg: "방장 연결이 끊겼습니다." });
            destroyNet();
          }
          return;
        }
        if (m && m.t === "pose") {
          var hid = hostPeerId || (bus && bus.hostId);
          var pid = (from === hid) ? "__host__" : from;
          deliver(Object.assign({ i: pid, id: pid }, m));
          return;
        }
        deliver(m);
      });
      bus.start(function (err) {
        if (err) {
          deliver({ t: "error", msg: "방 참가 실패. 코드/방장 접속을 확인하세요." });
          destroyNet();
          return;
        }
        if (bus.ensureMesh) bus.ensureMesh();
        bus.send({ t: "join", name: msg.name, password: "" });
      });
    }

    var bridge = {
      ensure: function (cb) { cb && cb(); },
      destroy: destroyNet,
      send: function (obj) {
        if (!obj || !obj.t) return;

        if (obj.t === "login") {
          var auth = GWRanking.auth(obj.name, obj.password || "guest");
          if (auth.ok) {
            deliver({
              t: "auth", ok: true, name: auth.acc.name, created: !!auth.created,
              rankings: GWRanking.allRankings()
            });
          } else {
            /* 로비에서 이미 닉네임만 쓰는 경우 */
            GWRanking.ensureAcc(obj.name);
            GWRanking.setProfile(obj.name, "guest");
            deliver({
              t: "auth", ok: true, name: obj.name, created: false,
              rankings: GWRanking.allRankings()
            });
          }
          return;
        }
        if (obj.t === "ranking" || obj.t === "rankings") {
          deliver({ t: "rankings", rankings: GWRanking.allRankings() });
          return;
        }
        if (obj.t === "list" || obj.t === "rooms") {
          var rooms = global.GWPublicRooms ? GWPublicRooms.list().filter(function (r) {
            return r.game === gameType || r.game === "arena" || r.game === "cops";
          }) : [];
          if (engine && mode === "host") {
            var st = engine.getState();
            rooms.unshift({
              code: engine.code,
              gameType: st.gameType,
              game: st.gameType,
              name: st.roomName,
              count: (st.players || []).length,
              players: (st.players || []).length,
              hasPw: false,
              started: !!(st.game && st.game.started)
            });
          }
          deliver({ t: "rooms", rooms: rooms });
          return;
        }
        if (obj.t === "create") {
          if (!global.Peer || !global.GWPeerBus || !global.GWMgEngine) {
            deliver({ t: "error", msg: "P2P 엔진을 불러오지 못했습니다." });
            return;
          }
          startHost({
            name: obj.name,
            gameType: obj.gameType || gameType,
            roomName: obj.roomName || "",
            isPublic: obj.isPublic !== false
          });
          return;
        }
        if (obj.t === "join") {
          if (!global.Peer || !global.GWPeerBus) {
            deliver({ t: "error", msg: "PeerJS를 불러오지 못했습니다." });
            return;
          }
          startClient(obj);
          return;
        }
        if (obj.t === "leave") {
          destroyNet();
          return;
        }

        if (obj.t === "action" && obj.a === "input" && bus && bus.broadcastMesh) {
          var pose = {
            t: "pose",
            mvx: obj.mvx, mvy: obj.mvy, angle: obj.angle,
            shoot: obj.shoot, dash: obj.dash, interact: obj.interact,
            repair: obj.repair, recall: obj.recall,
            phase: obj.phase, stab: obj.stab, defend: obj.defend,
            stop: obj.stop, sit: obj.sit, wave: obj.wave,
            push: obj.push, shield: obj.shield
          };
          if (mode === "host" && engine) {
            engine.handleMessage(null, obj);
            bus.broadcastMesh(pose, true);
            return;
          }
          if (mode === "client") {
            bus.broadcastMesh(pose, true);
            /* 메시 미구성 시에도 방장에게 입력 보장 */
            if (bus.getMeshSize && bus.getMeshSize() === 0) bus.send(obj);
            return;
          }
        }

        if (mode === "host" && engine) {
          engine.handleMessage(null, obj);
          return;
        }
        if (mode === "client" && bus) {
          bus.send(obj);
          return;
        }
      }
    };

    if (!global.MGFactory || !MGFactory.create) {
      root.innerHTML = '<div class="mg-err" style="margin:24px">미니게임 클라이언트를 불러오지 못했습니다.</div>';
      return { destroy: function () { destroyNet(); stage.innerHTML = ""; } };
    }

    mg = MGFactory.create(root, bridge, { defaultGame: gameType, arcadeMode: true });
    mg.open();

    /* 로비 공개방/참가 인텐트 자동 실행 */
    var name = (intent && intent.name) ||
      (global.GWRanking && GWRanking.getProfile() && GWRanking.getProfile().name) ||
      "플레이어";
    if (intent && intent.action === "create") {
      bridge.send({
        t: "login", name: name, password: "guest"
      });
      setTimeout(function () {
        bridge.send({
          t: "create",
          name: name,
          gameType: intent.game === "cops" ? "cops" : gameType,
          roomName: intent.roomName || (name + "의 방"),
          isPublic: intent.isPublic !== false
        });
      }, 40);
    } else if (intent && intent.action === "join" && intent.code) {
      bridge.send({ t: "login", name: name, password: "guest" });
      setTimeout(function () {
        bridge.send({
          t: "join",
          name: name,
          code: intent.code,
          gameType: intent.game === "cops" ? "cops" : gameType
        });
      }, 40);
    } else {
      /* 카드 클릭: 간단한 방 만들기/참가 UI는 클라이언트가 담당 */
      bridge.send({ t: "login", name: name, password: "guest" });
    }

    return {
      destroy: function () {
        try { if (mg) mg.close(); } catch (e) {}
        destroyNet();
        stage.innerHTML = "";
      }
    };
  }

  global.GWGames = global.GWGames || {};

  global.GWGames.arena = {
    id: "arena",
    title: "아레나",
    emoji: "🕹️",
    desc: "팀 슈팅 · 넥서스 파괴전 · 공개방 P2P",
    tags: ["멀티", "P2P", "공개방"],
    accent: "#f43f5e",
    hint: "터치한 방향으로 사격 · 로비에서 방 만들기/참가",
    create: function (stage, api, intent) {
      return createForGame("arena", stage, api, intent);
    }
  };

  global.GWGames.cops = {
    id: "cops",
    title: "경찰과 도둑",
    emoji: "🕵️",
    desc: "유물부수기 · AI처럼 행동하기 · 공개방 P2P",
    tags: ["멀티", "P2P", "공개방"],
    accent: "#38bdf8",
    hint: "로비에서 방 만들기/참가 · 멀티 메뉴에서 바로 입장",
    create: function (stage, api, intent) {
      return createForGame("cops", stage, api, intent);
    }
  };
})(window);

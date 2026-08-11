/**
 * Mesh P2P bus — 부하를 피어 전원에 분산
 *
 * - reliable: 로비/조인/설정 (순서·전달 보장)
 * - fast(unreliable): 틱·포즈·레이스 상태 (지연 최소화)
 * - mesh: 참가자가 서로 연결 → 방장 업링크에만 의존하지 않음
 * - broadcastDistributed: 방장은 소수 릴레이에게만 보내고, 릴레이가 나머지에 fan-out
 * - 호스트 이탈 시 electSuccessor로 승계 후보 선정
 */
(function (global) {
  "use strict";

  function uid(n) {
    return Math.random().toString(36).slice(2, 2 + (n || 6)).toUpperCase();
  }

  function createBus(opts) {
    opts = opts || {};
    var prefix = opts.prefix || "MG";
    var code = String(opts.code || uid(6)).replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8);
    if (code.length < 4) code = uid(6);
    var isHost = !!opts.isHost;
    var peerId = isHost ? prefix + code : undefined;
    var peer = null;
    var rel = {}; /* peerId -> reliable DataConnection */
    var fast = {}; /* peerId -> unreliable DataConnection */
    var handlers = [];
    var readyCbs = [];
    var open = false;
    var destroyed = false;
    var myId = null;
    var hostPeerId = prefix + code;
    var knownPeers = {}; /* peerId -> true */
    var meshPending = {};

    function emit(msg, from) {
      handlers.forEach(function (fn) {
        try { fn(msg, from); } catch (e) { console.warn(e); }
      });
    }

    function safeSend(conn, msg) {
      if (!conn || !conn.open) return false;
      try {
        conn.send(msg);
        return true;
      } catch (e) {
        return false;
      }
    }

    function parseData(data) {
      if (typeof data === "string") {
        try { return JSON.parse(data); } catch (e) { return null; }
      }
      return data;
    }

    function remember(pid) {
      if (!pid || pid === myId) return;
      knownPeers[pid] = true;
    }

    function dropPeer(pid) {
      delete knownPeers[pid];
      delete meshPending[pid];
      try { if (rel[pid]) rel[pid].close(); } catch (e) {}
      try { if (fast[pid]) fast[pid].close(); } catch (e) {}
      delete rel[pid];
      delete fast[pid];
    }

    function wireData(conn, channel) {
      conn.on("data", function (data) {
        var msg = parseData(data);
        if (!msg) return;
        /* distributed fan-out: relay forwards once */
        if (msg._fwd && msg._payload) {
          var targets = msg._to || [];
          var payload = msg._payload;
          targets.forEach(function (tid) {
            if (tid === myId) return;
            sendRaw(tid, payload, !!msg._fast);
          });
          emit(payload, msg._from || conn.peer);
          return;
        }
        if (msg.t === "_mesh_hello") {
          remember(conn.peer);
          if (msg.peers) msg.peers.forEach(remember);
          ensureMesh();
          return;
        }
        if (msg.t === "_mesh_roster") {
          (msg.peers || []).forEach(remember);
          ensureMesh();
          return;
        }
        if (msg.t === "_host_migrate") {
          emit(msg, conn.peer);
          return;
        }
        emit(msg, conn.peer);
      });
      conn.on("close", function () {
        var pid = conn.peer;
        if (channel === "rel") delete rel[pid];
        else delete fast[pid];
        if (!rel[pid] && !fast[pid]) {
          delete knownPeers[pid];
          emit({ t: "_peer_close", peerId: pid }, pid);
        }
      });
      conn.on("error", function () {
        var pid = conn.peer;
        if (channel === "rel") delete rel[pid];
        else delete fast[pid];
      });
    }

    function openFast(pid) {
      if (!peer || !myId || pid === myId || fast[pid] || meshPending[pid + ":f"]) return;
      meshPending[pid + ":f"] = true;
      var c = peer.connect(pid, { reliable: false, label: "fast", serialization: "json" });
      c.on("open", function () {
        delete meshPending[pid + ":f"];
        fast[pid] = c;
        wireData(c, "fast");
        safeSend(c, { t: "_mesh_hello", peers: Object.keys(knownPeers).concat([myId]) });
      });
      c.on("error", function () { delete meshPending[pid + ":f"]; });
    }

    function openRel(pid) {
      if (!peer || !myId || pid === myId || rel[pid] || meshPending[pid + ":r"]) return;
      meshPending[pid + ":r"] = true;
      var c = peer.connect(pid, { reliable: true, label: "ctrl", serialization: "json" });
      c.on("open", function () {
        delete meshPending[pid + ":r"];
        rel[pid] = c;
        wireData(c, "rel");
        remember(pid);
        safeSend(c, { t: "_mesh_hello", peers: Object.keys(knownPeers).concat([myId]) });
        openFast(pid);
        if (isHost) announceRoster();
      });
      c.on("error", function () { delete meshPending[pid + ":r"]; });
    }

    function onIncoming(conn) {
      conn.on("open", function () {
        var label = conn.label || "";
        remember(conn.peer);
        if (label === "fast" || conn.reliable === false) {
          fast[conn.peer] = conn;
          wireData(conn, "fast");
        } else {
          rel[conn.peer] = conn;
          wireData(conn, "rel");
          openFast(conn.peer);
        }
        if (isHost) announceRoster();
        else ensureMesh();
      });
    }

    function announceRoster() {
      var peers = Object.keys(knownPeers);
      if (myId) peers.push(myId);
      var roster = { t: "_mesh_roster", peers: peers, host: hostPeerId };
      Object.keys(rel).forEach(function (k) { safeSend(rel[k], roster); });
      /* also nudge mesh among clients */
      peers.forEach(function (pid) {
        if (pid !== myId) {
          openRel(pid);
          openFast(pid);
        }
      });
    }

    function ensureMesh() {
      Object.keys(knownPeers).forEach(function (pid) {
        if (pid === myId) return;
        if (!rel[pid]) openRel(pid);
        else if (!fast[pid]) openFast(pid);
      });
    }

    function sendRaw(pid, msg, useFast) {
      if (useFast && fast[pid] && fast[pid].open) return safeSend(fast[pid], msg);
      if (rel[pid] && rel[pid].open) return safeSend(rel[pid], msg);
      if (fast[pid] && fast[pid].open) return safeSend(fast[pid], msg);
      return false;
    }

    function allPeerIds() {
      var set = {};
      Object.keys(rel).forEach(function (k) { set[k] = true; });
      Object.keys(fast).forEach(function (k) { set[k] = true; });
      Object.keys(knownPeers).forEach(function (k) { set[k] = true; });
      return Object.keys(set).filter(function (k) { return k && k !== myId; });
    }

    function start(cb) {
      if (!global.Peer) {
        cb && cb(new Error("PeerJS 없음"));
        return;
      }
      peer = isHost ? new global.Peer(peerId, { debug: 0 }) : new global.Peer({ debug: 0 });
      api.peer = peer;
      peer.on("open", function (id) {
        open = true;
        myId = id;
        api.id = id;
        api.code = code;
        api.hostId = hostPeerId;
        if (!isHost) {
          remember(hostPeerId);
          var conn = peer.connect(hostPeerId, { reliable: true, label: "ctrl", serialization: "json" });
          conn.on("open", function () {
            rel[hostPeerId] = conn;
            wireData(conn, "rel");
            openFast(hostPeerId);
            readyCbs.forEach(function (f) { f(); });
            cb && cb(null, { id: id, code: code });
          });
          conn.on("error", function (err) {
            cb && cb(err || new Error("방 연결 실패"));
          });
        } else {
          readyCbs.forEach(function (f) { f(); });
          cb && cb(null, { id: id, code: code });
        }
      });
      peer.on("connection", onIncoming);
      peer.on("error", function (err) {
        if (String(err && err.type) === "unavailable-id" && isHost) {
          code = uid(6);
          hostPeerId = prefix + code;
          peer.destroy();
          peerId = prefix + code;
          start(cb);
          return;
        }
        console.warn("PeerBus", err);
        if (!open) cb && cb(err);
      });
    }

    /**
     * 방장 업링크 분산: 소수 릴레이에게만 전체 페이로드 + 전달 목록을 보냄.
     * 메시가 얇으면 전원 직접 전송.
     */
    function broadcastDistributed(msg, useFast) {
      var peers = allPeerIds().filter(function (pid) {
        return (rel[pid] && rel[pid].open) || (fast[pid] && fast[pid].open);
      });
      if (peers.length <= 2) {
        peers.forEach(function (pid) { sendRaw(pid, msg, useFast); });
        return;
      }
      var relayCount = Math.min(peers.length, Math.max(2, Math.ceil(Math.sqrt(peers.length))));
      var relays = peers.slice(0, relayCount);
      var rest = peers.slice(relayCount);
      var chunk = Math.ceil(rest.length / Math.max(1, relays.length));
      relays.forEach(function (rid, i) {
        var slice = rest.slice(i * chunk, (i + 1) * chunk);
        if (!slice.length) {
          sendRaw(rid, msg, useFast);
          return;
        }
        sendRaw(rid, {
          _fwd: 1,
          _fast: !!useFast,
          _from: myId,
          _to: slice,
          _payload: msg
        }, useFast);
        sendRaw(rid, msg, useFast);
      });
    }

    function broadcastAll(msg, useFast) {
      allPeerIds().forEach(function (pid) { sendRaw(pid, msg, useFast); });
    }

    var api = {
      code: code,
      id: null,
      hostId: hostPeerId,
      isHost: isHost,
      peer: null,
      start: start,
      onReady: function (fn) { if (open) fn(); else readyCbs.push(fn); },
      onMessage: function (fn) { handlers.push(fn); },
      /** reliable 기본 전송 (로비/제어) */
      send: function (msg) { broadcastAll(msg, false); },
      sendTo: function (pid, msg, useFast) { sendRaw(pid, msg, !!useFast); },
      broadcast: function (msg) { broadcastAll(msg, false); },
      /** 게임 틱 — unreliable + 가능하면 분산 fan-out */
      broadcastFast: function (msg) {
        if (isHost) broadcastDistributed(msg, true);
        else broadcastAll(msg, true);
      },
      /** 메시 전원에게 (자기 포즈 등) — 방장 경유 없음 */
      broadcastMesh: function (msg, useFast) {
        broadcastAll(msg, useFast !== false);
      },
      getConnections: function () { return allPeerIds(); },
      getMeshSize: function () {
        return allPeerIds().filter(function (pid) {
          return (rel[pid] && rel[pid].open) || (fast[pid] && fast[pid].open);
        }).length;
      },
      ensureMesh: ensureMesh,
      announceRoster: announceRoster,
      electSuccessor: function () {
        return allPeerIds().filter(function (pid) {
          return (rel[pid] && rel[pid].open) || (fast[pid] && fast[pid].open);
        }).sort()[0] || null;
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        Object.keys(rel).forEach(function (k) { try { rel[k].close(); } catch (e) {} });
        Object.keys(fast).forEach(function (k) { try { fast[k].close(); } catch (e) {} });
        rel = {};
        fast = {};
        knownPeers = {};
        if (peer) {
          try { peer.destroy(); } catch (e) {}
          peer = null;
        }
        api.peer = null;
      }
    };

    return api;
  }

  global.GWPeerBus = {
    createHost: function (code) { return createBus({ isHost: true, code: code, prefix: "MG" }); },
    joinHost: function (code) { return createBus({ isHost: false, code: code, prefix: "MG" }); },
    create: function (opts) { return createBus(opts || {}); },
    uid: uid
  };
})(window);

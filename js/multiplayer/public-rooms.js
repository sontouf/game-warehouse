/**
 * 공개방 디렉터리 — PeerJS 고정 ID로 방 목록 공유 (서버 없음)
 * 방 만든 사람이 공개방 주인이며, 디렉터리에 announce 한다.
 * 디렉터리 피어(GWROOMS)는 최초 선점한 탭이 담당하고, 나머지는 구독한다.
 */
(function (global) {
  "use strict";

  var DIR_ID = "GWROOMS01";
  var HEARTBEAT_MS = 8000;
  var STALE_MS = 20000;

  var peer = null;
  var isDir = false;
  var dirConn = null;
  var rooms = {}; /* code -> room meta */
  var listeners = [];
  var hbTimer = null;
  var myAnnounces = {}; /* code -> meta */
  var ready = false;
  var starting = false;

  function emit() {
    var list = Object.keys(rooms).map(function (k) { return rooms[k]; })
      .filter(function (r) { return r && (Date.now() - (r.at || 0) < STALE_MS); })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    listeners.forEach(function (fn) {
      try { fn(list.slice()); } catch (e) {}
    });
  }

  function prune() {
    var now = Date.now();
    Object.keys(rooms).forEach(function (k) {
      if (now - (rooms[k].at || 0) > STALE_MS) delete rooms[k];
    });
  }

  function broadcastList() {
    prune();
    var list = Object.keys(rooms).map(function (k) { return rooms[k]; });
    if (!peer) return;
    /* directory host: push to all connections */
    if (isDir && peer._gwConns) {
      Object.keys(peer._gwConns).forEach(function (id) {
        var c = peer._gwConns[id];
        try { if (c.open) c.send({ t: "list", rooms: list }); } catch (e) {}
      });
    }
    emit();
  }

  function wireDirClient(conn) {
    dirConn = conn;
    conn.on("data", function (msg) {
      if (!msg) return;
      if (msg.t === "list") {
        rooms = {};
        (msg.rooms || []).forEach(function (r) {
          if (r && r.code) rooms[r.code] = r;
        });
        emit();
      }
    });
    conn.on("close", function () {
      dirConn = null;
      /* retry as directory or client */
      setTimeout(function () { start(); }, 1200);
    });
    try { conn.send({ t: "sub" }); } catch (e) {}
    Object.keys(myAnnounces).forEach(function (code) {
      try { conn.send({ t: "announce", room: myAnnounces[code] }); } catch (e) {}
    });
  }

  function wireDirHost(conn) {
    if (!peer._gwConns) peer._gwConns = {};
    peer._gwConns[conn.peer] = conn;
    conn.on("data", function (msg) {
      if (!msg) return;
      if (msg.t === "sub") {
        prune();
        try { conn.send({ t: "list", rooms: Object.keys(rooms).map(function (k) { return rooms[k]; }) }); } catch (e) {}
      } else if (msg.t === "announce" && msg.room && msg.room.code) {
        var r = Object.assign({}, msg.room, { at: Date.now() });
        rooms[r.code] = r;
        broadcastList();
      } else if (msg.t === "unannounce" && msg.code) {
        delete rooms[msg.code];
        broadcastList();
      } else if (msg.t === "heartbeat" && msg.code && rooms[msg.code]) {
        rooms[msg.code].at = Date.now();
        if (msg.players != null) rooms[msg.code].players = msg.players;
        if (msg.started != null) rooms[msg.code].started = msg.started;
      }
    });
    conn.on("close", function () {
      delete peer._gwConns[conn.peer];
    });
  }

  function becomeDirectory() {
    isDir = true;
    ready = true;
    peer.on("connection", function (conn) {
      conn.on("open", function () { wireDirHost(conn); });
    });
    /* re-apply local announces */
    Object.keys(myAnnounces).forEach(function (code) {
      rooms[code] = Object.assign({}, myAnnounces[code], { at: Date.now() });
    });
    broadcastList();
    starting = false;
  }

  function connectAsClient() {
    isDir = false;
    var conn = peer.connect(DIR_ID, { reliable: true });
    conn.on("open", function () {
      ready = true;
      starting = false;
      wireDirClient(conn);
    });
    conn.on("error", function () {
      starting = false;
      setTimeout(function () { start(); }, 1500);
    });
  }

  function start() {
    if (!global.Peer) return;
    if (starting || (peer && !peer.destroyed && ready)) return;
    starting = true;
    ready = false;
    if (peer) {
      try { peer.destroy(); } catch (e) {}
      peer = null;
    }
    peer = new global.Peer(DIR_ID, { debug: 0 });
    peer.on("open", function () {
      becomeDirectory();
    });
    peer.on("error", function (err) {
      if (String(err && err.type) === "unavailable-id") {
        try { peer.destroy(); } catch (e) {}
        peer = new global.Peer({ debug: 0 });
        peer.on("open", function () { connectAsClient(); });
        peer.on("error", function () { starting = false; });
        return;
      }
      starting = false;
      console.warn("GWPublicRooms", err);
    });
  }

  function ensureHeartbeat() {
    if (hbTimer) return;
    hbTimer = setInterval(function () {
      Object.keys(myAnnounces).forEach(function (code) {
        var meta = myAnnounces[code];
        meta.at = Date.now();
        if (isDir) {
          rooms[code] = Object.assign({}, meta);
          broadcastList();
        } else if (dirConn && dirConn.open) {
          try {
            dirConn.send({
              t: "heartbeat",
              code: code,
              players: meta.players,
              started: meta.started
            });
          } catch (e) {}
        }
      });
      prune();
      emit();
    }, HEARTBEAT_MS);
  }

  global.GWPublicRooms = {
    start: start,
    onUpdate: function (fn) {
      listeners.push(fn);
      start();
      ensureHeartbeat();
      prune();
      fn(Object.keys(rooms).map(function (k) { return rooms[k]; }));
      return function () {
        listeners = listeners.filter(function (f) { return f !== fn; });
      };
    },
    announce: function (meta) {
      if (!meta || !meta.code) return;
      start();
      ensureHeartbeat();
      var room = {
        code: String(meta.code).toUpperCase(),
        game: meta.game || "arena",
        name: String(meta.name || "공개방").slice(0, 24),
        host: String(meta.host || "").slice(0, 12),
        players: meta.players || 1,
        max: meta.max || 8,
        started: !!meta.started,
        public: true,
        at: Date.now()
      };
      myAnnounces[room.code] = room;
      if (isDir) {
        rooms[room.code] = room;
        broadcastList();
      } else if (dirConn && dirConn.open) {
        try { dirConn.send({ t: "announce", room: room }); } catch (e) {}
      }
    },
    update: function (code, patch) {
      code = String(code || "").toUpperCase();
      if (!myAnnounces[code]) return;
      Object.assign(myAnnounces[code], patch || {}, { at: Date.now() });
      if (isDir) {
        rooms[code] = Object.assign({}, myAnnounces[code]);
        broadcastList();
      } else if (dirConn && dirConn.open) {
        try {
          dirConn.send({
            t: "heartbeat",
            code: code,
            players: myAnnounces[code].players,
            started: myAnnounces[code].started
          });
        } catch (e) {}
      }
    },
    unannounce: function (code) {
      code = String(code || "").toUpperCase();
      delete myAnnounces[code];
      if (isDir) {
        delete rooms[code];
        broadcastList();
      } else if (dirConn && dirConn.open) {
        try { dirConn.send({ t: "unannounce", code: code }); } catch (e) {}
      }
    },
    list: function () {
      prune();
      return Object.keys(rooms).map(function (k) { return rooms[k]; });
    },
    destroy: function () {
      Object.keys(myAnnounces).forEach(function (c) {
        global.GWPublicRooms.unannounce(c);
      });
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = null;
      if (peer) {
        try { peer.destroy(); } catch (e) {}
        peer = null;
      }
      ready = false;
      isDir = false;
    }
  };
})(window);

/**
 * 게임창고 통합 랭킹 (localStorage)
 * - 싱글/멀티 공통 프로필·점수
 * - P2P 방에서는 호스트가 award 이벤트를 브로드캐스트하면 클라가 병합
 */
(function (global) {
  "use strict";

  var KEY = "game-warehouse-ranks-v1";
  var PROFILE_KEY = "game-warehouse-profile-v1";
  var RANK_GAMES = ["arena", "cops", "kart", "tetris", "farm", "snake", "breakout", "puzzle2048"];
  var STAT_FIELDS = ["kills", "deaths", "catches", "steals", "deliveries"];

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (!d.accounts) d.accounts = {};
      return d;
    } catch (e) {
      return { accounts: {} };
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
    return data;
  }

  function hashPw(p) {
    var s = String(p || "");
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8) + ("00000000" + (s.length * 2654435761 >>> 0).toString(16)).slice(-8);
  }

  function getProfile() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function setProfile(name, pw) {
    var p = { name: String(name || "").trim().slice(0, 12), pwHash: hashPw(pw), at: Date.now() };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    return p;
  }

  function clearProfile() {
    localStorage.removeItem(PROFILE_KEY);
  }

  function auth(name, pw) {
    name = String(name || "").trim().slice(0, 12);
    if (name.length < 1) return { ok: false, err: "이름을 입력하세요." };
    if (String(pw || "").length < 1) return { ok: false, err: "비밀번호를 입력하세요." };
    var data = load();
    var h = hashPw(pw);
    var acc = data.accounts[name];
    if (!acc) {
      acc = { name: name, pw: h, games: {} };
      data.accounts[name] = acc;
      save(data);
      setProfile(name, pw);
      return { ok: true, acc: acc, created: true };
    }
    if (acc.pw !== h) return { ok: false, err: "비밀번호가 일치하지 않습니다." };
    setProfile(name, pw);
    return { ok: true, acc: acc };
  }

  function ensureAcc(name) {
    var data = load();
    if (!data.accounts[name]) {
      data.accounts[name] = { name: name, pw: "", games: {} };
      save(data);
    }
    return data.accounts[name];
  }

  function award(name, game, pts, win, extra) {
    if (!name || !game) return;
    var data = load();
    var acc = data.accounts[name] || (data.accounts[name] = { name: name, pw: "", games: {} });
    var gs = acc.games[game] || (acc.games[game] = {});
    gs.score = (gs.score || 0) + (pts || 0);
    gs.plays = (gs.plays || 0) + 1;
    if (win) gs.wins = (gs.wins || 0) + 1;
    if (extra) {
      for (var i = 0; i < STAT_FIELDS.length; i++) {
        var k = STAT_FIELDS[i];
        if (extra[k]) gs[k] = (gs[k] || 0) + extra[k];
      }
      if (extra.streak) gs.streak = Math.max(gs.streak || 0, extra.streak);
      if (extra.best != null) gs.best = Math.max(gs.best || 0, extra.best);
    }
    save(data);
    return gs;
  }

  /** 싱글 플레이 최고점 (plays 증가 없음) */
  function recordBest(name, game, score) {
    name = name || (getProfile() && getProfile().name) || "Guest";
    var data = load();
    var acc = data.accounts[name] || (data.accounts[name] = { name: name, pw: "", games: {} });
    var gs = acc.games[game] || (acc.games[game] = {});
    var s = score || 0;
    var changed = false;
    if (s > (gs.best || 0)) { gs.best = s; changed = true; }
    if (s > (gs.score || 0)) { gs.score = s; changed = true; }
    if (changed) save(data);
    return gs;
  }

  function notePlay(name, game) {
    name = name || (getProfile() && getProfile().name) || "Guest";
    var data = load();
    var acc = data.accounts[name] || (data.accounts[name] = { name: name, pw: "", games: {} });
    var gs = acc.games[game] || (acc.games[game] = {});
    gs.plays = (gs.plays || 0) + 1;
    save(data);
    return gs;
  }

  function mergePeerAwards(list) {
    if (!list || !list.length) return;
    list.forEach(function (a) {
      award(a.name, a.game, a.pts || 0, !!a.win, a.extra || null);
    });
  }

  function statRow(a, game) {
    var g = (a.games && a.games[game]) || {};
    return {
      name: a.name,
      score: g.score || 0,
      wins: g.wins || 0,
      plays: g.plays || 0,
      best: g.best || 0,
      kills: g.kills || 0,
      deaths: g.deaths || 0,
      catches: g.catches || 0,
      steals: g.steals || 0,
      streak: g.streak || 0,
      deliveries: g.deliveries || 0
    };
  }

  function rankingFor(game, top) {
    top = top || 20;
    var data = load();
    return Object.keys(data.accounts)
      .map(function (n) { return statRow(data.accounts[n], game); })
      .filter(function (r) { return r.plays > 0 || r.score > 0 || r.best > 0; })
      .sort(function (a, b) {
        return (b.score - a.score) || (b.best - a.best) || (b.wins - a.wins) || (b.kills - a.kills);
      })
      .slice(0, top);
  }

  function overallRanking(top) {
    top = top || 20;
    var data = load();
    var mp = ["arena", "cops", "kart"];
    return Object.keys(data.accounts)
      .map(function (n) {
        var a = data.accounts[n];
        var o = { name: n, score: 0, wins: 0, plays: 0, kills: 0, deaths: 0, catches: 0, steals: 0, streak: 0, best: 0 };
        mp.forEach(function (g) {
          var s = statRow(a, g);
          o.score += s.score;
          o.wins += s.wins;
          o.plays += s.plays;
          o.kills += s.kills;
          o.deaths += s.deaths;
          o.catches += s.catches;
          o.steals += s.steals;
          o.streak = Math.max(o.streak, s.streak);
          o.best = Math.max(o.best, s.best);
        });
        return o;
      })
      .filter(function (r) { return r.plays > 0; })
      .sort(function (a, b) { return b.score - a.score || b.wins - a.wins; })
      .slice(0, top);
  }

  function allRankings() {
    var o = { overall: overallRanking() };
    ["arena", "cops", "kart", "tetris", "farm", "snake", "breakout", "puzzle2048"].forEach(function (g) {
      o[g] = rankingFor(g);
    });
    return o;
  }

  function clearGame(gameKeys, userNames) {
    var data = load();
    var keys = gameKeys === "all" ? RANK_GAMES : gameKeys;
    var names = userNames && userNames.length ? userNames : Object.keys(data.accounts);
    var cleared = 0;
    names.forEach(function (n) {
      var acc = data.accounts[n];
      if (!acc) return;
      if (gameKeys === "all") {
        cleared += Object.keys(acc.games || {}).length;
        acc.games = {};
      } else {
        (keys || []).forEach(function (k) {
          if (acc.games && acc.games[k]) {
            delete acc.games[k];
            cleared++;
          }
        });
      }
    });
    save(data);
    return cleared;
  }

  global.GWRanking = {
    RANK_GAMES: RANK_GAMES,
    auth: auth,
    getProfile: getProfile,
    setProfile: setProfile,
    clearProfile: clearProfile,
    award: award,
    recordBest: recordBest,
    notePlay: notePlay,
    mergePeerAwards: mergePeerAwards,
    rankingFor: rankingFor,
    overallRanking: overallRanking,
    allRankings: allRankings,
    clearGame: clearGame,
    ensureAcc: ensureAcc
  };
})(window);

(function (global) {
  "use strict";

  function create(stage, api) {
    var size = 4;
    var grid, score, wrap, boardEl;

    wrap = document.createElement("div");
    wrap.className = "game-ui";
    wrap.innerHTML =
      '<div class="game-ui__bar">' +
      '<button type="button" class="btn btn--ghost" id="p2048-new">새 게임</button>' +
      "</div>";
    boardEl = document.createElement("div");
    boardEl.className = "puzzle-board";
    wrap.appendChild(boardEl);
    stage.appendChild(wrap);

    function empty() {
      grid = [];
      for (var i = 0; i < size; i++) grid.push([0, 0, 0, 0]);
    }

    function cells() {
      var out = [];
      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) if (!grid[r][c]) out.push({ r: r, c: c });
      }
      return out;
    }

    function addRandom() {
      var free = cells();
      if (!free.length) return;
      var pick = free[Math.floor(Math.random() * free.length)];
      grid[pick.r][pick.c] = Math.random() < 0.9 ? 2 : 4;
    }

    function render() {
      boardEl.innerHTML = "";
      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          var v = grid[r][c];
          var cell = document.createElement("div");
          cell.className = "puzzle-cell" + (v ? " n" + v : "");
          cell.textContent = v || "";
          boardEl.appendChild(cell);
        }
      }
      api.setScore(score);
    }

    function slide(row) {
      var arr = row.filter(Boolean);
      for (var i = 0; i < arr.length - 1; i++) {
        if (arr[i] === arr[i + 1]) {
          arr[i] *= 2;
          score += arr[i];
          arr[i + 1] = 0;
        }
      }
      arr = arr.filter(Boolean);
      while (arr.length < size) arr.push(0);
      return arr;
    }

    function rotate(times) {
      for (var t = 0; t < times; t++) {
        var next = emptyClone();
        for (var r = 0; r < size; r++) {
          for (var c = 0; c < size; c++) next[c][size - 1 - r] = grid[r][c];
        }
        grid = next;
      }
    }

    function emptyClone() {
      var g = [];
      for (var i = 0; i < size; i++) g.push([0, 0, 0, 0]);
      return g;
    }

    function same(a, b) {
      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) if (a[r][c] !== b[r][c]) return false;
      }
      return true;
    }

    function clone() {
      return grid.map(function (row) { return row.slice(); });
    }

    function move(dir) {
      // 0 left, 1 up, 2 right, 3 down via rotations
      var before = clone();
      var rot = [0, 3, 2, 1][dir];
      rotate(rot);
      for (var r = 0; r < size; r++) grid[r] = slide(grid[r]);
      rotate((4 - rot) % 4);
      if (!same(before, grid)) {
        addRandom();
        render();
        if (!canMove()) {
          boardEl.insertAdjacentHTML(
            "afterend",
            '<p style="text-align:center;color:#ffc857;font-weight:700;">게임 오버!</p>'
          );
        }
      }
    }

    function canMove() {
      if (cells().length) return true;
      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          var v = grid[r][c];
          if (c + 1 < size && grid[r][c + 1] === v) return true;
          if (r + 1 < size && grid[r + 1][c] === v) return true;
        }
      }
      return false;
    }

    function onKey(e) {
      var map = { ArrowLeft: 0, ArrowUp: 1, ArrowRight: 2, ArrowDown: 3, a: 0, w: 1, d: 2, s: 3, A: 0, W: 1, D: 2, S: 3 };
      if (map[e.key] === undefined) return;
      e.preventDefault();
      move(map[e.key]);
    }

    function newGame() {
      empty();
      score = 0;
      addRandom();
      addRandom();
      var msg = wrap.querySelector("p");
      if (msg) msg.remove();
      render();
    }

    wrap.querySelector("#p2048-new").addEventListener("click", newGame);
    window.addEventListener("keydown", onKey);
    newGame();

    return {
      destroy: function () {
        window.removeEventListener("keydown", onKey);
      }
    };
  }

  global.GWGames = global.GWGames || {};
  global.GWGames.puzzle2048 = {
    id: "puzzle2048",
    title: "2048",
    emoji: "🔢",
    desc: "같은 숫자를 합쳐 2048을 만드세요.",
    tags: ["퍼즐", "인기"],
    accent: "#ffc857",
    hint: "방향키 또는 WASD로 타일 밀기",
    create: create
  };
})(window);

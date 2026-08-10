(function (global) {
  "use strict";

  var COLS = 10;
  var ROWS = 20;
  var SIZE = 28;
  var SHAPES = {
    I: [[1,1,1,1]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1]],
    S: [[0,1,1],[1,1,0]],
    Z: [[1,1,0],[0,1,1]],
    J: [[1,0,0],[1,1,1]],
    L: [[0,0,1],[1,1,1]]
  };
  var COLORS = {
    I: "#2de2c5", O: "#ffc857", T: "#b388ff",
    S: "#3dd68c", Z: "#ff6b4a", J: "#4da3ff", L: "#ff9f1c"
  };
  var KEYS = Object.keys(SHAPES);

  function rotate(m) {
    var h = m.length, w = m[0].length;
    var out = [];
    for (var x = 0; x < w; x++) {
      out[x] = [];
      for (var y = h - 1; y >= 0; y--) out[x].push(m[y][x]);
    }
    return out;
  }

  function create(stage, api) {
    var canvas = document.createElement("canvas");
    canvas.width = COLS * SIZE;
    canvas.height = ROWS * SIZE;
    var wrap = document.createElement("div");
    wrap.className = "canvas-wrap";
    wrap.appendChild(canvas);
    stage.appendChild(wrap);

    var ctx = canvas.getContext("2d");
    var board, piece, score, timer, running;

    function emptyBoard() {
      board = [];
      for (var r = 0; r < ROWS; r++) board.push(new Array(COLS).fill(null));
    }

    function spawn() {
      var type = KEYS[Math.floor(Math.random() * KEYS.length)];
      piece = {
        type: type,
        shape: SHAPES[type].map(function (row) { return row.slice(); }),
        x: 3,
        y: 0
      };
      if (collides(piece.shape, piece.x, piece.y)) gameOver();
    }

    function collides(shape, x, y) {
      for (var r = 0; r < shape.length; r++) {
        for (var c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          var nx = x + c, ny = y + r;
          if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
          if (ny >= 0 && board[ny][nx]) return true;
        }
      }
      return false;
    }

    function merge() {
      piece.shape.forEach(function (row, r) {
        row.forEach(function (v, c) {
          if (!v) return;
          var y = piece.y + r, x = piece.x + c;
          if (y >= 0) board[y][x] = piece.type;
        });
      });
    }

    function clearLines() {
      var cleared = 0;
      for (var r = ROWS - 1; r >= 0; r--) {
        if (board[r].every(Boolean)) {
          board.splice(r, 1);
          board.unshift(new Array(COLS).fill(null));
          cleared++;
          r++;
        }
      }
      if (cleared) {
        score += [0, 100, 300, 500, 800][cleared] || cleared * 200;
        api.setScore(score);
      }
    }

    function softDrop() {
      if (!running) return;
      if (!collides(piece.shape, piece.x, piece.y + 1)) {
        piece.y += 1;
      } else {
        merge();
        clearLines();
        spawn();
      }
      draw();
    }

    function hardDrop() {
      if (!running) return;
      while (!collides(piece.shape, piece.x, piece.y + 1)) piece.y += 1;
      merge();
      clearLines();
      spawn();
      draw();
    }

    function drawCell(x, y, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x * SIZE + 1, y * SIZE + 1, SIZE - 2, SIZE - 2);
    }

    function draw() {
      ctx.fillStyle = "#0a1020";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          if (board[r][c]) drawCell(c, r, COLORS[board[r][c]]);
        }
      }
      if (piece) {
        piece.shape.forEach(function (row, r) {
          row.forEach(function (v, c) {
            if (v) drawCell(piece.x + c, piece.y + r, COLORS[piece.type]);
          });
        });
      }
    }

    function gameOver() {
      running = false;
      clearInterval(timer);
      api.setScore(score);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffc857";
      ctx.font = "bold 22px IBM Plex Sans KR, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2);
    }

    function onKey(e) {
      if (!running || !piece) return;
      var k = e.key;
      if (["ArrowLeft","ArrowRight","ArrowDown","ArrowUp"," ","a","d","s","w","A","D","S","W"].indexOf(k) !== -1) {
        e.preventDefault();
      }
      if (k === "ArrowLeft" || k === "a" || k === "A") {
        if (!collides(piece.shape, piece.x - 1, piece.y)) piece.x -= 1;
      } else if (k === "ArrowRight" || k === "d" || k === "D") {
        if (!collides(piece.shape, piece.x + 1, piece.y)) piece.x += 1;
      } else if (k === "ArrowDown" || k === "s" || k === "S") {
        softDrop();
        return;
      } else if (k === "ArrowUp" || k === "w" || k === "W") {
        var rot = rotate(piece.shape);
        if (!collides(rot, piece.x, piece.y)) piece.shape = rot;
      } else if (k === " ") {
        hardDrop();
        return;
      }
      draw();
    }

    emptyBoard();
    score = 0;
    api.setScore(0);
    spawn();
    running = true;
    draw();
    timer = setInterval(softDrop, 550);
    window.addEventListener("keydown", onKey);

    return {
      destroy: function () {
        running = false;
        clearInterval(timer);
        window.removeEventListener("keydown", onKey);
      }
    };
  }

  global.GWGames = global.GWGames || {};
  global.GWGames.tetris = {
    id: "tetris",
    title: "테트리스",
    emoji: "🧱",
    desc: "블록을 맞춰 줄을 지워보세요. 클래식 아케이드!",
    tags: ["클래식", "퍼즐"],
    accent: "#2de2c5",
    hint: "←→ 이동 · ↑ 회전 · ↓ 소프트드롭 · Space 하드드롭",
    create: create
  };
})(window);

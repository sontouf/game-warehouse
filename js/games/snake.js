(function (global) {
  "use strict";

  var CELL = 20;
  var COLS = 24;
  var ROWS = 18;

  function create(stage, api) {
    var canvas = document.createElement("canvas");
    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;
    var wrap = document.createElement("div");
    wrap.className = "canvas-wrap";
    wrap.appendChild(canvas);
    stage.appendChild(wrap);
    var ctx = canvas.getContext("2d");

    var snake, dir, nextDir, food, score, timer, running;

    function randFood() {
      while (true) {
        var p = {
          x: Math.floor(Math.random() * COLS),
          y: Math.floor(Math.random() * ROWS)
        };
        var hit = snake.some(function (s) { return s.x === p.x && s.y === p.y; });
        if (!hit) return p;
      }
    }

    function reset() {
      snake = [{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }];
      dir = { x: 1, y: 0 };
      nextDir = dir;
      food = randFood();
      score = 0;
      api.setScore(0);
      running = true;
    }

    function draw() {
      ctx.fillStyle = "#0a1020";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ff6b4a";
      ctx.beginPath();
      ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL * 0.35, 0, Math.PI * 2);
      ctx.fill();
      snake.forEach(function (s, i) {
        ctx.fillStyle = i === 0 ? "#2de2c5" : "#1aa98f";
        ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
      });
    }

    function tick() {
      if (!running) return;
      dir = nextDir;
      var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) return end();
      if (snake.some(function (s) { return s.x === head.x && s.y === head.y; })) return end();
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 10;
        api.setScore(score);
        food = randFood();
      } else {
        snake.pop();
      }
      draw();
    }

    function end() {
      running = false;
      clearInterval(timer);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffc857";
      ctx.font = "bold 22px IBM Plex Sans KR, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2);
    }

    function onKey(e) {
      var k = e.key;
      var map = {
        ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 }, s: { x: 0, y: 1 },
        a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
        W: { x: 0, y: -1 }, S: { x: 0, y: 1 },
        A: { x: -1, y: 0 }, D: { x: 1, y: 0 }
      };
      var nd = map[k];
      if (!nd) return;
      e.preventDefault();
      if (nd.x === -dir.x && nd.y === -dir.y) return;
      nextDir = nd;
    }

    reset();
    draw();
    timer = setInterval(tick, 110);
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
  global.GWGames.snake = {
    id: "snake",
    title: "스네이크",
    emoji: "🐍",
    desc: "먹이를 먹고 길어지세요. 벽에 부딪히면 끝!",
    tags: ["클래식", "아케이드"],
    accent: "#3dd68c",
    hint: "방향키 또는 WASD로 이동",
    create: create
  };
})(window);

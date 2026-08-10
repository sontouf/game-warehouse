(function (global) {
  "use strict";

  function create(stage, api) {
    var W = 480, H = 360;
    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    var wrap = document.createElement("div");
    wrap.className = "canvas-wrap";
    wrap.appendChild(canvas);
    stage.appendChild(wrap);
    var ctx = canvas.getContext("2d");

    var paddle, ball, bricks, score, lives, raf, running, keys;

    function resetBall() {
      ball = { x: W / 2, y: H - 60, vx: 3.2, vy: -3.4, r: 6 };
    }

    function buildBricks() {
      bricks = [];
      var colors = ["#ff6b4a", "#ffc857", "#2de2c5", "#4da3ff"];
      for (var row = 0; row < 5; row++) {
        for (var col = 0; col < 10; col++) {
          bricks.push({
            x: 24 + col * 44,
            y: 36 + row * 22,
            w: 40,
            h: 16,
            color: colors[row % colors.length],
            alive: true
          });
        }
      }
    }

    function start() {
      paddle = { x: W / 2 - 40, y: H - 28, w: 80, h: 12 };
      score = 0;
      lives = 3;
      api.setScore(0);
      keys = {};
      buildBricks();
      resetBall();
      running = true;
      loop();
    }

    function loop() {
      if (!running) return;
      update();
      draw();
      raf = requestAnimationFrame(loop);
    }

    function update() {
      if (keys.left) paddle.x -= 6;
      if (keys.right) paddle.x += 6;
      paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

      ball.x += ball.vx;
      ball.y += ball.vy;

      if (ball.x < ball.r || ball.x > W - ball.r) ball.vx *= -1;
      if (ball.y < ball.r) ball.vy *= -1;

      if (
        ball.y + ball.r >= paddle.y &&
        ball.x > paddle.x &&
        ball.x < paddle.x + paddle.w &&
        ball.vy > 0
      ) {
        ball.vy *= -1;
        ball.vx += (ball.x - (paddle.x + paddle.w / 2)) * 0.08;
      }

      bricks.forEach(function (b) {
        if (!b.alive) return;
        if (
          ball.x > b.x && ball.x < b.x + b.w &&
          ball.y - ball.r < b.y + b.h && ball.y + ball.r > b.y
        ) {
          b.alive = false;
          ball.vy *= -1;
          score += 10;
          api.setScore(score);
        }
      });

      if (bricks.every(function (b) { return !b.alive; })) {
        buildBricks();
        ball.vx *= 1.08;
        ball.vy *= 1.08;
      }

      if (ball.y > H) {
        lives -= 1;
        if (lives <= 0) {
          running = false;
          draw(true);
          return;
        }
        resetBall();
      }
    }

    function draw(over) {
      ctx.fillStyle = "#0a1020";
      ctx.fillRect(0, 0, W, H);
      bricks.forEach(function (b) {
        if (!b.alive) return;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.w, b.h);
      });
      ctx.fillStyle = "#eef3ff";
      ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
      ctx.beginPath();
      ctx.fillStyle = "#ffc857";
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#93a0b8";
      ctx.font = "14px IBM Plex Sans KR, sans-serif";
      ctx.fillText("LIFE " + lives, 12, 20);
      if (over) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#ffc857";
        ctx.font = "bold 22px IBM Plex Sans KR, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", W / 2, H / 2);
        ctx.textAlign = "left";
      }
    }

    function onKeyDown(e) {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { keys.left = true; e.preventDefault(); }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { keys.right = true; e.preventDefault(); }
    }
    function onKeyUp(e) {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keys.left = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keys.right = false;
    }
    function onMove(e) {
      var rect = canvas.getBoundingClientRect();
      var x = ((e.clientX || (e.touches && e.touches[0].clientX)) - rect.left) * (W / rect.width);
      paddle.x = x - paddle.w / 2;
    }

    start();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("touchmove", onMove, { passive: true });

    return {
      destroy: function () {
        running = false;
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        canvas.removeEventListener("mousemove", onMove);
        canvas.removeEventListener("touchmove", onMove);
      }
    };
  }

  global.GWGames = global.GWGames || {};
  global.GWGames.breakout = {
    id: "breakout",
    title: "브레이크아웃",
    emoji: "🟢",
    desc: "패들로 공을 튕겨 벽돌을 모두 깨세요.",
    tags: ["아케이드", "액션"],
    accent: "#4da3ff",
    hint: "←→ / A D 또는 마우스로 패들 조작",
    create: create
  };
})(window);

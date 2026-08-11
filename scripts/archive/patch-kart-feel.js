/**
 * KartRider-like physics, speedometer, obstacles, optimized rendering.
 */
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "../js/games/kart.js");
let s = fs.readFileSync(p, "utf8");

function must(label, from, to) {
  if (!s.includes(from)) {
    console.error("MISSING:", label);
    process.exit(1);
  }
  s = s.replace(from, to);
}

must(
  "race html",
  `      '  <div class="kart-hud">' +
      '    <div class="kart-rank" id="kart-rank"></div>' +
      '    <div class="kart-center" id="kart-center"></div>' +
      '    <div class="kart-meters">' +
      '      <div class="kart-boost"><span>부스터</span><i id="kart-boostbar"></i></div>' +
      '      <div class="kart-lap" id="kart-lap">LAP 1/' + LAPS + "</div>" +
      '      <div class="kart-timer" id="kart-timer"></div>' +
      '    </div>' +
      "  </div>" +`,
  `      '  <div class="kart-hud">' +
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
      "  </div>" +`
);

must(
  "els",
  `      boostbar: root.querySelector("#kart-boostbar"),
      lap: root.querySelector("#kart-lap"),
      timer: root.querySelector("#kart-timer"),
      touch: root.querySelector("#kart-touch"),`,
  `      boostbar: root.querySelector("#kart-boostbar"),
      lap: root.querySelector("#kart-lap"),
      timer: root.querySelector("#kart-timer"),
      speedo: root.querySelector("#kart-speedo-canvas"),
      kmh: root.querySelector("#kart-kmh"),
      driftbar: root.querySelector("#kart-driftbar"),
      touch: root.querySelector("#kart-touch"),`
);

must(
  "input keys",
  `    var input = { steer: 0, throttle: 1, drift: false, boost: false };
    var keys = {};`,
  `    var input = { steer: 0, throttle: 1, drift: false, boost: false };
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
    }`
);

must(
  "kart init fields",
  `          yaw: ang,
          speed: 0,
          boost: 0.35,
          driftGauge: 0,
          drifting: false,
          progress: 0,`,
  `          yaw: ang,
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
          progress: 0,`
);

must(
  "race sim null",
  `        trackLine: map.pts.slice(),
        sim: null
      };`,
  `        trackLine: map.pts.slice(),
        sim: null,
        obstacles: [],
        fx: []
      };`
);

must(
  "setupRenderer through makeKartMesh end",
  `    function setupRenderer() {
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
    }`,
  `    function setupRenderer() {
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
      disposeShared();
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
    }`
);

must(
  "stepKart full",
  `    function stepKart(k, dt) {
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
    }`,
  `    function applyStunBounce(k, nx, nz, strength, stunTime) {
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
    }`
);

fs.writeFileSync(p, s);
console.log("kart feel patch part1 ok");

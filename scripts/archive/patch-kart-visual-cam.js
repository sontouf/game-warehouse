/**
 * FP/TP camera + richer KartRider-like visuals.
 */
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "../js/games/kart.js");
const cssPath = path.join(__dirname, "../style.css");
let s = fs.readFileSync(p, "utf8");

function must(label, from, to) {
  if (!s.includes(from)) {
    console.error("MISSING:", label);
    process.exit(1);
  }
  s = s.replace(from, to);
  console.log("ok:", label);
}

must(
  "themes",
  `  var MAPS = [
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
  ];`,
  `  var MAPS = [
    {
      id: "village",
      name: "빌리지 손가락",
      theme: {
        ground: 0x5cb85c, road: 0x5a6270, sky: 0x7ec8f0, curb: 0xff5a5a,
        accent: 0xffc857, rail: 0xffffff, fogFar: 160, style: "village"
      },
      laps: 2,
      pts: ptsVillage()
    },
    {
      id: "forest",
      name: "포레스트 목걸이",
      theme: {
        ground: 0x2d6a4f, road: 0x4a3728, sky: 0x8fd6a8, curb: 0xffd166,
        accent: 0x95d5b2, rail: 0xd8f3dc, fogFar: 130, style: "forest"
      },
      laps: 2,
      pts: ptsForest()
    },
    {
      id: "mine",
      name: "마인 지그재그",
      theme: {
        ground: 0x6c757d, road: 0x343a40, sky: 0xb8a9c9, curb: 0xff6b6b,
        accent: 0xffd60a, rail: 0xadb5bd, fogFar: 120, style: "mine"
      },
      laps: 3,
      pts: ptsMine()
    }
  ];`
);

must(
  "hud cam btn",
  `      '    <div class="kart-meters">' +
      '      <div class="kart-boost"><span>부스터</span><i id="kart-boostbar"></i></div>' +
      '      <div class="kart-lap" id="kart-lap">LAP 1/' + LAPS + "</div>" +
      '      <div class="kart-timer" id="kart-timer"></div>' +
      '    </div>' +`,
  `      '    <div class="kart-meters">' +
      '      <div class="kart-boost"><span>부스터</span><i id="kart-boostbar"></i></div>' +
      '      <div class="kart-lap" id="kart-lap">LAP 1/' + LAPS + "</div>" +
      '      <div class="kart-timer" id="kart-timer"></div>' +
      '      <button type="button" class="kart-cam-btn" id="kart-cam" title="시점 전환 (V)">3인칭</button>' +
      '    </div>' +`
);

must(
  "els cam",
  `      driftbar: root.querySelector("#kart-driftbar"),
      touch: root.querySelector("#kart-touch"),`,
  `      driftbar: root.querySelector("#kart-driftbar"),
      camBtn: root.querySelector("#kart-cam"),
      touch: root.querySelector("#kart-touch"),`
);

must(
  "camMode var",
  `    var input = { steer: 0, throttle: 1, drift: false, boost: false };
    var keys = {};`,
  `    var input = { steer: 0, throttle: 1, drift: false, boost: false };
    var keys = {};
    var camMode = "tp"; /* tp | fp */`
);

const oldBlockStart = `    function setupRenderer() {`;
const oldBlockEnd = `    function spawnSparks(x, z, yaw) {`;
const startIdx = s.indexOf(oldBlockStart);
const endIdx = s.indexOf(oldBlockEnd);
if (startIdx < 0 || endIdx < 0) {
  console.error("MISSING: setupRenderer..spawnSparks block", startIdx, endIdx);
  process.exit(1);
}

const newBlock = `    function setupRenderer() {
      var w = els.race.clientWidth || 800;
      var h = Math.max(360, els.race.clientHeight || 480);
      var dpr = Math.min(isMobile ? 1.35 : 1.85, global.devicePixelRatio || 1);
      var renderer = new THREE.WebGLRenderer({
        canvas: els.canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        stencil: false,
        depth: true
      });
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      renderer.setClearColor(race.map.theme.sky, 1);
      var scene = new THREE.Scene();
      scene.fog = new THREE.Fog(race.map.theme.sky, 40, race.map.theme.fogFar || 150);
      var camera = new THREE.PerspectiveCamera(58, w / h, 0.15, 260);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7c6b, 1.05));
      var dir = new THREE.DirectionalLight(0xfff4e0, 0.95);
      dir.position.set(45, 70, 30);
      scene.add(dir);
      var fill = new THREE.DirectionalLight(0xa0c4ff, 0.28);
      fill.position.set(-30, 20, -40);
      scene.add(fill);
      race.renderer = renderer;
      race.scene = scene;
      race.camera = camera;
      race._viewW = w;
      race._viewH = h;
      if (els.camBtn) {
        els.camBtn.textContent = camMode === "fp" ? "1인칭" : "3인칭";
        els.camBtn.onclick = toggleCamMode;
      }
    }

    function toggleCamMode() {
      camMode = camMode === "tp" ? "fp" : "tp";
      if (els.camBtn) els.camBtn.textContent = camMode === "fp" ? "1인칭" : "3인칭";
      var my = race && race.karts[me.id];
      if (my) applyCamVisibility(my);
    }

    function applyCamVisibility(k) {
      if (!k || !k.mesh) return;
      var hideSelf = camMode === "fp" && k.id === me.id;
      k.mesh.visible = !hideSelf;
    }

    function canvasTex(draw, repeatU, repeatV, key) {
      if (sharedMat[key]) return sharedMat[key];
      var c = document.createElement("canvas");
      c.width = 128;
      c.height = 128;
      draw(c.getContext("2d"), c);
      var tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatU || 1, repeatV || 1);
      var maxA = 1;
      try {
        maxA = Math.min(4, (race.renderer && race.renderer.capabilities.getMaxAnisotropy()) || 1);
      } catch (e) {}
      tex.anisotropy = maxA;
      var m = new THREE.MeshLambertMaterial({ map: tex });
      sharedMat[key] = m;
      return m;
    }

    function roadTexture(theme) {
      return canvasTex(function (g) {
        g.fillStyle = "#" + ("000000" + theme.road.toString(16)).slice(-6);
        g.fillRect(0, 0, 128, 128);
        g.fillStyle = "rgba(255,255,255,0.22)";
        g.fillRect(58, 0, 12, 128);
        g.fillStyle = "rgba(255,220,80,0.85)";
        g.fillRect(8, 0, 6, 128);
        g.fillRect(114, 0, 6, 128);
        g.fillStyle = "rgba(0,0,0,0.12)";
        for (var y = 0; y < 128; y += 10) g.fillRect(0, y, 128, 3);
      }, 1.2, 36, "road-" + theme.road);
    }

    function groundTexture(theme) {
      return canvasTex(function (g) {
        g.fillStyle = "#" + ("000000" + theme.ground.toString(16)).slice(-6);
        g.fillRect(0, 0, 128, 128);
        for (var i = 0; i < 90; i++) {
          g.fillStyle = "rgba(255,255,255," + (0.03 + Math.random() * 0.07) + ")";
          g.beginPath();
          g.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2.2, 0, Math.PI * 2);
          g.fill();
        }
        if (theme.style === "village") {
          g.fillStyle = "rgba(120,200,80,0.28)";
          for (var j = 0; j < 50; j++) g.fillRect(Math.random() * 128, Math.random() * 128, 3, 6);
        } else if (theme.style === "forest") {
          g.fillStyle = "rgba(20,60,30,0.35)";
          for (var k = 0; k < 40; k++) g.fillRect(Math.random() * 128, Math.random() * 128, 4, 4);
        } else {
          g.fillStyle = "rgba(40,40,50,0.3)";
          for (var m = 0; m < 35; m++) g.fillRect(Math.random() * 128, Math.random() * 128, 5, 2);
        }
      }, 24, 24, "ground-" + theme.ground);
    }

    function buildTrack() {
      var pts = race.map.pts;
      var theme = race.map.theme;
      var segs = isMobile ? Math.max(56, pts.length * 2) : Math.max(96, pts.length * 4);

      var sky = new THREE.Mesh(
        geo("sky", function () { return new THREE.SphereGeometry(180, 24, 16); }),
        mat("sky-" + theme.sky, function () {
          return new THREE.MeshBasicMaterial({ color: theme.sky, side: THREE.BackSide, fog: false });
        })
      );
      race.scene.add(sky);

      var ground = new THREE.Mesh(
        geo("ground", function () { return new THREE.CircleGeometry(160, 48); }),
        groundTexture(theme)
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.05;
      race.scene.add(ground);

      var shape = [];
      for (var i = 0; i < pts.length; i++) shape.push(new THREE.Vector3(pts[i].x, 0.04, pts[i].z));
      shape.push(shape[0].clone());
      var curve = new THREE.CatmullRomCurve3(shape, true, "catmullrom", 0.08);
      race._curve = curve;

      var roadGeo = new THREE.TubeGeometry(curve, segs, race.meta.halfW, isMobile ? 6 : 8, true);
      sharedGeo.road = roadGeo;
      race.scene.add(new THREE.Mesh(roadGeo, roadTexture(theme)));

      var curbGeo = new THREE.TubeGeometry(curve, segs, race.meta.halfW + 0.45, 4, true);
      sharedGeo.curb = curbGeo;
      var curbMat = canvasTex(function (g) {
        for (var x = 0; x < 128; x += 16) {
          g.fillStyle = x % 32 === 0 ? "#ff5a5a" : "#ffffff";
          g.fillRect(x, 0, 16, 128);
        }
      }, 8, 1, "curbstripe");
      var curb = new THREE.Mesh(curbGeo, curbMat);
      curb.scale.y = 0.22;
      race.scene.add(curb);

      var railGeo = new THREE.TubeGeometry(curve, segs, race.meta.halfW + 1.15, 3, true);
      sharedGeo.rail = railGeo;
      var rail = new THREE.Mesh(
        railGeo,
        mat("rail-" + theme.rail, function () {
          return new THREE.MeshLambertMaterial({ color: theme.rail, transparent: true, opacity: 0.55 });
        })
      );
      rail.scale.y = 0.08;
      rail.position.y = 0.55;
      race.scene.add(rail);

      var s0 = pts[0], s1 = pts[1];
      var ang = Math.atan2(s1.z - s0.z, s1.x - s0.x);
      var checkMat = canvasTex(function (g) {
        for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
          g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
          g.fillRect(x * 16, y * 16, 16, 16);
        }
      }, 2, 1, "checker");
      var start = new THREE.Mesh(
        geo("start", function () { return new THREE.BoxGeometry(race.meta.halfW * 2.1, 0.07, 1.6); }),
        checkMat
      );
      start.position.set(s0.x, 0.12, s0.z);
      start.rotation.y = -ang;
      race.scene.add(start);

      var archMat = mat("arch-" + theme.accent, function () {
        return new THREE.MeshLambertMaterial({ color: theme.accent });
      });
      var postL = new THREE.Mesh(geo("archp", function () { return new THREE.BoxGeometry(0.35, 3.2, 0.35); }), archMat);
      var postR = postL.clone();
      var beam = new THREE.Mesh(geo("archb", function () { return new THREE.BoxGeometry(race.meta.halfW * 2.4, 0.35, 0.35); }), archMat);
      var gate = new THREE.Group();
      postL.position.set(-race.meta.halfW - 0.2, 1.6, 0);
      postR.position.set(race.meta.halfW + 0.2, 1.6, 0);
      beam.position.set(0, 3.1, 0);
      gate.add(postL);
      gate.add(postR);
      gate.add(beam);
      gate.position.set(s0.x, 0, s0.z);
      gate.rotation.y = -ang;
      race.scene.add(gate);

      placeTrackProps(curve, theme);
      placeScenery(curve, theme);

      Object.keys(race.karts).forEach(function (id) {
        var k = race.karts[id];
        k.mesh = makeKartMesh(k.color, k.charId);
        race.scene.add(k.mesh);
        applyCamVisibility(k);
      });
    }

    function placeTrackProps(curve, theme) {
      race.obstacles = [];
      var barrelGeo = geo("barrel", function () { return new THREE.CylinderGeometry(0.5, 0.58, 1.05, 10); });
      var boxGeo = geo("obox", function () { return new THREE.BoxGeometry(1.05, 1.05, 1.05); });
      var coneGeo = geo("cone", function () { return new THREE.ConeGeometry(0.42, 1.05, 10); });
      var crystalGeo = geo("crystal", function () { return new THREE.OctahedronGeometry(0.55, 0); });
      var barrelMat = mat("barrel", function () { return new THREE.MeshLambertMaterial({ color: 0xd97706 }); });
      var boxMat = mat("obox", function () { return new THREE.MeshLambertMaterial({ color: 0xa16207 }); });
      var coneMat = mat("cone", function () { return new THREE.MeshLambertMaterial({ color: 0xff6b35 }); });
      var crystalMat = mat("crystal", function () { return new THREE.MeshLambertMaterial({ color: 0x7dd3fc }); });
      var hoopMat = mat("hoop", function () { return new THREE.MeshLambertMaterial({ color: theme.accent }); });
      var count = isMobile ? 16 : 26;
      for (var i = 0; i < count; i++) {
        var u = (i + 0.5) / count;
        var p = curve.getPointAt(u);
        var t = curve.getTangentAt(u);
        var side = i % 2 ? 1 : -1;
        var nx = -t.z, nz = t.x;
        var len = Math.sqrt(nx * nx + nz * nz) || 1;
        nx /= len;
        nz /= len;
        var onTrack = i % 7 === 0;
        var dist = onTrack ? race.meta.halfW * 0.32 : race.meta.halfW + 2.0 + (i % 3) * 0.65;
        var x = p.x + nx * side * dist;
        var z = p.z + nz * side * dist;
        var kind;
        if (theme.style === "mine" && onTrack) kind = "crystal";
        else if (onTrack) kind = i % 2 ? "cone" : "barrel";
        else kind = i % 3 === 0 ? "box" : "barrel";
        var mesh;
        if (kind === "barrel") mesh = new THREE.Mesh(barrelGeo, barrelMat);
        else if (kind === "cone") mesh = new THREE.Mesh(coneGeo, coneMat);
        else if (kind === "crystal") mesh = new THREE.Mesh(crystalGeo, crystalMat);
        else mesh = new THREE.Mesh(boxGeo, boxMat);
        mesh.position.set(x, kind === "cone" ? 0.52 : kind === "crystal" ? 0.7 : 0.55, z);
        if (kind === "crystal") mesh.rotation.y = i * 0.7;
        race.scene.add(mesh);
        race.obstacles.push({ x: x, z: z, r: kind === "cone" ? 0.5 : 0.72, mesh: mesh, kind: kind });

        if (!onTrack && i % 5 === 0) {
          var hoop = new THREE.Mesh(geo("hoop", function () { return new THREE.TorusGeometry(0.7, 0.08, 6, 16); }), hoopMat);
          hoop.position.set(x + nx * side * 1.2, 1.4, z + nz * side * 1.2);
          hoop.rotation.y = Math.atan2(t.x, t.z);
          race.scene.add(hoop);
        }
      }
    }

    function placeScenery(curve, theme) {
      var style = theme.style || "village";
      var n = isMobile ? 28 : 48;
      for (var i = 0; i < n; i++) {
        var u = (i + 0.17) / n;
        var p = curve.getPointAt(u);
        var t = curve.getTangentAt(u);
        var side = i % 2 ? 1 : -1;
        var nx = -t.z, nz = t.x;
        var len = Math.sqrt(nx * nx + nz * nz) || 1;
        nx /= len;
        nz /= len;
        var dist = race.meta.halfW + 4.5 + (i % 5) * 1.8;
        var x = p.x + nx * side * dist;
        var z = p.z + nz * side * dist;
        var g = new THREE.Group();

        if (style === "village") {
          var wall = mat("vh-" + (i % 4), function () {
            var cols = [0xffb4a2, 0xfec89a, 0xb5e48c, 0xa0c4ff];
            return new THREE.MeshLambertMaterial({ color: cols[i % 4] });
          });
          var roofM = mat("vroof", function () { return new THREE.MeshLambertMaterial({ color: 0xe63946 }); });
          var body = new THREE.Mesh(geo("vhouse", function () { return new THREE.BoxGeometry(2.4, 1.8, 2.2); }), wall);
          body.position.y = 0.9;
          g.add(body);
          var roof = new THREE.Mesh(geo("vroof", function () { return new THREE.ConeGeometry(1.9, 1.2, 4); }), roofM);
          roof.position.y = 2.3;
          roof.rotation.y = Math.PI / 4;
          g.add(roof);
          if (i % 3 === 0) {
            var tree = makeTree(1 + (i % 3) * 0.15);
            tree.position.set(2.2, 0, 0.5);
            g.add(tree);
          }
        } else if (style === "forest") {
          g.add(makeTree(1.1 + (i % 4) * 0.25));
          if (i % 2 === 0) {
            var rock = new THREE.Mesh(
              geo("rock", function () { return new THREE.DodecahedronGeometry(0.7, 0); }),
              mat("rock", function () { return new THREE.MeshLambertMaterial({ color: 0x6c757d }); })
            );
            rock.position.set(1.4, 0.35, -0.6);
            rock.scale.set(1, 0.7, 1.1);
            g.add(rock);
          }
          if (i % 4 === 0) {
            var mush = new THREE.Mesh(
              geo("mush", function () { return new THREE.SphereGeometry(0.35, 8, 6); }),
              mat("mush", function () { return new THREE.MeshLambertMaterial({ color: 0xff6b6b }); })
            );
            mush.position.set(-1.1, 0.35, 0.8);
            mush.scale.y = 0.55;
            g.add(mush);
          }
        } else {
          var pillar = new THREE.Mesh(
            geo("mpil", function () { return new THREE.CylinderGeometry(0.45, 0.55, 3.2, 8); }),
            mat("mpil", function () { return new THREE.MeshLambertMaterial({ color: 0x495057 }); })
          );
          pillar.position.y = 1.6;
          g.add(pillar);
          var lamp = new THREE.Mesh(
            geo("mlamp", function () { return new THREE.SphereGeometry(0.35, 8, 8); }),
            mat("mlamp", function () { return new THREE.MeshLambertMaterial({ color: 0xffe066, emissive: 0xaa7700 }); })
          );
          lamp.position.y = 3.4;
          g.add(lamp);
          if (i % 3 === 0) {
            var crate = new THREE.Mesh(
              geo("mcrate", function () { return new THREE.BoxGeometry(1.2, 1.0, 1.2); }),
              mat("mcrate", function () { return new THREE.MeshLambertMaterial({ color: 0x8b5e34 }); })
            );
            crate.position.set(1.5, 0.5, 0.4);
            g.add(crate);
          }
        }
        g.position.set(x, 0, z);
        g.rotation.y = Math.atan2(t.x, t.z) + (i % 3) * 0.4;
        race.scene.add(g);
      }

      /* distant hills */
      var hillN = isMobile ? 6 : 10;
      for (var h = 0; h < hillN; h++) {
        var ang = (h / hillN) * Math.PI * 2;
        var hx = Math.cos(ang) * 95;
        var hz = Math.sin(ang) * 95;
        var hill = new THREE.Mesh(
          geo("hill", function () { return new THREE.SphereGeometry(18, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5); }),
          mat("hill-" + theme.ground, function () {
            return new THREE.MeshLambertMaterial({ color: theme.ground });
          })
        );
        hill.position.set(hx, -2, hz);
        hill.scale.set(1 + (h % 3) * 0.3, 0.45 + (h % 2) * 0.2, 1 + (h % 4) * 0.2);
        race.scene.add(hill);
      }
    }

    function makeTree(scale) {
      var g = new THREE.Group();
      var trunk = new THREE.Mesh(
        geo("trunk", function () { return new THREE.CylinderGeometry(0.18, 0.24, 1.2, 6); }),
        mat("trunk", function () { return new THREE.MeshLambertMaterial({ color: 0x8b5a2b }); })
      );
      trunk.position.y = 0.6;
      g.add(trunk);
      var leafM = mat("leaf", function () { return new THREE.MeshLambertMaterial({ color: 0x2d6a4f }); });
      var leaf = new THREE.Mesh(geo("leaf", function () { return new THREE.ConeGeometry(1.1, 2.2, 8); }), leafM);
      leaf.position.y = 2.1;
      g.add(leaf);
      var leaf2 = new THREE.Mesh(geo("leaf2", function () { return new THREE.ConeGeometry(0.85, 1.6, 8); }), leafM);
      leaf2.position.y = 3.1;
      g.add(leaf2);
      g.scale.setScalar(scale || 1);
      return g;
    }

    function makeRiderMesh(charId) {
      var ch = getChar(charId);
      var rider = new THREE.Group();
      var skinM = new THREE.MeshLambertMaterial({ color: ch.skin });
      var hatM = new THREE.MeshLambertMaterial({ color: ch.hat });
      var suitM = new THREE.MeshLambertMaterial({ color: ch.suit });
      var hairM = new THREE.MeshLambertMaterial({ color: ch.hair });
      var eyeM = mat("eye", function () { return new THREE.MeshLambertMaterial({ color: 0x222222 }); });
      var cheekM = mat("cheek", function () { return new THREE.MeshLambertMaterial({ color: 0xff8a80 }); });
      var whiteM = mat("eyeW", function () { return new THREE.MeshLambertMaterial({ color: 0xffffff }); });

      var torso = new THREE.Mesh(geo("rtorso", function () { return new THREE.BoxGeometry(0.56, 0.48, 0.42); }), suitM);
      torso.position.set(0, 0.38, 0);
      rider.add(torso);

      var legL = new THREE.Mesh(geo("rleg", function () { return new THREE.BoxGeometry(0.17, 0.26, 0.34); }), suitM);
      legL.position.set(-0.14, 0.12, 0.2);
      rider.add(legL);
      var legR = legL.clone();
      legR.position.x = 0.14;
      rider.add(legR);

      var head = new THREE.Mesh(geo("rhead", function () { return new THREE.SphereGeometry(0.4, 14, 12); }), skinM);
      head.position.set(0, 0.9, 0.02);
      head.scale.set(1, 0.95, 1);
      rider.add(head);

      var hat = new THREE.Mesh(geo("rhat", function () { return new THREE.SphereGeometry(0.44, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55); }), hatM);
      hat.position.set(0, 1.04, 0);
      rider.add(hat);
      var pom = new THREE.Mesh(geo("rpom", function () { return new THREE.SphereGeometry(0.13, 8, 6); }), hairM);
      pom.position.set(0, 1.34, 0);
      rider.add(pom);

      var eyeWL = new THREE.Mesh(geo("reyeW", function () { return new THREE.SphereGeometry(0.08, 6, 6); }), whiteM);
      eyeWL.position.set(-0.13, 0.92, 0.33);
      eyeWL.scale.set(1, 1.15, 0.6);
      rider.add(eyeWL);
      var eyeWR = eyeWL.clone();
      eyeWR.position.x = 0.13;
      rider.add(eyeWR);

      var eyeL = new THREE.Mesh(geo("reye", function () { return new THREE.SphereGeometry(0.045, 6, 6); }), eyeM);
      eyeL.position.set(-0.13, 0.92, 0.37);
      rider.add(eyeL);
      var eyeR = eyeL.clone();
      eyeR.position.x = 0.13;
      rider.add(eyeR);

      var cheekL = new THREE.Mesh(geo("rcheek", function () { return new THREE.SphereGeometry(0.06, 6, 6); }), cheekM);
      cheekL.position.set(-0.24, 0.8, 0.28);
      cheekL.scale.set(1, 0.7, 0.5);
      rider.add(cheekL);
      var cheekR = cheekL.clone();
      cheekR.position.x = 0.24;
      rider.add(cheekR);

      var armL = new THREE.Mesh(geo("rarm", function () { return new THREE.BoxGeometry(0.13, 0.13, 0.3); }), skinM);
      armL.position.set(-0.4, 0.44, 0.14);
      armL.rotation.y = 0.4;
      rider.add(armL);
      var armR = armL.clone();
      armR.position.x = 0.4;
      armR.rotation.y = -0.4;
      rider.add(armR);

      rider.position.set(0, 0.48, -0.05);
      rider.userData.head = head;
      rider.userData.hat = hat;
      rider.userData._mats = [skinM, hatM, suitM, hairM];
      return rider;
    }

    function makeKartMesh(colorHex, charId) {
      var g = new THREE.Group();
      var color = new THREE.Color(colorHex);
      var bodyMat = new THREE.MeshLambertMaterial({ color: color });
      var dark = mat("kdark", function () { return new THREE.MeshLambertMaterial({ color: 0x1a1f2a }); });
      var tire = mat("ktire", function () { return new THREE.MeshLambertMaterial({ color: 0x111111 }); });
      var chrome = mat("kchrome", function () { return new THREE.MeshLambertMaterial({ color: 0xd0d7e2 }); });
      var glass = mat("kglass", function () {
        return new THREE.MeshLambertMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.55 });
      });
      var lightM = mat("klight", function () { return new THREE.MeshLambertMaterial({ color: 0xfff3bf, emissive: 0xccaa44 }); });

      var body = new THREE.Mesh(geo("kbody", function () { return new THREE.BoxGeometry(1.4, 0.38, 2.1); }), bodyMat);
      body.position.y = 0.4;
      g.add(body);
      var belly = new THREE.Mesh(geo("kbelly", function () { return new THREE.BoxGeometry(1.2, 0.22, 1.5); }), dark);
      belly.position.set(0, 0.22, 0.05);
      g.add(belly);
      var nose = new THREE.Mesh(geo("knose", function () { return new THREE.BoxGeometry(1.05, 0.26, 0.55); }), bodyMat);
      nose.position.set(0, 0.36, 1.18);
      g.add(nose);
      var bumper = new THREE.Mesh(geo("kbump", function () { return new THREE.BoxGeometry(1.25, 0.14, 0.22); }), chrome);
      bumper.position.set(0, 0.22, 1.42);
      g.add(bumper);

      var wind = new THREE.Mesh(geo("kwind", function () { return new THREE.BoxGeometry(1.05, 0.42, 0.08); }), glass);
      wind.position.set(0, 0.78, 0.55);
      wind.rotation.x = -0.35;
      g.add(wind);

      var seat = new THREE.Mesh(geo("kseat", function () { return new THREE.BoxGeometry(0.72, 0.16, 0.55); }), dark);
      seat.position.set(0, 0.58, -0.02);
      g.add(seat);
      var back = new THREE.Mesh(geo("kback", function () { return new THREE.BoxGeometry(0.7, 0.45, 0.12); }), dark);
      back.position.set(0, 0.78, -0.35);
      g.add(back);

      var spoiler = new THREE.Mesh(geo("kspoiler", function () { return new THREE.BoxGeometry(1.55, 0.08, 0.32); }), bodyMat);
      spoiler.position.set(0, 0.95, -1.0);
      g.add(spoiler);
      var wingL = new THREE.Mesh(geo("kwing", function () { return new THREE.BoxGeometry(0.08, 0.35, 0.25); }), bodyMat);
      wingL.position.set(-0.7, 0.78, -0.95);
      g.add(wingL);
      var wingR = wingL.clone();
      wingR.position.x = 0.7;
      g.add(wingR);

      var hl = new THREE.Mesh(geo("khl", function () { return new THREE.SphereGeometry(0.12, 8, 6); }), lightM);
      hl.position.set(-0.4, 0.38, 1.4);
      g.add(hl);
      var hr = hl.clone();
      hr.position.x = 0.4;
      g.add(hr);

      g.userData.wheels = [];
      for (var i = 0; i < 4; i++) {
        var w = new THREE.Mesh(geo("kwheel", function () { return new THREE.CylinderGeometry(0.32, 0.32, 0.3, 12); }), tire);
        w.rotation.z = Math.PI / 2;
        w.position.set(i % 2 ? 0.8 : -0.8, 0.32, i < 2 ? 0.75 : -0.75);
        g.add(w);
        var rim = new THREE.Mesh(geo("krim", function () { return new THREE.CylinderGeometry(0.16, 0.16, 0.32, 8); }), chrome);
        rim.rotation.z = Math.PI / 2;
        rim.position.copy(w.position);
        g.add(rim);
        g.userData.wheels.push(w);
      }

      var rider = makeRiderMesh(charId);
      g.add(rider);
      g.userData.rider = rider;
      g.userData.bodyMat = bodyMat;
      return g;
    }

`;

s = s.slice(0, startIdx) + newBlock + s.slice(endIdx);
console.log("ok: visual core block");

must(
  "bindInput V",
  `    function bindInput() {
      function kd(e) {
        keys[e.code] = true;
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) >= 0) e.preventDefault();
      }
      function ku(e) { keys[e.code] = false; }`,
  `    function bindInput() {
      function kd(e) {
        keys[e.code] = true;
        if (e.code === "KeyV") toggleCamMode();
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) >= 0) e.preventDefault();
      }
      function ku(e) { keys[e.code] = false; }`
);

must(
  "updateCamera",
  `    function updateCamera(k, dt) {
      var spd = k.speed || 0;
      var back = 7.8 + clamp(spd * 0.04, 0, 2.5);
      var up = 3.6 + clamp(spd * 0.02, 0, 1.2);
      var tx = k.x - Math.cos(k.yaw) * back;
      var tz = k.z - Math.sin(k.yaw) * back;
      var cam = race.camera;
      var smooth = 1 - Math.pow(0.0004, dt);
      cam.position.x = lerp(cam.position.x || tx, tx, smooth);
      cam.position.y = lerp(cam.position.y || up, up, 0.12);
      cam.position.z = lerp(cam.position.z || tz, tz, smooth);
      cam.fov = lerp(cam.fov || 58, 56 + clamp(spd * 0.15, 0, 8) + (k.input && k.input.boost ? 3 : 0), 0.08);
      cam.updateProjectionMatrix();
      cam.lookAt(k.x + Math.cos(k.yaw) * 7, 0.55 + (k.bounceY || 0), k.z + Math.sin(k.yaw) * 7);
    }`,
  `    function updateCamera(k, dt) {
      var spd = k.speed || 0;
      var cam = race.camera;
      var smooth = 1 - Math.pow(0.0004, dt);
      applyCamVisibility(k);
      if (camMode === "fp") {
        var fx = k.x + Math.cos(k.yaw) * 0.35;
        var fz = k.z + Math.sin(k.yaw) * 0.35;
        var fy = 1.25 + (k.bounceY || 0) * 0.4;
        cam.position.x = lerp(cam.position.x || fx, fx, Math.min(1, smooth * 1.6));
        cam.position.y = lerp(cam.position.y || fy, fy, 0.22);
        cam.position.z = lerp(cam.position.z || fz, fz, Math.min(1, smooth * 1.6));
        cam.fov = lerp(cam.fov || 70, 68 + clamp(spd * 0.18, 0, 10) + (k.input && k.input.boost ? 4 : 0), 0.1);
        cam.updateProjectionMatrix();
        cam.lookAt(
          k.x + Math.cos(k.yaw) * 12,
          1.0 + (k.bounceY || 0) * 0.2,
          k.z + Math.sin(k.yaw) * 12
        );
        return;
      }
      var back = 7.8 + clamp(spd * 0.04, 0, 2.5);
      var up = 3.6 + clamp(spd * 0.02, 0, 1.2);
      var tx = k.x - Math.cos(k.yaw) * back;
      var tz = k.z - Math.sin(k.yaw) * back;
      cam.position.x = lerp(cam.position.x || tx, tx, smooth);
      cam.position.y = lerp(cam.position.y || up, up, 0.12);
      cam.position.z = lerp(cam.position.z || tz, tz, smooth);
      cam.fov = lerp(cam.fov || 58, 56 + clamp(spd * 0.15, 0, 8) + (k.input && k.input.boost ? 3 : 0), 0.08);
      cam.updateProjectionMatrix();
      cam.lookAt(k.x + Math.cos(k.yaw) * 7, 0.55 + (k.bounceY || 0), k.z + Math.sin(k.yaw) * 7);
    }`
);

/* slightly richer track shapes */
must(
  "ptsVillage",
  `  function ptsVillage() {
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
  }`,
  `  function ptsVillage() {
    /* 빌리지: 타원 + 핑거 코스 (원작 느낌의 넓은 곡선) */
    var a = [];
    var i, t;
    for (i = 0; i <= 48; i++) {
      t = (i / 48) * Math.PI * 2;
      a.push({
        x: Math.cos(t) * (52 + Math.sin(t * 2) * 4),
        z: Math.sin(t) * (36 + Math.cos(t * 3) * 3)
      });
    }
    for (i = 1; i < 14; i++) {
      t = i / 14;
      a.push({ x: 56 + t * 38, z: Math.sin(t * Math.PI) * 14 + Math.sin(t * 4) * 2 });
    }
    for (i = 1; i < 14; i++) {
      t = i / 14;
      a.push({ x: 94 - t * 38, z: -Math.sin(t * Math.PI) * 14 - Math.sin(t * 3) * 2 });
    }
    return a;
  }`
);

fs.writeFileSync(p, s);

let css = fs.readFileSync(cssPath, "utf8");
if (!css.includes(".kart-cam-btn")) {
  const anchor = ".kart-meters {";
  const idx = css.indexOf(anchor);
  if (idx < 0) {
    console.error("MISSING css .kart-meters");
    process.exit(1);
  }
  /* find end of that rule block roughly - append after meters section */
  css += `

.kart-cam-btn {
  margin-top: 6px;
  border: 1px solid rgba(255,255,255,0.28);
  background: linear-gradient(180deg, rgba(30,40,60,0.92), rgba(18,24,40,0.95));
  color: #f8fafc;
  font: 700 0.78rem "IBM Plex Sans KR", sans-serif;
  padding: 6px 10px;
  border-radius: 10px;
  cursor: pointer;
  letter-spacing: 0.02em;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
}
.kart-cam-btn:hover { border-color: rgba(255,210,100,0.55); color: #ffe8a3; }
.kart-cam-btn:active { transform: translateY(1px); }
`;
  fs.writeFileSync(cssPath, css);
  console.log("ok: css cam btn");
} else {
  console.log("css already has cam btn");
}

console.log("DONE visual+cam patch");

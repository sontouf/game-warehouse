const fs = require("fs");
const files = [
  "js/core/app.js",
  "js/multiplayer/public-rooms.js",
  "js/games/minihub.js",
  "js/games/kart.js",
  "js/games/minihub-client.js",
  "js/multiplayer/engine.js",
];
for (const f of files) {
  require("child_process").execSync("node --check " + f, { stdio: "inherit" });
}
const kart = fs.readFileSync("js/games/kart.js", "utf8");
const bus = fs.readFileSync("js/multiplayer/peer-bus.js", "utf8");
const mh = fs.readFileSync("js/games/minihub.js", "utf8");
const app = fs.readFileSync("js/core/app.js", "utf8");
const eng = fs.readFileSync("js/multiplayer/engine.js", "utf8");
const gl = app.match(/function gameList[\s\S]*?\n  \}/)[0];
const rows = [
  ["kart self-authority + mesh state", /id === me\.id/.test(kart) && /packKartState/.test(kart)],
  ["kart dual channel", /fastConns/.test(kart) && /broadcastFast/.test(kart)],
  ["peer-bus distributed fanout", /broadcastDistributed/.test(bus)],
  ["minihub pose mesh", mh.includes("pose") && mh.includes("broadcastMesh")],
  ["public rooms module", fs.existsSync("js/multiplayer/public-rooms.js")],
  ["lobby without kitchen/minihub", !/kitchen|minihub/.test(gl)],
  ["engine arena+cops only", eng.includes('GAME_TYPES = ["arena", "cops"]')],
  ["lobby gate buttons", app.includes("btn-room-create") && app.includes("GWPublicRooms")],
];
let fail = 0;
for (const [n, ok] of rows) {
  console.log(ok ? "OK" : "FAIL", n);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);

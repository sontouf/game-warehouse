/**
 * Build PeerJS-bridged minihub client from ?€ì§„í‘œ public/minigames.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "archive/bracket-program", "public");
const OUT_JS = path.join(ROOT, "js", "games", "minihub-client.js");
const OUT_AUDIO = path.join(ROOT, "js", "multiplayer", "audio.js");
const OUT_CSS = path.join(ROOT, "css", "minihub.css");

fs.mkdirSync(path.dirname(OUT_JS), { recursive: true });
fs.mkdirSync(path.dirname(OUT_CSS), { recursive: true });

fs.copyFileSync(path.join(SRC, "audio.js"), OUT_AUDIO);
fs.copyFileSync(path.join(SRC, "minigames.css"), OUT_CSS);

let src = fs.readFileSync(path.join(SRC, "minigames.js"), "utf8").replace(/\r\n/g, "\n");

function mustReplace(label, from, to) {
  if (!src.includes(from)) {
    console.error("MISSING:", label);
    process.exit(1);
  }
  src = src.replace(from, to);
  console.log("ok", label);
}

mustReplace(
  "factory head",
  `window.MG = (function () {
  const root = document.getElementById("mgRoot");
  let ws = null;`,
  `window.MGFactory = (function () {
  function createMG(root, bridge) {
  if (!root) throw new Error("mg root missing");
  let ws = null;`
);

mustReplace(
  "connect/send",
  `  // ----------------------------------------------------------------- ?°ê²°
  function connect(onOpen) {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) { onOpen && onOpen(); return; }
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(\`\${proto}://\${location.host}/ws\`);
    ws.onopen = () => onOpen && onOpen();
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handle(m); };
    ws.onclose = () => {};
    ws.onerror = () => {};
  }
  function send(obj) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }`,
  `  // ----------------------------------------------------------------- ?°ê²° (P2P bridge ??no game server)
  function connect(onOpen) {
    if (bridge && bridge.ensure) {
      bridge.ensure(function () { onOpen && onOpen(); });
      return;
    }
    onOpen && onOpen();
  }
  function send(obj) {
    try { if (bridge && bridge.send) bridge.send(obj); } catch (e) {}
  }
  function pushIncoming(m) {
    try { handle(m); } catch (e) { console.warn(e); }
  }`
);

mustReplace(
  "close",
  `  function close() {
    leave();
    try { ws && ws.close(); } catch (e) {}
    ws = null; room = null; shellType = null;
    stopInputLoop();
    MA.stopBgm();
    leaveGameView();
    exitFullscreen();
    root.classList.add("hidden");
    document.body.style.overflow = "";
  }`,
  `  function close() {
    leave();
    try { if (bridge && bridge.destroy) bridge.destroy(); } catch (e) {}
    try { ws && ws.close(); } catch (e) {}
    ws = null; room = null; shellType = null;
    stopInputLoop();
    MA.stopBgm();
    leaveGameView();
    exitFullscreen();
    root.classList.add("hidden");
    document.body.style.overflow = "";
  }`
);

mustReplace(
  "return",
  `  return { open, close };
})();`,
  `  return { open, close, pushIncoming, send, getRoot: function () { return root; } };
  }
  return { create: createMG };
})();`
);

fs.writeFileSync(OUT_JS, src);
console.log("wrote", OUT_JS, Math.round(src.length / 1024) + "KB");
console.log("DONE");

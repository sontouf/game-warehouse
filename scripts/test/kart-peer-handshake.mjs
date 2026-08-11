import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8791;

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/tools/kart-sim.html";
  const file = path.join(ROOT, u.replace(/^\//, ""));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  const t = file.endsWith(".js")
    ? "application/javascript"
    : file.endsWith(".css")
      ? "text/css"
      : "text/html";
  res.writeHead(200, { "Content-Type": t });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const url = `http://127.0.0.1:${PORT}/tools/kart-sim.html`;
const hostCtx = await browser.newContext();
const guestCtx = await browser.newContext();
const host = await hostCtx.newPage();
const guest = await guestCtx.newPage();
for (const p of [host, guest]) p.on("dialog", (d) => d.dismiss());

await host.goto(url, { waitUntil: "networkidle" });
await guest.goto(url, { waitUntil: "networkidle" });
await host.waitForFunction(() => window.__SIM_READY__ && window.Peer);
await guest.waitForFunction(() => window.__SIM_READY__ && window.Peer);
await host.click("#kart-create");
await host.waitForFunction(() => window.__KART_HANDLE__.getUiState().roomVisible, { timeout: 25000 });
const code = await host.evaluate(() => {
  const t = window.__KART_HANDLE__.root.innerText;
  const m = t.match(/방\s+([A-Z0-9]{4,8})/);
  return m && m[1];
});
console.log("code", code);
await host.waitForTimeout(1500);
await guest.click("#kart-join-open");
await guest.fill("#kart-code", code);
await guest.click("#kart-join-go");
let ok = "fail";
try {
  await Promise.race([
    host.waitForFunction(() => window.__KART_HANDLE__.getUiState().roomPlayers >= 2, { timeout: 40000 }),
    guest.waitForFunction(() => window.__KART_HANDLE__.getUiState().roomPlayers >= 2, { timeout: 40000 })
  ]);
  ok = "ok";
} catch (e) {
  ok = "fail:" + e.message;
}
const hp = await host.evaluate(() => window.__KART_HANDLE__.getUiState().roomPlayers);
const gp = await guest.evaluate(() => window.__KART_HANDLE__.getUiState().roomPlayers);
const guestText = await guest.evaluate(() => window.__KART_HANDLE__.root.innerText.slice(0, 200));
console.log(JSON.stringify({ ok, hp, gp, guestText }, null, 2));
fs.writeFileSync(
  path.join(ROOT, "test-results", "kart-8p", "mobile-net", "peer-retry.json"),
  JSON.stringify({ ok, code, hp, gp, guestText, at: new Date().toISOString() }, null, 2)
);
await browser.close();
server.close();

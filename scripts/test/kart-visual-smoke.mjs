import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "test-results", "kart-8p", "visual");
const PORT = 8777;

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/tools/kart-sim.html";
    const file = path.join(ROOT, urlPath.replace(/^\//, ""));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(file) });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://127.0.0.1:${PORT}/tools/kart-sim.html`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForFunction(() => window.__SIM_READY__ === true, { timeout: 30000 });

  for (const mapId of ["village", "forest", "mine"]) {
    await page.evaluate((id) => {
      window.__KART_HANDLE__.startEightPlayerSim({
        mapId: id,
        mode: "solo",
        forceLaps: 1,
        timeScale: 1.5,
        driveSelf: true,
        playerName: "P1"
      });
    }, mapId);
    /* ensure 3rd-person first */
    for (let i = 0; i < 2; i++) {
      const label = await page.locator("#kart-cam").textContent();
      if ((label || "").includes("3?¸ì¹­")) break;
      await page.keyboard.press("KeyV");
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, mapId + "-tp.png") });
    await page.keyboard.press("KeyV");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, mapId + "-fp.png") });
    console.log("ok", mapId);
  }

  await browser.close();
  server.close();
  console.log("DONE", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

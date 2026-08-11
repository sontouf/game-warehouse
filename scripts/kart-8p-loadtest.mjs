/**
 * 8-player kart load test + full race simulation screenshots (Playwright).
 */
import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "test-results", "kart-8p");
const PORT = 8765;

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/kart-sim.html";
    const file = path.join(ROOT, urlPath.replace(/^\//, ""));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(file) });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("screenshot", name);
  return file;
}

async function waitFor(page, fn, timeout = 120000, label = "condition") {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ok = await page.evaluate(fn);
    if (ok) return ok;
    await page.waitForTimeout(200);
  }
  throw new Error("timeout waiting for " + label);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console: " + msg.text());
  });

  const report = {
    startedAt: new Date().toISOString(),
    maps: [],
    screenshots: [],
    pass: false,
    errors: []
  };

  try {
    await page.goto(`http://127.0.0.1:${PORT}/kart-sim.html`, { waitUntil: "networkidle", timeout: 60000 });
    await waitFor(page, () => window.__SIM_READY__ === true, 30000, "sim ready");
    const bootErr = await page.evaluate(() => window.__SIM_ERROR__);
    if (bootErr) throw new Error(bootErr);

    /* 1) Lobby */
    report.screenshots.push(await shot(page, "01-lobby.png"));

    /* 2) Room with 8 ready (stop before race) */
    await page.evaluate(() => {
      window.__KART_HANDLE__.startEightPlayerSim({ stopAtRoom: true, mode: "team", mapId: "village" });
    });
    await page.waitForTimeout(400);
    const roomState = await page.evaluate(() => window.__KART_HANDLE__.getUiState());
    if (roomState.roomPlayers !== 8) throw new Error("expected 8 room players, got " + roomState.roomPlayers);
    report.screenshots.push(await shot(page, "02-room-8players-ready.png"));

    /* 3) Full race on village */
    await page.evaluate(() => {
      window.__KART_HANDLE__.startEightPlayerSim({
        mapId: "village",
        mode: "solo",
        forceLaps: 1,
        timeScale: 3.2,
        driveSelf: true
      });
    });
    await page.waitForTimeout(300);
    report.screenshots.push(await shot(page, "03-countdown.png"));

    await waitFor(page, () => {
      const s = window.__KART_HANDLE__.getUiState();
      return s.racePhase === "running" || s.racePhase === "finishing";
    }, 20000, "race running");
    await page.waitForTimeout(800);
    report.screenshots.push(await shot(page, "04-racing-live-ranks.png"));

    /* mid race — ensure 8 rank rows + minimap + boost UI */
    const mid = await page.evaluate(() => {
      const s = window.__KART_HANDLE__.getUiState();
      const rankRows = document.querySelectorAll(".kart-rank__row").length;
      const meshes = window.__KART_HANDLE__.getMetrics();
      return {
        rankRows,
        center: s.centerText,
        canvasOk: s.canvasOk,
        raceVisible: s.raceVisible,
        metrics: meshes
      };
    });
    if (mid.rankRows < 8) throw new Error("rank HUD rows < 8: " + mid.rankRows);
    if (!mid.canvasOk || !mid.raceVisible) throw new Error("race canvas not visible");

    await waitFor(page, () => {
      const s = window.__KART_HANDLE__.getUiState();
      return s.racePhase === "finishing" || s.resultVisible || s.mode === "result";
    }, 180000, "finishing or result");

    const finishing = await page.evaluate(() => window.__KART_HANDLE__.getUiState());
    if (finishing.racePhase === "finishing") {
      report.screenshots.push(await shot(page, "05-finish-window-10s.png"));
    }

    await waitFor(page, () => {
      const s = window.__KART_HANDLE__.getUiState();
      return s.resultVisible || s.mode === "result";
    }, 60000, "results screen");
    await page.waitForTimeout(400);
    report.screenshots.push(await shot(page, "06-results-ranks.png"));

    const villageMetrics = await page.evaluate(() => window.__KART_HANDLE__.getMetrics());
    const resultRows = await page.evaluate(() => document.querySelectorAll(".kart-table tbody tr").length);
    if (resultRows < 8) throw new Error("results rows < 8: " + resultRows);
    if (!villageMetrics || villageMetrics.playerCount !== 8) {
      throw new Error("metrics playerCount != 8");
    }
    report.maps.push({ mapId: "village", metrics: villageMetrics, resultRows });

    /* Stress remaining maps quickly (render + short race) */
    for (const mapId of ["forest", "mine"]) {
      await page.evaluate((id) => {
        window.__KART_HANDLE__.startEightPlayerSim({
          mapId: id,
          mode: "team",
          forceLaps: 1,
          timeScale: 4.5,
          driveSelf: true
        });
      }, mapId);
      await waitFor(page, () => {
        const s = window.__KART_HANDLE__.getUiState();
        return s.racePhase === "running" || s.racePhase === "finishing" || s.resultVisible;
      }, 30000, mapId + " running");
      await page.waitForTimeout(500);
      report.screenshots.push(await shot(page, `07-racing-${mapId}.png`));
      await waitFor(page, () => {
        const s = window.__KART_HANDLE__.getUiState();
        return s.resultVisible || s.mode === "result";
      }, 180000, mapId + " results");
      const metrics = await page.evaluate(() => window.__KART_HANDLE__.getMetrics());
      report.maps.push({ mapId, metrics });
      report.screenshots.push(await shot(page, `08-results-${mapId}.png`));
    }

    /* Pass criteria */
    const fpsFails = report.maps.filter((m) => !m.metrics || m.metrics.avgFps < 20 || m.metrics.maxFrameMs > 120);
    const frameOk = report.maps.every((m) => m.metrics && m.metrics.frames > 60);
    report.pass = fpsFails.length === 0 && frameOk && resultRows === 8 && errors.length === 0;
    report.errors = errors.slice();
    report.fpsFails = fpsFails.map((m) => ({ mapId: m.mapId, avgFps: m.metrics && m.metrics.avgFps, maxFrameMs: m.metrics && m.metrics.maxFrameMs }));
    report.finishedAt = new Date().toISOString();

    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

    const md = [
      "# Kart 8P Load Test Report",
      "",
      `- Pass: **${report.pass}**`,
      `- Started: ${report.startedAt}`,
      `- Finished: ${report.finishedAt}`,
      "",
      "## Maps",
      ...report.maps.map((m) => {
        const x = m.metrics || {};
        return `- **${m.mapId}**: avgFps=${x.avgFps}, minFps=${x.minFps}, maxFrameMs=${x.maxFrameMs}, frames=${x.frames}, karts=${x.playerCount}, sceneChildren=${x.sceneChildren}`;
      }),
      "",
      "## Screenshots",
      ...report.screenshots.map((s) => `- ${path.basename(s)}`),
      "",
      "## Errors",
      ...(report.errors.length ? report.errors.map((e) => `- ${e}`) : ["- (none)"]),
      ""
    ].join("\n");
    fs.writeFileSync(path.join(OUT, "REPORT.md"), md);

    console.log("\n=== LOAD TEST SUMMARY ===");
    console.log(md);
    if (!report.pass) {
      console.error("LOAD TEST FAILED");
      process.exitCode = 1;
    } else {
      console.log("LOAD TEST PASSED");
    }
  } catch (e) {
    report.pass = false;
    report.errors.push(String(e && e.stack ? e.stack : e));
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    try { await shot(page, "99-error.png"); } catch (_) {}
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

main();

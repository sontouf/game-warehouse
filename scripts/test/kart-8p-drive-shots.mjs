/**
 * 8???�이??주행거리 10%마다 ?�크린샷 촬영
 */
import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "test-results", "kart-8p", "drive");
const PORT = 8766;

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function startServer() {
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
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log("shot", name);
  return path.basename(file);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const taken = [];
  const log = [];

  try {
    await page.goto(`http://127.0.0.1:${PORT}/tools/kart-sim.html`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction(() => window.__SIM_READY__ === true, { timeout: 30000 });

    await page.evaluate(() => {
      window.__KART_HANDLE__.startEightPlayerSim({
        mapId: "village",
        mode: "solo",
        forceLaps: 2,
        timeScale: 1.8,
        driveSelf: true,
        playerName: "Player1"
      });
    });

    /* countdown / start */
    await page.waitForFunction(() => {
      const p = window.__KART_HANDLE__.getRaceProgress();
      return p && (p.phase === "running" || p.phase === "finishing" || p.phase === "countdown");
    }, { timeout: 15000 });

    await page.waitForTimeout(400);
    taken.push(await shot(page, "drive-00pct-start.png"));
    log.push({ pct: 0, note: "start/countdown" });

    const marks = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    let nextIdx = 0;
    const deadline = Date.now() + 240000;

    while (nextIdx < marks.length && Date.now() < deadline) {
      const prog = await page.evaluate(() => window.__KART_HANDLE__.getRaceProgress());
      if (!prog) {
        await page.waitForTimeout(50);
        continue;
      }

      const ui = await page.evaluate(() => window.__KART_HANDLE__.getUiState());
      if (ui.resultVisible || ui.mode === "result") {
        /* fill remaining with result frame if race ended early */
        while (nextIdx < marks.length) {
          const pct = marks[nextIdx++];
          const name = `drive-${String(pct).padStart(2, "0")}pct.png`;
          taken.push(await shot(page, name));
          log.push({ pct, note: "race already finished ??result/end frame", ...prog });
        }
        break;
      }

      const leaderPct = prog.leaderPct || 0;
      while (nextIdx < marks.length && leaderPct + 0.5 >= marks[nextIdx]) {
        const pct = marks[nextIdx++];
        const name = `drive-${String(pct).padStart(2, "0")}pct.png`;
        taken.push(await shot(page, name));
        log.push({
          pct,
          leaderPct: Math.round(leaderPct * 10) / 10,
          mePct: Math.round((prog.mePct || 0) * 10) / 10,
          meKmh: prog.meKmh,
          lap: prog.lap,
          laps: prog.laps,
          phase: prog.phase,
          leaderName: prog.leaderName
        });
      }

      if (prog.phase === "done" || prog.finishedCount >= 8) {
        while (nextIdx < marks.length) {
          const pct = marks[nextIdx++];
          taken.push(await shot(page, `drive-${String(pct).padStart(2, "0")}pct.png`));
          log.push({ pct, note: "finishing fill", ...prog });
        }
        break;
      }

      await page.waitForTimeout(40);
    }

    /* final results */
    try {
      await page.waitForFunction(() => {
        const s = window.__KART_HANDLE__.getUiState();
        return s.resultVisible || s.mode === "result";
      }, { timeout: 90000 });
      await page.waitForTimeout(300);
      taken.push(await shot(page, "drive-results.png"));
    } catch (_) {}

    const report = {
      startedAt: new Date().toISOString(),
      mapId: "village",
      players: 8,
      forceLaps: 2,
      screenshots: taken,
      milestones: log
    };
    fs.writeFileSync(path.join(OUT, "drive-report.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(
      path.join(OUT, "README.md"),
      [
        "# 8??주행 거리 10% ?�크린샷",
        "",
        `- �? village (빌리지 ?��???`,
        `- ?? 2`,
        `- ?�레?�어: 8 (Player1 + Bot1~7)`,
        `- 기�?: ?�두 주행거리 %`,
        "",
        "## ?�일",
        ...taken.map((t) => `- ${t}`),
        "",
        "## 마일?�톤",
        ...log.map((m) => `- ${m.pct}% · lap ${m.lap || "-"}/${m.laps || "-"} · ${m.meKmh || 0}km/h · ${m.phase || m.note || ""}`),
        ""
      ].join("\n")
    );

    console.log("\nDONE", taken.length, "screenshots ??, OUT);
    if (taken.length < 11) {
      console.warn("WARN: expected ~11 drive shots (0+10..100), got", taken.length);
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

main();

/**
 * Kart 8P mobile + network load/analysis suite (Playwright).
 * - Desktop & mobile render stress (8 bots)
 * - Asset load under network throttling
 * - PeerJS state bandwidth model + optional 2-client room handshake
 */
import { chromium, devices } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "test-results", "kart-8p", "mobile-net");
const PORT = 8768;

const NETWORK_PROFILES = {
  wifi: { offline: false, downloadThroughput: (30 * 1024 * 1024) / 8, uploadThroughput: (15 * 1024 * 1024) / 8, latency: 20 },
  "4g": { offline: false, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8, latency: 70 },
  "3g": { offline: false, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
  "slow-3g": { offline: false, downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8, latency: 400 },
  offline: { offline: true, downloadThroughput: 0, uploadThroughput: 0, latency: 0 }
};

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

async function applyNet(cdp, profileName) {
  const p = NETWORK_PROFILES[profileName];
  if (!p) throw new Error("unknown profile " + profileName);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: p.offline,
    latency: p.latency,
    downloadThroughput: p.downloadThroughput,
    uploadThroughput: p.uploadThroughput
  });
}

function estimateStatePayloadBytes(playerCount) {
  const kart = {
    id: "ABCDEF",
    x: 12.3456,
    z: -45.6789,
    yaw: 1.2345,
    speed: 28.12,
    boost: 0.42,
    lap: 2,
    progress: 123.456,
    finished: false,
    place: 0
  };
  const msg = {
    type: "state",
    t: 123.456,
    phase: "running",
    countdown: 0,
    finishTimer: 10,
    firstFinished: false,
    karts: Array.from({ length: playerCount }, (_, i) => ({ ...kart, id: "P" + i, place: i + 1 }))
  };
  return Buffer.byteLength(JSON.stringify(msg), "utf8");
}

function networkModel(playerCount = 8, tickHz = 20) {
  const clients = Math.max(0, playerCount - 1);
  const stateBytes = estimateStatePayloadBytes(playerCount);
  const inputBytes = Buffer.byteLength(JSON.stringify({
    type: "input",
    id: "ABCDEF",
    input: { steer: 0.5, throttle: 1, drift: true, boost: false }
  }), "utf8");

  const hostUpBps = stateBytes * tickHz * clients;
  const clientDownBps = stateBytes * tickHz;
  const clientUpBps = inputBytes * tickHz;
  const hostDownBps = inputBytes * tickHz * clients;

  function fit(profile) {
    const p = NETWORK_PROFILES[profile];
    if (p.offline) {
      return { profile, hostOk: false, clientOk: false, reason: "offline" };
    }
    const hostOk = hostUpBps <= p.uploadThroughput * 0.85 && hostDownBps <= p.downloadThroughput * 0.85;
    const clientOk = clientDownBps <= p.downloadThroughput * 0.85 && clientUpBps <= p.uploadThroughput * 0.85;
    const ticksOfLatency = Math.round((p.latency / 1000) * tickHz);
    return {
      profile,
      hostOk,
      clientOk,
      ticksOfLatency,
      headroomHostUpPct: Math.round((1 - hostUpBps / p.uploadThroughput) * 100),
      headroomClientDownPct: Math.round((1 - clientDownBps / p.downloadThroughput) * 100),
      verdict: !hostOk ? "host-uplink-risk" : ticksOfLatency >= 6 ? "high-latency" : clientOk ? "ok" : "client-risk"
    };
  }

  return {
    tickHz,
    playerCount,
    stateBytes,
    inputBytes,
    hostUpKbps: Math.round((hostUpBps * 8) / 1024),
    hostDownKbps: Math.round((hostDownBps * 8) / 1024),
    clientDownKbps: Math.round((clientDownBps * 8) / 1024),
    clientUpKbps: Math.round((clientUpBps * 8) / 1024),
    profiles: ["wifi", "4g", "3g", "slow-3g"].map(fit)
  };
}

async function raceMetrics(page, { mapId, timeScale, forceLaps, sampleMs }) {
  await page.evaluate(({ mapId, timeScale, forceLaps }) => {
    window.__KART_HANDLE__.startEightPlayerSim({
      mapId,
      mode: "solo",
      forceLaps,
      timeScale,
      driveSelf: true,
      playerName: "LoadP1"
    });
  }, { mapId, timeScale, forceLaps });

  await page.waitForFunction(() => {
    const s = window.__KART_HANDLE__.getUiState();
    return s.racePhase === "running" || s.racePhase === "finishing" || s.resultVisible;
  }, { timeout: 30000 });

  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < sampleMs) {
    const m = await page.evaluate(() => window.__KART_HANDLE__.getMetrics());
    if (m) samples.push({
      t: Date.now() - t0,
      avgFps: m.avgFps,
      maxFrameMs: m.maxFrameMs,
      frames: m.frames,
      sceneChildren: m.sceneChildren,
      phase: m.phase
    });
    await page.waitForTimeout(250);
  }

  await page.waitForFunction(() => {
    const s = window.__KART_HANDLE__.getUiState();
    return s.resultVisible || s.mode === "result";
  }, { timeout: 180000 }).catch(() => null);

  const final = await page.evaluate(() => window.__KART_HANDLE__.getMetrics());
  const ui = await page.evaluate(() => window.__KART_HANDLE__.getUiState());
  return { mapId, final, samples, ui };
}

async function measureBoot(page, cdp, profile, url) {
  await applyNet(cdp, profile);
  const started = Date.now();
  const responses = [];
  const onResp = async (res) => {
    try {
      const req = res.request();
      const u = req.url();
      if (!u.includes("127.0.0.1") && !u.includes("peerjs") && !u.includes("cloudflare") && !u.includes("unpkg") && !u.includes("jsdelivr") && !u.includes("gstatic")) return;
      const timing = res.request().timing();
      responses.push({
        url: u.split("?")[0].replace(/^https?:\/\//, "").slice(0, 80),
        status: res.status(),
        timing
      });
    } catch (_) {}
  };
  page.on("response", onResp);
  let bootError = null;
  let readyMs = null;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => window.__SIM_READY__ === true || window.__SIM_ERROR__, { timeout: 60000 });
    readyMs = Date.now() - started;
    bootError = await page.evaluate(() => window.__SIM_ERROR__ || null);
  } catch (e) {
    bootError = String(e);
    readyMs = Date.now() - started;
  }
  page.off("response", onResp);
  const cdn = responses.filter((r) => /peerjs|three|cdn|unpkg|jsdelivr|cloudflare/i.test(r.url));
  return {
    profile,
    readyMs,
    bootError,
    responseCount: responses.length,
    cdnHits: cdn.length,
    slowest: responses
      .map((r) => ({ url: r.url, total: r.timing && r.timing.responseEnd != null ? r.timing.responseEnd : null }))
      .filter((r) => r.total != null)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  };
}

async function peerHandshakeTest(browser, url) {
  const hostCtx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const guestCtx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  for (const p of [host, guest]) {
    p.on("dialog", async (d) => {
      try { await d.dismiss(); } catch (_) {}
    });
  }
  const result = { ok: false, code: null, hostOpenMs: null, guestJoinMs: null, error: null, notes: [] };

  try {
    await host.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await guest.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await host.waitForFunction(() => window.__SIM_READY__ === true && !!window.Peer, { timeout: 30000 });
    await guest.waitForFunction(() => window.__SIM_READY__ === true && !!window.Peer, { timeout: 30000 });

    const t0 = Date.now();
    const created = await host.evaluate(async () => {
      const root = window.__KART_HANDLE__.root;
      const btn = root.querySelector("#kart-create");
      if (!btn) return { error: "no create button" };
      btn.click();
      const start = Date.now();
      while (Date.now() - start < 25000) {
        const st = window.__KART_HANDLE__.getUiState();
        const text = root.innerText || "";
        const m = text.match(/ë°?s+([A-Z0-9]{4,8})\b/);
        if (st.roomVisible && m) {
          return { code: m[1].toUpperCase(), ms: Date.now() - start, players: st.roomPlayers };
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      return { error: "room not ready", text: (root.innerText || "").slice(0, 240) };
    });
    result.hostOpenMs = Date.now() - t0;
    if (created.error) {
      result.error = created.error + (created.text ? (": " + created.text) : "");
      return result;
    }
    result.code = created.code;
    result.notes.push("hostPlayers=" + created.players);

    /* give PeerJS cloud a moment to register host id */
    await host.waitForTimeout(1200);

    const t1 = Date.now();
    const joined = await guest.evaluate(async (code) => {
      const root = window.__KART_HANDLE__.root;
      const open = root.querySelector("#kart-join-open");
      if (open) open.click();
      await new Promise((r) => setTimeout(r, 100));
      const input = root.querySelector("#kart-code");
      const joinBtn = root.querySelector("#kart-join-go");
      if (!input || !joinBtn) return { error: "no join UI" };
      input.focus();
      input.value = code;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      joinBtn.click();
      const start = Date.now();
      while (Date.now() - start < 35000) {
        const st = window.__KART_HANDLE__.getUiState();
        if (st.roomVisible && st.roomPlayers >= 2) {
          return { ok: true, players: st.roomPlayers, ms: Date.now() - start };
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      return {
        error: "join timeout",
        players: window.__KART_HANDLE__.getUiState().roomPlayers,
        text: (root.innerText || "").slice(0, 220)
      };
    }, created.code);
    result.guestJoinMs = Date.now() - t1;

    const hostPlayers = await host.evaluate(() => window.__KART_HANDLE__.getUiState().roomPlayers);
    result.notes.push("hostPlayersAfter=" + hostPlayers);
    if (joined.ok || hostPlayers >= 2) {
      result.ok = true;
      result.players = Math.max(joined.players || 0, hostPlayers || 0);
      return result;
    }
    result.error = (joined.error || "join failed") + (joined.text ? (" | " + joined.text) : "");
  } catch (e) {
    result.error = String(e && e.stack ? e.stack : e);
  } finally {
    await hostCtx.close();
    await guestCtx.close();
  }
  return result;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const url = `http://127.0.0.1:${PORT}/tools/kart-sim.html`;
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
  });

  const report = {
    startedAt: new Date().toISOString(),
    networkModel: networkModel(8, 20),
    boots: [],
    desktop: [],
    mobile: [],
    peer: null,
    pass: false,
    errors: [],
    verdicts: []
  };

  try {
    /* ---- Boot under network profiles (desktop page) ---- */
    for (const profile of ["wifi", "4g", "3g", "slow-3g"]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      const cdp = await page.context().newCDPSession(page);
      const boot = await measureBoot(page, cdp, profile, url);
      report.boots.push(boot);
      await page.screenshot({ path: path.join(OUT, `boot-${profile}.png`) }).catch(() => {});
      await ctx.close();
      console.log("boot", profile, boot.readyMs, "ms", boot.bootError ? "ERR" : "ok");
    }

    /* ---- Desktop 8P render stress ---- */
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => report.errors.push("desktop: " + e));
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForFunction(() => window.__SIM_READY__ === true, { timeout: 30000 });
      for (const mapId of ["village", "forest", "mine"]) {
        const r = await raceMetrics(page, { mapId, timeScale: 3.5, forceLaps: 1, sampleMs: 3500 });
        report.desktop.push(r);
        await page.screenshot({ path: path.join(OUT, `desktop-${mapId}.png`) });
        console.log("desktop", mapId, "avgFps", r.final && r.final.avgFps, "maxFrameMs", r.final && r.final.maxFrameMs, "children", r.final && r.final.sceneChildren);
      }
      await ctx.close();
    }

    /* ---- Mobile 8P render stress ---- */
    {
      const iPhone = devices["iPhone 13"];
      const ctx = await browser.newContext({
        ...iPhone,
        hasTouch: true,
        isMobile: true
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => report.errors.push("mobile: " + e));
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForFunction(() => window.__SIM_READY__ === true, { timeout: 30000 });
      const uaMobile = await page.evaluate(() => /Mobi|Android|iPhone/i.test(navigator.userAgent));
      for (const mapId of ["village", "forest", "mine"]) {
        const r = await raceMetrics(page, { mapId, timeScale: 3.5, forceLaps: 1, sampleMs: 4000 });
        r.uaMobile = uaMobile;
        report.mobile.push(r);
        await page.screenshot({ path: path.join(OUT, `mobile-${mapId}.png`) });
        /* touch controls exist */
        const touch = await page.evaluate(() => {
          const root = window.__KART_HANDLE__.root;
          return {
            wheel: !!root.querySelector("#kart-wheel"),
            drift: !!root.querySelector("#kart-drift"),
            boost: !!root.querySelector("#kart-boost"),
            cam: !!root.querySelector("#kart-cam")
          };
        });
        r.touch = touch;
        console.log("mobile", mapId, "avgFps", r.final && r.final.avgFps, "maxFrameMs", r.final && r.final.maxFrameMs, "touch", touch);
      }

      /* FP toggle on mobile */
      await page.keyboard.press("KeyV").catch(() => {});
      await page.locator("#kart-cam").click().catch(() => {});
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, "mobile-cam-toggle.png") });
      await ctx.close();
    }

    /* ---- Peer handshake (real PeerJS, best-effort) ---- */
    report.peer = await peerHandshakeTest(browser, url);
    console.log("peer", report.peer);

    /* ---- Pass criteria ---- */
    const desktopOk = report.desktop.every((r) => r.final && r.final.avgFps >= 28 && r.final.maxFrameMs <= 90 && r.final.playerCount === 8);
    const mobileOk = report.mobile.every((r) => r.final && r.final.avgFps >= 22 && r.final.maxFrameMs <= 110 && r.final.playerCount === 8);
    const bootOk = report.boots.every((b) => !b.bootError && b.readyMs < (b.profile === "slow-3g" ? 45000 : 20000));
    const netWifi4g = report.networkModel.profiles.filter((p) => p.profile === "wifi" || p.profile === "4g").every((p) => p.hostOk && p.clientOk);
    const touchOk = report.mobile.every((r) => r.touch && r.touch.wheel && r.touch.drift && r.touch.boost);

    report.verdicts = [
      { id: "desktop-8p-fps", pass: desktopOk, detail: report.desktop.map((r) => `${r.mapId}:${r.final && r.final.avgFps}fps`) },
      { id: "mobile-8p-fps", pass: mobileOk, detail: report.mobile.map((r) => `${r.mapId}:${r.final && r.final.avgFps}fps`) },
      { id: "mobile-touch-ui", pass: touchOk, detail: "wheel/drift/boost" },
      { id: "boot-under-throttle", pass: bootOk, detail: report.boots.map((b) => `${b.profile}:${b.readyMs}ms`) },
      { id: "net-model-wifi-4g", pass: netWifi4g, detail: report.networkModel.profiles },
      { id: "peer-handshake", pass: !!report.peer?.ok, detail: report.peer, optional: true }
    ];

    /* peer optional: signaling CDN / NAT can fail in CI */
    const required = report.verdicts.filter((v) => !v.optional);
    report.pass = required.every((v) => v.pass) && report.errors.length === 0;
    report.finishedAt = new Date().toISOString();

    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

    const md = [
      "# Kart Mobile + Network Load Report",
      "",
      `- Pass (required): **${report.pass}**`,
      `- Peer handshake (optional): **${!!report.peer?.ok}**`,
      `- Started: ${report.startedAt}`,
      `- Finished: ${report.finishedAt}`,
      "",
      "## Network model (8P @ 20Hz host broadcast)",
      `- state payload: ${report.networkModel.stateBytes} B`,
      `- host uplink: ~${report.networkModel.hostUpKbps} kbps`,
      `- client downlink: ~${report.networkModel.clientDownKbps} kbps`,
      ...report.networkModel.profiles.map((p) => `- ${p.profile}: hostOk=${p.hostOk} clientOk=${p.clientOk} latencyTicks??{p.ticksOfLatency} ??**${p.verdict}**`),
      "",
      "## Boot under throttle",
      ...report.boots.map((b) => `- ${b.profile}: ready=${b.readyMs}ms error=${b.bootError || "none"}`),
      "",
      "## Desktop FPS",
      ...report.desktop.map((r) => {
        const m = r.final || {};
        return `- ${r.mapId}: avgFps=${m.avgFps} maxFrameMs=${m.maxFrameMs} sceneChildren=${m.sceneChildren}`;
      }),
      "",
      "## Mobile FPS",
      ...report.mobile.map((r) => {
        const m = r.final || {};
        return `- ${r.mapId}: avgFps=${m.avgFps} maxFrameMs=${m.maxFrameMs} sceneChildren=${m.sceneChildren} uaMobile=${r.uaMobile}`;
      }),
      "",
      "## Verdicts",
      ...report.verdicts.map((v) => `- ${v.id}: ${v.pass ? "PASS" : "FAIL"}${v.optional ? " (optional)" : ""}`),
      "",
      "## Errors",
      ...(report.errors.length ? report.errors.map((e) => `- ${e}`) : ["- (none)"]),
      ""
    ].join("\n");
    fs.writeFileSync(path.join(OUT, "REPORT.md"), md);
    console.log("\n" + md);

    if (!report.pass) process.exitCode = 1;
  } catch (e) {
    report.pass = false;
    report.errors.push(String(e && e.stack ? e.stack : e));
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

main();

/**
 * 화면비율별 조작 레이아웃 + 미리보기 에디터 스크린샷
 */
import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "test-results", "control-layouts");
const PORT = 8796;

const VIEWPORTS = [
  { name: "iphone-se-9x16", width: 375, height: 667 },
  { name: "iphone-14-9x195", width: 390, height: 844 },
  { name: "pixel7-9x20", width: 412, height: 915 },
  { name: "android-9x18", width: 360, height: 800 },
  { name: "fold-narrow", width: 344, height: 882 },
  { name: "iphone-14-land", width: 844, height: 390 },
  { name: "short-land", width: 740, height: 360 },
  { name: "tablet-port", width: 768, height: 1024 },
];

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath === "/") urlPath = "/index.html";
      const file = path.join(ROOT, urlPath.replace(/^\//, ""));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end("nf"); return;
      }
      res.writeHead(200, { "Content-Type": contentType(file) });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

function layoutEngineScript(kind) {
  const arenaL = {
    joy: { left: 3, bottom: 3, w: 104, h: 104 },
    dash: { right: 28, bottom: 6, w: 68, h: 68 },
    shoot: { right: 3, bottom: 3, w: 92, h: 92 },
  };
  const copsL = {
    joy: { left: 3, bottom: 3, w: 100, h: 100 },
    stab: { right: 3, bottom: 3, w: 86, h: 86 },
    dash: { right: 26, bottom: 4, w: 64, h: 64 },
    defend: { right: 3, bottom: 22, w: 64, h: 64 },
    sit: { right: 26, bottom: 22, w: 48, h: 48 },
    wave: { right: 40, bottom: 22, w: 48, h: 48 },
  };
  const L = kind === "cops" ? copsL : arenaL;
  return `
const L = ${JSON.stringify(L)};
function scale(sw,sh){const short=Math.min(sw,sh);let s=short/520;if(sh<420)s*=0.82;if(sw/sh>1.7)s*=0.9;if(sw/sh<0.6)s*=0.9;return Math.max(0.58,Math.min(1.18,s));}
function apply(){
  const stage=document.getElementById('stage');
  const sw=stage.clientWidth, sh=stage.clientHeight;
  const sc=scale(sw,sh); stage.style.setProperty('--ctl-scale',sc);
  document.getElementById('meta').textContent = sw+'×'+sh+' · scale '+sc.toFixed(2)+' · AR '+(sw/sh).toFixed(2);
  stage.querySelectorAll('[data-ctl]').forEach(el=>{
    const pos=L[el.dataset.ctl]; if(!pos)return;
    const bw=Math.round((pos.w||72)*sc), bh=Math.round((pos.h||72)*sc);
    el.style.position='absolute'; el.style.width=bw+'px'; el.style.height=bh+'px'; el.style.top='auto';
    const pad=Math.max(6,Math.round(sw*0.01));
    if(pos.left!=null){el.style.left=Math.round(pos.left/100*sw)+pad+'px';el.style.right='auto';}
    if(pos.right!=null){el.style.right=Math.round(pos.right/100*sw)+pad+'px';el.style.left='auto';}
    if(pos.bottom!=null)el.style.bottom=Math.round(pos.bottom/100*sh)+pad+'px';
  });
}
apply();
`;
}

function arenaHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/minihub.css">
<style>
html,body{margin:0;height:100%;background:#070b16;font-family:system-ui,sans-serif;overflow:hidden}
#stage{position:relative;width:100vw;height:100vh;overflow:hidden;background:#0f172a}
#stage canvas{width:100%;height:100%;display:block}
#meta{position:absolute;top:10px;left:0;right:0;text-align:center;color:#fde68a;font-weight:900;z-index:6;text-shadow:0 2px 8px #000;font-size:13px}
.title{position:absolute;top:34px;left:0;right:0;text-align:center;color:#e2e8f0;font-weight:800;z-index:6;font-size:12px}
</style></head><body>
<div class="arena-stage" id="stage" style="--ctl-scale:1">
<canvas></canvas>
<div id="meta"></div>
<div class="title">아레나 · 비율별 조작 배치</div>
<div class="joystick" data-ctl="joy"><div class="joystick-knob"></div></div>
<button class="skill dash" data-ctl="dash"><span class="sk-ico">⚡</span><span class="sk-lb">대쉬</span></button>
<button class="skill shoot" data-ctl="shoot"><span class="sk-ico">🔫</span><span class="sk-lb">발사</span></button>
</div>
<script>${layoutEngineScript("arena")}</script>
</body></html>`;
}

function copsHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/minihub.css">
<style>
html,body{margin:0;height:100%;background:#070b16;font-family:system-ui,sans-serif;overflow:hidden}
#stage{position:relative;width:100vw;height:100vh;overflow:hidden;background:#0b1220}
#meta{position:absolute;top:10px;left:0;right:0;text-align:center;color:#fde68a;font-weight:900;z-index:6;text-shadow:0 2px 8px #000;font-size:13px}
.title{position:absolute;top:34px;left:0;right:0;text-align:center;color:#e2e8f0;font-weight:800;z-index:6;font-size:12px}
#copsCtl{position:absolute;inset:0;pointer-events:none;z-index:4}
#copsCtl>[data-ctl]{pointer-events:auto}
</style></head><body>
<div class="arena-stage" id="stage" style="--ctl-scale:1">
<div id="meta"></div>
<div class="title">AI인척 · 비율별 조작 배치</div>
<div id="copsCtl">
  <div class="joystick" data-ctl="joy"><div class="joystick-knob"></div></div>
  <button class="cbtn stab" data-ctl="stab"><span class="sk-ico">🗡️</span><span class="sk-lb">찌르기</span></button>
  <button class="cbtn dash" data-ctl="dash"><span class="sk-ico">⚡</span><span class="sk-lb">대쉬</span></button>
  <button class="cbtn defend" data-ctl="defend"><span class="sk-ico">🛡️</span><span class="sk-lb">방어</span></button>
  <button class="cbtn sm sit" data-ctl="sit">🪑</button>
  <button class="cbtn sm wave" data-ctl="wave">👋</button>
</div>
</div>
<script>${layoutEngineScript("cops")}</script>
</body></html>`;
}

async function shotPage(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log("✓", name);
  return file;
}

async function captureRatios(browser) {
  const taken = [];
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.width < 700,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await page.setContent(arenaHtml().replace('href="/css/minihub.css"', `href="http://127.0.0.1:${PORT}/css/minihub.css"`), { waitUntil: "networkidle" });
    await page.waitForTimeout(150);
    taken.push(await shotPage(page, `ratio-arena-${vp.name}.png`));

    await page.setContent(copsHtml().replace('href="/css/minihub.css"', `href="http://127.0.0.1:${PORT}/css/minihub.css"`), { waitUntil: "networkidle" });
    await page.waitForTimeout(150);
    taken.push(await shotPage(page, `ratio-cops-${vp.name}.png`));
    await page.close();
  }
  return taken;
}

async function captureEditor(browser) {
  const taken = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#game-grid .game-card", { timeout: 20000 });
    await page.fill("#lobby-player-id", "LayEdit");
    await page.click("#btn-room-create");
    await page.waitForSelector("#mg-go", { timeout: 8000 });
    await page.click('.lobby-modal__game[data-g="arena"]');
    await page.fill("#mg-rname", "레이아웃편집");
    await page.click("#mg-go");
    await page.waitForSelector(".mg-root", { timeout: 25000 });
    await page.waitForTimeout(1000);
    const editBtn = page.locator('[data-mg="ctl-edit"]');
    if (await editBtn.count()) {
      await editBtn.click();
      await page.waitForSelector("#ctlEditor", { timeout: 5000 });
      await page.waitForTimeout(400);
      taken.push(await shotPage(page, "editor-arena-iphone14.png"));
      await page.selectOption("#ctlAspectSel", "844x390");
      await page.waitForTimeout(300);
      taken.push(await shotPage(page, "editor-arena-preview-land.png"));
      await page.selectOption("#ctlAspectSel", "344x882");
      await page.waitForTimeout(300);
      taken.push(await shotPage(page, "editor-arena-preview-fold.png"));
    } else {
      console.warn("ctl-edit button missing");
    }
  } catch (e) {
    console.warn("editor capture:", e.message);
  }
  await page.close();
  return taken;
}

async function captureKartRatios(browser) {
  const taken = [];
  for (const vp of VIEWPORTS.filter((v) => ["iphone-14-9x195", "iphone-se-9x16", "iphone-14-land", "short-land", "pixel7-9x20"].includes(v.name))) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    });
    try {
      await page.goto(`http://127.0.0.1:${PORT}/tools/kart-sim.html`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForFunction(() => window.__SIM_READY__ === true, { timeout: 45000 });
      await page.evaluate(() => {
        document.documentElement.classList.add("force-touch");
        window.__KART_HANDLE__.startEightPlayerSim({
          mapId: "village", mode: "solo", forceLaps: 1, timeScale: 2.0, driveSelf: true, playerName: "YOU",
        });
      });
      await page.waitForTimeout(2800);
      await page.evaluate(() => {
        const t = document.querySelector("#kart-touch");
        if (t) t.style.display = "flex";
        window.dispatchEvent(new Event("resize"));
      });
      await page.waitForTimeout(250);
      taken.push(await shotPage(page, `ratio-kart-${vp.name}.png`));
    } catch (e) {
      console.warn("kart", vp.name, e.message);
    }
    await page.close();
  }
  return taken;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--ignore-gpu-blocklist"] });
  const all = [];
  try { all.push(...await captureRatios(browser)); } catch (e) { console.warn(e); }
  try { all.push(...await captureKartRatios(browser)); } catch (e) { console.warn(e); }
  try { all.push(...await captureEditor(browser)); } catch (e) { console.warn(e); }
  await browser.close();
  server.close();
  const manifest = {
    generatedAt: new Date().toISOString(),
    out: OUT,
    shots: all.filter(Boolean).map((p) => path.basename(p)),
  };
  fs.writeFileSync(path.join(OUT, "manifest-ratios.json"), JSON.stringify(manifest, null, 2));
  console.log("\nDONE", all.length, "→", OUT);
  console.log(manifest.shots.join("\n"));
}

main().catch((e) => { console.error(e); process.exit(1); });

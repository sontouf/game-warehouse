/**
 * 여러 모바일 화면비 컨트롤 레이아웃 + 미리보기 에디터 스크린샷
 */
import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "test-results", "control-aspects");
const PORT = 8796;

const ASPECTS = [
  { name: "iphone-se-9x16", w: 375, h: 667 },
  { name: "iphone-14-9x195", w: 390, h: 844 },
  { name: "pixel7-9x20", w: 412, h: 915 },
  { name: "android-9x18", w: 360, h: 800 },
  { name: "fold-narrow", w: 344, h: 882 },
  { name: "iphone-14-land", w: 844, h: 390 },
  { name: "short-land", w: 740, h: 360 },
  { name: "tablet-portrait", w: 768, h: 1024 },
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

function layoutHtml(kind, css) {
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
  const title = kind === "cops"
    ? "AI인척 · 조이스틱 / 찌르기 / 대쉬 / 방어"
    : "아레나 · 조이스틱 / 대쉬 / 발사";
  const controls = kind === "cops"
    ? `<div class="joystick" data-ctl="joy"><div class="joystick-knob"></div></div>
       <button class="cbtn stab" data-ctl="stab"><span class="sk-ico">🗡️</span><span class="sk-lb">찌르기</span></button>
       <button class="cbtn dash" data-ctl="dash"><span class="sk-ico">⚡</span><span class="sk-lb">대쉬</span></button>
       <button class="cbtn defend" data-ctl="defend"><span class="sk-ico">🛡️</span><span class="sk-lb">방어</span></button>
       <button class="cbtn sm sit" data-ctl="sit">🪑</button>
       <button class="cbtn sm wave" data-ctl="wave">👋</button>`
    : `<div class="joystick" data-ctl="joy"><div class="joystick-knob"></div></div>
       <button class="skill dash" data-ctl="dash"><span class="sk-ico">⚡</span><span class="sk-lb">대쉬</span></button>
       <button class="skill shoot" data-ctl="shoot"><span class="sk-ico">🔫</span><span class="sk-lb">발사</span></button>`;

  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}
body{margin:0;background:#070b16;font-family:system-ui,sans-serif;overflow:hidden}
.demo{position:relative;width:100vw;height:100vh;overflow:hidden}
.demo canvas{width:100%;height:100%;display:block;background:#0f172a}
.label{position:absolute;top:10px;left:8px;right:8px;text-align:center;color:#fde047;font-weight:900;z-index:6;text-shadow:0 2px 8px #000;font-size:13px}
.meta{position:absolute;top:34px;left:0;right:0;text-align:center;color:#94a3b8;font-size:11px;z-index:6}
#copsCtl{position:absolute;inset:0;pointer-events:none;z-index:4}
#copsCtl>[data-ctl],.demo>[data-ctl]{pointer-events:auto}
</style></head><body>
<div class="demo arena-stage" id="stage">
<canvas></canvas>
<div class="label">${title}</div>
<div class="meta" id="meta"></div>
${kind === "cops" ? `<div id="copsCtl">${controls}</div>` : controls}
</div>
<script>
const L=${JSON.stringify(L)};
function scale(sw,sh){const short=Math.min(sw,sh);let s=short/520;if(sh<420)s*=0.86;if(sw/sh>1.7)s*=0.92;if(sw/sh<0.6)s*=0.9;return Math.max(0.62,Math.min(1.18,s));}
function apply(){
  const stage=document.getElementById('stage');
  const sw=stage.clientWidth, sh=stage.clientHeight;
  const sc=scale(sw,sh); stage.style.setProperty('--ctl-scale',sc);
  document.getElementById('meta').textContent=sw+'×'+sh+' · scale '+sc.toFixed(2);
  stage.querySelectorAll('[data-ctl]').forEach(el=>{
    const pos=L[el.dataset.ctl]; if(!pos)return;
    const bw=Math.round((pos.w||72)*sc), bh=Math.round((pos.h||72)*sc);
    el.style.position='absolute'; el.style.width=bw+'px'; el.style.height=bh+'px'; el.style.top='auto'; el.style.zIndex='5';
    const pad=Math.max(6,Math.round(sw*0.01));
    if(pos.left!=null){el.style.left=Math.round(pos.left/100*sw)+pad+'px';el.style.right='auto';}
    if(pos.right!=null){el.style.right=Math.round(pos.right/100*sw)+pad+'px';el.style.left='auto';}
    if(pos.bottom!=null)el.style.bottom=Math.round(pos.bottom/100*sh)+pad+'px';
  });
  const cv=stage.querySelector('canvas'); const dpr=Math.min(devicePixelRatio||1,2);
  cv.width=sw*dpr; cv.height=sh*dpr; const ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,sw,sh);
  ctx.strokeStyle='rgba(255,255,255,0.05)';
  for(let x=0;x<sw;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,sh);ctx.stroke();}
  ctx.fillStyle='#ef4444';ctx.beginPath();ctx.arc(sw*0.42,sh*0.4,14,0,6.28);ctx.fill();
  ctx.fillStyle='#3b82f6';ctx.beginPath();ctx.arc(sw*0.58,sh*0.48,14,0,6.28);ctx.fill();
}
apply(); addEventListener('resize',apply);
</script></body></html>`;
}

async function shotAspects(browser, css) {
  const taken = [];
  for (const kind of ["arena", "cops"]) {
    for (const vp of ASPECTS) {
      const page = await browser.newPage({
        viewport: { width: vp.w, height: vp.h },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      });
      await page.setContent(layoutHtml(kind, css), { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(120);
      const file = path.join(OUT, `${kind}-${vp.name}.png`);
      await page.screenshot({ path: file });
      console.log("✓", path.basename(file));
      taken.push(file);
      await page.close();
    }
  }
  return taken;
}

async function shotEditor(browser) {
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
      await page.screenshot({ path: path.join(OUT, "editor-arena-iphone14.png") });
      console.log("✓ editor-arena-iphone14.png");
      taken.push(path.join(OUT, "editor-arena-iphone14.png"));

      /* 가로 미리보기 선택 */
      await page.selectOption("#ctlAspectSel", "844x390");
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, "editor-arena-preview-land.png") });
      console.log("✓ editor-arena-preview-land.png");
      taken.push(path.join(OUT, "editor-arena-preview-land.png"));

      await page.selectOption("#ctlAspectSel", "344x882");
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, "editor-arena-preview-fold.png") });
      console.log("✓ editor-arena-preview-fold.png");
      taken.push(path.join(OUT, "editor-arena-preview-fold.png"));
    } else {
      console.warn("ctl-edit button missing");
    }
  } catch (e) {
    console.warn("editor shot:", e.message);
  }
  await page.close();
  return taken;
}

async function shotKart(browser) {
  const taken = [];
  for (const vp of [
    { name: "iphone-14", w: 390, h: 844 },
    { name: "iphone-14-land", w: 844, h: 390 },
    { name: "iphone-se", w: 375, h: 667 },
    { name: "short-land", w: 740, h: 360 },
  ]) {
    const page = await browser.newPage({
      viewport: { width: vp.w, height: vp.h },
      isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    });
    try {
      await page.goto(`http://127.0.0.1:${PORT}/tools/kart-sim.html`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForFunction(() => window.__SIM_READY__ === true, { timeout: 45000 });
      await page.evaluate(() => {
        document.documentElement.classList.add("force-touch");
        window.__KART_HANDLE__.startEightPlayerSim({
          mapId: "village", mode: "solo", forceLaps: 1, timeScale: 2.2, driveSelf: true, playerName: "YOU",
        });
      });
      await page.waitForTimeout(2800);
      await page.evaluate(() => {
        const t = document.querySelector("#kart-touch");
        if (t) t.style.display = "flex";
        window.dispatchEvent(new Event("resize"));
      });
      await page.waitForTimeout(250);
      const file = path.join(OUT, `kart-${vp.name}.png`);
      await page.screenshot({ path: file });
      console.log("✓", path.basename(file));
      taken.push(file);
    } catch (e) {
      console.warn("kart", vp.name, e.message);
    }
    await page.close();
  }
  return taken;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const css = fs.readFileSync(path.join(ROOT, "css", "minihub.css"), "utf8");
  const server = await startServer();
  const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--ignore-gpu-blocklist"] });
  const all = [];
  all.push(...await shotAspects(browser, css));
  all.push(...await shotEditor(browser));
  all.push(...await shotKart(browser));
  await browser.close();
  server.close();
  const manifest = {
    generatedAt: new Date().toISOString(),
    out: OUT,
    aspects: ASPECTS,
    shots: all.filter(Boolean).map((p) => path.basename(p)),
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("\nDONE", all.length, "→", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });

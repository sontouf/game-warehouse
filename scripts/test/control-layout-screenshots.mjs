/**
 * 인게임 스킬/조작 버튼 레이아웃 스크린샷 — 여러 모바일 화면비
 */
import { chromium, devices } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "test-results", "control-layouts");
const PORT = 8792;

const VIEWPORTS = [
  { name: "iphone-se", width: 375, height: 667, isMobile: true, hasTouch: true },
  { name: "iphone-14", width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: "pixel-7", width: 412, height: 915, isMobile: true, hasTouch: true },
  { name: "iphone-14-land", width: 844, height: 390, isMobile: true, hasTouch: true },
  { name: "galaxy-fold-narrow", width: 344, height: 882, isMobile: true, hasTouch: true },
];

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath === "/") urlPath = "/index.html";
      const file = path.join(ROOT, urlPath.replace(/^\//, ""));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(file) });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log("✓", name);
  return file;
}

async function openLobby(page) {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#game-grid .game-card", { timeout: 20000 });
  await page.fill("#lobby-player-id", "CtlShot");
  await page.waitForTimeout(300);
}

async function createMpRoom(page, game) {
  await openLobby(page);
  await page.click("#btn-room-create");
  await page.waitForSelector("#mg-go", { timeout: 8000 });
  await page.click(`.lobby-modal__game[data-g="${game}"]`);
  await page.fill("#mg-rname", "컨트롤촬영");
  await page.click("#mg-go");
  await page.waitForSelector(".mg-root, #mgGame, .arena-stage", { timeout: 25000 });
  await page.waitForTimeout(900);
}

async function captureKart(browser, vp) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.isMobile,
    hasTouch: !!vp.hasTouch,
    deviceScaleFactor: 2,
  });
  const taken = [];
  try {
    await page.goto(`http://127.0.0.1:${PORT}/tools/kart-sim.html`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction(() => window.__SIM_READY__ === true, { timeout: 45000 });
    await page.evaluate(() => {
      document.documentElement.classList.add("force-touch");
      const race = document.querySelector("#kart-race");
      if (race) race.style.display = "";
    });
    await page.evaluate(() => {
      window.__KART_HANDLE__.startEightPlayerSim({
        mapId: "village",
        mode: "solo",
        forceLaps: 1,
        timeScale: 1.2,
        driveSelf: true,
        playerName: "YOU",
      });
    });
    await page.waitForTimeout(2200);
    await page.evaluate(() => {
      const touch = document.querySelector("#kart-touch");
      if (touch) touch.style.display = "flex";
      const race = document.querySelector("#kart-race");
      if (race && typeof window.__KART_HANDLE__?.root !== "undefined") {
        /* trigger scale */
        window.dispatchEvent(new Event("resize"));
      }
      window.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(400);
    /* 핸들 조향 표시 */
    const wheel = page.locator("#kart-wheel");
    if (await wheel.count()) {
      const box = await wheel.boundingBox();
      if (box) {
        await page.touchscreen.tap(box.x + box.width * 0.82, box.y + box.height * 0.5).catch(async () => {
          await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.5);
          await page.mouse.down();
          await page.waitForTimeout(200);
        });
        await page.waitForTimeout(250);
      }
    }
    taken.push(await shot(page, `kart-controls-${vp.name}.png`));
    await page.mouse.up().catch(() => {});
  } catch (e) {
    console.warn("kart", vp.name, e.message);
  }
  await page.close();
  return taken;
}

async function captureArena(browser, vp) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.isMobile,
    hasTouch: !!vp.hasTouch,
    deviceScaleFactor: 2,
  });
  const page2 = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.isMobile,
    hasTouch: !!vp.hasTouch,
  });
  const taken = [];
  try {
    await createMpRoom(page, "arena");
    const code = await page.locator(".mg-code").innerText().catch(() => "");
    const roomCode = (code.match(/[A-Z0-9]{4,}/) || [])[0];
    if (roomCode) {
      await openLobby(page2);
      await page2.click("#btn-room-join");
      await page2.waitForSelector("#mg-code", { timeout: 8000 });
      await page2.selectOption("#mg-join-game", "arena");
      await page2.fill("#mg-code", roomCode);
      await page2.click("#mg-join-go");
      await page2.waitForTimeout(1500);
    }
    await page.locator('[data-mg="a-team"][data-team="0"]').click().catch(() => {});
    await page2.locator('[data-mg="a-team"][data-team="1"]').click().catch(() => {});
    await page.locator('[data-mg="toggle-ready"]').click().catch(() => {});
    await page2.locator('[data-mg="toggle-ready"]').click().catch(() => {});
    await page.waitForTimeout(250);
    await page.locator('[data-mg="go-start"]').click().catch(() => {});
    await page.waitForTimeout(4800);
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(300);
    /* 버튼 존재 확인 */
    const hasShoot = await page.locator("#shootBtn").count();
    const hasDash = await page.locator("#dashBtn").count();
    const hasJoy = await page.locator("#joyBase").count();
    console.log(`  arena ${vp.name}: shoot=${hasShoot} dash=${hasDash} joy=${hasJoy}`);
    taken.push(await shot(page, `arena-controls-${vp.name}.png`));
  } catch (e) {
    console.warn("arena", vp.name, e.message);
    await shot(page, `arena-controls-${vp.name}-fallback.png`).catch(() => {});
  }
  await page.close();
  await page2.close();
  return taken;
}

async function captureCops(browser, vp) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.isMobile,
    hasTouch: !!vp.hasTouch,
    deviceScaleFactor: 2,
  });
  const taken = [];
  try {
    await createMpRoom(page, "cops");
    const mode = page.locator("#cMode");
    if (await mode.count()) {
      await mode.selectOption("mimic");
      await page.waitForTimeout(200);
      await mode.dispatchEvent("change");
    }
    await page.waitForTimeout(300);
    const startBtn = page.locator('[data-mg="go-start"]').first();
    const ready = page.locator('[data-mg="toggle-ready"]');
    if (await ready.count()) await ready.click().catch(() => {});
    await page.waitForTimeout(200);
    if (await startBtn.count()) await startBtn.click();
    await page.waitForTimeout(4800);
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(300);
    const hasStab = await page.locator("#cStab").count();
    const hasDash = await page.locator("#cDash").count();
    const hasDef = await page.locator("#cDefend").count();
    console.log(`  cops ${vp.name}: stab=${hasStab} dash=${hasDash} defend=${hasDef}`);
    taken.push(await shot(page, `cops-controls-${vp.name}.png`));
  } catch (e) {
    console.warn("cops", vp.name, e.message);
    await shot(page, `cops-controls-${vp.name}-fallback.png`).catch(() => {});
  }
  await page.close();
  return taken;
}

/** Peer 실패 시에도 버튼 배치를 보여 주는 CSS 픽스처 */
async function captureFixture(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const css = fs.readFileSync(path.join(ROOT, "css", "minihub.css"), "utf8");
  await page.setContent(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}
body{margin:0;background:#070b16;font-family:system-ui,sans-serif}
.demo{position:relative;width:100vw;height:100vh;overflow:hidden}
.demo canvas{width:100%;height:100%;display:block;background:#0f172a}
.label{position:absolute;top:12px;left:0;right:0;text-align:center;color:#fde047;font-weight:900;z-index:6;text-shadow:0 2px 8px #000}
</style></head><body>
<div class="demo arena-stage" id="stage" style="--ctl-scale:1">
<canvas width="780" height="1688"></canvas>
<div class="label">아레나 · 조이스틱 / 대쉬 / 발사</div>
<div class="joystick" id="joyBase" data-ctl="joy"><div class="joystick-knob"></div></div>
<button class="skill dash" id="dashBtn" data-ctl="dash"><span class="sk-ico">⚡</span><span class="sk-lb">대쉬</span></button>
<button class="skill shoot" id="shootBtn" data-ctl="shoot"><span class="sk-ico">🔫</span><span class="sk-lb">발사</span></button>
</div>
<script>
const L={joy:{left:3,bottom:3,w:104,h:104},dash:{right:28,bottom:6,w:68,h:68},shoot:{right:3,bottom:3,w:92,h:92}};
function scale(sw,sh){const short=Math.min(sw,sh);let s=short/520;if(sh<420)s*=0.86;if(sw/sh>1.7)s*=0.92;return Math.max(0.62,Math.min(1.18,s));}
function apply(){
  const stage=document.getElementById('stage');
  const sw=stage.clientWidth, sh=stage.clientHeight;
  const sc=scale(sw,sh); stage.style.setProperty('--ctl-scale',sc);
  stage.querySelectorAll('[data-ctl]').forEach(el=>{
    const pos=L[el.dataset.ctl]; if(!pos)return;
    const bw=Math.round((pos.w||72)*sc), bh=Math.round((pos.h||72)*sc);
    el.style.position='absolute'; el.style.width=bw+'px'; el.style.height=bh+'px'; el.style.top='auto';
    if(pos.left!=null){el.style.left=Math.round(pos.left/100*sw)+8+'px';el.style.right='auto';}
    if(pos.right!=null){el.style.right=Math.round(pos.right/100*sw)+8+'px';el.style.left='auto';}
    if(pos.bottom!=null)el.style.bottom=Math.round(pos.bottom/100*sh)+10+'px';
  });
  const ctx=stage.querySelector('canvas').getContext('2d');
  const c=stage.querySelector('canvas'); c.width=sw*2; c.height=sh*2; ctx.scale(2,2);
  ctx.fillStyle='#0f172a';ctx.fillRect(0,0,sw,sh);
  ctx.strokeStyle='rgba(255,255,255,0.06)';
  for(let x=0;x<sw;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,sh);ctx.stroke();}
  ctx.fillStyle='#ef4444';ctx.beginPath();ctx.arc(sw*0.45,sh*0.42,16,0,6.28);ctx.fill();
  ctx.fillStyle='#3b82f6';ctx.beginPath();ctx.arc(sw*0.62,sh*0.48,16,0,6.28);ctx.fill();
}
apply(); addEventListener('resize',apply);
</script></body></html>`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  const taken = [await shot(page, "fixture-arena-iphone14.png")];

  /* cops mimic fixture */
  await page.setContent(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}
body{margin:0;background:#070b16;font-family:system-ui,sans-serif}
.demo{position:relative;width:100vw;height:100vh;overflow:hidden}
.demo canvas{width:100%;height:100%;display:block;background:#0b1220}
.label{position:absolute;top:12px;left:0;right:0;text-align:center;color:#fde047;font-weight:900;z-index:6;text-shadow:0 2px 8px #000}
#copsCtl{position:absolute;inset:0;pointer-events:none;z-index:4}
#copsCtl>[data-ctl]{pointer-events:auto}
</style></head><body>
<div class="demo arena-stage" id="stage" style="--ctl-scale:1">
<canvas></canvas>
<div class="label">AI인척 · 찌르기/대쉬/방어/이모트</div>
<div id="copsCtl">
  <div class="joystick" id="cjoyBase" data-ctl="joy"><div class="joystick-knob"></div></div>
  <button class="cbtn stab" data-ctl="stab"><span class="sk-ico">🗡️</span><span class="sk-lb">찌르기</span></button>
  <button class="cbtn dash" data-ctl="dash"><span class="sk-ico">⚡</span><span class="sk-lb">대쉬</span></button>
  <button class="cbtn defend" data-ctl="defend"><span class="sk-ico">🛡️</span><span class="sk-lb">방어</span></button>
  <button class="cbtn sm sit" data-ctl="sit">🪑</button>
  <button class="cbtn sm wave" data-ctl="wave">👋</button>
</div>
</div>
<script>
const L={joy:{left:3,bottom:3,w:100,h:100},stab:{right:3,bottom:3,w:86,h:86},dash:{right:26,bottom:4,w:64,h:64},defend:{right:3,bottom:22,w:64,h:64},sit:{right:26,bottom:22,w:48,h:48},wave:{right:40,bottom:22,w:48,h:48}};
function scale(sw,sh){const short=Math.min(sw,sh);let s=short/520;if(sh<420)s*=0.86;return Math.max(0.62,Math.min(1.18,s));}
function apply(){
  const stage=document.getElementById('stage');
  const sw=stage.clientWidth, sh=stage.clientHeight;
  const sc=scale(sw,sh); stage.style.setProperty('--ctl-scale',sc);
  stage.querySelectorAll('[data-ctl]').forEach(el=>{
    const pos=L[el.dataset.ctl]; if(!pos)return;
    const bw=Math.round((pos.w||72)*sc), bh=Math.round((pos.h||72)*sc);
    el.style.position='absolute'; el.style.width=bw+'px'; el.style.height=bh+'px'; el.style.top='auto';
    if(pos.left!=null){el.style.left=Math.round(pos.left/100*sw)+8+'px';el.style.right='auto';}
    if(pos.right!=null){el.style.right=Math.round(pos.right/100*sw)+8+'px';el.style.left='auto';}
    if(pos.bottom!=null)el.style.bottom=Math.round(pos.bottom/100*sh)+10+'px';
  });
}
apply();
</script></body></html>`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  taken.push(await shot(page, "fixture-cops-iphone14.png"));

  /* landscape fixture */
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const L={joy:{left:3,bottom:3,w:100,h:100},stab:{right:3,bottom:3,w:86,h:86},dash:{right:26,bottom:4,w:64,h:64},defend:{right:3,bottom:22,w:64,h:64},sit:{right:26,bottom:22,w:48,h:48},wave:{right:40,bottom:22,w:48,h:48}};
    const stage=document.getElementById('stage');
    const sw=stage.clientWidth, sh=stage.clientHeight;
    let sc=Math.min(sw,sh)/520; if(sh<420)sc*=0.86; sc=Math.max(0.62,Math.min(1.18,sc));
    stage.style.setProperty('--ctl-scale',sc);
    stage.querySelectorAll('[data-ctl]').forEach(el=>{
      const pos=L[el.dataset.ctl]; if(!pos)return;
      const bw=Math.round((pos.w||72)*sc), bh=Math.round((pos.h||72)*sc);
      el.style.position='absolute'; el.style.width=bw+'px'; el.style.height=bh+'px';
      if(pos.left!=null){el.style.left=Math.round(pos.left/100*sw)+8+'px';el.style.right='auto';}
      if(pos.right!=null){el.style.right=Math.round(pos.right/100*sw)+8+'px';el.style.left='auto';}
      if(pos.bottom!=null)el.style.bottom=Math.round(pos.bottom/100*sh)+8+'px';
    });
  });
  taken.push(await shot(page, "fixture-cops-landscape.png"));
  await page.close();
  return taken;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist"],
  });
  const all = [];
  try {
    all.push(...await captureFixture(browser));
  } catch (e) {
    console.warn("fixture failed", e);
  }

  /* 대표 2개 뷰포트로 실게임 캡처 (시간/Peer 비용) */
  const keyVps = [VIEWPORTS[1], VIEWPORTS[3]]; /* iphone-14, landscape */
  for (const vp of keyVps) {
    try { all.push(...await captureKart(browser, vp)); } catch (e) { console.warn(e); }
  }
  for (const vp of keyVps) {
    try { all.push(...await captureArena(browser, vp)); } catch (e) { console.warn(e); }
  }
  for (const vp of keyVps) {
    try { all.push(...await captureCops(browser, vp)); } catch (e) { console.warn(e); }
  }

  await browser.close();
  server.close();
  const manifest = {
    generatedAt: new Date().toISOString(),
    out: OUT,
    shots: all.filter(Boolean).map((p) => path.basename(p)),
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("\nDONE", all.length, "→", OUT);
  console.log(manifest.shots.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

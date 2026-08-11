/**
 * 광고/홍보용 인게임 스크린샷 — 각 모드의 핵심·재밌는 타이밍을 시뮬레이션해 캡처
 */
import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "test-results", "ad-screenshots");
const PORT = 8791;

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

async function shot(page, name, clipSel) {
  const file = path.join(OUT, name);
  if (clipSel) {
    const loc = page.locator(clipSel).first();
    if (await loc.count()) {
      await loc.screenshot({ path: file });
      console.log("✓", name, "(clip)");
      return file;
    }
  }
  await page.screenshot({ path: file, fullPage: false });
  console.log("✓", name);
  return file;
}

async function openLobby(page) {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#game-grid .game-card", { timeout: 20000 });
  await page.fill("#lobby-player-id", "AdShot");
  await page.waitForTimeout(400);
}

async function launchSolo(page, id) {
  await page.evaluate((gid) => {
    const cards = [...document.querySelectorAll(".game-card")];
    const hit = cards.find((c) => (c.textContent || "").includes(
      ({ tetris: "테트리스", snake: "스네이크", breakout: "벽돌", puzzle2048: "2048", farm: "팜" }[gid] || gid)
    ));
    if (hit) hit.click();
    else if (window.GWGames && GWGames[gid]) {
      /* fallback: hash launch */
      location.hash = "game-" + gid;
      location.reload();
    }
  }, id);
  await page.waitForTimeout(900);
  await page.waitForSelector("#view-game:not([hidden])", { timeout: 15000 }).catch(() => {});
}

async function captureSolo(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const taken = [];

  await openLobby(page);
  taken.push(await shot(page, "00-lobby-hero.png"));

  /* 테트리스 — 보드가 쌓인 긴장감 */
  await launchSolo(page, "tetris");
  await page.waitForSelector("#game-stage canvas", { timeout: 10000 });
  for (let i = 0; i < 28; i++) {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"];
    await page.keyboard.press(keys[i % keys.length]);
    if (i % 3 === 0) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(400);
  taken.push(await shot(page, "01-tetris-stack-tension.png", "#view-game"));

  /* 스네이크 — 길어져서 사냥하는 순간 */
  await page.click("#btn-back");
  await page.waitForTimeout(300);
  await launchSolo(page, "snake");
  await page.waitForSelector("#game-stage canvas", { timeout: 10000 });
  for (let i = 0; i < 40; i++) {
    if (i === 10) await page.keyboard.press("ArrowUp");
    if (i === 20) await page.keyboard.press("ArrowLeft");
    if (i === 30) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(90);
  }
  taken.push(await shot(page, "02-snake-hunt.png", "#view-game"));

  /* 벽돌깨기 — 공이 벽돌을 부수는 액션 */
  await page.click("#btn-back");
  await page.waitForTimeout(300);
  await launchSolo(page, "breakout");
  await page.waitForSelector("#game-stage canvas", { timeout: 10000 });
  for (let i = 0; i < 50; i++) {
    await page.keyboard.press(i % 2 ? "ArrowLeft" : "ArrowRight");
    await page.waitForTimeout(60);
  }
  taken.push(await shot(page, "03-breakout-rally.png", "#view-game"));

  /* 2048 — 큰 타일 합성 보드 */
  await page.click("#btn-back");
  await page.waitForTimeout(300);
  await launchSolo(page, "puzzle2048");
  await page.waitForSelector("#game-stage .puzzle-board, #game-stage .puzzle-cell", { timeout: 10000 });
  for (let i = 0; i < 36; i++) {
    const seq = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    await page.keyboard.press(seq[i % 4]);
    await page.waitForTimeout(80);
  }
  taken.push(await shot(page, "04-2048-merge-board.png", "#view-game"));

  /* 팜 — 농장 한창 운영 */
  await page.click("#btn-back");
  await page.waitForTimeout(300);
  await launchSolo(page, "farm");
  await page.waitForTimeout(1800);
  /* 클릭으로 상호작용 시도 */
  const stage = page.locator("#game-stage");
  const box = await stage.boundingBox();
  if (box) {
    for (const [dx, dy] of [[0.35, 0.45], [0.55, 0.5], [0.4, 0.6], [0.6, 0.4]]) {
      await page.mouse.click(box.x + box.width * dx, box.y + box.height * dy);
      await page.waitForTimeout(200);
    }
  }
  await page.waitForTimeout(600);
  taken.push(await shot(page, "05-farm-busy.png", "#view-game"));

  await page.close();
  return taken;
}

async function captureKart(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const taken = [];
  await page.goto(`http://127.0.0.1:${PORT}/tools/kart-sim.html`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForFunction(() => window.__SIM_READY__ === true, { timeout: 45000 });

  await page.evaluate(() => {
    window.__KART_HANDLE__.startEightPlayerSim({
      mapId: "village",
      mode: "solo",
      forceLaps: 1,
      timeScale: 1.6,
      driveSelf: true,
      playerName: "STAR",
    });
  });
  await page.waitForTimeout(2800);
  taken.push(await shot(page, "06-kart-pack-racing.png"));

  /* 1인칭 전환 */
  await page.keyboard.press("KeyV");
  await page.waitForTimeout(900);
  taken.push(await shot(page, "07-kart-cockpit-fp.png"));

  await page.evaluate(() => {
    window.__KART_HANDLE__.startEightPlayerSim({
      mapId: "mine",
      mode: "solo",
      forceLaps: 1,
      timeScale: 1.8,
      driveSelf: true,
      playerName: "STAR",
    });
  });
  await page.waitForTimeout(2600);
  taken.push(await shot(page, "08-kart-mine-tunnel.png"));

  await page.close();
  return taken;
}

async function createMpRoom(page, game) {
  await openLobby(page);
  await page.click("#btn-room-create");
  await page.waitForSelector("#mg-go", { timeout: 8000 });
  await page.click(`.lobby-modal__game[data-g="${game}"]`);
  await page.fill("#mg-rname", "광고촬영방");
  await page.click("#mg-go");
  await page.waitForSelector(".mg-root, #mgGame, .arena-stage, #copsCtl", { timeout: 25000 });
  await page.waitForTimeout(1200);
}

async function captureCops(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const taken = [];
  try {
    await createMpRoom(page, "cops");
    /* AI인척 모드 + 봇 다수 */
    const mode = page.locator("#cMode");
    if (await mode.count()) {
      await mode.selectOption("mimic");
      await page.waitForTimeout(200);
    }
    const bots = page.locator("#cBots");
    if (await bots.count()) {
      await bots.evaluate((el) => { el.value = "10"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
    }
    /* 설정 전송 버튼/자동 change 트리거 */
    await page.evaluate(() => {
      if (typeof window.sendCopsSettings === "function") window.sendCopsSettings();
      const m = document.querySelector("#cMode");
      if (m) m.dispatchEvent(new Event("change", { bubbles: true }));
    }).catch(() => {});
    await page.waitForTimeout(400);

    const startBtn = page.locator('[data-mg="go-start"], button.go, button:has-text("Go")').first();
    if (await startBtn.count()) {
      await startBtn.click();
      await page.waitForTimeout(4500);
    } else {
      /* 대기실 준비 후 시작 */
      const ready = page.locator('[data-mg="toggle-ready"]');
      if (await ready.count()) await ready.click();
      await page.waitForTimeout(300);
      const go = page.locator('[data-mg="go-start"]');
      if (await go.count()) await go.click();
      await page.waitForTimeout(4500);
    }

    /* 찌르기·이동으로 액션 유발 */
    for (let i = 0; i < 12; i++) {
      await page.keyboard.down("KeyD");
      await page.waitForTimeout(80);
      await page.keyboard.up("KeyD");
      const stab = page.locator("#cStab");
      if (await stab.count()) await stab.click({ force: true }).catch(() => {});
      await page.waitForTimeout(180);
    }
    await page.waitForTimeout(800);
    taken.push(await shot(page, "09-cops-mimic-among-ai.png", ".arena-stage"));

    /* 전체 UI 포함 */
    taken.push(await shot(page, "10-cops-mimic-hud.png"));
  } catch (e) {
    console.warn("cops capture fallback:", e.message);
    await shot(page, "09-cops-fallback.png").catch(() => {});
  }
  await page.close();
  return taken;
}

async function captureArena(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 860 } });
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
      await page2.waitForTimeout(2000);
    }

    /* 팀 선택 + 자기장 짧게 */
    const zone = page.locator("#azone");
    if (await zone.count()) await zone.selectOption("60");
    await page.locator('[data-mg="a-team"][data-team="0"]').click().catch(() => {});
    await page2.locator('[data-mg="a-team"][data-team="1"]').click().catch(() => {});
    await page.locator('[data-mg="toggle-ready"]').click().catch(() => {});
    await page2.locator('[data-mg="toggle-ready"]').click().catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('[data-mg="go-start"]').click().catch(() => {});
    await page.waitForTimeout(4500);

    /* 조준·사격 액션 */
    for (let i = 0; i < 16; i++) {
      const shoot = page.locator("#shootBtn");
      if (await shoot.count()) {
        await shoot.dispatchEvent("mousedown").catch(() => {});
        await page.waitForTimeout(120);
        await shoot.dispatchEvent("mouseup").catch(() => {});
      }
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(600);
    taken.push(await shot(page, "11-arena-teamfight.png", ".arena-stage"));
    taken.push(await shot(page, "12-arena-hud-nexus.png"));
  } catch (e) {
    console.warn("arena capture fallback:", e.message);
    await shot(page, "11-arena-fallback.png").catch(() => {});
  }
  await page.close();
  await page2.close();
  return taken;
}

async function captureShowcaseFallback(browser) {
  /* Peer 실패 시에도 광고 컷을 남기기 위한 캔버스 쇼케이스 */
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;background:#070b16">
<canvas id="c" width="1280" height="720"></canvas>
<script>
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const TCOL=['#ef4444','#3b82f6','#22c55e'];
function sceneArena(){
  ctx.fillStyle='#0f172a';ctx.fillRect(0,0,1280,720);
  ctx.strokeStyle='rgba(255,255,255,0.05)';
  for(let x=0;x<1280;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,720);ctx.stroke();}
  // zone
  ctx.save();ctx.beginPath();ctx.rect(0,0,1280,720);ctx.arc(640,360,260,0,Math.PI*2,true);
  ctx.fillStyle='rgba(56,189,248,0.22)';ctx.fill('evenodd');
  ctx.beginPath();ctx.arc(640,360,260,0,Math.PI*2);ctx.strokeStyle='#7dd3fc';ctx.lineWidth=5;ctx.stroke();ctx.restore();
  // nexuses
  [[320,360,0],[960,360,1]].forEach(([x,y,t])=>{
    ctx.beginPath();ctx.arc(x,y,32,0,6.28);ctx.strokeStyle=TCOL[t];ctx.lineWidth=4;ctx.stroke();
    ctx.fillStyle=TCOL[t];ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.fillText('◆',x,y+8);
    ctx.fillStyle='#1e293b';ctx.fillRect(x-28,y-48,56,6);ctx.fillStyle=TCOL[t];ctx.fillRect(x-28,y-48,56*0.62,6);
  });
  // players shooting
  [[480,300,0,0.4],[520,410,0,-0.2],[760,320,1,3.4],[800,400,1,2.8]].forEach(([x,y,t,a])=>{
    ctx.save();ctx.translate(x,y);ctx.rotate(a);
    ctx.fillStyle=TCOL[t];ctx.beginPath();ctx.arc(0,0,15,0,6.28);ctx.fill();
    ctx.strokeStyle='rgba(253,224,71,0.9)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(16,0);ctx.lineTo(78,0);ctx.stroke();
    ctx.beginPath();ctx.arc(90,0,7,0,6.28);ctx.stroke();ctx.restore();
  });
  // bullets + fx
  [[600,340],[640,360],[680,350]].forEach(([x,y],i)=>{ctx.fillStyle=TCOL[i%2];ctx.beginPath();ctx.arc(x,y,4,0,6.28);ctx.fill();});
  ctx.strokeStyle='#f97316';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(700,380);ctx.lineTo(740,420);ctx.moveTo(740,380);ctx.lineTo(700,420);ctx.stroke();
  ctx.fillStyle='#fde047';ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.fillText('ARENA · 넥서스 파괴전',640,56);
  ctx.font='16px sans-serif';ctx.fillStyle='#94a3b8';ctx.fillText('팀파전 · 자기장 · 연속킬 버프',640,86);
}
function sceneCops(){
  ctx.fillStyle='#0b1220';ctx.fillRect(0,0,1280,720);
  for(let i=0;i<18;i++){
    const x=80+Math.random()*1120,y=80+Math.random()*560;
    ctx.fillStyle='#94a3b8';ctx.beginPath();ctx.arc(x,y,14,0,6.28);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+12,y+4);ctx.stroke();
  }
  // player stab cone
  const px=640,py=400;
  ctx.fillStyle='rgba(250,204,21,0.18)';ctx.beginPath();ctx.moveTo(px,py);ctx.arc(px,py,70,-0.9,0.9);ctx.closePath();ctx.fill();
  ctx.fillStyle='#64748b';ctx.beginPath();ctx.arc(px,py,14,0,6.28);ctx.fill();
  ctx.strokeStyle='#f43f5e';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(px-18,py-18);ctx.lineTo(px+18,py+18);ctx.moveTo(px+18,py-18);ctx.lineTo(px-18,py+18);ctx.stroke();
  ctx.fillStyle='#fde047';ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.fillText('경찰과 도둑 · AI인척 모드',640,56);
  ctx.fillStyle='#94a3b8';ctx.font='16px sans-serif';ctx.fillText('AI 사이에 숨고 · 찌르고 · 살아남아라',640,86);
}
window.__draw=function(which){ which==='cops'?sceneCops():sceneArena(); };
__draw('arena');
</script></body></html>`, { waitUntil: "domcontentloaded" });

  await page.evaluate(() => window.__draw("arena"));
  await page.waitForTimeout(100);
  const taken = [];
  taken.push(await shot(page, "11b-arena-promo-keyart.png"));
  await page.evaluate(() => window.__draw("cops"));
  await page.waitForTimeout(100);
  taken.push(await shot(page, "09b-cops-promo-keyart.png"));
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
    all.push(...await captureSolo(browser));
  } catch (e) {
    console.warn("solo failed", e);
  }
  try {
    all.push(...await captureKart(browser));
  } catch (e) {
    console.warn("kart failed", e);
  }
  try {
    all.push(...await captureCops(browser));
  } catch (e) {
    console.warn("cops failed", e);
  }
  try {
    all.push(...await captureArena(browser));
  } catch (e) {
    console.warn("arena failed", e);
  }
  try {
    all.push(...await captureShowcaseFallback(browser));
  } catch (e) {
    console.warn("showcase failed", e);
  }

  await browser.close();
  server.close();

  const manifest = {
    generatedAt: new Date().toISOString(),
    out: OUT,
    shots: all.filter(Boolean).map((p) => path.basename(p)),
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("\nDONE", all.length, "screenshots →", OUT);
  console.log(manifest.shots.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

const https = require("https");
const url = "https://sontouf.github.io/game-warehouse/js/games/farm.js?t=" + Date.now();

https.get(url, (res) => {
  let data = "";
  res.on("data", (c) => (data += c));
  res.on("end", () => {
    const checks = {
      status: res.statusCode,
      len: data.length,
      hasMenu: data.includes("ff-menu-card"),
      hasBrokenNote: data.includes('"\<p class="ff-note"'),
      hasFixedNote: data.includes("'<p class=\"ff-note\">"),
      hasBrokenCar: /원<\/b><\/p><div class="ff-car-grid"/.test(data),
      hasFixedCar: data.includes("revenue.toLocaleString('ko-KR')")
    };
    console.log(JSON.stringify(checks, null, 2));
    const ok = checks.status === 200 && checks.hasMenu && checks.hasFixedNote && checks.hasFixedCar && !checks.hasBrokenCar;
    process.exit(ok ? 0 : 1);
  });
}).on("error", (e) => {
  console.error(e);
  process.exit(1);
});

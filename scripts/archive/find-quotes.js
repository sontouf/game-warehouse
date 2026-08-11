const fs = require("fs");
const path = "c:/Ref/DSLAB/test/money/js/games/farm.js";
const lines = fs.readFileSync(path, "utf8").split(/\n/);
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (/\"[^\"]*class=\"/.test(L) || /\"[^\"]*<div class=\"/.test(L) || /\"[^\"]*<p class=\"/.test(L) || /\"[^\"]*<button[^>]*class=\"/.test(L)) {
    console.log((i + 1) + ":" + L.trim().slice(0, 200));
  }
}

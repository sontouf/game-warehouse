const fs = require("fs");
const p = "c:/Ref/DSLAB/test/money/js/games/farm.js";
const s = fs.readFileSync(p, "utf8");
const start = s.indexOf("var GOODS");
const end = s.indexOf("var ANIMALS");
console.log(JSON.stringify(s.slice(start, end)));

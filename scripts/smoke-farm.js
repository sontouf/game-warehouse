/**
 * Smoke test: load farm.js in a minimal DOM mock and verify stage menu renders.
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

function createEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    className: "",
    id: "",
    hidden: false,
    style: {},
    children: [],
    listeners: {},
    textContent: "",
    innerHTML: "",
    width: 0,
    height: 0,
    setAttribute(k, v) {
      if (k === "id") this.id = v;
      if (k === "class" || k === "className") this.className = v;
      if (k === "width") this.width = Number(v);
      if (k === "height") this.height = Number(v);
      if (k === "hidden") this.hidden = true;
    },
    getAttribute(k) {
      if (k === "data-stage") return this._dataStage;
      return null;
    },
    appendChild(c) {
      this.children.push(c);
      c.parent = this;
      return c;
    },
    querySelector(sel) {
      return find(this, sel);
    },
    querySelectorAll(sel) {
      const out = [];
      walk(this, (n) => {
        if (match(n, sel)) out.push(n);
      });
      return out;
    },
    addEventListener(type, fn) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(fn);
    },
    removeEventListener() {},
    getContext() {
      return {
        fillRect() {},
        strokeRect() {},
        fillText() {},
        beginPath() {},
        arc() {},
        fill() {},
        createLinearGradient() {
          return { addColorStop() {} };
        },
        font: "",
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        globalAlpha: 1
      };
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 640, height: 420 };
    }
  };

  Object.defineProperty(el, "innerHTML", {
    get() {
      return this._html || "";
    },
    set(v) {
      this._html = String(v);
      // crude parse for ids/classes used by farm
      this.children = [];
      const re = /id="([^"]+)"/g;
      let m;
      while ((m = re.exec(v))) {
        const child = createEl("div");
        child.id = m[1];
        this.children.push(child);
      }
      const reBtn = /data-stage="(\d+)"/g;
      while ((m = reBtn.exec(v))) {
        const child = createEl("button");
        child._dataStage = m[1];
        child.addEventListener = el.addEventListener.bind(child);
        this.children.push(child);
      }
    }
  });

  return el;
}

function walk(node, fn) {
  fn(node);
  (node.children || []).forEach((c) => walk(c, fn));
}

function match(n, sel) {
  if (sel.startsWith("#")) return n.id === sel.slice(1);
  if (sel.startsWith(".")) return (n.className || "").split(/\s+/).includes(sel.slice(1));
  if (sel.startsWith("[") && sel.includes("data-stage")) return n._dataStage != null;
  return false;
}

function find(root, sel) {
  let found = null;
  walk(root, (n) => {
    if (!found && match(n, sel)) found = n;
  });
  return found;
}

const stage = createEl("div");
const document = {
  createElement: createEl,
  body: createEl("body")
};
const windowObj = {
  GWGames: {},
  localStorage: {
    _d: {},
    getItem(k) {
      return this._d[k] || null;
    },
    setItem(k, v) {
      this._d[k] = String(v);
    },
    removeItem(k) {
      delete this._d[k];
    }
  },
  requestAnimationFrame(fn) {
    return setTimeout(() => fn(Date.now()), 16);
  },
  cancelAnimationFrame(id) {
    clearTimeout(id);
  }
};

const code =
  fs.readFileSync(path.join(__dirname, "../js/games/ff1-stages.js"), "utf8") +
  "\n" +
  fs.readFileSync(path.join(__dirname, "../js/games/farm.js"), "utf8");
vm.runInNewContext(code, {
  window: windowObj,
  document,
  localStorage: windowObj.localStorage,
  console,
  Math,
  Number,
  String,
  Object,
  Array,
  Date,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: windowObj.requestAnimationFrame,
  cancelAnimationFrame: windowObj.cancelAnimationFrame
});

if (!windowObj.GWGames.farm) {
  console.error("FAIL: GWGames.farm missing");
  process.exit(1);
}

const api = { setScore() {} };
const handle = windowObj.GWGames.farm.create(stage, api);

if (!stage.children.length) {
  console.error("FAIL: no root appended");
  process.exit(1);
}

const root = stage.children[0];
const menu = find(root, "#ff-menu");
if (!menu) {
  console.error("FAIL: #ff-menu missing");
  process.exit(1);
}

if (!windowObj.FF1_STAGES || windowObj.FF1_STAGES.length !== 48) {
  console.error("FAIL: FF1_STAGES not loaded", windowObj.FF1_STAGES && windowObj.FF1_STAGES.length);
  process.exit(1);
}

const buttons = menu.querySelectorAll("[data-stage]");
if (!buttons.length) {
  console.error("FAIL: no stage buttons", menu.innerHTML.slice(0, 200));
  process.exit(1);
}

if (buttons.length !== 48) {
  console.error("FAIL: expected 48 stage buttons, got", buttons.length);
  process.exit(1);
}

// start stage 0
buttons[0].listeners.click[0]({ preventDefault() {} });

const play = find(root, "#ff-play");
const canvas = find(root, "#ff-canvas");
if (!play || play.hidden) {
  console.error("FAIL: play view not shown");
  process.exit(1);
}
if (!canvas) {
  console.error("FAIL: canvas missing");
  process.exit(1);
}

handle.destroy();
console.log("PASS farm smoke: menu + stage1 + canvas OK");

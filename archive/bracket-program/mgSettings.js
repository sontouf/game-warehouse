import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "mg-settings.json");

export const DEFAULT_CONTROL_LAYOUTS = {
  arena: {
    joy: { right: null, left: 4.4, bottom: 2.2, w: 120, h: 120 },
    dash: { right: 28, left: null, bottom: 4.5, w: 64, h: 64 },
    shoot: { right: 4.4, left: null, bottom: 3.5, w: 86, h: 86 },
  },
  cops_relic_thief: {
    joy: { right: null, left: 4.4, bottom: 2.2, w: 120, h: 120 },
    interact: { right: 4.4, left: null, bottom: 18, w: 78, h: 78 },
    dash: { right: 4.4, left: null, bottom: 3, w: 78, h: 78 },
  },
  cops_relic_police: {
    joy: { right: null, left: 4.4, bottom: 2.2, w: 120, h: 120 },
    phase: { right: 4.4, left: null, bottom: 3.5, w: 78, h: 78 },
  },
  cops_mimic_player: {
    joy: { right: null, left: 4.4, bottom: 2.2, w: 120, h: 120 },
    stab: { right: 4.4, left: null, bottom: 18, w: 78, h: 78 },
    defend: { right: 4.4, left: null, bottom: 3, w: 78, h: 78 },
    sit: { right: 22, left: null, bottom: 3, w: 52, h: 52 },
    wave: { right: 38, left: null, bottom: 3, w: 52, h: 52 },
  },
  cops_mimic_spec: {
    joy: { right: null, left: 4.4, bottom: 2.2, w: 120, h: 120 },
  },
  kitchen: {
    joy: { right: null, left: 4.4, bottom: 2.2, w: 120, h: 120 },
    interact: { right: 4.4, left: null, bottom: 3.5, w: 86, h: 86 },
    dash: { right: 22, left: null, bottom: 3, w: 64, h: 64 },
  },
  "kitchen-tut": {
    joy: { right: null, left: 4.4, bottom: 2.2, w: 120, h: 120 },
    interact: { right: 4.4, left: null, bottom: 3.5, w: 86, h: 86 },
    dash: { right: 22, left: null, bottom: 3, w: 64, h: 64 },
  },
};

function hashPw(p) {
  return crypto.createHash("sha256").update(String(p)).digest("hex");
}

function defaultSettings() {
  return {
    settingsPasswordHash: hashPw("yesohyes33"),
    controlLayouts: JSON.parse(JSON.stringify(DEFAULT_CONTROL_LAYOUTS)),
  };
}

function loadRaw() {
  try {
    if (fs.existsSync(FILE)) {
      const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
      return {
        ...defaultSettings(),
        settingsPasswordHash: d.settingsPasswordHash || defaultSettings().settingsPasswordHash,
        controlLayouts: { ...DEFAULT_CONTROL_LAYOUTS, ...(d.controlLayouts || {}) },
      };
    }
  } catch (e) { /* ignore */ }
  return defaultSettings();
}

let cache = loadRaw();

function persist() {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch (e) {
    console.error("mg-settings 저장 실패:", e.message);
  }
}

export function verifySettingsPassword(pw) {
  return cache.settingsPasswordHash === hashPw(pw);
}

export function getControlLayouts() {
  return JSON.parse(JSON.stringify(cache.controlLayouts));
}

export function saveControlLayout(profile, layout) {
  const key = String(profile || "").slice(0, 40);
  if (!key || !DEFAULT_CONTROL_LAYOUTS[key]) return false;
  cache.controlLayouts[key] = { ...DEFAULT_CONTROL_LAYOUTS[key], ...layout };
  persist();
  return true;
}

export function resetControlLayout(profile) {
  const key = String(profile || "").slice(0, 40);
  if (!key || !DEFAULT_CONTROL_LAYOUTS[key]) return false;
  cache.controlLayouts[key] = JSON.parse(JSON.stringify(DEFAULT_CONTROL_LAYOUTS[key]));
  persist();
  return true;
}

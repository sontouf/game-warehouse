import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "relic-maps");

import { normalizeGridMap } from "./relicGrid.js";

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function safeId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
}

export function listRelicMaps() {
  ensureDir();
  const out = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      out.push({ id: d.id || f.replace(/\.json$/, ""), name: d.name || f, updated: d.updated || 0 });
    } catch (e) { /* skip */ }
  }
  return out.sort((a, b) => b.updated - a.updated);
}

export function loadRelicMap(id) {
  const sid = safeId(id);
  if (!sid) return null;
  ensureDir();
  const p = path.join(DIR, sid + ".json");
  if (!fs.existsSync(p)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    return {
      id: d.id || sid,
      name: d.name || sid,
      ...normalizeGridMap(d),
      updated: d.updated || 0,
    };
  } catch (e) {
    return null;
  }
}

function normalizeMap(id, name, data) {
  const g = normalizeGridMap(data);
  return {
    id,
    name: String(name || "맵").trim().slice(0, 32) || "맵",
    gridN: g.gridN,
    cellSize: g.cellSize,
    world: g.world,
    pieces: g.pieces,
    walls: g.walls,
    jail: g.jail,
    updated: Date.now(),
  };
}

export function saveRelicMap(name, data) {
  ensureDir();
  const id = crypto.randomBytes(6).toString("hex");
  const map = normalizeMap(id, name, data);
  fs.writeFileSync(path.join(DIR, id + ".json"), JSON.stringify(map, null, 2), "utf8");
  return map;
}

export function updateRelicMap(id, name, data) {
  const sid = safeId(id);
  if (!sid) return null;
  ensureDir();
  const p = path.join(DIR, sid + ".json");
  if (!fs.existsSync(p)) return null;
  const map = normalizeMap(sid, name, data);
  fs.writeFileSync(p, JSON.stringify(map, null, 2), "utf8");
  return map;
}

export function deleteRelicMap(id) {
  const sid = safeId(id);
  if (!sid) return false;
  ensureDir();
  const p = path.join(DIR, sid + ".json");
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

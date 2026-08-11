export const DEFAULT_GRID_N = 40;
export const DEFAULT_CELL = 30;

export const PIECE_SIZE = {
  "1x1": [1, 1],
  "1x3": [3, 1],
  "3x1": [1, 3],
};

export function gridWorld(gridN, cellSize = DEFAULT_CELL) {
  const n = clampGridN(gridN);
  const c = clampCell(cellSize);
  const w = n * c;
  return { gridN: n, cellSize: c, world: { w, h: w } };
}

export function clampGridN(n) {
  return Math.max(16, Math.min(64, Math.round(Number(n) || DEFAULT_GRID_N)));
}

export function clampCell(c) {
  return Math.max(16, Math.min(48, Math.round(Number(c) || DEFAULT_CELL)));
}

export function defaultJail(world) {
  const w = world?.w || DEFAULT_GRID_N * DEFAULT_CELL;
  const h = world?.h || w;
  return { x: Math.round(w / 2 - 70), y: Math.round(h / 2 - 48), w: 140, h: 96 };
}

export function normalizePieces(pieces) {
  const out = [];
  for (const p of pieces || []) {
    const type = PIECE_SIZE[p.type] ? p.type : null;
    if (!type) continue;
    out.push({
      id: String(p.id || Math.random().toString(36).slice(2, 9)),
      gx: Math.round(+p.gx),
      gy: Math.round(+p.gy),
      type,
    });
  }
  return out.slice(0, 500);
}

export function pieceCells(piece) {
  const [gw, gh] = PIECE_SIZE[piece.type] || [1, 1];
  const cells = [];
  for (let x = 0; x < gw; x++) {
    for (let y = 0; y < gh; y++) cells.push([piece.gx + x, piece.gy + y]);
  }
  return cells;
}

export function canPlacePiece(pieces, gx, gy, type, gridN, excludeId = null) {
  if (!PIECE_SIZE[type]) return false;
  const [gw, gh] = PIECE_SIZE[type];
  const n = clampGridN(gridN);
  if (gx < 0 || gy < 0 || gx + gw > n || gy + gh > n) return false;
  const cand = new Set();
  for (let x = 0; x < gw; x++) {
    for (let y = 0; y < gh; y++) cand.add(`${gx + x},${gy + y}`);
  }
  for (const p of pieces) {
    if (excludeId && p.id === excludeId) continue;
    for (const [cx, cy] of pieceCells(p)) {
      if (cand.has(`${cx},${cy}`)) return false;
    }
  }
  return true;
}

export function piecesToWalls(pieces, gridN, cellSize = DEFAULT_CELL) {
  const c = clampCell(cellSize);
  const walls = [];
  for (const p of normalizePieces(pieces)) {
    const [gw, gh] = PIECE_SIZE[p.type];
    walls.push({
      x: p.gx * c,
      y: p.gy * c,
      w: gw * c,
      h: gh * c,
    });
  }
  return walls.slice(0, 500);
}

export function emptyGridMap(gridN = DEFAULT_GRID_N, cellSize = DEFAULT_CELL) {
  const g = gridWorld(gridN, cellSize);
  return {
    ...g,
    pieces: [],
    walls: [],
    jail: defaultJail(g.world),
  };
}

export function normalizeGridMap(data) {
  const gridN = clampGridN(data.gridN || DEFAULT_GRID_N);
  const cellSize = clampCell(data.cellSize || DEFAULT_CELL);
  const { world } = gridWorld(gridN, cellSize);
  const pieces = normalizePieces(data.pieces);
  const walls = pieces.length
    ? piecesToWalls(pieces, gridN, cellSize)
    : (data.walls || []).slice(0, 500).map((w) => ({
      x: Math.round(+w.x), y: Math.round(+w.y), w: Math.round(+w.w), h: Math.round(+w.h),
    }));
  return {
    gridN,
    cellSize,
    world,
    pieces,
    walls,
    jail: data.jail || defaultJail(world),
  };
}

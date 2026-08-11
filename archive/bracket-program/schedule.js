// 대진표 생성 알고리즘
//
// 요구사항:
//  - n개 팀(짝수), 코스게임 m = n/2 개, 시간(time) m 개
//  - 각 팀은 모든 코스게임을 정확히 한 번씩 참여
//  - 각 시간에 팀은 정확히 한 경기만 (동시간대 중복 배정 금지)
//  - 각 코스게임은 한 시간에 한 쌍(2팀)만 진행
//  - 같은 팀끼리 2번 이상 만나는 경우를 최대한 없앤다(불가피하면 표시)
//
// 모델: T[team][course] = time  (n x m 배열)
//   · 각 행(팀)은 0..m-1 의 순열  → 팀은 각 시간에 서로 다른 코스, 각 코스 1회
//   · 각 열(코스)은 각 시간 값이 정확히 2번  → 코스별로 각 시간에 정확히 2팀
//   (course, time) 이 같은 두 팀이 그 경기에서 맞대결.

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

function pairKey(a, b) {
  return a < b ? a * 100000 + b : b * 100000 + a;
}

// 교차그룹 기본 구성. block1(0..m-1) vs block2(m..2m-1) 로 나눠 라틴방진 두 개를 쌓음.
function buildBase(n) {
  const m = n / 2;
  // a: m과 서로소이면서 (a-1)과 m의 gcd가 최소 → 반복 대결 최소화
  let bestA = 1;
  let bestScore = Infinity;
  for (let a = 1; a < Math.max(2, m); a++) {
    if (gcd(a, m) !== 1) continue;
    const score = gcd(((a - 1) % m + m) % m || m, m); // a-1 == 0 이면 m 취급
    if (score < bestScore) {
      bestScore = score;
      bestA = a;
    }
  }
  const T = [];
  for (let i = 0; i < m; i++) {
    const row = [];
    for (let c = 0; c < m; c++) row.push((i + c) % m);
    T.push(row);
  }
  for (let j = 0; j < m; j++) {
    const row = [];
    for (let c = 0; c < m; c++) row.push((j + bestA * c) % m);
    T.push(row);
  }
  return T;
}

// slot[course][time] = [teamA, teamB]
function buildSlots(T, n) {
  const m = n / 2;
  const slot = Array.from({ length: m }, () => Array.from({ length: m }, () => []));
  for (let p = 0; p < n; p++) {
    for (let c = 0; c < m; c++) {
      slot[c][T[p][c]].push(p);
    }
  }
  return slot;
}

function computeCost(slot) {
  const meetings = new Map();
  for (const col of slot) {
    for (const pair of col) {
      if (pair.length !== 2) continue;
      const k = pairKey(pair[0], pair[1]);
      meetings.set(k, (meetings.get(k) || 0) + 1);
    }
  }
  let cost = 0;
  for (const cnt of meetings.values()) if (cnt > 1) cost += cnt - 1;
  return cost;
}

const rnd = (x) => Math.floor(Math.random() * x);

// r1, c1, c2 에 대해 교환 가능한 r2 를 찾아 인터케일레이트(2x2) 교환을 수행/되돌린다.
function tryIntercalate(T, slot, r1, c1, c2) {
  const v1 = T[r1][c1];
  const v2 = T[r1][c2];
  if (v1 === v2) return null;
  let r2 = -1;
  for (const r of slot[c1][v2]) {
    if (r !== r1 && T[r][c2] === v1) { r2 = r; break; }
  }
  if (r2 === -1) return null;
  return { r1, r2, c1, c2, v1, v2 };
}

function applySwap(T, slot, s) {
  const { r1, r2, c1, c2, v1, v2 } = s;
  T[r1][c1] = v2; T[r1][c2] = v1;
  T[r2][c1] = v1; T[r2][c2] = v2;
  const swapIn = (c, v, from, to) => {
    const arr = slot[c][v];
    const idx = arr.indexOf(from);
    if (idx !== -1) arr[idx] = to;
  };
  swapIn(c1, v1, r1, r2);
  swapIn(c1, v2, r2, r1);
  swapIn(c2, v1, r2, r1);
  swapIn(c2, v2, r1, r2);
}

function undoSwap(T, slot, s) {
  const { r1, r2, c1, c2, v1, v2 } = s;
  T[r1][c1] = v1; T[r1][c2] = v2;
  T[r2][c1] = v2; T[r2][c2] = v1;
  const swapIn = (c, v, from, to) => {
    const arr = slot[c][v];
    const idx = arr.indexOf(from);
    if (idx !== -1) arr[idx] = to;
  };
  swapIn(c1, v1, r2, r1);
  swapIn(c1, v2, r1, r2);
  swapIn(c2, v1, r1, r2);
  swapIn(c2, v2, r2, r1);
}

// 무작위 인터케일레이트 교환을 여러 번 적용해 현재 배치를 흔든다(perturbation).
function perturb(T, slot, n, steps) {
  const m = n / 2;
  for (let k = 0; k < steps; k++) {
    const r1 = rnd(n);
    const c1 = rnd(m);
    let c2 = rnd(m);
    if (c1 === c2) continue;
    const s = tryIntercalate(T, slot, r1, c1, c2);
    if (s) applySwap(T, slot, s);
  }
}

// 한 번의 담금질(simulated annealing) 실행.
function anneal(T, slot, n, maxIter) {
  const m = n / 2;
  let cost = computeCost(slot);
  let bestT = T.map((r) => r.slice());
  let bestCost = cost;
  let temp = 1.0;
  const cool = Math.pow(0.0005 / temp, 1 / maxIter);
  let sinceImprove = 0;

  for (let it = 0; it < maxIter && bestCost > 0; it++) {
    temp *= cool;
    // 정체되면 재가열(reheating)
    if (sinceImprove > maxIter / 20) {
      temp = 0.5;
      sinceImprove = 0;
    }
    const r1 = rnd(n);
    const c1 = rnd(m);
    let c2 = rnd(m);
    if (c1 === c2) continue;
    const s = tryIntercalate(T, slot, r1, c1, c2);
    if (!s) continue;

    applySwap(T, slot, s);
    const newCost = computeCost(slot);
    const delta = newCost - cost;

    if (delta <= 0 || Math.random() < Math.exp(-delta / temp)) {
      cost = newCost;
      if (cost < bestCost) {
        bestCost = cost;
        bestT = T.map((r) => r.slice());
        sinceImprove = 0;
      } else {
        sinceImprove++;
      }
    } else {
      undoSwap(T, slot, s);
      sinceImprove++;
    }
  }
  return { bestT, bestCost };
}

// 다중 시작(restart) + 담금질로 반복 대결을 최소화한다.
function optimize(baseT, n) {
  const m = n / 2;
  if (m <= 1) return baseT;

  const maxIter = Math.min(200000, 4000 + n * n * 300);
  const restarts = Math.min(24, 6 + Math.floor(n / 3));

  let globalBestT = baseT.map((r) => r.slice());
  let globalBestCost = computeCost(buildSlots(baseT, n));

  for (let attempt = 0; attempt < restarts && globalBestCost > 0; attempt++) {
    // 매 재시작마다 기본 구성을 크게 무작위화해 서로 다른 탐색 영역에서 출발
    const startT = baseT.map((r) => r.slice());
    const slot = buildSlots(startT, n);
    if (attempt > 0) perturb(startT, slot, n, 30 * n * m);

    const { bestT, bestCost } = anneal(startT, slot, n, maxIter);
    if (bestCost < globalBestCost) {
      globalBestCost = bestCost;
      globalBestT = bestT.map((r) => r.slice());
    }
  }
  return globalBestT;
}

export function generateSchedule(n) {
  if (n < 2 || n % 2 !== 0) {
    throw new Error("팀 수는 2 이상의 짝수여야 합니다.");
  }
  const m = n / 2;
  let T = buildBase(n);
  T = optimize(T, n);

  const slot = buildSlots(T, n);

  // matches, timeGrid, teamGrid, teamOrder 생성
  const matches = [];
  const timeGrid = Array.from({ length: m }, () => new Array(m).fill(null)); // [time][course]
  const teamGrid = Array.from({ length: n }, () => new Array(m).fill(null)); // [team][course]

  for (let c = 0; c < m; c++) {
    for (let t = 0; t < m; t++) {
      const pair = slot[c][t];
      const a = pair[0];
      const b = pair[1];
      const teamA = Math.min(a, b);
      const teamB = Math.max(a, b);
      matches.push({ course: c, time: t, teamA, teamB });
      timeGrid[t][c] = { teamA, teamB };
      teamGrid[a][c] = { time: t, opponent: b };
      teamGrid[b][c] = { time: t, opponent: a };
    }
  }

  // 팀별 시간 순서
  const teamOrder = [];
  for (let p = 0; p < n; p++) {
    const list = [];
    for (let c = 0; c < m; c++) {
      const g = teamGrid[p][c];
      list.push({ time: g.time, course: c, opponent: g.opponent });
    }
    list.sort((x, y) => x.time - y.time);
    teamOrder.push(list);
  }

  // 반복 대결 집계
  const meetings = new Map();
  for (const match of matches) {
    const k = pairKey(match.teamA, match.teamB);
    if (!meetings.has(k)) meetings.set(k, { a: match.teamA, b: match.teamB, count: 0 });
    meetings.get(k).count++;
  }
  const repeats = [];
  let maxMeeting = 0;
  for (const v of meetings.values()) {
    maxMeeting = Math.max(maxMeeting, v.count);
    if (v.count >= 2) repeats.push(v);
  }
  repeats.sort((x, y) => y.count - x.count);

  return {
    teamCount: n,
    courseCount: m,
    timeCount: m,
    T,
    matches,
    timeGrid,
    teamGrid,
    teamOrder,
    repeats,
    stats: {
      distinctPairs: meetings.size,
      repeatedPairs: repeats.length,
      maxMeeting,
      totalGames: matches.length,
    },
  };
}

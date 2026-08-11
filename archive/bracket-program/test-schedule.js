import { generateSchedule } from "./schedule.js";

function validate(res) {
  const n = res.teamCount;
  const m = res.courseCount;
  const errors = [];

  // 1) 각 행(팀)이 0..m-1 순열인지 (각 코스 1회 + 각 시간 1회)
  for (let p = 0; p < n; p++) {
    const seen = new Set(res.T[p]);
    if (seen.size !== m) errors.push(`팀 ${p} 행이 순열이 아님`);
    for (let v = 0; v < m; v++) if (!seen.has(v)) errors.push(`팀 ${p} 시간 ${v} 누락`);
  }
  // 2) 각 (코스,시간)에 정확히 2팀
  const count = Array.from({ length: m }, () => new Array(m).fill(0));
  for (let p = 0; p < n; p++)
    for (let c = 0; c < m; c++) count[c][res.T[p][c]]++;
  for (let c = 0; c < m; c++)
    for (let t = 0; t < m; t++)
      if (count[c][t] !== 2) errors.push(`코스 ${c} 시간 ${t} 에 ${count[c][t]}팀 (2여야 함)`);
  // 3) 각 시간에 모든 팀이 정확히 1경기
  for (let t = 0; t < m; t++) {
    const teamsAtT = new Set();
    for (let p = 0; p < n; p++) {
      // 팀 p가 시간 t에 하는 코스
      const c = res.T[p].indexOf(t);
      if (teamsAtT.has(p)) errors.push(`팀 ${p} 시간 ${t} 중복`);
      teamsAtT.add(p);
    }
    if (teamsAtT.size !== n) errors.push(`시간 ${t} 팀 수 ${teamsAtT.size}`);
  }
  return errors;
}

for (const n of [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 30]) {
  const t0 = Date.now();
  const res = generateSchedule(n);
  const dt = Date.now() - t0;
  const errs = validate(res);
  console.log(
    `n=${String(n).padStart(2)} | 코스=${res.courseCount} 시간=${res.timeCount} | ` +
    `총경기=${res.stats.totalGames} 서로다른쌍=${res.stats.distinctPairs} ` +
    `반복쌍=${res.stats.repeatedPairs} 최대만남=${res.stats.maxMeeting} | ` +
    `${dt}ms | ${errs.length ? "❌ " + errs.slice(0, 3).join("; ") : "✅ 제약OK"}`
  );
}

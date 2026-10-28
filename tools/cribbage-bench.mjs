// クリベッジCPUの強さ比べ：難易度どうしを対戦させて、マッチの勝率と1ラウンドあたりの得点を表示する。
//   node tools/cribbage-bench.mjs 200      （マッチ数。省略時 100）
import { playRound } from '../games/cribbage/simulate.js';

const N = Number(process.argv[2] ?? 100);
const LEVELS = ['easy', 'normal', 'hard'];

function playMatch(a, b, seed) {
  // 席ごとに強さを入れ替えて、先後の有利を打ち消す
  const levels = seed % 2 === 0 ? [a, b] : [b, a];
  const who = { [a]: seed % 2 === 0 ? 'p0' : 'p1', [b]: seed % 2 === 0 ? 'p1' : 'p0' };
  let prev = null;
  let pts = { [a]: 0, [b]: 0 };
  let rounds = 0;
  for (let r = 0; r < 60; r++) {
    const { result } = playRound({ levels, seed: seed * 1000 + r, prev });
    rounds++;
    pts[a] += result.points[who[a]];
    pts[b] += result.points[who[b]];
    if (result.matchOver) return { winner: result.matchWinner === who[a] ? a : b, pts, rounds };
    prev = result;
  }
  return { winner: null, pts, rounds };
}

for (const [a, b] of [['normal', 'easy'], ['hard', 'easy'], ['hard', 'normal']]) {
  let wins = 0, rounds = 0;
  const pts = { [a]: 0, [b]: 0 };
  for (let i = 0; i < N; i++) {
    const m = playMatch(a, b, i + 1);
    if (m.winner === a) wins++;
    rounds += m.rounds;
    pts[a] += m.pts[a];
    pts[b] += m.pts[b];
  }
  console.log(`${a} vs ${b}: ${a} の勝率 ${((wins / N) * 100).toFixed(1)}%  1ラウンド平均 ${(pts[a] / rounds).toFixed(2)} 対 ${(pts[b] / rounds).toFixed(2)}`);
}

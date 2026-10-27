// CPUの強さ比べ。難易度どうしを席を入れ替えて対戦させ、ラウンドの勝ち数・得点を表示する。
//   node tools/cpu-bench.mjs [ラウンド数]
import { playRound } from '../games/gin-rummy/simulate.js';

const N = Number(process.argv[2] ?? 300);
const pairs = [['normal', 'easy'], ['hard', 'normal'], ['hard', 'easy']];
for (const [x, y] of pairs) {
  const t = { [x]: { win: 0, pts: 0 }, [y]: { win: 0, pts: 0 }, draw: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const swap = seed % 2 === 0; // 席（先手・後手）を交互に入れ替える
    const levels = swap ? [y, x] : [x, y];
    const { result } = playRound({ levels, seed: seed * 7919 });
    if (!result.ranking || result.reason === 'exhausted') { t.draw++; continue; }
    const winnerLevel = levels[Number(result.ranking[0] === 'p1')];
    t[winnerLevel].win++;
    t[winnerLevel].pts += result.points[result.ranking[0]];
  }
  const decided = t[x].win + t[y].win;
  console.log(`${x} 対 ${y}  ${x}: ${t[x].win}勝 ${t[x].pts}点 / ${y}: ${t[y].win}勝 ${t[y].pts}点 / 引き分け ${t.draw}  → ${x}の勝率 ${((100 * t[x].win) / decided).toFixed(1)}%、1ラウンドあたりの得点差 ${((t[x].pts - t[y].pts) / N).toFixed(1)}（決着 ${decided}）`);
}

// テキサスホールデムCPUの強さ比べ：4人卓で1人だけ強さを変えて、トーナメントの平均順位点（0〜3）と優勝率を表示する。
//   node tools/holdem-bench.mjs 100      （トーナメント数。省略時 40）
//   PAIRS=hard:normal node tools/holdem-bench.mjs 200
import { CPU_LEVELS, createCpu } from '../games/texas-holdem/cpu.js';
import { applyAction, autoAction, canPlay, deal, getResult } from '../games/texas-holdem/rules.js';
import { buildDeck } from '../common/deck.js';

const N = Number(process.argv[2] ?? 40);
let s = 1;
const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

function tournament(levels) {
  const uids = levels.map((_, i) => `p${i}`);
  const cpus = Object.fromEntries(uids.map((u, i) => [u, createCpu(levels[i], u, rng)]));
  let result = null;
  for (let h = 0; h < 500; h++) {
    const d = deal(uids.map((uid, seat) => ({ uid, seat })), undefined, result, shuffle(buildDeck()), (n) => Math.floor(rng() * n));
    let { game, deck } = d;
    const hands = d.hands;
    for (const c of Object.values(cpus)) c.reset();
    for (let t = 0; t < 400 && !game.ended; t++) {
      const u = game.turnUid;
      const action = autoAction(game, u) ?? cpus[u].decide(game, hands[u]);
      if (!canPlay(game, hands[u], action).ok) throw new Error(`illegal ${JSON.stringify(action)}`);
      const r = applyAction(game, action, { hand: hands[u], deck });
      game = r.game;
      if (r.deck) deck = r.deck;
      for (const c of Object.values(cpus)) c.observe(r.log, game);
    }
    if (!game.ended) throw new Error('stuck');
    result = getResult(game);
    if (result.matchOver) return result;
  }
  throw new Error('トーナメントが終わらない');
}

const known = new Set(CPU_LEVELS.map((l) => l.id));
for (const [a, b] of (process.env.PAIRS ?? 'normal:easy,hard:easy,hard:normal').split(',').map((x) => x.split(':'))) {
  if (!known.has(a) || !known.has(b)) throw new Error(`unknown level ${a}:${b}`);
  let pa = 0, pb = 0, na = 0, nb = 0, wins = 0;
  for (let i = 0; i < N; i++) {
    const seat = i % 4;
    const levels = [b, b, b, b];
    levels[seat] = a;
    const r = tournament(levels);
    pa += r.points[`p${seat}`]; na++;
    if (r.winner === `p${seat}`) wins++;
    for (let k = 0; k < 4; k++) if (k !== seat) { pb += r.points[`p${k}`]; nb++; }
  }
  console.log(`${a} 1人 vs ${b} 3人: ${a} 平均 ${(pa / na).toFixed(2)} 点 / ${b} 平均 ${(pb / nb).toFixed(2)} 点（最大3点）、${a} の優勝率 ${((wins / N) * 100).toFixed(0)}%（互角なら25%）`);
}

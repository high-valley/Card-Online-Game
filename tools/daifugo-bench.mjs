// 大富豪CPUの強さ比べ：4人卓で1人だけ強さを変えて、平均順位点（0〜3）を表示する。
//   node tools/daifugo-bench.mjs 300      （ゲーム数。省略時 200）
import { CPU_LEVELS, createCpu } from '../games/daifugo/cpu.js';
import { applyAction, canPlay, deal, getResult } from '../games/daifugo/rules.js';

const N = Number(process.argv[2] ?? 200);
let s = 1;
const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

function play(levels, prev) {
  const uids = levels.map((_, i) => `p${i}`);
  const dealt = deal(uids.map((uid, seat) => ({ uid, seat })), undefined, prev, shuffle(deckOf()));
  let { game } = dealt;
  const hands = dealt.hands;
  const cpus = Object.fromEntries(uids.map((u, i) => [u, createCpu(levels[i], u, rng)]));
  for (const c of Object.values(cpus)) c.reset();
  for (let t = 0; t < 2000 && !game.ended; t++) {
    const u = game.turnUid;
    const action = cpus[u].decide(game, hands[u]);
    if (!canPlay(game, hands[u], action).ok) throw new Error(`illegal ${JSON.stringify(action)}`);
    const r = applyAction(game, action);
    if (action.type === 'play') hands[u] = hands[u].filter((c) => !action.cards.includes(c));
    game = r.game;
    for (const c of Object.values(cpus)) c.observe(r.log, game);
  }
  if (!game.ended) throw new Error('stuck');
  return getResult(game);
}

import { buildDeck } from '../common/deck.js';
import { DECK_SPEC } from '../games/daifugo/rules.js';
const deckOf = () => buildDeck(DECK_SPEC);

for (const [a, b] of (process.env.PAIRS ?? 'normal:easy,hard:easy,hard:normal').split(',').map((x) => x.split(':'))) {
  let pa = 0, pb = 0, na = 0, nb = 0;
  for (let i = 0; i < N; i++) {
    const seat = i % 4;
    const levels = [b, b, b, b];
    levels[seat] = a;
    const r = play(levels, null);
    pa += r.points[`p${seat}`]; na++;
    for (let k = 0; k < 4; k++) if (k !== seat) { pb += r.points[`p${k}`]; nb++; }
  }
  console.log(`${a} 1人 vs ${b} 3人: ${a} 平均 ${(pa / na).toFixed(2)} 点 / ${b} 平均 ${(pb / nb).toFixed(2)} 点（最大3点）`);
}

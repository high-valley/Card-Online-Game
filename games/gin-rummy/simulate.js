/** CPU同士の対戦シミュレーション（テストと tools/cpu-bench.mjs で共有） */
import { buildDeck } from '../../common/deck.js';
import { createCpu } from './cpu.js';
import { applyAction, canPlay, deal, getResult } from './rules.js';

/** 再現できる乱数（mulberry32） */
export const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffled = (rng) => {
  const a = buildDeck();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** CPU同士で1ラウンド打つ。毎手、合法性とカードの保存（欠損・重複なし）を検証する */
export function playRound({ levels, seed, prev = null }) {
  const rng = seeded(seed);
  const players = [{ uid: 'p0', seat: 0 }, { uid: 'p1', seat: 1 }];
  const d = deal(players, {}, prev, shuffled(rng), (n) => Math.floor(rng() * n));
  let { game, hands, deck } = d;
  const cpus = { p0: createCpu(levels[0], 'p0', rng), p1: createCpu(levels[1], 'p1', rng) };
  let steps = 0;
  while (!game.ended) {
    const uid = game.turnUid;
    const action = cpus[uid].decide(game, hands[uid]);
    const chk = canPlay(game, hands[uid], action);
    if (!chk.ok) throw new Error(`CPU ${uid} が不正な手: ${JSON.stringify(action)} (${chk.reason}) phase=${game.phase}`);
    const r = applyAction(game, action, { hand: hands[uid], deck });
    if (r.hand) hands = { ...hands, [uid]: r.hand };
    if (r.deck) deck = r.deck;
    game = r.game;
    for (const [u, c] of Object.entries(cpus)) c.observe(r.log, game);
    const all = [...hands.p0, ...hands.p1, ...deck, ...game.discard];
    if (new Set(all).size !== 52 || all.length !== 52) throw new Error(`カードの欠損・重複 step=${steps} ${action.type}`);
    if (++steps > 400) throw new Error('終わらない');
  }
  return { result: getResult(game), steps, game };
}


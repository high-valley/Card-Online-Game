import { describe, expect, it } from 'vitest';
import { CPU_LEVELS, createCpu } from './cpu.js';
import { applyAction, canPlay, createGame, deal, getResult } from './rules.js';

let seed = 7;
const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/** CPU 4人で1ゲームを最後まで進める。出した手が毎回ルール上有効であることを確かめる */
function playOut(level, options) {
  const uids = ['p0', 'p1', 'p2', 'p3'];
  const dealt = deal(uids.map((uid, seat) => ({ uid, seat })), options);
  let game = dealt.game;
  const hands = dealt.hands;
  const cpus = Object.fromEntries(uids.map((u) => [u, createCpu(level, u, rng)]));
  for (let t = 0; t < 2000 && !game.ended; t++) {
    const u = game.turnUid;
    const action = cpus[u].decide(game, hands[u]);
    expect(canPlay(game, hands[u], action).ok).toBe(true);
    const r = applyAction(game, action);
    if (action.type === 'play') hands[u] = hands[u].filter((c) => !action.cards.includes(c));
    game = r.game;
    for (const c of Object.values(cpus)) c.observe(r.log, game);
  }
  return game;
}

describe('大富豪CPU', () => {
  for (const { id } of CPU_LEVELS) {
    it(`${id}: 毎回ルールどおりの手を出して、ゲームが終わる`, () => {
      for (let i = 0; i < 15; i++) expect(getResult(playOut(id)).finished).toBe(true);
    });
  }

  it('特殊ルール（しばり・都落ち）をオンにしても最後まで進む', () => {
    for (let i = 0; i < 10; i++) expect(playOut('hard', { lock: true, miyakoochi: true }).ended).toBe(true);
  });

  it('場が空ならパスせず、場があって出せなければパスする', () => {
    const game = createGame({ order: ['a', 'b', 'c'], hands: { a: ['H4', 'S9'], b: ['D3'], c: ['C3'] }, turnUid: 'a' });
    const cpu = createCpu('normal', 'a', rng);
    expect(cpu.decide(game, ['H4', 'S9']).type).toBe('play');
    const withField = { ...game, field: { uid: 'b', cards: ['DK'], kind: 'single', count: 1, rank: 13, ranks: [13], suits: ['D'], joker: false } };
    expect(cpu.decide(withField, ['H4', 'S9'])).toEqual({ type: 'pass', uid: 'a' });
  });

  it('normal は反則上がり（ジョーカー・2・8）になる最後の1枚を避けられるなら避ける', () => {
    const game = createGame({ order: ['a', 'b', 'c'], hands: { a: ['H5', 'S2'], b: ['D3', 'D4'], c: ['C3', 'C4'] }, turnUid: 'a' });
    const cpu = createCpu('normal', 'a', rng);
    expect(cpu.decide(game, ['H5', 'S2'])).toEqual({ type: 'play', uid: 'a', cards: ['H5'] });
  });
});

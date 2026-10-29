import { describe, expect, it } from 'vitest';
import { bestHand } from './hands.js';
import { _score7ForTest, CPU_LEVELS, createCpu } from './cpu.js';
import { applyAction, autoAction, canPlay, deal, getResult } from './rules.js';
import { buildDeck } from '../../common/deck.js';

let seed = 5;
const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const players = (uids) => uids.map((uid, seat) => ({ uid, seat }));
const sumChips = (g) => Object.values(g.chips).reduce((a, b) => a + b, 0) + (g.ended ? 0 : Object.values(g.total).reduce((a, b) => a + b, 0));

/** CPU だけで1トーナメントを最後まで打つ。毎回 canPlay が通り、チップの総和が保たれることを確かめる */
function playTournament(levels, options) {
  const uids = levels.map((_, i) => `p${i}`);
  const cpus = Object.fromEntries(uids.map((u, i) => [u, createCpu(levels[i], u, rng)]));
  const startTotal = uids.length * (options?.startingChips ?? 1500);
  let result = null;
  for (let h = 0; h < 400; h++) {
    const d = deal(players(uids), options, result, undefined, (n) => Math.floor(rng() * n));
    let { game, deck } = d;
    const hands = d.hands;
    for (const c of Object.values(cpus)) c.reset();
    for (let step = 0; step < 300 && !game.ended; step++) {
      const u = game.turnUid;
      const action = autoAction(game, u) ?? cpus[u].decide(game, hands[u]);
      const chk = canPlay(game, hands[u], action);
      expect(chk.ok, `${JSON.stringify(action)} ${chk.reason}`).toBe(true);
      const r = applyAction(game, action, { hand: hands[u], deck });
      game = r.game;
      if (r.deck) deck = r.deck;
      expect(sumChips(game)).toBe(startTotal);
      for (const c of Object.values(cpus)) c.observe(r.log, game);
    }
    expect(game.ended).toBe(true);
    result = getResult(game);
    if (result.matchOver) return result;
  }
  throw new Error('トーナメントが終わらない');
}

describe('テキサスホールデムCPU', () => {
  it('難易度は3つ', () => {
    expect(CPU_LEVELS.map((l) => l.id)).toEqual(['easy', 'normal', 'hard']);
  });

  it('高速な役判定は bestHand と同じ強さの順序になる', () => {
    const deck = buildDeck();
    for (let i = 0; i < 400; i++) {
      const pick = () => [...deck].sort(() => rng() - 0.5).slice(0, 7);
      const a = pick();
      const b = pick();
      const x = Math.sign(_score7ForTest(a) - _score7ForTest(b));
      const y = Math.sign(bestHand(a).score - bestHand(b).score);
      expect(x).toBe(y);
    }
  });

  for (const { id } of CPU_LEVELS) {
    for (const n of [4, 6, 9]) {
      it(`${id} ${n}人：毎回ルールどおりに打ち、チップが保存されて決着する`, () => {
        const r = playTournament(Array.from({ length: n }, () => id));
        expect(r.matchOver).toBe(true);
        expect(r.ranking).toHaveLength(n);
      });
    }
  }

  it('難易度が混ざった卓でも最後まで進む', () => {
    expect(playTournament(['easy', 'normal', 'hard', 'hard', 'normal']).matchOver).toBe(true);
  });

  it('どの手番でも合法な手を返す（rng が極端でも）', () => {
    const d = deal(players(['a', 'b']), { startingChips: 1500 }, null, undefined, () => 0);
    const cpu = createCpu('easy', d.game.turnUid, () => 0.99);
    for (let i = 0; i < 20; i++) {
      const a = cpu.decide(d.game, d.hands[d.game.turnUid]);
      expect(canPlay(d.game, d.hands[d.game.turnUid], a).ok).toBe(true);
    }
  });
});

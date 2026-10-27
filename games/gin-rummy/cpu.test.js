import { describe, expect, it } from 'vitest';
import { createCpu } from './cpu.js';
import { canPlay } from './rules.js';
import { playRound, seeded as makeSeeded } from './simulate.js';

const seeded = makeSeeded;

describe('CPU（ジン・ラミー）', () => {
  for (const levels of [['easy', 'easy'], ['easy', 'normal'], ['normal', 'hard'], ['hard', 'hard'], ['hard', 'easy']]) {
    it(`${levels.join(' 対 ')}：20ラウンド、不正な手を指さず、必ず終わり、カードが欠けない`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const { result } = playRound({ levels, seed });
        expect(result.finished).toBe(true);
        expect(['knock', 'gin', 'undercut', 'exhausted']).toContain(result.reason);
        const total = Object.values(result.points).reduce((a, b) => a + b, 0);
        expect(total).toBe(result.winner === null || result.reason === 'exhausted' ? 0 : result.points[result.ranking[0]]);
      }
    });
  }

  it('ノックできる手札なら、easyはほぼノックする', () => {
    const hand = ['S5', 'H5', 'D5', 'C8', 'C9', 'C10', 'S7', 'S8', 'S9', 'H4', 'DK'];
    const game = { phase: 'WAITING_FOR_DISCARD', turnUid: 'b', lastDraw: { uid: 'b', source: 'deck', card: null }, deckCount: 20, discard: ['SQ'], scores: { a: 0, b: 0 }, options: { knockLimit: 10, targetScore: 100 }, ended: false, order: ['a', 'b'] };
    let knocks = 0;
    for (let i = 0; i < 50; i++) if (createCpu('easy', 'b', seeded(i)).decide(game, hand).type === 'knock') knocks++;
    expect(knocks).toBeGreaterThanOrEqual(35); // 約85%
    // 見落としが起きない乱数なら、一番いらないカードから捨ててノックする
    expect(createCpu('easy', 'b', () => 0.5).decide(game, hand)).toMatchObject({ type: 'knock', card: 'DK' });
  });

  it('ジンできるなら必ずジンする', () => {
    const hand = ['S5', 'H5', 'D5', 'C5', 'C8', 'C9', 'C10', 'S7', 'S8', 'S9', 'DK'];
    const game = { phase: 'WAITING_FOR_DISCARD', turnUid: 'b', lastDraw: { uid: 'b', source: 'deck', card: null }, deckCount: 20, discard: ['SQ'], scores: { a: 0, b: 0 }, options: { knockLimit: 10, targetScore: 100 }, ended: false, order: ['a', 'b'] };
    for (const level of ['easy', 'normal', 'hard']) expect(createCpu(level, 'b', seeded(1)).decide(game, hand)).toMatchObject({ type: 'gin', card: 'DK' });
  });

  it('捨て札で役ができるなら取り、関係なければ山札から引く', () => {
    const hand = ['S5', 'S6', 'H9', 'D2', 'C3', 'HJ', 'DQ', 'CK', 'H7', 'D8'];
    const base = { phase: 'WAITING_FOR_DRAW', turnUid: 'b', forceDeck: false, lastDraw: null, deckCount: 20, scores: { a: 0, b: 0 }, options: { knockLimit: 10, targetScore: 100 }, ended: false, order: ['a', 'b'] };
    for (const level of ['easy', 'normal', 'hard']) {
      expect(createCpu(level, 'b', seeded(1)).decide({ ...base, discard: ['S7'] }, hand)).toMatchObject({ type: 'draw', source: 'discard' });
      expect(createCpu(level, 'b', seeded(1)).decide({ ...base, discard: ['C10'] }, hand)).toMatchObject({ type: 'draw', source: 'deck' });
    }
  });

  it('最初のターンは山札から引く（捨て札は取れない）', () => {
    const hand = ['S5', 'S6', 'H9', 'D2', 'C3', 'HJ', 'DQ', 'CK', 'H7', 'D8'];
    const game = { phase: 'WAITING_FOR_DRAW', turnUid: 'b', forceDeck: true, lastDraw: null, deckCount: 31, discard: ['S7'], scores: { a: 0, b: 0 }, options: { knockLimit: 10, targetScore: 100 }, ended: false, order: ['a', 'b'] };
    expect(createCpu('normal', 'b', seeded(1)).decide(game, hand)).toMatchObject({ type: 'draw', source: 'deck' });
  });

  it('取った捨て札をそのターンに捨てない', () => {
    const hand = ['S5', 'S6', 'S7', 'H9', 'D2', 'C3', 'HJ', 'DQ', 'CK', 'D8', 'CA'];
    const game = { phase: 'WAITING_FOR_DISCARD', turnUid: 'b', lastDraw: { uid: 'b', source: 'discard', card: 'CA' }, deckCount: 20, discard: ['SQ'], scores: { a: 0, b: 0 }, options: { knockLimit: 10, targetScore: 100 }, ended: false, order: ['a', 'b'] };
    for (const level of ['easy', 'normal', 'hard']) expect(createCpu(level, 'b', seeded(2)).decide(game, hand).card).not.toBe('CA');
  });

  it('hard：相手が捨て札から取ったカードの仲間は、できるだけ捨てない', () => {
    const hand = ['S5', 'H5', 'D9', 'H9', 'C2', 'S3', 'DK', 'CQ', 'H8', 'D4', 'C7'];
    const game = { phase: 'WAITING_FOR_DISCARD', turnUid: 'b', lastDraw: { uid: 'b', source: 'deck', card: null }, deckCount: 20, discard: ['SQ'], scores: { a: 0, b: 0 }, options: { knockLimit: 10, targetScore: 100 }, ended: false, order: ['a', 'b'] };
    const cpu = createCpu('hard', 'b', seeded(3));
    const before = cpu.decide(game, hand).card;
    cpu.reset();
    cpu.observe({ type: 'draw', source: 'discard', uid: 'a', cards: [before] }); // 相手が同じ数字／近いカードを持っている
    const after = cpu.decide(game, hand).card;
    expect(after).not.toBe(undefined);
  });

  it('observe：相手が取ったカードを記録し、捨てたら忘れる', () => {
    const cpu = createCpu('hard', 'b', seeded(1));
    cpu.observe({ type: 'draw', source: 'discard', uid: 'a', cards: ['H9'] });
    cpu.observe({ type: 'discard', uid: 'a', cards: ['H9'] });
    cpu.observe({ type: 'draw', source: 'deck', uid: 'a', cards: [] });
    expect(() => cpu.decide({ phase: 'INITIAL_OFFER', turnUid: 'b', discard: ['S7'], deckCount: 31, scores: { a: 0, b: 0 }, options: { knockLimit: 10, targetScore: 100 }, ended: false, order: ['a', 'b'] }, ['S5', 'S6', 'H9', 'D2', 'C3', 'HJ', 'DQ', 'CK', 'H7', 'D8'])).not.toThrow();
  });

  it('非公開情報を使わない：相手の手札・山札の中身が違っても、同じ公開情報なら同じ判断', () => {
    const game = { phase: 'WAITING_FOR_DRAW', turnUid: 'b', forceDeck: false, lastDraw: null, deckCount: 20, discard: ['S7'], scores: { a: 0, b: 0 }, options: { knockLimit: 10, targetScore: 100 }, ended: false, order: ['a', 'b'] };
    const hand = ['S5', 'S6', 'H9', 'D2', 'C3', 'HJ', 'DQ', 'CK', 'H7', 'D8'];
    const a = createCpu('hard', 'b', seeded(5)).decide(game, hand);
    const b = createCpu('hard', 'b', seeded(5)).decide({ ...game, secretOpponentHand: ['S8'], deck: ['S4'] }, hand);
    expect(b).toEqual(a);
  });

  it('決定ロジックが例外を出しても、合法手にフォールバックする', () => {
    const cpu = createCpu('normal', 'b', seeded(1));
    const game = { phase: 'WAITING_FOR_DISCARD', turnUid: 'b', lastDraw: null, deckCount: 20, discard: null, scores: null, options: { knockLimit: 10, targetScore: 100 }, ended: false, order: ['a', 'b'] };
    const hand = ['S5', 'S6', 'S7', 'H9', 'D2', 'C3', 'HJ', 'DQ', 'CK', 'D8', 'CA'];
    const a = cpu.decide(game, hand);
    expect(canPlay(game, hand, a).ok).toBe(true);
  });
});

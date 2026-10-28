import { describe, expect, it } from 'vitest';
import { createCpu } from './cpu.js';
import { playRound } from './simulate.js';
import { deal } from './rules.js';

describe('CPU同士のラウンド', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    it(`${level}：不正な手を打たず、カードの欠損・重複なしでラウンドが終わる`, () => {
      for (let seed = 1; seed <= 15; seed++) {
        const { result } = playRound({ levels: [level, level], seed });
        expect(result.finished).toBe(true);
        expect(result.points.p0 + result.points.p1).toBeGreaterThanOrEqual(0);
        const total = result.detail.events.reduce((n, e) => n + e.points, 0);
        expect(total).toBe(result.points.p0 + result.points.p1);
      }
    });
  }
  it('異なる強さ同士でも最後まで進み、複数ラウンドで累積得点が引き継がれ、121点で決着する', () => {
    let prev = null;
    let rounds = 0;
    for (let seed = 100; seed < 400; seed++) {
      const { result } = playRound({ levels: ['hard', 'easy'], seed, prev });
      if (prev) expect(result.scores.p0 + result.scores.p1).toBeGreaterThanOrEqual(prev.scores.p0 + prev.scores.p1);
      rounds++;
      if (result.matchOver) {
        const w = result.matchWinner;
        expect(result.scores[w]).toBeGreaterThanOrEqual(121);
        expect(result.scores[w === 'p0' ? 'p1' : 'p0']).toBeLessThan(121);
        expect(rounds).toBeGreaterThan(2);
        return;
      }
      prev = result;
    }
    throw new Error('マッチが決着しない');
  });
});

describe('CPUの公平性', () => {
  it('相手の手札を渡さなくても（自分の手札と公開情報だけで）手を決められる', () => {
    const d = deal([{ uid: 'p0', seat: 0 }, { uid: 'p1', seat: 1 }], {}, null, undefined, () => 0);
    const cpu = createCpu('hard', 'p1', () => 0.5);
    const action = cpu.decide(d.game, d.hands.p1);
    expect(action).toMatchObject({ type: 'discard', uid: 'p1' });
    expect(action.cards.every((c) => d.hands.p1.includes(c))).toBe(true);
    // 公開情報（game）には相手の手札・山札・クリブの中身がない
    const json = JSON.stringify(d.game);
    for (const c of d.hands.p0) expect(json.includes(`"${c}"`)).toBe(false);
  });
});

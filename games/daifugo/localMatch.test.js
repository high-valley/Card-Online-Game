import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalMatch } from '../../common/localMatch.js';
import daifugo from './index.js';
import { createCpu } from './cpu.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** 人間役を同じCPUに任せて、3回続けて最後まで進める */
function playRounds(level, rounds) {
  let model = null;
  const match = createLocalMatch({ mod: daifugo, level, humanUid: 'me', humanName: 'あなた', onChange: (m) => (model = m) });
  const bot = createCpu('normal', 'me');
  const results = [];
  match.start();
  for (let i = 0; i < 5000 && results.length < rounds; i++) {
    const { room, state } = model;
    if (room.status === 'finished') {
      results.push(state.result);
      match.start();
    } else if (state.turnUid === 'me') {
      match.act(bot.decide(state.game, model.hand));
    } else {
      vi.advanceTimersByTime(3000);
    }
  }
  match.stop();
  return { model, results };
}

describe('大富豪のCPU対戦（人間1人＋CPU3人）', () => {
  it('4人で始まり、CPUの名前に強さが付く', () => {
    let model = null;
    const match = createLocalMatch({ mod: daifugo, level: 'hard', humanUid: 'me', humanName: 'あなた', onChange: (m) => (model = m) });
    match.start();
    expect(model.players.map((p) => p.name)).toEqual(['あなた', 'CPU1（つよい）', 'CPU2（つよい）', 'CPU3（つよい）']);
    expect(model.players.map((p) => p.handCount).reduce((a, b) => a + b)).toBe(53);
    match.stop();
  });

  for (const level of ['easy', 'normal', 'hard']) {
    it(`${level}：3ラウンド続けて終わり、2回目以降は前回の大貧民から始まる`, () => {
      const { model, results } = playRounds(level, 3);
      expect(results).toHaveLength(3);
      for (const r of results) expect([...r.ranking].sort()).toEqual(['cpu1', 'cpu2', 'cpu3', 'me']);
      const total = model.players.reduce((s, p) => s + (p.totalPoints.daifugo ?? 0), 0);
      expect(total).toBe(results.length * (0 + 1 + 2 + 3));
    });
  }
});

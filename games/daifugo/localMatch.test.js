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

describe('大富豪のCPU対戦：ルール設定', () => {
  const OPTION_KEYS = ['revolution', 'eightCut', 'sequence', 'spade3', 'lock', 'miyakoochi'];
  const make = () => {
    let model = null;
    const match = createLocalMatch({ mod: daifugo, level: 'normal', humanUid: 'me', humanName: 'あなた', onChange: (m) => (model = m) });
    return { match, get model() { return model; } };
  };

  it('設定画面（waiting）では、ルールを変えられ、開始するとそのルールで配られる', () => {
    const t = make();
    t.match.openSettings();
    expect(t.model.room).toMatchObject({ status: 'waiting', local: true });
    expect(t.model.state).toBeNull();
    t.match.setOptions({ revolution: false, lock: true });
    expect(t.model.room.options).toMatchObject({ revolution: false, lock: true, eightCut: true });
    t.match.start();
    expect(t.model.room.status).toBe('playing');
    expect(t.model.state.game.options).toMatchObject({ revolution: false, lock: true, eightCut: true });
    t.match.stop();
  });

  it('ゲーム中は、ルールを変えられない', () => {
    const t = make();
    t.match.start();
    t.match.setOptions({ revolution: false });
    expect(t.model.room.options.revolution).toBe(true);
    expect(t.model.state.game.options.revolution).toBe(true);
    t.match.stop();
  });

  it('結果画面から設定画面へ戻り、ルールを変えて続けられる（前回の順位は引き継ぐ）', () => {
    const t = make();
    const bot = createCpu('normal', 'me');
    t.match.start();
    for (let i = 0; i < 5000 && t.model.room.status !== 'finished'; i++) {
      if (t.model.state.turnUid === 'me') t.match.act(bot.decide(t.model.state.game, t.model.hand));
      else vi.advanceTimersByTime(3000);
    }
    expect(t.model.room.status).toBe('finished');
    const ranking = t.model.state.result.ranking;
    t.match.openSettings();
    expect(t.model.room.status).toBe('waiting');
    t.match.setOptions({ eightCut: false, miyakoochi: true });
    t.match.start();
    expect(t.model.state.game.options).toMatchObject({ eightCut: false, miyakoochi: true });
    expect(t.model.state.round).toBe(2);
    expect(t.model.state.turnUid).toBe(ranking.at(-1)); // 2回目は大貧民から
    expect(t.model.state.game.prevDaifugo).toBe(ranking[0]);
    t.match.stop();
  });

  it('ルールの全64通りの組み合わせで、CPUは不正な手を指さず、必ずラウンドが終わる（強さも順に変える）', () => {
    const levels = ['easy', 'normal', 'hard'];
    for (let n = 0; n < 64; n++) {
      const options = Object.fromEntries(OPTION_KEYS.map((k, b) => [k, !!(n & (1 << b))]));
      let model = null;
      const match = createLocalMatch({ mod: daifugo, level: levels[n % 3], humanUid: 'me', humanName: 'あなた', onChange: (m) => (model = m) });
      match.openSettings();
      match.setOptions(options);
      match.start();
      const bot = createCpu(levels[(n + 1) % 3], 'me');
      for (let steps = 0; steps < 6000 && model.room.status !== 'finished'; steps++) {
        if (model.state.turnUid === 'me') match.act(bot.decide(model.state.game, model.hand)); // 不正な手なら例外
        else vi.advanceTimersByTime(3000);
      }
      expect(model.room.status, JSON.stringify(options)).toBe('finished');
      expect([...model.state.result.ranking].sort()).toEqual(['cpu1', 'cpu2', 'cpu3', 'me']);
      match.stop();
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalMatch } from '../../common/localMatch.js';
import ginrummy from './index.js';
import { createCpu } from './cpu.js';
import { seeded } from './simulate.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** 人間役を自動プレイヤーに置き換えて、マッチが決着するまで進める */
function playMatch(level, seed) {
  let model = null;
  const rng = seeded(seed);
  const match = createLocalMatch({ mod: ginrummy, level, humanUid: 'me', humanName: 'あなた', onChange: (m) => (model = m), random: rng });
  const bot = createCpu('normal', 'me', rng);
  const rounds = [];
  match.start();
  for (let i = 0; i < 5000; i++) {
    const { room, state } = model;
    if (room.status === 'finished') {
      rounds.push(state.result);
      if (state.result.matchOver) return { model, rounds, match };
      match.start();
      continue;
    }
    const auto = ginrummy.autoAction(state.game, 'me');
    if (state.turnUid === 'me' || auto) {
      const action = auto ?? bot.decide(state.game, model.hand);
      match.act(action);
      bot.observe(state.log.at(-1) ?? {}, state.game);
    } else {
      vi.advanceTimersByTime(3000); // CPUが考える時間
    }
  }
  throw new Error('マッチが終わらない');
}

describe('ローカル対戦（人間1人＋CPU）', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    it(`${level}：マッチが決着し、累積100点以上の勝者が決まる`, () => {
      const { model, rounds } = playMatch(level, 11);
      const last = rounds.at(-1);
      expect(last.matchOver).toBe(true);
      expect(Math.max(...Object.values(last.scores))).toBeGreaterThanOrEqual(100);
      expect(last.scores[last.matchWinner]).toBe(Math.max(...Object.values(last.scores)));
      // 各ラウンドの得点の合計が、通算成績と一致する
      const sum = (uid) => rounds.reduce((s, r) => s + (r.points[uid] ?? 0), 0);
      for (const p of model.players) expect(p.totalPoints.ginrummy).toBe(sum(p.uid));
    });
  }

  it('CPUの名前に強さが付き、ラウンド番号が進む', () => {
    const { model, rounds } = playMatch('hard', 3);
    expect(model.players[1].name).toBe('CPU（つよい）');
    expect(model.state.round).toBe(rounds.length);
  });

  it('人間の番でない操作・不正な操作は拒否される', () => {
    let model;
    const match = createLocalMatch({ mod: ginrummy, level: 'normal', humanUid: 'me', humanName: 'あなた', onChange: (m) => (model = m), random: seeded(5) });
    match.start();
    const me = model.state.turnUid === 'me';
    if (!me) expect(() => match.act({ type: 'pass', uid: 'me' })).toThrow();
    else expect(() => match.act({ type: 'discard', uid: 'me', card: model.hand[0] })).toThrow(); // まだ引いていない
  });

  it('stop すると、CPUはもう動かない', () => {
    let model;
    const match = createLocalMatch({ mod: ginrummy, level: 'easy', humanUid: 'me', humanName: 'あなた', onChange: (m) => (model = m), random: seeded(9) });
    match.start();
    match.stop();
    const v = model.state.version;
    vi.advanceTimersByTime(20000);
    expect(model.state.version).toBe(v);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalMatch } from '../../common/localMatch.js';
import cribbage from './index.js';
import { createCpu } from './cpu.js';
import { seeded } from './simulate.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** 人間役を自動プレイヤーに置き換えて、マッチが決着するまで進める */
function playMatch(level, seed) {
  let model = null;
  const rng = seeded(seed);
  const match = createLocalMatch({ mod: cribbage, level, humanUid: 'me', humanName: 'あなた', onChange: (m) => (model = m), random: rng });
  const bot = createCpu('normal', 'me', rng);
  const rounds = [];
  match.start();
  for (let i = 0; i < 5000; i++) {
    const { room, state } = model;
    if (room.status === 'finished') {
      rounds.push(state.result);
      if (state.result.matchOver) return { model, rounds };
      match.start();
      continue;
    }
    if (state.turnUid === 'me') {
      match.act(bot.decide(state.game, model.hand));
    } else {
      vi.advanceTimersByTime(3000); // CPUが考える時間
    }
  }
  throw new Error('マッチが終わらない');
}

describe('ローカル対戦（人間1人＋CPU）', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    it(`${level}：マッチが決着し、累積121点以上の勝者が決まる`, () => {
      const { model, rounds } = playMatch(level, 21);
      const last = rounds.at(-1);
      expect(last.matchOver).toBe(true);
      expect(last.scores[last.matchWinner]).toBeGreaterThanOrEqual(121);
      // 各ラウンドの得点の合計が、通算成績と一致する
      const sum = (uid) => rounds.reduce((s, r) => s + (r.points[uid] ?? 0), 0);
      for (const p of model.players) expect(p.totalPoints.cribbage).toBe(sum(p.uid));
    });
  }

  it('ラウンドをまたいで累積得点が保持され、親が交代する', () => {
    const { rounds } = playMatch('normal', 4);
    expect(rounds.length).toBeGreaterThan(2);
    for (let i = 1; i < rounds.length; i++) {
      expect(rounds[i].dealer).not.toBe(rounds[i - 1].dealer);
      for (const u of Object.keys(rounds[i].scores)) expect(rounds[i].scores[u]).toBeGreaterThanOrEqual(rounds[i - 1].scores[u]);
    }
  });

  it('人間の番でない操作・不正な操作は拒否される', () => {
    let model;
    const match = createLocalMatch({ mod: cribbage, level: 'normal', humanUid: 'me', humanName: 'あなた', onChange: (m) => (model = m), random: seeded(5) });
    match.start();
    if (model.state.turnUid !== 'me') expect(() => match.act({ type: 'discard', uid: 'me', cards: model.hand.slice(0, 2) })).toThrow();
    else expect(() => match.act({ type: 'discard', uid: 'me', cards: [model.hand[0]] })).toThrow(); // 2枚必要
  });

  it('公開状態（CPUに渡る game）には、スターターと出した札以外のカードが含まれない', () => {
    let model;
    const match = createLocalMatch({ mod: cribbage, level: 'hard', humanUid: 'me', humanName: 'あなた', onChange: (m) => (model = m), random: seeded(8) });
    const bot = createCpu('easy', 'me', seeded(1));
    match.start();
    for (let i = 0; i < 200 && model.room.status === 'playing' && ['DISCARD_TO_CRIB', 'PEGGING'].includes(model.state.game.phase); i++) {
      const { state } = model;
      if (state.turnUid === 'me') match.act(bot.decide(state.game, model.hand));
      else vi.advanceTimersByTime(3000);
      const g = model.state.game;
      const open = new Set([g.starter, ...g.peg.seq.map((e) => e.card), ...g.peg.played.me, ...g.peg.played.cpu]);
      for (const m of JSON.stringify(g).matchAll(/"([SHDC](?:10|[A2-9JQK]))"/g)) expect(open.has(m[1])).toBe(true);
    }
  });

  it('stop すると、CPUはもう動かない', () => {
    let model;
    const match = createLocalMatch({ mod: cribbage, level: 'easy', humanUid: 'me', humanName: 'あなた', onChange: (m) => (model = m), random: seeded(9) });
    match.start();
    match.stop();
    const v = model.state.version;
    vi.advanceTimersByTime(20000);
    expect(model.state.version).toBe(v);
  });
});

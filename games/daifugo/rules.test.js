import { describe, expect, it } from 'vitest';
import { buildDeck } from '../../common/deck.js';
import { analyze, applyAction, canPlay, createGame, deal, defaultOptions, getResult } from './rules.js';

const ORDER = ['a', 'b', 'c'];
const mk = (hands, o = {}) => {
  const { turnUid = 'a', options, ...rest } = o;
  const g = createGame({ order: Object.keys(hands), hands, turnUid, options });
  return Object.assign(g, rest);
};
/** 手札を引いて action を適用する */
const play = (g, hands, uid, cards, extra = {}) => {
  const action = { type: 'play', uid, cards, ...extra };
  const r = canPlay(g, hands[uid], action);
  if (!r.ok) throw new Error(r.reason);
  hands[uid] = hands[uid].filter((c) => !cards.includes(c));
  return applyAction(g, action);
};
const reason = (g, hands, uid, cards, extra) => canPlay(g, hands[uid], { type: 'play', uid, cards, ...extra }).reason;

describe('deal', () => {
  const players = ORDER.map((uid, seat) => ({ uid, seat }));
  it('53枚を配り切り、枚数差は1枚まで', () => {
    const { hands } = deal(players, defaultOptions);
    const sizes = ORDER.map((u) => hands[u].length);
    expect(sizes.reduce((a, b) => a + b)).toBe(53);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(new Set(ORDER.flatMap((u) => hands[u])).size).toBe(53);
  });
  it('初回はダイヤの3から、2回目以降は大貧民から', () => {
    const { hands, turnUid } = deal(players, defaultOptions);
    expect(hands[turnUid]).toContain('D3');
    const second = deal(players, defaultOptions, { ranking: ['b', 'a', 'c'] });
    expect(second.turnUid).toBe('c');
    expect(second.game.prevDaifugo).toBe('b');
  });
  it('席順に配る', () => {
    const deck = buildDeck({ jokers: 1 });
    const { hands } = deal([{ uid: 'x', seat: 1 }, { uid: 'y', seat: 0 }], defaultOptions, null, deck);
    expect(hands.y[0]).toBe(deck[0]);
    expect(hands.x[0]).toBe(deck[1]);
  });
});

describe('analyze', () => {
  it('ジョーカーは階段の穴埋めとして複数解釈になる', () => {
    expect(analyze(['S4', 'S5', 'JK']).filter((c) => c.kind === 'seq').map((c) => c.rank)).toEqual([3, 4]);
    expect(analyze(['S4', 'S5', 'JK'], ['H6']).map((c) => c.rank)).toEqual([4]);
  });
  it('スートが違えば階段にならない', () => {
    expect(analyze(['S4', 'H5', 'S6'])).toEqual([]);
  });
});

describe('基本の出し方', () => {
  it('強さは 3 < … < K < A < 2 < ジョーカー', () => {
    const h = { a: ['SK', 'S4'], b: ['SA', 'H2'], c: ['JK', 'H9'] };
    let r = play(mk(h), h, 'a', ['SK']);
    r = play(r.game, h, 'b', ['SA']);
    expect(reason(r.game, h, 'c', ['H9'])).toBe('too-weak');
    const r2 = mk({ a: ['SA'], b: ['H2', 'JK'], c: ['S3'] });
    const after = applyAction(r2, { type: 'play', uid: 'a', cards: ['SA'] });
    expect(canPlay(after.game, ['H2', 'JK'], { type: 'play', uid: 'b', cards: ['H2'] }).ok).toBe(true);
    const afterTwo = applyAction({ ...after.game, turnUid: 'b' }, { type: 'play', uid: 'b', cards: ['H2'] });
    expect(canPlay(afterTwo.game, ['JK'], { type: 'play', uid: 'c', cards: ['JK'] }).ok).toBe(true);
  });
  it('同位・枚数違い・手札にないカードは出せない', () => {
    const hands = { a: ['S5', 'H5', 'S9'], b: ['D5', 'C9', 'C6', 'H6'], c: ['H3'] };
    const g = mk(hands);
    const r = play(g, hands, 'a', ['S5']);
    expect(reason(r.game, hands, 'b', ['D5'])).toBe('too-weak');
    expect(reason(r.game, hands, 'b', ['C6', 'H6'])).toBe('shape-mismatch');
    expect(reason(r.game, hands, 'b', ['S7'])).toBe('not-in-hand');
    expect(reason(g, hands, 'b', ['C9'])).toBe('not-your-turn');
  });
  it('リード時はパスできない', () => {
    expect(canPlay(mk({ a: ['S3'], b: ['S4'], c: ['S5'] }), ['S3'], { type: 'pass', uid: 'a' }).reason).toBe('cannot-pass-lead');
  });
  it('全員パスで場が流れ、最後に出した人から再開。パス済みは飛ばす', () => {
    const hands = { a: ['S3', 'S9'], b: ['S4', 'S5'], c: ['S6', 'S7'] };
    let r = play(mk(hands), hands, 'a', ['S3']);
    r = play(r.game, hands, 'b', ['S4']);
    expect(r.turnUid).toBe('c');
    r = applyAction(r.game, { type: 'pass', uid: 'c' });
    expect(r.turnUid).toBe('a');
    r = applyAction(r.game, { type: 'pass', uid: 'a' });
    expect(r.turnUid).toBe('b');
    expect(r.game.field).toBeNull();
    expect(r.game.passed).toEqual({});
  });
  it('パスした人は場が流れるまで出せない', () => {
    const hands = { a: ['S3', 'S9'], b: ['S4', 'S5', 'S8'], c: ['S6', 'SK'] };
    let r = play(mk(hands), hands, 'a', ['S3']);
    r = applyAction(r.game, { type: 'pass', uid: 'b' });
    r = play(r.game, hands, 'c', ['S6']);
    expect(r.turnUid).toBe('a');
    r = applyAction(r.game, { type: 'pass', uid: 'a' });
    expect(r.game.field).toBeNull(); // b は既にパス済み、a もパスで全員パス
    expect(r.turnUid).toBe('c');
  });
});

describe('特殊ルール', () => {
  it('革命：4枚出しで強さが逆転する', () => {
    const hands = { a: ['S7', 'H7', 'D7', 'C7', 'S9'], b: ['S5'], c: ['D6'] };
    const r = play(mk(hands), hands, 'a', ['S7', 'H7', 'D7', 'C7']);
    expect(r.game.revolution).toBe(true);
    expect(r.log.effects).toContain('revolution');
    // 場を流して単体出しで確認
    const g = { ...r.game, field: null, passed: {}, turnUid: 'b' };
    const r2 = play(g, hands, 'b', ['S5']);
    expect(reason(r2.game, hands, 'c', ['D6'])).toBe('too-weak');
  });
  it('革命をもう一度起こすと元に戻る', () => {
    const g = mk({ a: ['SA'], b: ['S3', 'H3', 'D3', 'C3', 'S6'], c: ['S5'] }, { revolution: true, turnUid: 'b' });
    const r = applyAction(g, { type: 'play', uid: 'b', cards: ['S3', 'H3', 'D3', 'C3'] });
    expect(r.game.revolution).toBe(false);
  });
  it('革命中は小さいほど強く、ジョーカー1枚は最強のまま', () => {
    const g = mk({ a: ['S3', 'S5'], b: ['S4', 'JK'], c: ['S9'] }, { revolution: true });
    const r = applyAction({ ...g, field: null }, { type: 'play', uid: 'a', cards: ['S5'] });
    expect(canPlay(r.game, ['S4', 'JK'], { type: 'play', uid: 'b', cards: ['S4'] }).ok).toBe(true);
    expect(canPlay(r.game, ['S4', 'JK'], { type: 'play', uid: 'b', cards: ['JK'] }).ok).toBe(true);
  });
  it('ジョーカー込み4枚、5枚階段も革命になる', () => {
    const h1 = { a: ['S9', 'H9', 'D9', 'JK', 'S3'], b: ['S4'], c: ['S5'] };
    expect(play(mk(h1), h1, 'a', ['S9', 'H9', 'D9', 'JK']).game.revolution).toBe(true);
    const h2 = { a: ['S3', 'S4', 'S5', 'S6', 'S7', 'H3'], b: ['S4'], c: ['S5'] };
    expect(play(mk(h2), h2, 'a', ['S3', 'S4', 'S5', 'S6', 'S7']).game.revolution).toBe(true);
    const h3 = { a: ['S3', 'S4', 'S5', 'S6', 'H3'], b: ['S4'], c: ['S5'] };
    expect(play(mk(h3), h3, 'a', ['S3', 'S4', 'S5', 'S6']).game.revolution).toBe(false);
  });
  it('革命OFFなら起きない', () => {
    const h = { a: ['S7', 'H7', 'D7', 'C7', 'S3'], b: ['S4'], c: ['S5'] };
    const r = play(mk(h, { options: { revolution: false } }), h, 'a', ['S7', 'H7', 'D7', 'C7']);
    expect(r.game.revolution).toBe(false);
  });
  it('8切り：場が流れ、出した人が続ける。ジョーカー代用の8も対象', () => {
    const h = { a: ['S8', 'S9'], b: ['S4'], c: ['S5'] };
    const r = play(mk(h), h, 'a', ['S8']);
    expect(r.game.field).toBeNull();
    expect(r.turnUid).toBe('a');
    expect(r.log.effects).toContain('eight-cut');
    const h2 = { a: ['S5', 'JK', 'S9'], b: ['S4'], c: ['S5'] };
    const pairWith8 = play(mk(h2), h2, 'a', ['S5', 'JK'], { jokerAs: ['H8'] });
    expect(pairWith8.game.field).not.toBeNull(); // 5のペア扱い。8切りにならない
    const h3 = { a: ['S8', 'JK', 'S9'], b: ['S4'], c: ['S5'] };
    expect(play(mk(h3), h3, 'a', ['S8', 'JK']).turnUid).toBe('a');
    const h4 = { a: ['S8', 'S9'], b: ['S4'], c: ['S5'] };
    const off = play(mk(h4, { options: { eightCut: false } }), h4, 'a', ['S8']);
    expect(off.game.field).not.toBeNull();
  });
  it('階段：同スート3枚以上、次は同じ枚数でより強い階段', () => {
    const h = { a: ['S4', 'S5', 'S6', 'H9'], b: ['H5', 'H6', 'H7', 'D3', 'S7', 'S8', 'S9'], c: ['C3'] };
    let r = play(mk(h), h, 'a', ['S4', 'S5', 'S6']);
    expect(reason(r.game, h, 'b', ['S7', 'S8', 'S9', 'D3'])).toBe('invalid-combo');
    expect(reason(r.game, h, 'b', ['S7', 'S8'])).toBe('invalid-combo');
    r = play(r.game, h, 'b', ['H5', 'H6', 'H7']);
    expect(r.game.field.rank).toBe(5);
  });
  it('階段：ジョーカーは穴埋め、OFFなら出せない', () => {
    const h = { a: ['S4', 'S6', 'JK'], b: ['H9'], c: ['C9'] };
    const r = play(mk(h), h, 'a', ['S4', 'S6', 'JK']);
    expect(r.game.field.ranks).toEqual([4, 5, 6]);
    const off = mk({ a: ['S4', 'S5', 'S6'], b: ['H9'], c: ['C9'] }, { options: { sequence: false } });
    expect(canPlay(off, ['S4', 'S5', 'S6'], { type: 'play', uid: 'a', cards: ['S4', 'S5', 'S6'] }).reason).toBe('sequence-disabled');
  });
  it('ペアのジョーカーは代用カードになる', () => {
    const h = { a: ['S5', 'JK'], b: ['S6', 'H6'], c: ['S7', 'H7'] };
    const r = play(mk(h), h, 'a', ['S5', 'JK']);
    expect(r.game.field.rank).toBe(5);
    expect(canPlay(r.game, h.b, { type: 'play', uid: 'b', cards: ['S6', 'H6'] }).ok).toBe(true);
  });
  it('スペ3返し：ジョーカー1枚に対してスペードの3だけが勝て、場が流れる', () => {
    const h = { a: ['JK', 'S9'], b: ['S3', 'H3'], c: ['S4'] };
    const r = play(mk(h), h, 'a', ['JK']);
    expect(reason(r.game, h, 'b', ['H3'])).toBe('too-weak');
    const r2 = play(r.game, h, 'b', ['S3']);
    expect(r2.game.field).toBeNull();
    expect(r2.turnUid).toBe('b');
    const off = play(mk({ a: ['JK', 'S9'], b: ['S3'], c: ['S4'] }, { options: { spade3: false } }), { a: ['JK', 'S9'], b: ['S3'], c: ['S4'] }, 'a', ['JK']);
    expect(canPlay(off.game, ['S3'], { type: 'play', uid: 'b', cards: ['S3'] }).reason).toBe('too-weak');
  });
  it('しばり：同じスートが続いたら、場が流れるまでそのスートのみ', () => {
    const h = { a: ['S4', 'H9'], b: ['S6', 'H7', 'SK'], c: ['S9', 'HK', 'JK'] };
    const o = { options: { lock: true } };
    let r = play(mk(h, o), h, 'a', ['S4']);
    r = play(r.game, h, 'b', ['S6']);
    expect(r.game.lock).toEqual(['S']);
    expect(reason(r.game, h, 'c', ['HK'])).toBe('locked');
    expect(canPlay(r.game, h.c, { type: 'play', uid: 'c', cards: ['S9'] }).ok).toBe(true);
    expect(canPlay(r.game, h.c, { type: 'play', uid: 'c', cards: ['JK'] }).ok).toBe(true);
    // 違うスートが続いてもしばりは起きない
    const h2 = { a: ['S4', 'H9'], b: ['H6'], c: ['S9'] };
    expect(play(mk(h2, o), h2, 'a', ['S4']).game.lock).toBeNull();
  });
});

describe('上がりと結果', () => {
  it('上がった順に順位が決まり、残り1人で終了する', () => {
    const h = { a: ['S5'], b: ['S9'], c: ['S3', 'S4'] };
    let r = play(mk(h), h, 'a', ['S5']);
    expect(r.game.finished).toEqual(['a']);
    expect(r.game.fouls).toEqual([]);
    expect(r.turnUid).toBe('b');
    r = play(r.game, h, 'b', ['S9']);
    expect(r.game.ended).toBe(true);
    expect(r.turnUid).toBeNull();
    const res = getResult(r.game);
    expect(res.ranking).toEqual(['a', 'b', 'c']);
    expect(res.titles).toEqual({ a: '大富豪', b: '平民', c: '大貧民' });
    expect(res.points).toEqual({ a: 2, b: 1, c: 0 });
    expect(getResult(mk(h)).finished).toBe(false);
  });
  it('最後に出した人が上がっていたら、場が流れた後は次の席の人から', () => {
    const h = { a: ['S5'], b: ['S9', 'S4'], c: ['S3', 'S6'] };
    let r = play(mk(h), h, 'a', ['S5']);
    r = applyAction(r.game, { type: 'pass', uid: 'b' });
    r = applyAction(r.game, { type: 'pass', uid: 'c' });
    expect(r.game.field).toBeNull();
    expect(r.turnUid).toBe('b');
  });
  it('反則上がり：ジョーカー・2・8（8切りON）で上がると最下位', () => {
    const h = { a: ['H2'], b: ['S9'], c: ['S3', 'S4'] };
    let r = play(mk(h), h, 'a', ['H2']);
    expect(r.game.fouls).toEqual(['a']);
    r = applyAction(r.game, { type: 'pass', uid: 'b' });
    r = applyAction(r.game, { type: 'pass', uid: 'c' });
    r = play(r.game, h, 'b', ['S9']);
    expect(getResult(r.game).ranking).toEqual(['b', 'c', 'a']);
    // 革命中は3が反則、2は反則でない
    const h3 = { a: ['H2'], b: ['S9'], c: ['S4', 'S5'] };
    expect(play(mk(h3, { revolution: true }), h3, 'a', ['H2']).game.fouls).toEqual([]);
    const h4 = { a: ['S3'], b: ['S9'], c: ['S4', 'S5'] };
    expect(play(mk(h4, { revolution: true }), h4, 'a', ['S3']).game.fouls).toEqual(['a']);
    // 8切りOFFなら8は反則でない
    const h5 = { a: ['S8'], b: ['S9'], c: ['S4', 'S5'] };
    expect(play(mk(h5, { options: { eightCut: false } }), { ...h5 }, 'a', ['S8']).game.fouls).toEqual([]);
    const h6 = { a: ['S8'], b: ['S9'], c: ['S4', 'S5'] };
    expect(play(mk(h6), h6, 'a', ['S8']).game.fouls).toEqual(['a']);
    const h7 = { a: ['JK'], b: ['S9'], c: ['S4', 'S5'] };
    expect(play(mk(h7), h7, 'a', ['JK']).game.fouls).toEqual(['a']);
  });
  it('都落ち：前回の大富豪が1位で上がれなかったら、その時点で最下位', () => {
    const mkH = () => ({ a: ['S4', 'S5'], b: ['S9'], c: ['S3', 'S6'] });
    const h = mkH();
    const g = mk(h, { options: { miyakoochi: true }, prevDaifugo: 'a', turnUid: 'b' });
    const r = play(g, h, 'b', ['S9']);
    expect(r.game.fallen).toEqual(['a']);
    expect(r.game.ended).toBe(true);
    expect(getResult(r.game).ranking).toEqual(['b', 'c', 'a']);
    const h2 = mkH();
    const off = play(mk(h2, { prevDaifugo: 'a', turnUid: 'b' }), h2, 'b', ['S9']);
    expect(off.game.fallen).toEqual([]);
    // 大富豪自身が1位なら落ちない
    const h3 = { a: ['S9'], b: ['S4'], c: ['S3', 'S6'] };
    const ok = play(mk(h3, { options: { miyakoochi: true }, prevDaifugo: 'a' }), h3, 'a', ['S9']);
    expect(ok.game.fallen).toEqual([]);
  });
  it('スキップ：場があればパス、なければ次の人へ。入力は変更されない', () => {
    const h = { a: ['S3', 'S9'], b: ['S4'], c: ['S5'] };
    const g = mk(h);
    const frozen = JSON.stringify(g);
    const lead = applyAction(g, { type: 'skip', uid: 'a' });
    expect(lead.turnUid).toBe('b');
    expect(JSON.stringify(g)).toBe(frozen);
    const r = play(g, h, 'a', ['S3']);
    const sk = applyAction(r.game, { type: 'skip', uid: 'b' });
    expect(sk.game.passed.b).toBe(true);
    expect(sk.turnUid).toBe('c');
  });
  it('人数別の階級名', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    const g = { ended: true, finished: order.slice(0, 4), fouls: [], fallen: [], order, counts: {} };
    expect(Object.values(getResult(g).titles)).toEqual(['大富豪', '富豪', '平民', '貧民', '大貧民']);
  });
});

describe('場の履歴（pile）', () => {
  it('出した順に積み、場が流れたら空になる', () => {
    const hands = { a: ['S4', 'S9', 'C5'], b: ['H6', 'D7'], c: ['C10', 'D3'] };
    let g = mk(hands, { options: { eightCut: false } });
    g = play(g, hands, 'a', ['S4']).game;
    g = play(g, hands, 'b', ['H6']).game;
    g = play(g, hands, 'c', ['C10']).game;
    expect(g.pile).toEqual([
      { uid: 'a', cards: ['S4'] },
      { uid: 'b', cards: ['H6'] },
      { uid: 'c', cards: ['C10'] },
    ]);
    g = applyAction(g, { type: 'pass', uid: 'a' }).game;
    g = applyAction(g, { type: 'pass', uid: 'b' }).game;
    expect(g.field).toBeNull();
    expect(g.pile).toEqual([]);
  });
  it('pile のない古い状態からでも積める', () => {
    const hands = { a: ['S4', 'S9'], b: ['H6', 'D7'], c: ['C10', 'D3'] };
    const g = mk(hands);
    delete g.pile;
    expect(play(g, hands, 'a', ['S4']).game.pile).toEqual([{ uid: 'a', cards: ['S4'] }]);
  });
});

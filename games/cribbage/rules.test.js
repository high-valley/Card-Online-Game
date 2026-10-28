import { describe, expect, it } from 'vitest';
import { buildDeck } from '../../common/deck.js';
import { applyAction, canPlay, deal, getResult } from './rules.js';

const PLAYERS = [{ uid: 'p0', seat: 0 }, { uid: 'p1', seat: 1 }];
// randomInt を常に 0 にして p0 をディーラーにする。非ディーラーは p1。
const DEALER = 'p0';
const NON = 'p1';

/**
 * 手札を指定して配る。keep*: 残す4枚、toss*: クリブへ置く2枚、rest: 残りの山（末尾の1枚がスターター）。
 * p1（非ディーラー）が先に配られる。
 */
function setup({ keepN, tossN, keepD, tossD, rest, scores }) {
  const n = [...keepN, ...tossN];
  const d = [...keepD, ...tossD];
  const deck = [];
  for (let i = 0; i < 6; i++) deck.push(n[i], d[i]);
  deck.push(...rest);
  const dealt = deal(PLAYERS, {}, null, deck, () => 0);
  const s = { game: dealt.game, hands: dealt.hands, deck: dealt.deck };
  if (scores) s.game = { ...s.game, scores: { ...s.game.scores, ...scores } };
  return s;
}

/** 操作を1つ適用して状態を更新する（毎回、合法性とカードの保存を確かめる） */
function step(s, action) {
  const hand = s.hands[action.uid] ?? [];
  const chk = canPlay(s.game, hand, action);
  expect(chk, JSON.stringify(action)).toMatchObject({ ok: true });
  const r = applyAction(s.game, action, { hand, deck: s.deck });
  const hands = r.hand ? { ...s.hands, [action.uid]: r.hand } : s.hands;
  const deck = r.deck ?? s.deck;
  const all = [...hands.p0, ...hands.p1, ...deck, ...s.game.peg.played.p0, ...s.game.peg.played.p1];
  // 52枚の集合：手札＋クリブ込みの山札＋スターター＋出した札（スターターは公開後に山札から出る）
  const total = all.length + (r.game.starter ? 1 : 0);
  if (action.type !== 'skip') {
    const played = [...r.game.peg.played.p0, ...r.game.peg.played.p1];
    const cards = [...hands.p0, ...hands.p1, ...deck, ...played, ...(r.game.starter ? [r.game.starter] : [])];
    expect(new Set(cards).size, '重複なし').toBe(cards.length);
    expect(cards.length, '52枚').toBe(52);
  }
  void total;
  return { game: r.game, hands, deck, log: r.log };
}

const discardBoth = (s, tossN, tossD) => {
  let t = step(s, { type: 'discard', uid: NON, cards: tossN });
  t = step(t, { type: 'discard', uid: DEALER, cards: tossD });
  return t;
};

const FILL = ['SA', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'SJ', 'SQ', 'SK', 'HA', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'HJ', 'HQ', 'HK', 'DA', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'DJ', 'DQ', 'DK', 'CA', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'CJ', 'CQ', 'CK'];

/** 指定したカード以外の山を作る（末尾がスターター） */
const restWith = (used, starter) => [...FILL.filter((c) => !used.includes(c) && c !== starter), starter];

/** 標準の局面：ペギングまで進める。keepN/keepD は4枚、tossN/tossD は2枚 */
function pegging({ keepN, keepD, starter = 'CK', tossN = ['C2', 'C3'], tossD = ['D2', 'D3'], scores }) {
  const used = [...keepN, ...tossN, ...keepD, ...tossD];
  const s = setup({ keepN, tossN, keepD, tossD, rest: restWith(used, starter), scores });
  return discardBoth(s, tossN, tossD);
}

describe('配布', () => {
  it('52枚が重複なく、各6枚ずつ配られ、残り40枚が山札', () => {
    const d = deal(PLAYERS, {});
    expect(d.hands.p0).toHaveLength(6);
    expect(d.hands.p1).toHaveLength(6);
    expect(d.deck).toHaveLength(40);
    expect(new Set([...d.hands.p0, ...d.hands.p1, ...d.deck]).size).toBe(52);
    expect(d.game.phase).toBe('DISCARD_TO_CRIB');
    expect(d.turnUid).not.toBe(d.game.dealer);
  });
  it('2ラウンド目以降はディーラーが交代し、得点を引き継ぐ。マッチ終了後は新しいマッチ', () => {
    const d = deal(PLAYERS, {}, null, buildDeck(), () => 0);
    const prev = { finished: true, matchOver: false, redeal: false, dealer: d.game.dealer, round: 1, scores: { p0: 30, p1: 40 } };
    const next = deal(PLAYERS, {}, prev, buildDeck());
    expect(next.game.dealer).not.toBe(d.game.dealer);
    expect(next.game.round).toBe(2);
    expect(next.game.scores).toEqual({ p0: 30, p1: 40 });
    const fresh = deal(PLAYERS, {}, { ...prev, matchOver: true }, buildDeck());
    expect(fresh.game.scores).toEqual({ p0: 0, p1: 0 });
    expect(fresh.game.round).toBe(1);
  });
});

describe('クリブ選択', () => {
  const base = () => setup({ keepN: ['S2', 'S3', 'S4', 'S5'], tossN: ['C7', 'C8'], keepD: ['H2', 'H3', 'H4', 'H6'], tossD: ['D7', 'D8'], rest: restWith(['S2', 'S3', 'S4', 'S5', 'C7', 'C8', 'H2', 'H3', 'H4', 'H6', 'D7', 'D8'], 'CK') });

  it('非ディーラー → ディーラーの順に2枚ずつ置き、4枚になるとスターターが公開される', () => {
    const s = base();
    expect(canPlay(s.game, s.hands.p0, { type: 'discard', uid: DEALER, cards: ['D7', 'D8'] })).toMatchObject({ ok: false, reason: 'not-your-turn' });
    const a = step(s, { type: 'discard', uid: NON, cards: ['C7', 'C8'] });
    expect(a.game.cribCount).toBe(2);
    expect(a.game.starter).toBeNull();
    expect(a.game.turnUid).toBe(DEALER);
    const b = step(a, { type: 'discard', uid: DEALER, cards: ['D7', 'D8'] });
    expect(b.game.cribCount).toBe(4);
    expect(b.game.starter).toBe('CK');
    expect(b.game.phase).toBe('PEGGING');
    expect(b.game.turnUid).toBe(NON);
    expect(b.hands.p0).toHaveLength(4);
    expect(b.hands.p1).toHaveLength(4);
    expect(b.deck.slice(0, 4).sort()).toEqual(['C7', 'C8', 'D7', 'D8']); // クリブは山札欄の先頭4枚
    expect(b.game.deckCount).toBe(b.deck.length - 4);
  });
  it('2枚以外・手札にない札・同じ札2回は置けない', () => {
    const s = base();
    expect(canPlay(s.game, s.hands.p1, { type: 'discard', uid: NON, cards: ['C7'] })).toMatchObject({ ok: false });
    expect(canPlay(s.game, s.hands.p1, { type: 'discard', uid: NON, cards: ['C7', 'C7'] })).toMatchObject({ ok: false });
    expect(canPlay(s.game, s.hands.p1, { type: 'discard', uid: NON, cards: ['C7', 'D7'] })).toMatchObject({ ok: false, reason: 'not-in-hand' });
  });
  it('スターターがJなら、ディーラーに即座に2点（His Heels）', () => {
    const t = pegging({ keepN: ['S2', 'S3', 'S4', 'S5'], keepD: ['H2', 'H3', 'H4', 'H6'], starter: 'HJ' });
    expect(t.game.scores).toEqual({ p0: 2, p1: 0 });
    expect(t.game.scoreEvents[0]).toMatchObject({ type: 'heels', playerId: DEALER, points: 2, previousScore: 0, newScore: 2 });
  });
  it('His Heels の2点だけで121点に届いたら、その瞬間にゲーム終了', () => {
    const t = pegging({ keepN: ['S2', 'S3', 'S4', 'S5'], keepD: ['H2', 'H3', 'H4', 'H6'], starter: 'HJ', scores: { p0: 119 } });
    expect(t.game.ended).toBe(true);
    expect(t.game.phase).toBe('GAME_END');
    expect(getResult(t.game)).toMatchObject({ finished: true, matchOver: true, matchWinner: DEALER });
    expect(canPlay(t.game, t.hands.p1, { type: 'play', uid: NON, card: 'S2' })).toMatchObject({ ok: false, reason: 'ended' });
  });
});

describe('ペギング', () => {
  const play = (t, uid, card) => step(t, { type: 'play', uid, card });

  it('合計15で2点、31で2点', () => {
    let t = pegging({ keepN: ['S7', 'SK', 'SQ', 'S4'], keepD: ['H8', 'HK', 'H5', 'H6'] });
    t = play(t, NON, 'S7');
    t = play(t, DEALER, 'H8'); // 15
    expect(t.game.scores.p0).toBe(2);
    expect(t.game.peg.count).toBe(15);
    t = play(t, NON, 'SK'); // 25
    t = play(t, DEALER, 'H6'); // 31
    expect(t.game.scores.p0).toBe(4);
    expect(t.game.peg.count).toBe(0);
    expect(t.game.peg.seq).toEqual([]);
  });
  it('31を超えるカードは出せない', () => {
    let t = pegging({ keepN: ['SK', 'SQ', 'S4', 'S2'], keepD: ['HK', 'HJ', 'H5', 'H6'] });
    t = play(t, NON, 'SK');
    t = play(t, DEALER, 'HK');
    t = play(t, NON, 'SQ'); // 30
    expect(canPlay(t.game, t.hands.p0, { type: 'play', uid: DEALER, card: 'HJ' })).toMatchObject({ ok: false, reason: 'over-31' });
    expect(canPlay(t.game, t.hands.p0, { type: 'go', uid: DEALER })).toMatchObject({ ok: true }); // 出せる札がないのでGo
    const u = pegging({ keepN: ['SK', 'SQ', 'S4', 'S2'], keepD: ['HK', 'HJ', 'H5', 'H6'] });
    expect(canPlay(u.game, u.hands.p1, { type: 'go', uid: NON })).toMatchObject({ ok: false, reason: 'must-play' });
  });
  it('同じランクのペア・3枚・4枚（2点・6点・12点）', () => {
    let t = pegging({ keepN: ['S7', 'D7', 'S2', 'S3'], keepD: ['H7', 'C7', 'H2', 'H3'], starter: 'CK', tossN: ['C2', 'C3'], tossD: ['D2', 'D3'] });
    t = play(t, NON, 'S7');
    t = play(t, DEALER, 'H7');
    expect(t.game.scores.p0).toBe(2);
    t = play(t, NON, 'D7'); // 21 の3枚（ペア6）
    expect(t.game.scores.p1).toBe(6);
    t = play(t, DEALER, 'C7'); // 28 の4枚（12点）
    expect(t.game.scores.p0).toBe(14);
  });
  it('ラン：7→9→8 で3点、そのあと6を出すと4点', () => {
    let t = pegging({ keepN: ['S7', 'S8', 'SA', 'S2'], keepD: ['H9', 'H6', 'HA', 'H2'], tossN: ['C3', 'C4'], tossD: ['D3', 'D4'], starter: 'CK' });
    t = play(t, NON, 'S7');
    t = play(t, DEALER, 'H9');
    t = play(t, NON, 'S8'); // 7,9,8
    expect(t.game.scores.p1).toBe(3);
    t = play(t, DEALER, 'H6'); // 7,9,8,6
    expect(t.game.scores.p0).toBe(4);
  });
  it('Go：相手が続けて出し、両者出せなければ最後に出した側が1点。区間は相手の先手で再開', () => {
    let t = pegging({ keepN: ['SK', 'SQ', 'S2', 'S3'], keepD: ['HK', 'HJ', 'H4', 'H6'], starter: 'CA' });
    t = play(t, NON, 'SK'); // 10
    t = play(t, DEALER, 'HK'); // 20
    t = play(t, NON, 'SQ'); // 30
    expect(t.game.turnUid).toBe(DEALER);
    t = step(t, { type: 'go', uid: DEALER });
    // 非ディーラーは 30 に何も足せない（S2・S3）… 2を足すと 32 で出せない。Goを宣言
    expect(t.game.turnUid).toBe(NON);
    t = step(t, { type: 'go', uid: NON });
    expect(t.game.scores.p1).toBe(1); // 最後に出した NON が1点
    expect(t.game.peg.count).toBe(0);
    expect(t.game.turnUid).toBe(DEALER); // 最後に出した人の相手から再開
  });
  it('Goを宣言した側も、新しい区間では残りのカードを出せる', () => {
    let t = pegging({ keepN: ['SK', 'SQ', 'S2', 'S3'], keepD: ['HK', 'HJ', 'H4', 'H6'], starter: 'CA' });
    t = play(t, NON, 'SK');
    t = play(t, DEALER, 'HK');
    t = play(t, NON, 'SQ');
    t = step(t, { type: 'go', uid: DEALER });
    t = step(t, { type: 'go', uid: NON });
    t = play(t, DEALER, 'HJ');
    expect(t.game.peg.count).toBe(10);
    expect(t.game.peg.played.p0).toEqual(['HK', 'HJ']);
  });
  it('最後のカードを31未満で出すと1点（Goの1点とは別の区間）', () => {
    let t = pegging({ keepN: ['SK', 'SQ', 'SJ', 'S10'], keepD: ['H9', 'H8', 'H7', 'H6'], starter: 'CA' });
    t = play(t, NON, 'SK'); // 10
    t = play(t, DEALER, 'H9'); // 19
    t = play(t, NON, 'SQ'); // 29
    t = step(t, { type: 'go', uid: DEALER });
    t = step(t, { type: 'go', uid: NON });
    expect(t.game.scoreEvents.at(-1)).toMatchObject({ type: 'go', playerId: NON, points: 1 });
    t = play(t, DEALER, 'H8'); // 8
    t = play(t, NON, 'SJ'); // 18
    t = play(t, DEALER, 'H7'); // 25
    t = step(t, { type: 'go', uid: NON }); // S10 は 35 になる
    t = play(t, DEALER, 'H6'); // 31（2点。最後のカードの1点は加えない）
    expect(t.game.scoreEvents.at(-1)).toMatchObject({ type: 'thirty-one', playerId: DEALER, points: 2 });
    expect(t.game.peg.count).toBe(0);
    expect(t.game.turnUid).toBe(NON); // 31 を出した人の相手から再開
    const before = t.game.scoreEvents.length;
    t = play(t, NON, 'S10'); // 最後の1枚。31未満なので1点
    expect(t.game.scoreEvents.slice(before)).toMatchObject([{ type: 'last', playerId: NON, points: 1 }]);
    expect(t.game.phase).toBe('SHOW_NON_DEALER');
    expect(t.game.turnUid).toBe(NON);
  });
  it('最後の札で31に達したら2点だけ（最後のカードの1点と重複加算しない）', () => {
    let t = pegging({ keepN: ['SA', 'S2', 'S3', 'S4'], keepD: ['H5', 'H6', 'H7', 'H3'], starter: 'CK', tossN: ['C8', 'C9'], tossD: ['D8', 'D9'] });
    const order = [[NON, 'SA'], [DEALER, 'H5'], [NON, 'S2'], [DEALER, 'H6'], [NON, 'S3'], [DEALER, 'H7'], [NON, 'S4']];
    for (const [uid, card] of order) t = play(t, uid, card);
    expect(t.game.peg.count).toBe(28);
    const before = t.game.scoreEvents.length;
    t = play(t, DEALER, 'H3'); // 31
    expect(t.game.scoreEvents.slice(before)).toMatchObject([{ type: 'thirty-one', playerId: DEALER, points: 2 }]);
    expect(t.game.phase).toBe('SHOW_NON_DEALER');
  });
});

describe('手札採点（The Show）', () => {
  /** 8枚すべて出し切らせるための簡易ペギング。各自カウントに応じて出せる札を順に出す */
  function finishPegging(t) {
    let s = t;
    for (let i = 0; i < 40 && s.game.phase === 'PEGGING'; i++) {
      const uid = s.game.turnUid;
      const hand = s.hands[uid];
      const legal = hand.filter((c) => canPlay(s.game, hand, { type: 'play', uid, card: c }).ok);
      s = legal.length ? step(s, { type: 'play', uid, card: legal[0] }) : step(s, { type: 'go', uid });
    }
    return s;
  }

  it('非ディーラーの手札 → ディーラーの手札 → クリブの順に採点し、ラウンドが終わる', () => {
    let t = pegging({ keepN: ['S4', 'H5', 'D6', 'C9'], keepD: ['S3', 'H3', 'D3', 'C8'], tossN: ['SA', 'HA'], tossD: ['DA', 'CA'], starter: 'CK' });
    t = finishPegging(t);
    expect(t.game.phase).toBe('SHOW_NON_DEALER');
    expect(t.game.turnUid).toBe(NON);
    expect(canPlay(t.game, [], { type: 'show', uid: DEALER })).toMatchObject({ ok: false, reason: 'not-your-turn' });
    t = step(t, { type: 'show', uid: NON });
    expect(t.game.phase).toBe('SHOW_DEALER');
    expect(Object.keys(t.game.show)).toEqual([NON]);
    t = step(t, { type: 'show', uid: DEALER });
    expect(t.game.phase).toBe('SHOW_CRIB');
    t = step(t, { type: 'show', uid: DEALER });
    expect(t.game.show.crib.cards.sort()).toEqual(['CA', 'DA', 'HA', 'SA']);
    expect(t.game.ended).toBe(true);
    expect(t.game.phase).toBe('ROUND_END');
    const r = getResult(t.game);
    expect(r).toMatchObject({ finished: true, matchOver: false, redeal: false });
    expect(r.points.p0 + r.points.p1).toBe(t.game.scoreEvents.reduce((n, e) => n + e.points, 0));
    expect(r.scores).toEqual(t.game.scores);
  });
  it('5♠5♥5♦J♣＋スターター5♣ の手札は29点', () => {
    let t = pegging({ keepN: ['S5', 'H5', 'D5', 'CJ'], keepD: ['S3', 'H9', 'D2', 'C8'], tossN: ['SA', 'HA'], tossD: ['DA', 'CA'], starter: 'C5' });
    t = finishPegging(t);
    const before = t.game.scores[NON];
    t = step(t, { type: 'show', uid: NON });
    expect(t.game.show[NON].total).toBe(29);
    expect(t.game.scores[NON] - before).toBe(29);
  });
  it('手札採点で121点に届いたら終了し、以降の採点は行わない', () => {
    let t = pegging({ keepN: ['S5', 'H5', 'D5', 'CJ'], keepD: ['S3', 'H9', 'D2', 'C8'], tossN: ['SA', 'HA'], tossD: ['DA', 'CA'], starter: 'C5' });
    t = finishPegging(t);
    t = { ...t, game: { ...t.game, scores: { ...t.game.scores, [NON]: 119 } } };
    t = step(t, { type: 'show', uid: NON });
    expect(t.game.ended).toBe(true);
    expect(getResult(t.game)).toMatchObject({ matchOver: true, matchWinner: NON });
    expect(t.game.show.crib).toBeUndefined();
    expect(t.game.show[DEALER]).toBeUndefined();
    expect(t.game.show[NON].awarded).toBeLessThan(t.game.show[NON].total);
    expect(canPlay(t.game, [], { type: 'show', uid: DEALER })).toMatchObject({ ok: false, reason: 'ended' });
  });
  it('ディーラー・クリブの採点中の勝利', () => {
    let t = pegging({ keepN: ['S2', 'H4', 'D8', 'CQ'], keepD: ['S5', 'H5', 'D5', 'CJ'], tossN: ['SA', 'HA'], tossD: ['DA', 'CA'], starter: 'C5' });
    t = finishPegging(t);
    t = step(t, { type: 'show', uid: NON });
    t = { ...t, game: { ...t.game, scores: { ...t.game.scores, [DEALER]: 100 } } };
    t = step(t, { type: 'show', uid: DEALER });
    expect(getResult(t.game)).toMatchObject({ matchOver: true, matchWinner: DEALER });
    expect(t.game.show.crib).toBeUndefined();

    let u = pegging({ keepN: ['S2', 'H4', 'D8', 'CQ'], keepD: ['S3', 'H9', 'D2', 'C8'], tossN: ['SA', 'HA'], tossD: ['DA', 'CA'], starter: 'C5' });
    u = finishPegging(u);
    u = step(u, { type: 'show', uid: NON });
    u = step(u, { type: 'show', uid: DEALER });
    u = { ...u, game: { ...u.game, scores: { ...u.game.scores, [DEALER]: 120 } } };
    u = step(u, { type: 'show', uid: DEALER }); // クリブ A A A A ＋ 5: ペア12点
    expect(getResult(u.game)).toMatchObject({ matchOver: true, matchWinner: DEALER });
  });
});

describe('勝敗', () => {
  it('120点からペギングの1点で終了（119点から3点）', () => {
    let t = pegging({ keepN: ['S7', 'S2', 'S3', 'S4'], keepD: ['H8', 'H2', 'H3', 'H4'], scores: { p0: 119 } });
    t = step(t, { type: 'play', uid: NON, card: 'S7' });
    t = step(t, { type: 'play', uid: DEALER, card: 'H8' }); // 15 で 2点 → 121
    expect(t.game.ended).toBe(true);
    expect(getResult(t.game)).toMatchObject({ matchOver: true, matchWinner: DEALER });
    expect(t.game.scores.p0).toBe(121);
  });
  it('勝利を確定させた得点より後の加算は行わない（15で121点に届いたらペアは加算しない）', () => {
    let t = pegging({ keepN: ['S5', 'D5', 'S3', 'S4'], keepD: ['H5', 'H2', 'H3', 'H4'], starter: 'CK', scores: { p1: 119 } });
    t = step(t, { type: 'play', uid: NON, card: 'S5' });
    t = step(t, { type: 'play', uid: DEALER, card: 'H5' }); // ペア2点（p0）
    t = step(t, { type: 'play', uid: NON, card: 'D5' }); // 15（2点）と3枚ペア（6点）が同時に成立
    expect(t.game.ended).toBe(true);
    expect(t.game.scoreEvents.filter((e) => e.playerId === NON).map((e) => e.type)).toEqual(['fifteen']);
    expect(t.game.scores.p1).toBe(121);
  });
  it('skip はラウンドを引き分け（同じ親で配り直し）にする', () => {
    const t = pegging({ keepN: ['S7', 'S2', 'S3', 'S4'], keepD: ['H8', 'H2', 'H3', 'H4'] });
    const r = applyAction(t.game, { type: 'skip', uid: NON });
    expect(getResult(r.game)).toMatchObject({ finished: true, redeal: true, matchOver: false });
    const next = deal(PLAYERS, {}, getResult(r.game), buildDeck());
    expect(next.game.dealer).toBe(DEALER);
    expect(next.game.round).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { buildDeck } from '../../common/deck.js';
import { applyAction, autoAction, canPlay, deal, getResult, sortHand } from './rules.js';

const PLAYERS = [{ uid: 'a', seat: 0 }, { uid: 'b', seat: 1 }];
const first = () => 0; // 初回ディーラーは席順の先頭（a）。したがって b（非ディーラー）から始まる

/** b と a の手札（10枚ずつ）・最初の公開カード・次に山札から引くカードを指定して配る */
function setup({ b, a, upcard, top, options = {}, prev = null }) {
  const used = new Set([...b, ...a, upcard, top]);
  const rest = buildDeck().filter((c) => !used.has(c));
  const deck = [];
  b.forEach((c, i) => deck.push(c, a[i]));
  deck.push(upcard, ...rest, top); // 山札の一番上（pop される）は末尾
  const dealt = deal(PLAYERS, options, prev, deck, first);
  return { game: dealt.game, hands: dealt.hands, deck: dealt.deck };
}

/** 判定→適用→手札・山札の更新まで行う。拒否されたら例外 */
function act(s, action) {
  const ctx = { hand: s.hands[action.uid] ?? null, deck: s.deck };
  const chk = canPlay(s.game, ctx.hand ?? [], action);
  if (!chk.ok) throw new Error(chk.reason);
  const r = applyAction(s.game, action, ctx);
  return { game: r.game, hands: r.hand ? { ...s.hands, [action.uid]: r.hand } : s.hands, deck: r.deck ?? s.deck, log: r.log };
}
const reason = (s, action) => canPlay(s.game, s.hands[action.uid] ?? [], action).reason;

// 仕様書のスコア例に使う手札
const KNOCKER = ['S5', 'H5', 'D5', 'C8', 'C9', 'C10', 'S7', 'S8', 'S9', 'H4']; // デッドウッド4
const OPP17 = ['H2', 'D2', 'C2', 'D6', 'D7', 'D8', 'HJ', 'HA', 'S3', 'C3']; // デッドウッド17
const base = { upcard: 'SQ', top: 'DK' };

/** b が山札から DK を引いて discard 以外を捨て、knock / gin を宣言した状態まで進める */
function knockedState({ b = KNOCKER, a = OPP17, type = 'knock', options } = {}) {
  let s = setup({ ...base, b, a, options });
  s = act(s, { type: 'pass', uid: 'b' });
  s = act(s, { type: 'pass', uid: 'a' });
  s = act(s, { type: 'draw', uid: 'b', source: 'deck' });
  return act(s, { type: type, uid: 'b', card: 'DK' });
}

describe('配布', () => {
  it('52枚が一意で、両者10枚・公開1枚・山札31枚', () => {
    const d = deal(PLAYERS, {}, null, undefined, first);
    const all = [...d.hands.a, ...d.hands.b, ...d.game.discard, ...d.deck];
    expect(new Set(all).size).toBe(52);
    expect([d.hands.a.length, d.hands.b.length, d.game.discard.length, d.deck.length]).toEqual([10, 10, 1, 31]);
    expect(d.game.deckCount).toBe(31);
  });
  it('非ディーラーから始まり、公開情報に山札・手札は含まれない', () => {
    const d = deal(PLAYERS, {}, null, undefined, first);
    expect(d.game.dealer).toBe('a');
    expect(d.turnUid).toBe('b');
    expect(JSON.stringify(d.game)).not.toContain(d.deck[0]);
  });
  it('2人専用', () => {
    expect(() => deal([...PLAYERS, { uid: 'c', seat: 2 }], {}, null, undefined, first)).toThrow();
  });
});

describe('最初の公開カード', () => {
  it('非ディーラーが取ると通常ターンへ。取ったカードは即座に捨てられない', () => {
    let s = setup({ ...base, b: KNOCKER, a: OPP17 });
    s = act(s, { type: 'draw', uid: 'b', source: 'discard' });
    expect(s.hands.b).toHaveLength(11);
    expect(s.game.phase).toBe('WAITING_FOR_DISCARD');
    expect(reason(s, { type: 'discard', uid: 'b', card: 'SQ' })).toBe('same-card');
    s = act(s, { type: 'discard', uid: 'b', card: 'H4' });
    expect(s.hands.b).toHaveLength(10);
    expect(s.game.turnUid).toBe('a');
  });
  it('パスするとディーラーに選択権が移り、捨てずに済む', () => {
    let s = setup({ ...base, b: KNOCKER, a: OPP17 });
    s = act(s, { type: 'pass', uid: 'b' });
    expect(s.game.turnUid).toBe('a');
    expect(s.game.phase).toBe('INITIAL_OFFER');
    expect(s.game.discard).toEqual(['SQ']);
    s = act(s, { type: 'draw', uid: 'a', source: 'discard' });
    expect(s.hands.a).toContain('SQ');
  });
  it('両者パスなら、非ディーラーが山札から引いて通常進行', () => {
    let s = setup({ ...base, b: KNOCKER, a: OPP17 });
    s = act(s, { type: 'pass', uid: 'b' });
    s = act(s, { type: 'pass', uid: 'a' });
    expect(s.game.turnUid).toBe('b');
    expect(s.game.phase).toBe('WAITING_FOR_DRAW');
    expect(reason(s, { type: 'draw', uid: 'b', source: 'discard' })).toBe('must-draw-deck');
    s = act(s, { type: 'draw', uid: 'b', source: 'deck' });
    expect(s.hands.b).toContain('DK');
    expect(s.game.deckCount).toBe(30);
    expect(s.game.lastDraw).toEqual({ uid: 'b', source: 'deck', card: null }); // 山札から引いたカードは非公開
  });
});

describe('通常のターン', () => {
  it('山札から引いて捨てると、相手のターンになる。捨て札は公開される', () => {
    let s = setup({ ...base, b: KNOCKER, a: OPP17 });
    s = act(s, { type: 'pass', uid: 'b' });
    s = act(s, { type: 'pass', uid: 'a' });
    s = act(s, { type: 'draw', uid: 'b', source: 'deck' });
    s = act(s, { type: 'discard', uid: 'b', card: 'DK' });
    expect(s.game.discard.at(-1)).toBe('DK');
    expect(s.game.turnUid).toBe('a');
    expect(s.game.phase).toBe('WAITING_FOR_DRAW');
    // 相手は公開された捨て札を取れる（取得は相手にも見える）
    const t = act(s, { type: 'draw', uid: 'a', source: 'discard' });
    expect(t.hands.a).toContain('DK');
    expect(t.log.cards).toEqual(['DK']);
    expect(t.game.discard.at(-1)).toBe('SQ');
  });
  it('山札から引いたカードはログに残らない', () => {
    let s = setup({ ...base, b: KNOCKER, a: OPP17 });
    s = act(s, { type: 'pass', uid: 'b' });
    s = act(s, { type: 'pass', uid: 'a' });
    s = act(s, { type: 'draw', uid: 'b', source: 'deck' });
    expect(s.log.cards).toEqual([]);
    expect(JSON.stringify(s.game)).not.toContain('DK');
  });
  it('不正な操作は拒否される', () => {
    let s = setup({ ...base, b: KNOCKER, a: OPP17 });
    expect(reason(s, { type: 'draw', uid: 'a', source: 'discard' })).toBe('not-your-turn');
    expect(reason(s, { type: 'draw', uid: 'b', source: 'deck' })).toBe('wrong-phase'); // 最初は公開カードの取得かパス
    s = act(s, { type: 'draw', uid: 'b', source: 'discard' });
    expect(reason(s, { type: 'draw', uid: 'b', source: 'deck' })).toBe('wrong-phase');
    expect(reason(s, { type: 'pass', uid: 'b' })).toBe('wrong-phase');
    expect(reason(s, { type: 'discard', uid: 'b', card: 'HK' })).toBe('not-in-hand');
  });
  it('手札が11枚になる前の廃棄はできない', () => {
    let s = setup({ ...base, b: KNOCKER, a: OPP17 });
    s = act(s, { type: 'pass', uid: 'b' });
    s = act(s, { type: 'pass', uid: 'a' });
    expect(reason(s, { type: 'discard', uid: 'b', card: 'H4' })).toBe('wrong-phase');
  });
  it('入力の状態は変更されない', () => {
    const s = setup({ ...base, b: KNOCKER, a: OPP17 });
    const frozen = JSON.stringify(s.game);
    applyAction(s.game, { type: 'pass', uid: 'b' });
    expect(JSON.stringify(s.game)).toBe(frozen);
  });
});

describe('ノックの条件', () => {
  const drawn = (b, extra = 'DK') => {
    let s = setup({ ...base, b, a: OPP17 });
    s = act(s, { type: 'pass', uid: 'b' });
    s = act(s, { type: 'pass', uid: 'a' });
    return act(s, { type: 'draw', uid: 'b', source: 'deck' });
  };
  it('デッドウッド11点以上ではノックできない', () => {
    // 役が1つもない手札（デッドウッド 10 を超える）
    const s = drawn(['SA', 'H3', 'D5', 'C7', 'S9', 'HJ', 'DQ', 'C2', 'S4', 'H8']);
    expect(reason(s, { type: 'knock', uid: 'b', card: 'DK' })).toBe('deadwood-too-high');
  });
  it('10点以下ならノックできる', () => {
    const s = drawn(KNOCKER);
    expect(canPlay(s.game, s.hands.b, { type: 'knock', uid: 'b', card: 'DK' }).ok).toBe(true);
  });
  it('デッドウッドが1点以上ではジンできない', () => {
    const s = drawn(KNOCKER);
    expect(reason(s, { type: 'gin', uid: 'b', card: 'DK' })).toBe('not-gin');
  });
});

describe('得点（ノック・ジン・アンダーカット）', () => {
  it('ノック：4対17 → 13点', () => {
    let s = knockedState();
    expect(s.game.phase).toBe('SHOWDOWN');
    expect(s.game.turnUid).toBe('a');
    expect(s.game.knock.dw).toBe(4);
    expect(autoAction(s.game, 'a')).toEqual({ type: 'showdown', uid: 'a' });
    expect(autoAction(s.game, 'b')).toBeNull();
    s = act(s, { type: 'showdown', uid: 'a' });
    const r = getResult(s.game);
    expect(r).toMatchObject({ finished: true, reason: 'knock', ranking: ['b', 'a'], points: { b: 13, a: 0 }, scores: { b: 13, a: 0 } });
    expect(r.detail.a.dw).toBe(17);
    expect(r.detail.b.dw).toBe(4);
  });
  it('ジン：0対24 → 49点。レイオフはできない', () => {
    const gin = ['S5', 'H5', 'D5', 'C5', 'C8', 'C9', 'C10', 'S7', 'S8', 'S9'];
    const opp24 = ['H2', 'D2', 'C2', 'D6', 'D7', 'D8', 'HJ', 'HQ', 'S3', 'HA'];
    let s = knockedState({ b: gin, a: opp24, type: 'gin' });
    s = act(s, { type: 'showdown', uid: 'a' });
    const r = getResult(s.game);
    expect(r).toMatchObject({ reason: 'gin', points: { b: 49, a: 0 } });
    expect(r.detail.a.layoffs).toEqual([]);
  });
  it('ジンに対してはアンダーカットが起きない（相手が0点でもジン側の勝ち）', () => {
    const gin = ['S5', 'H5', 'D5', 'C5', 'C8', 'C9', 'C10', 'S7', 'S8', 'S9'];
    const opp0 = ['H2', 'D2', 'C2', 'D6', 'D7', 'D8', 'D9', 'HJ', 'HQ', 'HK'];
    let s = knockedState({ b: gin, a: opp0, type: 'gin' });
    s = act(s, { type: 'showdown', uid: 'a' });
    expect(getResult(s.game)).toMatchObject({ reason: 'gin', ranking: ['b', 'a'], points: { b: 25, a: 0 } });
  });
  it('アンダーカット：8対5 → 相手に28点', () => {
    const knocker8 = ['S5', 'H5', 'D5', 'C8', 'C9', 'C10', 'S7', 'S8', 'S9', 'H8'];
    const opp5 = ['H2', 'D2', 'C2', 'D6', 'D7', 'D8', 'D9', 'HA', 'SA', 'S3'];
    let s = knockedState({ b: knocker8, a: opp5 });
    expect(s.game.knock.dw).toBe(8);
    s = act(s, { type: 'showdown', uid: 'a' });
    expect(getResult(s.game)).toMatchObject({ reason: 'undercut', ranking: ['a', 'b'], points: { a: 28, b: 0 }, scores: { a: 28, b: 0 } });
  });
  it('同点でもアンダーカット：相手に25点', () => {
    const knocker8 = ['S5', 'H5', 'D5', 'C8', 'C9', 'C10', 'S7', 'S8', 'S9', 'H8'];
    const opp8 = ['H2', 'D2', 'C2', 'D6', 'D7', 'D8', 'D9', 'HA', 'SA', 'C6'];
    let s = knockedState({ b: knocker8, a: opp8 });
    s = act(s, { type: 'showdown', uid: 'a' });
    expect(getResult(s.game)).toMatchObject({ reason: 'undercut', points: { a: 25, b: 0 } });
  });
  it('ジン・アンダーカットのボーナスは設定で変えられる', () => {
    const gin = ['S5', 'H5', 'D5', 'C5', 'C8', 'C9', 'C10', 'S7', 'S8', 'S9'];
    let s = knockedState({ b: gin, a: OPP17, type: 'gin', options: { ginBonus: 20 } });
    s = act(s, { type: 'showdown', uid: 'a' });
    expect(getResult(s.game).points.b).toBe(17 + 20);
  });
});

describe('レイオフ', () => {
  it('ノックされた側は、役にしていないカードをノック側の役に付けられる', () => {
    // 相手の S6 は S7S8S9 に、C7 は C8C9C10 に付けられる（付けた分だけデッドウッドが減る）
    const opp = ['H2', 'D2', 'C2', 'D6', 'D7', 'D8', 'S6', 'C7', 'HJ', 'HA'];
    let s = knockedState({ a: opp });
    s = act(s, { type: 'showdown', uid: 'a' });
    const r = getResult(s.game);
    expect(r.detail.a.layoffs.map((l) => l.card).sort()).toEqual(['C7', 'S6']);
    expect(r.detail.a.dw).toBe(10 + 1); // HJ + HA
    expect(r.points.b).toBe(11 - 4);
  });
  it('レイオフで逆転できる（アンダーカットになる）', () => {
    const opp = ['H2', 'D2', 'C2', 'D6', 'D7', 'D8', 'S6', 'C7', 'C5', 'HA'];
    // 付けられるのは S6・C7・C5(5のセットの4枚目)。残りは HA の1点
    let s = knockedState({ a: opp });
    s = act(s, { type: 'showdown', uid: 'a' });
    const r = getResult(s.game);
    expect(r.detail.a.dw).toBe(1);
    expect(r).toMatchObject({ reason: 'undercut', points: { a: 4 - 1 + 25 } });
  });
});

describe('ラウンドの進行', () => {
  it('山札が残り2枚になって誰も終わらせなければ引き分け（得点なし）', () => {
    let s = setup({ ...base, b: KNOCKER, a: OPP17 });
    s = act(s, { type: 'pass', uid: 'b' });
    s = act(s, { type: 'pass', uid: 'a' });
    s = { ...s, game: { ...s.game, deckCount: 3 }, deck: s.deck.slice(-3) };
    s = act(s, { type: 'draw', uid: 'b', source: 'deck' });
    s = act(s, { type: 'discard', uid: 'b', card: 'DK' });
    const r = getResult(s.game);
    expect(s.game.deckCount).toBe(2);
    expect(r).toMatchObject({ finished: true, reason: 'exhausted', redeal: true, points: { a: 0, b: 0 }, scores: { a: 0, b: 0 } });
  });
  it('引き分けの次は、同じディーラー・同じラウンド番号で配り直す。得点は維持', () => {
    const prev = { finished: true, reason: 'exhausted', redeal: true, dealer: 'a', round: 3, scores: { a: 40, b: 10 }, matchOver: false };
    const d = deal(PLAYERS, {}, prev, undefined, first);
    expect(d.game).toMatchObject({ dealer: 'a', round: 3, scores: { a: 40, b: 10 } });
  });
  it('通常の次ラウンドはディーラーが交代し、得点を引き継ぐ', () => {
    const prev = { finished: true, reason: 'knock', redeal: false, dealer: 'a', round: 2, scores: { a: 40, b: 10 }, matchOver: false };
    const d = deal(PLAYERS, {}, prev, undefined, first);
    expect(d.game).toMatchObject({ dealer: 'b', round: 3, scores: { a: 40, b: 10 } });
    expect(d.turnUid).toBe('a');
  });
  it('累積100点以上でマッチ終了。次は得点0の新しいマッチ', () => {
    let s = knockedState();
    s = { ...s, game: { ...s.game, scores: { a: 0, b: 90 } } };
    s = act(s, { type: 'showdown', uid: 'a' });
    const r = getResult(s.game);
    expect(r).toMatchObject({ scores: { b: 103, a: 0 }, matchOver: true, matchWinner: 'b' });
    const next = deal(PLAYERS, {}, r, undefined, first);
    expect(next.game).toMatchObject({ round: 1, scores: { a: 0, b: 0 } });
  });
  it('100点未満ならマッチは続く', () => {
    let s = knockedState();
    s = act(s, { type: 'showdown', uid: 'a' });
    expect(getResult(s.game).matchOver).toBe(false);
  });
  it('スキップ（切断）はラウンド引き分けにする', () => {
    const s = setup({ ...base, b: KNOCKER, a: OPP17 });
    const r = applyAction(s.game, { type: 'skip', uid: 'b' });
    expect(getResult(r.game)).toMatchObject({ finished: true, reason: 'abort', points: { a: 0, b: 0 } });
  });
  it('終了後は操作できない', () => {
    let s = knockedState();
    s = act(s, { type: 'showdown', uid: 'a' });
    expect(reason(s, { type: 'pass', uid: 'a' })).toBe('ended');
  });
});

describe('手札の整列', () => {
  it('成立した役を先に、デッドウッドを後ろに並べる', () => {
    const sorted = sortHand(['H4', 'S7', 'C9', 'S5', 'D5', 'S8', 'H5', 'C10', 'S9', 'C8']);
    expect(sorted.at(-1)).toBe('H4');
    expect(sorted).toHaveLength(10);
  });
});

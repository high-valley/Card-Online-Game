import { describe, expect, it } from 'vitest';
import { buildDeck } from '../../common/deck.js';
import { applyAction, autoAction, betInfo, blindsFor, buildPots, canPlay, deal, getResult } from './rules.js';

const players = (...uids) => uids.map((uid, seat) => ({ uid, seat }));
/** 先頭のカードから順に配られる山札を作る（残りは適当に埋める） */
const stack = (...first) => [...first, ...buildDeck().filter((c) => !first.includes(c))];
const prev = (chips, dealer, extra = {}) => ({ finished: true, matchOver: false, chips, out: [], dealer, handNo: 3, ...extra });

/** 卓：状態と手札・山札を持ち、操作を適用する */
function table(uids, { chips, deck, options, handNo } = {}) {
  const d = deal(players(...uids), options, chips ? prev(chips, uids.at(-1), handNo ? { handNo } : {}) : null, deck, () => 0);
  const t = { game: d.game, hands: d.hands, deck: d.deck };
  t.act = (action) => {
    const chk = canPlay(t.game, t.hands[action.uid], action);
    if (!chk.ok) throw new Error(`illegal ${JSON.stringify(action)}: ${chk.reason}`);
    const r = applyAction(t.game, action, { hand: t.hands[action.uid], deck: t.deck });
    t.game = r.game;
    if (r.deck) t.deck = r.deck;
    return r;
  };
  t.try = (action) => canPlay(t.game, t.hands[action.uid], action);
  /** ベッティングを全員チェック／コールで進める */
  t.checkDown = () => {
    while (!t.game.ended && t.game.phase !== 'SHOWDOWN') {
      const u = t.game.turnUid;
      t.act({ uid: u, type: betInfo(t.game, u).canCheck ? 'check' : 'call' });
    }
  };
  t.showAll = () => {
    while (t.game.phase === 'SHOWDOWN') t.act({ uid: t.game.turnUid, type: 'show' });
  };
  return t;
}

/** 全員のチップの合計（ハンド終了前はポットに入っている分も含む） */
const total = (g) => Object.values(g.chips).reduce((a, b) => a + b, 0) + (g.ended ? 0 : Object.values(g.total).reduce((a, b) => a + b, 0));

describe('ブラインド', () => {
  it('ハンド数でレベルが上がり、表の最後を越えたら倍々になる', () => {
    expect(blindsFor(1, 5)).toEqual({ sb: 10, bb: 20, level: 1 });
    expect(blindsFor(5, 5)).toEqual({ sb: 10, bb: 20, level: 1 });
    expect(blindsFor(6, 5)).toEqual({ sb: 15, bb: 30, level: 2 });
    expect(blindsFor(61, 5).bb).toBe(2000); // 表の最後（13レベル目）
    expect(blindsFor(66, 5).bb).toBe(4000);
    expect(blindsFor(71, 5).bb).toBe(8000);
  });
});

describe('配布', () => {
  it('3人：ボタンの左から順に2枚ずつ、ブラインドを払い、ビッグの次（ボタン）から始まる', () => {
    const t = table(['a', 'b', 'c'], { deck: stack('SA', 'SK', 'SQ', 'HA', 'HK', 'HQ') });
    expect(t.game.dealer).toBe('a');
    expect([t.game.sbUid, t.game.bbUid]).toEqual(['b', 'c']);
    expect(t.hands.b).toEqual(['SA', 'HA']);
    expect(t.hands.c).toEqual(['SK', 'HK']);
    expect(t.hands.a).toEqual(['SQ', 'HQ']);
    expect(t.game.bets).toEqual({ b: 10, c: 20 });
    expect(t.game.chips).toMatchObject({ a: 1500, b: 1490, c: 1480 });
    expect(t.game.turnUid).toBe('a');
    expect(t.game.deckCount).toBe(46);
    expect(t.deck).toHaveLength(46);
  });

  it('2人（ヘッズアップ）：ボタンがスモールで先に動き、フロップ以降はビッグが先', () => {
    const t = table(['a', 'b']);
    expect([t.game.dealer, t.game.sbUid, t.game.bbUid]).toEqual(['a', 'a', 'b']);
    expect(t.game.turnUid).toBe('a');
    t.act({ uid: 'a', type: 'call' });
    t.act({ uid: 'b', type: 'check' });
    expect(t.game.phase).toBe('FLOP');
    expect(t.game.board).toHaveLength(3);
    expect(t.game.turnUid).toBe('b');
  });

  it('ストリートごとにバーンして場を開く（3→4→5枚）', () => {
    const deck = stack('S2', 'S3', 'H2', 'H3', 'D5', 'D6', 'D7', 'D8', 'D9', 'DJ', 'DQ');
    const t = table(['a', 'b'], { deck });
    // 手札 a:S3?（左隣=b から配る）b:S2,H2 a:S3,H3 ／ 山札の先頭 D5=バーン、D6 D7 D8=フロップ、D9=バーン、DJ=ターン、DQ=バーン…
    t.checkDown();
    expect(t.game.phase).toBe('SHOWDOWN');
    expect(t.game.board).toHaveLength(5);
    expect(t.game.board.slice(0, 3)).toEqual(['D6', 'D7', 'D8']);
    expect(t.game.board[3]).toBe('DJ');
  });

  it('2回目以降はボタンが進み、チップと脱落順を引き継ぐ。0チップの人には配らない', () => {
    const d = deal(players('a', 'b', 'c'), {}, prev({ a: 0, b: 1000, c: 500 }, 'c', { out: ['a'] }), undefined, () => 0);
    expect(d.game.dealer).toBe('b');
    expect(d.game.dealt).toEqual(['b', 'c']);
    expect(d.hands.a).toEqual([]);
    expect(d.game.out).toEqual(['a']);
    expect(d.game.handNo).toBe(4);
  });

  it('トーナメントが終わった後は、新しいトーナメントとして全員のチップを戻す', () => {
    const d = deal(players('a', 'b'), { startingChips: 3000 }, prev({ a: 0, b: 3000 }, 'a', { matchOver: true }), undefined, () => 0);
    expect(d.game.chips.a + d.game.bets.a).toBe(3000);
    expect(d.game.handNo).toBe(1);
  });

  it('ビッグブラインドが払いきれずオールインでも、コールの額は満額のビッグブラインド', () => {
    const t = table(['a', 'b', 'c'], { chips: { a: 1000, b: 1000, c: 8 } });
    expect(t.game.chips.c).toBe(0);
    expect(t.game.bets.c).toBe(8);
    expect(t.game.currentBet).toBe(20);
    expect(betInfo(t.game, 'a')).toMatchObject({ toCall: 20, minTo: 40 });
    t.act({ uid: 'a', type: 'call' });
    t.act({ uid: 'b', type: 'call' });
    expect(t.game.phase).toBe('FLOP'); // c はオールインなので、残りの2人で続く
    expect(buildPots(t.game).map((p) => [p.amount, p.eligible.length, p.refund])).toEqual([[24, 3, false], [24, 2, false]]);
  });
});

describe('ベッティング', () => {
  it('手番でない人・出来ない操作は弾く', () => {
    const t = table(['a', 'b', 'c']);
    expect(t.try({ uid: 'b', type: 'call' })).toMatchObject({ ok: false, reason: 'not-your-turn' });
    expect(t.try({ uid: 'a', type: 'check' })).toMatchObject({ ok: false, reason: 'must-call' });
    expect(t.try({ uid: 'a', type: 'raise', to: 30 })).toMatchObject({ ok: false, reason: 'raise-too-small' });
    expect(t.try({ uid: 'a', type: 'raise', to: 40 }).ok).toBe(true);
    expect(t.try({ uid: 'a', type: 'raise', to: 2000 })).toMatchObject({ ok: false, reason: 'not-enough-chips' });
    expect(t.try({ uid: 'a', type: 'raise', to: 40.5 })).toMatchObject({ ok: false, reason: 'bad-amount' });
    expect(t.try({ uid: 'a', type: 'show' })).toMatchObject({ ok: false, reason: 'wrong-phase' });
  });

  it('レイズの最小幅は直前のレイズ幅。ビッグブラインドにはオプションがある', () => {
    const t = table(['a', 'b', 'c']);
    t.act({ uid: 'a', type: 'raise', to: 60 }); // 幅 40
    expect(t.game.minRaise).toBe(40);
    expect(betInfo(t.game, 'b').minTo).toBe(100);
    t.act({ uid: 'b', type: 'call' });
    t.act({ uid: 'c', type: 'call' });
    expect(t.game.phase).toBe('FLOP');
    expect(t.game.currentBet).toBe(0);
    expect(t.game.minRaise).toBe(20);
    expect(potOfGame(t.game)).toBe(180);

    const u = table(['a', 'b', 'c']);
    u.act({ uid: 'a', type: 'call' });
    u.act({ uid: 'b', type: 'call' });
    expect(u.game.phase).toBe('PREFLOP'); // ビッグがまだ（チェックかレイズを選べる）
    expect(u.game.turnUid).toBe('c');
    expect(u.try({ uid: 'c', type: 'raise', to: 60 }).ok).toBe(true);
    u.act({ uid: 'c', type: 'check' });
    expect(u.game.phase).toBe('FLOP');
  });

  it('レイズされたら、先に動いた人ももう一度動ける。降りた人は戻らない', () => {
    const t = table(['a', 'b', 'c']);
    t.act({ uid: 'a', type: 'call' });
    t.act({ uid: 'b', type: 'fold' });
    t.act({ uid: 'c', type: 'raise', to: 100 });
    expect(t.game.turnUid).toBe('a');
    t.act({ uid: 'a', type: 'call' });
    expect(t.game.phase).toBe('FLOP');
    expect(t.game.turnUid).toBe('c'); // bは降りたので、ボタンの左で動ける最初の人
  });

  it('全員が降りたら、残った1人がポットを取って終わる（手札は公開しない）', () => {
    const t = table(['a', 'b', 'c']);
    t.act({ uid: 'a', type: 'fold' });
    t.act({ uid: 'b', type: 'fold' });
    expect(t.game.ended).toBe(true);
    expect(t.game.chips).toMatchObject({ a: 1500, b: 1490, c: 1510 });
    expect(t.game.handResult).toMatchObject({ uncontested: true, awards: { c: 30 } });
    expect(Object.keys(t.game.shown)).toEqual([]);
  });

  it('スキップは、チェックできればチェック、できなければ降りる', () => {
    const t = table(['a', 'b', 'c']);
    t.act({ uid: 'a', type: 'skip' });
    expect(t.game.folded.a).toBe(true);
    t.act({ uid: 'b', type: 'call' });
    t.act({ uid: 'c', type: 'skip' });
    expect(t.game.folded.c).toBeUndefined();
    expect(t.game.phase).toBe('FLOP');
  });
});

const potOfGame = (g) => Object.values(g.total).reduce((a, b) => a + b, 0);

describe('オールインとサイドポット', () => {
  it('ショートオールインは再レイズを開かない（先に動いた人はコールか降りるだけ）', () => {
    const s = table(['a', 'b', 'c'], { chips: { a: 1000, b: 1000, c: 130 } });
    s.act({ uid: 'a', type: 'raise', to: 100 }); // 幅80
    s.act({ uid: 'b', type: 'call' });
    s.act({ uid: 'c', type: 'allin' }); // 130 → 幅30 < 80 のショートオールイン
    expect(s.game.currentBet).toBe(130);
    expect(s.game.minRaise).toBe(80);
    expect(s.game.turnUid).toBe('a');
    expect(s.try({ uid: 'a', type: 'raise', to: 300 })).toMatchObject({ ok: false, reason: 'cannot-reraise' });
    expect(s.try({ uid: 'a', type: 'allin' })).toMatchObject({ ok: false, reason: 'cannot-reraise' });
    expect(s.try({ uid: 'a', type: 'call' }).ok).toBe(true);
  });

  it('フルレイズのオールインは再レイズを開く', () => {
    const s = table(['a', 'b', 'c'], { chips: { a: 1000, b: 1000, c: 250 } });
    s.act({ uid: 'a', type: 'raise', to: 100 });
    s.act({ uid: 'b', type: 'call' });
    s.act({ uid: 'c', type: 'allin' }); // 250 → 幅150 ≥ 80
    expect(s.game.minRaise).toBe(150);
    expect(s.try({ uid: 'a', type: 'raise', to: 400 }).ok).toBe(true);
  });

  it('足りないオールインに対するサイドポット：短い人は自分の分までを取り合う', () => {
    const t = table(['a', 'b', 'c'], {
      chips: { a: 100, b: 300, c: 1000 },
      deck: stack('S7', 'SA', 'SK', 'D2', 'HA', 'HK', 'C3', 'C4', 'C5', 'H9', 'D8', 'C9', 'S9', 'DK', 'D3', 'C2'),
    });
    // ボタンは a（前のボタン c の次）なので、b=S7 D2 / c=SA HA / a=SK HK の順に配られる。
    // 場は C4 C5 H9 C9 DK：a は K のスリー＋9 のペアでフルハウス、c はエースと9のツーペア。a が 300 の本線を取り、c が 400 の側線を取る
    t.act({ uid: 'a', type: 'allin' }); // 100
    t.act({ uid: 'b', type: 'allin' }); // 300
    t.act({ uid: 'c', type: 'call' }); // 300（1000持ち）
    expect(t.game.phase).toBe('SHOWDOWN');
    expect(buildPots(t.game).map((p) => [p.amount, p.eligible])).toEqual([[300, ['a', 'b', 'c']], [400, ['b', 'c']]]);
    t.showAll();
    expect(t.game.ended).toBe(true);
    expect(t.game.handResult.pots.map((p) => p.winners)).toEqual([['a'], ['c']]);
    expect(t.game.chips).toMatchObject({ a: 300, b: 0, c: 1100 });
    const r = getResult(t.game);
    expect(r.busted).toEqual(['b']);
    expect(r.matchOver).toBe(false);
    expect(r.ranking).toEqual(['c', 'a', 'b']);
  });

  it('コールされなかったベットは持ち主に戻る（相手のチップが短いとき）', () => {
    const t = table(['a', 'b'], {
      chips: { a: 1000, b: 100 },
      deck: stack('S2', 'SA', 'H7', 'HA', 'C9', 'D3', 'D8', 'D5', 'C6', 'DK', 'H3', 'C4'),
    });
    t.act({ uid: 'a', type: 'allin' });
    t.act({ uid: 'b', type: 'call' });
    expect(buildPots(t.game).map((p) => [p.amount, p.eligible])).toEqual([[200, ['a', 'b']], [900, ['a']]]);
    t.showAll();
    expect(t.game.chips).toEqual({ a: 1100, b: 0 }); // a のエースのペアが勝ち、900 は a に戻る
  });

  it('ポットを分け合うときの端数は、ボタンの左から数えて早い勝者へ', () => {
    // 場がロイヤルフラッシュなので、残った a と c は引き分け。ポット 135 → 68 と 67
    const t = table(['a', 'b', 'c'], {
      chips: { a: 1500, b: 1500, c: 1500 },
      handNo: 5, // 15/30
      deck: stack('S2', 'S3', 'S4', 'H2', 'H3', 'H4', 'C5', 'D10', 'DJ', 'DQ', 'C6', 'DK', 'C7', 'DA'),
    });
    expect(t.game.blinds).toMatchObject({ sb: 15, bb: 30 });
    t.act({ uid: 'a', type: 'raise', to: 60 });
    t.act({ uid: 'b', type: 'fold' });
    t.act({ uid: 'c', type: 'call' });
    t.checkDown();
    t.showAll();
    expect(t.game.handResult.pots[0]).toMatchObject({ amount: 135, winners: ['c', 'a'] });
    expect(t.game.chips).toEqual({ a: 1507, b: 1485, c: 1508 });
  });
});

describe('ショーダウン', () => {
  it('強い役の人がポットを取る。公開は手番ごとで、autoAction が自動で送る', () => {
    const t = table(['a', 'b'], { deck: stack('S2', 'SA', 'H7', 'HA', 'C9', 'D3', 'D8', 'D5', 'C2', 'DK', 'H3', 'C4') });
    // b=S2 H7、a=SA HA。場: D3 D8 D5 / DK / (burn,)…
    t.checkDown();
    expect(t.game.phase).toBe('SHOWDOWN');
    const first = t.game.turnUid;
    expect(autoAction(t.game, first)).toEqual({ type: 'show', uid: first });
    expect(autoAction(t.game, first === 'a' ? 'b' : 'a')).toBeNull();
    t.act({ uid: first, type: 'show' });
    expect(t.game.shown[first]).toHaveLength(2);
    t.showAll();
    expect(t.game.handResult.uncontested).toBe(false);
    expect(t.game.chips.a).toBe(1520); // 40 のポットを取る
    expect(t.game.handResult.hands.a.name).toBe('ワンペア');
    expect(total(t.game)).toBe(3000);
  });

  it('ショーダウンで公開しない（スキップ）と権利を失う', () => {
    const t = table(['a', 'b']);
    t.checkDown();
    const first = t.game.turnUid;
    t.act({ uid: first, type: 'skip' });
    expect(t.game.ended).toBe(true);
    expect(t.game.handResult.uncontested).toBe(true);
    expect(t.game.chips[first]).toBe(1480);
  });
});

describe('サイドポットの段・返却・脱落順・非公開情報', () => {
  it('3段のサイドポットと、誰にも受けてもらえなかったベットの返却', () => {
    const t = table(['a', 'b', 'c', 'd'], { chips: { a: 100, b: 200, c: 400, d: 1000 } });
    // 全員がオールイン（100・200・400・1000）。出した額の段ごとに4つのポットができ、1000 の人の超過分は戻る
    while (t.game.phase === 'PREFLOP') t.act({ uid: t.game.turnUid, type: 'allin' });
    expect(t.game.phase).toBe('SHOWDOWN');
    const pots = buildPots(t.game);
    expect(pots.map((p) => [p.amount, p.eligible.length, p.refund])).toEqual([[400, 4, false], [300, 3, false], [400, 2, false], [600, 1, true]]);
    t.showAll();
    const r = getResult(t.game);
    expect(Object.values(t.game.chips).reduce((a, b) => a + b, 0)).toBe(1700);
    expect(r.handResult.pots.find((p) => p.refund).winners).toEqual(['d']);
    expect(r.chips.d).toBeGreaterThanOrEqual(600);
  });

  it('BB が満額に足りずオールインし、SB が降りても、SB の受けてもらえなかった分は SB に戻る（ショーダウン）', () => {
    // ブラインド 2000/4000。BB（b）は 830 しかない。c は 160 しかなくコールでオールイン。SB（a）は 4000 に満たないまま降りる
    const t = table(['c', 'a', 'b'], { chips: { c: 160, a: 12510, b: 830 }, handNo: 65, options: { levelHands: 5 } });
    expect(t.game.blinds).toMatchObject({ sb: 2000, bb: 4000 });
    expect(t.game.sbUid).toBe('a');
    t.act({ uid: 'c', type: 'call' });
    t.act({ uid: 'a', type: 'fold' });
    t.showAll();
    expect(t.game.ended).toBe(true);
    const refund = t.game.handResult.pots.find((p) => p.refund);
    expect(refund).toMatchObject({ amount: 1170, winners: ['a'] });
    expect(t.game.chips.a).toBe(12510 - 2000 + 1170);
    expect(Object.values(t.game.chips).reduce((x, y) => x + y, 0)).toBe(13500);
  });

  it('1人を残して全員が降りたときも、降りた人の受けてもらえなかった分はその人に戻る', () => {
    const t = table(['c', 'a', 'b'], { chips: { c: 5000, a: 12510, b: 830 }, handNo: 65, options: { levelHands: 5 } });
    t.act({ uid: 'c', type: 'fold' });
    t.act({ uid: 'a', type: 'fold' });
    expect(t.game.ended).toBe(true);
    expect(t.game.handResult.uncontested).toBe(true);
    expect(t.game.chips.b).toBe(830 + 830);
    expect(t.game.chips.a).toBe(12510 - 830);
    expect(Object.values(t.game.chips).reduce((x, y) => x + y, 0)).toBe(18340);
  });

  it('同じハンドで複数人が脱落したら、開始時のチップが多かった人が上位', () => {
    const t = table(['a', 'b', 'c'], {
      chips: { a: 300, b: 100, c: 1000 },
      // ボタンは a → b=S2 H2、c=SA HA、a=SK HK。場は B 低い札で c が勝つ
      deck: stack('S2', 'SA', 'SK', 'H2', 'HA', 'HK', 'C3', 'D5', 'D7', 'D9', 'C4', 'DJ', 'C6', 'S9'),
    });
    while (t.game.phase === 'PREFLOP') t.act({ uid: t.game.turnUid, type: 'allin' });
    t.showAll();
    const r = getResult(t.game);
    expect(r.busted).toEqual(['b', 'a']); // 先に脱落するのは開始時チップが少なかった b
    expect(r.ranking).toEqual(['c', 'a', 'b']);
    expect(r.titles.c).toBe('優勝');
    expect(r.matchOver).toBe(true);
  });

  it('途中のハンドの階級欄は手元のチップ、脱落者は「脱落」', () => {
    const t = table(['a', 'b', 'c'], { chips: { a: 1000, b: 1000, c: 20 } });
    t.act({ uid: 'a', type: 'fold' });
    t.act({ uid: 'b', type: 'fold' });
    const r = getResult(t.game);
    expect(r.titles.c).toMatch(/枚$/);
  });

  it('公開情報（game と log）に、公開されていない手札や山札が出ない', () => {
    const t = table(['a', 'b', 'c']);
    const secret = new Set([...Object.values(t.hands).flat(), ...t.deck]);
    const seen = [];
    while (!t.game.ended) {
      const u = t.game.turnUid;
      const r = t.act({ uid: u, type: t.game.phase === 'SHOWDOWN' ? 'show' : betInfo(t.game, u).canCheck ? 'check' : 'call' });
      seen.push(JSON.stringify([t.game, r.log]));
    }
    const board = new Set(t.game.board);
    const shown = new Set(Object.values(t.game.shown).flat());
    for (const text of seen) {
      for (const c of secret) {
        if (!text.includes(`"${c}"`)) continue;
        expect(board.has(c) || shown.has(c)).toBe(true); // 出てよいのは場と公開された手札だけ
      }
    }
    // ハンドの途中（ショーダウン前）には、手札のカードが一切含まれない
    const early = table(['a', 'b', 'c']);
    const text = JSON.stringify(early.game);
    for (const c of Object.values(early.hands).flat()) expect(text.includes(`"${c}"`)).toBe(false);
    for (const c of early.deck) expect(text.includes(`"${c}"`)).toBe(false);
  });
});

describe('結果', () => {
  it('終わるまでは未完了。ハンド終了後は順位と脱落順を返し、トーナメント中の得点は0', () => {
    const t = table(['a', 'b', 'c']);
    expect(getResult(t.game)).toEqual({ finished: false });
    t.act({ uid: 'a', type: 'fold' });
    t.act({ uid: 'b', type: 'fold' });
    const r = getResult(t.game);
    expect(r.finished).toBe(true);
    expect(r.matchOver).toBe(false);
    expect(r.ranking).toEqual(['c', 'a', 'b']);
    expect(Object.values(r.points).every((p) => p === 0)).toBe(true);
    // 引き継ぎ：次のハンドはボタンが進む
    const next = deal(players('a', 'b', 'c'), {}, r, undefined, () => 0);
    expect(next.game.handNo).toBe(2);
    expect(next.game.dealer).toBe('b');
    expect(total(next.game)).toBe(4500);
  });
});

describe('ランダムに打ち続ける（保存則・終了）', () => {
  let seed = 11;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pick = (xs) => xs[Math.floor(rng() * xs.length)];

  function playTournament(uids, options) {
    let result = null;
    const sumStart = uids.length * (options?.startingChips ?? 1500);
    for (let h = 0; h < 400; h++) {
      const d = deal(players(...uids), options, result, undefined, (n) => Math.floor(rng() * n));
      let { game, hands, deck } = d;
      const cards = () => [...Object.values(hands).flat(), ...deck, ...game.board];
      expect(new Set(cards().filter(Boolean)).size).toBeLessThanOrEqual(52);
      for (let step = 0; step < 300 && !game.ended; step++) {
        const u = game.turnUid;
        const info = betInfo(game, u);
        const options_ = [];
        if (game.phase === 'SHOWDOWN') options_.push({ type: 'show' });
        else {
          options_.push({ type: 'fold' }, { type: info.canCheck ? 'check' : 'call' });
          if (info.chips > 0) options_.push({ type: 'allin' });
          if (info.canRaise) options_.push({ type: 'raise', to: info.minTo + Math.floor(rng() * (info.maxTo - info.minTo + 1)) });
        }
        const action = { ...pick(options_), uid: u };
        const chk = canPlay(game, hands[u], action);
        expect(chk.ok, JSON.stringify(action) + chk.reason).toBe(true);
        const r = applyAction(game, action, { hand: hands[u], deck });
        game = r.game;
        if (r.deck) deck = r.deck;
        expect(Object.values(game.chips).every((c) => c >= 0)).toBe(true);
        expect(Object.values(game.chips).reduce((a, b) => a + b, 0) + (game.ended ? 0 : potOfGame(game))).toBe(sumStart);
        expect(new Set([...Object.values(hands).flat(), ...deck, ...game.board]).size).toBe(Object.values(hands).flat().length + deck.length + game.board.length);
      }
      expect(game.ended).toBe(true);
      result = getResult(game);
      expect(result.ranking.sort()).toEqual([...uids].sort());
      if (result.matchOver) return { hands: h + 1, result };
    }
    throw new Error('トーナメントが終わらない');
  }

  for (const n of [2, 3, 5, 9]) {
    it(`${n}人：ランダムな合法手でトーナメントが決着し、チップは増減しない`, () => {
      const { result } = playTournament(Array.from({ length: n }, (_, i) => `p${i}`));
      expect(result.matchOver).toBe(true);
      expect(Object.values(result.points).reduce((a, b) => a + b, 0)).toBe((n * (n - 1)) / 2);
    });
  }
});

/**
 * クリベッジ（2人・121点）のルール。画面にも Firebase にも依存しない純粋な関数だけを置く。
 *
 * game（state/current.game に入る公開情報。山札・クリブ・手札の中身は入れない）:
 *   order       席順の uid 2人
 *   dealer      ディーラーの uid（クリブの持ち主）
 *   round       ラウンド番号
 *   scores      uid -> 累積得点
 *   turnUid     手番（終了時 null）
 *   phase       DISCARD_TO_CRIB | PEGGING | SHOW_NON_DEALER | SHOW_DEALER | SHOW_CRIB | ROUND_END | GAME_END
 *   discarded   uid -> クリブへ2枚置いたか
 *   cribCount   クリブの枚数
 *   starter     スターター（クリブが4枚になった時点で公開）
 *   deckCount   山札（スターターを除く残り）の枚数
 *   peg         ペギング { count, seq: [{uid, card}], played: {uid: 出した札の全履歴}, goes: [Goを宣言した uid], last }
 *               played は手札採点にも使う（ペギングで4枚出し切ると、元の手札4枚になる）
 *   show        採点結果 { [uid]: {cards, ...calculateHandScore, awarded}, crib: {...} }
 *   scoreEvents このラウンドの得点イベント
 *   roundResult 終了したラウンドの結果
 *
 * 非公開の「クリブ ＋ 山札」は共通基盤の山札欄（ctx.deck）に [...クリブ, ...山札] の順で保存する。
 *
 * action:
 *   { type: 'discard', uid, cards: [a, b] }   クリブへ2枚置く
 *   { type: 'play', uid, card }               ペギングで1枚出す
 *   { type: 'go', uid }                       出せる札がないのでGo
 *   { type: 'show', uid }                     自分の番の手札（クリブ）を採点する
 *   { type: 'skip', uid }                     切断時にホストが押す。ラウンドを引き分け（配り直し）にする
 */
import { buildDeck, secureRandomInt, shuffle } from '../../common/deck.js';
import { calculateHandScore, calculatePeggingScore, getLegalPlays, rankOf, suitOf } from './scoring.js';

export const defaultOptions = { targetScore: 121 };
export const DECK_SPEC = { jokers: 0 };
const DEAL_SIZE = 6;
const KEEP_SIZE = 4;
const CRIB_SIZE = 4;

const otherOf = (g, uid) => g.order.find((u) => u !== uid);
const ok = (extra) => ({ ok: true, ...extra });
const no = (reason) => ({ ok: false, reason });
const hasCards = (g, uid) => g.peg.played[uid].length < KEEP_SIZE;

/**
 * 配布。2回目以降は前回の結果を受け取り、ディーラーを交代して得点を引き継ぐ（マッチ終了後は新しいマッチ）。
 * @param {{uid: string, seat: number}[]} players
 * @param {Object} options
 * @param {Object|null} [prevResult] 前ラウンドの getResult
 * @param {string[]} [deck] 配る山札（省略時は52枚をシャッフル）
 * @param {(max: number) => number} [randomInt] 初回ディーラーの抽選用
 */
export function deal(players, options, prevResult = null, deck = shuffle(buildDeck(DECK_SPEC)), randomInt = secureRandomInt) {
  const order = [...players].sort((a, b) => a.seat - b.seat).map((p) => p.uid);
  if (order.length !== 2) throw new Error('cribbage needs exactly 2 players');

  const carry = prevResult?.finished && !prevResult.matchOver && order.every((u) => prevResult.scores && u in prevResult.scores);
  const dealer = carry ? (prevResult.redeal ? prevResult.dealer : order.find((u) => u !== prevResult.dealer)) : order[randomInt(2)];
  const nonDealer = order.find((u) => u !== dealer);

  const hands = { [dealer]: [], [nonDealer]: [] };
  for (let i = 0; i < DEAL_SIZE * 2; i++) hands[i % 2 === 0 ? nonDealer : dealer].push(deck[i]);
  const rest = deck.slice(DEAL_SIZE * 2);

  const game = {
    order,
    dealer,
    round: carry ? prevResult.round + (prevResult.redeal ? 0 : 1) : 1,
    scores: carry ? { ...prevResult.scores } : Object.fromEntries(order.map((u) => [u, 0])),
    turnUid: nonDealer,
    phase: 'DISCARD_TO_CRIB',
    discarded: Object.fromEntries(order.map((u) => [u, false])),
    cribCount: 0,
    starter: null,
    deckCount: rest.length,
    peg: { count: 0, seq: [], played: Object.fromEntries(order.map((u) => [u, []])), goes: [], last: null },
    show: {},
    scoreEvents: [],
    roundResult: null,
    ended: false,
    options: { ...defaultOptions, ...options },
  };
  return { hands, game, turnUid: nonDealer, deck: rest };
}

/** 手札の並び：数字の小さい順（同じ数字ならスート順） */
export function sortHand(hand) {
  return [...hand].sort((a, b) => rankOf(a) - rankOf(b) || suitOf(a).localeCompare(suitOf(b)));
}

/** 手番の人が今出せる札（ペギング中のみ） */
export const legalPlays = (game, hand) => (game.phase === 'PEGGING' ? getLegalPlays(hand, game.peg.count) : []);

/**
 * その操作が今できるかを判定する。
 * @param {Object} game
 * @param {string[]} hand 自分の手札
 * @param {Object} action
 */
export function canPlay(game, hand, action) {
  const g = game;
  if (g.ended) return no('ended');
  if (action.uid !== g.turnUid) return no('not-your-turn');
  if (action.type === 'skip') return ok();

  switch (g.phase) {
    case 'DISCARD_TO_CRIB': {
      if (action.type !== 'discard') return no('wrong-phase');
      const cards = action.cards ?? [];
      if (g.discarded[action.uid]) return no('already-discarded');
      if (hand.length !== DEAL_SIZE) return no('hand-size');
      if (cards.length !== 2 || cards[0] === cards[1]) return no('need-two-cards');
      return cards.every((c) => hand.includes(c)) ? ok() : no('not-in-hand');
    }

    case 'PEGGING': {
      const legal = getLegalPlays(hand, g.peg.count);
      if (action.type === 'play') {
        if (!hand.includes(action.card)) return no('not-in-hand');
        return legal.includes(action.card) ? ok() : no('over-31');
      }
      if (action.type === 'go') {
        if (hand.length === 0) return no('no-cards');
        return legal.length === 0 ? ok() : no('must-play');
      }
      return no('wrong-phase');
    }

    case 'SHOW_NON_DEALER':
    case 'SHOW_DEALER':
    case 'SHOW_CRIB':
      return action.type === 'show' ? ok() : no('wrong-phase');

    default:
      return no('wrong-phase');
  }
}

/**
 * 得点を順に加算する。累積が目標に届いた時点で止め、残りは加算しない（二重加算・勝利後の加算を防ぐ）。
 * @returns {boolean} 目標に届いたか
 */
function award(g, uid, entries, log) {
  for (const { type, points, cards = [] } of entries) {
    if (points <= 0) continue;
    const previousScore = g.scores[uid];
    g.scores[uid] = previousScore + points;
    g.scoreEvents.push({ eventId: g.scoreEvents.length + 1, playerId: uid, roundNumber: g.round, type, points, cards, previousScore, newScore: g.scores[uid] });
    log.scored.push({ type, points });
    log.points += points;
    if (g.scores[uid] >= g.options.targetScore) return true;
  }
  return false;
}

/** ラウンドを終える。winner がいればマッチ終了 */
function endRound(g, { winner = null, reason, redeal = false }) {
  const gained = Object.fromEntries(g.order.map((u) => [u, g.scoreEvents.filter((e) => e.playerId === u).reduce((n, e) => n + e.points, 0)]));
  g.ended = true;
  g.turnUid = null;
  g.phase = winner ? 'GAME_END' : 'ROUND_END';
  g.roundResult = { reason, redeal, gained, matchOver: !!winner, matchWinner: winner };
}

/** 区間の終わり：Go／最後の札の1点を渡してカウントを戻し、次の先手を決める。ペギングが終わるなら採点へ */
function endRun(g, log, lastCard) {
  const p = g.peg;
  if (lastCard && p.last && p.count !== 31) {
    const type = p.goes.length > 0 ? 'go' : 'last';
    if (award(g, p.last, [{ type, points: 1 }], log)) return endRound(g, { winner: p.last, reason: 'win' });
  }
  p.count = 0;
  p.seq = [];
  p.goes = [];
  const lead = [otherOf(g, p.last), p.last].find((u) => hasCards(g, u));
  if (lead) {
    g.turnUid = lead;
  } else {
    g.phase = 'SHOW_NON_DEALER';
    g.turnUid = otherOf(g, g.dealer);
  }
}

/** カードを出した／Goを宣言した後の、次の手番と区間の終了判定 */
function settle(g, uid, log, kind) {
  const p = g.peg;
  const opp = otherOf(g, uid);
  if (kind === 'play') {
    if (p.count === 31) return endRun(g, log, false);
    if (hasCards(g, opp) && !p.goes.includes(opp)) g.turnUid = opp;
    else if (hasCards(g, uid)) g.turnUid = uid; // 相手はGo済み、または札がない：続けて出す
    else endRun(g, log, true);
    return;
  }
  if (!p.goes.includes(opp) && hasCards(g, opp)) g.turnUid = opp;
  else endRun(g, log, true);
}

/** 手札・クリブの採点結果を得点として加算する */
function scoreShow(g, uid, key, cards, isCrib, log) {
  const s = calculateHandScore(cards, g.starter, isCrib);
  const before = g.scores[uid];
  const win = award(
    g,
    uid,
    [
      { type: 'fifteen', points: s.fifteens, cards },
      { type: 'pair', points: s.pairs, cards },
      { type: 'run', points: s.runs, cards },
      { type: 'flush', points: s.flush, cards },
      { type: 'nobs', points: s.nobs, cards },
    ],
    log,
  );
  g.show[key] = { cards, ...s, awarded: g.scores[uid] - before };
  log.cards = cards;
  return win;
}

/**
 * 操作後の新しい状態を返す（引数は変更しない）。非公開の手札・山札（クリブ込み）は ctx で受け取る。
 * @param {Object} game
 * @param {Object} action
 * @param {{hand: string[]|null, deck: string[]|null}} [ctx]
 * @returns {{game: Object, turnUid: string|null, log: Object, hand?: string[], deck?: string[]}}
 */
export function applyAction(game, action, ctx = {}) {
  const g = structuredClone(game);
  const uid = action.uid;
  const log = { type: action.type, uid, cards: [], scored: [], points: 0, effects: [] };
  const done = (extra = {}) => ({ game: g, turnUid: g.turnUid, log, ...extra });

  if (action.type === 'skip') {
    endRound(g, { reason: 'abort', redeal: true });
    return done();
  }

  const hand = ctx.hand ?? [];
  const checked = canPlay(game, hand, action);
  if (!checked.ok) throw new Error(`cannot play: ${checked.reason}`);

  if (action.type === 'discard') {
    const rest = hand.filter((c) => !action.cards.includes(c));
    let deck = [...action.cards, ...ctx.deck];
    g.discarded[uid] = true;
    g.cribCount += 2;
    log.cards = []; // クリブに置いた札は非公開
    log.count = 2;
    if (g.order.every((u) => g.discarded[u])) {
      // 両者が置き終えたらスターターを公開（クリブは先頭4枚、残りが山札）
      const crib = deck.slice(0, CRIB_SIZE);
      const stock = deck.slice(CRIB_SIZE);
      g.starter = stock.pop();
      g.deckCount = stock.length;
      deck = [...crib, ...stock];
      g.phase = 'PEGGING';
      g.turnUid = otherOf(g, g.dealer);
      log.effects.push('starter');
      if (rankOf(g.starter) === 11 && award(g, g.dealer, [{ type: 'heels', points: 2, cards: [g.starter] }], log)) {
        endRound(g, { winner: g.dealer, reason: 'win' });
      }
    } else {
      g.turnUid = otherOf(g, uid);
    }
    return done({ hand: rest, deck });
  }

  if (action.type === 'play') {
    const p = g.peg;
    const r = calculatePeggingScore(p.seq.map((e) => e.card), action.card, p.count);
    p.count = r.newCount;
    p.seq.push({ uid, card: action.card });
    p.played[uid].push(action.card);
    p.last = uid;
    log.cards = [action.card];
    log.count = r.newCount;
    const win = award(
      g,
      uid,
      [
        { type: 'fifteen', points: r.fifteenScore, cards: [action.card] },
        { type: 'thirty-one', points: r.thirtyOneScore, cards: [action.card] },
        { type: 'pair', points: r.pairScore, cards: [action.card] },
        { type: 'run', points: r.runScore, cards: [action.card] },
      ],
      log,
    );
    if (win) endRound(g, { winner: uid, reason: 'win' });
    else settle(g, uid, log, 'play');
    return done({ hand: hand.filter((c) => c !== action.card) });
  }

  if (action.type === 'go') {
    g.peg.goes.push(uid);
    settle(g, uid, log, 'go');
    return done();
  }

  // show：非ディーラーの手札 → ディーラーの手札 → クリブ。各採点の直後に勝利判定
  if (g.phase === 'SHOW_CRIB') {
    const crib = ctx.deck.slice(0, g.cribCount);
    if (scoreShow(g, uid, 'crib', crib, true, log)) endRound(g, { winner: uid, reason: 'win' });
    else endRound(g, { reason: 'complete' });
    return done();
  }
  const win = scoreShow(g, uid, uid, [...g.peg.played[uid]], false, log);
  if (win) {
    endRound(g, { winner: uid, reason: 'win' });
  } else if (g.phase === 'SHOW_NON_DEALER') {
    g.phase = 'SHOW_DEALER';
    g.turnUid = g.dealer;
  } else {
    g.phase = 'SHOW_CRIB';
    g.turnUid = g.dealer;
  }
  return done();
}

/** ラウンドが終わったかと、順位・今回の得点・累積得点・マッチの決着を返す */
export function getResult(game) {
  if (!game.ended) return { finished: false };
  const r = game.roundResult;
  const ranking = [...game.order].sort((a, b) => game.scores[b] - game.scores[a]);
  const titles = Object.fromEntries(
    game.order.map((u) => [u, r.matchOver ? (u === r.matchWinner ? '勝利' : '敗北') : r.redeal ? '引き分け' : `累積${game.scores[u]}点`]),
  );
  return {
    finished: true,
    ranking,
    points: { ...r.gained },
    titles,
    scores: { ...game.scores },
    round: game.round,
    dealer: game.dealer,
    reason: r.reason,
    redeal: r.redeal,
    matchOver: r.matchOver,
    matchWinner: r.matchWinner,
    starter: game.starter,
    detail: { show: game.show, events: game.scoreEvents },
  };
}

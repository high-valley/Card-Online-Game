/**
 * ジン・ラミー（2人）のルール。画面にも Firebase にも依存しない純粋な関数だけを置く。
 *
 * game（state/current.game に入る公開情報。山札の中身と手札は入れない）:
 *   order       席順の uid 2人
 *   dealer      ディーラーの uid
 *   round       ラウンド番号
 *   scores      uid -> 累積得点
 *   turnUid     手番（終了時 null）
 *   phase       INITIAL_OFFER | WAITING_FOR_DRAW | WAITING_FOR_DISCARD | SHOWDOWN | ROUND_RESULT
 *   discard     捨て札（末尾が一番上）
 *   deckCount   山札の残り枚数
 *   passes      最初の公開カードをパスした回数
 *   forceDeck   両者パス後の最初の1枚は山札から引く
 *   lastDraw    { uid, source: 'deck'|'discard', card } 直前の取得（捨て札から取ったカードは即廃棄できない）
 *   knock       ノック／ジンの宣言 { uid, type, hand, melds: [{cards}], deadwood, dw }
 *   roundResult 終了したラウンドの結果
 *   ended       ラウンド終了か
 *   options     ルール設定
 *
 * 非公開の山札と手札は共通基盤が保存し、applyAction の ctx で受け渡す（ctx.hand / ctx.deck）。
 *
 * action:
 *   { type: 'pass', uid }                         最初の公開カードをパス
 *   { type: 'draw', uid, source: 'deck'|'discard' }
 *   { type: 'discard' | 'knock' | 'gin', uid, card }
 *   { type: 'showdown', uid }                     ノックされた側の手札公開（レイオフ込みの得点計算）
 *   { type: 'skip', uid }                         切断時にホストが押す。ラウンドを引き分けにする
 */
import { buildDeck, secureRandomInt, shuffle } from '../../common/deck.js';
import { bestArrangement, bestWithLayoff, byCard } from './melds.js';

export const defaultOptions = { ginBonus: 25, undercutBonus: 25, targetScore: 100, knockLimit: 10 };
export const DECK_SPEC = { jokers: 0 };
const HAND_SIZE = 10;
const DECK_EXHAUSTED_AT = 2;

const otherOf = (g, uid) => g.order.find((u) => u !== uid);
const ok = (extra) => ({ ok: true, ...extra });
const no = (reason) => ({ ok: false, reason });

/**
 * 配布。2回目以降は前回の結果を受け取り、ディーラーを交代して得点を引き継ぐ（マッチ終了後・山札枯渇時は例外あり）。
 * @param {{uid: string, seat: number}[]} players
 * @param {Object} options
 * @param {Object|null} [prevResult] 前ラウンドの getResult
 * @param {string[]} [deck] 配る山札（省略時は52枚をシャッフル）
 * @param {(max: number) => number} [randomInt] 初回ディーラーの抽選用
 */
export function deal(players, options, prevResult = null, deck = shuffle(buildDeck(DECK_SPEC)), randomInt = secureRandomInt) {
  const order = [...players].sort((a, b) => a.seat - b.seat).map((p) => p.uid);
  if (order.length !== 2) throw new Error('gin rummy needs exactly 2 players');

  const carry = prevResult?.finished && !prevResult.matchOver && order.every((u) => prevResult.scores && u in prevResult.scores);
  const dealer = carry ? (prevResult.redeal ? prevResult.dealer : order.find((u) => u !== prevResult.dealer)) : order[randomInt(2)];
  const nonDealer = order.find((u) => u !== dealer);

  const hands = { [dealer]: [], [nonDealer]: [] };
  for (let i = 0; i < HAND_SIZE * 2; i++) hands[i % 2 === 0 ? nonDealer : dealer].push(deck[i]);
  const upcard = deck[HAND_SIZE * 2];
  const rest = deck.slice(HAND_SIZE * 2 + 1);

  const game = {
    order,
    dealer,
    round: carry ? prevResult.round + (prevResult.redeal ? 0 : 1) : 1,
    scores: carry ? { ...prevResult.scores } : Object.fromEntries(order.map((u) => [u, 0])),
    turnUid: nonDealer,
    phase: 'INITIAL_OFFER',
    discard: [upcard],
    deckCount: rest.length,
    passes: 0,
    forceDeck: false,
    lastDraw: null,
    knock: null,
    roundResult: null,
    ended: false,
    options: { ...defaultOptions, ...options },
  };
  return { hands, game, turnUid: nonDealer, deck: rest };
}

/** 手札の並び：成立している役を先に、残り（デッドウッド）を後ろに */
export function sortHand(hand) {
  const { melds, deadwood } = bestArrangement(hand);
  return [...melds.flatMap((m) => [...m].sort(byCard)), ...deadwood];
}

/** 捨てる札を1枚選んだ後の、10枚の状態 */
function afterDiscard(hand, card) {
  const rest = hand.filter((c) => c !== card);
  return { rest, arr: bestArrangement(rest) };
}

/**
 * その操作が今できるかを判定する。
 * @param {Object} game
 * @param {string[]} hand 自分の手札（showdown の判定にも使う）
 * @param {Object} action
 */
export function canPlay(game, hand, action) {
  const g = game;
  if (g.ended) return no('ended');
  if (action.uid !== g.turnUid) return no('not-your-turn');
  if (action.type === 'skip') return ok();

  switch (g.phase) {
    case 'INITIAL_OFFER':
      if (action.type === 'pass') return ok();
      if (action.type === 'draw' && action.source === 'discard') return ok();
      return no('wrong-phase');

    case 'WAITING_FOR_DRAW':
      if (action.type !== 'draw') return no('wrong-phase');
      if (action.source === 'deck') return g.deckCount > 0 ? ok() : no('deck-empty');
      if (action.source === 'discard') {
        if (g.forceDeck) return no('must-draw-deck');
        return g.discard.length > 0 ? ok() : no('discard-empty');
      }
      return no('bad-source');

    case 'WAITING_FOR_DISCARD': {
      if (!['discard', 'knock', 'gin'].includes(action.type)) return no('wrong-phase');
      if (hand.length !== HAND_SIZE + 1) return no('hand-size');
      if (!hand.includes(action.card)) return no('not-in-hand');
      if (g.lastDraw?.source === 'discard' && g.lastDraw.card === action.card) return no('same-card');
      if (action.type === 'discard') return ok();
      const { rest, arr } = afterDiscard(hand, action.card);
      if (action.type === 'gin') return arr.dw === 0 ? ok({ rest, arr }) : no('not-gin');
      return arr.dw <= g.options.knockLimit ? ok({ rest, arr }) : no('deadwood-too-high');
    }

    case 'SHOWDOWN':
      if (action.type !== 'showdown') return no('wrong-phase');
      return hand.length === HAND_SIZE ? ok() : no('hand-size');

    default:
      return no('wrong-phase');
  }
}

function endRound(g, result) {
  g.ended = true;
  g.turnUid = null;
  g.phase = 'ROUND_RESULT';
  g.roundResult = result;
  if (result.winner) {
    g.scores[result.winner] += result.points;
    if (g.scores[result.winner] >= g.options.targetScore) {
      g.roundResult.matchOver = true;
      g.roundResult.matchWinner = result.winner;
    }
  }
}

const drawResult = (reason) => ({ reason, winner: null, points: 0, redeal: true, detail: {} });

/** ノックされた側の手札を公開して得点を決める */
function scoreShowdown(g, hand, uid) {
  const k = g.knock;
  const o = g.options;
  const knockMelds = k.melds.map((m) => m.cards);
  const opp =
    k.type === 'gin'
      ? { ...bestArrangement(hand), layoffs: [] }
      : bestWithLayoff(hand, knockMelds);

  let winner;
  let points;
  let reason;
  if (k.type === 'gin') {
    [winner, points, reason] = [k.uid, opp.dw + o.ginBonus, 'gin'];
  } else if (opp.dw > k.dw) {
    [winner, points, reason] = [k.uid, opp.dw - k.dw, 'knock'];
  } else {
    [winner, points, reason] = [uid, k.dw - opp.dw + o.undercutBonus, 'undercut'];
  }
  return {
    reason,
    winner,
    points,
    knocker: k.uid,
    redeal: false,
    detail: {
      [k.uid]: { hand: k.hand, melds: k.melds, deadwood: k.deadwood, dw: k.dw, layoffs: [] },
      [uid]: { hand, melds: opp.melds.map((cards) => ({ cards })), deadwood: opp.deadwood, dw: opp.dw, layoffs: opp.layoffs },
    },
  };
}

/**
 * 操作後の新しい状態を返す（引数は変更しない）。非公開の手札・山札は ctx で受け取り、変わったものを返す。
 * @param {Object} game
 * @param {Object} action
 * @param {{hand: string[]|null, deck: string[]|null}} [ctx]
 * @returns {{game: Object, turnUid: string|null, log: Object, hand?: string[], deck?: string[]}}
 */
export function applyAction(game, action, ctx = {}) {
  const g = structuredClone(game);
  const uid = action.uid;
  const opp = otherOf(g, uid);
  const log = { type: action.type, uid, cards: [], effects: [] };
  const done = (extra = {}) => ({ game: g, turnUid: g.turnUid, log, ...extra });

  if (action.type === 'skip') {
    endRound(g, drawResult('abort'));
    log.effects.push('draw');
    return done();
  }

  const checked = canPlay(game, ctx.hand ?? [], action);
  if (!checked.ok) throw new Error(`cannot play: ${checked.reason}`);

  if (action.type === 'pass') {
    g.passes += 1;
    if (g.passes === 1) {
      g.turnUid = opp;
    } else {
      g.phase = 'WAITING_FOR_DRAW';
      g.forceDeck = true;
      g.turnUid = otherOf(g, g.dealer); // 両者パスなら、非ディーラーが山札から引いて通常進行
    }
    return done();
  }

  if (action.type === 'draw') {
    const hand = [...(ctx.hand ?? [])];
    if (action.source === 'discard') {
      const card = g.discard.pop();
      hand.push(card);
      g.lastDraw = { uid, source: 'discard', card };
      log.cards = [card];
      log.source = 'discard';
      g.phase = 'WAITING_FOR_DISCARD';
      return done({ hand });
    }
    const deck = [...ctx.deck];
    hand.push(deck.pop());
    g.deckCount = deck.length;
    g.lastDraw = { uid, source: 'deck', card: null };
    log.source = 'deck';
    g.phase = 'WAITING_FOR_DISCARD';
    g.forceDeck = false;
    return done({ hand, deck });
  }

  if (action.type === 'showdown') {
    endRound(g, scoreShowdown(g, [...ctx.hand], uid));
    log.effects.push(g.roundResult.reason);
    return done();
  }

  // discard / knock / gin
  const { rest, arr } = afterDiscard(ctx.hand, action.card);
  g.discard.push(action.card);
  g.lastDraw = null;
  log.cards = [action.card];

  if (action.type === 'discard') {
    if (g.deckCount <= DECK_EXHAUSTED_AT) {
      endRound(g, drawResult('exhausted'));
      log.effects.push('draw');
    } else {
      g.phase = 'WAITING_FOR_DRAW';
      g.turnUid = opp;
    }
    return done({ hand: rest });
  }

  g.knock = {
    uid,
    type: action.type,
    hand: [...rest].sort(byCard),
    melds: arr.melds.map((cards) => ({ cards })),
    deadwood: arr.deadwood,
    dw: arr.dw,
  };
  g.phase = 'SHOWDOWN';
  g.turnUid = opp;
  log.effects.push(action.type);
  return done({ hand: rest });
}

/** ノックされた側は、画面操作を待たず自動で手札を公開する（共通基盤が呼ぶ） */
export function autoAction(game, uid) {
  return game.phase === 'SHOWDOWN' && game.turnUid === uid && !game.ended ? { type: 'showdown', uid } : null;
}

const REASON_TITLE = { knock: 'ノック勝ち', gin: 'ジン勝ち', undercut: 'アンダーカット勝ち' };

/** ラウンドが終わったかと、勝者・得点・累積得点・マッチの決着を返す */
export function getResult(game) {
  if (!game.ended) return { finished: false };
  const r = game.roundResult;
  const ranking = r.winner ? [r.winner, otherOf(game, r.winner)] : [...game.order];
  const points = Object.fromEntries(game.order.map((u) => [u, u === r.winner ? r.points : 0]));
  const titles = Object.fromEntries(
    game.order.map((u) => [u, r.winner ? (u === r.winner ? REASON_TITLE[r.reason] : '負け') : '引き分け']),
  );
  return {
    finished: true,
    ranking,
    points,
    titles,
    scores: { ...game.scores },
    round: game.round,
    dealer: game.dealer,
    reason: r.reason,
    knocker: r.knocker ?? null,
    redeal: !!r.redeal,
    matchOver: !!r.matchOver,
    matchWinner: r.matchWinner ?? null,
    detail: r.detail,
  };
}

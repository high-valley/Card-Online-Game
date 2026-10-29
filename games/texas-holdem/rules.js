/**
 * テキサスホールデム（ノーリミット・トーナメント）のルール。画面にも Firebase にも依存しない純粋な関数だけを置く。
 *
 * 全員が同じチップで始め、一定のハンドごとにブラインドが上がる。チップを失った人から脱落し、最後の1人が優勝。
 * 1ハンド＝1ラウンド。ハンドが終わるたびに結果画面が出て、次のハンドへ進む（チップ・脱落順は結果から引き継ぐ）。
 *
 * game（state/current.game に入る公開情報。手札・山札の中身は入れない）:
 *   order       席順の uid 配列（脱落した人も含む）
 *   handNo      ハンド番号（1から）
 *   blinds      { sb, bb, level }
 *   dealer / sbUid / bbUid   ボタン・スモール／ビッグブラインドの uid（2人のときはボタンがスモール）
 *   chips       uid -> 手元のチップ（今のベットを引いた残り）
 *   startChips  uid -> このハンドの開始時のチップ
 *   dealt       このハンドで手札を配られた uid 配列
 *   folded      uid -> true
 *   phase       PREFLOP | FLOP | TURN | RIVER | SHOWDOWN | HAND_END
 *   board       公開されている場のカード（0〜5枚）
 *   deckCount   山札の残り枚数
 *   bets        uid -> 今のベッティングラウンドで出した額
 *   total       uid -> このハンドで出した額の合計（サイドポットの計算に使う）
 *   currentBet  今のラウンドの最高ベット額
 *   minRaise    次のレイズの最小の上げ幅（前のレイズの上げ幅。最初はビッグブラインド）
 *   acted       uid -> true（直前のフルレイズ以降に行動した人。ショートオールインでは再レイズが開かれない）
 *   showQueue   ショーダウンで手札を公開する順番の残り
 *   shown       uid -> [手札2枚]（ショーダウンで公開されたもの）
 *   out         このハンドより前に脱落した uid（脱落順）
 *   handResult  終了したハンドの結果 { uncontested, pots: [{amount, eligible, winners}], awards, hands: {uid: {name, cards}} }
 *   ended       このハンドが終わったか
 *   options     ルール設定
 *
 * 非公開の山札は共通基盤の山札欄（ctx.deck）に保存する。ショーダウンでは、各自が自分の手番に手札を公開する。
 *
 * action:
 *   { type: 'fold' | 'check' | 'call' | 'allin', uid }
 *   { type: 'raise', uid, to }   このラウンドの合計ベット額が to になるようにベット／レイズする
 *   { type: 'show', uid }        ショーダウンで自分の手札を公開する（自動で送られる）
 *   { type: 'skip', uid }        切断時にホストが押す。降りる（ショーダウンなら権利を放棄する）
 */
import { buildDeck, secureRandomInt, shuffle } from '../../common/deck.js';
import { bestHand, rankOf, suitOf } from './hands.js';

export const defaultOptions = { startingChips: 1500, levelHands: 5 };
export const DECK_SPEC = { jokers: 0 };

export const BLIND_LEVELS = [[10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800], [500, 1000], [750, 1500], [1000, 2000]];

/** そのハンドのブラインド。表の最後のレベルを越えたら倍々にして、必ず決着がつくようにする */
export function blindsFor(handNo, levelHands) {
  const level = Math.floor((handNo - 1) / levelHands);
  const last = BLIND_LEVELS.length - 1;
  const [sb, bb] = level <= last ? BLIND_LEVELS[level] : BLIND_LEVELS[last].map((x) => x * 2 ** (level - last));
  return { sb, bb, level: level + 1 };
}

const ok = (extra) => ({ ok: true, ...extra });
const no = (reason) => ({ ok: false, reason });
const STREETS = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];
const STREET_CARDS = { FLOP: 3, TURN: 1, RIVER: 1 };

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const isLive = (g, u) => g.dealt.includes(u) && !g.folded[u];
const liveOf = (g) => g.order.filter((u) => isLive(g, u));
const potOf = (g) => sum(Object.values(g.total));
const after = (g, uid, list) => {
  const n = g.order.length;
  const i = g.order.indexOf(uid);
  for (let k = 1; k <= n; k++) {
    const u = g.order[(i + k) % n];
    if (list.includes(u)) return u;
  }
  return null;
};

/** ベットを払う（手元のチップが足りなければ、あるだけ） */
function commit(g, uid, amount) {
  const pay = Math.min(amount, g.chips[uid]);
  g.chips[uid] -= pay;
  g.bets[uid] = (g.bets[uid] ?? 0) + pay;
  g.total[uid] = (g.total[uid] ?? 0) + pay;
  return pay;
}

/** このラウンドでまだ行動が必要な人（行動していない人、またはコールが足りない人）。オールインの人は含まない */
function pending(g) {
  const live = liveOf(g);
  const canAct = live.filter((u) => g.chips[u] > 0);
  const need = canAct.filter((u) => !g.acted[u] || (g.bets[u] ?? 0) < g.currentBet);
  // 動けるのが1人だけで、その人がもう相手に追いついているなら、ベッティングは終わり
  if (canAct.length <= 1 && canAct.every((u) => (g.bets[u] ?? 0) >= g.currentBet)) return [];
  // 全員が動けるときは need のまま。オールインの人がいて動ける人が1人だけでも、コールが足りなければ need に残る
  return need;
}

// ---- 配布 ----

/**
 * 配布。2ハンド目以降は前回の結果を受け取り、ボタンを進めてチップ・脱落順を引き継ぐ（トーナメント終了後は新しいトーナメント）。
 * @param {{uid: string, seat: number}[]} players
 * @param {Object} options
 * @param {Object|null} [prevResult] 前ハンドの getResult
 * @param {string[]} [deck] 配る山札（省略時は52枚をシャッフル）
 * @param {(max: number) => number} [randomInt] 最初のボタンの抽選用
 */
export function deal(players, options, prevResult = null, deck = shuffle(buildDeck(DECK_SPEC)), randomInt = secureRandomInt) {
  const order = [...players].sort((a, b) => a.seat - b.seat).map((p) => p.uid);
  if (order.length < 2) throw new Error('holdem needs at least 2 players');
  const opts = { ...defaultOptions, ...options };

  const carry = prevResult?.finished && !prevResult.matchOver && order.every((u) => prevResult.chips && u in prevResult.chips);
  const chips = carry ? { ...prevResult.chips } : Object.fromEntries(order.map((u) => [u, opts.startingChips]));
  const out = carry ? [...prevResult.out] : [];
  const handNo = carry ? prevResult.handNo + 1 : 1;
  const alive = order.filter((u) => chips[u] > 0);
  const n = alive.length;

  let dealer;
  if (carry) {
    const from = order.indexOf(prevResult.dealer);
    dealer = Array.from({ length: order.length }, (_, k) => order[(from + 1 + k) % order.length]).find((u) => chips[u] > 0);
  } else {
    dealer = alive[randomInt(n)];
  }
  const di = alive.indexOf(dealer);
  const seatFrom = (k) => alive[(di + k) % n];
  const sbUid = n === 2 ? dealer : seatFrom(1);
  const bbUid = n === 2 ? seatFrom(1) : seatFrom(2);

  // ボタンの左隣から時計回りに2枚ずつ（実物と同じ順に1枚ずつ配る）
  const hands = Object.fromEntries(order.map((u) => [u, []]));
  const seq = Array.from({ length: n }, (_, k) => seatFrom(1 + k));
  for (let round = 0; round < 2; round++) seq.forEach((u, k) => hands[u].push(deck[round * n + k]));
  const rest = deck.slice(2 * n);

  const blinds = blindsFor(handNo, opts.levelHands);
  const g = {
    order,
    handNo,
    blinds,
    dealer,
    sbUid,
    bbUid,
    chips,
    startChips: { ...chips },
    dealt: alive,
    folded: {},
    phase: 'PREFLOP',
    board: [],
    deckCount: rest.length,
    bets: {},
    total: {},
    currentBet: blinds.bb,
    minRaise: blinds.bb,
    acted: {},
    showQueue: [],
    shown: {},
    out,
    handResult: null,
    ended: false,
    turnUid: null,
    options: opts,
  };
  commit(g, sbUid, blinds.sb);
  commit(g, bbUid, blinds.bb);
  // ビッグブラインドが足りずにオールインなら、実際に出した額が最高ベット（コールは不要な分は精算で戻る）
  g.currentBet = Math.max(g.bets[bbUid], g.bets[sbUid]);

  const log = { type: 'deal', uid: dealer, effects: [] };
  const left = [...rest];
  progress(g, left, log, bbUid);
  return { hands, game: g, turnUid: g.turnUid, deck: left };
}

// ---- 進行 ----

/** 次の人の手番、または次のストリート・ショーダウン・ハンド終了まで進める。g と deck は書き換える */
function progress(g, deck, log, from) {
  for (;;) {
    const live = liveOf(g);
    if (live.length === 1) return endUncontested(g, live[0]);
    const need = pending(g);
    if (need.length > 0) {
      g.turnUid = after(g, from, need);
      return;
    }
    if (g.phase === 'RIVER') return startShowdown(g);
    nextStreet(g, deck, log);
    from = g.dealer; // 新しいラウンドは、ボタンの左隣から
  }
}

function nextStreet(g, deck, log) {
  g.phase = STREETS[STREETS.indexOf(g.phase) + 1];
  deck.shift(); // バーンカード
  const cards = deck.splice(0, STREET_CARDS[g.phase]);
  g.board.push(...cards);
  g.deckCount = deck.length;
  g.bets = {};
  g.currentBet = 0;
  g.minRaise = g.blinds.bb;
  g.acted = {};
  log.dealt = [...(log.dealt ?? []), ...cards];
  log.effects.push(g.phase.toLowerCase());
}

function startShowdown(g) {
  g.phase = 'SHOWDOWN';
  const live = liveOf(g);
  g.showQueue = Array.from({ length: g.order.length }, (_, k) => g.order[(g.order.indexOf(g.dealer) + 1 + k) % g.order.length]).filter((u) => live.includes(u));
  g.turnUid = g.showQueue[0];
}

/** サイドポットを組み立てる。出した額の段ごとに、その額まで出した（降りていない）人が取り合う */
export function buildPots(g) {
  const levels = [...new Set(Object.values(g.total).filter((x) => x > 0))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    const amount = sum(g.order.map((u) => Math.min(g.total[u] ?? 0, level) - Math.min(g.total[u] ?? 0, prev)));
    const eligible = g.order.filter((u) => isLive(g, u) && (g.total[u] ?? 0) >= level);
    const last = pots[pots.length - 1];
    // 争う人が同じ（降りた人の少額で段が分かれただけ）なら、ひとつのポットにまとめる
    if (last && (eligible.length === 0 || eligible.join() === last.eligible.join())) last.amount += amount;
    else pots.push({ amount, eligible });
    prev = level;
  }
  return pots;
}

function endUncontested(g, winner) {
  const amount = potOf(g);
  g.chips[winner] += amount;
  g.handResult = { uncontested: true, pots: [{ amount, eligible: [winner], winners: [winner] }], awards: { [winner]: amount }, hands: {} };
  finish(g);
}

function finish(g) {
  g.phase = 'HAND_END';
  g.bets = {};
  g.showQueue = [];
  g.turnUid = null;
  g.ended = true;
}

/** 全員の手札が公開されたら、ポットごとに勝者を決めて配当する */
function resolve(g) {
  const hands = {};
  for (const u of Object.keys(g.shown)) {
    const b = bestHand([...g.shown[u], ...g.board]);
    hands[u] = { name: b.name, cards: b.cards, score: b.score };
  }
  const awards = {};
  const pots = buildPots(g).map((pot) => {
    const contenders = pot.eligible.filter((u) => hands[u]);
    const top = Math.max(...contenders.map((u) => hands[u].score));
    const winners = contenders.filter((u) => hands[u].score === top);
    // 割り切れない端数は、ボタンに近い（左隣から数えて早い）勝者から1枚ずつ
    const ordered = Array.from({ length: g.order.length }, (_, k) => g.order[(g.order.indexOf(g.dealer) + 1 + k) % g.order.length]).filter((u) => winners.includes(u));
    const share = Math.floor(pot.amount / winners.length);
    let extra = pot.amount - share * winners.length;
    for (const u of ordered) {
      const got = share + (extra-- > 0 ? 1 : 0);
      awards[u] = (awards[u] ?? 0) + got;
      g.chips[u] += got;
    }
    return { amount: pot.amount, eligible: pot.eligible, winners: ordered };
  });
  g.handResult = { uncontested: false, pots, awards, hands: Object.fromEntries(Object.entries(hands).map(([u, h]) => [u, { name: h.name, cards: h.cards }])) };
  finish(g);
}

// ---- 判定 ----

/** 今の手番の人に許される額の範囲など（画面と CPU が使う） */
export function betInfo(g, uid) {
  const bet = g.bets[uid] ?? 0;
  const chips = g.chips[uid] ?? 0;
  const toCall = Math.min(Math.max(g.currentBet - bet, 0), chips);
  const maxTo = bet + chips;
  const canRaise = !g.acted[uid] && chips > toCall;
  const minTo = Math.min(g.currentBet + g.minRaise, maxTo);
  return { bet, chips, toCall, canCheck: g.currentBet - bet <= 0, canRaise, minTo, maxTo, pot: potOf(g) };
}

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

  if (g.phase === 'SHOWDOWN') {
    if (action.type !== 'show') return no('wrong-phase');
    return hand.length === 2 ? ok() : no('hand-size');
  }
  if (action.type === 'show') return no('wrong-phase');

  const info = betInfo(g, action.uid);
  switch (action.type) {
    case 'fold':
      return ok();
    case 'check':
      return info.canCheck ? ok() : no('must-call');
    case 'call':
      return info.toCall > 0 ? ok() : no('nothing-to-call');
    case 'allin':
      if (info.chips <= 0) return no('no-chips');
      return info.maxTo > g.currentBet && !info.canRaise ? no('cannot-reraise') : ok();
    case 'raise': {
      const to = action.to;
      if (!Number.isInteger(to)) return no('bad-amount');
      if (!info.canRaise) return no('cannot-reraise');
      if (to > info.maxTo) return no('not-enough-chips');
      if (to < info.minTo) return no('raise-too-small');
      return to > g.currentBet ? ok() : no('raise-too-small');
    }
    default:
      return no('unknown-action');
  }
}

/** 画面操作を待たずに送る操作：ショーダウンでの手札公開 */
export function autoAction(game, uid) {
  return !game.ended && game.phase === 'SHOWDOWN' && game.turnUid === uid ? { type: 'show', uid } : null;
}

/** 手札の並び：強い数字から */
export function sortHand(hand) {
  return [...hand].sort((a, b) => rankOf(b) - rankOf(a) || 'SHDC'.indexOf(suitOf(a)) - 'SHDC'.indexOf(suitOf(b)));
}

/**
 * 操作後の新しい状態と次の手番を返す（引数は変更しない）。
 * @param {Object} game
 * @param {Object} action
 * @param {{hand: string[]|null, deck: string[]|null}} [ctx]
 */
export function applyAction(game, action, ctx = {}) {
  const g = structuredClone(game);
  const uid = action.uid;
  const deck = [...(ctx.deck ?? [])];
  const log = { type: action.type, uid, effects: [] };

  if (g.phase === 'SHOWDOWN') {
    g.showQueue = g.showQueue.filter((u) => u !== uid);
    if (action.type === 'show') {
      g.shown[uid] = [...ctx.hand];
      log.cards = [...ctx.hand];
    } else {
      g.folded[uid] = true; // 公開しないなら、ポットを争う権利を失う
    }
    if (liveOf(g).length === 1) endUncontested(g, liveOf(g)[0]);
    else if (g.showQueue.length === 0) resolve(g);
    else g.turnUid = g.showQueue[0];
    return { game: g, turnUid: g.turnUid, log, deck: deck.length ? deck : undefined };
  }

  const info = betInfo(g, uid);
  let from = uid;
  switch (action.type === 'skip' ? (info.canCheck ? 'check' : 'fold') : action.type) {
    case 'fold':
      g.folded[uid] = true;
      log.type = action.type === 'skip' ? 'skip' : 'fold';
      break;
    case 'check':
      g.acted[uid] = true;
      log.type = action.type === 'skip' ? 'skip' : 'check';
      break;
    case 'call': {
      log.amount = commit(g, uid, info.toCall);
      g.acted[uid] = true;
      if (g.chips[uid] === 0) log.effects.push('allin');
      break;
    }
    case 'allin':
    case 'raise': {
      const to = action.type === 'allin' ? info.maxTo : action.to;
      const raiseSize = to - g.currentBet;
      const paid = commit(g, uid, to - info.bet);
      log.amount = paid;
      g.acted[uid] = true;
      if (to > g.currentBet) {
        const full = raiseSize >= g.minRaise;
        if (full) {
          g.minRaise = raiseSize;
          g.acted = { [uid]: true }; // 全員がもう一度行動できる
        }
        log.type = g.currentBet === 0 ? 'bet' : 'raise';
        log.to = to;
        g.currentBet = to;
      } else {
        log.type = 'call';
      }
      if (g.chips[uid] === 0) log.effects.push('allin');
      break;
    }
    default:
      throw new Error(`cannot apply: ${action.type}`);
  }

  progress(g, deck, log, from);
  return { game: g, turnUid: g.turnUid, log, deck };
}

/** ハンドが終わったかと、順位・脱落・次のハンドへ引き継ぐ情報を返す */
export function getResult(game) {
  if (!game.ended) return { finished: false };
  const alive = game.order.filter((u) => game.chips[u] > 0);
  const busted = game.order
    .filter((u) => game.chips[u] === 0 && !game.out.includes(u))
    .sort((a, b) => game.startChips[a] - game.startChips[b] || game.order.indexOf(b) - game.order.indexOf(a));
  const out = [...game.out, ...busted];
  const ranking = [...alive].sort((a, b) => game.chips[b] - game.chips[a]).concat([...out].reverse());
  const matchOver = alive.length <= 1;
  const n = ranking.length;
  const points = Object.fromEntries(ranking.map((u, i) => [u, matchOver ? n - 1 - i : 0]));
  // 結果表の「階級」欄：途中は手元のチップ（脱落者は「脱落」）、終了後は優勝／順位
  const titles = Object.fromEntries(ranking.map((u, i) => [u, matchOver ? (i === 0 ? '優勝' : `${i + 1}位`) : out.includes(u) ? '脱落' : `${game.chips[u].toLocaleString('ja-JP')}枚`]));
  return {
    finished: true,
    ranking,
    points,
    titles,
    chips: { ...game.chips },
    startChips: { ...game.startChips },
    out,
    busted,
    dealer: game.dealer,
    handNo: game.handNo,
    matchOver,
    winner: matchOver ? alive[0] : null,
    handResult: game.handResult,
    board: [...game.board],
  };
}

/**
 * テキサスホールデムのCPU。他人の手札・山札は一切参照しない。
 * 使う情報は「自分の手札」「公開情報（game：場・チップ・ベット額・位置）」と observe で渡される公開ログだけ。
 * 相手の手札は「見えていないカード（52枚−自分の手札−場）」からのランダムサンプリングで見積もる。
 *
 * 難易度：
 *   easy   プリフロップの手札の強さ（Chen 式）だけで決める受け身の打ち方。場が開いたら「手札で役ができたか」を見るだけ。
 *          めったにレイズせず、弱くてもときどき無駄にコールする。ポットオッズも位置も見ない。
 *   normal モンテカルロのエクイティ（相手の人数ぶんのランダムな手札に対する勝率、約80回）とポットオッズでコール／フォールド。
 *          十分強いときはポットの半分〜2/3でベット・レイズする。位置・スタック・相手の癖は見ない。
 *   hard   試行回数を増やし（約250）、次を加味する。
 *          ・位置：ボタンに近いほど広く、早い席ほど狭く参加する
 *          ・スタックの深さ：レイズ後に残りがポット（＋自分のベット）の約35%以下になるなら、刻まずオールインにする
 *            （ビッグブラインド10枚以下のプッシュ／フォールドは試したが、受け身の相手に取りこぼしが増えて弱くなったので外した）
 *          ・ブラフ：チェックが回ってきたときや弱いハンドでの少頻度のセミブラフ
 *          ・相手のアクション：このハンドでレイズした相手は強めのレンジ（手札の強さの下限つき）でサンプリングし、
 *            観察した相手のレイズ頻度が低いほど、そのベットを重く見る
 */
import { buildDeck } from '../../common/deck.js';
import { betInfo, canPlay } from './rules.js';
import { rankOf, suitOf } from './hands.js';

export const CPU_LEVELS = [
  { id: 'easy', label: 'かんたん' },
  { id: 'normal', label: 'ふつう' },
  { id: 'hard', label: 'つよい' },
];

const DECK = buildDeck({ jokers: 0 });
const SUIT_INDEX = { S: 0, H: 1, D: 2, C: 3 };
// カードを 0〜51 の整数にする：rank(2..14)-2 を 4 倍して suit を足す
const codeOf = (id) => (rankOf(id) - 2) * 4 + SUIT_INDEX[suitOf(id)];
const rankC = (c) => (c >> 2) + 2;
const suitC = (c) => c & 3;
const ALL_CODES = DECK.map(codeOf);

const BASE = 15;

/** 5〜7枚（整数コード）の強さ。大きいほど強い。hands.js の bestHand と同じ順序になる（テストで確認） */
function score7(codes) {
  const cnt = new Array(15).fill(0);
  const suitCnt = [0, 0, 0, 0];
  const suitMask = [0, 0, 0, 0];
  let mask = 0;
  for (const c of codes) {
    const r = rankC(c);
    const s = suitC(c);
    cnt[r]++;
    suitCnt[s]++;
    suitMask[s] |= 1 << r;
    mask |= 1 << r;
  }
  const straightHigh = (m) => {
    for (let h = 14; h >= 5; h--) {
      const need = h === 5 ? (1 << 5) | (1 << 4) | (1 << 3) | (1 << 2) | (1 << 14) : 31 << (h - 4);
      if ((m & need) === need) return h;
    }
    return 0;
  };
  const pack = (cat, ranks) => ranks.reduce((s, r, i) => s + r * BASE ** (4 - i), cat * BASE ** 5);
  const topRanks = (m, k) => {
    const out = [];
    for (let r = 14; r >= 2 && out.length < k; r--) if (m & (1 << r)) out.push(r);
    return out;
  };

  const fs = suitCnt.findIndex((n) => n >= 5);
  if (fs >= 0) {
    const sh = straightHigh(suitMask[fs]);
    if (sh) return pack(8, [sh]);
  }
  const quads = [];
  const trips = [];
  const pairs = [];
  for (let r = 14; r >= 2; r--) {
    if (cnt[r] === 4) quads.push(r);
    else if (cnt[r] === 3) trips.push(r);
    else if (cnt[r] === 2) pairs.push(r);
  }
  if (quads.length) {
    const kick = topRanks(mask & ~(1 << quads[0]), 1);
    return pack(7, [quads[0], ...kick]);
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const second = trips.length > 1 ? Math.max(trips[1], pairs[0] ?? 0) : pairs[0];
    return pack(6, [trips[0], second]);
  }
  if (fs >= 0) return pack(5, topRanks(suitMask[fs], 5));
  const sh = straightHigh(mask);
  if (sh) return pack(4, [sh]);
  if (trips.length) return pack(3, [trips[0], ...topRanks(mask & ~(1 << trips[0]), 2)]);
  if (pairs.length >= 2) {
    const kick = topRanks(mask & ~(1 << pairs[0]) & ~(1 << pairs[1]), 1);
    return pack(2, [pairs[0], pairs[1], ...kick]);
  }
  if (pairs.length === 1) return pack(1, [pairs[0], ...topRanks(mask & ~(1 << pairs[0]), 3)]);
  return pack(0, topRanks(mask, 5));
}

export const _score7ForTest = (ids) => score7(ids.map(codeOf));
const CAT = BASE ** 5;
const catOf = (score) => Math.floor(score / CAT);

/** プリフロップの手札の強さ（Chen 式、おおよそ -1〜20） */
function chen(a, b) {
  const [hi, lo] = rankC(a) >= rankC(b) ? [rankC(a), rankC(b)] : [rankC(b), rankC(a)];
  const pts = (r) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let p = pts(hi);
  if (hi === lo) return Math.ceil(Math.max(5, p * 2));
  if (suitC(a) === suitC(b)) p += 2;
  const gap = hi - lo - 1;
  p -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 12) p += 1;
  return Math.ceil(p);
}
const chenIds = (hand) => chen(codeOf(hand[0]), codeOf(hand[1]));

/** @param {'easy'|'normal'|'hard'} level */
export function createCpu(level, uid, rng = Math.random) {
  // ---- 観察（hard が使う。他の難易度は記録だけして使わない） ----
  let stats = {}; // uid -> { acts, raises }
  let lastHandNo = 0;
  let raisedThisHand = {}; // uid -> true（このハンドでベット／レイズした）
  let lastAggressor = null;

  function newHand() {
    raisedThisHand = {};
    lastAggressor = null;
  }
  function sync(game) {
    if (game.handNo !== lastHandNo) {
      if (game.handNo < lastHandNo) stats = {}; // 新しいトーナメント
      lastHandNo = game.handNo;
      newHand();
    }
  }

  // ---- 共通の道具 ----
  const live = (game) => game.dealt.filter((u) => !game.folded[u]);
  const oppCount = (game) => live(game).length - 1;
  const rand = (a, b) => a + (b - a) * rng();

  /** 場のカードだけでできる役（手札と場を合わせた役がこれより上なら、手札で役ができている） */
  function madeCat(game, hand) {
    if (game.board.length < 3) return -1;
    const all = [...hand, ...game.board].map(codeOf);
    const mine = score7(all);
    const boardOnly = game.board.length >= 5 ? score7(game.board.map(codeOf)) : -1;
    return mine > boardOnly ? catOf(mine) : -1;
  }

  /**
   * エクイティ（勝率。引き分けは半分）を見積もる。
   * @param {number} trials
   * @param {{minChen?: Object}} [opts] minChen: uid -> その相手の手札の強さの下限（レイズしてきた相手のレンジを絞る）
   */
  function equity(game, hand, trials, opts = {}) {
    const mine = hand.map(codeOf);
    const board = game.board.map(codeOf);
    const known = new Set([...mine, ...board]);
    const pool = ALL_CODES.filter((c) => !known.has(c));
    const opps = live(game).filter((u) => u !== uid);
    const need = 5 - board.length;
    let win = 0;
    for (let t = 0; t < trials; t++) {
      let k = 0;
      const draw = () => {
        const j = k + Math.floor(rng() * (pool.length - k));
        [pool[k], pool[j]] = [pool[j], pool[k]];
        return pool[k++];
      };
      const oppHands = [];
      for (const u of opps) {
        const floor = opts.minChen?.[u] ?? -9;
        let a;
        let b;
        for (let tries = 0; tries < 6; tries++) {
          a = draw();
          b = draw();
          if (tries === 5 || chen(a, b) >= floor) break;
          k -= 2; // 却下：この2枚は山に戻す（最後の1回は却下せず採用）
        }
        oppHands.push([a, b]);
      }
      const full = board.slice();
      for (let i = 0; i < need; i++) full.push(draw());
      const my = score7([...mine, ...full]);
      let tied = 1;
      let lose = false;
      for (const [a, b] of oppHands) {
        const s = score7([a, b, ...full]);
        if (s > my) {
          lose = true;
          break;
        }
        if (s === my) tied++;
      }
      if (!lose) win += 1 / tied;
    }
    return win / trials;
  }

  // ---- アクションの組み立て ----
  const act = (type, extra = {}) => ({ type, uid, ...extra });

  /** 合計額 to までのレイズ。上限近くなら全部押す。上げられなければ null */
  function raiseTo(game, info, want) {
    if (!info.canRaise) return null;
    let to = Math.max(info.minTo, Math.round(want));
    if (to >= info.maxTo || info.maxTo - to <= (info.pot + info.bet) * 0.35) return act('allin');
    to = Math.min(to, info.maxTo);
    return act('raise', { to });
  }
  const callOrCheck = (info) => (info.canCheck ? act('check') : act('call'));
  const foldOrCheck = (info) => (info.canCheck ? act('check') : act('fold'));

  /** 最終確認：合法でなければ安全な手に落とす */
  function safe(game, hand, action) {
    if (canPlay(game, hand, action).ok) return action;
    const info = betInfoOf(game);
    for (const a of [callOrCheck(info), act('fold')]) if (canPlay(game, hand, a).ok) return a;
    return act('fold');
  }
  let betInfoOf = null;

  // ---- easy ----
  function decideEasy(game, hand, info) {
    const post = game.board.length >= 3;
    // 強さ 0〜1
    let s;
    if (!post) s = (chenIds(hand) + 1) / 21;
    else {
      const c = madeCat(game, hand);
      s = c >= 4 ? 0.95 : c === 3 ? 0.85 : c === 2 ? 0.75 : c === 1 ? 0.5 : 0.1;
    }
    const big = info.toCall > 0 && info.toCall >= info.chips * 0.5; // 手持ちの半分以上を求められている
    if (info.toCall === 0) {
      if (s > 0.85 && rng() < 0.2) return raiseTo(game, info, game.currentBet + game.blinds.bb * 2) ?? act('check');
      return act('check');
    }
    const need = big ? 0.6 : 0.33;
    if (s >= need) return act('call');
    if (rng() < 0.12) return act('call'); // ときどき無駄にコール
    return act('fold');
  }

  // ---- normal ----
  function decideNormal(game, hand, info) {
    const n = oppCount(game);
    const eq = equity(game, hand, 80);
    const base = 1 / (n + 1);
    const strong = base + (1 - base) * 0.55;
    const potOdds = info.toCall / (info.pot + info.toCall);
    const bb = game.blinds.bb;
    if (info.toCall === 0) {
      if (eq > strong && rng() < 0.85) return raiseTo(game, info, info.pot * rand(0.5, 0.66) + game.currentBet) ?? act('check');
      return act('check');
    }
    if (eq > strong + 0.05 && info.canRaise && rng() < 0.7) {
      const want = game.currentBet + Math.max(bb * 2, (info.pot + info.toCall) * rand(0.5, 0.66));
      return raiseTo(game, info, want) ?? act('call');
    }
    if (eq > potOdds + 0.03) return act('call');
    return act('fold');
  }

  // ---- hard ----
  function decideHard(game, hand, info) {
    const n = oppCount(game);
    const bb = game.blinds.bb;
    const pre = game.board.length === 0;
    const base = 1 / (n + 1);

    // 位置（0 = スモールブラインド側の最初、1 = ボタン）
    const seq = [];
    const di = game.order.indexOf(game.dealer);
    for (let k = 1; k <= game.order.length; k++) {
      const u = game.order[(di + k) % game.order.length];
      if (game.dealt.includes(u) && !game.folded[u]) seq.push(u);
    }
    const pos = seq.length > 1 ? seq.indexOf(uid) / (seq.length - 1) : 1;

    // 相手のレンジ：このハンドでレイズした相手は強い手だけ
    const minChen = {};
    for (const u of live(game)) {
      if (u === uid || !raisedThisHand[u]) continue;
      const st = stats[u];
      const rate = ((st?.raises ?? 0) + 1) / ((st?.acts ?? 0) + 6);
      minChen[u] = rate < 0.2 ? 7 : rate < 0.35 ? 6 : 5;
      if (!pre) minChen[u] -= 1;
    }
    const eq = equity(game, hand, 250, { minChen });
    const potOdds = info.toCall / (info.pot + info.toCall);
    const strong = base + (1 - base) * (0.5 + 0.06 * (1 - pos));

    // ベットされていない（またはBBのチェック）
    if (info.toCall === 0) {
      if (eq > strong - 0.05 && rng() < 0.9) {
        const frac = eq > 0.85 ? rand(0.6, 0.9) : rand(0.45, 0.66);
        const open = pre ? bb * rand(2.5, 3.2) : info.pot * frac;
        return raiseTo(game, info, game.currentBet + open) ?? act('check');
      }
      // セミブラフ：位置が良く、相手が少ない、まだカードが来る場面で少しだけ
      if (!pre && game.board.length < 5 && n <= 2 && pos >= 0.5 && eq > 0.22 && eq < 0.5 && rng() < 0.18) {
        return raiseTo(game, info, info.pot * rand(0.4, 0.6)) ?? act('check');
      }
      return act('check');
    }

    // ベットを受けている
    const aggr = lastAggressor && stats[lastAggressor] ? ((stats[lastAggressor].raises + 1) / (stats[lastAggressor].acts + 6)) : 0.3;
    // よく賭ける相手には甘く、めったに賭けない相手には厳しく
    const margin = 0.03 + 0.1 * Math.max(0, Math.min(1, (0.35 - aggr) / 0.25));
    const sizeMargin = Math.min(0.06, (info.toCall / Math.max(info.pot, 1)) * 0.04);
    const need = potOdds + margin + sizeMargin - (pre ? 0.03 * pos : 0.015 * pos);

    if (eq > strong + 0.06 && info.canRaise && rng() < 0.75) {
      const want = game.currentBet + Math.max(bb * 2, (info.pot + info.toCall) * rand(0.55, 0.75));
      return raiseTo(game, info, want) ?? act('call');
    }
    // セミブラフレイズ
    if (!pre && game.board.length < 5 && n === 1 && info.canRaise && eq > 0.3 && eq < 0.5 && info.toCall < info.pot * 0.6 && rng() < 0.07) {
      return raiseTo(game, info, game.currentBet + (info.pot + info.toCall) * 0.7) ?? act('call');
    }
    if (eq > need) return act('call');
    return act('fold');
  }

  return {
    reset() {
      newHand();
    },
    observe(entry, game) {
      if (!entry || !entry.uid) return;
      if (game) sync(game);
      if (['fold', 'check', 'call', 'bet', 'raise'].includes(entry.type)) {
        const st = (stats[entry.uid] ??= { acts: 0, raises: 0 });
        st.acts++;
        if (entry.type === 'bet' || entry.type === 'raise') {
          st.raises++;
          raisedThisHand[entry.uid] = true;
          lastAggressor = entry.uid;
        }
      }
      if (entry.dealt?.length) lastAggressor = null; // 新しいストリートでは前のベットを引きずらない
    },
    decide(game, hand) {
      sync(game);
      if (game.phase === 'SHOWDOWN') return { type: 'show', uid };
      const info = betInfo(game, uid);
      betInfoOf = () => info;
      const fn = level === 'easy' ? decideEasy : level === 'normal' ? decideNormal : decideHard;
      return safe(game, hand, fn(game, hand, info));
    },
  };
}

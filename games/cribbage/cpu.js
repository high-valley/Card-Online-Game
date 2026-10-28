/**
 * クリベッジのCPU。人間プレイヤーの非公開手札・山札の並び・相手が置いたクリブの中身は一切参照しない。
 * 使う情報は「自分の手札」「公開情報（game：スターター・出札の履歴・得点）」と、自分が置いたクリブの札だけ。
 *
 * 難易度：
 *   easy   残す4枚の「いま見えている得点」だけでクリブを選ぶ。ペギングは得点になる札を優先し、あとはランダム。
 *   normal 残す4枚の期待得点（スターター全パターン）とクリブの傾向（ディーラーなら加点・そうでなければ減点）で選ぶ。
 *          ペギングは得点を優先し、相手に15・31を取らせるカウントを避ける。
 *   hard   クリブの期待値をモンテカルロで見積もる。ペギングは見えていないカードの分布から相手の返しの期待得点を計算し、
 *          121点に届く手があれば最優先にする。
 */
import { buildDeck } from '../../common/deck.js';
import { calculateHandScore, calculatePeggingScore, getLegalPlays, rankOf, valueOf } from './scoring.js';
import { canPlay } from './rules.js';

export const CPU_LEVELS = [
  { id: 'easy', label: 'かんたん' },
  { id: 'normal', label: 'ふつう' },
  { id: 'hard', label: 'つよい' },
];

const ALL_CARDS = buildDeck();
/** かんたん：最善手を外す確率 */
const EASY_SLIP = 0.3;
const MC_SAMPLES = 36;

const pairsOf = (hand) => hand.flatMap((a, i) => hand.slice(i + 1).map((b) => [a, b]));

/** @param {'easy'|'normal'|'hard'} level */
export function createCpu(level, uid, rng = Math.random) {
  const mem = { myCrib: [] };

  /** 見えていない可能性のあるカード（自分の6枚・自分が置いたクリブ・スターター・出た札を除く） */
  function unseen(game, known) {
    const gone = new Set([...known, ...game.peg.played[game.order[0]], ...game.peg.played[game.order[1]]]);
    if (game.starter) gone.add(game.starter);
    return ALL_CARDS.filter((c) => !gone.has(c));
  }

  /** 残す4枚の期待得点（スターター全パターンの平均） */
  const handValue = (keep, pool) => pool.reduce((n, s) => n + calculateHandScore(keep, s).total, 0) / pool.length;

  /** 残す4枚だけで見える得点（easy 用。1枚をスターター代わりにして平均する） */
  function visibleValue(keep) {
    let total = 0;
    for (let i = 0; i < keep.length; i++) {
      const rest = keep.filter((_, j) => j !== i);
      const s = calculateHandScore(rest, keep[i]);
      total += s.fifteens + s.pairs + s.runs;
    }
    return total / keep.length;
  }

  /** クリブに置く2枚の傾向（normal）：ペア・合計15・5・近い数字は得点になりやすい */
  function cribTendency(a, b) {
    const [x, y] = [rankOf(a), rankOf(b)];
    const [vx, vy] = [valueOf(a), valueOf(b)];
    let t = 0;
    if (x === y) t += 2;
    if (vx + vy === 15) t += 2;
    if (vx === 5 || vy === 5) t += 1.5;
    if (Math.abs(x - y) === 1) t += 0.8;
    else if (Math.abs(x - y) === 2) t += 0.4;
    if (a[0] === b[0]) t += 0.3;
    return t;
  }

  /** クリブの期待得点（hard）：ほかの2枚とスターターを見えていないカードから引いて採点する */
  function cribMonteCarlo(discards, pool) {
    let total = 0;
    for (let i = 0; i < MC_SAMPLES; i++) {
      // 重複しない3枚を引く（衝突したら隣へずらす。乱数が偏っていても必ず終わる）
      const picks = new Set();
      for (let k = 0; k < 3; k++) {
        let at = Math.floor(rng() * pool.length) % pool.length;
        while (picks.has(at)) at = (at + 1) % pool.length;
        picks.add(at);
      }
      const [c, d, starter] = [...picks].map((i) => pool[i]);
      total += calculateHandScore([...discards, c, d], starter, true).total;
    }
    return total / MC_SAMPLES;
  }

  function chooseDiscard(game, hand) {
    const dealer = game.dealer === uid;
    const pool = unseen(game, hand);
    const options = pairsOf(hand).map((toss) => {
      const keep = hand.filter((c) => !toss.includes(c));
      let value = level === 'easy' ? visibleValue(keep) : handValue(keep, pool);
      if (level === 'normal') value += (dealer ? 1 : -1) * cribTendency(toss[0], toss[1]);
      if (level === 'hard') value += (dealer ? 1 : -1) * cribMonteCarlo(toss, pool);
      return { toss, value };
    });
    options.sort((a, b) => b.value - a.value);
    if (level === 'easy' && rng() < EASY_SLIP) return options[Math.floor(rng() * Math.min(5, options.length))].toss;
    return options[0].toss;
  }

  /** 相手が次に出して取れる得点の期待値（hard）：見えていないカードのうち相手の手札にありそうなものから見積もる */
  function oppReply(game, count, seq, pool, oppCards) {
    if (pool.length === 0 || oppCards === 0) return 0;
    const p = Math.min(1, oppCards / pool.length);
    let expected = 0;
    let best = 0;
    for (const c of pool) {
      if (count + valueOf(c) > 31) continue;
      const pts = calculatePeggingScore(seq, c, count).totalScore;
      expected += p * pts;
      best = Math.max(best, pts);
    }
    return Math.min(expected, best);
  }

  function choosePlay(game, hand) {
    const p = game.peg;
    const legal = getLegalPlays(hand, p.count);
    const seq = p.seq.map((e) => e.card);
    const opp = game.order.find((u) => u !== uid);
    const oppCards = 4 - p.played[opp].length;
    const pool = level === 'hard' ? unseen(game, [...hand, ...mem.myCrib]) : [];
    const need = game.options.targetScore - game.scores[uid];

    const scored = legal.map((card) => {
      const r = calculatePeggingScore(seq, card, p.count);
      let value = r.totalScore;
      if (level === 'easy') return { card, value: value + rng() * 1.5 };
      if (r.totalScore >= need) return { card, value: 1000 };
      if (level === 'normal') {
        // 相手に10点札で15・31を取らせるカウントは避ける
        if (r.newCount === 5 || r.newCount === 21) value -= 1.5;
        if (r.newCount === 10 || r.newCount === 20) value -= 0.5;
        value -= valueOf(card) >= 10 ? 0 : 0.2; // 大きい札を出し渋ると31に近づけて取りやすい
      } else {
        value -= oppReply(game, r.newCount, [...seq, card], pool, oppCards);
        // 手札に残る札で次にも出せる形を少し好む
        const rest = hand.filter((c) => c !== card);
        value += rest.some((c) => r.newCount + valueOf(c) <= 31) ? 0.3 : 0;
      }
      return { card, value: value + rng() * 0.05 };
    });
    scored.sort((a, b) => b.value - a.value);
    return scored[0].card;
  }

  function choose(game, hand) {
    const a = { uid };
    switch (game.phase) {
      case 'DISCARD_TO_CRIB': {
        const cards = chooseDiscard(game, hand);
        mem.myCrib = cards;
        return { ...a, type: 'discard', cards };
      }
      case 'PEGGING':
        return getLegalPlays(hand, game.peg.count).length === 0 ? { ...a, type: 'go' } : { ...a, type: 'play', card: choosePlay(game, hand) };
      default:
        return { ...a, type: 'show' };
    }
  }

  function legalFallback(game, hand) {
    const a = { uid };
    if (game.phase === 'DISCARD_TO_CRIB') return { ...a, type: 'discard', cards: hand.slice(0, 2) };
    if (game.phase === 'PEGGING') {
      const [card] = getLegalPlays(hand, game.peg.count);
      return card ? { ...a, type: 'play', card } : { ...a, type: 'go' };
    }
    return { ...a, type: 'show' };
  }

  return {
    /** 新しいラウンドの開始時に記憶を消す */
    reset() {
      mem.myCrib = [];
    },
    /** 公開された行動を見る（クリベッジは game の出札履歴だけで足りるので記録は不要） */
    observe() {},
    /** 次の操作を決める。失敗したら合法手のどれかにフォールバックする */
    decide(game, hand) {
      try {
        const action = choose(game, hand);
        if (canPlay(game, hand, action).ok) return action;
      } catch (e) {
        console.warn('cpu failed, fallback', e);
      }
      return legalFallback(game, hand);
    },
  };
}

/**
 * クリベッジの採点（手札・クリブ・ペギング）。画面にも Firebase にも依存しない純粋な関数だけを置く。
 * カードは共通表記（スート1文字＋数字。例 "S3", "H10", "DK"）。
 */
const NUMBERS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** 連番での順位（A=1 … K=13。Q・K・A は連番にならない） */
export const rankOf = (id) => NUMBERS.indexOf(id.slice(1)) + 1;
/** 合計値の計算に使う点（A=1、2〜10=数字、J・Q・K=10） */
export const valueOf = (id) => Math.min(rankOf(id), 10);
export const suitOf = (id) => id[0];

/** 配列の部分集合を、要素数 min 以上すべて返す */
function subsets(items, min = 1) {
  const out = [];
  for (let mask = 1; mask < 1 << items.length; mask++) {
    const sub = items.filter((_, i) => mask & (1 << i));
    if (sub.length >= min) out.push(sub);
  }
  return out;
}

/** 並べ替えれば連続する数字になるか（重複ランクは不可） */
function isRun(cards) {
  const ranks = cards.map(rankOf).sort((a, b) => a - b);
  return ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
}

/**
 * 手札（4枚）またはクリブ（4枚）とスターターの採点。
 * @param {string[]} cards 手札またはクリブの4枚
 * @param {string} starter スターター
 * @param {boolean} [isCrib]
 */
export function calculateHandScore(cards, starter, isCrib = false) {
  const all = [...cards, starter];

  const fifteens = subsets(all)
    .filter((s) => s.reduce((n, c) => n + valueOf(c), 0) === 15)
    .map((s) => ({ cards: s, points: 2 }));

  const pairs = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (rankOf(all[i]) === rankOf(all[j])) pairs.push({ cards: [all[i], all[j]], points: 2 });
    }
  }

  // 成立する最長のランの長さを探し、その長さのランだけを数える（短いランを二重加算しない）
  let runs = [];
  for (let len = all.length; len >= 3 && runs.length === 0; len--) {
    runs = subsets(all, len).filter((s) => s.length === len && isRun(s)).map((s) => ({ cards: s, points: len }));
  }

  let flush = null;
  if (cards.every((c) => suitOf(c) === suitOf(cards[0]))) {
    if (suitOf(starter) === suitOf(cards[0])) flush = { cards: all, points: 5 };
    else if (!isCrib) flush = { cards, points: 4 };
  }

  // スターター自身のJは対象外
  const nobsCard = cards.find((c) => rankOf(c) === 11 && suitOf(c) === suitOf(starter)) ?? null;
  const nobs = nobsCard ? { card: nobsCard, points: 1 } : null;

  const sum = (list) => list.reduce((n, x) => n + x.points, 0);
  const result = {
    fifteens: sum(fifteens),
    pairs: sum(pairs),
    runs: sum(runs),
    flush: flush?.points ?? 0,
    nobs: nobs?.points ?? 0,
    combinations: { fifteens, pairs, runs, flush, nobs },
  };
  return { total: result.fifteens + result.pairs + result.runs + result.flush + result.nobs, ...result };
}

export const calculateCribScore = (crib, starter) => calculateHandScore(crib, starter, true);

/**
 * ペギングで1枚出したときの得点。
 * @param {string[]} currentSequence 現在の区間（カウントのリセット後）に出ている札（出す前）
 * @param {string} playedCard 出す札
 * @param {number} currentCount 出す前のカウント
 */
export function calculatePeggingScore(currentSequence, playedCard, currentCount) {
  const seq = [...currentSequence, playedCard];
  const newCount = currentCount + valueOf(playedCard);
  const fifteenScore = newCount === 15 ? 2 : 0;
  const thirtyOneScore = newCount === 31 ? 2 : 0;

  // 直近から遡って同じランクが続く枚数
  let same = 1;
  while (same < seq.length && rankOf(seq.at(-1 - same)) === rankOf(playedCard)) same++;
  const pairScore = same === 2 ? 2 : same === 3 ? 6 : same === 4 ? 12 : 0;

  // 直近から遡って成立する最長のラン
  let runScore = 0;
  for (let len = seq.length; len >= 3; len--) {
    if (isRun(seq.slice(-len))) {
      runScore = len;
      break;
    }
  }
  return { newCount, fifteenScore, pairScore, runScore, thirtyOneScore, totalScore: fifteenScore + pairScore + runScore + thirtyOneScore };
}

/** 合計が31以下になる出せる札 */
export const getLegalPlays = (hand, count) => hand.filter((c) => count + valueOf(c) <= 31);

/**
 * テキサスホールデムの役判定。7枚（手札2＋場5）から最強の5枚を選ぶ。画面にも Firebase にも依存しない。
 * score は数値で、大きいほど強い（同じ役の中でも、キッカーまで含めて比べられる）。
 */

const NUMBER = { A: 14, K: 13, Q: 12, J: 11 };
const BASE = 15;

export const HAND_NAMES = ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ', 'ロイヤルフラッシュ'];

/** 数字の強さ（2〜14。A は 14。ホイール A-2-3-4-5 だけは evaluate5 が A=1 として扱う） */
export const rankOf = (id) => NUMBER[id.slice(1)] ?? Number(id.slice(1));
export const suitOf = (id) => id[0];

/**
 * ちょうど5枚の役。
 * @returns {{cat: number, ranks: number[]}} cat は役の強さ（0 ハイカード〜8 ストレートフラッシュ）、ranks は役を決める数字を強い順に並べたもの
 */
export function evaluate5(cards) {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const distinct = [...new Set(ranks)];
  let straightHigh = 0;
  if (distinct.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks.join() === '14,5,4,3,2') straightHigh = 5; // ホイール
  }

  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map(([, n]) => n).join('');
  const byGroup = groups.map(([r]) => r);

  if (flush && straightHigh) return { cat: 8, ranks: [straightHigh] };
  if (shape === '41') return { cat: 7, ranks: byGroup };
  if (shape === '32') return { cat: 6, ranks: byGroup };
  if (flush) return { cat: 5, ranks };
  if (straightHigh) return { cat: 4, ranks: [straightHigh] };
  if (shape === '311') return { cat: 3, ranks: byGroup };
  if (shape === '221') return { cat: 2, ranks: byGroup };
  if (shape === '2111') return { cat: 1, ranks: byGroup };
  return { cat: 0, ranks };
}

const scoreOf = ({ cat, ranks }) => ranks.reduce((s, r, i) => s + r * BASE ** (4 - i), cat * BASE ** 5);

function* combos(items, k, start = 0, picked = []) {
  if (picked.length === k) {
    yield picked;
    return;
  }
  for (let i = start; i <= items.length - (k - picked.length); i++) yield* combos(items, k, i + 1, [...picked, items[i]]);
}

/**
 * 5枚以上のカードから最強の5枚を選ぶ。
 * @param {string[]} cards 5〜7枚
 * @returns {{score: number, cat: number, name: string, cards: string[]}}
 */
export function bestHand(cards) {
  if (cards.length < 5) throw new Error('need at least 5 cards');
  let best = null;
  for (const five of combos(cards, 5)) {
    const e = evaluate5(five);
    const score = scoreOf(e);
    if (!best || score > best.score) best = { score, cat: e.cat, cards: five, ranks: e.ranks };
  }
  const royal = best.cat === 8 && best.ranks[0] === 14;
  return { score: best.score, cat: royal ? 9 : best.cat, name: HAND_NAMES[royal ? 9 : best.cat], cards: best.cards };
}

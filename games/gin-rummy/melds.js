/**
 * ジン・ラミーの役（メルド）計算。画面にも Firebase にも依存しない純粋な関数。
 * カード表記は全ゲーム共通（"S3","H10","DK" など）。A は 1 点で、K の後ろにはつながらない。
 */
const RANKS = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 };
const SUIT_ORDER = 'SHDC';

export const SET_MAX = 4;
export const RUN_MIN = 3;

export function parse(id) {
  const rank = RANKS[id.slice(1)];
  if (!SUIT_ORDER.includes(id[0]) || rank === undefined) throw new Error(`invalid card: ${id}`);
  return { id, suit: id[0], rank };
}

/** A=1、2〜9はそのまま、10・J・Q・K=10 */
export const point = (id) => Math.min(parse(id).rank, 10);
export const sumPoints = (ids) => ids.reduce((s, c) => s + point(c), 0);

/** 表示用の並び：スート順（♠♥♦♣）→ 数字順 */
export const byCard = (a, b) => SUIT_ORDER.indexOf(a[0]) - SUIT_ORDER.indexOf(b[0]) || parse(a).rank - parse(b).rank;

/** セット：同じ数字の3〜4枚（スートは重複しない） */
export function isSet(ids) {
  if (ids.length < 3 || ids.length > SET_MAX) return false;
  const cs = ids.map(parse);
  return cs.every((c) => c.rank === cs[0].rank) && new Set(cs.map((c) => c.suit)).size === cs.length;
}

/** ラン：同じスートで3枚以上連続（A は 1 として 2 の前だけ。Q-K-A は不成立） */
export function isRun(ids) {
  if (ids.length < RUN_MIN) return false;
  const cs = ids.map(parse);
  if (!cs.every((c) => c.suit === cs[0].suit)) return false;
  const ranks = cs.map((c) => c.rank).sort((a, b) => a - b);
  return ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
}

export const isMeld = (ids) => isSet(ids) || isRun(ids);

function combinations(items, k) {
  const out = [];
  const pick = (start, acc) => {
    if (acc.length === k) return out.push([...acc]);
    for (let i = start; i < items.length; i++) pick(i + 1, [...acc, items[i]]);
  };
  pick(0, []);
  return out;
}

/** 手札から作れる有効な役の全候補（順序は決定的） */
export function candidateMelds(hand) {
  const cards = [...hand].sort(byCard).map(parse);
  const out = [];
  const byRank = new Map();
  for (const c of cards) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c.id]);
  for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
    const ids = byRank.get(rank);
    if (ids.length >= 3) out.push(...combinations(ids, 3));
    if (ids.length === 4) out.push(ids);
  }
  for (const suit of SUIT_ORDER) {
    const mine = cards.filter((c) => c.suit === suit);
    for (let i = 0; i < mine.length; i++) {
      let j = i;
      while (j + 1 < mine.length && mine[j + 1].rank === mine[j].rank + 1) j++;
      for (let end = i + RUN_MIN - 1; end <= j; end++) out.push(mine.slice(i, end + 1).map((c) => c.id));
    }
  }
  return out;
}

/** カードを重複して使わない役の組み合わせを全部たどる。visit(役の配列, 使った点数) を各組み合わせで呼ぶ */
function eachArrangement(hand, visit) {
  const cands = candidateMelds(hand);
  const used = new Set();
  const melds = [];
  const dfs = (from, covered) => {
    visit(melds, covered);
    for (let j = from; j < cands.length; j++) {
      const m = cands[j];
      if (m.some((c) => used.has(c))) continue;
      m.forEach((c) => used.add(c));
      melds.push(m);
      dfs(j + 1, covered + sumPoints(m));
      melds.pop();
      m.forEach((c) => used.delete(c));
    }
  };
  dfs(0, 0);
}

const restOf = (hand, melds) => {
  const inMeld = new Set(melds.flat());
  return hand.filter((c) => !inMeld.has(c)).sort(byCard);
};

/**
 * 最小デッドウッドになる役の組み合わせ。複数あるときは先に見つかったもの（決定的）。
 * @returns {{melds: string[][], deadwood: string[], dw: number}}
 */
export function bestArrangement(hand) {
  const total = sumPoints(hand);
  let best = { melds: [], covered: 0 };
  eachArrangement(hand, (melds, covered) => {
    if (covered > best.covered) best = { melds: melds.map((m) => [...m]), covered };
  });
  return { melds: best.melds, deadwood: restOf(hand, best.melds), dw: total - best.covered };
}

export const deadwoodOf = (hand) => bestArrangement(hand).dw;

function canExtend(meld, card) {
  const c = parse(card);
  const cs = meld.map(parse);
  if (isSet(meld)) return meld.length < SET_MAX && cs[0].rank === c.rank && !cs.some((x) => x.suit === c.suit);
  const ranks = cs.map((x) => x.rank);
  return cs[0].suit === c.suit && (c.rank === Math.min(...ranks) - 1 || c.rank === Math.max(...ranks) + 1);
}

/**
 * 残りカードを、ノック側の役に付け足せるだけ付け足す（レイオフ）。点の高いカードから、役は並び順で決定的に選ぶ。
 * @returns {{rest: string[], placed: {card: string, meld: number}[]}}
 */
export function layoffOnto(leftover, knockMelds) {
  const melds = knockMelds.map((m) => [...m]);
  let rest = [...leftover].sort((a, b) => point(b) - point(a) || byCard(a, b));
  const placed = [];
  for (let moved = true; moved; ) {
    moved = false;
    for (const card of rest) {
      const idx = melds.findIndex((m) => canExtend(m, card));
      if (idx < 0) continue;
      melds[idx].push(card);
      placed.push({ card, meld: idx });
      rest = rest.filter((c) => c !== card);
      moved = true;
      break;
    }
  }
  return { rest: rest.sort(byCard), placed };
}

/**
 * ノックされた側の手札について、自分の役の作り方とレイオフを合わせて、最終デッドウッドが最小になるものを選ぶ。
 * 自分の役を崩して付け足すことはしない（役にしなかったカードだけが付け足し対象）。
 * @returns {{melds: string[][], deadwood: string[], layoffs: {card: string, meld: number}[], dw: number}}
 */
export function bestWithLayoff(hand, knockMelds) {
  let best = null;
  eachArrangement(hand, (melds) => {
    const { rest, placed } = layoffOnto(restOf(hand, melds), knockMelds);
    const dw = sumPoints(rest);
    if (!best || dw < best.dw) best = { melds: melds.map((m) => [...m]), deadwood: rest, layoffs: placed, dw };
  });
  return best;
}

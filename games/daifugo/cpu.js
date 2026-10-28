/**
 * 大富豪のCPU。他の人の手札は一切参照しない。
 * 使う情報は「自分の手札」「公開情報（game：場・残り枚数・革命・しばり・上がった順）」と、公開された出札の履歴（observe）だけ。
 *
 * 難易度：
 *   easy   出せる手からほぼランダムに選ぶ（出せても3割はパスする）。
 *   normal 弱いカードから、できるだけ多くの枚数をまとめて出す。ペアは崩さず、ジョーカー・2などの強い札は温存する。
 *   hard   normal に加えて、革命で自分の手札が弱くなるなら避け、上がり間際の相手には強い札で押さえ、
 *          自分の手番を見越して「あと何手で上がれるか」を考えて出す札を選ぶ。
 */
import { analyze, applyAction, canPlay, parseCard } from './rules.js';

export const CPU_LEVELS = [
  { id: 'easy', label: 'かんたん' },
  { id: 'normal', label: 'ふつう' },
  { id: 'hard', label: 'つよい' },
];

/** かんたん：出せるのにパスする確率 */
const EASY_PASS = 0.3;
const SUITS = 'SHDC';

/** 手札から出せる組（1枚・同じ数字・同じスートの階段）を全部挙げる */
function candidates(hand) {
  const cards = hand.map(parseCard);
  const jokers = cards.filter((c) => c.joker).map((c) => c.id);
  const real = cards.filter((c) => !c.joker);
  const out = [];

  for (const c of cards) out.push([c.id]);

  const byRank = new Map();
  for (const c of real) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c.id]);
  for (const ids of byRank.values()) {
    const pool = [...ids, ...jokers];
    for (let mask = 1; mask < 1 << pool.length; mask++) {
      const pick = pool.filter((_, i) => mask & (1 << i));
      if (pick.length >= 2 && pick.some((id) => !id.startsWith('JK'))) out.push(pick);
    }
  }

  for (const suit of SUITS) {
    const mine = new Map(real.filter((c) => c.suit === suit).map((c) => [c.rank, c.id]));
    for (let low = 3; low <= 13; low++) {
      for (let high = low + 2; high <= 15; high++) {
        const ids = [];
        let missing = 0;
        for (let r = low; r <= high; r++) {
          if (mine.has(r)) ids.push(mine.get(r));
          else missing++;
        }
        if (missing <= jokers.length && ids.length > 0) out.push([...ids, ...jokers.slice(0, missing)]);
      }
    }
  }
  return out;
}

/** 革命かどうかを考慮した、カード1枚の強さ（0〜13。大きいほど強い）。ジョーカーは最強 */
function power(game, id) {
  const c = parseCard(id);
  if (c.joker) return 14;
  return game.revolution ? 15 - c.rank : c.rank - 3;
}

/** その札で上がると反則上がり（最下位扱い）になるか。ジョーカー・最強の数字・8切りON時の8 */
function isFoul(game, id) {
  const c = parseCard(id);
  return c.joker || c.rank === (game.revolution ? 3 : 15) || (game.options.eightCut && c.rank === 8);
}

/** 手札全体の強さの合計（革命の有利不利を比べる用） */
const handPower = (game, hand) => hand.reduce((n, id) => n + power(game, id) ** 2 / 14, 0);

/** 手札を何手で出し切れそうか（弱い組から貪欲にまとめた手数） */
function movesToEmpty(hand) {
  const left = [...hand];
  let moves = 0;
  while (left.length) {
    const groups = candidates(left).filter((g) => g.length > 1);
    const best = groups.sort((a, b) => b.length - a.length)[0] ?? [left[0]];
    for (const id of best) left.splice(left.indexOf(id), 1);
    moves++;
  }
  return moves;
}

/** @param {'easy'|'normal'|'hard'} level */
export function createCpu(level, uid, rng = Math.random) {
  /** 公開された出札（hard が「もう出た札」を数えるために使う） */
  let seen = new Set();

  function legalMoves(game, hand) {
    return candidates(hand).filter((cards) => canPlay(game, hand, { type: 'play', uid, cards }).ok);
  }

  const othersCounts = (game) => game.order.filter((u) => u !== uid && !game.finished.includes(u) && !game.fallen.includes(u)).map((u) => game.counts[u]);

  /** 出す手の損得（小さいほど良い）。場を取れるか・強い札を使うか・手札が何手で空になるかで決める */
  function cost(game, hand, cards, lvl) {
    const combo = canPlay(game, hand, { type: 'play', uid, cards }).combo;
    const powers = cards.map((id) => power(game, id));
    const top = Math.max(...powers);
    const rest = hand.filter((id) => !cards.includes(id));
    const opp = othersCounts(game);
    const minOpp = Math.min(...opp, 99);

    let c = top - 0.9 * cards.length;
    // ペアを崩して単体で出すのは損
    if (cards.length < 3 && combo.kind !== 'seq') {
      for (const id of cards) {
        const r = parseCard(id).rank;
        if (rest.some((o) => parseCard(o).rank === r && !o.startsWith('JK'))) c += 1.5;
      }
    }
    if (cards.some((id) => id.startsWith('JK')) && cards.length === 1) c += 5;
    // 反則札だけで上がると最下位扱い。最後に残る札が反則札だけにならないようにする
    if (rest.length === 0) return cards.some((id) => isFoul(game, id)) ? 40 : -100;
    if (rest.every((id) => isFoul(game, id))) c += 6;

    const result = applyAction(game, { type: 'play', uid, cards });
    const fx = result.log.effects;
    if (fx.includes('eight-cut') && rest.length > 0) c -= 1.5;
    if (fx.includes('flush')) c -= 0.5;

    if (lvl === 'hard') {
      if (fx.includes('revolution')) {
        const gain = handPower(result.game, rest) - handPower(game, rest);
        c -= gain * 0.4;
      }
      c += 0.6 * movesToEmpty(rest);
      // 上がり間際の相手がいるときは、取り返されないよう強い組で押さえる
      if (minOpp <= 2 && game.field) c -= top * 0.4;
      if (minOpp === 1 && !game.field && cards.length === 1) c -= top * 0.6;
    }
    return c;
  }

  return {
    reset() {
      seen = new Set();
    },
    observe(entry) {
      if (entry.type === 'play') for (const id of entry.cards) seen.add(id);
    },
    decide(game, hand) {
      const moves = legalMoves(game, hand);
      const pass = { type: 'pass', uid };
      if (moves.length === 0) return game.field ? pass : { type: 'play', uid, cards: [hand[0]] };

      if (level === 'easy') {
        if (game.field && rng() < EASY_PASS) return pass;
        return { type: 'play', uid, cards: moves[Math.floor(rng() * moves.length)] };
      }

      const scored = moves.map((cards) => ({ cards, c: cost(game, hand, cards, level) })).sort((a, b) => a.c - b.c);
      const best = scored[0];
      if (game.field && best.c > -100) {
        // 強い札を使うほどの価値がない場面ではパスする（誰も上がり間際でなければ）
        const strongest = Math.max(...best.cards.map((id) => power(game, id)));
        const danger = Math.min(...othersCounts(game), 99) <= (level === 'hard' ? 3 : 2);
        if (strongest >= 12 && !danger && hand.length > best.cards.length + 2) return pass;
      }
      return { type: 'play', uid, cards: best.cards };
    },
  };
}

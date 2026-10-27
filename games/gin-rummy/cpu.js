/**
 * ジン・ラミーのCPU。人間プレイヤーの非公開手札・山札の中身は一切参照しない。
 * 使う情報は「自分の手札」「公開情報（game：捨て札の山・山札の枚数・得点・ノック宣言）」と、
 * 相手の公開された行動（observe で受け取る）だけ。
 *
 * 難易度：
 *   easy   役が完成するか（デッドウッドが減るか）だけで判断。相手の手は読まない。ノックできれば高確率でノック。
 *   normal デッドウッド削減に加え、あと1枚で役になる組み合わせ（ペア・両面・嵌張）の「残り枚数」を評価。
 *          見えている捨て札は残り枚数から除く。ノック／ジン狙いを状況で判断。
 *   hard   normal に加え、相手が捨て札から取ったカードを記録して相手の役を推測し、危険な札を捨てない。
 *          山札の残り・得点差・相手の進み具合から、ノックの期待値（アンダーカット込み）を見積もる。
 */
import { buildDeck } from '../../common/deck.js';
import { bestArrangement, byCard, deadwoodOf, parse, point } from './melds.js';
import { canPlay } from './rules.js';

export const CPU_LEVELS = [
  { id: 'easy', label: 'かんたん' },
  { id: 'normal', label: 'ふつう' },
  { id: 'hard', label: 'つよい' },
];

const ALL_CARDS = buildDeck();
/** かんたん：最善手を外す確率 */
const EASY_SLIP = 0.3;
const SUITS = 'SHDC';
const idOf = (suit, rank) => `${suit}${['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][rank - 1]}`;

/** @param {'easy'|'normal'|'hard'} level */
export function createCpu(level, uid, rng = Math.random) {
  const smart = level !== 'easy';
  const mem = { oppPicks: [], oppTurns: 0 };

  /** まだ山札か相手の手札にありうるカード（自分の手札・捨て札の山・相手が取ったと分かっているカードを除く） */
  function unseen(game, hand) {
    const gone = new Set([...hand, ...game.discard]);
    if (level === 'hard') for (const c of mem.oppPicks) gone.add(c);
    return new Set(ALL_CARDS.filter((c) => !gone.has(c)));
  }

  /** あと1枚で役になる組み合わせの「当たり牌の残り枚数」の合計 */
  function outsOf(deadwood, left) {
    let outs = 0;
    const byRank = new Map();
    for (const c of deadwood) byRank.set(parse(c).rank, [...(byRank.get(parse(c).rank) ?? []), c]);
    for (const [rank, cs] of byRank) {
      if (cs.length >= 2) outs += SUITS.split('').filter((s) => !cs.some((c) => c[0] === s) && left.has(idOf(s, rank))).length;
    }
    for (let i = 0; i < deadwood.length; i++) {
      for (let j = i + 1; j < deadwood.length; j++) {
        const [a, b] = [parse(deadwood[i]), parse(deadwood[j])];
        if (a.suit !== b.suit) continue;
        const [lo, hi] = a.rank < b.rank ? [a.rank, b.rank] : [b.rank, a.rank];
        const need = hi - lo === 1 ? [lo - 1, hi + 1] : hi - lo === 2 ? [lo + 1] : [];
        outs += need.filter((r) => r >= 1 && r <= 13 && left.has(idOf(a.suit, r))).length;
      }
    }
    return outs;
  }

  /** 手札の良さ（大きいほど良い）。デッドウッドが少ないほど良く、normal/hard は将来の伸びしろも加点 */
  function score(hand, left) {
    const arr = bestArrangement(hand);
    return -arr.dw + (smart && left ? 0.5 * outsOf(arr.deadwood, left) : 0);
  }

  /** hard：相手が捨て札から取ったカードの仲間（同じ数字・同じスートの近い数字）を渡すと危険 */
  function danger(card) {
    if (level !== 'hard' || mem.oppPicks.length === 0) return 0;
    const c = parse(card);
    let d = 0;
    for (const p of mem.oppPicks) {
      const o = parse(p);
      if (o.rank === c.rank) d += 3;
      else if (o.suit === c.suit && Math.abs(o.rank - c.rank) <= 2) d += Math.abs(o.rank - c.rank) === 1 ? 3 : 1.5;
    }
    return d;
  }

  /** 取ってから最良の1枚を捨てたときの評価（canDiscard: そのカードは捨てられるか） */
  function bestDiscard(hand, game, left, forbidden = null) {
    let best = null;
    for (const d of hand) {
      if (d === forbidden) continue;
      const rest = hand.filter((c) => c !== d);
      const s = score(rest, left) - danger(d) * 0.5;
      if (!best || s > best.s + 1e-9 || (Math.abs(s - best.s) < 1e-9 && point(d) > point(best.card))) best = { card: d, s, rest };
    }
    return best;
  }

  /** 捨て札を取る価値があるか */
  function wantsDiscard(game, hand, left) {
    const top = game.discard.at(-1);
    if (!top) return false;
    const next = [...hand, top];
    const best = bestDiscard(next, game, left, top);
    if (!best) return false;
    if (level === 'easy') return deadwoodOf(best.rest) < deadwoodOf(hand) && rng() > 0.2; // 取れる札を見逃すこともある
    return best.s > score(hand, left) + 0.01;
  }

  /** hard：相手のデッドウッドの見積もり（ターンが進むほど小さい） */
  function estimateOpp() {
    return Math.max(3, 55 - 4 * mem.oppTurns - 3 * mem.oppPicks.length);
  }

  function shouldKnock(game, dw, type) {
    if (type === 'gin') return true;
    const deck = game.deckCount;
    if (level === 'easy') return rng() < 0.85;
    if (dw <= 2 && deck > 14 && rng() < 0.5) return false; // ジンを狙って続ける
    if (level === 'normal') return dw <= 3 || (dw <= 7 && deck <= 20) || deck <= 10;
    const est = estimateOpp() * 0.8; // レイオフで少し減る
    const p = 1 / (1 + Math.exp((est - dw) / 4)); // アンダーカットされる確率
    const ev = (1 - p) * Math.max(0, est - dw) - p * (25 + Math.max(0, dw - est));
    const me = game.scores[uid] ?? 0;
    const winsMatch = me + Math.max(1, est - dw) >= game.options.targetScore;
    return ev > 1 || deck <= 6 || (winsMatch && p < 0.35);
  }

  function legalFallback(game, hand) {
    const a = { uid };
    if (game.phase === 'SHOWDOWN') return { ...a, type: 'showdown' };
    if (game.phase === 'INITIAL_OFFER') return { ...a, type: 'pass' };
    if (game.phase === 'WAITING_FOR_DRAW') return { ...a, type: 'draw', source: game.deckCount > 0 ? 'deck' : 'discard' };
    const card = hand.find((c) => canPlay(game, hand, { ...a, type: 'discard', card: c }).ok);
    return { ...a, type: 'discard', card };
  }

  function choose(game, hand) {
    const a = { uid };
    const left = smart ? unseen(game, hand) : null;
    switch (game.phase) {
      case 'SHOWDOWN':
        return { ...a, type: 'showdown' };
      case 'INITIAL_OFFER':
        return wantsDiscard(game, hand, left) ? { ...a, type: 'draw', source: 'discard' } : { ...a, type: 'pass' };
      case 'WAITING_FOR_DRAW':
        if (!game.forceDeck && wantsDiscard(game, hand, left)) return { ...a, type: 'draw', source: 'discard' };
        return { ...a, type: 'draw', source: 'deck' };
      default: {
        const forbidden = game.lastDraw?.source === 'discard' ? game.lastDraw.card : null;
        let best = bestDiscard(hand, game, left, forbidden);
        if (level === 'easy' && rng() < EASY_SLIP) {
          // かんたん：ときどき、デッドウッドの中からランダムに捨ててしまう
          const pool = bestArrangement(hand).deadwood.filter((c) => c !== forbidden);
          if (pool.length) {
            const card = pool[Math.floor(rng() * pool.length)];
            best = { card, rest: hand.filter((c) => c !== card) };
          }
        }
        const arr = bestArrangement(best.rest);
        const type = arr.dw === 0 ? 'gin' : arr.dw <= game.options.knockLimit ? 'knock' : 'discard';
        if (type !== 'discard' && shouldKnock(game, arr.dw, type)) return { ...a, type, card: best.card };
        return { ...a, type: 'discard', card: best.card };
      }
    }
  }

  return {
    /** 新しいラウンドの開始時に記憶を消す */
    reset() {
      mem.oppPicks = [];
      mem.oppTurns = 0;
    },
    /** 公開された行動（ログ1件）を見て、相手の動きを記録する */
    observe(entry) {
      if (entry.uid === uid) return;
      if (entry.type === 'draw' && entry.source === 'discard') mem.oppPicks.push(entry.cards[0]);
      if (['discard', 'knock', 'gin'].includes(entry.type)) {
        mem.oppTurns += 1;
        mem.oppPicks = mem.oppPicks.filter((c) => c !== entry.cards[0]); // 捨てたカードはもう持っていない
      }
    },
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

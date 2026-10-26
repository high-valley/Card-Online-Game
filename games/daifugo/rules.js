/**
 * 大富豪のルール（仕様書 4章・6章）。画面にも Firebase にも依存しない純粋な関数だけを置く。
 *
 * game（state/current.game に入る公開情報）:
 *   order       席順の uid 配列
 *   counts      uid -> 残り枚数
 *   turnUid     手番の uid（終了時 null）
 *   field       場 { uid, cards, kind, count, rank, ranks, suits, joker } | null
 *   lastPlayer  最後にカードを出した uid
 *   passed      uid -> true（場が流れるまで出せない人）
 *   lock        しばり中のスート配列 | null
 *   revolution  革命中か
 *   finished    上がった順の uid
 *   fouls       反則上がりした uid（上がった順）
 *   fallen      都落ちした uid
 *   ended       ゲーム終了か
 *   prevDaifugo 前回の大富豪（都落ち判定用）
 *   options     この回のルール設定
 *
 * action:
 *   { type: 'play', uid, cards: CardId[], jokerAs?: CardId[] }
 *     jokerAs … ジョーカーが何のカードの代わりか（例 ["H5"]。スートは無視）。階段で位置が複数ありうるときだけ必要
 *   { type: 'pass', uid }
 *   { type: 'skip', uid }  切断時にホストが押す。場があればパス、なければ次の人にリードを渡す
 */
import { buildDeck, shuffle } from '../../common/deck.js';

export const defaultOptions = {
  revolution: true,
  eightCut: true,
  sequence: true,
  spade3: true,
  lock: false,
  miyakoochi: false,
  exchange: true,
};

export const DECK_SPEC = { jokers: 1 };

const RANKS = { 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14, 2: 15 };
const JOKER_RANK = 16;
const SEQ_MIN = 3;
const SEQ_MAX = 15; // 2 まで階段に含められる（A→2→3 の循環はしない）
const MAX_SET = 5; // 4スート＋ジョーカー

const TITLES = {
  3: ['大富豪', '平民', '大貧民'],
  4: ['大富豪', '富豪', '貧民', '大貧民'],
  5: ['大富豪', '富豪', '平民', '貧民', '大貧民'],
};

/** @param {string} id */
export function parseCard(id) {
  if (id.startsWith('JK')) return { id, joker: true, suit: null, rank: JOKER_RANK };
  const rank = RANKS[id.slice(1)];
  if (!'SHDC'.includes(id[0]) || rank === undefined) throw new Error(`invalid card: ${id}`);
  return { id, joker: false, suit: id[0], rank };
}

/**
 * 出したカードの組を役として解釈する。ジョーカーの代わり方が複数あれば複数返す。
 * @param {string[]} cardIds
 * @param {string[]} [jokerAs]
 */
export function analyze(cardIds, jokerAs = []) {
  const cards = cardIds.map(parseCard);
  const n = cards.length;
  const real = cards.filter((c) => !c.joker);
  const jokers = n - real.length;
  const suits = [...new Set(real.map((c) => c.suit))];
  const combos = [];
  if (n === 0) return combos;

  if (n === 1) {
    const c = cards[0];
    combos.push({ kind: 'single', count: 1, rank: c.rank, ranks: [c.rank], suits, joker: c.joker });
    return combos;
  }

  if (real.length > 0 && n <= MAX_SET && real.every((c) => c.rank === real[0].rank)) {
    combos.push({ kind: 'set', count: n, rank: real[0].rank, ranks: [real[0].rank], suits, joker: jokers > 0 });
  }

  const realRanks = real.map((c) => c.rank);
  if (n >= 3 && real.length > 0 && suits.length === 1 && new Set(realRanks).size === real.length) {
    const wanted = jokerAs.map((id) => parseCard(id).rank);
    for (let low = SEQ_MIN; low + n - 1 <= SEQ_MAX; low++) {
      const high = low + n - 1;
      if (!realRanks.every((r) => r >= low && r <= high)) continue;
      if (!wanted.every((r) => r >= low && r <= high && !realRanks.includes(r))) continue;
      const ranks = Array.from({ length: n }, (_, i) => low + i);
      combos.push({ kind: 'seq', count: n, rank: low, ranks, suits, joker: jokers > 0 });
    }
  }
  return combos;
}

/** 手札の並び順：弱い順（ジョーカーは最後）。革命中は逆順 */
export function sortHand(hand, game) {
  const suitOrder = 'SHDC';
  const sign = game?.revolution ? -1 : 1;
  const key = (id) => {
    const c = parseCard(id);
    return c.joker ? Infinity : sign * c.rank;
  };
  return [...hand].sort((x, y) => key(x) - key(y) || suitOrder.indexOf(x[0]) - suitOrder.indexOf(y[0]));
}

const dir = (g) => (g.revolution ? -1 : 1);

/** 強さの比較用の値（大きいほど強い）。ジョーカー1枚出しは革命中も最強 */
function strength(g, combo) {
  if (combo.kind === 'single' && combo.joker) return Infinity;
  return dir(g) * combo.rank;
}

const isSpade3Return = (g, combo) =>
  g.options.spade3 && g.field?.kind === 'single' && g.field.joker && combo.kind === 'single' && !combo.joker &&
  combo.suits[0] === 'S' && combo.rank === 3;

/** 出せない理由コードを返す。出せるなら null */
function reject(g, combo) {
  if (combo.kind === 'seq' && !g.options.sequence) return 'sequence-disabled';
  if (combo.kind === 'seq' && combo.count < SEQ_MIN) return 'invalid-combo';
  const f = g.field;
  if (!f) return null;
  if (isSpade3Return(g, combo)) return null;
  if (combo.kind !== f.kind || combo.count !== f.count) return 'shape-mismatch';
  if (g.lock && !combo.suits.every((s) => g.lock.includes(s))) return 'locked';
  if (strength(g, combo) <= strength(g, f)) return 'too-weak';
  return null;
}

const no = (reason) => ({ ok: false, reason });

/**
 * その操作が今できるかを判定する。
 * @returns {{ok: boolean, reason?: string, combo?: object}}
 */
export function canPlay(game, hand, action) {
  if (game.ended) return no('ended');
  if (action.uid !== game.turnUid) return no('not-your-turn');
  if (action.type === 'skip') return { ok: true };
  if (action.type === 'pass') return game.field ? { ok: true } : no('cannot-pass-lead');
  if (action.type !== 'play') return no('unknown-action');

  const ids = action.cards ?? [];
  if (ids.length === 0) return no('no-cards');
  if (new Set(ids).size !== ids.length) return no('duplicate-cards');
  if (!ids.every((id) => hand.includes(id))) return no('not-in-hand');

  let combos;
  try {
    combos = analyze(ids, action.jokerAs);
  } catch {
    return no('invalid-card');
  }
  if (combos.length === 0) return no('invalid-combo');

  let reason = null;
  const valid = [];
  for (const c of combos) {
    const r = reject(game, c);
    if (r === null) valid.push(c);
    else reason ??= r;
  }
  if (valid.length === 0) return no(reason);
  // 階段のジョーカー位置が複数あるときは、最も強くなる解釈を採る
  valid.sort((a, b) => strength(game, b) - strength(game, a));
  return { ok: true, combo: valid[0] };
}

// ---- 状態の組み立て・手番の進行 ----

const isOut = (g, uid) => g.finished.includes(uid) || g.fallen.includes(uid);
const activeOf = (g) => g.order.filter((u) => !isOut(g, u));

function nextAfter(g, uid, pred) {
  const n = g.order.length;
  const i = g.order.indexOf(uid);
  for (let k = 1; k <= n; k++) {
    const u = g.order[(i + k) % n];
    if (pred(u)) return u;
  }
  return null;
}

function flush(g) {
  g.field = null;
  g.lock = null;
  g.passed = {};
}

/** 場が空のときのリード役。上がっていれば次の席の人 */
const leaderFrom = (g, uid) => (isOut(g, uid) ? nextAfter(g, uid, (u) => !isOut(g, u)) : uid);

function nextTurn(g, from, log) {
  if (activeOf(g).length <= 1) {
    g.ended = true;
    g.turnUid = null;
    return;
  }
  if (g.field) {
    const next = nextAfter(g, from, (u) => !isOut(g, u) && !g.passed[u] && u !== g.lastPlayer);
    if (next) {
      g.turnUid = next;
      return;
    }
    flush(g);
    log.effects.push('flush');
  }
  g.turnUid = leaderFrom(g, g.lastPlayer ?? from);
}

/** ゲームの初期状態を作る（deal と単体テストから使う） */
export function createGame({ order, hands, turnUid, options = defaultOptions, prevDaifugo = null }) {
  return {
    order: [...order],
    counts: Object.fromEntries(order.map((u) => [u, hands[u].length])),
    turnUid,
    field: null,
    lastPlayer: null,
    passed: {},
    lock: null,
    revolution: false,
    finished: [],
    fouls: [],
    fallen: [],
    ended: false,
    prevDaifugo,
    options: { ...defaultOptions, ...options },
  };
}

/**
 * 山札を配って最初の状態を返す。2回目以降は前回の結果（ranking）を受け取り、大貧民から始める。
 * @param {{uid: string, seat: number}[]} players
 * @param {Object} options
 * @param {{ranking?: string[]}|null} [prevResult]
 * @param {string[]} [deck] 配る山札（省略時はジョーカー入り53枚をシャッフル）
 */
export function deal(players, options, prevResult = null, deck = shuffle(buildDeck(DECK_SPEC))) {
  const order = [...players].sort((a, b) => a.seat - b.seat).map((p) => p.uid);
  const hands = Object.fromEntries(order.map((u) => [u, []]));
  deck.forEach((card, i) => hands[order[i % order.length]].push(card));

  const prev = prevResult?.ranking?.filter((u) => order.includes(u)) ?? [];
  const havePrev = prev.length === order.length;
  const turnUid = havePrev ? prev[prev.length - 1] : order.find((u) => hands[u].includes('D3')) ?? order[0];
  const game = createGame({ order, hands, turnUid, options, prevDaifugo: havePrev ? prev[0] : null });
  return { hands, game, turnUid };
}

/** 最後に出したカードによる反則上がりか（ジョーカー・2（革命中は3）・8切りON時の8） */
function isFoulFinish(g, cardIds) {
  const strongest = g.revolution ? 3 : 15;
  return cardIds.some((id) => {
    const c = parseCard(id);
    return c.joker || c.rank === strongest || (g.options.eightCut && c.rank === 8);
  });
}

/**
 * 操作後の新しい状態と次の手番を返す（引数は変更しない）。
 * 手札の更新（出したカードを引く）は呼び出し側が行う。
 * @returns {{game: object, turnUid: string|null, log: object}}
 */
export function applyAction(game, action) {
  const g = structuredClone(game);
  const uid = action.uid;
  const log = { type: action.type, uid, cards: action.cards ?? [], effects: [] };

  if (action.type === 'skip' && !g.field) {
    g.turnUid = nextAfter(g, uid, (u) => !isOut(g, u) && u !== uid);
    log.type = 'skip';
    return { game: g, turnUid: g.turnUid, log };
  }

  if (action.type === 'pass' || action.type === 'skip') {
    g.passed[uid] = true;
    log.type = action.type;
    nextTurn(g, uid, log);
    return { game: g, turnUid: g.turnUid, log };
  }

  const checked = canPlay(game, [...action.cards], action);
  if (!checked.ok) throw new Error(`cannot play: ${checked.reason}`);
  const combo = checked.combo;
  const o = g.options;
  const prevField = g.field;
  const spade3 = isSpade3Return(g, combo);

  g.counts[uid] -= combo.count;
  g.lastPlayer = uid;

  if (o.lock && prevField && !g.lock && !spade3) {
    const a = combo.suits;
    const b = prevField.suits;
    const matched = a.length > 0 && b.length > 0 && (a.every((s) => b.includes(s)) || b.every((s) => a.includes(s)));
    if (matched) {
      g.lock = [...new Set([...a, ...b])];
      log.effects.push('lock');
    }
  }

  if (o.revolution && ((combo.kind === 'set' && combo.count >= 4) || (combo.kind === 'seq' && combo.count >= 5))) {
    g.revolution = !g.revolution;
    log.effects.push('revolution');
  }

  const cut8 = o.eightCut && combo.ranks.includes(8);
  if (cut8) log.effects.push('eight-cut');
  if (spade3) log.effects.push('spade3');

  if (cut8 || spade3) {
    flush(g);
  } else {
    g.field = { uid, cards: [...action.cards], ...combo };
  }

  if (g.counts[uid] === 0) {
    const first = g.finished.length === 0;
    g.finished.push(uid);
    log.effects.push('out');
    if (isFoulFinish(g, action.cards)) {
      g.fouls.push(uid);
      log.effects.push('foul');
    }
    const d = g.prevDaifugo;
    if (o.miyakoochi && first && d && d !== uid && !isOut(g, d)) {
      g.fallen.push(d);
      log.effects.push('fall');
    }
  }

  nextTurn(g, uid, log);
  return { game: g, turnUid: g.turnUid, log };
}

/** ゲームが終わったかと、順位・階級・得点を返す */
export function getResult(game) {
  if (!game.ended) return { finished: false };
  const clean = game.finished.filter((u) => !game.fouls.includes(u));
  const remaining = activeOf(game);
  const ranking = [...clean, ...remaining, ...game.fallen, ...game.fouls];
  const n = ranking.length;
  const titles = Object.fromEntries(ranking.map((u, i) => [u, TITLES[n]?.[i] ?? `${i + 1}位`]));
  const points = Object.fromEntries(ranking.map((u, i) => [u, n - 1 - i]));
  return { finished: true, ranking, titles, points };
}

const SUITS = ['S', 'H', 'D', 'C'];
const NUMBERS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/**
 * 山札を作る。ジョーカーが2枚以上のときは "JK1","JK2",… にする。
 * @param {{jokers?: number}} [spec]
 * @returns {string[]}
 */
export function buildDeck({ jokers = 0 } = {}) {
  const deck = SUITS.flatMap((s) => NUMBERS.map((n) => s + n));
  for (let i = 1; i <= jokers; i++) deck.push(jokers === 1 ? 'JK' : `JK${i}`);
  return deck;
}

/** crypto.getRandomValues による 0 <= x < max の偏りのない乱数 */
export function secureRandomInt(max) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(2 ** 32 / max) * max;
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}

/**
 * Fisher–Yates法のシャッフル（元の配列は変更しない）。
 * @template T
 * @param {T[]} items
 * @param {(max: number) => number} [randomInt]
 * @returns {T[]}
 */
export function shuffle(items, randomInt = secureRandomInt) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

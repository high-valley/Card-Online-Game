/**
 * 手札の表示順。ドラッグで並べ替えた順（custom）があればそれを優先し、なければゲームの自動整列を使う。
 * 画面（DOM）に依存しない純粋な関数。
 */

/**
 * @param {string[]|null} custom ドラッグで決めた並び（なければ null）
 * @param {string[]} hand 今の手札
 * @param {string[]} auto ゲームの自動整列の結果
 * @returns {string[]} 表示する並び。手札から消えたカードは外し、新しく増えたカードは自動整列の順で末尾に足す
 */
export function applyOrder(custom, hand, auto) {
  if (!custom) return auto;
  const inHand = new Set(hand);
  const kept = custom.filter((c) => inHand.has(c));
  const keptSet = new Set(kept);
  return [...kept, ...auto.filter((c) => !keptSet.has(c))];
}

/** moving を anchor の前（after=false）または後ろ（after=true）へ動かした並びを返す */
export function moveCard(ids, moving, anchor, after) {
  if (moving === anchor) return [...ids];
  const rest = ids.filter((c) => c !== moving);
  const at = rest.indexOf(anchor);
  if (at < 0) return [...ids];
  rest.splice(after ? at + 1 : at, 0, moving);
  return rest;
}

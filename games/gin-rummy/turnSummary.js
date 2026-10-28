/**
 * 直前の「相手のターン」を、見てすぐ分かる文章とカードにまとめる（山札から引いたカードは非公開なので出ない）。
 * 画面に依存しない純粋な関数。
 */
const MARK = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const showCard = (id) => `${MARK[id[0]]}${id.slice(1)}`;

/**
 * @param {Object[]} log 操作ログ（古い順）
 * @param {string} myUid
 * @param {Object<string,string>} names
 * @returns {{who: string, text: string, taken: string|null, thrown: string|null}|null}
 *   最後の操作が相手のものでなければ null（自分が動いたら、相手の手は古いので出さない）
 */
export function summarizeOpponentTurn(log, myUid, names) {
  const last = log.at(-1);
  if (!last || last.uid === myUid) return null;
  const turn = [];
  for (let i = log.length - 1; i >= 0 && log[i].uid === last.uid; i--) turn.unshift(log[i]);

  // 1つずつ「〜し」の形にして読点でつなぎ、最後に「ました」を付ける
  const parts = [];
  let taken = null;
  let thrown = null;
  for (const e of turn) {
    if (e.type === 'draw' && e.source === 'deck') parts.push('山札から1枚引き');
    else if (e.type === 'draw') {
      taken = e.cards[0];
      parts.push(`捨て札の${showCard(taken)}を取り`);
    } else if (e.type === 'pass') parts.push('パスし');
    else if (e.type === 'discard') {
      thrown = e.cards[0];
      parts.push(`${showCard(thrown)}を捨て`);
    } else if (e.type === 'knock' || e.type === 'gin') {
      thrown = e.cards[0];
      parts.push(`${showCard(thrown)}を捨てて${e.type === 'knock' ? 'ノック' : 'ジン'}し`);
    } else if (e.type === 'showdown') parts.push('手札を公開し');
  }
  if (parts.length === 0) return null;
  return { who: names[last.uid] ?? '相手', text: `${parts.join('、')}ました`, taken, thrown };
}

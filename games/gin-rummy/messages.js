/** 操作できない理由を、画面に出す文言にする（canPlay の reason コード → 日本語） */
export const REASON_TEXT = {
  'not-your-turn': 'あなたの番ではありません',
  ended: 'このラウンドはもう終わっています',
  'same-card': '取った捨て札は、そのターンには捨てられません',
  'deadwood-too-high': 'ノックはデッドウッド10点以下で宣言できます',
  'not-gin': 'ジンはデッドウッド0点のときだけ宣言できます',
  'must-draw-deck': '最初のターンは山札から引きます',
  'deck-empty': '山札がありません',
  'discard-empty': '捨て札がありません',
  'hand-size': 'カードを引いてから操作してください',
  'not-in-hand': 'そのカードは手札にありません',
};

/** phase ごとの「今はできない」の言い方 */
export function reasonText(reason, phase) {
  if (reason === 'wrong-phase') {
    if (phase === 'WAITING_FOR_DRAW') return '先に山札か捨て札から1枚引いてください';
    if (phase === 'WAITING_FOR_DISCARD') return 'もう引いています。いらないカードを捨ててください';
    if (phase === 'INITIAL_OFFER') return '最初は、公開カードを取るかパスを選びます';
    return '今はその操作はできません';
  }
  return REASON_TEXT[reason] ?? '今はその操作はできません';
}

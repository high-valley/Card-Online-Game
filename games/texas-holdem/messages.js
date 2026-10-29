const REASONS = {
  ended: 'このハンドは終わっています',
  'not-your-turn': 'あなたの番ではありません',
  'must-call': 'ベットされているのでチェックできません。コールかフォールドです',
  'nothing-to-call': 'コールするベットがありません',
  'no-chips': 'チップがありません',
  'bad-amount': '金額を整数で入れてください',
  'cannot-reraise': 'この場面ではレイズできません（コールかフォールドです）',
  'not-enough-chips': '手元のチップを超えています',
  'raise-too-small': '直前のレイズ以上の幅で上げてください',
  'wrong-phase': '今はその操作はできません',
};

/** 出せない理由コードを日本語にする */
export const reasonText = (code) => REASONS[code] ?? 'その操作はできません';

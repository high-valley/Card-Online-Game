/** 出せない理由を、画面に出す文言にする（canPlay の reason コード → 日本語） */
export const REASON_TEXT = {
  'not-your-turn': 'あなたの番ではありません',
  ended: 'このラウンドはもう終わっています',
  'no-cards': 'カードを選んでください',
  'invalid-combo': 'その組み合わせは出せません',
  'shape-mismatch': '場と同じ形（枚数・種類）で出してください',
  'too-weak': '場より強いカードを出してください',
  locked: 'しばり中：同じスートだけ出せます',
  'sequence-disabled': '階段は使えません',
  'cannot-pass-lead': '最初の人はパスできません',
  'not-in-hand': 'そのカードは手札にありません',
};
export const reasonText = (reason) => REASON_TEXT[reason] ?? '今はそのカードは出せません';

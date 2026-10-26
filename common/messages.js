const TEXT = {
  'not-found': 'ルームが見つかりません',
  full: 'ルームが満員です',
  'already-started': 'すでにゲームが始まっています',
  'not-your-turn': 'あなたの番ではありません',
  'bad-player-count': '人数がゲームの対応人数に合っていません',
  'code-collision': 'ルームを作れませんでした。もう一度お試しください',
  'permission-denied': '操作が許可されませんでした',
  unavailable: '通信できません。ネットワークを確認してください',
};

/** 共通基盤・Firestore のエラーを画面に出す文言にする */
export function engineErrorText(e) {
  return TEXT[e.code] ?? `エラーが発生しました（${e.code ?? e.message}）`;
}

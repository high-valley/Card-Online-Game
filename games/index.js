import daifugo from './daifugo/index.js';

/** ゲーム一覧。新しいゲームはモジュールを import してここに足すだけ */
export const games = [daifugo];

export const getGame = (id) => games.find((g) => g.id === id);

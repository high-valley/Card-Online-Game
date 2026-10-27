import daifugo from './daifugo/index.js';
import ginrummy from './gin-rummy/index.js';

/** ゲーム一覧。新しいゲームはモジュールを import してここに足すだけ */
export const games = [daifugo, ginrummy];

export const getGame = (id) => games.find((g) => g.id === id);

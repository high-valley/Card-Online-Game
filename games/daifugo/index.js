import { Board } from './Board.js';
import { DECK_SPEC, applyAction, canPlay, deal, defaultOptions, getResult, sortHand } from './rules.js';

/** @type {import('../../common/types.js').GameModule} */
export default {
  id: 'daifugo',
  name: '大富豪',
  minPlayers: 3,
  maxPlayers: 5,
  description: 'ジョーカー入り53枚。革命・8切りなどの特殊ルール対応',
  deck: DECK_SPEC,
  defaultOptions,
  deal,
  canPlay,
  applyAction,
  getResult,
  sortHand,
  Board,
};

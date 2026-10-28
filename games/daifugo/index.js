import { Board } from './Board.js';
import { OptionsForm } from './OptionsForm.js';
import { rulebook } from './rulebook.js';
import { DECK_SPEC, applyAction, canPlay, deal, defaultOptions, getResult, sortHand } from './rules.js';

/** @type {import('../../common/types.js').GameModule} */
/** 参加者の表示：上がった人は順位、それ以外は残り枚数 */
const playerStatus = (game, player) => {
  const rank = game.finished.indexOf(player.uid);
  return { text: rank >= 0 ? `${rank + 1}位` : `${player.handCount}枚`, out: rank >= 0 || game.fallen.includes(player.uid) };
};

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
  playerStatus,
  OptionsForm,
  rulebook,
};

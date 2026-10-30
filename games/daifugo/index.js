import { art } from './art.js';
import { Board } from './Board.js';
import { CPU_LEVELS, createCpu } from './cpu.js';
import { OptionsForm } from './OptionsForm.js';
import { reasonText } from './messages.js';
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
  emblem: { mark: '♠', red: false },
  art,
  minPlayers: 3,
  maxPlayers: 5,
  description: 'ジョーカー入り53枚。革命・8切りなどの特殊ルール対応（CPU対戦あり）',
  deck: DECK_SPEC,
  defaultOptions,
  deal,
  canPlay,
  applyAction,
  getResult,
  sortHand,
  Board,
  playerStatus,
  /** ドラッグ＆ドロップ：手札のカード（選択中ならまとめて）を場へ＝出す */
  dropAction: ({ game, hand, uid, source, target }) => {
    if (source.kind !== 'hand') return null;
    if (target !== 'field') return target && target !== 'hand' ? { error: '出すカードは、場の上にドラッグします' } : null;
    const action = { type: 'play', uid, cards: source.cards?.length ? source.cards : [source.id] };
    const checked = canPlay(game, hand, action);
    return checked.ok ? { action } : { error: reasonText(checked.reason) };
  },
  cpu: { levels: CPU_LEVELS, opponents: 3, create: createCpu },
  OptionsForm,
  rulebook,
};

import { Board } from './Board.js';
import { CPU_LEVELS, createCpu } from './cpu.js';
import { ResultDetail } from './ResultDetail.js';
import { bestArrangement, byCard } from './melds.js';
import { DECK_SPEC, applyAction, autoAction, canPlay, deal, defaultOptions, getResult, sortHand } from './rules.js';

const MARK = { S: '♠', H: '♥', D: '♦', C: '♣' };
const show = (id) => `${MARK[id[0]]}${id.slice(1)}`;

function logText(entry, names) {
  const who = names[entry.uid] ?? '?';
  const [card] = entry.cards;
  switch (entry.type) {
    case 'pass': return `${who}: パス`;
    case 'draw': return entry.source === 'deck' ? `${who}: 山札から1枚引いた` : `${who}: 捨て札 ${show(card)} を取った`;
    case 'discard': return `${who}: ${show(card)} を捨てた`;
    case 'knock': return `${who}: ${show(card)} を捨ててノック！`;
    case 'gin': return `${who}: ${show(card)} を捨ててジン！`;
    case 'showdown': return `${who}: 手札を公開`;
    case 'skip': return `${who}: スキップ（引き分け）`;
    default: return null;
  }
}

/** @type {import('../../common/types.js').GameModule} */
export default {
  id: 'ginrummy',
  name: 'ジン・ラミー',
  minPlayers: 2,
  maxPlayers: 2,
  description: '2人対戦（CPU対戦あり）。役を作ってノック・ジン。累積100点でマッチ終了',
  deck: DECK_SPEC,
  usesDeck: true,
  selection: 'single',
  defaultOptions,
  deal,
  canPlay,
  applyAction,
  autoAction,
  getResult,
  sortHand,
  /** 自動整列：成立している役ごとに、続けてデッドウッドを、少し間をあけて並べる */
  handGroups: (hand) => {
    const { melds, deadwood } = bestArrangement(hand);
    return [...melds.map((m) => [...m].sort(byCard)), ...(deadwood.length ? [deadwood] : [])];
  },
  Board,
  ResultDetail,
  logText,
  cpu: { levels: CPU_LEVELS, create: createCpu },
  playerStatus: (game, player) => ({ text: `${player.handCount}枚 ／ ${game.scores[player.uid] ?? 0}点`, out: false }),
  resultActionLabel: (result) => (result.matchOver ? '新しいマッチを始める' : result.redeal ? '配り直す' : '次のラウンド'),
};

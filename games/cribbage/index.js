import { Board } from './Board.js';
import { CPU_LEVELS, createCpu } from './cpu.js';
import { ResultDetail } from './ResultDetail.js';
import { DECK_SPEC, applyAction, canPlay, deal, defaultOptions, getResult, sortHand } from './rules.js';
import { valueOf } from './scoring.js';

const MARK = { S: '♠', H: '♥', D: '♦', C: '♣' };
const show = (id) => `${MARK[id[0]]}${id.slice(1)}`;
const KIND = { fifteen: '15', 'thirty-one': '31', pair: 'ペア', run: 'ラン', flush: 'フラッシュ', nobs: 'Nobs', heels: 'His Heels', go: 'Go', last: '最後の札' };

function logText(entry, names) {
  const who = names[entry.uid] ?? '?';
  const gained = entry.scored?.length ? `（${entry.scored.map((s) => `${KIND[s.type]}${s.points}`).join('・')} +${entry.points}点）` : '';
  switch (entry.type) {
    case 'discard': return `${who}: クリブに2枚置いた${gained}`;
    case 'play': return `${who}: ${show(entry.cards[0])} → ${entry.count}${gained}`;
    case 'go': return `${who}: Go`;
    case 'show': return `${who}: ${entry.cards.length ? entry.cards.map(show).join(' ') : ''} を採点${gained}`;
    case 'skip': return `${who}: スキップ（引き分け）`;
    default: return null;
  }
}

/** @type {import('../../common/types.js').GameModule} */
export default {
  id: 'cribbage',
  name: 'クリベッジ',
  minPlayers: 2,
  maxPlayers: 2,
  description: '2人対戦（CPU対戦あり）。クリブ・ペギング・手札採点で121点先取',
  deck: DECK_SPEC,
  usesDeck: true,
  /** クリブは2枚、ペギングは1枚ずつ選ぶ */
  selectLimit: (game) => (game.phase === 'DISCARD_TO_CRIB' ? 2 : 1),
  /** 合計が31を超えるカードは暗く表示して選べない */
  dimCard: (game, hand, card) => game.phase === 'PEGGING' && game.peg.count + valueOf(card) > 31,
  defaultOptions,
  deal,
  canPlay,
  applyAction,
  getResult,
  sortHand,
  Board,
  ResultDetail,
  logText,
  soundFor: (entry) => (entry.type === 'play' ? (entry.points > 0 ? 'special' : 'card') : entry.type === 'discard' ? 'discard' : entry.type === 'go' ? 'pass' : entry.type === 'show' ? (entry.points > 0 ? 'special' : null) : null),
  cpu: { levels: CPU_LEVELS, create: createCpu },
  playerStatus: (game, player) => ({ text: `${player.handCount}枚 ／ ${game.scores[player.uid] ?? 0}点`, out: false }),
  resultActionLabel: (result) => (result.matchOver ? '新しいマッチを始める' : result.redeal ? '配り直す' : '次のラウンド'),
};

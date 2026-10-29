import { Board } from './Board.js';
import { CPU_LEVELS, createCpu } from './cpu.js';
import { ResultDetail } from './ResultDetail.js';
import { reasonText } from './messages.js';
import { rulebook } from './rulebook.js';
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
  emblem: { mark: '♦', red: true },
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
  /**
   * ドラッグ＆ドロップ：山札・捨て札を手札へ＝引く／手札のカードを捨て札へ＝捨てる／「ノック」「ジン」の枠へ＝宣言
   * @returns {{action: Object}|{error: string}|null}
   */
  dropAction: ({ game, hand, uid, source, target }) => {
    let action = null;
    if (source.kind === 'pile' && target === 'hand') action = { uid, type: 'draw', source: source.name };
    else if (source.kind === 'hand' && target === 'discard') action = { uid, type: 'discard', card: source.id };
    else if (source.kind === 'hand' && (target === 'knock' || target === 'gin')) action = { uid, type: target, card: source.id };
    else if (source.kind === 'pile' && target && target !== 'hand') return { error: '引いたカードは手札へドラッグします' };
    else if (source.kind === 'hand' && target && target !== 'hand') return { error: 'そこには置けません' };
    if (!action) return null;
    const checked = canPlay(game, hand, action);
    return checked.ok ? { action } : { error: reasonText(checked.reason, game.phase) };
  },
  handGroups: (hand) => {
    const { melds, deadwood } = bestArrangement(hand);
    return [...melds.map((m) => [...m].sort(byCard)), ...(deadwood.length ? [deadwood] : [])];
  },
  Board,
  ResultDetail,
  rulebook,
  logText,
  cpu: { levels: CPU_LEVELS, create: createCpu },
  playerStatus: (game, player) => ({ text: `${player.handCount}枚 ／ ${game.scores[player.uid] ?? 0}点`, out: false }),
  resultActionLabel: (result) => (result.matchOver ? '新しいマッチを始める' : result.redeal ? '配り直す' : '次のラウンド'),
};

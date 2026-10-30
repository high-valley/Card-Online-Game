import { art } from './art.js';
import { Board } from './Board.js';
import { CPU_LEVELS, createCpu } from './cpu.js';
import { OptionsForm } from './OptionsForm.js';
import { ResultDetail } from './ResultDetail.js';
import { rulebook } from './rulebook.js';
import { DECK_SPEC, applyAction, autoAction, canPlay, deal, defaultOptions, getResult, sortHand } from './rules.js';

const MARK = { S: '♠', H: '♥', D: '♦', C: '♣' };
const show = (id) => `${MARK[id[0]]}${id.slice(1)}`;
const STREET = { flop: 'フロップ', turn: 'ターン', river: 'リバー' };
const fmt = (n) => n.toLocaleString('ja-JP');

function logText(entry, names) {
  const who = names[entry.uid] ?? '?';
  // 1回の操作で複数のストリートが開く（全員オールインのランアウト）ことがあるので、ストリートごとに枚数分ずつ切り分ける
  let rest = [...(entry.dealt ?? [])];
  const dealt = (entry.effects ?? []).filter((e) => STREET[e]).map((e) => ` → ${STREET[e]}：${rest.splice(0, e === 'flop' ? 3 : 1).map(show).join(' ')}`).join('');
  const allin = entry.effects?.includes('allin') ? '（オールイン）' : '';
  switch (entry.type) {
    case 'fold': return `${who}: フォールド${dealt}`;
    case 'check': return `${who}: チェック${dealt}`;
    case 'call': return `${who}: コール ${fmt(entry.amount ?? 0)}${allin}${dealt}`;
    case 'bet': return `${who}: ベット ${fmt(entry.to)}${allin}${dealt}`;
    case 'raise': return `${who}: レイズ ${fmt(entry.to)}${allin}${dealt}`;
    case 'show': return `${who}: 手札を公開 ${(entry.cards ?? []).map(show).join(' ')}`;
    case 'skip': return `${who}: スキップ${dealt}`;
    default: return null;
  }
}

/** 他プレイヤー欄の表示：チップ、ボタン／ブラインド、ベット、状態 */
function playerStatus(game, player) {
  const u = player.uid;
  if (!game.dealt.includes(u)) return { text: '脱落', out: true };
  const tag = u === game.dealer ? ' D' : u === game.sbUid ? ' SB' : u === game.bbUid ? ' BB' : '';
  const dealerBb = u === game.dealer && u === game.sbUid ? ' D/SB' : '';
  const chips = game.chips[u];
  const state = game.folded[u] ? ' フォールド' : chips === 0 && !game.ended ? ' オールイン' : (game.bets[u] ?? 0) > 0 ? ` ベット${fmt(game.bets[u])}` : '';
  return { text: `${fmt(chips)}${dealerBb || tag}${state}`, out: !!game.folded[u] };
}

/** @type {import('../../common/types.js').GameModule} */
export default {
  id: 'holdem',
  name: 'テキサスホールデム',
  emblem: { mark: '♥', red: true },
  art,
  minPlayers: 2,
  maxPlayers: 9,
  description: 'ポーカーの定番。ブラインドが上がるトーナメント（2〜9人）',
  deck: DECK_SPEC,
  usesDeck: true,
  selection: 'single',
  // 手札は2枚だけなので、場のカードのすぐ下に大きく出す（スマホでスクロールせずに見えるように）
  handInBoard: true,
  // 相手は共通の相手欄ではなく、卓のまわりの席に並べる
  seatsInBoard: true,
  defaultOptions,
  deal,
  canPlay,
  applyAction,
  autoAction,
  getResult,
  sortHand,
  Board,
  ResultDetail,
  OptionsForm,
  rulebook,
  logText,
  soundFor: (entry) => (entry.type === 'fold' || entry.type === 'check' || entry.type === 'skip' ? 'pass' : entry.effects?.includes('allin') ? 'special' : entry.type === 'show' ? 'card' : entry.type === 'call' || entry.type === 'bet' || entry.type === 'raise' ? 'discard' : null),
  cpu: { levels: CPU_LEVELS, opponents: 3, create: createCpu },
  playerStatus,
  // 1ハンドごとに結果画面へ切り替えず、卓の上で決着を見せて自動で次のハンドへ（トーナメントが終わったら結果画面）
  autoNextMs: (result) => (result.matchOver ? null : result.handResult?.uncontested ? 3500 : 6500),
  roundSound: (result, uid) => ((result.handResult?.awards?.[uid] ?? 0) > 0 ? 'win' : null),
  resultActionLabel: (result) => (result.matchOver ? '新しいトーナメントを始める' : '次のハンド'),
};

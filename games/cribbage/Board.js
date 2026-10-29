import { cardView } from '../../common/ui/cards.js';
import { h } from '../../common/ui/h.js';
import { breakdownView } from './Breakdown.js';
import { canPlay, legalPlays } from './rules.js';

export const REASONS = {
  'over-31': '合計が31を超えるカードは出せません',
  'must-play': '出せるカードがあるのでGoできません',
  'need-two-cards': 'クリブに置くカードを2枚選んでください',
};

const SHOW_BUTTON = { SHOW_NON_DEALER: '手札を採点', SHOW_DEALER: '手札を採点', SHOW_CRIB: 'クリブを採点' };

/** 伝統的なクリベッジ盤を細い進行バーにしたもの。ペグ（現在位置と直前の位置）を表示する */
function track(game, u, name, isMe) {
  const goal = game.options.targetScore;
  const score = Math.min(game.scores[u], goal);
  const last = [...game.scoreEvents].reverse().find((e) => e.playerId === u);
  const prev = Math.min(last?.previousScore ?? 0, goal);
  const pct = (n) => `${(n / goal) * 100}%`;
  return h(
    'div',
    { class: `track${isMe ? ' me' : ''}` },
    h('div', { class: 'track-label' }, h('span', null, `${name}${u === game.dealer ? '（親）' : ''}`), h('strong', null, `${game.scores[u]} / ${goal}点`)),
    h(
      'div',
      { class: 'track-bar', role: 'progressbar', 'aria-valuenow': String(score), 'aria-valuemax': String(goal) },
      [30, 60, 90].map((n) => h('i', { class: 'mark', style: `left:${pct(n)}` })),
      h('i', { class: 'fill', style: `width:${pct(score)}` }),
      score !== prev && h('i', { class: 'peg back', style: `left:${pct(prev)}` }),
      h('i', { class: `peg front${score >= goal ? ' goal' : ''}`, style: `left:${pct(score)}` }),
    ),
  );
}

/** クリベッジのゲーム画面中央：得点盤・スターター・クリブ・カウントと出札・操作ボタン */
export function Board({ game, hand, uid, selected, names, onAction, busy }) {
  const mine = game.turnUid === uid;
  const phase = game.phase;
  const send = (a) => () => onAction({ ...a, uid });
  const mineDealer = game.dealer === uid;
  const legal = mine ? legalPlays(game, hand) : [];

  const card = selected[0];
  const discard = mine && phase === 'DISCARD_TO_CRIB' ? canPlay(game, hand, { type: 'discard', uid, cards: selected }) : { ok: false };
  const play = mine && phase === 'PEGGING' && card ? canPlay(game, hand, { type: 'play', uid, card }) : { ok: false };
  const needGo = mine && phase === 'PEGGING' && hand.length > 0 && legal.length === 0;

  let hint = '';
  if (!mine) hint = game.turnUid ? `${names[game.turnUid] ?? '?'} の番です` : '';
  else if (phase === 'DISCARD_TO_CRIB')
    hint = `${mineDealer ? '自分' : '相手'}のクリブに置く2枚を選んでください（${selected.length}/2）`;
  else if (phase === 'PEGGING') hint = needGo ? '出せるカードがありません。Goを宣言してください' : !card ? '出すカードを選んでください' : (REASONS[play.reason] ?? '');
  else if (SHOW_BUTTON[phase]) hint = phase === 'SHOW_CRIB' ? 'クリブを採点します' : '手札を採点します';

  const seq = game.peg.seq;
  const shown = Object.entries(game.show);
  return h(
    'section',
    { class: 'board cribbage' },
    h('div', { class: 'tracks' }, h('span', { class: 'sub' }, `ラウンド${game.round}`), game.order.map((u) => track(game, u, names[u] ?? '?', u === uid))),
    h(
      'div',
      { class: 'piles' },
      h('div', { class: 'pile' }, game.starter ? cardView(game.starter, { anim: 'drop', key: `starter:${game.starter}` }) : h('div', { class: 'card empty' }), h('div', { class: 'sub' }, 'スターター')),
      h(
        'div',
        { class: 'pile crib-pile', 'data-drop': 'crib', 'data-accepts': 'hand' },
        h('div', { class: 'card back', 'aria-label': 'クリブ' }, h('span', { class: 'rank' }, `${game.cribCount}枚`)),
        h('div', { class: 'sub' }, `${names[game.dealer] ?? '?'} のクリブ`),
      ),
      phase === 'PEGGING' && h('div', { class: 'pile' }, h('div', { class: 'count' }, game.peg.count), h('div', { class: 'sub' }, 'カウント / 31')),
    ),
    phase === 'PEGGING' &&
      h(
        'div',
        { class: 'run', 'data-drop': 'table', 'data-accepts': 'hand' },
        seq.length === 0
          ? h('span', { class: 'sub' }, '新しい区間（カウント0）')
          : seq.map((e) => h('span', { class: `played${e.uid === uid ? ' me' : ''}` }, cardView(e.card, { small: true, anim: 'drop', key: `run:${game.round}:${e.card}` }))),
      ),
    h('div', { class: 'hint' }, hint),
    phase === 'DISCARD_TO_CRIB' && mine && h('div', { class: 'actions' }, h('button', { class: 'primary', disabled: busy || !discard.ok, onClick: send({ type: 'discard', cards: selected }) }, 'クリブに置く')),
    phase === 'PEGGING' &&
      mine &&
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'primary', disabled: busy || !play.ok, onClick: send({ type: 'play', card }) }, '出す'),
        needGo && h('button', { disabled: busy, onClick: send({ type: 'go' }) }, 'Go'),
      ),
    SHOW_BUTTON[phase] && mine && h('div', { class: 'actions' }, h('button', { class: 'primary', disabled: busy, onClick: send({ type: 'show' }) }, SHOW_BUTTON[phase])),
    shown.map(([key, entry]) => breakdownView(entry, game.starter, key === 'crib' ? 'クリブ' : `${names[key] ?? '?'} の手札`)),
  );
}
